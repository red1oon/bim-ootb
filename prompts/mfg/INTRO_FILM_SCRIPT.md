# ⚠ DO NOT REMOVE — Manufacturing plugin: INTRO FILM script (card + storyline). NOT BAKED. Honour the film standing rules in bim-compiler `prompts/ERP_DEPTH_FILM.md` (typed-onto-paper cards, claims qualified to what the repo proves, ERP-only = CPU recorder, every spoken number a `§ERP_FILM_FACT` read from the run, no GPU without the user's OK, English first).

Status: script only. Nothing is recorded. Recording = a CPU take driven by a recorder in bim-compiler `scripts/film_erp_*.js` style; it needs the user's go. Evidence for every beat is a witness that already passes (file in brackets); the film must READ these values from the run, never restate them from this file.

## Is there enough to announce a preliminary Mfg start? YES, as "preliminary: first slices", scope-qualified
Claimable (each with a passing witness): a Manufacturing (Libero) layer that installs, starts, lazily activates and stops like an OSGi bundle; a Manufacturing Order window reachable from the menu; BOM explosion, routing snapshot and MRP rows written when an order is saved; order completion with a standard-cost snapshot; Component Issues and Material Receipts that move stock and book cost with hand-checked numbers; a rate variance; a Home dashboard indicator and goal contributed by the plugin as plain dictionary rows; stop restores the baseline and keeps the data.
NOT claimable yet (say so on the card): accounting postings (Doc_PPCostCollector, M6), activity/labour costing, usage/method variances, reversals, order void/close, MPS/pegging, HR. No legacy-pilot run with the real Libero jar exists: the oracle is the Libero Java read verbatim plus the repo's own dictionary; where the 2008 demo rows differ from the current source the witnesses print every difference. Standing-rule wording: "tamper-evident, not proof", "standalone-user scope", "prototype".

## INTRO CARD (typed onto paper; ~25 s; every sentence is qualified)
> **Manufacturing, as a plugin - preliminary.**
> The core of iDempiere is the trade cycle and accounting. Manufacturing is not core: it arrives like any other module.
> This is a first, preliminary slice of Libero Manufacturing, ported from the public Libero source into the browser ERP and installed as a plugin you can start, stop and remove.
> What you will see is limited to: the plugin panel, the Manufacturing Order, stock moving, and cost landing. Postings to the books, labour cost and variances other than rate are not built yet.
> Every number in this film is read from the run. The ERP shows screens built from the Application Dictionary in the browser. All work is MIT licensed, in GitHub, except the ported Libero logic, which keeps its GPL notice.
(Licence honesty: the ported files carry `SPDX-License-Identifier: GPL-2.0-only`; the closing MIT card must say so, per the existing practice. Do NOT say "first time".)

## STORYLINE (one take, no splices; beat -> evidence -> the `§` values to speak)
| # | Beat | Evidence (passing witness) | Values the recorder must read, not invent |
|---|------|----------------------------|-------------------------------------------|
| 1 | **Plugin panel, Felix style.** Open Plugins & Releases; Install the bundle; Start. State goes STARTING; the detail pane lists what it will register. | `poc_osgi_console_live.js`, `poc_libero_live.js` V0/V1 | `§PLUGIN-START ... state=STARTING (lazy...)`, bundle count, `Services registered` |
| 2 | **Opening screen.** Reload; Home already shows the Manufacturing indicator and goal while the plugin is only STARTING (no code has run). | `witness_libero_dashboard.js` D1-D4, `poc_libero_live.js` V1b | `§DASH-GADGET docstatus ... Manufacturing Orders to complete=<n>`, `Manufacturing Output: <pct>%` |
| 3 | **Menu to window.** Click Manufacturing Order in the menu: the plugin activates before the window draws; the panel now shows ACTIVE. | `poc_libero_live.js` V2, `poc_plugin_grid_triggers_live.js` | `§PLUGIN-ACTIVATE id=org.idempiere.mfg`, then `§IDEMPIERE window=Manufacturing Order(53009) tabs=13` |
| 4 | **Standing prerequisite.** Show that the order is refused until Standard Costing is set (GardenWorld ships Average PO). | `witness_libero_cost.js` L2 | `Costing method not supported - A`; then the category costing method set to S |
| 5 | **Create and complete an order** (Fertilizer#70, qty 100): the BOM, routing and MRP rows appear; stock is reserved; Complete snapshots standard costs. | `witness_libero_bundle.js` L3/L3d/L3s, `witness_libero_cost.js` L0/L1/L1b | `§MODEL-AFTER-SAVE ... tables=`, reserved qty, `PP_Order_Cost rows=<n>` |
| 6 | **Issue components.** Cost collector Component Issue for the kg line and the bag line: on-hand falls, cost details appear. | `witness_libero_cost.js` L3a-L3e | on-hand before/after, `amt` and `qty` of the Material detail |
| 7 | **Receive finished goods** in two parts: new batch each time, finished-goods cost carried from the issues, order delivered. | `witness_libero_cost.js` L4a-L4d | the two receipt amounts and their sum equal to the issued cost, `qtydelivered` |
| 8 | **A rate variance** appears when the standard price is below the actual price. | `witness_libero_cost.js` L5 | variance collector count, its two detail amounts |
| 9 | **A refusal**: an order with no routing is refused and rolled back (nothing saved). | `poc_libero_live.js` V5 | `§MODEL-SAVE-ROLLBACK table=pp_order` |
| 10 | **Stop the plugin.** The Home indicator and goal disappear, the menu entry goes, the data stays. | `witness_libero_bundle.js` L7, `witness_libero_dashboard.js` D6 | rows before/after, `state=STOPPED` |
| 11 | **Closing card** (process card): 1 parity task, 2 smell out gaps, 3 fix the iDempiere way and prove again, 4 next task, 5 invite the viewer to suggest an important task to check. Add: "next in line: the accounting postings." | n/a | n/a |

## Preconditions for a recorder (none done)
- A fixture session: seed + patches, Standard Costing set on the three product categories, standard prices and on-hand as in `witness_libero_cost.js` FIXTURE lines (these are labelled test setup, and the film must say "set up for this demonstration").
- `QtyEntered` is set on the order after creation (see spec: the explode-twice quirk), otherwise the finished-goods cost refuses.
- Beats 6-8 run through the host commit funnel / DocAction path, not yet exercised end to end in a real browser (only the node witness proves the numbers; `poc_libero_live.js` proves activation, order create and refusal). A browser cost-collector take is the first thing a recorder session must prove with a `§`-log before filming, per the PRIMAL LAW.
- Quiet GPU: this is an ERP-only CPU film; no bake.
