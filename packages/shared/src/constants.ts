// Karibu Health Constants

// Demo clinic ID (hardcoded for demo MVP)
export const DEMO_CLINIC_ID = '00000000-0000-0000-0000-000000000001';

// Visit status flow
export const VISIT_STATUS_FLOW = [
  'recording',
  'uploading',
  'processing',
  'review',
  'sent',
  'completed',
] as const;

// Magic link expiry (30 days in milliseconds)
export const MAGIC_LINK_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

// Session expiry (7 days in milliseconds)
export const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// Audio recording settings
export const AUDIO_SETTINGS = {
  maxDurationSeconds: 60 * 60, // 1 hour max
  sampleRate: 44100,
  channels: 1, // Mono for smaller file size
  bitRate: 128000,
  format: 'm4a',
  mimeType: 'audio/m4a',
} as const;

// API endpoints
export const API_ENDPOINTS = {
  patients: '/api/patients',
  patientLookup: '/api/patients/lookup',
  visits: '/api/visits',
  audioUploadUrl: (visitId: string) => `/api/visits/${visitId}/audio/upload-url`,
  audioConfirm: (visitId: string) => `/api/visits/${visitId}/audio/confirm`,
  audioStatus: (visitId: string) => `/api/visits/${visitId}/audio/status`,
  notes: (visitId: string) => `/api/visits/${visitId}/notes`,
  providerNote: (visitId: string) => `/api/visits/${visitId}/notes/provider`,
  patientNote: (visitId: string) => `/api/visits/${visitId}/notes/patient`,
  finalize: (visitId: string) => `/api/visits/${visitId}/finalize`,
  patientNotePublic: (token: string) => `/api/patient/note/${token}`,
  sync: {
    push: '/api/sync/push',
    pull: '/api/sync/pull',
  },
} as const;

// WhatsApp message templates
export const WHATSAPP_TEMPLATES = {
  patientNoteSent: {
    name: 'patient_note_ready',
    language: 'en',
  },
} as const;

// Error messages
export const ERROR_MESSAGES = {
  networkError: 'Unable to connect. Your data is saved and will sync when online.',
  uploadFailed: 'Upload failed. Tap to retry.',
  transcriptionFailed: 'Transcription failed. Please try again.',
  consentRequired: 'Patient consent is required before recording.',
  patientNotFound: 'Patient not found.',
  visitNotFound: 'Visit not found.',
  invalidMagicLink: 'This link is invalid or has expired.',
  sessionExpired: 'Your session has expired. Please request a new link.',
} as const;

// Phone number formatting (Uganda)
export const PHONE_FORMATS = {
  countryCode: '+256',
  exampleFormat: '+256 7XX XXX XXX',
  regex: /^\+256[0-9]{9}$/,
} as const;

// Validation helpers
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // If starts with 0, assume Uganda local format
  if (cleaned.startsWith('0')) {
    cleaned = '+256' + cleaned.slice(1);
  }

  // If doesn't start with +, assume Uganda
  if (!cleaned.startsWith('+')) {
    cleaned = '+256' + cleaned;
  }

  return cleaned;
}

export function isValidUgandaPhone(phone: string): boolean {
  const formatted = formatPhoneNumber(phone);
  return PHONE_FORMATS.regex.test(formatted);
}

// Generate secure random token
export function generateToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}
