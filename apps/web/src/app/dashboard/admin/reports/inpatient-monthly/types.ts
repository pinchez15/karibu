/** rpc_inpatient_monthly_summary(p_clinic_id, p_month) — single row per clinic-month. */
export type InpatientMonthlySummary = {
  admissions: number
  discharges: number
  recovered: number
  improved: number
  unchanged: number
  referred_out: number
  absconded: number
  died: number
  deliveries: number
  /** NULL when there were no discharges in the month — nothing to average. */
  mean_length_of_stay_days: number | null
  bed_days: number
}
