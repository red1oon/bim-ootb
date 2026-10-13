# OplogPic: a photo editor with history (user guide)

A browser editor whose document is an op log: every action is one line in a log, and the picture is the replay of that log. Nothing to install: open `index.html` in a browser, or run `node editor/build_dist.js <folder>` and put the folder on any static host (https gives you the offline-capable installable PWA). Live: https://red1oon.github.io/bim-ootb/oplogpic/ (the red pill in the top bar links back to the main page). Proof of concept, MIT licensed.

## The basics
- **Tools** (left bar, keys in brackets): Hard brush (1), Soft brush (2), Smudge (3), Erase (4), Blur (5), Select (6: rectangle or ellipse, Invert, Clear), Wand (7), Move (8), Gradient (9), Pick colour (I). Size `[` `]`, flow, smudge / blur strength and colour are in the top bar.
- **Layers** (side panel): add, hide / show (eye), reorder (arrows), rename (pencil), delete (bin), opacity slider, ten blend modes (normal, multiply, screen, overlay, soft-light, hard-light, darken, lighten, difference, exclusion). Tap a layer name to make it the active layer.
- **View:** Ctrl+wheel or pinch zooms, wheel pans, Space+drag pans, `0` fits; buttons Fit / 100% / + / -.
- **Undo / redo:** Ctrl+Z / Ctrl+Shift+Z (phone: two-finger tap undoes, three-finger tap redoes). The work is saved in the browser automatically and restored on reload ("New canvas" clears it).
- **Top-right icons:** the book opens this guide in a new tab; the red pill goes back to the main page.
- **Out:** Export PNG (exactly what is on screen, 1024x1024), Export PSD (layers, masks, adjustment layers and a merged picture; Photoshop draws its own hue / saturation from the three numbers, so a recomposite there differs slightly), Save log / Load log (the op log as JSON).

## Photos and text
- **Add photo** takes a picture from the device. The **Fill select** next to it chooses the placement: *Fit whole* (the default; the whole picture, transparent bars where it does not fill the square), or *Fill* (the picture covers the canvas and the overflow is cropped away for good): centre, top / left, 1/4 along, 3/4 along, bottom / right. Pick the crop that keeps what matters; the cropped-away pixels are not stored. (The 1/4 and 3/4 choices arrive with the next deploy of the live site.)
- **Add text** opens a small panel: the words, size (24-300 px), colour, position (top / middle / bottom) and an optional shadow. It becomes a normal layer named "Text: ...". To change the words, delete the layer and add it again.

## Advanced (tick the Advanced box at the top of the layer panel)
- **Masks** on layers: add, from selection, invert, apply, delete, paint on the mask (Layer / Mask buttons, Reveal / Hide).
- **Clip** a layer to the one below it; **groups** (one level).
- **Magic wand:** tap to select an area of similar colour on the active layer. Tolerance slider, Contiguous / All pixels, New / Add / Sub, Grow and Shrink (by 2 px).
- **Feather** slider (selection bar, 0-20 px): the next "Mask from selection" gets a soft edge. Use it, with Grow, to cut a subject out of a sky cleanly.
- **Adjustment layers** (the "Add adjustment" menu): Hue / Saturation, Levels, Curves, Threshold, Posterize, Invert, Gaussian blur (one Radius slider) and Sharpen (Amount, Radius, Threshold) as live **filter layers**, Gradient map (a colour ramp for the brightness of everything below: tap its bar to add a stop, drag a stop to move it, pick its colour, Remove stop). Each is a live setting: drag its sliders any time, hide it, reorder it, change its strength. An adjustment changes everything below it; give it a **mask from a selection** (buttons on its row) to limit it to one area, for example one panel of a balloon.
- **Filter layers** blur or sharpen everything below them and nothing above; hide, reorder, fade (opacity) or limit them with a mask like any adjustment. While you drag a slider the preview is a quick, coarser one; the exact picture appears when you let go (a big radius can take a second or two). In an exported PSD a filter layer becomes an ordinary picture layer named "... (baked)": it looks the same there but is no longer live, and a PSD you load back keeps it as a picture.
- **Gradient tool (9):** drag from the start point to the end point on the active layer. Linear or Radial (the start is the centre), the colour fades from the current colour to the End colour, or to clear with "To clear". With the Mask target (the Layer / Mask buttons) it paints a fade into the layer's mask instead, so a photo can fade out into the layer below. It respects the selection, and one drag is one history entry.
- **Move tool:** with a layer active, drag on the canvas to move it; the Scale slider (10-400 %) resizes it; **Apply** records ONE history entry, **Cancel** records nothing. The layer's mask moves with it. Until you Apply, the picture is recomputed from the original layer, so scaling up (the top slips out of frame) and back down brings everything back; after Apply, pixels moved outside the canvas are gone from the layer (undo restores them). Whole layer only: no rotation, no moving of just a selection.

## History (the panel under the layers)
Every entry is listed. Tap an entry to preview the picture at that step; **Back to now** returns; **Go back to here** rewinds to it. **Replay** plays the edit back. **Verify** rebuilds the picture from the log from scratch and checks it equals what is shown. **Show raw entries** lists the log lines with their sizes. **Edit** re-edits a past stroke (the log stays append-only). **Share link** copies the whole history as a link (no photos in it); a link opens view-only.

## Phone
One finger paints; two fingers pinch-zoom and pan; a two-finger tap undoes, a three-finger tap redoes. Bottom dock: tools, colour swatches, brush size; Menu opens the layer panel. A shared link or a hold-to-save picture is offered where the browser cannot share files.

## Limits
1024x1024 canvas, sRGB, 8-bit export; no pen pressure, no rotation, no export size control, no feather of the selection itself, no editing of caption words; photos and captions are stored raw (4 MB each) in the saved log until blob compression exists, so a share link carries no photos; tested in Chromium (desktop and emulated phone), NOT on iOS Safari or a real phone. Memory (measured on a laptop in Chrome): a finished five-layer file takes about 0.5 GB in all (213 MB for an empty editor); a layer is 16 MB; phone numbers are not measured. Verification: `node witness_all.js` (37 suites) and per-feature suites `npm run editor_<name>`; every feature has a pre-registered spec and verdicts in `witness_log/HYPOTHESES.md`.

## Build and third-party
`node editor/build_dist.js <dir>` (PWA folder), `--single` (one HTML file), `--artifact` (body only, for a viewer). `vendor/ag-psd.js` is ag-psd 31.0.3 (MIT), see `vendor/ag-psd.LICENSE`.
