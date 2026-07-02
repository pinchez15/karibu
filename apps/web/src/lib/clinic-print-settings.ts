import { createServiceClient } from '@/lib/supabase'
import {
  DEFAULT_THERMAL_LAYOUT,
  layoutFromPaperWidth,
  type PaperWidthMm,
  type ThermalPrintLayout,
} from '@/lib/thermal-print'

export type ClinicPrintSettings = ThermalPrintLayout & {
  autoPrint: boolean
  setupCompletedAt: string | null
}

export const DEFAULT_CLINIC_PRINT_SETTINGS: ClinicPrintSettings = {
  ...DEFAULT_THERMAL_LAYOUT,
  autoPrint: true,
  setupCompletedAt: null,
}

export async function getClinicPrintSettings(clinicId: string): Promise<ClinicPrintSettings> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('clinic_print_settings')
    .select('paper_width_mm, cut_feed_mm, auto_print, setup_completed_at')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (!data) return DEFAULT_CLINIC_PRINT_SETTINGS

  const paperWidthMm = (data.paper_width_mm === 80 ? 80 : 58) as PaperWidthMm
  const cutFeedMm = Number(data.cut_feed_mm ?? DEFAULT_THERMAL_LAYOUT.cutFeedMm)

  return {
    ...layoutFromPaperWidth(paperWidthMm, cutFeedMm),
    autoPrint: Boolean(data.auto_print ?? true),
    setupCompletedAt: (data.setup_completed_at as string | null) ?? null,
  }
}
