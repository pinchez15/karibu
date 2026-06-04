// KaribuLearn case schema (web mirror of CaseModels.kt). The Python pipeline
// authors these; see docs/karibu-learn-pack-schema.md.

export interface PackInfo {
  id: string;
  title: string;
  subtitle?: string;
  topic?: string;
  case_count?: number;
  approx_size_kb?: number;
  bundled?: boolean;
  asset_path?: string;
  download_url?: string;
  version?: number;
}

export interface PackManifest { packs: PackInfo[] }

export interface CasePack { id: string; title: string; cases: LearnCase[] }

export interface CasePatient { name: string; id?: string; age: string; sex?: string }

export interface ShareMeta {
  share_title?: string;
  share_prompt?: string;
  share_summary?: string;
  share_url?: string;
  evidence_card?: string;
  discussion_question?: string;
}

export interface CaseMeta {
  complexity_score?: number;
  clinical_correctness_score?: number;
  hc3_reality_score?: number;
  learning_value_score?: number;
  source_guideline_ids?: string[];
  original_citation?: string;
  license_status?: string;
  adaptation_notes?: string;
  review_status?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  case_version?: string;
}

export type StepKind = 'story' | 'decision';

export interface AnswerOption { text: string; correct?: boolean }

export interface Question {
  prompt: string;
  options: AnswerOption[];
  right: string;
  wrong: string;
  calculator?: boolean;
}

export interface Teach { label: string; text: string }

export interface Coach {
  eyebrow?: string;
  title?: string;
  body?: string;
  quote?: string;
  teach?: Teach;
}

export interface KeyVal { label: string; value: string }
export interface Vital { label: string; value: string; hot?: boolean }
export interface Critical { title: string; body?: string; count?: number }
export interface OrderRow {
  name: string; sub?: string; reveal_sub?: string; status?: string; reveal_status?: string;
}
export interface AiBanner { headline: string; sub?: string }
export interface HmisCode { code: string; name: string; confidence?: string; primary?: boolean }

export interface ChartSection {
  type: string;
  title?: string;
  text?: string;
  reveal_text?: string;
  emphasis?: string;
  right_label?: string;
  chips?: string[];
  rows?: KeyVal[];
  vitals?: Vital[];
  critical?: Critical;
  danger_signs?: string[];
  reveal_note?: string;
  orders?: OrderRow[];
  result_label?: string;
  result_value?: string;
  badge?: string;
  ai?: AiBanner;
  drug?: string;
  detail?: string;
  reveal_detail?: string;
  confirmed_on_reveal?: boolean;
  calculator?: boolean;
  counselling?: string[];
  codes?: HmisCode[];
  receipt?: string;
}

export interface ChartSpec { tag?: string; sections: ChartSection[] }

export interface CaseStep {
  kind: StepKind;
  chart?: ChartSpec;
  coach: Coach;
  question?: Question;
}

export interface DoseBand { lo: number; hi?: number | null; tabs: number; label: string }

export interface DoseCalcSpec {
  drug: string;
  drug_sub?: string;
  source_label?: string;
  start_weight?: number;
  min_weight?: number;
  doses_per_day?: number;
  days?: number;
  bands: DoseBand[];
}

export interface LearnCase {
  id: string;
  title: string;
  topic: string;
  difficulty?: string;
  mins?: number;
  credit?: number;
  setting?: string;
  patient: CasePatient;
  blurb?: string;
  objectives?: string[];
  skills?: string[];
  ready?: boolean;
  steps?: CaseStep[];
  takeaways?: string[];
  citations?: string[];
  dose_calc?: DoseCalcSpec;
  source_type?: string;
  mode?: string;
  level?: number;
  share?: ShareMeta;
  meta?: CaseMeta;
  packId?: string;
}

export function bandFor(spec: DoseCalcSpec, weight: number): DoseBand | null {
  const min = spec.min_weight ?? 5;
  if (weight < min) return null;
  return (
    spec.bands.find((b) => weight >= b.lo && weight <= (b.hi ?? Number.MAX_VALUE)) ??
    spec.bands[spec.bands.length - 1] ??
    null
  );
}
