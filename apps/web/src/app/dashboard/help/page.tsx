import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { WebTopBar } from '@/components/web-shell'
import { getStaff } from '@/lib/auth'
import { requestHelpAction } from './actions'

const CATEGORIES: [string, string][] = [
  ['how_to', 'How do I do something?'],
  ['bug', 'Something is not working'],
  ['sync', 'My phone is not syncing'],
  ['printing', 'Printing'],
  ['access', 'Signing in or passwords'],
  ['billing', 'Billing or receipts'],
  ['other', 'Something else'],
]

type Props = { searchParams: Promise<{ sent?: string; error?: string }> }

export default async function HelpPage({ searchParams }: Props) {
  const staff = await getStaff()
  if (!staff) redirect('/no-access')
  const { sent, error } = await searchParams
  const referer = (await headers()).get('referer') ?? ''
  let from = ''
  try {
    from = new URL(referer).pathname
  } catch {
    from = ''
  }

  return (
    <>
      <WebTopBar title="Get help" subtitle="SUPPORT" />
      <div className="max-w-xl flex-1 space-y-6 overflow-auto p-6">
        {sent ? (
          <div className="rounded-xl border border-green/30 bg-green-soft p-4 text-sm text-green">
            <p className="font-semibold">Your request has been sent.</p>
            <p>Your Karibu office will contact you, usually by phone or WhatsApp.</p>
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-red/30 bg-red-soft p-4 text-sm text-red">
            We could not send that. Describe the problem in a sentence or two and try again.
          </div>
        ) : null}

        <form action={requestHelpAction} className="space-y-4 rounded-xl border border-border bg-card p-4">
          <input type="hidden" name="from" value={from} />
          <div className="space-y-1.5">
            <label htmlFor="help-category">What do you need help with?</label>
            <select id="help-category" name="category" className="w-full rounded-lg border border-input bg-input-background px-3 py-2.5 text-[15px]">
              {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="help-body">Describe the problem</label>
            <textarea
              id="help-body" name="body" required minLength={5} maxLength={4000} rows={5}
              className="w-full rounded-lg border border-input bg-input-background px-3 py-2.5 text-[15px]"
              placeholder="What were you trying to do, and what happened?"
            />
          </div>
          <p className="rounded-lg bg-amber-soft p-3 text-sm text-amber-ink">
            Do not include patient names, numbers or any patient details. Your Karibu office supports
            the software and is not allowed to see patient information.
          </p>
          <Button type="submit">Send request</Button>
        </form>
      </div>
    </>
  )
}
