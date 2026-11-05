// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 — Pdf2Dxf.run: the whole rules seam, sheet model -> the 7 typed DXF texts + logs, in memory (no fs, no child_process). UMD: window.Pdf2Dxf.
// run(model, {rosetta, template, glyphs}) -> {sheets, logs, rosetta, template, inferred}. model = what dump_sheet_model.py writes ({pages:{"1":{paths:[{d,m,sw,col}],words:[[text,xMin,yMin,xMax,yMax]]}}}).
// rosetta/template/glyphs: JSON TEXT (preferred: keeps the grid labels' order and the int/float split) or an already-parsed object. Stage order follows scripts/pdf2bim/run_p1.sh.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./py_rt.js'), require('./fill_blanks.js'), require('./infer_type.js'), require('./emit_dxf_p1.js'), require('./read_rooms.js'), require('./add_plan_marks.js'), require('./elev_emit.js'), require('./to_std.js'), require('./section_emit.js'), require('./roof_emit.js'));
  else root.Pdf2Dxf = factory(root.Pdf2DxfRt, root.Pdf2DxfFill, root.Pdf2DxfInfer, root.Pdf2DxfEmit, root.Pdf2DxfRooms, root.Pdf2DxfMarks, root.Pdf2DxfElev, root.Pdf2DxfStd, root.Pdf2DxfSection, root.Pdf2DxfRoof);
})(typeof self !== 'undefined' ? self : this, function (RT, Fill, Infer, Emit, Rooms, Marks, Elev, Std, Section, Roof) {
  'use strict';
  function rosettaOf(x) {
    if (typeof x === 'string') return RT.parseJSON(x, ['grid.x', 'grid.y']);
    const r = RT.typed(x); for (const a of ['x', 'y']) if (!(r.grid[a] instanceof Map)) r.grid[a] = RT.toMap(r.grid[a]); return r; // a parsed object has already lost the order of keys like '5','4': pass the text
  }
  const templateOf = x => (typeof x === 'string' ? RT.parseJSON(x) : RT.deepcopy(RT.typed(x)));
  const glyphsOf = x => (typeof x === 'string' ? RT.parseJSON(x) : RT.typed(x));
  function run(model, inputs) {
    const R0 = rosettaOf(inputs.rosetta), T0 = templateOf(inputs.template), G = glyphsOf(inputs.glyphs); const logs = {};
    const f = Fill.run(model, R0, T0); logs.fill_blanks = f.log;
    const n = Infer.run(model, f.rosetta, f.template); logs.infer_type = n.log;
    const e = Emit.run(model, f.rosetta, f.template); logs.emit_dxf_p1 = e.log;
    const rr = Rooms.run(model, f.rosetta, f.template, G, e.log); logs.read_rooms = rr.log; const R = rr.rosetta;
    const marked = Marks.run(e.dxf, R);
    const el = Elev.run(model, R, n.inferred, e.dxf); logs.elev_emit = el.log;
    const st = Std.run(marked, el.sheets, R, n.inferred, el.doorHeads); logs.to_std = st.log;
    const sc = Section.run(model, R, n.inferred); logs.section_emit = sc.log;
    let sheets = Object.assign({}, st.sheets); if (sc.sheet !== null) sheets['section_aa.dxf'] = sc.sheet;
    const rf = Roof.run(model, R, n.inferred, sheets, sc.log); logs.roof_emit = rf.log; sheets = rf.sheets;
    return { sheets, logs, rosetta: R, template: f.template, inferred: n.inferred, intermediate: { plan_extracted: e.dxf, plan_marked: marked, door_heads: el.doorHeads } };
  }
  return { run };
});
