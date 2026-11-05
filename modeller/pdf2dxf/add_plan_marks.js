// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 — port of scripts/pdf2bim/add_plan_marks.py (§21: @VIEW=PLAN + @GRIDX/@GRIDY marks from the Rosetta grid, inserted before the last ENDSEC). Pure; UMD: window.Pdf2DxfMarks.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./py_rt.js')); else root.Pdf2DxfMarks = factory(root.Pdf2DxfRt); })(typeof self !== 'undefined' ? self : this, function (RT) {
  'use strict';
  const { I } = RT;
  const mk = (x, y, t) => ['0', 'TEXT', '8', 'DXF2BIM-MARK', '10', RT.str(x), '20', RT.str(y), '30', '0', '40', '150', '1', t];
  function run(dxf, R) { // dxf: text of the extracted plan; returns text
    const d = dxf.split('\n'); let M = mk(I(-3000), I(-1000), '@VIEW=PLAN @BY=user');
    for (const [k, v] of R.grid.x) M = M.concat(mk(v, I(600), '@GRIDX=' + k + ' @BY=user'));
    for (const [k, v] of R.grid.y) M = M.concat(mk(I(-600), I(-v), '@GRIDY=' + k + ' @BY=user'));
    let j = -1; for (let k = 0; k < d.length - 1; k++) if (d[k] === 'ENDSEC' && d[k - 1] === '0') j = k;
    return d.slice(0, j - 1).concat(M, d.slice(j - 1)).join('\n');
  }
  return { run };
});
