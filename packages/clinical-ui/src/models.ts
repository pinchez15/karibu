export type ClinicalSex = 'female' | 'male' | 'unknown';

export type ClinicalSeverity = 'neutral' | 'info' | 'warning' | 'critical' | 'success';

export interface PatientHeaderModel {
  displayName: string;
  sex?: ClinicalSex;
  ageLabel?: string;
  identifierLabel?: string;
  secondaryLabel?: string;
  isSimulated?: boolean;
}

export interface VitalReadingModel {
  label: string;
  value: string;
  unit?: string;
  recordedAtLabel?: string;
  severity?: ClinicalSeverity;
}

export interface VitalsCardModel {
  title: string;
  readings: VitalReadingModel[];
  summaryLabel?: string;
}

export interface ClinicalNoteCardModel {
  title: string;
  body: string;
  authorLabel?: string;
  timestampLabel?: string;
  statusLabel?: string;
}

export interface DiagnosisCardModel {
  diagnosisLabel: string;
  confidenceLabel?: string;
  rationale?: string;
  severity?: ClinicalSeverity;
}

export interface ReferralCardModel {
  destinationLabel: string;
  reason: string;
  urgency?: ClinicalSeverity;
  statusLabel?: string;
}

export interface TimelineCardModel {
  id: string;
  title: string;
  timestampLabel?: string;
  body?: string;
  severity?: ClinicalSeverity;
}

