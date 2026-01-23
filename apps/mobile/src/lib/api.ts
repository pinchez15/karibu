import { supabase } from './supabase';
import { DEMO_CLINIC_ID } from '@karibu/shared';
import type {
  Patient,
  Visit,
  ProviderNote,
  PatientNote,
  AudioUpload,
  CreatePatientRequest,
  CreateVisitRequest,
  UpdateVisitRequest,
  Staff,
} from '@karibu/shared';

// Staff / Auth

export async function getOrCreateStaff(clerkUserId: string, email: string, displayName: string): Promise<Staff> {
  // First try to get existing staff
  const { data: existing } = await supabase
    .from('staff')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .single();

  if (existing) {
    return existing as Staff;
  }

  // Create new staff linked to demo clinic
  const { data: created, error } = await supabase
    .from('staff')
    .insert({
      clerk_user_id: clerkUserId,
      clinic_id: DEMO_CLINIC_ID,
      email,
      display_name: displayName,
      role: 'doctor',
    })
    .select()
    .single();

  if (error) throw error;
  return created as Staff;
}

// Patients

export async function lookupPatient(whatsappNumber: string): Promise<Patient | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('clinic_id', DEMO_CLINIC_ID)
    .eq('whatsapp_number', whatsappNumber)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data as Patient | null;
}

export async function createPatient(request: CreatePatientRequest): Promise<Patient> {
  const { data, error } = await supabase
    .from('patients')
    .insert({
      clinic_id: DEMO_CLINIC_ID,
      whatsapp_number: request.whatsapp_number,
      display_name: request.display_name || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Patient;
}

export async function getOrCreatePatient(
  whatsappNumber: string,
  displayName?: string
): Promise<Patient> {
  const existing = await lookupPatient(whatsappNumber);
  if (existing) return existing;
  return createPatient({ whatsapp_number: whatsappNumber, display_name: displayName });
}

// Visits

export async function createVisit(
  patientId: string,
  doctorId: string,
  consentRecording: boolean
): Promise<Visit> {
  const { data, error } = await supabase
    .from('visits')
    .insert({
      clinic_id: DEMO_CLINIC_ID,
      patient_id: patientId,
      doctor_id: doctorId,
      status: 'recording',
      consent_recording: consentRecording,
      consent_timestamp: consentRecording ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Visit;
}

export async function getVisit(visitId: string): Promise<Visit | null> {
  const { data, error } = await supabase
    .from('visits')
    .select('*')
    .eq('id', visitId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data as Visit | null;
}

export async function updateVisit(visitId: string, updates: UpdateVisitRequest): Promise<Visit> {
  const { data, error } = await supabase
    .from('visits')
    .update(updates)
    .eq('id', visitId)
    .select()
    .single();

  if (error) throw error;
  return data as Visit;
}

export async function updateVisitStatus(visitId: string, status: Visit['status']): Promise<Visit> {
  const { data, error } = await supabase
    .from('visits')
    .update({ status })
    .eq('id', visitId)
    .select()
    .single();

  if (error) throw error;
  return data as Visit;
}

export async function getRecentVisits(doctorId: string, limit: number = 10): Promise<Visit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('*, patient:patients(*)')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as Visit[];
}

// Audio Uploads

export async function createAudioUpload(visitId: string): Promise<AudioUpload> {
  const { data, error } = await supabase
    .from('audio_uploads')
    .insert({
      visit_id: visitId,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data as AudioUpload;
}

export async function getUploadUrl(visitId: string): Promise<{ uploadUrl: string; storagePath: string }> {
  const timestamp = Date.now();
  const storagePath = `${DEMO_CLINIC_ID}/${visitId}/${timestamp}.m4a`;

  const { data, error } = await supabase.storage
    .from('audio-recordings')
    .createSignedUploadUrl(storagePath);

  if (error) throw error;
  return { uploadUrl: data.signedUrl, storagePath };
}

export async function confirmAudioUpload(
  visitId: string,
  storagePath: string,
  durationSeconds: number,
  fileSizeBytes: number
): Promise<AudioUpload> {
  const { data, error } = await supabase
    .from('audio_uploads')
    .update({
      storage_path: storagePath,
      duration_seconds: durationSeconds,
      file_size_bytes: fileSizeBytes,
      uploaded_at: new Date().toISOString(),
      status: 'uploaded',
    })
    .eq('visit_id', visitId)
    .select()
    .single();

  if (error) throw error;

  // Update visit status
  await updateVisitStatus(visitId, 'processing');

  return data as AudioUpload;
}

export async function getAudioUploadStatus(visitId: string): Promise<AudioUpload | null> {
  const { data, error } = await supabase
    .from('audio_uploads')
    .select('*')
    .eq('visit_id', visitId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data as AudioUpload | null;
}

// Notes

export async function getNotes(visitId: string): Promise<{
  providerNote: ProviderNote | null;
  patientNote: PatientNote | null;
}> {
  const [providerResult, patientResult] = await Promise.all([
    supabase.from('provider_notes').select('*').eq('visit_id', visitId).single(),
    supabase.from('patient_notes').select('*').eq('visit_id', visitId).single(),
  ]);

  return {
    providerNote:
      providerResult.error && providerResult.error.code !== 'PGRST116'
        ? null
        : (providerResult.data as ProviderNote | null),
    patientNote:
      patientResult.error && patientResult.error.code !== 'PGRST116'
        ? null
        : (patientResult.data as PatientNote | null),
  };
}

export async function updateProviderNote(visitId: string, noteContent: string): Promise<ProviderNote> {
  const { data, error } = await supabase
    .from('provider_notes')
    .update({ note_content: noteContent })
    .eq('visit_id', visitId)
    .select()
    .single();

  if (error) throw error;
  return data as ProviderNote;
}

export async function updatePatientNote(visitId: string, content: string): Promise<PatientNote> {
  const { data, error } = await supabase
    .from('patient_notes')
    .update({ content })
    .eq('visit_id', visitId)
    .select()
    .single();

  if (error) throw error;
  return data as PatientNote;
}

// Finalization

export async function finalizeVisit(
  visitId: string,
  doctorId: string
): Promise<{ magicLinkToken: string }> {
  // Get visit and patient info
  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .select('*, patient:patients(*)')
    .eq('id', visitId)
    .single();

  if (visitError) throw visitError;

  // Update notes to finalized
  const now = new Date().toISOString();

  await Promise.all([
    supabase
      .from('provider_notes')
      .update({
        status: 'finalized',
        finalized_at: now,
        finalized_by: doctorId,
      })
      .eq('visit_id', visitId),
    supabase
      .from('patient_notes')
      .update({ status: 'finalized' })
      .eq('visit_id', visitId),
  ]);

  // Generate magic link token
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  const { error: magicLinkError } = await supabase.from('magic_links').insert({
    patient_id: visit.patient_id,
    visit_id: visitId,
    token,
    expires_at: expiresAt,
  });

  if (magicLinkError) throw magicLinkError;

  // Update visit status
  await supabase
    .from('visits')
    .update({
      status: 'sent',
      finalized_at: now,
    })
    .eq('id', visitId);

  return { magicLinkToken: token };
}

// Helper functions

function generateSecureToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}
