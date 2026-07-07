# WP3 — Pharmacy stock maturation (batches, packs, stock-take, requisitions, barcode-ready)

**Priority:** P1 · **Platforms:** web-first (stock mgmt is tier WEB per platform
contract); Android keeps read-only stock + offline dispense decrement.
**Theme:** Move from "digitized paper stock board" to a trustworthy long-term inventory
ledger, in five independent steps. Each step ships alone.

---

## Problem (verified)

- `pharmacy_stock_items` (043 ~L34–56) is one flat row per drug+strength+formulation
  with a SINGLE `batch_number`/`expires_at` — a second batch with a different expiry has
  nowhere to live; bulk import OVERWRITES item-level batch/expiry
  (`admin/stock-import/actions.ts` ~L68–102). Manual movements can carry batch/expiry
  but don't update the item.
- No pack/container modeling anywhere; receiving asks for a single "Qty" in whatever
  unit (`PharmacyStockClient.tsx` ~L424–427); import template uses colloquial units
  ("bottles"). This is the "13 vials / 12 bottles with unknown pill counts" problem.
- No FEFO; stock match at dispense is name/code only (`pharmacy-stock-match.ts`).
- No stock-take/count flow; only free-form `adjusted` movements.
- Transfers (`transferred_in/out`) have no counterpart clinic reference.
- No requisition/order-to-supplier concept; `supplier` is free text.
- No barcode/GTIN fields anywhere.
- Catalog: `medication_catalog` (~29–31 active drugs, internal codes like `AL`, `AMOX`)
  + `clinic_pharmacy_formulary` overlay (080) — the two-layer split is the RIGHT shape
  for 2,000 clinics; it lacks national coding (EMHSLU/NMS) and pack/barcode fields.
- Note: **lab stock already models batches** (`UNIQUE(clinic_id, test_name,
  batch_number)`, 043 ~L112) — use it as the in-repo pattern reference.

## Deliverables

### Step 1 — Batches as rows (keystone)

1. **Migration:** `pharmacy_stock_batches(id, stock_item_id FK, batch_number,
   expires_at, quantity_on_hand NUMERIC, received_at, supplier, active)`.
   `pharmacy_stock_items.quantity_on_hand` becomes derived (SUM of active batches) —
   maintain via trigger or recompute in RPCs; keep the column for read compatibility.
   Backfill: existing item quantity → one synthetic batch carrying the item's current
   `batch_number`/`expires_at`.
2. Movements gain optional `batch_id`. Receiving (manual + import) creates/updates a
   batch row instead of overwriting item fields. Dispense decrements a batch.
3. **FEFO suggestion at dispense:** worksheet's stock match proposes the
   earliest-expiring batch with sufficient quantity; dispenser can override.
4. **Expiring-soon report** (web): batches expiring within 30/60/90 days — high value in
   NMS/donated supply chains where expiry write-offs are audited.
5. Android: batch awareness is OPTIONAL v1 — offline dispense may decrement the item
   aggregate; server reconciles against FEFO batch on sync. Document this simplification.

### Step 2 — Pack ↔ dispensing-unit conversion

6. **Migration:** `pack_size NUMERIC` + `pack_unit TEXT` on `pharmacy_stock_items` (and
   catalog defaults — see Step 4). Receiving UI accepts "13 × bottle of 100 tablets" and
   stores 1,300 tablets; keep colloquial entry, convert at the boundary. Import template
   gains `pack_size`/`pack_unit` columns.

### Step 3 — Monthly stock-take

7. **Migration:** `stock_takes(id, clinic_id, started_by, started_at, completed_at,
   status)` + `stock_take_lines(stock_take_id, stock_item_id, system_quantity,
   counted_quantity, variance, reason)`. Reason enum: `damaged, expired, lost, count
   error, other`.
8. Web flow: start count → count sheet (all active items, system qty hidden or shown per
   config) → complete → variances auto-post `adjusted` movements referencing the stock
   take. Mirrors the MoH stock-card discipline staff already know.

### Step 4 — Depot requisitions (in the depot's language)

9. **Migration:** `stock_requisitions(id, clinic_id, destination TEXT/depot ref, status
   draft|submitted|received|cancelled, created_by, notes)` +
   `stock_requisition_lines(requisition_id, medication_code, description snapshot —
   generic name + strength + formulation + pack, quantity_requested, quantity_received)`.
10. **Suggested quantities from consumption:** prefill each line from average monthly
    consumption computed off `pharmacy_stock_movements` (`dispensed` type, trailing 3
    months) minus on-hand — the NMS bimonthly ordering logic, free from existing data.
11. **Printable requisition** (A4 print view, existing print patterns) — the depot is
    not on Karibu; paper/PDF is the v1 interface. "Mark received" creates `received`
    movements + batches (Step 1) per line.
12. Transfers: add `counterpart_clinic_id` (nullable) to movements for future
    clinic-to-clinic transfers; requisition receiving uses `received`, not transfer.

### Step 5 — Barcode-ready schema (no scanner yet)

13. **Migration:** nullable `gtin TEXT` on `medication_catalog` and
    `pharmacy_stock_batches`. GS1 DataMatrix on pharma packs encodes GTIN + lot +
    expiry — exactly the Step 1 batch fields. When a scanner/phone-camera flow arrives
    (Android ML Kit, on-device), scan-to-receive is pure UI. Do NOT build scanning UI in
    this WP.

### Threaded through — catalog nationalization

14. Add `emhslu_code TEXT` (nullable) + pack-presentation defaults to
    `medication_catalog`; begin aligning seeded codes with Uganda EMHSLU. Expansion of
    the catalog itself (29 → full HC III list) is content work — coordinate with the
    product owner; the schema must not block it.

## Acceptance

- Two batches of amoxicillin with different expiries coexist; dispense suggests the
  earlier expiry; report shows both.
- Receiving "13 bottles × 100" yields 1,300 tablets on hand.
- A completed stock take leaves an auditable variance trail; item quantities match the
  count afterward.
- A requisition prints with each line in full presentation terms ("Cetirizine 10 mg
  tablet, tin of 500 — qty 2") with consumption-based prefill; marking it received
  creates batches.
- Existing offline Android dispense keeps working unchanged (aggregate decrement).
