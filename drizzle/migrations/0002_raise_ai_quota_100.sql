CREATE OR REPLACE FUNCTION public.reserve_reference_search(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_now timestamptz;
  v_global bigint;
  v_user bigint;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Verified user ID required' USING ERRCODE = '22004';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(724193806112345678::bigint);
  v_now := pg_catalog.clock_timestamp();
  SELECT count(*), count(*) FILTER (WHERE user_id = p_user_id)
    INTO v_global, v_user
    FROM public.reference_search_quota
    WHERE reserved_at > v_now - interval '1 hour';
  IF v_user >= 100 OR v_global >= 1000 THEN
    RETURN false;
  END IF;
  INSERT INTO public.reference_search_quota (user_id, reserved_at) VALUES (p_user_id, v_now);
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.reserve_reference_search(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_reference_search(uuid) TO service_role;