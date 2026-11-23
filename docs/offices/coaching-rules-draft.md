# Office coaching rules: DRAFT for Nate to edit

**Date:** 2026-11-13
**Status:** Draft. Every threshold is a starting guess. Change any number, cut any rule.
**Used by:** phase 7 of `docs/offices/office-platform-plan.md`. Each **rule** becomes typed code that checks the office's real numbers and shows a nudge at a decision point. Each **standard** becomes a short page in the in-app library.

The office is a bootstrapped business with one job: **make clinics successful and stay solvent while doing it.** Be generous with time and careful with cash. When the two conflict, give time, not discounts.

---

## A. Cash rules (computed)

Money counts when it arrives, not when it's invoiced. All figures come from the office ledger.

| ID | Rule | Threshold | Shows up when | Severity |
|---|---|---|---|---|
| C1 | **Runway floor.** Cash on hand covers this many months of fixed monthly costs (payroll, including the owner's pay, plus rent and recurring bills). | Red < **4** months, amber 4–6, green ≥ 6 | Home card always; blocks "add expense" for anything recurring while red | Hard warning |
| C2 | **Hire gate.** Before adding a paid team member: | ≥ **10** paying clinics, AND C1 still ≥ 4 months *with* the new salary included, AND new monthly salary ≤ **30%** of trailing 3-month average collections | "Add team member" flow | Hard warning; owner must type a reason to override |
| C3 | **Commission before salary.** A first sales hire is paid per signed clinic, not a fixed salary, until C2 passes. | — | "Add team member", role = sales | Advice |
| C4 | **Collections speed.** Share of invoiced money collected within 14 days of the due date. | Target ≥ **90%**; amber < 90, red < 75 | Weekly cash review | Warning |
| C5 | **Overdue follow-up.** Any clinic overdue by: | **7** days: call. **14** days: visit. **30** days: offer a lapse conversation | Today screen, per clinic | Task |
| C6 | **Prepaid isn't income.** Annual prepayments count as 1/12 per month for spending decisions. The rest shows as "held for future months". | — | Ledger, C1 and C2 calculations | Built into the maths |
| C7 | **Concentration.** No single clinic should be more than this share of monthly revenue. | > **25%** | Monthly review | Advice |
| C8 | **Recurring cost check.** Any new recurring expense over this share of monthly collections gets a 30-day review reminder. | > **10%** | "Add expense" | Advice |
| C9 | **Separate the money.** Business money goes in a business account (bank or merchant wallet), never a personal one. The owner pays themselves a fixed monthly amount that C1 can carry. | — | Onboarding; whenever owner pay isn't set | Setup task |
| C10 | **Weekly cash review.** Every Monday: enter wallet and bank balances and match them to the ledger. Five minutes. | Missed **2** weeks in a row: amber | Monday Today card | Task |
| C11 | **Cost to serve.** Monthly fuel, airtime and time per clinic against what that clinic pays. | Support cost > **40%** of the clinic's subscription for 2 months: review | Monthly review | Advice |

## B. Growth and capacity rules (computed)

| ID | Rule | Threshold | Shows up when |
|---|---|---|---|
| G1 | **Don't sign what you can't support.** Live clinics per person who does support visits (owner included until a hire). | Amber at **12**, red at **18** | "Sign clinic" / onboarding wizard |
| G2 | **Visit cadence.** On-site visit at least every **14** days for a clinic's first 90 days, then every **30** days. | Overdue by > 3 days | Today screen, route planning |
| G3 | **Pipeline cover.** Leads in demo or trial versus the monthly new-clinic target. | < **3×** target: amber | Weekly review |
| G4 | **Onboarding finished before the next signing.** No new clinic starts setup while another clinic is under 30 days live and its day-7 check-in isn't done. | — | Onboarding wizard |
| G5 | **Clinic health trend.** Logins or throughput down **30%** week on week for 2 weeks. | — | Today screen. Act before the clinic calls you |

## C. Customer success standards (library pages, some tracked)

1. **Care first.** Anything stopping registration, dispensing, lab or billing at a clinic is the top priority.
   - Respond within **1 working hour**.
   - Be on site or have it fixed within **2 working days**.
   - Escalate to Karibu the same day.
2. **Response times.** Every message from a clinic gets a reply within **1 working hour** during clinic hours, even if the reply is "I've got it, back to you by Thursday."
3. **Close the loop.** When a reported issue is fixed, tell the person who reported it. A fix nobody hears about doesn't count.
4. **Onboarding checklist.**
   - Before go-live: staff accounts, catalogs and prices set, printer tested, a training day on site.
   - Then: a visit in week 1, and reviews at day 30 and day 90 with the owner.
5. **Monthly value review.** Show the clinic owner their own numbers: patients seen, collections, stock alerts. The owner should see what Karibu does for their business.
6. **Generous with time, firm on price.** Phone and online help is unlimited and free. Extra on-site training days follow the price book, but waive them freely for a clinic in its first 90 days or one that is struggling. Give a free month, never a lower price.
7. **Lapse with dignity.** Records are never locked or deleted. Warn early, talk in person, and a lapse means read-only, never "off".
8. **Report bugs well.** Clinic, device, what happened, what was expected, and the redacted record number. Reproduce it in the demo environment when you can.
9. **HMIS-105 deadlines.** Remind each clinic before its monthly HMIS-105 report is due. Confirm the date with each district.

## D. Healthcare and privacy standards (non-negotiable)

1. **Never ask for a password.** Use reset and invite tools instead.
2. **Never look at, photograph or share a patient record.** The office console shows redacted numbers on purpose.
3. **Report a suspected data breach to Karibu within 24 hours.** Karibu handles the regulator notification under the Data Protection and Privacy Act.
4. **Never give clinical advice or promise a clinical feature that isn't live.** Sell what's on the clinic's phone today.
5. **The data processing agreement is signed before access is granted.**

## E. Running a software business (library pages)

These are short reads, not rules:

- why recurring revenue is worth more than setup fees
- churn: why keeping a clinic beats signing a new one
- pricing discipline and why we don't discount
- what to track weekly (cash, collections, clinic health, pipeline) and what to ignore
- when to hire and how to hire your first person
- how to say no to a clinic you can't support yet

---

### Notes for Nate

- **C1** at 4 months comes from your example. I set green at 6 so 4 reads as the floor, not the goal.
- **C2** at 10 clinics comes from your example. The 30% salary cap is my addition. At 10 Full clinics (UGX 1.3M/month) it caps a new salary at about UGX 390k. Is that realistic for an account exec in Uganda?
- **G1** at 12/18 assumes one person can visit 12–18 clinics on a 14–30-day cadence by motorcycle. Check this with Javis.
