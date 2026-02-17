'use client'

import { useState, useMemo } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { ClinicOption } from '@karibu/shared'

interface ClinicMultiSelectProps {
  clinics: ClinicOption[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export function ClinicMultiSelect({
  clinics,
  selected,
  onChange,
}: ClinicMultiSelectProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return clinics
    const q = search.toLowerCase()
    return clinics.filter((c) => c.name.toLowerCase().includes(q))
  }, [clinics, search])

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.includes(c.id))

  function handleToggleAll() {
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map((c) => c.id))
      onChange(selected.filter((id) => !filteredIds.has(id)))
    } else {
      const newIds = new Set(selected)
      for (const c of filtered) newIds.add(c.id)
      onChange([...newIds])
    }
  }

  function handleToggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Clinics</label>
      <Input
        placeholder="Search clinics..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />
      <div className="border border-border rounded-md max-h-48 overflow-y-auto">
        <label className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/50 cursor-pointer text-sm font-medium">
          <Checkbox
            checked={allFilteredSelected}
            onCheckedChange={handleToggleAll}
          />
          Select All ({filtered.length})
        </label>
        {filtered.map((clinic) => (
          <label
            key={clinic.id}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 cursor-pointer text-sm"
          >
            <Checkbox
              checked={selected.includes(clinic.id)}
              onCheckedChange={() => handleToggle(clinic.id)}
            />
            {clinic.name}
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">No clinics found</p>
        )}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selected.length} clinic{selected.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  )
}
