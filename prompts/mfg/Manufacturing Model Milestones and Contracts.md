# Manufacturing Model: Milestones and Contracts

Oct 14, 2026 · @Redhuan Oon

## Status

The layer design is a sound draft, but only the repo facts below are verified; the rest is proposal until each milestone passes.

**Verified in the repo this session**

- The AD seed carries iDempiere's HR tables (18 defined, 9 physical, 2 windows with tabs) and PP/MRP tables (about 50, mostly physical).
- `ad_table_map.js` slots `HR_Movement` as items. It belongs under `HR_Process` as document\_lines.
- The Manufacturing Order window (53009) exists in the seed but is not on the menu.
- The kernel's document verbs are CREATE\_DOCUMENT, CREATE\_LINE, SET\_STATUS, POST, ALLOCATE and MATCH. None is manufacturing-specific.
- The BIM recipe tree already lives in `pp_product_bom` and `pp_product_bomline`, per the header note in `hr_bim_asset/ad_bom.js`.
- Core `M_Production` tables are absent from the seed. ProductionCreate is a verbatim process shell whose line generator is an unported named dependency.

**Proposed, not yet checked against code**

- Snapshot on release, effectivity dates, derived MRP output, and one cost-collector document type.
- One routing model serving both building sequences and factory operations.

**From vendor and implementer pages**

- Odoo and ERPNext capability claims. Treat them as indicative, not measured.

## Design rules

Seven rules keep the manufacturing model free of later patches; each gets a witness in the milestones section.

1. **No manufacturing verbs.** The manufacturing order, cost collector and MRP run are document types carried by CREATE\_DOCUMENT, CREATE\_LINE, SET\_STATUS and POST. This keeps the "no new verbs" principle your AD-process folds already follow.
2. **One family: `PP_*`.** The BIM recipe tree already lives in it, and `M_Production` is not in the seed. Whether to also port the simple `M_Production` path is an open question below.
3. **Snapshot on release.** iDempiere copies the BOM and routing into `PP_Order_BOM*` and `PP_Order_Workflow` / `PP_Order_Node`. Keep that, and witness that editing a template never changes a released order.
4. **Use the effectivity fields that exist.** `ValidFrom`, `ValidTo`, `Revision` and `M_ChangeNotice_ID` are already defined on the BOM. Add only an approval state and a replaced-by link, the Odoo ECO idea, as an overlay.
5. **Capacity data mostly exists.** Resource time slots, daily capacity, utilization, queuing and waiting times are defined. Operator skills and a finite scheduler are the gaps.
6. **MRP output is derived.** The `PP_MRP` rows are rebuilt by a deterministic fold, never hand-written. Planned orders enter the log only when someone approves them into a document.
7. **Extract accounts, never invent them.** WIP and variance postings resolve accounts from the chart, as `wip_token` already does for Work In Process.

Odoo and ERPNext features that go beyond this, such as skills, ECO approval, quality points and the Job Card and Production Plan views, live in `erp/overlay/` behind the single seam tag, so the core stays untouched.

## Model layers

The AD seed already defines most of the manufacturing model; the gap is execution, where `PP_Cost_Collector` and seven related tables have no physical table. Slots are those `ad_table_map.js` assigns today.

| Layer | Tables | Slot | Seed status |
| --- | --- | --- | --- |
| Definition | `PP_Product_BOM`, `PP_Product_BOMLine` | items | Physical; 20 and 109 rows |
| Routing | `PP_WF_Node_Product`, `PP_WF_Node_Asset` | items | Not physical; AD\_Workflow nodes not checked |
| Capacity | `S_ResourceType`, `S_Resource`, `S_ResourceAssignment`, `S_ResourceUnAvailable` | items | Physical; 4, 22, 9 and 8 rows |
| Planning | `PP_Product_Planning`, `PP_MRP`, `M_Forecast` | items; `PP_MRP` documents | Physical; 219, 56 and 4 rows |
| Order | `PP_Order` | documents | Physical; 18 rows |
| Order snapshot | `PP_Order_BOM`, `PP_Order_BOMLine`, `PP_Order_Workflow`, `PP_Order_Node` | document\_lines; Workflow and Node documents | BOM tables physical; Workflow not; Node has 30 of 70 columns |
| Execution | `PP_Cost_Collector`, `PP_Cost_CollectorMA` | documents; document\_lines | Not physical |
| Order routing detail | `PP_Order_NodeNext`, `PP_Order_Node_Asset`, `PP_Order_Node_Product` | document\_lines | Not physical |
| Costing | `PP_Order_Cost`, `M_Cost`, `M_CostElement` | document\_lines; items | `PP_Order_Cost` has 20 of 24 columns; 267 and 9 rows |
| Change control | `M_ChangeNotice` | items | Physical; 1 row |
| Maintenance | `MP_Maintain*`, `MP_OT*` | document\_lines | Physical; 3 rows each |

The Manufacturing Order window (53009) already defines 13 tabs over these tables, so wiring the missing tables lights up the existing screen.

## Witnessed milestones

Ten witnesses, in build order, each naming the issue it proves and each paired with a deliberate break that must turn it red. They follow the style of `hr_bim_asset/tests/witness_run.js`: a `§MFG PASS` or `FAIL` line per check, exit 0 when green.

| ID | Proves | Break that must fail it |
| --- | --- | --- |
| W-MFG-WIRE | The eight missing PP tables exist and the Manufacturing Order window opens from the menu with all 13 tabs | Remove one AD column; the check names it |
| W-MFG-SLOT | Each PP table resolves to the slot in the layers table | Drop one override; the slot flips |
| W-MFG-SNAP | After release, editing the BOM template leaves the order's lines unchanged, and replay-hash equals live-hash | Make explosion read the live template |
| W-MFG-ASOF | Explosion as of a past date returns that date's BOM from `ValidFrom` and `ValidTo` | Ignore `ValidTo`; an expired line reappears |
| W-MFG-MRP | Two MRP runs and a replay yield identical `PP_MRP` rows | Read the clock inside the fold; the hashes differ |
| W-MFG-POST | Issue, receipt and activity collectors post to resolved WIP and variance accounts with debits equal to credits | Unbalance one variance line |
| W-MFG-OWN | A non-owner device's op on an order is rejected on replay, and shift handoff is an ordered op | Tamper one op; `verifyChain` fails |
| W-MFG-LEASE | Two orders cannot hold the same resource slot, and an unused lease expires as an ordered op | Skip the lease check; a double booking appears |
| W-MFG-TRACE | Forward and backward lot genealogy derives from collectors, and an exported slice verifies | Alter one collector; the chain breaks |
| W-MFG-WHATIF | A branch runs MRP and is discarded, leaving the live state hash unchanged | Let the branch append to the live log |

## Satisfaction evidence and cheap big-ERP features

No vendor clearly leads MRP satisfaction: on Capterra's 2026 MRP shortlist, ratings sit between 4.1 and 4.6, and small specialists beat the large generalists.

| Product | Rating | Reviews | Ease of use | Support |
| --- | --- | --- | --- | --- |
| ERPAG | 4.6 | 346 | 4.4 | 4.6 |
| Stocksmith | 4.6 | 245 | 4.3 | 4.7 |
| MRPeasy | 4.5 | 169 | 4.4 | 4.5 |
| Sage X3 | 4.4 | 147 | 4.2 | 4.0 |
| Acumatica | 4.4 | 243 | 4.2 | 4.1 |
| Odoo | 4.2 | 1,318 | 4.0 | 3.9 |
| NetSuite | 4.2 | 2,059 | 4.0 | 3.8 |
| Fishbowl | 4.2 | 1,128 | 4.1 | 4.3 |

Capterra's total score blends rating with popularity, so Odoo and NetSuite rank first overall despite 4.2. ERPNext, SAP Business One and Epicor are not on the shortlist, and G2's category page could not be fetched. The signal is ease of use and support, not feature breadth.

These big-ERP features look cheap for your framework. The cost column is my estimate, not a measurement.

| Feature | Why it is cheap here | Cost |
| --- | --- | --- |
| Master production schedule with time fences | `IsMPS` and `TimeFence` already exist; the schedule is a fold over forecasts | Low |
| Pegging, demand traced to supply | `PP_MRP` already links order lines, orders and BOM lines | Low |
| As-built BOM at any date | Replay plus `ValidFrom` and `ValidTo` (W-MFG-ASOF) | Low |
| What-if scenarios | A log branch that is discarded (W-MFG-WHATIF) | Low |
| Engineering change approval | `M_ChangeNotice` exists; add an approval state through SET\_STATUS | Low to medium |
| Inline quality checks on operations | Gate the operation's status with the existing Rule pill | Medium |
| Offline job card and kiosk | Reuse the signed check-in pattern from `attendance.js` | Medium |
| Finite-capacity scheduling | Lease-based slot booking plus a simple priority-rule scheduler as a plugin | Medium; full APS is not cheap |
| Digital product passport export | A signed genealogy slice (W-MFG-TRACE) behind a QR | Medium |
| Predictive maintenance | `MP_*` tables and the IoT binding exist; the prediction model does not | Medium to high |

Sources: [Capterra MRP shortlist](https://www.capterra.com/mrp-software/shortlist/), [Capterra MRP buyers guide](https://www.capterra.com/mrp-software/buyers-guide/), [Ecosire on Odoo 19 manufacturing](https://ecosire.com/blog/odoo-19-manufacturing-mps-quality-mrp), [Ecosire ERPNext manufacturing guide](https://ecosire.com/blog/erpnext-manufacturing-guide).

## Contracts for the open risks

Most of the risks raised earlier already have contracts in your repo, so manufacturing should adopt them rather than invent new ones. Two need work: gravity sharding is spec only, and agents have no scope on the key roster. I read the guard documentation, not the code that enforces it.

| Risk | Contract | Where it already lives | Witness |
| --- | --- | --- | --- |
| Sync and conflicts | No new sync primitive. One owning device per order (G-SINGLE-WRITER), shift handoff as an ordered op (G-ORDERED-HANDOFF), shared stock and resource slots leased (G-RESERVATION) and expiring (G-LEASE-EXPIRY) | `DistributedERP.md`, guard set | W-MFG-OWN, W-MFG-LEASE |
| Key custody | Shop-floor devices join the HQ-signed roster; rotation is counter-signed by the outgoing key; revocation ends future ops only | `erp_key_epochs.js` | W-MFG-OWN |
| Scale | PP tables enter the gravity-ranked manifest; a cold PP table shows a stub, never a guessed value | `DistributedERP.md`, section 13, spec only | None until section 13 is built; marked SPEC |
| Finite scheduling | The core ships infinite-capacity MRP and lease-based booking; a finite scheduler is a plugin that reads through `ctx.db` and proposes ops through `ctx.ops.append` | `plugins/README.md` | W-MFG-LEASE |
| Determinism | MRP and any scheduler read no clock or random; edge values are recorded as op inputs | `DistributedERP.md`, section 7 | W-MFG-MRP |
| Agent governance | Agents only propose ops signed under their own key; a human SET\_STATUS approves; installs propose and never self-approve | `plugins/README.md`; the roster holds device keys only | Gap: no agent scope on the roster yet |

A contract without a witness stays marked SPEC in this table, so it cannot drift silently into being assumed.

## Open questions

Six decisions are yours before building starts; each carries my lean.

1. **Port the simple `M_Production` path too?** The doc state machine and poster already reference it. My lean: yes, later, as a thin path over the same BOM, with `PP_*` first. That iDempiere ships `PP_*` as a plugin is from memory, not checked.
2. **Routing: iDempiere's AD\_Workflow nodes or a dedicated routing table?** I did not check whether AD\_Workflow is in the seed. My lean: keep AD\_Workflow for parity.
3. **Should roster entries carry an agent scope?** Today they hold device keys only. My lean: yes, so an agent key can propose but never approve.
4. **Who holds the pinned HQ key for a one-person tenant born by Genesis?** The roster contract assumes an HQ.
5. **Which cheap features go first?** My lean: master production schedule with time fences, pegging, and what-if scenarios.
6. **Run the same wiring pass for HR next?** Nine HR tables and most of its windows are not yet physical or defined.
