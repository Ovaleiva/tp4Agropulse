import { useState, useRef, Fragment } from 'react';
import { View, Text, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import Svg, { Polygon as SvgPolygon, Text as SvgText } from 'react-native-svg';
import { useApp } from '../../src/context/AppContext';
import { Page, Card, Button, OrganizationPicker, ui, colors } from '../../src/components/FieldUI';
import { calculatePlotStatus } from '../../src/utils/status';
import { Coordinates } from '../../src/types';
import { isPointInPolygon } from '../../src/utils/geometry';
let NativeMap: any, NativePolygon: any;
if (Platform.OS !== 'web') {
  // Native maps must not be imported by the browser bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const maps = require('react-native-maps');
  NativeMap = maps.default; NativePolygon = maps.Polygon;
}
export default function MapScreen() {
  const { plots, stations, latestReadings } = useApp();
  const router = useRouter();
  const map = useRef<any>(null);
  const [gps, setGps] = useState('Ubicación no solicitada');
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const locate = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') { setGps('Ubicación no disponible: permiso denegado'); return; }
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: result.coords.latitude, longitude: result.coords.longitude };
      setLocation(coords); setGps('Ubicación disponible');
      map.current?.animateToRegion({ ...coords, latitudeDelta: 0.015, longitudeDelta: 0.015 });
    } catch { setGps('Ubicación no disponible. Revisá el GPS e intentá otra vez.'); }
    finally { setLocating(false); }
  };
  const inside = location ? plots.find(p => isPointInPolygon(location, p.polygon)) : null;
  const all = plots.flatMap(p => p.polygon);
  const minLat = Math.min(...all.map(p => p.latitude)), maxLat = Math.max(...all.map(p => p.latitude));
  const minLng = Math.min(...all.map(p => p.longitude)), maxLng = Math.max(...all.map(p => p.longitude));
  const status = (id: string) => {
    const plot = plots.find(p => p.id === id)!;
    const s = stations.find(s => s.plot_id === id); const r = s ? latestReadings[s.id] : undefined;
    return calculatePlotStatus(r?.measured_at, r?.moisture_pct, plot.threshold_min, plot.threshold_max);
  };
  return <Page><Text style={ui.title}>Mapa del campo</Text><OrganizationPicker />
    <Card><Text style={ui.body}>{inside ? `Estás en ${inside.name}` : location ? 'Estás fuera de los lotes' : gps}</Text>
      <Button title={locating ? 'Buscando ubicación…' : 'Mi ubicación'} disabled={locating} onPress={() => { void locate(); }} secondary />
    </Card>
    {!plots.length ? <Card><Text style={ui.body}>No hay lotes para mostrar.</Text></Card> : Platform.OS !== 'web' ?
      <View style={{ height: 380, borderRadius: 20, overflow: 'hidden' }}>
        <NativeMap key={plots.map(p => p.id).join(',')} ref={map} style={{ flex: 1 }} showsUserLocation={!!location}
          initialRegion={{ latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2,
            latitudeDelta: Math.max(0.015, (maxLat - minLat) * 1.6), longitudeDelta: Math.max(0.015, (maxLng - minLng) * 1.6) }}>
          {plots.map(p => <NativePolygon key={p.id} coordinates={p.polygon} strokeColor={status(p.id).color}
            fillColor={`${status(p.id).color}66`} strokeWidth={3} tappable onPress={() => router.push(`/plot/${p.id}`)} />)}
        </NativeMap>
      </View> : <Card><Text style={ui.note}>Plano de lotes · vista esquemática para navegador</Text>
        <Svg width="100%" height={300} viewBox="0 0 500 300">
          {plots.map(p => {
            const coords = p.polygon.map(c => ({ x: 30 + (c.longitude - minLng) / Math.max(maxLng - minLng, .001) * 440,
              y: 270 - (c.latitude - minLat) / Math.max(maxLat - minLat, .001) * 240 }));
            return <Fragment key={p.id}>
              <SvgPolygon accessibilityLabel={`${p.name}: ${status(p.id).label}`}
                points={coords.map(c => `${c.x},${c.y}`).join(' ')} fill={`${status(p.id).color}66`}
                stroke={status(p.id).color} strokeWidth={3} onPress={() => router.push(`/plot/${p.id}`)} />
              <SvgText x={coords.reduce((sum,c) => sum+c.x,0)/coords.length}
                y={coords.reduce((sum,c) => sum+c.y,0)/coords.length} textAnchor="middle"
                fill={colors.ink} fontSize={14} fontWeight="bold" onPress={() => router.push(`/plot/${p.id}`)}>{p.name}</SvgText>
            </Fragment>;
          })}
          <SvgText x={12} y={18} fill={colors.ink}>N ↑</SvgText>
        </Svg>
      </Card>}
    <View style={ui.row}>{['Seco · rojo', 'Óptimo · verde', 'Húmedo · azul', 'Sin datos · gris'].map(t => <Text style={ui.note} key={t}>{t}</Text>)}</View>
    {plots.map(p => <Card key={p.id}><Text style={ui.heading}>{p.name}</Text>
      <Text style={{ color: status(p.id).color, fontWeight: '700' }}>{status(p.id).label}</Text>
      <Button title="Ver detalle" secondary onPress={() => router.push(`/plot/${p.id}`)} />
    </Card>)}
  </Page>;
}
