#!/usr/bin/env node
/**
 * W-EDIT-REPORT-COVERAGE — bim-compiler prompts/MODELLER_MASTER.md §EDIT-REPORT, step 0.
 * ISSUE PROVED OR DISPROVED: "the Modeller's live edit checks catch the defect classes an edit can introduce".
 * Output: one §EDIT_COVERAGE line per injected defect, NONE rows are the finding. The report's NOT-checked line is
 * generated from this table (modeller/edit_report_coverage.json), never hand-written.
 *
 * PURE NODE, REAL buildings: SdgGate on the Duplex's seeded boxes + recovered edges, GridSpanGate on the Garage's own
 * walked lattice. Adds no gate, changes no gate. Pinned: a future gate fix turns this red and forces a re-generate.
 *   node modeller/tests/witness_edit_report_coverage.js           run + compare with the pinned table
 *   node modeller/tests/witness_edit_report_coverage.js --write   re-generate the table
 *   EDIT_COV_BREAK=1 node ...                                     falsifier: a gate that sees nothing must go RED
 * ajv comes from the primary checkout: NODE_PATH=~/bim-ootb/node_modules
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = global.window || {};
global.fetch = undefined;
global.location = { href: 'http://localhost/' };
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;

var ROOT = path.join(__dirname, '..');
var PIN = path.join(ROOT, 'edit_report_coverage.json');
var ArcEditable = require(path.join(ROOT, 'arc_editable.js'));
var CrossEdges = require(path.join(ROOT, 'cross_edges.js'));
var SdgGate = require(path.join(ROOT, 'sdg_gate.js'));
var SW = require(path.join(ROOT, 'str_walker.js'));
var GS = require(path.join(ROOT, 'grid_span_gate.js'));
require(path.join(ROOT, 'kernel_ops.js'));
require(path.join(ROOT, 'bonsai_library.js'));
var KernelOps = global.window.KernelOps, Library = global.window.Bonsai.library;
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var { Witness } = require('../../witness_kit/contract');

if (process.env.EDIT_COV_BREAK) SdgGate.evaluate = function () { return { red: [], orange: [] }; };

function aabb(p) {
  var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (var i = 0; i < p.length; i += 3) for (var k = 0; k < 3; k++) { if (p[i + k] < mn[k]) mn[k] = p[i + k]; if (p[i + k] > mx[k]) mx[k] = p[i + k]; }
  return [mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]];
}
function tr(b, d) { return [b[0] + d[0], b[1] + d[0], b[2] + d[1], b[3] + d[1], b[4] + d[2], b[5] + d[2]]; }
function mid(b) { return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]; }
function cube(c, s) { return [c[0] - s, c[0] + s, c[1] - s, c[1] + s, c[2] - s, c[2] + s]; }

var rows = [];
// `label` is the wording the report prints if this row stays NONE. `design` = deliberate behaviour, not a blind spot.
function add(id, gate, verdict, kinds, how, note, label, design) {
  var r = { id: id, gate: gate, verdict: verdict, kinds: kinds || [], how: how, note: note || '', label: label || '', design: !!design };
  rows.push(r);
  console.log('§EDIT_COVERAGE defect=' + id + ' gate=' + gate + ' verdict=' + verdict + ' kinds=' + JSON.stringify(r.kinds) + ' how=' + how + (note ? ' note="' + note + '"' : ''));
}

function gateCase(G, id, c, opts) {
  opts = opts || {};
  var res;
  try { res = SdgGate.evaluate(c.before, c.after, c.moved, G.rel, {}); }
  catch (e) { add(id, 'SdgGate', 'THROWS', [], 'run', String(e.message), opts.label, opts.design); return; }
  var red = res.red, orange = res.orange;
  if (opts.names != null) {   // the row only counts if the gate named the anchor; a neighbour firing proves nothing
    var hit = function (r) { return r.a === opts.names || r.b === opts.names; };
    red = red.filter(hit); orange = orange.filter(hit);
  }
  var kinds = Array.from(new Set(red.concat(orange).map(function (r) { return r.kind; }))).sort();
  add(id, 'SdgGate', red.length ? 'RED' : orange.length ? 'ORANGE' : 'NONE', kinds, 'run', opts.note, opts.label, opts.design);
}

function gateRows(SQL) {
  var NEW = 900001;
  var db = new SQL.Database(fs.readFileSync(path.join(ROOT, 'Duplex_extracted.db')));
  var oplog = new SQL.Database();
  return ArcEditable.seedArc(db, {
    registerGeometry: function (a) { Library.registerRealGeometry(a); },
    commitGroup: function (ops, gid) { return KernelOps.commitGroup(oplog, ops, { gid: gid, baseTs: 1700000000000 }); },
    building: 'Duplex'
  }).then(function (seed) {
    var fbg = seed.bridge.fidByGuid, op = {}, base = {};
    seed.ops.forEach(function (o) {
      if (o.params.ifc_class === 'IfcOpeningElement') return;   // not a rendered solid the gate audits
      op[fbg[o.outputGuid]] = o;
      base[fbg[o.outputGuid]] = aabb(Library.foldInsert({ id: fbg[o.outputGuid], op_type: 'GEOM_INSERT', parameters: o.params }).positions);
    });
    var x = CrossEdges.deriveAll(db), set = {}, hostOf = {}, abuts = [];
    var key = function (a, b) { return Math.min(a, b) + '|' + Math.max(a, b); };
    x.fills.forEach(function (e) { var h = fbg[e.host_guid], f = fbg[e.filling_guid]; if (h != null && f != null) { set[key(h, f)] = 1; hostOf[f] = h; } });
    x.abuts.forEach(function (e) { var a = fbg[e.a], b = fbg[e.b]; if (a != null && b != null) { set[key(a, b)] = 1; abuts.push({ a: a, b: b }); } });
    var G = { rel: { related: function (a, b) { return !!set[key(a, b)]; }, hostOf: hostOf, abuts: abuts } };

    var fids = Object.keys(base).map(Number);
    var ofClass = function (c, pred) { return fids.filter(function (f) { return op[f].params.ifc_class === c && (!pred || pred(base[f])); }); };
    var wall = ofClass('IfcWallStandardCase', function (b) { return b[5] - b[4] > 2; })[0];
    var slab = ofClass('IfcSlab', function (b) { return b[5] - b[4] > 0.1; })[0];
    var foot = ofClass('IfcFooting')[0];
    var ymax = -Infinity, zmax = -Infinity; fids.forEach(function (f) { ymax = Math.max(ymax, base[f][3]); zmax = Math.max(zmax, base[f][5]); });
    var W = base[wall], S = base[slab], F = base[foot], clearY = ymax + 300, z0 = W[4];
    console.log('§EDIT_COVERAGE_POP building=Duplex solids=' + fids.length + ' fills=' + x.fills.length + ' abuts=' + abuts.length + ' anchors wall=' + wall + ' slab=' + slab + ' footing=' + foot);

    var addNew = function (b) { var a = Object.assign({}, base); a[NEW] = b; return { before: base, after: a, moved: [NEW] }; };
    var moveTo = function (f, b, moved) { var a = Object.assign({}, base); a[f] = b; return { before: base, after: a, moved: moved || [f] }; };

    gateCase(G, 'CONTROL_clean', addNew([300, 301, clearY, clearY + 1, z0, z0 + 1]));
    gateCase(G, 'D1_overlap_same_class', addNew(tr(W, [0.05, 0, 0])), { names: wall });
    gateCase(G, 'D2_overlap_door_in_slab', addNew([S[0], S[0] + 1, S[2], S[2] + 0.2, S[4], S[5]]), { names: slab });
    gateCase(G, 'D3_overlap_pipe_in_structure', addNew(cube(mid(F), 0.05)), { names: foot, note: 'gate is class-blind; footing stands in, the ARC seed holds no IfcBeam' });
    gateCase(G, 'D3b_overlap_pipe_in_wall', addNew(cube(mid(W), 0.05)), { names: wall });
    gateCase(G, 'D4a_unsupported_column_50m_up', addNew([W[0], W[0] + 0.3, W[2], W[2] + 0.3, zmax + 50, zmax + 53]), { label: 'floating or unsupported elements' });
    gateCase(G, 'D4b_unsupported_beam_200m_away', addNew([200, 205, clearY, clearY + 0.3, z0 + 2, z0 + 2.5]), { label: 'floating or unsupported elements' });
    gateCase(G, 'D5a_mm_as_m_3100_clear', addNew([0, 3100, clearY, clearY + 0.2, z0, z0 + 2.8]), { label: 'wrong units or absurd sizes, unless they hit something' });
    gateCase(G, 'D5b_mm_as_m_800_clear', addNew([0, 800, clearY, clearY + 0.2, z0, z0 + 2.8]), { label: 'wrong units or absurd sizes, unless they hit something' });
    gateCase(G, 'D5b2_mm_as_m_800_through_building', addNew([-400, 400, W[2], W[3], W[4], W[5]]), { names: wall, note: 'fires only because it hits something' });
    gateCase(G, 'D5c_m_as_km_thin', addNew([300, 300.0031, clearY, clearY + 0.0002, z0, z0 + 0.0028]), { label: 'wrong units or absurd sizes, unless they hit something' });
    gateCase(G, 'D7b_unknown_ifc_class', addNew([300, 301, clearY, clearY + 1, z0, z0 + 1]), { note: 'the gate receives boxes only, never a class', label: 'unknown element types' });
    gateCase(G, 'D8b_duplicate_position', addNew(W.slice()), { names: wall });
    add('D8a_duplicate_guid', 'SdgGate', 'NONE', [], 'read', 'boxes are keyed by fid, so a duplicate guid never reaches it', 'duplicate ids');
    gateCase(G, 'E1_overlap_under_tolerance_15mm', addNew([W[0], W[1], W[2], W[3], W[5] - 0.015, W[5] + 3]), { names: wall, note: 'CLASH_TOL is 20 mm', label: 'overlaps under 20 mm', design: true });

    // E2: drive a wall into its own abuts partner: `related` pairs are expected contact and never a clash.
    var depth = 0.1, e2 = null;
    abuts.some(function (p) {
      if (!base[p.a] || !base[p.b] || !/Wall/.test(op[p.a].params.ifc_class) || !/Wall/.test(op[p.b].params.ifc_class)) return false;
      var A = base[p.a], B = base[p.b];
      for (var k = 0; k < 3 && !e2; k++) for (var s = -1; s <= 1; s += 2) {
        var d = [0, 0, 0]; d[k] = s * 0.3;
        var A2 = tr(A, d);
        if (SdgGate.penetration(A2, B) > depth && SdgGate.penetration(A2, B) > SdgGate.penetration(A, B) + 0.02) { e2 = { a: p.a, b: p.b, box: A2, depth: SdgGate.penetration(A2, B) }; break; }
      }
      return !!e2;
    });
    if (!e2) add('E2_wall_driven_into_abuts_partner', 'SdgGate', 'INCONCLUSIVE', [], 'run', 'no real abuts pair could be driven in', 'walls driven into a wall they already touch');
    else {
      var e2r = SdgGate.evaluate(base, moveTo(e2.a, e2.box).after, [e2.a], G.rel, {});
      var named = e2r.red.filter(function (r) { return (r.a === e2.a && r.b === e2.b) || (r.a === e2.b && r.b === e2.a); });
      add('E2_wall_driven_into_abuts_partner', 'SdgGate', named.length ? 'RED' : 'NONE', named.map(function (r) { return r.kind; }), 'run',
        'real pair ' + e2.a + '/' + e2.b + ' overlap ' + e2.depth.toFixed(3) + ' m', 'walls driven into a wall they already touch');
    }

    // E3: already overlapping, moved together, no worse: delta-only by design. This is why §EDIT-REPORT needs pairsOver.
    var P = [300, 302, clearY, clearY + 2, z0, z0 + 2], Q = tr(P, [0.5, 0, 0]);
    var be = Object.assign({}, base), af = Object.assign({}, base);
    be[NEW] = P; be[NEW + 1] = Q; af[NEW] = tr(P, [1, 0, 0]); af[NEW + 1] = tr(Q, [1, 0, 0]);
    gateCase(G, 'E3_preexisting_overlap_moved_together', { before: be, after: af, moved: [NEW, NEW + 1] }, { note: 'delta-only: an overlap already there is never counted', label: 'overlaps that were already there', design: true });

    // E4: bad numbers.
    gateCase(G, 'E4_nan_coordinates', addNew([NaN, NaN, NaN, NaN, NaN, NaN]), { label: 'invalid coordinates' });
    gateCase(G, 'E4b_zero_size_box', addNew([300, 300, clearY, clearY, z0, z0]), { label: 'zero-size elements' });

    // E5: the gate trusts its moved list. A real overlap by an element left off the list goes unseen.
    var other = ofClass('IfcWallStandardCase', function (b) { return b[5] - b[4] > 2; })[1];
    gateCase(G, 'E5_changed_element_left_off_moved_list', moveTo(other, W.slice(), []), { note: 'judged set = res.commands + res.riders in commitGridMove', label: 'elements changed outside the edit\'s own list' });

    // F1: positive control for the hosted-filling path.
    var door = Object.keys(hostOf).map(Number).filter(function (f) { return op[f] && /Door|Window/.test(op[f].params.ifc_class) && base[hostOf[f]]; })[0];
    if (door == null) add('F1_door_off_its_wall', 'SdgGate', 'INCONCLUSIVE', [], 'run', 'no real filling', '');
    else gateCase(G, 'F1_door_off_its_wall', moveTo(door, tr(base[door], [50, 50, 0])), { names: door });
    return { solids: fids.length };
  });
}

function spanRows(SQL) {
  var bytes = fs.readFileSync(path.join(ROOT, 'Garage_ARC.db'));
  var db = new SQL.Database(bytes);
  require(path.join(ROOT, 'str_walker_bridge.js'));
  var SWB = global.window.swbInit ? global.window : (global.swbInit ? global : require(path.join(ROOT, 'str_walker_bridge.js')));
  SWB.swbInit(db, {});
  var info = SWB.swbGateInfo();
  var mi = GS.readMaterial(db), mat = mi.material, depth = info.section && info.section.depth;
  var ys = info.base0.grid.yLines, index = 8, gap = Math.abs(ys[9] - ys[8]);
  var girders = info.base0.girders.length;
  console.log('§EDIT_COVERAGE_POP building=Garage system=' + info.system + ' lattice=' + info.base0.grid.xLines.length + 'x' + ys.length + ' girders=' + girders + ' material=' + mat + ' mixed=' + mi.mixed + ' measuredDepth=' + (depth != null ? depth.toFixed(3) : 'none') + ' y8 bay=' + gap.toFixed(3));
  var sig = function (id, delta, o) {
    o = o || {};
    var p = GS.preview(info, [], null, 'y', index, delta, mat, depth);
    var s = p.worst ? p.worst.signal : 'NONE';
    add(id, 'GridSpanGate', s === 'GREEN' ? 'NONE' : s, s === 'GREEN' || s === 'NONE' ? [] : ['span'], 'run',
      (o.note ? o.note + '; ' : '') + 'worst span ' + (p.worst ? p.worst.span.toFixed(3) : '-') + ' m', o.label, o.design);
  };
  var byCheck = function (id, span, m, d, o) {
    o = o || {};
    var r = GS.check(span, m, d);
    add(id, 'GridSpanGate', !r ? 'REFUSED' : r.signal === 'GREEN' ? 'NONE' : r.signal, r && r.signal !== 'GREEN' ? ['span'] : [], 'run', o.note, o.label, o.design);
  };
  sig('SP0_CONTROL_small_move', 0.1);
  sig('SP1_span_past_depth_limit', 1.5);
  sig('SP2_span_past_max', 6.7);
  sig('SP3_mm_as_m_delta_600', 600, { note: 'caught: the span becomes absurd' });
  sig('SP4_gridline_dragged_past_neighbour', gap + 0.2, { note: 'no crossing rule; any colour comes from the longer bay', label: 'grid lines dragged past each other' });
  byCheck('SP5_zero_span', 0, mat, depth, { note: 'two lines on top of each other reads as fine', label: 'grid lines placed on top of each other' });
  byCheck('SP6_unknown_material', 10, 'WOOD', depth, { note: 'refused, never guessed' });
  byCheck('SP7_steel_girder_15m_judged_as_RC', 15, 'RC', depth, { note: 'one building-wide material; this building is mixed, so a steel girder within its own 18 m limit reads RED' });

  // SP8: a floating IfcBeam row: pieces come from the column walk, never from IfcBeam rows.
  var db2 = new SQL.Database(bytes);
  db2.run("INSERT INTO elements_meta (guid, discipline, ifc_class, element_name) VALUES ('EDIT_COV_FLOATING','STR','IfcBeam','Concrete floating beam')");
  db2.run("INSERT INTO element_transforms (guid, center_x, center_y, center_z, rotation_x, rotation_y, rotation_z, bbox_x, bbox_y, bbox_z) VALUES ('EDIT_COV_FLOATING', 9000, 9000, 900, 0, 0, 0, 30, 0.3, 0.5)");
  SWB.swbInit(db2, {});
  var info2 = SWB.swbGateInfo();
  var seen = info2.base0.girders.some(function (g) { return g.guid === 'EDIT_COV_FLOATING'; });
  add('SP8_floating_30m_beam_row', 'GridSpanGate', seen ? 'RED' : 'NONE', [], 'run', 'girders before ' + girders + ', after ' + info2.base0.girders.length + '; only girders the column walk derives are judged', 'real beams: only girders walked from columns are span-checked');
  return { girders: girders };
}

initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm')) }).then(function (SQL) {
  return gateRows(SQL).then(function () { return spanRows(SQL); });
}).then(function () {
  var notChecked = Array.from(new Set(rows.filter(function (r) { return r.verdict === 'NONE' && r.label && !r.design; }).map(function (r) { return r.label; }))).sort();
  // These have no row at all: no gate on a live edit looks at them, so no injection can fire.
  notChecked = notChecked.concat(['load capacity', 'beam and column rules (Regulatory Report only)']);
  var table = { generated_by: 'modeller/tests/witness_edit_report_coverage.js', spec: 'bim-compiler prompts/MODELLER_MASTER.md §EDIT-REPORT', rows: rows, not_checked: notChecked };
  var defects = rows.filter(function (r) { return !/CONTROL/.test(r.id); });
  var none = defects.filter(function (r) { return r.verdict === 'NONE'; });
  console.log('§EDIT_COVERAGE_SUMMARY defects=' + defects.length + ' none=' + none.length + ' by_design=' + none.filter(function (r) { return r.design; }).length + ' inconclusive=' + rows.filter(function (r) { return r.verdict === 'INCONCLUSIVE'; }).length + ' verdict=' + (none.some(function (r) { return !r.design; }) ? 'DISPROVED' : 'PROVED') + ' claim=live_edit_checks_catch_each_defect_class');
  console.log('§EDIT_COVERAGE_NOT_CHECKED ' + notChecked.join(' · '));
  if (process.argv.indexOf('--write') >= 0) { fs.writeFileSync(PIN, JSON.stringify(table, null, 1) + '\n'); console.log('§EDIT_COVERAGE_WRITTEN ' + PIN); }
  var pinned = fs.existsSync(PIN) ? JSON.parse(fs.readFileSync(PIN, 'utf8')) : null;
  var get = function (rs, id) { return rs.filter(function (r) { return r.id === id; })[0] || {}; };

  Witness('EDIT_REPORT_COVERAGE')
    .population(function () { return rows; })
    .schema({ type: 'object', required: ['id', 'gate', 'verdict', 'kinds', 'how', 'note', 'label', 'design'],
      properties: { verdict: { enum: ['RED', 'ORANGE', 'NONE', 'REFUSED', 'THROWS', 'INCONCLUSIVE'] }, gate: { enum: ['SdgGate', 'GridSpanGate'] }, how: { enum: ['run', 'read'] } } })
    .invariant('clean control fires nothing (gate)', function (rs) { return get(rs, 'CONTROL_clean').verdict === 'NONE'; })
    .invariant('small move fires nothing (span)', function (rs) { return get(rs, 'SP0_CONTROL_small_move').verdict === 'NONE'; })
    .invariant('positive control: same-class overlap is RED, named on the anchor', function (rs) { return get(rs, 'D1_overlap_same_class').verdict === 'RED'; })
    .invariant('positive control: door off its wall is door-out', function (rs) { return (get(rs, 'F1_door_off_its_wall').kinds || []).indexOf('door-out') >= 0; })
    .invariant('positive control: span past the table limit is RED', function (rs) { return get(rs, 'SP2_span_past_max').verdict === 'RED'; })
    .invariant('nothing inconclusive', function (rs) { return rs.every(function (r) { return r.verdict !== 'INCONCLUSIVE'; }); })
    .invariant('every blind spot has report wording', function (rs) { return rs.every(function (r) { return r.verdict !== 'NONE' || /CONTROL/.test(r.id) || r.label; }); })
    .invariant('table matches the pinned modeller/edit_report_coverage.json', function (rs) { return !!pinned && JSON.stringify(pinned.rows) === JSON.stringify(rs) && JSON.stringify(pinned.not_checked) === JSON.stringify(notChecked); })
    .redControl(function (rs) { return rs.map(function (r) { return r.id === 'D1_overlap_same_class' ? Object.assign({}, r, { verdict: 'NONE' }) : r; }); })
    .run();
}).catch(function (e) { console.log('§EDIT_COVERAGE verdict=INCONCLUSIVE reason=' + e.message); console.log(e.stack); process.exitCode = 1; });
