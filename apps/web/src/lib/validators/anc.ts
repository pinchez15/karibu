import { z } from 'zod'

export const StartPregnancySchema = z.object({
  patient_id: z.string().uuid(),
  gestation_weeks: z.coerce.number().int().min(0).max(45).optional(),
  gravida: z.coerce.number().int().min(0).max(20).optional(),
  para: z.coerce.number().int().min(0).max(20).optional(),
  blood_group: z.string().max(8).optional(),
  hiv_status: z.enum(['negative', 'positive', 'unknown']).optional(),
  risk_notes: z.string().max(2000).optional(),
})

export const RecordAncContactSchema = z.object({
  pregnancy_id: z.string().uuid(),
  bp_systolic: z.coerce.number().int().min(30).max(300).optional(),
  bp_diastolic: z.coerce.number().int().min(20).max(200).optional(),
  weight_kg: z.coerce.number().min(0).max(300).optional(),
  fundal_height_cm: z.coerce.number().int().min(0).max(60).optional(),
  fetal_heart_rate: z.coerce.number().int().min(60).max(220).optional(),
  urine_protein: z.enum(['neg', '+', '++', '+++']).optional(),
  hb: z.coerce.number().min(0).max(25).optional(),
  iptp_given: z.boolean().default(false),
  ifas_given: z.boolean().default(false),
  td_given: z.boolean().default(false),
  dewormed: z.boolean().default(false),
  itn_given: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
})

export type StartPregnancyInput = z.infer<typeof StartPregnancySchema>
export type RecordAncContactInput = z.infer<typeof RecordAncContactSchema>
