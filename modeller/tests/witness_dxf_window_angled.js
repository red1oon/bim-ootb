#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WIN-ANGLED (rule D21, prompts/DXF2BIM_FOUNDATION_LANE.md). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: windows in angled walls got no gap on the 2D plans (no placement axes): Hospital 72, LTU 59, the Duplex turned 30 deg 22 of 22
 * `GAP:opening_host_not_orthogonal` before D21.
 *   W1 TURNED   — the Duplex turned 30 deg (DX_ROT30) cuts every window as the Duplex does: same gap width along the wall (1 mm) and the same drawn / in_cut state.
 *   W2 NONE     — on the given model no window keeps GAP:opening_host_not_orthogonal while its host is cut and it has a mesh.
 *   W3 OPEN     — every window gap cut in an angled wall (§OPENING ... (D21)) leaves the window centre outside every A-WALL polygon of its plan.
 * Usage: NODE_PATH=<dir with sql.js> node modeller/tests/witness_dxf_window_angled.js <Node model .db> [DX_ROT30.db DXARC.db]
 */
'use strict';
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
const M = path.join(__dirname, '..'), S = require(path.join(M, 'dxf2bim', 'std2d.js')), P = new (require(path.join(M, 'lib/dxf-parser.js')))();
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
(async () => {
  const SQL = await initSqlJs(), open = f => { const db = new SQL.Database(new Uint8Array(fs.readFileSync(f))); return sql => { const r = db.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); }; };
  const win = (R, re) => { const o = {}; R.log.filter(l => /^§OPENING .*cls=IfcWindow/.test(l)).forEach(l => { const g = /guid=(\S+)/.exec(l)[1], m = re.exec(l); if (m) o[g] = { w: +m[2] - +m[1], gap: /gap=(\S+)/.exec(l)[1] }; }); return o; };
  const rot30 = process.argv[3], dux = process.argv[4];
  if (rot30 && dux) {
    const A = win(S.writeStdSet(open(dux), 'W', {}), /along=\(([-\d.]+),([-\d.]+)\)/), B = win(S.writeStdSet(open(rot30), 'W', {}), /along=\(?([-\d.]+)(?:,|\.\.)([-\d.]+)/);
    const ks = Object.keys(A), bad = ks.filter(g => !B[g] || Math.abs(A[g].w - B[g].w) > 1 || (A[g].gap === 'in_cut') !== (B[g].gap === 'in_cut'));
    check('W1', 'the Duplex turned 30 deg cuts every window as the Duplex does (gap width 1 mm, same drawn / in_cut state)', ks.length > 0 && bad.length === 0, `windows=${ks.length} angled_d21=${Object.keys(B).length} bad=${bad.length} ${bad.slice(0, 3).map(g => g + ':' + (A[g] && A[g].w) + '/' + (B[g] && B[g].w)).join(' ')}`);
  }
  const R = S.writeStdSet(open(process.argv[2]), 'W', {}), Mo = R.model;
  const left = R.gaps.filter(g => g[0] === 'GAP:opening_host_not_orthogonal' && Mo.by_guid[g[1]] && Mo.by_guid[g[1]].cls === 'IfcWindow');
  check('W2', 'no window keeps GAP:opening_host_not_orthogonal', left.length === 0, `left=${left.length} ${left.slice(0, 3).map(g => g[1]).join(' ')}`);
  const d21 = R.log.filter(l => /^§OPENING .*cls=IfcWindow.*\(D21\)/.test(l)).map(l => /guid=(\S+)/.exec(l)[1]); let blocked = [];
  R.views.plan.forEach(({ view, storey }) => { const name = Object.keys(R.files).find(n => n.endsWith('_' + view + '_std.dxf')); if (!name) return;
    const walls = P.parseSync(R.files[name]).entities.filter(e => /^A-WALL/.test(e.layer) && e.type === 'LWPOLYLINE').map(e => e.vertices.map(v => [v.x, v.y]));
    d21.map(g => Mo.by_guid[g]).filter(e => e && e.storey === storey.name).forEach(e => { const c = [(e.x0 + e.x1) * 500, (e.y0 + e.y1) * 500]; if (walls.some(w => inPoly(c, w))) blocked.push(e.guid); }); });
  check('W3', 'a window gap cut in an angled wall leaves the window centre outside every wall polygon', blocked.length === 0, `d21_windows=${d21.length} drawn=${R.log.filter(l => /cls=IfcWindow.*gap=drawn_rotated.*\(D21\)/.test(l)).length} blocked=${blocked.length} ${blocked.slice(0, 3).join(' ')}`);
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
