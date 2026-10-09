# Handoff: PSD-replacement POC (op-log + tiles + canonical fold)

For the Claude Code terminal session on the user's machine. Origin: a cloud session whose GitHub push was
refused (403, Claude App not authorised on red1oon/bim-ootb), so this work arrives as a patch.

## Apply
    git checkout -b claude/photoshop-clone-gaps-m5p5mz
    git am psd-oplog-poc.patch      # or: git fetch psd-oplog-poc.bundle claude/photoshop-clone-gaps-m5p5mz
    cd poc/psd-oplog && npm i && npm run precision && npm run tiles_psd && npm run determinism
Set `CHROMIUM=/path/to/chromium` if Playwright's Chromium is elsewhere. Nothing outside `poc/psd-oplog/` is touched.

## Why
Discussion: a vibe-coded Photoshop clone fell short; bim-ootb's pattern (signed op-log = document, deterministic
fold, witnesses as oracle, "extract or compile, never invent") might carry to a layered image editor. This POC
tests the load-bearing assumptions before any UI.

## Findings (software renderers only: V8 + SwiftShader)
| Question | Result |
|---|---|
| 8-bit Canvas2D vs float working format | Ramp x0.25 then x4: Canvas2D keeps 64/256 levels, WebGL RGBA8 65, RGBA16F 256, RGBA32F 256 |
| Browser blend modes vs W3C formulas | 11 modes, max error <= 0.5 level |
| Content-addressed 256px tiles | 8 layers 2048^2, 50 edits: 20.5 MiB vs ~704 MiB full snapshots (~30x) |
| ag-psd round trip | names, blend modes, pixels survive; opacity quantises to 8-bit |
| Canonical float32 CPU fold, Node vs Chromium | bit-identical at 100/1000/3000 ops |
| GPU fold vs CPU f32 | RGBA32F: max 1 level, mean 0. RGBA16F: max 1, mean ~0.05, 0% samples >1 level. No growth with log length |

## Architecture this supports
- Source of truth: signed op-log + content-addressed tiles (could reuse bim-ootb's sql.js / signed-log code).
- Canonical renderer: float32 CPU/WASM fold using only + - * / (no Math.pow/exp/sin) for reproducible witnesses.
- Interactive renderer: WebGL2/WebGPU with float16 textures (Canvas2D is not enough).
- Interchange: ag-psd import/export, scoped to layers, blend modes, masks.
- Tests: W3C blend formulas, golden-image replay hashes, PSD round-trip corpus.

## Not proven (do these next, in order)
1. Run `npm run determinism` on real GPUs (NVIDIA/AMD/Intel/Apple) and a second browser. Fast-math/FMA/driver
   compilers are the biggest risk to the "deterministic fold" claim.
2. Extend the fold: premultiplied alpha, masks, non-separable modes, ICC (LittleCMS WASM).
3. Measure real GPU compositing speed (12 layers at 4096^2); software-GL timing in this POC is meaningless.
4. Op-log schema + replay witness wired into the existing witness conventions.
Known gap with no public oracle: Photoshop-specific soft-light variants, Camera Raw, brush feel.

## Suggested prompt for the terminal session
"Read poc/psd-oplog/HANDOFF.md and README.md. Run the three npm scripts on this machine, report any result that
differs from the tables, then do next-step 1 on the local GPU and add the output to README.md."
