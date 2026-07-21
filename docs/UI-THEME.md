# UI Theme — "Industrial Loft"

The reference image: a converted New York warehouse apartment. Poured concrete,
blackened steel, warm timber beams, exposed brick, huge steel-framed windows,
Edison bulbs, plants. The UI should feel like *that room*, not like a fitness app —
and specifically not like default-shadcn AI slop.

## Principles

1. **Big open spaces** — generous whitespace, few borders, content breathes like an
   open floor plan. Don't box everything into cards; use space and rules (hairlines)
   to divide.
2. **Warehouse signage** — the numbers are the heroes. Day calories, remaining
   macros, current weight: huge condensed type, like stencilled bay numbers.
3. **Materials, not decoration** — texture comes from the palette and type, plus at
   most a whisper of concrete grain on backgrounds. No gradients-on-everything, no
   glassmorphism, no rounded-2xl-shadow-xl on every div. Corners nearly square
   (2–4 px), like steel plate.
4. **Edison warmth on dark** — default theme is dark (blackened steel/concrete at
   night) with amber as *the* accent: primary actions, active states, the glow.
   Light theme is "daylight through the big windows": warm plaster white, same
   accents. Both themes ship; dark is default.
5. **Editorial labels** — small uppercase letterspaced labels (`BREAKFAST`,
   `PROTEIN`, `WEEK 29`) over values, like plaques on machinery.

## Palette (design tokens)

| token | dark | light | material |
|---|---|---|---|
| `--bg` | `#181614` | `#f0ece4` | blackened steel / plaster |
| `--surface` | `#211e1b` | `#faf7f0` | concrete panel |
| `--surface-raised` | `#2a2622` | `#ffffff` | |
| `--line` | `#3a352f` | `#d8d2c6` | steel hairline |
| `--text` | `#ede8df` | `#211e1b` | |
| `--text-muted` | `#9a9184` | `#6d675d` | dusty concrete |
| `--accent` | `#e8a13d` | `#c17f1f` | Edison amber — primary actions, active nav, glows |
| `--accent-2` | `#b0563a` | `#9c4a2f` | exposed brick — warnings, over-target |
| `--positive` | `#7d9464` | `#5c7a54` | plant green — on-target, success |
| `--timber` | `#8b6a4a` | `#8b6a4a` | timber beam — secondary accents, chart series |

### Chart series colors (validated, do not eyeball-edit)

UI accent tokens above are for chrome, not data. Charts use these steps, validated
with the dataviz palette validator (lightness band, chroma floor, CVD separation,
contrast) against each mode's surface — re-run the validator if you change them:

| series | dark (`#211e1b`) | light (`#faf7f0`) |
|---|---|---|
| protein (amber) | `#c1862c` | `#a56a15` |
| carbs (steel-window blue) | `#4d94d8` | `#2e6ca4` |
| fat (brick) | `#c94b39` | `#8c2e1b` |
| positive / 4th (plant green) | `#75a343` | `#6a9c35` |

Fixed assignment order: amber, steel, brick, green — never cycled or repainted on
filter. Brick↔green sits in the CVD warn band in dark mode, so series are always
also identified by direct labels and 2px surface gaps (required, not optional).
Timber stays a chrome accent only — it reads gray in charts.

## Typography

| role | face | usage |
|---|---|---|
| Display | **Archivo** (SemiExpanded, heavy weights) | big numbers, page titles — industrial signage without being a novelty stencil font |
| Body/UI | **Inter** | everything else |
| Data | **IBM Plex Mono** | tables, macro readouts, timestamps — machine-plate feel |

All self-hosted (no CDN). Uppercase labels: 11px, tracking ~0.08em, `--text-muted`.

## Signature moments (worth doing well)

- **The day gauge**: calories remaining as a huge Archivo number with a thin
  horizontal progress rule under it — like a level gauge on a boiler. Amber fill,
  brick overflow when over target.
- **Edison glow**: focus rings and the active nav item get a soft amber outer glow
  (`box-shadow`, subtle) — the one place light "blooms".
- **Brick accent wall**: the insights header band uses the brick tone as a solid
  block with plaster type — one wall of the room, used once per page at most.
- **Plants**: a small line-drawn monstera/fiddle-leaf SVG as the empty-state
  illustration ("nothing logged yet"). The only illustration in the app.
- **Concrete grain**: an almost-invisible SVG noise on `--bg` (opacity ≤ 0.03),
  skippable if it reads as dirt on any screen.

## Layout

- Mobile-first (primary device is the phone at the supermarket / kitchen).
  Bottom tab bar on mobile: Diary · Foods · Insights · Weight. Left rail on desktop.
- Diary is the home screen: date header, day gauge, slots as sections divided by
  hairlines (not cards), each entry a mono-data row, `+` per slot.
- Search overlay: full-screen on mobile, instant-as-you-type, barcode button in
  the search bar. Before you type it lists recent foods for that slot, showing
  the portion you last used.
- Row actions (edit/delete on a diary or meal row) use the `.row-action` utility:
  hidden until hover on pointer devices, always visible on touch. Never gate a
  destructive-or-not action behind `group-hover` alone — phones don't hover, and
  the control becomes unreachable. Tap targets stay ≥44px; delete is two-tap
  (`✕` → `delete?`) since the row is small and mis-taps are easy.
- PWA manifest + icons so it installs to the home screen like an app.
