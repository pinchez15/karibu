# Maternal & neonatal care — Uganda MOH research brief

> Short research project (June 2026) grounding the maternal-fetal-medicine build.
> Sources are the Uganda MOH **Essential Maternal & Newborn Clinical Care
> Guidelines (2022, v3)**, the MOH **MPDSR Guidelines**, and WHO ANC/PNC models
> Uganda has adopted. This brief defines *what best-in-class looks like per Uganda
> MOH* so we can decide what the EHR should track and enforce. It is not yet a
> build plan.

## Why this is the highest-leverage place to build

Uganda's maternal mortality (~189–284 per 100,000 live births depending on
source/year) and neonatal mortality (~22/1,000) are concentrated in a few
predictable, preventable failures: pre-eclampsia/eclampsia, postpartum
haemorrhage, sepsis, obstructed labour, and birth asphyxia / prematurity in the
newborn. **Up to three-quarters of neonatal deaths happen in the first week.**
Maternal deaths have been a declared **national emergency since 2008**, with
mandatory death review (MPDSR). The HC III is where most facility births in a
diocese happen — so an HC III that reliably tracks every pregnancy, flags risk
early, and runs the right protocol at birth is leverage like almost nothing else.

The decisive levers are not exotic: **complete the ANC package, identify
high-risk mothers before labour, and execute three intrapartum/neonatal drills
correctly** (MgSO₄ for eclampsia, oxytocin/uterotonics for PPH, and Helping
Babies Breathe for the non-breathing newborn). The EHR's job is to make the
default path the correct path and to never let a due protocol fall silently.

## 1. Antenatal care (ANC) — the package to track

Uganda adopted the **WHO 8-contact ANC model (ANC8)** in 2018 (up from 4 focused
visits). Recommended contact schedule: **first contact by 12 weeks**, then
**20, 26, 30, 34, 36, 38, 40 weeks**. Each contact is goal-oriented; the routine
package — the "protocols followed" the registry must track per mother — is:

- **IPTp-SP (malaria)** — sulfadoxine-pyrimethamine, **≥3 doses**, starting in
  the 2nd trimester (≥13 weeks), each ≥1 month apart, given as DOT.
- **Iron + folic acid (IFAS)** daily through pregnancy; anaemia protocol now
  includes **parenteral iron** for moderate/severe anaemia.
- **Tetanus (Td/TT)** per immunisation status (up to 5 doses for lifetime
  protection).
- **Deworming** (albendazole/mebendazole) after first trimester.
- **ITN / LLIN** issued and use reinforced.
- **HIV testing + ART** (eMTCT/Option B+), **syphilis** and **Hepatitis B**
  screening; partner testing encouraged.
- **Blood pressure + urine dipstick every contact** — pre-eclampsia screening
  (the single highest-yield ANC vital).
- **Haemoglobin**, blood group, and where available **ultrasound** (dating +
  anomaly/placenta).
- **Birth & emergency preparedness plan**: facility of birth, transport, funds,
  blood donor, danger-sign recognition.
- **Danger-sign education** (see below).

**Risk stratification.** ANC must flag the mothers who should *not* deliver at an
HC III without a plan: previous caesarean/scar, prior PPH or stillbirth, multiple
pregnancy, malpresentation, pre-eclampsia/hypertension, severe anaemia, short
stature/contracted pelvis, age <18 or >35 with parity extremes, HIV+, grand
multipara. These should drive an **early referral / delivery-site plan**, not a
3am scramble.

**Pregnancy danger signs taught to every mother:** vaginal bleeding; severe
headache / blurred vision; convulsions/fits; swelling of face/hands; fever; severe
abdominal pain; reduced/absent fetal movement; draining liquor; fast/difficult
breathing.

## 2. Intrapartum (labour & birth)

- **Partograph** for every labour — the WHO-recommended monitoring tool (FHR,
  cervical dilatation vs alert/action lines, contractions, liquor, moulding,
  maternal vitals). *Known reality: partographs are widely available but
  incompletely/late-filled — a place software can genuinely help by structuring
  timed entry.*
- **EmONC signal functions** define what a facility can actually do. **Basic
  EmONC (BEmONC, 7):** parenteral antibiotics, parenteral uterotonics (oxytocin),
  parenteral anticonvulsants (MgSO₄), manual removal of placenta, removal of
  retained products, assisted vaginal delivery, newborn resuscitation.
  **Comprehensive (CEmONC, 9)** adds caesarean section and blood transfusion.
  An HC III is expected to be a **BEmONC** site and to **refer** for the two
  CEmONC functions — so recognise-and-refer timing is the core skill.
- **Active management of the third stage (AMTSL):** **oxytocin 10 IU IM** within
  1 minute of birth, controlled cord traction, uterine massage — the primary PPH
  prevention.
- **Pre-eclampsia/eclampsia:** **MgSO₄ (Pritchard regimen)** — loading 4 g IV
  slow + 10 g IM (5 g each buttock), then 5 g IM 4-hourly; plus antihypertensive
  if BP ≥160/110; catheterise, monitor, refer. *(This is exactly what the
  Karibu maternal-alert checklist already encodes, clinically signed off.)*
- **PPH:** uterotonics (oxytocin → misoprostol 800 µg SL if needed), IV fluids,
  uterine massage, examine for tears/retained placenta, refer with continued
  uterotonics.

## 3. Immediate newborn & neonatal care

- **Essential newborn care:** dry & keep warm, immediate skin-to-skin, delayed
  cord clamping, **early initiation of breastfeeding (within 1 hour)**.
- **Helping Babies Breathe (HBB)** — the golden-minute resuscitation drill (dry/
  stimulate → bag-and-mask within 60 s). Birth asphyxia is a top newborn killer;
  HBB skill *decay* is a documented problem → an in-app prompt at the moment of
  birth has real value. *(Karibu already surfaces the HBB prompt on delivery.)*
- **Cord care** — chlorhexidine 7.1% to the cord stump.
- **Vitamin K**, eye care, weight.
- **Kangaroo Mother Care (KMC)** for low-birth-weight / preterm (<2500 g):
  continuous skin-to-skin, feeding support, follow-up. MOH-prioritised but
  under-implemented → another software-supportable gap.
- **Newborn danger signs:** not feeding, convulsions, fast/difficult breathing,
  hypothermia/fever, jaundice, low birth weight/small baby. *(Karibu's newborn
  danger-sign screen covers these.)*

## 4. Postnatal care (PNC) — the first-week window

- **Facility schedule:** within **6 hours**, **6 days**, and **6 weeks**
  (WHO-aligned contacts: day 1, day 3, 7–14 days, 6 weeks).
- **Community:** VHT home visits on **days 1, 3, and 7** — focused on newborn
  danger signs (most neonatal deaths are first-week).
- **Checked:** mother — bleeding/lochia, BP, fundus, infection, breastfeeding,
  mood, family planning counselling; newborn — feeding, warmth, cord, danger
  signs, weight, immunisation (BCG/OPV0).

## 5. Surveillance & reporting (non-negotiable in Uganda)

- **MPDSR** — every maternal and perinatal death is **notified within 24–48 h**
  and **reviewed**; mandatory since the 2008 emergency declaration. The EHR
  should make a maternal/perinatal death trivially notifiable and capture the
  review fields.
- **HMIS** — ANC register, maternity register, and the monthly **HMIS 105**
  aggregate (already in Karibu, migrations 013/014). Key tallies: ANC1 / ANC4 /
  ANC8, IPTp3, deliveries, live births, stillbirths (fresh/macerated), LBW,
  maternal deaths, perinatal deaths, PNC attendance.
- **Indicators that matter (and that the registry can compute):** % ANC8
  completed, % IPTp3, % skilled birth attendance, % AMTSL, PPH rate, eclampsia
  case-fatality, stillbirth rate, early-neonatal-death rate, KMC coverage for LBW.

## 6. What this means for the Karibu EHR (the registry the user described)

The HC III as the diocese's birth hub needs a **longitudinal ANC registry** that
the existing maternity admission/delivery records already begun in the ward
feature plug into:

1. **Pregnancy record per mother** — LMP/EDD (and gestational age that updates),
   gravida/para, risk flags, and a clear **"due" picture**: who is due this
   week/month, who is post-dates.
2. **Protocol tracker** — per mother, the status of each ANC element (ANC
   contacts done vs the ANC8 schedule; IPTp dose count; TT; IFAS; HIV/syphilis/
   HepB; ITN; BP trend) with **"overdue/missed" flags** — the same "don't let a
   due thing fall silently" pattern as the ward obs-overdue nudge.
3. **Risk-based delivery-site plan** — high-risk mothers flagged for referral/
   plan *before* labour.
4. **Continuum link** — ANC pregnancy → maternity admission → delivery → newborn
   → PNC, all on one thread (the ward delivery/newborn records already exist;
   ANC is the missing front half).
5. **PNC follow-up tracker** — first-week contacts due/done for mother + newborn.
6. **Reporting** — feed HMIS 105 maternal/newborn tallies and make MPDSR
   notification one tap.

**Highest-leverage Phase-1 candidates** (to decide together): the **ANC pregnancy
registry + protocol tracker with due/overdue flags** (this is the user's core
ask and the biggest population-level lever), linked to the delivery records we
already built; with **risk-flagging → referral plan** close behind. Partograph,
PNC tracker, and MPDSR notification follow.

## Sources

- Uganda MOH — Essential Maternal & Newborn Clinical Care Guidelines for Uganda (2022, v3): https://library.health.go.ug/sexual-and-reproductive-health/essential-maternal-and-newborn-clinical-care-guidelines-uganda-may
- Uganda MOH — Maternal & Perinatal Death Surveillance and Response Guidelines: https://library.health.go.ug/sites/default/files/resources/Maternal%20and%20Perinatal%20Death%20Surveillance%20and%20Response%20Guidelines%20August%202017.pdf
- Uganda MOH — Quality of Care Implementation Guide (RMNCAH & Nutrition): https://library.health.go.ug/sites/default/files/resources/QoC%20Implementation%20Guide%20for%20Reproductive,%20Maternal,%20New%20Born,%20Adolescent%20Health%20&%20Nutrition%20Services%20signed.pdf
- ANC8 compliance study (Uganda, PLOS One 2024): https://pmc.ncbi.nlm.nih.gov/articles/PMC11627358/
- UNICEF Uganda — ANC and Newborn Care key practices: https://www.unicef.org/uganda/key-practice-antenatal-care
- KMC implementation in Uganda (Pan African Medical Journal): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4314138/
- Helping Babies Breathe in Uganda (skills retention studies): https://pmc.ncbi.nlm.nih.gov/articles/PMC7480409/
