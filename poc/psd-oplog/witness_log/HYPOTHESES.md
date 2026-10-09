# Hypothesis ledger (append-only; newest at the bottom)

Format: ID | hypothesis | test (command) | numbers | verdict | consequence

| ID | Hypothesis | Test | Numbers | Verdict | Consequence |
|---|---|---|---|---|---|
| H01 | 8-bit Canvas2D is adequate as a working format | `exp_precision_blend_speed.js` (x0.25 then x4 on a 256-level ramp) | Canvas2D 64/256 levels kept; RGBA16F 256, RGBA32F 256 | REFUTED | float16/32 working format |
| H02 | Browser Canvas2D compositing is a usable oracle | same + `run_stack.js` on a real GPU | software: max 3, mean 0.31; RTX 4060 Chrome: max 6, mean 0.8-0.9, 20-25% samples >1 level | REFUTED for canonical use | oracle = independent float64 spec compositor |
| H03 | A GPU fold is bit-identical to the CPU fold | `gpu_check.html` on RTX 4060 (Chrome, Firefox) | GL f32 max 1, mean 0.02-0.03; f16 mean 0.08-0.16; never >1 level | REFUTED (identical) / CONFIRMED (within 1 level) | GPU = preview only; canonical = CPU/WASM f32 |
| H04 | The CPU f32 fold is portable across JS engines | golden hashes, Node vs Chromium vs Firefox 157 | 3/3 scene hashes equal; 12/12 equal Chrome vs Firefox | CONFIRMED (x86-64, V8 + SpiderMonkey) | Safari/ARM still untested |
| H05 | 75% pixel mismatch in the psd-tools composite means our PSD is wrong | `check_psd_independent.py` | exactly 75% = 3 of 4 channels; cause: no merged image in the file; `composite(force=True)` | HARNESS BUG | read with force=True; later we also store a merged image |
| H06 | My half-remembered Display-P3 blue colorant (X=0.135) is Apple's value | white-point sum check | computed 0.1571 gives column sums = D50 (err 1e-16); 0.135 does not | REFUTED (my memory) | gate on the sum constraint, do not cite Apple from memory |
| H07 | lcms default flags are fine for 16-bit RGB->RGB | `icc/icc_core.js` 16-bit round trip | default 12.97 levels, HIGHRES 8.27, NOOPTIMIZE 0.039 | REFUTED | canonical path uses NOOPTIMIZE (10-14x slower) |
| H08 | An 8-bit sRGB->P3->sRGB round trip should be within 1 level | same | 4 levels, identical to the float64 oracle's own 8-bit round trip | REFUTED (expectation); inherent to 8-bit | keep working space float/16-bit |
| H09 | lcms-wasm (2.16) differs from native lcms (2.19) | `icc/check_native.py` | 5 cases, 0 levels, 100% identical bytes | REFUTED (identical) | WASM route trusted for witnesses |
| H10 | The compositing space is a minor detail | `icc/color_fold.js` | gamma vs linear dE2000 median 8.6 p95 17; working primaries dE median 1.2 p95 5.8 | REFUTED | `doc` op records `working` and `gamma` |
| H11 | ag-psd write+read agreeing proves the PSD semantics are right | `check_psd_independent.py`, `doc/check_psd_icc.py` (psd-tools) | modes, opacity, pixels, masks, ICC bytes identical in an independent parser | CONFIRMED (risk of self-consistency closed) | keep an independent reader in every PSD suite |
| H12 | Ignoring an embedded profile would be caught by the gate | negative control in `doc/run_doc.js` | P3 file 48 levels max (mean 2.6); Adobe 117 (mean 3.8) | CONFIRMED (gate is sensitive) | keep negative controls |
| H13 | Larger sRGB differences in wide-gamut PSDs come from lcms default optimisation inside psd-tools | `doc/check_export.py`, psd-tools conversion of the stored picture vs float64 oracle | psd-tools within 1 level (mean <= 0.011, 0% >2); the gap was two different pictures (float-layer merged vs recomposite of 8-bit layers) | REFUTED | gates compare the same picture; quantisation drift is reported separately |
| H14 | `srgb_mixed.psd` and `p3_mixed.psd` should look nearly identical (my instruction to the owner) | `app_results/red1-Vi-2026-10-10.md`: ImageMagick + psd-tools after profile conversion | dE2000 median 1.41, p95 4.91, max 13.3; the oracle gives the same | REFUTED (my expectation was wrong) | same layers in different working spaces are different composites by design (see H10); no human gate |
| H15 | Export `new Uint8Array(arrayBuffer)` not `Uint8Array.from(arrayBuffer)` | `doc/run_doc.js` | `from(ArrayBuffer)` gives an empty array | HARNESS BUG | fixed |

## Groups and clipping masks (logged BEFORE implementation; verdicts filled in by `doc/run_groups.js` results)
Semantics chosen (Photoshop-like): group = ordered children + own mode/opacity/mask. `pass-through` group: children blend directly with the backdrop, then the result is
lerped with the backdrop by opacity*mask. Any other group mode = isolated: children composite on a transparent buffer, then the group is blended like a layer. Clipping:
a clipped layer is composited source-atop onto its base layer (base's alpha is the shape); the base+clips unit is then blended with the BASE layer's mode/opacity/mask
("blend clipped layers as group" ON). Clip bases must be layers (not groups) in schema v2.

| ID | Hypothesis | Planned test | Threshold | Verdict |
|---|---|---|---|---|
| H16 | A pass-through group with opacity 1 and no mask equals the flat stack | grouped vs flattened composite, canonical f32 | bit-identical (hash equal) | (pending) |
| H17 | An isolated `normal` group with opacity 1 whose children are all `normal` equals pass-through (associativity of source-over) | same scene, both group modes | max abs diff <= 1e-5 (float) | (pending) |
| H18 | Clipped layers never change pixels where the base layer has alpha 0, and the clip unit's alpha equals the base alpha | scan all pixels, f32 | exact: 0 violations | (pending) |
| H19 | Isolation is observable: moving a non-normal-mode layer into an isolated group changes the result (negative control that the tests can see grouping) | same layers, flat vs isolated | max diff >= 8 levels | (pending) |
| H20 | The canonical tree compositor agrees with an independent float64 straight-alpha tree compositor (written separately in oracle.js) | 3 seeds x working spaces, via docfold + lcms | max <= 1 level in working space | (pending) |
| H21 | Opacity 0 group, empty group, and mask-0 group are no-ops; pass-through with opacity 0.5 is the exact midpoint of before/after | invariants on f32 buffers | exact / <= 1e-6 | (pending) |
| H22 | PSD export -> import preserves tree shape, clip flags and group modes (incl. pass-through); psd-tools (independent) reads PASS_THROUGH, nesting and clipping flags | `doc/run_groups.js` + `doc/check_groups.py` | structure identical; fixed point after 1st pass | (pending) |
| H23 | Groups/clips do not change any existing flat-document result | all existing golden hashes | unchanged | (pending) |

- H23 note (threshold/expectation change, per rule 3): `doc/run_doc.js` negative case "bad version" used `v: 2`. Schema v2 is now valid by design (groups/clipping), so the
  invalid example became `v: 3`. Evidence it is not a regression: with that single edit `run_doc` passes with every other check and every golden hash unchanged.

### Stage 1 results (doc/run_groups.js, 69 checks) and pre-registered stage 2 (thresholds fixed BEFORE running stage 2)
Stage 1: H16a/b CONFIRMED (hash-identical), H16c control sees opacity 0.999, H17 CONFIRMED (2.4e-7 <= 1e-5), H19 CONFIRMED (97 levels >= 8), H18a CONFIRMED (0 violations over 3727 outside pixels
and 12657 changed inside pixels; H18d control: unclipped layers do leak outside), H21a-e CONFIRMED, H20 CONFIRMED (20 comparisons, worst 1 level, worst mean 0.0025), SCH1 16/16 rejected, PAR1 20/20 Node==Chromium.
Caveat (recorded, not hidden): H20 compares two implementations that share MY reading of the semantics; it shows consistency, not Photoshop-equivalence. The independent semantic check is H24.

| ID | Hypothesis | Planned test | Threshold (fixed now) | Verdict |
|---|---|---|---|---|
| H26 | H20 can fail: breaking the canonical compositor (pass-through treated as isolated; clip flags dropped) is detected against the float64 reference | mutate group mode / clip flags then compare | each mutation >= 4 levels from the reference | (pending) |
| H22a | PSD export -> import preserves the tree (nesting, group modes incl. pass-through, clip flags, mask flags, opacity bytes) | structural string equality | identical | (pending) |
| H22b | Export+import render equals a float64 reference that applies the same 8-bit quantisation (colour, alpha, masks, opacities of layers AND groups) | working-space display | max <= 1 level | (pending) |
| H22c | export -> import -> export -> import is a fixed point (ops identical) | JSON equality | identical | (pending) |
| H25 | psd-tools (independent parser) reads our nesting, PASS_THROUGH group modes, clipping flags, mask presence and opacities exactly | `doc/check_groups.py` | exact | (pending) |
| H24 | psd-tools' own group/clipping compositor (independent code, documented approximate) agrees with ours on the exported PSDs | `psd.composite(force=True, apply_icc=False)` vs our working-space picture | mean <= 1.0 and max <= 8 levels. If exceeded: investigate as a possible SEMANTIC difference (e.g. clipped-layers-blend-as-group), do not just loosen | (pending) |

### H24 result (pre-registered thresholds: mean <= 1.0, max <= 8): FAILED for clipping, and what the numbers say (nothing loosened)
`doc/diag_groups.js` + `doc/diag_groups.py` (one feature per document vs psd-tools' composite): flat 0.43 mean/max 2; pass-through (op 1, 0.7, masked) 0.43-0.44/2; isolated normal and overlay 0.48/2
=> an independent compositor CORROBORATES every group behaviour (unfitted, passed before any change). Clipping: clip_multiply 10.3/48, clip_normal_op06 3.1/17, clip_base_op05 4.95/24, clip_base_multiply 0.62/8.
`doc/diag_clip_semantics.py` + `doc/diag_clip_normal.py`: candidate formulas against psd-tools on the same pixels. Source-atop (my first definition) = 10.27/3.08/4.98/0.65 mean error.
**K = ordinary W3C source-over of the clip layer onto the unit (alpha grows), keep the resulting straight colour, restore the base alpha = 0.422 / 0.426 / 0.427 / 0.428** (the noise floor).
K equals source-atop whenever the base pixel is opaque, so they differ only on partially transparent base pixels (soft brushes, antialiased edges).
psd-tools' own source documents it composites clip layers onto a compositor seeded with the base's colour and alpha and has a TODO for the `clbl` ("blend clipped elements") flag.
Caveats recorded: (1) K was found by fitting to the data H24 compares against, so for clipping H24 is no longer independent evidence; (2) psd-tools is not Photoshop. Photoshop's behaviour on partially
transparent clip bases is UNKNOWN and DEFERRED. Decision: adopt K as the canonical clipping rule (single principled rule: W3C general formula, no special operator; identical to atop on opaque bases).

| ID | Hypothesis | Test (pre-registered now, before the switch is run) | Threshold | Verdict |
|---|---|---|---|---|
| H27 | OUT-OF-SAMPLE: K predicts psd-tools on clip documents NOT used for the fit (seeds 11-13; clip layer modes screen, overlay, soft-light, difference, exclusion; base multiply/normal; base opacity 0.7; clip with a mask; chain of two clipped layers with different modes; clip inside an isolated group) | canonical (after switch) via export vs `psd.composite(force=True)` | per document mean <= 0.8 levels and <= 0.5% of pixels over 8 levels | (pending) |
| H28 | Switching to K changes nothing for documents whose clip bases are opaque | clip unit with an opaque base: K canonical vs old source-atop | max abs f32 diff <= 1e-6 | (pending) |
| H29 | With K, invariants H18a (unit alpha == base alpha, nothing outside the base) still hold exactly | `doc/run_groups.js` H18a-d | 0 violations | (pending) |

### Clipping resolved (numbers)
Second finding: after K (restore alpha after every clipped layer) the full-scene H24 was still mean 1.56-1.80 / max 9-11, while single-clip documents were at the noise floor. `doc/diag_clip_chain.py`:
clip_chain2 K1 1.94 vs **K2 0.429**; clip_chain2_screen_overlay K1 3.69 vs **K2 0.426** (K2 = alpha carried through the chain, base alpha reimposed once at the end = the clip unit is an isolated W3C composite).
Canonical rule is now K2 (`stack.js clipUnit`, `oracle.js clip64`, independent implementations). Fitting happened twice on psd-tools, so the in-sample H24 is no longer independent evidence for clipping; H27 is.

| ID | Verdict | Numbers |
|---|---|---|
| H24 (in-sample, thresholds unchanged: mean <= 1.0, max <= 8) | PASSES after the K2 fit | mean 0.46-0.48, max 2 on all 4 full scenes (fitted; was 6.98-8.78 / 34-48 before) |
| H25 | CONFIRMED | psd-tools reads the exact tree (nesting, PASS_THROUGH, modes, opacity bytes, masks, clip flags) in all 4 exported scenes |
| H26 | CONFIRMED (tests can fail) | pass-through->isolated 71 levels, clip flags dropped 151, group opacity ignored 37; unmutated control 1 |
| H22a-d | CONFIRMED | tree preserved, quantised float64 reference <= 1 level (mean <= 0.006), fixed point, CMYK PSD still rejected |
| H27 (out-of-sample, thresholds fixed beforehand: mean <= 0.8, <= 0.5% pixels over 8) | **CONFIRMED** | 6 unseen documents incl. a 3-layer chain, masked base+clip, pass-through group with chain, isolated group with nested chains in P3, two clip units in a row, opaque-base control: mean 0.28-0.56, max 1-2, 0% over 8 |
| H28 | CONFIRMED | opaque base: K2 == source-atop, 1.45e-7 (limit 1e-5; pre-registered 1e-6 was tighter than f32 chain arithmetic needs; recorded here as a deliberate widening with this measurement) |
| H29 | CONFIRMED | H18a-d still exact (0 violations; 12657 inside pixels changed; 3727 outside pixels untouched; unclipped control leaks) |
| H23 | CONFIRMED | all flat-document hashes (stack, doc, export, icc, witness) unchanged; only the group goldens were regenerated, and only because the clipping rule changed |

Note on H28: the pre-registered limit was 1e-6; the code uses 1e-5. Measured 1.45e-7 would pass 1e-6, so the widening was unnecessary; limit restored to 1e-6 below.
Still DEFERRED (not blockers): Photoshop's behaviour on partially transparent clip bases (psd-tools is not Photoshop); `clbl` ("blend clipped elements" OFF) is not supported - documents are treated as ON.

## Non-separable blend modes: hue, saturation, color, luminosity (logged BEFORE implementation)
Implemented straight from the W3C compositing spec (Lum = 0.3R+0.59G+0.11B, Sat = max-min, SetLum, SetSat, ClipColor), NOT fitted to any reference. Allowed only in schema v2 (v1 stays frozen).
Because nothing is fitted, psd-tools (own implementation in psd_tools/composite/blend.py) is a genuinely independent check here. If a threshold fails: investigate as a possible spec/implementation difference; do not loosen.

| ID | Hypothesis | Test | Threshold (fixed now) | Verdict |
|---|---|---|---|---|
| H30a | Luminosity is preserved by construction: Lum(B) == Lum(Cb) for hue, saturation, color; Lum(B) == Lum(Cs) for luminosity (ClipColor preserves L) | 200k random colour pairs, canonical f32 | max abs deviation <= 5e-6 | (pending) |
| H30b | Result stays inside [0,1] | same | min >= -1e-6, max <= 1+1e-6 | (pending) |
| H30c | Canonical f32 agrees with an independent float64 implementation (oracle.js, written separately) in documents: one layer per mode at opacity 0.8 over a soft-dab background, partially transparent sources and backdrops | via docfold, working-space display | max <= 1 level, mean <= 0.05 | (pending) |
| H30d | psd-tools' own compositor agrees with ours on exported PSDs using these modes (independent code, not fitted) | `psd.composite(force=True, apply_icc=False)` vs our working-space picture | mean <= 1.0 level and <= 0.5% of pixels over 8 levels | (pending) |
| H30e | Mutation controls: swapping hue<->color, or treating any of the four as 'normal', is detected | compare mutated canonical vs float64 oracle | each >= 4 levels | (pending) |
| H30f | PSD round trip preserves the four mode names; export->import->export->import is a fixed point | structural + ops equality | identical | (pending) |
| H30g | Non-separable modes are rejected in a v1 document and accepted in v2; all 10 existing modes unchanged | schema tests | exact | (pending) |
| H31 | Nothing changes for existing documents | witness_all: flat/doc/export/groups output hashes | unchanged | (pending) |
| H30h | Node and Chromium produce identical f32 hashes for these modes | wasm + JS | identical | (pending) |

### Non-separable modes: first results (run_nonsep.js, 72 checks): what passed, what failed, and why (nothing loosened silently)
PASSED as pre-registered: H30a (luminosity preserved, worst 1.85e-7 <= 5e-6, 200k pairs x 4 modes), H30b (range), H30e (control 1; mutations hue->color 81, hue->normal 98, hue->saturation 143 levels),
H30g (v1 rejects 4/4; v2 accepts 8/8; 10 existing modes valid in v1), H30f (6/6 round trips + fixed points), H30h (20/20 Node==Chromium), psd-tools reads modes and nesting exactly, psd-tools mean 0.50-0.65 (<= 1.0).
Bug found by the schema gate: PSD import stamped flat docs using these modes as v1 (rejected). Fixed: importer emits v2 when a non-separable mode appears.
FAILED as pre-registered (3): (1) H30c all_modes_groups_clips_p3: pipeline vs exact float64 = 2 levels (limit 1); (2) H30dp all_modes_groups_clips_srgb 0.574% and _p3 0.549% of pixels over 8 levels vs psd-tools (limit 0.5%).
Diagnosis by numbers (`doc/diag_nonsep.js`): compositor-only, identical working-space layers: canonical f32 vs independent oracle max 1 level, 0 of 49152 samples >1; the SAME canonical source evaluated in float64 vs the
oracle: max 0 => logic agrees. So (1) is not the compositor. Hypothesis: the pipeline difference is the lcms 16-bit conversion step amplified by the ill-conditioning of hue/saturation near greys (SetSat divides by
max-min; ClipColor by L-n). Hypothesis for (2): TEST-DESIGN FLAW, same class as H13: psd-tools composites the exported 8-bit layers, but I compared it with a picture computed from the float layers (ex.merged).
Registered now, before the re-run (thresholds unchanged where a threshold exists):
| ID | Hypothesis | Test | Threshold | Verdict |
|---|---|---|---|---|
| H30c2 | compositor-only agreement: canonical f32 vs oracle on identical converted layers, all 10 documents | `run_nonsep.js` | max <= 1 level and 0 samples over 1 | (pending) |
| H30c3 | the pipeline difference is 16-bit conversion quantisation: an oracle whose converted layer colours are rounded to 1/65535 reproduces the pipeline | same | max <= 1 level vs pipeline, all 10 documents | (pending) |
| H30c | pipeline vs EXACT float64 | same | was <= 1 level; REPLACED by <= 2 levels, justified only if H30c2 and H30c3 both pass (the extra level is input quantisation amplified by ill-conditioning, not the compositor) | (pending) |
| H30d | psd-tools compositor vs ours, LIKE FOR LIKE (our render of the imported 8-bit layers, not the float picture) | `run_nonsep.js` + `check_nonsep.py` | unchanged: mean <= 1.0 and <= 0.5% pixels over 8 levels | (pending) |

### Non-separable modes: second round (numbers)
- H30d CONFIRMED like-for-like: psd-tools' independent compositor vs our render of the same 8-bit layers: mean 0.497-0.502, max 1, 0% of pixels over 8 on all 6 documents (the earlier 0.55-0.57% failures were the float-vs-8-bit picture confound, a test-design flaw, same class as H13).
  psd-tools is unfitted here, so this is genuine independent evidence for hue/saturation/color/luminosity.
- H30c2 CONFIRMED: compositor-only on identical converted layers: worst 1 level, 0 samples over 1, all 10 documents; the canonical source run in float64 agrees with the oracle exactly (max 0).
- H30c: pipeline vs exact float64 worst 2 levels (1 of 10 documents) vs the pre-registered 1: limit replaced by 2 as registered, justified by H30c2 (compositor clean) and H30c4 below.
- H30c3 REFUTED: an oracle whose converted layer colours are merely rounded to 1/65535 differs from the pipeline by up to 3 levels (limit 1). The simple "16-bit rounding" explanation was wrong; lcms' conversion error is larger
  than rounding (earlier ICC suite: up to ~0.04 8-bit levels) and hue/saturation near greys amplify it. Check removed from the gate and recorded here.
| ID | Hypothesis (registered before the next run) | Test | Threshold | Verdict |
|---|---|---|---|---|
| H30c4 | feeding the oracle the EXACT converted layers the canonical composite used (lcms output) makes the pipeline difference vanish: the gap to the exact reference is conversion input, not the compositor | `DF.compositeState` -> `oracle.spec64tree` vs canonical back, all 10 documents | max <= 1 level, 0 samples over 1 | (pending) |

### Non-separable modes: verdicts
H30a CONFIRMED (<= 1.9e-7) | H30b CONFIRMED | H30c2 CONFIRMED (worst 1, 0 over) | **H30c4 CONFIRMED** (worst 1 level, 0 samples over 1, 10 documents: the pipeline-vs-exact gap is lcms conversion input amplified by hue/saturation conditioning)
H30c pipeline vs exact float64: limit replaced 1 -> 2 (worst observed 2, 1 of 10 documents) with the above justification | H30c3 REFUTED (rounding alone does not explain it) | H30d CONFIRMED like-for-like (mean ~0.50, max 1, 0% over 8; unfitted)
H30e CONFIRMED (81/98/143 levels) | H30f CONFIRMED | H30g CONFIRMED | H30h CONFIRMED (Node == Chromium) | H31 CONFIRMED (stack, doc, export, groups suites unchanged, goldens intact)
Not covered: GPU twin (`glstack.js`) has no non-separable modes; Photoshop may differ from the W3C definitions for these modes (Photoshop's own Hue/Color use a different luminance weighting in some versions): UNKNOWN, DEFERRED.

## Tile store behind `raster` blobs (logged BEFORE implementation)
Design: a raster blob (w*h*4 RGBA8, or w*h mask bytes) is split into tile x tile pieces (64), each stored once under the sha256 of its bytes; a manifest lists the tile ids. The blob id used by the
`raster` op stays the sha256 of the WHOLE blob (so op-logs, hash chains and every golden hash are unchanged). Storage = SQLite via sql.js (already a bim-ootb dependency): `tiles(id, data)`, `blobs(id, w, h, ch, tile, manifest)`.
| ID | Hypothesis | Test | Threshold (fixed now) | Verdict |
|---|---|---|---|---|
| H32 | put/get reconstructs every blob byte-exactly and the blob id equals the whole-blob sha256, for sizes that are not tile multiples, 1-channel and 4-channel | 40 random blobs incl. odd sizes (1x1, 63x65, 130x70) | 0 mismatches; ids equal `sha256(whole)` | (pending) |
| H33 | Dedupe: 8 layers x 51 versions where each version edits one ~100x100 region of one layer stores few unique tiles | W=512, tile 64, 50 edits | unique tiles / logical tiles <= 4.0% | (pending) |
| H34 | Persistence: export the SQLite file, reopen in a fresh sql.js instance AND in Chromium, reconstruct | all blobs from H33 | 100% byte-identical, both engines | (pending) |
| H35 | Integration: `docfold` backed by the tile store gives the same result as the Map-backed blobs | imported PSD documents (flat, groups/clips, non-separable) | f32 hash and sRGB render hash identical to the Map-backed run | (pending) |
| H36 | Corruption is always detected: flipping any byte of a stored tile, swapping two tile ids in a manifest, or truncating a manifest | 300 random corruptions | 100% detected (throws), 0 silent wrong reads | (pending) |
| H37 | Region reads are cheap: reading a 100x100 region touches only the tiles that overlap it | 200 random regions on a 512x512 layer | tiles read <= ceil((x%64+w)/64)*ceil((y%64+h)/64) exactly; region bytes equal the slice of the full blob | (pending) |
| H38 | Negative control: a store with a deliberately wrong tile size on read (63 vs 64) is detected, i.e. the tests can fail | construct and read mismatch | detected | (pending) |

### Tile store: verdicts (`tiles/run_tiles.js`, 17 checks, all pre-registered thresholds unchanged)
H32 CONFIRMED (40 blobs incl. 1x1, 63x65, 130x70, 1 and 4 channels: 0 mismatches; ids == sha256(whole); re-put adds 0 tiles) | **H33 CONFIRMED** (829 unique tiles / 26,112 logical = 3.175% <= 4.0%; version 0 stored all 512; all 408 versions exact)
H34 CONFIRMED (fresh sql.js instance in Node: 0 mismatches; Chromium with a fresh sql.js and pure-JS sha256: 58/58) | H35 CONFIRMED (flat P3 doc and a groups+clip+non-separable doc: identical f32 and sRGB render hashes vs Map-backed blobs; schema validation against the store: 0 errors)
H36 CONFIRMED (300/300 corruptions detected: tile bit flip, swapped manifest ids, truncated manifest; 0 silent wrong reads) | H37 CONFIRMED (200 random regions: tiles read exactly as predicted, bytes equal the slice) | H38 CONFIRMED (control: wrong tile size detected)
Caveats: edits in H33 are synthetic (noise layers, 100x100 channel inversions), real brushwork will dedupe differently; storage is uncompressed (14 MB for 829 tiles), compression untested; one SQLite file, no concurrency/locking tests; pure-JS sha256 hashing speed not benchmarked.

## Adjustment layers: invert, levels, threshold, posterize (logged BEFORE implementation)
Schema v2 op `{op:'adjust', id, kind, params, opacity, mask, parent?}`; it transforms the composite beneath it within its parent context (pass-through: whole backdrop; isolated group: that group's content), then
result = lerp(before, adjusted, opacity*mask) on the straight colour; alpha is never changed. Only in `gamma: "encoded"` documents (behaviour in linear light is unknown, so rejected). Definitions (from the PS integer model, NOT fitted):
levels: x = clamp((c - ib/255) / ((iw - ib)/255)); x = x^(1/gamma); out = clamp(ob/255 + x*(ow - ob)/255), params in PS integer units, gamma_x100 in 1..999 (ag-psd/PSD store midtone as int16/100);
threshold: white iff round(255*(0.3R+0.59G+0.11B)) >= level (level 1..255); posterize: out = floor(c*(255/256)*n)/(n-1), n in 2..255, which reproduces the PS 8-bit mapping floor(v*n/256)/(n-1) exactly (n=2 cuts at 128); invert: 1 - c.
Canonical code may not use Math.pow (not bit-exact across engines), so x^y is a deterministic routine using only + - * / on doubles (exponent/mantissa split, atanh-series log2, Taylor exp2).
| ID | Hypothesis | Test | Threshold (fixed now) | Verdict |
|---|---|---|---|---|
| H40a | the deterministic pow matches Math.pow | 1e6 random pairs x in [1e-6,1], y in [0.01,100]; plus pow(0,y)=0, pow(1,y)=1 | relative error <= 1e-8 where result > 1e-30; specials exact | (pending) |
| H40b | it is bit-reproducible across engines | sha256 of 4000 fixed outputs, Node vs Chromium | identical | (pending) |
| H41 | identity adjustments are exact no-ops: levels (0,255,100,0,255), any adjustment at opacity 0 or with an all-zero mask | f32 hash vs the document without the layer | equal | (pending) |
| H42a | posterize reproduces the PS integer mapping on all 256 inputs for every n in 2..255 | property test | exact (max abs <= 1e-6) | (pending) |
| H42b | threshold on grey inputs: white iff v >= level, all 256 x 255 combinations | property test | 0 violations | (pending) |
| H42c | invert twice is the identity | f32 | max abs <= 1e-6 | (pending) |
| H43 | canonical (+ lcms conversions) vs an independent float64 oracle in documents with all four kinds, masks, opacities, in P3 and sRGB working spaces, inside pass-through and isolated groups | docfold vs oracle (working space) | max <= 1 level, mean <= 0.05 | (pending) |
| H44 | psd-tools' own compositor agrees with ours on exported PSDs with these adjustment layers, LIKE FOR LIKE (our render of the imported doc) | `psd.composite(force=True, apply_icc=False)` | mean <= 1.0 and <= 0.5% of pixels over 8 levels | (pending) |
| H45 | scoping invariants: (a) an adjustment at the root equals the pointwise function applied to the composite beneath; (b) inside an isolated group with nothing below it, it is a no-op; (c) inside an isolated group it does not change the backdrop outside the group's footprint | f32 / f64 comparisons | (a) max abs <= 2e-6 (b) hash equal (c) 0 pixels changed | (pending) |
| H46 | mutation controls: invert replaced by a no-op, levels gamma ignored, threshold level off by one level, posterize treated as n+1 are each detected | vs oracle | each >= 4 levels (threshold: >= 1 pixel changes by > 100 levels) | (pending) |
| H47 | schema: adjust rejected in v1 and in linear documents; kinds/params validated (ranges, in_black < in_white, ints); a layer cannot be clipped to an adjustment; fill/dab/raster on it rejected | schema tests | all rejected / accepted as listed | (pending) |
| H48 | PSD round trip preserves kind, params, opacity, mask, nesting; export->import->export->import is a fixed point; psd-tools reads the same kinds and parameters | structural | identical | (pending) |
| H49 | nothing existing changes | witness_all hashes of earlier suites | unchanged | (pending) |

### Amendments to H43 and H44, made BEFORE the first run (reason: step functions)
threshold and posterize are discontinuous, so a pixel within ~1e-5 (f32/lcms rounding) of a boundary can flip by 64-255 levels. A flat "max <= 1 level" would measure rounding luck, not correctness. Replaced as follows (nothing is run yet):
| ID | Hypothesis | Test | Threshold (fixed now) | Verdict |
|---|---|---|---|---|
| H43a | continuous kinds (invert, levels): pipeline vs float64 oracle | documents, working space | max <= 1 level, mean <= 0.05 (as before) | (pending) |
| H43b | discontinuous kinds (threshold, posterize), compositor-only on identical converted layers | canonical f32 vs oracle on the same working-space layers | pixels over 1 level <= 0.05% of pixels (flips from f32 vs f64 only) | (pending) |
| H43c | discontinuous kinds, whole pipeline (lcms conversion error ~1e-4 relative adds flips) | pipeline vs exact float64 | pixels over 1 level <= 0.2% | (pending) |
| H44a | continuous kinds vs psd-tools, like for like | `psd.composite(force=True, apply_icc=False)` vs our render of the imported doc | mean <= 1.0 and <= 0.5% of pixels over 8 levels (unchanged). psd-tools applies adjustments through 256-entry LUTs, which may add error for steep curves; if it fails I will test that explanation (H44b) instead of loosening | (pending) |
| H44b | tolerance-aware semantic agreement for discontinuous kinds: a pixel disagrees only if psd-tools and ours give different outputs while our pre-adjustment value is NOT within 1.5 levels (8-bit) of a boundary | python check with our pre-adjustment picture saved | disagreeing pixels outside the boundary band <= 0.1% of pixels | (pending) |

### Adjustment layers: first run (run_adjust.js, 72 checks): 3 failed, everything else passed (registered BEFORE the follow-up tests)
PASSED: H40a pow rel. error (limit 1e-8; after adding series terms 5e-14 over 1e6 pairs), H42a posterize == PS integer mapping on all 254 n x 256 inputs (0 violations: the 255/256 factor matters), H42b threshold on greys (0 violations of 65,280),
H42c, H41 (no-ops exact, non-vacuous), H45 a/b/c (scoping), H47 schema (all rejected), H43a/b/c, H44b (tolerance-aware psd-tools agreement for step functions), H48 (kinds/params/nesting/fixed point; per-channel levels rejected), H40b Node==Chromium.
Bugs found by the gates: (1) the importer rejected its own exported levels layer because ag-psd fills red/green/blue with identity records on read: now accepts identity per-channel records and still rejects real per-channel levels (H48b); (2) a syntax slip of mine (inline `//` swallowing a line).
FAILED: (1) H46 "levels gamma ignored" = 3 levels vs >= 4. The mutation IS detected (control 1), but the mutated node (id 10) sits low in the stack and is mostly covered by later layers: weak TEST POWER, not a correctness issue.
  Fix: mutate the node with the strongest gamma (id 12, gamma 0.60); threshold stays >= 4. (2) H44a mean 1.05 / 1.07 vs <= 1.0 (limit unchanged).
| ID | Hypothesis | Test | Threshold (fixed now) | Verdict |
|---|---|---|---|---|
| H44c | the excess over 1.0 is psd-tools applying adjustments through 256-entry LUTs (input quantised to 8 bits); our function applied to 8-bit-quantised inputs reproduces psd-tools at the noise floor, while unquantised inputs reproduce the ~1.05 | single-feature documents (invert only, levels linear, levels gamma 1.3, levels gamma 0.6); python computes both variants from our pre-adjustment picture | quantised-input variant: mean <= 0.7; and invert-only (no LUT) must be at the baseline <= 0.6 | (pending) |

H44c REFUTED AS DESIGNED / untestable: my diagnostic fed psd-tools' LUT hypothesis an already 8-bit pre-adjustment picture, so quantised and unquantised variants were identical. (Single-feature psd-tools agreement: levels linear 0.494, gamma 1.3 0.479, gamma 0.6 0.536, invert 0.787 which has no LUT at all.)
Sharper hypothesis, registered before the test:
| ID | Hypothesis | Test | Threshold (fixed now) | Verdict |
|---|---|---|---|---|
| H44d | psd-tools quantises its output by TRUNCATION (`astype(uint8)` after `255*color`), ours rounds; the pre-registered mean <= 1.0 against our ROUNDED picture therefore includes a ~0.5 level bias that is not an adjustment error. Compared with our FLOAT result truncated the same way, the 4 continuous documents agree far better than when compared with our rounded picture | write our straight working-space float picture; python compares psd-tools with floor(255*f) and with round(255*f) | truncation-aligned mean <= 0.7 for every continuous document AND it is lower than the rounded comparison for each | (pending) |

### H44d CONFIRMED and H44a REPLACED (comparison-design flaw, same class as H13)
H44d: truncation-aligned mean 0.5512 and 0.5667 (limit 0.7); (mean vs rounded) - (mean vs truncated) = 0.4988 and 0.5007 = half a level = exactly truncation vs rounding. psd-tools' output stage is `np.clip(255*color, 0, 255).astype(np.uint8)` (truncation).
H44a's pre-registered "mean <= 1.0 against OUR ROUNDED picture" therefore hid a ~0.5 level comparison bias and failed at 1.05/1.07 although the real agreement is 0.55. REPLACED by H44d (mean <= 0.7 vs the truncation-aligned float picture); the "<= 0.5% of pixels over 8 levels" half of H44a is kept unchanged and passes (0%).
**General finding for every earlier psd-tools comparison** (groups H24/H27, non-separable H30d, adjustments): psd-tools composites report ~0.5 level more than the true disagreement because of truncation; those suites passed anyway with margin, and their reported means (0.28-0.65) should be read as ~0.5 bias + residual.
H46 repaired: mutated node 12 (gamma 0.60) instead of node 10; results: invert no-op 132, gamma ignored 62, threshold level +20 255, posterize n+1 51 levels (all >= their thresholds), control 1.

### Adjustment layers: verdicts (`doc/run_adjust.js`, 76 checks; `npm run adjust`)
H40a CONFIRMED (5e-14 max relative error over 1e6 pairs; specials exact) | H40b CONFIRMED (powDet hash and all 6 documents' f32 + render hashes identical Node vs Chromium) | H41 CONFIRMED (identity levels, opacity 0, zero mask exact; non-vacuous)
H42a CONFIRMED (posterize == floor(v*n/256)/(n-1), 0 violations over 254 n x 256 inputs) | H42b CONFIRMED (threshold, 0 violations of 65,280) | H42c CONFIRMED (invert twice <= 1e-6)
H43a CONFIRMED (continuous, <= 1 level, mean <= 0.05) | H43b CONFIRMED (step functions, compositor-only flips <= 0.05%) | H43c CONFIRMED (whole pipeline flips <= 0.2%)
H44b CONFIRMED (tolerance-aware: outside the boundary band psd-tools disagrees on <= 0.1% of pixels) | H44d CONFIRMED, H44a replaced (see above) | H45a/b/c CONFIRMED (scoping: root = pointwise function, isolated-empty no-op, 0 pixels changed outside the group footprint)
H46 CONFIRMED after strengthening the gamma mutation | H47 CONFIRMED (20 of 20 invalid logs rejected, valid kinds accepted) | H48/H48b CONFIRMED (kinds/params/opacity/masks/nesting preserved, fixed point; per-channel levels rejected, master-only accepted; psd-tools reads the same parameters)
H49 verified by the full ledger run. Not covered: curves, hue/saturation, brightness/contrast, exposure, per-channel levels (rejected on import), adjustments in linear-light documents (rejected), adjustment blend modes other than normal, clipping an adjustment, GPU twin.
Note: the step-function agreement (H43b/c, H44b) is a statement about semantics away from boundaries; pixels within rounding distance of a boundary can legitimately flip, and the numbers above quantify how many.

## Curves adjustment (logged BEFORE implementation)
`{op:'adjust', kind:'curves', params:{points:[[x,y],...]}}`: master (RGB) curve, x = input and y = output in PS integer units 0..255, 2..16 points, x strictly increasing. Evaluation: natural cubic spline through the points in double
precision (tridiagonal solve with + - * / only), constant outside [x_first, x_last] (value of the end point), result clipped to [0,1]. Choice basis: psd-tools (scipy CubicSpline, bc_type="natural") and GIMP use it; **what Photoshop itself does is UNKNOWN and DEFERRED**,
so this is a documented compatibility choice, not a claim of Photoshop equivalence. Per-channel curves are rejected on import (as per-channel levels are). ag-psd stores points as {input, output} and also writes the duplicate `Crv ` block psd-tools reads.
| ID | Hypothesis | Test | Threshold (fixed now) | Verdict |
|---|---|---|---|---|
| H50a | the canonical spline equals scipy `CubicSpline(bc_type="natural")` (independent implementation), as a pure function | 4000 random curves (2..12 points) x (256 grid + 100 random inputs) | max abs diff <= 2e-6 (f32 canonical output vs f64 scipy) | (pending) |
| H50b | the float64 oracle (dense Gaussian elimination + per-interval Horner, written separately) equals scipy too | same curves | max abs diff <= 1e-9 | (pending) |
| H50c | control points are interpolated exactly; an identity curve [(0,0),(255,255)] is an exact no-op in documents | all curves; hash equality | canonical <= 1e-6; no-op hash equal | (pending) |
| H50d | bit-reproducible across engines | hash of 200 curves x 256 outputs, Node vs Chromium | identical | (pending) |
| H51 | documents with curves (masks, groups, opacity, P3, mixed with levels) vs the float64 oracle | docfold vs oracle, working space | max <= 1 level, mean <= 0.05 | (pending) |
| H52 | psd-tools' compositor agrees on exported PSDs, like for like, truncation-aligned (psd-tools truncates its output AND floors its LUT input to 8 bits) | `composite(force=True)` vs our float picture truncated | mean <= 0.8 levels and <= 0.5% of pixels over 8 levels. If it fails: H52b = our curve applied to floor(255c)/255 inputs reproduces psd-tools (mean <= 0.6), tested instead of loosening | (pending) |
| H53 | schema: curves params validated (2..16 ints, x strictly increasing, 0..255, exact keys), rejected in v1/linear docs, per-channel rejected on import | negatives | all rejected; master-only accepted | (pending) |
| H54 | mutation controls: linear interpolation instead of the spline, points swapped (x<->y), and a dropped control point are detected | vs oracle on a strongly curved document | each >= 4 levels | (pending) |
| H55 | PSD round trip preserves points, opacity, masks, nesting; fixed point; psd-tools reads the same points | structural | identical | (pending) |
| H56 | nothing existing changes | witness_all hashes of earlier suites | unchanged | (pending) |

### Curves: first run (run_curves.js, 31 checks): 1 failure, diagnosed before any change
H50c "control points interpolated exactly, canonical max abs error <= 1e-6" measured 6.95e-6. Hypothesis (registered before testing it): TEST FLAW, not a spline error. The check evaluated `f(F(x/255))`, i.e. the knot position rounded to float32 (error up to ~3e-8),
and a steep random curve (slope up to ~255 per unit) multiplies that to ~7e-6. Prediction: evaluating the same spline at the EXACT knot x/255 in double precision gives <= 1e-12, and the f32-input error is explained by slope * 3e-8 (check: error <= slope * 6e-8 at every knot). Threshold stays 1e-6.
Follow-up: exact-knot double-precision error = 0 (<= 1e-6 CONFIRMED): the spline interpolates its control points. The second prediction (f32 error <= finite-difference slope x 6e-8) failed on 1 knot of ~26,000: the slope ESTIMATE (central differences over +-0.5..2 levels) underestimates the true local slope when two knots are
adjacent with a big jump. Sharper prediction, registered before re-running: |f32 result - y| <= max over the actual float32 rounding interval of |spline(t) - y| + 1.2e-7 (output rounding), exactly, for every knot.

### Curves: verdicts (`doc/run_curves.js`, 32 checks; `npm run curves`)
H50a CONFIRMED (canonical f32 vs scipy natural CubicSpline: max abs diff 3e-8 over 4000 random curves x 356 inputs; limit 2e-6) | H50b CONFIRMED (independent float64 oracle vs scipy: 5.3e-14; limit 1e-9) | H50c CONFIRMED after fixing my test: exact-knot double-precision error 0;
the earlier 6.9e-6 was the float32 rounding of the knot POSITION times the local slope (0 knots out of ~26,000 exceed the spline's own change over the rounding interval + 1.2e-7); identity curve is an exact no-op; an S-curve is not.
H50d CONFIRMED (200-curve LUT hash and 2 documents: Node == Chromium, 5/5) | H51 CONFIRMED (documents with masks, groups, P3, mixed with levels: <= 1 level, mean <= 0.05) | H52 CONFIRMED (psd-tools compositor vs our float picture truncated: mean 0.531 / 0.522 <= 0.8; 0% of pixels over 8 levels; H52b not needed)
H53 CONFIRMED (12 of 12 invalid curve logs rejected; valid accepted; per-channel curves rejected on import, master-only accepted) | H54 CONFIRMED (controls: swapped x/y 39, dropped point 49, linear-instead-of-spline 16 levels; unmutated 1) | H55 CONFIRMED (points/opacity/masks/nesting, fixed point; psd-tools reads the same points)
H56: see the ledger run. Two test-design flaws of mine were found and fixed (knot position rounding; slope estimate). Not covered: per-channel curves, curves in linear-light documents, Photoshop's actual spline (UNKNOWN: natural cubic is a compatibility choice shared with psd-tools and GIMP), more than 16 points, GPU twin.
