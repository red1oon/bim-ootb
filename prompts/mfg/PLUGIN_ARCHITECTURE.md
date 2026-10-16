# ⚠ DO NOT REMOVE — Manufacturing (Libero) as a PLUGIN: architecture + loading management (2026-10-15)

Directive (user): treat Mfg as a plugin like legacy OSGi (installed / activated / stopped), "albeit a huge one, similar to how HR shall be too, for loading mgmt". Lineage confirmed by the author: Peter Shepetko's iDempiere port (`github.com/pshepetko/org.idempiere.mfg`) is a valid lineage; the Cost Collector is stable and untouched across variants.
Evidence below is from a read-only shallow clone in the scratchpad (`libero_src/repo`, never built or run) unless marked otherwise. Study background: `CONVENTIONS_STUDY.md` §1-10.

## 1. What Libero really is (measured)
160 Java files, 57,866 lines. Bundle `org.idempiere.mfg` v14, `Require-Bundle` core bundles (+ ZK UI libs).
| Part | Files / lines | Port stance |
|---|---|---|
| `org.libero.tables` generated X_/I_ beans | 45 / 23,346 | NOT ported: the dictionary (AD + physical tables, already in the base seed) replaces them |
| `org.libero.model` (+wrapper, impl, reasoner) | 23+3+1+2 / ~11,700: MPPOrder 1,816 · MPPMRP 1,632 · MCostDetail 1,447 · MPPCostCollector 1,041 · MPPOrderWorkflow 674 · MPPOrderBOMLine 588 · MPPOrderNode 547 | ported as model classes (`registerModel` / `registerDocAction`), verbatim with file:line |
| `org.adempiere.model.engines` | 6 / 1,368: CostEngine 656 · StorageEngine 329 · CostDimension 275 | ported (costing is what M6/M9 depend on) |
| processes (27 in plugin.xml) | 21 / 7,589: MRP 1,517 · MovementGenerate 792 · CRPSummary 599 · CRP 539 · ImportProductPlanning 470 · DistributionRunOrders 451 | ported on demand through `defineProcess('<FQCN>')` (existing convention) |
| accounting | `Doc_PPCostCollector` 376 + `DocLine_CostCollector` 109 | the posting table already recorded (CONVENTIONS_STUDY §10) |
| callouts | 10 / 896 (CalloutOrder, CalloutBOM, CalloutCostCollector, CalloutDistributionOrder) | ported through the existing callout engine |
| validator `MFG_Validator` | 450 | model-event hooks, see §3 |
| UI forms (7 in plugin.xml: BOM drop, CRP, order receipt & issue, tree...) + infowindows | 12+3+1 / ~7,300 | NOT ported as code: our UI is dictionary-generated; custom forms are a separate, later decision |
Realistic port surface ~ 23k lines of which the first vertical slice (order + BOM explosion, cost collector + cost engine + cost detail, Doc, MRP model) is ~ 8k.

## 2. The OSGi contract it fulfils (and our mapping)
`MANIFEST.MF` `Service-Component:` = three DS components: `MFGModelFactory` (IModelFactory, ranking 1), `MFGDocFactory` (IDocFactory), `MFGValidator`; `plugin.xml` extensions: 27 `org.adempiere.base.Process`, 7 `org.adempiere.webui.Form`, 1 `IColumnCallout`.
| Legacy | Ours (today) | Gap |
|---|---|---|
| IModelFactory (24 tables -> model classes) | `ctx.docAction.registerModel(table, impl)` / `registerDocAction` | `registerModel` MERGES (`Object.assign`, model_layer.js:276): a plugin override of a core table silently overwrites same-named hooks; no ranking / stack, no unregister |
| IDocFactory (PP_Order, DD_Order, PP_Cost_Collector -> Doc classes) | static `LEGACY_DOC_CLASSES` in doc_poster.js | needs a doc-class registration point |
| ModelValidator events | `ctx.modelval.registerValidator(table, timing, name, fn)` | no unregister (example plugin hand-filters) |
| Process extension | `ctx.process.registerHandler` / `defineProcess` | no unregister |
| Callout | `ctx.callout.registerHandler` | no unregister |
| Bundle lifecycle (install/resolve/start/stop/uninstall) | `plugin_registry.js` same 5 states + signed PLUGIN_* ops + `_hydrate` on reload | fine; engineVersion + `requires` present |
| 2Pack dictionary | base seed + `patches/*.sql` (tables/columns, done) ; window/menu activation = stage with rollback (Ninja pattern) | `ctx.db` is read-only |

## 3. FINDING that drives loading management: Libero hooks CORE tables
`MFG_Validator` registers AFTER_NEW / AFTER_CHANGE / BEFORE_NEW on **C_Order, C_OrderLine, M_Requisition(+Line), M_Forecast(+Line), M_Movement, M_Product, DD_Order(+Line), PP_Order, PP_Order_BOMLine** and the model factory overrides core `C_Order` and `M_MovementLine` (`MOrder`, `LiberoMovementLine`). MPPMRP (1,632 lines) writes PP_MRP demand/supply rows from those events.
So while ACTIVE, an ordinary sales-order save creates MRP rows (imperatively, at save time: the mechanism my M5 fold mirrors for PP_Order only). Consequences:
1. ACTIVE must mean the hooks are LIVE before any covered save, otherwise a C_Order saved before the code arrives silently misses its MRP demand (an inconsistency legacy cannot have).
2. `ModelLayer` save/DocAction is SYNCHRONOUS and pure (Trx, no clock/random). A hook cannot `await import()` mid-save. Therefore hook code cannot be lazy-loaded at first save.
3. Stopping must remove those hooks AND restore the core `c_order` behaviour exactly (needs stacked registration, §2).

## 4. Loading management design (proposal, to be witnessed)
Bundle manifest gains an explicit split (backwards compatible; plain bundles unchanged):
- `chunks.hot` - modules that register SYNC hooks (model classes for hooked tables, validators, doc class, callouts). Loaded and registered BEFORE the registry reports ACTIVE (start fails atomically if one fails; stop unregisters all).
- `chunks.lazy` - on demand only: processes (MRP run, CRP, rollups, imports), reports, forms, window-level extras. A stub is registered at start (name + metadata only); first invocation `import()`s the chunk (processes already run through an async path - to verify) and caches it.
- `budget` - declared size (KB gz) and expected heap, shown in the Plugins pill and checked against the PERF BUDGET (CLAUDE.md: memory, not draw speed, is the limit; data heap dwarfs code, so the budget is mostly about not fetching 8k+ lines users never need).
- HR is the same shape with its own hooks (payroll process events); several big bundles can be ACTIVE together; `requires` orders them.
- Boot: `_hydrate` re-starts persisted ACTIVE bundles; with hot/lazy split only the hot chunks cost start-up time. Measured targets and a hot-chunk size limit become witness assertions (cold-load regression guard like the existing ERP load measurement).
Open design question: should hot hooks for tables of windows the user never opens still load at session start? (Yes by §3.1, unless activation is scoped per session/role; that is a product decision.)

## 5. Lifecycle witness (the equivalent of M10 for plugins) - to build
baseline hash of everything the bundle can touch (MODEL, DOCS, validators, processes, callouts, doc classes, AD active flags, `c_order` behaviour) -> install: unchanged -> start: hooks live, a C_Order save creates an MRP demand row, a PP_Order save explodes the BOM -> stop: hash == baseline, data kept, completion refuses "Doc Class invalid" (CLIENT_ACCOUNTING=I) -> restart idempotent -> reload rehydrates ACTIVE -> uninstall.
Parity: the SAME scenario against the live pilot WITH the real bundle installed (needs the user's explicit GO and the parity session), else against the public source read as oracle.

## 6. Host work needed (generic, small; benefits HR and every future bundle)
(a) unregister for registerModel/registerDocAction/registerValidator/registerHandler (callout, process) with STACKING so a later registration layers over an earlier one and stop restores it; (b) a doc-class registration point in doc_poster; (c) writable, rollback-able dictionary staging for activate/deactivate (Ninja pattern) - flips the Manufacturing windows/menus, removes the unconditional menu rows from `mfg.sql`; (d) manifest `chunks`/`budget` + atomic hot start in plugin_registry; (e) the lifecycle witness above.

## 7. Where my M1-M10 work lands
M1 tables/columns stay in the base; menu activation moves to (c). M3/M4/M5 logic and legacy oracles move into the bundle's model classes (MPPOrder explosion, MPPProductBOM selection, MPPMRP). M6 becomes: refusal parity when stopped + Doc_PPCostCollector table when ACTIVE (needs MPPCostCollector + CostEngine + MCostDetail read first). M7/M8/M10 are core distribution/kernel work and stay. M9 follows M6 (PP_Cost_CollectorMA).


## 8. UPDATE 2026-10-15 - what is built (H1/H2) and a correction to section 4
- Section 4 said hot hooks "cannot be lazy-loaded" and lazy chunks were deferred. Corrected by the user's OSGi point and by measurement: legacy has START (admin) and ACTIVATE (first demand, `Bundle-ActivationPolicy: lazy`, delayed DS components). Ours now has the same two steps: `activation:'lazy'` + `triggers`, state STARTING, demand at the async commit funnel `crud_overlay.applyOp` BEFORE the synchronous model layer runs (see HOST_PLUGIN_LIFECYCLE_SPEC.md §H2).
  Residual: a cascade inside one run that reaches a still-STARTING bundle's table is reported (`§PLUGIN-LAZY-MISSED`), never silent; callouts/window triggers are not wired yet (eager until then).
- Built: layered registries with owner/rank (OSGi service.ranking), automatic undo on stop, atomic start, hot chunks, boot-time restore, dictionary staging with refcounts, doc-class registration, lazy activation, the Felix-style console. Remaining host item: callout/window/process triggers + pill budget.
- Next: the Libero bundle itself (RESUME.md section 5).
