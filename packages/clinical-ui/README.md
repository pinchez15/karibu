# Karibu Clinical UI

This package defines shared healthcare workflow component contracts for Karibu products.

It intentionally contains interfaces and presentation models only. Production React, Compose, Android ViewModels, Room entities, Supabase DTOs, and business workflows belong in product-specific packages.

## Intended Component Families

- `PatientHeader`
- `VitalsCard`
- `ClinicalNoteCard`
- `DiagnosisCard`
- `ReferralCard`
- `TimelineCard`

## Boundary Rule

Shared clinical UI models may represent both real EHR records and simulated learning charts, but they must not encode PHI storage concerns or EHR database table shapes.

