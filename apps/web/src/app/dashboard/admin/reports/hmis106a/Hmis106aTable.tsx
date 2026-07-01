'use client'

import { Fragment } from 'react'
import type { Hmis106aRow } from '@karibu/shared'

const SECTION_LABEL: Record<string, string> = {
  hct: 'HCT services',
  art: 'ART services',
  casefinding: 'Case-finding',
  outcomes: 'Treatment outcomes',
  tpt: 'TB preventive treatment',
}

interface Hmis106aTableProps {
  rows: Hmis106aRow[]
}

export function Hmis106aTable({ rows }: Hmis106aTableProps) {
  let lastSection = ''

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[900px]">
        <thead>
          <tr className="bg-muted">
            <th className="text-left p-2 border border-border font-medium" rowSpan={2}>
              Indicator
            </th>
            <th className="text-center p-1 border border-border font-medium" colSpan={2}>
              &lt;2 yrs
            </th>
            <th className="text-center p-1 border border-border font-medium" colSpan={2}>
              2–4 yrs
            </th>
            <th className="text-center p-1 border border-border font-medium" colSpan={2}>
              5–14 yrs
            </th>
            <th className="text-center p-1 border border-border font-medium" colSpan={2}>
              15–49 yrs
            </th>
            <th className="text-center p-1 border border-border font-medium" colSpan={2}>
              50+ yrs
            </th>
            <th className="text-center p-2 border border-border font-medium" rowSpan={2}>
              Total
            </th>
          </tr>
          <tr className="bg-muted">
            <th className="text-center p-1 border border-border text-xs font-medium">M</th>
            <th className="text-center p-1 border border-border text-xs font-medium">F</th>
            <th className="text-center p-1 border border-border text-xs font-medium">M</th>
            <th className="text-center p-1 border border-border text-xs font-medium">F</th>
            <th className="text-center p-1 border border-border text-xs font-medium">M</th>
            <th className="text-center p-1 border border-border text-xs font-medium">F</th>
            <th className="text-center p-1 border border-border text-xs font-medium">M</th>
            <th className="text-center p-1 border border-border text-xs font-medium">F</th>
            <th className="text-center p-1 border border-border text-xs font-medium">M</th>
            <th className="text-center p-1 border border-border text-xs font-medium">F</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const showSection = row.section !== lastSection
            lastSection = row.section
            return (
              <Fragment key={row.element_code}>
                {showSection && (
                  <tr className="bg-cobalt/5">
                    <td
                      colSpan={12}
                      className="p-2 border border-border font-semibold text-cobalt text-xs uppercase tracking-wide"
                    >
                      {SECTION_LABEL[row.section] ?? row.section}
                    </td>
                  </tr>
                )}
                <tr className={row.total > 0 ? '' : 'text-muted-foreground'}>
                  <td className="p-2 border border-border">{row.display_name}</td>
                  <Cell value={row.male_under_2} />
                  <Cell value={row.female_under_2} />
                  <Cell value={row.male_2_4} />
                  <Cell value={row.female_2_4} />
                  <Cell value={row.male_5_14} />
                  <Cell value={row.female_5_14} />
                  <Cell value={row.male_15_49} />
                  <Cell value={row.female_15_49} />
                  <Cell value={row.male_50_plus} />
                  <Cell value={row.female_50_plus} />
                  <td className="text-center p-1 border border-border font-medium">
                    {row.total || '-'}
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Cell({ value }: { value: number }) {
  return (
    <td className="text-center p-1 border border-border tabular-nums">
      {value > 0 ? value : '-'}
    </td>
  )
}
