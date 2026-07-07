'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { completeCareTask } from './actions'

export function CareTaskMarkDoneButton({
  taskId,
  patientId,
}: {
  taskId: string
  patientId: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 text-xs shrink-0"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await completeCareTask(taskId, patientId)
          if (result.success) router.refresh()
        })
      }
    >
      {pending ? 'Saving…' : 'Mark done'}
    </Button>
  )
}
