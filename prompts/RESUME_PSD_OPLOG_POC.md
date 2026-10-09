# RESUME: PSD-replacement POC (raster op-log + tiles + canonical fold)

Branch: `claude/photoshop-clone-gaps-m5p5mz` (origin). Code: `poc/psd-oplog/`. Findings, architecture and
the not-yet-proven list are in `poc/psd-oplog/HANDOFF.md` and `poc/psd-oplog/README.md`; do not restate them here.

## State
- Done (cloud session, software renderers only): precision, blend-mode, tile-store, ag-psd, CPU-vs-WebGL fold.
- NOT done: real-GPU run, second browser, alpha/masks/ICC, real GPU speed, op-log schema + witness.

## First task this session
1. `cd poc/psd-oplog && npm i && npm run precision && npm run tiles_psd && npm run determinism`
2. Compare to the tables in README.md; report any differing number.
3. Run `npm run determinism` with the browser on the real GPU (drop the SwiftShader flags in run.js, or set
   CHROMIUM to a GPU-enabled Chrome). Record renderer string + diffs in README.md.
4. Only then extend the fold (premultiplied alpha, masks, ICC). Keep canonical code to + - * / only.

## Rules (repo conventions)
- No `filter=lfs`, no binaries/DBs in the POC. Do not touch anything outside `poc/psd-oplog/` and `prompts/`.
- Talk is cheap: every claim added to README needs a script that reproduces it.
