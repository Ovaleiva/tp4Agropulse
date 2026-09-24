import { useEffect, useState, useRef } from 'react';
import { Text, View, TextInput, useWindowDimensions, Modal } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { useApp } from '../../src/context/AppContext';
import { supabase } from '../../src/lib/supabase';
import { Page, Card, Button, ui, colors } from '../../src/components/FieldUI';
import TelemetryLineChart from '../../src/components/TelemetryLineChart';
import { calculatePlotStatus, formatReadingAge } from '../../src/utils/status';
import { Reading, IrrigationCommand } from '../../src/types';
import { previewHistory } from '../../src/context/previewData';

type Draft = { valve: string; action: 'open' | 'close'; duration: number | null; request: string };
const labels = { pending: 'Esperando confirmación', applied: 'Aplicado', failed: 'Falló', cancelled: 'Cancelado' };
export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plots, stations, latestReadings, valves, role, pendingCommands, refreshData, cancelCommand, now, isPreview } = useApp();
  const plot = plots.find(p => p.id === id);
  const station = stations.find(s => s.plot_id === id);
  const reading = station ? latestReadings[station.id] : undefined;
  const plotValves = valves.filter(v => v.plot_id === id);
  const valveIds = plotValves.map(v => v.id).join(',');
  const [history, setHistory] = useState<Reading[]>([]);
  const [commands, setCommands] = useState<IrrigationCommand[]>([]);
  const [duration, setDuration] = useState('1');
  const [threshold, setThreshold] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [notice, setNotice] = useState('');
  const [historyError, setHistoryError] = useState('');
  const canOperate = role === 'producer' || role === 'operator';
  const { width } = useWindowDimensions();
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        if (isPreview) { if (station?.id) setHistory(previewHistory(station.id, Date.now())); return; }
        if (station?.id) {
          const r = await supabase.rpc('reading_history', { p_station_id: station.id });
          if (r.error) throw r.error;
          if (live) setHistory(r.data ?? []);
        }
        if (valveIds) {
          const r = await supabase.from('irrigation_commands').select('*').in('valve_id', valveIds.split(','))
            .order('created_at', { ascending: false }).limit(20);
          if (r.error) throw r.error;
          if (live) setCommands(r.data ?? []);
        }
        if (live) setHistoryError('');
      } catch (e) { if (live) setHistoryError((e as Error).message); }
    }
    void load(); const timer = setInterval(() => { void load(); }, 2500);
    return () => { live = false; clearInterval(timer); };
  }, [station?.id, valveIds, isPreview]);
  if (!plot) return <Page><Text style={ui.heading}>Lote no disponible</Text></Page>;
  const state = calculatePlotStatus(reading?.measured_at, reading?.moisture_pct, plot.threshold_min, plot.threshold_max);
  const prepare = (valve: string, action: 'open' | 'close') => {
    const minutes = Number(duration);
    if (action === 'open' && (!Number.isInteger(minutes) || minutes < 1 || minutes > 120)) {
      setNotice('Elegí una duración entera entre 1 y 120 minutos.'); return;
    }
    setNotice(''); setDraft({ valve, action, duration: action === 'open' ? minutes : null, request: uuid() });
  };
  const submit = async () => {
    if (!draft || sending.current) return;
    sending.current = true; setBusy(true); setNotice('Enviando orden…');
    try {
      const result = await supabase.rpc('request_irrigation', { p_valve_id: draft.valve,
        p_action: draft.action, p_duration_min: draft.duration, p_request_id: draft.request });
      if (result.error) throw result.error;
      setNotice('Orden registrada. Podés seguir su resultado en el historial.'); setDraft(null);
      await refreshData();
    } catch (e) { setNotice(`${(e as Error).message}. Podés reintentar esta misma solicitud.`); }
    finally { sending.current = false; setBusy(false); }
  };
  const save = async () => {
    const value = Number(threshold ?? plot.threshold_min);
    if (!Number.isFinite(value) || value < 0 || value > plot.threshold_max) {
      setNotice(`El mínimo debe estar entre 0 y ${plot.threshold_max}%.`); return;
    }
    setBusy(true);
    try {
      const r = await supabase.from('plots').update({ threshold_min: value }).eq('id', plot.id).select('id');
      if (r.error) throw r.error;
      if (!r.data?.length) throw new Error('No tenés permiso para cambiar el umbral');
      setNotice('Umbral actualizado.'); await refreshData();
    } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  };
  return <Page>
    <Text style={ui.eyebrow}>{plot.crop} / SEGUIMIENTO DEL LOTE</Text><Text style={ui.title}>{plot.name}</Text>
    <Card><Text style={{ color: state.color, fontWeight: '800' }}>{state.label}</Text>
      <Text style={[ui.title, { fontSize: 52 }]}>{reading ? `${reading.moisture_pct}%` : '—'}</Text>
      <Text style={ui.body}>Humedad del suelo · {formatReadingAge(reading?.measured_at)}</Text>
      <Text style={ui.note}>Temperatura {reading?.temp_c ?? '—'} °C · Lluvia {reading?.rain_mm ?? '—'} mm</Text>
      {state.status === 'dry' && <Text style={ui.body}>Humedad bajo el umbral: considerar riego.</Text>}
      {state.status === 'stale' && <Text style={ui.body}>Sin lecturas recientes. Revisá la estación antes de decidir.</Text>}
    </Card>
    <Card><Text style={ui.heading}>Humedad · últimas 6 horas</Text>
      <Text style={ui.note}>Una lectura por intervalo de 5 minutos. {history.length} puntos disponibles.</Text>
      {historyError ? <Text style={{ color: colors.red }}>{historyError}</Text> : null}
      {history.length ? <TelemetryLineChart data={history} width={Math.min(width - 84, 836)}
        thresholdMin={plot.threshold_min} thresholdMax={plot.threshold_max} strokeColor={colors.green} />
        : <Text style={ui.body}>Todavía no hay lecturas para este período.</Text>}
    </Card>
    <Card><Text style={ui.heading}>Rango de humedad</Text>
      <Text style={ui.body}>Óptimo entre {plot.threshold_min}% y {plot.threshold_max}%.</Text>
      {canOperate && <><Text style={ui.note}>Nuevo mínimo (%)</Text>
        <TextInput accessibilityLabel="Humedad mínima" style={ui.input} keyboardType="decimal-pad" value={threshold ?? String(plot.threshold_min)} onChangeText={setThreshold} />
        <Button title="Guardar umbral" secondary disabled={busy} onPress={() => { void save(); }} /></>}
    </Card>
    <Card><Text style={ui.heading}>Control de riego</Text>
      {!canOperate && <Text style={ui.body}>Tu rol de asesor permite consultar. Las órdenes están deshabilitadas.</Text>}
      {canOperate && <><Text style={ui.note}>Duración en minutos</Text>
        <View style={ui.row}>{[1, 5, 15, 30].map(n => <Button key={n} title={`${n} min`} secondary={duration !== String(n)} onPress={() => setDuration(String(n))} />)}</View>
        <TextInput style={ui.input} accessibilityLabel="Minutos de riego" keyboardType="number-pad" value={duration} onChangeText={setDuration} /></>}
      {plotValves.map(v => <View key={v.id} style={{ gap: 10, paddingVertical: 12 }}>
        <Text style={ui.heading}>{v.name}</Text><Text style={ui.body}>{v.status === 'open' ? 'Abierta · regando' : 'Cerrada'}</Text>
        {v.closes_at && <Text style={ui.note}>Cierre programado: {Math.max(0, Math.ceil((Date.parse(v.closes_at) - now) / 1000))} segundos.</Text>}
        {pendingCommands[v.id] ? <><Text style={ui.body}>Esperando confirmación…</Text>
          {canOperate && <Button title="Cancelar orden pendiente" secondary onPress={() => {
            void cancelCommand(pendingCommands[v.id].id).then(ok => setNotice(ok ? 'Orden cancelada.' : 'No se pudo cancelar; revisá el resultado.'));
          }} />}</> : <View style={ui.row}>
          <Button title="Regar" disabled={!canOperate || busy || !!draft} onPress={() => prepare(v.id, 'open')} />
          <Button title="Cerrar válvula" secondary disabled={!canOperate || busy || !!draft} onPress={() => prepare(v.id, 'close')} />
        </View>}
      </View>)}
      {!plotValves.length && <Text style={ui.body}>No hay válvulas configuradas.</Text>}
    </Card>
    <Modal visible={!!draft} transparent animationType="fade" onRequestClose={() => { if (!busy) setDraft(null); }}>
    <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#173C3299' }}>
    {draft && <Card><Text style={ui.heading}>Confirmar orden</Text>
      <Text style={ui.body}>{plot.name} · {plotValves.find(v => v.id === draft.valve)?.name}</Text>
      <Text style={ui.body}>{draft.action === 'open' ? `Regar durante ${draft.duration} minutos` : 'Cerrar válvula'}</Text>
      <Text selectable style={ui.note}>Solicitud: {draft.request}</Text>
      {!!notice && <Text accessibilityRole="alert" style={ui.body}>{notice}</Text>}
      <Button title={busy ? 'Enviando…' : 'Confirmar / reintentar'} disabled={busy} onPress={() => { void submit(); }} />
      <Button title="Volver" secondary disabled={busy} onPress={() => setDraft(null)} />
    </Card>}
    </View></Modal>
    {!!notice && <Text accessibilityRole="alert" style={ui.body}>{notice}</Text>}
    <Card><Text style={ui.heading}>Últimas órdenes</Text>
      {!commands.length && <Text style={ui.body}>Todavía no hay órdenes.</Text>}
      {commands.map(c => <View key={c.id} style={{ gap: 4, paddingVertical: 8 }}>
        <Text style={[ui.body, { fontWeight: '700' }]}>{c.action === 'open' ? `Regar ${c.duration_min ?? ''} min` : 'Cerrar'} · {labels[c.status]}</Text>
        <Text style={ui.note}>{new Date(c.created_at).toLocaleString()} · Usuario {c.requested_by.slice(0, 8)}</Text>
        {c.error_reason && <Text style={{ color: colors.red }}>La válvula no respondió ({c.error_reason}). Intentá una nueva orden.</Text>}
      </View>)}
    </Card>
  </Page>;
}
