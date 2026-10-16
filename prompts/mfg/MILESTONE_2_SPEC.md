# ⚠ DO NOT REMOVE — Milestone 2: W-MFG-SLOT (scope: pin every manufacturing table to its 5-table slot; read the log after every run)

Parent: `Manufacturing Model Milestones and Contracts.md` §Model layers + §Witnessed milestones row W-MFG-SLOT. Worktree `/tmp/wt-mfg`, branch `feat/mfg-wire`.

## Issue it proves or disproves
Whether each table of the layers table lands in the slot the doc says, by the rule that actually decides it (`erp/ad_table_map.js`: OVERRIDES, else the
PV heuristic fed with dictionary facts), and whether that result survives losing the thing it depends on.

## Facts measured 2026-10-14 (scratchpad m2_measure.js, facts built exactly as scripts/test_bridge.js does: isDoc = table has a DocStatus column; contain = window tab nesting)
- 25 of 25 tables in the layers table already resolve to the documented slot (0 DIFF).
- 4 resolve to `documents` ONLY through the dictionary fact (no override): PP_MRP, PP_Order, PP_Order_Node, PP_Cost_Collector. Without facts they flip to `items`.
- 9 resolve ONLY through an explicit override: PP_Order_BOM, PP_Order_BOMLine, PP_Order_Workflow, PP_Cost_CollectorMA, PP_Order_NodeNext,
  PP_Order_Node_Asset, PP_Order_Node_Product, PP_Order_Cost (+ the HR/MP siblings). Without the override they flip to `items`.
- DOC CORRECTION: the layers-table row "Maintenance | MP_Maintain*, MP_OT* | document_lines" is loose. Measured: MP_Maintain, MP_OT, MP_OT_Request =
  `documents`; MP_Maintain_Task/_Resource, MP_OT_Task/_Resource = `document_lines`; MP_JobStandar*, MP_Meter, MP_AssetMeter*, MP_Prognosis = `items`.
- `ad_table_map.js` is NOT loaded by any page today (sw.js E-14); ad_data's bridge defaults OFF. Slots bind only when the 5-table bridge is on, so this
  milestone pins the map, it does not change what a user sees.

## Design
No code change to `ad_table_map.js` (deletion-budget rule: nothing to supersede; the existing mechanism is already generic). Witness only.

## Witness `erp/tests/witness_mfg_slot.js` (tag `§MFG-SLOT`)
- S1 each of the 25 layers-table tables resolves to its slot (facts from the dictionary, no physical table needed). Names every DIFF.
- S2 population from the dictionary (AD-LAYER LAW denominator): every AD table named PP_*, MP_*, S_Resource*, M_Forecast* gets a slot; the unlisted ones are printed
  (`§MFG-SLOT-UNLISTED`) and counted, never silently skipped. INCONCLUSIVE if the population is 0.
- S3 the 6 measured MP rows above.
- S4 dependency pinning: the 4 fact-dependent tables flip to `items` with empty facts, the override-dependent ones flip to `items` without the override (proves
  S1 is not vacuous: each pinned slot is one the rule really produces).
- Deliberate breaks (must be red, naming the table): `MFG_BREAK=override` (delete OVERRIDES.PP_Order_BOM), `MFG_BREAK=facts` (empty isDoc).

## RESULT 2026-10-14 (logs: ~/Projects/Mfg/logs/w_mfg_slot_{green,override,facts}.log)
- Green: S1 25/25, S2 population 55 dictionary tables (items 26, documents 12, document_lines 11, compiler 6; 26 unlisted, printed), S3 7/7, S4 PASS. exit 0.
- `MFG_BREAK=override` (drop OVERRIDES.PP_Order_BOM) -> S1 FAIL "PP_Order_BOM: want document_lines got items". exit 1.
- `MFG_BREAK=facts` (empty DocStatus facts) -> S1 FAIL on PP_MRP, PP_Order, PP_Order_Node, PP_Cost_Collector; S3 FAIL on MP_Maintain, MP_OT, MP_OT_Request. exit 1.
- No change to ad_table_map.js was needed.
- FINDING (not changed, out of scope, bridge-only): the print views PP_Order_Header_v, PP_Order_Node_v, PP_Order_BOM_Header_v, PP_Order_Workflow_Header_v resolve to
  `documents` because they carry a DocStatus column; views are not business tables. Same would hold for other *_v views fleet-wide. Decide only if the bridge is switched on.
- FINDING: the layers-table row for Maintenance in the parent doc should read headers=documents (MP_Maintain, MP_OT, MP_OT_Request), tasks/resources=document_lines,
  setup/meter tables=items.
