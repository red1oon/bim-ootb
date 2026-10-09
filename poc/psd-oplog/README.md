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
