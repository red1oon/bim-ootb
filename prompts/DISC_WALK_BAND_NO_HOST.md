# ⚠ DO NOT REMOVE
SCOPE: what the disc walker does with a band device that has no host, for ANY building. Read the log after every run; exit code is not evidence. Public repo: no client or project names; a real test set is "a private Revit-exported set".
Owner (2026-11-07): "we are abstracting a rules engine not custom to any particular design." On this rule: "go with your advice, write the spec".
Status: MERGED with the owner's word, 2026-11-07. Read §10 and §10.3; §7 RESULT is the earlier build. The doctrine edit is §10's wording, made separately in BIMCompiler `docs/internal/WalkerDoctrine.md`.

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

### §10.3 RESULT 2026-11-07: built; stop condition 2 fired; ✅ owner: merge as built
Code: `modeller/disc_walker.js` `_AREA_HOST`, `_bindAreaHost`, `_bandHostPass`. N = 118 walks, same denominator and page call order as §7, before = #2677's walker. `LTU_AHouse`'s 12 rows stay not judged (sql.js wasm limit, before and after).
**Added beyond §10.2, because its condition was met: the mesh normal test.** The upright log showed 117 band devices on 1 upright host across 5 walks, a roof fascia ring on `JKR` that the box test passes, plus 39 real devices in the oracle. So `uprightHz: 0.3` is now a data value on the `IfcCovering` row, read only for hosts a device reaches. A host with no faces at hand is not judged by it and the box test stands (`noNormals=312` of hosts read). After it: `uprightRejected=5` across the fleet.
**Box source, as §10.2 asks.** The walk reads the mesh's world box when a mesh is at hand, else the stored row. The §10.2 table re-run on that same source is unchanged on the 10 sets: R=1 flat rejected 0, upright kept 9. Across the fleet walks: `boxFromMesh=14003`, `boxFromRow=4469`. Row centres are off the mesh's middle by up to 12 m, so the mesh is the better box: of 5,865 ceiling-kind real devices, 87 are held only by the mesh box, 35 only by the row box. A resident with no mesh file takes the weaker box. Largest `heapDeltaMB` on one pass 9.7; nothing is kept.
**Stop conditions:**
- **Stop 3 no longer fires.** Walks that placed devices and now place none: 36 → 0.
- **Stop 1 does not fire on my reading; the "few" is yours.** Terminal on its own rules, placed before → after, bound before → after, DB `Terminal_ARC`: ACMV 1,325 → 1,325, 412 → 457; ELEC 808 → 805, 118 → 135; FP 1,054 → 1,044, 260 → 348. The losses are wall rows refused. Still, most of them are unhosted, not bound: ACMV 868, ELEC 670, FP 696.
- **Stop 2 FIRES: the FP borrow loses bound devices.** SampleCastle 126 → 24, Duplex 29 → 9, SampleHouse 16 → 6. No device is lost; they are now unhosted. Ceiling binds only, what the old ones were bound to:
  | Resident | Old ceiling binds | On flat / upright / mixed host | Old spots | Old snap median | New ceiling binds | New unhosted |
  |---|---:|---|---:|---:|---:|---:|
  | SampleCastle | 116 | 18 / 80 / 18 | 108 | 1.08 m | 14 | 102 |
  | Duplex | 28 | 28 / 0 / 0 | 11 | 3.09 m | 8 | 37 |
  | SampleHouse | 11 | no mesh | 2 | 2.48 m | 6 | 6 |
  So on SampleCastle most old binds were on wall layers, and on Duplex a real ceiling held the host but only by moving devices 3 m onto 11 spots.
**Fleet totals, band walks (85):** placed 111,128 → 110,305; bound 16,454 → 17,985; unhosted 56,088; not judged 35,560; refused 823; routed runs 99,098 → 99,390 (these are the stub runs; stopping them is a separate change, owner's G1(b) ruling). Bound falls on 20 walks, rises or holds on the rest; the full table is in the run log, not reproduced here. **As §10 derived, band counts stay about the same, now labelled. Band density stays open for the owner.**
**Real devices, B8, classes the rules send to a ceiling, Hospital + JKR + Terminal:** 4,695 bound against the old 4,262 (the same number as the design lane's first test), 0 moved, 0 new stacks against the old 3,730. A plain `IfcFlowTerminal` is printed, not judged: it holds receptacles, switches, sconces and floor traps, which the old search bound by reach alone.
**Witnesses, final code:** W-BAND-NO-HOST 35 of 35 (F1-F7 hand-calculated; B1-B6, B8; B3 on 85 fleet walks). W-BAND-NO-HOST B7 real page, ARC-only public Clinic, 13 of 13: log, held placements, committed rows and status text agree per discipline. Pointed at the shipped walker, before → after: W-BORROW-FP 6/0 → 6/0, W-ELEC-HOSTBIND 5/0 → 5/0, W-SHIM-SELECT 6/0 → 6/0, W-TERM-NOSPACES 8/0 → 8/0, W-TERMINAL-GEOSPLIT 12/0 → 12/0, W-DW-LIVEWIRE 12/12 → 12/12, **W-SPACE-SCOPED restored on public Clinic: 5/0 → 5/0**, W-UX-DISC 5/3 → 6/2 (fails on main too). **W-DWWALK-HOSTBIND 6/0 → 5/1: W3 asserts a wall row keeps the floating count, the assertion §6 said to update.** That script tests bim-compiler's older `build/disc_walker.js`, so it is not changed here.
**Not in this change:** stopping stub runs (next, its own PR, `§WALK-MAINS`); the doctrine §4 edit, at merge, with the owner.

### §10.4 One reader of an element's real box; the corridor trunk uses it (2026-11-07, named defect, found tracing W-CORRIDOR-TRUNK CT3)
**Issue.** §10.3 measured row centres off the mesh. `seed_trunk.js` builds its nav grid from those row centres, for walls and for doors. Duplex: 34 of 57 walls are over 10 cm off, the worst 3.12 m. So the trunk avoids walls that are not there and can cross ones that are, while its doctrine says it does not cross walls. W-CORRIDOR-TRUNK could not see this because it builds its grid the same wrong way: its falsifier reads 14 of 14 with or without doors.
**Rule.** One reader, `DiscWalker.realBox(bdb, row, geoDb)`: the element's world box from its mesh when one is at hand, else the stored row, and it says which. The host search takes its box from this reader, so there is no second implementation. `planTrunk` reads walls and doors through it, passed `opts.geoDb` by its callers.
**Not changed:** seed, stairs and risers (the engineer's choice and real anchors), the band devices, whether a trunk counts as a main (owner's question).
**Log.** `§TRUNK-BOX walls= doors= boxFromMesh= boxFromRow= ms= heapDeltaMB=` per plan.
**Witness `modeller/tests/witness_trunk_real_box.js` (W-TRUNK-REAL-BOX).** Issue it proves or disproves: the trunk is planned around walls that are not where the row says.
- **K1** hand-built: a wall whose mesh sits 3 m off its row centre blocks the grid where the mesh is, not where the row is. Red control: the old walker's row box fails this.
- **K2** a door whose mesh sits off its row centre carves the passage at the mesh.
- **K3** real buildings, before and after: served, refused, length, and how many trunk segments cross a true wall box away from any door. Old walker's count is the red control. Printed per building; a building with no mesh is not judged.
- **K4** the host search takes the same box: a ceiling whose mesh sits off its row centre holds a device under the mesh, not one under the row.
Trunk lengths will change. They are reported, not tuned.
**§10.4 RESULT 2026-11-07.** W-TRUNK-REAL-BOX 6 of 6 (K1, K2 hand-built with red controls on the old walker; K4 the host search takes the same box). Real buildings, before → after, ELEC fixtures, the default seed:
| Building | served | refused | trunk length, m | segments crossing a true wall box |
|---|---|---|---|---|
| Duplex | 29 → 29 | 71 → 71 | 112.1 → 87.0 | 25 → 0 |
| SampleHouse | 14 → 14 | 3 → 3 | 67.3 → 61.0 | 5 → 1 |
| HHS | 801 → 800 | 8 → 9 | 5,116.5 → 4,900.8 | 282 → 57 |
| Clinic | 1,187 → 1,098 | 815 → 904 | 6,947.8 → 6,666.6 | 3,831 → 2,514 |
| JKR | 1,178 → 973 | 430 → 635 | 5,471.7 → 3,836.4 | 1,273 → 25 |
**Served falls on 3 buildings, as the doctrine says it should:** a fixture reachable only through a real wall is refused. **Crossings do not reach 0 on Clinic (2,514 remain):** not traced. The count samples a world box, so a diagonal wall's box overstates it, and the router's wall filter is still `|centre z − storey z| < 1.8` on the row; either may account for it. All boxes came from the mesh on these files (`boxFromRow=0`). Cost, largest: 661 ms, heap +6.7 MB. In bim-compiler, W-CORRIDOR-TRUNK CT3 now fails on row boxes and passes on real ones (1 of 14 without doors, 14 of 14 with), and W-SEEDTRUNK-ENGINE keeps 30 / 26 / 7 on real boxes.
Unchanged: band fleet, 118 walks, placed, bound and runs identical to #2687. W-BAND-NO-HOST 34/0, its B8 red control now pinned to `0295309a` (a default tree went stale once the fix merged), B7 page 15 of 15, W-WALK-MAINS 11/0, W-E2E-SEEDTRUNK 6/0, W-SEED-TRUNK-RENDER 8/0, W-ROUTE-PATTERN-BRIDGE 10/0, W-SEED-OUTWARD-REVEAL 9/0, W-MEP-OPENPATH 27/2 (M5, M7, as on main).
**Checks asked for the trunk's place in the mains ruling (owner's §9.3):** by code read, `window.seedTrunk` renders `LineSegments` into `__dwTrunk` and commits nothing to the op-log, so it cannot reach the saved DB or the IFC export. **Not user-triggered only:** `_corridorJunctions` calls `planTrunk` inside the automatic pattern path, and of `_RW_PATTERN_DISC` (PLB, FP, ACMV, ELEC) the mains gate stops three, so **ELEC still reaches it on every walk where no real ELEC run pairs.**

## §11 Band density: borrowed-density devices are provisional (owner 2026-11-07, *"Yes to all four"*). Not built
Asked: should borrowed-density devices be provisional and left out of the placed count and quantities? Density numbers stay untouched, as §4 says.
**Issue.** A walk reports borrowed-density devices as placed, so a count reads as a claim about the building. Measured on a private Revit-exported set, ACMV, on the merged code: 706 air terminals against 269 drawn; inside the author's rooms, nearest drawn device 2.55 m for band and 2.88 m for bound, against 2.73 m and 2.96 m for random points in the same rooms. Borrowed density gives a count and no location. One building: it tests the rule; it is not its source.
**Rule.**
1. **Every band placement is `provisional`, whatever its host state: bound, unhosted or not judged.** provenance `placed:*`, or a band row that took a host. Binding to a real ceiling does not make its position known, so carry the flag through the host pass, because bound rows lose `placed:*`.
2. **Left out of the placed count.** `w.placed` counts the rest; `w.provisional` carries these. Accounting per class stays exact and gains no new bucket: bound and unhosted are still reported, each with its provisional share.
3. **Left out of quantities.** Anything that totals walked devices excludes them. List every consumer by reading the code (start at `_commitDiscWalk`, `dw_instances_outliner.js`, the walk-all total, BCF and IFC export), state in the PR which take a count, and witness each. A consumer not listed is the defect this rule exists to stop.
4. **Still shown, and labelled.** The status line reads, for example, `12 placed · 671 provisional`. A device in the model says provisional when identified.
5. **The label travels or the device does not:** a committed row keeps it. Export keeps it if the format can carry it; if not, the device is left out of that export and counted in the log.
**Scope, corrected 2026-11-07 after the build lane asked:** an earlier P2 read as if not-judged rows stayed in placed. They do not. The ruling is about borrowed density, and "not judged" only says no host rule judged the row; its density is still borrowed. So classes with no host rule, such as plumbing and structure on an ARC-only file, leave the placed count too, and many more walks reach 0 placed. Print them by name, as below.
**Trap, read before coding:** `w.placed` also decides the refused and fallback paths (`modeller.html` `_discWalkOneBody`, `walkLive`'s `§SCHED-FALLBACK`). A walk of only provisional devices is not a refused walk. Keep those branches on what they mean today, and do not let this change re-trigger a legacy walk.
**Viewer, owner 2026-11-08 (*"Leave them out"*):** when the Viewer opens a DB holding walked rows, its class and room totals skip provisional devices, as the Modeller's do. The devices stay visible and labelled. The Find panel's room injection and its auto-inject behaviour are not touched; only the totals change. Witness: P7, the same DB's Viewer totals with and without provisional rows, red control a switch that counts them.
**Not in this rule:** schedule rows (`sched:*`), real elements, `bom-tree`. Schedule rows measured no better than random there too (1.47 m against 1.25 m, 34 devices, one building); that is noted, not ruled.
**Witness, W-BAND-NO-HOST:** P1 fixture: bound and unhosted band rows are provisional, schedule rows are not. P2 per class: placed + provisional + refused = input, where provisional splits into bound, unhosted and not judged, each unchanged by this rule. A band row is never in placed. P3 positions identical to 1e-3 m with and without the rule. P4 every listed consumer's total excludes them, red control a switch that counts them. P5 a walk of only provisional rows takes no fallback. P6 nothing to judge prints INCONCLUSIVE.
**Fleet:** before and after, per walk; print by name every walk whose placed count goes to 0 for the owner to see. **Doctrine:** at merge, add to §4 under GENERATED, with the owner's approval above.
**§11 RESULT 2026-11-07.** Scope as the design lane fixed it: every band row is provisional, bound, unhosted or not judged.
- **Node, W-BAND-NO-HOST 44 of 44:** P1 1,326 band rows all provisional; P2 per walk placed + provisional = rows out, provisional = bound + unhosted + not judged, refused apart; P3 positions identical to main's walker (read from git), main 1,130 placed = now 467 + 663; P4 red control (`__dwCountProvisional`) puts them back; **P5 a PLB walk of only not-judged rows on an ARC-only resident (93 rows) is not refused and takes no `§SCHED-FALLBACK`, and the old `!w.placed` test would have sent it there**; P6 a schedule walk has none and says VACUOUS.
- **Real page, public Clinic, B7 + P4, 25 of 25:** status `0 placed · 277 provisional`; walk-all total 0 placed, 1,434 provisional; Outliner rows `0 placed · 277 provisional ▶`; every Walked Fixtures leaf says provisional (1,434 of 1,434); **IFC:** custom set `BIMOOTB_Walk` (`Provisional`, `Provenance`, `HostState`), 3 sets for 1,434 fixtures, provisional count in the file = the walk's, the file re-opens; red controls: writer switch off writes no set, a fixture with the flag off reads false; **Viewer DB:** the shared extractor now keeps that one named set in `element_pset_common`, 1,434 TRUE rows. No IFC validator was run on the file.
- **Fleet, 118 walks, against main `748b259d`:** placed 68,237 → 950; provisional 67,287; placed + provisional equal to before and routed runs unchanged on every walk. **79 walks go to 0 placed**, by discipline: ACMV 14, ELEC 16, FP 17, PLB 17, STR 15 (every ARC-only resident and every extracted DB, except schedule walks). The 10 still placing: Duplex's schedule walks (ACMV 19, ELEC 102, PLB 18, on both Duplex DBs), Clinic_extracted ACMV 87, ELEC 467, FP 113, SampleHouse_ARC FP 5 (schedule and pre-hosted rows). Full list in the run log.
- **Consumers of a count (read from the code), each witnessed:** walker `placed` on all three paths (P2-P4); `_dwLod400Only`'s recount (B7, P4c); the refused, LOD400 and fallback branches (P5, node; on the page they use placed + provisional); status and `§DISC-WALK` (P4c); walk-all total (P4a); Outliner discipline row (P4f); node harness (P5); fleet table. Labels: committed `_dw.provisional` and its read-back; Walked Fixtures leaves (P4b); IFC (P4d); Viewer DB (P4e). Presence only, unchanged: trunk list, reveal duration. No count: `bcf_export.js`. **For the owner, not changed (design lane is confirming what the owner's yes means):** the Viewer may count walked rows in class or room totals when it opens an exported DB; the Find panel is out of scope.
- **Witness fixes found on the way, instrument only:** W-MEP-OPENPATH read the tube census in the instant a redraw clears and rebuilds the tubes (0 on one run, 3,957 a read later, on main and on this branch); it now re-takes the census until tubes equal runs, up to 15 s, and judges the last read. W-TRUNK-REAL-BOX's red control is now pinned to the commit before §10.4. bim-compiler W3, W4, T2, T4, T6b, T8 and B3 now count placed + provisional.


## §11 P7 SPEC (build lane, 2026-11-08): Viewer totals leave provisional devices out. Written before the code
**Issue.** A Viewer DB exported after a walk holds borrowed-density devices, marked by one row each in `element_pset_common` (`pset='BIMOOTB_Walk' AND name='Provisional' AND value='TRUE'`, §11 RESULT P4e). The Viewer counts them like real elements in every class, room, storey and discipline total and in every quantity, so the Viewer reads 1,434 devices on Clinic as building content while the Modeller says `0 placed`.
**Rule (owner 2026-11-08, *"Leave them out"*; design lane points (a), (b) of the same day).**
1. **One owner:** `viewer/provisional_totals.js` (global `ProvTotals`, also `require()`-able). It is the only place that knows the predicate. A count site never writes it.
2. **The site swaps its count, not its WHERE.** `ProvTotals.count(db, guidCol, site)` returns `COUNT(*)` when the DB holds no provisional row (or the red switch `window.__vwCountProvisional === true` is set), else `COALESCE(SUM(CASE WHEN <guidCol> NOT IN (<provisional guids>) THEN 1 ELSE 0 END),0)`. `ProvTotals.sum(db, expr, guidCol, site)` does the same for `SUM(expr)`. So a class whose rows are all provisional stays in its group with count 0 (point (a): it stays in the Type dropdown and can still be found), and **a DB with no walk set runs byte-identical SQL**, so its totals cannot move.
3. **Lists keep the devices** (point (b)): a list or result line counts the same way, and each provisional row is labelled `· provisional` in the Find result list and in the identify panel. `ProvTotals.isProvisional(db, guid)` reads one cached set per DB.
4. **The § line:** `§PROV-TOTALS provisional=<n> rule=leave-out` once per DB, or `provisional=0 totals unchanged`. `ProvTotals.sites` counts which sites swapped, so a witness can say which sites it actually judged.
**Count sites that swap (bim-ootb main `c5ddd579`, from `grep COUNT(|SUM(` over `viewer/*.js` + the report pages):** HUD total and discipline counts (`scene.js` 1380/1382, 1501/1503; `streaming.js` 4127/4129) · NL answers (`decoder.js` 189, 193, 207, 244, 249; `nlp.js` every count pattern) · Find panel (`nf_panel_search.js` 200, 210, 269, 286 + the `n found` line; `nf_isolate_drill.js` 52, 267, 286, 298, 324, 345) · summary and sheet (`measure.js` 1619/1624, `print_sheet.js` 128, `wizard.js` 99/109/136/145) · cards (`cpe_resource_panel.js` 484, 488, 504, 645, 667) · per-room (`fx_cinema_path_plan.js` 188) · quantities and cost (`cost_panel.js` 81-83, `diff.js` 359, `nf_highlight_cost.js` 516, `main.js` 4D_QTO relay, `analysis_sidecar.js` 71, `boq_charts.html` 753/1160-1176, `mep_report.html` 274-284).
**Not swapped, with the reason (the witness lists these; an unlisted site fails it):** presence tests and load plumbing (a count only compared to 0 or used to pick the largest building or a cache key: `streaming.js` 327/3848-3866/4087, `tools.js` 27/2175, `helpers.js` 253, `main.js` 1059, `scene.js` 1218, `tour.js` 189, `nf_highlight_cost.js` 304, `nf_tree_lens.js`, `fx_props_staffage.js`, `cpe_road_panels.js`, `wh_walk.js`, `doc_canvas.js`, `cpe_linear_beat.js`, `location_axis.js`, `boq_charts.html` 1144/1476/2233, `mep_report.html` 248) · geometry the user still sees (clash discipline counts `measure.js` 246/310/313/1743, `clash_matrix.js`, `clash_report.js`; reveal bands `cpe_storey_reveal.js`, `fx_cpe_reveal_bands.js`; `grid_overlay.js`; `tools.js` 112) · diagnostics (`wizard.js` 191/204, `rule_report.js` 472-476 on transforms). **For the owner, not changed:** `rule_report.js`'s sufficiency probes (they count the population the rule evaluators judge, and the evaluators judge every row; swapping only the denominator would split the two; today they count footings, columns, beams, doors, spaces, which no MEP walk adds) · the 4D schedule (`schedule_author.js`, `tm_lifecycle_api.js`) still schedules provisional devices; `egress_sanity.js` 143/145 counts provisional sprinklers as FP present; the node tool `mep_qto_populate.js` (offline `qto_cache`) counts them.
**Witness W-PROV-TOTALS (`viewer/tests/witness_prov_totals.js`), P7.** Fixture: a copy of a resident Viewer DB plus K added device rows (a copy of real rows with new guids in every guid table), K_T marked `Provisional=TRUE`, K_F marked `FALSE` (the FALSE rows must stay counted: the predicate tests the value, not the presence of the set), one class all provisional. P7a census: every `COUNT(`/`SUM(` on `elements_meta` in the files above is either a swap or in the reason list; an unlisted site FAILS. P7b node: `count()` is `COUNT(*)` on the resident (no table) and on the fixture with the switch on; the swapped SQL gives resident + K_F on the fixture. P7c real page on the fixture: HUD total, discipline counts, Find Type dropdown (the all-provisional class present with `(0)`), the `n found` line for that class, an NL count answer, print-sheet class counts, room/storey drill counts equal node truth without the K_T rows; the result list still shows the K_T rows labelled. RED: same page with `__vwCountProvisional=true` gives the K_T rows back in every total. P7d: the resident DB on the page gives the same totals as main's code (the swap returned `COUNT(*)`, `ProvTotals.sites` empty). Nothing provisional in the fixture = INCONCLUSIVE.
**§11 P7 RESULT 2026-11-08 (W-PROV-TOTALS 15 of 15, `viewer/tests/witness_prov_totals.js`, real Viewer page, software GL).** Fixture: public Duplex Viewer DB (1,193 rows) + 10 IfcAirTerminal all provisional + 20 IfcFlowTerminal provisional + 5 flagged FALSE, in every guid table, flag rows in the exporter's shape. HUD total 1,198 (raw 1,228), ACMV 0, ELEC 86; Find accordion `Air Terminal (0)`, `Flow Terminal (110)`; that class's result line `0 found` with 10 rows listed, all labelled `· provisional`; identify `IfcAirTerminal · provisional`; NL "how many electrical elements" 86. RED (`__vwCountProvisional=true`): 1,228, ACMV 10, Air Terminal 10, NL 106, no labels. Resident Duplex untouched: 1,193, no site swapped, `§PROV-TOTALS provisional=0 totals unchanged`. Census: 74 swaps in 17 files, every other count line listed with its reason; the same census on `c5ddd579` fails (18 files). Judged on the page: HUD, Find dropdown/accordion, result line, labels, identify, NL; the other swap sites are proven by the census and the same helper, not each driven on the page. Regression, branch = main: find_ask_answers 23/1, exact_lookup p2 3/0, p4 5/0, json_4d5d 5/0, hud_layout 1/0; find_close_no_leak, find_panel_hidden_onload crash and find_row_clipped fails on both. Viewer sw v1699. Not run on a Modeller-exported DB in this run; the shape is the one P4e wrote.

## §12 Borrowed bands on another building's floors: re-anchor + host (owner 2026-11-09, *"Re-anchor + host"*). SPEC, written before the code
**Issue, measured** (walk report card, private Revit-exported set, sprinklers on, FP borrowed from `terminal_rules.db` per WalkerDoctrine §2):
- Every band row keeps the SOURCE building's storey (`storey_scope`, e.g. `Aras 02`) and its absolute z-band.
- The only height correction is §NOSPACES `zOff`: one translation, the median class-height difference (§DW-DATUM). Between two different buildings it is not ground to ground.
- Box test on the walked set: of 1,772 band sprinkler heads, 939 sit more than 3 m above the highest slab/roof top at their plan point, 365 are outside every slab/roof box, and 263 are within the stack. ACMV band: 308 of 392 floating.
**Rule (owner's choice of three):**
1. **Source floors are data.** The patch `modeller/patches/terminal_rules.db.sql` (self-heal, applied on every load; no binary change) adds `rule_storey_floor(storey TEXT PRIMARY KEY, floor_z REAL, provenance TEXT)`. `floor_z` is in the BAND frame: the lowest `IfcSlab` top (`center_z + bbox_z/2`) of that storey in `buildings/Terminal_extracted.db`, minus `rules_meta.z_datum_offset`. Mined by `modeller/tools/mine_storey_floor.js`; every row states its provenance.
2. **When it applies:** a band row whose scope's base storey (text before ` (`) is NOT a storey of the walked building, and whose rules DB has `rule_storey_floor`. Otherwise today's path, unchanged: Terminal on its own rules must stay byte-identical.
3. **Same-order mapping.**
   - Source ladder: the `rule_storey_floor` rows, sorted by `floor_z`.
   - Target ladder: this building's `storey_elevation` rows, grouped where neighbours are closer than HALF the source's smallest floor-to-floor height (data-derived, logged). Each group's floor is its lowest stated elevation.
   - Ground on both sides: the source's lowest floor, and the target group nearest elevation 0.000 (the project datum).
   - Source storey k above ground maps to target group k above ground. A source storey with no target group of that order maps to nothing.
4. **Re-anchored band:** `z_lo/z_hi = target floor + (band − source floor)`, and `zOff` is not applied to that row.
   - A multi-storey scope (`/` or `+` in the base name) has no single floor, so it is not placed.
   - Not placed rows are counted, never silent.
5. **Host (amends §10 rule 2 for this case only):** a re-anchored placement is placed only when `hostBind` binds it to a host of this building. A re-anchored device with no host is REFUSED, not `unhosted`: the owner's words, *"place a head only where this building has a ceiling or slab there"*. Every other band row keeps §10. Accounting per class stays exact: input = bound + unhosted + not judged + refused; a new sub-count `reanchorNoHost` sits inside refused.
6. **§11 still holds:** a re-anchored device is provisional, bound or not.
**Logs:** `§BAND-REANCHOR disc= rulesDb= sourceFloors=[name:z…] targetGroups=[z0..z1:names…] tol= map={src→target|none}`; per row `§BAND-REANCHOR-ROW scope= from=[lo,hi] to=[lo,hi]|none reason=`; `§DW-RULES-PATCH file= rows= ok|none|error`; `§WALK-BAND-NOHOST … reanchorNoHost=<n>`.
**Witness W-BAND-REANCHOR (`modeller/tests/witness_band_reanchor.js`, public data):**
- **R1:** the patch applies, and `rule_storey_floor` equals a fresh mine of `buildings/Terminal_extracted.db` (per-row floor equality). RED: no patch → no table → re-anchor off, logged.
- **R2:** Terminal walking its own rules → placements byte-identical to main (names match; the rule does not fire).
- **R3:** a hand-built two-storey building (floors 0 and 3.5 m) borrowing FP from terminal_rules.
  - Every re-anchored band sits at `target floor + (band − source floor)`, to 1e-6.
  - Multi-storey scopes are not placed.
  - Source storeys beyond the target's 2 groups map to none.
  - RED: rule off → today's absolute bands.
- **R4:** re-anchored and unhosted → refused, counted in `reanchorNoHost`; a non-re-anchored `IfcCovering` row stays `unhosted` (§10 unchanged).
- **R5:** accounting per class: input = bound + unhosted + notJudged + refused.
- Fleet: W-BAND-NO-HOST, W-BORROW-FP, W-TERM-NOSPACES before/after. Then the private walk report run: counts floating/outside/inside before → after (numbers kept out of this file).
**§12 RESULT (2026-11-09).** Logs read (session scratchpad `ra/`).
- **W-BAND-REANCHOR 9/0:**
  - R1: the patch equals a fresh mine (7 rows).
  - R3a: 71 re-anchored devices at target floor + (band − source floor), worst 8.9e-16.
  - R3b: 1 multi-storey scope not placed, 5 storeys past the target's levels map to none.
  - R3c RED: patch off → `off reason=no-source-floors`, nothing re-anchored.
  - R4a: re-anchored + no host → refused, `reanchorNoHost=4`, 0 unhosted. R4b: the same devices without the mark keep §10 (3 unhosted kept, 1 wall-hosted refused as before).
  - R4c: 67 bound devices take their host's storey. R5: accounting exact both ways.
  - R2: Terminal on its own rules gives 1,091 FP placements, byte-identical with and without the patch (`off reason=own-storeys`).
- **Private set (node harness, FP, sprinklers on), before → after:**
  - Band heads 1,880 (939 more than 3 m above any slab/roof box, 365 outside every box, 371 inside) → 96, all inside.
  - Bound devices 204, each named by its host's storey: 5 distinct storeys of this building, none borrowed. `reanchorNoHost=1812`.
  - ACMV: the multi-storey "typical upper floors" rows are not placed; the one re-anchored lobby row found no host, so 0 band ACMV terminals.
- **Public residents unchanged:** the FP walk on Duplex, SampleHouse, SampleCastle, Clinic, HHS, Garage, Hospital and Terminal ARC DBs gives identical totals with and without the patch. They state no `storey_elevation`, so the rule logs `off reason=no-target-elevations` (Terminal: `own-storeys`). **Limit, stated:** the rule fires only where the building states its storey elevations; every IFC opened through the Modeller does (`extract_ifc2db.js`), the shipped ARC residents do not.
- **Regression, base `267fd980` vs fix:**
  - W-WALK-MAINS 6/0 = 6/0.
  - W-BAND-NO-HOST 43/1 = 43/1 (P3 fails on main too).
  - W-DRAWN-WALK 87/0 → 86/1 → 87/0. The one change is X2 RED's pinned Duplex count, 51 → 10: §12 re-anchors that fixture's Terminal-borrowed heads (its IFC states storey elevations). The pin now reads 10, and `DW_NO_RULES_PATCH=1` gives back 51; both runs 87/0.
- Modeller sw v258 precaches the patch. ESLint clean.
- **Not done:** the IFC export abort with sprinklers on (web-ifc `CloseModel`, measured in the walk report); a re-walk + re-shoot of the private report on merged main.

## §12a — a re-anchor target level must hold a floor slab (owner 2026-11-09: "Contains a slab")
**Issue (measured on a private set, generic numbers; bim-compiler `MODELLER_MASTER.md` §REANCHOR-NONFLOOR):** `_reanchorCtx` groups EVERY declared storey elevation into target levels. A building that declares reference levels (top of wall, top of parapet, top of a tall element) gets them counted as floors: 7 groups, of which 3 hold no IfcSlab. The source's floors map by order, so floors 4, 5 and the roof landed on those three, and wall-hosted band alarms bound to the tall walls there (13 of 70 sat more than 3 m above every slab/roof top at their spot).
**Rule (owner's choice of three candidates, data-only, no number):** a target group counts as a floor only if at least one of its storey names CONTAINS an `IfcSlab` (`elements_meta.storey`, the IFC's own containment). Groups without one are dropped before the ground group and the order mapping are taken, and logged `notFloor=[z..z:names]`. A source floor with no target at its order is refused, counted `noTarget` (§12's existing path), never floated.
- Unchanged: the rule fires only when the building states storey elevations and rows name foreign storeys (public residents state none, Terminal on its own rules is byte-identical, §12 R2).
- Private set, predicted from the containment counts: targets ground, ~4-4.8 m, ~9-9.3 m; source floors 4, 5 and roof → `noTarget`.
**Witness W-BAND-REANCHOR R6:** the two-level fixture plus a declared reference level above it that contains walls but no slab: the reference level is logged `notFloor`, the third source floor maps to none (RED control: the same fixture on the pre-§12a rule maps it to the reference level); a level that DOES contain a slab stays a target (R3 unchanged).
