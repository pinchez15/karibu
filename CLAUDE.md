## EHR pivot (authoritative implementation guide)

The clinic queue model is being replaced with a **patient-centered EHR** (pre-launch big-bang).
Before implementing sync, Android role homes, lab/pharmacy, pharmacy order timing, or schema
changes for this effort, read **`docs/ehr-pivot-implementation.md`** end-to-end.

Before implementing or changing **AI notes or Consult** in Karibu EHR, read
**`docs/ai-clinical-assist.md`** end-to-end.

Before implementing **Karibu Learn** (standalone CME app, not EHR), read
**`docs/karibu-learn/product-boundary.md`** and **`docs/karibu-learn/vision.md`**
end-to-end. Learn and EHR are separate apps: different auth, different databases,
not reachable from each other. They share this monorepo only so Learn can mirror
EHR chart UX for pre-onboarding.

That doc supersedes older planning docs when they conflict. Key locked decisions:

- Pharmacy queues on **order submitted**, not note finalization
- Lab + pharmacy on **one Android app** (role-based homes)
- Offline dispense with **local stock decrement**, sync when online
- Payment **decoupled** from clinical closure; all writes via **SECURITY DEFINER RPCs**

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
