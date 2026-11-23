-- 118_office_billing_grants.sql
-- Karibu Office modules G and K (docs/karibu-office-spec.md §7.G, §7.K).
--
--   G. Invoices an office sends its clinics, and READ-ONLY reconciliation:
--      the partner records that money arrived (pasted MoMo/Airtel SMS,
--      statement CSV, or cash) and matches it to an invoice. Karibu never
--      holds, moves or settles this money. There is no collection here.
--   K. Grant milestones verified from platform data, released by Karibu
--      central in one step. Plus the nightly job that ties it all together.

-- ============================================================================
-- 1. Invoices
-- ============================================================================

CREATE OR REPLACE FUNCTION office.invoice_json(i office.invoices)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = office, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', i.id, 'number', i.number, 'clinic_account_id', i.clinic_account_id,
    'clinic_name', (SELECT name FROM office.clinic_accounts WHERE id = i.clinic_account_id),
    'period_start', i.period_start, 'period_end', i.period_end, 'issue_date', i.issue_date,
    'due_date', i.due_date, 'lines', i.lines, 'amount', i.amount, 'amount_paid', i.amount_paid,
    'currency', i.currency,
    -- Overdue is a fact about today, so it is derived on read as well as stamped nightly.
    'status', CASE WHEN i.status IN ('sent', 'part_paid') AND i.due_date < CURRENT_DATE THEN 'overdue' ELSE i.status END,
    'sent_via', i.sent_via, 'sent_at', i.sent_at, 'void_reason', i.void_reason,
    'efris_reference', i.efris_reference, 'public_token', i.public_token, 'created_at', i.created_at);
$$;

-- Validates lines and computes the total server-side. Amounts are minor units.
CREATE OR REPLACE FUNCTION office.clean_invoice_lines(p_lines JSONB)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_line JSONB;
  v_out JSONB := '[]'::jsonb;
  v_qty NUMERIC; v_unit BIGINT;
BEGIN
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 20 THEN
    RAISE EXCEPTION 'An invoice needs between 1 and 20 lines';
  END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::NUMERIC, 1);
    v_unit := (v_line->>'unit_amount')::BIGINT;
    IF v_unit IS NULL OR v_unit < 0 OR v_qty <= 0 OR v_qty > 120 THEN RAISE EXCEPTION 'Check the amounts on the invoice'; END IF;
    IF COALESCE(trim(v_line->>'description'), '') = '' THEN RAISE EXCEPTION 'Every line needs a description'; END IF;
    v_out := v_out || jsonb_build_object(
      'kind', CASE WHEN v_line->>'kind' IN ('subscription', 'setup', 'training', 'other') THEN v_line->>'kind' ELSE 'other' END,
      'description', left(trim(v_line->>'description'), 200),
      'quantity', v_qty, 'unit_amount', v_unit, 'amount', ROUND(v_qty * v_unit)::BIGINT);
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION office.create_invoice(
  p_account office.clinic_accounts, p_lines JSONB, p_period_start DATE, p_period_end DATE, p_due DATE, p_by TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_office office.offices;
  v_lines JSONB := office.clean_invoice_lines(p_lines);
  v_seq INTEGER;
  v_id UUID;
BEGIN
  UPDATE office.offices SET next_invoice_seq = next_invoice_seq + 1
  WHERE id = p_account.office_id RETURNING * INTO v_office;
  v_seq := v_office.next_invoice_seq - 1;

  INSERT INTO office.invoices (office_id, clinic_account_id, number, period_start, period_end, due_date, lines, amount, currency, public_token, created_by)
  VALUES (
    p_account.office_id, p_account.id,
    format('%s-%s-%s', v_office.invoice_prefix, to_char(CURRENT_DATE, 'YYYY'), lpad(v_seq::TEXT, 4, '0')),
    p_period_start, p_period_end,
    COALESCE(p_due, CURRENT_DATE + office.setting_int('invoice_due_days', 14)),
    v_lines, (SELECT SUM((l->>'amount')::BIGINT) FROM jsonb_array_elements(v_lines) l),
    v_office.currency, office.new_token(), p_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.office_invoice_create(
  p_account_id UUID, p_lines JSONB, p_period_start DATE DEFAULT NULL, p_due_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_account office.clinic_accounts;
  v_id UUID;
  v_start DATE := date_trunc('month', p_period_start)::DATE;
BEGIN
  v_account := office.require_account(p_account_id, ARRAY['owner', 'support']);
  IF v_start IS NOT NULL AND EXISTS (
    SELECT 1 FROM office.invoices WHERE clinic_account_id = p_account_id AND period_start = v_start AND status <> 'void') THEN
    RAISE EXCEPTION 'INVOICE_PERIOD_EXISTS';
  END IF;
  v_id := office.create_invoice(v_account, p_lines, v_start,
    CASE WHEN v_start IS NULL THEN NULL ELSE (v_start + INTERVAL '1 month - 1 day')::DATE END,
    p_due_date, office.current_sub());
  RETURN (SELECT office.invoice_json(i) FROM office.invoices i WHERE i.id = v_id);
END;
$$;

-- Monthly run: one draft subscription invoice per live clinic with a plan, for
-- the month given. The app passes the country's price book (packages/shared is
-- the single source of prices). Idempotent per clinic per month.
CREATE OR REPLACE FUNCTION public.office_invoices_generate(p_office_id UUID, p_period DATE, p_monthly JSONB, p_names JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  a office.clinic_accounts;
  v_start DATE := date_trunc('month', p_period)::DATE;
  v_end DATE := (date_trunc('month', p_period) + INTERVAL '1 month - 1 day')::DATE;
  v_sub TEXT := office.current_sub();
  v_created INTEGER := 0;
  v_no_plan JSONB := '[]'::jsonb;
  v_price BIGINT;
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner']);
  FOR a IN
    SELECT * FROM office.clinic_accounts
    WHERE office_id = p_office_id AND stage IN ('live', 'steady', 'billed')
      AND COALESCE(billing_starts_on, v_start) <= v_end
    ORDER BY name
  LOOP
    IF a.tier IS NULL OR (p_monthly->>a.tier) IS NULL THEN
      v_no_plan := v_no_plan || to_jsonb(a.name);
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM office.invoices WHERE clinic_account_id = a.id AND period_start = v_start AND status <> 'void') THEN
      CONTINUE;
    END IF;
    v_price := (p_monthly->>a.tier)::BIGINT;
    PERFORM office.create_invoice(a,
      jsonb_build_array(jsonb_build_object(
        'kind', 'subscription',
        'description', format('%s, %s', COALESCE(p_names->>a.tier, a.tier), to_char(v_start, 'FMMonth YYYY')),
        'quantity', 1, 'unit_amount', v_price)),
      v_start, v_end, NULL, v_sub);
    v_created := v_created + 1;
  END LOOP;
  RETURN jsonb_build_object('created', v_created, 'no_plan', v_no_plan);
END;
$$;

CREATE OR REPLACE FUNCTION office.require_invoice(p_invoice_id UUID, p_roles TEXT[] DEFAULT NULL)
RETURNS office.invoices
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_invoice office.invoices;
BEGIN
  SELECT * INTO v_invoice FROM office.invoices WHERE id = p_invoice_id;
  IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM office.require_member(v_invoice.office_id, p_roles);
  RETURN v_invoice;
END;
$$;

CREATE OR REPLACE FUNCTION public.office_invoice_get(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_invoice office.invoices;
BEGIN
  v_invoice := office.require_invoice(p_invoice_id);
  RETURN office.invoice_json(v_invoice) || jsonb_build_object(
    'contact_phone', (SELECT COALESCE(contact_phone, champion_phone) FROM office.clinic_accounts WHERE id = v_invoice.clinic_account_id),
    'contact_name', (SELECT contact_name FROM office.clinic_accounts WHERE id = v_invoice.clinic_account_id),
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'amount', p.amount, 'method', p.method, 'reference', p.reference,
        'paid_at', p.paid_at, 'confirmed', p.confirmed_at IS NOT NULL) ORDER BY p.paid_at)
      FROM office.payments p WHERE p.invoice_id = p_invoice_id), '[]'::jsonb));
END;
$$;

-- Marks a draft as sent (the partner shares the link over WhatsApp).
CREATE OR REPLACE FUNCTION public.office_invoice_send(p_invoice_id UUID, p_via TEXT DEFAULT 'whatsapp', p_efris_reference TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_invoice office.invoices;
BEGIN
  v_invoice := office.require_invoice(p_invoice_id, ARRAY['owner', 'support']);
  IF v_invoice.status = 'void' THEN RAISE EXCEPTION 'This invoice was cancelled'; END IF;
  UPDATE office.invoices SET
    status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
    sent_via = p_via, sent_at = COALESCE(sent_at, NOW()),
    issue_date = CASE WHEN status = 'draft' THEN CURRENT_DATE ELSE issue_date END,
    efris_reference = COALESCE(NULLIF(trim(p_efris_reference), ''), efris_reference),
    updated_at = NOW()
  WHERE id = p_invoice_id RETURNING * INTO v_invoice;
  RETURN office.invoice_json(v_invoice);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_invoice_void(p_invoice_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_invoice office.invoices;
BEGIN
  v_invoice := office.require_invoice(p_invoice_id, ARRAY['owner']);
  IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF EXISTS (SELECT 1 FROM office.payments WHERE invoice_id = p_invoice_id AND confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'INVOICE_HAS_PAYMENTS' USING HINT = 'Unmatch its payments first.';
  END IF;
  UPDATE office.payments SET invoice_id = NULL, matched_by = NULL WHERE invoice_id = p_invoice_id;
  UPDATE office.invoices
  SET status = 'void', voided_at = NOW(), voided_by = office.current_sub(), void_reason = trim(p_reason), updated_at = NOW()
  WHERE id = p_invoice_id RETURNING * INTO v_invoice;
  UPDATE office.tasks SET status = 'done', closed_at = NOW()
  WHERE dedupe_key = 'invoice_overdue:' || p_invoice_id AND status = 'open';
  PERFORM office.audit(v_invoice.office_id, 'invoice.void', 'invoice', p_invoice_id,
    jsonb_build_object('number', v_invoice.number, 'reason', trim(p_reason)));
  RETURN office.invoice_json(v_invoice);
END;
$$;

-- What a clinic sees when it opens the invoice link. The seller shown is the
-- OFFICE (public name and registered name), with the office's own payout
-- details. Karibu is not a party to this invoice.
CREATE OR REPLACE FUNCTION public.office_invoice_public(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_invoice office.invoices;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RAISE EXCEPTION 'LINK_INVALID' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_invoice FROM office.invoices WHERE public_token = p_token AND status NOT IN ('draft', 'void');
  IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'LINK_INVALID' USING ERRCODE = 'P0002'; END IF;
  RETURN (office.invoice_json(v_invoice) - 'public_token' - 'clinic_account_id' - 'id') || jsonb_build_object(
    'office', (SELECT jsonb_build_object(
        'name', o.name, 'legal_name', o.legal_name, 'contact_name', o.contact_name,
        'contact_phone', o.contact_phone, 'contact_email', o.contact_email, 'payout_details', o.payout_details)
      FROM office.offices o WHERE o.id = v_invoice.office_id));
END;
$$;

-- ============================================================================
-- 2. Payments: record, match, confirm
-- ============================================================================

CREATE OR REPLACE FUNCTION office.phone_tail(p TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  -- Last 9 digits: "+256 772 123456", "0772123456" and "256772123456" all compare equal.
  SELECT NULLIF(right(regexp_replace(COALESCE(p, ''), '\D', '', 'g'), 9), '');
$$;

-- Recomputes an invoice's paid amount and status from its confirmed payments.
CREATE OR REPLACE FUNCTION office.settle_invoice(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_invoice office.invoices;
  v_paid BIGINT;
BEGIN
  IF p_invoice_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_invoice FROM office.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_invoice.id IS NULL OR v_invoice.status = 'void' THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM office.payments
  WHERE invoice_id = p_invoice_id AND confirmed_at IS NOT NULL;

  UPDATE office.invoices SET
    amount_paid = v_paid,
    status = CASE
      WHEN v_paid >= amount THEN 'paid'
      WHEN v_paid > 0 THEN 'part_paid'
      WHEN status = 'draft' THEN 'draft'
      WHEN due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'sent' END,
    updated_at = NOW()
  WHERE id = p_invoice_id;

  IF v_paid >= v_invoice.amount THEN
    UPDATE office.tasks SET status = 'done', closed_at = NOW()
    WHERE dedupe_key = 'invoice_overdue:' || p_invoice_id AND status = 'open';
    -- First invoice paid is the "billed" milestone (spec §7.C.7).
    PERFORM office.move_stage(v_invoice.clinic_account_id, 'billed', 'auto', 'Invoice ' || v_invoice.number || ' paid');
  END IF;
END;
$$;

-- Suggests the invoice a payment is for: an open invoice of this office whose
-- balance equals the amount; if several, the one whose clinic's phone matches
-- the payer; if still several, none (the partner chooses).
CREATE OR REPLACE FUNCTION office.suggest_invoice(p_office_id UUID, p_amount BIGINT, p_payer_phone TEXT)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_ids UUID[];
  v_by_phone UUID[];
BEGIN
  SELECT array_agg(i.id ORDER BY i.due_date) INTO v_ids
  FROM office.invoices i
  WHERE i.office_id = p_office_id AND i.status IN ('sent', 'part_paid', 'overdue')
    AND i.amount - i.amount_paid = p_amount;
  IF v_ids IS NULL THEN RETURN NULL; END IF;
  IF cardinality(v_ids) = 1 THEN RETURN v_ids[1]; END IF;

  IF office.phone_tail(p_payer_phone) IS NOT NULL THEN
    SELECT array_agg(i.id ORDER BY i.due_date) INTO v_by_phone
    FROM office.invoices i JOIN office.clinic_accounts a ON a.id = i.clinic_account_id
    WHERE i.id = ANY (v_ids)
      AND office.phone_tail(p_payer_phone) IN (office.phone_tail(a.contact_phone), office.phone_tail(a.champion_phone));
    -- Same clinic, several months owing: the oldest is the one being paid.
    IF v_by_phone IS NOT NULL AND (
      SELECT COUNT(DISTINCT clinic_account_id) FROM office.invoices WHERE id = ANY (v_by_phone)) = 1 THEN
      RETURN v_by_phone[1];
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION office.record_payment(p_office_id UUID, p JSONB, p_by TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_office office.offices;
  v_amount BIGINT := (p->>'amount')::BIGINT;
  v_method TEXT := p->>'method';
  v_ref TEXT := NULLIF(trim(p->>'reference'), '');
  v_invoice UUID := NULLIF(p->>'invoice_id', '')::UUID;
  v_manual BOOLEAN;
  v_id UUID;
BEGIN
  SELECT * INTO v_office FROM office.offices WHERE id = p_office_id;
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'The amount must be more than zero'; END IF;
  IF v_method NOT IN ('momo_mtn', 'airtel', 'cash', 'bank') THEN RAISE EXCEPTION 'Unknown payment method'; END IF;

  IF v_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM office.payments WHERE office_id = p_office_id AND method = v_method AND reference = v_ref) THEN
    RETURN jsonb_build_object('status', 'duplicate', 'reference', v_ref);
  END IF;

  v_manual := v_invoice IS NOT NULL;
  IF v_manual AND NOT EXISTS (SELECT 1 FROM office.invoices WHERE id = v_invoice AND office_id = p_office_id AND status NOT IN ('void', 'draft')) THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_manual THEN
    v_invoice := office.suggest_invoice(p_office_id, v_amount, p->>'payer_phone');
  END IF;

  INSERT INTO office.payments (office_id, clinic_account_id, invoice_id, amount, currency, method, reference,
                               payer_phone, payer_name, paid_at, raw_evidence, matched_by, confirmed_at, confirmed_by, recorded_by)
  VALUES (
    p_office_id, (SELECT clinic_account_id FROM office.invoices WHERE id = v_invoice), v_invoice,
    v_amount, v_office.currency, v_method, v_ref,
    NULLIF(trim(p->>'payer_phone'), ''), NULLIF(trim(p->>'payer_name'), ''),
    COALESCE(NULLIF(p->>'paid_at', '')::TIMESTAMPTZ, NOW()), left(p->>'raw_evidence', 2000),
    CASE WHEN v_invoice IS NULL THEN NULL WHEN v_manual THEN 'manual' ELSE 'auto' END,
    -- A match the partner chose counts at once. A suggested match waits for a tap.
    CASE WHEN v_manual THEN NOW() END, CASE WHEN v_manual THEN p_by END, p_by)
  RETURNING id INTO v_id;

  IF v_manual THEN PERFORM office.settle_invoice(v_invoice); END IF;
  RETURN jsonb_build_object('status', CASE WHEN v_invoice IS NULL THEN 'unmatched' WHEN v_manual THEN 'matched' ELSE 'suggested' END,
                            'payment_id', v_id, 'invoice_id', v_invoice);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_payment_record(p_office_id UUID, p_payment JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner', 'support']);
  RETURN office.record_payment(p_office_id, p_payment, office.current_sub());
END;
$$;

-- Statement CSV: the app parses rows, this records each and reports per row.
CREATE OR REPLACE FUNCTION public.office_payments_import(p_office_id UUID, p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_sub TEXT := office.current_sub();
  v_row JSONB; v_result JSONB; v_results JSONB := '[]'::jsonb;
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner', 'support']);
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 500 THEN RAISE EXCEPTION 'Import up to 500 rows at a time'; END IF;
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      v_result := office.record_payment(p_office_id, v_row - 'invoice_id', v_sub);
    EXCEPTION WHEN OTHERS THEN
      v_result := jsonb_build_object('status', 'error', 'message', SQLERRM);
    END;
    v_results := v_results || v_result;
  END LOOP;
  RETURN v_results;
END;
$$;

-- Confirms a suggested match, sets a different invoice, or (p_invoice_id NULL
-- with p_unmatch) takes the payment off its invoice.
CREATE OR REPLACE FUNCTION public.office_payment_match(p_payment_id UUID, p_invoice_id UUID DEFAULT NULL, p_unmatch BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_payment office.payments;
  v_target UUID;
BEGIN
  SELECT * INTO v_payment FROM office.payments WHERE id = p_payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM office.require_member(v_payment.office_id, ARRAY['owner', 'support']);

  IF p_unmatch THEN
    UPDATE office.payments SET invoice_id = NULL, clinic_account_id = NULL, matched_by = NULL, confirmed_at = NULL, confirmed_by = NULL
    WHERE id = p_payment_id;
    PERFORM office.settle_invoice(v_payment.invoice_id);
    RETURN jsonb_build_object('status', 'unmatched');
  END IF;

  v_target := COALESCE(p_invoice_id, v_payment.invoice_id);
  IF v_target IS NULL OR NOT EXISTS (
    SELECT 1 FROM office.invoices WHERE id = v_target AND office_id = v_payment.office_id AND status NOT IN ('void', 'draft')) THEN
    RAISE EXCEPTION 'Choose an invoice for this payment';
  END IF;

  UPDATE office.payments SET
    invoice_id = v_target,
    clinic_account_id = (SELECT clinic_account_id FROM office.invoices WHERE id = v_target),
    matched_by = CASE WHEN p_invoice_id IS NULL AND matched_by = 'auto' THEN 'auto' ELSE 'manual' END,
    confirmed_at = NOW(), confirmed_by = office.current_sub()
  WHERE id = p_payment_id;

  PERFORM office.settle_invoice(v_target);
  IF v_payment.invoice_id IS DISTINCT FROM v_target THEN PERFORM office.settle_invoice(v_payment.invoice_id); END IF;
  RETURN jsonb_build_object('status', 'matched', 'invoice_id', v_target);
END;
$$;

-- A payment recorded by mistake. Only before it has been confirmed against an invoice.
CREATE OR REPLACE FUNCTION public.office_payment_remove(p_payment_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE v_payment office.payments;
BEGIN
  SELECT * INTO v_payment FROM office.payments WHERE id = p_payment_id;
  IF v_payment.id IS NULL THEN RETURN; END IF;
  PERFORM office.require_member(v_payment.office_id, ARRAY['owner']);
  IF v_payment.confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_CONFIRMED' USING HINT = 'Unmatch it first.'; END IF;
  DELETE FROM office.payments WHERE id = p_payment_id;
  PERFORM office.audit(v_payment.office_id, 'payment.removed', 'payment', p_payment_id,
    jsonb_build_object('amount', v_payment.amount, 'reference', v_payment.reference));
END;
$$;

-- The Money screen in one call: invoices, payments waiting for a match, and
-- the earnings view (billed, collected, outstanding by month and by clinic).
CREATE OR REPLACE FUNCTION public.office_money(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner', 'support']);
  RETURN jsonb_build_object(
    'invoices', COALESCE((
      SELECT jsonb_agg(office.invoice_json(i) ORDER BY i.created_at DESC)
      FROM (SELECT * FROM office.invoices WHERE office_id = p_office_id ORDER BY created_at DESC LIMIT 200) i), '[]'::jsonb),
    'unconfirmed_payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'amount', p.amount, 'currency', p.currency, 'method', p.method, 'reference', p.reference,
        'payer_phone', p.payer_phone, 'payer_name', p.payer_name, 'paid_at', p.paid_at,
        'suggested_invoice_id', p.invoice_id,
        'suggested_invoice', (SELECT jsonb_build_object('number', i.number, 'clinic_name', a.name)
                              FROM office.invoices i JOIN office.clinic_accounts a ON a.id = i.clinic_account_id
                              WHERE i.id = p.invoice_id)) ORDER BY p.paid_at DESC)
      FROM office.payments p WHERE p.office_id = p_office_id AND p.confirmed_at IS NULL), '[]'::jsonb),
    'open_invoices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'balance', i.amount - i.amount_paid,
        'clinic_name', (SELECT name FROM office.clinic_accounts WHERE id = i.clinic_account_id)) ORDER BY i.due_date)
      FROM office.invoices i WHERE i.office_id = p_office_id AND i.status IN ('sent', 'part_paid', 'overdue')), '[]'::jsonb),
    'totals', (
      SELECT jsonb_build_object(
        'billed', COALESCE(SUM(amount), 0), 'collected', COALESCE(SUM(amount_paid), 0),
        'outstanding', COALESCE(SUM(amount - amount_paid), 0))
      FROM office.invoices WHERE office_id = p_office_id AND status NOT IN ('draft', 'void')),
    'by_month', COALESCE((
      SELECT jsonb_agg(m ORDER BY m->>'month' DESC) FROM (
        SELECT jsonb_build_object(
          'month', to_char(date_trunc('month', issue_date), 'YYYY-MM-DD'),
          'billed', SUM(amount), 'collected', SUM(amount_paid), 'outstanding', SUM(amount - amount_paid)) AS m
        FROM office.invoices WHERE office_id = p_office_id AND status NOT IN ('draft', 'void')
        GROUP BY date_trunc('month', issue_date)
        ORDER BY date_trunc('month', issue_date) DESC LIMIT 12) q), '[]'::jsonb),
    'by_clinic', COALESCE((
      SELECT jsonb_agg(c ORDER BY (c->>'outstanding')::BIGINT DESC, c->>'clinic_name') FROM (
        SELECT jsonb_build_object(
          'clinic_account_id', a.id, 'clinic_name', a.name,
          'billed', SUM(i.amount), 'collected', SUM(i.amount_paid), 'outstanding', SUM(i.amount - i.amount_paid)) AS c
        FROM office.invoices i JOIN office.clinic_accounts a ON a.id = i.clinic_account_id
        WHERE i.office_id = p_office_id AND i.status NOT IN ('draft', 'void')
        GROUP BY a.id, a.name) q), '[]'::jsonb),
    'billable', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'tier', a.tier, 'stage', a.stage) ORDER BY a.name)
      FROM office.clinic_accounts a
      WHERE a.office_id = p_office_id AND a.stage <> 'churned'
        AND (a.readiness_cleared_at IS NOT NULL OR office.stage_rank(a.stage) >= 5)), '[]'::jsonb)
  );
END;
$$;

-- Flat rows for the accountant's CSV. This is an export, not a ledger.
CREATE OR REPLACE FUNCTION public.office_money_export(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner']);
  RETURN jsonb_build_object(
    'invoices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'number', i.number, 'clinic', a.name, 'issue_date', i.issue_date, 'due_date', i.due_date,
        'period_start', i.period_start, 'currency', i.currency, 'amount', i.amount, 'amount_paid', i.amount_paid,
        'status', i.status, 'efris_reference', i.efris_reference,
        'description', (SELECT string_agg(l->>'description', '; ') FROM jsonb_array_elements(i.lines) l)) ORDER BY i.issue_date, i.number)
      FROM office.invoices i JOIN office.clinic_accounts a ON a.id = i.clinic_account_id
      WHERE i.office_id = p_office_id AND i.status <> 'draft'), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'paid_at', p.paid_at, 'method', p.method, 'reference', p.reference, 'currency', p.currency, 'amount', p.amount,
        'payer_name', p.payer_name, 'payer_phone', p.payer_phone,
        'invoice', (SELECT number FROM office.invoices WHERE id = p.invoice_id),
        'clinic', (SELECT name FROM office.clinic_accounts WHERE id = p.clinic_account_id),
        'confirmed', p.confirmed_at IS NOT NULL) ORDER BY p.paid_at)
      FROM office.payments p WHERE p.office_id = p_office_id), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION office.billing_nightly()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE i RECORD; v_n INTEGER := 0;
BEGIN
  FOR i IN
    UPDATE office.invoices SET status = 'overdue', updated_at = NOW()
    WHERE status IN ('sent', 'part_paid') AND due_date < CURRENT_DATE
    RETURNING id, office_id, clinic_account_id, number
  LOOP
    v_n := v_n + 1;
  END LOOP;
  FOR i IN SELECT id, office_id, clinic_account_id, number FROM office.invoices WHERE status = 'overdue' LOOP
    INSERT INTO office.tasks (office_id, clinic_account_id, kind, title, detail, source, dedupe_key)
    SELECT i.office_id, i.clinic_account_id, 'invoice_overdue', a.name, jsonb_build_object('number', i.number), 'alert', 'invoice_overdue:' || i.id
    FROM office.clinic_accounts a WHERE a.id = i.clinic_account_id
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ============================================================================
-- 3. Grants: milestones verified from platform data
-- ============================================================================
-- A milestone verifies only from stage events the PLATFORM recorded
-- (source = 'auto'), never from a stage a person set. Unknown keys stay
-- pending: there is no manual "mark verified".
--
-- Keys understood today (definitions and amounts for the first cohort are
-- spec open question 7; adding a key means adding a branch here):
--   first_clinic_live          one clinic reached live
--   first_clinic_steady_30d    one clinic is steady and went live 30+ days ago
--   three_clinics_billed       three clinics have a paid invoice

CREATE OR REPLACE FUNCTION office.verify_milestones(p_office_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  m RECORD;
  v_evidence JSONB;
  v_n INTEGER := 0;
BEGIN
  FOR m IN
    SELECT gm.* FROM office.grant_milestones gm JOIN office.grants g ON g.id = gm.grant_id
    WHERE g.office_id = p_office_id AND gm.status = 'pending'
  LOOP
    v_evidence := NULL;
    IF m.milestone_key = 'first_clinic_live' THEN
      SELECT jsonb_build_object('clinic', a.name, 'live_at', e.at) INTO v_evidence
      FROM office.clinic_stage_events e JOIN office.clinic_accounts a ON a.id = e.clinic_account_id
      WHERE e.office_id = p_office_id AND e.to_stage = 'live' AND e.source = 'auto'
      ORDER BY e.at LIMIT 1;

    ELSIF m.milestone_key = 'first_clinic_steady_30d' THEN
      SELECT jsonb_build_object('clinic', a.name, 'live_at', live.at, 'steady_at', steady.at) INTO v_evidence
      FROM office.clinic_accounts a
      JOIN LATERAL (SELECT MIN(at) AS at FROM office.clinic_stage_events
                    WHERE clinic_account_id = a.id AND to_stage = 'live' AND source = 'auto') live ON TRUE
      JOIN LATERAL (SELECT MIN(at) AS at FROM office.clinic_stage_events
                    WHERE clinic_account_id = a.id AND to_stage = 'steady' AND source = 'auto') steady ON TRUE
      WHERE a.office_id = p_office_id AND a.stage IN ('steady', 'billed')
        AND steady.at IS NOT NULL AND live.at <= NOW() - INTERVAL '30 days'
      ORDER BY live.at LIMIT 1;

    ELSIF m.milestone_key = 'three_clinics_billed' THEN
      SELECT jsonb_build_object('clinics', jsonb_agg(q.name), 'count', COUNT(*)) INTO v_evidence
      FROM (SELECT DISTINCT a.name FROM office.clinic_stage_events e
            JOIN office.clinic_accounts a ON a.id = e.clinic_account_id
            WHERE e.office_id = p_office_id AND e.to_stage = 'billed' AND e.source = 'auto') q
      HAVING COUNT(*) >= 3;
    END IF;

    IF v_evidence IS NOT NULL THEN
      UPDATE office.grant_milestones SET status = 'verified', verified_at = NOW(), evidence = v_evidence WHERE id = m.id;
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION office.grants_json(p_office_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = office, public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', g.id, 'total', g.total, 'currency', g.currency, 'starts_on', g.starts_on, 'notes', g.notes,
    'released', (SELECT COALESCE(SUM(amount), 0) FROM office.grant_milestones WHERE grant_id = g.id AND status = 'released'),
    'milestones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'key', m.milestone_key, 'amount', m.amount, 'status', m.status,
        'verified_at', m.verified_at, 'evidence', m.evidence, 'released_at', m.released_at,
        'release_reference', m.release_reference) ORDER BY m.amount, m.milestone_key)
      FROM office.grant_milestones m WHERE m.grant_id = g.id), '[]'::jsonb)) ORDER BY g.starts_on), '[]'::jsonb)
  FROM office.grants g WHERE g.office_id = p_office_id;
$$;

-- The owner sees their own grant and what unlocks the next tranche.
CREATE OR REPLACE FUNCTION public.office_grants(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_member(p_office_id, ARRAY['owner']);
  PERFORM office.verify_milestones(p_office_id);
  RETURN office.grants_json(p_office_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_admin_grant_create(
  p_office_id UUID, p_currency TEXT, p_starts_on DATE, p_milestones JSONB, p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_sub TEXT := office.require_central();
  v_grant UUID;
  v_m JSONB;
  v_total BIGINT := 0;
BEGIN
  IF jsonb_typeof(p_milestones) <> 'array' OR jsonb_array_length(p_milestones) = 0 THEN
    RAISE EXCEPTION 'A grant needs at least one milestone';
  END IF;
  IF p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Currency must be a 3-letter code'; END IF;
  INSERT INTO office.grants (office_id, total, currency, starts_on, notes, created_by)
  VALUES (p_office_id, 0, p_currency, COALESCE(p_starts_on, CURRENT_DATE), NULLIF(trim(p_notes), ''), v_sub)
  RETURNING id INTO v_grant;

  FOR v_m IN SELECT * FROM jsonb_array_elements(p_milestones) LOOP
    IF (v_m->>'amount')::BIGINT <= 0 THEN CONTINUE; END IF;
    INSERT INTO office.grant_milestones (grant_id, milestone_key, amount)
    VALUES (v_grant, trim(v_m->>'key'), (v_m->>'amount')::BIGINT);
    v_total := v_total + (v_m->>'amount')::BIGINT;
  END LOOP;
  IF v_total = 0 THEN RAISE EXCEPTION 'A grant needs at least one milestone with an amount'; END IF;
  UPDATE office.grants SET total = v_total WHERE id = v_grant;

  PERFORM office.audit(p_office_id, 'grant.created', 'grant', v_grant, jsonb_build_object('total', v_total, 'currency', p_currency));
  PERFORM office.verify_milestones(p_office_id);
  RETURN office.grants_json(p_office_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_admin_grants(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
BEGIN
  PERFORM office.require_central();
  PERFORM office.verify_milestones(p_office_id);
  RETURN office.grants_json(p_office_id);
END;
$$;

-- Every verified milestone across offices, waiting for release. The console's one-tap list.
CREATE OR REPLACE FUNCTION public.office_admin_milestones_ready()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE r RECORD;
BEGIN
  PERFORM office.require_central();
  FOR r IN SELECT DISTINCT office_id FROM office.grants LOOP PERFORM office.verify_milestones(r.office_id); END LOOP;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', m.id, 'key', m.milestone_key, 'amount', m.amount, 'currency', g.currency,
      'office_id', o.id, 'office_name', o.name, 'verified_at', m.verified_at, 'evidence', m.evidence) ORDER BY m.verified_at)
    FROM office.grant_milestones m JOIN office.grants g ON g.id = m.grant_id JOIN office.offices o ON o.id = g.office_id
    WHERE m.status = 'verified'), '[]'::jsonb);
END;
$$;

-- Karibu central releases a tranche. Only a milestone the platform verified can be released.
CREATE OR REPLACE FUNCTION public.office_admin_milestone_release(p_milestone_id UUID, p_reference TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  v_sub TEXT := office.require_central();
  v_m office.grant_milestones;
  v_office UUID;
BEGIN
  SELECT * INTO v_m FROM office.grant_milestones WHERE id = p_milestone_id FOR UPDATE;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Milestone not found' USING ERRCODE = 'P0002'; END IF;
  IF v_m.status <> 'verified' THEN
    RAISE EXCEPTION 'MILESTONE_NOT_VERIFIED' USING HINT = 'Karibu has not observed this milestone yet.';
  END IF;
  SELECT office_id INTO v_office FROM office.grants WHERE id = v_m.grant_id;

  UPDATE office.grant_milestones
  SET status = 'released', released_at = NOW(), released_by = v_sub, release_reference = NULLIF(trim(p_reference), '')
  WHERE id = p_milestone_id;
  PERFORM office.audit(v_office, 'grant.released', 'grant_milestone', p_milestone_id,
    jsonb_build_object('key', v_m.milestone_key, 'amount', v_m.amount, 'reference', p_reference, 'evidence', v_m.evidence));
  RETURN office.grants_json(v_office);
END;
$$;

-- ============================================================================
-- 4. Nightly job
-- ============================================================================
-- One entry point for the scheduler (Inngest cron in apps/web, which already
-- holds the service role). Service role only.

CREATE OR REPLACE FUNCTION public.office_run_nightly()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = office, public, pg_temp
AS $$
DECLARE
  r RECORD;
  v_health INTEGER; v_overdue INTEGER; v_verified INTEGER := 0;
BEGIN
  IF NOT karibu_is_service_role() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  v_health := office.health_nightly();
  v_overdue := office.billing_nightly();
  FOR r IN SELECT id FROM office.offices WHERE status <> 'closed' LOOP
    PERFORM office.ensure_fee_periods(r.id);
    v_verified := v_verified + office.verify_milestones(r.id);
  END LOOP;
  RETURN jsonb_build_object('clinics_scored', v_health, 'invoices_marked_overdue', v_overdue, 'milestones_verified', v_verified);
END;
$$;

SELECT office.apply_rpc_grants(
  p_anon => ARRAY['office_public_profile', 'office_public_slugs', 'office_readiness_form',
                  'office_readiness_submit', 'office_readiness_add_photo',
                  'office_storage_readiness_can_write', 'office_invoice_public'],
  p_service_only => ARRAY['office_capture_lead', 'office_run_nightly']
);
