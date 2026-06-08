# The Construction Economy Is About To Get Hit By an ERP Expert

<div class="bim-banner" markdown>
<b>Academic paper — applying 30 years of ERP to construction.</b> What Autodesk and Primavera should have done together, from the architect of ADempiere and iDempiere.
</div>

*What Autodesk and Primavera should have done together, but i can't wait.*

**Redhuan D. Oon**
ADempiere (2006) | iDempiere (2010) | Author, *Open Source ERP* (2010) | BIM5D (2025)

red1org@gmail.com | [LinkedIn](https://www.linkedin.com/in/red1oon/)

**Open Source Repositories:**

| Repository | What's There |
|-----------|-------------|
| [BIMCompiler](https://github.com/red1oon/BIMCompiler) | The compiler, BIM COBOL verbs, BIM Designer, Back Office — this paper's subject |
| [Federation](https://github.com/red1oon/IfcOpenShell/tree/feature/IFC4_DB/src/bonsai/bonsai/bim/module/federation) | FederatedModel powering IFC as a spatial model inside Bonsai/Blender |
| [Terrain Topology](https://github.com/red1oon/IfcOpenShell/tree/feature/IFC4_DB/src/bonsai/bonsai/bim/module/federation/pdf_terrain) | Terrain mesh mapper for survey data, contour generation, cut-and-fill |
| [River IoT](https://github.com/red1oon/IfcOpenShell/tree/feature/IFC4_DB/src/bonsai/bonsai/bim/module/federation/river) | IoT sensor framework for environmental and infrastructure monitoring |

March 2026

---

## 1. The Problem Nobody Has Solved

Construction is the world's largest industry that still cannot answer a simple question deterministically: *given this building design, what exactly do I need to buy, where does each piece go, and can I prove it?*

Design tools (Revit, ArchiCAD, Bonsai) produce geometry. ERP systems (SAP, Oracle, iDempiere) manage procurement. Between them sits a manual, error-prone gap where quantity surveyors extract Bills of Materials from drawings by hand. This gap is estimated to cost the industry billions annually in rework, over-ordering, and undetected non-compliance.

The gap persists because design software treats buildings as geometry problems, while ERP treats products as data problems. No widely-adopted open-source tool has built the bridge — a deterministic compiler that reads one and writes the other.

This paper describes a working system that does exactly that.

## 2. The Insight: A Building Is a Manufactured Product

In 2006, we built ADempiere's manufacturing BOM module. In 2010, we rebuilt it for iDempiere. After two decades of watching M_Product, M_BOM, and C_Order handle everything from circuit boards to furniture assemblies, the realisation was unavoidable:

**A building is just a very large manufactured product with spatial coordinates.**

Every wall panel is an M_Product. Every floor plan is an M_BOM (assembly recipe). Every construction project is a C_Order. The only thing manufacturing MRP lacks is the *where* — the (x, y, z) coordinates that turn a flat bill of materials into a three-dimensional building.

We call this **Spatial MRP**: Material Requirements Planning extended with tack offsets — parent-relative coordinates (dx, dy, dz) on each BOM line that tell the compiler exactly where each child element sits relative to its parent.

This is not a metaphor. The data model is structurally identical to iDempiere's manufacturing module, extended with three integer columns per BOM line (see `docs/DATA_MODEL.md`).

## 3. What the Compiler Does

The BIM Intent Compiler reads an IFC building model (the international standard for building data) and produces a factorised Bill of Materials mapped to ERP procurement tables — deterministically, reproducibly, and with mathematical proof at every step.

**Input:** An IFC file. The largest tested model contains 48,428 elements across 8 engineering disciplines — architecture, structural, fire protection, HVAC, electrical, curtain wall, sprinklers, and LPG (see `docs/TerminalAnalysis.md`).

**Output:** A 700-line BOM that expands back to those 48,428 placements. A 73:1 compression ratio. Each line is a recipe (product x quantity x position formula), not a placed instance. The compiler *expands* recipes into placements at compile time — the same operation an ERP system performs when it explodes a manufacturing BOM into work orders.

**Pipeline:** Nine stages — validate metadata, parse DSL, compile geometry, apply templates, write output, execute domain verbs, compute digest, verify geometry, prove placement (see `docs/SourceCodeGuide.md` §Pipeline).

**The Prime Rule:** *Extract or compile only.* Every coordinate in the output traces to either an extracted IFC position (via IfcOpenShell) or a computed tack offset from BOM formulas. Nothing is invented. This is the compiler's most important property, and it is enforced by six verification gates (see §4).

## 4. How We Know It Works

Claims without proof are marketing. This system is built on proof.

**Six verification gates** run on every compilation:

| Gate | What It Checks |
|------|----------------|
| G1-COUNT | Element count in output matches BOM expansion |
| G2-VOLUME | Aggregate volume within tolerance |
| G3-DIGEST | SHA256 spatial fingerprint is reproducible |
| G4-TAMPER | No hardcoded coordinates, no weakened tests |
| G5-PROVENANCE | Every output element traces to a source |
| G6-ISOLATION | No cross-contamination between buildings |

**196 witness assertions** — machine-checkable claims, each running as a JUnit test. Example: *"W-ROUTE-SP-1: sprinkler spacing >= 3000mm in TE storey 2."* A failing witness blocks the compilation gate. These are not unit tests in the conventional sense — they are executable specifications that prove construction compliance (see `docs/TestArchitecture.md`).

**A tamper seal** — SHA256 fingerprints of 68 critical files. If a developer weakens a test to make it pass, the seal breaks, requiring a re-seal ceremony with full git diff review. This prevents the most insidious form of regression: tests that evolve to match broken code.

**Rosetta Stone buildings** — real IFC models compiled as reproducible benchmarks:

| Building | Checks Passing | Domain |
|----------|---------------|--------|
| Sample House (SH) | 9/10 | Residential |
| Duplex (DX) | 7/10 | Multi-unit residential |
| Terminal (TE) | 8/10 | Commercial (airport) |
| Bridge (BR) | 10/10 | Infrastructure |
| Road (RD) | 4/4 | Infrastructure |
| Rail (RL) | 4/4 | Infrastructure |

Element counts: see [PROGRESS.md](https://github.com/red1oon/BIMCompiler/blob/master/PROGRESS.md).

*Checks = 6 gates (G1-G6) plus gate-specific sub-checks (e.g. G5-PROVENANCE has 7 internal checks). A building with 6/6 gates passing may still have sub-check debt. See `docs/TestArchitecture.md` for per-gate breakdown.*

These numbers are not cherry-picked. DX scores 7/10 because the MIRROR verb (for mirrored duplex halves) is incomplete. TE's G2-VOLUME tolerance is 13.7%, not zero, because CLUSTER verb offset tables use +/-10% tolerance for semi-regular grids. We publish the failures alongside the successes (see `docs/PROGRESS.md`).

## 5. BIM COBOL: A Domain Language for Construction

Every building mutation passes through a named, auditable verb. We call this **BIM COBOL** — not because it resembles COBOL syntax, but because it serves the same purpose: a domain-expert-readable language where a fire engineer can read `ROUTE SPRINKLERS SPACING 3000mm` and verify compliance without reading Java.

77 verbs are implemented. The five that matter most:

| Verb | What It Does | Coverage |
|------|-------------|----------|
| TILE | Lays a 2D grid (floor tiles, ceiling panels, roof sheets) | 74.4% of Terminal's 48K elements |
| ROUTE | Runs MEP piping/ducting along a path | Sprinklers, drainage, HVAC |
| CLUSTER | Groups semi-regular elements (tolerance-based) | Dominant in infrastructure |
| FRAME | Places structural members with LBD alignment | Columns, beams, bracing |
| ARRAY | Lays a 1D linear sequence | Fence posts, bollards, sleepers |

Each verb produces a typed `VerbResult` — success/failure, witness proof, and payload. No anonymous SQL. No silent geometry mutations. Full audit trail via W_Verb_Node, iDempiere's production order pattern (see `docs/BIM_COBOL.md`).

## 6. The BIM Designer: Compilation as User Interface

Most BIM tools let users draw geometry directly. This system does the opposite: the user chooses parameters, and the compiler builds.

**Architecture:** A TCP server (Java, port 9876) serves a Blender addon (Python) via ndjson protocol. The Blender side is deliberately thin — it renders what the compiler produces. All logic lives in Java. All data lives in SQLite. This is the "Java-smart, Python-dumb" principle (see `docs/BlenderBridge.md`).

**What works today (408/414 tests passing, 42 test classes):**

- **Snap-to-room placement** — user selects a product from the catalog, compiler validates it fits (dimensions, clearance, discipline rules) and places it at the correct tack offset
- **Assembly builder** — layer-by-layer wall/roof/floor composition with thermal U-value calculation per BS EN ISO 6946. Swap a layer, and the parent AABB and U-value recalculate automatically (see `docs/ASSEMBLY_BUILDER_SRS.md`)
- **Variant save/recall** — every design state is a C_Order snapshot in output.db (compile DB). Compare variants side-by-side. Undo via changelog replay. Save persists to .blend file
- **Infrastructure terrain snap** — four modes (ON_SURFACE, ABOVE, BELOW, PIER) on real survey data (689 points, 294m x 229m, 20m elevation band). Cut-and-fill volumetrics with grading strategy. Alignment model for road/rail curvature (see `docs/INFRA_DESIGNER_SRS.md`)
- **Product catalog** with deterministic similarity ranking — no AI, no embeddings, just feature vectors over known attributes
- **Jurisdiction-scoped validation** — rules per building code (currently MY/UBBL, 30 rules), enforced at placement time via AD_Val_Rule, iDempiere's validation rule pattern

**What's still batch-mode:** The Blender integration currently requires a full recompile after each edit. Real-time incremental update (G-8 on the roadmap) is architecturally prepared — file watchers and scope detectors exist — but the pipeline does not yet support partial-stage entry. This is a significant gap between the current prototype and a production-grade interactive editor.

## 7. Multi-User Back Office and ERP Reporting

Construction projects have many stakeholders reading the same data differently. A project manager wants a Gantt chart. A cost consultant wants a 5D breakdown. A sustainability officer wants embodied carbon. A facilities manager wants a maintenance schedule. An auditor wants a change log.

The Back Office module (BIMBackOffice, ~3,000 LOC Java, separate HTTP server on port 9877) serves all of them from the same compiled data:

**Session management:** Token-based (UUID), 30-minute timeout, per-database write locks (ReentrantLock), SQLite WAL mode for concurrent reads. `whoIsEditing()` detects when two users target the same building — conflict detection, not resolution. This is single-JVM, single-server. No distributed locking. No clustering. Honest about the scale it handles today.

**Report engine (4D-7D), each a DAO reading the same BOM data:**

| Dimension | What It Reports | Source Pattern |
|-----------|----------------|----------------|
| 4D Schedule | Construction sequence, Gantt tasks, labour-days by trade | ScheduleDAO — phase-sequence grouping (not CPM/PERT) |
| 5D Cost | 3-component breakdown: material + labour + equipment | CostDAO — CIDB Malaysia 2024 rates |
| 6D Sustainability | Embodied carbon (kgCO2e/m2), material passport | SustainabilityDAO — carbon map from component library |
| 7D Facility Mgmt | Maintenance schedule, lifecycle cost, asset register | FacilityMgmtDAO — COBie-compatible structure |

**Portfolio and governance:**

- **Cross-project portfolio** — scans all `*_BOM.db` files, aggregates cost, carbon, schedule, maintenance across buildings and infrastructure
- **Kanban board** — workflow cards grouped by DocStatus (DR/IP/CO/AP), following iDempiere's document lifecycle (see `docs/DocAction_SRS.md`)
- **Balanced scorecard** — 4 perspectives (Financial, Client, Process, Learning) x 3+ KPIs
- **Audit trail** — ChangelogDAO logs every PLACE/DELETE/MOVE/RESIZE with old/new values, supports undo. Mirrors iDempiere's AD_ChangeLog

**ERP pattern fidelity:** This is not a BIM tool pretending to be ERP. The data model *is* ERP. C_DocType routes building types. DocStatus governs lifecycle. AD_Val_Rule scopes validation by jurisdiction. W_Verb_Node records verb execution. AD_PrintFormat configures output selection. Every table name, every column convention, every lifecycle state comes from iDempiere's dictionary (see `docs/DATA_MODEL.md` §1).

**What's not here yet:** Role-based access control (AD_Role). PDF/CSV export. Report execution queue (AD_Process). Multi-currency cost rates. COBie MVD schema validation. These are roadmap items — the ERP patterns they follow are well-understood from two decades of iDempiere, but the construction-specific implementation is not yet written.

## 8. Standards, Compliance, and Inter-Discipline Coordination

Construction compliance is not optional. Buildings must meet fire codes, structural standards, accessibility requirements, and energy regulations — and these differ by jurisdiction.

**How this system handles it:**

- **Disciplines are metadata, not code branches.** The same BOM walker processes all 8 disciplines (ARC, STR, FP, ACMV, ELEC, SP, CW, LPG). What differs is the AD_Val_Rule set activated per discipline and jurisdiction. Adding a discipline means inserting rows, not writing code (see `docs/BOMBasedCompilation.md` §Disciplines).

- **Validation is three-tiered:**
  1. **BomValidator** — structural integrity (9 pre-commit checks: orphan lines, AABB envelope, tack non-negative, extraction reconciliation)
  2. **PlacementValidator** — compliance thresholds (room minimum size, ceiling height, door width — scoped by jurisdiction)
  3. **InferenceEngine** — rule chaining with dependency cascades (if a parent rule fails, child rules are skipped, not falsely passed)

- **Jurisdiction scoping via AD_Val_Rule:** Currently Malaysian UBBL (30 rules). The target is 200+ rules across 6 jurisdictions (SG, UK, AU, US, EU, HK). Each jurisdiction is a set of AD_Val_Rule rows with threshold parameters — not a code branch. The architecture is proven; the rule population is the work ahead.

- **IFC version bridging:** A 4-tier alias cascade in ERP.db resolves IFC2x3's generic classes (IfcFlowTerminal) to IFC4's specific classes (IfcOutlet) — 84 alias rows covering 85% of MEP element names. New IFC types are added via INSERT into `ad_ifc_class_map` (46 rows), not code changes (see `docs/DISC_VALIDATION_DB_SRS.md`).

- **Calibration against real buildings:** CalibrationDAO compares rule predictions (what the validator *thinks* should be placed) against actual engineer decisions extracted from the Terminal model (what *was* placed). This grounds the rules in professional practice, not just regulatory text (see `docs/CALIBRATION_SRS.md`).

## 9. One Year of Development: Honest Accounting

This system was built over approximately 40 working sessions spanning 12 months (2025-2026), producing roughly 20,000 lines of Java across 4 Maven modules, backed by 196 passing witness assertions and 280+ JUnit tests.

**What made this pace possible:**

The architecture — the recognition that IFC elements map structurally to ERP product lines — comes from 20 years of building and maintaining iDempiere's manufacturing BOM module. This is not a fresh insight arrived at by studying BIM; it is a pattern recognised by someone who has written M_BOM code for two decades and then looked at a building.

Claude Code (Anthropic's AI coding assistant) served as pair-programming partner throughout, handling implementation mechanics — DAO boilerplate, test scaffolding, SQL migration scripts, documentation — while the author directed architecture, domain mapping, and verification strategy. The AI accelerated implementation roughly 3-5x but did not originate the domain architecture. An AI coding assistant without the ERP domain background would produce a geometry tool, not a Spatial MRP compiler.

**What exists today:**

| Component | LOC | Tests | Status |
|-----------|-----|-------|--------|
| DAGCompiler (11-stage pipeline) | ~5,000 | 58 tests (G1-G6 gates) | Production-grade for tested buildings |
| BIM COBOL (verb engine) | ~3,000 | 27 tests | 77 verbs, 202 witnesses |
| IFCtoBOM (extraction pipeline) | ~3,000 | 10 tests | SH, DX migrated; TE transitioning |
| BonsaiBIMDesigner (GUI server) | ~8,500 | 408 tests (42 classes) | Design mode functional |
| BIMBackOffice (ERP reporting) | ~3,000 | 14 tests | Portfolio, 4D-7D, sessions |

**What does not exist yet:**

- No building above 50K elements has been tested (target: 500K)
- No production ERP write-back (iDempiere REST integration is Phase H)
- No role-based access control or multi-tenant deployment
- No real-time interactive editing (batch recompile only)
- No round-trip proof (compile → re-extract → compare)
- No certified COBie or regulatory submission output
- No multi-currency or internationalised cost model
- Incremental compilation is stubbed, not wired
- DX mirror verb is incomplete (7/10 gates)

## 10. Roadmap: From Proof to Platform

**Near-term (in progress):**
- CP-1: TE per-element traceability (closes the 48K-element verification gap)
- CP-2: DX MIRROR verb completion
- G-8: BlenderBridge real-time snap (batch → interactive transition)

**Medium-term (ERP maturity):**
- Phase BO-3..5: Report queue, PDF/CSV export, role-based access
- Phase J: 6 jurisdiction codes, 200+ compliance rules, regulatory templates
- Phase H: iDempiere REST integration — live ERP write-back of C_Order + C_OrderLine

**Longer-term (platform):**
- Phase R: 500K-element stress testing, batch extraction of 50+ IFC models
- Phase RE: Multi-format report engine (JSON/CSV/XLSX/IFC/iDempiere)
- Phase D: Synthetic Rosetta Stone — round-trip compilation proof
- Multi-user WebSocket, distributed sessions, clustered deployment

**The competitive moat is data-driven extensibility.** New IFC types, new validation rules, new jurisdictions, new disciplines, new verb patterns — all added via INSERT, not code. The authority tables (ad_ifc_class_map, AD_Val_Rule, verb formulas) replace hard-coded enumerations with database records. This is the iDempiere philosophy applied to construction: the application dictionary *is* the application.

---

## Appendix: Reference Documentation

| Document | Contents |
|----------|----------|
| `docs/BOMBasedCompilation.md` | Master specification: tack convention, BOM hierarchy, discipline routing |
| `docs/TestArchitecture.md` | G1-G6 gates, tamper seal, traceability matrix, anti-drift policy |
| `docs/BIM_COBOL.md` | Verb grammar, VerbResult contract, compilation targets |
| `docs/DATA_MODEL.md` | Per-building schema, tack columns, world reconstruction formula |
| `docs/SourceCodeGuide.md` | Code navigation, entry points, module structure |
| `docs/BIM_Designer.md` | GUI architecture, compile-driven editing, generative path |
| `docs/ASSEMBLY_BUILDER_SRS.md` | Layer-by-layer TACK, U-value calculation, 17 witnesses |
| `docs/INFRA_DESIGNER_SRS.md` | Terrain snap, alignment model, cut-and-fill, 38 witnesses |
| `docs/MANIFESTO.md` | iDempiere mapping, C_Order model, ERP pattern fidelity |
| `docs/DocAction_SRS.md` | Document lifecycle (DR->IP->CO->AP), discipline routing |
| `docs/DISC_VALIDATION_DB_SRS.md` | Three-database split, alias cascade, IFC version bridging |
| `docs/CALIBRATION_SRS.md` | Rule prediction vs actual placement, ground truth metrics |
| `docs/TerminalAnalysis.md` | 48K-element analysis, verb factorisation, discipline coverage |
| `docs/InfrastructureAnalysis.md` | Bridge/road/rail compilation, domain-agnostic proof |
| `docs/archive/CORE_SRS.md` | (Archived) Scale targets, report engine — superseded by ACTION_ROADMAP + StrategicIndustryPositioning |
| `docs/StrategicIndustryPositioning.md` | IFC scorecard (31/36), competitive analysis, 4 moats |
| `docs/ACTION_ROADMAP.md` | Phase gates G-1 through G-13, critical path items |
| `docs/TIER1_SRS.md` | 4D-7D reporting, audit trail, 3D native |
| `PROGRESS.md` | Current session state, witness counts, pass rates |

---

*This paper describes working software, not a proposal. The source code, test results, and compilation databases are available for inspection. Claims are bounded by the evidence presented — where something is planned but not built, it is labelled as such.*

*Development assisted by Claude Code (Anthropic). Domain architecture by the author.*

---

Copyright 2025-2026 Redhuan D. Oon. All rights reserved. This paper may be freely distributed for academic, research, and conference purposes with attribution. The software described herein is open source under GPL v2.

*Copyright (c) 2025-2026 Redhuan D. Oon. MIT Licensed.*
