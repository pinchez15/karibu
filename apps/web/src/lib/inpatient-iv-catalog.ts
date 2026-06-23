/** IV fluids and additives commonly available at Ugandan HC III level. */

export type IvFluidOption = { id: string; label: string }
export type IvAdditiveOption = { id: string; label: string; fluidTypes?: string[] }

export const IV_FLUIDS: IvFluidOption[] = [
  { id: 'normal_saline', label: 'Normal saline 0.9%' },
  { id: 'ringers_lactate', label: "Ringer's lactate (Hartmann's)" },
  { id: 'd5', label: 'Dextrose 5%' },
  { id: 'd10', label: 'Dextrose 10%' },
  { id: 'half_normal', label: 'Half-normal saline 0.45%' },
  { id: 'd5_ns', label: 'D5 in normal saline' },
]

export const IV_ADDITIVES: IvAdditiveOption[] = [
  { id: 'none', label: 'None (fluid only)' },
  { id: 'vit_b_complex', label: 'Vitamin B complex' },
  { id: 'vit_c', label: 'Vitamin C' },
  { id: 'ceftriaxone', label: 'Ceftriaxone' },
  { id: 'metronidazole', label: 'Metronidazole' },
  { id: 'artesunate', label: 'Artesunate (severe malaria)' },
  { id: 'quinine', label: 'Quinine' },
  { id: 'oxytocin', label: 'Oxytocin (PPH)' },
  { id: 'magnesium_sulphate', label: 'Magnesium sulphate' },
  { id: 'other', label: 'Other (specify in notes)' },
]

export const IV_VOLUME_PRESETS_ML = [500, 1000, 2000] as const

export function fluidLabel(id: string): string {
  return IV_FLUIDS.find((f) => f.id === id)?.label ?? id
}

export function additiveLabel(id: string | null): string | null {
  if (!id || id === 'none') return null
  return IV_ADDITIVES.find((a) => a.id === id)?.label ?? id
}

/** Estimate ml remaining from start time and rate (no pump — nurse eyeballs drip). */
export function estimateMlRemaining(
  volumeMl: number,
  rateMlHr: number | null,
  startedAt: string,
  now = Date.now(),
): number | null {
  if (!rateMlHr || rateMlHr <= 0) return null
  const elapsedHr = (now - new Date(startedAt).getTime()) / 3_600_000
  return Math.max(0, Math.round(volumeMl - elapsedHr * rateMlHr))
}

export function hoursRemaining(
  volumeMl: number,
  rateMlHr: number | null,
  startedAt: string,
  now = Date.now(),
): number | null {
  const remaining = estimateMlRemaining(volumeMl, rateMlHr, startedAt, now)
  if (remaining == null || !rateMlHr) return null
  return remaining / rateMlHr
}
