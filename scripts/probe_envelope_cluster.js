#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W2 probe (prompts/MEP_CLASH_REVEAL_MOVIE.md §36 W2, §20.7/§20.9). Read the log.
 * SCOPE: measure, offline, what the building envelope becomes when it is the LARGEST CONNECTED COMPONENT
 * of the structural footprint raster instead of the structural AABB. No GPU, no browser. Draws nothing.
 * Usage: node scripts/probe_envelope_cluster.js [Building ...]
 */
'use strict';
var fs = require('fs'), path = require('path'), OOTB = path.resolve(__dirname, '..');
var initSqlJs = require(path.join(OOTB, 'modeller', 'lib', 'sql-wasm.js'));
var wasm = fs.readFileSync(path.join(OOTB, 'modeller', 'lib', 'sql-wasm.wasm'));
var FM = require(path.join(OOTB, 'common', 'flythru_maths.js'));
var SR = require(path.join(OOTB, 'common', 'storey_raster.js'));
var ENV = { IfcColumn: 1, IfcPile: 1, IfcWall: 1, IfcWallStandardCase: 1, IfcSlab: 1, IfcBeam: 1, IfcFooting: 1, IfcCurtainWall: 1, IfcRoof: 1 };
var RES = 0.5;
function components(r) {                       // 4-neighbour connected components over the bitset
  var seen = new Uint8Array(r.cols * r.rows), comps = [], c, rr, q, head;
  for (rr = 0; rr < r.rows; rr++) for (c = 0; c < r.cols; c++) {
    if (seen[rr * r.cols + c] || !SR.getBit(r.bits, r.cols, c, rr)) continue;
    var comp = { cells: 0, c0: c, c1: c, r0: rr, r1: rr }; q = [[c, rr]]; seen[rr * r.cols + c] = 1; head = 0;
    while (head < q.length) {
      var p = q[head++], pc = p[0], pr = p[1]; comp.cells++;
      if (pc < comp.c0) comp.c0 = pc; if (pc > comp.c1) comp.c1 = pc; if (pr < comp.r0) comp.r0 = pr; if (pr > comp.r1) comp.r1 = pr;
      [[pc + 1, pr], [pc - 1, pr], [pc, pr + 1], [pc, pr - 1]].forEach(function (n) {
        var nc = n[0], nr = n[1];
        if (nc < 0 || nr < 0 || nc >= r.cols || nr >= r.rows) return;
        var k = nr * r.cols + nc;
        if (seen[k] || !SR.getBit(r.bits, r.cols, nc, nr)) return;
        seen[k] = 1; q.push([nc, nr]);
      });
    }
    comps.push(comp);
  }
  comps.sort(function (a, b) { return b.cells - a.cells; });
  return comps;
}
function bboxOf(r, comp) { return { minx: r.x0 + comp.c0 * r.res, maxx: r.x0 + (comp.c1 + 1) * r.res, miny: r.y0 + comp.r0 * r.res, maxy: r.y0 + (comp.r1 + 1) * r.res }; }
function dims(e) { return (e.maxx - e.minx).toFixed(2) + ' x ' + (e.maxy - e.miny).toFixed(2) + ' m'; }
initSqlJs({ wasmBinary: wasm }).then(function (SQL) {
  var LIST = process.argv.slice(2); if (!LIST.length) LIST = ['Hospital', 'HHS_Office_Federated', 'Terminal', 'Clinic'];
  console.log('═══ §ENVELOPE_CLUSTER probe — structural AABB vs largest connected footprint component, res ' + RES + ' m ═══');
  LIST.forEach(function (bld) {
    var f = path.join(OOTB, 'buildings', bld + '_extracted.db'); if (!fs.existsSync(f)) { console.log('  SKIP ' + bld); return; }
    var db = new SQL.Database(fs.readFileSync(f));
    var q = db.exec("SELECT m.ifc_class, t.center_x, t.center_y, t.bbox_x, t.bbox_y FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid");
    var all = [], st = [], byClassOut = {};
    (q[0] ? q[0].values : []).forEach(function (v) { var b = { cls: v[0], cx: +v[1], cy: +v[2], sx: +v[3], sy: +v[4] }; all.push(b); if (ENV[v[0]]) st.push(b); });
    var eAll = FM.ftExtents(all), eSt = FM.ftExtents(st);
    var r = FM.ftRasterizeBoxes(st, RES, bld); if (!r) { console.log('  §ENVELOPE_CLUSTER ' + bld + ' INCONCLUSIVE — raster too large'); db.close(); return; }
    var comps = components(r), main = comps[0], eMain = bboxOf(r, main);
    // which structural elements fall OUTSIDE the main component's bbox (the rogue set), by class
    st.forEach(function (b) { if (b.cx + b.sx / 2 < eMain.minx || b.cx - b.sx / 2 > eMain.maxx || b.cy + b.sy / 2 < eMain.miny || b.cy - b.sy / 2 > eMain.maxy) byClassOut[b.cls] = (byClassOut[b.cls] || 0) + 1; });
    var others = comps.slice(1);
    console.log('── ' + bld + ' ── structural=' + st.length + '/' + all.length + ' elements');
    console.log('  AABB all        = ' + dims(eAll));
    console.log('  AABB structural = ' + dims(eSt) + '  (§35 figure)');
    console.log('  §ENVELOPE_CLUSTER main component = ' + dims(eMain) + ' area=' + (main.cells * RES * RES).toFixed(0) + 'm2 of ' + (FM.ftRasterArea(r)).toFixed(0) +
                'm2 structural raster (' + (100 * main.cells / Math.max(1, FM.ftRasterCells(r))).toFixed(1) + '%) components=' + comps.length +
                ' next=' + (others.length ? others.slice(0, 3).map(function (o) { var e = bboxOf(r, o); return dims(e) + '@' + (o.cells * RES * RES).toFixed(0) + 'm2'; }).join(' | ') : 'none') +
                ' outsideMainByClass=' + JSON.stringify(byClassOut));
    db.close();
  });
  console.log('═══ done ═══');
});
