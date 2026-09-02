# ⚠ DO NOT REMOVE — SPEC: Export menu + native .db export (Item 6, FABLE5_WRAPUP_2026-07-03)
# Scope: modeller ONLY (modeller.html + bonsai_oplog.js + str_walker_outliner.js + sw.js + tests).
# Read the log after every run — exit code is not evidence.

## Problem
`#b-open` loads a local `.db`, but there is NO symmetric save/export of the native format. The only
writer of the native format is `kernel_ops.js` `_persistToIdb` (`sealChain` → `db.export().buffer`),
wired only into auto-persist. Native `.db` (signed op-log, hash chain) is the only FULL-fidelity
artifact of an authoring session; IFC (`#b-ifc`) and BCF (`#b-bcf`) are lossy translations — yet only
the lossy two had toolbar buttons, as two flat pills.

## Decision (locked by user+watchdog 2026-07-03 — do not re-litigate)
ONE "Export" toolbar pill (`#b-export`) replaces `#b-ifc` + `#b-bcf`, opening a small chooser menu
(REUSING the `#m-open-panel` chooser idiom from `initOpenChooser` — same builder/close/outside-click
pattern, id `#m-export-panel`, rows `.me-row`) with three items:

1. **Native .db** — NEW: `window.Bonsai.exportDb(opts)` — `KernelOps.sealChain(O.db)` (the same seal
   `_persistToIdb` does — never skipped) → `O.db.export()` → Blob → `<building-name>.db` via the
   existing ObjectURL/a.download idiom (bonsai_ifc.js / bcf_export.js — no new mechanism).
   `opts.download===false` returns bytes without the download (witness seam, mirrors `exportModel`).
2. **IFC** — the EXISTING `bIfc` handler body unchanged (`window.Bonsai.ifc.exportModel`), menu-triggered.
3. **BCF** — the EXISTING `exportBcf({})` handler body unchanged, menu-triggered.

The standalone `#b-ifc` / `#b-bcf` buttons are REMOVED (not hidden) once reachable from the menu.

## Symmetric read (required for round-trip)
The exported native `.db` must re-open through the SAME code path `#b-open` uses (`_openBuffer`).
A native op-log `.db` is discriminated by its `kernel_ops` table — VERIFIED absent from all 8
resident/rules `.db` files (probe 2026-07-03) — and routed to NEW `OpLog.importBytes(u8)`:
close current db → open bytes → `ensureTable` → restore group counter (the `_ensureDb` idiom) →
`verifyChain` → fold to tip → `_save()` → emit. Building-substrate `.db` files take the walker
path byte-identically as before (additive branch, checked first, no change to their flow).

## Witness contract (W-E2E-EXPORT-DB, modeller/tests/witness_e2e_export_db.js)
(a) ROUND-TRIP — author real ops, export bytes b1, re-open b1 via the REAL `#b-open` ▸ "Open local
    .db…" file-chooser path, re-export bytes b2: `sha256(b1) == sha256(b2)` (probe proved seal→
    export→import→re-seal→export is byte-identical: same 16384 bytes, same tip) + op count + tip
    hash + folded scene mesh census reproduce.
(b) CHAIN — `KernelOps.verifyChain` over a FRESH `SQL.Database(b1)` is green (seal not skipped).
(c) UI — `#b-export` menu exists with the 3 rows; `#b-ifc`/`#b-bcf` GONE from the DOM; the real
    menu clicks drive the unchanged IFC/BCF handlers (#stat "IFC exported"/"BCF exported").
PLUS: IFC + BCF bytes byte-identical main-vs-branch (fixed inputs, sha256), existing W-BONSAI-IFC
re-import check + W-E2E-BCF re-run green (B6 updated to the menu path — the old button is gone by
design; B1–B5 assertions untouched).
