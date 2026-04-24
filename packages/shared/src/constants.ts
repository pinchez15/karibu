// Karibu Health Constants

// Visit status flow (dictation-first product)
export const VISIT_STATUS_FLOW = [
  'pending',
  'review',
  'sent',
  'completed',
] as const;

// Session expiry (7 days in milliseconds)
export const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// Print path for the patient receipt rendered by the dashboard.
export const PRINT_PATIENT_NOTE_PATH = (visitId: string) =>
  `/dashboard/visits/${visitId}/print`;

// Error messages
export const ERROR_MESSAGES = {
  networkError: 'Unable to connect. Your data is saved and will sync when online.',
  patientNotFound: 'Patient not found.',
  visitNotFound: 'Visit not found.',
} as const;

// Payment methods
export const PAYMENT_METHODS = {
  cash: { label: 'Cash', disabled: false },
  mtn_momo: { label: 'MTN Mobile Money', disabled: true },
  airtel_money: { label: 'Airtel Money', disabled: true },
} as const;

// Service types for payment categorisation
export const SERVICE_TYPES = [
  'Consultation',
  'Laboratory',
  'Pharmacy',
  'Imaging',
  'Procedure',
  'Other',
] as const;

// Phone number formatting (Uganda)
export const PHONE_FORMATS = {
  countryCode: '+256',
  exampleFormat: '+256 7XX XXX XXX',
  regex: /^\+256[0-9]{9}$/,
} as const;

// Validation helpers
export function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('0')) {
    cleaned = '+256' + cleaned.slice(1);
  }

  if (!cleaned.startsWith('+')) {
    cleaned = '+256' + cleaned;
  }

  return cleaned;
}

export function isValidUgandaPhone(phone: string): boolean {
  const formatted = formatPhoneNumber(phone);
  return PHONE_FORMATS.regex.test(formatted);
}
