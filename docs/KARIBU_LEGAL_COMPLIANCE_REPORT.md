# KARIBU HEALTH — Legal Compliance Report

**Prepared:** February 10, 2026
**Purpose:** Assess the legality of an AI-powered clinical documentation system in Uganda and identify gaps for HIPAA compliance
**Audience:** Local leadership, project stakeholders, legal counsel

**Important disclaimer:** This document is a research summary, not legal advice. Final compliance decisions should be reviewed by qualified legal counsel in both Uganda and the United States.

---

## EXECUTIVE SUMMARY

**Is Karibu legal in Uganda?** Yes. There is no law prohibiting AI-powered clinical documentation systems in Uganda. The relevant legal framework actively encourages digital health innovation. However, compliance requires specific registrations, consent mechanisms, and data protection safeguards. Uganda's Ministry of Health has published comprehensive digital health guidelines (September 2024) that explicitly aim to standardize and support solutions like Karibu.

**Is audio recording of clinical encounters legal?** Yes, with informed patient consent. Uganda's Data Protection and Privacy Act (2019) classifies health data as "special personal data" requiring explicit consent before collection or processing. Audio recording is a form of data collection and requires the patient's freely given, specific, informed, and unambiguous consent.

**What is required to operate legally?** Registration with the Personal Data Protection Office (PDPO), patient consent mechanisms, a designated Data Protection Officer, and compliance with the Data Protection and Privacy Act 2019 and MoH Digital Health Guidelines.

**HIPAA compliance gaps?** Karibu as currently architected has several gaps relative to US HIPAA standards. These are addressable but require specific technical and contractual measures detailed in Part II of this report.

---

## PART I: UGANDA LEGAL FRAMEWORK

### 1. Governing Laws and Regulations

The following laws and regulations govern Karibu's operations in Uganda:

**Primary legislation:**
- Data Protection and Privacy Act No. 9 of 2019 (DPPA) — the foundational data protection law
- Data Protection and Privacy Regulations, 2021 — procedural rules for implementation
- Computer Misuse Act, 2011 — criminalizes unauthorized access to computer systems

**Health-sector specific:**
- Uganda Health Data Protection, Privacy and Confidentiality Guidelines (MoH)
- Compendium of National Digital Health Guidelines (September 2024)
- Guidelines for the Introduction of Digital Health Solutions and Innovations in Uganda
- Health Information Exchange and Interoperability Guidelines
- Guidelines for Implementation of Electronic Medical Records Systems
- National Health Information and Digital Health Strategic Plan (2023-2025)
- Privacy Notice for Electronic Health Information Systems (eHIS)

**Regulatory bodies:**
- Personal Data Protection Office (PDPO) — under the National Information Technology Authority, Uganda (NITA-U)
- Ministry of Health — digital health governance and guidelines
- Uganda Medical and Dental Practitioners Council (UMDPC) — registration of health units

---

### 2. Health Data Classification

Uganda's DPPA explicitly classifies health status and medical records as "special personal data" (Section 7). This is the highest protection category under the Act, alongside religious beliefs, political opinions, sexual life, and financial information.

**What this means for Karibu:** Every piece of data Karibu collects — audio recordings, transcripts, extracted clinical data, patient identifiers — falls under the special personal data category and is subject to the strictest protections under Ugandan law.

**Key rule:** A person shall not collect or process special personal data unless the information is given freely and with the consent of the data subject, OR the collection is for "medical purposes" which includes preventive medicine, medical diagnosis, care or treatment, or management of healthcare services.

**Karibu's position:** Karibu collects health data for medical purposes (clinical documentation, care delivery, treatment planning). This provides a lawful basis for collection. However, the audio recording aspect adds a consent requirement because the patient must be informed that their encounter is being recorded and how that recording will be used.

---

### 3. Consent Requirements

Under the DPPA, "consent" means any freely given, specific, informed, and unambiguous indication of the data subject's wish, signified by a statement or a clear affirmative action.

**What Karibu must do:**

a) **Inform the patient before recording begins** — the patient must know that audio recording will occur, what it will be used for (clinical documentation), who will have access, and how long it will be stored.

b) **Obtain affirmative consent** — verbal consent is legally acceptable under the DPPA (it requires "a statement or a clear affirmative action"), but documented consent is strongly recommended. Options include:
   - Verbal consent recorded at the start of the audio capture ("Do you consent to this visit being recorded for your medical record?")
   - Written consent on intake forms
   - Digital consent via WhatsApp (tap to confirm)

c) **Consent for minors** — the DPPA requires prior consent of a parent, guardian, or person with authority to make decisions on behalf of a child before collecting personal data relating to a child.

d) **Right to withdraw** — patients can withdraw consent at any time. Karibu must support stopping recording immediately and must have a clear process for what happens to partial recordings (recommended: delete partial audio, clinician can still write a manual note).

e) **Right to access** — patients have the right to access their personal data. The patient-facing WhatsApp note delivery already addresses this in part, but patients could also request their full record.

f) **Right to request deletion** — patients may request erasure of their data under certain conditions.

---

### 4. Registration with the PDPO

**This is mandatory.** Every data collector, processor, and controller must register with the Personal Data Protection Office before collecting or processing personal data.

**Karibu's classification:**
- **Data controller** — Karibu determines the purposes and means of processing (deciding to record encounters, what AI processing to apply, what data to store)
- **Data processor** — Karibu also processes data on behalf of the clinician/facility

**Registration process:**
1. Pay registration fee of UGX 100,000 (~USD 30) via Uganda Revenue Authority
2. Complete registration application at https://pdpo.go.ug/register
3. Provide: applicant details, Data Protection Officer contact, description of data collected, purposes, categories of data subjects, retention periods, security measures
4. Submit a written undertaking not to process or store personal data outside Uganda unless the destination country has adequate protections or the data subject has consented
5. Registration is valid for one year, must be renewed annually
6. Annual compliance report must be submitted within 90 days of financial year end

**Failure to register** is a criminal offence punishable by fine of up to UGX 120,000 (~USD 31), imprisonment up to 3 months, or both. The penalty is small but the reputational and operational risk of operating unregistered is significant.

**Important:** As of July 2025, the PDPO confirmed that registration requirements apply to ALL entities — including those based outside Uganda — that handle the personal data of Ugandan citizens. Since Karibu's cloud infrastructure may be hosted outside Uganda, this applies.

---

### 5. Cross-Border Data Transfer

This is critical for Karibu's architecture, which sends audio to cloud servers (likely outside Uganda) for AI processing.

**The DPPA permits cross-border transfer when:**
a) The destination country has adequate data protection measures at least equivalent to the DPPA; OR
b) The data subject has consented to the transfer.

**Practical implications:**
- If using cloud infrastructure in the US (e.g., Vercel, Supabase on AWS), you need either: (1) a determination that US data protection is "adequate" (which Uganda has not formally assessed), or (2) explicit patient consent for cross-border transfer.
- The PDPO clarified in July 2025 that advance permission is NOT required for each individual transfer, but you must maintain records of the legal basis, safeguards, and justification for cross-border transfers, available for inspection during audits.
- Including cross-border transfer consent in the patient intake consent form is the safest approach.
- Alternative: host infrastructure within Uganda or in a country with stronger data protection (e.g., EU/EEA under GDPR).

---

### 6. Data Security Requirements

The DPPA requires data controllers to "secure the integrity of personal data" by adopting "appropriate, reasonable, technical and organizational measures" to prevent:
- Loss, damage, or unauthorized destruction
- Unlawful access or unauthorized processing

**Karibu must implement:**
- Encryption of data in transit (TLS/SSL) and at rest
- Access controls (role-based, authentication)
- Audit logging of data access
- Secure storage of audio files and transcripts
- Breach notification procedures — must immediately notify the PDPO of any unauthorized access or acquisition, along with remedial actions taken

---

### 7. Data Retention

- Personal data must not be retained longer than necessary for its purpose
- If no retention period is specified by law, retain long enough for the data subject to request access
- At expiry of retention period, data must be destroyed or de-identified in a manner preventing reconstruction

**Recommendation for Karibu:** Define clear retention periods:
- Audio recordings: delete after transcript extraction and clinician review (recommend 30-90 days post-processing)
- Transcripts and clinical records: retain for the legally required medical record retention period
- De-identified aggregate data for reporting: can be retained indefinitely

---

### 8. MoH Digital Health Guidelines

Uganda's Ministry of Health released comprehensive digital health guidelines in September 2024 that are directly relevant to Karibu.

**Key requirements:**
- Digital health solutions should be interoperable and align with national health information systems (DHIS2)
- Solutions must adhere to the Uganda Digital Health Enterprise Architecture standards
- Vocabulary standards adopted by MoH include ICD-11, SNOMED-CT, LOINC, RxNorm (Karibu's ICD-10 coding aligns with this direction)
- Solutions introducing new digital health innovations should follow the MoH Guidelines for Introduction of Digital Health Solutions, which may include review by the Health Information Innovation and Research Technical Working Group (HIIRE TWG) and endorsement by the Senior Management Committee
- Electronic medical records implementations must follow the MoH Guidelines for Implementation of EMR Systems

**Strategic note:** These guidelines are designed to prevent fragmentation of digital health solutions. Karibu's DHIS2 integration plans and ICD coding align well. Engaging the MoH HIIRE TWG early — even informally — would strengthen legitimacy and ease institutional adoption later.

---

### 9. AI-Specific Regulations

As of August 2025, Uganda is actively developing regulations specifically for AI in healthcare and telemedicine. These are not yet finalized but are in development. The Ministry of Health and PDPO are collaborating on these.

**Current status:** No AI-specific law exists. AI-powered clinical documentation is governed by the general DPPA and MoH digital health guidelines. This is favorable for Karibu — there are no AI-specific prohibitions or requirements beyond general data protection.

**Risk:** Future AI regulations could introduce new requirements (e.g., algorithmic transparency, AI impact assessments, specific consent for AI processing). Monitor developments via the PDPO and MoH.

---

### 10. Summary: Uganda Compliance Checklist

| Requirement | Status | Action Needed |
|-------------|--------|---------------|
| Register with PDPO as data controller | NOT DONE | Register at pdpo.go.ug, pay UGX 100,000, renew annually |
| Appoint a Data Protection Officer | NOT DONE | Designate a DPO (can be an existing team member) |
| Patient consent mechanism for recording | NOT DONE | Build consent flow into app (verbal + recorded, or written) |
| Consent for minors (parental/guardian) | NOT DONE | Separate consent flow for pediatric encounters |
| Cross-border data transfer safeguards | NOT DONE | Include in consent form OR host data in-country |
| Data security measures | PARTIAL | Encryption in transit (TLS) likely exists; audit encryption at rest, access controls, logging |
| Breach notification procedure | NOT DONE | Document procedure for notifying PDPO of breaches |
| Data retention policy | NOT DONE | Define and document retention periods |
| Annual compliance report | NOT DONE | Prepare after first year of registration |
| MoH digital health alignment | PARTIAL | DHIS2 integration planned; consider HIIRE TWG engagement |
| Written undertaking re: cross-border data | NOT DONE | Required as part of PDPO registration |

---

## PART II: US HIPAA GAP ANALYSIS

HIPAA compliance is not required for Karibu's Uganda operations. However, there are strategic reasons to pursue it: future expansion to US-connected health systems, NGO funders (USAID, PEPFAR) who may require HIPAA-equivalent standards, and competitive positioning against other global health tech solutions.

### 1. Does HIPAA Apply to Karibu?

HIPAA applies to "covered entities" (health plans, healthcare clearinghouses, healthcare providers who transmit health information electronically) and their "business associates." Karibu would be a **business associate** if it provides services to a US covered entity involving PHI. In its current form serving Ugandan clinics, HIPAA does not apply. But if Karibu ever contracts with US-funded health programs, it likely will.

### 2. HIPAA Requirements vs. Karibu's Current Architecture

#### 2.1 Business Associate Agreement (BAA)

**Requirement:** Any third party that handles PHI on behalf of a covered entity must sign a BAA.

**Karibu's gap:**
- Karibu would need BAAs with every vendor that touches PHI: OpenAI (transcription), Sunbird AI (transcription/translation), Supabase (database), Vercel (hosting), any cloud storage provider
- OpenAI offers BAAs on Enterprise plans. Standard API plans may not include BAA coverage.
- Sunbird AI: unclear if they offer BAAs. Would need to negotiate.
- Supabase: offers BAAs on Pro/Enterprise plans.
- Vercel: offers BAAs on Enterprise plans.

**Action needed:** Upgrade to vendor plans that include BAAs, or switch to vendors that offer them. This is the single biggest operational change for HIPAA compliance.

#### 2.2 Encryption

**Requirement:** PHI must be encrypted in transit and at rest.

**Karibu's gap:**
- In transit: Likely covered (HTTPS/TLS for API calls). Verify all endpoints.
- At rest: Audio files in cloud storage, database records, backups — all must be encrypted at rest. Supabase provides encryption at rest on paid plans. Verify audio storage encryption.
- On device: Audio files stored on the clinician's phone before upload must also be encrypted. Android file-based encryption (enabled by default on modern devices) may suffice, but app-level encryption is stronger.

#### 2.3 Access Controls

**Requirement:** Only authorized individuals can access PHI. Minimum necessary standard — users should only access the minimum PHI needed for their role.

**Karibu's gap:**
- Role-based access controls (clinician vs. admin vs. reporting) need to be enforced
- Audit logs of who accessed what patient data and when
- Unique user identification (no shared logins)
- Automatic session timeout

#### 2.4 Audit Trail

**Requirement:** Hardware, software, and procedural mechanisms to record and examine access and activity related to PHI.

**Karibu's gap:**
- Need comprehensive logging: who accessed which patient record, when, from what device
- Who listened to audio recordings
- Who generated or viewed transcripts
- Logs must be retained for 6 years

#### 2.5 Audio Recording and Consent

**HIPAA itself does not specifically require patient consent for AI scribes or audio recording when used for treatment, payment, or healthcare operations (TPO).** However:
- Federal wiretapping law (18 U.S.C. § 2511) requires at least one-party consent to record
- 11 US states require all-party consent (California, Florida, Illinois, Maryland, Massachusetts, Michigan, Montana, New Hampshire, Oregon, Pennsylvania, Washington)
- Best practice for AI scribes: obtain explicit patient consent before recording, document it, and offer an opt-out

**Karibu's position:** Since Karibu operates in Uganda (not a US state), US wiretapping laws don't apply to Uganda operations. But building consent into the workflow is both a Uganda DPPA requirement and HIPAA best practice.

#### 2.6 Data Integrity and Person/Entity Authentication

**Requirement:** Mechanisms to confirm that PHI has not been improperly altered or destroyed. Authentication mechanisms to verify that persons seeking access to PHI are who they claim to be.

**Karibu's gap:**
- Clinician authentication (Clerk handles this)
- Patient authentication for accessing their notes (magic links via WhatsApp — need to assess security)
- Data integrity checks on stored records

#### 2.7 Transmission Security

**Requirement:** Technical security measures to guard against unauthorized access to PHI transmitted over electronic networks.

**Karibu's gap:**
- All API calls to OpenAI, Sunbird AI, Supabase must use TLS 1.2+
- Audio file uploads must use encrypted connections
- WhatsApp delivery of patient notes: WhatsApp uses end-to-end encryption, but the magic link URL itself could be intercepted. Consider: the linked page should not display PHI without additional authentication.

#### 2.8 Contingency Plan

**Requirement:** Policies and procedures for responding to emergencies or system failures (data backup, disaster recovery, emergency operations).

**Karibu's gap:**
- Database backup strategy (Supabase provides daily backups on paid plans)
- Audio file backup strategy
- Disaster recovery plan
- Emergency access procedures

#### 2.9 Risk Analysis

**Requirement:** Conduct an accurate and thorough assessment of potential risks and vulnerabilities to the confidentiality, integrity, and availability of ePHI.

**Karibu's gap:**
- A formal HIPAA Security Risk Analysis has not been conducted
- This is the foundational HIPAA requirement — everything else flows from it

#### 2.10 Training

**Requirement:** All workforce members must receive security awareness training. Training must be documented.

**Karibu's gap:**
- Clinician training on data privacy and security
- Documentation of training provided

#### 2.11 AI-Specific Considerations for HIPAA

The use of AI for clinical documentation introduces specific HIPAA considerations:

- **AI-generated transcripts are NOT the official medical record.** The clinician must review, edit, and sign off on AI-generated notes before they become part of the medical record. HIPAA requires the clinician to attest to accuracy.
- **AI vendor as business associate.** OpenAI and Sunbird AI are processing PHI when transcribing clinical encounters. They are business associates and need BAAs.
- **No training on patient data.** The BAA must prohibit the AI vendor from using patient data to train models (standard OpenAI API terms state they do not train on API data; Sunbird AI terms need verification).
- **Hallucination risk.** AI scribes have a 1-3% hallucination rate. HIPAA's data integrity requirements mean clinician review of AI-generated notes is mandatory, not optional.

---

### 3. HIPAA Compliance Roadmap

| Priority | Gap | Effort | Notes |
|----------|-----|--------|-------|
| **P0 — Critical** | Formal Security Risk Analysis | Medium | Foundation for all other HIPAA work |
| **P0 — Critical** | BAAs with all vendors (OpenAI, Sunbird, Supabase, Vercel) | Medium | May require plan upgrades |
| **P0 — Critical** | Patient consent mechanism | Low | Already needed for Uganda DPPA |
| **P1 — Important** | Encryption at rest verification | Low | Verify Supabase, cloud storage settings |
| **P1 — Important** | Comprehensive audit logging | Medium | Log all PHI access with 6-year retention |
| **P1 — Important** | Role-based access controls | Medium | Enforce minimum necessary standard |
| **P1 — Important** | Clinician review/sign-off workflow | Medium | AI notes must be reviewed before becoming official record |
| **P2 — Required** | Data backup and disaster recovery plan | Low | Document existing capabilities |
| **P2 — Required** | Workforce training program | Low | Document training provided to clinicians |
| **P2 — Required** | Breach notification procedure | Low | Document process (HIPAA: 60 days; Uganda DPPA: immediate) |
| **P2 — Required** | Data retention and destruction policy | Low | Document policies, align with both DPPA and HIPAA |
| **P3 — Desirable** | WhatsApp note delivery security hardening | Medium | Add authentication to magic link pages |
| **P3 — Desirable** | On-device encryption of audio files | Medium | App-level encryption before upload |

---

## PART III: RECOMMENDATIONS

### For the Local Leader

**Karibu is legal in Uganda.** The government is actively encouraging digital health innovation. The Data Protection and Privacy Act 2019 provides a clear framework, and the Ministry of Health's 2024 Digital Health Guidelines explicitly support solutions like Karibu.

**What makes it legal:**
1. It collects health data for medical purposes (explicitly permitted under Section 7 of the DPPA)
2. It obtains informed patient consent before recording
3. It registers with the PDPO as required by law
4. It implements appropriate security safeguards
5. It aligns with MoH digital health standards

**What would make it illegal:**
1. Recording patients without their knowledge or consent
2. Sharing identifiable patient data without authorization
3. Operating without PDPO registration
4. Failing to secure patient data against unauthorized access
5. Retaining data longer than necessary without legal basis

**Karibu's design already addresses most concerns:** The consent-before-recording workflow, the WhatsApp-based patient note delivery (giving patients access to their own data), the offline-first architecture (data stays on clinician's device until connectivity exists), and the planned DHIS2 integration all align with Uganda's legal framework.

### Immediate Actions (Before Pilot)

1. **Register with the PDPO** — ~USD 30, online process at pdpo.go.ug
2. **Draft a patient consent form** — covering audio recording, AI processing, data storage, cross-border transfer, and right to opt out. Available in English and Luganda.
3. **Designate a Data Protection Officer** — can be an existing team member
4. **Document your data protection policy** — retention periods, security measures, breach procedures
5. **Build consent into the app workflow** — recording cannot start without patient consent confirmation

### For HIPAA Readiness (Before NGO/US Engagement)

1. Conduct a formal Security Risk Analysis
2. Secure BAAs with all vendors touching PHI
3. Implement comprehensive audit logging
4. Build clinician review/sign-off workflow for AI-generated notes
5. Document all policies and procedures

---

## APPENDIX: Key Sources

| Document | Source |
|----------|--------|
| Data Protection and Privacy Act No. 9 of 2019 | https://ulii.org/en/akn/ug/act/2019/9/eng@2019-05-03 |
| PDPO Registration Portal | https://pdpo.go.ug/register |
| PDPO Registration Guidance Notes | https://pdpo.go.ug/media/2022/01/20102021105143-Registration_Classification_and_Guidance_Notes.pdf |
| MoH Digital Health Guidelines Compendium (Sept 2024) | https://library.health.go.ug/health-information-systems/digital-health/compendium-national-digital-health-guidelines |
| Uganda Health Data Protection, Privacy & Confidentiality Guidelines | https://library.health.go.ug/health-information-systems/digital-health/uganda-health-data-protection-privacy-and-confidentiality |
| Guidelines for Introduction of Digital Health Solutions | https://library.health.go.ug/health-information-systems/digital-health/guidelines-introduction-digital-health-solutions-and |
| Health Information Exchange & Interoperability Guidelines | https://library.health.go.ug/file-download/download/public/1883 |
| MoH eHIS Privacy Notice | https://library.health.go.ug/category/health-information-systems |
| PDPO Decision on Cross-Border Data (Google, July 2025) | https://privacymatters.dlapiper.com/2025/08/uganda-data-protection-regulator-clarifies-compliance-requirements-for-offshore-entities/ |
| Uganda Moves to Regulate Digital Health (Aug 2025) | https://www.monitor.co.ug/uganda/news/national/uganda-moves-to-regulate-digital-health-protect-patient-data-5143412 |
| UMDPC Digital Health Requirements | https://umdpc.go.ug/downloads/requirements/requirements.pdf |
