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
