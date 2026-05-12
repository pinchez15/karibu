# PRD: Lightweight Clinical Scribe + Patient Flow System
## Uganda-first, Low-Bandwidth, Global-ready

---

## Product Summary

A low-data, WhatsApp-first clinical workflow system that helps clinics manage patient queues, document visits via AI-assisted transcription, deliver clear patient follow-up instructions, and collect payment directly through the app.

This product is **not a full EHR**.
It is a **visit-level workflow and documentation layer** designed for:

- High patient volume
- Low connectivity environments
- Minimal training
- Smartphone-first clinicians
- SMS / WhatsApp-first patients

The system produces:
- One **provider-only clinical note**
- One **patient-facing visit summary**
- A complete **queue → visit → follow-up → payment** flow

---

## Core Design Principles (Non-Negotiable)

1. **WhatsApp number is the patient ID**
2. **Offline-first for clinicians**
3. **Audio stored locally until explicit upload**
4. **Two notes per visit**
   - Provider note (private, technical)
   - Patient note (plain language)
5. **Explicit consent capture**
6. **Queue-driven state machine**
7. **Extremely low data usage for patients**
8. **Payments collected inside the app**

---

## Core Jobs-to-Be-Done

### For Doctors
- Record visits without thinking about notes
- Automatically generate structured documentation
- Reduce time spent on paperwork
- Handle more patients with less cognitive load

### For Clinics
- Move patients efficiently through the building
- Reduce overcrowding and confusion
- Maintain basic visit records without EHR adoption
- Collect payment reliably

### For Patients
- Know where they are in the queue
- Understand their diagnosis and next steps
- Receive follow-up instructions privately
- Pay easily, with flexible options

---

## Actors

- **Patient** – end user with WhatsApp or SMS
- **Nurse** – intake, triage, handoff
- **Doctor** – clinical encounter and documentation
- **Karibu Manager** – Karibu staff who onboards and configures new clinics
- **Clinic Admin** – clinic staff with administrative privileges
- **System** – queue, transcription, AI workflows
- **Payment Processor** – e-pay provider

---

## Patient Identity Model

Each patient is identified primarily by their WhatsApp phone number.

Patient record includes:
- WhatsApp number (primary key)
- Display name (optional)
- Age or date of birth (optional)
- Consent flags
  - Care consent
  - Recording / transcription consent
- Visit history

---

## Queue State Machine (Authoritative)

**States:**
```
NEW → WAITING → NEXT → ARRIVED → IN_INTAKE → READY_FOR_DOCTOR → IN_VISIT → NEEDS_PROCESSING → DRAFT_READY → FINALIZED → CLOSED
```

All state transitions must be **explicit**, **logged**, and **idempotent**.

---

## End-to-End Patient Flow

### Phase A – Entry and Queue Creation

**Trigger:**
Patient scans a QR code or clicks a WhatsApp link.

**System actions:**
- Create or load patient using WhatsApp number
- Assign queue state: WAITING

**Patient receives:**
- WhatsApp confirmation
- Estimated wait message

**Optional pre-intake (configurable):**
- Reason for visit (free text)
- Red-flag questions (yes / no)
- Allergies (optional)
- Current medications (optional)

**Failure handling:**
- If red flags are triggered, mark visit as URGENT and notify staff

---

### Phase B – Arrival and Nurse Intake

**Trigger:**
Patient replies YES on WhatsApp or nurse marks arrival manually.

**System:**
- Transition queue state from WAITING to ARRIVED to IN_INTAKE

**Nurse workflow:**
- View queue by state
- Select patient by WhatsApp number
- Confirm identity (last four digits of phone number)

**Consent capture:**
- Care consent
- Recording and transcription consent
- Timestamped and stored

**Clinical intake data:**
- Vitals
- Symptoms
- History highlights
- Medications and allergies
- Triage tags

**Handoff:**
- One to three sentence nurse summary
- Transition state to READY_FOR_DOCTOR

---

### Phase C – Doctor Encounter and Recording

**Doctor app requirements:**
- Intake summary view
- Consent status
- Offline-capable audio recording

**In-room flow:**
1. Verbal reconfirmation of recording consent
2. Doctor confirms consent in app
3. Doctor presses Record

**Recording rules:**
- Audio stored locally on device
- Encrypted at rest
- Visible recording indicator
- Optional bookmarks (diagnosis, plan, medications)

**End of visit:**
- Doctor presses Stop
- Optional structured fields:
  - Diagnosis
  - Medications
  - Follow-up instructions
  - Tests ordered

**State transition:**
- IN_VISIT to NEEDS_PROCESSING

---

### Phase D – Upload and AI Processing

**Trigger:**
Doctor submits recording for transcription.

**Pipeline:**
1. Secure upload when connectivity allows
2. Speech-to-text transcription
3. Clinical structuring
4. Dual-note draft generation

---

### Phase E – Dual Note Generation

**Provider note:**
- Visible only to doctors and nurses
- Technical format (SOAP or similar)
- Stored in clinic system

**Patient note:**
- Plain language
- Mobile-friendly web page
- Delivered via WhatsApp link
- Includes diagnosis summary, next steps, warning signs, and follow-up instructions

---

### Phase F – Review and Finalization

**Doctor actions:**
- Review and edit provider note
- Review and edit patient note
- Add missing information
- Finalize visit

**System behavior:**
- Notes are locked (versioned edits only)
- State transitions from DRAFT_READY to FINALIZED

---

### Phase G – Delivery, Next Steps, and Payment

**Patient receives:**
- WhatsApp or SMS with magic link to patient note
- Magic link authenticates patient automatically (no login required)
- Link tied to WhatsApp number, expires after 30 days
- Clear calls to action (pharmacy, lab, home care, follow-up)

**Payment flow:**
- Payment link sent via WhatsApp or SMS
- Two options:
  1. Pay in full
  2. Pay over time in small installments

**System:**
- Payment status attached to visit
- State transitions from FINALIZED to CLOSED

---

## Follow-Up System (Low Data)

Scheduled follow-up prompts sent via WhatsApp or SMS.

**Example prompt:**
"How are you feeling today?
1. Improving
2. No change
3. Worse"

**Doctor dashboard:**
- Green / Yellow / Red indicators
- Optional callback for concerning responses

---

## Clinic Dashboard

**Displays:**
- Current queue
- Patient names and queue numbers
- Visit summaries
- Follow-up alerts
- Audio upload status
- Payment status

Offline-first caching is recommended.

---

## Non-Functional Requirements

### Data usage
- Doctors: compressed audio plus text
- Patients: SMS or very small WhatsApp messages only

### Connectivity
- Operates with intermittent internet
- Audio uploads can be deferred

### Localization
- English default
- Luganda plus one additional language at MVP
- Short, culturally neutral sentences

### Privacy
- Explicit consent for recording
- Audio deletable after processing
- Role-based access control
- Alignment with Uganda Ministry of Health guidance

---

## Phase 0: Demo MVP (Scoped Build)

The full MVP vision is documented throughout this PRD. However, the **first build** focuses exclusively on validating the core loop with a single doctor. Everything else is deferred until this loop proves valuable.

### Demo MVP Thesis

> **"It made my work so much faster and gave the patient clearer next steps."**

The "wow" moment is for the **doctor**, not the patient. Doctors will drive internal adoption. If the doctor doesn't find it valuable, nothing else matters.

### What We're Validating

1. Audio recording works reliably on target Android devices (including offline)
2. AI transcription quality is good enough to reduce editing burden
3. Dual note generation produces useful, accurate output
4. Doctor workflow is fast enough to save meaningful time
5. End-to-end delivery works (patient receives and can view note)

### Demo MVP Scope

#### In Scope

| Component | Description |
|-----------|-------------|
| **Doctor mobile app** | React Native (Android), single role |
| **Patient entry** | Doctor types WhatsApp number + name directly |
| **Consent capture** | Single toggle confirmation before recording |
| **Audio recording** | Offline-first, encrypted local storage |
| **Upload when ready** | Doctor initiates upload when connectivity available |
| **AI transcription** | Whisper API, server-side |
| **Dual note generation** | Provider note (SOAP) + Patient note (plain language) |
| **Note review/edit** | Doctor can edit both notes before finalizing |
| **Finalization** | Doctor approves and sends |
| **WhatsApp delivery** | Magic link to patient note |
| **Patient note page** | Mobile web, magic link auth |
| **Clerk auth** | Single doctor login |
| **Supabase backend** | Simplified schema |

#### Out of Scope (Deferred)

| Component | Reason |
|-----------|--------|
| Queue management | Not needed for single-doctor demo |
| Nurse role and intake | Doctor does simplified intake |
| Patient self-registration | Doctor enters patient info |
| Pre-intake questionnaire | Deferred |
| Room assignment | Not needed |
| Payment processing | Deferred |
| Follow-up system | Deferred |
| Clinic admin dashboard | Not needed for single doctor |
| Karibu Manager setup | Hardcode single clinic config |
| Multi-clinic support | Single clinic only |
| SMS fallback | WhatsApp only for demo |
| Clinic Admin role | Single doctor only |

### Demo MVP User Flow

```
DOCTOR OPENS APP
    ↓
Logs in (Clerk) ← Only needed once, session persists
    ↓
HOME SCREEN
    ↓
Taps "New Visit"
    ↓
PATIENT ENTRY
    ↓
Enters patient WhatsApp number
Enters patient name (optional but recommended)
    ↓
Taps "Continue"
    ↓
CONSENT SCREEN
    ↓
Toggle: "Patient consents to visit recording and AI transcription"
Doctor verbally confirms with patient
    ↓
Taps "Confirm & Start Recording"
    ↓
RECORDING SCREEN (can be offline)
    ↓
Large "Recording" indicator visible
Optional: Tap to bookmark key moments
    ↓
Taps "Stop Recording"
    ↓
VISIT DETAILS (optional, can be offline)
    ↓
Optional fields: diagnosis, medications, follow-up, tests
These help AI generate better notes
    ↓
Taps "Submit for Processing"
    ↓
UPLOAD (requires connectivity)
    ↓
If offline: "Saved. Will upload when connected."
If online: Upload progress indicator
    ↓
PROCESSING
    ↓
"Generating notes..." (typically 1-3 minutes)
Push notification when ready
    ↓
REVIEW NOTES
    ↓
Provider Note tab (SOAP format, technical)
Patient Note tab (plain language)
    ↓
Doctor edits either/both notes as needed
    ↓
Taps "Approve & Send to Patient"
    ↓
CONFIRMATION
    ↓
"Note sent to +256 XXX XXX XXX"
    ↓
DONE → Return to home, ready for next patient
```

### Demo MVP: Patient Experience

```
PATIENT RECEIVES WHATSAPP MESSAGE
    ↓
"Your visit summary from [Clinic Name] is ready.
Tap to view: [magic link]"
    ↓
PATIENT TAPS LINK
    ↓
Opens mobile browser
Magic link authenticates automatically (no login)
    ↓
PATIENT NOTE PAGE
    ↓
- Visit date
- What we found (diagnosis in plain language)
- Your medications (with instructions)
- Next steps (clear checklist)
- Warning signs (when to return)
- Follow-up (if scheduled)
    ↓
Patient can revisit link anytime (until expiry)
```

### Demo MVP: Offline Behavior

| Action | Offline? | Notes |
|--------|----------|-------|
| Login | No | Requires initial auth, but session persists |
| Create patient | Yes | Stored locally, synced later |
| Capture consent | Yes | Stored locally, synced later |
| Record audio | Yes | Core requirement, stored encrypted locally |
| Add visit details | Yes | Stored locally |
| Upload audio | No | Requires connectivity |
| AI processing | No | Server-side only |
| Review/edit notes | Partial | Can view cached notes offline, edits sync when online |
| Send to patient | No | Requires connectivity |

**Offline UX:**
- Clear indicator when offline: "Offline - recording saved locally"
- Pending uploads shown in list with retry option
- Automatic upload when connectivity restored
- No data loss if app crashes or phone dies

### Demo MVP: Simplified Database Schema

```sql
-- Clinic (single, hardcoded for demo)
CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  whatsapp_phone_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff (single doctor for demo)
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  clinic_id UUID REFERENCES clinics(id),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'doctor',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patients (minimal)
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id),
  whatsapp_number TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, whatsapp_number)
);

-- Visits (simplified states)
CREATE TABLE visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) NOT NULL,
  patient_id UUID REFERENCES patients(id) NOT NULL,
  doctor_id UUID REFERENCES staff(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'recording'
    CHECK (status IN ('recording', 'uploading', 'processing', 'review', 'sent', 'completed')),
  consent_recording BOOLEAN NOT NULL DEFAULT FALSE,
  consent_timestamp TIMESTAMPTZ,
  diagnosis TEXT,
  medications TEXT,
  follow_up_instructions TEXT,
  tests_ordered TEXT,
  visit_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audio uploads
CREATE TABLE audio_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) UNIQUE NOT NULL,
  storage_path TEXT,
  duration_seconds INTEGER,
  uploaded_at TIMESTAMPTZ,
  transcription_started_at TIMESTAMPTZ,
  transcription_completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'uploaded', 'transcribing', 'completed', 'failed'))
);

-- Provider notes
CREATE TABLE provider_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) UNIQUE NOT NULL,
  transcript TEXT,
  note_content TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  finalized_at TIMESTAMPTZ
);

-- Patient notes
CREATE TABLE patient_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) UNIQUE NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Magic links for patient access
CREATE TABLE magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) NOT NULL,
  visit_id UUID REFERENCES visits(id) NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log (simplified)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Demo MVP: API Endpoints

**Auth**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/verify` | Verify Clerk session |

**Patients**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/patients` | Create patient (doctor enters phone + name) |
| GET | `/api/patients/lookup?phone=X` | Find existing patient by phone |

**Visits**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/visits` | Create visit with consent |
| GET | `/api/visits/:id` | Get visit details |
| PATCH | `/api/visits/:id` | Update visit details |

**Audio**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/visits/:id/audio/upload-url` | Get presigned upload URL |
| POST | `/api/visits/:id/audio/confirm` | Confirm upload, trigger transcription |
| GET | `/api/visits/:id/audio/status` | Check processing status |

**Notes**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/visits/:id/notes` | Get both notes |
| PATCH | `/api/visits/:id/notes/provider` | Update provider note |
| PATCH | `/api/visits/:id/notes/patient` | Update patient note |
| POST | `/api/visits/:id/finalize` | Finalize and send to patient |

**Patient Access (Public)**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/patient/note/:token` | Get patient note via magic link |

**Sync (for offline)**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sync/push` | Push locally created data |
| GET | `/api/sync/pull` | Pull updates since timestamp |

### Demo MVP: Success Criteria

The demo is successful if:

1. **Recording reliability**: Zero audio loss incidents across 50 test visits
2. **Transcription quality**: 80%+ of transcriptions require only minor edits
3. **Time savings**: Doctor reports documentation takes less than 3 minutes (vs 10-15 min manual)
4. **Doctor satisfaction**: Doctor wants to keep using it after demo period
5. **End-to-end delivery**: 95%+ of patient notes successfully delivered via WhatsApp

### Demo MVP: What Comes Next

After validating the core loop:

1. **Phase 1**: Add nurse intake flow (consent capture, vitals, handoff)
2. **Phase 2**: Add queue management (patient self-registration, waiting room)
3. **Phase 3**: Add payments (Flutterwave integration)
4. **Phase 4**: Add follow-up system
5. **Phase 5**: Add multi-clinic support and Karibu Manager setup

---

## Full MVP Feature Set (Post-Demo)

**Doctor:**
- Record visit
- Upload later
- Auto-generated provider note and patient summary

**Clinic:**
- Queue management
- Routing
- Dashboard

**Patient:**
- Queue updates
- Visit summary
- Follow-up prompts
- Payment link

**Channels:**
- WhatsApp
- SMS
- USSD is Phase 2

---

## Phase 2 Features

- USSD menu
- Multi-clinic networks
- Bulk follow-up campaigns
- Referral workflows
- Structured clinic metrics

---

## Edge Case Rules

| Scenario | System Behavior |
|----------|-----------------|
| Patient declines recording | Manual provider note only |
| Doctor offline | Audio stored locally and uploaded later |
| Patient loses magic link | Send "notes" to clinic WhatsApp to regenerate |
| Magic link expired | Prompt to request new link, old link invalid |
| Magic link shared with others | Works (trade-off for accessibility), can invalidate by requesting new |
| Payment unpaid | Visit closed but flagged |
| Consent revoked mid-visit | Recording stops immediately |
| Clinic not yet activated | Staff cannot log in, patients see "clinic not available" |

---

## Non-Goals

- Full EHR replacement
- Insurance billing logic
- Automated diagnosis
- Cross-clinic identity resolution

---

## Definition of Done

- Visit can complete without internet in the room
- One visit produces two correctly scoped notes
- Patient understands next steps without staff assistance
- Doctor documentation time is reduced
- Payment collected through the app
- Zero patient identity collisions

---

## Languages and Tech Stack

### Client platforms

**Patients:**
- No installed app
- WhatsApp primary
- SMS fallback
- USSD in Phase 2

**Clinicians:**
- Android app (primary)
- Optional web dashboard for admin and queue display

---

### Application stack

**Clinician mobile app:**
- React Native (Expo)
- TypeScript
- Android-first performance constraints

**Web app and dashboard:**
- Next.js with TypeScript
- Deployed on Vercel

**Authentication:**
- Clerk for staff only
- Roles: nurse, doctor, admin, karibu_manager
- Patients authenticate via magic link sent through WhatsApp
  - Magic link contains secure token tied to patient's WhatsApp number
  - No password or OTP required (WhatsApp access = authentication)
  - Token creates session that persists for 7 days
  - Links expire after 30 days, can be regenerated via WhatsApp request

**Database:**
- Supabase Postgres
- Row Level Security enforced
- Core tables include patients, visits, queue events, consents, provider notes, patient notes, payments, follow-ups, and message logs

**Backend and serverless:**
- Supabase Edge Functions using Deno and TypeScript
- Handles messaging webhooks, payment webhooks, AI pipeline triggers, and secure patient link issuance

**File storage:**
- Supabase Storage
- Audio uploaded post-visit
- Configurable retention and deletion

---

### Messaging layer

**WhatsApp:**
- Meta WhatsApp Cloud API
- Template messages for queue updates, patient notes, follow-ups, and payment links

**SMS:**
- Two-way SMS aggregator reliable in Uganda
- Numeric responses only

---

### Payments

**Processor:**
- Flutterwave

**Flow:**
- Visit finalized creates an invoice
- Payment link sent via WhatsApp or SMS
- Supports full payment or installments

**Webhooks:**
- Flutterwave webhooks handled by Edge Functions
- Signature verification
- Payment and visit status updates
- Receipt sent to patient

---

### AI pipeline

**Execution:**
- Server-side only

**Stages:**
1. Speech-to-text transcription
2. Provider note draft
3. Patient note draft
4. Optional translation (English and Luganda at MVP)

**Finalization:**
- Doctor edits drafts
- Finalization locks notes with versioning

---

## Device and Performance Constraints

- Must function on low-RAM Android devices
- Minimal UI complexity
- Text-first outputs
- Audio compression with resumable upload
- Patient note page under 200 KB excluding fonts

---

## Security Summary

- Explicit consent for recording
- Audio encrypted locally
- Audio deletable after processing
- Staff access enforced via Clerk and Supabase RLS
- Patient access via magic links:
  - Token-based authentication (no passwords)
  - Links expire after 30 days
  - Sessions expire after 7 days of inactivity
  - Old links invalidated when new link requested
  - Rate limiting on link generation (5 per hour)
- Karibu Manager access restricted to designated Anthropic/Karibu staff

---

## Architecture Overview

**Flow:**
```
Patient (WhatsApp or SMS)
  → WhatsApp Cloud API or SMS Gateway
  → Next.js on Vercel and Supabase Edge Functions
  → Supabase Postgres (patients, visits, notes, payments)
  → Supabase Storage (audio uploads)
  → AI pipeline (transcription and note generation)
  → Flutterwave (payments)
  → Clinician Android App (React Native)
  → Clerk Authentication for staff roles
```

---

## Success Metrics and KPIs

### Primary Success Metrics

| Metric | Baseline | MVP Target | Measurement Method |
|--------|----------|------------|-------------------|
| Documentation time per visit | 10-15 min manual | Under 3 min review | In-app timer from recording stop to finalization |
| Patient throughput | Clinic baseline | 20% increase | Visits per day per doctor |
| Patient wait time awareness | None | 90% receive updates | WhatsApp delivery receipts |
| Payment collection rate | Clinic baseline | 15% improvement | Payments received within 7 days of visit |
| Visit completion rate | N/A | 95% of started visits reach CLOSED | Queue state analytics |

### Secondary Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| AI transcription usability | 80% of drafts require minor or no edits | Doctor feedback survey |
| Message delivery rate | 95% WhatsApp, 90% SMS | API delivery confirmations |
| Audio upload success rate | 99% within 24 hours | Storage upload logs |
| App crash rate | Under 1% of sessions | Crash analytics |
| Offline operation success | 100% of recordings recoverable | Local storage integrity checks |

### Operational Health Indicators

- Average queue wait time (target: clinic-defined, tracked for trends)
- Follow-up response rate (target: 50% of patients respond)
- System uptime (target: 99% excluding planned maintenance)
- AI pipeline latency (target: transcript ready within 5 minutes of upload)

### MVP Validation Criteria

The MVP is successful if after 30 days of operation:
1. Doctors report reduced documentation burden (qualitative survey)
2. At least 80% of visits use the recording workflow
3. No patient data loss incidents
4. Payment collection is equal to or better than previous method

---

## Error Handling and Failure Modes

### Messaging Failures

| Failure | Detection | System Response | User Experience |
|---------|-----------|-----------------|-----------------|
| WhatsApp API timeout | API response timeout after 10s | Retry 3x with exponential backoff, then queue for later | Patient sees delay; staff notified if critical |
| WhatsApp API rate limit | 429 response | Queue messages, process at allowed rate | Slight delay in delivery |
| WhatsApp API down | Multiple consecutive failures | Switch to SMS for critical messages | Patient receives SMS instead |
| SMS gateway failure | Delivery failure callback | Log and alert; no automatic retry for non-critical | Staff manually follows up if needed |
| Invalid phone number | API rejection | Mark patient record for review | Staff notified to verify number |
| Patient blocks WhatsApp | Delivery failure status | Flag patient, switch to SMS | Patient receives SMS |

### Audio and Recording Failures

| Failure | Detection | System Response | User Experience |
|---------|-----------|-----------------|-----------------|
| Microphone permission denied | OS permission check | Block recording, prompt for permission | Clear error message with instructions |
| Recording interruption (call, app switch) | OS lifecycle events | Auto-pause, resume when possible | Visual indicator, option to continue or restart |
| Storage full on device | Write failure | Alert before recording starts if low | Warning message, suggest clearing space |
| Audio file corruption | Checksum validation on upload | Prompt doctor to re-record if possible | Error message with guidance |
| Upload failure (network) | HTTP error response | Retry with exponential backoff, store in retry queue | Shows "pending upload" status |
| Upload timeout | No response after 60s | Chunk upload, resume from last chunk | Progress indicator, automatic retry |

### AI Pipeline Failures

| Failure | Detection | System Response | User Experience |
|---------|-----------|-----------------|-----------------|
| Transcription API timeout | No response after 2 min | Retry once, then queue for manual processing | "Processing delayed" notification |
| Transcription API error | Error response | Log error, alert ops, queue for retry | Doctor notified of delay |
| Poor transcription quality | Confidence score below threshold | Flag for doctor review, highlight uncertain sections | Visual indicators on uncertain text |
| Note generation failure | AI API error | Provide raw transcript, doctor writes note manually | Transcript available, manual note entry enabled |
| Language detection failure | Unsupported language detected | Default to English processing, flag for review | May require more doctor edits |

### Payment Failures

| Failure | Detection | System Response | User Experience |
|---------|-----------|-----------------|-----------------|
| Payment link generation failure | Flutterwave API error | Retry, then allow manual invoice | Staff notified, can generate manually |
| Payment timeout | No webhook within expected window | Check payment status via API | Patient can retry or pay in person |
| Partial payment failure | Webhook indicates failure | Log attempt, keep invoice open | Patient notified, can retry |
| Webhook signature invalid | Signature mismatch | Reject webhook, log security event | No user impact, ops alerted |
| Duplicate payment | Same transaction ID received twice | Idempotent handling, ignore duplicate | No double charge |

### Database and Sync Failures

| Failure | Detection | System Response | User Experience |
|---------|-----------|-----------------|-----------------|
| Supabase connection timeout | Connection error | Retry with backoff, operate in offline mode | App continues working offline |
| Write conflict (concurrent edits) | Conflict detection on sync | Last write wins | Later edit preserved, earlier discarded |
| Row Level Security violation | Permission denied error | Log security event, show error | User sees permission error |
| Database migration failure | Deployment check | Rollback migration, alert ops | No user impact if caught in deployment |

### Queue State Failures

| Failure | Detection | System Response | User Experience |
|---------|-----------|-----------------|-----------------|
| Invalid state transition | State machine validation | Reject transition, log error | User prompted to refresh |
| Orphaned visit (stuck in state) | Scheduled job checks for stale visits | Alert staff after configurable timeout | Staff manually resolves |
| Duplicate queue entry | Unique constraint violation | Prevent duplicate, show existing entry | User sees existing queue position |

### Recovery Procedures

**Audio Recovery:**
- Local audio persists until explicit confirmation of successful transcription
- Unsynced recordings visible in "pending" list
- Manual upload trigger available

**Data Recovery:**
- Supabase point-in-time recovery enabled
- Daily automated backups
- Visit data reconstructable from audit log if needed

**Graceful Degradation Priority:**
1. Patient safety (consent, critical alerts) - never degrade
2. Visit documentation - can delay but must complete
3. Queue updates - can operate manually
4. Payments - can defer to in-person

---

## Offline Sync Strategy

### Sync Model

**Strategy:** Last write wins with timestamp-based conflict resolution.

### Data Storage by Location

| Data Type | Stored Locally | Stored on Server | Sync Behavior |
|-----------|---------------|------------------|---------------|
| Audio recording | Yes (temporary) | No | Upload only, delete after confirmed transcription |
| Transcript | No | Yes | Server-generated, pulled to device |
| Provider note draft | Yes (during edit) | Yes | Push on save, last write wins |
| Patient note draft | Yes (during edit) | Yes | Push on save, last write wins |
| Queue state | Cached | Yes (authoritative) | Pull on refresh, push state changes |
| Patient demographics | Cached | Yes | Pull only, edits go to server |
| Consent records | Cached | Yes | Push immediately when captured |
| Visit metadata | Cached | Yes | Bi-directional sync |

### Audio Lifecycle

```
Recording starts
  → Audio written to encrypted local storage
  → Recording stops
  → Doctor reviews and submits
  → Upload begins when connectivity available
  → Server confirms receipt and begins transcription
  → Transcription completes
  → Server confirms transcript saved
  → Local audio deleted
  → Only transcript persists in medical record
```

**Audio is never permanently stored.** It exists only as a transient input to generate the transcript.

### Conflict Resolution Rules

1. **Timestamps are authoritative** - every write includes a client timestamp
2. **Last write wins** - newer timestamp overwrites older
3. **Deleted data stays deleted** - deletion is a write with a tombstone
4. **Queue state changes are atomic** - server validates transitions

### Offline Capabilities

**Fully functional offline:**
- Audio recording
- Viewing cached patient info
- Viewing cached queue
- Drafting notes (local only until sync)

**Requires connectivity:**
- Initial patient lookup
- Queue state changes (sync required)
- Sending messages to patients
- Payment processing
- AI transcription

### Sync Triggers

- App foreground (if more than 5 minutes since last sync)
- Manual pull-to-refresh
- After completing a visit
- After audio upload completes
- Network connectivity restored after offline period

---

## Data Retention and Audit Trail

### Retention Policies

| Data Type | Retention Period | Deletion Method | Notes |
|-----------|-----------------|-----------------|-------|
| Audio recordings | 0 days (deleted after transcription) | Automatic | Never persisted beyond processing |
| Visit transcripts | 7 years | Manual request only | Core medical record |
| Provider notes | 7 years | Manual request only | Core medical record |
| Patient notes | 7 years | Manual request only | Core medical record |
| Queue events | 1 year | Automatic archival | Operational data |
| Consent records | 7 years + duration of care | Manual request only | Legal requirement |
| Audit logs | 3 years | Automatic archival | Security and compliance |
| Message logs | 1 year | Automatic deletion | Operational data |
| Payment records | 7 years | Manual request only | Financial records |

### Audit Trail Requirements

**All audited events include:**
- Timestamp (UTC)
- Actor (user ID or system)
- Actor role
- Action type
- Resource type and ID
- Previous value (for updates)
- New value (for updates)
- IP address (when available)
- Device identifier (when available)

**Events that must be audited:**

| Category | Events |
|----------|--------|
| Authentication | Login, logout, failed login, password change |
| Patient data | View, create, update patient record |
| Visit data | Create visit, state transitions, note edits, finalization |
| Consent | Consent granted, consent revoked, consent viewed |
| Audio | Recording started, recording stopped, upload initiated, upload confirmed, audio deleted |
| Notes | Draft created, draft edited, note finalized, note viewed |
| Queue | Patient added, state changed, patient removed |
| Payments | Invoice created, payment link sent, payment received, payment failed |
| Admin | User created, role changed, user deactivated |

### Audit Log Storage

- Stored in separate Supabase table with restricted access
- Write-only for application (no deletes or updates)
- Read access limited to admin role
- Indexed by timestamp, actor, and resource for efficient queries

### Data Deletion Requests

If a patient requests data deletion:
1. Verify identity via WhatsApp OTP
2. Log the deletion request (audit trail)
3. Delete patient-facing data (patient notes, messages)
4. Anonymize visit records (remove identifying info, keep clinical data for aggregate analysis)
5. Retain audit trail of the deletion itself
6. Confirm deletion to patient

---

## Testing and Quality Strategy

### Testing Pyramid

```
         E2E Tests (10%)
        /            \
   Integration Tests (30%)
      /                \
     Unit Tests (60%)
```

### Unit Testing

**Coverage target:** 80% of business logic

**Focus areas:**
- Queue state machine transitions
- Consent validation logic
- Payment calculation
- Message formatting
- Data validation

**Tools:** Jest for TypeScript/JavaScript

### Integration Testing

**Coverage target:** Critical paths covered

**Focus areas:**
- API endpoint request/response
- Database operations with RLS
- Supabase Edge Function triggers
- WhatsApp webhook handling
- Payment webhook handling

**Tools:** Jest + Supabase local emulator

### End-to-End Testing

**Coverage target:** Happy path + critical error paths

**Scenarios:**
- Complete patient journey (queue → visit → note → payment)
- Offline recording and later sync
- Consent refusal flow
- Payment failure and retry

**Tools:** Detox for React Native, Playwright for web

### Performance Testing

| Test | Target | Tool |
|------|--------|------|
| App startup time | Under 3 seconds on mid-range Android | Manual + profiling |
| Audio upload (1 min recording) | Under 30 seconds on 3G | Simulated network |
| Patient note page load | Under 2 seconds on 3G | Lighthouse |
| API response time (p95) | Under 500ms | Load testing |

### Quality Gates

**Before merge:**
- All unit tests pass
- No new lint errors
- Type checking passes

**Before deployment:**
- Integration tests pass
- E2E smoke test passes
- No critical security vulnerabilities in dependencies

### User Acceptance Testing

**MVP UAT plan:**
1. Deploy to staging environment
2. Train 2-3 staff members at pilot clinic
3. Shadow 10 real visits (with patient consent)
4. Collect feedback via structured survey
5. Fix blocking issues
6. Repeat until staff confidence is high

---

## Third-Party Dependency Risks

### Critical Dependencies

| Dependency | Risk Level | Failure Impact | Mitigation |
|------------|------------|----------------|------------|
| WhatsApp Business API | High | Patient communication fails | SMS fallback via Twilio |
| Supabase | High | All data operations fail | Local caching, multi-region if budget allows |
| Flutterwave | Medium | Payments fail | Manual payment recording, defer to in-person |
| Clerk | Medium | Staff cannot log in | Session caching, extended token validity |
| AI Transcription API | Medium | Notes require manual entry | Graceful degradation to manual workflow |
| Vercel | Medium | Web dashboard unavailable | Mobile app continues to function |

### WhatsApp Business API Considerations

**Terms of Service constraints:**
- Must use approved message templates for outbound messages
- 24-hour window for free-form responses after user message
- Business verification required
- Healthcare use case must be approved

**Fallback strategy:**
- Primary: WhatsApp Business API (Meta Cloud)
- Fallback: Twilio SMS for critical messages
- Messages classified by priority:
  - Critical (consent, urgent alerts): both channels
  - Standard (queue updates, notes): WhatsApp only, manual follow-up if failed

### Vendor Lock-in Assessment

| Component | Lock-in Risk | Portability |
|-----------|--------------|-------------|
| Supabase Postgres | Low | Standard PostgreSQL, exportable |
| Supabase Auth | Medium | Would require migration to another auth provider |
| Supabase Storage | Low | S3-compatible, portable |
| Supabase Edge Functions | Medium | Deno-based, would need rewrite for other platforms |
| Clerk | Medium | Standard OIDC, portable with effort |
| Vercel | Low | Next.js runs anywhere |
| React Native | Low | Standard framework |

### Cost Exposure

| Service | Free Tier | Estimated MVP Usage | Risk |
|---------|-----------|---------------------|------|
| Supabase | 500MB DB, 1GB storage, 2M edge function invocations | Within free tier initially | Low |
| Vercel | 100GB bandwidth, serverless functions | Within free tier | Low |
| Clerk | 10,000 MAU | Under 100 users for MVP | Low |
| WhatsApp Business API | 1,000 free conversations/month | May exceed, ~$0.05/conversation after | Medium |
| Twilio SMS | Pay as you go | Minimal if WhatsApp primary | Low |
| Flutterwave | Transaction fees only | ~2.9% per transaction | Passed to clinic |

---

## Database Schema

### Entity Relationship Overview

```
patients ─────────────┬──── visits ──────── queue_events
    │                 │         │
    │                 │         ├──── provider_notes
    │                 │         │
    │                 │         ├──── patient_notes
    │                 │         │
    │                 │         ├──── consents
    │                 │         │
    │                 │         ├──── payments
    │                 │         │
    │                 │         └──── follow_ups
    │                 │
    └── message_logs ─┘

staff ──── audit_logs

clinics ──── staff (many-to-many via clinic_staff)
```

### Core Tables

**patients**
```sql
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number TEXT UNIQUE NOT NULL,
  display_name TEXT,
  date_of_birth DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**clinics**
```sql
CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  timezone TEXT DEFAULT 'Africa/Kampala',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**staff**
```sql
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'doctor', 'nurse')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);
```

**clinic_staff**
```sql
CREATE TABLE clinic_staff (
  clinic_id UUID REFERENCES clinics(id),
  staff_id UUID REFERENCES staff(id),
  PRIMARY KEY (clinic_id, staff_id)
);
```

**rooms**
```sql
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) NOT NULL,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL CHECK (room_type IN ('consultation', 'intake', 'waiting', 'other')),
  capacity INTEGER,
  display_order INTEGER DEFAULT 0,
  qr_code_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**clinic_config**
```sql
CREATE TABLE clinic_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) UNIQUE NOT NULL,
  whatsapp_phone_number TEXT,
  whatsapp_business_account_id TEXT,
  pre_intake_enabled BOOLEAN DEFAULT TRUE,
  pre_intake_questions JSONB DEFAULT '{"reason_for_visit": true, "red_flags": true, "allergies": true, "medications": true}',
  red_flag_symptoms JSONB DEFAULT '["chest pain", "difficulty breathing", "severe bleeding", "loss of consciousness"]',
  payment_currency TEXT DEFAULT 'UGX',
  default_visit_fee INTEGER,
  installments_enabled BOOLEAN DEFAULT TRUE,
  flutterwave_merchant_id TEXT,
  operating_hours JSONB DEFAULT '{}',
  after_hours_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**magic_links**
```sql
CREATE TABLE magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) NOT NULL,
  visit_id UUID REFERENCES visits(id),
  token TEXT UNIQUE NOT NULL,
  token_type TEXT NOT NULL CHECK (token_type IN ('patient_note', 'payment', 'general')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**patient_sessions**
```sql
CREATE TABLE patient_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) NOT NULL,
  magic_link_id UUID REFERENCES magic_links(id),
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  device_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**visits**
```sql
CREATE TABLE visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) NOT NULL,
  patient_id UUID REFERENCES patients(id) NOT NULL,
  queue_number INTEGER,
  current_state TEXT NOT NULL DEFAULT 'NEW',
  chief_complaint TEXT,
  triage_priority TEXT CHECK (triage_priority IN ('normal', 'urgent', 'emergency')),
  intake_nurse_id UUID REFERENCES staff(id),
  doctor_id UUID REFERENCES staff(id),
  intake_data JSONB DEFAULT '{}',
  nurse_summary TEXT,
  visit_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  finalized_at TIMESTAMPTZ
);
```

**queue_events**
```sql
CREATE TABLE queue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  triggered_by UUID REFERENCES staff(id),
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);
```

**consents**
```sql
CREATE TABLE consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) NOT NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('care', 'recording')),
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  captured_by UUID REFERENCES staff(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES staff(id)
);
```

**provider_notes**
```sql
CREATE TABLE provider_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) UNIQUE NOT NULL,
  transcript TEXT,
  note_content TEXT,
  structured_data JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES staff(id)
);
```

**patient_notes**
```sql
CREATE TABLE patient_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) UNIQUE NOT NULL,
  content TEXT,
  language TEXT DEFAULT 'en',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Note: Access tokens managed via magic_links table, not stored on patient_notes
```

**payments**
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) NOT NULL,
  amount_due INTEGER NOT NULL,
  amount_paid INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'UGX',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'waived')),
  payment_link TEXT,
  flutterwave_tx_ref TEXT,
  installment_plan JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**follow_ups**
```sql
CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  response TEXT,
  response_at TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'responded', 'missed')),
  alert_level TEXT CHECK (alert_level IN ('green', 'yellow', 'red'))
);
```

**message_logs**
```sql
CREATE TABLE message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id),
  visit_id UUID REFERENCES visits(id),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT,
  content_summary TEXT,
  external_id TEXT,
  status TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);
```

**audit_logs**
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('staff', 'patient', 'system')),
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  previous_value JSONB,
  new_value JSONB,
  ip_address INET,
  device_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Row Level Security Policies

```sql
-- Staff can only see patients at their clinics
CREATE POLICY "Staff sees clinic patients" ON patients
  FOR SELECT USING (
    id IN (
      SELECT patient_id FROM visits
      WHERE clinic_id IN (
        SELECT clinic_id FROM clinic_staff
        WHERE staff_id = auth.uid()
      )
    )
  );

-- Doctors can only see/edit visits assigned to them or at their clinic
CREATE POLICY "Doctors see own visits" ON visits
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_staff
      WHERE staff_id = auth.uid()
    )
  );

-- Provider notes visible only to staff
CREATE POLICY "Staff sees provider notes" ON provider_notes
  FOR SELECT USING (
    visit_id IN (
      SELECT id FROM visits
      WHERE clinic_id IN (
        SELECT clinic_id FROM clinic_staff
        WHERE staff_id = auth.uid()
      )
    )
  );

-- Audit logs are insert-only, read by admin only
CREATE POLICY "Audit insert only" ON audit_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin reads audit" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

---

## API Endpoint Inventory

### Patient-Facing (Public, Token-Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/patient/note/:token` | Retrieve patient note by access token |
| POST | `/api/patient/queue/join` | Join queue via QR code (creates visit) |
| POST | `/api/patient/followup/respond` | Submit follow-up response |

### WhatsApp Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks/whatsapp` | Webhook verification |
| POST | `/api/webhooks/whatsapp` | Incoming messages and status updates |

### Payment Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/flutterwave` | Payment status updates |

### Staff API (Authenticated via Clerk)

**Patients**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/patients` | List patients (paginated, search) |
| GET | `/api/patients/:id` | Get patient details |
| POST | `/api/patients` | Create patient |
| PATCH | `/api/patients/:id` | Update patient |

**Queue**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/queue` | Get current queue for clinic |
| POST | `/api/queue/add` | Add patient to queue |
| POST | `/api/queue/:visitId/transition` | Transition queue state |

**Visits**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/visits` | List visits (filtered by date, state) |
| GET | `/api/visits/:id` | Get visit details |
| POST | `/api/visits` | Create visit |
| PATCH | `/api/visits/:id` | Update visit |
| POST | `/api/visits/:id/intake` | Submit intake data |
| POST | `/api/visits/:id/handoff` | Nurse handoff to doctor |

**Consent**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/visits/:id/consent` | Record consent |
| DELETE | `/api/visits/:id/consent/:type` | Revoke consent |

**Recording and Notes**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/visits/:id/audio/upload-url` | Get presigned upload URL |
| POST | `/api/visits/:id/audio/confirm` | Confirm upload, trigger processing |
| GET | `/api/visits/:id/notes` | Get both notes for visit |
| PATCH | `/api/visits/:id/notes/provider` | Update provider note |
| PATCH | `/api/visits/:id/notes/patient` | Update patient note |
| POST | `/api/visits/:id/finalize` | Finalize visit and notes |

**Payments**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/visits/:id/payment/create` | Create payment and generate link |
| GET | `/api/visits/:id/payment` | Get payment status |
| POST | `/api/visits/:id/payment/waive` | Waive payment (admin only) |

**Follow-ups**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/followups` | List follow-ups needing attention |
| POST | `/api/visits/:id/followup/schedule` | Schedule follow-up |

**Dashboard**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Queue and visit statistics |
| GET | `/api/dashboard/alerts` | Follow-up alerts, pending uploads |

**Admin**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/audit-logs` | Query audit logs |
| GET | `/api/admin/staff` | List staff |
| POST | `/api/admin/staff` | Create staff member |
| PATCH | `/api/admin/staff/:id` | Update staff |

### Patient Magic Link Endpoints (Public, Token-Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/patient/note/:token` | Validate magic link and return patient note |
| POST | `/api/patient/note/:token/session` | Create session from magic link |
| GET | `/api/patient/session/validate` | Validate existing session |
| POST | `/api/patient/request-new-link` | Request new magic link via WhatsApp |

### Karibu Manager API (Authenticated via Clerk, karibu_manager role)

**Clinic Setup Wizard**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/karibu/clinics` | Create new clinic |
| GET | `/api/karibu/clinics` | List all clinics |
| GET | `/api/karibu/clinics/:id` | Get clinic details |
| PATCH | `/api/karibu/clinics/:id` | Update clinic |
| POST | `/api/karibu/clinics/:id/activate` | Activate clinic |
| POST | `/api/karibu/clinics/:id/deactivate` | Deactivate clinic |

**Clinic Configuration**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/karibu/clinics/:id/config` | Get clinic configuration |
| PATCH | `/api/karibu/clinics/:id/config` | Update clinic configuration |
| POST | `/api/karibu/clinics/:id/config/whatsapp/test` | Test WhatsApp connection |

**Room Management**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/karibu/clinics/:id/rooms` | List rooms for clinic |
| POST | `/api/karibu/clinics/:id/rooms` | Create room |
| PATCH | `/api/karibu/clinics/:id/rooms/:roomId` | Update room |
| DELETE | `/api/karibu/clinics/:id/rooms/:roomId` | Delete room |
| POST | `/api/karibu/clinics/:id/rooms/:roomId/qr` | Generate QR code for room |

**Staff Management (Cross-Clinic)**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/karibu/staff` | List all staff across clinics |
| POST | `/api/karibu/clinics/:id/staff` | Add staff to clinic |
| DELETE | `/api/karibu/clinics/:id/staff/:staffId` | Remove staff from clinic |
| POST | `/api/karibu/clinics/:id/staff/invite` | Send invitation email to new staff |

**Message Templates**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/karibu/clinics/:id/templates` | List message templates |
| POST | `/api/karibu/clinics/:id/templates` | Create/update template |
| POST | `/api/karibu/clinics/:id/templates/:templateId/submit` | Submit template for WhatsApp approval |

**Monitoring and Support**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/karibu/clinics/:id/health` | Get clinic health indicators |
| GET | `/api/karibu/clinics/:id/usage` | Get usage statistics (messages, AI, storage) |
| GET | `/api/karibu/audit-logs` | Global audit logs (all clinics) |

---

## Support and Operations Model

### Team Structure (MVP)

**Two-person team:**
1. **Technical lead** - Development, deployment, on-call for system issues
2. **Clinical/operations lead** - Staff training, clinic relationship, user support

### Support Tiers

| Tier | Handled By | Response Time | Examples |
|------|------------|---------------|----------|
| Tier 1 | Clinic staff self-service | Immediate | Password reset, basic app questions |
| Tier 2 | Operations lead | Within 4 hours | Workflow questions, data questions |
| Tier 3 | Technical lead | Within 24 hours | Bugs, system issues |
| Emergency | Both | Within 1 hour | Data loss, security incident, system down |

### Support Channels

- **Primary:** WhatsApp group with clinic staff and team
- **Documentation:** Simple FAQ document shared with clinic
- **Escalation:** Direct phone call for emergencies

### Monitoring (MVP-Appropriate)

| What | How | Alert Threshold |
|------|-----|-----------------|
| API uptime | Vercel built-in monitoring | Any downtime |
| Database connections | Supabase dashboard | Manual check daily |
| Message delivery failures | Log aggregation | More than 5 failures in 1 hour |
| Payment failures | Flutterwave dashboard + logs | Any failure |
| Audio upload queue | Supabase Storage metrics | More than 10 pending over 1 hour |

### Incident Response

1. **Detect** - Alert or user report
2. **Acknowledge** - Respond in support channel within SLA
3. **Diagnose** - Check logs, identify issue
4. **Mitigate** - Temporary fix if possible
5. **Resolve** - Permanent fix
6. **Document** - Brief incident note for learning

### Rollout Plan

**Phase 1: Single clinic pilot**
- Deploy to production
- Train 2-3 staff members (1 nurse, 1-2 doctors)
- Shadow visits for first week
- Daily check-ins for first two weeks
- Fix issues as they arise

**Phase 2: Full clinic adoption**
- Train remaining staff
- Monitor for two weeks
- Collect feedback

**Phase 3: Diocese expansion (if successful)**
- Document deployment process
- Create training materials
- Identify clinic champions
- Staged rollout to additional clinics

### Go/No-Go Criteria for Expansion

- Zero critical bugs in production for 2 weeks
- Staff satisfaction above neutral
- Patient complaints below 5% of visits
- Payment collection rate maintained or improved

---

## Cost Model

### Monthly Operating Costs (MVP Estimates)

| Service | Free Tier | Overage Cost | Estimated Monthly |
|---------|-----------|--------------|-------------------|
| Supabase (Pro if needed) | Yes | $25/month | $0-25 |
| Vercel | Yes | $20/month | $0 |
| Clerk | 10K MAU free | $0.02/MAU after | $0 |
| WhatsApp Business API | 1,000 conversations | ~$0.05/conversation | $0-50 |
| Twilio SMS (fallback) | Pay as you go | ~$0.05/message | $0-10 |
| AI Transcription (Whisper API) | Pay as you go | ~$0.006/minute | $30-60 |
| AI Note Generation (GPT-4) | Pay as you go | ~$0.03/1K tokens | $20-40 |
| Domain | Annual | ~$12/year | $1 |

**Estimated monthly total: $50-150**

### Per-Visit Cost Breakdown

Assuming 50 visits/day, 22 days/month = 1,100 visits/month:

| Component | Cost per Visit |
|-----------|---------------|
| WhatsApp messages (3-4 per visit) | $0.01-0.02 |
| Audio transcription (5 min avg) | $0.03 |
| Note generation | $0.02-0.04 |
| Infrastructure (amortized) | $0.02 |
| **Total per visit** | **$0.08-0.12** |

### Payment Processing Costs

- Flutterwave: ~2.9% + small fixed fee
- This cost is typically passed to the clinic or patient
- On a 50,000 UGX visit (~$13 USD), fee is ~$0.38

### Scaling Considerations

| Scale | Monthly Visits | Estimated Monthly Cost |
|-------|---------------|------------------------|
| 1 clinic | 1,000 | $50-150 |
| 5 clinics | 5,000 | $200-400 |
| 20 clinics | 20,000 | $600-1,000 |

### Cost Reduction Strategies

1. **Batch AI requests** - Process multiple visits together during off-peak
2. **Shorter recordings** - Encourage concise visits, reduces transcription cost
3. **Local transcription** - Investigate on-device Whisper for Phase 2
4. **Aggressive caching** - Reduce API calls for repeat data

### Revenue Model (Future Consideration)

Options for sustainability:
- Per-visit fee to clinic ($0.15-0.25)
- Monthly subscription per clinic ($50-100/month)
- Transaction fee on payments (0.5% on top of processor fee)
- Diocese-level licensing

---

## User Stories, Acceptance Criteria, and Edge Cases

### Patient Entry and Queue Join

**US-001: Patient joins queue via QR code**
> As a patient, I want to scan a QR code at the clinic to join the queue so that I don't have to wait in a physical line.

**Acceptance Criteria:**
- Patient scans QR code which opens WhatsApp with pre-filled message
- System identifies patient by WhatsApp number
- New patients get a stub profile created automatically
- Existing patients are matched to their existing record
- Patient receives confirmation message with queue position
- Queue state is set to WAITING

**Edge Cases:**
- Patient scans code but WhatsApp is not installed → Show fallback instructions for SMS
- Patient's phone number is already in an active queue → Show existing queue position, do not create duplicate
- QR code is expired or invalid → Display error message with instructions to get new code
- Patient has multiple WhatsApp numbers → Each number is treated as separate identity

---

**US-002: Pre-intake questionnaire completion**
> As a patient, I want to answer basic health questions before arrival so that the clinic can prepare for my visit.

**Acceptance Criteria:**
- Patient receives optional pre-intake prompts after joining queue
- Questions include: reason for visit, red-flag symptoms, allergies, current medications
- Responses are stored against the visit record
- Red-flag responses trigger URGENT triage status
- Patient can skip optional questions
- Total data usage under 10KB for questionnaire

**Edge Cases:**
- Patient indicates red-flag symptoms → Immediate notification to staff, mark as URGENT, send instruction to patient
- Patient stops responding mid-questionnaire → Save partial responses, allow completion later
- Patient responds with free text when yes/no expected → Parse response, ask for clarification if ambiguous
- Network drops during questionnaire → Responses queued locally on WhatsApp, delivered when reconnected

---

**US-003: Patient arrival confirmation**
> As a patient, I want to confirm my arrival so the clinic knows I'm ready to be seen.

**Acceptance Criteria:**
- Patient receives "Are you here?" message when near front of queue
- Patient can reply YES or numeric response (1) to confirm
- Nurse can manually mark patient as arrived via app
- State transitions from WAITING to ARRIVED
- Patient receives room assignment after confirmation

**Edge Cases:**
- Patient confirms arrival but is not physically present → Nurse can reset to WAITING state
- Patient does not respond within 15 minutes → Send reminder, then move to back of queue after 30 minutes
- Multiple patients confirm arrival simultaneously → System handles concurrent state transitions
- Patient replies with unexpected text → Prompt for YES/NO clarification

---

### Nurse Intake Workflow

**US-004: Patient identity verification**
> As a nurse, I want to verify patient identity to ensure I'm documenting the correct person.

**Acceptance Criteria:**
- Nurse views patient queue filtered by ARRIVED state
- Nurse selects patient and sees WhatsApp number
- Nurse confirms identity verbally (last 4 digits of phone number)
- System logs identity verification event
- State transitions from ARRIVED to IN_INTAKE

**Edge Cases:**
- Patient cannot recall their phone number → Nurse can search by name or browse recent arrivals
- Wrong patient selected → Nurse can cancel and select correct patient without data loss
- Patient identity mismatch detected → Alert displayed, nurse can update patient record or create new

---

**US-005: Consent capture**
> As a nurse, I want to capture patient consent for care and recording so we have legal authorization.

**Acceptance Criteria:**
- Two separate consent captures: care consent and recording/transcription consent
- Each consent is timestamped with staff ID who captured it
- Consent status is clearly visible to all staff
- Recording consent can be declined while care consent is granted
- Consents are immutable once captured (revocation creates new record)

**Edge Cases:**
- Patient declines recording consent → System flags visit for manual note entry only
- Patient declines care consent → Visit cannot proceed, must be resolved before continuing
- Patient changes mind about consent during visit → Revocation stops recording immediately, creates audit record
- Language barrier during consent → Support for translated consent capture in Luganda

---

**US-006: Clinical intake data collection**
> As a nurse, I want to record vitals and symptoms efficiently so the doctor has context.

**Acceptance Criteria:**
- Nurse can enter: vitals, symptoms, history highlights, medications, allergies
- Quick tags available for common conditions (diabetes, asthma, hypertension)
- Triage priority can be set (normal, urgent, emergency)
- Nurse summary field for handoff notes (1-3 sentences)
- All data syncs even if completed offline

**Edge Cases:**
- Nurse cannot complete intake (patient emergency) → Partial data saved, visit can continue
- Vitals outside normal range → Visual warning displayed, optional urgent flag
- Duplicate allergy/medication entries → System deduplicates automatically
- Intake data conflicts with patient history → Highlight discrepancy for nurse review

---

**US-007: Handoff to doctor**
> As a nurse, I want to mark a patient ready for the doctor so they know who to see next.

**Acceptance Criteria:**
- Nurse taps "Ready for Doctor" after completing intake
- State transitions from IN_INTAKE to READY_FOR_DOCTOR
- Doctor receives notification with patient summary
- Nurse summary is visible in doctor's patient view
- Room assignment included in notification

**Edge Cases:**
- Doctor is not available → Patient remains in READY_FOR_DOCTOR, visible in queue
- Multiple patients ready simultaneously → Doctor sees prioritized list (urgent first, then arrival order)
- Nurse needs to add more info after handoff → Can still edit intake data, doctor notified of updates

---

### Doctor Encounter

**US-008: Review patient before visit**
> As a doctor, I want to review patient summary and history before entering the room.

**Acceptance Criteria:**
- Doctor sees: intake summary, past visits, current medications, allergies, consent status
- Recording consent status prominently displayed
- Simple summary view optimized for quick scanning
- Data available offline if previously cached

**Edge Cases:**
- Patient has extensive history → Most recent 5 visits shown, option to load more
- Patient is new → "First visit" indicator displayed
- Consent status unclear → Block recording until consent is confirmed
- Offline and patient data not cached → Show warning, allow basic visit with manual notes

---

**US-009: Patient comfort check**
> As a doctor, I want to verify patient is comfortable with recording so I have verbal confirmation.

**Acceptance Criteria:**
- Doctor verbally reconfirms recording consent before starting
- Doctor confirms consent status in app before recording
- If patient declines, system routes to manual note workflow
- Comfort check is logged in audit trail

**Edge Cases:**
- Patient previously consented but now declines → Recording disabled, existing consent marked revoked
- Patient is uncomfortable but doesn't explicitly decline → Doctor can proceed with manual notes
- Doctor forgets to confirm → Warning if attempting to record without confirmation
- Patient is non-verbal → Alternative consent capture method (caregiver, written)

---

**US-010: Audio recording of visit**
> As a doctor, I want to record the visit audio so it can be transcribed automatically.

**Acceptance Criteria:**
- Large, visible Record button
- Recording indicator visible during capture
- Audio stored locally with encryption
- Optional bookmarks for key moments (diagnosis, medications, instructions)
- Recording can be paused and resumed
- Stop button ends recording and shows review options

**Edge Cases:**
- Phone call interrupts recording → Auto-pause, prompt to resume when call ends
- App crashes during recording → Audio saved to point of crash, recoverable
- Storage full → Warning before recording starts, suggest clearing space
- Recording exceeds 30 minutes → Warning displayed, recording continues
- Microphone permission denied → Clear error with instructions to enable

---

**US-011: Manual note entry (no recording)**
> As a doctor, I want to type notes manually when recording is not appropriate.

**Acceptance Criteria:**
- Doctor can type provider note directly without recording
- Structured fields available: diagnosis, medications, follow-up, tests ordered
- Patient note can be generated from manual input
- Visit can complete without audio
- Same finalization workflow as recorded visits

**Edge Cases:**
- Doctor starts manual then wants to record → Can switch modes if consent allows
- Partial manual entry then recording → Both inputs combined in final note
- Manual note is very brief → System prompts for minimum required fields
- Copy/paste from external source → Supported, logged in audit

---

**US-012: Structured data entry during visit**
> As a doctor, I want to capture key clinical data in structured fields for searchability.

**Acceptance Criteria:**
- Optional fields: diagnosis, medications prescribed, follow-up instructions, tests ordered
- Recent medications and biometrics can be added
- Fields auto-populate in generated notes
- Data searchable across visits for patient history

**Edge Cases:**
- Medication not in database → Free text entry allowed
- Multiple diagnoses → Support for multiple entries
- Doctor skips structured fields → Notes generated from transcript only
- Structured data conflicts with transcript → Structured fields take precedence

---

### AI Processing and Notes

**US-013: Audio upload and transcription**
> As a doctor, I want the recording to be transcribed automatically so I don't have to type.

**Acceptance Criteria:**
- Doctor taps Submit to initiate upload
- Upload happens when connectivity available
- Progress indicator shows upload status
- Transcription begins automatically after upload
- Doctor notified when draft is ready

**Edge Cases:**
- Upload fails repeatedly → Retry queue, manual retry option, keeps trying for 24 hours
- Audio quality poor → Transcription proceeds with low-confidence markers
- Language detection fails → Default to English, flag for review
- Upload interrupted → Resume from last chunk, no re-upload of completed portions

---

**US-014: Dual note generation**
> As a doctor, I want separate provider and patient notes generated automatically.

**Acceptance Criteria:**
- Provider note: technical format (SOAP or similar), medical terminology
- Patient note: plain language, no jargon, actionable next steps
- Both notes generated from same transcript
- Notes include structured data entered during visit
- Draft status clearly indicated

**Edge Cases:**
- Transcription has errors → Uncertain sections highlighted for review
- Very short recording → Basic notes generated, doctor prompted to add detail
- Multiple languages in recording → Primary language detected, secondary noted
- Sensitive content in transcript → Flagged for doctor review before finalizing

---

**US-015: Review and edit notes**
> As a doctor, I want to review and edit generated notes before they're finalized.

**Acceptance Criteria:**
- Doctor receives "Draft Ready" notification
- Side-by-side view of provider and patient notes
- Full editing capability for both notes
- Changes tracked with timestamps
- Save draft and return later supported

**Edge Cases:**
- Doctor edits then closes without saving → Prompt to save or discard
- Concurrent edit attempt (another device) → Last save wins with warning
- Doctor deletes critical information → Warning for required fields
- Session timeout during edit → Draft auto-saved, recoverable

---

**US-016: Finalize visit**
> As a doctor, I want to finalize the visit to lock the notes and trigger patient delivery.

**Acceptance Criteria:**
- Doctor taps Finalize when satisfied with notes
- Confirmation prompt before finalization
- Notes become read-only (versioned edits only)
- State transitions from DRAFT_READY to FINALIZED
- Audit record created with timestamp, provider ID, version

**Edge Cases:**
- Doctor finalizes then notices error → Can create addendum, cannot modify original
- Finalization fails (network) → Retry automatically, notes remain in draft
- Required fields missing → Block finalization until complete
- Patient note contains sensitive information → Warning prompt before sending to patient

---

### Patient Communication

**US-017: Deliver patient summary via WhatsApp**
> As a patient, I want to receive my visit summary on WhatsApp so I can reference it later.

**Acceptance Criteria:**
- Patient receives WhatsApp message with visit summary
- Includes mobile-friendly link to full patient note
- Plain language, no medical jargon
- Prominent next steps and warning signs
- Option for SMS fallback if WhatsApp delivery fails

**Edge Cases:**
- Patient has blocked WhatsApp → Fallback to SMS
- Link expired → Regeneration available via WhatsApp request
- Patient lost phone → New link can be sent to new number after verification
- WhatsApp API down → Queue for later delivery, notify staff

---

**US-018: View patient note via web link**
> As a patient, I want to view my full visit summary on a simple web page.

**Acceptance Criteria:**
- Link opens mobile-friendly page
- Page under 200KB total
- Readable without login (token-protected URL)
- Contains: diagnosis summary, medications, next steps, warning signs, follow-up instructions
- Works on low-end devices and slow connections

**Edge Cases:**
- Link shared with others → Token prevents direct sharing, re-authentication available
- Token expired → Option to request new link via WhatsApp
- Page bookmarked → Works for token validity period
- No internet when opening → Cannot load (web-only, not cached)

---

### Payment Flow

**US-019: Receive and pay via payment link**
> As a patient, I want to receive a payment link so I can pay for my visit easily.

**Acceptance Criteria:**
- Payment link sent via WhatsApp after visit finalization
- Two options presented: Pay in full, Pay over time (installments)
- Payment processed through Flutterwave
- Receipt sent after successful payment
- Visit marked as paid in system

**Edge Cases:**
- Payment fails → Retry option, manual payment fallback
- Partial payment → Visit marked as partial, remaining balance tracked
- Payment made in person → Staff can manually record payment
- Duplicate payment attempt → Idempotent handling, no double charge
- Patient never pays → Visit flagged as unpaid, can still close

---

**US-020: Choose payment plan**
> As a patient, I want to pay in installments when I can't afford the full amount.

**Acceptance Criteria:**
- Installment plan option clearly presented
- Plan terms shown before commitment
- Reminders sent for upcoming payments
- Partial payment status visible to clinic
- Grace period before late follow-up

**Edge Cases:**
- Patient misses installment → Reminder sent, grace period applies
- Patient wants to switch to full payment → Supported at any time
- Installment plan canceled by patient → Outstanding balance becomes due
- Currency conversion issues → All payments in UGX, no conversion needed

---

### Follow-up and Completion

**US-021: Book follow-up appointment**
> As a patient, I want to book a follow-up when checking out so I don't forget.

**Acceptance Criteria:**
- Follow-up booking option in patient flow
- Date/time selection via WhatsApp
- Confirmation message sent
- Reminder scheduled before appointment
- Follow-up linked to original visit

**Edge Cases:**
- No availability on preferred date → Alternative dates offered
- Patient doesn't book follow-up → Can request later via WhatsApp
- Follow-up for different concern → New visit created, linked to patient
- Patient doesn't show for follow-up → Marked as missed, outreach sent

---

**US-022: Respond to follow-up check-in**
> As a patient, I want to respond to follow-up messages so my doctor knows how I'm doing.

**Acceptance Criteria:**
- Follow-up message sent at scheduled time
- Simple response options: Improving / No change / Worse
- Numeric responses supported (1, 2, 3)
- Response logged with timestamp
- Alert level set based on response (green/yellow/red)

**Edge Cases:**
- Patient doesn't respond → Marked as missed after 24 hours
- Patient responds with free text → Parse for sentiment, flag if concerning
- Patient indicates emergency symptoms → Immediate alert to staff
- Multiple follow-ups scheduled → Each tracked independently

---

**US-023: Complete visit**
> As clinic staff, I want visits to reach a completed state so records are properly closed.

**Acceptance Criteria:**
- Visit transitions to CLOSED after payment or manual closure
- Payment status attached (paid, partial, unpaid, waived)
- All associated records (notes, consents, payments) finalized
- Visit appears in patient history
- Metrics updated for reporting

**Edge Cases:**
- Visit abandoned mid-flow → Staff can manually close with reason
- Payment pending indefinitely → Auto-close after configurable period (e.g., 30 days)
- Patient requests visit deletion → Anonymize per data deletion process
- Visit reopened for addendum → Addendum added to closed visit, original unchanged

---

### Patient Note Access (Magic Link)

**US-024: Access patient note via magic link**
> As a patient, I want to tap a link in my WhatsApp message to immediately view my visit notes without entering a password.

**Acceptance Criteria:**
- Patient receives WhatsApp message containing unique magic link
- Tapping link opens browser directly to patient note page
- No login form or password entry required
- Link is tied to patient's WhatsApp number
- Page displays full visit summary, medications, and next steps
- Session persists for 7 days on same device

**Edge Cases:**
- Link opened on different device than WhatsApp → Session created on new device, works if within expiry
- Link expired (after 30 days) → Friendly error page with button to request new link via WhatsApp
- Link already used and session expired → Prompt to request new link
- Patient forwards link to someone else → Other person can view (security trade-off for accessibility)
- Patient suspects link compromised → Can request new link which invalidates old one
- Multiple visits → Each visit has its own magic link, patient can have multiple active links

---

**US-025: Request new magic link**
> As a patient, I want to request a new link if my old one expired or I lost it.

**Acceptance Criteria:**
- Patient sends message to clinic WhatsApp (e.g., "send my notes")
- System identifies patient by WhatsApp number
- System generates new magic link for most recent visit
- Old magic link for that visit is invalidated
- New link sent via WhatsApp within seconds

**Edge Cases:**
- Patient has multiple recent visits → Send links for all visits in last 30 days, or ask which visit
- Patient has no recent visits → Friendly message explaining no recent visits found
- Rate limiting → Max 5 link requests per hour to prevent abuse
- Patient number not found → Prompt to visit clinic to register

---

**US-026: View note on shared/public device**
> As a patient, I want to safely view my notes even if I'm using a shared device.

**Acceptance Criteria:**
- Option to "View once without saving session" available on magic link page
- Session not persisted when this option selected
- Clear indication that session will end when browser closed
- Link can be used again after single-use view

**Edge Cases:**
- Patient accidentally closes browser → Can re-open link if not expired
- Patient wants to switch to persistent session → Must request new link
- Public computer auto-closes browser → No data persisted

---

### Karibu Manager and Clinic Setup

**US-027: Create new clinic**
> As a Karibu Manager, I want to create a new clinic in the system so they can start using Karibu Health.

**Acceptance Criteria:**
- Guided wizard walks through all setup steps
- Progress indicator shows current step and completion status
- Can save progress and return later
- Validation at each step before proceeding
- Cannot activate clinic until all required steps complete

**Edge Cases:**
- Wizard abandoned mid-setup → Clinic saved in draft state, can resume
- Duplicate clinic name → Warning shown, suggest unique name
- Invalid WhatsApp number → Validation error with guidance
- Network failure during setup → Progress auto-saved, can retry

---

**US-028: Configure clinic rooms**
> As a Karibu Manager, I want to set up rooms for a clinic so staff can assign patients to specific locations.

**Acceptance Criteria:**
- Add rooms with name, type (consultation, intake, waiting), and capacity
- Set display order for queue views
- Generate unique QR code for each room
- QR codes downloadable as printable PDFs
- Rooms can be deactivated without deletion

**Edge Cases:**
- Duplicate room name in same clinic → Error, require unique names
- Room deleted while patient assigned → Reassign patient to default room
- QR code printed but room renamed → QR still works, shows new name
- Very long room name → Truncate in QR code display, full name in system

---

**US-029: Add clinic staff**
> As a Karibu Manager, I want to add staff members to a clinic so they can log in and use the system.

**Acceptance Criteria:**
- Add staff by email address
- Assign role (admin, doctor, nurse)
- Staff receives invitation email with login instructions
- Staff can be assigned to multiple clinics
- Staff can be deactivated without deletion

**Edge Cases:**
- Email already in system → Prompt to add existing user to this clinic
- Staff email bounces → Alert Karibu Manager, mark invitation as failed
- Staff never accepts invitation → Invitation expires after 7 days, can resend
- Staff assigned to multiple clinics → Clinic selector shown at login

---

**US-030: Configure WhatsApp for clinic**
> As a Karibu Manager, I want to connect a clinic's WhatsApp Business account so patients can communicate.

**Acceptance Criteria:**
- Enter WhatsApp Business Account ID and phone number
- Test connection sends verification message
- Connection status displayed (connected, error, pending)
- Can update WhatsApp configuration if number changes

**Edge Cases:**
- Invalid WhatsApp credentials → Clear error message with troubleshooting steps
- WhatsApp number already used by another clinic → Error, one number per clinic
- Test message fails → Detailed error (rate limit, invalid number, API down)
- WhatsApp account suspended → Alert displayed, clinic cannot send messages

---

**US-031: Configure payment processing**
> As a Karibu Manager, I want to set up payment processing so the clinic can collect payments.

**Acceptance Criteria:**
- Enter Flutterwave merchant ID
- Set default currency (UGX default)
- Set default visit fee (optional)
- Enable/disable installment payment plans
- Test payment flow available

**Edge Cases:**
- Invalid Flutterwave credentials → Validation error
- Flutterwave not available in region → Guidance on alternatives
- Currency not supported → List of supported currencies shown
- Test payment fails → Detailed error for troubleshooting

---

**US-032: Configure pre-intake questionnaire**
> As a Karibu Manager, I want to customize what questions patients answer before arriving.

**Acceptance Criteria:**
- Toggle pre-intake on/off for clinic
- Select which questions to include (reason for visit, red flags, allergies, medications)
- Customize red-flag symptoms list
- Preview questionnaire flow
- Changes take effect immediately

**Edge Cases:**
- All questions disabled → Pre-intake skipped entirely
- Custom red-flag added with typo → Can edit/delete custom flags
- Very long symptom list → Scrollable, searchable in patient view
- Language considerations → Questions available in English and Luganda

---

**US-033: Monitor clinic health**
> As a Karibu Manager, I want to see how each clinic is performing so I can provide support when needed.

**Acceptance Criteria:**
- Dashboard shows all clinics with health indicators
- Health indicators: last activity, message delivery rate, payment rate, error rate
- Red/yellow/green status for quick scanning
- Click into clinic for detailed metrics
- Alerts for clinics with issues

**Edge Cases:**
- New clinic with no data → "New" status, no health indicators yet
- Clinic inactive for extended period → "Inactive" alert
- Sudden spike in errors → Immediate alert notification
- Network issues vs real problems → Differentiate in diagnostics

---

**US-034: Manage message templates**
> As a Karibu Manager, I want to customize and manage WhatsApp message templates for a clinic.

**Acceptance Criteria:**
- View all active message templates
- Create custom templates for clinic
- Submit templates for WhatsApp approval
- Track approval status (pending, approved, rejected)
- Use approved templates in clinic messaging

**Edge Cases:**
- Template rejected by WhatsApp → Show rejection reason, allow edit and resubmit
- Template approval takes long time → Can use default templates while waiting
- Template with variables → Validate variable placeholders correct
- Clinic wants template in Luganda → Language specified in submission

---

### System and Staff Workflows

**US-035: View queue by state**
> As clinic staff, I want to filter the queue by state so I can focus on my responsibilities.

**Acceptance Criteria:**
- Queue filterable by: WAITING, ARRIVED, IN_INTAKE, READY_FOR_DOCTOR, IN_VISIT
- Count badges show number in each state
- Urgent patients highlighted
- Real-time updates when states change
- Works offline with cached data

**Edge Cases:**
- Large queue (50+ patients) → Pagination or virtual scroll
- Stale data after offline period → Refresh indicator, manual refresh option
- Rapid state changes → Optimistic UI updates with reconciliation
- Multiple clinics → Queue filtered by current clinic context

---

**US-036: Receive notifications**
> As a doctor or nurse, I want to receive notifications for relevant events so I don't miss important updates.

**Acceptance Criteria:**
- Nurse notified: new patient arrivals, urgent flags
- Doctor notified: patient ready, draft notes ready
- Push notifications on mobile app
- In-app notification center for history
- Notification preferences configurable

**Edge Cases:**
- Notifications disabled on device → In-app alerts only
- Staff offline → Queue notifications, deliver when reconnected
- Duplicate notifications → Dedupe within time window
- Staff assigned to multiple patients → Prioritized notification list

---

## Application Access Points and Interfaces

This section details every way the system is accessed, by whom, on what device, and what functionality is available.

### Access Points Summary

| Actor | Primary Access | Secondary Access | App Type |
|-------|---------------|------------------|----------|
| Patient | WhatsApp | SMS, Mobile Web (magic link) | No install required |
| Nurse | Android Phone | Web Dashboard | React Native app |
| Doctor | Android Phone | Web Dashboard | React Native app |
| Clinic Admin | Web Browser | Android App | Next.js dashboard |
| Karibu Manager | Web Browser | - | Next.js setup wizard |
| System | Server | - | Backend/Webhooks |

---

### 1. Patient Access Points

#### 1A. WhatsApp Chat (Primary)
**Device:** Any smartphone with WhatsApp
**No app installation required**

**Entry Points:**
- Scan QR code at clinic → Opens WhatsApp with pre-filled message
- Click WhatsApp link (shared URL)
- Direct message to clinic WhatsApp number

**Interactions (all via WhatsApp messages):**

| Action | Input Type | System Response |
|--------|-----------|-----------------|
| Join queue | Send initial message | Confirmation + queue position |
| Pre-intake | Reply to prompts (free text or numbered options) | Next question or confirmation |
| Red-flag symptoms | Reply YES/NO or 1/2 | Urgent instructions if flagged |
| Confirm arrival | Reply YES or 1 | Room assignment |
| View patient note | Tap magic link in message | Opens authenticated web page |
| Pay for visit | Tap payment link | Opens Flutterwave payment page |
| Choose payment plan | Tap option (Pay full / Pay over time) | Payment flow |
| Follow-up response | Reply 1/2/3 (Improving/Same/Worse) | Acknowledgment |
| Request new note link | Send message | New magic link generated |

**Data Budget:** Under 10KB per interaction

---

#### 1B. SMS (Fallback)
**Device:** Any phone with SMS capability
**Used when:** WhatsApp unavailable, blocked, or delivery fails

**Interactions:**
- Receive queue updates
- Receive patient note magic link
- Receive payment link
- Respond to follow-ups (numeric only: 1, 2, 3)

**Limitations:**
- No rich messages or buttons
- Numeric responses only
- Higher cost per message

---

#### 1C. Patient Note Web Page (Magic Link Access)
**Device:** Any smartphone browser
**Access:** Magic link sent via WhatsApp/SMS

**Authentication Flow:**
1. Patient receives WhatsApp message with unique magic link
2. Link contains secure, time-limited token tied to WhatsApp number
3. Patient taps link → Opens directly to their note (no login form)
4. Token validates that the opener has access to the WhatsApp number that received the link
5. Session persists for configured duration (default: 7 days)

**Magic Link Properties:**
- Token is single-use for initial access, then creates session
- Expires after configurable period (default: 30 days)
- Tied to specific visit and patient WhatsApp number
- Can be regenerated via WhatsApp request
- Cannot be transferred (new device requires new link request)

**What patient sees on the page:**
- Visit date and clinic name
- Diagnosis explanation (plain language)
- Medications prescribed with instructions
- Next steps checklist (pharmacy, lab, home care)
- Warning signs to watch for
- Follow-up appointment details
- Emergency contact information
- Payment status and payment button (if unpaid)
- Link to request new magic link if sharing device

**Page constraints:**
- Under 200KB total
- Works without JavaScript for core content
- System fonts (no external font loading)
- 18px minimum body text
- High contrast for outdoor readability
- Print-friendly layout

**Security considerations:**
- Link should not be shared (contains auth token)
- If patient suspects link was compromised, they can request new link (invalidates old)
- Session can be revoked by clinic staff if needed

---

#### 1D. Flutterwave Payment Page (External)
**Device:** Mobile browser
**Access:** Link from WhatsApp/SMS or from patient note page

**What patient does:**
- Select payment method (mobile money, card, etc.)
- Enter payment details
- Confirm payment
- Receive receipt via WhatsApp

---

### 2. Nurse Access Points

#### 2A. Android Mobile App (Primary)
**Device:** Android smartphone (mid-range capable)
**App:** React Native (Expo)
**Authentication:** Clerk (nurse role)

**Screens/Views:**

| Screen | Purpose | Key Actions |
|--------|---------|-------------|
| Login | Authentication | Email/password, biometric option |
| Queue Dashboard | Overview of all patients | Filter by state, see counts per state |
| Waiting List | Patients in WAITING state | View queue position, mark arrived |
| Arrivals | Patients in ARRIVED state | Select patient for intake |
| Patient Identity | Verify patient | View WhatsApp number, confirm verbally |
| Consent Capture | Record consents | Toggle care consent, toggle recording consent, timestamp |
| Intake Form | Clinical data entry | Vitals, symptoms checklist, allergies, medications, history |
| Quick Tags | Fast condition flagging | Tap tags: diabetes, asthma, hypertension, follow-up |
| Triage Priority | Set urgency | Select: normal, urgent, emergency |
| Handoff Summary | Write notes for doctor | 1-3 sentence text field |
| Ready for Doctor | Complete handoff | Confirm button, room assignment |
| Notifications | Alerts | New arrivals, urgent patients |

**Offline Capabilities:**
- View cached queue
- Complete intake forms (sync when online)
- Cannot: initial patient lookup, send messages

---

#### 2B. Web Dashboard (Secondary)
**Device:** Desktop/tablet browser
**Used for:** Queue display on clinic TV/monitor, overflow scenarios

**Features:**
- Real-time queue view
- Patient search
- Same intake workflow as mobile (responsive design)

---

### 3. Doctor Access Points

#### 3A. Android Mobile App (Primary)
**Device:** Android smartphone
**App:** React Native (Expo)
**Authentication:** Clerk (doctor role)

**Screens/Views:**

| Screen | Purpose | Key Actions |
|--------|---------|-------------|
| Login | Authentication | Email/password, biometric |
| My Queue | Patients ready for me | List of READY_FOR_DOCTOR patients |
| Patient Summary | Pre-visit review | Intake summary, past visits, meds, allergies, consent status |
| Consent Confirmation | Verify recording consent | Confirm button (logs verbal reconfirmation) |
| Recording Screen | Audio capture | Large Record button, pause, stop, visible indicator |
| Bookmarks | Mark key moments | Tap during recording: diagnosis, medications, instructions |
| Structured Data Entry | Capture clinical data | Diagnosis, medications, follow-up, tests ordered |
| Manual Note Entry | Type notes (no recording) | Free text provider note, patient note |
| Pending Uploads | Audio upload status | List of recordings waiting to upload, retry option |
| Draft Review | Review AI-generated notes | Side-by-side provider/patient notes, edit both |
| Finalize Visit | Lock notes | Confirm button, validation warnings |
| Visit History | Past patient visits | List of previous visits for current patient |
| Notifications | Alerts | Patient ready, draft ready |
| Settings | Preferences | Notification settings, default tags |

**Offline Capabilities:**
- Record audio (stored locally, encrypted)
- View cached patient data
- Draft notes locally
- Cannot: upload audio, sync notes, finalize

---

#### 3B. Web Dashboard (Secondary)
**Device:** Desktop/tablet browser
**Used for:** Note review/editing (larger screen), bulk review

**Features:**
- Full note editing with keyboard
- Side-by-side transcript and note view
- Visit history browsing
- Better for lengthy edits

---

### 4. Clinic Admin Access Points

#### 4A. Web Dashboard (Primary)
**Device:** Desktop browser
**App:** Next.js on Vercel
**Authentication:** Clerk (admin role)

**Screens/Views:**

| Screen | Purpose | Key Actions |
|--------|---------|-------------|
| Login | Authentication | Email/password |
| Clinic Dashboard | Overview | Queue stats, daily visits, alerts |
| Live Queue | Real-time queue | All states, manual state changes |
| Patient Search | Find patients | Search by phone, name, date |
| Patient Record | View full history | All visits, notes, payments |
| Staff Management | Manage users | Add/edit/deactivate staff, assign roles |
| Audit Logs | Compliance | Search/filter all system events |
| Payment Overview | Financial tracking | Pending, partial, paid, waived |
| Payment Actions | Manual adjustments | Waive payment, record manual payment |
| Follow-up Dashboard | Patient outcomes | Green/yellow/red alerts, response rates |
| Reports/Metrics | Analytics | Visits/day, wait times, documentation time |
| Clinic Settings | Configuration | Pre-intake questions, message templates, room names |
| Message Templates | WhatsApp templates | View/manage approved templates |

---

### 5. Karibu Manager Access Points (Clinic Setup)

#### 5A. Setup Wizard (Primary)
**Device:** Desktop browser
**App:** Next.js on Vercel
**Authentication:** Clerk (karibu_manager role)
**Purpose:** Onboard and configure new clinics

The Setup Wizard is a guided, step-by-step interface for Karibu staff to provision new clinics. It ensures consistent configuration and reduces onboarding errors.

**Setup Wizard Flow:**

**Step 1: Clinic Basic Information**
- Clinic name
- Clinic slug (URL-safe identifier)
- Physical address
- Timezone (default: Africa/Kampala)
- Primary contact name and phone
- Logo upload (optional)

**Step 2: WhatsApp Configuration**
- WhatsApp Business Account ID
- Phone number to use for clinic
- Verify WhatsApp connection
- Test message send

**Step 3: Room Configuration**
- Add rooms (name, type: consultation, intake, waiting)
- Set room capacity (optional)
- Room display order
- Generate QR codes for each room

**Step 4: Staff Setup**
- Add initial admin user (email, name)
- Add doctors (email, name, specialization)
- Add nurses (email, name)
- Assign staff to rooms (optional)
- Send invitation emails

**Step 5: Role Permissions Review**
- Review default permissions per role
- Adjust if needed (rare)

**Step 6: Pre-Intake Configuration**
- Enable/disable pre-intake questionnaire
- Select which questions to include:
  - Reason for visit (yes/no)
  - Red-flag symptoms (yes/no, select which flags)
  - Allergies (yes/no)
  - Current medications (yes/no)
- Configure red-flag responses and alerts

**Step 7: Payment Configuration**
- Flutterwave merchant ID
- Payment currency (default: UGX)
- Enable/disable installment plans
- Default visit fee (can be overridden per visit)
- Payment reminder settings

**Step 8: Message Templates**
- Review default message templates
- Customize greeting messages
- Customize follow-up messages
- Submit templates for WhatsApp approval (if new)

**Step 9: Operating Hours**
- Set clinic operating days
- Set opening/closing times
- Configure after-hours messaging

**Step 10: Review and Launch**
- Summary of all configuration
- Test patient flow (simulated)
- Generate clinic QR code
- Activate clinic

**Post-Setup Management:**

| Screen | Purpose | Key Actions |
|--------|---------|-------------|
| Clinic List | View all clinics | Search, filter by status, select clinic |
| Clinic Overview | Single clinic summary | Key stats, health indicators, quick actions |
| Edit Configuration | Modify settings | Access any setup step to edit |
| Staff Management | Cross-clinic view | Move staff between clinics, deactivate |
| Billing/Usage | Track costs | WhatsApp messages, AI usage, storage |
| Support Tickets | Track issues | View/resolve clinic-reported issues |
| Audit Log (Global) | System-wide audit | All events across all clinics |

**Clinic Health Indicators:**
- Last activity timestamp
- Message delivery success rate
- Payment collection rate
- Average queue wait time
- Pending uploads count
- Error rate (last 24 hours)

---

#### 5B. Karibu Manager Mobile Access
**Device:** Mobile browser (responsive)
**Used for:** Emergency support, quick checks

**Limited features:**
- View clinic status
- View critical alerts
- Contact clinic admin
- Cannot: full configuration changes

---

### 6. System/Backend Access Points

#### 6A. WhatsApp Cloud API Webhooks
**Endpoint:** `/api/webhooks/whatsapp`

**Incoming events:**
- Message received (patient responses)
- Message status (delivered, read, failed)
- New conversation started

**Outgoing actions:**
- Send template messages (queue updates, notes, payments)
- Send session messages (within 24-hour window)

---

#### 6B. SMS Gateway Webhooks
**Endpoint:** `/api/webhooks/sms`

**Incoming events:**
- Message received
- Delivery status

---

#### 6C. Flutterwave Payment Webhooks
**Endpoint:** `/api/webhooks/flutterwave`

**Incoming events:**
- Payment successful
- Payment failed
- Payment pending
- Installment payment received

**Actions:**
- Update payment status on visit
- Send receipt to patient
- Transition visit state if fully paid

---

#### 6D. AI Pipeline (Internal)
**Triggered by:** Audio upload confirmation

**Pipeline stages:**
1. Speech-to-text (Whisper API)
2. Clinical structuring
3. Provider note generation (GPT-4)
4. Patient note generation (GPT-4)
5. Optional translation (English to Luganda)

**Output:** Draft notes ready notification to doctor

---

### Components to Build Summary

| Component | Platform | Users | Priority |
|-----------|----------|-------|----------|
| Patient WhatsApp Bot | WhatsApp Cloud API | Patients | MVP |
| Patient SMS Handler | SMS Gateway | Patients | MVP |
| Patient Note Web Page | Next.js (magic link auth) | Patients | MVP |
| Clinician Mobile App | React Native (Android) | Nurses, Doctors | MVP |
| Clinic Admin Dashboard | Next.js | Clinic Admins | MVP |
| Karibu Setup Wizard | Next.js | Karibu Managers | MVP |
| Karibu Manager Dashboard | Next.js | Karibu Managers | MVP |
| WhatsApp Webhook Handler | Supabase Edge Functions | System | MVP |
| Payment Webhook Handler | Supabase Edge Functions | System | MVP |
| AI Transcription Pipeline | Server-side | System | MVP |
| Note Generation Pipeline | Server-side | System | MVP |

**Note:** The Clinician Mobile App is a single React Native application with role-based UI. Nurses and doctors log in with the same app, but see different screens based on their Clerk role.

---

## Design and Visual Identity

### Design Principles

1. **Minimal and uncluttered** - Maximum white space, only essential elements
2. **Scannable** - Information hierarchy clear at a glance
3. **Touch-friendly** - Large tap targets, designed for thumbs
4. **Low cognitive load** - One primary action per screen
5. **Works in bright light** - High contrast for outdoor/sunny clinic use

### Color Palette

**Primary:**
- Background: `#FFFFFF` (white)
- Text: `#1A1A1A` (near-black)
- Primary action: `#2563EB` (blue-600)
- Success: `#16A34A` (green-600)
- Warning: `#CA8A04` (yellow-600)
- Error: `#DC2626` (red-600)

**Secondary:**
- Muted text: `#6B7280` (gray-500)
- Borders: `#E5E7EB` (gray-200)
- Background accent: `#F9FAFB` (gray-50)

### Typography

**Font family:** Inter (free, excellent readability, good language support)

**Scale:**
- Heading 1: 24px / 700 weight
- Heading 2: 20px / 600 weight
- Body: 16px / 400 weight
- Caption: 14px / 400 weight
- Small: 12px / 400 weight

**Line height:** 1.5 for body text, 1.2 for headings

### Spacing System

Base unit: 4px

- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px

### Component Guidelines

**Buttons:**
- Full width on mobile
- Minimum height: 48px (touch target)
- Primary: filled blue
- Secondary: outlined
- Destructive: filled red

**Cards:**
- White background
- Subtle shadow or 1px border
- 16px padding
- 8px border radius

**Forms:**
- Labels above inputs
- Input height: 48px
- Clear error states
- Inline validation feedback

**Lists:**
- Clear row separation
- Tap entire row to select
- Status indicators on right

### Screen Density

- Maximum content width: 400px on mobile
- Generous vertical spacing between sections
- No more than 5-7 items visible without scrolling
- Clear visual breaks between logical groups

### Patient Note Page (Special Considerations)

- Must be under 200KB total
- No external font loading (system fonts fallback)
- Works without JavaScript if possible
- Large, readable text (18px minimum body)
- Clear section headings
- Prominent "Next Steps" section
- Emergency contact visible without scrolling

### Iconography

- Use system icons where possible
- Heroicons (free, MIT license) for custom icons
- 24px standard size
- Outlined style for consistency

### Motion and Animation

- Minimal animations (reduces battery, data, complexity)
- Page transitions: simple fade or slide
- Loading states: subtle spinner or skeleton
- No decorative animations

### Dark Mode

Not planned for MVP. Light mode only to reduce complexity.
