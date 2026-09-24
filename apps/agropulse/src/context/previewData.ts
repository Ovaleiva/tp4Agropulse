import type { Organization, Plot, Station, Reading, Valve } from '../types';
export const previewOrganization: Organization = { id: 'preview', name: 'Estancia Didáctica Concordia', region: 'Concordia · Entre Ríos' };
export const previewPlots: Plot[] = ['Costa 1', 'Costa 2', 'Monte A'].map((name, i) => ({
  id: `preview-${i}`, organization_id: 'preview', name, crop: i === 2 ? 'Soja' : 'Citrus',
  threshold_min: 25, threshold_max: 45, created_at: '2026-01-01T00:00:00Z',
  polygon: [{ latitude: -31.39-i*.008, longitude: -58.02 }, { latitude: -31.39-i*.008, longitude: -58.014 },
    { latitude: -31.396-i*.008, longitude: -58.014 }, { latitude: -31.396-i*.008, longitude: -58.02 }],
}));
export const previewStations: Station[] = previewPlots.map((p,i) => ({
  id: `station-${i}`, plot_id: p.id, name: `Estación ${p.name}`, lat: p.polygon[0].latitude-.003, lng: -58.017,
}));
export function previewHistory(stationId: string, now: number): Reading[] {
  const i = previewStations.findIndex(s => s.id === stationId);
  return Array.from({ length: 13 }, (_, n) => ({ id: `${stationId}-${n}`, station_id: stationId,
    measured_at: new Date(now - (12-n)*25*60000 - (i === 2 ? 25*60000 : 5000)).toISOString(),
    moisture_pct: Math.round(([32,18,28][i] + (12-n)*.35)*10)/10, temp_c: 24, rain_mm: 0, source: 'sensor',
  }));
}
export const previewValves: Valve[] = previewPlots.map(p => ({ id: `valve-${p.id}`, plot_id: p.id,
  name: `Válvula ${p.name}`, status: 'closed', updated_at: '2026-01-01T00:00:00Z' }));
