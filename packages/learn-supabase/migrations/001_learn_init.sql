-- KaribuLearn — initial schema (separate Supabase project from Karibu EHR).
-- Run in Supabase Dashboard → SQL Editor for the KaribuLearn project.
--
-- Requires: Authentication → Providers → enable Phone and/or Email.

-- ── Learner profile (1:1 with auth.users) ───────────────────────────────────

CREATE TABLE public.learners (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT,
  credits_earned NUMERIC(8, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.learners IS
  'KaribuLearn learner profile. No PHI; separate from EHR staff table.';

-- ── Case completions (game progress) ──────────────────────────────────────

CREATE TABLE public.case_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES public.learners(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  credit NUMERIC(6, 2),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (learner_id, case_id)
);

CREATE INDEX idx_case_completions_learner ON public.case_completions (learner_id);

-- ── Auto-create learner row on sign-up ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_learner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.learners (id, phone, display_name)
  VALUES (
    NEW.id,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_learn ON auth.users;
CREATE TRIGGER on_auth_user_created_learn
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_learner();

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.learners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY learners_select_own ON public.learners
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY learners_update_own ON public.learners
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY completions_select_own ON public.case_completions
  FOR SELECT USING (auth.uid() = learner_id);

-- Writes go through RPCs below (no direct client insert policy).

-- ── RPC: record case completion (call from Android on walkthrough finish) ───

CREATE OR REPLACE FUNCTION public.rpc_record_case_completion(
  p_case_id TEXT,
  p_pack_id TEXT,
  p_score INTEGER,
  p_total INTEGER,
  p_credit NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_credit NUMERIC(6, 2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ensure learner row exists (e.g. user created before trigger existed).
  INSERT INTO public.learners (id)
  VALUES (v_uid)
  ON CONFLICT (id) DO NOTHING;

  v_credit := COALESCE(p_credit, 0);

  INSERT INTO public.case_completions (
    learner_id, case_id, pack_id, score, total, credit
  ) VALUES (
    v_uid, p_case_id, p_pack_id, p_score, p_total, v_credit
  )
  ON CONFLICT (learner_id, case_id) DO UPDATE SET
    score = GREATEST(case_completions.score, EXCLUDED.score),
    total = EXCLUDED.total,
    credit = EXCLUDED.credit,
    pack_id = EXCLUDED.pack_id,
    completed_at = CASE
      WHEN EXCLUDED.score > case_completions.score THEN NOW()
      ELSE case_completions.completed_at
    END;

  -- Re-sum credits from best completions (idempotent).
  UPDATE public.learners l
  SET
    credits_earned = (
      SELECT COALESCE(SUM(c.credit), 0)
      FROM public.case_completions c
      WHERE c.learner_id = v_uid
    ),
    updated_at = NOW()
  WHERE l.id = v_uid;

  RETURN jsonb_build_object(
    'case_id', p_case_id,
    'score', p_score,
    'total', p_total,
    'credit', v_credit
  );
END;
$$;

-- ── RPC: fetch progress for Progress tab ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_get_my_progress()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_learner public.learners%ROWTYPE;
  v_completions JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_learner FROM public.learners WHERE id = v_uid;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'case_id', c.case_id,
        'pack_id', c.pack_id,
        'score', c.score,
        'total', c.total,
        'credit', c.credit,
        'completed_at', c.completed_at
      )
      ORDER BY c.completed_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_completions
  FROM public.case_completions c
  WHERE c.learner_id = v_uid;

  RETURN jsonb_build_object(
    'credits_earned', COALESCE(v_learner.credits_earned, 0),
    'display_name', v_learner.display_name,
    'completions', v_completions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_record_case_completion(TEXT, TEXT, INTEGER, INTEGER, NUMERIC)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_my_progress()
  TO authenticated;
