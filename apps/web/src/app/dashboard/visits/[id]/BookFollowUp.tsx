'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createFollowUp } from '@/app/dashboard/visits/actions'

// "Book follow-up" from the chart (F-SCHED). Creates an appointment that shows
// on the Today calendar.
export function BookFollowUp({ patientId }: { patientId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) {
    return <p className="text-xs font-medium text-accent">Follow-up booked</p>
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <CalendarPlus className="h-4 w-4" />
        Book follow-up
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="kh-meta block">Date</label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
      </div>
      <div className="min-w-[10rem] flex-1">
        <label className="kh-meta block">Reason</label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
      </div>
      <Button
        type="button"
        disabled={pending || !date}
        onClick={() => {
          setError(null)
          start(async () => {
            const r = await createFollowUp({ patientId, scheduledAt: date, reason })
            if (!r.success) {
              setError(r.error)
              return
            }
            setDone(true)
            router.refresh()
          })
        }}
      >
        {pending ? 'Booking…' : 'Book'}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
        Cancel
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  )
}
