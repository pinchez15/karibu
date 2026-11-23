// Amounts are stored in minor units with an ISO 4217 code. UGX has no minor
// unit, so 20000 means UGX 20,000.
const EXPONENT: Record<string, number> = { UGX: 0, RWF: 0, TZS: 2, KES: 2, ZAR: 2, USD: 2 }

export function exponent(currency: string): number {
  return EXPONENT[currency] ?? 2
}

export function fromMinor(amount: number, currency: string): number {
  return amount / 10 ** exponent(currency)
}

export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** exponent(currency))
}

export function money(amount: number, currency: string): string {
  const digits = exponent(currency)
  const value = fromMinor(amount, currency).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${currency} ${value}`
}
