import type {
  ClinicalNoteCardModel,
  DiagnosisCardModel,
  PatientHeaderModel,
  ReferralCardModel,
  TimelineCardModel,
  VitalsCardModel
} from './models';

export interface PatientHeaderContract {
  model: PatientHeaderModel;
}

export interface VitalsCardContract {
  model: VitalsCardModel;
}

export interface ClinicalNoteCardContract {
  model: ClinicalNoteCardModel;
}

export interface DiagnosisCardContract {
  model: DiagnosisCardModel;
}

export interface ReferralCardContract {
  model: ReferralCardModel;
}

export interface TimelineCardContract {
  model: TimelineCardModel;
}

