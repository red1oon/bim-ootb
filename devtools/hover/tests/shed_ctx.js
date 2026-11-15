// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — SPEC (W-BIM-LAYERS / W-DXF-HOVER H2b), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.23. Dev-side test helper, never loaded by a page.
// ISSUE: both witnesses must judge the provenance hover on the SAME page-shaped model; two copies of the page's commit mapping would drift.
// WHAT:  shedCtx(root, files, nextId) runs the DXF chain in-process with the trace on (dxf2bim_cli.run, then toOps, as the page does) and maps it as the page commits it
//        (modeller/dxf_import_ui.js:951-952: ids contiguous from nextId, a cut's parent = nextId + index, slide.fillingFid = nextId + fillingIdx). Returns
//        { R, T, ops, trace, guidByFid, byId, fids, ctx(extra) } where ctx() is dxf_hover.layersFor's ctx.
// LOG:   none (a library); the callers print their §… lines.
'use strict';
const path = require('path');

function shedCtx(root, files, nextId, extraArgs) {
  const M = path.join(root, 'modeller'), CLI = require(path.join(M, 'dxf2bim_cli.js')), I = require(path.join(M, 'dxf2bim_import.js'));
  const ED = require(path.join(root, 'viewer', 'edit_delta.js'));
  nextId = nextId || 1;
  globalThis.__DXF_TRACE = new Map();
  const quiet = console.log; console.log = () => {}; let res;
  try { res = CLI.run(CLI.parseArgs(['--sheets', ...files, '--pack', 'pwd2024_bd', '--complete', '--out', require('os').tmpdir()].concat(extraArgs || [])), () => {}); }
  finally { console.log = quiet; }
  const R = res.out.gate && res.out.gate.R, T = I.toOps(R, { hashHex: I.sha256Hex }), trace = globalThis.__DXF_TRACE; delete globalThis.__DXF_TRACE;
  const ops = T.inserts.map((o, i) => ({ id: nextId + i, op_type: o.op_type, parameters: o.params, outputGuid: o.outputGuid }))
    .concat(T.cuts.map((c, j) => { const sl = c.params.slide, P = Object.assign({}, c.params, { parent: nextId + c.params.parent });
      if (sl && typeof sl.fillingIdx === 'number') { P.slide = Object.assign({}, sl, { fillingFid: nextId + sl.fillingIdx }); delete P.slide.fillingIdx; }
      return { id: nextId + T.inserts.length + j, op_type: c.op_type, parameters: P, outputGuid: c.outputGuid }; }));
  const guidByFid = {}, byId = {}; ops.forEach(o => { if (o.op_type === 'GEOM_INSERT') { guidByFid[o.id] = o.outputGuid; byId[o.id] = o.parameters; } });
  const fids = Object.keys(guidByFid).map(Number);
  function ctx(index, extra) { return Object.assign({ guidByFid, trace, index, els: R.els, op: f => byId[f] || null, ops, netEdits: ED.netEdits }, extra || {}); }
  return { R, T, ops, trace, guidByFid, byId, fids, ctx };
}

module.exports = { shedCtx };
