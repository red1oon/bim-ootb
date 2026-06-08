/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */

# ERP OOTB — iDempiere Application Dictionary in a Browser

## Overview

iDempiere's Application Dictionary (AD) is a metadata-driven UI framework:
windows, tabs, fields, menus, validation rules, and display logic are stored
as database rows rather than code. Editing a row in `AD_Field` changes the
rendered UI with no recompilation.

This document describes running the AD client-side. The AD metadata is
exported from a live iDempiere PostgreSQL instance, loaded into SQLite via
[sql.js](https://sql.js.org) (SQLite compiled to WebAssembly), and rendered
by a JavaScript AD interpreter — with no JVM, PostgreSQL, OSGi, or server
process. The construction-project bridge (`C_Project`, see
[SpatialERP_OOTB.md](SpatialERP_OOTB.md)) is one menu node within the full
AD tree. Scope and limits are stated in [§10](#10-scope-and-status) and the
prior-art comparison in [DistributedERP.md §10](DistributedERP.md#10-comparison-with-related-systems).

---

## Companion documents (the ERP map)

The secured/distributed thinking and its proofs live in dedicated sub-docs — read in this order:

| Doc | What it holds |
|---|---|
| **[DistributedERP.md](DistributedERP.md)** | The contention map — the **two truths** + *server→serverless* mapping (§0), normal multi-POS day (§3), the guard set (§4), the one real-time op-class (§5), the **dumb facilitator** (§6), determinism (§7), accounting-as-reconciler (§8), the **edge-scenario adversarial suite** (§9), **how we differ on this turf** (§10), and **[sharding the engine by gravity](DistributedERP.md#13-sharding-the-engine-by-gravity-what-arrives-and-when-2026-06-01-spec)** (§13 — op-log mass as the LOD metric; what arrives, and when). |
| **[LocalFirstPriorArt.md](LocalFirstPriorArt.md)** | How Replicache / ElectricSQL / PowerSync / LiveStore / CRDTs do it — their documented weaknesses, our deterministic-verbs-both-sides lever, the honest shared pain. |
| **[EnablingTechTimeline.md](EnablingTechTimeline.md)** | The cited technology timeline — what made this possible when; the two compasses. |
| **[SpatialERP_OOTB.md](SpatialERP_OOTB.md)** | Spatial ERP — the browser-only ERP replacing iDempiereOOTB; §11.5 inventory/movement model. |
| **[BOM_ENGINE_SPEC.md](BOM_ENGINE_SPEC.md)** · **[DATA_MODEL.md](DATA_MODEL.md)** | The BOM recipe engine (the verb that compiles a building *and* backflushes a POS sale) + the 5-table bridge. |
| **[IDEMPIERE_2.md](IDEMPIERE_2.md)** · **[PLUGIN_ARCHITECTURE.md](PLUGIN_ARCHITECTURE.md)** · **[ENGINE_CONTRACT.md](ENGINE_CONTRACT.md)** | iDempiere 2.0 — the engine-as-data **model**, the **metadata-first plugin/manifest** (charge-model DR/CR→Acct + masters; no new skill to author), and the **engine↔UI seam** (`read`/`dispatch`/`manifest`/`verbs`/`verify` + role context — where owner/role-of-client is enforced). |

**Proofs (spec-first, witness-led; each witness asserts `replay-hash == live-hash` against a browser sql.js binding):**
- **Witnesses.** Six in-process witnesses pass: W-CHAIN, Merge/G-IDENTITY, W-OWNER/CAS, W-SIGN, W-PERSIST/email-recovery, lease-expiry/value-tiering. Each corresponds to one of the scripts listed below; the secured/durable phase frame is in [§0.20](#020-next-phase--the-secureddurable-axis-ui-poc-frozen-2026-05-31-spec--no-code-yet).
- **[scripts/erp_kernel.js](https://github.com/red1oon/BIMCompiler/blob/full/scripts/erp_kernel.js)** — the deterministic kernel; exercised by [poc_kernel.js](https://github.com/red1oon/BIMCompiler/blob/full/scripts/poc_kernel.js) and [poc_longtail.js](https://github.com/red1oon/BIMCompiler/blob/full/scripts/poc_longtail.js).
- The §9 witnesses, each doubling as the spec for its production change: [poc_chain.js](https://github.com/red1oon/BIMCompiler/blob/full/scripts/poc_chain.js), [poc_distributed.js](https://github.com/red1oon/BIMCompiler/blob/full/scripts/poc_distributed.js), [poc_sign.js](https://github.com/red1oon/BIMCompiler/blob/full/scripts/poc_sign.js), [poc_persist.js](https://github.com/red1oon/BIMCompiler/blob/full/scripts/poc_persist.js), [poc_policy.js](https://github.com/red1oon/BIMCompiler/blob/full/scripts/poc_policy.js), [poc_identity.js](https://github.com/red1oon/BIMCompiler/blob/full/scripts/poc_identity.js). W-CHAIN is implemented in `bim-ootb/viewer/kernel_ops.js` (`sealChain`/`verifyChain`/`setSigner`, v5).

See [§0.20](#020-next-phase--the-secureddurable-axis-ui-poc-frozen-2026-05-31-spec--no-code-yet) for the phase frame (witnesses W-CHAIN/W-SIGN/W-PERSIST/W-OWNER) and [§0.21](#021-g-identity-wired-into-the-kernel--identity-is-an-input-never-computed-2026-06-01-spec--identity) for the landed G-IDENTITY change.

---

## This document — section map

This is a long working document. It is layered from *why* → *what* → *how* → *limits*.
Read top-to-bottom for the argument, or jump by the band you need:

| Band | Sections | What it answers | Read this if you want… |
|---|---|---|---|
| **Orientation** | Overview · Companion documents · [Underlying structure](#underlying-structure-for-readers-familiar-with-idempiere) · [Views](#views-seeing-the-underlying-model) | What this is and why it's more than a port | the one-sentence thesis and the proven-vs-parked line |
| **The model** | [§0](#0-storage-model-decision-2026-05-29-chosen-path-c-the-bridge) and its subsections §0.1–§0.21 | The storage decision (the 5-table bridge), the rules engine, the op-log, the two spines, the diff-verified verticals, the long-tail seam, identity | the heart of the design — how a thousand tables become five and an engine becomes data |
| **The build** | §1–§9 | Concrete pipeline: AD→SQLite mapping, PostgreSQL export, the parser, the card-first renderer, HTML-native UI, the construction bridge, analytics, the channel, the landing page, the phases | to reproduce or extend the toolchain |
| **Scope & architecture** | §10–§17 | Honest scope/status, the three-layer split, the 5-table foundation, the compiled manifest, kernel gravity, the known monsters, schema coverage, the architecture summary | the boundaries and the risk register |
| **The unified model** | §18 | BOM + WfMC on one log; document-as-event; the oracle that validates handlers | the theoretical spine that ties it together |
| **Performance** | §19 | Transaction cost vs iDempiere — analytical, apples-to-apples; the side-by-side win/trade/extra table | where it wins, where it trades, and the extra it pays |
| **Status** | [§20 Addendum](#20-addendum-prototype-status-and-the-role-of-the-ui-views-2026-06-01) | Prototype status; the three UI views as fast POCs; the roadmap | a plain statement of how finished this is |

> **§0 has 21 subsections** because it is where the design was actually derived,
> dated and witnessed in sequence. It reads as a worklog: each `§0.N` records one
> decision and the witness that closed it. Skim the headers first; descend only into
> the ones you need.

---

## Underlying structure (for readers familiar with iDempiere)

> For readers from an iDempiere background, the premise is already familiar. The AD
> demonstrates it: a window, tab, field, validation rule, and menu are not code — they
> are rows. "The application is data" is iDempiere's design, not a claim of this
> project. What follows is an account of what this project does differently, the
> reasoning, and what is proven versus parked.

### The one-sentence thesis
iDempiere made the **UI** data and left the **engine** as code (the `M*` model
classes, doc processors, callouts, the workflow/accounting/costing engines, OSGi).
This project pushes the *same bet one layer deeper*: **the engine becomes data too**
— the document lifecycle, the matchers, the accounting postings, even *where the
work concentrates* — extracted into a structure small enough to render, run, replay,
and explain **itself** in a browser, with **zero hand-authored glue** (the
extract-only rule, §0.1). Glassbowl is that structure made visible.

### What actually collapses (and why an AD veteran should care)

| In iDempiere you know… | …here it becomes | The merit |
|---|---|---|
| **~a thousand tables**, each an `M*` class | a **5-table runtime** (`containers`, `items`, `documents`, `document_lines`, `journal`) + a `doc_type` discriminator (§0) | one storage shape the whole catalogue maps onto — **98.4 % of business edges mappable, hub `C_Order` still #1** (witness §5TBL). The schema stops growing with the feature list. |
| **`completeIt()` across dozens of models** | a handful of **pure verbs** `(doc,ctx)→ops[]` — `completeOrder`, `createShipment`, `createInvoice`, `allocate`, `match` | the O2C / P2P verticals reproduce the **GardenWorld oracle exactly** (§VERTICAL, §ORACLE-SUITE); GL is structurally mapped but not yet data-verified (§0.17) — and the long-tail document ships **matcher-free**, the matcher *composing in* only at the buyer-reconciliation gate (§0.19). Less engine, not more. |
| **Modules you install & activate** | **hot vs. cold cells** of a `(doc_type × doc_status)` grid; 155 stay dormant | "the whole platform is already here, dormant — it turns on the moment you use it." Nothing to install; **op-log gravity self-ranks** where the work really is (`C_Invoice` #1 = the settlement spine, §0.13/§14). |
| **thousands of foreign keys** | **4 structural roles** — containment / derivation / settlement / reference (the "two spines") | the map reads at a glance: green **derivation** = the easy everyday O2C flow; red **settlement** = matching & reconciliation, where money — and mistakes — concentrate. Classification is **derived, 0 hand-authored** (witness §GLASSBOWL). |
| **AD_ChangeLog + an audit trail bolted on** | **`kernel_ops`** — every state change a rich op (payload + actor + **before/after** + lineage), replayable | the audit log **is** the source of truth: replay rebuilds the projection from the op-log alone (hash-match). History, undo-preview, and the future write-loop all read the *same* log. |
| **Two logins** — System Admin (the dictionary) vs. a client like GardenWorld (the rows) | **one canvas** — the §0.18b duality fused | click the `C_Invoice` *type-cell* (admin view) and its real invoices (`#200001 = $100.70`) surface right there (operator view). The **trace** is where the two layers meet: a type-level FK spine lit by one instance's journey. No tab-switching, no second login. |

### Why this is more than a port
A port would re-skin those ~thousand tables in a browser. This **re-bases** them. The merit
is not "iDempiere without a JVM" (though it is also that — SQLite WASM, sql.js, no
PostgreSQL/OSGi/server); it is that the engine is now **inspectable as data**, so it
can do the things a code-engine structurally resists: surface *everything about one
entity in one place*; ship *dormant and self-activating*; **draw its own map** of
where value and risk pool; and — the parked endgame — let you **edit a rule and watch
the affected records flip on that map** (the diff-oracle in the browser, §2d-3).[^grail] That
last step turns the map of the engine into the *console you run the engine from*.

[^grail]: **The elusive Holy Grail this project is after.** See [HolyGrail.md](HolyGrail.md) — the author's account (as ADempiere's founding leader) of why editable-rules-live was structurally out of reach inside a code-engine ERP, and why this paradigm reaches it.

### Verification discipline (extract-only)
The same principle the AD embodies — declare rather than hand-write — is applied here
as **extract or compile only**: every node, edge, rule, row, op, and rendering
parameter is read from `ad_full.db` / `erp_rules.db` / `kernel_ops`, not invented. A
value with no source is recorded as a finding rather than guessed (for example, with
GL `fact_acct=0` the Accounting view reports "not posted in this dataset" instead of
synthesising a posting). Consequently the running views render from the source data
directly rather than from a separate mock dataset.

### Proven vs. parked (no overclaim)
- **Proven, witnessed:** AD→manifest compile; the 5-table bridge (§5TBL); the
  diff-verified O2C/P2P/GL verticals + matcher-free long-tail (§0.17–§0.19); the
  runtime kernel + replay (§0.16); Glassbowl rendering the engine from data alone,
  with the lifecycle trace, dossier, real rows, and op-log History (§GLASSBOWL).
- **Parked behind T3 (write-loop, `push=live`, explicit go):** editing rules/records
  in place, the live rule-impact preview, the on-screen keyboard / view-back input.
  Today's surface is **read-only**; the greyed CRUD and the History undo-preview are
  the honest *seam* to that next step, not the step itself.

*Read on for the storage decision (§0), the cell model, the kernel, and the
diff-oracle that holds it all to the GardenWorld truth.*

---

## Views — seeing the underlying model

The model below (the 5-table cells, the FK spines, the kernel op-log, the rule
tables) is not just storage — it is **the thing the views render**. Each view is a
different *projection of the same extracted structure*; none carries its own data.
Two are built today, both **read-only, extract-only, 0 hand-authored**, both in
`bim-compiler` and served from the BIMCompiler Pages site (they touch nothing in
`bim-ootb`/live). They are how an iDempiere mind *looks at* the §0.18b duality.

### View 1 — Glassbowl (`docs/glassbowl.html`) — the engine, mapped
**What it is:** the engine rendered *from itself* — bubbles are the **cells**
(§12 5-table foundation, §0.7 self-graphing), the lines between them are the **FK
spines** (§0.13 the two spines — derivation green, settlement amber, reference
behind). Spec: `docs/GLASSBOWL_DOSSIER.md`; prior art `docs/GLASSBOWL.md`.

**How it uses the model — every surface traces to a model section:**
- **The map** = the FK graph of `ad_full` collapsed onto the cell layer (§0.7). A
  bubble *is* a `C_*` type-cell; an edge *is* a real foreign key, classified by spine.
- **The trace** = a lineage walk down the derivation spine (§0.6 op-log lineage,
  §0.19 long-tail): pick `C_Order` and its real journey
  `Order → Shipment → Invoice → Payment → Allocation` lights as **one instance's
  path over the type-level spine** — the §0.18b two-logins-fused moment made literal.
- **The dossier** (Data / Rules / Columns / History) = the 5–7 iDempiere windows
  fused: **Data** = real rows from `glassbowl_data.db`; **Rules** = `erp_rules`
  validation SQL (§0.5, §0.8); **Columns** = `ad_column`; **History** = the
  `kernel_ops` op-log with before/after (§0.6, §0.16) as a read-only undo-preview.
- **The eye candy** (orbit depth-planes, swipe picker, WebAudio, QR scan, mobile
  handle) maps to data, never decoration: planes come from spine role, audio pitch
  rises per real lineage hop. *Spectacle on the surface, substance underneath.*
- **Witness:** `§GLASSBOWL-WIRING 85/85`, gen `§GLASSBOWL/§LIFECYCLE/§ORBIT PASS`,
  `hand=0`. Live + proven (deployed commit `e2d6702d`).

### View 2 — Glassbowl Gravity (`build/erp/glassbowl_gravity.html`) — the engine, *weighed*
**What it is:** a focused companion view that distils ONE claim — *legacy ERP makes
you build a report; this engine presents itself.* Three knobs, every number a **live
`GROUP BY` over the 8 real GardenWorld orders** (extracted from `glassbowl_data.db`,
0 invented). Built as a separate file precisely so the loved Glassbowl stays untouched.

**How it uses the model — the three knobs ARE three model facets:**
- **Pivot (lens)** = the analytical substrate (§0.6 op-log as analytical store, §0.7
  graph/pivot view). Flick `Partner · Month · Status · Type` and the population
  re-blooms — a literal `GROUP BY` re-run client-side over real rows, the friendly
  name kept, the facet value riding under as a subtitle. Customer-vs-vendor colour
  comes straight from `issotrx`, not assigned.
- **Gravity (measure)** = **kernel gravity** (§14 the op-log as constellation driver,
  §0.17 *gravity self-ranks `C_Invoice` #1*). Mass = count or `grandtotal`; the
  heaviest group is biggest and pulled to centre, deterministic (golden-angle, eased,
  no `Math.random` — replay-safe per the §0.16 discipline). *Position becomes earned.*
- **Depth dial (AD ↔ GW)** = the **§0.18b duality made a continuous control**: drag
  down to the **type/dictionary** layer (the 5-cell FK spine — what the engine *is*),
  up through the **instance/record** population, up again into one record's **real
  line items**. One gesture spans dictionary → records → lines.
- **The honest stop:** the trace lights *exactly as far as the FKs link it* — order
  `80001` runs full to allocation (`$98.50`); the others halt at invoice with a note
  saying **why** (no payment FK in this dataset). The extract-only rule (§0.17
  contained-set, §Non-goals "never fake one") shown as a feature, not hidden.
- **Witness:** `§GRAVITY orders=8 chains=4 hand=0`, plus `§PIVOT`/`§TRACE` on each
  interaction. Inlined totals reconcile to the DB to the cent (`$9,914.07`).

### How the views compare to BI tools
A BI/OLAP tool (PowerBI and similar) performs the same operations — slice, pivot,
drill — but over a decoupled copy that must be modelled first, and the drill path
terminates at detail rows. The Glassbowl views operate directly on the live engine
tables: the drill terminates at the operational document together with its rules,
workflow, and lineage (editing is parked, T3), and every displayed value is read
from the system's own structure rather than a separate analytical model. The
distinction is the data source (live engine vs. modelled copy), not the set of
operations.

**Parked (T3):** both views are read-only. Editing rules/records in place, the live
rule-impact preview (§0.4, §2d-3 in the Glassbowl spec), and writing through the depth
dial open with the write-loop (`push=live`, explicit go) — the greyed CRUD and the
History undo-preview are the honest seam, not the step.

---

## §0. Storage Model Decision (2026-05-29) — chosen path: (c) The Bridge

**Chosen:** 5-table runtime (`containers`, `items`, `documents`, `document_lines`,
`journal`) + `kernel_ops`. **AD is the compiler input** (→ `manifest.json`); the
runtime never touches `C_Order` etc. directly. `ad_data.js` is the **explicit swap
layer**, mapping every AD window to its 5-table slot via an `ad_table_map`
(e.g. `C_Order → {storage:'documents', docType:'PURCHASE_ORDER', fk_map:{…}}`).

**Why:** `Doc = Event` (§18.8) wants a `documents` table whose rows ARE the
event-bearing entities; the AD-faithful compiler (proven by §BOM_TEST) becomes
the front-end that feeds it. The bridge keeps the pivot auditable and reversible.

**Costs (recorded, not hidden):** storage schema rebuilt; `ad_data` CRUD rewritten
(<200 lines); the already-shipped real-table `erp.html` needs a one-time data
migration (not a UI rewrite); P0's manifest compiler **survives**, P0's wire-in is
partially redone.

**Validation GATE (discipline — do before any 5-table build):**
`scripts/test_5table_bom.js` must show the `ad_table_map` is **expressive enough**
to represent every edge §BOM_TEST classified (mapping-completeness, ~0 unmappable)
AND that the derivation hub ranking survives the table→`doc_type` collapse
(`C_Order` group still #1). Acyclicity is now a *runtime instance* invariant
(no document is its own ancestor via `source_id`), enforced by the kernel, not a
schema property. The §-log makes the call.

**Status:** P0 (AD-faithful manifest + wire-in) stays as the compiler front-end and
the interim shipped product until the bridge validation passes.

**Gate RESULT (witness: §5TBL, `scripts/test_5table_bom.js`, 2026-05-29):**
**98.4% of business edges mappable** (2,156 / 2,192); **hub `C_Order` #1, preserved.**
The residual 1.6% (36 edges) are slotting refinements for the real `ad_table_map`
(line-level junction/confirm/allocation records mis-slotted as `items` — e.g.
`M_MatchInv`, `M_MatchPO`, `M_*LineMA`, `C_LandedCost*` are all `document_lines`),
**not** expressiveness gaps. The gate **derived the minimal runtime schema**:

| Slot | + columns derived by the gate |
|------|-------------------------------|
| `containers` | `parent_id` (Site→Building→Floor) |
| `items` | **`parent_id`** — master data is recursive (Product→Category, Product→Price/Substitute) |
| `documents` | `source_id` (derivation lineage), `container_id`, `doc_type` |
| `document_lines` | `document_id`, **`source_line_id`** — lineage recurses to the line (InvoiceLine→OrderLine) |
| `journal` | Batch→Journal→Line; **entries only** (`Fact_Acct`, `GL_Journal*`). `GL_Category`/`GL_Budget` are accounting MASTER → `items` |
| + `kernel_ops` | the log |

Plus two rules the gate forced: **`AD_*` / `_Trl` / `RV_*` are compiler input, never
runtime** (§3); **citations are reference-ids in metadata-JSON, always representable.**
GATE = OPEN (residue is `ad_table_map` slotting, tracked into PB).

### §0.1 PB explicit slotting (resolves the 36 residual edges → unmapped=0)

The PV gate's heuristic dumped 32 tables into the `items` fallback (or the
`/Year|Project/` `containers` regex) when they are really lines / sub-documents /
junctions. The explicit `ad_table_map.js` (PB artifact 2) overrides them. Each
override is **extract-derived** — it resolves a specific unmappable edge logged by
`test_5table_bom.js` (witness: `/tmp/pb/unmappable_all.txt`, 2026-05-29) and is
confirmed against `DocStatus` membership (isDoc query, same date):

| Override slot | Tables | Why (the edge it fixes) |
|---|---|---|
| `documents` (sub-doc, `parent_id`) | `M_ProductionPlan` | groups lines under `M_Production`; no `DocStatus` so heuristic mis-slotted it `items`. `M_ProductionLine→M_ProductionPlan` then = line→doc. |
| `document_lines` (line / MA / confirm) | `C_InvoicePaySchedule` `C_OrderPaySchedule` `C_OrderLandedCost` `C_PaymentAllocate` `C_POSPayment` `M_Package` `M_InOutLineConfirm` `M_InOutLineMA` `M_InventoryLineMA` `M_MovementLineConfirm` `M_MovementLineMA` `M_ProductionLineMA` `PP_Cost_CollectorMA` `PP_Order_BOM` `PP_Order_Cost` `PP_Order_Workflow` `PP_Order_Node_Asset` `PP_Order_NodeNext` `PP_Order_Node_Product` `MP_Maintain_Task` `MP_OT_Task` `A_Depreciation_Exp` | child of a document (→`document_id`) or of another line (→`source_line_id`); parents confirmed `documents` by isDoc (`M_InOutConfirm`, `MP_Maintain`, `PP_Order_Node`, …). |
| `document_lines` (settlement, `match_type`) | `M_MatchInv` `M_MatchPO` `C_LandedCost` `C_LandedCostAllocation` | §18.2 three-way-match: a row LINKS ≥2 lines across documents — `source_line_id` to one line, counterpart line-ref in `metadata`, tagged `match_type`. An edge, not content. |
| `items` (master / link) | `R_IssueProject` `HR_Year` | not spatial containers — the `/Project|Year/` regex over-grabbed; both reduce to `items→items`. |

Two `representable()` refinements the explicit slots expose (the true 5-table
relationship set, not heuristic gaps): **(a)** a line citing master data
(`document_lines → items`, e.g. `S_TimeExpenseLine → C_BPartner`) is a metadata
reference — representable, same as the already-allowed `documents → items`;
**(b)** a document posting to the ledger (`documents → journal`, e.g.
`A_Asset_Addition → GL_JournalBatch`) is a posting reference carried in
`metadata`/`journal.source` — not a lifecycle derivation.

**2nd-order cascade (found by running the explicit gate, `test_bridge.js`):** moving
a table to `document_lines`/`documents` re-slots its *children*. 8 more tables
slotted: child lines `M_PackageLine` `M_PackageMPS` `PP_Order_BOMLine`
`MP_Maintain_Resource` `MP_OT_Resource` `C_OrderLandedCostAllocation` →
`document_lines` (→`source_line_id`); `PP_Order_Workflow` → `documents` (sub-doc
header that `PP_Order_Node` nests under); `HR_Period` → `items` (sibling of
`HR_Year`). **GATE RESULT (witness `§BRIDGE`, `scripts/test_bridge.js`, 2026-05-29):
`map windows=7 docTypes=49 unmapped=0`; round-trip/lineage/match all PASS; PB gate
GREEN.**

### §0.2 One engine — `doc_engine.js` reconciliation (resolved 2026-05-29)

There were two implementations of "the 5-table model": `schema_5table.sql` (PB,
AD-bridge) and `doc_engine.js` (the earlier **Spatial ERP POC** — `containers/items/
documents/document_lines/journal` + `StateMachine` + `JournalEngine` + construction
handlers, 79 tests). **Evidence (grep, 2026-05-29):** the POC's only consumer
`erp_panel.js` is loaded by **zero** HTML entries; the live `erp.html` references it 0
times. The POC (≈1,149 lines incl. tests) is **unreachable dead code** — its tests
pass but exercise a module nothing loads.

**Decision — canonical = `schema_5table.sql` (PB).** Not preference:
- It is the only schema validated against real data (§BRIDGE, 2,192 edges) and it
  **has the columns the full ERP provably needs** that `doc_engine` lacks
  (`source_id`, `source_line_id`, `match_type`, `parent_id`). Making `doc_engine`
  canonical would mean re-adding all of those — strictly more work for a worse start.
- `doc_engine`'s 5-state `StateMachine` is **superseded** by P2's `manifest.wfmc`
  (52 DocTypes, AD-faithful codes).

The POC is **retired as the P3b reference oracle**, not migrated column-by-column:
`construction.js` demonstrates the handler→effects pattern (structural template only —
its *content* is the construction domain, out of product scope §0.3), `JournalEngine`
shows journal-on-complete. The real P3b content oracle is the iDempiere Java
(`MOrder`/`MInvoice`/`MInOut`/`MPayment`, §18.10). `kernel_ops.js` stays the shared
module (BIM undo == ERP audit). The two-engine fork is closed; no live breakage
(nothing loads the POC).

### §0.3 Product scope — narrow O2C / P2P / GL / Inventory (2026-05-29)

The PB/PV gates proved the 5-table model is **expressive enough for all of iDempiere**
(a universality result — that's why the 37 overrides reach into the HR/manufacturing/
asset long tail). The **product**, however, is deliberately narrow: emulate iDempiere
for **Sales→Ship (O2C)**, **Procure→Receipt (P2P)**, **GL**, and **inventory storage** —
nothing more. So:
- **In-scope lifecycle tables / DocTypes:** `C_Order` (SOO/POO), `C_Invoice`
  (ARI/API), `C_Payment` (ARR/APP), `M_InOut` (MMS/MMR), `M_Inventory`/`M_Movement`
  (MMI/MMM) + `StorageOnHand` (§18.9), `GL_Journal`/`Fact_Acct` (GLJ). `M_MatchInv`/
  `M_MatchPO` for three-way match.
- **Out of product scope** (mapped for model-completeness only, NOT handler targets):
  manufacturing (`PP_*`), maintenance (`MP_*`), HR (`HR_*`), assets (`A_*`), projects.
- **P3b hot cells follow this spine:** `(C_Order,CO)`→derive `M_InOut`,
  `(C_Order POO,CO)`→receipt+`M_MatchPO`, `(C_Invoice,CO)`+`M_MatchInv`,
  `(C_Payment,CO)`+allocation, journal-on-complete, `M_InOut,CO`→`StorageOnHand`.
  This is exactly the hub-first ordering, now bounded.

**Adopted for free from the BIM viewer (shared, not rebuilt):** the **main pill** of
icons, and the **Settings JSON editor** (another session builds it — JSONs edited in
the standard accordion-table format). ERP's config (`manifest`, `clash`-style rules,
and the P6 signed-policy / handler-policy JSON) is editable through that shared editor,
so **P6 Rule Console reuses Settings**, and the AD accordion renderer and the Settings
editor **share the same table/accordion methods**.

### §0.4 Editable business rules — the SystemAdmin role (the differentiator)

**The pain in normal ERP:** business logic is hardcoded in compiled server code
(iDempiere's ~15k lines). Changing a rule needs a developer + redeploy; the change is
unaudited, irreversible, and can't be tried safely. We push as much as possible from
*code* into *editable metadata* a **SystemAdmin role** edits via the shared Settings
JSON accordion editor (§0.3). The split (this is §18.6/§18.7 made concrete):

| Layer | Where it lives | Editable by SystemAdmin? |
|---|---|---|
| **Cell legality** — which actions are valid from which status, per DocType | `manifest.wfmc` + `doctypes` (P2) | Yes (JSON) |
| **Field validation** — mandatory / readonly / displayLogic / defaults | `manifest` field contract (P0) | Yes (JSON) |
| **Posting rules** — account mappings per doc_type, debit/credit | a **policy JSON** (replaces `doc_engine`'s hardcoded `JOURNAL_RULES`) | Yes (JSON) |
| **Conditional flags** — `autoCreateShipment`, `creditCheck`, match `tolerance`, downstream-protection | a **policy JSON** (`scope:"global"` marked, §18.5) | Yes (JSON) |
| **Effect *shape*** — "Complete order ⇒ emit shipment + lines" | a P3b **handler** (`(doc,ctx)→ops[]`) | No — code, parameterized by the policy above |

**The honest boundary:** parameters, mappings, conditions, and which-action-when become
metadata; the *shape* of a novel procedural effect stays a handler. Trying to
metadata-ize arbitrary procedural logic rebuilds the complexity as a DSL (the classic
"configurable rules engine that's harder than code" anti-pattern). So handlers stay
small code; **everything around them is editable knobs.** Rule: a P3b handler must read
its knobs from the policy JSON, never hardcode them — so editability is built-in, not
retrofitted.

**Why ours is safe where normal ERP isn't:** because the op-log is the truth (event
sourcing), a SystemAdmin rule change is *itself a `kernel_ops` op* — auditable,
reversible, and **dry-runnable** (P6 Rule Console: edit policy → replay affected
documents → diff effects, before committing). Editable rules that can't silently break
production. (This depends on the op-log actually being replayable — see the foundation
note: ops must carry enough payload to rebuild the projection.)

**Positioning — this was once the domain of Drools/BRMS.** Externalizing business
rules into editable, declarative, safe-to-change artifacts is the exact ambition of
heavyweight rules engines (Drools/JBoss BRMS, the KIE workbench, DRL/decision tables).
Those needed a JVM, a server, Rete expertise, and rule-ordering/conflict-resolution
(salience) — and the generality became its own complexity monster, often harder to
reason about than the code it replaced. It is **more achievable today, and simpler,**
for four reasons, and only if we hold one line:
1. **We don't build a general inference engine.** Rete matches arbitrary rules in
   arbitrary order — that generality is the cost. We metadata-ize only *knobs and
   dispatch*; effect shapes stay handlers (§0.4 boundary). Small, tractable surface.
2. **Cell decomposition replaces conflict resolution.** Drools' hard problem is "which
   rules fire, in what order." Our state-machine-per-DocType makes dispatch
   deterministic: the cell `(DocType,status,action)` selects exactly one handler + its
   policy. No Rete, no salience.
3. **iDempiere already did the declarative modeling.** The AD is a 60k-row metadata
   dictionary; we *compile* it (P0/P2), we don't reinvent it. Half the "rules engine"
   already exists as data.
4. **The op-log gives safety Drools never had** — change-as-op, replay, dry-run, undo.
   In-browser, local-first, ~150-line kernel — no JVM, no workbench.

**The one line to hold:** the temptation is to drift *into* Drools — make handlers
themselves data, build a DSL. That rebuilds the monster. The §0.4 boundary (handlers =
code, everything around them = editable metadata) is the discipline that keeps this
grand-but-shippable. Achievable **for the narrow spine today** (§0.3); the long tail is
incremental, not a prerequisite.

> **Thesis (§0.4–0.7).** ERP was always the *hard rules monster* — logic hardcoded,
> changes dangerous, analytics bolted on. Here it becomes a **smart rule assistant:
> deterministic, without AI intrusion, in a closed controlled environment.** "Smart"
> comes from the op-log (statistics over real actions — frequencies, recurrence,
> outcomes), NOT from an LLM. So the assistant *suggests and explains*, the human
> *decides*, dry-run *proves* — every step reproducible, auditable, and offline. No
> hallucination, no nondeterminism, no data leaving the tab. The PRIME DIRECTIVE
> (Deterministic · Non-invent · Extract) holds all the way up to the rules layer.

### §0.5 The rules engine — per-cell decision tables

The concrete shape of §0.4's editable policy. NOT Rete/DSL/inference — a **decision
table per `(DocType, status, action)` cell**. The cell decomposition already removed
the hard part (ordering/conflict/salience): within a cell there is no rule graph, just
rows. Each cell has:
- a **fixed menu of named effects** — *code* handlers (`createShipment`, `postJournal`,
  `allocatePayment`, `creditHold`, `matchThreeWay`; ~6–10 for the whole §0.3 spine).
  Users pick from it, never write it.
- an **editable decision table** (policy JSON): rows of
  `when: [[field, op, value], …]` (AND within a row, first-match across rows) →
  `then: [{effect, params}]`. `value` may be a literal or a `@policy-ref`
  (`@CreditLimit`, `@AR`) so mappings are defined once.

The engine is **one ~50-line evaluator**: for the cell, walk rows, eval `when` against
the document, dispatch matched `then` effects → `ops[]` → kernel applies. Democratised
because (1) it's a *table* rendered in the shared accordion-table UI (§0.3), (2)
conditions use the document's own field names, (3) effects are a dropdown, (4) it can be
authored/round-tripped in **Excel** (`excel.js`/SheetJS already ships). Safe because the
predicate language is tiny and non-Turing-complete (`= ≠ > ≥ < ≤ in empty`; field /
literal / `@ref`; no functions, loops, or arithmetic) → statically checkable; and every
table edit is a `kernel_ops` op → **dry-runnable** (§0.6) and undoable. **Boundary:** the
table *selects and parameterizes* effects; novel computation (an allocation algorithm)
stays a named handler the table calls.

### §0.6 The op-log as analytical + rule-feedback substrate (the keystone)

`kernel_ops` is already audit + undo + sync substrate + gravity (§14). It is *also* the
**analytical store** — no bolt-on warehouse/ETL (the normal-ERP analytics pain). Every
action is a timestamped, typed, parameterized event with actor + input/output GUIDs
(`commitOp` already carries `timestamp, op_type, parameters, input_guids, output_guid`).
So in-browser over `kernel_ops`:
- **Optics** — frequency per `(DocType, action)`, where users hesitate or **undo** (undo
  is an op), who does what.
- **Flow / cycle-time** — order→ship latency, receipt lateness, approval lag = timestamp
  deltas along a lineage.
- **Budget / forecast** — journal ops are the *actuals*; budget is policy metadata;
  variance is one query. Forecasting reuses the **dry-run replay** machinery (P6): a
  forecast is replaying *hypothetical future ops* forward — same engine that dry-runs a
  rule change.

**The closed loop (preemptive, not after-the-fact):** the log *mines candidate decision
rows* — "credit holds from BPartner Y are approved 100% → suggest auto-approve"; "users
undo this auto-shipment 40% → flag the rule as wrong"; "these monthly manual journal
corrections recur → suggest an auto-posting rule." Flow: **log → suggestion → dry-run →
human commit.** P4 gravity reaches its full form: not just "what's hot" but "what rule
should exist." Disciplines: **suggest, never auto-apply** (human-in-loop = safety AND
democratisation); **explainable simple stats, not an ML platform** (frequencies,
recurrence, conditional-outcome rates, cycle-times — readable by a user).

**Keystone:** editable-safe-rules, analytics, forecasting, AND sync all share ONE
dependency — **the op-log must be rich** (payload + actor + before/after + lineage
GUIDs). Thin `{table,id,action}` ops (PB's current usage) support none of it; the
`commitOp` schema already *allows* rich ops — we just must *use* them. This elevates
"make the op-log real" from a P4 detail to the **foundation** the rest stands on.

### §0.7 Every model is self-graphing (Odoo-like — and more)

Like Odoo, every model can switch from its accordion-table view to a **graph/pivot
view** with no per-model code. We already have the asset: `ad_charts.js`
(`renderOverlay(db, tableName)`, `drawBar/Pie/Treemap/Completeness`, canvas, DPR-aware)
and the 📊 Charts entry in `ad_ui.js`. The generalisation: **derive the measures and
dimensions from the compiled manifest field types** (P0) — `amount`/`number`/`qty` →
measures; `list`/`yesno`/`tableDirect`/`date` → group-by dimensions — so any model
graphs itself automatically, no `getPrebuilt` curation needed.

**The "more" Odoo can't do natively** (because ours is event-sourced, not a state
snapshot): **temporal** views (how this model evolved over time, from the log),
**flow/funnel** views (the document lineage `order→invoice→payment` straight from P2's
derivation graph), **cycle-time** and **undo-rate** charts (the rule-grading of §0.6
rendered as graphs), and **forecast** overlays (dry-run forward-replay). Same renderer,
the log supplies a time axis Odoo's aggregations don't have.

### §0.8 Surfacing the hooks + the right to touch rules

iDempiere already separated **hook-point from behavior**: `AD_Column.Callout` names a
Java method that fires on field change; `ModelValidator` / DocEvent registers a Java
class that fires on a document action. The *binding* is declarative metadata in AD; the
*behavior* is opaque compiled Java — visible only to, and editable only by, a coder.
This is precisely the cell→handler dispatch we generalise: Callout = a field-change
cell, DocEvent = a `(DocType, status, action)` cell. **We make both halves visible:**
the parameterisable part becomes an editable decision table (§0.5), the computational
part a named handler (§0.4), and the binding is *already in AD* so we compile it as the
cell→handler wiring.

**Concrete extraction gap (TODO for P3b):** our current `ad_seed.db` **stripped
`Callout`** (the §1 column-subset) and never exported `AD_ModelValidator`. Re-export
both from the source PostgreSQL (docker, §1). Compiled, the Callout/Validator strings
are simultaneously **(a)** the cell→handler wiring, **(b)** the P3b backlog (*where
logic exists* — cross-referenced with op-log gravity §0.6 for *where it matters*), and
**(c)** the §18.10 oracle pointers (*which Java to port*). What survived the strip and
helps now: `AD_Val_Rule_ID` + `ValueMin/Max` (declarative validation), the `ad_wf_*`
workflow graph (a second declarative process source beside P2's WfMC), and the full
role/access layer (below).

**Capability-first — the fundamental right is structural, security is a later layer.**
Because a rule is just editable metadata behind the accordion editor, **the right to
touch rules is granted by default** — not gated behind a permission system we must build
first. iDempiere's default is "locked unless you're a coder"; ours flips to "open unless
an implementor restricts it." Security is an **additive** layer implementors add later —
and its metadata is **already present** (`ad_role`, `ad_document_action_access`,
`ad_table_access`, `ad_window_access`): compile those into "who may edit which rules /
fire which actions" when needed, without touching the foundation. Same graceful shape as
everywhere else: capable/open by default, narrowed by additive policy. The fundamental
right comes first; the lock is optional and comes second.

### §0.9 The rule mechanism — metadata, preset, always editable (JSR-223, PWA-native)

**Governing principle: model everything as metadata.** Business logic is not hardcoded;
it is a **rule record** in the dictionary — iDempiere's own `AD_Rule` pattern, confirmed
in source (`MRule.java`: `RULETYPE_JSR223ScriptingAPIs`, `SCRIPT_PREFIX="@script:"`,
engine-by-name, `setContext()` injecting the record/context as script bindings). A rule
is `{ eventType, form, body, binding }`:
- **eventType / binding** — the cell hook, straight from iDempiere: a **Callout**
  (field `onChange`, bound to a column) or a **DocEvent** (a `ModelValidator` TIMING —
  `BEFORE/AFTER_PREPARE/COMPLETE/VOID…`, bound to a `(DocType, action)` cell).
- **form** (how the body is expressed) — a tier, all metadata-housed:
  - **SQL** — runs *natively* in sql.js (the common ones you wrote in SQL translate
    1:1, no port — a real win); for set-based validation/lookup/derivation + `AD_Val_Rule`.
  - **expression (JS)** — sandboxed; per-record value-derivation + predicates. Your
    Groovy/BeanShell scripts port here; JSR-223's engine abstraction is *unnecessary* —
    the browser host language IS JavaScript, so the rule language = the runtime language.
  - **decision table** (§0.5) — declarative which-effect-when sugar.
  - **named handler** — the side-effecting / heavy-procedural 20% (e.g. `completeIt`'s
    `createShipment`/`createInvoice` fan-out). Side-effect rules become handlers that
    **return ops**, never mutate directly.
- The three rule kinds you confirmed map onto the tiers: **derivation** → SQL/expression
  (Callout), **validation** → SQL/expression predicate+message (DocEvent BEFORE_*),
  **side-effects** → named handler returning ops (DocEvent), parameterized by policy.

**Authored by power-users/consultants (your answer)** — so the SQL/expression tier *is*
the democratisation layer (not core-dev work); tables serve the simplest cases, handlers
the implementor/dev cases. Capability-first (§0.8) means every rule ships editable.

**Preset the common rules, always editable.** The system is *batteries-included*: it
ships the proven common rules **extracted from iDempiere's model logic** — and that
logic is *already metadata-driven*, which is why presetting works. `MOrder.completeIt()`
(source, confirmed) fans out conditionally on `C_DocType` flags
(`isAutoGenerateInout`, `isAutoGenerateInvoice`, `DeliveryRule`, `DocSubTypeSO`,
`evalAutoGenerateInOutRule`) and fires `fireDocValidate(BEFORE/AFTER_COMPLETE)`. So a
preset = {those DocType flags as editable policy} + {validation/derivation as
SQL/expression rules} + {the fan-out as named handlers}. Out-of-box working
O2C/P2P/GL/inventory; **nothing blank, everything editable.**

**Determinism sandbox (the one cost iDempiere didn't bear):** expression/handler rules
run with no `Date.now`/`Math.random`/network/DOM, timeout-bounded, pure over
record+context — so replay, dry-run, and the no-AI-nondeterminism thesis hold. SQL rules
are deterministic by nature.

**Oracle is local & confirmed:** `~/idempiere-dev-setup/idempiere/org.adempiere.base/
src/org/compiere/model/` (`MOrder`/`MInvoice`/`MInOut`/`MPayment`/`MMatchInv`,
`MRule`). P3b extracts presets from here (§18.10). **Extraction TODO grows:** re-export
`AD_Rule` + `AD_Val_Rule` + `Callout` (+ the `C_DocType` policy flags) from the source
PostgreSQL — currently stripped from `ad_seed.db` (only dangling FK ids survived).

### §0.10 Building it — raw migration first, then the Rule Compiler

**Step 0 — raw PG→SQLite migration (mechanical, faithful, do this first).** We already
*have* it all: the iDempiere PostgreSQL DB (full AD + config + `AD_Rule`/`AD_Val_Rule`
scripts + `Callout` + `C_DocType` flags + `AD_PrintFormat` + `RV_*` views) and the Java
source. Don't build a clever extractor against PG/Java — first **migrate the whole PG
DB straight into "SQLite speak" as a separate cluster** of SQLite files. SQLite's loose
typing makes the bulk (tables + data + the rule *scripts*, which are just text columns)
near-mechanical; the flagged subset that needs care: **sequences** (drop — §5 forbids
MAX+1 anyway), **stored functions/triggers** (skip — logic lives in Java/rules, not
data), and **`RV_*` views** (translate the PG-specific SQL, or snapshot, or defer). The
**Java is NOT migrated** — it can't be; it stays the §18.10 oracle for hand-porting
handlers. Output: a raw, complete `ad_full` / `erp_rules` SQLite cluster the PWA's sql.js
reads directly. This also *supersedes* the "selectively re-export the stripped columns"
TODO (§0.8/0.9) — migrate everything raw, decide what to use later.

*Working principle (aligned with the onset).* `ad_seed.db` was already a PG→SQLite
export (§1), just stripped; Step 0 is **the same proven pipeline run complete** (raw, no
strip). And it's incremental by design: get the faithful raw corpus in, then
**refactor/compile as we go** — expect **several iterations before the better model and
the right separation emerge.** Don't perfect the compiler or the cluster boundaries
before the data exists; let the clean separation reveal itself through use (gravity,
§0.6) rather than be designed up front.

**Step 1 — the Rule Compiler** (analyser, the rules analogue of `compile_manifest.js`)
now reads **local SQLite** (not PG, not Java — much easier, like P0 already does) and
*places* the logic as §0.9 rule records. Two sources, two honesty tiers:
- **AD metadata (auto-extractable, deterministic):** `AD_Rule` scripts, `Callout`
  bindings, `AD_Val_Rule` SQL, `C_DocType` policy flags, the `ad_wf_*` graph → emitted
  directly as rule records (SQL/expression/table forms + policy). This is pure
  extraction — safe to automate.
- **iDempiere Model Java (NOT auto-translatable):** procedural bodies like
  `completeIt()`'s fan-out **cannot be safely machine-translated** to JS — that's the
  §18.10 hand-port, verified by the diff-oracle. So the compiler instead **emits the
  handler backlog**: which cells have logic (from the Callout/Validator/DocType
  bindings) + the oracle pointer (class/method) + the gravity rank (§0.6), and scaffolds
  handler **stubs**. Humans fill the bodies, hottest cell first. *Auto-extract the
  declarative/script/flag layer; hand-port the procedural layer — never pretend the
  latter is automatic.*

**Separate, streamable store.** Output is a distinct **rule DB** (name it `erp_rules.db`
to avoid colliding with the BIM pipeline's product-catalog `ERP.db`), kept OUT of the
slim instant-load manifest. Reusing the proven split-DB pattern (lazy-fetch +
IndexedDB cache, as `panels.js`/buildings already do): **fetch a cell's rules on first
use, cache only the used ones** — gravity (§0.6) ranks what to preset/cache. The long
tail stays remote until touched (the Objective's "reference, lazy-loaded" principle).

**The "abstract engine" = the runtime rule evaluator.** One uniform interface that
dispatches by `form`: SQL → run in sql.js; expression → deterministic JS sandbox;
table → the §0.5 matcher; handler → the named fn (returns ops). The kernel calls it at
each cell; it never cares which form a rule took. The compiler SEEDS `erp_rules.db` with
the presets; the Settings editor edits them; every edit is a `kernel_ops` op (§0.6).

### §0.10a Master-data first-mile — the migrate ShowMe (master/metadata only)

*Spec for `prompts/MIGRATE_SHOWME_OVERLAY.md` — the THINNEST adoption step: take an
iDempiere operator from "my data is locked in a Docker Postgres" to "my master data is
in my browser." A LATER ShowMe handles plugin **logic**, transactions, posting, and the
cent-perfect oracle-gate (§0.17). This section is master/metadata only.*

**Honest 2-part flow (never a browser→Postgres pipe).** A browser cannot open TCP to
Postgres:5432. So there are two touches:
- **The agent (local):** `scripts/migrate_pg_to_sqlite.js` (NOT forked) run by the
  operator with their own creds. It reads their PG and writes a master/metadata-only
  SQLite + a progress file.
- **The overlay (browser, `bim-ootb/viewer/`):** reuses the existing ShowMe/help layer
  (`docs/ReadMeShowMe.md`, `docs/HelpO2C.md`). It *guides* the user to the agent and
  *reflects* the agent's progress file. "Watch it stream in" = the overlay mirrors the
  agent's per-table log, not a live socket.

**Scope — DECIDED 2026-06-02 (widens the prompt's literal "allowlist / no plugins").**
The operator confirmed the line is **logic, not data**: take ALL AD metadata + masters,
*including custom/plugin-added metadata tables* (they are AD-defined, transaction-free);
defer only plugin **Java logic** (which was never in PG — §0.10 "Java is NOT migrated").
Concretely:
- **TAKE** (all clients, whole tables, no row filter): the headline master allowlist
  PLUS the full AD metadata corpus, custom dictionary tables included.
- **EXCLUDE**: operational data only — the **`docstatus` document tables** (82 in
  GardenWorld), their transaction **line/fact children**, accounting postings
  (`fact_acct*`), and runtime **logs/temp** (`ad_changelog`, `ad_session`, `ad_pinstance*`,
  `ad_wf_process/activity/eventaudit`, `t_*`). The agent computes this denylist by RULE
  (docstatus query + name patterns) and **logs the resolved exclusion set** for review
  (Log Mandate) — non-invent: the docstatus set is queried, the patterns are named
  iDempiere schema objects, no values are synthesized.

**Two-tier streaming (clean demo + completeness).**
- **Headline masters** (streamed visibly, one `§` line each — the overlay's "watch them
  land"): `C_BPartner`, `C_BP_Group`, `M_Product`, `M_Product_Category`, `C_UOM`,
  `C_ElementValue` (chart of accounts), `C_Charge`, `C_Tax`, `C_Currency`. Verified live
  in GardenWorld: 18 / 3 / 55 / 14 / 15 / 379 / 3 / 6 / 175 rows.
- **The rest of the metadata corpus**: taken into the resident DB, summarized in the log
  as `+N metadata tables` (not streamed line-by-line).

**Client discovery + auto-seek + confirm (the connect step).** The agent enumerates
`AD_Client` (id, name, and whether the client holds master rows) and emits it as JSON the
overlay renders as a picklist. iDempiere seeds **0 = System** (shared dictionary masters:
currencies/UOM/countries live here) and **11 = GardenWorld** (the demo tenant). Behaviour:
- If a **3rd (real tenant) client** exists, the agent **auto-selects** it — but the
  overlay **requires the user to confirm** before the run.
- If only 0/11 exist (the demo box), auto-select 11.
- Migration takes the master/metadata tables **whole** (all clients' rows) regardless of
  the selection — discovery is *informational* (which tenant am I looking at), not a row
  filter; masters across all clients are all AD metadata and safe.

**Instance identity (re-import must not clobber).** Each run is a local **instance** keyed
off the source `ad_client_id`. A local registry (`build/erp/instances.json`) records every
import `{instance_id, source_host, source_db, source_client_id, client_name, rows}`. On a
run whose `(source, client_id)` was already imported, the agent assigns the **next free
integer** as a LOCAL instance marker (re-importing GardenWorld `11` → `12` → `13` …) and
namespaces the output DB by it (`ad_masters_<instance>.db`) so repeated imports coexist
rather than overwrite. The marker is a **local counter only** — the migrated rows keep
their source `ad_client_id` untouched (no FK rewrite); the marker lives in the registry and
in `_migration_meta`. First import of client `11` → instance `11`; the next → `12`.

**Post-migration ReadMe (share/serve OUT — step 5, guidance over existing infra).** Reuse
the existing ReadMe layer + `share.js`/QR + the S284 self-contained-HTML (embed-db) path +
the off-grid `sw.js`. Two user stories, no new infra: **(a) send the file → identical DB
for anyone** — verifiable, not hoped: deterministic replay → same projection hash, signed
chain → tamper-evident (`verify`); **(b) put it online → it's served** from any static host
(GitHub Pages / OCI bucket), no backend.

**Witnesses (§-log first).**
- `§MIGRATE-CLIENTS found=[0:System,11:GardenWorld] real=[11] auto=11 confirm-required=Y`
  — discovery enumerates the PG clients and auto-seeks the real tenant.
- `§MIGRATE-AGENT source=<host/db> instance=<n> masters=[…] tables=N rows=R metadata=+M
  docs-skipped=Y plugins-logic-skipped=Y` — agent pulled ONLY master/metadata (documents,
  transactions, postings, logs excluded; plugin LOGIC deferred).
- `§MIGRATE stream table=C_BPartner rows=18 … table=C_ElementValue rows=379` — headline
  masters land per table (counts match the live PG).
- `§MIGRATE-INSTANCE source-client=11 reimport=Y instance=12` — re-import gets a fresh
  instance marker, prior import preserved.

### §0.11 Housed vs active — the full extent, hidden but callable

This resolves the apparent tension with §0.3 (narrow scope). **Two distinct things:**
- **PRODUCT scope (active, §0.3)** — what is *built, preset, handler-backed, and shown
  by default*: O2C / P2P / GL / inventory. A clean, modern, narrow ERP.
- **PLATFORM housing (this)** — the **full extent of iDempiere** is *housed*: all
  models, all rules, and the **set reports**, as streamable metadata in `erp_rules.db`
  — dormant but **callable**. The long tail isn't *excluded*, it's *not loaded yet*.

**This vindicates PB.** Mapping the *entire* dictionary — every table and edge, incl. the `PP_/MP_/HR_/A_`
long tail) was not scope-creep — it is the **housing**: PB *proved* the 5-table model
holds the full iDempiere corpus. Those long-tail rows sit dormant in the runtime /
`erp_rules.db` and stream in when touched (§0.10 lazy-fetch + gravity cache). **How they stream
— smart per-table, ranked by gravity:** each table is a shard; the manifest is sorted by op-log
gravity (tier 0 = the prefetched settlement spine; cold cells at the tail, fetched on touch).
Because gravity is a fold over op-log *traversal*, a hot table's walked FK neighbours **co-rank
and arrive with it** — the closure self-bundles, no banding needed; an unresolved FK draws a
*stub*, never an invention. Full spec: **[DistributedERP.md §13 — Sharding the engine by gravity](DistributedERP.md#13-sharding-the-engine-by-gravity-what-arrives-and-when-2026-06-01-spec)**.

**Reporting too — the "set ones."** iDempiere's preset reports are housed: `AD_PrintFormat`
/ `ad_printformatitem` (present in `ad_seed.db`) + the `RV_*` reporting views (correctly
*excluded from the runtime lifecycle graph* in P2 — they aren't documents — but kept as
**report artifacts**). The §0.7 self-graphing + these presets = the reporting layer;
modern artifacts (accordion, graphs, decision tables, op-log analytics) manage what
iDempiere managed with its legacy Java/ZK surface.

**The UX is progressive disclosure: "when an iDempiere user walks in."** A new user sees
the clean narrow ERP. A seasoned iDempiere user reaches for manufacturing, a specific
validator, or a standard report — and **it's there**, streamed and activated on demand,
familiar. The bulk is *hidden* (not in the instant payload, not cluttering the UI) yet
*callable* (lazy-stream + gravity-cache). **Narrow product, full platform** — the same
graceful-degradation shape as everywhere: minimal/clean by default, full depth on
demand.

### §0.12 Empirical validation — the Sales→Ship POC (2026-05-29, §POC PASS)

Steps 0 + 1 ran complete and we POC'd the **hard parts first** against the GardenWorld
oracle. Witnesses: `build/erp/{migrate,verify,compile_rules,verify_rules,probe,poc,poc_match}.log`.

**The diff-oracle needs NO live iDempiere.** GardenWorld already executed its
transactions, so the `M_InOut` / `C_Invoice` / `M_MatchPO` / `M_MatchInv` rows already in
`ad_full.db` **are** the oracle's output. We replay our logic on the *inputs* and compare to
those rows. (Live iDempiere is only needed to oracle *ambiguous* cases we don't have data for.)

What is now **proven**, not asserted:
- **Derivation** (`completeOrder` fan-out) reproduces the oracle's shipment/invoice lines
  *exactly* — built as **state + decision-table(C_DocType policy flags) + a tiny verb
  registry** (`createShipment`/`createInvoice`), NOT a ported `MOrder.completeIt`.
- **Settlement** (three-way match) reproduces the oracle **18/18** for both `M_MatchInv`
  and `M_MatchPO`, 0 missed / 0 extra — as a **constraint (partitioned JOIN + balance)**,
  NOT a ported `MMatchPO`/`MMatchInv` algorithm.
- **Frozen effects** (§18.8): editing a decision-table flag is forward-only — a new order
  changes, but **replaying the old order's stored ops reproduces the original shipment.**
- **The two probe gaps close cheaply**: a `@ctx@` resolver (176/331 validation rules need
  it) + a PG→SQLite dialect shim (`least`→`min`). With them, `sql=335 + policy=52` of the
  739 records are engine-serveable for free.

**Model-handling verdict (answers "do we hand-port 294 handlers?" — no).** The handler hell
collapses to **~8 effect-verbs + decision tables (derivation) + ONE generic matcher
(settlement)**. The 51 DocTypes share ~5 base-table model methods that differ only by
flag-driven fan-out — that difference is *data* (already extracted in Step 1), not code.

### §0.13 The two spines — where the ERP hell actually lives

The BOM insight (every FK is a containment or derivation edge, §18.1) is confirmed — but
the POC surfaced its crucial exception, **the third edge**, and *that* is the hell:

- **The BOM tree** — containment (header→line) + derivation (order→ship→invoice). One tree
  per document, parent/source pointers, deterministic replay. **Trivial; falls out for free.**
- **The settlement lattice** — `M_Match*`, allocation, costing, bank-rec, landed-cost. These
  are **"must-agree" edges that LINK ≥2 independently-grown trees**. A match node has **N
  parents** (the graph is a DAG, not a forest) — which is exactly why P2 had to exclude
  settlement back-edges to keep the lifecycle graph acyclic.

The decisive evidence: matched **vendor invoices carry `c_order_id = NULL`** — settlement does
not follow the order chain. A naive "same-order + product + qty" match scored **0/18**;
re-partitioned by the **trading-partner account (`C_BPartner_ID`) + document polarity
(vendor `V+`/`issotrx=N`)** it scored **18/18**. So:

> **BIM = pure BOM (containment + derivation). ERP = BOM + settlement.** The two spines have
> different organizing keys — the BOM tree is keyed by the document; the settlement lattice is
> keyed by the *partner account*. **The entire ERP hell is concentrated on the settlement
> spine** (the multi-parent DAG joins). Tame that and ERP is tamed.

This refines the tiering: the **usage tier** (active narrow / housed long-tail, §0.11) governs
*what to load*; the **spine tier** (derivation-cheap / settlement-costly) governs *where to
spend logic* — orthogonal axes, two concerns.

### §0.14 Everything is a predicate on an edge — GUARD vs GENERATE, one engine

Composing the BOM insight (relationships are typed edges) with the rule insight (Step 1: every
rule is `{binding, form, body}`) yields the whole runtime in one sentence: **a graph of typed
edges, each carrying predicates, all evaluated by one engine, dispatched by `form`.** Four
iDempiere mechanisms are the *same* primitive — a predicate bound to an edge:

| mechanism | predicate on which edge | polarity |
|---|---|---|
| `AD_Val_Rule` (331) | "this FK may point to rows WHERE …" (data guard) | **GUARD** → bool |
| role / `document_action_access` (2156) | "this **actor** may fire this action" (state-edge guard) | **GUARD** → bool |
| WfMC transition (22) | "this status→status is legal" | **GUARD** → bool |
| three-way **match** | "these two lines pair WHERE …" (settlement-edge *generator*) | **GENERATE** → ops[] |
| derivation verbs | "derive child document from parent" | **GENERATE** → ops[] |

Two refinements that keep it safe/deterministic: **(a) abstract body, typed binding** — the
body can be anything (`form` = sql/expression/table/handler), but the *binding* is typed on
three axes (which edge · what subject: data-row/line-pair/actor/state · when: the cell hook);
**(b) GUARD vs GENERATE** — a predicate either gates an edge (→bool) or produces edges (→ops).

**Access composes INTO the engine, not beside it (§0.8 made literal).** `ad_role_orgaccess`
*narrows the matcher's partition* (you may only match within orgs your role sees);
`document_action_access` *gates whether you may run the cell at all*. Access is just more
predicates on the same edges — capability-first by default, narrowed by additive policy.

**The generic Detail⋈Detail matcher** (the prize). One parameterized function serves the whole
hard class — three-way match, payment allocation, inventory costing, bank reconciliation,
landed-cost — because they are all *line-set ⋈ line-set under a non-unique key*:

```
match = partition(BPartner ∩ role-visible-orgs)   // the settlement spine, access-scoped
      + key (product) + qty within tolerance       // the constraint
      + ordering policy (FIFO/LIFO/by-amount/…)     // disambiguation, EDITABLE knob (data)
      + greedy first-fit                            // deterministic
```

Proven: on real data it reproduces the oracle 18/18; on a synthetic *ambiguous* fixture the
ordering policy is a real deterministic knob (FIFO→earliest, LIFO→latest) and role-scope
narrows the partition and *overrides* the policy. One engine: match + ordering + access + guard,
all via data, never bespoke code. (Ambiguity oracle = FIFO/LIFO *spec*; real-data = iDempiere.)

### §0.15 The abstract engine, extracted — `scripts/erp_engine.js`

The §0.10 "abstract engine" is now a real, separated module — **pure, no DB binding imported;
the host injects `query(sql)→rows`**, so the *same core* runs under `sql.js` (browser) and
`better-sqlite3` (node tests). Exports: `resolveCtx`, `dialectShim`, `evalGuard` (GUARD),
`match`/`VERBS`/`completeOrder` (GENERATE). No `Date.now`/`Math.random`/DOM/network →
replay/dry-run safe (§0.9 determinism). This paid the separation debt (the engine had been
smeared/inlined across two probes); the regression — both POCs still green on the extracted
module — proves it is the same logic.

**Remaining debt (the next session's work):** (1) the matcher's partition/policy/access are
still passed as JS opts in the harness — **not yet LOADED from `erp_rules` policy JSON +
`ad_role`/`ad_role_orgaccess`** (the compile→engine wire); (2) **no kernel** applies + commits
the returned ops to `kernel_ops` (handlers return ops; they're diff-compared, not yet
committed/replayed through the log); (3) the engine lives in `bim-compiler/scripts` and must
**move to `bim-ootb` as the shared module** both BIM and ERP import, when wired. See
`prompts/ERP_RUNTIME_ENGINE.md`.

### §0.16 The wire + the kernel — data-driven evaluator and op-log kernel (2026-05-29, §WIRE/§KERNEL PASS)

The three debts of §0.15 are now closed for the O2C spine (witnesses: `build/erp/{poc_wire,poc_kernel}.log`; gate `verify_rules.log`):

**(1) The compile→engine WIRE (`scripts/erp_runtime.js` · §WIRE PASS).** A `loadCell(ruleQuery,
baseTable, action)` host layer sources EVERY engine opt from a rule record — no JS literals:
ordering ← `MATCHPOLICY:<cell>` (new editable seed, default FIFO logged), fan-out flags ←
`DOCPOLICY:<docTypeId>`, access scope (allowOrgs partition + may-run gate) ← `ACCESS:<roleId>`
(new Step-1 extension compiling `ad_role` + `ad_role_orgaccess` + `ad_document_action_access`),
guards ← `Validation` records bound to the table. Re-running Sales→Ship with zero JS opts kept
settlement **18/18** for both `M_MatchInv`/`M_MatchPO` and derivation exact. The editable-rule
loop is real: flipping the `MATCHPOLICY` body FIFO→LIFO **deterministically moved the pairing**
(`pairsChanged=1`); a role scoped to org {0} **emptied the matcher partition** (`match=0/18` —
access composes INTO the engine, §0.8); a role with no doc-action grant gave `mayRun=N`. The
rule compiler now emits **746 records** (matchpolicy=2, access=5 added); the gate `verify_rules.js`
extends `EVENT_TYPES` with `MatchPolicy`/`Access` and asserts the wiring inputs — PASS.

**(2) The op-log KERNEL (`scripts/erp_kernel.js` · §KERNEL PASS).** Handlers are PURE
`(doc,ctx)→ops[]` (read-only ctx, never a writable db); `Kernel.apply` applies each op to the
5-table projection AND commits a **RICH op** (payload + actor + before/after + lineage GUIDs —
the §0.6 keystone, witnessed: `§KERNEL rich-op actor=… payload.op=… lineage.out=…`).
`Kernel.dispatch` runs the §18.6 ladder — state-machine legal (P2 `manifest.wfmc`) → `evalGuard`
→ `Handlers.run` → `Kernel.apply`. The **violation guard** rolls back and rejects an out-of-log
write (`§KERNEL violation out-of-log-write=BLOCKED`, sneaky row gone). **Replay** rebuilds the
projection from `kernel_ops` ALONE with an identical hash (`§KERNEL replay projection==committed
HASH=…`), and **frozen effects** hold: editing the rule is forward-only — a new order under the
flipped policy doesn't ship, yet replaying the old order's stored ops still produces its original
shipment (`old-ship=3 new-ship=0 replay-old-ship=3`). Worked fixture `T_ORDER_SHIPMENT_ALLOCATION`
green end-to-end (shipment lines ARE the inventory fact — no inventory-mutation op; StorageOnHand
deduction exact; shipment-Complete no double-count; payment-Allocate → ALLOCATE edge + journal).
Deterministic (natural-key ids, ctx timestamps — no `Date.now`/`Math.random`), so replay is exact.
The prototype's `commitOp` shape is exactly what `bim-ootb/viewer/kernel_ops.js` already ALLOWS.

**(3) Relocation to `bim-ootb` — PARKED, awaiting go.** `erp_engine.js` + `erp_runtime.js` +
`erp_kernel.js` still live in `bim-compiler/scripts/`. Moving them into `bim-ootb/viewer/` as the
shared module erp.html imports (with `kernel_ops.js` NOT forking) is **T3 — push=live, no deploy
without explicit go.**

### §0.17 P3b BREADTH — the contained-set thesis, diff-verified across O2C/P2P/GL (2026-05-29, §ORACLE-SUITE 5/6 + §GRAVITY PASS)

The §0.12 thesis — *"the handler hell collapses to ~8 effect-verbs + decision tables + ONE
generic matcher"* — was on trial here against the **whole hot-cell scope**, each cell diffed
against the iDempiere oracle, not asserted on the one proven path. **It held.** Witnesses:
`build/erp/{diff_oracle,gravity_seed}.log`.

**The diff-oracle harness (`scripts/diff_oracle.js` + `diff_oracle_cells.js`).** Per hot cell:
register the PURE handler → dispatch the document-event through `Kernel.dispatch` (the §18.6
ladder) → normalise the emitted op-group + the GardenWorld oracle rows to a canonical effect set
→ diff. **The oracle is STATIC, not live (§0.12):** GardenWorld already executed every O2C/P2P/GL
transaction, so the `M_InOut`/`C_Invoice`/`M_Match*`/`C_Allocation` rows in `ad_full.db` ARE the
oracle's output — deterministic (no `Date.now`/sequence/id drift the live Docker path introduces).
**Live Docker iDempiere is the documented FALLBACK** for a cell the static data can't ground —
logged `oracle=NO-DATA(docker-fallback)`, never silently skipped.

**Six hot cells, each EXTRACTED from its Java oracle method (not ported):**

| cell | oracle | verbs | matcher | diff |
|---|---|---|---|---|
| `C_Order` SOO:CO | `MOrder.completeIt()` | `createShipment` | – | shipment **6/6** |
| `C_Order` POO:CO | `MOrder.completeIt()` (purch) | `completeOrder` | – | no-fanout **MATCH** |
| `M_InOut` MMR:CO | `MInOut.completeIt()` | setStatus | **Y** | M_MatchPO **19/19** + no-mutation |
| `C_Invoice` API:CO | `MInvoice.completeIt():2077` | setStatus | **Y** | M_MatchInv **18/18** + M_MatchPO **18/18** |
| `C_Payment` APP:CO | `MPayment`/`MAllocation*` | `allocate` | – | allocation **1/1** |
| `GL_Journal` GLJ:CO | `MJournal.completeIt()` | – | – | **dataless** (fact_acct=0 → docker) |

**Verdict — the contained set is sufficient:**
- **Settlement (the §0.13 "hell") = ONE matcher, ZERO new verbs.** M_MatchInv + M_MatchPO across
  *both* MMR:CO and API:CO are the same `E.match` (partition=BPartner, key=product, qty±tol) with
  opts loaded from data (`MATCHPOLICY`/`ACCESS`). No bespoke per-cell algorithm.
- **Derivation = `completeOrder` + a decision table.** SOO ships (DocType 133/135 `Y/Y`); POO does
  NOT (DocType 126 `isautogenerateinout=N`) — the *same* verb, behaviour flipped by a data flag.

**Two findings logged loud (the real output of a breadth test, §18.6):**
1. **The matcher RE-DERIVES what iDempiere reads off a FK** (documented divergence, §18.10).
   `MInvoice.completeIt()` follows the invoice line's own `M_InOutLine_ID`/`C_OrderLine_ID`; our
   generic matcher reconstructs the identical pairs from partner+product+qty — and additionally
   works when the FK is absent (invoice-before-receipt). It needs an **input-scoping** refinement
   (MMR match restricted to order-linked receipts, else 2 false positives from no-PO receipts that
   coincidentally share partner+product+qty) — that is caller *structure*, not a matcher change.
2. **Allocation is NOT the matcher class** (this REFINES §0.14, which had listed it there).
   Payment 100 (`PayAmt` 98.5) settles invoice 101 (`GrandTotal` 100.7) — a **partial, user-directed**
   settlement. The qty-equality constraint does not apply; it is reproduced by **following
   `C_Payment.C_Invoice_ID` + the existing ALLOCATE verb** (derivation-by-FK) — *cheaper* than
   3-way match, not part of the settlement-lattice hell.

**Kernel gravity seed (`scripts/gravity_seed.js`, P4 preview).** Ops stamped with their emitting
cell; one §14-weighted query self-ranks the backlog: **`(C_Invoice,CO)` is #1** (weight 56.0, 36
`MATCH` ops) — empirical confirmation of §0.13 (the settlement spine is where the logic concentrates).
155 cold cells stay unwritten and cost nothing (§18.6). The product compiles its own backlog from use.

**Kernel change:** added a `MATCH` op (the §0.1 `document_lines.match_type` settlement edge — the
GENERATE output of the §0.14 matcher) and extended `ALLOCATE` to carry `invoice_id`. The four
baselines (`§POC`/`§POCMATCH`/`§WIRE`/`§KERNEL`) all still PASS — no regression; the `MATCH` op
also round-trips through **replay** (live-hash == replay-hash, 39 match rows reproduced). GL posting
(`Fact_Acct`) is the one genuinely unwritten effect; it is dataless in this snapshot (async posting
not run) and routes to the Docker fallback — the honest edge of the static-oracle method.

### §0.18 Stepping back — what P3b means for the PRODUCT (not just the verification)

A post-P3b reflection (the in-frame review verified the harness; this asks whether the frame fits
the product). Three reframings that keep the next session sharp:

**(a) The kernel is NOT iDempiere server heritage — it is the spine BIM already chose.** The
temptation is to read kernel + matcher + dispatch as a faithful port of iDempiere's *server*
architecture and ask whether that is overkill for a single-user, no-concurrency PWA. It is not a
port: the kernel is ~150 lines replacing ~15,000, and it earns its keep on **three single-user axes
today** — (1) undo/redo + time-machine (the BIM viewer *already* ships `kernel_ops` for exactly
this), (2) deterministic replay / frozen effects (editable rules without corrupting history), (3)
it is the *same* op-log BIM committed to. Concurrency is the *fourth* thing the same log buys later
for free, not the reason it exists.

**(b) P3b surfaced the PRODUCT-TIERING line — this is the real finding, beyond "thesis holds."**
The data says the **entire long-tail flow is the cheap path**: `order→ship` and `pay→allocate` are
FK-following + decision tables (derivation-by-FK, §0.13 BOM spine). The expensive **settlement
lattice** (3-way match, costing, bank-rec, landed-cost) is the **buyer/pro tier** — the user who
reconciles PO↔receipt↔invoice. A lone operator's *"bought it, here's the bill, mark paid"* is
literally the allocation path P3b proved is **cheaper than the matcher** (§0.17 finding 2). This
maps onto the existing **usage tier (§0.11): active-narrow vs housed-long-tail** — so the seam to
**ship the cheap path to everyone and gate the matcher behind a pro mode** is already in the model.

**(c) The op-log IS an operation-based CRDT (CmRDT) — the correct sync substrate, vs state CRDT.**
For multi-user/server-side sync later (the question was raised explicitly), the SQLite-world options
split two ways: **state CRDT** (e.g. `cr-sqlite` — column-level LWW relations, WASM build, automatic
row merge) vs **op CRDT** (our `kernel_ops` — causal lineage GUIDs + parent pointers + deterministic
frozen replay, Git-style DAG merge per §18.5/§18.7). State CRDT auto-merges but **LWW silently
violates invariants** (two peers each "fully allocate" the same invoice → money lost). The op-log
carries semantic intent and concentrates the hard merges at the few **document-handoff seams**
(single-invoice-per-order, budget) where §18.7's *designated-owner node* / detect-and-reconcile is
the right answer. Verdict: **do not adopt a state CRDT as the foundation — that downgrades the
op-log**; reserve `cr-sqlite`-style LWW only for cold, invariant-free reference tables. The
document-event op-GROUP (§18.8) is already the atomic causal unit that ships and replays together.

**Open questions for the next session (not P3b blockers):** the editable-rules loop is proven for
*flag edits* (FIFO→LIFO, fan-out on/off) but NOT for a user **inventing a new DocType behaviour
needing a new verb** (that is the gravity-backlog path, §18.6 — write it when hot); the GL leg
(`GLJ:CO → Fact_Acct`) is asserted, not tested (the static oracle has no posted facts); and the
settlement cells dispatch the *universe* in one synthetic event rather than per-document (the count
is faithful only because partitioning is clean — a per-document dispatch would test isolation).

**(d) Enabling-tech timing — what gave us the edge, and when (so "are we too early?" is answered).**
The *market-timing* statement is canonical in `SpatialERP_OOTB.md §11.5` ("three technologies matured
2022–2024: SQLite WASM + Three.js r150+ + Web Payment Request API"). This note adds the one axis §11.5
does **not** cover — the **concurrency-layer** distinction, which is what the "too early?" question is
actually about. The recurring outside question is whether a browser-native ERP is *early* against the
immature SQLite-WASM **multi-tab concurrency** layer. It is not — because that layer is **not our path**. Our
window opened from three *mature* capabilities, and we deliberately route around the one still settling:

| Capability | Matured | Role here | Concurrency exposure |
|---|---|---|---|
| **sql.js** (Emscripten→WASM SQLite, **in-memory**) | ~2014, rock-solid | the DB we actually ride: load file → query in RAM → export whole file | **none** — single in-memory context, no OPFS access-handle contention |
| Official **SQLite WASM** build | beta late-2022 | reference / option; we do *not* depend on its persistent VFS | (would expose us if adopted — see below) |
| **web-ifc** WASM (browser IFC parse) | 2023+ | drop-IFC onboarding, IFC2x3+IFC4, 122K elements | n/a |
| **Three.js** r160 (Dec 2023) → r184 (Apr 2025); `BatchedMesh.addInstance` since r166 | 2024 | the *recent* enabler — 122K-element buildings / 1M-element cities smooth in a tab | n/a |

The layer that is genuinely *still settling 2023→2027* is **persistent OPFS multi-tab concurrency**:
`opfs-sahpool` (SQLite 3.43.0, 2023) is fast but has **zero** multi-tab concurrency; `OPFSCoopSyncVFS`
allows concurrent connections but single transaction; wa-sqlite's `OPFSWriteAheadVFS` (Apr 2026, Chrome
121+ only) is the first to allow reads parallel to a writer. **We touch none of it.** Persistence/sync is
the **op-log (`kernel_ops`, a CmRDT — see (c))**, not concurrent OPFS writes; IndexedDB caches the file
blob (our real ceiling is the ~1GB IDB record cap, already hit + fixed, not access handles). So the
"too early" framing rests on a false premise: we are **not** perched on the immature concurrency feature
waiting for Memory64/SharedWorkers — we ride 2014-era in-memory SQLite + a 2024-era 3D pipeline and treat
concurrency as the *fourth* thing the op-log buys later for free (per (a)). **Read the right way, that
immaturity is a first-mover *bonus*, not a risk:** the layer the field is still waiting on is the layer
we routed around — so its unsettled state is direct evidence we arrived ahead of the pack, not early
against an unproven bet (see `SpatialERP_OOTB.md §11.5`). The only move that *would*
expose us to the OPFS timeline is migrating off sql.js to a persistent VFS — a choice to make only when a
concrete need forces it, at which point the table above is the caveat list. (Verified May 2026 against
sqlite.org/wasm + powersync.com state-of-persistence; external version/date claims from the DeepSeek
analysis were largely fabricated and should not be cited.)

### §0.19 P3c — the long-tail vertical ships matcher-free; the matcher composes in at one seam (2026-05-30, §VERTICAL + §GATE + §LONGTAIL PASS)

P3c turned the §0.18b product-tiering finding into running code and closed the §0.18 per-document
faithfulness gap. Witnesses: `build/erp/{diff_oracle,poc_longtail}.log`. Three results:

**(1) Per-document dispatch — the §0.18 faithfulness gap, closed (Task 1).** The P3b settlement cells
dispatched the whole vendor universe in ONE synthetic `invoiceDocId:'ALL'` event; `diff_oracle_cells.js`
MMR:CO / API:CO now dispatch **per receipt / per invoice**, each reconciling ONLY its own lines within
its partition, with consumed counterpart lines withheld from later documents (no double-claim, §18.8).
The matcher opts still load from data; the candidate set is now one document's lines. **Isolation guard:**
`Σ(per-document matches) == the P3b universe count` (M_MatchPO **19/19**, M_MatchInv **18/18**, M_MatchPO
**18/18**), 0 missed / 0 extra — proving no cross-document leak the universe run was hiding. The clean
data (no partner+product+qty ambiguity within any partition) makes per-document == universe exact.
`§VERTICAL perdoc cell=(C_Invoice,CO) docs=4 … isolation=OK`. §ORACLE-SUITE stayed 5/6 PASS — no regression.

**(2) The lone-operator vertical runs end-to-end, matcher NOT invoked (Task 2).** `scripts/poc_longtail.js`
drives the one full GardenWorld chain — sales order 101 (DocType 135, BPartner 112) — through the kernel
as **five per-document-event op-groups**: `raise SO → ship → invoice → receive payment → allocate`, using
ONLY derivation verbs (`completeOrder` PLANS the fan-out from the decision table; `createShipment`/
`createInvoice` emit the planned ship/invoice op-groups), FK-directed `ALLOCATE` (partial: PayAmt 98.5 of
GrandTotal 100.7), and the C_DocType decision table. **`E.match` is monkey-patched with a call counter
and asserted NOT-INVOKED across the whole path** (calls=0). The effects reproduce the oracle exactly
(shipment line, invoice line, allocation edge — each 1/1) and **replay rebuilds the projection EXACTLY**
(live-hash == replay-hash, 7 ops). `§VERTICAL flow=lone-operator events=5 matcher=NOT-INVOKED ops=7
replay=EXACT diff=MATCH`. This is the empirical proof of §0.18b: the entire long-tail flow is the cheap
path (derivation-by-FK), not the settlement lattice.

**(3) The pro-gate seam — capability-first, additive not a fork (Task 3).** The exact cell where the
matcher becomes necessary is **buyer reconciliation (`C_Invoice:CO` 3-way, PO↔receipt↔invoice)**. The tier
split is expressed as **DATA** — a `CAPABILITY.pro_reconciliation.enabledFor` flag the SystemAdmin toggles
per (DocType,action), §0.11 made operational. With the flag OFF (lone operator), the invoice completes
with the cheap `setStatus` handler and the matcher is not invoked (settlement edges=0). With the flag ON,
the matcher **composes IN**: the *same* cheap status op is emitted, with the settlement-edge ops APPENDED
(`pro.ops == cheap.ops + matcher.edges`) — additive policy, the cheap-path handler never rewritten.
`§GATE cheap-path-cells=[(C_Order,CO),(M_InOut,CO),(C_Invoice,CO cheap),(C_Payment,CO),(C_AllocationHdr,CO)]
pro-gate-cell=(C_Invoice,CO 3-way) composes=Y data-gated=Y`. **Open edge:** the capability flag lives in
memory in the POC; persisting it as a `CAPABILITY` rule in `erp_rules.db` (alongside `ACCESS`/`DOCPOLICY`)
is the one-line next step. No `bim-ootb`, no Docker — T3 relocation still parked.

### §0.20 NEXT PHASE — the secured/durable axis (UI POC frozen) (2026-05-31, SPEC — first witnesses have since landed; see §0.21)

**Pivot.** The UI POC is proven: §0.19 drives the full O2C/P2P/GL chain through the kernel,
matcher-gated, `replay-hash == live-hash`. **No further UI work** — the next phase tackles the
*weak axes* §0.18(d) named (security, tamper-evidence, durability, multi-user) instead.

**State of the art — has anyone solved these? Yes, and they all solved it the *same way*** (researched
2026-05-31; sources below; **per-system mechanism / weakness / our-workaround deep-dive in
`docs/LocalFirstPriorArt.md`**). The honest, load-bearing finding:

> **Every production local-first system anchors trust in a server.** ElectricSQL and PowerSync (JWT
> auth + Postgres Row-Level-Security mirrored into sync rules) and Replicache (server *re-runs* every
> mutation — the server is the authority, the client an optimistic cache) all answer security + auth +
> durability + multi-user the same way: **the server is the source of truth; the client is an offline
> cache.** Conflict-convergence is a *mature, solved* category — CRDTs (Automerge's recent memory/performance
> rewrite; Yjs powering Figma/Linear/Notion). Tamper-evidence is *mature crypto* —
> hash-chained + Merkle append-only logs (Trillian, Rekor / Certificate Transparency).

**What that means for us (and where "first" does and does NOT apply):**

| Weak axis | Field's solved answer | Our move | First? |
|---|---|---|---|
| **Multi-user convergence** | CRDTs (Automerge/Yjs) — but they solve *convergence, not business invariants* | **Keep our semantic op-CRDT** (§0.18c): generic CRDT/LWW would silently violate invariants (double-allocate). We are *at frontier* here, not behind | No, but **we're ahead** on invariant-preserving merge |
| **Tamper-evidence** | hash-chain + Merkle transparency logs (server/CA infra) | **Hash-chain + optionally sign each `kernel_ops` op** — extend today's replay-hash into a per-op chained hash; verifiable *offline* | **Narrowly yes** — the *placement* (transparency-log technique inside a browser-resident *business* log) is the one genuinely distinctive win |
| **Durability** | `persist()` + treat local as cache + sync-to-server-of-truth | Finish §16.3: `navigator.storage.persist()` + op-log export/backup. Proven pattern | No — adopt it |
| **Security / auth (multi-user)** | trusted backend: JWT + RLS / server-re-run | When multi-user is needed, adopt a **thin trust anchor** — §18.7 *designated-owner node* IS this. Proven, not novel | No — adopt it |

**The architecture — two domains, one async op-log seam (this resolves the tension).** Separate the
concerns cleanly into **two asynchronous domains that never block each other**, with `kernel_ops` as the
boundary between them:

- **UI domain (instant, optimistic, offline)** — the proven POC. Every action commits an op locally and the
  projection updates at **0ms**; the user never waits on the network. Unchanged from today.
- **Server domain (a dumb facilitator, async)** — *not* a re-running authority. It **accepts** pushed ops
  (append-only), **assigns a total order** (the one thing that must be centralised), and **persists + fans
  out**. It runs **no business logic** — determinism (§0.16) makes server re-execution redundant: clients
  replay the ordered log to identical state, so there is no "server disagrees → overwrite" case (the
  Replicache tax). *Signing is at the edge* (the user/merchant key, W-SIGN); *enforcement is the deterministic
  kernel on every client* (non-owner ops rejected on replay, G-SINGLE-WRITER); *the facilitator only
  sequences.* See `docs/DistributedERP.md §6` (facilitator-not-actor) + §10 (why this differs from
  Replicache/PowerSync/ElectricSQL, which DO re-run/route writes through a backend).

Because the seam is **asynchronous**, security does not cost interactive latency: the UI domain commits
locally and is never gated on the facilitator. This refines §0.18(d): the zero-server property holds only for
single-user/offline operation with no server at all; secured multi-user adds a thin async **facilitator**
(order + persist + relay) that is not a trusted compute authority. The local commit path is unchanged in
either case. The op-log is already the right
payload (push = new ops, pull = the ordered/total-ordered log); the designated-owner node (§18.7) is a
*client* role (the owner-gating that runs on replay), not a server that recomputes. *(The fact is a fold over
the ordered log; the facilitator orders, the clients fold — `DistributedERP.md §0`.)*

**Residual honesty.** Server-grade security/tamper-resistance still **cannot** be done purely client-side —
the *secured* universe is the server domain doing the validating/signing; user-held keys give offline
tamper-*evidence* (W-CHAIN/W-SIGN) but the *authority* is the trusted node. So we are **not "first to make a
serverless ERP secure"** (the secured path has a server domain — that's the point). What stays distinctive,
narrowly: a **cryptographically tamper-evident, offline-verifiable business op-log** + invariant-preserving
merge + a **clean async two-domain split that preserves 0ms UX** — known techniques in an unusual
arrangement, consistent with every other claim in this doc.

**"First for BIM *and* ERP?" — defensible as combination, NOT as technique (researched 2026-05-31).** The
*pattern* (op-log + optimistic UI + async trusted sync) is a **mature category** with off-the-shelf
frameworks — nearest neighbor **LiveStore** ("git-inspired syncing via event-sourcing on reactive SQLite",
conceptually almost identical to `kernel_ops` at the data layer); also ElectricSQL, Replicache, RxDB. **No
"first" on the mechanism.** But by *domain*: offline BIM tools (OpenSpace, xeokit, BIMvision) are
cache-for-*viewing*, not op-log local-first *editing* — none found; and no prominent local-first ERP
*product* surfaced (SAP/Odoo/iDempiere stay server-authoritative). The **unification — BIM geometry *and*
ERP transactions under ONE op-log (BIM undo == ERP audit, same kernel)** — turned up **no prior art**.
Defensible claim, with the epistemic limit stated: ***first to our knowledge* to unify spatial-BIM and
transactional-ERP under a single local-first op-log with an instant-UI / async-secured-server split** —
*placement/combination* first, not *technique* first. (Cannot prove a negative; absence of search evidence
≠ proof. LiveStore named so the claim is made knowing the neighbour exists.)

**Phase tasks (spec-first — witness claim precedes code):**
- **W-CHAIN** — each `kernel_ops` op stores `prev_hash`; `verifyChain()` walks the log and proves
  `tamper detected at op N` on any altered payload. *Witness:* mutate one op's payload → chain breaks at
  exactly that op; clean log → `chain OK len=N`.
- **W-SIGN** *(optional, gated)* — ops signed with a user/device key; `verifyChain()` also checks signature.
  *Witness:* op signed by key A fails verification under key B.
- **W-PERSIST** — `navigator.storage.persist()` requested on first load; log export/restore round-trips.
  *Witness:* `persisted=true` logged; export→wipe→import → `replay-hash == pre-export hash`.
- **W-OWNER** *(multi-user, later)* — designated-owner-node reconcile at document-handoff seams (§18.7).
  *Witness:* two peers each allocate the same invoice → owner rejects the second, no money lost.

UI is frozen at the proven POC; this phase touches only `kernel_ops` integrity + persistence + (later) the
trust anchor. **The full distributed-contention design — physics-partitions-data (branch→van→box), the
guard set, the 90/10 + one-way-circle, the single customer-entitlement op-class with its URL-issued →
phone-carried → touch/reconcile → ledger lifecycle, and the accounting-as-reconciler capstone — is specced
in `docs/DistributedERP.md`** (stress-tested end-to-end: gapless DocNo, two-client ship, StorageOnHand,
100-branch overnight, bonus-card double-claim, credit-on-phone, van-sales scan). **Sources:** [PowerSync](https://powersync.com/) · [ElectricSQL — local-first with your API](https://electric-sql.com/blog/2024/11/21/local-first-with-your-existing-api) · [Replicache push/auth](https://doc.replicache.dev/reference/server-push) · [Automerge](https://automerge.org/) · [Trillian / transparency.dev](https://transparency.dev/) · [LiveStore](https://livestore.dev/) (nearest-neighbour event-sourced local-first data layer).

### §0.21 G-IDENTITY wired into the kernel — identity is an input, never computed (2026-06-01, SPEC + §IDENTITY)

The Merge/G-IDENTITY POC (`scripts/poc_distributed.js`, §0.20 ledger #2) proved the property in a
throwaway harness; this section ports it into the real prototype kernel `scripts/erp_kernel.js`. It is
Phase-A item #2 of `prompts/ERP_DEPLOY_AND_TOUR.md`. **Witness:** `build/erp/poc_identity.log`
(`§IDENTITY PASS`), driving the *actual* `Kernel.apply`/`Kernel.replay` — not a model of them.

**The defect being fixed (two conflated identities, both computed).**
- *Op id* — `kernel_ops` PK was `INTEGER PRIMARY KEY AUTOINCREMENT` (`erp_kernel.js`). Two devices each
  mint `1,2,3…`; their logs **cannot union** without PK collision — the exact failure the POC's
  "numeric-seq PKs collide" contrast names (`poc_distributed.js`).
- *Entity id* (`output_guid`) — computed by `docKey`/`lineKey` (format `DOC:table@from<srcId>`) **on every
  replay** from the payload. Computing identity at replay time violates DistributedERP §7 ("identity is an
  input, never computed"): a recomputation can diverge from what the edge originally minted.

**The decisions (D1–D4).**

- **D1 — Op id becomes an edge-minted UUID, recorded.** `kernel_ops` PK → `op_uuid TEXT`, plus a `seq INTEGER`
  for stable intra-device ordering. Minted via `ctx.mintOp(op,i)` (injectable) — prod passes
  `crypto.randomUUID()`; the test default is the deterministic `actor + ':' + (baseTs+i)` so two devices
  (`A:1000…`, `B:1000…`) union **clash-free without randomness** (replay-safe, §0.16 — no `Math.random`).
- **D2 — Entity identity is supplied to the kernel and recorded in the op payload; replay READS it.** `apply`
  stamps `op.uuid` once at first application and the rich payload carries it; `replay` finds `op.uuid`
  present and uses it verbatim — `edgeMint` is **never invoked on the replay path**. This is the §7 fix:
  the kernel no longer *computes* identity during replay, it *reads the recorded input*.
- **D3 — `docKey`/`lineKey` are retired as the kernel's identity source.** Their deterministic-seed logic is
  relocated into a single `edgeMint(op,state)` (folding the `DOC:`/`LINE:`/`ALLOC:`/`MATCH:` constructors)
  that runs **at most once, at first apply, only when an op arrives without a `uuid`** — i.e. it models the
  *edge* minting identity before the op enters the kernel. For source-derived docs `edgeMint` reproduces the
  prior `DOC:…@from…` string **so the §ORACLE-SUITE / §LONGTAIL witnesses stay byte-stable** (`poc_longtail.js`
  queries `document_id='DOC:M_InOut@from<id>'` — unchanged). The behaviour preserved; the *placement* of the
  computation moved from "kernel, every replay" to "edge, once, recorded."
- **D4 — This is the New-doc seam (forward, T3 stays parked).** A genuinely new document (no `source_id`)
  takes an edge-minted `crypto.randomUUID()` at creation — exactly the moment a future **"New doc"** button
  needs an identity *before any server exists*. The famed iDempiere **`ProcessIt()`/Complete** doc-action is
  already `Kernel.dispatch` through the §18.6 ladder (`erp_kernel.js`); editing/CRUD surfacing from the
  read-only stub (the "ring of fire" `+ (eye) (pencil) -` around a bubble is one rendering of it) is the
  parked **T3** phase. #2 does not build T3 — it satisfies the identity contract T3 will require, so New-doc
  + ProcessIt can be added later without re-touching the kernel.

**Scope discipline.** All edits land in **`scripts/erp_kernel.js` only** — op generators (`erp_engine.js`
verbs, inline handlers) emit *logical* ops with no guid, so `apply` is the single stamping chokepoint; no
verb/handler/UI change, no `bim-ootb`, no deploy. T3 relocation (§0.16(3)) still parked.

**Witnesses (W-IDENTITY-LIVE — must hold AND no regression):**
- `§IDENTITY merge devices=2 ops=N` — two kernels apply disjoint op groups; union of their `kernel_ops`
  has **distinct `op_uuid` count == N** (no PK clash).
- `§IDENTITY replay hashA=… hashB=…` — replaying the merged, totally-ordered (`timestamp,op_uuid`) log into
  two fresh kernels yields the **same projection hash** (holder-irrelevant).
- `§IDENTITY no-recompute` — replay reproduces every `output_guid` from the recorded payload with
  `edgeMint` call-count **0** on the replay path.
- **No regression:** `poc_kernel.log §KERNEL PASS`, `poc_longtail.log §VERTICAL … replay=EXACT`,
  `diff_oracle.log §ORACLE-SUITE 5/6`, `poc_distributed.log §DIST PASS` all still green.

---

## §1. iDempiere AD → SQLite Table Mapping

### Source: live PostgreSQL (docker)

```
docker start postgres
docker exec postgres psql -U adempiere -d idempiere
```

### AD metadata tables to export

| PostgreSQL Table | Rows | Purpose | SQLite mapping |
|---|---|---|---|
| AD_Menu | 826 | Menu tree nodes | Direct copy |
| AD_TreeNodeMM | 828 | Parent-child hierarchy for menu | Direct copy |
| AD_Window | 458 | Window definitions | Direct copy |
| AD_Tab | 1,167 | Tabs within windows | Direct copy |
| AD_Field | 21,432 | Fields within tabs | Direct copy |
| AD_Column | 26,519 | Column metadata (type, length, mandatory) | Direct copy |
| AD_Table | 1,076 | Table definitions | Direct copy |
| AD_Reference | 606 | Reference types (dropdown, search, etc.) | Direct copy |
| AD_Ref_List | 1,545 | Dropdown option values | Direct copy |
| AD_Element | 6,026 | UI labels and descriptions | Direct copy |

**Total: ~60,000 rows of metadata. Estimated SQLite size: ~8-12 MB.**

All tables use `CREATE TABLE IF NOT EXISTS` — safe to add to any existing DB.

### Column subset (strip unused)

Each AD table has ~30-60 columns. Many are unused by the UI renderer
(CreatedBy, UpdatedBy, AD_Client_ID, AD_Org_ID for multi-tenant). We export
a focused subset:

**AD_Menu:**
```sql
CREATE TABLE IF NOT EXISTS AD_Menu (
    AD_Menu_ID    INTEGER PRIMARY KEY,
    Name          TEXT NOT NULL,
    Description   TEXT,
    IsSummary     TEXT DEFAULT 'N',      -- Y = folder, N = leaf
    Action        TEXT,                   -- W=Window, R=Report, P=Process, X=Form
    AD_Window_ID  INTEGER,
    AD_Process_ID INTEGER,
    AD_Form_ID    INTEGER,
    IsActive      TEXT DEFAULT 'Y'
);
```

**AD_TreeNodeMM** (menu hierarchy):
```sql
CREATE TABLE IF NOT EXISTS AD_TreeNodeMM (
    AD_Tree_ID  INTEGER NOT NULL,        -- 10 = main menu tree
    Node_ID     INTEGER NOT NULL,        -- = AD_Menu_ID
    Parent_ID   INTEGER NOT NULL,        -- 0 = root
    SeqNo       INTEGER DEFAULT 0,
    IsActive    TEXT DEFAULT 'Y',
    PRIMARY KEY (AD_Tree_ID, Node_ID)
);
```

**AD_Window:**
```sql
CREATE TABLE IF NOT EXISTS AD_Window (
    AD_Window_ID  INTEGER PRIMARY KEY,
    Name          TEXT NOT NULL,
    Description   TEXT,
    Help          TEXT,
    WindowType    TEXT DEFAULT 'M',      -- M=Maintain, T=Transaction, Q=Query
    IsActive      TEXT DEFAULT 'Y'
);
```

**AD_Tab:**
```sql
CREATE TABLE IF NOT EXISTS AD_Tab (
    AD_Tab_ID     INTEGER PRIMARY KEY,
    AD_Window_ID  INTEGER NOT NULL,
    Name          TEXT NOT NULL,
    Description   TEXT,
    Help          TEXT,
    AD_Table_ID   INTEGER NOT NULL,
    TabLevel      INTEGER DEFAULT 0,     -- 0=header, 1=detail, 2=sub-detail
    SeqNo         INTEGER DEFAULT 10,
    IsSingleRow   TEXT DEFAULT 'N',
    IsReadOnly    TEXT DEFAULT 'N',
    WhereClause   TEXT,
    OrderByClause TEXT,
    IsActive      TEXT DEFAULT 'Y'
);
```

**AD_Field:**
```sql
CREATE TABLE IF NOT EXISTS AD_Field (
    AD_Field_ID   INTEGER PRIMARY KEY,
    AD_Tab_ID     INTEGER NOT NULL,
    AD_Column_ID  INTEGER NOT NULL,
    Name          TEXT NOT NULL,
    Description   TEXT,
    Help          TEXT,
    SeqNo         INTEGER DEFAULT 10,
    IsDisplayed   TEXT DEFAULT 'Y',
    DisplayLogic  TEXT,                  -- iDempiere logic expression
    IsMandatory   TEXT,                  -- Y/N or logic expression
    IsReadOnly    TEXT DEFAULT 'N',
    DefaultValue  TEXT,
    IsActive      TEXT DEFAULT 'Y'
);
```

**AD_Column:**
```sql
CREATE TABLE IF NOT EXISTS AD_Column (
    AD_Column_ID    INTEGER PRIMARY KEY,
    AD_Table_ID     INTEGER NOT NULL,
    ColumnName      TEXT NOT NULL,
    Name            TEXT,
    Description     TEXT,
    AD_Reference_ID INTEGER,             -- field type: 10=String, 11=Integer, 19=TableDirect, etc.
    AD_Val_Rule_ID  INTEGER,
    FieldLength     INTEGER DEFAULT 0,
    IsMandatory     TEXT DEFAULT 'N',
    IsKey           TEXT DEFAULT 'N',
    IsIdentifier    TEXT DEFAULT 'N',
    DefaultValue    TEXT,
    ValueMin        TEXT,
    ValueMax        TEXT,
    IsActive        TEXT DEFAULT 'Y'
);
```

**AD_Table:**
```sql
CREATE TABLE IF NOT EXISTS AD_Table (
    AD_Table_ID   INTEGER PRIMARY KEY,
    TableName     TEXT NOT NULL,
    Name          TEXT,
    Description   TEXT,
    AD_Window_ID  INTEGER,
    IsActive      TEXT DEFAULT 'Y'
);
```

**AD_Reference & AD_Ref_List:**
```sql
CREATE TABLE IF NOT EXISTS AD_Reference (
    AD_Reference_ID INTEGER PRIMARY KEY,
    Name            TEXT NOT NULL,
    Description     TEXT,
    ValidationType  TEXT,                -- L=List, T=Table, D=DataType
    IsActive        TEXT DEFAULT 'Y'
);

CREATE TABLE IF NOT EXISTS AD_Ref_List (
    AD_Ref_List_ID  INTEGER PRIMARY KEY,
    AD_Reference_ID INTEGER NOT NULL,
    Value           TEXT NOT NULL,
    Name            TEXT NOT NULL,
    Description     TEXT,
    IsActive        TEXT DEFAULT 'Y'
);
```

**AD_Element** (labels):
```sql
CREATE TABLE IF NOT EXISTS AD_Element (
    AD_Element_ID INTEGER PRIMARY KEY,
    ColumnName    TEXT,
    Name          TEXT NOT NULL,
    PrintName     TEXT,
    Description   TEXT,
    IsActive      TEXT DEFAULT 'Y'
);
```

---

## §2. PostgreSQL Export Strategy

### Script: `scripts/export_ad.sh`

```bash
#!/bin/bash
# Export iDempiere AD metadata from PostgreSQL to SQLite
# Requires: docker postgres container running with idempiere DB

CONTAINER=postgres
DB=idempiere
USER=adempiere
OUTPUT=deploy/dev/ad_seed.sql

TABLES=(
  "AD_Menu:AD_Menu_ID,Name,Description,IsSummary,Action,AD_Window_ID,AD_Process_ID,AD_Form_ID,IsActive"
  "AD_TreeNodeMM:AD_Tree_ID,Node_ID,Parent_ID,SeqNo,IsActive"
  "AD_Window:AD_Window_ID,Name,Description,Help,WindowType,IsActive"
  "AD_Tab:AD_Tab_ID,AD_Window_ID,Name,Description,Help,AD_Table_ID,TabLevel,SeqNo,IsSingleRow,IsReadOnly,WhereClause,OrderByClause,IsActive"
  "AD_Field:AD_Field_ID,AD_Tab_ID,AD_Column_ID,Name,Description,Help,SeqNo,IsDisplayed,DisplayLogic,IsMandatory,IsReadOnly,DefaultValue,IsActive"
  "AD_Column:AD_Column_ID,AD_Table_ID,ColumnName,Name,Description,AD_Reference_ID,AD_Val_Rule_ID,FieldLength,IsMandatory,IsKey,IsIdentifier,DefaultValue,ValueMin,ValueMax,IsActive"
  "AD_Table:AD_Table_ID,TableName,Name,Description,AD_Window_ID,IsActive"
  "AD_Reference:AD_Reference_ID,Name,Description,ValidationType,IsActive"
  "AD_Ref_List:AD_Ref_List_ID,AD_Reference_ID,Value,Name,Description,IsActive"
  "AD_Element:AD_Element_ID,ColumnName,Name,PrintName,Description,IsActive"
)
```

For each table: `COPY (SELECT columns FROM table WHERE IsActive='Y') TO STDOUT CSV`
→ parse CSV → generate `INSERT OR IGNORE INTO` statements → write to ad_seed.sql.

### Data sanitization
- Strip `IsActive='N'` rows (reduces noise)
- NULL → empty string for TEXT, 0 for INTEGER
- Escape single quotes in text values
- Filter AD_TreeNodeMM to `AD_Tree_ID = 10` (main menu tree only)
- No BLOBs in AD tables — all text/integer

### Expected output size
- ~60,000 INSERT statements
- ~4-8 MB SQL file
- Loads in < 2 seconds via sql.js

---

## §3. AD Parser Design — `ad_parser.js`

Pure data reader. No UI. No side effects except §-log.

### API

```javascript
ADParser.init(db)
  // §AD_PARSER init
  // Reads AD table counts, logs: menu=826 windows=458 tabs=1167 fields=21432

ADParser.getMenuTree(db)
  // §AD_PARSER menuTree nodes=826 roots=15
  // Returns: { id, name, children: [...], action, windowId, isSummary }
  // Builds tree from AD_Menu + AD_TreeNodeMM (Parent_ID → children)

ADParser.getWindow(db, windowId)
  // §AD_PARSER getWindow id=130 name=Project tabs=8
  // Returns: { id, name, description, windowType, tabs: [...] }

ADParser.getTabs(db, windowId)
  // §AD_PARSER getTabs windowId=130 count=8
  // Returns: [{ id, name, tabLevel, seqNo, tableName, fields: [...] }]
  // Sorted by SeqNo. Each tab includes its fields.

ADParser.getFields(db, tabId)
  // §AD_PARSER getFields tabId=157 count=45
  // Returns: [{ id, name, columnName, referenceId, seqNo, isDisplayed,
  //             displayLogic, isMandatory, isReadOnly, defaultValue }]
  // Joins AD_Field → AD_Column for column metadata

ADParser.resolveReference(db, referenceId)
  // §AD_PARSER resolveRef id=319 type=List options=5
  // Returns: [{ value, name, description }] for List references
  // Returns: { tableName, keyColumn, displayColumn } for Table references

ADParser.getTableName(db, tableId)
  // Returns TableName from AD_Table
```

### iDempiere Reference Types (AD_Reference_ID values)

| ID | Name | Renderer |
|---|---|---|
| 10 | String | `<input type="text">` |
| 11 | Integer | `<input type="number">` |
| 12 | Amount | `<input type="number" step="0.01">` |
| 13 | ID | hidden (primary key) |
| 14 | Text | `<textarea>` |
| 15 | Date | `<input type="date">` |
| 16 | DateTime | `<input type="datetime-local">` |
| 17 | List | `<select>` from AD_Ref_List |
| 18 | Table | `<select>` with AD_Val_Rule filter |
| 19 | TableDir | `<select>` from referenced table |
| 20 | YesNo | `<input type="checkbox">` |
| 22 | Number | `<input type="number" step="any">` |
| 28 | Button | `<button>` (triggers DocAction) |
| 29 | Quantity | `<input type="number">` |
| 30 | Search | `<input>` with typeahead lookup |
| 38 | FilePath | `<input type="file">` |

---

## §4. Card-First AD Renderer — `ad_ui.js`

Mobile-first. Dark theme. Same visual language as BIM OOTB.

### Menu — hamburger sidebar

```
┌──────────────────────────────────┐
│ ☰ ERP OOTB           [🔍] [👤]  │  App bar
├──────────────────────────────────┤
│                                  │
│  ┌────────────────────────────┐  │
│  │  C_Project: ABC Tower      │  │  Current window
│  │  Phase: Foundation          │  │  as card
│  │  Status: ⬤ IN_PROGRESS      │  │
│  │  ...                        │  │
│  └────────────────────────────┘  │
│                                  │
│  ← swipe → (next record)        │
│  ↑ swipe ↑ (next tab)           │
│                                  │
└──────────────────────────────────┘
```

Tap ☰ → sidebar slides in:

```
┌────────────────────┬─────────────┐
│ ☰ Menu             │             │
│                    │  (dimmed)   │
│ ▼ Partner Relations│             │
│   ● Business Partn │             │
│   ○ Contact        │             │
│ ▼ Materials Mgmt   │             │
│   ● Product        │             │
│   ○ Price List     │             │
│ ▼ Project Mgmt     │             │
│   ● Project ←ACTIVE│             │
│ ▼ Financial        │             │
│   ○ GL Journal     │             │
│ ▼ Manufacturing    │             │
│   ○ BOM            │             │
│ ...                │             │
└────────────────────┴─────────────┘
```

### Window → tab cards

Each AD_Window renders as a card stack. Tabs are horizontal swipe pages.
Reuses `swipe.js` from P3 UI.

Tab header bar:
```
┌──────────────────────────────────┐
│ [Project] [Phase] [Task] [Line] │  Tab bar (scroll horizontal)
│  ════════                       │  Underline = active tab
├──────────────────────────────────┤
│                                  │
│  Name: ABC Tower Construction    │  Fields rendered from AD_Field
│  Status: [▼ In Progress]        │  Reference types determine widget
│  Start Date: [2026-05-13]       │
│  End Date: [2026-12-31]         │
│  ...                            │
│                                  │
│  [Save] [Delete] [New]          │  Actions
│                                  │
└──────────────────────────────────┘
```

### Field rendering rules

```javascript
// For each AD_Field in the tab:
// 1. Get AD_Column via AD_Column_ID
// 2. Get Reference type via AD_Reference_ID
// 3. Render appropriate input widget
// 4. Apply DisplayLogic (show/hide)
// 5. Apply IsMandatory (red border if empty)
// 6. Apply IsReadOnly (disabled)
// 7. Apply DefaultValue on new record
```

### DisplayLogic parser

iDempiere display logic format: `@ColumnName@='value'&@Other@!''`

```javascript
function evaluateDisplayLogic(logic, record) {
  // Replace @ColumnName@ with record[ColumnName]
  // Evaluate: = (equals), ! (not equals), > < >= <=
  // Combine: & (AND), | (OR)
  // Returns: true (show) or false (hide)
}
```

---

## §4b. HTML-Native UI — Replacing ZK Patterns

> **Principle:** iDempiere uses ZK Framework (server-side Java → HTML widget rendering, ~2006 architecture). Every click is a server round-trip. HTML Living Standard (2024+) provides native equivalents that are faster, offline-capable, and GPU-accelerated — no framework needed.

### Accordion Data Panels — `<details>` + CSS

ZK uses `Groupbox` with server-managed open/close state. HTML `<details>` is native, zero-JS, accessible:

```html
<!-- Native accordion — no JS, no framework, keyboard accessible -->
<details open>
  <summary>Partner Relations</summary>
  <div class="accordion-body">
    <a href="#" data-window="C_BPartner">Business Partner</a>
    <a href="#" data-window="AD_User">Contact</a>
  </div>
</details>
<details>
  <summary>Materials Management</summary>
  <div class="accordion-body">
    <a href="#" data-window="M_Product">Product</a>
    <a href="#" data-window="M_PriceList">Price List</a>
  </div>
</details>
```

**Enhancements over ZK:**

| ZK Pattern | HTML-Native Replacement | Advantage |
|---|---|---|
| `Groupbox` open/close | `<details>/<summary>` | Zero JS, keyboard accessible, animated via CSS `transition` |
| `Tabbox` tab switching | CSS `scroll-snap` + swipe | Native momentum, touch-friendly, no server round-trip |
| `Listbox` row selection | `<dialog>` + popover list | Native modal, backdrop, Escape key, focus trap |
| `Textbox` validation | `<input>` + `pattern` + `:invalid` CSS | Browser-native, no server validation round-trip |
| `Datebox` calendar | `<input type="date">` | Native picker on all platforms, locale-aware |
| `Combobox` dropdown | `<datalist>` + `<input list>` | Native search-as-you-type, no custom JS |
| `Tree` hierarchy | Nested `<details>` | Collapsible tree with zero JS, infinite nesting |
| `Grid` data table | CSS Grid + `subgrid` | Responsive, sticky headers, no fixed columns |
| `Messagebox` alert | `<dialog>` element | Native modal, animatable, no Z-index wars |

### Animated Accordion (CSS only)

```css
details .accordion-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s ease;
  overflow: hidden;
}
details[open] .accordion-body {
  grid-template-rows: 1fr;
}
details summary {
  cursor: pointer;
  padding: 12px 16px;
  background: rgba(255,255,255,0.05);
  border-radius: 8px;
  list-style: none;  /* remove default triangle */
}
details summary::before {
  content: '▸';
  display: inline-block;
  transition: transform 0.2s;
  margin-right: 8px;
}
details[open] summary::before {
  transform: rotate(90deg);
}
```

### View Transitions (panel morphing)

When user navigates between ERP windows (e.g. Project → Phase → Task), the DOM morphs with cross-fade:

```javascript
// One line wraps any DOM change into a smooth transition
document.startViewTransition(() => {
  renderWindow(nextWindowId);  // swaps DOM content
});
```

Browser automatically:
1. Snapshots old state
2. Renders new state
3. Cross-fades between them (GPU-accelerated, ~16ms)
4. Falls back to instant swap if unsupported

**No animation library needed.** This replaces ZK's `Clients.evalJavascript()` animation hacks.

### Scroll-Snap for Tab Navigation

Instead of ZK `Tabbox` (click tab header → server fetches panel → re-renders):

```css
.tab-container {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}
.tab-panel {
  flex: 0 0 100%;
  scroll-snap-align: start;
}
```

User swipes left/right between tab panels. Native momentum, no JS event handling, works on mobile. Tab header highlights sync via `IntersectionObserver`:

```javascript
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) highlightTab(e.target.dataset.tabId);
  });
}, { root: tabContainer, threshold: 0.5 });
tabPanels.forEach(p => observer.observe(p));
```

### Popover for Field Help + FK Lookup

```html
<!-- Field with popover help -->
<label>
  Business Partner
  <button popovertarget="bp-help">?</button>
</label>
<input type="text" list="bp-list" />
<datalist id="bp-list">
  <!-- populated from AD_Ref_List or FK query -->
</datalist>
<div id="bp-help" popover>
  Select the business partner for this transaction.
  Links to C_BPartner table.
</div>
```

`popover` attribute: native positioning, auto-dismiss on outside click, no Z-index management. Replaces ZK's `Popup` component entirely.

### Container Queries for Responsive Panels

Each ERP panel resizes based on its own width, not the viewport:

```css
.erp-panel {
  container-type: inline-size;
}
@container (max-width: 400px) {
  .field-row { flex-direction: column; }  /* stack labels above inputs */
}
@container (min-width: 600px) {
  .field-row { display: grid; grid-template-columns: 150px 1fr; }  /* label left, input right */
}
```

This means the same panel works in:
- Full-screen desktop (wide layout)
- Side-by-side with 3D viewer (narrow layout)
- Mobile (stacked layout)

No media queries, no breakpoint math — each panel is self-contained.

### Performance Comparison

| Operation | ZK (iDempiere) | HTML-Native (ERP OOTB) |
|---|---|---|
| Open accordion | ~200ms (server round-trip + re-render) | ~16ms (CSS transition, no JS) |
| Switch tab | ~300-500ms (AJAX + DOM replace) | ~0ms (scroll-snap, already loaded) |
| Show tooltip | ~150ms (server → Popup component) | ~1ms (popover, native) |
| Validate field | ~200ms (server → Callout) | ~0ms (browser `:invalid`, pattern match) |
| Load dropdown | ~300ms (AJAX → Listbox) | ~5ms (`<datalist>` from IndexedDB) |
| Render 100 rows | ~1-2s (server → Grid → DOM) | ~10ms (CSS Grid, virtual scroll) |

**Total tab-to-data: ZK ~2-5s per interaction vs HTML-native ~20ms.**

### Implementation in `ad_ui.js`

The existing card renderer (`ad_ui.js`) already uses dark-theme cards with swipe. The accordion pattern replaces the sidebar menu:

1. **Menu**: nested `<details>` tree (replaces current sidebar list)
2. **Window tabs**: `scroll-snap` container (replaces current tab bar click handlers)
3. **Field rendering**: `<datalist>` for FK lookups, `<input type="date/number">` for typed fields, `<dialog>` for confirmations
4. **Transitions**: `document.startViewTransition()` wrapping `renderWindow()`
5. **Responsive**: `container-type: inline-size` on `.erp-panel`

All native. No framework. No build step. Same pattern as the BIM viewer: single HTML, browser does the work.

---

## §5. C_Project = Construction POC Bridge

The existing construction POC handlers map directly to C_Project AD window:

| POC Concept | AD Concept | Table |
|---|---|---|
| Lead/Document | C_Project record | C_Project |
| Phase container | C_ProjectPhase tab | C_ProjectPhase |
| Task | C_ProjectTask tab | C_ProjectTask |
| BOQ line | C_ProjectLine tab | C_ProjectLine |
| Status lifecycle | DocAction (DR→IP→CO→VO) | C_Project.DocStatus |

### BIM integration

C_Project window gets a special "BIM" action button:
- If the project has a `geometry_id` or IFC link → show "Open in 3D"
- BroadcastChannel posts to viewer for cross-tab highlighting
- Reuses existing `bim_4d` channel pattern from boq_charts.html

---

## §6. Cross-table analytics

Because all data is in one SQLite database in the browser, an SQL query across
any tables can be rendered as a chart client-side, with no server round-trip.

### Built-in chart views

Each AD_Window gets a [📊] button that opens an analytics overlay:

```sql
-- Projects by status (C_Project)
SELECT DocStatus, COUNT(*), SUM(PlannedAmt)
FROM C_Project GROUP BY DocStatus

-- Products by category with total value
SELECT pc.Name, COUNT(*), SUM(pp.PriceStd * pp.PriceLimit)
FROM M_Product p
JOIN M_Product_Category pc ON p.M_Product_Category_ID = pc.M_Product_Category_ID
LEFT JOIN M_ProductPrice pp ON p.M_Product_ID = pp.M_Product_ID
GROUP BY pc.Name

-- Partner aging (open invoices)
SELECT bp.Name, SUM(inv.GrandTotal), MIN(inv.DateInvoiced)
FROM C_Invoice inv
JOIN C_BPartner bp ON inv.C_BPartner_ID = bp.C_BPartner_ID
WHERE inv.IsPaid = 'N'
GROUP BY bp.Name ORDER BY MIN(inv.DateInvoiced)
```

Rendered using Canvas bar/pie charts — same pattern as `boq_charts.html`.

**Comparison with a server-side approach (e.g. Odoo):**
- A server-side stack performs cross-table queries via server + ORM + (in Odoo's case) Python.
- The client-side approach here uses one SQL statement plus Canvas, executing locally and offline.
- Any SQL can be entered in a query box and rendered as a chart.
- The query is the report definition; no separate report-designer or reporting engine (e.g. Jasper) is required.

---

## §7. BroadcastChannel Integration

### Channel: `bim_erp`

Following the existing `bim_4d` pattern in `main.js` line 154.

| Direction | Message | Payload | Action |
|---|---|---|---|
| ERP → Viewer | `ERP_FOCUS_STOREY` | `{ storey: 'Ground Floor' }` | Viewer filters to storey |
| ERP → Viewer | `ERP_HIGHLIGHT` | `{ guids: [...], color }` | Viewer highlights elements |
| ERP → Viewer | `ERP_PING` | `{}` | Check if viewer is open |
| Viewer → ERP | `ERP_ELEMENT_PICKED` | `{ guid, ifc_class, storey }` | ERP shows related records |
| Viewer → ERP | `ERP_PONG` | `{}` | Viewer is alive |

---

## §8. Landing Page Integration

### SYSNOVA/index.html changes

1. Each building card gets an amber "ERP" button alongside "3D Viewer"
2. `openERP(archName)` opens `sandbox/erp.html?db=buildings/{name}_extracted.db`
3. Footer "ERP — GOD MODE" becomes "ERP OOTB" linking to `sandbox/erp.html`
4. Tab tracker shows ERP tabs alongside 3D tabs

### Standalone mode

`erp.html` with no `?db=` parameter → loads `ad_seed.sql` with full AD metadata
+ sample data for C_Project, C_BPartner, M_Product. This is the demo mode.

`erp.html?db=Hospital.db` → loads building DB, adds AD tables on top,
bootstraps containers from BIM elements_meta storeys.

---

## §9. Implementation Phases

### Phase 1 — This session (spec + export + parser)

| Step | Deliverable | Verify |
|---|---|---|
| 1 | `docs/ERP.md` (this file) | Spec complete |
| 2 | `scripts/export_ad.sh` | Exports 10 AD tables from PostgreSQL |
| 3 | `deploy/dev/ad_seed.sql` | ~60K rows of real iDempiere AD metadata |
| 4 | `deploy/dev/ad_parser.js` | getMenuTree, getWindow, getTabs, getFields |
| 5 | `tests/test_ad_parser.js` | §-log verified: menu=826, windows=458, tabs=1167 |

### Phase 2 — Next session (renderer + CRUD)

| Step | Deliverable | Verify |
|---|---|---|
| 6 | `deploy/dev/ad_ui.js` | Menu sidebar, window cards, tab swipe, field inputs |
| 7 | `deploy/dev/ad_data.js` | Generic CRUD for any AD_Table |
| 8 | `deploy/dev/erp.html` rewrite | Full AD-driven UI |
| 9 | `deploy/dev/ad_charts.js` | Cross-table analytics charts |
| 10 | Landing page integration | ERP buttons on building cards |

### Phase 3 — Showcase session

| Step | Deliverable | Verify |
|---|---|---|
| 11 | Sample data for 3 windows | C_Project, C_BPartner, M_Product with real records |
| 12 | BroadcastChannel wiring | ERP ↔ BIM viewer cross-tab |
| 13 | Deploy to OCI dev bucket | Live at sandbox/erp.html |
| 14 | Video demo | Full AD menu → C_Project → BIM link → chart |

---

## §10. Scope and status

The Application Dictionary in this build comprises 826 menu nodes, 458 windows,
1167 tabs, and 21,432 fields, served from a ~12MB SQLite file loaded via
WebAssembly, with no server process and offline operation. The AD metadata is
not modified — it is extracted from a live iDempiere instance and reinterpreted
client-side.

Status, stated without overclaim: the construction-project window (`C_Project`)
is the worked example, three windows are wired end-to-end, and the remaining
menu tree is present as metadata but not every cell is handler-backed (the
housed-vs-active distinction, [§0.11](#011-housed-vs-active--the-full-extent-hidden-but-callable)).
For proven-vs-parked, see [§0.17](#017-p3b-breadth--the-contained-set-thesis-diff-verified-across-o2cp2pgl-2026-05-29-oracle-suite-56--gravity-pass),
[§0.20](#020-next-phase--the-secureddurable-axis-ui-poc-frozen-2026-05-31-spec--no-code-yet), and the
witness scripts ([scripts/](https://github.com/red1oon/BIMCompiler/tree/full/scripts) — `poc_*.js`, each
asserting `replay-hash == live-hash`). This is not the first SQLite-WASM or local-first system; the prior-art
floor is in [DistributedERP.md §10](DistributedERP.md#10-comparison-with-related-systems).

---

## §11. The three-layer architecture

§1–§10 establish that the AD can run in a browser. Running it unchanged,
however — roughly a thousand tables and tens of thousands of field definitions — carries
the full server-side footprint into a client-side runtime that does not need
it. The architecture separates the ERP into three layers:

```
┌─────────────────────────────────────────────────────────┐
│  PRESENTATION — what the user sees and touches          │
│  Globe constellation, accordion drill, pills, settings  │
│  Reads data via SQL. Triggers logic via user actions.    │
│  Files: ad_ui.js, ad_graph.js, erp.html                │
├─────────────────────────────────────────────────────────┤
│  LOGIC — business rules, pure functions                 │
│  "When payment completes, allocate against invoices"     │
│  Takes db + document. Produces kernel_ops. Testable.     │
│  Files: rules/*.js (allocation, pricing, tax, bom, etc) │
├─────────────────────────────────────────────────────────┤
│  DATA — 5 tables + kernel_ops + journal                 │
│  Dumb storage. No triggers. No procedures. Portable.     │
│  The op log IS the audit trail. Journal IS the books.    │
│  Files: SQLite WASM (ad_seed.db or business.db)         │
└─────────────────────────────────────────────────────────┘
```

**Boundaries (enforced, not suggested):**
- Presentation → Logic: calls rule functions on user action
- Logic → Data: `commitOp()` is the ONLY write path
- Data → Presentation: SQL queries are the ONLY read path
- No layer reaches into another's internals

### §11.1 Why separation matters

In iDempiere, logic is scattered across 6 extension points:
ModelValidator, Callout, DocAction, Process, DB triggers, AD_Val_Rule.
A developer changing "what happens when an invoice completes" must check
all six. This is the real ERP monster — not the data model, not the UI,
but the logic spaghetti.

In ERP OOTB, logic lives in ONE place: rule functions. Each is a pure
function that takes a database handle and a document ID, reads what it
needs, and produces kernel_ops. No framework. No base class. No interface
to implement. Just: data in, ops out.

```javascript
// rules/allocation.js — pure function, testable, readable
function allocatePayment(db, paymentId) {
  var payment = getDoc(db, paymentId);
  var invoices = getOpenInvoices(db, payment.metadata.partner_id);
  var remaining = payment.metadata.amount;
  for (var i = 0; i < invoices.length && remaining > 0; i++) {
    var allocated = Math.min(remaining, invoices[i].metadata.amount);
    commitOp(db, 'ALLOCATE', {
      payment: paymentId, invoice: invoices[i].id, amount: allocated
    });
    remaining -= allocated;
  }
}
```

This function is:
- **Testable** — pass it a mock db, verify the ops it produces
- **Readable** — a business person can follow the logic
- **Reversible** — undo the commitOps, the allocation unwinds
- **Auditable** — kernel_ops records which rule fired and why

---

## §12. The 5-Table Foundation

iDempiere has on the order of a thousand tables because it grew organically over 20 years —
each module adding its own tables. The 5-table design (from SpatialERP
POC §3.1) says: **a document is a document.**

| Table | What | Replaces in iDempiere |
|---|---|---|
| `containers` | Spatial hierarchy: Site→Building→Floor | C_Project, C_ProjectPhase, M_Warehouse |
| `items` | Things in containers: products, partners, materials | M_Product, C_BPartner, M_BOM |
| `documents` | ALL doc types in ONE table | C_Order, C_Invoice, C_Payment, M_InOut |
| `document_lines` | Lines for any document | C_OrderLine, C_InvoiceLine, M_InOutLine |
| `journal` | Auto-posted double-entry accounting | GL_Journal, Fact_Acct |
| + `kernel_ops` | Event log, undo/redo, audit trail | AD_ChangeLog (no undo equivalent) |

A Purchase Order, an Invoice, a Lead, a Credit Memo — they're all rows
in `documents` with different `doc_type`. The structure is identical.
Only the business rules differ, and those live in the logic layer, not
the schema.

### §12.1 The journal as proof of correctness

Every document completion produces journal entries:
```
Complete PO #1001 → debit INVENTORY, credit ACCOUNTS_PAYABLE
Complete Invoice #5001 → debit ACCOUNTS_PAYABLE, credit CASH
```

Undo a completion → `journalReverse()` posts counter-entries → net = 0.
This is double-entry bookkeeping — Luca Pacioli's 1494 invention — in
30 lines of JavaScript. The journal is the source of truth for finance.
If the journal balances, the books are correct. Everything else is UI.

### §12.2 The metadata JSON column

Each table has a `metadata TEXT DEFAULT '{}'` column. This is where
domain-specific fields live: `land_size` for a property lead,
`payment_terms` for a PO, `tax_rate` for an invoice line.

This is a deliberate trade-off: schemaless flexibility over rigid columns.
The compiled manifest (§13) tells the UI which metadata fields to render
for each doc_type. The kernel enforces mandatory metadata fields at
commitOp time. But the table schema never changes.

---

## §13. The Compiled Manifest — AD as Compiler Input

The full AD (roughly a thousand tables, tens of thousands of fields) is **compile-time input**,
not a runtime dependency. A build script reads ad_seed.db and outputs a
slim manifest:

```
ad_seed.db (13MB)  →  compile_manifest.js  →  manifest.json (~2KB)
   source code              compiler               compiled artifact
```

The manifest contains only what the browser needs:

```json
{
  "windows": {
    "123": {
      "name": "Business Partner",
      "table": "items",
      "doc_type": null,
      "tabs": [
        { "name": "Partner", "level": 0,
          "fields": [
            {"col": "Name", "type": "string", "mandatory": true},
            {"col": "IsCustomer", "type": "yesno"}
          ]},
        { "name": "Contact", "level": 1, "fk": "partner_id",
          "fields": [
            {"col": "Name", "type": "string", "mandatory": true},
            {"col": "EMail", "type": "string"}
          ]}
      ]
    }
  },
  "state_machine": {
    "PURCHASE_ORDER": ["Drafted","Completed","Voided","Closed"],
    "INVOICE": ["Drafted","Completed","Reversed","Voided"]
  },
  "downstream": {
    "PURCHASE_ORDER": ["INVOICE","SHIPMENT"],
    "INVOICE": ["PAYMENT"]
  }
}
```

**Runtime payload:** initbubble.json (2KB) + manifest.json (2KB) = 4KB.
Everything the globe, accordion, and kernel enforcement need. WASM + the
business data SQLite only loads when the user drills into actual records.

The AD stays on the shelf as the reference — the source code. The manifest
is the compiled binary. The browser runs the binary. You edit the source
when you need to change the UI structure, then recompile.

---

## §14. Kernel Gravity — The Op Log as Constellation Driver

Traditional ERP dashboards query data volume: `SELECT COUNT(*) FROM C_Order`.
This tells you how much data exists, not what matters right now.

kernel_ops provides **activity gravity**: what's being worked on, by whom,
how recently. One query replaces N per-table counts:

```sql
SELECT json_extract(parameters, '$.table') AS tbl,
       COUNT(DISTINCT json_extract(parameters, '$.id')) AS records,
       MAX(timestamp) AS last_touch
FROM kernel_ops
WHERE undone = 0 AND timestamp > ?
GROUP BY tbl
```

The constellation's bubble aura (glow radius) is driven by this gravity.
Bright = active. Dim = dormant. Pulsing = just changed. The globe becomes
a **live operations monitor** — the user's activity shapes the view.

Op type weighting prevents noise (20 typo edits ≠ 20 meaningful actions):

| Op type | Gravity weight |
|---|---|
| AD_SAVE (new record) | 1.0 |
| AD_SAVE (update) | 0.2 |
| DOC_COMPLETE | 2.0 |
| DOC_VOID | 1.5 |
| ALLOCATE | 1.0 |
| AD_DELETE | 0.5 |
| SESSION_START | 0.0 |

---

## §15. The Known Monsters — Local-First Risk Assessment

Replacing a server-mediated ERP with browser-only storage creates three
known failure modes. Each is bounded and solvable.

**Full analysis:** `prompts/ERP_KERNEL_MONSTERS.md`

| Monster | Risk | Core mitigation |
|---|---|---|
| Two tabs overwrite same record | LOW (single user) | BroadcastChannel awareness toast |
| Orphaned documents (undo parent with children) | MEDIUM | Downstream FK check in kernel (50 lines) |
| Gravity noise (edits ≠ significance) | LOW (UX only) | Distinct record count + op type weighting |

### §15.1 The 10 Invariants

Business rules ERP OOTB must enforce. If the kernel handles all 10,
AD field settings become optional structural metadata.

| # | Invariant | Kernel enforcement |
|---|---|---|
| 1 | Mandatory fields | commitOp rejects null on mandatory |
| 2 | FK integrity | commitOp checks referenced record exists |
| 3 | Doc state transitions | State map: `{Drafted:[Complete,Void]}` |
| 4 | Downstream protection | DOWNSTREAM map check before undo |
| 5 | Sequence numbering | MAX+1 (single-user = no collision) |
| 6 | Period closing | Check C_Period.IsActive on DOC_COMPLETE |
| 7 | Duplicate prevention | SELECT COUNT WHERE Value = ? before INSERT |
| 8 | Audit trail | kernel_ops logs everything (already done) |
| 9 | Undo boundary | compact() prunes past 2 sessions (already done) |
| 10 | Currency consistency | Store CurrencyISO in metadata |

~150 lines total for all 10. iDempiere uses ~15,000 lines for the same
invariants plus 200 others that single-user browser ERP doesn't need.

### §15.2 What we deliberately don't solve (yet)

- Multi-device sync → only if users need phone + laptop simultaneously
- Multi-currency conversion → only if users operate across currencies
- Full AD runtime loading → compiled manifest replaces it
- Server-side locking → single-user browser makes it unnecessary

---

## §16. Database Coverage and Storage Economics

### §16.1 Current coverage of iDempiere schema

ad_seed.db contains roughly a third of iDempiere's table definitions.

| Category | Missing | Examples |
|---|---|---|
| AD_ (system/admin) | 160 | Alert, Auth, Processor, Archive, ChangeLog |
| Views + translations (_V, _Trl) | 41 | Report views, multi-language overlays |
| I_ (import) | 18 | Data migration staging tables |
| GL_ (accounting) | 4 | GL_Distribution, GL_Fund, GL_FundRestriction |
| C_ (commercial) | 120 | Commission, Dunning, RfQ, Subscription, POS |
| M_ (material) | 65 | Production, QualityTest, CostQueue, LotCtl |
| Other (workflow, HR, asset, mfg) | 239 | A_Asset, PP_*, HR_*, W_* |

The missing tables fall into two groups:
- **Server-only plumbing** (~400): processors, schedulers, auth, import,
  views, translations. These have no function in a browser runtime.
- **Advanced business modules** (~250): manufacturing, commissions, dunning,
  subscriptions, RfQ, quality control. These serve enterprises with
  dedicated ERP administrators.

The 356 present tables include all AD metadata (10 tables, 59K rows) and
all GardenWorld business data (C_BPartner, M_Product, C_Order, C_Invoice,
C_Payment, M_InOut, etc.).

### §16.2 Storage comparison: PostgreSQL vs SQLite

Measured from GardenWorld seed data:

| Metric | PostgreSQL | SQLite (ad_seed.db) |
|---|---|---|
| Full GardenWorld install | ~350MB | 12.1MB |
| Compression ratio | — | **29x smaller** |
| Total rows | ~84K | 84,134 |
| Bytes per row | ~500-800 | 151 |
| AD metadata (70% of rows) | ~250MB | ~8.4MB |
| Business data only (30%) | ~100MB | ~3.6MB |

PostgreSQL overhead comes from: WAL (write-ahead log), TOAST (large
object storage), MVCC (multi-version concurrency control — stores
multiple row versions for concurrent transactions), per-row transaction
IDs, system catalogs, and index structures. All required for a multi-user
server. None needed in a single-user browser.

SQLite stores page-aligned data with no concurrency overhead. One file,
no fragmentation, no transaction versioning.

### §16.3 Browser storage limits

IndexedDB quotas (where the SQLite file is cached):

| Browser | Default | With `navigator.storage.persist()` |
|---|---|---|
| Chrome | 60% of device disk | Same, marked non-evictable |
| Firefox | 50% of device disk | Same, marked non-evictable |
| Safari/iOS | 1GB per origin | Up to 20% of disk on request |

A medium business with 100K documents would produce ~50MB in SQLite.
A 256GB phone allows ~150GB in IndexedDB. Storage is not the constraint.

Transfer time is the constraint: 12MB on 3G = ~30 seconds. This is why
the architecture uses lazy fetch — load only the tables the user drills
into. The manifest (2KB) + initbubble.json (2KB) + a single table
fetch (~3KB for 18 partners) = under 10KB for first interaction.

### §16.4 Metadata JSON queryability

The `metadata TEXT` column on core tables stores domain-specific fields
as JSON. SQLite's `json_extract()` is slower than real column access.

Measured bounds:
- `json_extract` over 5,000 rows: <10ms desktop, <30ms mobile
- Over 84K rows (full ad_seed.db): <50ms
- Acceptable for interactive drill; insufficient for batch reporting

Mitigation: fields that become frequent query targets are promoted to
real columns via `ALTER TABLE ADD COLUMN` (SQLite supports this without
table rebuild). The JSON column is a staging area for schemaless fields,
not the permanent home for high-frequency analytics.

### §16.5 Manifest override mechanism

The compiled manifest (§13) is the base configuration. Two override
paths exist for runtime customisation without recompilation:

1. **Direct JSON edit** — manifest.json is human-readable. Change a
   field's mandatory flag, reorder tabs, add a field. Reload the page.
   No compiler, no server, no PostgreSQL.

2. **Settings JSON (localStorage)** — the S282 settings template stores
   user preferences that patch the manifest at load time: hidden fields,
   reordered tabs, custom labels, bubble order. The manifest is the
   default; localStorage overrides are the personalisation layer.

The compiler (`scripts/compile_manifest.js`) is for cold-start generation
from the AD source. It is not required for day-to-day configuration.

### §16.6 Relationship between legacy tables and 5-table model

The 5 core tables (§12) and the legacy iDempiere tables coexist in the
same SQLite database. They serve different roles:

| Concern | Legacy tables (C_*, M_*) | 5-table model |
|---|---|---|
| Role | Imported reference data | Runtime working data |
| Schema | Fixed columns per table | Generic + metadata JSON |
| Source | PostgreSQL export (ad_seed.db) | Created by doc_engine.js |
| Growth | Static (GardenWorld demo) | Grows with user activity |
| Example | C_BPartner has 30+ columns | items has 8 columns + metadata JSON |

The compiled manifest maps each window to its backing table — whether
that table is `C_BPartner` (legacy) or `items` (5-table). The accordion
and kernel_ops work identically with both.

When a feature requires a table not in the 5-table model (e.g.,
C_Commission for sales commissions), the lazy fetch retrieves that
table's schema from the manifest and its data from the server or
ad_seed.db. The 5-table runtime does not grow unless needed.

Tables that exist in both models (e.g., partners exist in C_BPartner
AND could be stored in items) are not migrated. Legacy data stays in
legacy tables. New data created by the user goes to the 5-table model.
The manifest tells the UI which table to query for each window.

---

## §17. Architecture summary (extends §10)

[§10](#10-scope-and-status) covers running the AD client-side. This section
summarises the runtime architecture built on top of it: an ERP runtime over
five tables, business logic as pure functions, undo/redo via event sourcing
([§0.16](#016-the-wire--the-kernel--data-driven-evaluator-and-op-log-kernel-2026-05-29-wirekernel-pass)),
and a constellation UI in place of the menu-tree navigator. No JVM,
PostgreSQL, OSGi, or server process is required at runtime.

The ~13MB Application Dictionary is compiled to a compact manifest
([§13](#13-the-compiled-manifest--ad-as-compiler-input)) that drives rendering;
the full AD is retained as the source for reference and recompilation, but is
not loaded wholesale at runtime (it streams by gravity rank,
[DistributedERP.md §13](DistributedERP.md#13-sharding-the-engine-by-gravity-what-arrives-and-when-2026-06-01-spec)).
The enforcement surface is small: ~150 lines of kernel, five tables, one write
path (`commitOp`), one audit trail (`kernel_ops`), one accounting projection
(`journal`).

---

## §18. The Unified Model — BOM + WfMC on One Log (empirically validated)

This section is not theory. Every claim below was tested against the WHOLE
iDempiere dictionary (roughly a thousand tables and thousands of FK columns) by
`scripts/test_bom_theory.js` (in the bim-compiler repo). The §BOM_TEST log is
the witness. Re-run it to reproduce.

### §18.1 Every relationship is one of two edges

Strip the labels off iDempiere's schema and only two relationship kinds remain:

1. **Structure edge** — recursive parent→children (the BOM). Two flavours:
   - **Containment** ("has-a"): `Building→Floors`, `Order→OrderLines`,
     `Window→Tabs→Fields`. The parent *holds* the child.
   - **Derivation** ("made-from, by a verb"): `Order→Invoice→Shipment→Payment`.
     The child is *computed from* the source document by a DocAction (see §18.3).
2. **Component citation** — a leaf names independently-existing master/reference
   data by quantity (`OrderLine→Product`, `Invoice→Partner`). Cited, not composed.

This is the BOM principle (`docs/BOMBasedCompilation.md`) applied to business
documents. **There is one compiler.** A building is a BOM; a purchase order is a
BOM; the AD window hierarchy is a BOM. BIM and ERP are the same recursion over
different leaves. The op-log (`kernel_ops`) is the BOM's composition history.

### §18.2 What the data said (witness: §BOM_TEST, 2026-05-29)

| Test | Result | Verdict |
|---|---|---|
| T1 resolution | 3,465 / 5,231 domain FKs resolve (66%) via `_ID` convention | conclusions robust on the resolved sample |
| T2 acyclicity | TWO cycles found | naive "structure = DAG" **falsified — and refined** |
| T5 hubs | `C_Order` in-degree **23** (#1), then Invoice 20, Payment 17, RMA 12, PP_Order 10 | source-replication **CONFIRMED** |

The two T2 cycles are not refutations — they forced two true distinctions:

- **Derivation cycle `Order→Payment→Invoice→Order`** = the **three-way match**.
  Resolved by *direction*: forward **lineage** (Invoice derived-from Order) is a
  DAG; the closing edge is a **settlement back-reference** — a third relation, the
  reconciliation citation. This is how a source document stays bound to its replicas.
- **Containment cycle `OrderLine↔RequisitionLine`** = **component reuse**. A part
  appears in two BOMs (Order, Requisition). **Per-context, containment is always a
  DAG** (tab levels strictly increase). Reuse across assemblies is the BOM
  superpower, not a cycle. Containment must be compiled *per-window*, never as a
  global tree.

**The refined rule:** containment is per-context; derivation is causal-forward;
settlement back-references close reconciliation loops. Nothing fell outside the model.

### §18.3 A document is a *lifecycle*, not a table

Witness §BOM_TEST: 51 tables carry **both** `DocStatus` and `DocAction`; 52
`C_DocType` configurations exist. The definitive split is **lifecycle vs none**:

> **Document** = `DocType` (configures) + `DocAction` (drives — the verbs) +
> `DocStatus` (records) + `kernel_ops` (audits). **Master data** has none — it is
> a lifeless citation.

- **DocAction *is* the verb.** The 14 actions — `PR` Prepare, `CO` Complete,
  `AP` Approve, `RJ` Reject, `WC` Wait-Complete, `VO` Void, `CL` Close,
  `RE` Re-activate, `RC` Reverse-Correct, `RA` Reverse-Accrual, `PO` Post,
  `IN` Invalidate, `XL` Unlock — are the operators that advance state **and fire
  derivations**. `Complete` on `C_Order` is what produces the 23 replicas T5 measured.
- **`C_DocType` is the parameterization** — "one source, many purposes." Same
  `C_Order` table; DocType selects which sequence, which downstream docs, which
  GL treatment.

So the *behavioural* surface of the whole dictionary is tiny: a few dozen document
types driven by a handful of verbs. The bloat is parts on a shelf; the behaviour is small and
WfMC-shaped.

### §18.4 WfMC from the ground up — and it collapses into one log

| WfMC reference element | Compiled artifact |
|---|---|
| Process definition | `C_DocType` (+ optional `AD_Workflow`) |
| States / activities | `DocStatus` values |
| Transitions | the 14 `DocAction` verbs |
| Worklist | the **gravity globe** — what needs action, glowing |
| Audit trail | **`kernel_ops`** |

`kernel_ops` is therefore *simultaneously*: WfMC execution history, sync/replication
substrate (§ multi-node), undo/time-machine, and gravity source (§14 already weights
`DOC_COMPLETE`=2.0, `DOC_VOID`=1.5). **One append-only log, replayed, is the whole
engine.** The workflow engine and the replication engine were never separate.

**Correction this forces:** the manifest's `state_machine` must be compiled
**per `C_DocType`** (from the DocAction set + transition rules), NOT hardcoded per
table — because one `C_Order` table behaves differently by DocType. The current
`compile_manifest.js` §4 hardcoding is a placeholder, replaced in the build plan.

### §18.5 Local-first mesh — no one node holds the whole

Each user is a local-first node owning their ~10% working set; the org ERP is the
**union of nodes**, synced user-to-user by merging op-logs (Git-style DAG: parent
pointers, fetch-fills-gaps, deterministic replay). "Heavy mode" is the mesh, not a
monolith. Integrity goes eventually-consistent and conflicts cluster at **document
handoffs** (the derivation seams) — the same few places where global invariants
(single-invoice-per-order, cross-user budget) live. Those few get *detect-and-reconcile*
or a *designated owner node*; everything else is enforced locally. Causality follows
the **lineage spine** (compile-time taggable: FK to a lifecycle table = lineage;
else citation), not the full FK tangle.

**Build order is therefore hub-first** — `C_Order → C_Invoice → C_Payment → M_RMA
→ PP_Order` — because the derivation hubs are where usage, money, WfMC richness, and
gravity all concentrate. See `prompts/ERP_KERNEL_BUILD.md` for the phased plan.

### §18.6 Scaffold vs business logic — the handler registry

The state machine is **not** where the complexity lives. The bloat-and-hell is the
**business logic**: pre-conditions, side effects, post-conditions, and conditional
fan-out (`Order→Invoice only if IsInvoice`). Every hellish rule attaches to exactly
one **cell**: `(DocType, currentStatus, action)`.

**The scaffold contains the hell; it does not remove it.**
`DocType + DocAction + DocStatus + kernel_ops` is scaffold — it guarantees you only
call `completeInvoice()` on a valid Invoice, never on a voided Order. The mechanism
is **dispatch by cell**:

- **State machine** — which cells are *reachable* (legal transitions). Compiled data.
- **Handler registry** — the *behavior at a cell*: `handler[(DocType, action)] =
  fn(doc, ctx) → ops[]`. Contains all the bespoke logic. A handler may invoke other
  handlers → composed workflows. **Each handler touches only its own DocType**, so
  the bloat scattered across the whole dictionary is partitioned into isolated, nameable units.
- **kernel_ops** — every effect a handler produces is an op. **A side effect that
  bypasses the log is a violation, and it is detectable.** Handlers *return* ops; the
  kernel *applies* them (this is the path to B1: kernel owns the write). That makes
  every handler a pure, testable function and the log the single source of truth.

**Why this tames the 15,000 lines:**
- The hell becomes **visible** (one cell, one handler), **testable** (given doc+ctx,
  assert emitted ops), **replayable/undoable/auditable** (it's all ops).
- Handlers are written **hot-first**, ranked by gravity (§14). Most cells are never
  exercised — so most handlers are never written. The product compiles its own
  business-logic backlog from observed usage. The 90% nobody uses costs nothing.

**Summary for code:**
- State machine = *allowed transitions* (compiled — build P2).
- Handler registry = *business logic* (per-cell handlers — build phase, gravity-ranked).
- Log = *single source of truth* (already `kernel_ops`).

### §18.7 The mailbox and the rulebook — out-of-band, content-addressed, never a server brain

**The engine lives where the user lives.** Every peer runs the same deterministic
kernel on its local SQLite; there is no server-side engine. The server, if any, is a
**pure relay** — "an S3 bucket with auth" — storing op-logs and snapshots for peers
to push/pull (Git-remote style). It never applies, merges, or arbitrates. Removing
the central brain does not delete the hard problems; it **relocates** them — into the
op-log protocol and into *peer roles*, never back into the server:

- **Visibility/auth** — the relay still needs *addressed* inboxes (per-org/per-user)
  and keys. It reads the envelope address; it never opens the letter.
- **Global invariants** (single-invoice-per-order, cross-user budget) — moved to a
  **designated peer role** (the AP node owns invoice issuance; others request) or
  detect-and-reconcile at merge. Coordination is a *user with a hat*, never a server.
- **Hints** ("hot ops you may want") — computed from op *metadata* (table, type, ts,
  user_tag) only, never by applying the op; or dropped entirely in favour of peer
  gossip. Encrypt op bodies → the relay sees only routing headers.
- **Version skew is THE hard problem** — each PWA self-updates, so ops from mixed
  kernel/handler versions coexist with no central migration. Defence: every op carries
  `kernel_version`; handlers stay deterministic AND backward-compatible.

**Rules are two layers, not one:**
- **Handler *code*** (imperative `completeOrder()` logic) ships *with* the PWA
  (service worker), versioned with the kernel. **Never** hot-swapped as remote code.
- **Policy *data*** (declarative flags: `(Order,Complete):{creditCheck:false}`) is a
  **signed, content-addressed manifest** (`policy_vN.json`, Git/IPFS) the admin
  publishes; handlers *read* it at write time. Hot-swappable, governable, auditable.

**Two append-only logs, one link.** The event log (`kernel_ops`) and the policy/config
log (content-addressed, signed) are stitched by a `policy_hash` stamped on every op —
not needed for replay (effects are frozen, §18.8) but required for AUDIT: *"why did
this complete with no credit check?"* → the op cites `policy_v2`. Local rule overrides
must be **marked** so un-synced policy can't silently pollute shared history; admin-key
trust (who publishes, rotation/compromise) is an org-root-key / designated-peer concern.

### §18.8 Doc is the Event — the document-event as the atomic unit

A document is **not** a row that events happen *to*. Its lifecycle **is** the event
stream: PO #5 *is* `created → completed → invoiced → paid`. The row (current
`DocStatus`) is the fold; the `DocAction`s are the events.

"The transaction" is the giveaway: the **document-event is the atomicity boundary.**
When `Complete` fires, the handler returns a *group* of effect-ops (status change +
invoice + lines + journal). That group is the single unit of four things at once:

- **Atomic** — commits or rolls back together (the transaction).
- **Undoable** — undo a document-event undoes the whole group, never a stray op.
- **Syncable** — the causal unit that ships and replays together.
- **Auditable** — stamped with `policy_hash` + `kernel_version`.

This is the unit that makes the op-log coherent rather than a flat stream — and it is
exactly P3b's handler contract (`handler → ops[]`). In the 5-table model, each
`documents` row **is** the event-carrying aggregate root.

### §18.9 Aggregates are checkpointed projections (precise rule)

Not "no mutable aggregates." The authoritative state is the log; aggregates
(`StorageOnHand`, `OrderLine.Price`) are **rebuildable projections**, never sources of
truth. But a naive JOIN-over-all-history is O(history) and won't scale — so they MAY
be **materialised as checkpoints**: `StorageOnHand = checkpoint_at_cursor_N +
Σ(mutations since N)`. The kernel treats them as a cache the log can always
regenerate. This is the same snapshot+delta needed for mesh compaction/bootstrap.

### §18.10 The oracle: iDempiere's model classes validate handlers (extract, don't port)

We have the golden reference — iDempiere's 20-year Java source. Use it to **validate**
that each JS handler implements the same business rules, **never to port blindly**.
This is EXTRACT-don't-invent applied to behaviour (the §18.6 "hell").

- **Per `(DocType, action)`, the Java method is the spec.** Before writing
  `completeOrder()`, open `org.compiere.model.MOrder.completeIt()`; copy its
  pre-conditions, side effects and post-conditions as the handler's pre-flight
  citation (`// Oracle: MOrder.completeIt() — checks: isProcessed, credit, …`).
  Each check → one test fixture (a test names the rule it proves).
- **Diff-oracle (Docker) — the strongest test.** Run the same transaction in a real
  iDempiere (`docker start postgres`), dump the affected rows, run the JS handler on
  the same input, compare. **The schemas differ** (real tables vs 5-table) — so
  compare at the **semantic/op level, normalised through `ad_table_map`** (a created
  `C_Invoice` ⇄ `documents[INVOICE]` + lines), or compare the effect-ops both sides
  emit. Mismatch = bug OR a *documented* intentional divergence.
- **Gravity-ordered.** Extract oracle rules HOT-CELL-FIRST — `MOrder.completeIt()`
  before the long tail — the same backlog as the handler registry (§18.6, §14).
- **The oracle grounds the policy schema (§18.7).** The flags (`creditCheck`,
  `autoCreateShipment`) are *read off* what `completeIt()` conditionally does; the
  `Order→Invoice iff IsInvoice` fan-out (§BOM_TEST T3) is literally a branch in the Java.
- **Scope the diff to the document-event (§18.8)** — compare the documents/lines/journal
  the transaction produced (the atomic op-group), not transient state. iDempiere posts
  accounting asynchronously; our `journal` is synchronous — normalise that.
- **Don't copy:** concurrency locking, server round-trips, OSGi/plugins, the framework.
  The ~150-line kernel + per-cell handlers replace ~15,000 lines.

---

*Copyright (c) 2025-2026 Redhuan D. Oon. MIT Licensed.*

---

## §19. Performance Model — Transaction Cost vs iDempiere (analytical, multi-user apples-to-apples)

This section is an **analytical cost model, not a benchmark.** Where a mechanism is
proven it cites the witness; the GL case is an explicit projection. The comparison is
held **apples-to-apples**: iDempiere is multi-user by construction, so it is compared
against *this architecture in its secured/multi-user configuration* (§0.20 — local kernel
+ asynchronous facilitator + W-CHAIN/W-SIGN), **not** the bare single-user mode. The
single-user/offline mode is the lower bound, noted for contrast.

### §19.1 Two latencies, decoupled

Traditional three-tier ERP collapses two costs into one synchronous commit; this
architecture separates them:

- **Interactive latency `T_i`** — what the operator waits for: `T_compute + T_apply + T_commit`.
- **Convergence latency `T_c`** — until other users / the supervisor log reflect it:
  `T_order + T_push + T_ingest + T_fanout`.

In iDempiere `T_i ≈ T_c` — the WAL-synced commit *is* the point of multi-user visibility.
Here `T_i` is local (in-RAM, ~0 ms perceived) and `T_c` is asynchronous (the facilitator
orders + persists + fans out). The multi-user tax is paid in both systems: iDempiere pays
it **synchronously, inside `T_i`**; this architecture pays it **asynchronously, inside `T_c`**.

| Cost term | iDempiere (multi-user server) | Here (secured multi-user) |
|---|---|---|
| client ⇄ server network | per action, inside `T_i` | **0** in `T_i`; the push is in `T_c` |
| DB statement round-trip | JDBC ⇄ PostgreSQL, inside `T_i` | **0** — sql.js runs in-process |
| isolation | MVCC + row locks, synchronous | deterministic replay; cross-writer invariants at one CAS seam (`DistributedERP.md §5`) |
| durable commit | WAL fsync, synchronous | op-log append; durability achieved on relay to the facilitator (`T_c`) |
| total ordering | implicit in the single authoritative DB | the facilitator assigns it, asynchronously |

The guarantees are **not identical**: iDempiere gives synchronous serializability for every
op; this gives asynchronous convergence + deterministic replay, with synchronous
enforcement reserved for the single online CAS op-class (oversell / double-claim). That
trade is the substance of the comparison, not a footnote.

### §19.2 Extra operations this kernel performs

The audit / replay / sync substrate is not free. Per state change the kernel does work
iDempiere does not:

| Extra op | iDempiere default | Here | Cost / when it bites |
|---|---|---|---|
| Rich op: before/after + lineage GUIDs | `AD_ChangeLog` optional, changed-columns only | **always**, full snapshot (§0.6) | memory + CPU per op; scales with batch rows × row width — the main batch tax |
| Hash-chain per op (W-CHAIN) | none | SHA over each op | ~µs each (native); O(n) over a batch — negligible per op |
| Signature (W-SIGN) | DB session auth | optional asymmetric sign | ms-scale → **sealed at chain-segment boundaries, not per op**; per-op signing would dominate a batch |
| Identity mint + record (G-IDENTITY §0.21) | server DB sequence (a round-trip) | UUID minted + recorded locally | trades a sequence round-trip for a few bytes — net win |
| Settlement re-derivation | follows the stored FK (`M_InOutLine_ID`/`C_OrderLine_ID`) | matcher reconstructs pairs from partner + product + qty (partitioned join + greedy first-fit, §0.17) | **genuinely more CPU than an FK-follow** — the one place this does *more* work than iDempiere; buys FK-absent robustness |
| Replay + hash verify | trusts DB state | rebuilds the projection from the log, hash-compares | O(log), on demand, off the hot path |

### §19.3 Overhead iDempiere carries that this avoids

The reciprocal: iDempiere's hot path includes MVCC version rows, WAL fsync, per-statement
parse/plan over JDBC, OSGi event dispatch, `ModelValidator` reflection, ZK component-tree
round-trips, and sequence round-trips. The net trade is **infrastructural overhead removed
from the hot path** (network, MVCC, WAL, JVM/OSGi) **for semantic overhead added**
(snapshot, hash, optional sign, occasional re-derivation) — mostly small per-op and partly
deferrable.

### §19.4 The two cases (order-of-magnitude, illustrative)

**POS Order Complete** (proven path: 7 ops, `replay-hash == live-hash`, §0.19).

- *iDempiere (multi-user):* one network round-trip + dozens of JDBC statements (shipment,
  invoice, allocation, `Fact_Acct`, status, sequence) + MVCC/WAL commit → interactive
  latency on the order of 10²–10³ ms; multi-user visibility at the same synchronous commit.
- *Here (secured multi-user):* `T_i` on the order of 10⁰–10¹ ms (local 7-op apply + 7
  rich/hashed ops; signature sealed per segment, not per op); `T_c` = async push (~KB) +
  facilitator append/order + fan-out, typically sub-second in the background.
- *Apples-to-apples:* both reach multi-user visibility in well under a second, but the
  operator's wait stays ~1–3 orders lower here because the multi-user tax sits in `T_c`,
  not `T_i`.

**10,000-line GL batch** (projection — the `Fact_Acct` posting cell is **not yet
implemented or verified**, §0.17).

- *iDempiere:* iterative posting, on the order of 10⁴–10⁵ INSERTs including double-entry
  facts + index/MVCC → tens of seconds to minutes; visible on commit.
- *Here (projected):* ~10⁴ ops applied in one in-RAM transaction (sub-second to seconds) +
  ~10⁴ before/after snapshots (the real memory tax) + ~10⁴ hashes (tens of ms native) + one
  segment-sealed signature (not 10⁴ signs); relay payload on the order of a few MB pushed
  asynchronously; facilitator ingest is O(n) **append**, not re-posting.
- *Apples-to-apples:* structurally ~1–2 orders faster to local completion, and the
  supervisor ingests by appending rather than re-executing — conditioned on (a) GL posting
  being built, (b) the snapshot + log-persistence tail, (c) running off the main thread
  (Web Worker).

### §19.5 Envelope — what this model does and does not claim

- **Analytical, not benchmarked.** The sync/integrity mechanics are POC-witnessed
  (`poc_chain` / `poc_sign` / `poc_distributed` / `poc_persist`; W-CHAIN in
  `kernel_ops.js` v5), **not** a deployed N-terminal multi-site benchmark.
- **GL is a projection** — the posting cell is dataless / untested (§0.17).
- **Async oversight is not a real-time gate.** Cross-writer enforcement that must block in
  real time is the single online CAS op-class (`DistributedERP.md §5`); everything else
  converges eventually.
- **The advantage is architectural, not algorithmic:** identical document logic, executed
  in-process against in-memory SQLite + an append-only signed op-log, with the multi-user
  tax deferred to an asynchronous facilitator instead of paid synchronously per transaction.

### §19.6 Side-by-side summary — where this wins, and the extra it requires

Order-of-magnitude, analytical (see §19.5 envelope). "Better" is stated honestly —
some rows favour iDempiere, some are a deliberate trade. The last column is the **extra
work this architecture must do** to reach the stated position (the cost of the win).

| Dimension | iDempiere (multi-user server) | This architecture | Better? | Extra needed here |
|---|---|---|---|---|
| **Operator-perceived latency** (POS complete) | network + dozens of JDBC stmts + WAL commit (~10²–10³ ms) | local in-RAM apply of the 7-op group (~10⁰–10¹ ms) | **This** (~1–3 orders) | none — it is the default path |
| **Bulk throughput** (10k GL batch) | iterative posting, ~10⁴–10⁵ INSERTs (tens of s – min) | one in-RAM transaction (sub-s – s) | **This** (~1–2 orders), *projected* | build the GL `Fact_Acct` cell (§0.17); run off-thread (Web Worker); absorb snapshot/log tail |
| **Multi-user visibility** | synchronous at commit | asynchronous convergence | **Trade** — synchronous vs eventual | async facilitator (order + persist + fan-out) |
| **Durability** | WAL fsync, synchronous, on-box | op-log relayed to facilitator / cloud / mailbox replica | **Trade** — synchronous vs eventual | W-PERSIST + relay; until relayed, the local copy is volatile |
| **Cross-writer enforcement** (oversell / double-claim) | locks / MVCC on every op, synchronous | one online set-if-unset CAS op-class | **Trade** — broad vs narrow-but-sufficient | the single synchronous CAS op (`DistributedERP.md §5`) |
| **Audit trail** | `AD_ChangeLog`, optional, changed-columns only | `kernel_ops` rich op (before/after + lineage), always on | **This** | rich-op memory/write per change |
| **Tamper-evidence** | none by default | hash-chain (W-CHAIN) + optional signature (W-SIGN) | **This** | hash per op; signature sealed per chain-segment |
| **Replay / undo / time-machine** | none — the DB is only current state | deterministic replay; frozen effects | **This** (structural) | determinism sandbox (no `Date.now`/`Math.random`); identity-as-input (§0.21) |
| **Analytics** | bolt-on warehouse / ETL | the op-log *is* the analytical store (§0.6) | **This** | a rich op-log + the gravity fold (§14) |
| **Settlement matching** | follows the stored FK | re-derives pairs from partner + product + qty (§0.17) | **iDempiere** cheaper; **This** more robust (works FK-absent) | extra matcher compute (partitioned join + greedy) |
| **Identity / sequence** | server DB sequence (a round-trip) | edge-minted UUID, recorded (§0.21) | **This** (no round-trip) | record `op_uuid` + `seq` per op |
| **Infrastructure footprint** | JVM + OSGi + PostgreSQL + app server | single HTML + sql.js, no server | **This** | for multi-user, one thin **async** facilitator (not a compute authority) |

**Reading it in one line:** this architecture wins decisively on **interactive latency, footprint,
audit, tamper-evidence, replay, and analytics**; it deliberately **trades** synchronous
multi-user durability/visibility/enforcement for asynchronous convergence (re-added by the
§0.20 facilitator), and pays a small **extra** per-op cost (rich snapshot + hash, occasionally
re-derivation) to get the audit/replay/sync substrate "for free" downstream. The only row where
it does genuinely *more compute* than iDempiere is settlement matching — and that buys
FK-absent robustness.

---

## §20. Addendum — prototype status and the role of the UI views (2026-06-01)

**What this is: a working prototype, not a finished product.** The witnessed parts — the
5-table collapse (§5TBL), the O2C/P2P verticals reproducing the GardenWorld oracle
(§0.17–§0.19), the kernel + deterministic replay (§0.16), the read-only Glassbowl views
(§Views), and W-CHAIN live in `kernel_ops.js` — demonstrate the architecture end-to-end on a
*contained* data set. They are not a deployment covering an organisation's full document set,
and the write-loop (T3) is still parked.

**The premise it rests on — absorbing iDempiere's inherent model.** iDempiere's Application
Dictionary already encodes the inherent model of an ERP: the windows, tabs, fields, references,
validation rules, document types, and the lifecycle each document follows. Most of what any
given user needs is therefore already *described* there — it is the engine *around* the AD that
this project re-bases as data (the §thesis). The claim is not that this prototype reimplements
every business concern; it is that **once it absorbs more of the AD's inherent model** — more
doc types, more reference/validation rules, the GL posting cell (§0.17), and localisation /
compliance rows — the same extract-only mechanism that reproduced O2C/P2P extends to those
concerns **without new hand-written engine code**. The breadth comes from absorbing the
dictionary, not from writing features. That is what makes "addresses most of the users'
concerns" a structural goal rather than a backlog.

**The three UI views are fast POCs, not the product surface.** Glassbowl (the engine *mapped*,
View 1), Glassbowl Gravity (the engine *weighed*, View 2), and the ReadMe/ShowMe help-tour (the
engine *guided* — `docs/ReadMeShowMe.md`, added today) are each a quick, read-only response to
**one scenario a tail user might bring**: *"show me the structure" · "show me where value and
risk pool" · "show me where the control is, and do it for me."* They are deliberately cheap to
stand up — the same `createElementNS` SVG, the same keyed-overlay governance
(`UI_OVERLAY_GOVERNANCE.md`), 0 hand-authored, generated from the extracted data — precisely so
that **whatever scenario a given tail entails, a matching view can be built the same way**: a
thin projection of the already-extracted model, not a new application.

**Roadmap (addendum).** Stated as intent; each item ships spec-first, witness-led, on the
existing extract-only discipline. Mirrored in the UI doc's addendum (`docs/ReadMeShowMe.md`).
- **Absorb more AD model** — doc types beyond O2C/P2P, reference/validation rules, the GL
  posting cell (§0.17), and localisation / compliance rows (the long tail's real first need).
- **Land the write-loop (T3)** — the greyed CRUD ring and the History undo-preview become the
  signed kernel write (`crud_overlay.js`: E2 dry-run → E3 signed kernel, `commitOp`/`sealChain`).
- **A thin POC view per tail scenario** — each new need (a particular trade, a compliance
  regime, an operator's daily flow) gets its own read-only view over the extracted model first,
  editable once T3 lands. The roadmap is *extend the model + project a view*, not *build N apps*.
