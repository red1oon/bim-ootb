# ⚠ DO NOT REMOVE — Scope & Discipline

**Scope:** Design spec for a **local-first, kernel-based HR + RegTech app** that runs standalone
(its own seed, no `ad_full`/ERP suite required) and integrates to ERP only via two **dotted lines**:
GL-account posting and `C_BPartner.isEmployee`. Three pillars: (1) Glass-box Payroll core,
(2) Mobile signed-edge (check-in / access / signing), (3) Malaysian RegTech (E-Invoice/MyInvois +
LHDN income-tax/PCB + EPF) framed as a **privacy-first counter-proposal**, free demo only.

**Status:** ALPHA FRAMEWORK BUILT + WITNESSED 2026-06-30, in **bim-ootb `hr_bim_asset/`** only. See §RESUME below.

**Discipline (PRIME DIRECTIVE — Deterministic · Non-invent · Extract):**
- **Regulatory facts are a NON-INVENT GATE.** No LHDN/EPF/PCB/MyInvois threshold, deadline, field
  schema, rate table, or validation rule may be implemented until SOURCED + CITED (see §RESEARCH GATE).
  A value with no statutory source is a FINDING, never a guess.
- This is a **demonstrator + policy counter-proposal**, NOT a certified/compliant production filer.
  It complies to *international accounting standards (IFRS/MFRS)* for the books and **advocates** a
  privacy-preserving alternative to government — it makes **no** claim of LHDN certification.
- **DISCLAIMER IS LOAD-BEARING (§DISCLAIMER):** every important screen and every generated output
  (payslip, invoice, report, export, print) MUST carry the **locale-aware** watermark
  **`CONTOH — TIDAK RASMI`** (MS) / **`SAMPLE — NOT OFFICIAL`** (EN). Witnessed criterion, not a footnote.
- Read the log after every run. Honour this block until the spec is DONE.

---

## ▶▶ NEXT SESSION — "Demonstrate a true Spatial ERP" (user 2026-07-01)

> The mission distilled (user, 2026-07-01): **demonstrate a TRUE Spatial ERP** — ERP/operate records living ON
> the building geometry, found spatially, with a **delightful UI where a user finds things easily and there is no
> redundancy**. Everything below serves that. **Branch `lane/hr-overlay` (worktree `/tmp/wt-hr`), 18 witnesses
> GREEN, all pushed.**

### STANDING RULES this work is judged by (do NOT regress)
1. **WHITEBOX-FIRST (user directive).** The §-log / witness must TELL you the truth — never rely on visually
   eyeballing a screenshot. A driver `§DIAG` line caught `roomsInGuidMap=0` and `tintedMeshes=0` before any
   image was opened. Add a `§`-log/witness for every claim; screenshots are *confirmation*, not verification.
   The reusable live-3D harness is `hr_bim_asset/tests/live/cdp_shot.js` (zero-dep CDP driver; serve the worktree
   with `python3 -m http.server 8099`, drive the REAL viewer, print `§DIAG`).
2. **DEMO-DATA RICHNESS STANDARD (user directive).** The seed must be **well-populated and meaningful** so the
   panel/dashboard/lenses *present richly* — NOT the current sparse look (dashboard showed only Level-1 populated,
   "8 rooms / 38% / 3 tickets"; lenses said "no data"). **Acceptance bar:** multiple storeys populated; occupancy
   shows a real mix (occupied/expiring/vacant/unavailable); presence shows varied headcounts; class shows a
   residential/commercial/office mix; ≥1 asset; ticket-aging spread across buckets. Non-invent (real guids,
   watermarked sample values), but RICH.
3. **Serve localhost; deploy only when happy** (user). The public docs site is already live; re-deploy via
   `safe_gh_deploy.sh` only after the screens meet the standard.

### BACKLOG (priority order) — work to zero
- **P1 — INSTANCED-TINT (the live lens actually paints). §-log proven half-done.** §REAL-BIND (commit this
  session) made every lens *resolve* on the live model — driver `§DIAG2`: `leaseRoomsResolved=3/3`,
  `available=[occupancy:on,presence:on,class:on,maintenance:on,dash:on]` (was 0/5). BUT `tintedMeshes=0`: HHS is
  **716 instanced groups**, so member meshes are keyed `guidMap[meshId + '_' + N]` (batched/instanced), which
  `viewer/hba_lens.js buildMeshPort.meshesFor` (`A.guidMap[obj.id]`, no suffix) misses; and one instance must be
  recoloured via `InstancedMesh.setColorAt`/`instanceColor`, NOT `material.emissive`. FIX buildMeshPort to (a)
  reverse-index guid→meshKeys handling the `_N` suffix, (b) tint instanced via setColorAt + restore. Witness with
  the live harness asserting `tintedMeshes>0`. This is THE blocker for a real lens-applied screenshot + closes #2b.
- **P2 — RICH DEMO DATA (the richness standard).** Enrich the gate seeds (`occupancy.demoSeed` /
  `attendance.demoSeed` / class declarations / one asset) to populate ALL real storeys/rooms with a meaningful
  MIX per the acceptance bar, so the dashboard + lenses look like a real operating building. Re-screenshot to
  confirm the standard (whitebox first: assert the pivot has N storeys, M states, etc.).
- **P3 — PREP SAMPLE GW DATA (user).** GardenWorld (`buildings/warehouse_gardenworld.db`, 61KB — fast/headless-
  friendly, vs HHS 73MB). Check its spatial tables; build a GW room/members fixture + bind rich demo HBA records
  to its real guids so the FM lenses + dashboard light on GW. Use GW as the primary documented sample (fast loop).
- **P4 — NEWBIE GUIDE REWRITE (user).** The deployed `docs/HRBIMAssetGuide.md` is reference-style; rewrite it as
  a **task-oriented manual** modelled on great manuals: *Getting started* (numbered: open the building → find the
  FM pill → open the drawer → toggle a lens), *task walkthroughs* ("see which rooms are occupied" step-by-step),
  *the data model* (op-log, records, guid→members binding, the periodic RUN engine, S_Resource), *reference*
  (lens table + legends + watermark), *troubleshooting* ("pill not showing = no data"). Use the REAL lens-applied
  screenshots once P1 lands.
- **P5 — ERP INTEGRATION / SPATIAL-ERP DOC (user).** Document how Viewer + ERP + HR integrate over ONE building +
  ONE signed op-log so **ERP users appreciate the delightful, find-everything, no-redundancy UI** (the FM family
  pill = one entry not six; wake-aware greying; records on geometry). Tie into `docs/SpatialERP_OOTB.md`.
- **P6 — AVATAR LOD "WOW" (user idea, for a session once P1–P2 land).** Little human avatars in each room when
  zoomed in; **hover → AD_User / `C_BPartner.image`** (plan an image field like `M_Product.image` if absent);
  proximity-based tips that appear as you draw nearer; reduce to **dots / minified avatars** when far (an LOD
  ladder over the presence lens). Non-invent: an avatar only where a real signed check-in/occupancy binds a real
  person to a real (now member-resolved) room.

---

## §RESUME — new-session handoff (2026-06-30)

> **▶ NEW SESSION START HERE.** Branch `lane/hr-overlay` (worktree `/tmp/wt-hr`), all pushed (tip `b8a2223`),
> suite GREEN (**14 witnesses**, see below). Shipped: real-guid binding (#1), viewer wire (#2), derived PM 4D
> timeline (#4c), real storey derivation, §WATERMARK 19/19, **T&A slice-1/2** (check-in + presence lens),
> **Leave/Absence**, **T&A access**, **Room Occupancy / Availability** (iDempiere Resource-Assignment),
> **R_Request / ticket** workflow, the **occupancy dashboard** (Chart.js over pivot), and its **viewer pane +
> pills wired** (additive, zero-impact). User Guides (bim-compiler `docs/ERPUserGuide.md` + `BIMUserGuide.md`)
> updated + **DEPLOYED live** to gh-pages (canaries 200).
> **▶ LIVE BROWSER SMOKE ✅ DONE** (`hr_bim_asset/tests/smoke_hba.html`, headless Chrome): the dashboard pane +
> charts render REAL replayed data (util 21%, availability 'occupied'), watermark, KPIs; OFF=no DOM, ON mounts one
> overlay (3 sized canvases), OFF zero-residue, 0 console errors; standalone demo page renders too. **It caught 3
> real browser-only bugs node missed** (fixed `dc563d1`): connectors `var crypto` aliased the read-only global
> window.crypto → threw at load; the signed-op engines weren't IIFE-wrapped → top-level helpers (`_signed`/`_ops`/…)
> leaked to GLOBALS and the last-loaded file clobbered them (occupancy.availability ran request._ops → every room
> 'vacant'); Chart created on a DETACHED pane → blank. **LESSON:** any HBA engine file loaded as a browser
> `<script>` MUST be IIFE-wrapped; node module-isolation hides these — keep a live browser smoke. Full-viewer
> in-app load (3D + building stream) is the only thing not yet observed (heavy/flaky headless; pane+engine proven).
> **▶ THEN — pick a Phase-F differentiator or a new UI surface:**
> -1. ✅ **DONE — R_Request / ticket** (`request.js`, **W-HBA-REQ 15/15**) + **occupancy dashboard**
>    (`dashboard.js`, **W-HBA-DASH 7/7**, demo `demo/occupancy_dashboard.html`). The ticket is a SIGNED status
>    FSM (OPEN→ASSIGN→START→RESOLVE→CLOSE/REOPEN; illegal transition → REFUSE) threaded to the SHARED room/asset
>    guid; `effect()` emits its occupancy op (maintenance→UNAVAIL) closing the Request↔occupancy loop. `aging`/
>    `myWork` = SLA + deskless-queue views. The dashboard = pure Chart.js config builders over `occupancy.pivot()`
>    + `request.aging()` (per-storey bar · availability trend stacked-bar · ticket-aging doughnut + KPIs), rendered
>    by the ALREADY-BUNDLED `viewer/lib/chart.umd.min.js`. **VIEWER UI WIRED ✅** (`viewer/hba_dashboard.js`,
>    **W-HBA-DASHPANE 8/8**): the dashboard is an **EXTRA, ADDITIVE pane** (own overlay div + canvases, host-
>    injected, imports nothing) + two data-gated pills in `panels.js` (`hbaOccupancy` lens · `hbaDash` pane).
>    OFF = no DOM (pixel-identical); ON mounts one overlay; OFF removes it + destroys its charts (zero residue) —
>    never touches the 3D scene, other panels, or `sw.js`. `hba_lens.js` seeds a watermarked demonstrator
>    occupancy ledger from the model's real rooms so the lens + pane light up. **Open (live-3D, like #2b):
>    observe the pane/pills in a real browser (Playwright/deploy smoke) — node-witnessed via stub DOM + Chart.**
> 0. ✅ **DONE — Room Occupancy / Availability** (`occupancy.js`, **W-HBA-OCC 21/21**; AD model `Occupancy` =
>    `S_ResourceAssignment`, Room=`S_Resource` IS-A `M_Product`). Signed `ASSIGN`/`RELEASE`/`UNAVAIL`
>    (S_ResourceUnAvailable blackout) op-log → `availability(room,period)` by **REPLAY** (occupied/vacant/
>    expiring/unavailable; early-release + blackout honored; vacancy = absence of an op). `pivot()` = the
>    dashboard graph data (room×period matrix + per-storey + per-period utilization) — populates HHS across the
>    14 REAL rooms. Rides the EXISTING MeshPort seam via `overlay.computeOccupancy` + `viewer/hba_lens.js`
>    `occupancy` mode. **REQUEST RELATION:** `linkRequest` maps an R_Request to its availability effect over the
>    shared room guid (move-in→ASSIGN · move-out→RELEASE · maintenance→UNAVAIL). **Open:** the R_Request/ticket
>    workflow engine (later slice); a Chart.js dashboard pane over `pivot()` (lib already bundled — UI wiring only).
> 1. ✅ **DONE — T&A slice-2 viewer presence lens** (`overlay.computePresence` + `viewer/hba_lens.js` `presence`
>    mode, **W-HBA-PRES 14/14**). `attendance.presenceByZone` headcount folds to a blue density ladder (1→low /
>    2-4→med / 5+→high) that RIDES the EXISTING `applyOverlay` MeshPort seam — zero new viewer-core; one-mode,
>    restore-on-off, render-side non-invent gate (un-located zone → un-linked, never tinted). Sourced from the
>    host-injected signed log `A._hbaAttendanceLog`. **✅ PILL WIRED 2026-07-01 (W-HBA-PRESPANE 10/10, see §T&A
>    SLICE-2 PILL):** data-gated `hbaPresence` pill (Lucide `footprints`) in `panels.js` + gate seed
>    `HbaAttendance.demoSeed`; actor-/building-class-agnostic — serves a tenant checking into a residential/
>    commercial/office unit (PP8). **Remaining open sub-item (like #2b): live 3D browser smoke.**
> 2. ✅ **DONE — Leave/Absence** (`leave.js`, **W-HBA-LEAVE 13/13**). The three primitives: ACCRUAL = a signed
>    op (C.sign/verifyChain) · BALANCE = a REPLAY of the op-log (Σ ACCRUE − Σ TAKE, carry-forward via asOf, may
>    overdraw — honest) · FEEDS PAYROLL = `leaveDeduction` splits an over-drawn/LWP take into unpaid days →
>    a FIXED SUB element on the already-witnessed pay run (net 3000→2600, GL still balanced). No unpaid days →
>    no phantom line; tamper-evident; deterministic; watermarked summary. **Open: a leave UI surface** (the
>    engine + payroll feed are node-witnessed; no panel wired).
> 3. ✅ **DONE — T&A access** (`access.js`, **W-HBA-ACCESS 13/13**). A grantor mints a SIGNED capability token
>    scoped to REAL zone(s) for a time window; a door reader VERIFIES it OFFLINE (pure crypto + a local trust
>    anchor + a local revocation set, no network/db). Phantom-zone grant → REFUSE; forged scope → bad-signature;
>    out-of-scope/early/expired/wrong-holder/untrusted-grantor/revoked → honest DENY; a forged revoke is ignored
>    (can't deny by forgery). Watermarked pass. **Open: the physical reader/turnstile (hardware integration, not
>    a build) + a grant/verify UI surface.**
>
> **▶ NEXT OPEN (no NEXT BITE remaining):** Phase-F differentiators (per §VISION/§MARKET TRIAGE) or a UI surface
> for leave/access/presence. ⛔ Still user-gated: #2b live 3D browser smoke · #3-ERP dotted lines (ERP must load)
> · #4(a/b) a real external P6/MSP plan + building.
> ⛔ Still need a USER decision/dependency: #2b live 3D browser smoke · #3 ERP dotted lines (ERP must load) ·
> #4(a/b) import a real external P6/MSP plan (which plan, which building).

**Module = HR_BIM_Asset** (NOT "Payroll" — payroll is just RUN profile #1). Lives in **bim-ootb ONLY**:
`hr_bim_asset/` + this spec in `bim-ootb/prompts/`. Worktree `/tmp/wt-hr`, branch `lane/hr-overlay`. ZERO
bim-compiler work (EXCEPT the user-directed ERP/Viewer User-Guide doc updates 2026-06-30, deployed via
`safe_gh_deploy.sh`). Witness: `for w in run view bind wire timeline watermark attendance presence leave access
occupancy request dashboard dashpane presspane class family realbind; do node hr_bim_asset/tests/witness_$w.js;
done` — W-HBA: ALPHA 18 · VIEW 13 · BIND 11 · WIRE 10 · TIMELINE 7 · WATERMARK 9 (19/19 surfaces) · ATTEND 8 ·
PRES 14 · LEAVE 13 · ACCESS 13 · OCC 21 · REQ 15 · DASH 7 · DASHPANE 8 · **PRESPANE 10** · **CLASS 9** ·
**FAMILY 8** · **REALBIND 6**. (18 witnesses, all GREEN.) Demos: `demo/occupancy_dashboard.html`,
`demo/fm_panel.html`. Live-3D whitebox harness: `tests/live/cdp_shot.js` (see §NEXT-SESSION rule 1).

### §FM-FAMILY — group HBA lenses under one wake-aware "FM/Operate" pill ✅ DONE 2026-07-01 (`W-HBA-FAMILY 8/8`)
**User concern (2026-07-01):** *clutter / conflate / losing the plot* — the HBA pills had grown to **6**
(Tenancy·IoT·Occupancy·Presence·Class·Dashboard) on an already-~35-pill bar, and Tenancy ≈ Occupancy conflated.
**Decision (user):** "Group + de-conflate." Done:
- **Group 6 → 1.** `viewer/panels.js` now carries ONE data-gated `hbaFM` pill (Lucide `building-2`) →
  `HBALens.openFamilyDrawer(A)`. The drawer + per-lens icons live in `viewer/hba_lens.js` (the additive HBA
  module) so panels.js (the conflict-magnet, Teams-adjacent) stays minimal. The 6 old pills + their 5 icon defs
  were removed.
- **De-conflate.** Tenancy folded into Occupancy (occupancy = the op-log superset incl. lease status). The
  `'tenancy'` engine mode still exists (back-compat + witnesses) but is no longer a separate surface. Family =
  **Occupancy · Presence · Unit class · Assets/IoT · Dashboard** (5 distinct questions).
- **Wake-aware.** `availableLenses(A)` (pure, witnessed) drives both the pill gate (`familyHasData` → pill shows
  iff ≥1 lens has data) and per-entry greying in the drawer (enabled-if-data, else greyed "no data"). Proven live:
  the `demo/fm_panel.html` screenshot shows Occupancy/Presence/Class/Dashboard enabled, **Assets/IoT greyed** (no
  asset guid in HHS). **The plot, restated in the drawer header:** *one model, lenses each answering one question,
  off one signed op-log.*
**Witness W-HBA-FAMILY 8/8** (`witness_family.js`): de-conflate (no standalone tenancy) · wake-aware greying ·
gate · activateLens routing (lens→toggle / pane→dashboard) · one-pill-in-source. Updated `witness_presspane` PP6
+ `witness_class` C7 to the family wiring. **Browser smoke + screenshot:** `demo/fm_panel.html` (headless Chrome,
0 errors). **Open (like #2b):** the drawer entries actually tinting the live 3D model.

**⚠ COORDINATION (user 2026-07-01):** another active session — the **Teams overlay** lane (`lane/teams-overlay`,
worktree `/tmp/wt-redpill`) — also targets **HHS** for its overlay + Find-panel lens. Verified NO collision:
Teams keeps everything in `teams/` (self-mounts its own `teams_pill.js`, does NOT touch `viewer/panels.js`) and
paints DOM dots (`dot_layer.js`), while HBA tints **mesh emissive** via the MeshPort + adds pills to `panels.js`.
Different seams → they coexist on HHS at runtime; no git conflict. **Keep it that way:** HBA pills stay additive
in `panels.js` (on any future merge, KEEP BOTH lanes' additions — panels.js is the conflict magnet); HBA overlays
stay on the emissive MeshPort with restore-on-off; never grab Teams' DOM nodes.

**DONE + witnessed:**
- Generic RUN engine — payroll · tenancy · strata · maintenance (ONE engine). **W-HBA-ALPHA 18/18.**
- 4 AD models, singular demo records (Tenancy/PropertyManagement/Strata/Asset); Asset = bim_guid↔iot + operator/vendor/personnel + schedule.
- Spatial view (`overlay.js`+`lens.js`): 2 Find flaticon lenses (Tenancy=`users` blue-band · IoT=`cpu` · word-on-hover), storey density-dots, click→zoom→dummy→IFC-popup. Zero-impact (MeshPort/ScenePort seams). **W-HBA-VIEW 13/13.**
- Watermark CONTOH/SAMPLE on every output. §BINDING (guid join + bim_orders_overlay inject). §CROSS-APP (Viewer·ERP·HR spine).
- **NEXT#2 ✅ DONE 2026-06-30 — viewer wire-in (`viewer/hba_lens.js` + `W-HBA-WIRE 9/9`).** Two DATA-GATED pill
  icons in `viewer/panels.js` (`hbaTenancy`/`hbaIot`, `users`/`cpu` Lucide added to ICONS) — `pill:false` until
  `hba_lens.js` detects a real binding in the loaded building, then flips + `A._buildPill()` (the whwalk precedent).
  `hba_lens.js` (additive, host-injected, imports nothing) binds the WITNESSED overlay engine to the scene via a
  real **MeshPort over `A.guidMap`** (emissive tint, reused from `nlp.js`); toggle-off restores every material
  (zero residue). HBA engine made browser-safe (guarded `require` → `self.Hba*` globals) + loaded in `viewer.html`.
  ZERO new shared-file risk beyond the sanctioned 2-icon touch; `sw.js` untouched (§OPS). **Remaining = live 3D
  Playwright/deploy smoke (NEXT#2b)** — §-log value-verification done, browser render not yet observed.
- **NEXT#1 ✅ DONE 2026-06-30 — real-guid binding (`binding.js` + `fixtures/hhs_rooms.json` + `W-HBA-BIND 9/9`).**
  Demo lease `L-0001` + strata parcel now reference REAL HHS IfcSpace rooms (`RM_Level_1_1` ≈ Level 1 R1 /
  `RM_Level_1_2`), extracted into a provenance-stamped fixture (14 real rooms, src sha16 6498f86f, occupancy
  from `rel_contained_in_space`). `binding.resolveGuid`/`bindRecords` = the **non-invent JOIN gate**: a guid
  lights a unit ONLY when it resolves to a real mesh; a fabricated guid is honestly **un-linked**, never tinted
  (proven by `overlay.computeOverlay(..,{knownGuids})` gating 2→1). `Connectors.resolveGuid` = the MeshPort seam
  (swap fixture→`APP.guidMap` to go live). Fixture re-built by `fixtures/build_hhs_rooms.js`.

**DEMO BUILDING:** `HHS_Office_Federated` (73MB, 6871 elems; HAS rooms — `rel_contained_in_space`, rooms
`RM_Level_1_*`) copied into `bim-ootb/buildings/` (gitignore `!` exception) — **GH-served, NOT OCI**. Landing
`index.html`: HHS entry carries `gh:'https://red1oon.github.io/bim-ootb/'`; `openBuilding` uses it → loads from
GH bim-ootb. Other buildings untouched (OCI `_prodBase`).

**NEXT (in order):**
1. ✅ DONE — see §RESUME above (real-guid binding + W-HBA-BIND 9/9).
2. ✅ DONE — see §RESUME above (viewer wire-in + W-HBA-WIRE 9/9). Icons data-gated, MeshPort over `A.guidMap`,
   `sw.js` untouched. **Sub-item NEXT#2b open:** live 3D Playwright/deploy smoke (observe the tint in a browser).
3. ⛔ BLOCKED (external dependency): ERP/HR dotted lines (agreement/product/AR · attendance/access) — light up only
   when ERP/HR are loaded; swap the connector stubs then. Not actionable standalone.
4. PARTIAL — TimeMachine.Editor 4D Gantt: premise was false (HHS 4D tables EMPTY); editor already shipped on
   mainline (#504–#521). **(c) ✅ DONE** — HBA-native derived PM schedule (`timeline.js`, W-HBA-TIMELINE 7/7,
   foldable by the merged editor). **(a)/(b) ⛔** still need a user decision (which real external plan/building).

**▶ NEXT HR TARGET (spec review 2026-06-30) — Time & Attendance: signed · spatial · offline check-in (§PILLAR 2).**
The triage's own pick: §MARKET TRIAGE rates **T&A ★★★★★ "T1 moat"** (offline + signed non-repudiable + spatial),
the deskless/construction strategic cut. It is the highest-fit, lowest-new-primitive next target because it
**reuses what tenancy just shipped**: the guid→element binding (`resolveGuid`/`meshIdForGuid`) becomes the
**spatial scope** of a check-in (Site→Building→Floor→zone), the storey derivation gives the zones, the connector's
**W-SIGN** (`sign`/`verifyChain`) signs each presence `kernel_op`, and the density-dots overlay becomes a live
**headcount-by-zone** presence lens. It closes the loop the spec describes — *check-in (signed, spatial, offline)
→ timesheet/leave (edge ops) → deterministic pay run (payroll = profile #1, already witnessed) → payslip back in
pocket*. Honest boundary (§PILLAR 2): the ONLY external piece is physical door hardware (reader/turnstile) — an
integration, not a build; every software primitive already exists. **Follow-on:** Leave/Absence (★★★★ T1 —
accrual=op, balance=replay, feeds payroll). Anti-scope reminder: T3 (ATS/LMS/benefits) stays OUT (§MARKET TRIAGE).

**⛔ TimeMachine.Editor (4D Gantt) — premise CORRECTED 2026-06-30 (non-invent):** earlier note claimed "HHS
carries 4D data." FALSE — HHS has the 4D SCHEMA (`tasks`/`task_sequences`/`task_elements`/`schedules`) but **ZERO
rows** (verified `sqlite3 … SELECT count(*)`). There is no extracted schedule to show. The TM editor + P6/MSP
importers **already exist and are MERGED on mainline** (`§SE-1..4` + PRs #504–#521: CPM, drag-Gantt, cross-surface
sync, P6/MSP/XER import, auto-bind) — NOT HBA-lane work; the TM "Schedule Editor" button already opens
`schedule_editor.html?db=<current DB_URL>`. A live 4D demo therefore needs a REAL schedule, which cannot be
INVENTED: either (a) import the one real plan in the repo `tests/fixtures/Hospital_GW_Programme(.bound).xer`
(GardenWorld-bound, not HHS), or (b) the user supplies a real P6/MSP plan, or (c) the HBA-native path: derive a
maintenance timeline from PM_Asset `next_due`/`pm_cycle` (the witnessed `maintenance` RUN profile = derived, not
invented). **(c) ✅ DONE 2026-06-30 — `timeline.js` + `W-HBA-TIMELINE 7/7`:** derives a PM schedule in the
viewer's OWN 4D schema (schedules·tasks·task_elements·task_sequences) so the merged editor folds it with ZERO
editor edits; due dates = next_due stepped by pm_cycle, tasks = milestones (duration 0, day floored — only the
real datum asserted), bound to the demo asset's REAL HHS guid (`04i7…` IfcFlowTerminal); uninterpretable cadence
→ honest skip; deterministic. Viewer accessor `HBALens.maintenanceSchedule(A)` filters to assets bound in the
loaded building (W-HBA-WIRE W8). **⛔ STILL OPEN (a)/(b) — ONE DECISION (cannot extract): for a schedule from
EXTERNAL/observed plans, which real schedule on which building?** (a) import repo P6 `Hospital_GW_Programme.xer`,
or (b) user supplies a plan. The DERIVED-PM path needs no such decision and is shipped.

---

## §VISION — why HR is the *higher* fruit (and a market angle)

iDempiere/ADempiere never shipped real Payroll, so there is **no incumbent to merely match** — this
defines the bar. HR ticks a big box in ERP proposals AND would be the **first kernel local-first HR
app**. It is reachable because it is *mostly seed data on the kernel we already have*, not a new engine.

The differentiator across all three pillars is the **same privacy lever**: the single most sensitive
datasets in any economy — payroll comp, and now every business's transaction ledger — never leave the
device. That is a story cloud-HR (Workday/ADP/BambooHR) and a government clearance-server **structurally
cannot tell.**

---

## §DISCLAIMER — `CONTOH — TIDAK RASMI` watermark (applies to ALL pillars)

The whole app is a **demonstrator**, not for official use. This is enforced visually, not just stated:

- **Mandate:** every important screen and every generated/exported/printed artifact (payslip, e-invoice,
  GL report, attestation, data export, PDF/print view) renders a **locale-aware** watermark —
  **`CONTOH — TIDAK RASMI`** (MS) / **`SAMPLE — NOT OFFICIAL`** (EN), so it reads for both the Malaysian
  RegTech demo and outside markets. One string per active locale; default EN when locale is unset.
  Applies on mobile edge surfaces (check-in/access/sign receipts) too.
- **Persistence:** the watermark must survive screenshot, print, and PDF export — render it into the
  artifact, not as a dismissible overlay. It is **not user-removable**.
- **Acceptance (witnessed, per `docs/TestArchitecture.md`):** a `§WATERMARK` whitebox check asserts the
  marker is present on every output-class surface (count of important screens == count carrying the mark;
  any miss = FAIL). Wiring/render presence may be Playwright-checked secondarily; value/coverage is the §-log.
- **Rationale:** the watermark is the visible half of the legal boundary in §DO-NOT-REMOVE and §PILLAR-3
  positioning — it makes "demonstrative, not official" impossible to mistake on any captured output.

---

## §ARCHETYPE — Payroll-first, NOT HRIS-first or Talent-first

| Archetype | Shape | Kernel fit |
|---|---|---|
| HRIS/Core-HR first (BambooHR) | employee records, org chart, forms | Weak — forms over state, low compute, doesn't tick the box buyers mean |
| **Payroll-first (ADP)** | the engine that *pays people*: gross→net, statutory, GL post | **PERFECT** — deterministic compute, doc-as-event, GL-integrated, privacy-critical |
| Talent-first (recruit/appraise/learn) | workflow + social + collaboration | Worst — cloud-collaborative by nature, fights local-first single-tab |

The user's own integration constraint (**GL posting + `C_BPartner.isEmployee`**) is *exactly and only*
payroll's seam → payroll-first is confirmed by the data, not preference.

---

## §PILLAR 1 — Glass-box Payroll core

### Why it delights (cloud HR can't match)
1. **Privacy as architecture** — comp data runs in the tab, never leaves the device.
2. **Glass-box payslip** — every line (base/allowance/tax/EPF/SOCSO/net) **traces to the rule op** that
   produced it (the Glassbowl thesis on a payslip). Kills the #1 payroll support ticket.
3. **Safe editable statutory rules** — change a rate → §0.5 decision table → **dry-run next run → diff →
   commit** (§0.4/§0.6). iDempiere/SAP need a consultant + redeploy.
4. **Deterministic re-run** — re-run last month → bit-identical (`replay-hash == live-hash`). Auditor's dream.

### Shape on the existing 5-table kernel (no new primitives)
- `items` — employees (`isEmployee` extension) + **pay elements** (each a rule: fixed / %-of-base / formula / statutory bracket)
- `documents` — the **Pay Run** (`doc_type=PAYRUN`), lifecycle `draft → calculate → approve → post`
- `document_lines` — one **payslip** per employee; calculate = run element rules deterministically, every step a `kernel_op`
- `journal` — on POST emit postings (Dr wages, Cr net-pay-payable, Cr statutory payables) = the dotted GL line, reusing `postJournal`
- **payslip = the trace** — same lineage walk Glassbowl does for `Order→Invoice→Payment`

This is the existing kernel + decision-table engine + op-log, pointed at an **`hr_seed.db`** + one new
payslip view. Small surface, big checkbox.

---

## §PILLAR 2 — Mobile signed-edge (the special market angle)

Mobile flips HR from a back-office **module** to an **edge product** — where local-first/offline/signed
is the only thing that works. Every edge action is one shape: **an employee, on a phone, emitting a
signed `kernel_op` that survives no-signal and reconciles later.** Every primitive already exists:

| Edge action | On the kernel | Proven by |
|---|---|---|
| Check-in / attendance | signed, time-stamped presence op; phone = the time clock | `kernel_ops` + W-SIGN |
| Door / site access | signed **capability token** the reader verifies *offline* | W-OWNER/CAS + W-SIGN (§0.20 secured axis) |
| Signing (payslip ack, leave, safety brief, permit-to-work) | sealed signature op in the chain | W-SIGN (`sealChain`/`verifyChain`/`setSigner`) |
| Payslip in pocket | glass-box payslip view, offline, never leaves device | the Glassbowl trace |
| Sync | edge op-log folds through the **dumb facilitator** when online | DistributedERP §6 |

→ The HR edge app is the **first real-world consumer of the secured-distributed doctrine** outside ERP docs.

### The MOAT — fuse the edge with the BIM spatial model
No generic HR vendor has the building:
- Check-in is **spatial** — "Site → Building A → Floor 3" via existing containers (§0.1), not "I'm at work."
- Access control **maps to spatial zones** — who's allowed where is a query over the model, not a separate ACL.
- **Site-presence analytics on real geometry** — headcount-by-zone, who-was-where-when, safety/induction
  compliance per area — off the op-log (§0.6), rendered on the modeller's geometry.
- Granularity today = floor/building (solid); finer room-zone sharpens **for free** as the IfcSpace/datum
  recovery in the SDG spine lands (`rel_adjacency`/`datum_plane`).

### Construction context = the killer fit
Sites have poor/no connectivity, transient labor, real safety/access stakes → offline-first signed
check-in + spatial access solves a genuine pain the cloud-HR incumbents can't (no server assumption, no building).

### Honest boundary
Software primitives (issue/verify signed credentials, offline op-log, sync, spatial model) all EXIST.
The one external piece is **physical door hardware** (reader/turnstile via QR-on-phone / BLE / NFC) — an
**integration/partner edge, not a build**. State it as a clean integration line in any proposal.

### The closed loop
`check-in (signed, spatial, offline) → timesheet/leave (edge ops) → deterministic pay run (glass-box) →
payslip back in the same pocket (signed ack) → GL post (dotted line)`. One signed, replayable,
offline-capable chain from clock-in to net pay; privacy holds the whole way.

### §T&A SLICE-1 — the signed spatial check-in engine ✅ DONE 2026-06-30 (`attendance.js`, W-HBA-ATTEND 8/8)
Engine shipped: `checkIn`/`checkOut` (signed, spatial-gated → honest REFUSE on un-located zone) · `sessions`
(in→out pairs, OPEN on unmatched) · `timesheet` (hours/employee+zone, tamper-evident, watermarked) ·
`presenceByZone` (headcount → density overlay) · `fingerprint` (replay==live). Reuses W-SIGN + binding +
watermark; deterministic. §WATERMARK coverage now 19/19 (incl the timesheet). **NEXT T&A slices:** viewer presence
lens (reuse density dots) · access = signed capability over a zone · then Leave/Absence. Original spec ↓.
**Scope:** the engine half of Pillar 2 — an employee emits a **signed presence `kernel_op`** at a **real
spatial zone**, foldable offline into a **timesheet** + a **headcount-by-zone** presence count. Module
`hr_bim_asset/attendance.js` (`HbaAttendance`), reusing what tenancy shipped: `Connectors.sign`/`verifyChain`
(W-SIGN), `binding.resolveGuid` (spatial gate), the storey/zone derivation, the watermark. **No viewer/door
hardware in this slice** (that's a later integration). Pure + deterministic — caller supplies `ts` (no Date.now).
**NON-INVENT gates:** zone must resolve to a REAL building guid → else honest **REFUSE** (never a faked presence);
session hours computed from REAL in/out `ts` pairs; an unmatched check-in = an honest **OPEN** session, never a
fabricated end. **Witness claims (W-HBA-ATTEND — write the test, then implement):**
- A1 check-in to a REAL zone → a signed presence op; the chain `verifyChain` is OK.
- A2 check-in to a non-existent zone → **REFUSE** (no op, honest).
- A3 amend a signed presence param → `verifyChain` **breaks** (tamper-evident).
- A4 `timesheet(ops, period)` folds in→out pairs → correct hours per employee/zone (deterministic).
- A5 check-in with no check-out → an **OPEN** session (no fabricated finish).
- A6 `presenceByZone` → headcount per REAL zone (the spatial moat; feeds the density overlay).
- A7 deterministic — same ops → identical timesheet fingerprint (replay == live).
- A8 every receipt/output carries the CONTOH/SAMPLE watermark (§DISCLAIMER).
Follow-on slices: viewer presence lens (reuse density dots) · access = signed capability over a zone · Leave/Absence.

### §T&A SLICE-2 PILL — viewer presence-lens pill wire-in ✅ DONE 2026-06-30 (`W-HBA-PRESPANE`)
**Scope:** the LAST open sub-item of presence (#1 in §RESUME) — the engine + `presence` lens-mode + `computePresence`
seam were already node-witnessed (W-HBA-PRES 14/14), but **no pill icon was wired** (panels.js untouched that
slice). This wires it following the EXACT data-gated pattern of `hbaTenancy`/`hbaIot`/`hbaOccupancy`/`hbaDash`:
- **Seed parity (non-invent):** the gate auto-seeds `A._hbaOccupancyLog` so the Occupancy lens lights on a
  building that carries rooms — presence had NO equivalent, so the pill could never light. Add
  `HbaAttendance.demoSeed(rooms, period)` = a deterministic, SIGNED (`verifyChain`-OK) check-in log over the
  model's REAL room guids for the QUERIED period (ts derived from the host-supplied `period`, no `Date.now`),
  producing honest headcounts (zone0→3 present/med band · zone1→1/low · rest→0, vacancy from absence). The gate
  injects it parallel to occupancy.
- **Gate entry:** add `hbaPresence: detect(A, 'presence')` to the `on` map so the icon flips on ONLY when a
  located check-in resolves to a real mesh in THIS building (no data → no icon).
- **panels.js pill:** one ADDITIVE action `hbaPresence` (Lucide `footprints` icon), `pill:false` until the gate
  flips it, `fn → HBALens.toggle(A, 'presence')`, `isActive → HBALens.isActive('presence')`. Reuses the SAME
  MeshPort seam (zero new viewer-core); one-mode-at-a-time; toggle-off restores every material (zero residue).
**Witness claims (W-HBA-PRESPANE — write the test, then implement):**
- PP1 `demoSeed(rooms, period)` → a SIGNED check-in log; `verifyChain` OK; `presenceByZone` gives the expected
  headcounts over the REAL zones (deterministic — same inputs → identical log).
- PP2 data-gate: `detect('presence')` is FALSE with no attendance log / on a building whose zones aren't present,
  and flips TRUE once the seed is injected over a real-guid building (icon shows / honestly absent → no clutter).
- PP3 `toggle('presence')` ON tints ONLY the meshes of present zones (density band), other meshes untouched.
- PP4 toggle OFF restores every touched material (emissive→0), lens inactive (zero residue / zero-impact).
- PP5 non-invent: a check-in to a zone ABSENT from `guidMap` → `unlinked`, never tinted.
- PP6 static wiring: `panels.js` registers an `hbaPresence` action whose `fn` calls `HBALens.toggle(.,'presence')`,
  and `hba_lens.js` gate `on` map includes `hbaPresence` (proves the pill exists + is data-gated).
- PP7 watermark: the timesheet folded from the seeded log carries the CONTOH/SAMPLE disclaimer (§DISCLAIMER).
- PP8 **actor- & building-class-agnostic** (user 2026-07-01): the SAME presence/occupancy primitive serves a
  TENANT checking into a **residential / commercial / office** unit, not just an employee at a site. The op's
  actor is just a party id (employee OR tenant BP); the lens keys on the room GUID — the IfcSpace CLASS is a
  label on the space, never hardcoded in the lens. Proven: a tenant-party check-in lights presence (headcount=2)
  AND a tenant move-in (ASSIGN) lights occupancy=occupied over the same unit guid.
  → **Occupancy lens** = unit availability by tenant move-in/out (assign/release, W-HBA-OCC) · **Presence lens**
  = live "who's-in-the-unit-now" headcount from signed check-ins (this slice). Both already serve tenants across
  building classes; nothing class-specific to build for the lens itself.
**W-HBA-PRESPANE 10/10 PASS.** Witness file `hr_bim_asset/tests/witness_presspane.js`; add `presspane` to the
suite loop. **Open (like #2b):** observe the pill/tint in a real browser (live-3D smoke) — node-witnessed via
stub DOM here.

### §CLASS — color/filter units by building-use class ✅ DONE 2026-07-01 (`W-HBA-CLASS 9/9`)
**Decision (user 2026-07-01):** "Yes — color/filter by class." **Non-invent finding:** HHS carries NO real
IfcSpace use-class — every `IfcSpace` is `object_type='COMPILED'`, `predefined_type='INTERNAL'`, generic names.
So class CANNOT be extracted from this model; the honest source is the **seed column** the chosen option
anticipated. Built:
- `models.js` — added a declared `unit_class` field to Tenancy + **3 demonstrator leases** over REAL HHS room
  guids: `L-0001` office (RM_Level_1_1) · `L-0002` commercial (RM_Level_1_3) · `L-0003` residential
  (RM_Level_1_4). DECLARED business data (CONTOH/SAMPLE watermark), real guids — NOT a geometric claim.
- `overlay.js` — `CLASS` palette (residential/commercial/office + grey unclassified) + `computeClassOverlay`
  (color by class; `classFilter` = the FILTER facet → tint ONLY one class; same plan shape → reuses MeshPort).
- `viewer/hba_lens.js` — `classRows`/`classOf` resolver (PRIORITY: real model `predefined_type` → declared
  `unit_class` → `unclassified`, never guessed; HHS falls to declared) + `'class'` lens mode + `hbaClass`
  data-gate + a model→use-class map from `predefined_type` (only genuine IfcSpaceTypeEnum counts).
- `panels.js` — additive data-gated `hbaClass` pill (Lucide `layers`), `fn → HBALens.toggle(A,'class')`.
**Witness W-HBA-CLASS 9/9** (`hr_bim_asset/tests/witness_class.js`): resolver priority (model wins over declared;
strata→unclassified; unreferenced unit untouched) · palette color + deterministic · classFilter tints one class ·
gate (unresolved→unlinked) · toggle restore (zero residue) · data-gate · static wiring · declared field +
watermark. **NOTE:** adding 2 leases updated `witness_view` V1 + `witness_bind` B5 (were hardcoded to "exactly 1
lease" → now assert against the real record count). **Filter UX:** the engine takes `A._hbaClassFilter`; a class
dropdown/chip in the pill UI is a later browser bite. **Open (like #2b):** observe the class colors in a live 3D
browser.

---

## §PILLAR 3 — Malaysian RegTech: E-Invoice + LHDN tax/EPF (privacy-first counter-proposal)

Overlaps ERP.POS (e-invoice) and Pillar 1 (income-tax/PCB + EPF). **Free demo only**; goal = groundswell.

### The thesis: clearance model → attestation model
National e-invoicing (MyInvois et al.) uses a **clearance model**: every invoice streamed to the central
platform, validated live, stamped before legal issue. Two structural costs: (a) the central server buckles
at national scale ("govt cannot execute — too massive a burden"); (b) the state sees every transaction line
of every business, live — surveillance as a side effect.

**Counter-proposal = our secured-distributed doctrine aimed at the regulator** (1:1 mapping, all already witnessed):

| Clearance model (today) | Local-first counter-proposal | Built as |
|---|---|---|
| Every invoice streamed to central server | Invoice **signed locally**, tamper-evident, non-repudiable | W-SIGN sealed chain |
| Gov validates & stores all line data | Gov = **signature-verifier + audit-sampler** | dumb facilitator (DistributedERP §6) |
| Real-time total disclosure | **Selective disclosure** — prove the legally-required commitment, withhold the rest; *further info-giving is user-controlled* | owner/CAS capability model |
| Trust = the platform saw it | Trust = **deterministic replay on audit-on-demand** | replay-hash == live-hash |
| Books = whatever was submitted | IFRS/MFRS books reconciled locally | accounting-as-reconciler (§8) |

**One-line pitch to government:** *don't be a real-time clearing house for the whole economy — make each
taxpayer a self-custodied, cryptographically-attesting node, and reduce the state's job from "ingest every
invoice" to "verify signatures + sample audits."* Same integrity guarantee, a fraction of the server load,
privacy preserved.

### Positioning
- **Free, demo only.** A demonstrator + **policy counter-proposal**, NOT a certified LHDN filer.
- Complies to **international accounting standards (IFRS/MFRS)** for the books; **advocates** the
  privacy-preserving model to government; makes **no** compliance/certification claim.
- Strategy = build a **ground-swell** that pressures a more consumer-friendly mandate **without compromising
  legal commitment** (the books are correct and provable; only the *disclosure mechanism* is the proposal).

### ⚠ §RESEARCH GATE (NON-INVENT — must be SOURCED + CITED before ANY code)
None of the following may be assumed from memory. Each needs a current, citable source:
- [ ] MyInvois mandate **current state** — phased thresholds (turnover bands), live deadlines, any deferrals.
- [ ] E-Invoice **format & transport** — UBL 2.1 fields, JSON/XML schema, the API/portal submission model.
- [ ] What LHDN legally **accepts as proof of issue** (does the law *mandate* clearance, or is an
      attestation/deferred model legally reachable? — load-bearing for the whole counter-proposal).
- [ ] **PCB** (income-tax withholding) brackets/formulae + relief tables — current year.
- [ ] **EPF (KWSP)** + **SOCSO/EIS** contribution rate tables — current year.
- [ ] Which **IFRS/MFRS** clauses govern invoice recognition / the books we claim to comply with.
- [ ] Data-protection law (PDPA Malaysia) constraints that the privacy claim must satisfy.
> Run via `WebSearch`/deep-research; record each source. Until filled, Pillar 3 stays DESIGN-ONLY.
> **Legal note:** regulatory/tax compliance design should be verified by a qualified professional before
> any claim is made publicly — flag this to the user; do not assert compliance on the project's behalf.

---

## §FOLDER — where it lives (DECIDED + REVISED 2026-06-30)

**ALL work lives in `bim-ootb` ONLY — ZERO work in bim-compiler** (user 2026-06-30: "no work in other repo").
A **peer module**, separate from Viewer / Modeller / ERP / Teams — NOT a sub-folder of any. Built directly in
bim-ootb (no compiler-first scaffold-then-port step), mirroring the `teams` overlay convention.

| Repo | Folder | Sits beside | Notes |
|---|---|---|---|
| **bim-ootb** (the ONLY repo for HR) | **`hr_bim_asset/`** (top-level module) | `viewer/`, modeller, `teams/`, erp | isolated worktree `/tmp/wt-hr` branch `lane/hr-overlay` off origin/main; spec lives in `bim-ootb/prompts/`; own SW scope (never touch shared `sw.js`); no icon wired until told |
| ~~bim-compiler~~ | — | — | **NONE.** No `build/hr/`, no witnesses, no seed. Superseded. |

- **Name = `HR_BIM_Asset`** (user 2026-06-30: "no longer Payroll"). Payroll is just RUN **profile #1** of the
  generic engine (payroll · tenancy · strata · maintenance). The module = HR + BIM + Asset operate-phase fusion.
- **Own seed, independent** — `hr_seed.db` built from SQL, gitignored, its OWN stamped copy per
  [[feedback_modeller_gh_vs_viewer_oci_data]] (Viewer=OCI stream, Modeller=GH-pages, ERP=ad_full → HBA is a
  **fourth independent seed**; never shared).
- **Dotted lines only** — GL-post + `isEmployee` adapters light up *only when ERP is also loaded*; HR boots
  and runs a full cycle with zero ERP/`ad_full`/other suite present.

---

## §OPS — friction-avoidance (DECIDED 2026-06-30; architect is NOT a git admin)

Studied the repo's 20 documented git/deploy landmines (Explore sweep, 2026-06-30). HR is architected so
THREE of the four friction clusters **cannot arm** — and the rest is git hygiene the assistant runs
silently. The architect sees ZERO admin work.

| Cluster | Landmines | HR choice → eliminated |
|---|---|---|
| **OCI deploy** (MIME `--content-type`, no Cache-Control `?v=`, edge-cache rename, bucket mix-up, blind overwrite, stale snapshot) | #10–#17 | **GitHub Pages, NEVER OCI.** Seed is small sql.js (modeller/teams profile), not a streamed building DB → no OCI need. MIME inferred, deploy = `git push`, no flags/bumps/bucket-SOP. Whole cluster N/A. |
| **Shared-tree git** (branch-hop dirty, edit `~/bim-ootb`, stale-checkout-as-canon) | #6,#7,#8 | **Own worktree `/tmp/wt-hr` off fresh `origin/main`, branch `lane/hr-overlay`** (teams/redpill template). Never touch shared checkout (hook-blocked). |
| **`sw.js` conflict magnet** | #4 | **Own sw scope (or none v1); NEVER edit the shared `sw.js`.** Additive peer module = no shared-line conflict. |
| **LFS / large files** | #18,#19,#20 | **Seed-from-SQL, not blobs.** `hr_seed.db` gitignored + built from `migration/hr_*.sql` (source of truth); never LFS; scoped `git add`, never `git add -A`. |
| **Docs wipe** | #1 | HR doc pages (if any) ONLY via `scripts/safe_gh_deploy.sh` (W-DEPLOY-GUARD). Never bare `mkdocs gh-deploy`. |
| **Universal git hygiene** | #2,#3,#5 | **Assistant handles SILENTLY:** one-PR-one-push → verify landed on `origin/main` → fresh branch after any squash-merge; never leave committed-but-unpushed; `git diff --stat` before staging. Never surfaced to the architect. |

**Result:** HR is the cleanest-deploying module in the repo — `git push` to a GH-Pages module, no OCI, no
MIME flags, no cache bumps, no bucket/snapshot/rollback dance. See [[feedback_lane_git_handle_silently]].

---

## §STANDALONE + DOTTED LINES (the integration contract)
- Ships its **own `hr_seed.db`** (employees, elements, statutory tables, pay runs) + its **own 5-table
  instance** → boots and runs a full cycle with **zero ERP / zero `ad_full` / zero other suite loaded**.
- When ERP *is* present, two **adapters** (not hard deps) light up: (1) payroll/e-invoice journal ops →
  shared `fact_acct`/GL; (2) HR employees ↔ `C_BPartner WHERE isEmployee='Y'` (one identity). The app
  never *requires* them.

---

## §TARGET — small long-tail DIY users, with ability to scale

**Who:** the long tail the giants **can't profitably serve** — solo operators, small contractors doing
their own labor payroll, SME owners priced out of consultants and enterprise HCM. This is the ERP
long-tail doctrine (§0.19 dormant/self-activating; §13 shard-by-gravity) pointed at HR. Canonical first
user = a **small builder** doing their own site check-in + labor payroll, in the browser, offline, free
(the deskless-construction cut and the DIY long-tail cut on the same person).

**Why the framework is built for DIY-small (removes every long-tail barrier):**
| DIY barrier | Removed by |
|---|---|
| setup / IT / server | zero-install PWA — open a browser |
| consultant to configure | batteries-included presets (§0.9) + Excel-authored decision tables (§0.5) — owner edits own rules, no code |
| "why is my pay this?" | glass-box payslip explains itself |
| unjustifiable subscription | free demo (CONTOH/SAMPLE watermark) |
| poor/no connectivity | offline-true |
| privacy fear of a tiny vendor | never leaves the device |

**Scale = the SAME engine, nothing to migrate (gravitational, on existing rails):**
- 1→N employees = same `PAYRUN` doc, more lines
- 1→N sites/floors = `containers` (Site→Building→Floor) already recursive (§0.1)
- 1→multi-entity/group = more containers + journals, same shape
- solo device→team/distributed = op-log sync via the dumb facilitator (DistributedERP §6); shard by
  gravity as the log grows (§13 — op-log mass = the LOD metric)
- dormant cells self-activate (§0.19) — solo touches Payroll+Leave; T&A/access/multi-site light up *as
  they grow*, nothing to install, nothing to re-platform

**Positioning line:** *start as a solo, scale to a site, scale to a group — same tab, same op-log, nothing
to migrate.* The giants make you buy big and shrink to fit; we start at zero and grow without a replatform.

---

## §MARKET TRIAGE — fit vs the field, and where we set a *higher* standard

**Strategic cut:** own the **deskless / frontline / edge** workforce (construction first — home turf),
NOT enterprise desk-HCM. Desk-HCM (Workday/SuccessFactors/BambooHR/Personio) is cloud-collaborative,
content-heavy, integration-rich — we'd be a worse clone. Deskless (~80% of the global workforce;
incumbents Deputy/Connecteam/When-I-Work) is underserved AND still cloud-dependent, no cryptographic
integrity, no spatial model — exactly our framework's gap to fill.

**Triage (HR capability × framework fit × our better-standard angle × tier):**

| Capability | Archetype | Fit | Better standard | Tier |
|---|---|---|---|---|
| Payroll | ADP/Gusto/Talenox | ★★★★★ | glass-box trace + private + deterministic re-run | **T1 flagship** |
| Time & Attendance | Deputy/Connecteam | ★★★★★ | offline + signed non-repudiable + spatial | **T1 moat** |
| Leave/Absence | every HRIS | ★★★★ | accrual=op, balance=replay, feeds payroll | **T1** |
| Compliance/e-Sign (cert/permit/safety/ack) | DocuSign+LMS | ★★★★ | signed chain tamper-evident; construction safety | **T1** |
| People analytics | Workday/Visier | ★★★★ | free from op-log, temporal axis snapshots lack | **T1** |
| Core HR / employee master | BambooHR | ★★★ | table-stakes spine, no decisive edge | T2 |
| Onboarding/offboarding | Rippling | ★★★ | task-docs + signed steps | T2 |
| Compensation planning | Workday | ★★★ | comp-data privacy, enterprise-y | T2 |
| Expense claims | Concur | ★★★ | reuses POS/GL (`S_TimeExpense`→GL mapped) | T2 |
| Recruitment/ATS | Greenhouse/Deel | ★☆ | external multi-party, cloud-collaborative | **T3 don't** |
| Learning/LMS | Cornerstone | ★☆ | content delivery, not our strength | **T3 don't** |
| Benefits marketplace | Rippling/Gusto | ★☆ | carrier integrations, server-side | **T3 don't** |
| Performance/360/engagement | Lattice/CultureAmp | ★★ | collaborative/subjective, low determinism (anon-survey = possible novel privacy take, park) | **T3 defer** |

**Flagship = T1 only:** Payroll + T&A + Leave + Compliance-sign + Analytics — all offline, all private,
deskless/construction-positioned. T2 = opportunistic spine. **T3 = explicit anti-scope** (building it makes
us a worse Rippling and dilutes the moat).

**The 8 better-standard levers (cross-cutting, *why* T1 beats incumbents):** (1) explainability/glass-box,
(2) privacy-by-architecture, (3) offline-true, (4) cryptographic integrity, (5) deterministic replay,
(6) spatial fusion, (7) safely-editable rules (decision-table+dry-run), (8) analytics-for-free (op-log,
temporal). Levers **4/5/6 + the privacy half of 2** are ones cloud incumbents **structurally cannot match**
without abandoning their server model — that is where "better standard," not "parity," lives.

> Vendor references are stable archetypes (positioning, not current feature claims). **Current-feature /
> pricing specifics are a research item** (non-invent) — verify before any public comparison is published.

---

## §PILLAR 4 — Tenancy management (the kernel, a third time) — MODEL DEFINED 2026-06-30

User insight: with BIM (the model) + HR (party/recurring/signed-edge) + ERP (AR money cycle), **tenancy
falls out of reuse, not new build.** It overlaps ERP's payment-order cycle (rent = AR/O2C) and extends HR.

**Convergence:** BIM supplies the **leasable unit**; HR supplies **party + recurring-run + signed-edge**;
ERP supplies the **money cycle**.

**Model (reuse existing primitives, invent nothing):**
| Entity | = existing primitive | Notes |
|---|---|---|
| Unit (leasable) | BIM `container` (Site→Building→Floor→Unit) | carries real area/floor/location — the WHERE |
| Tenant / Landlord | party = `C_BPartner` (`isTenant`, mirror of `isEmployee`) | HR's party machinery |
| Lease | `documents` row (`doc_type=LEASE`), `draft→sign→active→renew/terminate` | term `[start,end]`, rent, deposit, escalation; **signed** (W-SIGN) = contract-as-event |
| Rent Run | **the payroll engine inverted** — `RENTRUN` doc, 1 invoice-line per *active* lease | same deterministic decision-table engine; cash-IN not cash-OUT |
| Money cycle | ERP **AR** — `C_Invoice(ARI)→C_Payment(ARR)→allocation→journal` | the GL dotted line extends to full AR |
| Access / occupancy | HR signed mobile-edge | tenant check-in/door to leased unit, spatially scoped to the BIM container |

**Keystone — Payroll and Rent are ONE engine:** a generic *periodic RUN* `(period × parties × element-rules)
→ signed lines → GL post`, direction-agnostic (cash-OUT=payroll, cash-IN/AR=rent). The engine is built ONCE
(`hr/engine.js` `runPeriod` + profiles); payroll = profile #1, tenancy = profile #2. The ONLY new concept
tenancy adds = **lease term + escalation + occupancy** (a decision-table over the lease; payroll has none).

**Moat:** lease the ACTUAL geometry — rent/m², vacancy-by-floor, occupancy heatmaps off the op-log + model.
Yardi/AppFolio/Buildium treat a unit as a DB row; nobody else has the building.

**Folder:** likely a peer `tenancy/` module reusing `hr/engine.js` (the shared RUN core) — decide when built;
the engine stays profile-generic so neither app forks it.

### §SPATIAL-VIEW (user 2026-06-30) — tenancy as an overlay on the model
Commercial OR residential: render the BIM model and **color each unit by lease status** (occupied / vacant /
expiring), rent, or tenant — the same overlay mechanism the viewer/Outliner already uses for disciplines/clash.
Vacancy-by-floor, rent/m², occupancy heatmaps lit on the ACTUAL geometry. This is the moat made visible —
Yardi/AppFolio have a row, not a model.

### §7D (user 2026-06-30) — the OPERATE phase = a true 7D BIM
Closes the dimension ladder: 3D model · 4D time · 5D cost (via BOM) → **7D = operate/facilities/lifecycle.**
- **Asset PM = RUN profile #3** — `period × assets × task-rules → signed work orders → GL` (same periodic
  engine as payroll #1 / rent #2). An **asset = a BIM element** (the MEP/equipment `disc_walker` already places).
- **Security maintenance** = the signed mobile-edge over spatial zones (who-may-enter = a signed capability) +
  security systems maintained as assets (a PM run).
- **The operate phase = periodic-RUN engine + signed-edge + spatial overlay**, all on ONE op-log + ONE model.
  → The generic RUN now serves THREE profiles: **payroll · tenancy · maintenance** (cash-out / cash-in / cost).
  The spatial view is the 7D cockpit that renders tenancy / maintenance-due / access overlays on one building.

### §ALPHA-MODELS (user 2026-06-30) — define the AD models, seed SINGULAR records, demo the feature
Directive: don't full-build — define each as a **new AD-defined model** with at least ONE record so we can
DEMO (alpha) "we have this." Delights BIM users (their model becomes the FM cockpit). Models:
- **Tenancy** (`HR_Lease`) — unit(bim_guid) · tenant · rent · term · deposit
- **Property Management** (`PM_Property`) — building(guid) · units · manager
- **Strata Title / Ownership** (`PM_Strata_Parcel`) — parcel · owner · share_units · maint_fee · sinking_fund
  → **RUN profile #4 `strata`** (charge OWNERS, cash-IN; sibling of tenancy)
- **Asset / Equipment** (`PM_Asset`) — **`bim_guid` ↔ `iot_device`** link · category · pm_cycle → the **7D Viewer
  overlay** seam (devices/IoT/equipment rendered on the model; live telemetry later).
All records carry the CONTOH/SAMPLE watermark (alpha). AD-shaped so they compile into the ERP AD when present
(dotted line), but seed standalone. RUN engine now serves **payroll · tenancy · strata · maintenance**.

---

## §CROSS-APP — HR_BIM_Asset threads Viewer + ERP + HR over BIM (user 2026-06-30)

HR_BIM_Asset is NOT one app — it is a **thin spine that cuts through three apps**, each contributing one facet
over the shared BIM model + signed op-log. A **tenancy** is the worked example that exercises all three:

| App | Contributes | Entities / connector dotted-line |
|---|---|---|
| **Viewer** (building — NOW) | the **SPATIAL view** — unit on the model · occupancy lens (2-head flaticon, blue active-band, word-on-hover) · storey **population-density dots** · click→zoom→**human dummy**→IFC-style popup · IoT/asset overlay | the WHERE rendered; reuses `navigate_engine` zoom+popup, `panels.js` `A.icon` |
| **ERP** | the **DEAL + MONEY** — Tenancy **agreement** (lease `documents` row) · **product** = rental / purchase / unit-type / **parking** (`M_Product` catalog; deal-type rental vs purchase) · **accounting** (AR: `C_Invoice→C_Payment→allocation→GL`) | `doc_poster` GL · `M_Product` · `C_Invoice/C_Payment` |
| **HR** | the **PEOPLE + ACCESS** — tenant **details** (party = `C_BPartner`) · **clock in/out** (attendance, signed-edge) · **security card** (access = signed capability over the unit's spatial zone) | `C_BPartner` · `kernel_ops` signed check-in · W-SIGN access token |

**BIM** underneath = the unit/space/asset geometry. The **signed op-log is the shared spine** all three write
to. ONE lease threads all three: the unit *(Viewer/BIM)* ← agreement + product + AR *(ERP)* ← tenant + access +
attendance *(HR)*. Each app stays its OWN module (§FOLDER); HBA is the thin spine that **references** each via the
connector dotted-lines — it does NOT absorb them.

**Build order:** Viewer spatial slice NOW (alpha, this commit); ERP agreement/product/AR and HR
details/attendance/access wire in when those dotted lines go live (swap the relevant connector stubs).

**Product Dashboard — installments (user 2026-06-30):** for products *purchased* on payment terms, the product
table's **Dashboard graph view** plots the **installment schedule** (paid vs outstanding over time). Reuses ERP
§0.7 self-graphing + `C_OrderPaySchedule`/`C_InvoicePaySchedule` (already mapped to `document_lines`) — a graph,
not a new engine. So: **rental → periodic RUN · purchase → installment plan**, both off the same op-log.

---

## §BINDING — how tenancy data maps to the model + gets injected (user 2026-06-30)

Q: does the blue band come on "when tenancy detected", and how do we inject/map the data like Items↔ProjectOrder?

**Activation (two states):** the Tenancy lens **icon appears only when ≥1 lease binds to a guid in THIS building**
(the join hits) = "detected"; no data → no icon (no clutter). The **blue band = the user toggling the lens ON**.
Detection gates the icon; the band is the on-state.

**Mapping key = `guid` — identical to Items↔ProjectOrder:**
- A lease carries `unit_guid` = the **IfcSpace (room) guid** — the SAME `e.room` handle the Outliner already
  derives from `rel_contained_in_space` (`viewer/bom_tree.js`). No IfcSpace → bind to the unit-container/storey
  guid (honest floor-level fallback).
- The viewer **already exposes `APP.guidMap`** — but it is keyed **`meshId→guid`** (the GUIDS ARE THE VALUES;
  instanced meshes carry a `_N` slot suffix on the key — verified against `viewer/streaming.js` +
  `ghostglass.js`/`picking.js`, 2026-06-30; the earlier "guid→mesh" here was inverted). So the `MeshPort` real
  impl is a VALUE reverse-lookup: `lease.unit_guid → scan guidMap values → meshId → tint/dummy`. Built as
  `binding.meshIdForGuid` / `Connectors.resolveGuid(guid, APP.guidMap)` (W-HBA-BIND B8/B9). Nothing new to render-plumb.

**Injection = the bim_orders_overlay delta-band pattern (reuse, don't reinvent):** `erp/bim_orders_overlay.js`
binds ERP docs to BIM via a **high-PK band (`≥ BIM_BASE`)** in a separate db (`bim_project_orders.db`), overlaid
onto the live `ad_seed.db` at boot (authoritative clear-then-insert; base never stale). HBA does the SAME — tenancy/
asset records (HR_Lease/PM_*) sit in an **HBA band**, overlaid at boot so leases surface in the standard AD windows
AND drive the lens. Standalone (no ERP): the lens reads the HBA seed directly. A lease = another bridge doc keyed
by the unit guid.

**NON-INVENT:** a demo lease must reference a **real IfcSpace guid** from the building → the join hits, the unit
lights up; a non-matching guid makes the lens **honestly show un-linked** (never fabricates a binding).
Detection = the join hits. Connector REAL seams: `resolveGuid → APP.guidMap` · `injectData → bim_orders_overlay
band-overlay` · `persist → OPFS HBA db`.

---

## §NEXT (spec-first order)
1. Spec the `PAYRUN` doc lifecycle + element-rule decision-table shape (Pillar 1) — witness the
   glass-box payslip trace + deterministic re-run (`replay-hash`).
2. Spec the signed-edge op envelope (check-in/access/sign) reusing W-SIGN/CAS (Pillar 2).
3. **Run the §RESEARCH GATE** (Pillar 3) — source every regulatory fact, THEN spec the attestation/selective-disclosure proof.
4. Free-demo packaging + groundswell positioning page (after 1–3 have witnesses).

Companion: `docs/ERP.md §0.3` (product-scope decision — add a pointer here when this leaves design-only).
Doctrine: DistributedERP.md §6 (dumb facilitator), §8 (accounting-as-reconciler), §0.20 (secured axis / W-SIGN).
