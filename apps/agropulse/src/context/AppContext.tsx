import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Organization, UserRole, Plot, Station, Reading, Valve, IrrigationCommand } from '../types';
import { previewOrganization, previewPlots, previewStations, previewValves, previewHistory } from './previewData';

type MembershipOption = { role: UserRole; organization_id: string; organizations: Organization };
type Snapshot = { plots: Plot[]; stations: Station[]; latestReadings: Record<string, Reading>;
  valves: Valve[]; pendingCommands: Record<string, IrrigationCommand> };
const empty = (): Snapshot => ({ plots: [], stations: [], latestReadings: {}, valves: [], pendingCommands: {} });
function useAppState() {
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastTickAt, setLastTickAt] = useState<string | null>(null);
  const [lastLagMs, setLastLagMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const version = useRef(0);
  const requestSerial = useRef(0);
  const activeFetch = useRef<number | null>(null);
  const activeStationIds = useRef(new Set<string>());
  const [membershipAttempt, setMembershipAttempt] = useState(0);
  const user = session?.user ?? null;
  const membership = memberships.find(m => m.organization_id === activeId);
  const organization = membership?.organizations ?? null;
  const role = membership?.role ?? null;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(error.message);
      setSession(data.session); if (!data.session) setIsLoading(false);
    }).catch(e => { if (alive) { setError(e.message); setIsLoading(false); } });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    let alive = true;
    version.current++;
    // Reset data when the authenticated identity changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnapshot(empty()); setMemberships([]); setActiveId(null); setLastTickAt(null);
    if (!user?.id) { setIsLoading(false); return; }
    setIsLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.from('memberships')
          .select('role,organization_id,organizations(*)').eq('user_id', user.id);
        if (error) throw error;
        const list = data as unknown as MembershipOption[];
        const saved = await AsyncStorage.getItem(`organization:${user.id}`);
        if (!alive) return;
        setMemberships(list);
        setActiveId(list.find(m => m.organization_id === saved)?.organization_id ?? list[0]?.organization_id ?? null);
        if (!list.length) setIsLoading(false);
      } catch (e) { if (alive) { setError(e instanceof Error ? e.message : 'No se pudo cargar tu establecimiento'); setIsLoading(false); } }
    })();
    return () => { alive = false; };
  }, [user?.id, membershipAttempt]);
  const refreshData = useCallback(async () => {
    if (!activeId) { setMembershipAttempt(n => n + 1); return; }
    const requestVersion = version.current;
    if (activeFetch.current === requestVersion) return;
    activeFetch.current = requestVersion;
    const serial = ++requestSerial.current;
    try {
      const plotsResult = await supabase.from('plots').select('*').eq('organization_id', activeId);
      if (plotsResult.error) throw plotsResult.error;
      const plots = (plotsResult.data ?? []) as Plot[];
      const next = empty(); next.plots = plots;
      if (plots.length) {
        const ids = plots.map(p => p.id);
        const [sr, vr] = await Promise.all([
          supabase.from('stations').select('*').in('plot_id', ids),
          supabase.from('valves').select('*').in('plot_id', ids),
        ]);
        if (sr.error || vr.error) throw sr.error || vr.error;
        next.stations = sr.data as Station[]; next.valves = vr.data as Valve[];
        if (next.stations.length) {
          const rr = await supabase.rpc('latest_readings', { p_station_ids: next.stations.map(s => s.id) });
          if (rr.error) throw rr.error;
          for (const r of (rr.data ?? []) as Reading[]) next.latestReadings[r.station_id] = r;
        }
        if (next.valves.length) {
          const cr = await supabase.from('irrigation_commands').select('*')
            .in('valve_id', next.valves.map(v => v.id)).eq('status', 'pending');
          if (cr.error) throw cr.error;
          for (const c of (cr.data ?? []) as IrrigationCommand[]) next.pendingCommands[c.valve_id] = c;
        }
      }
      if (requestVersion === version.current && serial === requestSerial.current) {
        activeStationIds.current = new Set(next.stations.map(s => s.id));
        setSnapshot(next); setError(null);
      }
    } catch (e) {
      if (requestVersion === version.current && serial === requestSerial.current) setError((e as {message?: string}).message ?? 'No se pudo actualizar. Revisá tu conexión.');
    } finally {
      if (activeFetch.current === requestVersion) activeFetch.current = null;
      if (requestVersion === version.current) setIsLoading(false);
    }
  }, [activeId]);
  useEffect(() => {
    // Clear the previous organization before loading another one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    version.current++; setSnapshot(empty()); setLastTickAt(null);
    if (!activeId) return;
    setIsLoading(true); void refreshData();
    const channel = supabase.channel(`field:${activeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'readings' }, payload => {
        const reading = payload.new as Reading;
        if (!activeStationIds.current.has(reading.station_id)) return;
        // Apparent lag: sensor timestamp -> event received on this device (includes clock skew).
        const received = Date.now();
        setLastTickAt(new Date(received).toISOString());
        const measured = Date.parse(reading.measured_at);
        setLastLagMs(Number.isFinite(measured) ? received - measured : null);
        void refreshData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'valves' }, () => { void refreshData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'irrigation_commands' }, () => { void refreshData(); })
      .subscribe();
    const poll = setInterval(() => { void refreshData(); }, 2500);
    // Generation counter invalidates in-flight requests on cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { version.current++; clearInterval(poll); void supabase.removeChannel(channel); };
  }, [activeId, refreshData]);
  const selectOrganization = async (id: string) => {
    if (!user || !memberships.some(m => m.organization_id === id)) return;
    version.current++; setSnapshot(empty()); setActiveId(id);
    try { await AsyncStorage.setItem(`organization:${user.id}`, id); }
    catch { setError('No se pudo guardar el establecimiento elegido en este dispositivo.'); }
  };
  const cancelCommand = async (id: string) => {
    const result = await supabase.rpc('cancel_irrigation', { p_command_id: id });
    if (result.error) { setError(result.error.message); return false; }
    await refreshData(); return result.data === true;
  };
  const signOut = async () => {
    const result = await supabase.auth.signOut({ scope: 'local' });
    if (result.error) { setError(result.error.message); return; }
    version.current++; setSession(null); setSnapshot(empty()); setMemberships([]); setActiveId(null);
  };
  return { isPreview: false, session, user, role, organization, memberships, selectOrganization, ...snapshot,
    isLoading, error, now, lastTickAt, lastLagMs, refreshData, cancelCommand, signOut };
}
const AppContext = createContext<ReturnType<typeof useAppState> | undefined>(undefined);
export function AppProvider({ children }: { children: ReactNode }) {
  if (__DEV__ && process.env.EXPO_PUBLIC_VISUAL_PREVIEW === 'true') return <PreviewProvider>{children}</PreviewProvider>;
  return <LiveProvider>{children}</LiveProvider>;
}
function LiveProvider({ children }: { children: ReactNode }) {
  const state = useAppState();
  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}
function PreviewProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  const [start] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const user = { id: 'preview-user', app_metadata: {}, user_metadata: {}, aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z', email: 'vista-previa@agropulse.test' };
  const state: ReturnType<typeof useAppState> = {
    isPreview: true, session: { user, access_token: 'preview', refresh_token: 'preview', expires_in: 3600, token_type: 'bearer' },
    user, role: 'advisor', organization: previewOrganization,
    memberships: [{ organization_id: 'preview', role: 'advisor', organizations: previewOrganization }],
    plots: previewPlots, stations: previewStations, valves: previewValves,
    latestReadings: Object.fromEntries(previewStations.map(s => [s.id, previewHistory(s.id,start).at(-1)!])),
    pendingCommands: {}, isLoading: false, error: null, now, lastTickAt: null, lastLagMs: null,
    refreshData: async () => {}, selectOrganization: async () => {}, cancelCommand: async () => false,
    signOut: async () => {},
  };
  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('Falta AppProvider');
  return value;
}
