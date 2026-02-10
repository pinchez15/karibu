// Audit logging utility for DPPA compliance
// Fire-and-forget: does not block the request path

import { createLogger } from './logger.ts'

const logger = createLogger('audit')

export type AuditAction =
  | 'visit_created'
  | 'visit_uploaded'
  | 'visit_processed'
  | 'visit_viewed'
  | 'audio_played'
  | 'audio_deleted'
  | 'transcript_viewed'
  | 'transcript_edited'
  | 'patient_record_viewed'
  | 'patient_record_created'
  | 'patient_note_generated'
  | 'patient_note_delivered'
  | 'consent_obtained'
  | 'consent_withdrawn'
  | 'data_exported'
  | 'data_deleted'
  | 'login'
  | 'logout'
  | 'transcription_completed'
  | 'translation_completed'
  | 'note_generation_completed'
  | 'whatsapp_sent'

export interface AuditLogParams {
  actorId?: string         // Staff UUID
  actorClerkId?: string    // Clerk user ID
  actorRole?: string       // clinician, admin, system
  actorType?: 'staff' | 'patient' | 'system'
  action: AuditAction
  resourceType?: string    // visit, patient, audio, transcript, note
  resourceId?: string      // UUID of the resource
  patientId?: string       // Denormalized for fast patient queries
  metadata?: Record<string, unknown>
}

/**
 * Log an audit event. Fire-and-forget — errors are logged but don't block.
 * Uses service role Supabase client to bypass RLS.
 */
export async function auditLog(
  supabase: { from: (table: string) => { insert: (data: Record<string, unknown>) => Promise<{ error: unknown }> } },
  params: AuditLogParams
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      actor_id: params.actorId || null,
      actor_clerk_id: params.actorClerkId || null,
      actor_type: params.actorType || 'system',
      actor_role: params.actorRole || null,
      action: params.action,
      resource_type: params.resourceType || null,
      resource_id: params.resourceId || null,
      patient_id: params.patientId || null,
      metadata: params.metadata || {},
    })

    if (error) {
      logger.warn('Failed to write audit log', {
        action: params.action,
        resource_type: params.resourceType,
      })
    }
  } catch (err) {
    // Never let audit logging break the main flow
    logger.error('Audit log error', { action: params.action }, err as Error)
  }
}
