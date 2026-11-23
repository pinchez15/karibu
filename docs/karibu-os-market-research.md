# Karibu OS — Uganda market discovery (2026-08-06)

Synthesis of a three-track research sweep (competitive landscape; small-facility operations; willingness-to-pay and payment rails) run against the questions in the Karibu OS strategy memo. Compiled by Claude (Fable) from ~140 web sources; every load-bearing claim is cited. Reliability flags: **[H]** primary/official/peer-reviewed, **[M]** trade press or company self-report, **[L]** weak/unverified. FX anchor: ~UGX 3,700/USD.

---

## 1. Verdicts on the strategy memo

### ✅ HOLDS — "There is a massive market traditional software never served" (for clinics)

- The small **private clinic** tier is real, profitable, and unowned. ~2,000+ private-for-profit clinics (MoH has no accurate count because they don't report into HMIS) averaging **7 FTE staff**; >90% are small outpatient facilities. **43% earn ~UGX 2M (~$830)/month profit, 25% up to $2,500, 11% up to $8,300** — these facilities can pay $8–20/month without noticing. [H — USAID/Banyan Global private health sector assessment, 140-clinic survey]
- No incumbent owns them: UgandaEMR/eAFYA is public-sector and hospital-shaped (2025 MoH "92% coverage" claim targets only ~60 hospitals) [H]; ClinicMaster (180+ facilities) and Stre@mline (100+ facilities, offline LAN, born at Kisiizi Hospital) sell to hospitals and insurance-billing clinics [M]; Bahmni/OpenMRS lands only via NGO projects. **Banda Health (BandaGo)** is the closest analog to Karibu's segment and has ~80–110 clinics total with **$3,360/year of earned revenue across all of them** (2023 Form 990) — donor-carried, apparently online-only. [H]
- Private facilities are the front line of care: **50–63% of first-contact care** happens at private clinics and drug shops. [H — multiple studies]

### ⚠️ BREAKS — the drug shop long tail is mostly not a SaaS market

- Median drug shop monthly profit: **UGX 118,000 (~$32); 40% of shops lose money in a given month**. $10/month is ~30% of the median shop's profit. [H — SOAS ACE WP037 / Hutchinson et al., BMJ Global Health 2023, 344-shop survey]
- Worse than affordability: **record-keeping is adversarial to the drug shop business model.** Their single most profitable category is antibiotics — which Class C shops are legally barred from selling. Only 10–36% of shops are licensed (district censuses); owners pay bribes to real and fake inspectors, and district officials tip shops off before NDA visits so they can hide out-of-scope stock. A system of record is a self-incrimination machine for this segment. [H]
- Ugandan pharmacy POS already clears at ~**UGX 30k/month (~$8–10)** (UgaPOS), and **Maisha Meds gives its pharmacy POS away free** at ~850 Ugandan facilities (~4,000 across Africa), monetizing donor-funded reimbursements instead. Free, donor-subsidized competition anchors this segment at $0. [M/H]
- The exception: the top tier of licensed pharmacies and the growing cohort of drug shops run by **unemployed qualified nurses/midwives** (~60% of shop attendants in surveyed districts — trained clinicians stuck in retail). They're Karibu's clinician persona, just standing behind a counter.

### ✅ HOLDS — the price band; ⚠️ the *shape* must change

- $3–20/month sits inside a proven Ugandan mass-market band: GOtv Lite UGX 13–15k/mo, DStv entry 16k, home 4G 55k. Millions already pay these amounts. [M/H]
- But collection behavior is **weekly/daily, not monthly**: MultiChoice launched a UGX 5,000/week DStv plan because Ugandans prefer weekly commitment; PAYG solar (Fenix ReadyPay, M-KOPA) collects UGX 1,000/day via MoMo at mass scale, with degrade-on-nonpayment. African SMB SaaS survivors (Bumpa) bill **prepaid quarterly/annual blocks**, not monthly auto-renew. [H/M]
- Rails are solved: MoMoPay/Airtel Pay merchant codes (1–2% merchant fee, **zero cost and zero tax to the payer** — the 0.5% mobile money tax hits withdrawals only), MTN MoMo Open API with Request-to-Pay and a pre-approval auto-debit primitive (Uganda production availability unverified — **gap**). [H/M]
- Caution from precedent: **pure sub-$10 subscriptions rarely carry the company** (Kippa dead, OZÉ pivoted to embedded lending, mPharma monetizes drug margin). Survivors attach the fee to something that visibly makes or saves money.

### ⚠️ REFRAME — the killer paid feature is financial, not clinical

The single most actionable finding across all three tracks:

> "The majority of health clinics do not track day-to-day income and expenses nor do they maintain proper income statements or balance sheets" — and this **blocks bank lending**, because owners can't show loan officers true profitability. 78% of clinics cite financing as their top constraint; health lending is 1% of commercial bank portfolios; 10% of surveyed clinics wanted a loan *specifically to establish an accounting system*. [H — USAID/Banyan]

Every product that sticks in this market **moves money or makes money**: Maisha Meds (reimbursements through the app, RCT-proven 8%→33% protocol adherence), M-TIBA (claims), Ilara Health (revenue-generating diagnostics on lease-to-own, clinics pay ~$200/mo), Banda (captures cash leakage as small as KES 50). Pure record-keeping consistently fails against power, connectivity, and time costs. [H]

Where facilities lose money today (the pain the paid apps should target):
- **Untracked income/expenses** → can't price, can't borrow (clinics)
- **Credit sales**: 32% of outlets take supplier stock on credit; customer credit is ~UGX 65k/month of drug shop margin [H]
- **Stockouts and expiry**: expired-medicine accumulation is a documented structural problem; public stockouts push demand to private retail [H]
- **Revenue leakage / undercharging** at reception (Banda's entire pitch)

### ✅ HOLDS — bottoms-up distribution is plausible, and there's a second channel the memo undersells

- 84% of clinics get patients by word of mouth; the sector is socially networked (drug shops pay nearby clinics for procedures — "sister, help me cannulate this patient, I will give you some money"). Clinician-to-clinician spread has real substrate, especially via the nurse-run drug shop cohort. [H]
- The **faith-bureau channel is the highest-leverage path**: UCMB (296 facilities) + UPMB (~300–330) coordinate ~600 PNFP facilities, with Joint Medical Store delivering door-to-door to ~3,000 facilities. One bureau endorsement covers hundreds of facilities — and **HMIS-105 automation is precisely what bureaus value** (Karibu already has this). Expect the facility or a donor project to pay, not the diocese. Stre@mline is the incumbent to displace in that channel. [H/M]

### ⚠️ CAUTION — offline is a moat; platformization is premature

- Offline capability is *decisive* in this market: it's the stated reason MoH preferred eAFYA over alternatives; Stre@mline built LAN-offline from day one; UgaPOS markets offline explicitly; grid access is 25% nationally (9% rural) and only 15% of Ugandans have power most of the time. Karibu's offline-first Android architecture is a genuine differentiator vs. Banda (online-only) and most cloud EMRs. [H]
- But the sector's graveyard is full of platforms: Uganda's MoH literally declared a **moratorium on mHealth pilots in 2012** because ~80 uncoordinated tools scaled nothing. The failure causes in the peer-reviewed record — no local design involvement, donor-dependent economics, workflow mismatch, power/connectivity, training burden — are execution problems, not architecture problems. The OS/Apps/Uganda-Pack refactor should follow paying customers, not precede them.

---

## 2. Market sizing snapshot

| Segment | Count (best estimate) | Can pay? | Notes |
|---|---|---|---|
| Private-for-profit clinics | ~2,000+ registered; true count higher | **Yes** ($8–20/mo) | Avg 7 FTE; 43% ≥$830/mo profit; no incumbent software |
| Licensed retail pharmacies | 1,980 (NDA, Jun 2026) | Yes ($8–10/mo proven by UgaPOS) | Maisha Meds free anchor; POS category exists |
| Drug shops | ~6–8k licensed; 14k+ outlets cited; unlicensed majority in rural districts | **Mostly no** | Median $32/mo profit; records adversarial to business model |
| PNFP faith-network facilities | ~600 (UCMB+UPMB) | Via facility fees / donor projects | Bureau endorsement = channel; HMIS-105 is the hook; Stre@mline incumbent |
| Private labs | 954 in Kampala alone (3× the registered count) | Unknown | Mostly attached to clinics, not standalone |
| Maternity homes / private midwives | ~714 UPMA members | Unknown — research gap | Thinnest evidence area |

Patient flow context: 50–63% of first contact is private; referral is informal and revenue-protective (providers fear losing patients); self-referral and facility-hopping are routine. The long-term "patient identity across facilities" OS vision has real grounding, but nobody pays for it today.

---

## 3. What this recommends

1. **Sequence the segments.** Beachhead = small private clinics (2–20 staff) + the PNFP bureau channel. Defer drug shops until there's a money-moving product for them (or serve only the licensed nurse-run top tier). This narrows the memo's "everyone from drug shops to eye clinics" list to the two segments with proven ability to pay and an existing Karibu asset (HMIS-105, offline Android, diocese relationship).
2. **Make the paid wedge financial.** Free: registration, notes, history, offline. Paid: billing + daily cash position + credit ledger + stock/expiry + **loan-ready monthly statements** (the "books a bank will accept" feature is differentiated, evidenced, and aligned with what owners already borrow for). Clinical AI/notes stay free — they drive clinician love and bottoms-up spread; money features drive owner payment.
3. **Price in local shapes**: UGX 10–20k/month clinic tier, offered as weekly (UGX 2,500–5,000) or prepaid quarterly blocks; MoMoPay merchant code + Request-to-Pay reminder at renewal; degrade to read-only (never lock records) on nonpayment. Bureau/institutional tier priced per-facility annually into donor/PHC-grant budget cycles.
4. **Expect the free tier to be attacked from above** by donor-funded free (Maisha, national systems). The defense is being the thing clinicians *choose* — which is the one asset Karibu has demonstrated (SSUNGA) and no donor-procured system has.
5. **Fill the evidence gaps with the three warm buyers.** No published study answers "will a Ugandan clinic owner pay UGX 15k/month" better than quoting a price to the private clinic owner, pharmacy owner, and diocese who already asked to buy. None of them has ever heard a number. That is the next action, and it costs nothing.

## 4. Open gaps worth a follow-up pass

- GFF/World Bank Uganda Private Sector Assessment (2019) full text (403-blocked) — likely the best recent facility counts.
- BandaGo and Stre@mline actual price lists (both unpublished — worth a direct ask or a Kenyan/Ugandan contact).
- MoMo pre-approval (auto-debit) availability in Uganda production; Flutterwave/Pesapal Uganda collection fees (quote-only).
- Maternity home economics and standalone lab workflows — thinnest literature.
- WhatsApp ordering/referral ethnography for Ugandan drug shops (no strong published source; observable firsthand via Javis).

---

*Full agent research notes (with per-claim URLs) preserved in the session transcript; this document keeps only load-bearing citations. Sources include: SOAS ACE Working Paper 037 (2021) and Hutchinson et al. BMJ Global Health 2023 (drug shop economics); USAID/Banyan Global "Uganda's Private Health Sector" (2015); NDA licensed outlet statistics (June 2026); Banda Health Form 990 (2023); Maisha Meds annual reports (2024–25); MoH EMR rollout statements (2025); Stre@mline JMIR paper (2019, PMC6334711); IGC mobile money tax report (2025); UCC/MTN subscriber data (2025–26); MultiChoice/DStv Uganda pricing (2025); MTN MoMo developer documentation.*
