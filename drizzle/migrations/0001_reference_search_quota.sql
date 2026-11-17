CREATE TABLE public.reference_search_quota (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT ALL ON TABLE public.reference_search_quota TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.reference_search_quota_id_seq TO service_role;
REVOKE ALL ON TABLE public.reference_search_quota FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.reference_search_quota_id_seq FROM PUBLIC, anon, authenticated;
ALTER TABLE public.reference_search_quota ENABLE ROW LEVEL SECURITY;
CREATE INDEX reference_search_quota_time_idx ON public.reference_search_quota (reserved_at);
CREATE INDEX reference_search_quota_user_time_idx ON public.reference_search_quota (user_id, reserved_at);
COMMENT ON TABLE public.reference_search_quota IS 'Server-only rolling-hour reference-search reservations. No client RLS policies. Unrelated to creator_state.';
CREATE FUNCTION public.reserve_reference_search(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
  IF v_user >= 8 OR v_global >= 80 THEN
    RETURN false;
  END IF;
  INSERT INTO public.reference_search_quota (user_id, reserved_at) VALUES (p_user_id, v_now);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_reference_search(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_reference_search(uuid) TO service_role;