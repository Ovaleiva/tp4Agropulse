import type { PlotStatus } from '../types';

export interface StatusEvaluation {
  status: PlotStatus;
  label: string;
  color: string;
  icon: string;
  badgeBg: string;
}

/**
 * Evalúa el estado del semáforo según las reglas de negocio (§8):
 * 1. stale (Gris): Sin lectura o antigüedad > 15 minutos.
 * 2. dry (Rojo): moisture_pct < threshold_min (default 25%).
 * 3. optimal (Verde): threshold_min <= moisture_pct <= threshold_max (default 45%).
 * 4. wet (Azul): moisture_pct > threshold_max.
 */
export function calculatePlotStatus(
  lastMeasuredAt: string | null | undefined,
  moisturePct: number | null | undefined,
  thresholdMin: number = 25.0,
  thresholdMax: number = 45.0
): StatusEvaluation {
  // Regla 1: Stale
  if (!lastMeasuredAt || moisturePct === null || moisturePct === undefined) {
    return {
      status: 'stale',
      label: 'Sin datos / Stale',
      color: '#64748B', // Gris
      icon: 'cloud-offline-outline',
      badgeBg: '#F1F5F9',
    };
  }

  const measuredTime = new Date(lastMeasuredAt).getTime();
  const now = Date.now();
  const diffMinutes = (now - measuredTime) / (1000 * 60);

  if (!Number.isFinite(measuredTime) || !Number.isFinite(moisturePct) || diffMinutes > 15) {
    return {
      status: 'stale',
      label: 'Sin datos confiables (>15 min)',
      color: '#64748B', // Gris
      icon: 'alert-circle-outline',
      badgeBg: '#F1F5F9',
    };
  }

  // Regla 2: Dry
  if (moisturePct < thresholdMin) {
    return {
      status: 'dry',
      label: 'Seco (Riesgo)',
      color: '#B93636', // Rojo
      icon: 'water-alert-outline',
      badgeBg: '#FEE2E2',
    };
  }

  // Regla 3: Optimal
  if (moisturePct >= thresholdMin && moisturePct <= thresholdMax) {
    return {
      status: 'optimal',
      label: 'Óptimo',
      color: '#24734D', // Verde
      icon: 'checkmark-circle-outline',
      badgeBg: '#D1FAE5',
    };
  }

  // Regla 4: Wet
  return {
    status: 'wet',
    label: 'Húmedo',
    color: '#2563A6', // Azul
    icon: 'water-outline',
    badgeBg: '#DBEAFE',
  };
}

/**
 * Formatea la antigüedad relativa de una lectura (RF-09: "hace 12 s", "hace 2 min")
 */
export function formatReadingAge(measuredAt: string | null | undefined): string {
  if (!measuredAt) return 'Sin registros';
  const diffMs = Date.now() - new Date(measuredAt).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `hace ${Math.max(1, diffSec)} s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  return `hace ${diffHours} h`;
}