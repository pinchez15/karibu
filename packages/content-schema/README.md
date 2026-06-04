# Karibu Content Schema

This package owns JSON schemas and validation structure for offline-first Karibu Learn content.

The schemas describe educational content and simulated patient charts. They must not model real EHR patient records or PHI storage.

## Schemas

- `LearningPack`
- `Case`
- `DecisionNode`
- `Question`
- `Answer`
- `Explanation`
- `ProgressRecord`

## Offline-First Requirements

Learning content should be downloadable, versioned, integrity-checkable, and usable without network access after installation.

