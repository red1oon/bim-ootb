# `readiness/` — OpenBIM Readiness Assessment Toolkit

A research instrument, funded under a grant, published at
<https://red1oon.github.io/bim-ootb/readiness/>. Seven static pages, no build step, no server.

Source of truth for the page content is `~/Projects/Dubai/plan/toolkit_*.html`; the lane record and
every design decision is in `~/Projects/Dubai/PROMPT.md`, and the evidentiary register is
`~/Projects/Dubai/plan/CITATIONS.md`.

## The boundary — read this before adding anything

The assessment and the Viewer are **separate**, deliberately.

| | |
|---|---|
| **The Viewer** | As-is, where-is. A visitor may enjoy it. It receives nothing from the assessment |
| **The analysis** | Lands in the assessment report and goes **no further** |
| **The handover** | The visitor's own model, compiled to SQLite, downloaded to **their** Downloads folder |

Nothing about a respondent's answers, scores, profile or recommendations is written into the
database, passed to the Viewer, or stored anywhere. If a future change would create a data path
between the assessment and the Viewer, that is a boundary change and needs saying out loud.

## Why the assessment does not use `import_worker.js` for measurement

`PROMPT.md §ROADMAP` is explicit: *Track B metrics at the web-ifc layer — **never** from the
extracted DB (lossy projection).* The extraction that builds renderable geometry drops exactly the
semantic detail the metrics count. So:

- **`metrics_worker.js`** (this folder) — measures. Calls web-ifc directly, at the web-ifc layer.
  No geometry, no sql.js, no storage. This is Track B, metrics M1–M15 of `SCORING_SPEC.md §5.1`.
- **`../viewer/import_worker.js`** — compiles. Used **unmodified**, only for the SQLite handover,
  and only after the visitor acknowledges it.

## Reused from the platform, never copied

The handover loads three viewer modules directly. They are **not** duplicated here, and the Viewer
is **not** modified:

| Path | Role |
|---|---|
| `../viewer/import_worker.js` | IFC → intermediate structures, in a Worker |
| `../viewer/import_db_builder.js` | `buildImportDBs(SQL, data)` → the SQLite database. Self-contained, no viewer globals |
| `../viewer/lib/sql-wasm.js`, `../viewer/lib/web-ifc-api-iife.js` | sql.js and web-ifc, vendored same-origin |

If any of those move, the handover breaks loudly at load rather than drifting out of sync. That is
intentional. **Do not copy them into this folder to "fix" a break** — fix the path.

## Privacy, and how to keep it true

- No `fetch`, no `XMLHttpRequest`, no `indexedDB`, no `localStorage`, no cookie in
  `metrics_worker.js`. Verified by counting the source, not by assertion.
- `GlobalId` is read to detect duplicates and is **never** posted back — only the count crosses.
- The submission payload carries integers, percentages, booleans and the schema string. No filename,
  no GUID, no coordinate, no element name. Exporter is matched against a fixed allowlist; anything
  unrecognised reports as `other`.
- The only third-party requests the pages make are **Google Fonts**, on page load, regardless of any
  file. The drop zone discloses this. Removing that dependency is open work — it is also what the
  offline zip needs.
- The assessment itself stores nothing. **The Viewer does** — `viewer/import.js` keeps imports in
  IndexedDB. That difference is real and must stay disclosed wherever the two meet.

## Language packs

`assess.html` carries inline `ms` and `ar` packs — 160 strings each. **Both are unadjudicated
drafts** and the page says so, in the target language and in English, whenever one is active.
Adjudication by a qualified translator is outstanding: roughly 2,150 words per language.

The acknowledgement gate, the consent statement and the printed Notice are **deliberately not
translated**. They are legally load-bearing and need a qualified legal translator, not a model.
Do not "finish the job" by drafting them.

## Things that will bite

- **`<meta charset="utf-8">` must stay on every page.** GH Pages sends the header so it looks
  redundant — until the offline zip opens over `file://` and the Arabic pack mojibakes.
- **A parse check is not a test.** Converting a screen to a render-time function once left
  `return ''` without its `+`: it parsed cleanly and silently returned an empty string. Exercise the
  built screens, do not just lint them.
- **`readiness/` is not precached by any `sw.js`**, so changes here need no `CACHE_VERSION` bump.
  Check before assuming that is still true.
- Four of the twenty criteria carry **no external anchor** (A3, C1, C3, C4). Never describe the
  instrument as "anchored" without stating the 16/4 split.
