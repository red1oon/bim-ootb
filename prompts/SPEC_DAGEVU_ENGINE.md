# SPEC — DAGeVu Engine (`modeller/dagevu_engine.js`) — Witness: W-DAGEVU-ENGINE

```
# ⚠ DO NOT REMOVE
SCOPE: modeller/dagevu_engine.js — an ES6 class-based "relationship edge" engine that generalizes the proven
rel_fills_host stretch-ride (sdg_cascade.js) into a named, reusable contract, and wires it into the grid drag
(bonsai_gridmove.js + modeller.html) with (1) ANCHOR as the new default for hosted openings under a host
LENGTH change, RIDE demoted to an explicit per-element opt-in via the existing ctrl+click toggle, and
(2) the engine's dimension label fed into the existing §V7 dimLabelShow()/setStat() readout.
OUT OF SCOPE: AngleEdge / roof pitch (⛔ PAUSED — no measured roof-slope data exists; user 2026-09-10).
Read the log after every witness run — exit code alone is not evidence.
```

Parent: `prompts/RESUME_MODELLER_DAGEVU_ENGINE.md` (branch `docs/resume-dagevu-engine`). Session 2026-09-10.

## §1 Reuse contract (nothing below is reimplemented)

| Existing, proven | Reused as |
|---|---|
| `sdg_cascade.js stretchRide()` (W-STRETCH-RIDE 9/9) | the whole of `HostFillEdge` mode `'ride'`, and the TRANSLATE part of mode `'anchor'` |
| `sdg_gate.js evaluate()` abuts-realign `proposedDelta` (A8/A8b/A8c) | the whole of `AbutsEdge.propagate()` |
| `sdg_gate.js` door-crush fit rule (`fitBefore && !fitAfter`, tol 0.05 m, per changed axis) | the anchor refusal oracle — so a preview refusal is exactly what the post-commit gate would flag RED |
| `bonsai_library.js foldInsert` grid-command mapping (`TRANSLATE: x+=d`; `SCALE: x' = f·x + m·(1−f) + t`) | `RelationEdge.foldBox()` — the pure AABB image of a command list (needed for the anchor fit test, the host length readout, and the AbutsEdge after-state) |
| `bonsai_gridmove.js` ctrl+click green/orange toggle (W-E2E-GRID-GREENORANGE 12/12) | the ride opt-in: ctrl+click on a FILLING toggles anchor↔ride; on anything else it stays the exclude toggle |
| `modeller.html dimLabelShow()/setStat()` (§V7) | the readout — the engine returns ONE `dimLabel` string; both UI calls print it (single math path) |

Recon correction (2026-09-10): the resume doc says grid-move shows no live readout. modeller.html line ~2004
already calls `dimLabelShow(gridId + ' Δ…m', hit)` on every grid pointermove. The gap is that the readout carries
only the grid delta, not what the constrained geometry does; the engine's `dimLabel` fills that gap.

## §2 Classes

```
RelationEdge { kind, a (driving fid), b (dependent fid) }
  propagate(drivingDelta, realGeometry) → { dependentDeltas:[{featureId,dx,dy,dz}], dimLabel } | null   (abstract)
  static foldBox(aabb, commands) → aabb'      (pure; the fold's own mapping, see §1)
HostFillEdge extends RelationEdge { hostFid, fillingFid, hostGuid, fillingGuid, provenance, mode:'anchor'|'ride' }
  propagate(hostCommands, { boxByFid, guidByFid, fidByGuid })
AbutsEdge extends RelationEdge { a, b }
  propagate({ before, after, moved }) → { dependentDeltas:[{featureId:nb, …, proposed:true}], dimLabel } | null
DagevuEngine { edges, modes }
  constructor({ guidByFid, fidByGuid, fills, abuts, cascade, gate, rideFids })
  isFilling(fid) · modeOf(fid) · setMode(fid, mode) · toggleMode(fid) → mode · reset()
  propagateCommands(commands, boxByFid) → { commands, riders, held, refusals, proposals, dimLabel }
```

Edges are built ONLY from real rows: one `HostFillEdge` per `rel_fills_host` row whose host AND filling resolve
through the §ARC-1 bridge; one `AbutsEdge` per `swXEdges.abuts` row likewise. Unresolvable rows produce no edge.
Dual export (window.DagevuEngine + module.exports) like sdg_cascade.js so the value witness runs pure-node.

## §3 Semantics

**mode `'ride'`** — delegates to `stretchRide(hostCommands, …, [this row], boxByFid)`; output identical to today.

**mode `'anchor'` (DEFAULT)** — the opening's world position is invariant under a host LENGTH change:
- TRANSLATE commands on the host still carry the filling rigidly (a wall whose whole body moves cannot leave its
  door in the air; that is a geometric impossibility, not a mode). Computed by delegating the TRANSLATE subset to
  `stretchRide` (same math, one place).
- SCALE commands on the host induce ZERO filling delta. The filling's own engine command is STRIPPED exactly as
  in ride mode (a filling is never scaled by the grid).
- Free-end check (grid-driven context): the growing/shrinking end is dictated by the dragged gridline, not chosen
  by the engine; the engine VERIFIES that end is free of the opening. On every SCALE axis k, with host' =
  `foldBox(hostBox, hostCommands)` and filling' = fillingBox + translate part:
  `fitBefore = filling ⊂ host ± 0.05` and `fitAfter = filling' ⊂ host' ± 0.05`; `fitBefore && !fitAfter` ⇒
  **REFUSE**: `propagate()` returns `null` and `edge.refusal = { kind:'anchor-no-free-end', hostFid, fillingFid,
  axis, hostAfter:[min,max], filling:[min,max] }`. A refused pair's commands are left untouched (the caller must
  not commit); nothing is fabricated. A filling that never fit on that axis (real casing overhang) is delta-honest:
  not refused (same doctrine as the gate).
- Multiple openings on one host: each is held and checked independently; any refusal refuses the host.

**AbutsEdge** — reports the gate's own `proposedDelta` for a neighbour pulled away during THIS edit. REPORTS ONLY;
applying it stays an accept-gated future op (SDG_BACKPROP_ABUTS_REALIGN.md). Engine collects them as `proposals`.

**dimLabel** — one string built from measured numbers only: grid `Δ±x.xxm`, the first SCALE host's extent
`w→w'` (w' = f·w from the real pre-box), then `· n held` / `· n ride` / `· REFUSED #f`.

## §4 Wiring (bonsai_gridmove.js / modeller.html)

- `previewCommands()` calls `engine.propagateCommands()` instead of `stretchRide` directly. If
  `window.DagevuEngine` failed to load, the old `stretchRide` path runs byte-identically (LOAD_FAIL never breaks
  the drag). Result gains `held`, `refusals`, `proposals`, `dimLabel`.
- `toggleOverride(fid)`: filling ⇒ `engine.toggleMode(fid)` (returns `true` when now anchored/held = green, `false`
  when now riding = moves); non-filling ⇒ unchanged exclude toggle. `resetOverrides()` clears both.
- `commit()`: `refusals.length` ⇒ throw `Error('§DAGEVU refused: …')` — modeller.html's existing catch prints
  `FAIL …` in the status bar and leaves the drag armed so the user can shorten the drag or ctrl+click the opening.
- `gmTint(commands, riders, excluded, { held, refusals })`: held ⇒ GM_GREEN; refused host+filling ⇒ GM_RED (new
  constant, 0xc81e1e). Ride opt-in fillings appear in `riders` ⇒ blue, as today.
- pointermove + ctrl+click recompute: `setStat` and `dimLabelShow` both print `preview.dimLabel`.

## §5 Tests — each names the issue it proves

**`modeller/tests/witness_dagevu_engine.js` (pure node, REAL SampleHouse substrate as witness_stretch_ride.js):**
- D1 CONTRACT — base `propagate` throws; subclasses are `instanceof RelationEdge`; edge count == resolvable real
  rows (proves: OOP contract exists and is non-invent).
- D2 RIDE-WRAP — mode ride output === `stretchRide` output for the same host SCALE (proves: wrap, not a fork).
- D3 ANCHOR-GROW — default mode, host SCALE grow ⇒ filling delta 0, own command stripped, in `held`, no refusal;
  `dimLabel` carries w→f·w (proves: the new default holds the opening and reports the real length).
- D4 ANCHOR-TRANSLATE — host TRANSLATE d ⇒ anchored filling rides by exactly d (proves: anchor governs length
  change only; a translated wall still carries its door).
- D5 ANCHOR-REFUSE — host SCALE shrink crossing the filling ⇒ `null`, refusal {fids, axis}, commands untouched,
  and `SdgGate.evaluate` on the same before/after boxes reports door-crush for the same pair (proves: honest
  refusal, and the preview oracle equals the post-commit gate oracle).
- D6 MULTI — host=3's two real rows: both held; door=13 (never fit) is not refused on a shrink that door=7 survives
  (proves: per-filling independence + delta-honesty on real data).
- D7 TOGGLE — default anchor; toggle→ride→anchor; reset restores anchor (proves: opt-in is explicit and session-scoped).
- D8 ABUTS-WRAP — real wall + constructed flush neighbour (A8 precedent): `AbutsEdge.propagate` proposal equals the
  gate's abuts-realign `proposedDelta`; the engine's `commands` are unchanged by it (proves: wrap; report-only).
- D9 ROSETTA — anchor: stretch then exact inverse ⇒ host extent restored within 1e-9, filling centre untouched
  throughout (proves: invertible, no drift).

**Existing witnesses — stale expectation (UPDATE) vs real regression (do not paper over):**
| Witness | Assertion | Verdict |
|---|---|---|
| witness_e2e_stretch_ride E2b, E3a | rider centre MOVED; one induced GEOM_MOVE | STALE → held: centre unchanged, zero induced; add E5: ctrl-toggle ride ⇒ old behaviour |
| witness_e2e_stretch_ride E1 | discovery picks any SCALE pair | STALE → must pick a pair the engine does not refuse (shrink candidates can refuse) |
| witness_e2e_grid_greenorange H1, H2 | door BLUE mid-drag; oplog +2 with one induced | STALE → door GREEN (held), oplog +1; add H3: ctrl+click door ⇒ BLUE + one induced (opt-in) |
| witness_e2e_gridmove_real G7 | real Duplex door rode (DY=+0.5 grow) | STALE → door held, no rider row for it |
| witness_stretch_ride, witness_sdg_cascade, witness_e2e_gridstretch, witness_e2e_void_anchor V3a, witness_sdg_gate | call stretchRide/gate directly or have no opening | UNAFFECTED — must stay green (regression guard) |

## §6 Status
- [x] engine · [x] wiring · [x] W-DAGEVU-ENGINE 10/10 · [x] e2e updates (stretch_ride 11/11, greenorange 13/13, gridmove_real 8/8)
- [x] regression guard: witness_stretch_ride 9/9, witness_sdg_cascade 7/7, witness_sdg_gate 11/11, witness_e2e_gridstretch 7/7
- [ ] witness_e2e_void_anchor: 18/19 — G6 (§XEDGE-ALL derived counts) fails IDENTICALLY on untouched main; pre-existing, not this change
- [x] PR opened 2026-09-10
