<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# DiscWalker fixtures render twice simultaneously — found 2026-07-13, unfiled

```
# ⚠ DO NOT REMOVE
STATUS: NOT YET INVESTIGATED — found as a side-effect of XRAY_FIXTURE_CLASSIFICATION_FIX.md's witness work,
explicitly NOT part of that spec's scope. This file exists so the finding isn't lost, not to prescribe a fix.
Confirmed PRE-EXISTING on unmodified origin/main (not caused by the X-ray fix). Read the log after any run.
```

## §GIVEN — measured, do not re-derive

- **G1 — the observation:** after a real `discWalk('ELEC', {building:'Duplex'})`, `window.Bonsai.group()`
  contains, simultaneously: (a) 102 individual top-level `Mesh` objects (featureId 197-298, one per
  placement — the standard op-log fold path, same mechanism every ARC element uses) **and** (b) a `dwRoot`
  marker group holding 6 `InstancedMesh` buckets covering the SAME 102 placements (DiscWalker's own
  specialized renderer, `modeller.html` `_mesh()` at ~line 3684-3697, batched for draw-call perf).
- **G2 — both are live, not one a hidden fallback:** direct check (`mesh.visible`) on the 102 individual
  meshes returned `visible: true` for every sampled one, `hasParent: true`. No `.visible = false` call was
  found near the disc-walk commit/render path (`_redrawAllDiscWalks`, `_commitDiscWalk`) that would suppress
  the individual copies once the InstancedMesh batch exists. Grepped `.visible = false` sites in
  `modeller.html` — none target disc-walked fixture meshes specifically.
  Same result on SampleCastle (325 individual meshes, featureId 3226-3550, alongside 4 InstancedMesh
  buckets in `dwRoot`).
- **G3 — positions likely coincide:** both renderings source from the same placement records
  (`params.placement.x/y/z` for the individual fold; `sub[i].x/y/z` for the instance matrix, same `sub`
  array), so the two representations are very likely drawn at the identical world position, not just
  double-counted in some inert sense.
- **G4 — not caused by the X-ray fix:** reproduced with `git stash` back to unmodified `origin/main` HEAD
  before writing this file — the double structure was already present.

## What's NOT yet known (don't assume, verify first if picked up)

- Whether this is visually noticeable in NORMAL (non-X-ray) viewing — z-fighting, doubled blend on any
  transparent fixture, or genuinely invisible because the two meshes are pixel-identical and just cost an
  extra (unnecessary) draw call. Not measured — no pixel/visual check was done, only scene-graph state.
- Whether the individual top-level copies are ever explicitly used for anything (undo granularity,
  individual pick/select fallback) that would make them intentional, or whether they're simply an oversight
  where `_redrawAllDiscWalks()`'s InstancedMesh batch was meant to replace them and a hide/remove step is
  missing.
- Cost impact: for SampleCastle's 325-fixture ELEC walk, this is 325 extra individual draw calls/meshes
  alongside the 4 batched ones — worth checking against any existing perf witness (`§DW-PRIM`/`§BONSAI
  chain` timing lines already log solids/tris counts that would show the inflation).

## G5 — root cause of the individual fold-copies' geometry, found chasing a guide screenshot (2026-07-13)

Not just duplicated — a subset of the individual fold-copies (G1) render at the WRONG SIZE, and it's a
known, already-named bug that isn't fixed for this code path. Measured on SampleCastle's ELEC walk: sampled
6 of the largest individual fold-copy meshes (by volume), ALL were `h=4.0m, w=0.45-0.8m, d=0.45-0.8m` — a
building-scale box, not a fixture. Their source op's `parameters` carry NEITHER `bbox` NOR `realGeomHash`
(both `undefined`) — meaning they fell through DiscWalker's commit branch that has NO measured geometry
(`modeller.html` ~3948-3958: `var hash = found ? found.hash : (cat[0] ? cat[0].hash : null)`), which a
standing code comment at ~3933-3934 explicitly names as the bug already fixed elsewhere: *"NEVER the old
cat[0] fallback, which folded every unmatched fixture as the catalog's first item — a full-height Column per
outlet (the op-log half of 'geometry hell'...)"*. The LIVE InstancedMesh render path (`dwRoot` buckets,
`_dwPrimGeo`) correctly uses measured/matched geometry for these same placements (confirmed via
`§DW-PRIM-LOD lod400=0 lod300=0 lod200=325` — honest measured boxes, right-sized). So the fix that comment
describes was applied to the LIVE render path but NOT to the generic op-log fold path that also builds an
individual copy of every `GEOM_INSERT` — the two renderers disagree on geometry for the exact same op.
This is very likely the actual driver of "why X-ray still looks like tall spikes post-fix" on SampleCastle
(not primarily alpha-accumulation as first guessed) — with `depthTest:false, renderOrder:999` (X-ray's glow
treatment), an oversized wrong-fallback fixture box renders on top of everything else, unoccluded, exactly
like the original wall-spike symptom looked. Worth checking whether this also produces visible artifacts in
NORMAL (non-X-ray) viewing, where these same oversized boxes would still be present (just occluded by
normal depth-testing, so probably hidden behind real structure most of the time — X-ray is what makes them
impossible to miss).

## Related, separate visual observation (not this file's subject, noted so it isn't lost either)

Post-fix (`XRAY_FIXTURE_CLASSIFICATION_FIX.md`), the classifier is verified numerically correct down to
individual material properties (checked the 8 tallest meshes in SampleCastle's scene directly post-`xrayReveal
(true)`: all `opacity=0.06, color=0xaabbcc, depthTest=true` — glass, none misclassified). But the guide
screenshot (`W-XRAY-SampleCastle-on.png`) still reads visually dense/pale rather than dramatically ghosted.
Root cause is almost certainly alpha-accumulation, not misclassification: SampleCastle has ~3225 structural
elements, many overlapping along a given view ray (stacked floors' walls, interior partitions), and layering
N surfaces each at 6% opacity compounds to `1 - (0.94)^N` — at N≈20-30 that's 70-85% cumulative, visually
close to solid even though every individual wall is correctly transparent. Possible follow-up (not scoped
here): lower glass opacity further for dense buildings, or a depth-peeling/other technique — orthogonal to
the classification fix itself.

## Where this was found

`prompts/Modeller/DISC_Walker/XRAY_FIXTURE_CLASSIFICATION_FIX.md` — building `witness_xray_sc_duplex.js`'s
in-scene assertion (assumed every non-`dwRoot` top-level mesh was pure ARC structure) tripped on these 325/
102 "extra" meshes, which turned out to be legitimate individual fold-copies of DW fixtures, not misclassified
structure. That witness's final assertion was adjusted to account for G1-G3 rather than treat this as a
regression — see that spec's `# DONE` section for the resolution on the X-ray side specifically.
