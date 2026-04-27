'use client'

import type { DataQualityStats } from '@karibu/shared'

interface DataQualitySummaryProps {
  quality: DataQualityStats
}

export function DataQualitySummary({ quality }: DataQualitySummaryProps) {
  const codingRate =
    quality.total_visits > 0
      ? Math.round((quality.coded_visits / quality.total_visits) * 100)
      : 0

  const cards = [
    {
      label: 'Total Visits',
      value: quality.total_visits.toLocaleString(),
      sub: `${quality.total_patients.toLocaleString()} patients`,
    },
    {
      label: 'Coding Rate',
      value: `${codingRate}%`,
      sub: `${quality.coded_visits} of ${quality.total_visits} coded`,
      warn: codingRate < 80,
    },
    {
      label: 'Missing Sex',
      value: quality.missing_sex.toLocaleString(),
      sub: 'patients without sex recorded',
      warn: quality.missing_sex > 0,
    },
    {
      label: 'Missing DOB',
      value: quality.missing_dob.toLocaleString(),
      sub: 'patients without date of birth',
      warn: quality.missing_dob > 0,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border p-3 ${
            card.warn
              ? 'border-amber-500/30 bg-amber-500/10'
              : 'border-border bg-card'
          }`}
        >
          <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
          <p className={`text-2xl font-semibold mt-0.5 ${card.warn ? 'text-amber-700' : ''}`}>
            {card.value}
          </p>
          <p className={`text-xs mt-0.5 ${card.warn ? 'text-amber-700' : 'text-muted-foreground'}`}>
            {card.sub}
          </p>
        </div>
      ))}
    </div>
  )
}
