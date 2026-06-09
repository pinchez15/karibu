# Karibu Design System

This package is the future shared source of truth for Karibu visual language across Karibu EHR, Karibu Learn, and future Karibu products.

Karibu EHR and Karibu Learn are **separate apps** (different auth and user databases; not reachable from each other). They share this monorepo so Learn can mirror EHR UI. See [`docs/karibu-learn/product-boundary.md`](../../docs/karibu-learn/product-boundary.md).

It does not redesign the product. The initial token set is extracted from the existing design assets in `karibu_design_files/brand.jsx` and the Android theme files under `apps/android/app/src/main/java/com/karibuhealth/app/ui/theme`.

## Current Extracted Concepts

- Cobalt is the primary brand anchor.
- Slate carries secondary chrome and text.
- Amber is reserved for AI moments, urgency, and high-signal guidance.
- Red is critical only.
- Green is success and dispense/completion feedback.
- Neutral surfaces are light, cool, and clinical.
- Dark mode is high contrast for outdoor and low-power contexts.
- The primary font direction is Inter, with a mono face for IDs, timestamps, and compact clinical metadata.

## Intended Ownership

This package should own:

- colors
- typography
- spacing
- elevation
- radii
- icon sizing
- component tokens
- semantic clinical status tokens

Platform-specific adapters should consume this package rather than redefining tokens independently.

## Non-Goals

- No new visual design.
- No production React or Compose components.
- No app-specific workflow styling.

