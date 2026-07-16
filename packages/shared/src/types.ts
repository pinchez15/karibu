// Database Types for Karibu Health
// Dictation-first product: clinician dictates after the visit, AI structures
// the dictation into a SOAP note with citations, clinician reviews + prints.
// No ambient audio capture, no DPPA cross-border consent flow, no audio storage.

import type { LabTestResultRow } from './lab-queue';

/** OPD worklist filter keys — mirrors clinics.workflow_config.default_opd_filters. */
export type OpdPatientFilter =
  | 'waiting'
  | 'needs_vitals'
  | 'with_clinician'
  | 'awaiting_labs'
  | 'results_ready'
  | 'pharmacy_returned'
  | 'at_pharmacy'
  | 'done_today';

/** Per-clinic operational UI config (migration 048). */
export interface ClinicWorkflowConfig {
  default_opd_filters: OpdPatientFilter[];
  prominent_departments: VisitDepartment[];
  show_physical_queue_filter: boolean;
  enabled_protocol_slugs: string[];
}

export interface Clinic {
  id: string;
  name: string;
  slug: string;
  clerk_organization_id: string | null;
  // Letterhead fields for printed patient notes (added 2026-04-09)
  phone: string | null;
  umdpc_number: string | null;
  timezone: string;
  is_active: boolean;
  workflow_config: ClinicWorkflowConfig;
  created_at: string;
  updated_at: string;
}

// Mirrors the staff_role_check constraint in
// packages/supabase/migrations/024_hc3_roles_and_departments.sql.
export type StaffRole =
  | 'admin'
  | 'doctor'
  | 'nurse'
  | 'clinical_officer'
  | 'midwife'
  | 'nursing_assistant'
  | 'records_officer'
  | 'lab_tech'
  | 'dispenser';

export interface Staff {
  id: string;
  clerk_user_id: string;
  clinic_id: string;
  email: string;
  display_name: string;
  role: StaffRole;
  is_active: boolean;
  deactivated_at: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** KaribuEHR Onboarding module — cross-role training before real patients. */
export interface OnboardingModule {
  id: string;
  title: string;
  subtitle: string;
  simulated_role: StaffRole;
  sort_order: number;
  case_id: string;
  pack_id: string;
  coach_intro: string;
  android_primary: boolean;
  web_bonus?: string;
}

export interface OnboardingManifest {
  version: number;
  title: string;
  subtitle: string;
  modules: OnboardingModule[];
}

export interface OnboardingModuleProgress {
  module_id: string;
  completed_at: string;
  score: number | null;
  total: number | null;
}

export interface OnboardingStatus {
  completed: boolean;
  completed_at: string | null;
  required_modules: string[];
  progress: OnboardingModuleProgress[];
}

export interface Patient {
  id: string;
  clinic_id: string;
  patient_id: number | null;
  patient_number: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  // Column kept named whatsapp_number for backwards compat with the original
  // schema; semantically it is just the patient's phone number now.
  whatsapp_number: string | null;
  date_of_birth: string | null;
  sex: 'M' | 'F' | null;
  created_at: string;
  updated_at: string;
}

// Visit lifecycle:
//   pending   -> visit created, waiting for clinician dictation
//   review    -> dictation done, AI structured note ready for clinician review
//   sent      -> clinician approved + printed
//   completed -> payment recorded, visit closed
//   error     -> AI structuring failed, clinician can retry
export type VisitStatus =
  | 'pending'
  | 'review'
  | 'sent'
  | 'completed'
  | 'error';

export type QueueStatus =
  | 'waiting'
  | 'with_nurse'
  | 'ready_for_doctor'
  | 'with_doctor'
  | 'completed'
  | 'cancelled';

export type VisitPriority = 'low' | 'normal' | 'high' | 'urgent';

export type ReviewStatus = 'pending' | 'pending_review' | 'reviewed' | 'rejected';

export type VisitDepartment =
  | 'opd'
  | 'anc'
  | 'maternity'
  | 'family_planning'
  | 'immunization';

export interface Visit {
  id: string;
  clinic_id: string;
  patient_id: string;
  doctor_id: string | null;
  nurse_id: string | null;
  status: VisitStatus;
  queue_status: QueueStatus;
  queue_position: number | null;
  priority: VisitPriority;
  chief_complaint: string | null;
  checked_in_at: string | null;
  department: VisitDepartment;
  // Clinician review of AI-generated content
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  // Clinical data
  diagnosis: string | null;
  medications: string | null;
  follow_up_instructions: string | null;
  tests_ordered: string | null;
  visit_date: string;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  error_message: string | null;
  error_at: string | null;
  // Documentation completion (independent of AI/review state).
  // True once the clinician taps Save in the offline-first flow.
  documentation_complete: boolean;
  documentation_completed_at: string | null;
  // AI structuring lifecycle — independent of `status`. Driven by the Inngest
  // poll-ai-queue scheduler; AI augments the clinician's note rather than
  // gating clinical workflow.
  ai_structure_status:
    | 'not_started'
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'skipped';
  ai_structure_started_at: string | null;
  ai_structure_completed_at: string | null;
  ai_structure_error: string | null;
  ai_structure_attempts: number;
  // Pharmacy MVP — workflow state for dispensing the clinician's `medications`
  // text. Set by the dispenser via /dashboard/pharmacy actions.
  dispensing_status: 'not_started' | 'in_progress' | 'dispensed' | 'partial' | 'out_of_stock' | 'returned';
  dispense_notes: string | null;
  dispensed_at: string | null;
  dispensed_by: string | null;
  pharmacy_order_submitted_at: string | null;
  pharmacy_order_submitted_by: string | null;
  // Lab MVP — workflow state for completing the clinician's `tests_ordered`
  // text. Set by the lab tech via /dashboard/lab actions.
  lab_status: 'not_ordered' | 'pending' | 'running' | 'done' | 'abnormal';
  lab_results: string | null;
  lab_test_results?: LabTestResultRow[] | null;
  lab_abnormal: boolean;
  lab_completed_at: string | null;
  lab_completed_by: string | null;
}

export interface VisitWithPatient extends Visit {
  patient: Patient;
}

// Provider note lifecycle (migrations 039 + 044):
//   draft    -> autosaved or manually-saved work-in-progress
//   signed   -> clinician attested as the clinical record. finalized_at/by
//               retain the "signed" timestamps (column name kept for
//               backwards compatibility — renaming would churn every caller).
//   cosigned -> attending physician counter-signed a mid-level provider's
//               note via rpc_cosign_provider_note. requires_cosign=false.
//   addended -> one or more provider_note_addendums rows attached; original
//               text preserved per the medical-records convention.
//   amended  -> previously-signed note rewritten via rpc_amend_provider_note.
//               Prior versions live in provider_note_amendments.
//   voided   -> previously-signed note withdrawn via rpc_void_provider_note.
export type ProviderNoteStatus =
  | 'draft'
  | 'signed'
  | 'cosigned'
  | 'addended'
  | 'amended'
  | 'voided';

// patient_notes still uses the original draft/finalized lifecycle — see
// 001_initial_schema.sql. Kept as a separate type to avoid implying the two
// tables share a status enum (they don't).
export type NoteStatus = 'draft' | 'finalized';

// Discriminator for the clinical activity that produced a provider_note
// (migration 039). 'visit' covers the legacy visit-tied path.
export type ProviderNoteSource =
  | 'visit'
  | 'phone_call'
  | 'follow_up'
  | 'lab_update'
  | 'pharmacy_update'
  | 'general';

export interface ProviderNote {
  id: string;
  // Patient is the durable link (NOT NULL post-039).
  patient_id: string;
  // Visit is optional (nullable post-039). Standalone notes — phone follow-ups,
  // lab updates, pharmacy annotations — leave this null.
  visit_id: string | null;
  // Raw dictation transcript from Whisper. Short-form (typically <3 min of
  // audio). The audio itself is never persisted — only this text.
  transcript: string | null;
  // SOAP-formatted note structured by the AI assistant from the transcript.
  note_content: string | null;
  structured_data: Record<string, unknown>;
  status: ProviderNoteStatus;
  source: ProviderNoteSource;
  created_at: string;
  updated_at: string;
  // Set by rpc_upsert_provider_note on first INSERT (migration 042) and
  // preserved on subsequent autosaves. Drives the my-drafts worklist filter.
  // Nullable for legacy rows that pre-date the migration.
  created_by: string | null;
  // Kept named finalized_* — semantically these are now the "signed at/by"
  // timestamps. Renaming would cascade across every Android + web caller.
  finalized_at: string | null;
  finalized_by: string | null;
  amended_at: string | null;
  amended_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  // Cosign lifecycle (migration 044). Mid-level signers (nurse,
  // nursing_assistant) flip requires_cosign=true on sign; an attending
  // (doctor/clinical_officer/admin/midwife) then calls rpc_cosign_provider_note
  // which sets status='cosigned' and clears the flag.
  requires_cosign: boolean;
  cosigned_at: string | null;
  cosigned_by: string | null;
}

// Append-only addendum to a signed note (migration 044). The parent note's
// text is never modified — each addendum is its own audit row.
export interface ProviderNoteAddendum {
  id: string;
  parent_note_id: string;
  clinic_id: string;
  patient_id: string;
  visit_id: string | null;
  addendum_text: string;
  created_by: string;
  created_at: string;
}

// History row written by rpc_amend_provider_note before the parent's
// transcript/note_content is overwritten. Lets the timeline render the
// version that existed prior to each amendment.
export interface ProviderNoteAmendment {
  id: string;
  parent_note_id: string;
  clinic_id: string;
  patient_id: string;
  prior_transcript: string | null;
  prior_note_content: string | null;
  new_transcript: string | null;
  new_note_content: string | null;
  reason: string;
  amended_by: string;
  amended_at: string;
}

export type PatientNoteSource = 'ai_generated' | 'clinician_fallback';

export interface PatientNote {
  id: string;
  visit_id: string;
  content: string | null;
  language: string;
  status: NoteStatus;
  // 'clinician_fallback' = raw transcript saved by the clinician at point-of-care.
  // 'ai_generated' = polished summary produced by the structure-dictation Inngest
  // workflow. AI is allowed to overwrite a clinician_fallback row; the inverse
  // is forbidden by rpc_upsert_patient_note_summary.
  source: PatientNoteSource;
  created_at: string;
  updated_at: string;
}

export interface PatientVitals {
  id: string;
  patient_id: string;
  visit_id: string | null;
  recorded_at: string;
  recorded_by: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  temp_c: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  pulse_bpm: number | null;
  resp_rate: number | null;
  spo2_pct: number | null;
  muac_cm: number | null;
  notes: string | null;
  created_at: string;
}

// =============================================
// PATIENT TIMELINE (migration 040 — Phase 3)
// =============================================
//
// rpc_get_patient_timeline returns a chronologically-ordered union of
// {visit | note | vital | payment} events for one patient. event_data
// shape is fixed per event_type; mirror the jsonb_build_object() calls
// in packages/supabase/migrations/040_patient_timeline.sql.

export type PatientTimelineEventType = 'visit' | 'note' | 'vital' | 'payment' | 'task';

// care_tasks.task_type / status — must match migration 041 CHECK constraints.
export type CareTaskType =
  | 'lab_followup'
  | 'phone_callback'
  | 'home_visit'
  | 'medication_review'
  | 'referral_followup'
  | 'general';

export type CareTaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export interface VisitEventData {
  visit_id: string;
  status: VisitStatus;
  queue_status: QueueStatus;
  department: VisitDepartment;
  chief_complaint: string | null;
  diagnosis: string | null;
  medications: string | null;
  follow_up_instructions: string | null;
  tests_ordered: string | null;
  dispensing_status: string | null;
  lab_status: string | null;
  lab_abnormal: boolean | null;
  pharmacy_order_submitted_at?: string | null;
  documentation_complete: boolean;
  visit_date: string;
  doctor_id: string | null;
}

export interface NoteEventData {
  note_id: string;
  visit_id: string | null;
  status: ProviderNoteStatus;
  source: ProviderNoteSource;
  transcript_preview: string;
  has_transcript: boolean;
  signed_at: string | null;
  signed_by: string | null;
  amended_at: string | null;
  updated_at: string;
}

export interface VitalEventData {
  vital_id: string;
  visit_id: string | null;
  recorded_by: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  temp_c: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  pulse_bpm: number | null;
  resp_rate: number | null;
  spo2_pct: number | null;
  muac_cm: number | null;
  notes: string | null;
}

export interface PaymentEventData {
  payment_id: string;
  visit_id: string | null;
  amount_ugx: number;
  payment_method: PaymentMethod;
  receipt_number: string | null;
  service_type: string | null;
  status: PaymentStatus;
  collected_by: string | null;
}

// Migration 042 — care_tasks projected onto the patient timeline. Cancelled
// tasks are filtered out at the RPC layer so the UI never has to render them.
export interface TaskEventData {
  task_id: string;
  visit_id: string | null;
  task_type: CareTaskType;
  title: string;
  description: string | null;
  assignee_role: StaffRole | null;
  assignee_id: string | null;
  due_at: string | null;
  status: CareTaskStatus;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
}

export type PatientTimelineEvent =
  | { event_type: 'visit'; event_at: string; event_id: string; event_data: VisitEventData }
  | { event_type: 'note'; event_at: string; event_id: string; event_data: NoteEventData }
  | { event_type: 'vital'; event_at: string; event_id: string; event_data: VitalEventData }
  | { event_type: 'payment'; event_at: string; event_id: string; event_data: PaymentEventData }
  | { event_type: 'task'; event_at: string; event_id: string; event_data: TaskEventData };

// rpc_get_patient_latest_vitals — single row with per-field most recent
// non-null value + its recorded_at timestamp.
export interface PatientLatestVitals {
  weight_kg: number | null;
  weight_kg_at: string | null;
  height_cm: number | null;
  height_cm_at: string | null;
  temp_c: number | null;
  temp_c_at: string | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  bp_at: string | null;
  pulse_bpm: number | null;
  pulse_bpm_at: string | null;
  resp_rate: number | null;
  resp_rate_at: string | null;
  spo2_pct: number | null;
  spo2_pct_at: string | null;
  muac_cm: number | null;
  muac_cm_at: string | null;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_clerk_id: string | null;
  actor_type: 'staff' | 'patient' | 'system';
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  patient_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

// API Request/Response Types

export interface CreatePatientRequest {
  first_name: string;
  last_name: string;
  whatsapp_number?: string;
  date_of_birth?: string;
  sex?: 'M' | 'F';
}

export interface CreateVisitRequest {
  patient_id: string;
  diagnosis?: string;
  medications?: string;
  follow_up_instructions?: string;
  tests_ordered?: string;
}

export interface UpdateVisitRequest {
  diagnosis?: string;
  medications?: string;
  follow_up_instructions?: string;
  tests_ordered?: string;
}

export interface UpdateProviderNoteRequest {
  note_content: string;
}

export interface UpdatePatientNoteRequest {
  content: string;
}

export interface FinalizeVisitResponse {
  visit: Visit;
  provider_note: ProviderNote;
  patient_note: PatientNote;
  print_url: string;
}

/** Input for rpc_finalize_clinical_encounter (migration 048). */
export interface FinalizeClinicalEncounter {
  note_id: string;
  visit_id: string;
  patient_id: string;
  transcript: string;
  patient_summary: string;
  diagnosis?: string | null;
  medications?: string | null;
  follow_up_instructions?: string | null;
  tests_ordered?: string | null;
  structured_data?: string | null;
  client_op_id?: string | null;
}

/** Lab or formulary row from rpc_get_clinic_catalog. */
export interface ClinicCatalogLabItem {
  test_name: string;
  code: string | null;
  category: string | null;
  display_order: number;
  is_available: boolean;
  notes: string | null;
}

export interface ClinicCatalogFormularyItem {
  drug_name: string;
  code: string | null;
  category: string | null;
  display_order: number;
  is_available: boolean;
  notes: string | null;
  aliases?: string[];
  strengths?: string[];
  default_frequency?: string | null;
  default_route?: string | null;
  warning_text?: string | null;
  formulation?: string | null;
  quantity_unit?: string | null;
}

export interface ClinicCatalog {
  labs: ClinicCatalogLabItem[];
  formulary: ClinicCatalogFormularyItem[];
}

export type AdmissionStatus = 'active' | 'discharged' | 'transferred';

export interface Admission {
  id: string;
  clinic_id: string;
  patient_id: string;
  admitted_at: string;
  discharged_at: string | null;
  ward_label: string | null;
  chief_complaint: string | null;
  status: AdmissionStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicalProtocolStep {
  type: string;
  title?: string;
  assignee_role?: StaffRole;
}

export interface ClinicalProtocolDefinition {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  trigger_hint: string | null;
  steps: ClinicalProtocolStep[];
  lab_bundle: string[] | null;
  isolation_required: boolean;
  active: boolean;
  created_at: string;
}

export type ProtocolActivationStatus = 'active' | 'completed' | 'cancelled';

export interface ProtocolActivation {
  id: string;
  clinic_id: string;
  patient_id: string;
  visit_id: string | null;
  protocol_id: string;
  status: ProtocolActivationStatus;
  activated_by: string;
  activated_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Row from rpc_get_opd_patients_today (migration 048; extended in 094 with
 * today's number, arrival timestamp, priority, and wait so the patient-first
 * list can render "#23", the urgent-first-then-arrival order, and the wait).
 */
export interface OpdPatientRow {
  patient_id: string;
  patient_name: string | null;
  sex: 'M' | 'F' | null;
  derived_age: number | null;
  visit_id: string;
  chief_complaint: string | null;
  queue_status: QueueStatus;
  /** Today's number — per clinic, per day, assigned at check-in (WP2). */
  queue_position: number | null;
  priority: VisitPriority;
  checked_in_at: string | null;
  wait_minutes: number | null;
  lab_status: Visit['lab_status'];
  dispensing_status: Visit['dispensing_status'];
  documentation_complete: boolean;
  pharmacy_order_submitted_at: string | null;
  note_status: ProviderNoteStatus | null;
  visit_date: string;
}

/** Progressive AI assist tier on ai_review_suggestions (migration 048). */
export type AiReviewPhase = 'draft' | 'pre_sign' | 'post_sign';

export interface AiReviewSuggestion {
  id: string;
  visit_id: string;
  clinic_id: string;
  suggestion_type: 'ask_lab' | 'ask_dx' | 'ask_med' | 'ask_history' | 'ask_red_flag';
  question: string;
  reasoning: string;
  citation_ids: number[];
  confidence: 'high' | 'medium' | 'low';
  phase: AiReviewPhase;
  clinician_response: 'considered_proceeded' | 'reopened_note' | 'dismissed' | null;
  responded_at: string | null;
  responded_by: string | null;
  created_at: string;
}

// Queue Types

export interface QueueItem {
  visit_id: string;
  patient_id: string;
  patient_name: string | null;
  patient_phone: string;
  queue_position: number;
  queue_status: QueueStatus;
  priority: VisitPriority;
  chief_complaint: string | null;
  checked_in_at: string;
  nurse_id: string | null;
  nurse_name: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  wait_minutes: number;
}

export interface CheckInRequest {
  patient_id: string;
  chief_complaint?: string;
  priority?: VisitPriority;
}

// HMIS 105 Reporting Types

export interface HmisDiagnosisCode {
  id: number;
  hmis_code: string;
  category: string;
  subcategory: string | null;
  display_name: string;
  icd10_codes: string[];
  sort_order: number;
  is_active: boolean;
}

export interface VisitDiagnosisCode {
  id: string;
  visit_id: string;
  hmis_code_id: number;
  confidence: number | null;
  source: 'ai' | 'manual' | 'ai_confirmed';
  coded_by: string | null;
  coded_at: string;
  hmis_diagnosis_code?: HmisDiagnosisCode;
}

export interface Hmis105Row {
  hmis_code: string;
  display_name: string;
  sort_order: number;
  male_0_28d: number;
  female_0_28d: number;
  male_29d_4y: number;
  female_29d_4y: number;
  male_5_14y: number;
  female_5_14y: number;
  male_15_59y: number;
  female_15_59y: number;
  male_60plus: number;
  female_60plus: number;
  total: number;
}

export interface Hmis105Report {
  clinic_name: string;
  year: number;
  month: number;
  generated_at: string;
  rows: Hmis105Row[];
  quality: DataQualityStats;
}

export interface DataQualityStats {
  total_visits: number;
  coded_visits: number;
  uncoded_visits: number;
  missing_sex: number;
  missing_dob: number;
  total_patients: number;
}

// Multi-clinic HMIS 105 Analytics Types

export interface ClinicOption {
  id: string;
  name: string;
}

export interface Hmis105SingleReport {
  clinic_id: string;
  clinic_name: string;
  year: number;
  month: number;
  rows: Hmis105Row[];
  quality: DataQualityStats;
}

export interface Hmis105SummaryRow {
  hmis_code: string;
  display_name: string;
  sort_order: number;
  clinic_totals: Record<string, number>; // clinic_id → total
  grand_total: number;
}

export interface Hmis105TrendPoint {
  year: number;
  month: number;
  total: number;
}

export interface Hmis105TrendRow {
  hmis_code: string;
  display_name: string;
  points: Hmis105TrendPoint[];
  max_total: number;
}

export interface Hmis105MultiReport {
  reports: Hmis105SingleReport[];
  clinics: ClinicOption[];
  date_range: {
    start_year: number;
    start_month: number;
    end_year: number;
    end_month: number;
  };
  aggregated_quality: DataQualityStats;
  generated_at: string;
}

// =============================================
// HMIS 106a HIV / TB (DHIS2 quarterly)
// =============================================

export type Hmis106aSection = 'hct' | 'art' | 'casefinding' | 'outcomes' | 'tpt';

export interface Hmis106aRow {
  element_code: string;
  section: Hmis106aSection;
  display_name: string;
  sort_order: number;
  male_under_2: number;
  female_under_2: number;
  male_2_4: number;
  female_2_4: number;
  male_5_14: number;
  female_5_14: number;
  male_15_49: number;
  female_15_49: number;
  male_50_plus: number;
  female_50_plus: number;
  total: number;
}

export interface Hmis106aReport {
  clinic_id: string;
  clinic_name: string;
  report: 'hiv' | 'tb';
  fy_start_year: number;
  quarter: number;
  quarter_label: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  rows: Hmis106aRow[];
  quality: Hmis106aQualityStats;
}

export interface Hmis106aQualityStats {
  hts_events_in_period: number;
  hiv_enrollments_active: number;
  tb_episodes_active: number;
  missing_sex_patients: number;
}

// =============================================
// PAYMENTS
// =============================================

export type PaymentMethod = 'cash' | 'mtn_momo' | 'airtel_money';
export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'waived';

// =============================================
// STRUCTURED PHARMACY (migration 064)
// =============================================

export type PrescriptionOrderStatus =
  | 'ordered'
  | 'dispensing'
  | 'dispensed'
  | 'partially_dispensed'
  | 'out_of_stock'
  | 'cancelled'
  | 'needs_clarification';

/**
 * Source as STORED on a row (read model). Legacy/historical rows may carry
 * `ai_suggested`/`manual_confirmed`, which the DB CHECK retains for back-compat.
 * NOTE: these two are NOT writable — the RPC gate (migration 107) rejects any
 * submit whose source is not in {manual, legacy_text}. Use PrescriptionSourceInput
 * for anything a client constructs.
 */
export type PrescriptionSource = 'manual' | 'manual_confirmed' | 'ai_suggested' | 'legacy_text';

/**
 * The only sources a client may submit (§0 invariant — AI has recording power,
 * not prescribing power). `legacy_text` is server-assigned to the free-text
 * fallback path; composer/picker always emit `manual`.
 */
export type PrescriptionSourceInput = 'manual' | 'legacy_text';

export type DispenseLineStatus = 'dispensed' | 'partially_dispensed' | 'out_of_stock';

// PHARM-4 structured prescribing enums (canonical values live in
// packages/shared/src/pharmacy-catalog.ts as runtime const arrays).
export type PrescriptionFrequencyCode =
  | 'OD' | 'BID' | 'TID' | 'QID' | 'Q4H' | 'Q6H' | 'Q8H' | 'Q12H'
  | 'HS' | 'STAT' | 'PRN' | 'AC' | 'PC';
export type PrescriptionDoseUnit = 'mg' | 'mL' | 'tab' | 'cap' | 'drop' | 'puff';
export type PrescriptionDispenseUnit =
  | 'tab' | 'cap' | 'mL' | 'bottle' | 'inhaler' | 'sachet' | 'vial' | 'drop' | 'puff' | 'dose';
export type PrescriptionOrderMode = 'scheduled' | 'fixed_quantity';
export type PrescriptionQuantitySource = 'computed' | 'overridden';

export interface PrescriptionOrderLine {
  id: string;
  visit_id: string;
  clinic_id: string;
  patient_id: string;
  sort_order: number;
  medication_code: string | null;
  free_text_name: string | null;
  // Derived text (for print/summary) — assembled from the structured fields
  // below by migration 107; source of truth is the structured columns.
  dose_text: string | null;
  route_text: string | null;
  frequency_text: string | null;
  duration_text: string | null;
  quantity_prescribed: number | null;
  quantity_unit: string | null;
  // --- PHARM-4 structured fields (migration 107; nullable for legacy rows) ---
  frequency_code?: PrescriptionFrequencyCode | null;
  frequency_per_day?: number | null;
  duration_days?: number | null;
  dose_amount?: number | null;
  dose_unit?: PrescriptionDoseUnit | null;
  strength_amount?: number | null;
  strength_unit?: string | null;
  form?: string | null;
  order_mode?: PrescriptionOrderMode | null;
  quantity_source?: PrescriptionQuantitySource | null;
  dispense_unit?: PrescriptionDispenseUnit | null;
  status: PrescriptionOrderStatus;
  source: PrescriptionSource;
  ordered_by: string | null;
  ordered_at: string;
  notes: string | null;
  /**
   * Sum of prescribed-equivalent quantity already recorded for this line
   * (dispensed + partially_dispensed records). Populated by the pharmacy
   * station query (web) and by the `prescription_orders_with_dispensed` view
   * (Android pull path, migration 107) so the worksheet can default a
   * re-dispense to the REMAINING quantity and show "already dispensed X of Y".
   * Optional: undefined means "not loaded / 0".
   */
  quantity_dispensed_so_far?: number | null;
}

export interface PrescriptionLineInput {
  medication_code?: string | null;
  free_text_name?: string | null;
  // Derived text — optional on input; the RPC re-derives from structured fields.
  dose_text?: string | null;
  route_text?: string | null;
  frequency_text?: string | null;
  duration_text?: string | null;
  quantity_prescribed?: number | null;
  quantity_unit?: string | null;
  // --- PHARM-4 structured input fields ---
  frequency_code?: PrescriptionFrequencyCode | null;
  duration_days?: number | null;
  dose_amount?: number | null;
  dose_unit?: PrescriptionDoseUnit | null;
  strength_amount?: number | null;
  strength_unit?: string | null;
  form?: string | null;
  order_mode?: PrescriptionOrderMode | null;
  quantity_source?: PrescriptionQuantitySource | null;
  dispense_unit?: PrescriptionDispenseUnit | null;
  notes?: string | null;
  /** Human sources only — the RPC rejects anything else (§0 invariant). */
  source?: PrescriptionSourceInput;
}

export interface CompleteDispenseLineInput {
  prescription_order_id: string;
  line_status: DispenseLineStatus;
  quantity_dispensed?: number | null;
  quantity_unit?: string | null;
  stock_item_id?: string | null;
  stock_quantity?: number | null;
  batch_number?: string | null;
  substitute_medication_code?: string | null;
  notes?: string | null;
}

export type GuardianRelationship =
  | 'mother'
  | 'father'
  | 'husband'
  | 'wife'
  | 'relative'
  | 'neighbor';

// WP1 (D1): Waiting + In progress are merged into one "To dispense" tab so a
// multi-line script stays on the same tab until every line is resolved.
// PHARM-5: a partial visit (some lines dispensed, a balance still owed) lives
// in its own "Partial" tab so it appears in exactly one place and stays
// actionable ("dispense the rest"). "Done today" holds fully-dispensed visits.
// See apps/web/.../pharmacy/pharmacy-data.ts.
export type PharmacyQueueTab =
  | 'to_dispense'
  | 'partial'
  | 'returned_to_clinician'
  | 'done_today';

export interface Payment {
  id: string;
  visit_id: string;
  clinic_id: string;
  patient_id: string;
  amount_ugx: number;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  receipt_number: string;
  service_type: string | null;
  notes: string | null;
  collected_by: string;
  created_at: string;
  updated_at: string;
}

export interface RecordPaymentRequest {
  visit_id: string;
  amount_ugx: number;
  payment_method: PaymentMethod;
  service_type?: string;
  notes?: string;
  waived?: boolean;
}
