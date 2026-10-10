# OplogPic

A small painting app whose document is an operation log: every stroke is one log entry, so undo, redo, save, replay and share are exact. Static files only: no server, no account, works offline once opened (installable on a phone from the browser menu over https).

- Live: `https://red1oon.github.io/bim-ootb/oplogpic/`
- Tools: hard / soft brush, smudge, eraser, blur brush, colour picker; layers with opacity and blend modes; pinch to zoom, two-finger tap = undo, three-finger tap = redo; PNG and PSD export; save/load the log as JSON.
- This folder is GENERATED. Source, tests and measurements: branch `claude/photoshop-clone-gaps-m5p5mz`, `poc/psd-oplog/editor/` (build with `node editor/build_dist.js <outdir>`), results in `poc/psd-oplog/README.md` and `poc/psd-oplog/witness_log/HYPOTHESES.md`.
- Third-party: `app.js` contains ag-psd 31.0.3 (MIT), see `ag-psd.LICENSE`.
