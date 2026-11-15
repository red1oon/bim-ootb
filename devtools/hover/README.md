# DXF hover: see the line that built a body (dev-only)

Spec: bim-compiler `prompts/CODE_ARCHITECTURE_DESIGN.md` §F.21 slice 2. Witness: `devtools/hover/tests/witness_dxf_hover.js` (W-DXF-HOVER).

1. `node devtools/hover/gen_trace_index.js`: writes `trace_index.json` (git-ignored: it holds this machine's repo path). Run it again after editing a builder.
2. Serve the repo (VS Code task "Serve repo", http://localhost:8000) and open `/modeller/modeller.html`.
3. Load the overlay with this bookmarklet (save it as a bookmark's URL), BEFORE you Convert:
   `javascript:(function(){var s=document.createElement('script');s.src='/devtools/hover/dxf_hover.js?'+Date.now();document.head.appendChild(s)})()`
4. Open the DXF sheets and Convert. Hover a body: the tooltip shows the trace key, the `file:line` that built it, its class and DXF handle / layer / sheet.
   Press **V** to open that line in VS Code (`vscode://file/...`).

A body converted before the overlay loaded says "Convert again". Nothing in the shipped Modeller changes; the CLI does the same with `--trace` (`trace.json`).

# ERP field hover: every layer of code behind a field (dev-only)

Spec: bim-compiler `prompts/CODE_ARCHITECTURE_DESIGN.md` §F.22. Witness: `devtools/hover/tests/witness_erp_hover.js` (W-ERP-HOVER).

1. `node devtools/hover/gen_erp_index.js`: writes `erp_index.json` (git-ignored). Run it again after editing a callout, process, model or validator.
2. Serve the repo and open `/erp/idempiere.html`, log in, open a window.
3. The bookmarklet: `javascript:(function(){var s=document.createElement('script');s.src='/devtools/hover/erp_hover.js?'+Date.now();document.head.appendChild(s)})()`
4. Hover a field: its layers in the order they fire (the field's dictionary row, on change: callouts, picker: validation rule, on save: model hooks, doc action, model validators,
   button: process), each with its owner, the line that registered it and the iDempiere Java file it was ported from. Keys **1-9** open that line in VS Code.
   A layer with nothing registered says UNPORTED; nothing is guessed. Before the first save the page has not installed its model validators yet: the tooltip lists the ones the code registers.
