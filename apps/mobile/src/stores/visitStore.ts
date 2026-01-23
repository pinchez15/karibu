import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Visit, Patient, ProviderNote, PatientNote, AudioUpload, LocalVisit } from '@karibu/shared';

interface VisitState {
  // Current visit being worked on
  currentVisit: LocalVisit | null;
  currentPatient: Patient | null;

  // Notes for current visit
  providerNote: ProviderNote | null;
  patientNote: PatientNote | null;
  audioUpload: AudioUpload | null;

  // Local recording state
  localAudioPath: string | null;
  recordingDuration: number;
  isRecording: boolean;

  // Pending uploads queue (offline support)
  pendingUploads: LocalVisit[];

  // Recent visits for display
  recentVisits: Visit[];

  // Network state
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;

  // Actions
  setCurrentVisit: (visit: LocalVisit | null) => void;
  setCurrentPatient: (patient: Patient | null) => void;
  setProviderNote: (note: ProviderNote | null) => void;
  setPatientNote: (note: PatientNote | null) => void;
  setAudioUpload: (upload: AudioUpload | null) => void;
  setLocalAudioPath: (path: string | null) => void;
  setRecordingDuration: (duration: number) => void;
  setIsRecording: (isRecording: boolean) => void;
  addPendingUpload: (visit: LocalVisit) => void;
  removePendingUpload: (localId: string) => void;
  updatePendingUpload: (localId: string, updates: Partial<LocalVisit>) => void;
  setRecentVisits: (visits: Visit[]) => void;
  setOnline: (isOnline: boolean) => void;
  setSyncing: (isSyncing: boolean) => void;
  setLastSyncAt: (timestamp: string) => void;
  clearCurrentVisit: () => void;
}

export const useVisitStore = create<VisitState>()(
  persist(
    (set, get) => ({
      currentVisit: null,
      currentPatient: null,
      providerNote: null,
      patientNote: null,
      audioUpload: null,
      localAudioPath: null,
      recordingDuration: 0,
      isRecording: false,
      pendingUploads: [],
      recentVisits: [],
      isOnline: true,
      isSyncing: false,
      lastSyncAt: null,

      setCurrentVisit: (visit) => set({ currentVisit: visit }),
      setCurrentPatient: (patient) => set({ currentPatient: patient }),
      setProviderNote: (note) => set({ providerNote: note }),
      setPatientNote: (note) => set({ patientNote: note }),
      setAudioUpload: (upload) => set({ audioUpload: upload }),
      setLocalAudioPath: (path) => set({ localAudioPath: path }),
      setRecordingDuration: (duration) => set({ recordingDuration: duration }),
      setIsRecording: (isRecording) => set({ isRecording }),

      addPendingUpload: (visit) =>
        set((state) => ({
          pendingUploads: [...state.pendingUploads, visit],
        })),

      removePendingUpload: (localId) =>
        set((state) => ({
          pendingUploads: state.pendingUploads.filter((v) => v.local_id !== localId),
        })),

      updatePendingUpload: (localId, updates) =>
        set((state) => ({
          pendingUploads: state.pendingUploads.map((v) =>
            v.local_id === localId ? { ...v, ...updates } : v
          ),
        })),

      setRecentVisits: (visits) => set({ recentVisits: visits }),
      setOnline: (isOnline) => set({ isOnline }),
      setSyncing: (isSyncing) => set({ isSyncing }),
      setLastSyncAt: (timestamp) => set({ lastSyncAt: timestamp }),

      clearCurrentVisit: () =>
        set({
          currentVisit: null,
          currentPatient: null,
          providerNote: null,
          patientNote: null,
          audioUpload: null,
          localAudioPath: null,
          recordingDuration: 0,
          isRecording: false,
        }),
    }),
    {
      name: 'karibu-visit-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist these fields
        pendingUploads: state.pendingUploads,
        lastSyncAt: state.lastSyncAt,
      }),
    }
  )
);
