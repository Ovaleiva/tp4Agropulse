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