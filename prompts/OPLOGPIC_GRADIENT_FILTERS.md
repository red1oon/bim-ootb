# ⚠ DO NOT REMOVE
**Scope:** OplogPic (`poc/psd-oplog/editor/`), two features: Part A = Gradient tool + Gradient Map adjustment; Part B = filter layers (Gaussian blur, Sharpen) as live, maskable adjustment-style layers. SPEC ONLY. No code, no test code, until the owner says go and the matching HYPOTHESES.md section (Levels 2i / 2j, copied from the tables below) is written.
**Read the log after every run.** Exit code is not evidence; SKIP and silent failures show only in the log. Honour this block until the prompt is DONE.
Rules (owner, do not re-ask): never loosen a threshold, write amendments down BEFORE the passing run; claims about other editors only from their own pages (none are needed here); deploy only on his explicit OK; simple, serverless, mobile-ready; low-key names.

# OplogPic: gradients and filter layers

## Why these two
Both are one op with a handful of numbers, replay to the same pixels, and reuse machinery that already passed its witnesses: adjustment layers (`adjust` / `adjset`, masks, checkpoints, PSD), `filters/blur.js` (Gaussian, scipy oracle), selection limits (Level 1c), masks (Level 2a). Nothing here stores pixels in the log.

## Op-log principles every item below must satisfy (checked in the GD9 / FL10 gates)
1. **Parameters only.** The log entry holds numbers, never pixels. A gradient or filter entry is <= 256 bytes of JSON.
2. **Deterministic fold.** Three replays give identical hashes; a checkpoint resume gives identical hashes; arithmetic is `Math.fround` per step, no `Math.exp` / `Math.pow` (use `S.powDet`).
3. **Independent oracle.** numpy / scipy float32 reference written separately from the JS.
4. **Honest history.** One drag = ONE log entry; undo / redo / Verify / save -> load all reproduce the picture bitwise.
5. **A stated PSD story.** What Photoshop-compatible readers get, and what they do not.

# PART A: Gradient

## A.1 The paint op `grad` (editor module `editor/grad_ops.js`, like `blur` / `stroke`: engine and doc schema untouched)
`{op:'grad', layer, kind:'linear'|'radial', x0, y0, x1, y1, c0:[r,g,b], c1:[r,g,b], a0, a1, target?:'pixels'|'mask'}`
- x0..y1 integers inside the canvas; (x0,y0) != (x1,y1) else the op throws. Colours are encoded values in the layer's space, a0 / a1 in 0..1 (so "colour to transparent" is a0=1, a1=0).
- Parameter of pixel (x,y), sampled at the pixel centre (x+0.5, y+0.5): linear `t = clamp(((px-x0)*(x1-x0) + (py-y0)*(y1-y0)) / ((x1-x0)^2 + (y1-y0)^2), 0, 1)`; radial `t = clamp(dist((px,py),(x0,y0)) / dist((x1,y1),(x0,y0)), 0, 1)` with sqrt via double then `fround`. Colour and alpha are interpolated linearly in the encoded space on straight values: `c = F(c0 + F(t*(c1-c0)))`. The gradient is then composited over the layer's pixels source-over (premultiplied float32, same rule as a soft dab).
- Limited to the active selection exactly as the brush ops are (Level 1c): outside the selection the layer is bitwise untouched; a feathered or inverted selection follows the existing rule.
- `target:'mask'`: the layer must have a mask; the value `v = F(a0 + F(t*(a1-a0)))` REPLACES the mask inside the selection (c0 / c1 ignored and must be omitted). This is the "fade a photo out into the layer below" gesture.
- Gradient is not tiled / repeated / reflected in this level (clamped ends only).

## A.2 Gradient Map adjustment (engine change: new `adjust` kind `gradmap`)
`{op:'adjust', kind:'gradmap', params:{stops:[[pos,r,g,b], ...]}}`: 2..8 integer stops, `pos` 0..255 strictly increasing, first pos 0, last pos 255, r g b 0..255. Luminance of the backdrop pixel = the weights `threshold` already uses (0.3, 0.59, 0.11, rounded to 8 bits); the output colour is the piecewise-linear interpolation of the stops at that luminance; alpha untouched, lerped by opacity * mask like every adjustment. Default params: black -> white (a plain greyscale). Editable through the existing `adjset`.
Touches: `stack.js` (ADJ_KINDS, applyAdjust), `doc/schema.js` (validate), `editor/adjust_ops.js` (KINDS, DEFAULTS, validate, label), `doc/psd_export.js` / `psd_import.js` (ag-psd type `gradient map`, present in the vendored build).

## A.3 UI
- Gradient tool, key 9. Top bar: Linear / Radial toggle, Layer / Mask target, the two colour swatches (current colour and background colour), "colour -> transparent" toggle. Drag from start to end; a thin guide line shows while dragging; release logs ONE entry. Two-finger tap undoes as everywhere.
- "Add adjustment" menu gains Gradient map: a stop editor like the Curves graph (tap empty space adds a stop, drag moves, long-press / bin removes); one `adjset` per drag.
- History label: `Gradient linear (x0,y0)->(x1,y1)` and `Adjust gradient map N: k stops`.

## A.4 Hypotheses (thresholds fixed NOW; a new HYPOTHESES.md "Level 2i" copies this table before any code)
| ID | Hypothesis | Test | Threshold / prediction |
|---|---|---|---|
| GD1 | the gradient is what A.1 says | 8 cases: linear horizontal / vertical / diagonal / start == a corner, radial centre / off-centre / radius 1, colour -> transparent; 128^2 layer; vs an independent numpy float32 reference (`editor/check_grad.py`) | max abs diff <= 2e-6 on every channel; degenerate (x0,y0)==(x1,y1), points outside the canvas, bad colour length each throw and leave the state unchanged. Negative control: reference with t rounded to 8 bits must FAIL the same threshold |
| GD2 | selection limit | rect, ellipse, wand and inverted selections, then a gradient on the layer | pixels outside the selection bitwise equal to the layer before (hard); inside equal to GD1 reference |
| GD3 | mask target | linear gradient 1 -> 0 on the mask of a photo layer above a red layer | composite == `lerp(red, photo, v(x,y))` within 2e-6 (hard); a layer without a mask throws; a mask gradient with c0 present throws |
| GD4 | the log is the truth | live editor: 4 drags (2 linear, 1 radial, 1 mask), undo-all / redo-all, save -> load, Verify, checkpoint resume | live == refold at every step, all hashes equal (hard); exactly 1 log entry per drag; each entry <= 256 bytes; 3 replays equal |
| GD5 | gradient map | 6 maps (2 stops identity, 3 stops, 8 stops, stops at the extremes, hard step, sepia) on a 256-level grey ramp and on a photo-like colour layer, vs numpy | <= 1/255 on every channel (8-bit rounded luminance is part of the definition); identity map black -> white on a neutral grey ramp equals the ramp within 1 level; invalid stops (1 stop, 9 stops, pos not increasing, first pos != 0) throw |
| GD6 | gradient map in the doc / PSD | `adjset` equals authoring (as AJ2); opacity 0.5 and a hidden map as AJ3; PSD export -> ag-psd read-back; psd-tools read | ag-psd read-back params equal (hard); stored merged image within 1 level of the editor composite (hard); psd-tools type name for the layer REPORTED (if psd-tools cannot parse the type, written down as a limit, not hidden); import of that PSD reproduces the `adjust` op |
| GD7 | phone | 390x844 touch: Gradient tool visible, its controls >= 44 px; one drag logs exactly 1 `grad`; a stop drag logs exactly 1 `adjset`; two-finger tap undoes; no scroll | as stated (hard) |
| GD8 | cost | 1024^2: one `grad`; one gradient-map live refresh | `grad` <= 100 ms, refresh <= 400 ms on this host (reported; if the refresh is refuted the preview moves to a coarser pass, commit stays exact) |
| GD9 | regression | `node witness_all.js`; goldens of the six existing adjustment kinds | all earlier suites pass, existing goldens bit-identical (the engine change must not move any old hash); thresholds unchanged |
Honest limits fixed now: no gradient editor with multiple stops for the paint tool (two colours only); no reflected / diamond / angle gradients; gradient map is greyscale-luminance driven (not per-channel); dithering absent (banding possible in 8-bit export of a 16-bit-smooth ramp).

# PART B: Filter layers (live, maskable, re-editable)

## B.1 Model
New `adjust` kinds that read their NEIGHBOURS, not only the same pixel: `gblur` and `sharpen`. A filter layer is a root-level node exactly like an adjustment (Level 2d): it transforms everything BELOW it in the root list, none above; opacity, hide, reorder, delete, mask-from-selection (Level 2g masks) and checkpoints work as for adjustments.
- `gblur` params `{sigma_x10}` integer 1..400 (sigma = sigma_x10 / 10).
- `sharpen` (unsharp mask) params `{amount, radius_x10, threshold}` integers: amount 1..500 (%), radius_x10 1..100, threshold 0..255.
- Colour handling differs from the per-pixel adjustments and is stated here, not left implicit: a filter acts on the **premultiplied float32 RGBA of the backdrop** (as `filters/blur.js` does today), so alpha is filtered too; the result is lerped with the backdrop by `k = opacity * mask` in premultiplied space. On an opaque backdrop (the normal case, Background layer) this equals filtering straight colour.
- `gblur`: kernel, radius `floor(4*sigma + 0.5)`, reflect edges, accumulation order: exactly `filters/blur.js` `blurRectTo` over the whole canvas.
- `sharpen`: `pb = blur(p, radius)`, `d = F(p - pb)` per premultiplied colour channel; if `abs(d)*255 < threshold` the channel is unchanged, else `o = clamp(F(p + F((amount/100) * d)), 0, alpha)`; alpha unchanged. This is OUR definition and the oracle tests exactly that. It is not claimed to match any other editor's sharpen.
- Engine hook: `stack.js` must not `require` `filters/blur.js` (blur.js already requires stack.js for `powDet`: a circular import). `stack.js` exposes a small registry `S.spatial[kind] = fn(back, a, W)`; `filters/blur.js` (or a new `filters/filter_layers.js`) registers `gblur` / `sharpen` at load; `applyAdjust` calls the registered fn for those kinds and errors loudly if the module was not loaded (no silent pass-through).
- Touches: `stack.js` (ADJ_KINDS, registry, call site), `doc/schema.js`, `editor/adjust_ops.js`, `doc/psd_export.js` (see B.3), `perf/dirty.js` (see FL6), `editor/index.html` + `editor.js` (menu, sliders).

## B.2 The tile-compositing risk (the one that can break the principles)
The dirty-tile compositor (`perf/dirty.js`) assumes each output tile depends only on the same tile of every layer. A filter breaks that: a tile now depends on the backdrop within `r = floor(4*sigma + 0.5)` pixels (radius for sharpen likewise). Rule: an edit BELOW a filter layer dirties its tile expanded by `r` (clipped to the canvas); an edit ABOVE it is unaffected; if expansion makes a rect larger than the canvas the whole canvas is recomposed. FL6 proves the incremental result equals a full refold bitwise. If the incremental path cannot be made bitwise equal, the fallback (written now) is: a document containing a filter layer recomposites the full frame on every edit below it, with the cost reported, correctness never traded.

## B.3 PSD story (stated before building)
Photoshop's live blur needs smart objects; OplogPic does not write those. So: `gblur` / `sharpen` export as a **baked normal pixel layer** named `Gaussian blur N (baked)` / `Sharpen N (baked)` placed at the filter's position: its pixels are the filtered backdrop, its opacity is the filter opacity, its mask is the filter mask; the layers below stay. The composite in any reader equals the editor's composite (opaque backdrop), but the filter is NOT live there and a PSD re-import never creates a filter layer (it stays a pixel layer). The editor's own saved log (the real document) stays live. The guide says so in one sentence. `gradmap` (A.2) exports natively.

## B.4 UI
"Add adjustment" menu (Advanced) gains Gaussian blur (1 slider: Radius 0.1-40.0) and Sharpen (3 sliders: Amount, Radius, Threshold). One `adjset` per slider drag. Live preview while dragging: if one refresh exceeds 400 ms at 1024^2 the drag shows a coarser (half-resolution) preview and the release commits the exact result. History labels `Adjust blur N: radius R`, `Adjust sharpen N: A%, R px`.

## B.5 Hypotheses (thresholds fixed NOW; HYPOTHESES.md "Level 2j" copies this table before any code)
| ID | Hypothesis | Test | Threshold / prediction |
|---|---|---|---|
| FL1 | `gblur` is the existing blur | Background + coloured layer; `gblur` at sigma 0.1, 1, 3.5, 10, 40; vs (a) `filters/blur.js` `blurRectTo` on the flattened backdrop and (b) scipy (`check_blur_scipy.py` machinery) | (a) bitwise equal at opacity 1, no mask (hard); (b) within the tolerance the B-suite already pre-registered for `blur.js` (cited by number in the verdict, NOT changed). Negative control: `badexp` kernel (B-suite hook) must fail |
| FL2 | order semantics | layer below, layer above, filter between | layer above bitwise unchanged vs the document without the filter (hard); layers below changed; created last it filters the top layer too; moving it reorders accordingly |
| FL3 | opacity, mask, hidden | opacity 0.5; a selection mask (feathered); hidden | 0.5: within 2e-6 of `0.5*back + 0.5*blurred` (premultiplied); outside the mask bitwise equal to the document without the filter (hard); hidden == never existed, bitwise (hard) |
| FL4 | `adjset` equals authoring; validation | both kinds, non-default params; invalid: sigma_x10 0 / 401, amount 0 / 501, radius_x10 0 / 101, threshold 256, wrong keys, floats | composite and hashes bitwise equal to authoring from the start (hard); each invalid case throws and leaves the state unchanged |
| FL5 | `sharpen` is what B.1 says | 6 cases (amount 50 / 100 / 500, radius 0.5 / 10, threshold 0 / 8 / 64) on a photo-like layer with an edge, a flat area and a transparent hole; vs numpy float32 written from B.1 | max abs diff <= 2e-6; flat area unchanged when threshold > 0 (bitwise); no channel exceeds its alpha or drops below 0 (hard); transparent hole stays transparent. Negative control: no clamp reference must FAIL on the overshoot case |
| FL6 | tile correctness (the principle at risk) | filter at sigma 10 above 3 layers; dabs at tile boundaries, in the corner, 1 px inside / outside the radius; dirty-tile recomposite vs full refold | bitwise equal on every case (hard). If not achievable: the B.2 fallback is adopted and recorded as an amendment, not a pass |
| FL7 | PSD (baked) | export with a blur + a sharpen (one with a mask, one hidden); ag-psd and psd-tools read; page bytes vs Node bytes | page bytes == Node bytes (hard); psd-tools sees pixel layers with the baked names, opacity and visibility right; stored merged image within 1 level of the editor composite (hard, opaque backdrop); re-import yields pixel layers (stated, asserted) |
| FL8 | the log is the truth | live editor: add each filter, edit (preview / commit API, ONE entry per drag), hide, reorder, delete, undo-all / redo-all, save -> load, amend an old stroke below a filter, checkpoint resume | live == refold at every step, all hashes equal (hard); 1 entry per drag; entry <= 256 bytes; 3 replays equal; checkpoint with a filter resumes with equal hashes |
| FL9 | phone and cost | 390x844 touch: menu entries and sliders >= 44 px; a drag logs exactly 1 `adjset`; no scroll. Cost: gblur sigma 2 and 10, sharpen radius 5, full canvas 1024^2 | UI as stated (hard). Cost REPORTED; live refresh must be <= 400 ms or the coarse-preview path (B.4) is built and its commit still bitwise exact |
| FL10 | regression | `node witness_all.js`; goldens | all earlier suites incl. editor_adjust 36, editor_admask 33, editor_blur / blur B1-B8 pass; existing goldens bit-identical; thresholds unchanged |
Honest limits fixed now: no filter inside groups and not clippable (as adjustments, Level 2d); the sharpen definition is ours, not another editor's; blur is Gaussian only (no motion / lens blur); filter layers are not live in PSD (B.3); no per-channel filtering; sigma capped at 40 px.

# Build order (each step its own spec section, suite and verdict before the next)
1. A.1 `grad` + GD1-GD4, GD7 (no engine change). 2. A.2 `gradmap` + GD5, GD6, GD8, GD9. 3. B `gblur` + FL1-FL4, FL6, FL8. 4. `sharpen` + FL5, FL7, FL9, FL10. Then update `editor/README.md` (user guide) and the "Features" section of `poc/psd-oplog/README.md`, regenerate `guide.html` via `build_dist.js`.

# Next-session pointer
Start by reading this file, `witness_log/HYPOTHESES.md` Level 2d (AJ1-AJ10) and Level 2g (AM1-AM9), `stack.js` applyAdjust (line ~139), `editor/adjust_ops.js`, `filters/blur.js`. Deploy only on the owner's explicit OK (recipe in `prompts/RESUME_PSD_OPLOG_POC.md`).
