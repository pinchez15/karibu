'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { CareTaskType, StaffRole } from '@karibu/shared'
import { createCareTask } from './actions'

const TASK_TYPES: { value: CareTaskType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'lab_followup', label: 'Lab follow-up' },
  { value: 'phone_callback', label: 'Phone callback' },
  { value: 'home_visit', label: 'Home visit' },
  { value: 'medication_review', label: 'Medication review' },
  { value: 'referral_followup', label: 'Referral follow-up' },
]

const ASSIGNEE_ROLES: { value: StaffRole; label: string }[] = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'clinical_officer', label: 'Clinical officer' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'midwife', label: 'Midwife' },
  { value: 'lab_tech', label: 'Lab tech' },
  { value: 'dispenser', label: 'Dispenser' },
]

export function AddCareTaskSheet({
  open,
  onOpenChange,
  patientId,
  visitId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  visitId?: string | null
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskType, setTaskType] = useState<CareTaskType>('general')
  const [assigneeRole, setAssigneeRole] = useState<StaffRole | ''>('')
  const [dueAt, setDueAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function reset() {
    setTitle('')
    setDescription('')
    setTaskType('general')
    setAssigneeRole('')
    setDueAt('')
    setError(null)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add care task</SheetTitle>
        </SheetHeader>
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            start(async () => {
              const result = await createCareTask({
                patientId,
                visitId: visitId ?? null,
                taskType,
                title,
                description: description || null,
                assigneeRole: assigneeRole || null,
                dueAt: dueAt ? new Date(dueAt).toISOString() : null,
              })
              if (!result.success) {
                setError(result.error)
                return
              }
              onOpenChange(false)
              reset()
              router.refresh()
            })
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-type">Type</Label>
            <select
              id="task-type"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as CareTaskType)}
            >
              {TASK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-assignee">Assignee role (optional)</Label>
            <select
              id="task-assignee"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={assigneeRole}
              onChange={(e) => setAssigneeRole(e.target.value as StaffRole | '')}
            >
              <option value="">Any / unassigned</option>
              {ASSIGNEE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-due">Due date (optional)</Label>
            <Input
              id="task-due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Description (optional)</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending || !title.trim()}>
            {pending ? 'Saving…' : 'Create task'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
