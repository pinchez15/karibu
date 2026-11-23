// WhatsApp is the channel (spec §4.5): anything a partner might send gets a
// one-tap share link. wa.me needs digits only, with the country code.

export function officeUrl(path = ''): string {
  return `${(process.env.NEXT_PUBLIC_OFFICE_URL ?? '').replace(/\/$/, '')}${path}`
}

export function ehrUrl(path = ''): string {
  return `${(process.env.NEXT_PUBLIC_EHR_URL ?? '').replace(/\/$/, '')}${path}`
}

/** "+256 700 123456" or "0700123456" -> "256700123456". Returns null if it can't be a phone number. */
export function waDigits(phone: string | null | undefined, defaultCountryCode = '256'): string | null {
  if (!phone) return null
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = defaultCountryCode + d.slice(1)
  return d.length >= 10 && d.length <= 15 ? d : null
}

/** A link that opens WhatsApp with the message ready. No phone = the person picks the chat. */
export function waLink(text: string, phone?: string | null): string {
  const digits = waDigits(phone)
  return `https://wa.me/${digits ?? ''}?text=${encodeURIComponent(text)}`
}
