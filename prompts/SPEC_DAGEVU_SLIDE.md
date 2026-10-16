# SPEC — DAGeVu Slide: along-host opening drag as the engine's second consumer — Witness: W-DAGEVU-SLIDE

```
# ⚠ DO NOT REMOVE
SCOPE: (1) add a `constrain()` contract to `HostFillEdge` in modeller/dagevu_engine.js — the 1-DOF along-host
projection + bounds for a FILLING-driven drag; (2) finish the along-host opening-slide draft in
modeller/bonsai_itemdrag.js (worktree agent-a8b5dc9ca46ba4e72, 256 lines, never run) by making it CALL the engine
for its constraint instead of owning the math; (3) feed the engine's dimLabel into the item-drag pointermove
(the §V7 readout the item drag never had). Out of scope: a void-translate op for a baked GEOM_CUT (refused, as
the draft already does); roof/AngleEdge (⛔ paused). Read the log after every witness run.
```

Parents: `prompts/SPEC_DAGEVU_ENGINE.md` (the engine), `bim-compiler/prompts/Modeller/ROOM_MOVE_AND_ITEM_DRAG_SPEC.md`
§3.1 ("its motion is constrained along its real host wall (Q5 scopes v1)"), §3.3 (snappedPos only as a derivation
from the real host, never a nudge that converts an invalid drop into a valid one), §5 Q5 (along-host slide in/out of v1
— resolved IN by the draft, kept). Session 2026-09-10.

## §1 Why this is an engine task
`DagevuEngine` shipped with one consumer (the grid drag). "Reusable" is unproven until a second constrained drag
routes through the SAME `HostFillEdge` and the SAME readout path. The slide is that consumer: filling-driven, host
as the constraint — the inverse direction of `propagate()` — using the same measured AABBs, the same real
`rel_fills_host` row and the same 0.05 m tolerance.

## §2 Contract added to the engine
```
HostFillEdge { …, openingGuid, openingFid }          // the row's opening_guid, resolved through the bridge (null if unseeded)
  constrain(candidateDelta[3], { boxByFid }) → { delta[3], axis:'x'|'y', t, tMin, tMax, gapLo, gapHi, dimLabel } | null
DagevuEngine.edgeFor(fillingFid) → HostFillEdge | null (first host that resolves — stretchRide's "first host wins")
DagevuEngine.constrainSlide(fillingFid, candidateDelta, boxByFid) → constrain() result + { edge } | null
```
- axis = the host AABB's LONG plan axis (thin axis = x when ex ≤ ey, resolveHost's own wall rule; slide along the other).
- body = filling AABB ∪ seeded opening AABB (when `openingFid` resolves and has a box) — the void moves with the door.
- `t` = candidateDelta[axis]; orthogonal and z components are DROPPED (held at pre-drag values: the filling↔host
  face offset stays invariant, exactly as stretchRide holds it). `delta` = t on axis, 0 elsewhere.
- bounds are delta-honest: `tMin = −max(0, body.lo − host.lo) − TOL`, `tMax = max(0, host.hi − body.hi) + TOL`.
  An as-extracted overhang can slide back in but never further out, and is never "fixed". t ∉ [tMin,tMax] ⇒
  **null**, `edge.refusal = { kind:'slide-off-host', fillingFid, hostFid, axis, t, tMin, tMax }`. No clamp: a clamp
  would be the §3.3-forbidden nudge.
- `gapLo/gapHi` = post-slide clearances to the wall ends; `dimLabel` = `#f along #h x +0.35m · 0.12|1.80m to ends`.

## §3 The draft, kept vs moved
Kept in `bonsai_itemdrag.js` (all sourced from real functions, verified live: `GridKinematics._isObliqueYaw/_hasTilt`
exported; `Bonsai._insertCutBox` at bonsai_kernel.js:190; `oplog._geomOps`; `window.__gateRel`, `__arcAnchorFids`):
S1 routing + refusals (non-WALL host, oblique/tilted host, non-plain host body, baked GEOM_CUT void tied to the
filling, gate unavailable), S3 per-frame `SdgGate.evaluate` (RED blocks, ORANGE reports), S4 op shape (GEOM_MOVE +
one induced `fills-opening` rider per seeded opening, one gesture group), S5 not built.
MOVED to the engine: S2 axis / bounds / projection — `beginSlideSession` probes `edge.constrain([0,0,0])` for
axis+bounds; `canSlideTo` calls `edge.constrain(candidate − preCentre)` and refuses on null. Nothing computed twice.
NEW: the engine is a hard dependency of the slide (missing ⇒ the slide REFUSES; the free-drag path is untouched).

## §4 Readout (ask 2 of the parent brief)
`modeller.html` item-drag pointermove calls `dimLabelShow(v.dimLabel, hit)` when the frame is valid and the verdict
carries a label, `dimLabelHide()` otherwise and on exit. Status line prints the same string (§V7 single-math-path rule).

## §5 Tests — each names the issue it proves
`witness_dagevu_engine.js` (extend, node, real SampleHouse):
- D10 CONSTRAIN-PROJECT — orthogonal + z dropped, t exact, axis = host long axis (proves: 1-DOF, face offset invariant).
- D11 CONSTRAIN-BOUNDS — t beyond either end ⇒ null + refusal; t = tMax exactly ⇒ ok; a body already overhanging
  has tMax = TOL on that side (proves: honest refusal, no clamp, delta-honest).
- D12 CONSTRAIN-OPENING — a wider constructed opening box tightens the bounds vs filling-only (proves: the void
  travels with the door and bounds the slide).
`witness_opening_slide.js` (new, node, real SampleHouse, resolver stub that THROWS if consulted):
- S0 substrate; S1 SESSION — a real filling gets a slide session carrying the engine edge, resolver never called;
  S2 IN-BOUNDS — valid, snappedPos holds orthogonal+z, dimLabel present; S3 OFF-HOST — beyond the end ⇒ valid:false
  'off-host-extent', no snappedPos; S4 OP — GEOM_MOVE parent=filling with the constrained delta, rider iff a seeded
  opening resolves; S5 GATE-RED — a constructed blocker box on the slide path ⇒ valid:false 'gate-red:clash';
  S6 BAKED-VOID — a GEOM_CUT parent=host over the filling ⇒ session null; S7 NO-ENGINE — ctx.dagevu=false ⇒ refused.
`witness_e2e_opening_slide.js` (new, e2e, SampleHouse): real arm + real mouse drag along the host of a discovered
filling; mid-drag `window.__dimLabel` shows the engine label; commit = GEOM_MOVE (+rider) with the door's centre
shifted on the axis only; orthogonal unchanged to 1e-6; undo restores; gate no new RED.
Regression guard: witness_item_drag_gate (node), witness_e2e_itemdrag_ui, witness_dagevu_engine D1-D9, e2e stretch_ride.

## §6 Status
- [x] engine constrain (D10-D12, witness_dagevu_engine 13/13) · [x] itemdrag refactor · [x] readout
- [x] witness_opening_slide (node) 9/9 · [x] witness_e2e_opening_slide 8/8 — O0 proves 7/7 real SampleHouse fillings REFUSE
  (real LOD-300 wall meshes carry baked holes; Bonsai._insertCutBox says not a plain box); O1-O6 prove the sketched
  rectangular-wall path (the tool's primary use case) end to end with the §V7 readout
- [x] guard: witness_item_drag_gate 9/9 · witness_e2e_itemdrag_ui 8/8 · witness_e2e_stretch_ride 11/11
- Recon finding folded into §3: the draft's `_plainBoxOf` returned false for every non-GEOM_INSERT body, which would
  have refused sketched walls too (a permanently dead feature); fixed to accept a 4-point axis-aligned extrude
  (`plainExtrudeProfile`, S8) and an UNRECORDED host class (gridmove's own sketched-content rule).
- [x] PR opened 2026-09-10 (stacked on feat/dagevu-engine)
