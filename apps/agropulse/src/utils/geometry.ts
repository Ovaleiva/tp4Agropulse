import type { Coordinates } from '../types';
export function isPointInPolygon(point: Coordinates, polygon: Coordinates[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (((a.latitude > point.latitude) !== (b.latitude > point.latitude)) &&
      point.longitude < (b.longitude-a.longitude) * (point.latitude-a.latitude) / (b.latitude-a.latitude) + a.longitude) inside = !inside;
  }
  return inside;
}
