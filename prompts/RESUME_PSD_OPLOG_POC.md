# RESUME: PSD-replacement POC (raster op-log + tiles + canonical fold)

Branch: `claude/photoshop-clone-gaps-m5p5mz`. Code: `poc/psd-oplog/`. Results and limits: `poc/psd-oplog/README.md`
(tables), design rationale: `poc/psd-oplog/HANDOFF.md`. Do not restate them here.

## State
- DONE (cloud, software renderers): precision, blend modes, tile store, op-log witness with hash chain, layer stack with
  alpha/opacity/masks/10 blend modes (CPU f32 canonical + WebGL twin), PSD round-trip (ag-psd and independent psd-tools).
- STEP 5 DONE on one device (RTX 4060, Chrome 154, Linux): CPU fold matches golden hashes, GPU within 1 level. See README
  "Step 5 result". Firefox 157 also passed (same machine, hashes identical to Chrome). STILL WANTED from a person: Safari (JavaScriptCore), an ARM/Apple device, a non-NVIDIA GPU via `gpu_check.html` (steps below);
  save each JSON under `poc/psd-oplog/gpu_results/`.
- ICC DONE (README "ICC colour management", `npm run icc`; needs `sh icc/fetch_profiles.sh`, profile not committed). Key rule: canonical
  conversions use cmsFLAGS_NOOPTIMIZE; keep working space float/16-bit; matrix profiles can be done in-shader.
- COLOUR-MANAGED FOLD DONE (README "Colour-managed document fold"): pipeline matches float64 reference to 1 level. Decision to record in
  the doc schema: working space + gamma-vs-linear compositing flag (they change results by dE2000 1-9).
- OP-LOG SCHEMA v1 + PSD ICC IMPORT DONE (`doc/`, `npm run doc`; README "Op-log schema v1 and PSD profile import"). Rules: doc op first, space
  and gamma recorded, rasters are sha256 blobs, unknown ops/fields rejected, untagged PSD = sRGB assumption.
- PSD EXPORT DONE (`doc/psd_export.js`, `npm run export`; README "PSD export"): profile embedded (1039), merged image stored, linear docs refused, fixed point after 1st pass,
  psd-tools applies our embedded profile within 1 level of the float64 oracle. Not yet opened in Photoshop itself.
- NEXT: a person opens the exported PSDs in Photoshop/Krita/GIMP and reports colours + profile name (files: `cd poc/psd-oplog && npm i && npm run samples`, outputs in `doc/.emit_export/*.psd`; srgb_mixed, p3_mixed, adobe_mixed, p3_pure, embedded_custom_working),
  then groups / clipping masks, non-separable blend modes, tile store behind `raster` blobs / clipping masks, non-separable modes, tile-store
  wired to the fold, op-log signing with bim-ootb's existing signed-log code. Step 7 (brush feel) needs a person.

## Extra devices, for the person (about 5 minutes each)
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

## GROUPS + CLIPPING DONE (README "Groups and clipping masks"; `npm run groups`; all hypotheses H16-H29 resolved in `witness_log/HYPOTHESES.md`)
Rules to keep: numbers decide, no human gates; new behaviour = pre-register hypothesis + threshold in the ledger first; never loosen a gate without a ledger entry; keep a held-out set when fitting to a reference.
Open / DEFERRED (not blockers): Photoshop behaviour on partially transparent clip bases and `clbl` OFF; Safari/ARM/second GPU vendor for the determinism hashes; brush feel.
NON-SEPARABLE MODES DONE (README section; `npm run nonsep`; H30/H31 resolved).
TILE STORE DONE (README section; `npm run tiles`; H32-H38).
ADJUSTMENT LAYERS (invert/levels/threshold/posterize) DONE (README section; `npm run adjust`; H40-H49). Remember: psd-tools truncates its output, so comparisons against a rounded picture carry a ~0.5 level bias.
CURVES DONE (natural cubic spline; Photoshop's spline UNKNOWN; README section; `npm run curves`; H50-H56).
NEXT candidates (cloud-friendly, numeric): hue/saturation (needs an HSL definition choice, psd-tools has one), GPU twin for groups/clipping/non-separable/adjustments; streaming tiles into the fold; 16-bit/float layer import;
adjustment layers (curves/levels) with a float64 oracle; 16-bit/float layer import. Run `node witness_all.js` to refresh `witness_log/ledger.jsonl` before and after any change.
