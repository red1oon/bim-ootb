# ⚠ DO NOT REMOVE
SCOPE: what the disc walker does with a band device that has no host, for ANY building. Read the log after every run; exit code is not evidence. Public repo: no client or project names; a real test set is "a private Revit-exported set".
Owner (2026-11-07): "we are abstracting a rules engine not custom to any particular design." On this rule: "go with your advice, write the spec".
Status: BUILT on branch `feat/walk-band-no-host`, NOT merged: §7 stop conditions fired, see §7 RESULT. The doctrine edit in §5.7 was not made.

## §1 Issue
The measured-band walk copies device density from a reference building. A device that finds no host stays in the model at its band height, floating, and counts as placed.
Measured on a private Revit-exported set, real Modeller page, software rendering, a stamped copy: ACMV 1,701 band devices, of which 1,538 float (`§WALK-NOSPACES hostBound=163 floats=1538`). ELEC 1,374, of which 1,354 float. The set's own drawings show 269 air terminals and units.
So the walk reports a large placed count that is mostly not attached to anything, and a reader cannot tell the two apart. This is one building, and it tests the rule; it is not where the rule comes from.

## §2 Rule
**A band device with no host is not placed. It is reported as refused, with the count.**
- Band device means a density placement: provenance `placed:*`, or a row from `placeMeasured`.
- It covers all three ways a device has no host today:
  | Reason code | Case | Code today |
  |---|---|---|
  | `no-rule` | the class has no `rule_shim` row | `if (!shim)`: kept floating |
  | `host-absent` | the host class is not in this building | `hb.noHost`: kept floating |
  | `out-of-reach` | no host within `reach_m` | `hb.refusedList`: kept floating |
- **Accounting stays exact, per class: input = placed + refused.** The count is never lost; only the floating geometry goes.
- A class with no host rule includes band duct segments and fittings. They are networked pieces, so a scatter of them with no route is the fabricated network doctrine §4 forbids.

## §3 What does not change
- `hostBind()` itself. It still returns `bound` and `refusedList`, and its witnesses still hold.
- Bound devices: same positions.
- Schedule placements, and `shim:host-*` placements.
- `reach_m` and every density number. **No tuning to any building.**
- `opts.noHostBind` still gives the raw walk, for the checks that need it.
- The Find panel and its tables.

## §4 Decisions already taken, do not reopen
- **The density numbers are not changed.** One building cannot give a rate: halls on the test set ranged from 2.7 to 8.8 supply devices per 100 m2.
- **A room's top is not a ceiling host.** On the test set room solids stop at 2.44 m and are not the ceilings. The real heights are on the reflected ceiling plans, not in the IFC. This answers `MODELLER_MASTER.md` "host rule for a ceiling-poor IFC": refusal stands.

## §5 Implementation
1. **One helper, used by both sites** that repeat this loop today: the measured path (`dwWalk`, the `mByCls` loop) and the legacy path (the `byCls` loop). State lines added and removed in the PR; the two loops go.
2. The helper runs **before routing**, so `_bridgeIfEmpty` and `_bomTree` never anchor to a refused device. Report the change in `chainSegs`.
3. **Result:** `refusedNoHost: { total, byClass: { <class>: { 'no-rule': n, 'host-absent': n, 'out-of-reach': n } } }` on every walk result. Counts only, no second copy of the placements.
4. **Log, per class and total:** `§WALK-BAND-NOHOST disc= bldg= input= placed= refused= [<class>: no-rule= host-absent= out-of-reach=]`. It prints `input=0 VACUOUS` when there were no band devices. The current measured path has no per-class host log, so this also fills that gap.
5. **Falsifier switch:** `opts.keepUnhosted` restores today's floating output. For witnesses only; no UI.
6. **The user sees it:** the walk status says how many were placed and how many were not placed for lack of a host. A walk that refuses everything takes the existing refused path, with the reason.
7. **Doctrine, same merge:** BIMCompiler `docs/internal/WalkerDoctrine.md` §4 today says "REFUSE (stays floating, counted). Count is always preserved (bound ∪ refused = input)". Change it to "REFUSE (not placed, counted). Every device is accounted for (placed ∪ refused = input)", citing this spec. The owner approved this change to a locked section.

## §6 Witness: `modeller/tests/witness_band_no_host.js` (W-BAND-NO-HOST)
Issue it proves or disproves: a walk reports floating devices as placed.
- **B1** fixture with hosts in reach: all bound, 0 refused.
- **B2** fixture for each reason code: that code is counted, and the device is absent from `placements`.
- **B3** input = placed + refused, per class, on every walk in the fleet run.
- **B4** bound devices are identical to `opts.keepUnhosted`'s bound devices, by class and position to 1e-3 m. Schedule placements are identical too.
- **B5** no placement in the output has provenance `placed:*` and no host. Red control: `opts.keepUnhosted` must fail this check.
- **B6** a walk with no band devices prints VACUOUS or INCONCLUSIVE, never PASS.
- **B7, real page:** a public building through `_commitDiscWalk`. Committed rows match `placed` after the LOD400 gate, and the status count matches the log.

Update, do not delete, any witness that asserts `dwWalk` keeps the floating count. Check these first: `scripts/witness_dwwalk_hostbind.js`, `witness_terminal_nospaces.js`, `witness_borrow_fp.js`, `witness_shim_select.js`, `witness_elec_hostbind.js`, `witness_terminal_geosplit.js`, `witness_space_scoped_walk.js`, `modeller/tests/witness_dw_livewire.js`, `witness_modeller_disc_walk.js`. `witness_modeller_disc_walk` B3 and B4 already fail on main: record that baseline first, so they are not blamed on this change.

## §7 Fleet check, before merge
This rule changes band counts on every building that uses bands, and it may prove too strict. Run it before and after.
- **Denominator:** every building DB held with real content × every discipline its rules hold. Take both from the directory and the rules DB, never a hand-picked list. Rules DB by the real `WalkRules`, in the page's call order. Print N.
- **Table, one row per walk:** building, discipline, mode, placed before, placed after, bound, refused by reason, `chainSegs` before and after.
- **Stop and bring the table to the owner before merging, if any of these appear:**
  1. A building walked with rules measured on itself loses more than a few of its band devices. Its hosts and rules agree by construction, so a large refusal there means the rule or the host search is wrong, not the building. Look at Terminal first.
  2. The FP borrow on a residential building (`witness_borrow_fp.js`, 151 sprinklers host-bound) loses bound devices.
  3. A walk that placed devices before now places none. It may be correct, but the owner sees it first.

  Do not pick a threshold to make the table pass. If "a few" needs a number, that is the question to ask.
- `⛔ BLOCKED: <the one question>` is the right outcome here. Do not loosen the rule to get through.

## §7 RESULT 2026-11-07: ⛔ STOPPED before merge, stop conditions 1 and 3 fired. For the owner.
N = 118 walks (21 DBs with elements × each discipline the rules hold; `modeller/tests/fleet_band_table.js`, page call order, before = #2677's walker, after = this branch). 12 rows are not judged: both LTU_AHouse DBs hit the sql.js wasm limit in node, before and after, so they read 0 placed; that is the instrument, not a result.
**Accounting holds and nothing moved:** before placed = after placed + refused on every walk with band devices (B3 fleet), and bound counts are identical before and after on every row.
**Stop 1, a building walked with rules measured on itself loses most of its band devices.** Terminal, `terminal_rules.db`:
| DB | ACMV | ELEC | FP | PLB | STR |
|---|---:|---:|---:|---:|---:|
| `Terminal_ARC.db` | 1,325 → 412 | 808 → 118 | 1,054 → 260 | 924 → 0 | 623 → 0 |
| `Terminal_extracted.db` | 1,312 → 425 | 744 → 114 | 972 → 248 | 890 → 0 | 666 → 0 |
| `Terminal_meta.db` | 1,334 → 402 | 745 → 111 | 973 → 238 | 890 → 0 | 675 → 0 |
ACMV, ELEC and FP refusals are all `out-of-reach`. PLB and STR are all `no-rule`. The spec reads this as "the rule or the host search is wrong, not the building".
**Stop 3, walks that placed devices now place none: 36 of the judged walks.** Every DB's PLB (no `rule_shim` row for it) and STR (same), plus `Garage_ARC.db` ACMV 4,007 → 0 and every class on the small warehouse DB.
**Stop 2 did not fire.** The FP borrow keeps its bound devices: SampleCastle 126 → 126 bound 126, Duplex 46 → 29 bound 29, SampleHouse 17 → 16 bound 16. The spec's "151 sprinklers" is the older build copy's count; the shipped walker binds 126.
**Routing collapses with the band devices:** e.g. Hospital_ARC PLB 19,457 runs → 0, FP 3,028 → 36, ACMV 3,352 → 3, Terminal_ARC ACMV 754 → 0. These were the stub runs measured in bim-compiler `MODELLER_MASTER.md` §G RESULTS.
**The largest drops by building:** Garage ELEC 2,756 → 49, HHS_ARC ELEC 722 → 12, Hospital_ARC ELEC 3,190 → 193.
**Spec text that does not match the code:** §2 says band duct pieces have no host rule. They do fall through `_shimForFixture` to the discipline-level shim, so they bind to ceilings and are refused only as `out-of-reach`; `no-rule` never fires for ACMV. Not changed. `scripts/witness_*` named in §6 test bim-compiler's older `build/disc_walker.js`, so as written they cannot see this change; a run pointed at the shipped walker exists for the baseline only (below).
**Baseline before this change, shipped walker:** W-BORROW-FP 6/0, W-DWWALK-HOSTBIND 6/0, W-ELEC-HOSTBIND 5/0, W-SHIM-SELECT 6/0, W-TERM-NOSPACES 8/0, W-DW-LIVEWIRE 12/12, W-UX-DISC 5/3 (B3, B4, B6 fail on main too); W-SPACE-SCOPED could not run (a scratch path from an earlier session is gone). **Not yet run after this change.** B7 (real page) not built.
**W-BAND-NO-HOST:** B1-B6 PASS on public Clinic ELEC, red control included. Also found: 87 of 723 bound devices share a spot with another of their class (`hostBind` re-snaps to the host's centre), today's behaviour, not changed here.
**The one question:** with Terminal itself keeping only about 15 to 30 % of its services and PLB and STR gone everywhere, should the rule stand as written, apply only to the classes a host rule covers, or does the host search's reach need looking at first? No threshold was picked.

## §8 Then, design lane
The design lane runs the private set on the merged code and compares placed and bound with the 269 drawn, by room, using its existing assignment. A count near 269 alone proves nothing; it reports positions as well. Report on this lane as: a rules engine, not custom to any design.

## §9 Not in this change
- Where a main's shape comes from: open question to the owner.
- Device counts for large rooms, and the missing schedule rows.
- Ceiling heights read from drawings. That could later give real hosts to devices this rule refuses, and the refused counts show where it would help most.

## §10 Owner's ruling 2026-11-07: amends §2, §3 and §4. Read this before §5. Not built
Asked by the design lane: should "no ceiling object" count as no host? Advice: no; refuse only where a ceiling is stated and the device does not fit it, and the host is the ceiling whose real outline holds the device, with the device keeping its position. Owner: *"agree with you"*. This answers the one question in §7 RESULT.
**Evidence, an observation that tests the rule, not its source.** Real devices at real positions on a private Revit-exported set, three readings: a real ceiling outline holds 78 to 89%, so 11 to 22% have no ceiling object above them. Median distance from a device to its ceiling's centre is 6.6 to 11.7 m, and moving devices to the centre puts 215 of them on 11 spots. These are real devices, so they show what a model can lack. They do not show that any particular band device is right.
**The rule now:**
1. **Host search changes, so §3's "`hostBind()` itself" no longer holds.** The host is the ceiling whose real plan outline holds the device, at or above it. The device keeps its X and Y and takes the height from that ceiling. Reach to a host's centre and the snap to that centre both go.
2. **No ceiling object at that spot is not a refusal.** The device is placed and labelled `unhosted`. It is counted apart from bound devices, so a reader can tell them apart. This is what §1 complained of.
3. **For a ceiling host, refusal stays for one case: a stated ceiling exists and the device does not fit it.** The walker reads no ceiling plan today (§9), so this case cannot fire until that input exists. Do not stand in a guess for it.
   **Rules 2 and 3 cover `IfcCovering` rows only.** Wall, window, slab and roof rows keep §2: a band device with no host is not placed, and is counted as refused. The owner's word and the evidence were about ceiling objects only, and those hosts were not measured. So refused stays a live, testable result. Extending `unhosted` to them is the owner's decision.
4. **`no-rule` classes are reported as not judged** (owner, *"Fix host search first"*, recorded in bim-compiler `MODELLER_MASTER.md` §RESUME 2026-11-07b): not bound, not refused, output as today. So `Terminal` PLB and STR do not go to zero.
5. **Accounting per class: input = bound + unhosted + not judged + refused.** The log line and `refusedNoHost` carry all four.
6. **§4 still holds:** density numbers are not changed, and a room's top is not a ceiling host.
**What this costs, derived, not yet measured:** the rule no longer reduces the band count on a ceiling-poor building. The §1 figures, 1,701 ACMV bands against 269 drawn, stay about the same, now labelled. So §1's labelling issue is answered, and **band density is a separate open question for the owner**.
**Witness changes:** B2 tests `unhosted`, present and labelled, not absent. B5 becomes: no `placed:*` device reads as bound without a host. Add B8, oracle: a building's real devices at real positions through `hostBind`: position unchanged, distinct spots = devices, with a red control on the old centre snap. Re-run the §7 fleet; stop conditions 1, 2 and 3 stand.
**Doctrine:** the §5.7 wording is now out of date. At merge, state §4's rule as this section does, using the owner's approval above.

### §10.1 Host search detail, measured 2026-11-07, closes the limits left open in the first oracle test
Log `§` per walk: hosts rejected by the shape test, devices with more than one candidate, bound devices on a host that is not flat. Numbers below test the rule; none is a default.
- **Area or point host: a data row by host class, never a size threshold.** `IfcCovering`, `IfcSlab` and `IfcRoof` are area hosts. Everything else keeps today's branch, so a window stays a point host, and a wall stays `SIDE`. A small ceiling is still an area host.
- **Do not filter `IfcCovering` by name words or by type.** Across 25 fleet DBs, 0 coverings have a name that reads as a floor finish, so that fear is not measured here. The real hazard is different: `SampleCastle` holds 1,214 coverings named as wall layers, `LTU_AHouse` 24,321 with no usable name, and many are thick. Names are design-specific, and most DBs carry no type column. **Use shape: a ceiling is flatter than it is wide.** Measure the separation on the fleet and bring the numbers before fixing a ratio. A world box of a diagonal wall can look wide, so report that case.
- **Height test: keep `_zOverlaps` against the device's band.** That already separates stacked ceilings. Where several candidates remain, take the nearest face in height. A placement with no band stays on `same_storey`, and a host with neither test stays unverified in the log.
- **A plan box is enough to say a host exists, not always to say which.** On a real set rotated from world axes, 275 devices: 256 under a real outline, 257 under its world box, so only 1 false host. But for 57, a box offers a candidate whose outline does not hold the device, and the ceiling's outline fills only 0.57 of its box at the median. First slice: box plus height, with the ambiguous count logged. Real outlines only if that count moves results; they cost heap, see the perf budget.
- **A host's lower face is not its soffit when the host is not flat.** On the same set a ceiling 1.84 m deep holds devices through that whole depth; 191 of 249 lights have mid-height inside their ceiling's height range +/- 0.15 m. A band device taking that face can be off by up to the depth. Do not fix it here; log it.
**B8 oracle, thresholds fixed now:** on public buildings with real devices, every bound device keeps X and Y to 1e-3 m, distinct spots equal devices, and bound count is at least today's. Red control: the centre snap must fail.

### §10.2 Shape test and space filter, build lane's measurements 2026-11-07, accepted by the design lane
- **Shape test: `bbox_z / min(bbox_x, bbox_y) < 1`, in words: height less than its narrower plan side.** Independent reader: mesh normals, 11 sets with coverings. Excluding `LTU_AHouse`, 2,271 meshed: flat rejected 0 and upright kept 9 at every R from 1 to 1.5. **R is a data value, not a code constant.** `IfcCovering` only; slabs and roofs were not measured.
- **Known leaks, stated, not fixed in this slice:** 9 upright pieces pass, 1 of them a roof fascia ring 35.7 x 27.2 m, which only the mesh sees. Add a mesh normal test only if the fleet shows false binds. `§` log which hosts bound devices came from the upright-by-mesh list, so that question has an answer.
- **Fragile near the limit:** 3 flat pieces on a set rotated from world axes read 0.96-0.97. A world box grows with rotation, so a passing ratio there is not a measure of flatness.
- **Measure on what the walk reads.** The stored box and the mesh box disagree on 3,831 rotated rows of `LTU_AHouse`. State which box the R table used, use that same box in the walk, and log how many rows took each source. If they differ, re-run the table. Reading mesh for this has a heap cost: log it, per the perf budget. `LTU_AHouse` stays not judged.
- **Space filter:** with `spaceBBox`, area hosts drop the host-centre-inside-space filter. Its reason was the centre snap (code comment at that filter), and §10 removes the snap. Point hosts still snap, so they keep it. The device must still be inside the space. A witness: a ceiling centred outside a room holds a device inside the room, bound, position unchanged; run a space-scoped walk before and after. `W-SPACE-SCOPED` could not run at the §7 baseline, so restore it or say it stayed unrun.
