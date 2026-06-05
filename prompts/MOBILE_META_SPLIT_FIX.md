# ⚠ DO NOT REMOVE — Mobile meta-split fix: regenerate broken _meta.db on OCI
# SCOPE: the single highest-value mobile speed win (parent: prompts/MOBILE_PERF.md lever #1).
#   Mobile first-load is DB-fetch-bound. The viewer + 4D5D/MEP load a building's SPLIT
#   _meta.db (~17–40M) instead of the full _extracted.db geometry (~251–421M) — BUT some
#   _meta.db on the OCI `bim-ootb` bucket are EMPTY/BROKEN (observed: LTU_AHouse_meta.db =
#   0 bytes, 2026-06-05), so those buildings fall back to the full geo file → slow mobile
#   load. Audit every served building's _meta.db, regenerate the broken ones, re-upload,
#   verify the split actually engages live.
# This is a DEPLOY-DATA fix (regenerate + re-upload DBs), NOT viewer code.
# PRIME RULE: EXTRACT/COMPILE ONLY — regenerate _meta.db from canonical source DBs, never
#   hand-edit. Read the log after every run; verify each DB opens with real rows before upload.

## TASK 1 — Audit every served building's _meta.db on OCI · Witness §META_AUDIT
- OCI bucket `bim-ootb`, objects under `o/buildings/<Name>_meta.db` + `<Name>_extracted.db`
  (namespace/region per `deploy/OCI_UPLOAD.md`).
- For each building the viewer SERVES (from its building manifest / picker), check
  `<Name>_meta.db`: flag `HTTP != 200`, `size == 0`, or suspiciously small (< ~1MB).
- `§META_AUDIT building=<n> meta_http=<c> meta_bytes=<b> status=ok|EMPTY|MISSING` — one line
  per building. Silent SKIP is the failure this prompt exists to catch.

## TASK 2 — Regenerate the broken ones · Witness §META_REBUILD
- Source of truth: `bim-compiler/deploy/buildings/<Name>_extracted.db` (has elements_meta +
  element_transforms with bbox + center). _meta.db = the geometry-STRIPPED split: keep
  elements_meta + element_transforms (+ spatial_structure / rel_contained_in_space /
  surface_styles if present); DROP base_geometries + element_instances vertex blobs.
- REUSE the existing split path — CONFIRM which script emits `_meta.db`
  (`scripts/extract_per_building.py` is the per-building slicer; verify it produces the
  meta split, or find the step that does). Do NOT invent a new slicer.
- `§META_REBUILD building=<n> bytes=<b> elements=<n> bbox_nonnull=<n>/<n>` — and confirm it
  OPENS in sql.js / sqlite3 with no corruption before any upload.

## TASK 3 — Upload + verify live · Witness §META_LIVE  (deploy/OCI_UPLOAD.md §RULES)
- `oci os object put` MUST include `--content-type` (per OCI_UPLOAD MIME table; omitting it →
  nosniff block + silent failure — see CLAUDE.md OCI MIME Rule).
- After upload: GET the live URL → `size > 0` + opens; then load the building and confirm the
  viewer's split path HITS the meta file: `§QTO_SPLIT_HIT` / `§MEP_SPLIT_HIT` reference
  `_meta.db` (not the `_extracted.db` fallback).

## TASK 4 — Measure the win (the point) · Witness §META_PERF
- One affected building (LTU), real device or DevTools mobile + CPU 4–6× + GPU throttle:
  §-log first-load ms BEFORE (geo fallback) vs AFTER (meta split), same device. Expect a
  large drop (40M vs 421M fetch). Name building + device.

## DON'T
- Don't touch the GPU render stack — mobile is I/O-bound (MOBILE_PERF.md).
- Don't re-extract from IFC or regenerate geometry/render DBs unless a SOURCE _extracted.db
  is itself missing (then escalate — that's a separate extraction task).
- Don't deploy without the live §QTO_SPLIT_HIT/§MEP_SPLIT_HIT proof (log ≠ visual proof).

## SOURCES
- `prompts/MOBILE_PERF.md` (parent strategy, lever #1) · `docs/MOBILE_DEPLOY.md` (split strategy)
- `deploy/OCI_UPLOAD.md §RULES` (MIME + bucket) · `scripts/extract_per_building.py` (the slicer)
- boq_charts.html / mep_report.html `§QTO_SPLIT_HIT` / `§MEP_SPLIT_HIT` (the split consumers)
