import { RpcError } from './db'
import type { TFn } from '@/i18n'

export function text(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Turns a database error into a sentence for the person. Known codes are
 * raised as the exception message (e.g. PARTNER_FEE_LAPSED) and translated;
 * anything else falls back to the hint or the message.
 */
export function errorMessage(error: unknown, t: TFn): string {
  if (error instanceof RpcError) {
    const key = `errors.${error.message}`
    const translated = t(key as never)
    if (translated !== key) return translated
    return error.hint ?? error.message
  }
  return t('errors.generic')
}
