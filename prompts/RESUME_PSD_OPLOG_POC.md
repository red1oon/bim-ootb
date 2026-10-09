# RESUME: PSD-replacement POC (raster op-log + tiles + canonical fold)

Branch: `claude/photoshop-clone-gaps-m5p5mz`. Code: `poc/psd-oplog/`. Results and limits: `poc/psd-oplog/README.md`
(tables), design rationale: `poc/psd-oplog/HANDOFF.md`. Do not restate them here.

## State
- DONE (cloud, software renderers): precision, blend modes, tile store, op-log witness with hash chain, layer stack with
  alpha/opacity/masks/10 blend modes (CPU f32 canonical + WebGL twin), PSD round-trip (ag-psd and independent psd-tools).
- WAITING ON A PERSON: step 5, real-GPU run via `poc/psd-oplog/gpu_check.html` (see below). Result decides whether the
  "deterministic fold" claim survives real hardware.
- NEXT after step 5 (cloud-friendly): ICC (LittleCMS WASM), groups / clipping masks, non-separable modes, tile-store
  wired to the fold, op-log signing with bim-ootb's existing signed-log code. Step 7 (brush feel) needs a person.

## Step 5, for the person (about 5 minutes)
1. `git fetch origin && git checkout claude/photoshop-clone-gaps-m5p5mz && git pull`
2. Open `poc/psd-oplog/gpu_check.html` in your normal browser (double-click), click Run, wait for "done".
3. Check the Verdict line and the "Where it ran" line: it must name your real GPU, not SwiftShader / llvmpipe.
4. Copy the box under "Copy this" and paste it to Claude (or save it as `poc/psd-oplog/gpu_results/<device>.json`).
5. Repeat in a second browser (Firefox/Safari/Edge) and on a second device if available.

## If you are Claude resuming
- Run `cd poc/psd-oplog && npm i && npm test` first; any number that differs from README.md is the first thing to report.
- For a step-5 JSON: read gate, fails, software_renderer_suspected, and cpu_matches_golden per scene. If cpu_matches_golden
  is false anywhere, the CPU fold is not portable (investigate FMA / Math.fround / sqrt) before building anything else.
- Add each device's result to README.md under Step 5 with its renderer string.

## Rules (repo conventions)
- No `filter=lfs`, no binaries/DBs in the POC. Do not touch anything outside `poc/psd-oplog/` and `prompts/`.
- Talk is cheap: every claim added to README needs a script that reproduces it. Canonical code uses + - * / sqrt only.
