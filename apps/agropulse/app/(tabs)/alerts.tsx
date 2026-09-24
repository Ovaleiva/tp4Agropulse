import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { Page, Card, Button, ui } from '../../src/components/FieldUI';
import { calculatePlotStatus } from '../../src/utils/status';
export default function Alerts() {
  const { plots, stations, latestReadings } = useApp(); const router = useRouter();
  const alerts = plots.flatMap(p => {
    const s = stations.find(s => s.plot_id === p.id); const r = s ? latestReadings[s.id] : undefined;
    const state = calculatePlotStatus(r?.measured_at, r?.moisture_pct, p.threshold_min, p.threshold_max);
    return state.status === 'dry' || state.status === 'stale' ? [{ p, state }] : [];
  });
  return <Page><Text style={ui.title}>Para revisar</Text><Text style={ui.body}>Condiciones actuales del campo.</Text>
    {!alerts.length && <Card><Text style={ui.heading}>Todo en orden</Text><Text style={ui.body}>No hay lotes secos ni estaciones sin datos recientes.</Text></Card>}
    {alerts.map(({ p, state }) => <Card key={p.id}><Text style={ui.heading}>{p.name}</Text>
      <Text style={{ color: state.color, fontWeight: '700' }}>{state.label}</Text>
      <Text style={ui.body}>{state.status === 'dry' ? 'La humedad está por debajo del mínimo configurado.' : 'No hay una lectura confiable de los últimos 15 minutos.'}</Text>
      <Button title="Revisar lote" secondary onPress={() => router.push(`/plot/${p.id}`)} />
    </Card>)}
  </Page>;
}
