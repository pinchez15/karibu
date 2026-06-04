# Extracted Design Concepts

Source files inspected:

- `karibu_design_files/brand.jsx`
- `apps/android/app/src/main/java/com/karibuhealth/app/ui/theme/Color.kt`
- `apps/android/app/src/main/java/com/karibuhealth/app/ui/theme/Theme.kt`
- `apps/android/app/src/main/java/com/karibuhealth/app/ui/theme/Type.kt`
- `apps/android/app/src/main/java/com/karibuhealth/app/ui/theme/KaribuMark.kt`

## Brand

The current brand system is clinical, calm, and precise. Cobalt is the primary trust anchor, slate carries secondary interface chrome and type, and amber is intentionally scarce for AI and urgency moments.

## Color

The extracted palette includes brand, functional, neutral, and dark-mode colors. These values are copied into `src/tokens.ts` as the first shared token source.

## Typography

The current direction uses Inter for interface text and a mono face for IDs, timestamps, and dense clinical metadata.

## Component Direction

Existing components favor compact clinical cards, status pills, vitals chips, timeline entries, and high-signal banners. The shared system should preserve this density and avoid marketing-style layouts inside clinical workflows.

