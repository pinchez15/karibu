'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { LAB_CATALOG_TESTS, labTestsByCategory, type StaffRole } from '@karibu/shared'
import { submitLabOrder } from '@/app/dashboard/visits/actions'

// Deterministic lab ordering (F2): pick tests from the catalog so the bench
// gets exact names, never free text like "ampules"/"ampoules". Writes catalog
// names into visits.tests_ordered.
export function VisitLabPanel({
  visitId,
  staffRole,
  onSubmitted,
}: {
  visitId: string
  staffRole: StaffRole | null
  onSubmitted?: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const canSubmit =
    staffRole != null && ['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife'].includes(staffRole)
  if (!canSubmit) return null

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line-soft bg-muted/30 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Order lab tests</p>
        <p className="text-xs text-muted-foreground">
          Pick from the catalog so the bench gets exact test names, not free text.
        </p>
      </div>

      <div className="space-y-3">
        {labTestsByCategory().map(([category, tests]) => (
          <div key={category}>
            <div className="kh-meta mb-1">{category}</div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {tests.map((t) => (
                <label key={t.code} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={selected.has(t.code)}
                    onChange={() => toggle(t.code)}
                    disabled={pending}
                  />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || selected.size === 0}
        onClick={() => {
          setError(null)
          const names = LAB_CATALOG_TESTS.filter((t) => selected.has(t.code)).map((t) => t.name)
          startTransition(async () => {
            const r = await submitLabOrder(visitId, names)
            if (!r.success) {
              setError(r.error)
              return
            }
            setSelected(new Set())
            onSubmitted?.()
          })
        }}
      >
        {pending ? 'Sending…' : 'Send to lab'}
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
