'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ANNUAL_MONTHS_CHARGED, EDITIONS, EDITION_IDS, PRICE_BOOKS, type EditionId } from '@karibu/shared'
import { getOfficeScope } from '@/lib/auth'
import { monthLabel } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { errorMessage, text } from '@/lib/form'
import { parseMomoSms, splitMessages, type MomoMethod } from '@/lib/momo'
import { toMinor } from '@/lib/money'
import { getHome } from '@/lib/office'
import { statementRowsFromCsv } from '@/lib/statement'
import { t } from '@/i18n'

type RecordResult = { status: 'matched' | 'suggested' | 'unmatched' | 'duplicate' | 'error' }

function go(path: string, params: Record<string, string> = {}): never {
  const q = new URLSearchParams(params).toString()
  redirect(q ? `${path}?${q}` : path)
}

const isRedirect = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e

function summarize(results: RecordResult[], extraErrors = 0): Record<string, string> {
  const count = (s: RecordResult['status']) => results.filter((r) => r.status === s).length + (s === 'error' ? extraErrors : 0)
  const parts = (['matched', 'suggested', 'unmatched', 'duplicate', 'error'] as const)
    .filter((s) => count(s) > 0)
    .map((s) => t(`money.result.${s}`, { n: count(s) }))
  const good = count('matched') + count('suggested') + count('unmatched')
  return good > 0 ? { ok: parts.join(' · ') } : { error: parts.join(' · ') || t('errors.generic') }
}

export async function recordSmsAction(slug: string, form: FormData) {
  const scope = await getOfficeScope(slug)
  const path = `/o/${slug}/money`
  const fallback = (text(form, 'network') === 'airtel' ? 'airtel' : 'momo_mtn') as MomoMethod
  const messages = splitMessages(String(form.get('sms') ?? ''))
  if (messages.length === 0) go(path, { error: t('money.noAmount') })

  const results: RecordResult[] = []
  let firstProblem: string | null = null
  for (const message of messages.slice(0, 30)) {
    const parsed = parseMomoSms(message, fallback)
    if (!parsed.ok) {
      firstProblem ??= parsed.reason === 'not_received' ? t('money.notReceived') : t('money.noAmount')
      results.push({ status: 'error' })
      continue
    }
    const { payment } = parsed
    try {
      results.push(await rpc<RecordResult>('office_payment_record', {
        p_office_id: scope.office_id,
        // UGX has no minor unit; toMinor keeps this right for currencies that do.
        p_payment: { ...payment, amount: toMinor(payment.amount, payment.currency) },
      }))
    } catch {
      results.push({ status: 'error' })
    }
  }
  revalidatePath(path)
  const summary = summarize(results)
  go(path, messages.length === 1 && firstProblem ? { error: firstProblem } : summary)
}

export async function recordManualAction(slug: string, form: FormData) {
  const scope = await getOfficeScope(slug)
  const path = text(form, 'return_to') || `/o/${slug}/money`
  const { office } = await getHome(scope.office_id)
  const amount = Number(text(form, 'amount').replace(/[^0-9.]/g, ''))
  let result: RecordResult
  try {
    result = await rpc<RecordResult>('office_payment_record', {
      p_office_id: scope.office_id,
      p_payment: {
        amount: toMinor(amount, office.currency), method: text(form, 'method') || 'cash',
        reference: text(form, 'reference'), invoice_id: text(form, 'invoice_id'), paid_at: text(form, 'paid_on'),
      },
    })
  } catch (e) {
    go(path, { error: errorMessage(e, t) })
  }
  revalidatePath(`/o/${slug}/money`, 'layout')
  go(path, summarize([result]))
}

export async function importStatementAction(slug: string, form: FormData) {
  const scope = await getOfficeScope(slug)
  const path = `/o/${slug}/money`
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0 || file.size > 1_000_000) go(path, { error: t('money.statementHint') })
  try {
    const method = text(form, 'method')
    const { rows, skipped } = statementRowsFromCsv(await file.text(), method === 'momo_mtn' || method === 'airtel' ? method : 'bank')
    if (rows.length === 0) go(path, { error: t('money.statementHint') })
    const results = await rpc<RecordResult[]>('office_payments_import', { p_office_id: scope.office_id, p_rows: rows.slice(0, 500) })
    revalidatePath(path)
    go(path, summarize(results, skipped))
  } catch (e) {
    if (isRedirect(e)) throw e
    go(path, { error: e instanceof Error && e.message === 'NO_AMOUNT_COLUMN' ? t('money.statementHint') : errorMessage(e, t) })
  }
}

export async function matchPaymentAction(slug: string, form: FormData) {
  await getOfficeScope(slug)
  const path = `/o/${slug}/money`
  const intent = text(form, 'intent')
  try {
    if (intent === 'remove') await rpc('office_payment_remove', { p_payment_id: text(form, 'payment_id') })
    else await rpc('office_payment_match', { p_payment_id: text(form, 'payment_id'), p_invoice_id: text(form, 'invoice_id') || null })
  } catch (e) {
    go(path, { error: errorMessage(e, t) })
  }
  revalidatePath(path, 'layout')
  go(path, { ok: t('common.saved') })
}

export async function generateMonthAction(slug: string) {
  const scope = await getOfficeScope(slug)
  const path = `/o/${slug}/money`
  const { office } = await getHome(scope.office_id)
  const book = PRICE_BOOKS[office.country]
  let result: { created: number; no_plan: string[] }
  try {
    // Prices come from the country price book in packages/shared, the single source.
    result = await rpc('office_invoices_generate', {
      p_office_id: scope.office_id,
      p_period: new Date().toISOString().slice(0, 10),
      p_monthly: Object.fromEntries(EDITION_IDS.map((id) => [id, toMinor(book.monthly[id], book.currency)])),
      p_names: Object.fromEntries(EDITION_IDS.map((id) => [id, EDITIONS[id].name])),
    })
  } catch (e) {
    go(path, { error: errorMessage(e, t) })
  }
  revalidatePath(path)
  const params: Record<string, string> = { ok: t('money.runMonthResult', { n: result.created }) }
  if (result.no_plan.length > 0) params.error = t('money.runMonthNoPlan', { names: result.no_plan.join(', ') })
  go(path, params)
}

export async function createInvoiceAction(slug: string, form: FormData) {
  const scope = await getOfficeScope(slug)
  const base = `/o/${slug}/money/invoices`
  const accountId = text(form, 'account_id')
  const retry = (error: string): never => go(`${base}/new`, { clinic: accountId, error })
  const { office } = await getHome(scope.office_id)
  const book = PRICE_BOOKS[office.country]
  const minor = (n: number) => toMinor(n, book.currency)
  const lines: { kind: string; description: string; quantity: number; unit_amount: number }[] = []
  let periodStart: string | null = null

  if (form.get('subscription') === 'on') {
    const tier = text(form, 'tier') as EditionId
    if (!EDITION_IDS.includes(tier)) retry(t('invoice.needPlan'))
    const month = `${text(form, 'month') || new Date().toISOString().slice(0, 7)}-01`
    const annual = text(form, 'term') === 'annual'
    periodStart = month
    lines.push({
      kind: 'subscription',
      description: annual
        ? t('invoice.lineAnnual', { plan: EDITIONS[tier].name, month: monthLabel(month), charged: ANNUAL_MONTHS_CHARGED })
        : t('invoice.lineSubscription', { plan: EDITIONS[tier].name, month: monthLabel(month) }),
      quantity: annual ? ANNUAL_MONTHS_CHARGED : 1,
      unit_amount: minor(book.monthly[tier]),
    })
    // Remember the plan on the clinic so the monthly run can bill it.
    await rpc('office_clinic_update', { p_account_id: accountId, p_patch: { tier } }).catch(() => {})
  }
  if (form.get('setup') === 'on') lines.push({ kind: 'setup', description: t('invoice.lineSetup'), quantity: 1, unit_amount: minor(book.setup) })
  const days = Math.min(30, Math.max(0, Number(text(form, 'training_days')) || 0))
  if (days > 0) lines.push({ kind: 'training', description: t('invoice.lineTraining'), quantity: days, unit_amount: minor(book.extraTrainingDay) })
  const otherAmount = Number(text(form, 'other_amount').replace(/[^0-9.]/g, ''))
  if (text(form, 'other_description') && otherAmount > 0) {
    lines.push({ kind: 'other', description: text(form, 'other_description'), quantity: 1, unit_amount: minor(otherAmount) })
  }
  if (!accountId) retry(t('invoice.chooseClinic'))
  if (lines.length === 0) retry(t('invoice.needLine'))

  let invoice: { id: string }
  try {
    invoice = await rpc('office_invoice_create', {
      p_account_id: accountId, p_lines: lines, p_period_start: periodStart, p_due_date: text(form, 'due_date') || null,
    })
  } catch (e) {
    retry(errorMessage(e, t))
  }
  revalidatePath(`/o/${slug}/money`, 'layout')
  go(`${base}/${invoice!.id}`)
}

export async function invoiceAction(slug: string, invoiceId: string, form: FormData) {
  await getOfficeScope(slug)
  const path = `/o/${slug}/money/invoices/${invoiceId}`
  try {
    if (text(form, 'intent') === 'void') await rpc('office_invoice_void', { p_invoice_id: invoiceId, p_reason: text(form, 'reason') })
    else await rpc('office_invoice_send', { p_invoice_id: invoiceId, p_via: 'whatsapp', p_efris_reference: text(form, 'efris_reference') || null })
  } catch (e) {
    go(path, { error: errorMessage(e, t) })
  }
  revalidatePath(`/o/${slug}`, 'layout')
  go(path, { ok: t('common.saved') })
}
