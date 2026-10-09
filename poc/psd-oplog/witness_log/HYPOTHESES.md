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
