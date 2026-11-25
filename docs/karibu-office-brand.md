# Karibu Office brand kit

**Decided by Nate, 2026-11-25.** Karibu Office uses the KaribuLearn coral, not the EHR's cobalt.

## Why it is different from the EHR

Partners use the EHR every day, often as clinicians first. Colour habits transfer: if cobalt means "the main action" in the EHR, it will mean that in Office too, and a partner will not know at a glance which product they are in. So Office shares **no action colour and no button shape** with the EHR.

| | Karibu EHR | Karibu Office |
|---|---|---|
| Action colour | Cobalt `#1F36C7` | Coral `#D92B4B` |
| Button shape | Rounded rectangle (8px) | Pill (fully rounded) |
| Neutrals | Cool grey-blue | Warm plum-grey |
| Ground | `#F7F8FB` | `#FBF7F8` |
| "Selected" | Cobalt tint | Coral tint `#FFE7EA` |

The source is `apps/learn-android/src/main/java/com/karibuhealth/learn/KaribuLearnTokens.kt` (the `Coral` palette and its neutrals). KaribuLearn is not in use yet, so Office takes the palette as it stands. If Learn ships later and the two need telling apart, Learn's file already carries two alternates (`Vermilion`, `Rose`).

## Tokens

Defined once, as RGB triples, in `apps/office/src/app/globals.css`, and mapped to Tailwind names in `apps/office/tailwind.config.ts`.

| Token | Hex | Tailwind | Use |
|---|---|---|---|
| Coral (action) | `#D92B4B` | `coral` | Primary buttons, links, the active tab. 4.8:1 on white. |
| Coral bright (brand) | `#FB4D5B` | `coral-bright` | The K mark, charts, progress. Never behind small text: it is 3.4:1 on white. |
| Coral deep | `#B81F3D` | `coral-deep` | Hover and pressed. |
| Coral soft | `#FFE7EA` | `coral-soft` | Selected nav item, tinted chips. |
| Coral wash | `#FFF5F4` | `coral-wash` | Tinted panels. |
| Coral ink | `#7A142A` | `coral-ink` | Text on soft and wash. |
| Ink | `#241018` | `ink` | Headings, values. |
| Body | `#52454B` | `body` | Running text. |
| Muted | `#74666C` | `muted` | Labels. Darker than Learn's `#8A7B82`, which fails contrast on white. |
| Line / line soft | `#E9DFE2` / `#F6EEF0` | `line`, `line-soft` | Borders, table rules, tracks. |
| Ground / surface | `#FBF7F8` / `#FFFFFF` | `background`, `surface` | Sidebar and page ground; content and cards. |

### Status colours

Coral is close to red, so "something is wrong" must not look like "press me".

| Meaning | Colour | How it is drawn |
|---|---|---|
| Needs you | Brick `#7F1D1D` | The only **solid** chip, white text. Far darker than coral. |
| Watch, overdue | Amber `#F5A524`, text `#7A4A00` | Tinted chip. |
| Healthy, done | Green `#0E8A5F`, text `#0A6B49` | Tinted chip. |
| Information | Coral soft | Tinted chip. |
| WhatsApp | Green `#0E8A5F` | Solid pill. Green means "this opens WhatsApp", nothing else. |

A status is never colour alone: every chip has a word.

## Components

Classes in `globals.css`:

- **Buttons** `.btn-primary` (coral pill), `.btn-secondary` (white pill, dark outline), `.btn-whatsapp`, `.btn-quiet`, `.btn-danger`. Add `.btn-sm` for a laptop size that keeps the 48px touch height on a phone, or `.btn-xs` inside tables and lists.
- **Chips** `.chip-info`, `.chip-success`, `.chip-warning`, `.chip-danger`, `.chip-neutral`. Rectangular with a small radius, so a chip is never mistaken for a pill button.
- **Cards** `.card`: 16px radius, one hairline border, no shadow.
- **Tables** `.table` inside `.table-wrap`. **Tabs** `.tabs` / `.tab` / `.tab-on`.
- **Numbers** `.num` turns on tabular figures. Use it for every amount and count.

Icons are single-path line icons in `apps/office/src/components/icons.tsx`, drawn inline. Type is the system stack (Inter where the device has it); there is no webfont download.

## Still cobalt

`apps/office/public/logos/icon-only.png` (the home-screen icon) is a bitmap and is still the cobalt mark. The SVG beside it is coral. The PNG needs re-exporting from the artwork.
