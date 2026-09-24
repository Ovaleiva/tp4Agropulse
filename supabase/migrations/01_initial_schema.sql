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