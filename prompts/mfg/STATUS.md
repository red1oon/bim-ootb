# Manufacturing model — status index (2026-10-15, end of session 1). Entry point: RESUME.md

Source doc: `Manufacturing Model Milestones and Contracts.md`. Code: bim-ootb branch `feat/mfg-wire` (worktree `/tmp/wt-mfg`), **pushed, no PR opened, sw.js CACHE_VERSION not bumped (no deploy)**.
Each milestone has its own spec + result section (`MILESTONE_n_SPEC.md`); evidence logs in `logs/`. Every witness has deliberate breaks that must be red; most also have a baseline-red or mutation proof.

| # | Witness | State | Evidence in one line |
|---|---------|-------|----------------------|
| 1 | W-MFG-WIRE | DONE (menu part to move into the bundle) | window 53009 opens from the menu with 13 tabs; 8 PP tables + 46 columns + menu path from `erp/patches/mfg.sql`; real loader applied it. The unconditional MENU activation diverges from legacy (EE01 ships inactive): move to the bundle's `ctx.dict` stage |
| 2 | W-MFG-SLOT | DONE | 25/25 layers-table tables + 7 Maintenance tables in the right slot; doc row for Maintenance is loose |
| 3 | W-MFG-SNAP | DONE (logic to re-home) | BOM explosion == legacy rows (102 fields, 0 diff); template edits never reach the order; replay == live. Legacy snapshots at CREATION, not release |
| 4 | W-MFG-ASOF | DONE, CORRECTED 2026-10-15 | verbatim `MPPProductBOM/Line` ports: exact timestamps (`before/after`), active lines, null BOM when the header is not valid, `getDefault`/`get(valid)`; breaks incl. the old day-granularity bug |
| 5 | W-MFG-MRP | DONE (logic to re-home) | PP_MRP rows as a pure fold; 6 legacy rows, 84 fields, 0 diff; 2 runs + replay identical. Netting / planned orders NOT built |
| 6 | W-MFG-POST | NOT DONE, REFRAMED | legacy refuses PP_Cost_Collector/PP_Order completion ("Doc Class invalid") under CLIENT_ACCOUNTING=I; posting rules now KNOWN from source (CONVENTIONS_STUDY §10). Build via the bundle's `ctx.docClass` |
| 7 | W-MFG-OWN | DONE | ordered HANDOFF + owner-gated SET_STATUS in the one replay gate; tamper (even re-sealed) caught by content signature |
| 8 | W-MFG-LEASE | DONE | real double-booking of resource 50000 by orders 8000/8001 refused; ordered expiry; legacy allows overlap so leases are additive |
| 9 | W-MFG-TRACE | NOT STARTED | needs the cost collector (PP_Cost_CollectorMA) |
| 10 | W-MFG-WHATIF | DONE | what-if = discarded BLUE FUTURE branch; found + fixed `ERPKernel.replay` leaking branch ops and `apply` ignoring a branch |
| L1 | W-LIBERO-BUNDLE (slices 1+2) | DONE | `erp/plugins/libero_manufacturing.mjs` + `libero_pporder.mjs`: lazy bundle, PP_Order + BOM explosion + ROUTING snapshot + MRP + delete semantics through Trx; 31 witness checks + 7 breaks red + real-browser lifecycle. Source-vs-seed deltas declared (spec top). Open: `§LIBERO-DOUBLE-EXPLODE`, host refusal-on-AFTER_SAVE does not roll back |
| H1 | W-PLUGIN-LIFECYCLE | DONE | plugin STOP restores the registries exactly (hash), stacking in any order, atomic start, hot chunks, restore, boot hydration (was only on pill open) |
| H2 | lazy activation + OSGi console | DONE | STARTING state, `need()` at `applyOp`, signed PLUGIN_ACTIVATE (18 lifecycle checks, real-browser lazy test incl. a "too-late seam" proof); Felix-style Bundles console in Plugins & Releases (8 node + 9 browser checks) |

## Shared-code changes (all additive, regression-checked)
`erp/layered_registry.js` (new), `model_layer.js`, `ad_modelval.js`, `ad_process.js`, `ad_callout.js`, `doc_poster.js`, `plugin_registry.js`, `plugin_overlay.js`, `plugin_release.js`, `crud_overlay.js` (demand seam), `osgi_console.js` (new), `idempiere.html`, `sw.js` (precache), `erp_kernel.js` (branch apply, official-only replay), `erp_replay.js` (HANDOFF, SET_STATUS, LEASE/USE/EXPIRE), `tests/witness_erp_i18n.js`, `tests/witness_master_save_rules.js` (helper list).
New: `erp/mfg_snapshot.js`, `erp/mfg_mrp.js`, `erp/mfg_whatif.js` (to be re-homed into the bundle), `erp/patches/mfg.sql` + `build_mfg_patch.py`, `erp/tests/witness_*.js`, `erp/tests/poc_plugin_*_live.js`, `poc_osgi_console_live.js`, `tests/fixtures/lazy_probe.mjs`.

## Decisions made by the user (do not re-ask)
Mfg/HR are plugins (OSGi semantics) · lazy activation is the admin's choice · legacy-looking OSGi console · hot hooks live for everyone while ACTIVE · host changes approved (unregister, doc-class point, staging) · read MPPCostCollector/CostEngine/MCostDetail: yes · no pilot install, Mfg/HR outside parity scope · Shepetko lineage valid, Cost Collector untouched.

## Waiting on the user
1. Edit the parent doc (snapshot at creation, Maintenance slot row)? 2. Open the PR for `feat/mfg-wire` and bump the service-worker version at deploy? 3. Whether callouts/window triggers should be wired to the grid before Libero goes lazy (until then: eager for bundles with callouts).

## Known unrelated failures (identical on origin/main)
`poc_ad_folded_crud_live.js` (7/14), `tests/test_ad_parser.js`, `test_ad_ui.js`, `test_idempiere_fold.js`, `test_idempiere_login.js`, `poc_accts_posted.js`, `poc_erp_picker.js`, `gen_ad_odoo.js`.
