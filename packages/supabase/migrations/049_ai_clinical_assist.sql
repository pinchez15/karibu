-- AI clinical assist: AI notes (draft/lab), critical alerts, Learn (CME), Consult.
-- See docs/ai-clinical-assist.md

-- =============================================================================
-- 1. AI review suggestions — phase lab + display_tier
-- =============================================================================

ALTER TABLE ai_review_suggestions DROP CONSTRAINT IF EXISTS ai_review_suggestions_phase_check;
ALTER TABLE ai_review_suggestions
  ADD CONSTRAINT ai_review_suggestions_phase_check
  CHECK (phase IN ('draft', 'pre_sign', 'post_sign', 'lab'));

ALTER TABLE ai_review_suggestions
  ADD COLUMN IF NOT EXISTS display_tier TEXT NOT NULL DEFAULT 'timeline'
    CHECK (display_tier IN ('timeline', 'interruptive'));

CREATE OR REPLACE FUNCTION count_unanswered_ai_notes(p_visit_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM ai_review_suggestions
  WHERE visit_id = p_visit_id
    AND clinician_response IS NULL
    AND display_tier = 'timeline';
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- 2. Visit critical alerts (deterministic; does not count toward AI note cap)
-- =============================================================================

CREATE TABLE IF NOT EXISTS visit_critical_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  rule_slug TEXT NOT NULL,
  confirm_question TEXT NOT NULL,
  clinical_prompt TEXT NOT NULL,
  library_slug TEXT,
  clinician_response TEXT CHECK (
    clinician_response IS NULL OR
    clinician_response IN ('confirmed', 'data_error', 'dismissed')
  ),
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (visit_id, rule_slug)
);

CREATE INDEX IF NOT EXISTS idx_visit_critical_alerts_visit
  ON visit_critical_alerts(visit_id, created_at DESC);

ALTER TABLE visit_critical_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visit_critical_alerts_select" ON visit_critical_alerts;
CREATE POLICY "visit_critical_alerts_select" ON visit_critical_alerts FOR SELECT
  USING (clinic_id = get_current_clinic_id());

CREATE OR REPLACE FUNCTION rpc_upsert_critical_alert(
  p_visit_id UUID,
  p_rule_slug TEXT,
  p_confirm_question TEXT,
  p_clinical_prompt TEXT,
  p_library_slug TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_clinic_id UUID;
  v_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO visit_critical_alerts (
    visit_id, clinic_id, rule_slug, confirm_question, clinical_prompt, library_slug
  ) VALUES (
    p_visit_id, v_clinic_id, p_rule_slug, p_confirm_question, p_clinical_prompt, p_library_slug
  )
  ON CONFLICT (visit_id, rule_slug) DO UPDATE SET
    confirm_question = EXCLUDED.confirm_question,
    clinical_prompt = EXCLUDED.clinical_prompt,
    library_slug = EXCLUDED.library_slug
  WHERE visit_critical_alerts.clinician_response IS NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_record_critical_alert_response(
  p_alert_id UUID,
  p_response TEXT
) RETURNS VOID AS $$
DECLARE
  v_clinic UUID;
BEGIN
  SELECT clinic_id INTO v_clinic FROM visit_critical_alerts WHERE id = p_alert_id;
  IF v_clinic IS NULL OR v_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_response NOT IN ('confirmed', 'data_error', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid response';
  END IF;
  UPDATE visit_critical_alerts
  SET clinician_response = p_response,
      responded_at = NOW(),
      responded_by = (SELECT id FROM staff WHERE clerk_user_id = auth.jwt()->>'sub' LIMIT 1)
  WHERE id = p_alert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_upsert_critical_alert(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_record_critical_alert_response(UUID, TEXT) TO anon, authenticated;

-- Gate draft AI: unsigned visits only
CREATE OR REPLACE FUNCTION rpc_request_draft_ai_assist(
  p_visit_id UUID,
  p_sections_snapshot JSONB DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_clinic_id UUID;
  v_role TEXT;
  v_doc_complete BOOLEAN;
BEGIN
  SELECT clinic_id, documentation_complete INTO v_clinic_id, v_doc_complete
  FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  IF v_doc_complete THEN
    RETURN jsonb_build_object('visit_id', p_visit_id, 'phase', 'draft', 'queued', FALSE, 'reason', 'signed');
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);
  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife','nurse','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  IF count_unanswered_ai_notes(p_visit_id) >= 3 THEN
    RETURN jsonb_build_object('visit_id', p_visit_id, 'phase', 'draft', 'queued', FALSE, 'reason', 'cap');
  END IF;

  UPDATE visits
  SET ai_review_status = CASE
    WHEN ai_review_status IN ('completed', 'running') THEN ai_review_status
    ELSE 'pending'
  END,
  updated_at = NOW()
  WHERE id = p_visit_id;

  RETURN jsonb_build_object('visit_id', p_visit_id, 'phase', 'draft', 'queued', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_request_lab_ai_assist(p_visit_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_clinic_id UUID;
  v_doc_complete BOOLEAN;
BEGIN
  SELECT clinic_id, documentation_complete INTO v_clinic_id, v_doc_complete
  FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  IF v_doc_complete THEN
    RETURN jsonb_build_object('visit_id', p_visit_id, 'phase', 'lab', 'queued', FALSE, 'reason', 'signed');
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF count_unanswered_ai_notes(p_visit_id) >= 3 THEN
    RETURN jsonb_build_object('visit_id', p_visit_id, 'phase', 'lab', 'queued', FALSE, 'reason', 'cap');
  END IF;

  RETURN jsonb_build_object('visit_id', p_visit_id, 'phase', 'lab', 'queued', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_request_lab_ai_assist(UUID) TO anon, authenticated;

-- =============================================================================
-- 3. Learn (CME) — no AI
-- =============================================================================

CREATE TABLE IF NOT EXISTS cme_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cme_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES cme_modules(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  library_slug TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (module_id, slug)
);

CREATE TABLE IF NOT EXISTS cme_flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES cme_modules(id) ON DELETE CASCADE,
  front_text TEXT NOT NULL,
  back_text TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cme_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES cme_modules(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  choices JSONB NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT,
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cme_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES cme_modules(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  score_pct INTEGER NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cme_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE cme_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE cme_flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE cme_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cme_quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cme_modules_read" ON cme_modules;
CREATE POLICY "cme_modules_read" ON cme_modules FOR SELECT USING (published = TRUE);

DROP POLICY IF EXISTS "cme_lessons_read" ON cme_lessons;
CREATE POLICY "cme_lessons_read" ON cme_lessons FOR SELECT USING (
  EXISTS (SELECT 1 FROM cme_modules m WHERE m.id = module_id AND m.published = TRUE)
);

DROP POLICY IF EXISTS "cme_flashcards_read" ON cme_flashcards;
CREATE POLICY "cme_flashcards_read" ON cme_flashcards FOR SELECT USING (
  EXISTS (SELECT 1 FROM cme_modules m WHERE m.id = module_id AND m.published = TRUE)
);

DROP POLICY IF EXISTS "cme_quiz_questions_read" ON cme_quiz_questions;
CREATE POLICY "cme_quiz_questions_read" ON cme_quiz_questions FOR SELECT USING (
  EXISTS (SELECT 1 FROM cme_modules m WHERE m.id = module_id AND m.published = TRUE)
);

DROP POLICY IF EXISTS "cme_quiz_attempts_own" ON cme_quiz_attempts;
CREATE POLICY "cme_quiz_attempts_own" ON cme_quiz_attempts FOR ALL
  USING (staff_id = (SELECT id FROM staff WHERE clerk_user_id = auth.jwt()->>'sub' LIMIT 1))
  WITH CHECK (staff_id = (SELECT id FROM staff WHERE clerk_user_id = auth.jwt()->>'sub' LIMIT 1));

CREATE OR REPLACE FUNCTION rpc_get_cme_modules()
RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'slug', m.slug,
      'title', m.title,
      'description', m.description,
      'display_order', m.display_order
    ) ORDER BY m.display_order, m.title
  ), '[]'::jsonb)
  FROM cme_modules m
  WHERE m.published = TRUE;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_get_cme_module_detail(p_module_id UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'module', (
      SELECT jsonb_build_object('id', m.id, 'slug', m.slug, 'title', m.title, 'description', m.description)
      FROM cme_modules m WHERE m.id = p_module_id AND m.published = TRUE
    ),
    'lessons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'slug', l.slug, 'title', l.title,
        'body_markdown', l.body_markdown, 'library_slug', l.library_slug
      ) ORDER BY l.display_order)
      FROM cme_lessons l WHERE l.module_id = p_module_id
    ), '[]'::jsonb),
    'flashcards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'front_text', f.front_text, 'back_text', f.back_text
      ) ORDER BY f.display_order)
      FROM cme_flashcards f WHERE f.module_id = p_module_id
    ), '[]'::jsonb),
    'quiz_questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'prompt', q.prompt, 'choices', q.choices,
        'correct_index', q.correct_index, 'explanation', q.explanation
      ) ORDER BY q.display_order)
      FROM cme_quiz_questions q WHERE q.module_id = p_module_id
    ), '[]'::jsonb)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_get_cme_modules() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_get_cme_module_detail(UUID) TO anon, authenticated;

-- Seed: malaria refresher
INSERT INTO cme_modules (slug, title, description, display_order)
VALUES (
  'malaria-hc3',
  'Malaria at HC III',
  'Refresh uncomplicated malaria assessment and treatment before documenting care.',
  10
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO cme_lessons (module_id, slug, title, body_markdown, library_slug, display_order)
SELECT m.id, 'overview', 'When to suspect malaria',
  'Confirm fever history and risk. Use RDT when available before empiric antimalarials. Document RDT result in the note.',
  NULL, 1
FROM cme_modules m WHERE m.slug = 'malaria-hc3'
ON CONFLICT (module_id, slug) DO NOTHING;

INSERT INTO cme_flashcards (module_id, front_text, back_text, display_order)
SELECT m.id, 'First step for febrile adult at HC III?', 'History + vitals; malaria RDT if available; document result.', 1
FROM cme_modules m WHERE m.slug = 'malaria-hc3';

INSERT INTO cme_quiz_questions (module_id, prompt, choices, correct_index, explanation, display_order)
SELECT m.id,
  'Before starting antimalarials, what should be documented when RDT is available?',
  '["RDT result","Patient village","Referral hospital name","Pharmacy stock count"]'::jsonb,
  0,
  'Document the RDT result in the clinical note.',
  1
FROM cme_modules m WHERE m.slug = 'malaria-hc3';

-- =============================================================================
-- 4. Consult (second opinion)
-- =============================================================================

CREATE TABLE IF NOT EXISTS consult_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES staff(id),
  redacted_snapshot JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consult_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES consult_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consult_messages_thread
  ON consult_messages(thread_id, created_at ASC);

ALTER TABLE consult_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE consult_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consult_threads_clinic" ON consult_threads;
CREATE POLICY "consult_threads_clinic" ON consult_threads FOR ALL
  USING (clinic_id = get_current_clinic_id())
  WITH CHECK (clinic_id = get_current_clinic_id());

DROP POLICY IF EXISTS "consult_messages_clinic" ON consult_messages;
CREATE POLICY "consult_messages_clinic" ON consult_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM consult_threads t
      WHERE t.id = thread_id AND t.clinic_id = get_current_clinic_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM consult_threads t
      WHERE t.id = thread_id AND t.clinic_id = get_current_clinic_id()
    )
  );

CREATE OR REPLACE FUNCTION rpc_start_consult(p_visit_id UUID, p_redacted_snapshot JSONB)
RETURNS JSONB AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
  v_staff_id UUID;
  v_thread_id UUID;
  v_doc_complete BOOLEAN;
  v_role TEXT;
BEGIN
  SELECT clinic_id, patient_id, documentation_complete
  INTO v_clinic_id, v_patient_id, v_doc_complete
  FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife','nurse','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_staff_id := get_current_staff_id();

  INSERT INTO consult_threads (visit_id, clinic_id, patient_id, created_by, redacted_snapshot)
  VALUES (p_visit_id, v_clinic_id, v_patient_id, v_staff_id, COALESCE(p_redacted_snapshot, '{}'::jsonb))
  ON CONFLICT (visit_id) DO UPDATE SET
    redacted_snapshot = EXCLUDED.redacted_snapshot,
    updated_at = NOW()
  RETURNING id INTO v_thread_id;

  RETURN jsonb_build_object(
    'thread_id', v_thread_id,
    'visit_id', p_visit_id,
    'read_only', v_doc_complete
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_list_consult_threads()
RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'thread_id', t.id,
      'visit_id', t.visit_id,
      'status', t.status,
      'updated_at', t.updated_at,
      'read_only', v.documentation_complete
    ) ORDER BY t.updated_at DESC
  ), '[]'::jsonb)
  FROM consult_threads t
  JOIN visits v ON v.id = t.visit_id
  WHERE t.clinic_id = get_current_clinic_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_get_consult_thread(p_thread_id UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'thread', (
      SELECT jsonb_build_object(
        'id', t.id,
        'visit_id', t.visit_id,
        'status', t.status,
        'redacted_snapshot', t.redacted_snapshot,
        'read_only', v.documentation_complete
      )
      FROM consult_threads t
      JOIN visits v ON v.id = t.visit_id
      WHERE t.id = p_thread_id AND t.clinic_id = get_current_clinic_id()
    ),
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'role', m.role, 'content', m.content, 'created_at', m.created_at
      ) ORDER BY m.created_at)
      FROM consult_messages m
      WHERE m.thread_id = p_thread_id
    ), '[]'::jsonb)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_append_consult_message(
  p_thread_id UUID,
  p_role TEXT,
  p_content TEXT
) RETURNS UUID AS $$
DECLARE
  v_clinic UUID;
  v_msg_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic FROM consult_threads WHERE id = p_thread_id;
  IF v_clinic IS NULL OR v_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_role NOT IN ('user', 'assistant', 'system') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  INSERT INTO consult_messages (thread_id, role, content)
  VALUES (p_thread_id, p_role, TRIM(p_content))
  RETURNING id INTO v_msg_id;
  UPDATE consult_threads SET updated_at = NOW() WHERE id = p_thread_id;
  RETURN v_msg_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_start_consult(UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_list_consult_threads() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_get_consult_thread(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_append_consult_message(UUID, TEXT, TEXT) TO anon, authenticated;
