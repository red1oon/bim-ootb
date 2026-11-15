# DXF hover: see the line that built a body (dev-only)

Spec: bim-compiler `prompts/CODE_ARCHITECTURE_DESIGN.md` §F.21 slice 2. Witness: `devtools/hover/tests/witness_dxf_hover.js` (W-DXF-HOVER).

1. `node devtools/hover/gen_trace_index.js`: writes `trace_index.json` (git-ignored: it holds this machine's repo path). Run it again after editing a builder.
2. Serve the repo (VS Code task "Serve repo", http://localhost:8000) and open `/modeller/modeller.html`.
3. Load the overlay with this bookmarklet (save it as a bookmark's URL), BEFORE you Convert:
   `javascript:(function(){var s=document.createElement('script');s.src='/devtools/hover/dxf_hover.js?'+Date.now();document.head.appendChild(s)})()`
4. Open the DXF sheets and Convert. Hover a body: the tooltip shows the trace key, the `file:line` that built it, its class and DXF handle / layer / sheet.
   Press **V** to open that line in VS Code (`vscode://file/...`).

A body converted before the overlay loaded says "Convert again". Nothing in the shipped Modeller changes; the CLI does the same with `--trace` (`trace.json`).

## The provenance hover: every layer behind a body (§F.23)

Spec: bim-compiler `prompts/CODE_ARCHITECTURE_DESIGN.md` §F.23 (decision F-18). Witness: `devtools/hover/tests/witness_bim_layers.js` (W-BIM-LAYERS, node) + W-DXF-HOVER H2b (the page).
The same tooltip now shows a title line (class · fid · handle · layer · sheet · provenance) and six numbered layers, in the order they happened. Every layer row is always
shown; an empty one says `none`. Nothing is guessed: an item has a `file:line` only when the data names one.

| Key | Layer | Read from |
|---|---|---|
| 1 | BUILDER: the line that built the body | the trace key (first part) → `trace_index.json` |
| 2 | PASS-THROUGH: later code that stamped it | the rest of the trace chain (`a > b`) |
| 3 | SIZES: each side, its number and where it came from (`label`, `default`, `schedule`, `inherited`, `drawn`, …); a default that records its key links its row in `modeller/element_defaults.json` | the body (`R.els`), else the op's `SizeBasis` |
| 4 | CUTS: the openings cut into it, the fill each holds, their later moves / resizes; for a door, the opening it fills | the op log (`GEOM_CUT`, `GEOM_CUT_MOVE`, `GEOM_CUT_RESIZE`) |
| 5 | EDITS after Convert: moves, scales, grid moves (an undone edit is not shown) | the op log before the cursor, through `EditDelta.netEdits` (`viewer/edit_delta.js`) |
| 6 | EVIDENCE: handle, layer, sheet, provenance, run, and each drawn note / schedule row the converter attached | the op's provenance |

Keys **1-6** open that layer's first line in VS Code (Alt+1-6 while typing in a field); **V** still opens the builder line. Run `node devtools/hover/gen_trace_index.js`
again after editing a builder or `element_defaults.json`. Most default-sourced sizes do not yet record which default they used; those say so and link nothing.

# ERP field hover: every layer of code behind a field (dev-only)

Spec: bim-compiler `prompts/CODE_ARCHITECTURE_DESIGN.md` §F.22. Witness: `devtools/hover/tests/witness_erp_hover.js` (W-ERP-HOVER).

1. `node devtools/hover/gen_erp_index.js`: writes `erp_index.json` (git-ignored). Run it again after editing a callout, process, model or validator.
2. Serve the repo and open `/erp/idempiere.html`, log in, open a window.
3. The bookmarklet: `javascript:(function(){var s=document.createElement('script');s.src='/devtools/hover/erp_hover.js?'+Date.now();document.head.appendChild(s)})()`
4. Hover a field: its layers in the order they fire (the field's dictionary row, on change: callouts, picker: validation rule, on save: model hooks, doc action, model validators,
   button: process), each with its owner, the line that registered it and the iDempiere Java file it was ported from. Keys **1-9** open that line in VS Code.
   A layer with nothing registered says UNPORTED (checked against the engine's own lookup); nothing is guessed. In a text field use Alt+1-9. Before the first save the page has not installed its model validators yet: the tooltip lists the ones the code registers.
