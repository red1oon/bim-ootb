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
