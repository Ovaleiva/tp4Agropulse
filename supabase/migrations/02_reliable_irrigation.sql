-- Apply after 01_initial_schema.sql. All command transitions are transactional.
BEGIN;
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
COMMIT;
