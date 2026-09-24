import { Text } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { Page, Card, Button, OrganizationPicker, ui } from '../../src/components/FieldUI';
export default function Profile() {
  const { user, role, organization, signOut, lastTickAt, lastLagMs, now, latestReadings, isPreview } = useApp();
  const last = Object.values(latestReadings).sort((a,b) => Date.parse(b.measured_at)-Date.parse(a.measured_at))[0];
  return <Page><Text style={ui.title}>Tu cuenta</Text><OrganizationPicker />
    <Card><Text style={ui.heading}>{user?.email}</Text><Text style={ui.body}>Rol: {role === 'producer' ? 'Productor' : role === 'operator' ? 'Operador' : 'Asesor'}</Text>
      {!isPreview && <Button title="Cerrar sesión" secondary onPress={() => { void signOut(); }} />}
    </Card>
    <Card><Text style={ui.heading}>Diagnóstico</Text><Text selectable style={ui.note}>Usuario: {user?.id}</Text>
      <Text style={ui.body}>Establecimiento: {organization?.name ?? 'Sin seleccionar'}</Text>
      <Text style={ui.body}>Último evento recibido: {lastTickAt ? new Date(lastTickAt).toLocaleTimeString() : 'Esperando eventos'}</Text>
      <Text style={ui.body}>Antigüedad de la última medición: {last ? Math.max(0, Math.floor((now-Date.parse(last.measured_at))/1000)) + ' s' : 'Sin datos'}</Text>
      <Text style={ui.body}>Lag aparente (sensor → app): {lastLagMs == null ? 'Esperando eventos' : `${(lastLagMs / 1000).toFixed(1)} s`}</Text>
      <Text style={ui.note}>Actualización por Realtime, con consulta de respaldo cada 2,5 segundos.</Text>
    </Card>
  </Page>;
}
