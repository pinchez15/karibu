// Database Types for Karibu Health
// Dictation-first product: clinician dictates after the visit, AI structures
// the dictation into a SOAP note with citations, clinician reviews + prints.
// No ambient audio capture, no DPPA cross-border consent flow, no audio storage.

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
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  clerk_user_id: string;
  clinic_id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'doctor' | 'nurse';
  is_active: boolean;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
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
}

export interface VisitWithPatient extends Visit {
  patient: Patient;
}

export type NoteStatus = 'draft' | 'finalized';

export interface ProviderNote {
  id: string;
  visit_id: string;
  // Raw dictation transcript from Whisper. Short-form (typically <3 min of
  // audio). The audio itself is never persisted — only this text.
  transcript: string | null;
  // SOAP-formatted note structured by the AI assistant from the transcript.
  note_content: string | null;
  structured_data: Record<string, unknown>;
  status: NoteStatus;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  finalized_by: string | null;
}

export interface PatientNote {
  id: string;
  visit_id: string;
  content: string | null;
  language: string;
  status: NoteStatus;
  created_at: string;
  updated_at: string;
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
// PAYMENTS
// =============================================

export type PaymentMethod = 'cash' | 'mtn_momo' | 'airtel_money';
export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'waived';

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
