import { z } from 'zod'

export const RecordHtsEventSchema = z.object({
  patient_id: z.string().uuid(),
  visit_id: z.string().uuid().optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  counseled: z.boolean().default(true),
  tested: z.boolean().default(false),
  result: z.enum(['negative', 'positive', 'indeterminate', 'not_tested']).optional(),
  result_received: z.boolean().default(false),
  first_result_in_fy: z.boolean().default(false),
  suspected_tb: z.boolean().default(false),
  started_cpt: z.boolean().default(false),
  retester: z.boolean().default(false),
  couple_test: z.boolean().default(false),
  couple_concordant: z.boolean().optional(),
  pep: z.boolean().default(false),
  smc_provided: z.boolean().default(false),
  pregnancy_id: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
})

export const UpsertHivCareSchema = z.object({
  id: z.string().uuid().optional(),
  patient_id: z.string().uuid(),
  enrolled_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  care_status: z.enum(['pre_art', 'on_art', 'transferred_out', 'ltfu', 'dead', 'closed']).default('pre_art'),
  who_stage: z.coerce.number().int().min(1).max(4).optional(),
  art_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  art_regimen: z.string().max(64).optional(),
  art_line: z.enum(['first', 'second']).optional(),
  pregnant_at_enrollment: z.boolean().default(false),
  eligible_not_on_art: z.boolean().default(false),
  tb_assessed_last_visit: z.boolean().default(false),
  tb_treatment_started: z.boolean().default(false),
  cpt_at_last_visit: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
})

export const RecordViralLoadSchema = z.object({
  patient_id: z.string().uuid(),
  enrollment_id: z.string().uuid().optional(),
  test_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  result_copies: z.coerce.number().min(0).optional(),
  suppressed: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
})

export const UpsertTbEpisodeSchema = z.object({
  id: z.string().uuid().optional(),
  patient_id: z.string().uuid(),
  unit_tb_number: z.string().max(32).optional(),
  registered_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  case_type: z.enum(['new', 'relapse', 'retreatment_default', 'failure', 'other']).default('new'),
  disease_class: z
    .enum(['pulmonary_smear_positive', 'pulmonary_smear_negative', 'extrapulmonary'])
    .default('pulmonary_smear_positive'),
  ept_site: z.string().max(128).optional(),
  hiv_status: z.enum(['positive', 'negative', 'unknown']).optional(),
  on_art_at_diagnosis: z.boolean().default(false),
  on_cpt_at_diagnosis: z.boolean().default(false),
  treatment_started_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  regimen_category: z.enum(['cat1', 'cat2', 'cat3']).optional(),
  treatment_phase: z.enum(['intensive', 'continuation']).optional(),
  outcome: z
    .enum(['ongoing', 'cured', 'completed', 'failure', 'default', 'transferred_out', 'died'])
    .default('ongoing'),
  outcome_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
})

export const RecordTptSchema = z.object({
  patient_id: z.string().uuid(),
  indication: z.enum(['plhiv', 'child_contact', 'other']),
  started_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  completed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  regimen: z.string().max(64).optional(),
  completed: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
})

export type RecordHtsEventInput = z.infer<typeof RecordHtsEventSchema>
export type UpsertHivCareInput = z.infer<typeof UpsertHivCareSchema>
export type RecordViralLoadInput = z.infer<typeof RecordViralLoadSchema>
export type UpsertTbEpisodeInput = z.infer<typeof UpsertTbEpisodeSchema>
export type RecordTptInput = z.infer<typeof RecordTptSchema>
