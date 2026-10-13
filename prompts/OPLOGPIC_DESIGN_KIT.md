# ⚠ DO NOT REMOVE
**Scope:** OplogPic (`poc/psd-oplog/editor/`), the "design kit": Part S shapes, Part X layer effects (drop shadow, outline), Part T editable text, Part E export formats and sizes. SPEC ONLY. No code, no test code, until the owner says go and the matching HYPOTHESES.md section (Levels 2k / 2l / 1k / 1l, copied from the tables below) is written.
**Read the log after every run.** Exit code is not evidence; SKIP and silent failures show only in the log. Honour this block until the prompt is DONE.
Rules (owner, do not re-ask): never loosen a threshold, write amendments down BEFORE the passing run; claims about other editors only from their own pages (none are needed here); deploy only on his explicit OK; simple, serverless, mobile-ready; low-key names; the cause = cheap, op-log-true features that real design work needs.

# OplogPic design kit: shapes, effects, editable text, export

## Why these four
What posters, social posts, thumbnails and banners need most, at a cost that keeps the op-log principles: (S) shapes (every layout has boxes, circles, dividers), (X) shadow and outline (what makes text readable; glass text is a variant), (T) changing the words of a caption without starting over, (E) JPEG / WebP and size presets (people share JPEGs). Each is a handful of numbers per log entry, reuses machinery that already passed its witnesses (`filters/blur.js`, selection limits, `amend`, the `img` blob path, the page / Node PSD exporters), and stores no pixels except the caption blob that already exists.
NOT in this kit (decided, written so nobody re-litigates): non-square canvas / crop (the engine, schema and tile code assume width == height: its own project), rotate (resampling rule must be pinned first), liquify, healing, smart objects.

## Op-log principles every item must satisfy (the gates DK9 / per-part regression)
1. **Parameters only.** A shape / effect entry is <= 256 bytes of JSON and holds numbers, never pixels. (Text keeps its existing pixel blob; Part T adds no pixels beyond it.)
2. **Deterministic fold.** Three replays give identical hashes; checkpoint resume gives identical hashes; `Math.fround` per step; `+ - * / Math.sqrt` only (and `S.powDet`, never `Math.exp` / `Math.pow`).
3. **Independent oracle** (numpy / scipy float32 written from the spec, not from our code), with a negative control that must FAIL.
4. **Honest history.** One gesture = ONE log entry; undo / redo / Verify / save -> load / `amend` (re-edit an old entry) reproduce the picture bitwise.
5. **A stated PSD story** (here: all four produce ordinary pixel layers, so the PSD path needs no change; the page exporter `editor/psd_web.js` and the Node exporter `editor/export_psd.js` must stay byte-equal, checked).

---
# PART S: Shapes

## S.1 The op `shape` (editor module `editor/shape_ops.js`; engine and doc schema untouched, like `grad` / `blur`)
`{op:'shape', layer, kind:'rect'|'ellipse'|'line', x0, y0, x1, y1, r?, fill?, c?, a?, stroke?:{w, c, a}}`
- x0..y1 integers inside the canvas, 0..W (for rect / ellipse they are the box corners; x0 < x1 and y0 < y1 else the op throws; for `line` the two end points, which may be equal only if `stroke.w` >= 1, giving a dot). `fill` boolean (default true; absent for `line`); `c` [r,g,b] 0..1 and `a` 0..1 are the fill colour / opacity (required when fill is true). `stroke` optional `{w: integer 1..64, c:[r,g,b], a}`. At least one of fill / stroke must paint, else throws. `r` (rect only) integer corner radius 0..min(half-width, half-height).
- Geometry in pixel-centre coordinates: pixel (x, y) is sampled at (x + 0.5, y + 0.5); box centre `(cx, cy) = ((x0+x1)/2, (y0+y1)/2)`, half sizes `hw = (x1-x0)/2`, `hh = (y1-y0)/2`. A signed distance `d` (negative inside), then coverage `cov = clamp(0.5 - d, 0, 1)` (a 1-pixel linear anti-aliased edge: coverage 0.5 on the boundary, the same rule as `hdab`).
  - rect / rounded rect (exact SDF): `qx = |px-cx| - (hw - r)`, `qy = |py-cy| - (hh - r)`, `d = sqrt(max(qx,0)^2 + max(qy,0)^2) + min(max(qx,qy), 0) - r`.
  - ellipse (first-order distance, exact for a circle): `u = (px-cx)/hw`, `v = (py-cy)/hh`, `f = sqrt(u^2+v^2)`, `g = sqrt((u/hw)^2 + (v/hh)^2)`; `d = (f - 1) * f / g`; at `f == 0`, `d = -min(hw, hh)`.
  - line (capsule): `d = (distance from the pixel centre to the segment) - stroke.w / 2`; a line has no fill, only the stroke.
  - fill coverage = `cov(d) * a`; stroke coverage = `clamp(0.5 - (|d| - w/2), 0, 1) * a_stroke` (centred on the edge; for `line` it is `cov(d)`).
- Painting: premultiplied source-over onto the layer's pixels (as `hdab`): fill first, then the stroke over it. Limited to the active selection exactly as the brush ops are (Level 1c): outside the selection the layer is bitwise untouched.
- `amend` (the existing "Re-edit entry" of an old log entry) must accept `shape` params (x0..y1, r, c, a, stroke): resizing or recolouring a shape later is one amend, not a repaint. If amend's allow-list rejects `shape`, it is extended and SP5 proves it.

## S.2 UI
Shape tool (key `U`; Rect / Round / Ellipse / Line toggles; Fill and Outline toggles; Outline width slider 1-64; Corner radius slider (Round); fill colour = the current colour, outline colour = the second swatch). Drag = bounding box (Shift = square / circle, Line: Shift = 45 degree steps); a thin guide shows while dragging; release logs ONE entry. History label `Rectangle (x0,y0)-(x1,y1)` etc.

## S.3 Hypotheses (thresholds fixed NOW; HYPOTHESES.md "Level 2k" copies this table before any code)
| ID | Hypothesis | Test | Threshold / prediction |
|---|---|---|---|
| SP1 | the shapes are what S.1 says | 10 cases on a 128^2 layer over texture: rect, rounded rect (r 1, 8, max), ellipse (circle, wide, tall), line (horizontal, diagonal), fill + stroke, stroke only; vs an independent numpy float32 reference (`editor/check_shape.py`) | max abs diff <= 2e-6 on every channel; invalid ops (x0 >= x1, outside the canvas, r too big, float coordinates, no fill and no stroke, stroke.w 0 or 65, bad colour, `fill` on a line, unknown field) throw and leave the state unchanged. Negative control: the reference with coverage `clamp(1 - d)` (a 1 px wider edge) must FAIL the threshold |
| SP2 | the geometry is right, independent of the formula | area = sum of fill coverage; symmetry | axis-aligned integer rect: area == w*h exactly; circle / ellipse (sizes 40-120 px): area within 0.5 % of pi*hw*hh; a circle and a rounded rect are mirror-symmetric about their centre axes within 1e-6; a stroke ring's area within 1 % of the analytic ring area |
| SP3 | selection limit | rect, ellipse, wand and inverted selections, then each shape kind | pixels outside the selection bitwise equal to before (hard); inside equal to the unselected result |
| SP4 | the log is the truth | live editor: 5 drags (rect, rounded rect with Shift, ellipse, line, outline-only), undo-all / redo-all, save -> load, Verify, checkpoint resume | live == refold at every step, hashes equal (hard); exactly 1 entry per drag, each <= 256 bytes; 3 replays equal; page layer pixels == the Node replay (sha256) |
| SP5 | re-edit by amend | amend the box and colour of an old rectangle and of an ellipse, then undo / redo | live == refold (hard); the amended picture == the document authored with the new params from the start (hard) |
| SP6 | phone | 390x844 touch: Shape tool button reachable, bar controls >= 44 px, one touch drag logs exactly 1 `shape`, two-finger tap undoes, no scroll | as stated (hard) |
| SP7 | cost | one 1024^2 rounded rect + outline; one full-canvas ellipse | <= 100 ms each (reported; if refuted the loop is limited to the box + outline margin, same result bitwise) |
| SP8 | regression | `node witness_all.js` | all earlier suites pass; thresholds unchanged |
Honest limits fixed now: rotation-free shapes only; the ellipse edge is first-order accurate (exact for circles; for very eccentric ellipses the edge is within ~0.1 px of the true curve, REPORTED by SP2); no polygons / stars / curves; stroke is centred on the edge only (no inside / outside choice); no gradient fill (the Gradient tool + selection covers it).

---
# PART X: Layer effects (drop shadow, outline)

## X.1 The op `fx` (editor module `editor/fx_ops.js`; engine and schema untouched)
Acts on the layer's own pixels and changes them (like the brush ops), parametric and amendable. `{op:'fx', layer, kind:'shadow', dx, dy, blur_x10, c, a}` | `{op:'fx', layer, kind:'stroke', w, c, a}`.
- `shadow`: `dx`, `dy` integers -256..256; `blur_x10` integer 0..400 (sigma = blur_x10 / 10; 0 = hard); `c` [r,g,b] 0..1; `a` 0..1. Build `s(x,y) = c * (a * alpha(x - dx, y - dy))` premultiplied (alpha 0 outside the canvas), blur it with `filters/blur.js` on a copy PADDED with `R = floor(4*sigma + 0.5)` transparent pixels each side (so a shadow near the canvas edge is NOT mirrored back by the blur's reflect rule), crop back, then composite the layer OVER it: `out = layer + s * (1 - alpha_layer)` (premultiplied, float32 each step).
- `stroke` (outline, outside the shape): `w` integer 1..32; `c`, `a` as above. `inside(x,y) = alpha >= 0.5`. `d(x,y)` = Euclidean distance from the pixel centre to the nearest `inside` pixel centre (exact integer-squared transform, then `sqrt`; 0 for inside pixels). Ring coverage `k = clamp(w + 0.5 - d, 0, 1) * a` for `d > 0`, else 0. Composite the layer OVER the ring: `out = layer + (c * k, k) * (1 - alpha_layer)`.
- Selection: limited exactly as the brush ops (outside the selection the layer is bitwise untouched).
- Order matters and is the user's: a shadow made after an outline shadows the outlined shape. The History panel shows each as `Drop shadow on layer N` / `Outline on layer N, W px`. Re-edit = `amend`.

## X.2 UI
Advanced section "Effects" for the active layer: Drop shadow (offset X / Y, Blur, Colour, Opacity, Apply) and Outline (Width, Colour, Opacity, Apply); Apply logs ONE `fx`. A text caption's panel offers its own shadow / outline (Part T) so a caption never needs this.

## X.3 Hypotheses ("Level 2l")
| ID | Hypothesis | Test | Threshold / prediction |
|---|---|---|---|
| FX1 | shadow is what X.1 says | 6 cases (dx,dy,blur) = (6,6,0), (8,-4,3.5), (0,0,10), (-20,15,1), (40,40,25), one with the shape touching the canvas edge; vs numpy / scipy (shift + `gaussian_filter(mode='constant', truncate=4)` on float64, then over-composite in float32) | blur cases within the B1 limits (max <= 5e-6, mean <= 5e-7); hard shadow (blur 0) max diff <= 2e-6; the edge case has NO mirrored shadow (all shadow pixels on the canvas side of the edge are <= the reference + 5e-6). Negative control: reflect-edge blur instead of padding must FAIL on the edge case |
| FX2 | outline is what X.1 says | 6 cases (w 1, 3, 8, 32; a disc, a concave star-like shape, a thin line, an object touching the edge); vs `scipy.ndimage.distance_transform_edt` and the coverage formula in numpy float32 | max abs diff <= 2e-6; negative control: a Chebyshev (square) distance reference must FAIL on the disc |
| FX3 | order and selection | shadow then outline vs outline then shadow; with a rect selection | the two orders differ (hard); outside the selection bitwise unchanged (hard) |
| FX4 | the log is the truth | live editor: apply both effects, `amend` an old shadow's blur and an old outline's width, undo-all / redo-all, save -> load, checkpoint resume | live == refold at every step (hard); 1 entry per Apply, each <= 256 bytes; 3 replays equal |
| FX5 | PSD | an effect layer exported | page PSD bytes == Node exporter bytes (hard); the layer is an ordinary pixel layer (psd-tools) and the stored merged image within 1 level of the editor composite (hard) |
| FX6 | phone | 390x844 touch: the Effects controls >= 44 px, Apply logs 1 entry, no scroll | as stated (hard) |
| FX7 | cost + regression | shadow blur 10 and outline w 8 on a full-canvas layer; `node witness_all.js` | cost REPORTED (padding makes the blur (W+2R)^2); all earlier suites pass, thresholds unchanged |
Honest limits fixed now: effects are baked into the layer's pixels (not live: edit the content AFTER an effect and the shadow does not follow; re-edit by amend or redo the effect); outside-only outline (no inside / centre outline); no inner shadow, glow or bevel in this kit (glow = a shadow with offset 0 and a bright colour: no new op); outline distance is to the 50 % alpha edge.

---
# PART T: Editable text

## T.1 Design decision (stated, with its price)
Today a caption is DRAWN PIXELS from the page's canvas (Level 1f): replay is exact because the log stores the pixels (a 4 MB blob), but the glyphs depend on the device's fonts, and changing the words means deleting the layer and starting again. Two ways to make text editable:
- **(a) chosen for this kit:** keep the pixel-blob truth. The log also records the caption's parameters, so the panel can reopen with them filled in; an edit renders new pixels and REPLACES the layer's pixels. Price: 4 MB blob per edit (the old blob stays for undo), glyph drawing still device-dependent the first time.
- **(b) the real fix, NOT in this kit:** ship an open-licence font and our own deterministic outline rasteriser, so a caption is a string + numbers and replays bit for bit with no blob. A project of its own (font parsing, rasteriser, kerning, licence); write its spec only if the owner asks.

## T.2 Ops (editor module `editor/img_ops.js` extended)
- `{op:'img', id, sha, txt?}` (existing photo / caption op) gains an optional `txt` object; `{op:'imgset', layer, sha, txt?}` is NEW: replaces the pixels of an existing layer from a W*W*4 blob (premultiplied exactly as `img` does), layer must exist and not be a group / adjustment.
- `txt` = `{text (1..200 chars), size 24..300, color [r,g,b] 0..255 integers, anchor 'top'|'middle'|'bottom', align 'left'|'center'|'right', family 'sans'|'serif'|'mono', shadow boolean, outline null | {w 1..20, color [r,g,b]}}`: strict keys, strict ranges; throws otherwise. It is metadata only: the fold uses the blob.
- Add text logs exactly 2 entries as today (`img` carrying `txt`, then `name`). Edit text logs `imgset` (+ `name` if the first 28 characters changed): 1 or 2 entries. The panel reopens from the latest `txt` of the active layer.
- Rendering (page, `editor/text_raster.js` extended): as Level 1f plus `align` (left / right use the 6 % margin), `family` (generic CSS families `ui-sans-serif, system-ui` / `ui-serif, Georgia` / `ui-monospace, Menlo`), `outline` (`strokeText` with `lineJoin = 'round'`, the outline drawn BEFORE the fill, width 2 * w so w px show outside).

## T.3 Hypotheses ("Level 1k")
| ID | Hypothesis | Test | Threshold / prediction |
|---|---|---|---|
| TE1 | alignment | render "Hello balloon design" at size 110 with left / center / right (no shadow) | left: bbox left within 6 % +- 3 px of W; right: bbox right within 94 % +- 3 px; centre: within 3 px of the canvas centre (hard) |
| TE2 | outline | white text with a red (230,0,0) outline w 6, no shadow | red pixels exist outside the white text region (>= 500 px at size 110); the median colour of the fully opaque pixels farthest (> 8 px) from the outline is white +- 2 (hard); no outline: zero red pixels |
| TE3 | edit replaces, history stays honest | add a caption, edit its words and size and colour, through the real panel | the panel opens with the stored values (hard); exactly 1 `imgset` (+ 1 `name` when the first 28 characters changed) per edit; the layer id and its place in the stack unchanged; live == refold; undo restores the previous pixels exactly (sha256), redo the new ones; save -> load equal; page PSD bytes == Node exporter bytes (hard) |
| TE4 | validation | `txt` with an empty string, 201 chars, size 23 / 301, colour 256, bad anchor / align / family, outline w 0 / 21, unknown key; `imgset` on a group, an adjustment, a missing layer, a wrong-size blob | all throw and leave the state unchanged (hard) |
| TE5 | old captions keep working | a log made by the current app (img without `txt`, name) | loads and refolds identically (bitwise); the Edit button is absent for them (hard); Level 1f's T1-T9 still pass |
| TE6 | phone + cost | 390x844 touch: the panel's new controls >= 44 px, inside the viewport, no overflow; cost of an edit at size 110 and 300 | UI as stated (hard); cost REPORTED (a 4 MB blob per edit, and the share link still drops caption blobs as it does photos) |
| TE7 | regression | `node witness_all.js`; editor_text (T1-T9) | all pass; thresholds unchanged. T5 ("exactly 2 new entries") still holds for ADD |
Honest limits fixed now: glyph drawing is device / font dependent the first time a caption is drawn (replay is exact); 4 MB per edit until blob compression exists; one style per caption (no per-letter styling); no auto re-flow when the canvas changes; the second caption font choices are generic families, not named fonts; deterministic text without blobs is option (b) above, not built.

---
# PART E: Export formats and sizes

## E.1 Behaviour (page only; nothing is logged, the log is untouched)
The Export area gains: Format (PNG, JPEG, WebP), Quality (10-100, JPEG / WebP only, default 90), Size (256, 512, 1024 = native, 2048 = enlarged), Background for JPEG (White, Black, Current colour; PNG and WebP keep transparency). Export draws the composite (exactly the pixels on screen, as PNG export does today) onto an export canvas at the chosen size (browser smoothing) and calls `canvas.toBlob(type, quality/100)`. If the browser does not support WebP encoding (it returns PNG) the WebP option is hidden. PNG at 1024 must stay byte-identical to today's export.

## E.2 Hypotheses ("Level 1l")
| ID | Hypothesis | Test | Threshold / prediction |
|---|---|---|---|
| EX1 | formats are real and close to the picture | export a test document (photo-like gradients, hard edges, a transparent corner) as JPEG q90 and WebP q90 at 1024; decode with Pillow | JPEG starts FFD8FF, WebP is RIFF....WEBP; decoded size 1024x1024; mean absolute error vs the PNG export (JPEG composited on the chosen background) <= 3 levels; 99th-percentile error <= 12 levels (hard) |
| EX2 | PNG unchanged | export PNG at 1024 with the new UI present | bytes equal the export made by the current build for the same document (hard) |
| EX3 | sizes | 256 / 512 / 1024 / 2048 for PNG | decoded sizes exact (hard); 1024 is native (no resampling: equals EX2) |
| EX4 | transparency and background | the transparent corner, JPEG with White / Black / Current colour; WebP; PNG | JPEG: the corner pixels equal the background within 3 levels; PNG / WebP: alpha 0 there (hard) |
| EX5 | nothing is logged | each export | `ops.length` unchanged, no undo entry created (hard) |
| EX6 | phone | 390x844 touch: Format, Quality, Size, Background controls >= 44 px; an export triggers a download or the share sheet as PNG does today; no scroll | as stated (hard) |
| EX7 | regression | `node witness_all.js` | all pass; thresholds unchanged |
Honest limits fixed now: encoder output bytes differ between browsers and versions (only the decoded picture is tested, never the bytes); 2048 is an enlargement of a 1024 canvas, not more detail; no CMYK, no colour profile embedding in JPEG / WebP beyond what the browser writes; Safari WebP encoding availability varies (the option is hidden when unsupported).

---
# Build order (each part: its HYPOTHESES section first, then code, suite, verdict, README / guide, commit before the next)
1. Part S shapes (SP1-SP8). 2. Part X effects (FX1-FX7; needs `filters/blur.js`, already verified). 3. Part T editable text (TE1-TE7; the only part that touches the existing caption tests). 4. Part E export (EX1-EX7). Then regenerate `guide.html`, update `editor/README.md` and the "Features" section of `poc/psd-oplog/README.md`. Deploy only on the owner's explicit OK (recipe in `prompts/RESUME_PSD_OPLOG_POC.md`).

# Next-session pointer
Read this file, `witness_log/HYPOTHESES.md` Levels 2i / 2j (GD / FL: the pattern, amendments and verdict style), Level 1f (T1-T9), `editor/grad_ops.js` (the template for a paint op: validate -> apply -> selection limit -> label), `editor/run_gradient.js` (the template for a runner with oracle, live editor and phone checks), `editor/img_ops.js`, `editor/text_raster.js`.
