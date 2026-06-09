# Karibu Learn Vision

Karibu Learn is a standalone Android application for continuing medical education and clinical reasoning development for healthcare workers in Sub-Saharan Africa.

The product uses interactive patient cases and simulated patient charts to help learners practice clinical reasoning inside a realistic digital chart environment.

## Product boundaries

Karibu Learn and Karibu EHR are **two completely separate applications** with different user databases and authentication. Neither app is reachable from the other. Full rules: **[`product-boundary.md`](product-boundary.md)**.

Summary:

- Karibu Learn is **not** part of Karibu EHR and must not appear in EHR navigation or share EHR auth.
- Karibu Learn uses **simulated patients only**; no real patient data or PHI in content packs or Learn Supabase.
- **Karibu EHR** uses Clerk and the clinical Supabase project; **Karibu Learn** uses Supabase Auth and its own Supabase project.
- Both products live in this **monorepo** so Learn can mirror EHR design and chart workflows for pre-onboarding (learn the Karibu environment before a clinic signs up for EHR) — shared DNA, not shared data.

## Experience goal

A healthcare worker should feel like they are operating inside a realistic Karibu patient chart while completing educational cases.

The chart is educational, offline-capable, and simulated.
