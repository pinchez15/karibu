-- KaribuLearn — community case corrections (tester feedback queue).
-- Run in KaribuLearn Supabase → SQL Editor after 001_learn_init.sql.

CREATE TABLE public.case_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES public.learners(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  case_level INTEGER,
  message TEXT NOT NULL CHECK (char_length(trim(message)) >= 8),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'duplicate')),
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_corrections_case ON public.case_corrections (case_id, created_at DESC);
CREATE INDEX idx_case_corrections_status ON public.case_corrections (status, created_at DESC);

ALTER TABLE public.case_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY corrections_select_own ON public.case_corrections
  FOR SELECT USING (auth.uid() = learner_id);

-- Inserts via RPC only.

CREATE OR REPLACE FUNCTION public.rpc_submit_case_correction(
  p_case_id TEXT,
  p_pack_id TEXT,
  p_message TEXT,
  p_case_level INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.learners (id) VALUES (v_uid) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.case_corrections (learner_id, case_id, pack_id, case_level, message)
  VALUES (v_uid, p_case_id, p_pack_id, p_case_level, trim(p_message))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'status', 'pending');
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_submit_case_correction(TEXT, TEXT, TEXT, INTEGER)
  TO authenticated;
