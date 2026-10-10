# POC: raster op-log as a PSD replacement

Question: could the bim-ootb pattern (signed op-log is the document, geometry/pixels are a deterministic
fold, witnesses are the oracle) carry over to a layered image editor? Run each script; every number below
comes from these files. `npm i` here first, set `CHROMIUM=` if Chromium is not at `/opt/pw-browsers/chromium`.

| Script | Question | Result (headless Chromium, SwiftShader software GL) |
|---|---|---|
| `exp_precision_blend_speed.js` | 8-bit Canvas2D vs float working format | Ramp darken x0.25 then x4: Canvas2D keeps 64/256 levels; WebGL RGBA8 65; **RGBA16F 256, RGBA32F 256** |
| same | Browser blend modes vs W3C formulas | 11 modes, 4096 pairs each: max error <= 0.5 level (free oracle for blend math) |
| same | Op-log replay determinism (Canvas2D, one machine) | 3 replays, identical hash |
| `exp_tiles_psd.js` | Content-addressed 256px tiles vs snapshots | 8 layers 2048^2, 50 local edits: 20.5 MiB vs ~704 MiB of full snapshots |
| same | PSD interchange via ag-psd | Layer names, blend modes, pixels round-trip; opacity quantises to 8-bit |
| `run.js` (`fold.js` + `glfold.js`) | Is a canonical CPU fold reproducible, and how far is the GPU fold from it? | see below |

## run.js: canonical fold vs GPU fold (256^2, soft dabs, normal/multiply/screen, seed 42)

| ops | f32 CPU hash node == chromium | GPU RGBA32F vs CPU f32 | GPU RGBA16F vs CPU f32 | CPU f32 vs f64 |
|---|---|---|---|---|
| 100 | yes | max 1 level, mean 0 | max 1, mean 0.040 | max 1, mean 0 |
| 1000 | yes | max 1, mean 0 | max 1, mean 0.049 | max 1, mean 0 |
| 3000 | yes | max 1, mean 0 | max 1, mean 0.049 | max 1, mean 0 |

Reading: error does not accumulate with log length (3000 ops stays at <= 1 level, 0% of samples over 1 level),
so a float16 GPU preview is acceptable and a float32 CPU fold is a stable canonical reference.

## Limits (be honest)
- Both renderers are software (V8 and SwiftShader). Real GPUs (fast-math, FMA contraction, driver shader
  compilers) are untested; the next check is to run `run.js` on real hardware and a second browser.
- Fold uses only + - * / (IEEE exact); avoid Math.pow/exp/sin in canonical code, engines may differ.
- Only separable blend modes, opaque base, no premultiplied alpha, no ICC, no real brush engine.
- GPU compositing speed is unmeasured (software GL timing is meaningless).
- Photoshop-specific behaviour (soft light variants, non-separable modes, Camera Raw) has no public oracle.

## Steps 1-4: layer stack, op-log witness, PSD round-trip (cloud session, software renderers)

Canonical fold is now a full layer stack (`stack.js`): premultiplied alpha, per-layer blend mode / opacity / mask,
W3C compositing, 10 blend modes, hash-chained JSON op-log. GPU twin in `glstack.js`. All numbers are RGBA8 levels (0-255).

| Check (script) | Result |
|---|---|
| CPU f32 vs independent spec-form float64 compositor (`run_stack.js`, `oracle.js`) | 3 scenes of 440 ops, 10 layers, 3 masks: max 0, mean 0. Per mode: max <= 1 |
| GPU RGBA32F vs CPU f32 | max <= 1 on all scenes and modes |
| GPU RGBA16F vs CPU f32 | max <= 1, mean ~0.03 |
| Canvas2D (browser's own 8-bit W3C compositing) vs CPU | max 3, mean ~0.31, 1.2-1.4% of samples over 1 level: 8-bit premultiplied quantisation, informational only |
| CPU f32 hash, Node vs Chromium | identical on every scene and mode |
| Op-log witness (`witness_oplog.js`, `golden.json`) | replay hashes stable; tamper and reorder detected by the chain |
| PSD round-trip, ag-psd (`psd_roundtrip.js`) | 10 layers + masks: modes, opacity, pixels, masks identical; composite hash equal; 8-bit interchange cost vs float: max <= 2, mean 0.12 |
| PSD read by an independent library (`check_psd_independent.py`, psd-tools) | modes, opacity, pixels, masks identical; psd-tools' own composite vs ours: max 2, mean ~0.5 |

`npm test` runs witness + stack + psd. The psd-tools check needs `pip install psd-tools numpy`.

## Step 5 (needs a person): real-GPU check
Open `gpu_check.html` in a normal browser, click Run, paste the result box back. It reports the GPU name, whether the CPU
fold reproduces the golden hashes on that device, and GPU-vs-CPU error. It warns if the browser fell back to software.

## Limits added by steps 1-4
- Golden hashes were generated on the same software stack they are checked on; the independent check is Node vs Chromium and (step 5) other devices.
- psd-tools is an independent reader/compositor, not Photoshop. Photoshop's own output remains the missing oracle.
- Not covered yet: groups, clipping masks, adjustment layers, layer effects, 16-bit PSD, ICC, non-separable modes (hue/sat/colour/luminosity).

## Step 5 result: real GPU (2026-10-09), `gpu_results/rtx4060-chrome154-linux.json`
Device: NVIDIA GeForce RTX 4060 Laptop GPU via ANGLE/Vulkan, Chrome 154, Linux x86_64. Gate PASS, software renderer not suspected.

| Question | Real-GPU result | Software run (steps 1-4) |
|---|---|---|
| CPU f32 fold == golden hashes (3 full scenes) | **identical, all 3** | (golden source) |
| GPU RGBA32F vs CPU f32 | max 1 level, mean 0.026-0.033, 0% of samples over 1 level | max 1, mean ~0 |
| GPU RGBA16F vs CPU f32 | max 1, mean 0.08-0.16, 0% over 1 level | max 1, mean ~0.03 |
| Canvas2D vs CPU (info) | max 6, mean 0.8-0.9, 20-25% of samples over 1 level on full stacks | max 3, mean 0.31, ~1.3% over 1 level |

Reading:
- The canonical CPU fold reproduced bit-for-bit on a different machine and browser (golden was made in Node on the cloud box). Confirms the + - * / sqrt rule on x86-64 / V8.
- The GPU is **not** bit-identical to the CPU (mean 0.03 vs 0 on software), so it cannot be the canonical renderer. It stays within 1 level on every sample, so it is fine as the interactive preview. This is the planned split.
- Canvas2D gets noticeably worse on the real GPU than on software (max 6, a quarter of samples off by more than 1). Do not use browser Canvas2D compositing for anything canonical; use it, if at all, as a loose sanity check.

### Second engine: Firefox 157 (SpiderMonkey), `gpu_results/firefox157-linux.json`
Same machine (Firefox hides the GPU name, "GTX 980, or similar" is its placeholder; run 2 min after the Chrome one). Gate PASS.
- CPU f32 fold matches golden hashes on all 3 scenes, and all 12 scene hashes equal the Chrome run: **identical across V8 and SpiderMonkey**.
- GL f32 vs CPU: max 1, mean 0.022-0.030, 0% over 1 level. GL f16: max 1, mean 0.08-0.16, 0% over 1 level.
- Canvas2D (info): max 5, mean 0.6, 11-14% over 1 level on full stacks: again loose, but different numbers from Chrome, so it is engine-dependent.
- The GL numbers are nonzero (software GL gave 0), which is consistent with hardware GL, but the masked renderer string means this is inference, not proof.

Still open: Safari/JavaScriptCore, a non-x86 device (Apple Silicon / ARM), and a second GPU vendor. Two engines on one machine do not prove portability.

## ICC colour management (`icc/`, cloud session; `npm run icc`)
LittleCMS compiled to WASM (`lcms-wasm`, lcms 2.16) is checked against (a) an independent float64 colour oracle
(`color_math.js`: Bradford adaptation, XYZ/Lab, CIEDE2000 validated against Sharma's published test pairs, error 4e-5),
(b) native LittleCMS 2.19 through Pillow, (c) itself across Node and Chromium. Display-P3 comes from our own ICC v4
profile writer (`icc_write.js`), so no external RGB profile is needed. The CMYK profile is Ghostscript's generic
`default_cmyk.icc`, fetched by `icc/fetch_profiles.sh` with a checksum and **not committed** (its licence is its owner's).

| Check | Result |
|---|---|
| sRGB -> Lab vs float64 oracle (729 colours) | dE2000 max 0.013 (default flags), 0.002 (NOOPTIMIZE) |
| sRGB -> Display-P3, 8-bit, vs oracle | max 0.52 level |
| sRGB -> P3 -> sRGB, **8-bit** | 4 levels max, **identical to the oracle's own 8-bit round trip**: inherent loss of squeezing sRGB into a wider 8-bit gamut |
| sRGB -> P3 -> sRGB, **16-bit**, lcms default flags | **12.97 levels** (worst: sRGB yellow 255,255,0 returns blue = 13, expected 0) |
| same, HIGHRESPRECALC | 8.27 levels |
| same, **cmsFLAGS_NOOPTIMIZE** | **0.039 levels** (exact) |
| P3 primaries into sRGB | clip cleanly to the sRGB edge (relative colorimetric, no gamut mapping) |
| CMYK press profile, sRGB-ified primaries | paper 255,255,255; K100 35,31,32; C100 0,174,239; M100 236,0,140; Y100 255,242,0; K ramp monotonic |
| sRGB -> CMYK -> sRGB, 4913 colours, relcol + BPC | dE2000 median 2.9, p95 13.5, max 16.1; neutrals max 2.0; 36% over 5 (sRGB is wider than the press gamut) |
| lcms-wasm vs native lcms 2.19 (Pillow) | **100% identical** on sRGB->P3 (default and NOOPTIMIZE), sRGB->CMYK (relcol, perceptual), CMYK->sRGB |
| Node vs Chromium | all output hashes identical; `icc/golden_icc.json` holds them |
| Throughput, 2 MPx, one core (Node / Chromium) | sRGB->P3 8-bit default 41 / 26; 8-bit NOOPTIMIZE 3.0 / 3.0; 16-bit NOOPTIMIZE 2.8 / 2.6; sRGB->CMYK default 27 / 21 MPx/s |

Findings that change the design:
1. **Never use lcms' default optimisation for 16-bit RGB->RGB.** Its precomputed CLUT is wrong by up to 13 levels near the gamut edge. The 8-bit default path is fine (matrix-shaper). The canonical path must use NOOPTIMIZE, which is exact but ~10x slower (about 3 MPx/s: a 24 MP photo takes ~8 s). Keep the optimised 8-bit path for interactive preview only.
2. **Keep the working space float or 16-bit between conversions.** 8-bit P3 round trips lose up to 4 levels by themselves, independent of the CMM. This agrees with the earlier float16 finding.
3. **Matrix/TRC RGB profiles do not need an ICC engine in the hot path.** They are a 3x3 matrix plus the sRGB curve, which is trivial on the GPU and was matched by the oracle to 0.5 level. Use lcms-wasm for LUT profiles (CMYK) and for reading arbitrary profiles. Caveat for the canonical CPU fold: `Math.pow` is not bit-exact across engines, so any curve in canonical code must come from WASM (as lcms does) or a table built with deterministic arithmetic.
4. lcms-wasm giving identical bytes to native lcms despite different versions and compilers is strong evidence the WASM route is trustworthy for witnesses.

Limits: one CMYK profile (generic, not a certified press condition like FOGRA/SWOP); relative colorimetric and perceptual only; no
gamut mapping beyond clipping; Display-P3 profile is generated, not Apple's file; Node and Chromium are both V8 on x86-64, so
Firefox/Safari/ARM runs of the ICC hashes are still open; Lab/CMYK values were not compared to Photoshop's output.

### Colour-managed document fold (`icc/color_fold.js`, runs inside `npm run icc`)
Document model: each layer carries a source space (sRGB or Display-P3), the document has a working space, layers are converted on
import (lcms, 16-bit, NOOPTIMIZE) into float, composited by the canonical stack fold, then exported to sRGB / P3 / CMYK. Two seeded
10-layer scenes with masks, alternating sRGB- and P3-tagged layers.

| Check | Result |
|---|---|
| Pipeline vs an independent float64 path (colour_math + spec compositor, no ICC engine), 2 scenes x 2 working spaces x 2 display spaces | **max 1 level, mean <= 0.002** in all 8 combinations |
| Node vs Chromium | all outputs (displays, CMYK export, soft-proof) hash-identical; golden in `icc/golden_icc.json` |
| Working space changes the result (same layers, composited in sRGB vs in P3, shown on sRGB) | dE2000 median 1.2, p95 5.8, max 12.8 (layers all sRGB-tagged: median 1.1, p95 4.2, max 11.2) |
| Gamma-encoded vs linear-light compositing (sRGB, all 10 blend modes) | **dE2000 median 8.6, p95 17.0, max 31.0** |
| Soft-proof through the CMYK profile (sRGB->CMYK->sRGB) | neutral ramp: 0% flagged (dE2000 max 2.3); saturated scene: 0.31% flagged (dE2000 > 5), max 6.3 |

Findings:
1. The ICC import/export plumbing is accurate: with 16-bit NOOPTIMIZE conversions, the colour-managed fold matches an independent float64 computation to 1 level.
2. **The compositing space is a first-order product decision, not a detail.** Gamma vs linear light differs by dE2000 ~9 on average, and the working RGB primaries alone move results by ~1-6 dE2000. To look like Photoshop, composite gamma-encoded in the document's working space (its default); offer linear light as an explicit option. The space must be recorded in the document, or replay will not reproduce.
3. A soft-proof gamut warning built from the CMYK round trip separates neutrals (never flagged) from out-of-gamut colours (flagged), but this scene is low-saturation after blending, so only 0.3% of pixels trip it. It needs a highly saturated test scene before trusting thresholds.

Limits: layers are 8-bit tagged data; no 16-bit/float layer import, no embedded-profile reading from PSD yet, no per-layer rendering intent,
no gamut mapping (clipping only), no black-point compensation test for RGB->RGB, one generic CMYK profile.

## Op-log schema v1 and PSD profile import (`doc/`, `npm run doc`)
`doc/schema.js` defines a strict, versioned op-log for a colour-managed document (header comment is the spec): a first `doc` op records
`working` space (`srgb`|`p3`|`adobe`|`icc:<sha256>`) and `gamma` (`encoded` = Photoshop default | `linear`); every `layer` records its pixel
`space`; `raster`/`maskraster` ops reference content-addressed pixel blobs by sha256 (the tile-store idea). Unknown ops and unknown fields
are rejected, referenced blobs and profiles are verified by size and hash. `doc/docfold.js` folds it (canonical stack fold + lcms 16-bit
NOOPTIMIZE conversions). `doc/psd_icc.js` parses PSD image resources directly (ICC = resource 1039, untagged flag = 1041) and identifies a
profile by what it does (colorants + curve), not by name; `doc/psd_import.js` turns an RGB/8-bit PSD into ops + blobs.

| Check | Result |
|---|---|
| Schema-driven fold vs independent float64 reference: 3 working spaces x encoded/linear x sRGB/P3 display (12) + embedded-profile docs (2) | **max 1 level, mean <= 0.002** in all 14 |
| Schema rejects invalid logs | 21 of 21 cases rejected (missing/duplicate doc op, bad version/space/gamma/mode/opacity/colour/geometry, unknown op/field, unknown layer, mask paint without mask, linear + embedded profile, missing blob, wrong-size blob, blob with wrong hash) |
| Replay / serialisation | replay twice identical; JSON round trip identical; changing `working`, `gamma` or one layer's `space` each changes the output (nothing colour-related is implied) |
| Hash chain | verifies; editing the `doc` op is detected at entry 0 |
| PSD ICC resource round trip | embedded profile comes back byte-identical in all 6 cases; psd-tools (independent parser) reads the identical profile, layer count, blend modes and opacities |
| Profile identification | our sRGB / Display-P3 / Adobe RGB profiles recognised; Ghostscript's real v2 `default_rgb.icc` recognised as sRGB (colorants within 1.8e-4, curve within 6e-6); a gamma-1.8 profile matches nothing and is kept as an embedded `icc:` profile |
| PSD import fidelity | 0 pixel or mask mismatches in all 6; imported render vs float64 reference max <= 1 level |
| Untagged PSD | imported as sRGB (documented assumption, flagged in the import info) |
| Unsupported PSDs | CMYK mode, 16-bit depth, PSB, bad signature: all rejected with an explicit error |
| **Negative control** (ignore the embedded profile) | P3 file: max 48 levels, mean 2.6 off; Adobe RGB file: max 117 levels, mean 3.8 off, and the gate fails as it should |
| Node vs Chromium | 20/20 documents hash-identical; golden in `doc/golden_doc.json` |

Limits: RGB 8-bit square documents only; no groups, adjustment layers or effects; one profile per document (as in PSD), and "untagged = sRGB" is
an assumption (Photoshop's colour settings could say otherwise); LUT-based RGB profiles are carried as `icc:` profiles and converted by lcms but
have no float64 oracle; linear compositing only for built-in working spaces; the embedded-profile reference uses a generated gamma-1.8 profile,
not a profile exported by Photoshop; no PSD *export* of the schema yet.

## PSD export (`doc/psd_export.js`, `npm run export`)
Op-log -> PSD: each layer is converted into the document's working space (a PSD has one profile per file), 8-bit straight RGBA + byte opacity + 8-bit mask are written,
the working-space profile is embedded as image resource 1039 (built-in spaces use the generated matrix profile, `icc:` spaces embed the exact blob), and the merged
composite is stored for viewers that ignore layers. **Linear-light documents and invalid logs are refused** (no verified PSD representation of linear compositing).

| Check (5 documents: 3 working spaces with mixed-space layers, pure P3, embedded gamma-1.8 working space) | Result |
|---|---|
| Export is deterministic | identical bytes on repeat |
| Embedded profile is the working space; import recognises it | 5 / 5 |
| Export -> import -> fold vs an independent float64 reference that applies the same 8-bit quantisation (working-space display) | **max 1 level**, mean <= 0.002 |
| Same, on an sRGB display | max 1-3 levels (3 on 4 of ~49k samples, embedded profile), mean <= 0.004: a 1-level flip in a wide-gamut 8-bit layer becomes up to ~3 sRGB levels near the gamut edge |
| Fixed point | export -> import -> export -> import gives identical ops and blobs; PSD bytes identical from generation 2 on (generation 1 differs only in the stored merged preview, which is recomputed from the 8-bit layers) |
| Drift vs the unquantised original (informational, sRGB display) | mean 0.16-0.20 level; max 1, 1, 2, 4, 6 levels. Inherent cost of 8-bit layers in a wide gamut |
| Our lcms conversion of the stored picture to sRGB vs the float64 oracle | max <= 1 level |
| **psd-tools** (independent parser) reads the file | embedded profile byte-identical, layer count and masks right, stored merged image exact (0 levels) when read raw |
| psd-tools applies **our embedded profile** (Pillow/LittleCMS) to the stored picture vs the float64 oracle | **max 1, mean <= 0.011, 0% of samples over 2** in all 5 files |
| psd-tools' own layer composite (raw) vs ours | max 2, mean ~0.5 |
| psd-tools' layer composite after its profile conversion vs our sRGB render | max 1-8, mean ~0.5; the 8 is the 2-level raw composite difference amplified by the sRGB toe at the gamut edge |

Note on method: an early hypothesis blamed the larger differences on LittleCMS' default 8-bit optimisation. Measuring against the float64 oracle on the *same stored picture* refuted it
(psd-tools' conversion is within 1 level); the real cause was comparing two different pictures (merged image from float layers vs a recomposite of 8-bit layers).

Limits: the embedded profile for built-in spaces is a generated matrix profile, not Adobe's/ICC's official profile, so Photoshop will show it as a custom profile; not opened in Photoshop itself
(only ag-psd, psd-tools and our importer); RGB 8-bit only; no groups; golden PSD byte hashes depend on the pinned ag-psd version; a layer's original space is not kept (it is converted to the working space on export).

## Third-party readers on a Linux desktop (`app_results/red1-Vi-2026-10-10.md`, run by a terminal Claude Code session)
Available: ImageMagick 6.9.12 (lcms2), Pillow (lcms) and psd-tools 1.24. Not installed, so **not checked**: Krita, GIMP, ImageMagick 7, exiftool, and Photoshop (does not run on Linux).
- Both readers report the embedded profile, 10 layers, 3 masks, blend modes and opacities exactly as written; none rejected, warned or asked about any of the 5 files. ImageMagick labels every scene "sRGB" whatever the profile (a label, no conversion).
- Profiles are named "...-like matrix profile (psd-oplog generated)" / "custom gamma-1.8 test profile": neither app maps them to a named standard profile (expected: they are generated).
- The stored merged picture converted to sRGB through the embedded profile matches the float64 oracle within 1 level (dE2000 max <= 1.03) in both apps for all 5 files; unconverted it is off by up to 92 levels, so the profile is genuinely needed and used.
- `srgb_mixed` vs `p3_mixed` after conversion differ (dE2000 median 1.41, p95 4.91, max 13.3). **This is expected, not a defect**: they hold the same layers composited in different working spaces, which matches the earlier working-space finding (median 1.2, p95 5.8, max 12.8); the oracle gives the same numbers. (An earlier checklist wrongly said they should look nearly identical.)
- ImageMagick does not re-blend layers (it shows the merged preview and per-layer alpha with mask and opacity folded in); psd-tools' own layer re-render is within 2-11 levels. So these readers confirm profile, structure and the stored preview, not independent blending.
- Still open for a person: Photoshop, Krita, GIMP; especially the convert-or-keep dialog for `embedded_custom_working.psd`.

## Groups and clipping masks (schema v2; `doc/run_groups.js`, `npm run groups`; 153 logged checks; hypotheses H16-H29 in `witness_log/HYPOTHESES.md`)
Semantics: **pass-through group** (children blend with the backdrop, then lerp by opacity*mask); **isolated group** (any other mode: composite on transparency, then blend like a layer);
**clipping**: base layer + clipped layers form an isolated unit, clipped layers composite onto it with the ordinary W3C source-over formula (the unit's alpha grows along the chain),
the straight colour is kept and the **base layer's alpha is reimposed once at the end**; the unit is then blended with the BASE layer's mode/opacity/mask. A clip base must be a layer.
Nesting up to 16 deep. Not supported: `clbl` ("blend clipped elements" OFF), clipping to a group, adjustment layers.

| Check | Result |
|---|---|
| Pass-through group (opacity 1) == flat stack; 2 nested pass-through groups == flat | bit-identical f32 hash |
| Isolated normal group of normal layers == flat | 2.4e-7 max abs diff |
| Isolation is observable (negative control: non-normal layers in an isolated group) | 97 levels different |
| Clip invariants: unit alpha == base alpha, nothing drawn outside the base (3727 outside pixels, 12657 inside pixels changed) | 0 violations; unclipped control leaks |
| No-op invariants: empty group, opacity 0, all-zero mask, opacity 0.5 = midpoint | exact / 3e-8 |
| Canonical + lcms vs an independent float64 straight-alpha tree compositor, 20 comparisons (3 seeds x 3 working spaces, linear, mixed layer spaces) | max 1 level, worst mean 0.0025 |
| Mutation controls (pass-through->isolated, clip flags dropped, group opacity ignored) are detected | 71 / 151 / 37 levels; unmutated 1 |
| Schema v2 rejections (v1 with group/parent/clip, clip first, clip base a group, bad parent, depth 17, shared ids, ...) | 16 / 16 rejected |
| PSD export -> import: tree preserved, quantised float64 reference, fixed point (4 scenes) | identical tree; max 1 level; ops identical |
| psd-tools (independent) reads the exported tree | exact (nesting, PASS_THROUGH, modes, opacity bytes, masks, clip flags) |
| psd-tools' own composite vs ours, in-sample (4 scenes) | mean 0.46-0.48, max 2 (**fitted**, see below) |
| **Out-of-sample**: 6 documents the clip rule was never fitted on (3-layer chain, masked base+clip, pass-through group with chain, isolated group with nested chains in P3, two clip units in a row, opaque control) | **mean 0.28-0.56, max 1-2, 0% of pixels over 8** (pre-registered: mean <= 0.8, <= 0.5% over 8) |
| Node vs Chromium on all group documents | 20 / 20 identical |

How the clipping rule was found (numbers, not eyeballing): my first definition (Porter-Duff source-atop) disagreed with psd-tools by mean 10.3 / 3.1 / 5.0 levels on soft-edged clip bases, while every group
feature agreed to 0.43-0.48 before any change. Candidate formulas computed in float64 from the same layer pixels (`doc/diag_clip_semantics.py`, `diag_clip_normal.py`, `diag_clip_chain.py`) isolated the
cause to two points: the W3C over colour rule for partially transparent bases (0.42), and alpha growth carried through a chain (0.43 vs 1.9 / 3.7 for restoring after each layer). The rule is identical to
source-atop whenever the base pixel is opaque (1.45e-7). **Caveats**: the rule was fitted twice to psd-tools, so in-sample agreement is not independent evidence (the held-out set is); psd-tools is
not Photoshop, and Photoshop's behaviour on partially transparent clip bases is **unknown / deferred**; GPU twin (`glstack.js`) does not implement groups or clipping yet.

## Panel screenshot (`panel/`, `npm run panel`)
`panel/panel.html` is a small viewer that renders a 235-op sample document (`panel/sample_doc.js`: groups, clipped layers, a masked vignette, sRGB + P3 layers in a P3 working space) through the same engine
(canonical fold + lcms-wasm) and shows the layer tree, document info and the live witness numbers from `witness_log/latest/`. `node panel/make_screenshot.js` captures it headlessly to
`panel/out/panel_sample.png` (git-ignored). It is a POC viewer for engine output, **not an editor**: no tools, no editing, no Photoshop UI; the layout is generic.

## Non-separable blend modes: hue, saturation, color, luminosity (schema v2 only; `doc/run_nonsep.js`, `npm run nonsep`; 112 logged checks)
Implemented straight from the W3C compositing definitions (Lum 0.3/0.59/0.11, Sat, SetLum, SetSat, ClipColor) in the canonical f32 code, and separately in float64 in `oracle.js`; **not fitted to any reference**.

| Check | Result |
|---|---|
| Luminosity preserved by construction (200k random pairs x 4 modes) | worst deviation 1.9e-7 (limit 5e-6); results inside [0,1] |
| Compositor-only: canonical f32 vs the independent oracle on identical converted layers, 10 documents (single modes, groups, clips, P3) | worst 1 level, 0 samples over 1; the canonical source run in float64 matches the oracle exactly |
| Same, oracle fed the lcms-converted layers | worst 1 level, 0 over 1 (so the gap below is conversion input, not the compositor) |
| Whole pipeline vs exact float64 | worst 2 levels on 1 of 10 documents (hue/saturation divide by quantities near zero for near-grey colours, amplifying lcms' conversion error) |
| psd-tools' own compositor vs ours, like for like (6 PSDs incl. groups, clips, P3) | **mean 0.50, max 1 level, 0% of pixels over 8** (unfitted, so independent evidence) |
| Mutation controls (hue->color, hue->normal, hue->saturation) | 81 / 98 / 143 levels detected; unmutated 1 |
| Schema | v1 rejects all four; v2 accepts them on layers and groups; the 10 older modes unchanged |
| PSD round trip | modes and tree preserved; fixed point; psd-tools reads the same modes |
| Node vs Chromium | 20 / 20 identical |

Method notes: the first run failed 3 pre-registered checks; two were my own test-design/diagnosis errors (a float-vs-8-bit picture comparison, and an explanation "16-bit rounding" that the numbers refuted). Both are recorded in `witness_log/HYPOTHESES.md`;
the PSD importer also had a real bug (flat docs using these modes were stamped v1) that the schema gate caught. Limits: no GPU twin yet; Photoshop's own hue/color definitions may differ from W3C (unknown, deferred).

## Tile store behind `raster` blobs (`tiles/`, `npm run tiles`; 17 logged checks, H32-H38)
`tiles/tilestore.js`: a raster blob is split into 64x64 tiles, each stored once under the sha256 of its bytes in a SQLite file (sql.js); the blob id stays the sha256 of the WHOLE blob, so `raster` ops, hash chains and all
golden hashes are unchanged. Reads re-verify every tile hash, tile size and the whole-blob hash, so corruption cannot yield a silently wrong image.

| Check | Result |
|---|---|
| Round trip, 40 blobs incl. odd sizes (1x1, 63x65, 130x70), 1 and 4 channels; id == sha256(whole) | 0 mismatches |
| Dedupe: 8 layers x 51 versions (50 edits of ~100x100), 512x512 | 829 unique / 26,112 logical tiles = **3.2%** (limit 4.0%) |
| Persistence: exported SQLite reopened in a fresh sql.js (Node) and in Chromium | 100% byte-identical (58/58 in the browser, pure-JS sha256) |
| `docfold` + schema validation backed by the tile store vs Map-backed blobs (flat P3; groups + clip + non-separable) | identical f32 and sRGB render hashes |
| Corruption: 300 random (tile bit flip, swapped manifest ids, truncated manifest) | 300/300 detected, 0 silent wrong reads; wrong-tile-size control detected |
| Region reads (200 random, 512x512 layer) | tiles touched exactly as predicted; bytes equal the slice |

Limits: edits are synthetic, storage is uncompressed, single-file SQLite with no concurrency tests, hashing speed not benchmarked, no streaming into the fold yet (the fold still loads whole layers).

## Adjustment layers: invert, levels, threshold, posterize (schema v2, gamma "encoded" only; `doc/run_adjust.js`, `npm run adjust`; 76 logged checks, H40-H49)
`{op:'adjust', id, kind, params, opacity, mask, parent?}` transforms the composite beneath it within its parent context (pass-through group: the whole backdrop; isolated group: that group's content), lerped by opacity x mask on the
straight colour; alpha is never changed. Definitions follow the Photoshop integer model and were **not fitted**: levels (in_black, in_white, gamma_x100, out_black, out_white; gamma x100 as PSD stores it), threshold (white iff
round(255 * (0.3R + 0.59G + 0.11B)) >= level), posterize (floor(c * 255/256 * n) / (n-1), which equals the PS 8-bit mapping floor(v*n/256) exactly), invert. The canonical code cannot use `Math.pow` (not bit-exact across engines), so
levels gamma uses a deterministic pow built from + - * / only (max relative error 5e-14 over 1e6 pairs; hash identical in Node and Chromium).

| Check | Result |
|---|---|
| Posterize == PS integer mapping, all 256 inputs x every n in 2..255 | 0 violations |
| Threshold on greys, all 255 levels x 256 inputs | 0 violations |
| Identity levels / opacity 0 / zero mask are exact no-ops (and invert at opacity 1 is not) | exact |
| Scoping: root adjustment == pointwise function of the composite beneath; inside an isolated group it changes 0 pixels outside the group's footprint | 2e-6 max abs; 0 pixels |
| Continuous kinds (invert, levels) vs the independent float64 oracle in documents with masks, groups, P3 | max 1 level, mean <= 0.05 |
| Step functions (threshold, posterize): compositor-only flips; whole-pipeline flips | <= 0.05% / <= 0.2% of samples over 1 level (flips next to a boundary are inherent) |
| psd-tools reads the same kinds and parameters; continuous kinds vs psd-tools' compositor | exact parameters; mean 0.55 / 0.57 against our float picture truncated like psd-tools does; 0% of pixels over 8 |
| Step functions vs psd-tools, tolerance-aware (pixels not within 1.5 levels of a boundary) | <= 0.1% disagree |
| Mutation controls (invert no-op, gamma ignored, threshold +20, posterize n+1) | 132 / 62 / 255 / 51 levels detected |
| Schema (v1 and linear-light rejected, ranges, ints, no clipping to an adjustment, no blend mode) | 20/20 invalid logs rejected |
| PSD round trip (kinds, params, opacity, masks, nesting) and fixed point; per-channel levels rejected, master-only accepted | identical |

**Finding about psd-tools (affects every earlier comparison):** its output stage truncates (`astype(uint8)` after `255*c`) where we round, which adds a ~0.5 level bias to any comparison with a rounded picture. The earlier groups, clipping and non-separable
means (0.28-0.65) should be read as ~0.5 bias + residual; they passed with margin. The pre-registered adjustment check "mean <= 1.0 vs our rounded picture" failed at 1.05 for that reason and was replaced (ledger H44a -> H44d) by a truncation-aligned
comparison (0.55). Limits: no curves / hue-saturation / brightness-contrast / exposure / per-channel levels; no adjustments in linear-light documents; adjustments have no blend mode and cannot be clipped; no GPU twin.

## Curves adjustment (`doc/run_curves.js`, `npm run curves`; 32 logged checks, H50-H56)
`kind: "curves"`, `params: {points: [[x, y], ...]}` (2..16 integer pairs in 0..255, x strictly increasing; master curve only). Evaluation: **natural cubic spline** through the points in double precision (tridiagonal solve using only + - * /), constant outside the
first and last point, clipped to [0,1]. The spline family is a compatibility choice (psd-tools and GIMP use natural cubic splines); **Photoshop's own spline is unknown and deferred**.

| Check | Result |
|---|---|
| Spline math vs scipy `CubicSpline(natural)` (independent), 4000 random curves x 356 inputs | max abs diff 3e-8 (float32 rounding); the independent float64 oracle matches scipy to 5e-14 |
| Control points interpolated exactly (double precision) / identity curve is an exact no-op | 0 error / hash-identical |
| Documents (masks, nested groups, P3, mixed with levels) vs the float64 oracle | max 1 level, mean <= 0.05 |
| psd-tools reads the same points; its compositor vs our float picture truncated like psd-tools | exact points; mean 0.53 / 0.52; 0% of pixels over 8 levels |
| Mutation controls (x/y swapped, a point dropped, linear instead of spline) | 39 / 49 / 16 levels detected |
| Schema (12 invalid curve logs) and PSD import (per-channel rejected, master-only accepted) | all rejected / accepted as listed |
| PSD round trip and fixed point; Node vs Chromium | identical; 5/5 identical |

Method notes: two of my own test-design errors surfaced and were fixed with logged predictions (the knot check fed a float32-rounded position into a steep curve; my first slope estimate under-estimated a steep cubic). Limits: no per-channel curves, no curves in linear-light documents, max 16 points, no GPU twin.

## 16-bit layers (`doc/run_depth16.js`, `npm run depth16`)
`exportPsd(ops, ctx, {depth: 16})` writes real 16-bit PSDs (raw big-endian channel data for layers, masks and the merged image) through `vendor/ag-psd16`, a generated 115-line patch of ag-psd's writer (stock ag-psd throws on depth 16). `importPsd` accepts depth 8 and 16 (32 and 1 rejected) and emits `raster16` / `maskraster16` blobs (little-endian u16, straight RGBA). Result: 16-bit round trip drift is <= 1 level on the 8-bit display and ~5 units of 65535 at worst (8-bit round trip: mean 0.14-0.17 levels). Limits: opacity is 8-bit in the PSD format; the sRGB `para` curve in an s15Fixed16 ICC profile costs up to ~32 units in the darkest eighth (measured, H60o).
Found on the way: the exporter rounded float32 opacities (0.9 -> 229 instead of 230), a bug shared by the older tests; fixed, 10 PSD byte goldens updated, fold hashes unchanged.

## Speed, log growth, checkpoints (`perf/run_perf.js`, `npm run perf`; verdicts P1-P9 in `witness_log/HYPOTHESES.md`)
Single-thread JS on a 2.1 GHz Xeon. Composite of 8 layers: 12 / 47 / 174 / 496 ms at 256 / 512 / 1024 / 2048 px. Full refold at 2048^2 (8 layers x 40 dabs) 2978 ms, so refolding the whole log per edit is not interactive; a one-layer cached edit still 972 ms (the full composite dominates). A dab costs 0.013-0.77 ms for r 10-80, independent of canvas size. A stroke is ~98 bytes (260 with the hash chain); 100k strokes = 9.8 MB raw / 26 MB chained; chain build+verify ~1.6 s each; replaying 100k strokes at 1024^2 takes 8.5 s (linear). Checkpoint at 90k + the 10k-op tail is hash-identical and 8.5x faster, but the float32 checkpoint is 67 MB (7x the log), so it needs tile dedup. 4 of the 18 pre-registered checks missed (two in P1 scaling shape, P5 chain overhead by 1%, P5 gzip ratio 28% vs 25% on worst-case random input); thresholds were not changed. Next design step: dirty-tile compositing + GPU preview.

## Dirty-tile compositing (`perf/dirty.js`, `perf/run_dirty.js`, `npm run dirty`; verdicts D1-D6 in `witness_log/HYPOTHESES.md`; run on a terminal session, i5-13500HX, Node 20)
A persistent backdrop is updated per edit by recompositing only the 64x64 tiles a dab can touch, using the unchanged canonical `composite` on cropped layers. Result is bit-identical to the full composite after every op (flat and tree documents, 0 mismatches; 0 pixels change outside the reported tiles; both negative controls detected). At 2048^2: one dab = 11 ms (flat, 8 layers) / 11 ms (tree) vs 752 / 1090 ms for a full composite (70x / 102x). Limits: non-local ops still recomposite everything, W must be a multiple of 64, dabs only.
