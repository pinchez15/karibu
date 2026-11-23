# Karibu OS — Strategic Direction

**Date:** 2026-08-06
**Status:** Adopted direction, pending price validation with the three warm buyers
**Companion doc:** `docs/karibu-os-market-research.md` (evidence base with citations)

---

## 1. The shift

Karibu is no longer positioned as "an EMR." It is becoming the **operating system for small healthcare businesses** in markets that traditional software economics never served — starting in Uganda.

The reasoning:

- AI has collapsed the cost of building and maintaining software. We no longer need 80–90% software margins to sustain the company, so we optimize for **market penetration, not price**.
- Two months of real-world use at SSUNGA HC III produced an unusual signal for healthcare software: **voluntary, bottoms-up adoption**. Staff use Karibu independently and talk about it daily. Healthcare software is almost never loved by its users; Karibu appears to be.
- Three parties have independently asked to buy: a private clinic owner, a pharmacy owner, and diocesan leadership. A Ministry of Health lead called it better than anything he'd seen. (As of this writing, none has heard a price — see §6.)

## 2. What market research confirmed and corrected

Full evidence in `karibu-os-market-research.md`. The headlines that shaped this direction:

**Confirmed:**
- The small private clinic tier (~2,000+ facilities, avg 7 staff) is real, profitable (43% clear ≥$830/mo), and **owned by no incumbent**. UgandaEMR/eAFYA is public-sector; ClinicMaster and Stre@mline sell to hospitals; Banda Health (closest analog) has ~100 clinics and ~$3,360/year total earned revenue.
- $3–20/month sits inside Uganda's proven mass-market payment band (GOtv, DStv, PAYG solar).
- Offline-first is a decisive moat (grid access 25% nationally; offline is the stated reason MoH preferred eAFYA).
- The faith-bureau channel generalizes: UCMB + UPMB coordinate ~600 PNFP facilities, and HMIS-105 automation — which Karibu already has — is exactly what bureaus value.

**Corrected:**
- **Drug shops are mostly not a viable customer** (median profit ~$32/mo; 40% lose money monthly; their profit engine is off-license antibiotic sales, making a system of record adversarial to the business). Exception: the top tier of licensed, nurse-run shops.
- **Nobody in this market pays for record-keeping.** Every product that sticks moves or makes money (Maisha Meds reimbursements, M-TIBA claims, Ilara revenue-generating diagnostics, Banda leak-capture). The documented #1 clinic-owner pain is having no books, which blocks bank lending.
- **Payment behavior is weekly/prepaid, not monthly auto-renew** (DStv's UGX 5k/week plan; PAYG solar's UGX 1k/day; Bumpa's prepaid blocks).
- Donor-funded free software (Maisha's free POS at 850 Ugandan facilities) anchors parts of the market at $0. The defense is being the product clinicians *choose* — the one asset donor-procured systems never have.

## 3. Product structure: editions, not modules

**Decision: Karibu is sold as complete packages per facility type. Modularity lives in the codebase, not the price list.**

The à-la-carte model (free patient record + paid add-ons for OPD, pharmacy, lab at ~UGX 5k/week each) was considered and rejected:

1. A small clinic has no departments — it has **one loop** (consult → lab → prescribe → dispense → pay) run by the same 2–3 people. Selling the loop in fragments breaks the workflow and punches holes in HMIS reporting.
2. The math fails: four modules × UGX 5k/week ≈ UGX 80k/month (~$22) — DStv Family pricing for a facility the strategy priced at $20 total.
3. Bottoms-up distribution needs a price that fits in a sentence. "Karibu is 5k a week" travels; "it depends on your modules" doesn't. This market thinks in tiered bundles (GOtv Lite/Plus, DStv Access/Family), not à la carte.
4. **Never paywall care delivery.** A lapsed "pharmacy module" that halts dispensing breaks patient care for nonpayment. The free/paid line runs between *audiences* — clinicians get clinical, owners pay for business — never between clinical functions.
5. The Maisha lesson: free where it wins love, paid where the money moves.

### The lineup

| Edition | Price (target) | Contents |
|---|---|---|
| **Karibu (free)** | UGX 0 | Registration, clinical notes, patient history, orders, offline sync. A solo clinician can adopt it without owner permission. This is the distribution vector and the moat. |
| **Karibu Clinic** | ~UGX 5,000/week | The whole loop for a 2–20 person clinic: dispensing, lab, billing, daily cash book, stock + expiry, loan-ready monthly statements. |
| **Karibu Pharmacy** | ~UGX 2,500–5,000/week | POS, stock, expiry, credit ledger. A distinct edition for a distinct business — not "Clinic minus features." |
| **Karibu Health Centre** | ~UGX 10–15k/week, or annual per-facility for bureaus | Adds inpatient, maternity, multi-staff roles, HMIS-105 reporting. The diocese / UCMB / UPMB product. |

**Free → paid trigger** (natural, non-coercive): the moment a second staff member needs the shared record, or the owner wants to see the money.

**Lapse behavior:** everything degrades to **read-only**. Records are never hostage. No hard locks.

**Paid wedge is financial, not clinical:** billing, cash position, credit ledger, stock/expiry, and bank-acceptable monthly statements ("books that unlock a loan" — 78% of clinics cite financing as their top constraint). Clinical features, including AI assist, stay free.

## 4. Pricing and collection mechanics

- Quote **weekly numbers** (UGX 2,500–15,000/week by edition); accept prepaid monthly/quarterly blocks at a discount. Institutional/bureau tier priced annually per facility, into donor and PHC-grant budget cycles.
- Collect via **MoMoPay / Airtel Pay merchant code** plus Request-to-Pay reminders at renewal. Merchant payments cost the payer nothing (the 0.5% mobile money tax hits withdrawals only); merchant fee 1–2%.
- No silent card-style auto-debit — it isn't native behavior here. Prompted renewal is.

## 5. Market sequencing

1. **Beachhead:** small private clinics + the PNFP bureau channel (UCMB/UPMB, ~600 facilities; Stre@mline is the incumbent to displace at hospital tier, but the lower-level facilities are open).
2. **Second:** licensed pharmacies (UgaPOS proves ~UGX 30k/month clears there; Maisha's free POS is the anchor to differentiate against).
3. **Deferred:** drug shops — until there is a money-moving product for them (reimbursements, supplier credit, ADDO-style accreditation support), or serve only the licensed nurse-run top tier organically.
4. **Uganda stays the first fully supported country.** Country-specific behavior (HMIS, catalogs, facility types) migrates toward a Uganda pack over time — but **the OS/Apps/country-pack refactor follows paying customers, it does not precede them**. Uganda's MoH froze mHealth pilots in 2012 because ~80 uncoordinated platforms scaled nothing; the graveyard is platforms built before demand.

## 6. Immediate next actions

1. **Name a price to the three warm buyers** — the highest-information, zero-cost experiment available:
   - Private clinic owner: **Karibu Clinic, UGX 5,000/week, everything included.**
   - Pharmacy owner: **Karibu Pharmacy, UGX 2,500/week.**
   - Diocese: **Karibu Health Centre, annual per-facility quote** for member facilities.
   - Listen for: acceptance, negotiation, silence, or "can I get just X cheaper?" (the last is the market voting for units — the edition decision is falsifiable and this is the test).
2. Keep shipping for SSUNGA — the reference site and the source of the only distribution asset that matters (clinician love).
3. Follow-up research when needed: BandaGo/Stre@mline actual price lists; MoMo pre-approval (auto-debit) availability in Uganda production; maternity-home economics (thinnest evidence).

## 7. What we are explicitly not doing

- Not selling à-la-carte feature modules.
- Not paywalling clinical care functions or locking records on nonpayment.
- Not building the platform/country-pack architecture ahead of revenue.
- Not targeting the drug shop long tail with a subscription.
- Not treating the MoH compliment as demand (interest ≠ money).
