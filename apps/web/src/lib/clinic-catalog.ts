import 'server-only'

import { unstable_cache } from 'next/cache'
import { createServiceClient } from './supabase'
import type { PharmacyCatalogDrug } from '@karibu/shared'

export type EnrichedFormularyItem = {
  drug_name: string
  code: string | null
  category: string | null
  display_order: number
  is_available: boolean
  notes: string | null
  aliases: string[]
  strengths: string[]
  default_frequency: string | null
  default_route: string | null
  warning_text: string | null
  formulation: string | null
  quantity_unit: string | null
}

export function clinicCatalogTag(clinicId: string): string {
  return `clinic-catalog-${clinicId}`
}

function toPharmacyCatalogDrug(item: EnrichedFormularyItem): PharmacyCatalogDrug | null {
  if (!item.code || !item.is_available) return null
  return {
    code: item.code,
    name: item.drug_name,
    aliases: item.aliases.length > 0 ? item.aliases : undefined,
    strengths: item.strengths.length > 0 ? item.strengths : [''],
    defaultFrequency: item.default_frequency ?? undefined,
    defaultRoute: item.default_route ?? undefined,
    category: item.category ?? 'Other',
    warning: item.warning_text ?? undefined,
  }
}

async function fetchClinicFormulary(clinicId: string): Promise<EnrichedFormularyItem[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_get_clinic_catalog', {
    p_clinic_id: clinicId,
  })

  if (error) {
    console.error('fetchClinicFormulary failed:', error)
    return []
  }

  const formulary = (data as { formulary?: EnrichedFormularyItem[] } | null)?.formulary ?? []
  return formulary.map((row) => ({
    ...row,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    strengths: Array.isArray(row.strengths) ? row.strengths : [],
  }))
}

/** Per-clinic prescribing catalog — cached 5 min, invalidated on inventory edits. */
export function getClinicPrescribingCatalog(clinicId: string): Promise<PharmacyCatalogDrug[]> {
  return unstable_cache(
    async () => {
      const rows = await fetchClinicFormulary(clinicId)
      return rows
        .map(toPharmacyCatalogDrug)
        .filter((d): d is PharmacyCatalogDrug => d != null)
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    },
    ['clinic-prescribing-catalog', clinicId],
    { revalidate: 300, tags: [clinicCatalogTag(clinicId)] },
  )()
}

/** Global medication reference — changes only via migration. */
export function getMedicationCatalog(): Promise<PharmacyCatalogDrug[]> {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data, error } = await supabase
        .from('medication_catalog')
        .select(
          'code, generic_name, category, aliases, strengths, default_frequency, default_route, warning_text',
        )
        .eq('active', true)
        .order('display_order')
        .order('generic_name')

      if (error) {
        console.error('getMedicationCatalog failed:', error)
        return []
      }

      return (data ?? []).map((row) => ({
        code: row.code as string,
        name: row.generic_name as string,
        aliases: (row.aliases as string[] | null) ?? undefined,
        strengths: ((row.strengths as string[] | null)?.length
          ? (row.strengths as string[])
          : ['']) as string[],
        defaultFrequency: (row.default_frequency as string | null) ?? undefined,
        defaultRoute: (row.default_route as string | null) ?? undefined,
        category: (row.category as string | null) ?? 'Other',
        warning: (row.warning_text as string | null) ?? undefined,
      }))
    },
    ['medication-catalog'],
    { revalidate: 3600, tags: ['medication-catalog'] },
  )()
}

export type InventoryDrugRow = {
  name: string
  enabled: boolean
  notes: string | null
  code: string | null
  category: string | null
  display_order: number
  active: boolean
}

/** Admin inventory view — all catalog drugs with per-clinic overlay (includes disabled). */
export function getClinicInventoryDrugs(clinicId: string): Promise<InventoryDrugRow[]> {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const [{ data: catalog }, { data: overlay }] = await Promise.all([
        supabase
          .from('medication_catalog')
          .select('code, generic_name, category, display_order')
          .eq('active', true)
          .order('display_order')
          .order('generic_name'),
        supabase
          .from('clinic_pharmacy_formulary')
          .select('drug_name, medication_code, code, category, in_stock, notes, display_order, active')
          .eq('clinic_id', clinicId),
      ])

      const overlayByCode = new Map(
        (overlay ?? []).map((row) => [
          (row.medication_code as string | null) ?? (row.code as string | null) ?? '',
          row,
        ]),
      )
      const overlayByName = new Map(
        (overlay ?? []).map((row) => [(row.drug_name as string).toLowerCase(), row]),
      )

      return (catalog ?? []).map((mc) => {
        const o =
          overlayByCode.get(mc.code as string) ??
          overlayByName.get((mc.generic_name as string).toLowerCase())
        const enabled = o ? (o.in_stock as boolean) && (o.active as boolean) !== false : true
        return {
          name: mc.generic_name as string,
          enabled,
          notes: (o?.notes as string | null) ?? null,
          code: mc.code as string,
          category: (o?.category as string | null) ?? (mc.category as string | null),
          display_order: (o?.display_order as number | null) ?? (mc.display_order as number) ?? 0,
          active: o ? (o.active as boolean) !== false : true,
        }
      })
    },
    ['clinic-inventory-drugs', clinicId],
    { revalidate: 300, tags: [clinicCatalogTag(clinicId)] },
  )()
}
