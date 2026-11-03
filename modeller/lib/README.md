# modeller/lib — compat mirrors

These files are byte-identical **compat mirrors** of the canonical copies in `common/lib/` and must NOT be edited here
(edit `common/lib/` and re-copy; `tests/witness_one_lib_folder.js` L3 fails on drift):

`web-ifc-api-iife.js`, `web-ifc.wasm`, `sql-wasm.js`, `sql-wasm.wasm`, `OrbitControls.module.js`, `planegcs/`

Nothing shipped loads them from here any more; they remain so a tab opened before the move, an old service worker, or an
external link that still requests `modeller/lib/<file>` keeps working. Everything else in this folder is viewer-only.
