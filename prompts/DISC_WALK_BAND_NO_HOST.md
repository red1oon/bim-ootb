# ⚠ DO NOT REMOVE
SCOPE: what the disc walker does with a band device that has no host, for ANY building. Read the log after every run; exit code is not evidence. Public repo: no client or project names; a real test set is "a private Revit-exported set".
Owner (2026-11-07): "we are abstracting a rules engine not custom to any particular design." On this rule: "go with your advice, write the spec".
Status: SPEC ONLY, nothing built. Design lane wrote it; the Modeller lane executes it. Start after `prompts/IMPORT_KEEPS_IFCSPACE.md` merges.

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

## §8 Then, design lane
The design lane runs the private set on the merged code and compares placed and bound with the 269 drawn, by room, using its existing assignment. A count near 269 alone proves nothing; it reports positions as well. Report on this lane as: a rules engine, not custom to any design.

## §9 Not in this change
- Where a main's shape comes from: open question to the owner.
- Device counts for large rooms, and the missing schedule rows.
- Ceiling heights read from drawings. That could later give real hosts to devices this rule refuses, and the refused counts show where it would help most.
