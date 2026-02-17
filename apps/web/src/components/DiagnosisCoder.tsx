'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { HmisDiagnosisCode, VisitDiagnosisCode } from '@karibu/shared'
import {
  getHmisCodes,
  getVisitDiagnosisCodes,
  saveVisitDiagnosisCode,
  removeVisitDiagnosisCode,
} from '@/app/dashboard/admin/reports/coding-actions'

interface DiagnosisCoderProps {
  visitId: string
}

export function DiagnosisCoder({ visitId }: DiagnosisCoderProps) {
  const router = useRouter()
  const [codes, setCodes] = useState<VisitDiagnosisCode[]>([])
  const [allCodes, setAllCodes] = useState<HmisDiagnosisCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, startSaving] = useTransition()

  const loadData = useCallback(async () => {
    try {
      const [visitCodes, hmisCodes] = await Promise.all([
        getVisitDiagnosisCodes(visitId),
        getHmisCodes(),
      ])
      setCodes(visitCodes)
      setAllCodes(hmisCodes)
    } catch (err) {
      console.error('Failed to load diagnosis codes:', err)
    } finally {
      setLoading(false)
    }
  }, [visitId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleConfirm = (code: VisitDiagnosisCode) => {
    startSaving(async () => {
      const result = await saveVisitDiagnosisCode(visitId, code.hmis_code_id, 'ai_confirmed')
      if (!result.error) {
        await loadData()
      }
    })
  }

  const handleRemove = (code: VisitDiagnosisCode) => {
    startSaving(async () => {
      const result = await removeVisitDiagnosisCode(visitId, code.hmis_code_id)
      if (!result.error) {
        await loadData()
      }
    })
  }

  const handleAdd = (hmisCode: HmisDiagnosisCode) => {
    startSaving(async () => {
      const result = await saveVisitDiagnosisCode(visitId, hmisCode.id, 'manual')
      if (!result.error) {
        setShowSearch(false)
        setSearch('')
        await loadData()
      }
    })
  }

  const assignedCodeIds = new Set(codes.map((c) => c.hmis_code_id))
  const filteredCodes = allCodes.filter(
    (c) =>
      !assignedCodeIds.has(c.id) &&
      (c.display_name.toLowerCase().includes(search.toLowerCase()) ||
        c.category.toLowerCase().includes(search.toLowerCase()) ||
        c.hmis_code.toLowerCase().includes(search.toLowerCase()))
  )

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2">HMIS Diagnosis Codes</h3>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">HMIS Diagnosis Codes</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSearch(!showSearch)}
        >
          {showSearch ? 'Cancel' : '+ Add Code'}
        </Button>
      </div>

      {codes.length === 0 && !showSearch && (
        <p className="text-sm text-muted-foreground">
          No HMIS codes assigned. AI coding runs automatically during note generation.
        </p>
      )}

      {/* Assigned codes */}
      <div className="space-y-2">
        {codes.map((code) => (
          <div
            key={code.id}
            className="flex items-center justify-between gap-2 p-2 rounded border border-border bg-muted/50"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {code.hmis_diagnosis_code?.hmis_code}
                </span>
                <span className="text-sm font-medium truncate">
                  {code.hmis_diagnosis_code?.display_name}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge
                  variant={
                    code.source === 'ai'
                      ? 'secondary'
                      : code.source === 'ai_confirmed'
                      ? 'default'
                      : 'outline'
                  }
                  className="text-xs"
                >
                  {code.source === 'ai'
                    ? 'AI suggested'
                    : code.source === 'ai_confirmed'
                    ? 'Confirmed'
                    : 'Manual'}
                </Badge>
                {code.confidence !== null && code.source === 'ai' && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(code.confidence * 100)}% confidence
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {code.source === 'ai' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleConfirm(code)}
                  disabled={saving}
                  className="text-xs h-7"
                >
                  Confirm
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(code)}
                disabled={saving}
                className="text-xs h-7 text-red-600 hover:text-red-700"
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Search/Add new code */}
      {showSearch && (
        <div className="mt-3 space-y-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search HMIS codes..."
            autoFocus
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredCodes.slice(0, 10).map((code) => (
              <button
                key={code.id}
                onClick={() => handleAdd(code)}
                disabled={saving}
                className="w-full text-left p-2 rounded hover:bg-muted transition-colors border border-transparent hover:border-border"
              >
                <span className="font-mono text-xs text-muted-foreground mr-2">
                  {code.hmis_code}
                </span>
                <span className="text-sm">{code.display_name}</span>
              </button>
            ))}
            {search && filteredCodes.length === 0 && (
              <p className="text-sm text-muted-foreground p-2">No matching codes</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
