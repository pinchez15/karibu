import type { Hmis105Report } from '@karibu/shared'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function generateHmis105Csv(report: Hmis105Report): string {
  const monthName = MONTH_NAMES[report.month - 1]
  const lines: string[] = []

  // Header rows
  lines.push(`HMIS 105 - Outpatient Department Monthly Summary`)
  lines.push(`Facility: ${report.clinic_name}`)
  lines.push(`Period: ${monthName} ${report.year}`)
  lines.push(`Generated: ${new Date(report.generated_at).toLocaleString()}`)
  lines.push('')

  // Column headers
  lines.push([
    'HMIS Code',
    'Diagnosis',
    'M 0-28d',
    'F 0-28d',
    'M 29d-4y',
    'F 29d-4y',
    'M 5-14y',
    'F 5-14y',
    'M 15-59y',
    'F 15-59y',
    'M 60+',
    'F 60+',
    'Total',
  ].join(','))

  // Data rows
  for (const row of report.rows) {
    lines.push([
      `"${row.hmis_code}"`,
      `"${row.display_name}"`,
      row.male_0_28d,
      row.female_0_28d,
      row.male_29d_4y,
      row.female_29d_4y,
      row.male_5_14y,
      row.female_5_14y,
      row.male_15_59y,
      row.female_15_59y,
      row.male_60plus,
      row.female_60plus,
      row.total,
    ].join(','))
  }

  // Quality summary
  lines.push('')
  lines.push('Data Quality Summary')
  lines.push(`Total finalized visits in period,${report.quality.total_visits}`)
  lines.push(`Visits with HMIS codes,${report.quality.coded_visits}`)
  lines.push(`Visits without HMIS codes,${report.quality.uncoded_visits}`)
  lines.push(`Patients missing sex,${report.quality.missing_sex}`)
  lines.push(`Patients missing date of birth,${report.quality.missing_dob}`)

  return lines.join('\n')
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
