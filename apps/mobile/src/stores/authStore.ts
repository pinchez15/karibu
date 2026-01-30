import { create } from 'zustand';
import type { Staff } from '@karibu/shared';

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  staff: Staff | null;
  clerkUserId: string | null;
  clinicId: string | null;

  // Actions
  setAuth: (isSignedIn: boolean, clerkUserId: string | null) => void;
  setStaff: (staff: Staff | null) => void;
  setLoaded: (isLoaded: boolean) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoaded: false,
  isSignedIn: false,
  staff: null,
  clerkUserId: null,
  clinicId: null,

  setAuth: (isSignedIn, clerkUserId) =>
    set({ isSignedIn, clerkUserId }),

  setStaff: (staff) => set({
    staff,
    clinicId: staff?.clinic_id ?? null,
  }),

  setLoaded: (isLoaded) => set({ isLoaded }),

  signOut: () =>
    set({
      isSignedIn: false,
      staff: null,
      clerkUserId: null,
      clinicId: null,
    }),
}));
