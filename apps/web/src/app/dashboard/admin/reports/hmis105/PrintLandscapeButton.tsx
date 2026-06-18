'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Landscape single-page print for the HMIS 105 grid (#11) — the data tech
// hand-enters into the national system and cross-checks against the printout.
// Page-level @media print rules (in the HMIS page) set landscape + hide chrome.
export function PrintLandscapeButton() {
  return (
    <Button variant="outline" size="sm" className="no-print gap-2" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Print (landscape)
    </Button>
  )
}
