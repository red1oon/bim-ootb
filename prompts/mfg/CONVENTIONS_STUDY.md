# ⚠ DO NOT REMOVE — Conventions study: how manufacturing SHOULD be built in this codebase (2026-10-15)

Trigger (user): "Study to find out what should be the way things are done. We follow convention in modelling and our new JS code framework to ensure consistency and maintainability."
Method: read the sources of the conventions (cited below), then check my Milestone 1-10 work against them. Nothing was changed while studying. Every claim has a file:line or a measured value.

## 1. The architecture as it actually is

| Layer | What it is | Where (bim-ootb `erp/` unless noted) |
|---|---|---|
| Dictionary | AD tables ARE the product definition; ONE generic window/grid engine, never per-window code (CLAUDE.md AD-LAYER LAW rules 1-5) | `ad_seed.db`, `ad_parser.js`, `ad_gridtab.js`, `ad_ui.js` |
| Storage in the shipped product | REAL TABLES via CRUD ops (`pp_order` etc.). The 5-table kernel is the BRIDGE/POC path, default OFF: `ad_data.js:8-10` "Default OFF: legacy real-table CRUD (the shipped AD-faithful product)"; `sw.js` "ad_table_map.js dropped from the precache — no page loads it" | `ad_data.js`, `crud_core.js` |
| Model layer | the PO + DocAction + DocumentEngine contract ported as ONE generic layer. A save or a DocAction WRITES through a `Trx`; every write becomes an existing op shape (CRUD_CREATE/UPDATE/DELETE) sealed as one group by `KernelOps.commitGroup`. Classes REGISTER by table name: `registerModel(table,{beforeSave,afterSave,initialDefaults..})`, `registerDocAction(table,{prepareIt,completeIt,voidIt..})`. Pure: no DB binding, no Date.now/Math.random, host injects `query`, `env.now`, `env.uuid()` | `model_layer.js:1-26,276,346,419-460`; spec `prompts/ERP_MODEL_LAYER.md`; classes `model_trade/order/invoice/cost/match/rma.js` |
| Processes / callouts | each AD_Process class = a VERBATIM port of the Java SvrProcess registered with `defineProcess('<FQCN>',...)`, comments cite the Java file:line | `processes/*.js` (e.g. `BOMVerify.js:1-6`, `ProductionCreate.js`), `callouts/*.js`, `ad_process.js:1043,1220` |
| Posting | `doc_poster.js` = the Doc_* classes; a table without a Doc class REFUSES completion exactly like legacy (`immediatePostingRefusal`, `LEGACY_DOC_CLASSES`, `doc_poster.js:193-202`) | `doc_poster.js` |
| Non-core domains | "Everything else (manufacturing, HR, assets...) is NOT core - it arrives like any other extra module through Ninja/plugins" with "zero host code" (CLAUDE.md AD-LAYER LAW rule 6; `ERP_MODEL_LAYER.md` scope) | `plugins/README.md`, `plugin_registry.js:124-141`, `plugin_overlay.js:70-77`, `ninja_*.js` |
| Plugin bundle contract | an ES module: `manifest`, `activate(ctx)`, `deactivate(ctx)`; ctx = `modelval`, `callout`, `process`, `postTokens`, `docAction` (= ModelLayer: registerDocAction + registerModel), `db.query` (read-only), `ops.append`. Install-only, never auto-start, an admin enables it. A-4 seam: a validator GATES, never derives postings | `plugins/README.md`, `plugins/production_validator.mjs`, `plugins/wip_token.mjs` |
| Dictionary staging by a module | Ninja `stageModels(ctx.db, model)` is idempotent and `rollbackModel` sets IsActive='N' on deactivate | `ninja_bundle.js:9-57` |
| DB changes | a small SQL patch + a self-heal loader, never a binary (CLAUDE.md "DB CHANGES = MIGRATION SCRIPT + SELF-HEAL LOADER") | `patches/*.sql`, `idempiere.html` FS-15 loader |
| Distribution / audit | signed op-log chain, content signing, HQ roster, owner-gate replay | `kernel_ops.js`, `erp_key_epochs.js`, `erp_replay.js`, `DistributedERP.md` |

## 2. How a new model is PROVEN (the parity method)
- The CARDINAL / TWIN rule (CLAUDE.md, `prompts/SQLiteIDEMPIERE.md` top): SQLite must be indistinguishable from legacy, including L&F. A difference found by the parallel run is fixed on the SQLite side. A `LEGACY-QUIRK` exemption exists only in the user's own words. Never ask the user to approve a divergence; questions are only for undecidable facts.
- The oracle is the LIVE legacy pilot driven through iDempiere's stock WebServices (`scripts/bridge/`, `scripts/bridge/run_all.sh`, descriptors per model; same facts -> SQLite and legacy -> compare incl. books). Restart: `docker start postgres` + `~/idempiere-pilot/start.sh` (http://localhost:8088/webui/). Another session owns it.
- Where Java source exists the port is VERBATIM with file:line cites; ad-hoc rules are defects ("INVENTED hooks" were removed in F13).
- Witness style: header with `# ⚠ DO NOT REMOVE`, the ISSUE it proves, `§` log lines, per-case verdict PASS / FAIL / INCONCLUSIVE (never PASS when nothing was judged), a negative control that must turn red. My M1-M10 witnesses already follow this part.

## 3. Code-style conventions observed
UMD factory header `(function (root, factory) {...})` that `require`s siblings in node and reads `root.X` in the browser; `'use strict'`; ES5 `var`; lower-case row keys; exact decimals only through `BigDecimal` (`D()`/`N()`); no clock or randomness (env inputs); class names mirror Java (`MRMA` -> `model_rma.js`, process FQCN as the key); registration by table name, never `if (table==='c_order')`; comments cite Java file:line; `§TAG` console lines; generic-layer PRs state lines +/- and delete what they supersede; one implementation per responsibility; specs/findings go in a canonical `prompts/*.md` (not scattered).

## 4. What is actually available locally for manufacturing (measured, corrects my earlier notes)
- Core `org.adempiere.base/src/org/eevolution/` has 115 Java files: the generated `X_/I_` data beans for PP_*/DD_*/HR_*/MP_* AND a few real classes: `MPPProductBOM` (`get(product,org,valid)` :195-232, `getLines(valid)` :296-330, `isValidFromTo` :362-371), `MPPProductBOMLine` (`isValidFromTo` :304-313), `MPPProductPlanning`, `CalloutBOM`, a few processes.
  NOT present: MPPOrder, MPPOrderBOM*, MPPMRP, MPPCostCollector, Doc_PPCostCollector (the Libero manufacturing plugin proper).
- The live legacy server (CLIENT_ACCOUNTING=I) REFUSES completion of PP_Order / PP_Cost_Collector / DD_Order / HR_Process with "Doc Class invalid: Doc_<Table>" (`SQLiteIDEMPIERE.md` §72.1; `DefaultDocumentFactory.java:87-107`). Shipped `doc_poster.js` implements that refusal, but only when the client's CLIENT_ACCOUNTING is 'I'
  (measured: the seed's default is 'Q', where `immediatePostingRefusal` returns null for every table).

## 5. Gap analysis of my Milestone 1-10 work against these conventions
| M | What I built | Convention fit | Verdict |
|---|---|---|---|
| 1 | physical tables + columns via `patches/mfg.sql`; menu rows with IsActive forced 'Y'; loader loop | tables/columns: legal (legacy has them physically; patch+loader is the rule). **Menu activation in the BASE seed is an L&F divergence**: legacy ships the Manufacturing Order menu inactive (EE01). Twin rule + rule 6 say a module's windows are staged by the module on enable and rolled back on disable | split: keep tables/columns; move menu/window activation into the plugin's activate/deactivate (Ninja-style stage + rollback) |
| 2 | witness only over `ad_table_map.js` | the map is the bridge (default OFF); low product relevance, harmless | keep, low priority |
| 3 | `mfg_snapshot.js`: pure handler on the 5-table ERPKernel (CREATE_DOCUMENT/CREATE_LINE) | the shipped product writes REAL tables through ModelLayer/Trx. Not wired to anything. The LOGIC (field mapping, QtyRequired formula, legacy oracle of 102 fields) is valuable and legacy-checked | re-home: a `pp_order` model class (`registerModel`, afterSave explosion = MPPOrder.explotion) inside a Libero plugin bundle, writing `pp_order_bom/bomline` through `trx.insert` |
| 4 | `isEffective` with DAY granularity, header-not-effective = exception | **WRONG vs Java**: `isValidFromTo` is an exact Timestamp compare (`date.before(validFrom)` / `date.after(validTo)`), and an ineffective header yields a null BOM (`MPPProductBOM.get(...,valid)` :228-232), not an error. BOM selection `get(product,org)` (planning BOM, else default) IS available locally and I called it "not done" | fix now: port `isValidFromTo`, `getLines(valid)`, `get()` verbatim with cites; re-prove (A3 boundary cases with time-of-day) |
| 5 | `mfg_mrp.js`: PP_MRP as a pure fold on the projection | legacy writes pp_mrp rows imperatively from the model (MPPMRP, absent locally); my rows equal legacy on 84 fields, the determinism property is real, but the mechanism and host differ | re-home as model hooks writing `pp_mrp` via Trx; keep the determinism + oracle checks |
| 6 | blocked, question asked | **the question was wrong-framed**: the twin-correct behaviour on legacy is REFUSAL ("Doc Class invalid") under CLIENT_ACCOUNTING=I; posting rules would be a plugin-only capability with no oracle | reframe: witness the refusal parity (both modes I/Q); posting stays plugin + UNVERIFIED |
| 7 | HANDOFF + owner-gated SET_STATUS in `erp_replay.js` | distribution doctrine (DistributedERP G-*), generic, one gate; fits | keep |
| 8 | LEASE/USE/EXPIRE in `erp_replay.js` | same; additive; legacy allows overlap so it must stay opt-in | keep; make sure no CRUD path is touched |
| 10 | kernel branch fix + `mfg_whatif.js` | the kernel fix is a real core defect (witnessed); the driver is generic scenario machinery coupled to my MRP fold | keep the fix; decouple the driver from mfg_mrp when MRP is re-homed |
| all | specs/results in `~/Projects/Mfg/*.md` | repo convention: canonical `prompts/*.md` per lane (user chose Projects/Mfg for the doc) | add one `prompts/MANUFACTURING_PLUGIN.md` pointer when merging |
| all | new files `erp/mfg_*.js` at the erp root, plain IIFE | convention: UMD factory + registration by table name, domain code in a plugin bundle (`plugins/*.mjs`) not in the host root | follow when re-homing |

## 6. Re-plan (in this order; nothing here is started)
1. **Fix M4** now (small, evidence is local): verbatim `isValidFromTo` + `getLines(valid)` + `get(product,org,valid)`; re-run W-MFG-ASOF with time-of-day boundary cases and a null-BOM case.
2. **Reframe M6** as a parity witness: PP_Cost_Collector / PP_Order completion refuses "Doc Class invalid" under CLIENT_ACCOUNTING='I' and completes (unposted) under 'Q', matching §72.1; ask the parity session whether the pilot can confirm 'Q' behaviour. Posting rules: plugin-only, unverified, not asserted.
3. **Libero plugin bundle** `plugins/libero_manufacturing.mjs` (manifest/activate/deactivate): activate = stage the Manufacturing Order window/menu (IsActive Y, rollback on deactivate), `docAction.registerModel('pp_order', {afterSave: explosion})`, later MRP hooks; zero host code. M3/M4/M5 logic and legacy oracles move in; witnesses assert through the REAL ModelLayer path + the real-table result, and replay determinism through `env.now/env.uuid`.
4. **M1 menu**: remove the unconditional menu/active rows from `mfg.sql`; keep tables/columns.
5. Then the cheap features (pegging, MPS) as plugin code, each after its legacy-evidence check.

## 7. Questions that remain genuinely the user's
- Is the plugin-bundle home (`plugins/libero_manufacturing.mjs`, install-only, admin enables) the intended one for the manufacturing model, with the base product unchanged when it is off?
- May I ask the parity session (it owns postgres + the pilot) to confirm CLIENT_ACCOUNTING='Q' behaviour for a PP_Cost_Collector completion, or run one scenario for me? I will not touch the pilot or the postgres container myself.

## 8. Libero as an OSGi-style bundle (user, 2026-10-15: "treated as how legacy does to plugins, installed, activated or stopped")
Legacy (local source): behaviour is contributed by OSGi SERVICES (IModelFactory, IProcessFactory, IDocFactory, ICalloutFactory, model validators; looked up through `Core.java` / the service locator). A stopped or absent bundle registers nothing, so the default
factories answer: `DefaultDocumentFactory.java:103-104` throws "Doc Class invalid". The dictionary rows persist regardless (that is the state of the legacy pilot: Libero AD rows present, Libero classes absent).
Ours: `plugin_registry.js` = INSTALLED -> RESOLVED -> ACTIVE -> STOPPED -> UNINSTALLED with signed PLUGIN_* ops, semver `requires`, engineVersion gate; `plugin_overlay.js _hydrate` re-installs persisted bundles and restarts the ACTIVE ones on load;
the AD-native door is an `ad_modelvalidator` row (install only, admin enables). Split for Libero: dictionary + physical tables in the BASE (already `mfg.sql`); behaviour in the BUNDLE while ACTIVE; stopped = behaviour gone, data stays, completion refuses like legacy.
Framework gaps found (measured): (1) no unregister for registerModel / registerDocAction / registerHandler (production_validator.mjs hand-filters), so STOP cannot restore the baseline cleanly; (2) posting classes are the static `LEGACY_DOC_CLASSES` array in doc_poster.js,
no IDocFactory equivalent; (3) `ctx.db` is read-only, dictionary staging with rollback follows the Ninja writable-db pattern (`ninja_bundle.js`). Planned lifecycle witness: baseline hash -> install (unchanged) -> start (behaviour present) -> stop (hash == baseline, data kept, completion refused) -> restart idempotent -> reload rehydrates.

## 9. PP_Cost_Collector wiring - what the DICTIONARY says (extracted from ad_seed.db, 2026-10-15)
- Types (AD_Ref_List of CostCollectorType): 100 Material Receipt, 110 Component Issue, 120 Usage Variance, 130 Method Change Variance, 140 Rate Variance, 150 Mix Variance, 160 Activity Control. DocBaseType MCC "Manufacturing Cost Collector" (own doc type).
- UPSTREAM (its foreign keys): PP_Order_ID (the manufacturing order); PP_Order_BOMLine_ID (the component, for 110); PP_Order_Node_ID + PP_Order_Workflow_ID + S_Resource_ID with SetupTimeReal / DurationReal / IsBatchTime / IsSubcontracting (the operation, for 160);
  M_Product_ID, M_Warehouse_ID, M_Locator_ID, M_AttributeSetInstance_ID, C_UOM_ID, MovementQty, ScrappedQty, QtyReject (the stock side); C_DocType_ID / C_DocTypeTarget_ID, Reversal_ID, DocStatus/DocAction/Processed/Posted (it is a DOCUMENT with a lifecycle and posting).
- DOWNSTREAM (tables that carry PP_Cost_Collector_ID): M_Transaction (stock movement), M_CostDetail (cost layer), PP_Cost_CollectorMA (lot / ASI allocation: the genealogy source for W-MFG-TRACE), HR_Movement (labour/payroll cost of an activity), C_OrderLine (subcontract purchase link), plus RV_ views.
- NOT in the dictionary: the debit/credit pairs (Doc_CostCollector is Libero code, not local). Account ROLES exist physically (p_wip, p_labor, p_burden, p_overhead, p_costofproduction, usage/rate/mix/methodchange variance, p_floorstock, p_scrap...).

## 10. Libero source located (2026-10-15) - answers the M6 question; CANDIDATE oracle until the author confirms the lineage
- NOT on this machine: no org.eevolution Java (only the generated beans + MPPProductBOM/Line/Planning in core), no Libero jar in ~/idempiere-laos/server/plugins, no git remote to Bitbucket. Historic migration SQL under idempiere/migration-historic/ carries Libero DICTIONARY history
  (e.g. 352a-353a/*_RF2408898_CostCollectorType.sql, 340s-351a/052_liberovalidator.sql, 360lts-i1.0a/882_IDEMPIERE-246_Manufacturing_Light_Menu_deact_Libero.sql).
- PUBLIC copies (GitHub, read-only): github.com/pshepetko/org.idempiere.mfg ("Libero Manufacturing Plugin for iDempiere", pushed 2026-05-18), github.com/logilite/org.idempiere.mfg2, github.com/adempiere/adempiere (org.eevolution.manufacturing), github.com/adempiere/extension_libero_manufacturing.
  Downloaded for reading only to the scratchpad (libero_src/, never executed): idempiere_mfg/Doc_PPCostCollector.java (376 lines, GPLv2, (c) e-Evolution / Victor Perez; our files are MIT: licence handling of verbatim ports is an existing project practice, flagged not decided here).
- Doc_PPCostCollector.createFacts (:114-155) - posting is DRIVEN BY the M_CostDetail rows of the collector (`getCostDetails()` WHERE PP_Cost_Collector_ID, :365-375), one fact pair per COST ELEMENT (Material, Resource/Labor, Burden, Overhead, Outside Processing), skipped when the amount is 0 (`createLines` :157-186):
  | type | debit | credit | amount |
  |---|---|---|---|
  | 100 Material Receipt (:209-235) | P_Asset (MovementQty != 0) | P_WorkInProcess | cd.Amt, rounded to the schema StdPrecision HALF_UP |
  |   ... scrapped qty != 0 | P_Scrap | P_WorkInProcess | cd.Price x ScrappedQty |
  | 110 Component Issue (:268-286) | P_WorkInProcess | P_Asset, or P_FloorStock when the collector isFloorStock | -cd.Amt |
  | 160 Activity Control (:304-323) | P_WorkInProcess | the cost ELEMENT's absorption account (`getAccount(as, element)`: labor / burden absorbed) | cd.Amt, zero skipped |
  | 120 Usage / 130 Method Change / 140 Rate / 150 Mix Variance (:327-342) | the matching P_*Variance account | P_WorkInProcess | -cd.Amt, qty -cd.Qty |
  Notes: a duplicated UsageVariance branch (:131-138) is dead code; the M_CostDetail rows are created upstream when the collector completes (MPPCostCollector / cost engine, NOT yet read) - the Doc class only turns them into facts.
- Consequence for M6/M9: the posting rules are now extractable (this file), but the COST side (which M_CostDetail rows a completion creates, standard-cost per element, the Receipt/Issue/Activity quantity rules) lives in MPPCostCollector and the cost engine; read those from the same repo before building.

## 11. Cost Collector completion wiring - READ FROM SOURCE (pshepetko/org.idempiere.mfg, `MPPCostCollector.completeIt` :404-570, `CostEngine` 656 lines; author-confirmed lineage, CC "untouched across variants")
UPSTREAM it is created for a PP_Order (`createCollector(order,...)` :99) from: a BOM line (issue), a workflow node (activity), or the order itself (receipt); `beforeSave`/`prepareIt` validate it (:300-387, :716).
completeIt (all inside one Trx, fires BEFORE/AFTER_COMPLETE doc validators):
- Issue or Receipt (not variance): if the product is stocked -> `StorageEngine.createTransaction(...)` (M_Transaction + storage, with the order's reservation ASI/warehouse).
  Issue -> PP_Order_BOMLine QtyDelivered += MovementQty, QtyScrap += ScrappedQty, QtyReject += QtyReject, DateDelivered = MovementDate.
  Receipt -> PP_Order QtyDelivered/QtyScrap/QtyReject += ..., DateDelivered, DateStart (if empty), DateFinish when QtyOpen <= 0.
- Activity Control -> refuse if the node is already processed; subcontracting: complete only when the linked purchase order lines are fully delivered (else stays InProgress with a message), then closes the activity;
  otherwise `CostEngine.createActivityControl(cc)` (cost details per resource cost element), and the node is closed when QtyDelivered >= QtyRequired.
- Usage Variance (material, BOM line set) -> BOM line quantities updated + `createUsageVariances`; (resource, node set) -> node DurationReal/SetupTimeReal += ..., `createUsageVariances`.
- ALWAYS at the end: `createRateVariances(cc)` and `createMethodVariances(cc)`; then Processed=Y, DocStatus=CO, DocAction=CL.
DOWNSTREAM: `CostEngine` creates the M_CostDetail rows per cost element (`createCostDetail(model, trx)` for stock transactions, `createActivityControl`, `createUsage/Rate/MethodVariances`, which spawn variance cost collectors via `createVarianceCostCollector`);
`Doc_PPCostCollector` (CONVENTIONS_STUDY §10) turns those cost-detail rows into facts. So the chain is: order + BOM line/node -> cost collector (doc) -> completeIt -> stock transaction + order/line/node quantity updates + cost details (+ variance collectors) -> posting.
