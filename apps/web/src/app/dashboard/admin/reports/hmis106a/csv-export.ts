import type { Hmis106aReport } from '@karibu/shared'

export function generateHmis106aCsv(report: Hmis106aReport): string {
  const header = [
    'Element code',
    'Section',
    'Indicator',
    'M <2',
    'F <2',
    'M 2-4',
    'F 2-4',
    'M 5-14',
    'F 5-14',
    'M 15-49',
    'F 15-49',
    'M 50+',
    'F 50+',
    'Total',
  ].join(',')

  const meta = [
    `# ${report.report === 'hiv' ? 'HMIS 106a:01-02 HIV Quarterly' : 'HMIS 106a:03 TB/Leprosy Quarterly'}`,
    `# Clinic: ${report.clinic_name}`,
    `# ${report.quarter_label}`,
    `# Period: ${report.period_start} to ${report.period_end}`,
    `# Generated: ${report.generated_at}`,
    '',
  ].join('\n')

  const rows = report.rows.map((r) =>
    [
      r.element_code,
      r.section,
      `"${r.display_name.replace(/"/g, '""')}"`,
      r.male_under_2,
      r.female_under_2,
      r.male_2_4,
      r.female_2_4,
      r.male_5_14,
      r.female_5_14,
      r.male_15_49,
      r.female_15_49,
      r.male_50_plus,
      r.female_50_plus,
      r.total,
    ].join(','),
  )

  return `${meta}${header}\n${rows.join('\n')}\n`
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
