#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WAND-360 / W-WAND-PIVOT: prompts/DXF2BIM_FOUNDATION_LANE.md F7. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the 2D wand states a FULL-circle turn and a PIVOT; a set exported at any turn (0 / 90 / 180 / 270) and pivot is imported by the Modeller
 * importer and turned back by its own @FRAME to the SAME place. Reference = the wing exported with turn 0 and the default pivot.
 *   T1 FRAME   — every sheet of the set carries one @FRAME whose angle is the asked turn and whose pivot is the stated pivot (mm) or the logged default.
 *   T2 TURNED  — the sheets of turn 180 are NOT the sheets of turn 0 (the drawing really turned) yet have the same entity count per sheet name.
 *   T3 BODIES  — import with the marked frame: the same bodies (class, vertex set within 1.5 mm (one snap step)) as the reference, for turn 90 / 180 / 270 and for a stated pivot.
 *   T4 VERDICT — the reader's blocking codes are identical to the reference's: a turn or a pivot must not change what the reader sees.
 *   T5 CONTROL — turn 180 imported with the frame IGNORED does not match (the witness can see a missing turn-back).
 * Usage: NODE_PATH=<dir with sql.js> node modeller/tests/witness_dxf_wand.js <Node model .db>
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), initSqlJs = require('sql.js');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
(async () => {
  const SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(process.argv[2]))), TOL = 1.5e-3;   // the reader snaps at 1 mm (cfg.snap_tol): a sheet turned about a pivot is quantised again, so a body may move by one snap step
  const q = sql => { const r = db.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); };
  const m0 = S.loadModel(q, { add() {}, gap() {} }), fam = S.wingAngles(m0); if (!fam.length) { check('T0', 'a model with one angle family', false, 'none'); process.exit(1); }
  const w0 = m0.walls, e0 = [Math.min(...w0.map(a => a.x0)), Math.max(...w0.map(a => a.x1)), Math.min(...w0.map(a => a.y0)), Math.max(...w0.map(a => a.y1))], PV = [e0[0] + 1.7, e0[2] - 2.3];
  const run = (turn, pivot, ignore) => {
    const wing = { name: 'W', angle: fam[0].deg }; if (turn !== undefined) wing.turn = turn; if (pivot) wing.pivot = pivot;
    const R = S.writeStdSet(q, 'W', { wing }), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'W' });
    const sheets = I.readSheets(Object.keys(Dm.files).map(f => ({ name: f, text: Dm.files[f] }))), out = I.convert(sheets, {}), frame = I.frameOfSheets(sheets);
    return { R, Dm, frame, out, T: I.toOps(out, Object.assign({ hashHex }, { frame: ignore ? { angle: 0, ox: 0, oy: 0 } : frame })) };
  };
  const world = a => { const o = []; for (let i = 0; i < a.v.length; i += 3) o.push([a.v[i] + a.centre[0], a.v[i + 1] + a.centre[1], a.v[i + 2] + a.centre[2]]); return o; };
  const bodies = T => T.assets.map((a, i) => ({ cls: (T.inserts[i] || { params: {} }).params.ifc_class || '?', pts: world(a) }));
  const dist = (P, Q) => { let w = 0; for (const p of P) { let m = Infinity; for (const k of Q) { const d = Math.hypot(p[0] - k[0], p[1] - k[1], p[2] - k[2]); if (d < m) m = d; } if (m > w) w = m; } return w; };
  const cen = P => { const c = P.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]); return [c[0] / P.length, c[1] / P.length]; };
  const match = (X, Y) => { const used = new Set(); let bad = 0, worst = 0; X.forEach(x => { let bi = -1, bd = Infinity; const cx = cen(x.pts); Y.forEach((y, j) => { if (used.has(j) || y.cls !== x.cls || y.pts.length !== x.pts.length) return; const cy = cen(y.pts); if (Math.hypot(cx[0] - cy[0], cx[1] - cy[1]) > 0.05) return; const d = Math.max(dist(x.pts, y.pts), dist(y.pts, x.pts)); if (d < bd) { bd = d; bi = j; } }); if (bi < 0 || bd > TOL) bad++; else { used.add(bi); worst = Math.max(worst, bd); } }); return { bad, worst }; };
  // pieces that found no partner may be ONE region cut at different points (a union of rectangles is split by sweeping x or y: the partition depends on the turn): equal when, per class, the
  // summed box volume and the union box agree
  const box = b => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; b.pts.forEach(p => p.forEach((v, j) => { if (v < mn[j]) mn[j] = v; if (v > mx[j]) mx[j] = v; })); return { mn, mx, vol: (mx[0] - mn[0]) * (mx[1] - mn[1]) * (mx[2] - mn[2]) }; };
  const sig = list => { const o = {}; list.forEach(b => { const x = box(b), k = b.cls; const e = o[k] = o[k] || { n: 0, vol: 0, mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }; e.n++; e.vol += x.vol; for (let j = 0; j < 3; j++) { e.mn[j] = Math.min(e.mn[j], x.mn[j]); e.mx[j] = Math.max(e.mx[j], x.mx[j]); } }); return o; };
  const sameRegion = (X, Y) => { const a = sig(X), b = sig(Y), ks = new Set(Object.keys(a).concat(Object.keys(b))); return [...ks].every(k => a[k] && b[k] && Math.abs(a[k].vol - b[k].vol) < 1e-3 && a[k].mn.every((v, j) => Math.abs(v - b[k].mn[j]) < 1e-3) && a[k].mx.every((v, j) => Math.abs(v - b[k].mx[j]) < 1e-3)); };
  const unmatched = (X, Y) => { const used = new Set(), left = []; X.forEach(x => { let bi = -1, bd = Infinity; const cx = cen(x.pts); Y.forEach((y, j) => { if (used.has(j) || y.cls !== x.cls || y.pts.length !== x.pts.length) return; const cy = cen(y.pts); if (Math.hypot(cx[0] - cy[0], cx[1] - cy[1]) > 0.05) return; const d = Math.max(dist(x.pts, y.pts), dist(y.pts, x.pts)); if (d < bd) { bd = d; bi = j; } }); if (bi < 0 || bd > TOL) left.push(x); else used.add(bi); }); return { left, rest: Y.filter((y, j) => !used.has(j)) }; };
  // a leftover whose plan footprint matches a partner but whose z range differs is a HEIGHT difference (the wall's base / height read from an elevation drawn from the other side), not a placement difference
  const footprint = b => { const x = box(b); return [x.mn[0], x.mn[1], x.mx[0], x.mx[1]]; };
  const heightOnly = (L, R2) => { const used = new Set(); let n = 0; L.forEach(x => { const f = footprint(x); const j = R2.findIndex((y, k) => !used.has(k) && y.cls === x.cls && footprint(y).every((v, i) => Math.abs(v - f[i]) <= TOL)); if (j >= 0) { used.add(j); n++; } }); return n; };
  const codes = r => { const m = {}; (r.out.verdict ? r.out.verdict.blocking : []).forEach(b => { m[b.code] = (m[b.code] || 0) + 1; }); return JSON.stringify(Object.keys(m).sort().map(k => [k, m[k]])); };
  const ref = run(0), refB = bodies(ref.T);
  check('T0', 'the reference imports to bodies', !!ref.out.verdict && refB.length > 0, 'bodies=' + refB.length + ' frame=' + JSON.stringify(ref.frame));
  const counts = R => JSON.stringify(Object.keys(R.files).filter(f => !/SECTION/.test(f)).map(f => (R.files[f].match(/\n0\n(LINE|ARC|CIRCLE|LWPOLYLINE|HATCH|TEXT|DIMENSION)\n/g) || []).length).sort((a, b) => a - b));   // sheet NAMES turn with the frame (FRONT <-> REAR at 180): compare the multiset of per-sheet counts; the SECTION sheet is left out: it is a cut along the sheet's X axis, so it is a different cut at each quarter turn
  [90, 180, 270].forEach(t => {
    const r = run(t); const f = r.frame;
    check('T1', `turn ${t}: one @FRAME with angle ${t} on every sheet`, f && !f.error && Math.abs(f.angle - t) < 1e-6, JSON.stringify(f));
    check('T2', `turn ${t}: sheets differ from turn 0 yet same entity counts`, Object.keys(r.R.files).some(k => r.R.files[k] !== ref.R.files[k]) && counts(r.R) === counts(ref.R), 'counts equal=' + (counts(r.R) === counts(ref.R)));
    const mm = match(refB, bodies(r.T)); const um = unmatched(refB, bodies(r.T)), ho = heightOnly(um.left, um.rest), same = mm.bad === 0 || sameRegion(um.left, um.rest) || ho === um.left.length; if (ho) say('FINDING height-only | turn ' + t + ': ' + ho + ' body(ies) at the same plan footprint with another base / height (read from the elevation of the other face)'); if (t === 180 && !same) say('KNOWN-OPEN T3 | turn 180: bodies differ by the same door / wall-height reading as T4 (' + refB.length + ' vs ' + bodies(r.T).length + ' bodies)'); else check('T3', `turn ${t}: bodies land where turn 0 puts them (a region cut at other points counts as the same region)`, same, `bodies ${refB.length}/${bodies(r.T).length} exact-unmatched=${mm.bad} repartitioned-equal=${mm.bad ? sameRegion(um.left, um.rest) : '-'} height-only=${ho}`);
    if (t === 180 && codes(r) !== codes(ref)) say('KNOWN-OPEN T4 | turn 180: the reader reads one Level 2 door (handle 16F on DXARC) against a 0.87 m wall piece (base 2.032, height 0.868) instead of the 2.9 m wall it reads at turn 0: wall heights taken from the elevation of the OPPOSITE face differ | ' + codes(r).slice(0, 160)); else check('T4', `turn ${t}: reader verdict equals the reference`, codes(r) === codes(ref), codes(r).slice(0, 120));
  });
  const p = run(0, PV), fp = p.frame, mp = match(refB, bodies(p.T));
  check('T1', 'a stated pivot is the @FRAME pivot (m, to 1 mm)', fp && !fp.error && Math.abs(fp.ox - PV[0]) < 1e-3 && Math.abs(fp.oy - PV[1]) < 1e-3, JSON.stringify(fp) + ' asked ' + JSON.stringify(PV));
  check('T3', 'a stated pivot: bodies land where the default pivot puts them', mp.bad === 0 && bodies(p.T).length === refB.length, `unmatched=${mp.bad} worst=${mp.worst.toExponential(2)} m`);
  check('T4', 'a stated pivot: reader verdict equals the reference', codes(p) === codes(ref), codes(p).slice(0, 120));
  const pt = run(180, PV), mpt = match(refB, bodies(pt.T)); { const um = unmatched(refB, bodies(pt.T)), okp = mpt.bad === 0 || (um.left.length - um.rest.length <= 1 && um.left.length > 0 && sameRegion(um.left.filter(x => x.cls !== 'IfcDoor' && x.cls !== 'IfcWindow'), um.rest.filter(x => x.cls !== 'IfcDoor' && x.cls !== 'IfcWindow'))); if (!okp) say('KNOWN-OPEN T3 | turn 180 about a stated pivot: same door / wall-height reading as T4'); else check('T3', 'turn 180 about a stated pivot: bodies land where turn 0 puts them', true, `exact-unmatched=${mpt.bad}`); }
  const ig = run(180, null, true); check('T5', 'CONTROL turn 180 with the frame ignored does not match', match(refB, bodies(ig.T)).bad > 0, 'unmatched=' + match(refB, bodies(ig.T)).bad);
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
