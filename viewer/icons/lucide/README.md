# Lucide Icons — BIM OOTB Icon Set

Source: [Lucide](https://lucide.dev) v1.16.0 | License: ISC (permissive, no attribution in UI)

All icons: 24x24 viewBox, `stroke="currentColor"`, no fill. Inherit color from CSS.
Style: white outline on dark glass — matches TikTok/Instagram/Google Maps aesthetic.

Reference: `internal/UIStrategy.md` Parts V, VII, IX

---

## Universal Context Bus (UCB)

Five of the icons are **UCB-capable** — their behavior changes dynamically based on what the
user is currently doing. All five call the same `collectContext()` function. One collector,
many consumers. New features register their state on `A.*` and all UCB actions see it
automatically — no per-feature wiring needed.

See `internal/UIStrategy.md` Part VII for full spec.

| Icon | Action | Static or UCB | What changes by context |
|------|--------|---------------|------------------------|
| `share-2.svg` | Share | **UCB** | Payload: camera → element GUID → clash pair → walk route → TM phase → IoT sensor |
| `search.svg` | Find | **UCB** | Scope: elements → clashes → rooms → phases → ERP records → sensors |
| `camera.svg` | Screenshot | **UCB** | Output: plain capture → clash overlay → measurement labels → phase watermark → heatmap legend |
| `bar-chart-3.svg` | Export | **UCB** | Format: full BOQ → storey BOQ → clash report → Gantt → sensor log → ERP Excel |
| `life-buoy.svg` | Help | **UCB** | Content: full command palette → 3-line contextual tips for current mode |
| `clock.svg` | Time Machine | Static | Always: play/pause timeline |
| `ruler.svg` | Measure | Static | Always: two-point distance (labels adapt in 5D to show cost) |
| `more-vertical.svg` | Overflow | Static | Always: open/close menu |
| All overflow icons | Various | Static | Each does one thing regardless of context |

**UCB flow:**
```
User taps any UCB icon
  → ctx = collectContext()          // shared function, reads A.* state
  → ctx.type = 'default' | 'element' | 'clash' | 'walk' | 'timemachine' | 'measure' | 'storey' | 'section' | 'erp' | 'iot' | ...
  → action branches on ctx.type    // each action has its own switch
  → §UCB action={name} ctx={type}  // whitebox log proves which path taken
```

---

## Primary Icon Pill (5 permanent icons, always visible, right edge vertical)

These five icons are **permanent on screen** at all times. They never hide, never move,
never swap. The pill is the user's anchor — no matter what mode or panel is open, these
five are always reachable.

| # | File | Feature | UCB? | Permanent | Notes |
|---|------|---------|------|-----------|-------|
| 1 | `clock.svg` | Time Machine | No | **Yes** | 4D construction playback, S-curve, Gantt. Most unique feature. |
| 2 | `ruler.svg` | Measure | No | **Yes** | Two-point distance, area, volume. Highest daily use. |
| 3 | `search.svg` | Find / Search | **Yes** | **Yes** | Scope changes: elements → clashes → rooms → phases. Voice (mic.svg) is a mode inside Find, not separate. |
| 4 | `share-2.svg` | Share | **Yes** | **Yes** | navigator.share() with context-aware URL. Blue dot badge when context is richer than default. |
| 5 | `more-vertical.svg` | More (overflow) | No | **Yes** | Opens overflow menu (dropdown desktop, bottom drawer mobile). |

---

## Overflow Menu (grouped by nD concern)

Overflow icons appear **inside the menu only** — never permanently on screen. The menu
groups them by the dimensional model (nD) so future 6D/7D/IoT features slot in without
redesigning the menu.

### Analysis (8D Compliance)

| File | Feature | UCB? | Notes |
|------|---------|------|-------|
| `triangle-alert.svg` | Clash Matrix | No | Opens clash detection panel. R-tree accelerated. |
| `scissors.svg` | Section Cut | No | Horizontal/vertical cut plane through model. |
| `scan-eye.svg` | X-Ray | No | Toggle transparent materials. Eye-in-frame = "see through." |
| `clipboard-list.svg` | Issues / Punch List | No | Issue tracker panel, snag list, export to Excel. |

### Navigation (3D)

| File | Feature | UCB? | Notes |
|------|---------|------|-------|
| `footprints.svg` | Walk Mode | No | First-person walk, GPS on site, wall x-ray. |
| `plane.svg` | Fly Tour | No | Cinematic drone tour, auto-generated from storeys. |
| `layout-panel-top.svg` | 2D Plans | No | Grid overlay, floor plans, dimension chains. |

### Display (3D)

| File | Feature | UCB? | Notes |
|------|---------|------|-------|
| `sun.svg` | Sunglasses | No | Color studio: exposure, ambient, hemi, sun sliders. |
| `moon.svg` | Night Mode | No | Moonlight toggle. Switches tone mapping. |
| `maximize.svg` | Fullscreen | No | Browser fullscreen toggle. |

### Export (5D) — UCB context-aware

| File | Feature | UCB? | Notes |
|------|---------|------|-------|
| `camera.svg` | Screenshot | **Yes** | Plain capture → clash overlay → measurement labels → phase watermark. |
| `bar-chart-3.svg` | 4D/5D Export | **Yes** | Full BOQ → storey BOQ → clash report → Gantt chart. |
| `download.svg` | Save DB/IFC | No | Download extracted database or IFC file. Inside Share sheet export section. |

### Help

| File | Feature | UCB? | Notes |
|------|---------|------|-------|
| `life-buoy.svg` | Commands / Help | **Yes** | Full palette → contextual 3-line tips for current mode. |
| `home.svg` | Landing Page | No | Return to landing page. Or drop — browser back works. |

---

## Panel & Sub-flow Icons (not in pill or overflow — appear inside panels)

These icons appear inside specific panels or flows. They are **contextual** — visible only
when their parent panel is open.

| File | Feature | Appears inside | Notes |
|------|---------|---------------|-------|
| `mic.svg` | Voice / NLP | Find panel | Mode indicator: tap to toggle voice search inside the Find panel. |
| `pen-tool.svg` | Snag Annotation | Snag capture overlay | Freehand markup tool on captured photo. |
| `undo-2.svg` | Markup Undo | Snag capture overlay | Undo last stroke in annotation canvas. |
| `bookmark.svg` | Section Bookmark | Section slider panel | Save/recall cut positions. |
| `download.svg` | Save DB/IFC | Share sheet | Download buttons inside the export section. |

---

## Future Icons (fetch when implementing)

These map to the nD roadmap. Each slots into the overflow menu under its dimensional group.

| Lucide name | Feature | nD | Overflow group | When |
|-------------|---------|-----|---------------|------|
| `leaf` | Carbon Heatmap | 6D | Analysis | S270+ |
| `wrench` | Facility / Asset Register | 7D | new "Operations" group | S270+ |
| `activity` | IoT Sensors | IoT | new "Live" group | S280+ |
| `bell` | Notifications / Alerts | IoT | Badge on icon pill (not overflow) | S280+ |
| `settings` | User Preferences | — | Help group | When needed |
| `qr-code` | QR Deep-link | — | Inside Share flow | When needed |
| `database` | ERP Records | ERP | new "Data" group or separate pill | S256+ |

---

## Usage in Code

Icons are inlined as SVG strings (not `<img>` tags) so `currentColor` inherits from CSS:

```js
// Example: inject icon into button
btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
```

Or load from file and cache:
```js
fetch('icons/lucide/clock.svg').then(r => r.text()).then(svg => { btn.innerHTML = svg; });
```

### CSS Control

```css
.icon-pill button svg { width: 20px; height: 20px; color: #fff; }         /* desktop */
.icon-pill button.active svg { color: #4fc3f7; }                          /* active state */
@media (max-width: 600px) { .icon-pill button svg { width: 24px; height: 24px; } }  /* mobile */
```

---

## Checklist: S265 Phase 1 (Icon Column)

### Primary Pill (permanent)
- [x] clock.svg — Time Machine
- [x] ruler.svg — Measure
- [x] search.svg — Find (UCB)
- [x] share-2.svg — Share (UCB)
- [x] more-vertical.svg — More

### Overflow Menu
- [x] triangle-alert.svg — Clash
- [x] scissors.svg — Section Cut
- [x] scan-eye.svg — X-Ray
- [x] clipboard-list.svg — Issues
- [x] footprints.svg — Walk
- [x] plane.svg — Fly Tour
- [x] layout-panel-top.svg — 2D Plans
- [x] sun.svg — Sunglasses
- [x] moon.svg — Night Mode
- [x] maximize.svg — Fullscreen
- [x] camera.svg — Screenshot (UCB)
- [x] bar-chart-3.svg — 4D/5D Export (UCB)
- [x] life-buoy.svg — Help (UCB)
- [x] download.svg — Save DB/IFC
- [x] home.svg — Landing page

### Panel / Sub-flow
- [x] mic.svg — Voice mode (inside Find)
- [x] pen-tool.svg — Snag markup
- [x] undo-2.svg — Markup undo
- [x] bookmark.svg — Section bookmark

### Future (fetch when implementing)
- [ ] leaf.svg — 6D Carbon
- [ ] wrench.svg — 7D Facility
- [ ] activity.svg — IoT Sensors
- [ ] bell.svg — Notifications
- [ ] settings.svg — Preferences
- [ ] qr-code.svg — QR deep-link
- [ ] database.svg — ERP Records
