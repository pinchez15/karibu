# Susunga HC III Patient Flow

Reference diagrams derived from the hand-drawn Susunga HC III patient flow sketch. These are intended as stable context for future architecture, product, and implementation work.

## Clinical Flow

```mermaid
flowchart TD
    R["Reception<br/>Receptionist"]
    OPD["OPD<br/>Clinician"]
    LAB["Lab<br/>Laboratory Attendant"]
    MAT["Maternity<br/>Midwife"]
    PH["Pharmacy<br/>Dispensing Nurse"]
    IP["Inpatient Wards<br/>Admissions"]

    ANC["ANC"]
    PRE["Prenatal Ward"]
    POST["Postnatal Ward"]
    IMM["Immunization"]

    R -->|"Register / route patient"| OPD
    R -->|"Direct route"| MAT

    OPD -->|"Lab request"| LAB
    LAB -->|"Lab result"| OPD

    OPD -->|"Prescription"| PH
    OPD -->|"Referral"| MAT

    MAT -->|"Lab request"| LAB
    LAB -->|"Lab result"| MAT

    MAT -->|"Prescription"| PH
    OPD -->|"Admit"| IP
    MAT -->|"Admit"| IP

    MAT --> ANC
    MAT --> PRE
    MAT --> POST
    MAT --> IMM
```

## Data Flow

```mermaid
flowchart LR
    subgraph FrontDesk["Reception / Registration"]
        PAT["Patient Record"]
        VIS["Visit / Queue Record"]
    end

    subgraph Clinical["Clinical Encounter Layer"]
        OPDENC["OPD Encounter"]
        MATENC["Maternity Encounter"]
        NOTE["Clinical Note"]
        REF["Referral / Transfer"]
        RX["Prescription"]
        ADM["Admission Decision"]
        LREQ["Lab Order"]
    end

    subgraph Diagnostics["Laboratory"]
        LRES["Lab Result"]
    end

    subgraph Pharmacy["Pharmacy"]
        DISP["Dispense Record"]
    end

    subgraph WardServices["Ward / Service Layer"]
        IPREC["Inpatient Record"]
        ANC["ANC Record"]
        PRE["Prenatal Ward Record"]
        POST["Postnatal Ward Record"]
        IMM["Immunization Record"]
        VIT["Vitals / Observation Records"]
    end

    PAT --> VIS
    VIS --> OPDENC
    VIS --> MATENC

    OPDENC --> NOTE
    MATENC --> NOTE

    OPDENC --> LREQ
    MATENC --> LREQ
    LREQ --> LRES
    LRES --> OPDENC
    LRES --> MATENC

    OPDENC --> RX
    MATENC --> RX
    RX --> DISP

    OPDENC --> REF
    REF --> MATENC

    OPDENC --> ADM
    MATENC --> ADM
    ADM --> IPREC

    MATENC --> ANC
    MATENC --> PRE
    MATENC --> POST
    MATENC --> IMM

    IPREC --> VIT
    PRE --> VIT
    POST --> VIT
```

## Notes

- This is normalized from the hand-drawn image into system-oriented flow, not a strict BPMN model.
- Admission is treated as a clinical decision originating from OPD or Maternity.
- Vitals/observations are modeled as longitudinal records, especially for inpatient, prenatal, and postnatal care.
- Pharmacy, lab, and maternity are not edge cases; they are first-class operational branches that should be reflected in app workflow and data design.
