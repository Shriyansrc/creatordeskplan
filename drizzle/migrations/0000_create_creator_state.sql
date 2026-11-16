CREATE TABLE public.creator_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.creator_state TO authenticated;
GRANT ALL ON public.creator_state TO service_role;

ALTER TABLE public.creator_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own creator state"
  ON public.creator_state
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own creator state"
  ON public.creator_state
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own creator state"
  ON public.creator_state
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);