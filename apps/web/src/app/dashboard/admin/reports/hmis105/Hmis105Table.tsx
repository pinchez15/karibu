'use client'

import type { Hmis105Row } from '@karibu/shared'

interface Hmis105TableProps {
  rows: Hmis105Row[]
}

export function Hmis105Table({ rows }: Hmis105TableProps) {
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted">
            <th className="text-left p-2 border border-border font-medium" rowSpan={2}>
              Diagnosis
            </th>
            <th className="text-center p-1 border border-border font-medium" colSpan={2}>
              0-28 days
            </th>
            <th className="text-center p-1 border border-border font-medium" colSpan={2}>
              29d-4 years
            </th>
            <th className="text-center p-1 border border-border font-medium" colSpan={2}>
              5-14 years
            </th>
            <th className="text-center p-1 border border-border font-medium" colSpan={2}>
              15-59 years
            </th>
            <th className="text-center p-1 border border-border font-medium" colSpan={2}>
              60+ years
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
          {rows.map((row) => (
            <tr
              key={row.hmis_code}
              className={`hover:bg-muted/50 ${row.total > 0 ? '' : 'text-muted-foreground'}`}
            >
              <td className="p-2 border border-border">
                <span className="font-mono text-xs text-muted-foreground mr-2">
                  {row.hmis_code.replace('HMIS_105_', '')}
                </span>
                {row.display_name}
              </td>
              <Cell value={row.male_0_28d} />
              <Cell value={row.female_0_28d} />
              <Cell value={row.male_29d_4y} />
              <Cell value={row.female_29d_4y} />
              <Cell value={row.male_5_14y} />
              <Cell value={row.female_5_14y} />
              <Cell value={row.male_15_59y} />
              <Cell value={row.female_15_59y} />
              <Cell value={row.male_60plus} />
              <Cell value={row.female_60plus} />
              <td className="text-center p-1 border border-border font-medium">
                {row.total || '-'}
              </td>
            </tr>
          ))}
          {/* Grand total row */}
          <tr className="bg-muted font-medium">
            <td className="p-2 border border-border">Grand Total</td>
            <GrandCell rows={rows} field="male_0_28d" />
            <GrandCell rows={rows} field="female_0_28d" />
            <GrandCell rows={rows} field="male_29d_4y" />
            <GrandCell rows={rows} field="female_29d_4y" />
            <GrandCell rows={rows} field="male_5_14y" />
            <GrandCell rows={rows} field="female_5_14y" />
            <GrandCell rows={rows} field="male_15_59y" />
            <GrandCell rows={rows} field="female_15_59y" />
            <GrandCell rows={rows} field="male_60plus" />
            <GrandCell rows={rows} field="female_60plus" />
            <td className="text-center p-1 border border-border font-bold">
              {grandTotal || '-'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Cell({ value }: { value: number }) {
  return (
    <td className="text-center p-1 border border-border tabular-nums">
      {value || '-'}
    </td>
  )
}

function GrandCell({ rows, field }: { rows: Hmis105Row[]; field: keyof Hmis105Row }) {
  const total = rows.reduce((sum, r) => sum + (r[field] as number), 0)
  return (
    <td className="text-center p-1 border border-border tabular-nums">
      {total || '-'}
    </td>
  )
}
