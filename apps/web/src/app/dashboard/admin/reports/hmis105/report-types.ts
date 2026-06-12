import type {
  DataQualityStats,
  Hmis105Report,
  Hmis105SingleReport,
  Hmis105MultiReport,
} from '@karibu/shared'

/**
 * Data quality stats extended with the count of period visits that are NOT
 * yet finalized (status pending/review/error). HMIS 105 only counts visits
 * with status sent/completed, so unfinalized visits silently vanish from the
 * report — this surfaces them so the admin can chase them before submitting.
 */
export interface DataQualityStatsEx extends DataQualityStats {
  unfinalized_visits: number
}

/** A clinic-month whose HMIS 105 generation failed. Never silently dropped. */
export interface Hmis105ReportFailure {
  clinic_id: string
  clinic_name: string
  year: number
  month: number
  error: string
}

export interface Hmis105ReportEx extends Hmis105Report {
  /** The clinic the numbers were actually generated for. */
  clinic_id: string
  quality: DataQualityStatsEx
}

export interface Hmis105SingleReportEx extends Hmis105SingleReport {
  quality: DataQualityStatsEx
}

export interface Hmis105MultiReportEx
  extends Omit<Hmis105MultiReport, 'reports' | 'aggregated_quality'> {
  reports: Hmis105SingleReportEx[]
  aggregated_quality: DataQualityStatsEx
  /**
   * Clinic-months whose RPC or data-quality query failed. When non-empty the
   * report is INCOMPLETE and must not be submitted to the MoH as-is.
   */
  failures: Hmis105ReportFailure[]
}
