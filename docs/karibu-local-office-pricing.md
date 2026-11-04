# Karibu local offices: pricing model

**Date:** 2026-11-03
**Status:** Draft for Nate + Javis. These are the first prices to quote, not final ones.
**Inputs:** Javis's competitor research (email, 2026-10-26), `karibu-os-strategic-direction.md`, `karibu-os-market-research.md`
**Code:** `packages/shared/src/pricing.ts` (price book, country localization, office registry). Page: `/local/[office]` (first office: `/local/uganda`; `/local/masaka` permanently redirects there).
**Supersedes:** the editions and weekly UGX 2,500–15,000 targets in `karibu-os-strategic-direction.md` §3–4. That doc's free tier is not part of this price list. Revisit it if a free tier is wanted for clinician-led adoption.

---

## 1. The model in one paragraph

Karibu sets **one USD price book**, per facility per month: **Core $15, Full $30, Pro $60**. Each country gets **one local price book**, which is the USD price converted at a fixed FX anchor and rounded to a clean local number. A **local office** sells, sets up, trains and supports facilities in its territory. **The office bills the facility directly and keeps 100% of it**: subscription, setup and training. There is no revenue share with Karibu.

## 2. Rules

1. **Charge per facility, not per seat.** Every staff member is included. Features come with the tier, and there are no add-on modules.
2. **Three tiers:** Core $15 (outpatient, billing, data), Full $30 (everything, pharmacy included), Pro $60 (Full plus unlimited patients and extra storage). Pro is the only usage-based step.
3. **Pharmacy comes with Full.** A health centre usually runs a pharmacy, so it isn't a second bill.
4. **Never lock records.** If a facility lapses, it drops to read-only.
5. **Set local prices on purpose.** We don't float them with live FX. `pricing.test.ts` fails if any local price drifts more than 15% from USD × FX anchor. When that trips, we reset the country's book deliberately and tell its offices.
6. **Annual = 10 months.** Pay 10 months, get 12.

## 3. Price book

| Tier | USD / month | Uganda (UGX / month) | UGX / year | Patients | Includes |
|---|---|---|---|---|---|
| Karibu Core | $15 | 65,000 | 650,000 | up to 10,000 | Records, OPD notes + dictation, billing + receipts, reports/data |
| Karibu Full | $30 | 130,000 | 1,300,000 | up to 10,000 | Core + lab, pharmacy/stock, inpatient, HMIS 105 |
| Karibu Pro | $60 | 260,000 | 2,600,000 | unlimited | Full + extra storage |
| Setup (once) | $40 | 150,000 | — | | Install, configure catalogs, 1 training day on site |
| Extra on-site training day | $13 | 50,000 + transport | — | | |

The FX anchor is **4,300 UGX/USD**. Mid-market rates ran 4,250–4,345 from 2026-10-31 to 11-03; XE showed 4,279.73 on 11-03. The first draft used 3,700, which was stale. Subscriptions sit within about 1% of the straight conversion.

The UGX 150,000 setup fee is 13% under $40 × 4,300. I kept it there on purpose because it matches what Javis proposed and what Clinic Pro charges. Online and phone support is free.

**Not built yet:** patient caps and storage tiers aren't enforced in the product, and "extra storage" has no number yet.

## 4. Against the market (Javis's research, small-clinic tier)

| Provider | Advertised price | Basis |
|---|---|---|
| Clinic Pro System | UGX 100,000/mo for 6 staff, plus 150,000 setup | per user |
| CuraHMS | UGX 150,000/mo, up to 3 users | per facility, user-capped |
| Dashlead Standard | UGX 150,000/mo | per facility |
| Glide HMIS Starter | UGX 200,000/mo, implementation extra | per facility, user-capped |
| HMS Health | US$20/user/mo ≈ UGX 86,000/user, plus $500–1,200 setup | per user |
| **Karibu Core / Full** | **UGX 65,000 / 130,000 per month, unlimited staff** | **per facility** |

Full, which includes lab, pharmacy and inpatient, still costs less than every small-clinic competitor's entry price except Clinic Pro. Clinic Pro's 100,000 is for 6 staff and rises with every user it adds.

## 5. What a local office earns

The office keeps everything it bills.

| Office book | Subscriptions to the office / month | One-time setup to the office |
|---|---|---|
| 5 Full | UGX 650,000 (~$150) | UGX 750,000 |
| 5 Full + 5 Core | UGX 975,000 (~$230) | UGX 1,500,000 |
| 10 Full | UGX 1,300,000 (~$300) | UGX 1,500,000 |
| 20 Full + 5 Pro | UGX 3,900,000 (~$900) | UGX 3,750,000 |

`officeMonthlyRevenue()` in `pricing.ts` computes these figures.

## 6. Adding a country or an office

- **New office in an existing country:** add a `LocalOffice` entry to `LOCAL_OFFICES` with a slug, territory, lead and contact. The page at `/local/<slug>` is generated automatically.
- **New country:** add a `CountryPriceBook` with its currency, FX anchor and rounded prices. The tests enforce the 15% tolerance and that editions stay in the same price order.

## 7. Open decisions (Nate + Javis)

1. **Patient cap and storage.** Is 10,000 registered patients the right Core/Full cap? How much storage do Core/Full include, and how much does Pro add?
2. **Weekly payment.** Should offices also offer weekly payment (Full ≈ UGX 32,500/week), or keep monthly + annual only?
3. **Bureau pricing.** For UCMB/UPMB facilities, do we offer an annual per-facility price for many facilities at once? If so, who sells it, the local office or Karibu?
4. **Territory exclusivity.** Is Masaka exclusive to Javis's office, and what happens when a Masaka clinic signs up on its own?
