-- Apply after 02_reliable_irrigation.sql.
-- Explicit Data API grants. Some new Supabase projects do not grant public tables to
-- API roles automatically. RLS still decides which rows each user can see.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT ON public.readings TO authenticated;            -- manual readings (RLS: source = 'manual')
GRANT UPDATE (threshold_min, threshold_max) ON public.plots TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;     -- worker and setup-users only
