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
