-- ============================================================================
-- AGROPULSE · SETUP COMPLETO (generado a partir de migrations/ y seeds)
-- Pegar entero en Supabase > SQL Editor > New query > Run. Ejecutar UNA sola vez
-- en un proyecto nuevo y dedicado al TP. Orden: 01 esquema, 02 riego, 03 permisos,
-- seed, seed_demo_extra. Si algo falla, no se aplica nada (una sola transacción).
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------- migrations/01_initial_schema.sql
-- 1. Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabla organizations
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    region TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabla memberships
CREATE TYPE public.user_role AS ENUM ('producer', 'operator', 'advisor');

CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role public.user_role NOT NULL DEFAULT 'producer',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, organization_id)
);

-- 4. Tabla plots (lotes)
CREATE TABLE IF NOT EXISTS public.plots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    crop TEXT NOT NULL, -- Citrus, Soja, etc.
    polygon JSONB NOT NULL, -- Coordenadas [{latitude, longitude}, ...]
    threshold_min NUMERIC(5,2) NOT NULL DEFAULT 25.0,
    threshold_max NUMERIC(5,2) NOT NULL DEFAULT 45.0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Tabla stations (estaciones de sensores)
CREATE TABLE IF NOT EXISTS public.stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Tabla readings (lecturas de telemetría)
CREATE TYPE public.reading_source AS ENUM ('sensor', 'manual');

CREATE TABLE IF NOT EXISTS public.readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    measured_at TIMESTAMPTZ NOT NULL,
    moisture_pct NUMERIC(5,2) NOT NULL,
    temp_c NUMERIC(5,2) NOT NULL,
    rain_mm NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    source public.reading_source NOT NULL DEFAULT 'sensor',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índice requerido por el PRD para optimizar consultas de series temporales
CREATE INDEX IF NOT EXISTS idx_readings_station_measured 
ON public.readings (station_id, measured_at DESC);

-- 7. Tabla valves (válvulas)
CREATE TYPE public.valve_status AS ENUM ('open', 'closed');

CREATE TABLE IF NOT EXISTS public.valves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status public.valve_status NOT NULL DEFAULT 'closed',
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Tabla irrigation_commands (comandos de riego con idempotencia y estados)
CREATE TYPE public.command_action AS ENUM ('open', 'close');
CREATE TYPE public.command_status AS ENUM ('pending', 'applied', 'failed', 'cancelled');

CREATE TABLE IF NOT EXISTS public.irrigation_commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    valve_id UUID NOT NULL REFERENCES public.valves(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES auth.users(id),
    action public.command_action NOT NULL,
    duration_min INT CHECK (duration_min BETWEEN 1 AND 120),
    status public.command_status NOT NULL DEFAULT 'pending',
    client_request_id UUID NOT NULL UNIQUE, -- Idempotencia (RNF-08)
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    applied_at TIMESTAMPTZ,
    error_reason TEXT
);

-- RF-16: Índice parcial único para impedir dos comandos 'pending' simultáneos en la misma válvula
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_command_per_valve
ON public.irrigation_commands (valve_id)
WHERE status = 'pending';

-- 9. Tabla alerts
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'low_moisture', 'stale_station'
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    read_at TIMESTAMPTZ
);

-- HABILITAR ROW LEVEL SECURITY (RLS) EN TODAS LAS TABLAS (Must)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irrigation_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS RLS BASADAS EN MEMBRESÍA
CREATE POLICY "Users can view memberships of their orgs"
ON public.memberships FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can view organizations they belong to"
ON public.organizations FOR SELECT
USING (id IN (SELECT organization_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Users can view plots of their orgs"
ON public.plots FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Producers can update plot thresholds"
ON public.plots FOR UPDATE
USING (organization_id IN (
    SELECT organization_id FROM public.memberships 
    WHERE user_id = auth.uid() AND role = 'producer'
));

CREATE POLICY "Users can view stations of their orgs"
ON public.stations FOR SELECT
USING (plot_id IN (
    SELECT p.id FROM public.plots p
    JOIN public.memberships m ON m.organization_id = p.organization_id
    WHERE m.user_id = auth.uid()
));

CREATE POLICY "Users can view readings of their orgs"
ON public.readings FOR SELECT
USING (station_id IN (
    SELECT s.id FROM public.stations s
    JOIN public.plots p ON p.id = s.plot_id
    JOIN public.memberships m ON m.organization_id = p.organization_id
    WHERE m.user_id = auth.uid()
));

-- Lecturas de sensores las inserta el worker con service role.
-- Permitir lectura manual a producer y operator (Should RF-21)
CREATE POLICY "Producers and operators can insert manual readings"
ON public.readings FOR INSERT
WITH CHECK (
    source = 'manual' AND
    station_id IN (
        SELECT s.id FROM public.stations s
        JOIN public.plots p ON p.id = s.plot_id
        JOIN public.memberships m ON m.organization_id = p.organization_id
        WHERE m.user_id = auth.uid() AND m.role IN ('producer', 'operator')
    )
);

CREATE POLICY "Users can view valves of their orgs"
ON public.valves FOR SELECT
USING (plot_id IN (
    SELECT p.id FROM public.plots p
    JOIN public.memberships m ON m.organization_id = p.organization_id
    WHERE m.user_id = auth.uid()
));

CREATE POLICY "Users can view commands of their orgs"
ON public.irrigation_commands FOR SELECT
USING (valve_id IN (
    SELECT v.id FROM public.valves v
    JOIN public.plots p ON p.id = v.plot_id
    JOIN public.memberships m ON m.organization_id = p.organization_id
    WHERE m.user_id = auth.uid()
));

-- Solo producer y operator pueden emitir comandos (OA-1, §05)
CREATE POLICY "Producers and operators can insert irrigation commands"
ON public.irrigation_commands FOR INSERT
WITH CHECK (
    requested_by = auth.uid() AND
    valve_id IN (
        SELECT v.id FROM public.valves v
        JOIN public.plots p ON p.id = v.plot_id
        JOIN public.memberships m ON m.organization_id = p.organization_id
        WHERE m.user_id = auth.uid() AND m.role IN ('producer', 'operator')
    )
);

-- Producer y operator pueden cancelar comandos pending (RF-17)
CREATE POLICY "Producers and operators can cancel pending commands"
ON public.irrigation_commands FOR UPDATE
USING (
    status = 'pending' AND
    valve_id IN (
        SELECT v.id FROM public.valves v
        JOIN public.plots p ON p.id = v.plot_id
        JOIN public.memberships m ON m.organization_id = p.organization_id
        WHERE m.user_id = auth.uid() AND m.role IN ('producer', 'operator')
    )
);

-- PUBLICAR EN SUPABASE REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.readings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.valves;
ALTER PUBLICATION supabase_realtime ADD TABLE public.irrigation_commands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;

-- ---------------------------------------------------------------- migrations/02_reliable_irrigation.sql
-- Apply after 01_initial_schema.sql. All command transitions are transactional.
ALTER TABLE public.valves ADD COLUMN closes_at timestamptz;
ALTER TABLE public.plots ADD CONSTRAINT valid_thresholds CHECK
  (threshold_min >= 0 AND threshold_max <= 100 AND threshold_min <= threshold_max);

-- Clients may edit thresholds, never organization ownership or command results.
REVOKE UPDATE ON public.plots FROM anon, authenticated;
GRANT UPDATE (threshold_min, threshold_max) ON public.plots TO authenticated;
DROP POLICY "Producers can update plot thresholds" ON public.plots;
CREATE POLICY "Operators update thresholds" ON public.plots FOR UPDATE TO authenticated
USING (organization_id IN (SELECT organization_id FROM public.memberships
  WHERE user_id = auth.uid() AND role IN ('producer','operator')))
WITH CHECK (organization_id IN (SELECT organization_id FROM public.memberships
  WHERE user_id = auth.uid() AND role IN ('producer','operator')));
REVOKE INSERT, UPDATE, DELETE ON public.irrigation_commands FROM anon, authenticated;

CREATE FUNCTION public.request_irrigation(p_valve_id uuid, p_action public.command_action,
  p_duration_min integer, p_request_id uuid) RETURNS public.irrigation_commands
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result public.irrigation_commands; org uuid;
BEGIN
  SELECT p.organization_id INTO org FROM public.valves v JOIN public.plots p ON p.id=v.plot_id
    WHERE v.id=p_valve_id;
  IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE user_id=auth.uid()
    AND organization_id=org AND role IN ('producer','operator')) THEN
    RAISE EXCEPTION 'No tenés permiso para regar este lote' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_action IS NULL OR
    (p_action='open' AND p_duration_min IS NOT NULL AND p_duration_min NOT BETWEEN 1 AND 120) OR
    (p_action='close' AND p_duration_min IS NOT NULL) THEN
    RAISE EXCEPTION 'Duración o acción inválida' USING ERRCODE='22023';
  END IF;
  -- Serialize the same request ID, including retries to different valves.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  SELECT * INTO result FROM public.irrigation_commands WHERE client_request_id=p_request_id;
  IF FOUND THEN
    IF result.requested_by<>auth.uid() OR result.valve_id<>p_valve_id OR result.action<>p_action
      OR result.duration_min IS DISTINCT FROM p_duration_min THEN
      RAISE EXCEPTION 'La solicitud ya existe con otros datos' USING ERRCODE='22023';
    END IF;
    RETURN result;
  END IF;
  PERFORM 1 FROM public.valves WHERE id=p_valve_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.irrigation_commands WHERE valve_id=p_valve_id AND status='pending') THEN
    RAISE EXCEPTION 'Esta válvula ya tiene una orden pendiente' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.irrigation_commands(valve_id,requested_by,action,duration_min,client_request_id)
    VALUES(p_valve_id,auth.uid(),p_action,p_duration_min,p_request_id) RETURNING * INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.cancel_irrigation(p_command_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.irrigation_commands c SET status='cancelled'
  WHERE c.id=p_command_id AND c.status='pending' AND EXISTS (
    SELECT 1 FROM public.valves v JOIN public.plots p ON p.id=v.plot_id
    JOIN public.memberships m ON m.organization_id=p.organization_id
    WHERE v.id=c.valve_id AND m.user_id=auth.uid() AND m.role IN ('producer','operator'));
  RETURN FOUND;
END $$;

-- Only the backend can call this function; row lock makes retries harmless.
CREATE FUNCTION public.apply_irrigation(p_command_id uuid, p_fail boolean DEFAULT false)
RETURNS public.command_status LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.irrigation_commands;
BEGIN
  SELECT * INTO c FROM public.irrigation_commands WHERE id=p_command_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comando inexistente'; END IF;
  IF c.status<>'pending' THEN RETURN c.status; END IF;
  IF p_fail THEN
    UPDATE public.irrigation_commands SET status='failed',error_reason='valve_timeout'
      WHERE id=c.id;
    RETURN 'failed';
  END IF;
  UPDATE public.valves SET status=CASE WHEN c.action='open' THEN 'open'::public.valve_status
    ELSE 'closed'::public.valve_status END, updated_at=now(),
    closes_at=CASE WHEN c.action='open' AND c.duration_min IS NOT NULL
      THEN now()+pg_catalog.make_interval(mins=>c.duration_min) ELSE NULL END WHERE id=c.valve_id;
  UPDATE public.irrigation_commands SET status='applied',applied_at=now(),error_reason=NULL WHERE id=c.id;
  RETURN 'applied';
END $$;

CREATE FUNCTION public.close_due_valves() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE count_closed integer;
BEGIN
  UPDATE public.valves SET status='closed',closes_at=NULL,updated_at=now()
    WHERE status='open' AND closes_at<=now();
  GET DIAGNOSTICS count_closed=ROW_COUNT;
  RETURN count_closed;
END $$;

-- A bounded query avoids downloading a station's complete history on every tick.
CREATE FUNCTION public.latest_readings(p_station_ids uuid[]) RETURNS SETOF public.readings
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT r.* FROM unnest(p_station_ids) AS s(id) CROSS JOIN LATERAL
    (SELECT * FROM public.readings WHERE station_id=s.id ORDER BY measured_at DESC LIMIT 1) r;
$$;
CREATE FUNCTION public.reading_history(p_station_id uuid) RETURNS SETOF public.readings
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT h.* FROM (SELECT DISTINCT ON (floor(extract(epoch FROM measured_at)/300)) *
    FROM public.readings WHERE station_id=p_station_id AND measured_at>=now()-interval '6 hours'
    ORDER BY floor(extract(epoch FROM measured_at)/300), measured_at DESC) h
  ORDER BY measured_at;
$$;

REVOKE ALL ON FUNCTION public.request_irrigation(uuid,public.command_action,integer,uuid),
  public.cancel_irrigation(uuid),public.apply_irrigation(uuid,boolean),public.close_due_valves(),
  public.latest_readings(uuid[]),public.reading_history(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_irrigation(uuid,public.command_action,integer,uuid),
  public.cancel_irrigation(uuid),public.latest_readings(uuid[]),public.reading_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_irrigation(uuid,boolean),public.close_due_valves() TO service_role;

-- ---------------------------------------------------------------- migrations/03_api_grants.sql
-- Apply after 02_reliable_irrigation.sql.
-- Explicit Data API grants. Some new Supabase projects do not grant public tables to
-- API roles automatically. RLS still decides which rows each user can see.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT ON public.readings TO authenticated;            -- manual readings (RLS: source = 'manual')
GRANT UPDATE (threshold_min, threshold_max) ON public.plots TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;     -- worker and setup-users only

-- ---------------------------------------------------------------- seed.sql
-- ============================================================================
-- AGROPULSE — SEMILLA DE DATOS DIDÁCTICA (Postgres / Supabase)
-- Establecimiento Agropecuario: "Estancia Didáctica Concordia" (Concordia, Entre Ríos)
-- Cumplimiento de §14 del PRD Institucional (FCyT - UADER)
-- ============================================================================

-- 1. Crear Organización principal
INSERT INTO public.organizations (id, name, region)
VALUES ('11111111-1111-1111-1111-111111111111', 'Estancia Didáctica Concordia', 'Concordia, Entre Ríos')
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    region = EXCLUDED.region;

-- 2. Crear los 3 Lotes con polígonos en Concordia, Entre Ríos (-31.39, -58.02)
-- Costa 1 (Citrus - Óptimo), Costa 2 (Citrus - Seco), Monte A (Soja - Stale)
INSERT INTO public.plots (id, organization_id, name, crop, polygon, threshold_min, threshold_max)
VALUES 
(
    '22222222-2222-2222-2222-222222222221',
    '11111111-1111-1111-1111-111111111111',
    'Costa 1',
    'Citrus',
    '[
        {"latitude": -31.3900, "longitude": -58.0200},
        {"latitude": -31.3900, "longitude": -58.0140},
        {"latitude": -31.3960, "longitude": -58.0140},
        {"latitude": -31.3960, "longitude": -58.0200}
    ]'::jsonb,
    25.0,
    45.0
),
(
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Costa 2',
    'Citrus',
    '[
        {"latitude": -31.3970, "longitude": -58.0200},
        {"latitude": -31.3970, "longitude": -58.0140},
        {"latitude": -31.4030, "longitude": -58.0140},
        {"latitude": -31.4030, "longitude": -58.0200}
    ]'::jsonb,
    25.0,
    45.0
),
(
    '22222222-2222-2222-2222-222222222223',
    '11111111-1111-1111-1111-111111111111',
    'Monte A',
    'Soja',
    '[
        {"latitude": -31.3900, "longitude": -58.0270},
        {"latitude": -31.3900, "longitude": -58.0210},
        {"latitude": -31.3960, "longitude": -58.0210},
        {"latitude": -31.3960, "longitude": -58.0270}
    ]'::jsonb,
    20.0,
    40.0
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    crop = EXCLUDED.crop,
    polygon = EXCLUDED.polygon,
    threshold_min = EXCLUDED.threshold_min,
    threshold_max = EXCLUDED.threshold_max;

-- 3. Crear Estaciones de sensores (≥1 por lote)
INSERT INTO public.stations (id, plot_id, name, lat, lng)
VALUES
('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222221', 'Estación Costa 1-Norte', -31.3930, -58.0170),
('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222222', 'Estación Costa 2-Sur', -31.4000, -58.0170),
('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222223', 'Estación Monte A-Oeste', -31.3930, -58.0240)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng;

-- 4. Crear Válvulas (≥1 por lote)
INSERT INTO public.valves (id, plot_id, name, status)
VALUES
('44444444-4444-4444-4444-444444444441', '22222222-2222-2222-2222-222222222221', 'Válvula Goteo Costa 1', 'closed'),
('44444444-4444-4444-4444-444444444442', '22222222-2222-2222-2222-222222222222', 'Válvula Principal Costa 2', 'closed'),
('44444444-4444-4444-4444-444444444443', '22222222-2222-2222-2222-222222222223', 'Válvula Aspersión Monte A', 'closed')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name;

-- 5. Semilla de Serie Temporal Histórica para Gráficos (RF-10: ≥12 puntos en las últimas 6 horas)

-- Lote Costa 1 (Estación 1): Óptimo (~32%) con fluctuación normal
INSERT INTO public.readings (station_id, measured_at, moisture_pct, temp_c, rain_mm, source)
VALUES
('33333333-3333-3333-3333-333333333331', now() - INTERVAL '5 hours 30 min', 34.2, 19.5, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333331', now() - INTERVAL '5 hours', 33.9, 20.1, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333331', now() - INTERVAL '4 hours 30 min', 33.6, 21.0, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333331', now() - INTERVAL '4 hours', 33.2, 22.3, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333331', now() - INTERVAL '3 hours 30 min', 32.8, 23.5, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333331', now() - INTERVAL '3 hours', 32.5, 24.1, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333331', now() - INTERVAL '2 hours 30 min', 32.3, 24.8, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333331', now() - INTERVAL '2 hours', 32.0, 25.2, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333331', now() - INTERVAL '1 hour 30 min', 31.8, 25.0, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333331', now() - INTERVAL '1 hour', 31.6, 24.6, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333331', now() - INTERVAL '30 min', 32.1, 23.9, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333331', now() - INTERVAL '15 min', 32.4, 23.5, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333331', now(), 32.5, 23.2, 0.0, 'sensor');

-- Lote Costa 2 (Estación 2): Seco (descendiendo hasta ~17.8% para gatillar alerta y orden de riego H1)
INSERT INTO public.readings (station_id, measured_at, moisture_pct, temp_c, rain_mm, source)
VALUES
('33333333-3333-3333-3333-333333333332', now() - INTERVAL '5 hours 30 min', 24.8, 21.0, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333332', now() - INTERVAL '5 hours', 24.1, 22.0, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333332', now() - INTERVAL '4 hours 30 min', 23.5, 23.2, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333332', now() - INTERVAL '4 hours', 22.8, 24.5, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333332', now() - INTERVAL '3 hours 30 min', 22.0, 25.4, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333332', now() - INTERVAL '3 hours', 21.3, 26.1, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333332', now() - INTERVAL '2 hours 30 min', 20.6, 26.8, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333332', now() - INTERVAL '2 hours', 19.9, 27.2, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333332', now() - INTERVAL '1 hour 30 min', 19.3, 27.5, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333332', now() - INTERVAL '1 hour', 18.8, 27.1, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333332', now() - INTERVAL '30 min', 18.3, 26.9, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333332', now() - INTERVAL '10 min', 18.0, 26.5, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333332', now(), 17.8, 26.2, 0.0, 'sensor');

-- Lote Monte A (Estación 3): Stale (última lectura hace 25 min -> gris sin datos confiables H4)
INSERT INTO public.readings (station_id, measured_at, moisture_pct, temp_c, rain_mm, source)
VALUES
('33333333-3333-3333-3333-333333333333', now() - INTERVAL '5 hours', 29.5, 20.0, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333333', now() - INTERVAL '4 hours', 29.1, 21.2, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333333', now() - INTERVAL '3 hours', 28.7, 22.0, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333333', now() - INTERVAL '2 hours', 28.3, 22.5, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333333', now() - INTERVAL '1 hour', 28.0, 22.2, 0.0, 'sensor'),
('33333333-3333-3333-3333-333333333333', now() - INTERVAL '25 minutes', 28.0, 22.1, 0.0, 'sensor');

-- ---------------------------------------------------------------- seed_demo_extra.sql
-- Supplemental fixtures for organization switching and isolation tests.
INSERT INTO public.organizations(id,name,region) VALUES
('11111111-1111-1111-1111-111111111112','Escuela Rural · Campo de prueba','Entre Ríos · datos ficticios')
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.plots(id,organization_id,name,crop,polygon) VALUES
('22222222-2222-2222-2222-222222222224','11111111-1111-1111-1111-111111111112','Escuela 1','Maíz',
'[{"latitude":-31.42,"longitude":-58.04},{"latitude":-31.42,"longitude":-58.03},{"latitude":-31.43,"longitude":-58.03},{"latitude":-31.43,"longitude":-58.04}]')
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.stations(id,plot_id,name,lat,lng) VALUES
('33333333-3333-3333-3333-333333333334','22222222-2222-2222-2222-222222222224','Estación Escuela',-31.425,-58.035)
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.valves(id,plot_id,name) VALUES
('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222224','Válvula Escuela')
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.readings(station_id,measured_at,moisture_pct,temp_c,rain_mm)
SELECT '33333333-3333-3333-3333-333333333334',now()-i*interval '25 minutes',32,24,0
FROM generate_series(0,13) i;
-- Fill gaps so Monte A also has at least 12 points, while keeping its latest tick stale.
INSERT INTO public.readings(station_id,measured_at,moisture_pct,temp_c,rain_mm)
SELECT '33333333-3333-3333-3333-333333333333',now()-i*interval '25 minutes',28,24,0
FROM generate_series(1,13) i;

COMMIT;
