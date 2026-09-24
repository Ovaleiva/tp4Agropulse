import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { Page, Card, Button, OrganizationPicker, ui, colors } from '../../src/components/FieldUI';
import { calculatePlotStatus, formatReadingAge } from '../../src/utils/status';

export default function Home() {
  const { plots, stations, latestReadings, valves, pendingCommands } = useApp();
  const router = useRouter();
  const rows = plots.map(plot => {
    const station = stations.find(s => s.plot_id === plot.id);
    const reading = station ? latestReadings[station.id] : undefined;
    return { plot, reading, state: calculatePlotStatus(reading?.measured_at, reading?.moisture_pct, plot.threshold_min, plot.threshold_max) };
  });
  return <Page>
    <Text style={ui.eyebrow}>AGROPULSE / TU CAMPO, A LA VISTA</Text>
    <Text style={ui.title}>Cada lote cuenta.</Text>
    <Text style={ui.body}>Revisá el suelo y decidí dónde regar.</Text>
    <OrganizationPicker />
    <View style={ui.row}>{[
      ['Lotes secos', rows.filter(r => r.state.status === 'dry').length],
      ['Válvulas abiertas', valves.filter(v => v.status === 'open').length],
      ['Lotes sin datos', rows.filter(r => r.state.status === 'stale').length],
    ].map(([label, count]) => <View key={label} style={[ui.card, { flexGrow: 1, minWidth: 130 }]}>
      <Text style={[ui.title, { color: colors.green }]}>{count}</Text><Text style={ui.note}>{label}</Text>
    </View>)}</View>
    <Text style={ui.heading}>Recorrido del campo</Text>
    {!rows.length && <Card><Text style={ui.body}>Todavía no hay lotes en este establecimiento.</Text></Card>}
    {rows.map(({ plot, reading, state }) => <Card key={plot.id}>
      <View style={[ui.row, { justifyContent: 'space-between' }]}>
        <View><Text style={ui.heading}>{plot.name}</Text><Text style={ui.note}>{plot.crop}</Text></View>
        <Text style={{ color: state.color, fontWeight: '800' }}>{state.label}</Text>
      </View>
      <Text style={ui.title}>{reading ? `${reading.moisture_pct}%` : '—'} <Text style={ui.body}>de humedad</Text></Text>
      <Text style={ui.note}>{formatReadingAge(reading?.measured_at)} · Umbral mínimo {plot.threshold_min}%</Text>
      <Button title="Ver lote y riego" secondary onPress={() => router.push(`/plot/${plot.id}`)} />
    </Card>)}
    <Text style={ui.note}>{Object.keys(pendingCommands).length} órdenes esperando confirmación.</Text>
    <Button title="Abrir mapa del campo" onPress={() => router.push('/(tabs)/map')} />
  </Page>;
}
