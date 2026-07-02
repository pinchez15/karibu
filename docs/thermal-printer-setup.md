# Thermal printer setup

Clinic admins configure thermal printing at **Admin → Thermal printer**
(`/dashboard/admin/printer`). Settings live in `clinic_print_settings` and apply to
visit summaries, billing receipts, and pharmacy slips via `ReceiptShell`.

Manual wizard today: connect hardware → print test receipt → verify alignment/cut → save.

---

## Future idea (not scheduled): AI calibration loop

**Status:** Parked — worth revisiting; most building blocks already exist. Do not
implement unless explicitly prioritized.

### Concept

Close the setup loop so clinics never tune margins by guesswork:

1. Print the standard test receipt (`/dashboard/admin/printer/test`).
2. Staff photograph the physical slip **in the app** (camera upload).
3. **Gemini vision** analyzes the image against the known test layout:
   - left/right offset (centering)
   - cut position relative to “CUT SHOULD BE BELOW” footer
   - right-edge truncation
   - wrong paper width (58 vs 80mm mismatch)
4. App **proposes or applies** corrections to `clinic_print_settings`
   (`paper_width_mm`, `cut_feed_mm`) and prompts re-print until pass.

### Why it could be magical

Rural clinics get varied drivers and hardware. A photo-based feedback loop removes
“call support” friction and matches Karibu’s goal: cheap thermal rolls as the
patient’s temporary paper record (visit summary + payment proof), not just a
retail receipt.

### Infrastructure we already have

| Piece | Where |
|-------|--------|
| Test receipt with known ground truth | `ThermalTestReceipt.tsx` |
| Per-clinic tunables | `clinic_print_settings` |
| Server-side Gemini | `lib/ai/gemini.ts`, clinical assist patterns |
| Image upload patterns | Supabase storage (corpus, etc.) |
| Admin-only RPC/actions | `admin/printer/actions.ts` |

### Open questions before building

- Phone camera vs laptop webcam (Android app vs web dashboard)?
- Auto-apply settings vs “suggested fix” with admin confirm?
- Liability if AI mis-calibrates — always show before/after preview?
- Offline clinic: queue photo, calibrate when synced?

### Rough implementation sketch (when/if)

- New step 2.5 in `PrinterSetupClient`: “Upload photo of test print”
- Route `POST /api/admin/printer/calibrate` — vision prompt with expected
  section markers + returned JSON `{ paperWidthMm?, cutFeedMm?, issues[] }`
- Reuse test print → photo → adjust → re-test until checklist passes
