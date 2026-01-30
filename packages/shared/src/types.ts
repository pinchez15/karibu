// Database Types for Karibu Health Demo MVP

export interface Clinic {
  id: string;
  name: string;
  slug: string;
  clerk_organization_id: string | null;
  whatsapp_phone_number: string | null;
  whatsapp_business_account_id: string | null;
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
  whatsapp_number: string;
  display_name: string | null;
  date_of_birth: string | null;
  created_at: string;
  updated_at: string;
}

export type VisitStatus =
  | 'recording'
  | 'uploading'
  | 'processing'
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
  consent_recording: boolean;
  consent_timestamp: string | null;
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

export type AudioUploadStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'transcribing'
  | 'completed'
  | 'failed';

export interface AudioUpload {
  id: string;
  visit_id: string;
  storage_path: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  mime_type: string;
  uploaded_at: string | null;
  transcription_started_at: string | null;
  transcription_completed_at: string | null;
  status: AudioUploadStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type NoteStatus = 'draft' | 'finalized';

export interface ProviderNote {
  id: string;
  visit_id: string;
  transcript: string | null;
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

export interface MagicLink {
  id: string;
  patient_id: string;
  visit_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_type: 'staff' | 'patient' | 'system';
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface MessageLog {
  id: string;
  patient_id: string | null;
  visit_id: string | null;
  direction: 'inbound' | 'outbound';
  channel: 'whatsapp' | 'sms';
  message_type: string | null;
  content_summary: string | null;
  external_id: string | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  created_at: string;
}

// API Request/Response Types

export interface CreatePatientRequest {
  whatsapp_number: string;
  display_name?: string;
}

export interface CreateVisitRequest {
  patient_id: string;
  consent_recording: boolean;
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
  magic_link_url: string;
  whatsapp_sent: boolean;
}

// Offline Sync Types

export interface SyncQueueItem {
  id: string;
  type: 'create_patient' | 'create_visit' | 'update_visit' | 'upload_audio';
  data: unknown;
  created_at: string;
  attempts: number;
  last_error?: string;
}

export interface LocalVisit extends Visit {
  local_id: string;
  synced: boolean;
  audio_local_path?: string;
  audio_uploaded: boolean;
}

// Patient Note Page Types (for magic link access)

export interface PatientNotePageData {
  clinic_name: string;
  visit_date: string;
  patient_name: string | null;
  content: string;
  diagnosis?: string;
  medications?: string;
  follow_up_instructions?: string;
  tests_ordered?: string;
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
