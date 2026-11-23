// All strings live in dictionaries (spec §4.6, §9). English first; Luganda and
// Runyankole dictionaries can be added beside en.ts and registered here.
import { en, type Dictionary } from './en'

export type Locale = 'en'
export const DEFAULT_LOCALE: Locale = 'en'
const DICTIONARIES: Record<Locale, Dictionary> = { en }

type Leaves<T, P extends string = ''> = {
  [K in keyof T & (string | number)]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & (string | number)]

export type Key = Leaves<Dictionary>
export type TFn = (key: Key, vars?: Record<string, string | number>) => string

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: unknown = dict
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** Returns the key itself when a string is missing, so gaps are visible in the UI and in tests. */
export function createT(locale: Locale = DEFAULT_LOCALE): TFn {
  const dict = DICTIONARIES[locale] ?? en
  return (key, vars) => {
    const template = lookup(dict, key) ?? lookup(en, key) ?? key
    if (!vars) return template
    return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`))
  }
}

export const t = createT()
