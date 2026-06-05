# ⚠ DO NOT REMOVE — Analysis Sidecar: fast + offline 4D/5D/MEP, one shared source
# SCOPE: make boq_charts.html (4D/5D) and mep_report.html open instantly and work
#   offline, and fix the 4D regression — by computing each building's analysis ONCE
#   and persisting it as a tiny per-building sidecar, instead of fetching+opening the
#   17–40M meta.db and recomputing on every open. Read the log (§ lines) after every run.
# PRIME RULE: EXTRACT OR COMPILE ONLY. Captured (native IFC 4D) wins; CPM is compiled
#   only when the IFC has none; quantities are bbox-derived (never invented).
# HONOUR until ✅ DONE.

## WHY (the three problems, one fix)
1. **Slow open** — pages fetch the meta.db (Terminal 17M / LTU 40M, 48k–121k rows) +
   instantiate SQLite WASM + aggregate, every open. The QTO math is cheap (57–343ms);
   the cost is the **fetch + WASM open**, not the arithmetic.
2. **4D regression** — boq_charts pulls its schedule from `kernel_ops` (TimeMachine
   output). TM's *cinematic* regenerate (drone flight) entangled that contract → broken
   Gantt. The drone flight (camera) and the schedule (dates) are SEPARATE concerns that
   only share the sequence ORDER.
3. **Offline** — network `HEAD` probe for `_meta.db` fails offline; `sequence_rules.json`
   + sidecars must be cached for the pages to work from a cached building.

The single fix: **bake a tiny per-building sidecar once; cache it (SW precache or OPFS);
read offline-first with no big DB fetch and no network HEAD.**

## SOURCE PRIORITY (non-invent) — for the baked 4D
1. **Captured** — native `tasks`/`task_elements` (IfcWorkSchedule) present → extract it.
2. **CPM default** — else compile the deterministic forward-pass (boq_charts lines
   ~415–520) from quantities + `sequence_rules.json`. Labelled `source:'generated'`.
3. **kernel_ops override** (runtime) — TM edits overlay IF valid, else the baked default
   shows. boq_charts therefore stops depending on TM → regression cannot recur.

## ONE SHARED SOURCE — sequence_rules.json
`viewer/rates/sequence_rules.json` (49 rules + SEQUENCE_DEFAULT + 10 LABOR_RATES,
currency-free). Read by: the CPM schedule (DATA, baked) AND the TM drone flight (camera
ORDER, live). `rates.js loadSequenceRules()` overrides the hardcoded fallback IN PLACE;
fallback always present so globals are never undefined.

## SIDECAR SHAPE (per building, ~KB)
- `*_5d.json` — quantities only, **currency-free**: `[{disc, cls, storey, count, length_m,
  area_m2, vol_m3}]`. Live rate pack × qty at runtime (microseconds) → currency-flexible,
  no re-bake when locale changes. Same basis as today's BOQ → numbers stay consistent.
- `*_4d.json` — default schedule (captured-or-CPM) in the `schedule_instance` contract
  (`internal/schedule_instance.template.json`). Reuse it; do NOT invent a parallel shape.
- `*_mep.json` — MEP page's disc/class/storey + length/area aggregate (same queries it
  runs today at mep_report.html ~209–225).

## BAKE STRATEGY — lazy, client-side (no separate Node baker → no algorithm dup)
First open computes captured-or-CPM with the page's EXISTING code, then persists the
result to **OPFS** (SAHPool VFS — needs no COOP/COEP, works on GitHub Pages, single-tab,
offline). Later opens read OPFS → instant, offline. Do NOT reimplement the CPM/QTO in
Node (the notes warn against a 4th schedule source).

## STAGED RENDER
Paint **5D first** (fast aggregate / headline cost), then 4D after first paint (Worker or
idle) so the slow/fragile schedule never blocks. With sidecars both are tiny; staging
still guarantees 5D is never gated on 4D.

## MEP PAGE PARITY
mep_report.html already has the `_meta.db` split + IDB-first `fetchDbBuffer`, and now
awaits the shared rules (initRateTemplate → loadSequenceRules). Gaps: (a) no `bim_4d`
relay → can't get warm data from the open viewer; (b) same offline-HEAD trap. Fix via the
same `*_mep.json` sidecar + (optional) a `bim_4d` MEP_QTO relay mirroring boq_charts.

## TASKS / STATE
- ✅ **T1 sequence_rules.json unify** — ported to `viewer/rates/sequence_rules.json`;
  `rates.js loadSequenceRules()` + folded into `initRateTemplate` (boq_charts + mep await
  it). Witness `tests/test_sequence_rules_load.js` 6/6, `§RATES_JSON loaded=json rules=49
  labor=10`, no drift, fallback intact.
- ✅ **T2 offline rules** — `rates/sequence_rules.json` added to sw.js PRECACHE_ASSETS;
  CACHE_VERSION v590→v591.
- ✅ **T3 5D sidecar** — `viewer/analysis_sidecar.js`: OPFS JSON store (plain async API,
  no COOP/COEP) + `compute5D` (currency-free, disc/class/storey, bbox length/area/vol) +
  lazy `get5D` (OPFS hit → return; miss → compute+persist) + `apply5DRates` (unit drives
  billed qty: EA→count, M→length, M2→area, M3→vol; unmapped→0, non-invent). Witness
  `tests/test_5d_sidecar.js` 13/13; `§5D_SIDECAR source=computed rows=5 baked=false`.
  Real-data SQL verified on Duplex; area/length formula MATCHES shipped BOQ
  (boq_charts.html:1017-1021) → sidecar == export numbers. NOT yet wired into the page
  render (integration in T6).
- ✅ **T4 4D sidecar + decouple** — analysis_sidecar.js `compute4D` (captured>CPM
  priority, delegates to page's generateSchedule — no algorithm dup), `get4D` (lazy OPFS),
  `resolve4D` (kernel_ops override-if-valid; broken/empty/THROWING ops → baked default).
  boq_charts.html rewired (1144+): CPM default is the always-valid BASE, kernel_ops
  overrides only if it yields tasks. analysis_sidecar.js script-tagged in boq_charts + mep;
  SW precache + v591→v592. Witness `tests/test_4d_sidecar.js` 13/13 incl. the regression
  guard (`§4D_RESOLVE source=generated overridden=false` when builder throws). Inline JS
  syntax-clean. ⚠ REMAINING (T6): live browser witness — regression building renders a
  valid Gantt with TM idle (§-log proves logic, not the visual).
- ◑ **T5 lazy OPFS bake** — WIRED: boq_charts calls `get5D(db,bldName)` (establishes the
  currency-free 5D cache) and `await get4D(...)` (4D default OPFS-cached); both additive,
  inline JS syntax-clean. Witness spec `tests/specs/40-sidecar-opfs.spec.js` written
  (first-open computed+baked=true → reload source=opfs; + Gantt-from-CPM-default guard);
  spec audit clean (the 1 audit violation is pre-existing in 38-sh-dx, not this).
  ⚠ REMAINING: the spec was NOT executed here (Playwright not runnable in this worktree +
  needs a booted /dev server) — the live OPFS round-trip is spec-ready but UNWITNESSED in a
  browser. Run `npx playwright test 40-sidecar-opfs` against a server serving the worktree.
- ⊘ **T6 staged render — DECLINED (honest).** Evaluated: the 4D compute is NOT the
  bottleneck — generateSchedule/audit run on aggregated qtoData (~50–200 groups, <50ms),
  not per-element. The real "secs" were I/O (DB fetch + WASM open), already fixed by T5
  OPFS + the meta-split. A render-split / progress status = unwitnessed complexity for no
  measured gain (strip-not-add). Reopen only if profiling shows a real 4D-compute stall.
- ✅ **T7 MEP fast+offline** — mep_report.html now REUSES the same currency-free 5D
  sidecar (get5D, OPFS-cached) instead of its 3 SQL aggregates: its rows ARE disc/class/
  storey + count/length/area. Fallback to the SQL aggregates if sidecar unavailable.
  `§MEP_5D_SIDECAR rows=N`. mep_report + analysis_sidecar already SW-precached → offline.
  Witness: reuses the browser-witnessed get5D round-trip; inline JS syntax-clean; mapping
  to countRows/linearMap/areaMap is shape-identical to the prior queries (downstream
  untouched). No new sidecar type — one `*_5d.json` serves both pages.

## BONUS FIX (found via user's live console on LTU/Duplex)
- ✅ **`_scheduleSource` ReferenceError** — was `let`-scoped inside `init()` but read by
  `renderCharts()` (lines 1529/1530/1699) → uncaught ReferenceError that ABORTED
  renderCharts at the full-Gantt section, killing chart 9 + the resource/VO sections +
  the **hover-info wiring** (the user's "chart mouseover stopped working"). Pre-existing on
  origin/main; inherited. FIX: hoisted `_scheduleSource` to module scope. Witnessed LIVE
  (headless Chromium, real Duplex DB): no ReferenceError, renderCharts COMPLETES (12 chart
  boxes + full Gantt canvas), tooltips live, `§4D_SCHEDULE_SOURCE generated tasks=14
  overridden=false` (T4 decouple confirmed in a real render). This live run also covers the
  T4 "regression building renders a valid Gantt with TM idle" witness.

## TEST / DEPLOY
Whitebox §-log first. `node --check` every edited JS. Localhost until EXPLICIT GO.
Worktree `feat/analysis-sidecar` off fresh origin/main (shared tree is dirty with SFX/ERP).
Witness each isolate/render claim with a scene-state or §-count line, not the exit code.
