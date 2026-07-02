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

## ▶ SESSION CLOSEOUT 2026-07-02b — §P10a + §P10b DONE — NEW SESSION START HERE

**This session shipped BOTH §P10a (UX/data-model triage) and §P10b (IoT/CCTV/ERP-link/draggable) in full** —
see the two spec sections above for the design; below is what's ACTUALLY BUILT + WITNESSED (`bim-ootb`
`lane/hr-overlay`, worktree `/tmp/wt-hr`). **33 witness files, GREEN, zero regression** (full suite re-run
after every change). Live chromium smoke (`cdp_shot.js` against the extended `demo/fm_panel.html`): 8/8 lenses
available, `§SMOKE after-occ-click drawer-present=true | presence-drawer=true | tenancy-pane=true | iot-pane=true
| search-results=1 | jsErrors=0` — screenshot confirms the IoT/CCTV pane + Presence roster render.

**§P10a shipped:**
1. **Rename** — pill + drawer header → **"Human-Asset"** (`panels.js:1159`, `hba_lens.js`). Internal id `hbaFM`
   unchanged (witness stability).
2. **Deliberate close** — `openFamilyDrawer` refactored to a persistent container + `_renderRows`/`_clear`
   inner rebuild; a row click activates+re-renders IN PLACE (drawer never removed by it); an explicit **✕**
   button (or re-tapping the pill) is the only close.
3. **AD_User primary identity** — `models.js` `MODELS.Official` (9 records: EMP001/EMP002 with REAL
   `c_bpartner_id` 1001/1002 from `ad_payroll.js`; BP-TEN-1/5/6 + EMP-1..EMP-4 with `c_bpartner_id:null` — no
   real BPartner backs them, honest gap) + `ad_tenancy.toUserRow`. `models.officialByName(code)` — honest
   `null` on miss, never fabricated.
4. **`ad_tenancy.compileBuilding(buildingName, rooms, leases, strata)`** — the whole-building AD compile
   (Warehouse/Locator/Product/Subscription), skip-non-room honesty, derived `units`.
5. **`viewer/hba_tenancy.js`** (NEW pane) — party resolves through `Official` (name+phone, not a bare code);
   row click → `flyToZone` (the "Find↔FM link"). FAMILY 7→8 (`tenancy` pane entry).
6. **Presence roster** — `openPresenceDrawer` (session list via `attendance.sessions`, name resolved via
   `Official`, honest bare-code miss on overflow identities); row click → `flyToZone`.
7. **Smart search** — top `<input>` in the drawer, Room name/storey (`A._hbaRooms`) + `Official` name/phone/
   email; honest "No match." — explicitly redundant with Find's own (private, unexported) index.
8. **`flyToZone(A, guid)`** — ONE shared camera fly-to primitive (Tenancy pane + Presence roster + search all
   route through it); returns `{flew, guid, center}` synchronously (witnessable without a real THREE/camera),
   performs the real browser lerp when `camera`/`controls`/`THREE` are present.

**§P10b shipped (mid-session user request — sensor mockup + CCTV mockup + ERP billing + draggable panels):**
1. **`hr_bim_asset/iot.js`** (NEW engine) — 6 sensors (temp/boiler pressure/sound/dust/solar/electrical),
   DETERMINISTIC 24h synthetic series (sin curve + fixed offset table, never `Math.random`/`Date.now`); compiles
   onto REAL `c_order`/`c_orderline`/`c_uom` columns (verified `ad_full.db` PRAGMA — see §P10b-CHECK); new
   `C_UOM` rows created on demand for the missing physical units (°C/bar/dB/µg/m³/W/m²/kWh), same precedent as
   `ad_tenancy.js`'s `toWarehouseRow`.
2. **`viewer/hba_iot.js`** (NEW pane) — opens as a SUPPLEMENT to the existing `maintenance` tint lens (same
   dual-action pattern as Presence): 6 Chart.js sensor charts, a 2×3 CCTV MOCKUP grid (canvas scanline +
   "MOCK FEED" caption, **no invented video/GIF, no external URL fetch**), the ERP billing table
   (`iot.billingLines()`).
3. **`viewer/hba_draggable.js`** (NEW shared utility) — `HbaDraggable.enable(pane, handle)`, pointer-event
   drag-follow clamped to the viewport; retrofit into ALL 5 panes (`hba_dashboard.js`, `hba_payslip.js`,
   `hba_leave.js`, `hba_tenancy.js`, `hba_iot.js`) — one line added to each `mount()`.

**Witnesses (NEW):** `witness_p10a.js` (24/24 — AD_User/compileBuilding/rename/close/roster/search),
`witness_tenancy_pane.js` (10/10), `witness_p10b.js` (22/22 — iot engine/pane/draggable). **Updated:**
`witness_family.js` (F1/F7 → FAMILY 8 entries, tenancy re-added as a PANE not a lens — de-conflate still holds
at the lens layer). Demo: `demo/fm_panel.html` extended with a real asset guid + tenancy spec (all 8 lenses now
demo-available, was 7 max before). `viewer.html` gained 5 script tags (`ad_tenancy.js`, `iot.js`,
`hba_draggable.js`, `hba_tenancy.js`, `hba_iot.js`); `hba_lens.js` cache-bumped `?v=3`→`?v=4`.

**Not yet done (flag, don't silently drop):** live Playwright/deploy smoke of the drag mechanics in the REAL
in-app viewer (witnessed here via `cdp_shot.js` against the standalone demo page + a stub-DOM node witness for
the pointer math, not the full 3D viewer); the Tenancy/IoT/Presence panes all default-mount at the SAME
`top:54px;right:12px` anchor so opening several at once stacks them (exactly what dragging is for — not a bug,
but worth a smarter default cascade-offset if this becomes a real workflow, not just a POC).

**What shipped (the whole §CRITICAL "Compile not Model" arc, closed end-to-end this session):**
`ad_payroll.js` (payroll → `hr_process`/`hr_movement`/`hr_concept*` + leave-seam) · `occupancy.js`
`toResourceAssignmentRow()` (→ `s_resourceassignment`) · `models.js` `toAssetRow()` (→ `a_asset`) ·
`ad_tenancy.js` (Tenancy+Strata → `M_Warehouse`/`M_Locator`/`M_Product`/`C_Subscription`, WMS-address corrected).
Full detail in `§CRITICAL` below — read it before touching any of these files again.

**P7 ✅ DONE 2026-07-02 (`viewer/hba_payslip.js`, `W-HBA-PAYSLIP 9/9`).** The payslip UI pane, mirroring
`hba_dashboard.js`'s additive/host-injected/mount-unmount pattern: employee picker + gross/net KPIs + per-concept
line trace, watermarked — renders `ad_payroll.js`'s already-witnessed `payslip()` reader, no new schema. Added
`ad_payroll.demoSpec()` (the SAME EMP001/EMP002 baseline already accepted by `witness_ad_payroll.js` AD1, reused
not reinvented) seeded in `hba_lens.js bindStoreysFromModel` alongside occupancy/attendance/request — payroll has
no spatial guid to resolve (unlike Occupancy/Asset), so it seeds unconditionally once a building has rooms.
FAMILY grew 5→6 entries (`witness_family.js` F1/F7 updated); pane routing generalized to an id→global registry
(`dash`/`payslip`) instead of one hardcoded pane name. **Live chromium smoke** (`cdp_shot.js` against
`hr_bim_asset/demo/fm_panel.html`): FM drawer → Payslip pane → employee reselect (real click path), `§HBA_PAYSLIP`
log matches the rendered numbers (EMP001 net=4234, EMP002 net=2870), 0 console errors, screenshot confirms both
watermarks + the FM pill highlighted. `viewer.html` gained 3 script tags: `rules.js` (was missing entirely —
`ad_payroll.js` needs it), `ad_payroll.js`, `hba_payslip.js`.

**P8 ✅ DONE 2026-07-02 (`viewer/hba_leave.js`, `W-HBA-LEAVE-PANE 11/11`).** The Leave UI pane, same pattern as
P7 — employee picker + taken/unpaid/per-type-balance KPIs + chain-integrity line + per-entry paid/unpaid
statement, watermarked — renders `leave.js`'s already-witnessed `summary()` reader (balance = REPLAY, never a
stored number), no new schema. Added `leave.demoLog(emp)` (the SAME accrue/take schedule already accepted by
`witness_leave.js` L0-L9, reused per-employee). FAMILY grew 6→7 entries. **Live chromium smoke**: FM drawer →
Leave pane → employee reselect, `§HBA_LEAVE_PANE` log matches the rendered statement (unpaid=4, annual
balance=-3, chain verifies), 0 console errors.

**PM_Property↔M_Warehouse check ✅ DONE 2026-07-02 (`ad_tenancy.js` `propertyUnits`, `W-HBA-AD-TENANCY` 12→15/15).**
`PM_Property` is COVERED by the Building=M_Warehouse mapping already established (`toWarehouseRow`, AD-TEN0) —
no separate table. `units` → derive via `propertyUnits(warehouseId, locatorRows)` (COUNT the real M_Locator rows,
never a stored duplicate). `manager` → a **genuine native gap** (grepped every table in `ad_full.db`, no
manager-shaped column exists anywhere) — the nearest native mechanism is an access-control chain
(`ad_user.c_bpartner_id` → `ad_user_orgaccess(ad_user_id,ad_org_id)` → `m_warehouse.ad_org_id`), which is a role
assignment, not a "who manages this building" business fact — flagged (AD-TEN6), not built (no live engine needs
it). `models.js`'s `PropertyManagement` demo record kept unchanged (alpha-existence proof, same as Strata's).

**What's still open:**
1. **⛔ BLOCKED (needs a design decision, not a fact) — Find↔FM linking.** The doc that introduces this
   (`docs/HRBIMAssetGuide.md` §Future roadmap addendum, bim-compiler repo) explicitly frames it as *"two
   directions under consideration, **not yet built**"* — extending the Viewer's Find search index to cover
   HR_BIM_Asset records (tenant name/lease number/ticket ID) and deep-linking a search hit into the FM drawer
   pre-scoped to that record. This is NOT a same-shape additive-pane task like P7/P8: it touches Find's search
   index (a shared, non-HBA-owned surface), not just an HBA-additive file. Per the Spec-First rule, this needs
   a written spec (what does Find index, what does "deep-link into FM" mean operationally, does it apply to a
   single building or the multi-building portfolio note in the same addendum) BEFORE any implementation —
   **the one question:** does the user want that spec written now, or is this genuinely a "someday" roadmap
   note to leave alone until asked? Not started, correctly not attempted without that answer.
2. **P9 — §RESEARCH GATE.** Still explicitly paused (user 2026-07-02) — do not start without being asked.
3. **The Building/Warehouse/Locator/Subscription model is SPECCED, not yet seeded into a live pane or `ad_full.db`
   itself** — `ad_tenancy.js`'s compile functions are witnessed in isolation (pure row-shape proofs); nothing
   writes them into a real sqlite db or wires a viewer pane yet. That's the natural next build step if this
   pillar continues.

## ▶ §P10 SPEC — Tenancy AD-compile pane + Find↔FM spatial link (2026-07-02, user GO)

User re-scoped the two opens in one breath: *"Find to FM small matter — just a link"* (deep spec ceremony
retired; it's a wiring slice) + *"yes check the WMS usage in 1. Building map to warehouse ABL, 3. and 4"*
(verify the native semantics BEFORE seeding live). Spec-first, this section gates the implementation.

### §P10-CHECK — WMS usage verified vs REAL iDempiere (falsifiable; re-run these if in doubt)
Sources: `~/idempiere-dev-setup/idempiere` `org.compiere.model/{X_M_Locator,MLocator,X_M_Product}.java` +
`build/erp/ad_full.db` PRAGMA/rows. Findings:
1. **Building→M_Warehouse + ABL ✓.** `X_M_Locator` documents X="Aisle (X)", Y="Bin (Y)", Z="Level" — free-text
   dimension addresses. Aisle→block/wing, Level→storey is the native idiom. **CORRECTION adopted:** native
   locators default UNUSED dimensions to `'0'` (`MLocator` constructor `setXYZ("0","0","0")`; every real GW row
   shows `'0'`) — `toLocatorRow` emitted `null`/absent; now emits `'0'` + `isdefault:'N'` (a room locator is
   never the warehouse default). ⚠ `MLocator.get()` COALESCES by (warehouse,X,Y,Z) — two rooms on one storey
   share an ABL address, so locator identity must ride on `value`=guid (it does); never create via the
   combination-lookup. Witness AD-TEN1 updated to assert the SOURCED `'0'` default (supersedes the old
   "honestly null" reading — same non-invent intent, now aligned to what the native engine itself writes).
2. **unit→M_Product.m_locator_id ✓ unchanged.** Plain "Warehouse Locator" default-storage pointer, zero engine
   logic in MProduct — a fixed unit "stored at" its room is semantically exact.
3. **lease/strata→C_Subscription ✓ schema-exact, engine-DORMANT in core iDempiere.** Only generated `X_/I_`
   classes exist — NO process advances `paiduntildate`/`isdue` or writes `C_Subscription_Delivery`. Our
   `paiduntildate=null` honest gap IS the native reality; `C_Subscription_Delivery` is the natural child table
   if recurrence is ever animated.

### §P10-BUILD (P7/P8 additive pattern, all edits in /tmp/wt-hr on lane/hr-overlay)
1. **Engine** `ad_tenancy.js` (additive): apply the `'0'`/`isdefault` correction; new
   `compileBuilding(buildingName, rooms, leases, strata)` → `{warehouse, locators, products, subscriptions,
   skipped, units, _watermark}`. Per room → locator+product; lease→subscription(MONTHLY_RENT, party=tenant);
   strata→subscription(QUARTERLY_STRATA_FEE, party=owner); a record whose `unit_guid` is NOT a real room is
   SKIPPED into `skipped[]` (never fabricate a locator); `units` DERIVED via `propertyUnits`. Subscriptions
   wrapped `{row, unit_guid, kind, storey}` — the AD row stays column-pure; the wrapper is VIEW trace.
2. **Seed** `hba_lens.js bindStoreysFromModel` (same gate as P7/P8): `A._hbaTenancySpec = compileBuilding(...)`
   from the REAL room set + `models.js` Tenancy/Strata records; `§HBA_TEN` log.
3. **Pane** `viewer/hba_tenancy.js` (`HBATenancyPane`, mirrors `hba_leave.js`): watermark; KPI chips
   (Warehouse · Units-derived · Leases · Strata); per-subscription rows (ref · party · unit+storey · cadence ·
   start→renewal · paid-until honest "—"); skipped-count footer when non-empty.
4. **§FIND-FM-LINK (the "just a link"):** each row click → fly the camera to the unit's room centroid —
   centroid via the avatars idiom (`zoneMeshGuids`+`guidTargets` over `A.guidMap`+`_hbaRoomMembers`), flight
   via the `navigate_find` idiom (direction-preserving ease lerp of `camera.position`+`controls.target`).
   `§HBA_TEN_LINK guid=… center=(…)` log; honest no-op (logged) when the room has no rendered members.
5. **FAMILY 7→8**: `{kind:'pane', id:'tenancy', label:'Tenancy / AD'}` + `PANE_GLOBALS.tenancy`; drawer icon
   self-contained. `viewer.html` gains `ad_tenancy.js` + `hba_tenancy.js` script tags.
6. **Witnesses:** `witness_ad_tenancy.js` AD-TEN1 updated ('0' default) + AD-TEN7 (compileBuilding: counts,
   derived units, skip-non-room, both types, watermark, column-pure rows); NEW `witness_tenancy_pane.js`
   (W-HBA-TEN-PANE: off=no-DOM, data-gate, mount KPIs match compile, row click captures the fly target ≈ stub
   centroid, unmount zero-residue, watermark); `witness_family.js` 7→8 entries. Live chromium smoke
   (`cdp_shot.js` HHS): FM drawer → Tenancy → row click → camera moves, `§HBA_TEN_LINK`, jsErrors=0, shot.

---

## ▶ §P10a — UX/data-model triage (user 2026-07-02, post-first-use feedback), folded into §P10-BUILD

User tried the drawer live and filed 3 findings + a design brief ("triage as a system designer, suggest more
elegant presentation + data modelling"). Resolved by dialogue, then re-confirmed point-by-point. This section
supersedes the plain version of §P10-BUILD above — build the ENRICHED version below, not the bare one.

**1. Naming — "Human-Asset".** The pill already showed a decent label (`FM / Operate`, `panels.js:1159`) but
its icon is literally named `fmCockpit` — a stray, unpromoted name. User's replacement: **"Human-Asset"**
(captures People+Asset in one phrase, matches the module's own name `hr_bim_asset/`). Change the DISPLAY text
only — pill `name:` (`panels.js:1159`) and drawer header (`hba_lens.js:354`). Keep the internal id `hbaFM` and
all function/global names unchanged (29 witness files + `demo/fm_panel.html` reference them) — renaming those
is a mechanical, unrelated-risk refactor the user didn't ask for.

**2. Close = deliberate ✕ only.** Bug, not a preference: `hba_lens.js:373` currently does
`activateLens(A, e); d.remove();` on EVERY row click — selecting a lens always kills the drawer as a side
effect. Fix: row click activates the lens/pane and RE-RENDERS the row list in place (updated highlight/●on
badges) — the drawer element itself is never removed by a row click. Add one explicit **✕** button in the
header; it (and re-tapping the pill, which already toggles via `familyActive()`) are the only two ways to
close. `openFamilyDrawer` is refactored into a persistent-container + `_renderRows()` inner function so a
row click can refresh without a remove/recreate flicker.

**3. AD_User is the primary identity; C_BPartner only for HR/Payroll; scope = spatial only, not ERP financials.**
Verified against `build/erp/ad_full.db PRAGMA table_info(ad_user)`: the REAL native `ad_user` table already
carries `name`/`email`/`phone`/`phone2` AND an optional (nullable) `c_bpartner_id` — so "AD_User with or without
a BPartner link" is not a workaround, it's the native shape. Decision:
- New `MODELS.Official` (`models.js`, table `AD_User`) — one row per person the FAMILY drawer needs to name:
  the 2 payroll employees (`EMP001`/`EMP002`) and the 3 demo tenants (`BP-TEN-1/5/6`). Fields: `ad_user_id`,
  `name`, `email`, `phone`, `c_bpartner_id`. **`c_bpartner_id` populated ONLY where a real link already exists
  in this codebase** — `ad_payroll.js`'s `EMP001→1001`/`EMP002→1002` (HR/Payroll IS involved) — and left `null`
  for the tenant rows (no real `C_BPartner` row backs a bare `BP-TEN-*` label in this demo set; forcing one
  would be invention — same discipline already applied to `PropertyManagement.manager`, AD-TEN6). Compiles via
  a new `ad_tenancy.toUserRow(person)` → the literal native `ad_user` shape.
- **Scope wall (the "avoid clutter/redundancy" ask):** every Viewer-side HBA surface (lenses + panes) shows
  ONLY data that resolves to a spatial element in THIS building — occupant identity for a room, asset location,
  a lease's unit+party+cadence. It does **not** attempt portfolio-wide financial rollups (aggregate rent
  roll across buildings, GL postings, invoice aging) — those belong on a **separate ERP-side Dashboard**
  (out of scope for this Viewer work; noted as a FUTURE surface, not built here, not invented a shape for here).
  This is a scope boundary, not a feature to build now.

**4. Presence → a side drawer of persons, click-to-zoom.** Today "Presence" only tints room density (a color,
no names). New: clicking the Presence row ALSO opens a second small drawer beside the FM drawer, listing every
`attendance.sessions(log)` entry for the current period (person via `MODELS.Official` lookup by name-match on
the attendance `employee` id — e.g. `EMP001`; zone = room name/storey) with in/out time; row click flies the
camera to that person's zone. Reuses the SAME fly-to primitive as §P10-BUILD point 4 (below) — build it ONCE
as `flyToZone(A, guid)` in `hba_lens.js`, call it from both the Tenancy pane row-click and the Presence-drawer
row-click (no duplicate camera code).

**5. Top smart search — Room No / `AD_User` phone, borrowing Find's Storey/Room facets, OK to be redundant.**
A single `<input>` at the top of the FM drawer (below the header, above rows) filtering across: `A._hbaRooms`
(room name/storey — already populated by `bindStoreysFromModel`, the exact data Find's own Storey/Room tree
reads) + `MODELS.Official` (name/email/phone). On a room match → `flyToZone`; on a person match with an open
attendance session → `flyToZone` to their current zone. **Explicitly redundant with Find's own index** (Find's
tree lives in a private closure inside `navigate_find.js` and isn't exported — true reuse isn't mechanically
available) — user accepted the duplication for this POC ("ok to be redundant, just for convenience and early
showcasing").

### §P10a-BUILD (execution order — extends §P10-BUILD, same files + 2 new ones)
1. `models.js` — add `MODELS.Official` (5 records, watermarked for free by the existing stamp loop).
2. `ad_tenancy.js` — add `toUserRow(person)`.
3. `panels.js:1159` — pill `name: 'Human-Asset'` (id/fn/isActive unchanged).
4. `hba_lens.js` — header text → `'Human-Asset'`; `openFamilyDrawer` refactor (persistent container, ✕ button,
   row click no longer removes); `flyToZone(A, guid)` shared helper; `openPresenceDrawer(A)` (person list +
   row-click→flyToZone); search `<input>` wired to the same filter+flyToZone path; FAMILY 7→8
   (`{kind:'pane', id:'tenancy', label:'Tenancy / AD'}`, per §P10-BUILD point 5).
5. `viewer/hba_tenancy.js` (NEW, per §P10-BUILD points 2-3) — built AD_User-aware from the start: party column
   resolves through `MODELS.Official` to show name+email+phone, not a bare `BP-TEN-1` code.
6. `viewer.html` — add `ad_tenancy.js` + `hba_tenancy.js` script tags (per §P10-BUILD point 5).
7. **Witnesses:** extend `witness_family.js` (header text, ✕-only close, row click keeps drawer, FAMILY 7→8);
   NEW `witness_ad_user.js` (toUserRow shape, c_bpartner_id populated iff HR/Payroll-linked, watermark); NEW
   `witness_tenancy_pane.js` (per §P10-BUILD point 6, AD_User party display); NEW `witness_presence_drawer.js`
   (session list, person-name resolution, flyToZone target capture, honest no-op when a zone has no rendered
   members); NEW `witness_smart_search.js` (room-name match, phone match, no-match honest empty). Live chromium
   smoke (`cdp_shot.js` HHS, extends the existing `fm_panel.html` harness): drawer opens, ✕ closes, row click
   keeps it open, Presence drawer lists + zooms, search finds a room by name and a person by phone digit,
   0 console errors, screenshot.

---

## ▶ §P10b — IoT sensor mockup + CCTV mockup + ERP C_Order billing link + draggable panels (user 2026-07-02)

User, mid-§P10a build: clicking **Assets/IoT** should pop a 24h sensor-reading mockup (temperature, boiler
pressure, sound, dust, solar-panel output, electrical) — reference cited: the RiverIoT/Federation pattern in
IfcOpenShell/Bonsai (an external inspiration for the SHAPE of the idea, not a library dependency here) — plus a
6-camera CCTV mockup panel, an ERP link projecting each sensor reading as a **billable `C_Order`/`C_OrderLine`**
row (product=sensor, qty+UOM=the reading), and **every HBA pane becomes draggable**. Explicitly labeled a
**mockup** by the user — no real IoT hardware, no real video feed; the discipline that still applies is
**non-invent on the SHAPE**: reuse the REAL native AD tables for the ERP-link half, and be honest that the
sensor readings themselves are synthetic/demo (same CONTOH/SAMPLE watermark as every other HBA demo record).

### §P10b-CHECK — native shapes verified (`build/erp/ad_full.db` PRAGMA table_info, falsifiable)
- `c_orderline`: `c_order_id · line · c_bpartner_id · m_product_id · c_uom_id · qtyordered · priceactual ·
  linenetamt` — a sensor reading compiles cleanly onto this (product=the sensor, qty=the reading, uom=the
  physical unit) — SAME pattern as `ad_tenancy.toSubscriptionRow`, no new table.
- `c_order`: header carries `documentno · docstatus · issotrx` — ONE order per building/period groups the
  sensor lines (mirrors `toWarehouseRow`'s "one row per building, created since the demo building has none yet").
- `c_uom`: existing rows cover `Each/Hour/Day/Litre/...` but **NOT** the physical units these 6 sensors need
  (°C, bar, dB, µg/m³, W/m², kWh) — a genuine dictionary gap, same treatment as `M_Warehouse`/`C_SubscriptionType`
  being CREATED on demand in `ad_tenancy.js` (the established precedent: extend the native dictionary with the
  missing master row, never bolt on a parallel unit system). New `C_UOM` rows are compiled, not invented ad hoc.

### §P10b-BUILD
1. **`hr_bim_asset/iot.js`** (NEW engine, additive): `SENSORS` catalog — 6 entries `{key, label, uom_name,
   uom_symbol, baseline, amplitude}` (temp °C, boiler pressure bar, sound dB, dust µg/m³, solar W/m², electrical
   kWh). `demoSeries(assetGuid, hours)` — DETERMINISTIC synthetic 24-hourly-point series per sensor (a smooth
   sinusoid + a fixed per-hour offset table, NOT `Math.random()` — reproducible, watermarked, explicitly a
   MOCKUP series, never claimed as a real telemetry read). `toUomRow(sensorKey, seedId)` / `toOrderRow(building,
   period, seedId)` / `toOrderLineRow(sensor, reading, c_order_id, m_product_id, c_uom_id, line, seedId)` — the
   native compile functions (mirrors `ad_tenancy.js`'s pattern exactly, same file-header discipline).
   `billingLines(assetGuid, series)` — the reading-at-latest-hour compiled to one `C_OrderLine` PER sensor,
   wrapped `{row, sensor, reading}` (column-pure `row`, wrapper = view trace, same convention as
   `ad_tenancy.compileBuilding`'s subscription wrapper).
2. **`viewer/hba_iot.js`** (NEW pane, mirrors `hba_leave.js`): mounts on the `maintenance` FAMILY entry's row
   click (Assets/IoT already tints the model — kind:'lens' — this ADDS a supplementary pane, same dual-action
   pattern already built for Presence in §P10a point 4: tint stays, richer detail opens alongside). 3 sections:
   (a) 6 small `Chart.js` line charts (reuses the ALREADY-BUNDLED `viewer/lib/chart.umd.min.js`, same engine
   `hba_dashboard.js` already uses — no new charting dependency), one per sensor, 24 hourly points, watermarked;
   (b) a 2×3 CCTV MOCKUP grid — 6 tiles, each a small `<canvas>` with a **clearly-labeled placeholder pattern**
   (moving scanline + "CAM n · MOCK FEED" caption) — **no invented video/GIF asset, no external URL fetch**
   (PRIME RULE: never fetch/guess a URL); honest that there is no real camera; (c) the ERP billing table —
   `iot.billingLines()` rendered as sensor · latest reading+uom · `C_OrderLine` qty/uom/priceactual/linenetamt ·
   a "Billable" badge, with the compiled `C_Order.documentno` shown as the grouping header.
3. **`viewer/hba_draggable.js`** (NEW tiny shared utility, additive): `HbaDraggable.enable(paneEl, handleEl)` —
   pointer-down on `handleEl` switches the pane from its fixed `right/top` anchor to a `left/top` drag-follow
   (clamped to the viewport), pointer-up releases; returns a `disable()` fn. Pure DOM, zero THREE/viewer-core
   coupling. Retrofit into the 5 existing panes' header (`hba_dashboard.js`, `hba_payslip.js`, `hba_leave.js`,
   the new `hba_tenancy.js`, the new `hba_iot.js`) — one `HbaDraggable.enable(pane, head)` call added to each
   `mount()`, everything else about those files unchanged.
4. **FAMILY entry:** `maintenance`'s `detail` text gains "— click opens sensor charts + CCTV mockup + billing";
   no new FAMILY row (IoT reuses the existing Assets/IoT entry — the pane opens as a side effect of that same
   click, same convention as Presence's roster).
5. **Witnesses:** NEW `witness_iot.js` (SENSORS shape, deterministic series — same input → same output, twice —
   toOrderLineRow/toOrderRow/toUomRow native-column shape, billingLines wrapper, watermark on every output);
   NEW `witness_iot_pane.js` (off=no-DOM, data-gate on a real asset guid, mount renders 6 charts + 6 CCTV tiles
   + N billing rows, unmount zero-residue); NEW `witness_draggable.js` (enable binds pointer handlers, a
   simulated pointerdown→pointermove→pointerup sequence moves the pane's left/top, disable removes the
   handlers — stub DOM + stub pointer events, no real browser needed for the mechanics). Live chromium smoke
   extends `fm_panel.html`: IoT pane opens with 6 rendered charts + 6 CCTV tiles + billing rows, drag the
   Tenancy pane by its header moves it, 0 console errors, screenshot.

**Follow-up fix (2026-07-02, doc-screenshot session):** `demo/fm_panel.html` never loaded
`viewer/lib/chart.umd.min.js` — `window.Chart` was undefined, so EVERY chart in the demo (Dashboard's bar/
doughnut/trend AND IoT's 6 line charts) silently no-op'd (`if (G.Chart)` guard) and rendered as blank boxes.
Fixed: added the script tag. Also fixed `hba_iot.js`'s per-sensor chart wrapper — a label `<div>` was sharing
the SAME `position:relative` box Chart.js measures for `responsive` sizing (the canvas's own box must hold
ONLY the canvas, per `hba_dashboard.js`'s existing convention) — split into an outer label box + an inner
canvas-only box. Both fixes verified live (`hr_bim_asset/tests/live/cdp_shot.js`): all 6 sensor curves now
render. Doc screenshots `docs/img/hba_iot_sensors.png` + `hba_iot_cctv.png` published to `HRBIMAssetGuide.md`
§"Spot equipment that needs service" (bim-compiler repo, via `safe_gh_deploy.sh`).

---

## ▶ §P10c — QUEUED, NOT STARTED (user 2026-07-02, do in a NEW session)

**User ask:** *"add some audio effects to the IoT panel, so each bar movement has own tone."* Not scoped or
built this session — spec it here for the next one.

**Reading of the ask (to confirm/refine next session, don't just start coding):** the IoT pane's 6 sensor line
charts move as new values come in (currently they're static 24h snapshots — no live "bar movement" yet, so
this ties to a FUTURE live-update tick, not the current one-shot render). Per-sensor, a value change should
play its own tone — plausible mapping: each of the 6 `SENSORS` gets a distinct pitch/timbre (e.g. by
`sensor.key`), the tone's pitch or volume scaled by the reading's delta or its position in-range (baseline vs
amplitude), fired via the Web Audio API (`AudioContext` — no external audio asset, no fetched sample,
consistent with the CCTV mockup's "generate, don't fetch" discipline). Needs an explicit mute/volume control
(a pane full of sensors chiming is real user-hostile without one) and must be OFF by default (opt-in, like
every other HBA additive surface) — the existing `HbaDraggable`-style shared-utility pattern
(`hr_bim_asset/iot.js` for the tone-mapping math, a new `viewer/hba_audio.js`?) is probably the right shape,
mirroring how `flyToZone`/`HbaDraggable` were built as ONE shared primitive reused across panes rather than
per-pane copies — reuse across future audio-bearing panes if any.

**Open questions for the user before building (Spec-First — write the spec section proper before code):**
1. Does "bar movement" mean the pane needs a LIVE tick (values changing over time in front of the user), or
   is a tone-per-sensor-on-open/on-hover/on-click enough for this mockup? (No live-tick engine exists yet —
   the current series is a static 24h snapshot rendered once.)
2. Per-sensor tone design — pick from a scale, or literally map the reading value to a frequency (sonification)?
3. Mute/volume default and control placement (pane header? a global HBA audio toggle?).

---

## ▶ §P10d — QUEUED, NOT STARTED (user 2026-07-02, do in a NEW session)

**1. The live-vs-branch gap — CHECKED, here's the honest state.** User asked *"Is the feature working online in
GH?"* Checked both halves separately (they're two different sites):
- **`bim-compiler` docs site** (`https://red1oon.github.io/BIMCompiler/HRBIMAssetGuide/`) — **LIVE, confirmed**:
  page 200, the new "IoT sensor + CCTV cockpit" section text present, both screenshots 200 (`img/hba_iot_sensors.png`
  / `img/hba_iot_cctv.png`).
- **`bim-ootb` GH Pages** (`https://red1oon.github.io/bim-ootb/hr_bim_asset/demo/fm_panel.html`) — **200, but
  STALE**: `curl`'d the live HTML and it still reads **"FM / Operate"**, not "Human-Asset" — i.e. GH Pages
  serves `bim-ootb`'s `main` branch, and this whole arc (§P10-BUILD/§P10a/§P10b/the chart-load fix) lives ONLY
  on **`lane/hr-overlay`**, never merged. **The actual interactive feature (the real viewer, the real demo
  page) is NOT live for any real user right now** — only the documentation (static text + screenshots) is.
  **Next session: confirm with the user whether `lane/hr-overlay` should merge to `main`** (this repo's normal
  release path — check `~/bim-ootb`'s branch-protection/PR flow before merging solo) before calling this
  genuinely "live."

**2. Swap the CCTV mockup for a real still — `~/Pictures/Screenshots/contacam.jpeg`.** User supplied a real
image (verified present: `652x666` JPEG, 118KB, a ContaCam capture — i.e. actual CCTV-monitoring-software
output, not a stock photo) to use **in place of** the placeholder canvas-scanline tiles, **in BOTH places**:
- **The live viewer** (`viewer/hba_iot.js` `renderCctvTile` — currently a pure-canvas scanline+caption mockup,
  zero image asset) — swap to render this JPEG (as a `background-image` or drawn into the canvas via
  `drawImage`), still captioned "MOCKUP — NO REAL FEED" (it's a real photo, not a real feed of THIS building —
  don't blur that line). Needs the asset copied into `hr_bim_asset/` or `viewer/` (check the project's asset
  convention — `viewer/lib/` holds bundled libs, is there an `img/`/`assets/` folder already for viewer-local
  images?) and referenced by a relative path, not a hardcoded `~/Pictures` path (that's a local-machine path,
  won't resolve for anyone else — copy it into the repo).
- **The doc guide** (`docs/img/hba_iot_cctv.png`) — recapture the CCTV-grid screenshot with the swapped tile so
  the published guide shows the same thing the live viewer now does.
**Not done this session per explicit user instruction ("do it next session").** No code/asset changes made yet
— this section is the pointer + the located source file, not the implementation.

---

## ▶▶▶ CRITICAL — READ FIRST (2026-07-02): "Compile not Model" — HBA reinvented tables that already exist

**User doctrine restated (2026-07-02):** *"No invention outside the iDempiere AD."* Our hallmark vs. the outside
BIM/ERP world is **Compile, not Model** — a compiled BIM element lands as a row in the SAME dictionary the ERP
already runs on (Product/BPartner/Document), not a parallel schema glued on by an integration/ETL step (which is
what Autodesk↔Procore↔Yardi↔Workday do to each other). **This gates P7/P8 below — do not build a view on an
invented schema when the native table is sitting unused one folder over.**

### What was checked, and how (falsifiable — re-run these if in doubt)
Verified against **real iDempiere source** (`~/idempiere-dev-setup/idempiere`, actual upstream git history —
migration SQL under `migration/i*/postgresql/*.sql`, generated model classes under
`org.adempiere.base/src/org/eevolution/model/`) **and** this project's own compiled
**`build/erp/ad_full.db`** (`sqlite3 build/erp/ad_full.db "PRAGMA table_info(<table>);"` / `.tables` / `SELECT count(*)`).
Not assumed from the spec's prose — the spec's prose was WRONG on one load-bearing claim (below).

### Finding 1 — the vision doc's core premise is FALSE, and needs correcting
`§VISION` says *"iDempiere/ADempiere never shipped real Payroll, so there is no incumbent to merely match."*
**False.** iDempiere ships a full native HR/Payroll dictionary (the eEvolution contribution, present in upstream
history back to early migrations): `hr_employee`, `hr_contract`, `hr_department`, `hr_job`,
`hr_concept`/`hr_concept_category` (= pay elements/rules), `hr_payroll` (= the run), `hr_payrollconcept`,
**`hr_movement`** (= the calculated pay line), `hr_process` (= the run document, docstatus/docaction/posted),
`hr_concept_acct` (= the GL account mapping), `hr_period`/`hr_year`. **All 19 tables are already present, right
now, in this project's own `build/erp/ad_full.db`** (and `internal/ad_full_idempiere_gardenworld.db`) — **0 rows**,
dormant. `C_BPartner.isemployee` is likewise REAL (col present, `TEXT`, confirmed via a genuine `AD_Val_Rule`
migration `migration/i5.1/postgresql/201709181100_Ticket_1008477.sql` referencing `SELECT IsEmployee FROM
C_BPartner`). **The corrected, SHARPER pitch:** not "no incumbent has payroll" (falsifiable, wrong) but *"iDempiere
carries a two-decade-old native HR/Payroll dictionary that is functionally dormant everywhere it's deployed — no
engine runs it, no UI surfaces it. We're first to activate those exact tables with a signed, glass-box,
deterministic-replay engine, and first to compile a real building's geometry straight into that same dictionary."*
Any doc asserting the old claim (`docs/SpatialERPIntegration.md`, `docs/HRBIMAssetGuide.md`, this file's own
`§VISION`) needs this correction before further public use — flagged, not yet edited (ask first, these are
deployed/live docs).

### Finding 2 — table-by-table: HBA's invented shape → the native AD table it should compile into instead

| HBA invented shape (`hr_bim_asset/*`) | Native AD table (verified columns) | Notes |
|---|---|---|
| `documents` (`doc_type=PAYRUN`), lifecycle draft→calculate→approve→post | **`hr_process`** — `hr_payroll_id`, `hr_period_id`, `docstatus`, `docaction`, `documentno`, `posted`, `processed`, `c_doctype_id` | This IS the PAYRUN doc, natively, with real doc-lifecycle columns HBA's version doesn't even have (docaction/docstatus workflow). |
| `document_lines` (one payslip/employee: base/ADD/SUB elements + `.trace`) | **`hr_movement`** — `c_bpartner_id`, `hr_concept_id`, `hr_concept_category_id`, `amount`, `qty`, `accountsign`, `servicedate`, `validfrom/to`, `hr_process_id` | The calculated line. `accountsign` ('+'/'-') **is** HBA's `side: ADD/SUB` — already a native column, not something to invent. |
| pay-element rule (`elements[]`: `kind` FIXED/%/FORMULA, `side`) | **`hr_concept`** (`accountsign`, `type`, `columntype`, `value`, `ispaid`, `isreceipt`) grouped by **`hr_concept_category`** | `hr_concept_category.hr_concept_acct` even points at the GL mapping row directly. |
| formula evaluation (`rules.js` `evalRule`, JSON-declarative, produces `.trace`) | **`hr_payrollconcept.ad_rule_id`** (an `AD_Rule` script object) | Native iDempiere evaluates via an opaque AD_Rule script — HBA's declarative JSON-rule-with-trace is a GENUINE improvement (glass-box, auditable) worth KEEPING as the execution engine, while the concept's *identity/category/account* still compiles into `hr_concept`/`hr_concept_acct`. Don't throw this part out. |
| GL post (`glFor()` hand-rolled Dr/Cr) | **`hr_concept_acct`** — `hr_revenue_acct`, `hr_expense_acct`, `c_acctschema_id`, `isbalancing` | The dotted GL line already has a native mapping table; `glFor` should read/write through it, not invent its own account-string convention. |
| Employee (`party.base`/`party.ctx`) | **`hr_employee`** (`c_bpartner_id`, `hr_department_id`, `hr_job_id`, `hr_payroll_id`, `startdate/enddate`) + **`hr_contract`** (`c_bpartner_id`, `validfrom/validto`, `netdays`) | Contract term is `hr_contract.validfrom/validto`, not a generic `p.term` bolted onto every profile. |
| Occupancy `models.js` (`assignment_no`/`s_resource`/`resource_product`/`party`/`assign_from`/`assign_to`/`qty`) | **`s_resourceassignment`** (real cols: `s_resource_id`, `name`, `description`, `assigndatefrom`, `assigndateto`, `qty`, `isconfirmed`) + **`s_resource`** (`value`, `name`, `s_resourcetype_id`, `isavailable`, `chargeableqty`, `percentutilization`) | Field names are close paraphrases, not the real columns, and live in a separate `hr_seed.db` that never touches `ad_full.db`. **11 real `s_resource` rows and 2 real `s_resourceassignment` rows already exist** in `ad_full.db` today (stock 2003 GardenWorld demo content — "Fertilizer Plant," "Garden Layout" — not this project's buildings, but proof the table is live, not just schema). |
| Room ↔ Resource conceptual link (spec said "Room = S_Resource IS-A M_Product") | **REVERSED from what the spec says**: `m_product.s_resource_id` is the real FK (Product → Resource), confirmed by grepping every table for the column. Combined with the **BOM PRINCIPLE** (a BIM element already compiles to an `M_Product` row) — **a room's bookable-resource identity should hang off the SAME compiled Product row**, no separate `bim_guid` field needed on a hand-rolled Occupancy shape at all. |
| ⚠ **genuine native gap, not an HBA invention**: `s_resourceassignment` carries **no party/tenant column** at all (verified — full column list has none). | — | The booking record is pure calendar (dates/qty/confirmed); "who" leased/booked it natively lives on the **commercial document** (`C_Order`/`C_Invoice.c_bpartner_id`), not on the resource assignment. HBA's `party` field on Occupancy isn't reinventing a wheel here — it's filling a real native gap, but it belongs on the ORDER/INVOICE side, not bolted onto `s_resourceassignment`. |
| Tenancy (`HR_Lease`: unit/tenant/rent/term) as an invented `documents doc_type=RENTRUN` | **`c_recurring`** (`recurringtype`, `c_order_id`, `c_invoice_id`, `frequencytype`, `frequency`, `runsmax`, `datenextrun`) + **`c_subscription`**/`c_subscriptiontype` + `c_orderpayschedule`/`c_invoicepayschedule` | Native recurring-billing off a base `C_Order`/`C_Invoice` — a lease is just an Order with a `C_Recurring` header generating periodic invoices. **No RENTRUN/FEERUN doc-type needs inventing** — profile #2 (tenancy) and #4 (strata) both collapse into this ONE native mechanism, differing only by which BPartner/product they recur against. `c_recurring` has **1 real row already** in `ad_full.db`. |
| `PM_Asset` (`bim_guid`↔`iot_device`↔`operator`/`vendor`/`personnel`↔`pm_cycle`↔`next_due`) | **`a_asset`** (Fixed Asset module, 20 sibling tables) — has `m_product_id` (direct!), `c_bpartner_id`, `lease_bpartner_id`, `leaseterminationdate`, `lastmaintenencedate`/`nextmaintenencedate`, `isowned`, `a_asset_group_id` + **`a_asset_product`** (asset↔product join) | Already carries **3 real rows** in `ad_full.db`. Because `a_asset.m_product_id` links directly to a Product, and a BIM element already compiles to a Product (BOM PRINCIPLE), **the asset↔BIM link is already native — no separate `bim_guid` field needed.** This single table covers most of Pillar-4's §7D asset/maintenance ambition already. |
| `PM_Property`/`PM_Strata_Parcel` (hand-rolled) | Not yet matched to a native table — **NOT VERIFIED**, flagged as an open item, do not assume invented-is-necessary without checking (e.g. `C_BPartner_Location`/`M_Locator`/a dedicated strata concept may or may not exist natively). | Lower priority than Payroll/Occupancy/Asset above — check before building, don't build then check. |

### What HBA got RIGHT and should keep (the genuine differentiator, not reinvention)
- **The signed op-log (W-SIGN) over every domain** — no native AD table is tamper-evident or replay-verifiable;
  this is real, additive value sitting *on top of* the native rows, not competing with them.
- **The declarative JSON rule + `.trace`** (`rules.js`) — strictly better than opaque `AD_Rule` scripts for the
  glass-box story; keep it as the *execution engine* for `hr_concept`/`hr_payrollconcept`, not as a schema.
- **The guid↔mesh spatial binding** (`binding.js`) — genuinely new; no native AD table carries a BIM guid or mesh
  reference anywhere (grepped every table for `s_resource_id` reverse-refs and for any guid-shaped column — none
  found). This is the actual moat, unchanged by this finding.

### Revised priority (supersedes the P7/P8/P9 order below until this is resolved)
- **P7-PRE ✅ DONE 2026-07-02 (`hr_bim_asset/ad_payroll.js`, `W-HBA-AD-PAYROLL 13/13`).** New module compiles
  payroll into native `hr_process` (the run) / `hr_movement` (one row per employee×concept) / `hr_concept`+
  `hr_concept_category` (pay-element identity, `accountsign` IS the native ADD/SUB column) / `hr_concept_acct`
  (GL mapping — `epf_payable`/`pcb_payable` resolved per-concept, not a hardcoded profile string) / `hr_contract`
  term-scoping. Kept ON TOP (genuinely ours, not invented, not native either): the declarative `rules.js`
  FIXED/RATE/BRACKET rule + `.trace` as the execution engine (native iDempiere only offers an opaque `ad_rule_id`
  script here), and the signed op-log (W-SIGN) wrapping every `hr_process`/`hr_movement` write. **W-HBA-AD-PAYROLL
  13/13**: AD0×2 = the NON-INVENT GATE itself (every emitted row's keys ⊆ an INDEPENDENTLY-sourced real-column
  list, captured fresh via `PRAGMA table_info` — not imported from the implementation, so it can't grade its own
  homework) · AD1 arithmetic identical to the already-accepted `witness_run.js` demo baseline (EMP001 gross=5200
  net=4234, reused not reinvented) · AD2 `accountsign` native · AD3 GL balances Dr=Cr=8400 through the
  `hr_concept_acct` lookup · AD4/AD5 signed+tamper-evident · AD6/AD7 deterministic replay==live · AD8 `hr_contract`
  term-scoping (lapsed contract → honestly excluded) · AD9 `payslip()` reader (groups movements per employee,
  watermarked, trace-carrying) — **this is what P7's view will render off**, not a new schema. `connectors.js`'s
  header comment (the wrong "PAYRUN→documents/PAYSLIP→document_lines" mapping) corrected in place. Full existing
  suite re-run **zero regression** (18 files, all still green). `engine.js`'s generic payroll profile
  intentionally left in place (untouched) — `witness_leave.js` still depends on it; retiring it is a follow-up
  once Leave (P8) is itself native-checked, not bundled into this slice.
- **P-OCC-RETRO ✅ DONE 2026-07-02 (`occupancy.js` `toResourceAssignmentRow()`, `W-HBA-AD-OCC 4/4`).** The signed
  ASSIGN/RELEASE/UNAVAIL op-log + REPLAY availability engine (21/21, already sound) is UNCHANGED — added a
  projection of an ASSIGN op onto the real `s_resourceassignment` columns (`s_resource_id`/`assigndatefrom`/
  `assigndateto`/`qty`/`isconfirmed`). Confirmed `s_resourceassignment` has **no native party/tenant column at
  all** — `party` is carried alongside for the caller to thread onto `C_Order`/`C_Invoice.c_bpartner_id` instead
  (a real native gap, not an HBA omission). Also fixed `models.js`'s decorative Occupancy demo record to the
  real column names (was a hand-paraphrased shape) and corrected the backwards FK claim ("Room IS-A M_Product" →
  the real FK is `m_product.s_resource_id`, Product→Resource).
- **P-ASSET-RETRO ✅ DONE 2026-07-02 (`models.js` `toAssetRow()`, `W-HBA-AD-ASSET 4/4`).** Projects the `PM_Asset`
  demo record onto real `a_asset` columns (`m_product_id`=the asset's `bim_guid` directly — the BOM PRINCIPLE
  means a BIM element already compiles to a Product, so no separate guid column is needed; `c_bpartner_id`,
  `isowned`, `nextmaintenencedate`). Honest gap: `a_asset` has ONE `c_bpartner_id`, not three — `vendor`/
  `personnel` are carried outside the row (`_vendor`/`_personnel`), never forced into a column that can't hold
  all three parties. `timeline.js`'s shipped consumption (`W-HBA-TIMELINE 7/7`, merged into the 4D editor) is
  UNTOUCHED — this is an additive projection, not a replacement.
- **P8 (Leave) ✅ VERIFIED, NOT GATED (2026-07-02)** — searched upstream iDempiere + this project's own
  `ad_full.db` for any `HR_Leave`/`Vacation`/`Absence`-shaped table: **none exists, anywhere.** `leave.js` is
  genuinely novel, not a reinvention — proceed on it same as before, no native retarget needed. Its payroll feed
  is now closed onto the native shape too: `ad_payroll.js` gained an `UNPAID_LEAVE` concept + `emp.extra[]` (the
  honest feed-point for a per-employee-per-period deduction computed elsewhere) — `W-HBA-AD-PAYROLL` AD10 proves
  `leave.leaveDeduction()`'s output lands as a real `hr_movement` row, GL still balances. **`W-HBA-AD-PAYROLL` now
  15/15.**
- **P9 (Research Gate)** — unchanged, still paused per user 2026-07-02.
- **Tenancy + Strata (`§PILLAR 4` profiles #2/#4) ✅ DONE 2026-07-02 (`hr_bim_asset/ad_tenancy.js`,
  `W-HBA-AD-TENANCY 12/12`).** User design review (2 rounds) corrected the model twice before landing:

  1. **`c_recurring` was the WRONG table** — it's a header that POINTS AT an existing `C_Order`/`C_Invoice`
     (needs one to pre-exist). The right native table is **`C_Subscription`** (`c_bpartner_id`=party,
     `m_product_id`=the leased unit — itself already a compiled BIM element per the BOM PRINCIPLE,
     `c_subscriptiontype_id`=frequency, `startdate`/`paiduntildate`/`renewaldate`/`isdue`) — **self-contained,
     no Order/Invoice pre-req.** `C_InvoicePaySchedule`/`C_OrderPaySchedule`/`C_PaymentTerm` remain correct for
     the OTHER already-distinguished case (purchase-with-terms), not rental.
  2. **`M_Locator.X/Y/Z` are NOT Cartesian coordinates** (first-pass mistake, caught by user WMS review) —
     verified against `ad_full.db`'s own `AD_Element` dictionary: `X`="Aisle (X)", `Y`="Bin (Y)", `Z`="Level (Z)"
     — the classic WMS bin-address triple (e.g. `02-B-03` = aisle/row, bin/rack-section, level/shelf-height).
     Aisle+Bin are horizontal, Level is vertical — so **Level maps onto a building's storey** (floors stack
     vertically; the fixture's real extracted `room.storey` field, e.g. `"Level 1"`), **Aisle maps onto a
     block/wing** (real when a building has one; honestly `null` for HHS's single tower — never guessed), and
     **Bin has no building-side analog** (left unset, not forced). The room's real geometry (precise position)
     stays authoritative on the BIM/viewer side, joined back only by guid (`m_locator.value`) — this AD record
     is a WMS-style business ADDRESS for ERP-side lookup, not a duplicate coordinate store.
  3. **Strata needs NO new table** — it is the IDENTICAL `C_Subscription` mechanism as Tenancy: same
     `c_bpartner_id` (owner instead of tenant), same `m_product_id` (the same unit), just a different native
     `C_SubscriptionType` row (`QUARTERLY_STRATA_FEE`, frequency=3, vs `MONTHLY_RENT`, frequency=1).
     `PM_Strata_Parcel` retires entirely — `toSubscriptionRow(record, m_product_id, subscriptionType, seedId)`
     serves both profiles.

  **"Building" precedent (verified, not hypothetical):** `build/erp/bim_embed.js` §B4 ("the framework proof")
  already attaches a standard `AD_Attachment` row (table 254, `ad_table_id=190` M_Warehouse, `record_id=103`,
  title `"HQ Warehouse (Terminal model)"`) pointing at the compiled Terminal viewer — i.e. `M_Warehouse` is
  ALREADY used as "a Building" in this exact repo. `M_Product.m_locator_id` is a real column, so
  **Product(unit) → Locator(room, WMS address) → Warehouse(building)** is wired natively, schema-only.
  Declaring the BIM-set attachment on a new HHS warehouse row stays `bim_embed.js`'s job (ERP-side, when ERP
  co-loads) — not reimplemented in HBA, per the "dotted lines only" doctrine.

  **The model, shipped:**
  | Concept | Native AD row |
  |---|---|
  | Building | ONE `M_Warehouse` row per building (new — HHS has none yet, unlike GardenWorld/Terminal) |
  | Room / leasable unit | `M_Locator` (WMS address: `z`=real storey, `x`=block-when-real) + `M_Product` (`m_locator_id` link) |
  | Lease (tenant) | `C_Subscription` (`c_bpartner_id`=tenant, type=`MONTHLY_RENT`) |
  | Strata (owner) | `C_Subscription` (`c_bpartner_id`=owner, type=`QUARTERLY_STRATA_FEE`) — same table, same function |
  | Rent/fee received | **honest gap, isolated to one field:** `paiduntildate` stays `null` until a real `C_Invoice`/`C_Payment` exists (the one remaining Order-engine dependency) |
  `W-HBA-AD-TENANCY 12/12`: non-invent gate (3 tables) · WMS-address correctness (level=storey, no fabricated
  coordinates) · Product→Locator→Warehouse chain · self-contained subscription (no Order/Invoice FK) · honest
  `paiduntildate` gap · Strata same-shape + different-role/type proof. Zero regression across the full 22-file
  HBA suite. `WM_DeliverySchedule` (a user-recalled Red1 WMS plugin) was searched for on this machine
  (`~/Projects/red1_plugins/`, whole home) — not found, no Bitbucket remote configured anywhere; not factored in,
  flagged rather than guessed at.

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
- **P1 — INSTANCED-TINT (the live lens actually paints). ✅ DONE+LIVE 2026-07-01 — `tintedMeshes=19` on HHS
  (was 0), `emissiveOnly=0` ⇒ ALL 19 are instanced/batched per-slot tints.** TWO root causes, both fixed (the
  prompt's "just the `_N` suffix" diagnosis was incomplete):
  1. **`hr_bim_asset/overlay.js applyOverlay` drove `setTint` from `allGuids() ∩ linked`** — but `plan.linked` is
     ROOM guids and a room is NOT a rendered guid, so the intersection was EMPTY → `setTint` never fired for any
     room → 0 paint. The synthetic witnesses MASKED this (they put the room guid AS a rendered mesh value). FIX:
     iterate `plan.linked` directly (`port.setTint(zone)`), letting the port resolve zone→members; ghost the rest.
  2. **`viewer/hba_lens.js buildMeshPort` bare-id lookup** missed instanced/batched members keyed `<meshId>_<N>`
     and tinted whole-mesh `emissive` (no per-instance). FIX: new pure `binding.guidTargets()` reverse-indexes the
     `_N` suffix → `{meshId, slot}`; the port tints whole-mesh via emissive, per-slot via `setColorAt` (+ restore).
  Whitebox witness `tests/witness_meshport.js` **W-HBA-MESHPORT 8/8** (drives the REAL port + applyOverlay through
  stub InstancedMesh/BatchedMesh; M6 = the un-rendered-room gap the synthetics missed) + LIVE harness GREEN
  (`§DIAG2 … tintedMeshes=19`) + real lens-applied screenshot (cyan occupancy tints across HHS). Witness mocks in
  `witness_{view,presence}.js` made faithful (setTint no-ops an unresolved zone, like the real port). Closes #2b.
- **P2 — RICH DEMO DATA (the richness standard). ✅ CORE DONE+LIVE 2026-07-01 (occupancy + presence).** The old
  `occupancy.demoSeed`/`attendance.demoSeed` hard-coded only `g[0..4]` → only Level 1 populated (the sparse look).
  Rewrote both to spread a DETERMINISTIC, index-cycled MIX across EVERY room (g[0..4] behave identically → existing
  witnesses preserved): occupancy cycles occupied→expiring→vacant→occupied+renovation-blackout→assigned-then-
  released; presence spreads varied headcount bands over i≥3 (g0=3/g1=1 kept). LIVE on HHS (`§RICH`): **3 storeys
  populated** (util Level 1:0.71 / 2:0.92 / 3:0.33, was only L1), occupancy lens **lit 4→11 rooms** across all
  levels, **tintedMeshes 19→77**, 2026-03 mix occ8/vac3/unavail3, presence 11 zones / 3 storeys / 6 bands [1-6].
  Also added **`request.demoSeed`** (varied-age OPEN tickets → ALL 4 dashboard SLA buckets) wired into
  `bindStoreysFromModel` (`§HBA_REQ`); LIVE: **7 tickets, buckets {<1d:2,1-3d:1,3-7d:2,>7d:2}** (was empty). Gated
  on the REAL ROOM set (spatial_structure — available at seed time; the rendered-mesh set still streams then).
  Witness `tests/witness_richdemo.js` **W-HBA-RICHDEMO 9/9** (all storeys populated · 4-state mix · varied presence
  · ticket buckets all 4 · ticket non-invent · real guids · deterministic). Existing witnesses updated for the
  richer counts (O3/O4b/O6b/O9, dashboard D2). **RESIDUAL (carried forward):** class is a correct 3-way mix
  (office/commercial/residential) but only on the 3 leased units (class is a unit-level lease/strata attribute by
  design — spreading to all rooms = a `classRows` semantics change, decide if wanted); assets=1 (meets ≥1). ⇒ P2
  acceptance bar MET (occupancy/presence/ticket-aging multi-storey rich); only the optional class-spread remains.
- **P3 — PREP SAMPLE GW DATA. ✅ DONE+LIVE 2026-07-01 (user chose "aisles as zones").** GardenWorld
  (`buildings/warehouse_gardenworld.db`, 60KB, 26 elements) has **NO `spatial_structure`/`rel_contained_in_space`**
  → zero IfcSpace rooms. Added **§AISLE-ZONES fallback** to `hba_lens.js bindStoreysFromModel`: a building with no
  IfcSpace rooms groups its elements by the real `elements_meta.storey` (SITE/AISLE_A/B/C) → AISLE-as-ZONE (zone =
  the aisle, whose floor-slab guid is a real rendered element; members = the element guids in that aisle — all
  EXTRACTED, non-invent; SITE skipped). The spatial_structure query is now try-wrapped so a room-less db doesn't
  abort. LIVE on GW: `§HBA_AISLE 3 aisle-zones (A=5/B=9/C=11 members)`, occupancy lit 2, presence 2 zones, 2
  tickets; FM drawer greys Unit-class/Assets (wake-aware, no data) — correct. Fixture `fixtures/gw_aisles.json`
  (extracted) + witness `tests/witness_gw_aisles.js` **W-HBA-GW-AISLES 6/6** (aisles resolve · paint · occupancy
  mix · presence+tickets · non-invent). ⚠ LOCAL-SERVE NOTE: the viewer fetches `buildings/X` relative to
  `viewer/`; HHS is silently rescued by the OCI-prod retry (`W-DB-404-OCI-RETRY`) but GW isn't on OCI → for a local
  GW smoke pass `?db=../buildings/warehouse_gardenworld.db`. HHS remains the richer sample; GW = the fast loop.
- **P4 — NEWBIE GUIDE REWRITE. ✅ DONE 2026-07-01 (NOT deployed — "deploy when happy").** Rewrote
  **`docs/HRBIMAssetGuide.md`** (lives in the **bim-compiler** repo, in the mkdocs nav as "HR / Tenancy / Operate
  Module") from reference-style into a **task-oriented manual**: *Getting started* (numbered open→pill→drawer→
  toggle), *Common tasks* (occupancy/presence/assets/class/dashboard step-by-step), *Aisle-zones* section for
  room-less warehouses (GW), *lens reference* (exact colour legends + watermark), *Under the hood* (signed op-log
  · records · guid→members binding · `S_Resource` occupancy ledger · the periodic RUN engine + 4 profiles),
  *Troubleshooting* table ("no pill = no operate data", "greyed = no data"). Uses the REAL lens-applied
  screenshots `img/hba_occupancy_live.png` (HHS, 3 storeys) + `img/hba_gardenworld_aisles.png` (warehouse
  aisle-zones). All image/cross-link refs verified. Committed on bim-compiler branch **`docs/hba-guide-rewrite`**
  (pushed); **NOT gh-deployed** — review + `safe_gh_deploy.sh` when happy.
- **P5 — ERP INTEGRATION / SPATIAL-ERP DOC. ✅ DONE+DEPLOYED 2026-07-01.** New **`docs/SpatialERPIntegration.md`**
  (bim-compiler): "One Building, One Log, Three Surfaces" — the shared substrate (one model + one signed
  `kernel_ops` log), the three no-overlap surfaces (Viewer=spatial/where · ERP=money+docs/how-much · HR=people/who),
  the find-everything-no-clutter UX (one FM pill not six · wake-aware greying · records on geometry), one lease
  threaded through all three, the non-invent guid join, boots-standalone/lights-up-with-ERP. Added to mkdocs nav
  (Go Deeper) + reciprocal cross-link from `SpatialERP_OOTB.md`. Reuses the real lens screenshots. On branch
  `docs/hba-guide-rewrite` (pushed). **DEPLOYED LIVE** via `scripts/safe_gh_deploy.sh` (guard PASS, blessed benign
  `.nojekyll`; live 184→198 files, superset): P4+P5 both live 200 — `https://red1oon.github.io/BIMCompiler/
  HRBIMAssetGuide/` + `/SpatialERPIntegration/` (+ images 200), all 7 canaries 200.
- **P6 — AVATAR LOD "WOW". ✅ DONE+LIVE 2026-07-01.** Pure engine `hr_bim_asset/avatars.js` (avatarPlan folds
  `attendance.sessions` → one avatar per present person per RESOLVED zone, count==presenceByZone headcount,
  ring-placed around the zone centroid · avatarLOD: >30m dot / 12–30m mini / ≤12m full · avatarTip = watermarked
  card {name=AD_User, image=`C_BPartner.image` PLANNED field, null till sourced}). Browser renderer
  `viewer/hba_avatars.js` (additive, host-injected): one scene Group of Sprites (canvas person/dot glyph),
  centroids from rendered member meshes (reuses §REAL-BIND guidTargets, instanced/batched aware), LOD on camera
  'change', mousemove-raycast → the person's card, nearest-full auto-labels on approach. Wired to the presence
  toggle in hba_lens.js (mount on-presence / unmount on any clear → zero residue). W-HBA-AVATARS 6/6. LIVE HHS:
  §HBA_AVATARS **34 avatars over 10 zones**, screenshot = blue people standing in rooms, ringed where several share
  one. Non-invent (no check-in → no avatar). **ROADMAP P1-P6 ALL COMPLETE.**
- **P4-REVISIT + DASHBOARD FIX (user: "screenshots must tell the detail flow; if no-data, review to get them").**
  Found+fixed a REAL bug: `viewer/viewer.html` never loaded Chart.js (the local `lib/chart.umd.min.js`, already
  precached in sw.js) → the FM Dashboard KPI tiles rendered but the 3 canvases were **BLANK**. Added the script →
  LIVE `chartLib=true`, dashboard now renders rich (3-storey utilisation bar · 4-bucket ticket-aging doughnut ·
  12-month availability trend). Recaptured the full **detail-flow screenshot set** on live HHS (drawer · occupancy
  · **presence avatars** · rich dashboard · GW aisles) and rewrote `docs/HRBIMAssetGuide.md` with a shot at every
  task step + a Presence-avatars walkthrough. **REDEPLOYED LIVE** (guard PASS, blessed intentional image
  replacement + `.nojekyll`): guide + all 5 images 200 on gh-pages.
- **REGRESSION (user: "check if u break any other features or panes").** Live driver on HHS after P1–P6:
  avatars mount 34 → unmount 0 (scene 724→725→724, group removed, **residue=false**); occupancy tint 77→0, scene
  back to base; switch presence→occupancy clears avatars; core features intact (HBALens/DashPane/Avatars/dbQuery/
  collectMeshes/camera/controls); **jsErrors=0**. All changes additive + gated — nothing else broken.
- **P7 — PAYSLIP UI VIEW ⛔ OPEN (user 2026-07-01: "payroll proper" is the next gap).** Engine is DONE+witnessed
  (§PILLAR 1 shape: `documents doc_type=PAYRUN` draft→calculate→approve→post, `document_lines`=one payslip/employee,
  `W-HBA-ALPHA` E1–E8 incl. E8-gl-balanced Dr=8400 Cr=8400) but **no view was ever built** — §PILLAR 1's own spec
  says it needs "...+ one new payslip view," never delivered. Every other module (Occupancy/Presence/Dashboard) got
  a viewer pane+pill; payroll never did. **Scope:** a payslip pane (same additive/host-injected/data-gated pattern
  as `hba_dashboard.js`) rendering the glass-box trace — every line (base/allowance/tax/EPF/SOCSO/net) click-through
  to the `kernel_op` that produced it (the Glassbowl thesis). **Not blocked on §RESEARCH GATE below** — render
  against the EXISTING demo pay-element rates (already computing E8's Dr=8400/Cr=8400), watermarked
  `CONTOH — TIDAK RASMI`/`SAMPLE — NOT OFFICIAL` same as every other output. Witness pattern: `witness_payslip.js`
  mirroring `witness_dashpane.js` (mount/unmount zero-residue, real trace assertions, watermark present).
- **P8 — LEAVE UI SURFACE ⛔ OPEN.** Engine DONE+witnessed (`leave.js`, `W-HBA-LEAVE 13/13`: ACCRUAL=signed op,
  BALANCE=replay, feeds payroll via `leaveDeduction`) but flagged open since 2026-06-30: "the engine + payroll feed
  are node-witnessed; no panel wired." **Scope:** a leave pane/pill (balance display + accrual history + request
  action) on the same FM-family drawer pattern as Occupancy/Presence. Also not blocked on §RESEARCH GATE.
- **P9 — §RESEARCH GATE ⛔ OPEN (prerequisite for REAL statutory numbers only, not for P7/P8 UI).** §PILLAR 3's
  own checklist (line ~533) has **all 7 items unchecked** — current PCB (income-tax withholding) brackets, EPF/
  SOCSO/EIS contribution rate tables, MyInvois mandate thresholds/format, whether LHDN legally requires clearance
  vs. an attestation model is reachable, governing IFRS/MFRS clauses, PDPA constraints. Doc says outright: "Until
  filled, Pillar 3 stays DESIGN-ONLY." **Scope:** a research-only session (WebSearch/deep-research, NOT code) that
  sources + cites each item; only once cited can real statutory brackets replace the demo pay-element rates P7
  renders. Flag to the user that regulatory compliance design needs professional verification before any public
  claim — do not assert compliance on the project's behalf.
- **⛔ STILL BLOCKED (unchanged, not actionable standalone):** ERP/HR dotted-line integration (agreement/product/AR
  · attendance/access) — lights up only once ERP/HR are loaded together; swap the connector stubs then.

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
