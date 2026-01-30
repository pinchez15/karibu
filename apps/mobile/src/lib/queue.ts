import { supabase } from './supabase';
import { useAuthStore } from '../stores/authStore';
import type { QueueItem, CheckInRequest, Visit, VisitPriority } from '@karibu/shared';

// Helper to get current clinic ID from auth store
function getClinicId(): string {
  const clinicId = useAuthStore.getState().clinicId;
  if (!clinicId) {
    throw new Error('No clinic ID available. User may not be authenticated.');
  }
  return clinicId;
}

// Helper to get current staff ID from auth store
function getStaffId(): string {
  const staff = useAuthStore.getState().staff;
  if (!staff?.id) {
    throw new Error('No staff ID available. User may not be authenticated.');
  }
  return staff.id;
}

/**
 * Check in a patient - creates a new visit in the queue
 */
export async function checkInPatient(request: CheckInRequest): Promise<string> {
  const clinicId = getClinicId();

  const { data, error } = await supabase.rpc('check_in_patient', {
    p_clinic_id: clinicId,
    p_patient_id: request.patient_id,
    p_chief_complaint: request.chief_complaint ?? null,
    p_priority: request.priority ?? 'normal',
  });

  if (error) throw error;
  return data as string;
}

/**
 * Get the clinic queue for today
 */
export async function getClinicQueue(): Promise<QueueItem[]> {
  const clinicId = getClinicId();

  const { data, error } = await supabase.rpc('get_clinic_queue', {
    p_clinic_id: clinicId,
  });

  if (error) throw error;
  return (data || []) as QueueItem[];
}

/**
 * Assign a patient to a nurse (nurse claims from waiting queue)
 */
export async function assignToNurse(visitId: string, nurseId?: string): Promise<void> {
  const staffId = nurseId || getStaffId();

  const { error } = await supabase.rpc('assign_to_nurse', {
    p_visit_id: visitId,
    p_nurse_id: staffId,
  });

  if (error) throw error;
}

/**
 * Mark patient as ready for doctor (nurse completes intake)
 */
export async function markReadyForDoctor(visitId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_ready_for_doctor', {
    p_visit_id: visitId,
  });

  if (error) throw error;
}

/**
 * Doctor claims a patient from the queue
 */
export async function claimPatient(visitId: string, doctorId?: string): Promise<void> {
  const staffId = doctorId || getStaffId();

  const { error } = await supabase.rpc('claim_patient', {
    p_visit_id: visitId,
    p_doctor_id: staffId,
  });

  if (error) throw error;
}

/**
 * Complete a visit in the queue (mark as done)
 */
export async function completeVisitQueue(visitId: string): Promise<void> {
  const { error } = await supabase.rpc('complete_visit_queue', {
    p_visit_id: visitId,
  });

  if (error) throw error;
}

/**
 * Cancel a visit in the queue
 */
export async function cancelVisitQueue(visitId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_visit_queue', {
    p_visit_id: visitId,
  });

  if (error) throw error;
}

/**
 * Update visit priority
 */
export async function updateVisitPriority(visitId: string, priority: VisitPriority): Promise<void> {
  const { error } = await supabase
    .from('visits')
    .update({ priority })
    .eq('id', visitId);

  if (error) throw error;
}

/**
 * Update chief complaint
 */
export async function updateChiefComplaint(visitId: string, chiefComplaint: string): Promise<void> {
  const { error } = await supabase
    .from('visits')
    .update({ chief_complaint: chiefComplaint })
    .eq('id', visitId);

  if (error) throw error;
}

/**
 * Get queue statistics for the clinic
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  withNurse: number;
  readyForDoctor: number;
  withDoctor: number;
  completed: number;
  averageWaitMinutes: number;
}> {
  const clinicId = getClinicId();

  const { data, error } = await supabase
    .from('visits')
    .select('queue_status, checked_in_at')
    .eq('clinic_id', clinicId)
    .eq('visit_date', new Date().toISOString().split('T')[0])
    .in('queue_status', ['waiting', 'with_nurse', 'ready_for_doctor', 'with_doctor', 'completed']);

  if (error) throw error;

  const stats = {
    waiting: 0,
    withNurse: 0,
    readyForDoctor: 0,
    withDoctor: 0,
    completed: 0,
    averageWaitMinutes: 0,
  };

  let totalWaitMinutes = 0;
  let waitingCount = 0;
  const now = new Date();

  for (const visit of data || []) {
    switch (visit.queue_status) {
      case 'waiting':
        stats.waiting++;
        if (visit.checked_in_at) {
          totalWaitMinutes += (now.getTime() - new Date(visit.checked_in_at).getTime()) / 60000;
          waitingCount++;
        }
        break;
      case 'with_nurse':
        stats.withNurse++;
        break;
      case 'ready_for_doctor':
        stats.readyForDoctor++;
        break;
      case 'with_doctor':
        stats.withDoctor++;
        break;
      case 'completed':
        stats.completed++;
        break;
    }
  }

  stats.averageWaitMinutes = waitingCount > 0 ? Math.round(totalWaitMinutes / waitingCount) : 0;

  return stats;
}

/**
 * Subscribe to queue updates in real-time
 */
export function subscribeToQueueUpdates(
  onUpdate: (payload: { eventType: string; new: Visit | null; old: Visit | null }) => void
): () => void {
  const clinicId = getClinicId();
  const today = new Date().toISOString().split('T')[0];

  const subscription = supabase
    .channel('queue-updates')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'visits',
        filter: `clinic_id=eq.${clinicId}`,
      },
      (payload) => {
        // Only process updates for today's visits
        const visit = (payload.new as Visit) || (payload.old as Visit);
        if (visit?.visit_date === today) {
          onUpdate({
            eventType: payload.eventType,
            new: payload.new as Visit | null,
            old: payload.old as Visit | null,
          });
        }
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(subscription);
  };
}
