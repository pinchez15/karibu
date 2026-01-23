import { create } from 'zustand';
import type { Staff } from '@karibu/shared';

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  staff: Staff | null;
  clerkUserId: string | null;

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

  setAuth: (isSignedIn, clerkUserId) =>
    set({ isSignedIn, clerkUserId }),

  setStaff: (staff) => set({ staff }),

  setLoaded: (isLoaded) => set({ isLoaded }),

  signOut: () =>
    set({
      isSignedIn: false,
      staff: null,
      clerkUserId: null,
    }),
}));
