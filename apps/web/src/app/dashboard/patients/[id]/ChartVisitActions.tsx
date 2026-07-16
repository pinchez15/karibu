'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FlaskConical, Loader2, Pill, Stethoscope } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { VisitPharmacyPanel } from '@/components/prescription/VisitPharmacyPanel'
import { VisitLabPanel } from '@/components/lab/VisitLabPanel'
import { CLINICAL_ROLES } from '@/lib/staff-roles'
import type { PharmacyCatalogDrug, StaffRole } from '@karibu/shared'
import { ensureVisitForChartAction, type ActiveVisitSummary } from './actions'

// Who sees "Start visit": the clinical desk roles plus the clinic in-charge.
// Mirrors VISIT_START_ROLES in ./actions.ts (the server-side gate).
const VISIT_START_ROLES = new Set<StaffRole>(['admin', ...CLINICAL_ROLES])

// Who sees "New script" / "Order lab" — matches the client gates inside
// VisitPharmacyPanel / VisitLabPanel and the server-side role checks in
// submitPharmacyOrder / submitLabOrder (and rpc_submit_pharmacy_order), so a
// visit is never created for someone who then can't place the order.
const ORDERING_ROLES = new Set<StaffRole>([
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
])

type OrderSheetKind = 'script' | 'lab'

type EnsuredVisit = {
  visitId: string
  pharmacyOrderSubmitted: boolean
}

/**
 * Patient-centric chart actions: start (or open) today's visit, write a quick
 * script, or order a lab — all from the chart, without going through the
 * queue toolbar. Every path funnels through ensureVisitForChartAction, which
 * reuses today's open visit or creates + self-claims a new one.
 */
export function ChartVisitActions({
  patientId,
  staffRole,
  activeVisit: initialActiveVisit,
  prescribingCatalog,
  onOrderSubmitted,
}: {
  patientId: string
  staffRole: StaffRole
  activeVisit: ActiveVisitSummary | null
  prescribingCatalog?: PharmacyCatalogDrug[]
  onOrderSubmitted?: () => void
}) {
  const router = useRouter()
  const [activeVisit, setActiveVisit] = useState(initialActiveVisit)
  const [orderSheet, setOrderSheet] = useState<OrderSheetKind | null>(null)
  const [ensured, setEnsured] = useState<EnsuredVisit | null>(null)
  const [ensureError, setEnsureError] = useState<string | null>(null)
  const [ensurePending, startEnsureTransition] = useTransition()
  // Idempotency id forwarded to check_in_patient (p_client_op_id): one per
  // creation intent, reused on retry so a flaky connection can't create the
  // visit twice. Cleared once the server confirms a visit.
  const opIdRef = useRef<string | null>(null)

  const canStartVisit = VISIT_START_ROLES.has(staffRole)
  const canOrder = ORDERING_ROLES.has(staffRole)

  const runEnsure = useCallback(
    (onSuccess: (visit: EnsuredVisit) => void) => {
      setEnsureError(null)
      if (!opIdRef.current) opIdRef.current = crypto.randomUUID()
      const clientOpId = opIdRef.current
      startEnsureTransition(async () => {
        const res = await ensureVisitForChartAction({
          patient_id: patientId,
          client_op_id: clientOpId,
        })
        if (!res.success) {
          setEnsureError(res.error)
          return
        }
        opIdRef.current = null
        setActiveVisit(
          (prev) =>
            prev ?? {
              id: res.visitId,
              status: 'pending',
              pharmacy_order_submitted_at: null,
            },
        )
        onSuccess({
          visitId: res.visitId,
          pharmacyOrderSubmitted: res.pharmacyOrderSubmitted,
        })
      })
    },
    [patientId],
  )

  const handleStartVisit = () => {
    // Already an open visit today — offer to open it rather than duplicating.
    if (activeVisit) {
      router.push(`/dashboard/visits/${activeVisit.id}`)
      return
    }
    runEnsure((visit) => router.push(`/dashboard/visits/${visit.visitId}`))
  }

  const ensureForSheet = useCallback(() => {
    setEnsured(null)
    runEnsure((visit) => setEnsured(visit))
  }, [runEnsure])

  const openOrderSheet = (kind: OrderSheetKind) => {
    setOrderSheet(kind)
    ensureForSheet()
  }

  const closeOrderSheet = () => {
    setOrderSheet(null)
    setEnsured(null)
    setEnsureError(null)
  }

  const handleOrderSubmitted = () => {
    closeOrderSheet()
    onOrderSubmitted?.()
  }

  if (!canStartVisit && !canOrder) return null

  const startVisitBusy = ensurePending && orderSheet === null

  return (
    <>
      {canStartVisit && (
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={handleStartVisit}
          disabled={startVisitBusy}
        >
          {startVisitBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Stethoscope className="w-4 h-4" />
          )}
          {activeVisit ? "Open today's visit" : 'Start visit'}
        </Button>
      )}
      {canOrder && (
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => openOrderSheet('script')}
        >
          <Pill className="w-4 h-4" />
          New script
        </Button>
      )}
      {canOrder && (
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => openOrderSheet('lab')}
        >
          <FlaskConical className="w-4 h-4" />
          Order lab
        </Button>
      )}

      {ensureError && orderSheet === null && (
        <span className="text-xs text-destructive">{ensureError}</span>
      )}

      <Sheet
        open={orderSheet !== null}
        onOpenChange={(open) => {
          if (!open) closeOrderSheet()
        }}
      >
        <SheetContent
          side="right"
          className="!w-full sm:!max-w-md md:!max-w-lg overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>
              {orderSheet === 'lab' ? 'Order lab' : 'New script'}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {orderSheet === 'lab'
                ? "Orders against today's visit — reused if one is already open."
                : "Prescribes against today's visit — reused if one is already open."}
            </p>
          </SheetHeader>

          <div className="px-4 pb-6 space-y-4">
            {ensurePending && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Preparing today&apos;s visit…
              </p>
            )}

            {ensureError && !ensurePending && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive space-y-2">
                <p>{ensureError}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={ensureForSheet}
                >
                  Try again
                </Button>
              </div>
            )}

            {ensured && orderSheet === 'script' && (
              <VisitPharmacyPanel
                visitId={ensured.visitId}
                alreadySubmitted={ensured.pharmacyOrderSubmitted}
                staffRole={staffRole}
                prescribingCatalog={prescribingCatalog}
                onSubmitted={handleOrderSubmitted}
              />
            )}

            {ensured && orderSheet === 'lab' && (
              <VisitLabPanel
                visitId={ensured.visitId}
                staffRole={staffRole}
                onSubmitted={handleOrderSubmitted}
              />
            )}

            {ensured && (
              <Link
                href={`/dashboard/visits/${ensured.visitId}`}
                className="inline-block text-xs text-primary hover:underline"
              >
                Open the full visit
              </Link>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
