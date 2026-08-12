# PDF Terrain — sample reference pair

Copied 2026-08-06 from the user's own working Bonsai/Blender addon
(`~/IfcOpenShell/src/bonsai/bonsai/bim/module/federation/pdf_terrain/`,
`github.com/red1oon/IfcOpenShell` branch `feature/IFC4_DB`) — real, tested prior art, not a new sample.
Spec that references these: `prompts/TERRAIN_MIGRATION.md` (bim-compiler repo).

- **`survey_highres.png`** (9.0 MB, 9934×7017px, 300 DPI) — the real civil survey drawing used to validate
  the extraction pipeline. `survey_extract_pipeline.py`'s own header: *"TESTED & WORKING: December 2025 -
  688 points, pixel-perfect alignment."*
- **`survey_highres_extracted.json`** (192 KB) — the real output of running the regex-based elevation
  extraction (`survey_extract_pipeline.py`) against the image above: 689 elevation points
  (`ground_elevations`), each `{id, x, y, z, text, type}` in source-pixel + world-metre form, plus the
  `metadata` block (image dimensions, fitted scale, affine transform) the pipeline computed for this
  specific survey.

**Use:** a golden input/output pair for porting the extraction pipeline to the browser Modeller — feed
the PNG through a ported extraction path and diff the result against this JSON (689 points, same IDs/
positions) rather than inventing a new test fixture. Not the Google Vision raw cache (`_GV.json`, 408 KB)
— that one wasn't copied; re-extraction during the port should call the real API once (or reuse the
original fork's cache directly, off-repo) rather than relying on a redistributed cache file here.
