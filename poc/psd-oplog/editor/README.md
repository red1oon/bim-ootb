# OpLog Paint (editor v0.1)

A small browser painting app whose document is an op log. Nothing to install: open `index.html` in a browser (double-click works), or run `node editor/build_dist.js` and use the self-contained `editor/dist/` folder on any static host.

- Tools: Hard (1), Soft (2), Smudge (3), Erase (4), Blur click (5), Pick colour (I). Size `[` `]`, flow, smudge strength, colour, layers (add, delete, hide, reorder, rename, opacity, blend mode), Select tool (rect, ellipse, invert, clear), Add photo.
- View: Ctrl+wheel (or pinch) zoom, wheel pans, Space+drag or middle-drag pans, `0` fits, buttons Fit / 100% / + / -.
- Undo / redo: Ctrl+Z / Ctrl+Shift+Z. Your painting is saved in this browser automatically and restored on reload ("New canvas" clears it).
- Out: Export PNG, Export PSD (layers, blend modes, opacity, sRGB profile), Save log (the op log as JSON; Load log reads it back).
- Every action is one log entry, so undo, save, load and replay are exact. See `poc/psd-oplog/README.md` and `witness_log/HYPOTHESES.md` for what was measured.

Known limits (v0.1): no pen pressure, no groups, no moving the selection or the photo after import or masks, sRGB only, 1024x1024 canvas, tested in Chromium only, touch gestures untested, no Photoshop check of the exported PSD, and nobody has judged how it feels yet.
Third-party: `vendor/ag-psd.js` is ag-psd 31.0.3 (MIT), see `vendor/ag-psd.LICENSE`.

## Phone use (v0.2)
One finger paints; two fingers pinch-zoom and pan; a two-finger tap undoes, a three-finger tap redoes. Bottom dock: tools, colour swatches, brush size. Share/Save in the top bar (shows a hold-to-save picture where the browser cannot share files). The built folder (`npm run editor_dist`) is an installable, offline-capable PWA when served over https; `npm run editor_dist_single` writes one self-contained HTML file.
