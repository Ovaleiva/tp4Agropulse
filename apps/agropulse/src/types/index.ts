export type UserRole = 'producer' | 'operator' | 'advisor';

export type PlotStatus = 'stale' | 'dry' | 'optimal' | 'wet';

export type ValveStatus = 'open' | 'closed';

export type CommandAction = 'open' | 'close';

export type CommandStatus = 'pending' | 'applied' | 'failed' | 'cancelled';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Organization {
  id: string;
  name: string;
  region: string;
}

export interface Membership {
  id: string;
  user_id: string;
  organization_id: string;
  role: UserRole;
}

export interface Plot {
  id: string;
  organization_id: string;
  name: string;
  crop: string;
  polygon: Coordinates[];
  threshold_min: number;
  threshold_max: number;
  created_at: string;
}

export interface Station {
  id: string;
  plot_id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Reading {
  id: string;
  station_id: string;
  measured_at: string;
  moisture_pct: number;
  temp_c: number;
  rain_mm: number;
  source: 'sensor' | 'manual';
}

export interface Valve {
  id: string;
  plot_id: string;
  name: string;
  status: ValveStatus;
  updated_at: string;
  closes_at?: string | null;
}

export interface IrrigationCommand {
  id: string;
  valve_id: string;
  requested_by: string;
  action: CommandAction;
  duration_min?: number;
  status: CommandStatus;
  client_request_id: string;
  created_at: string;
  applied_at?: string;
  error_reason?: string;
}