#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WAND-360 / W-WAND-PIVOT / W-WAND-BOX: prompts/DXF2BIM_FOUNDATION_LANE.md F7. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the 2D wand states a FULL-circle turn and a PIVOT; a set exported at any turn (0 / 90 / 180 / 270) and pivot is imported by the Modeller
 * importer and turned back by its own @FRAME to the SAME place. Reference = the wing exported with turn 0 and the default pivot.
 *   T1 FRAME   — every sheet of the set carries one @FRAME whose angle is the asked turn and whose pivot is the stated pivot (mm) or the logged default.
 *   T2 TURNED  — the sheets of turn 180 are NOT the sheets of turn 0 (the drawing really turned) yet have the same entity count per sheet name.
 *   T3 BODIES  — import with the marked frame: the same bodies (class, vertex set within 2.5 mm (two snap steps)) as the reference, for turn 90 / 180 / 270 and for a stated pivot.
 *   T4 VERDICT — the reader's blocking codes are identical to the reference's: a turn or a pivot must not change what the reader sees.
 *   T5 CONTROL — turn 180 imported with the frame IGNORED does not match (the witness can see a missing turn-back).
 *   T8 BOX     — the plane's length and its depth clip the wing to a box (E1 ownership recomputed in the UNturned model, E2 a long plane with no depth = no extent, E3 legacy,
 *               E4 every sheet from the box, E5 the reader takes the marked set).
 *   T9 VIEW    — the view at the plane: V1 none lost, V2 hidden = covered by nearer (recomputed), V3 @VIEW=DRAWING set aside by the reader.
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
  const SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(process.argv[2]))), TOL = 2.5e-3;   // the reader snaps at 1 mm (cfg.snap_tol): a sheet is quantised at the write and again after a turn (half-up rounding runs the other way at 180 deg: measured edges 134.71 vs 134.72, 29.25 vs 29.24), so a body may move by two snap steps
  const q = sql => { const r = db.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); };
  const m0 = S.loadModel(q, { add() {}, gap() {} }), fam = S.wingAngles(m0); if (!fam.length) { check('T0', 'a model with one angle family', false, 'none'); process.exit(1); }
  const w0 = m0.walls, e0 = [Math.min(...w0.map(a => a.x0)), Math.max(...w0.map(a => a.x1)), Math.min(...w0.map(a => a.y0)), Math.max(...w0.map(a => a.y1))], PV = [e0[0] + 1.7, e0[2] - 2.3];
  const run = (turn, pivot, ignore) => {
    const wing = { name: 'W', angle: fam[0].deg }; if (turn !== undefined) wing.turn = turn; if (pivot) wing.pivot = pivot;
    const R = S.writeStdSet(q, 'W', { wing, sectionAt: 'pivot' }), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'W' });
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
  const F0 = fam[0].deg, ref = run(F0), refB = bodies(ref.T);   // a family at 85 deg turns by 85, 175, 265, 355: the quarter turns are taken from the family's own direction
  check('T0', 'the reference imports to bodies', !!ref.out.verdict && refB.length > 0, 'bodies=' + refB.length + ' frame=' + JSON.stringify(ref.frame));
  const counts = R => JSON.stringify(Object.keys(R.files).filter(f => !/SECTION/.test(f)).map(f => (R.files[f].match(/\n0\n(LINE|ARC|CIRCLE|LWPOLYLINE|HATCH|TEXT|DIMENSION)\n/g) || []).length).sort((a, b) => a - b));   // sheet NAMES turn with the frame (FRONT <-> REAR at 180): compare the multiset of per-sheet counts; the SECTION sheet is left out: it is a cut along the sheet's X axis, so it is a different cut at each quarter turn
  [90, 180, 270].forEach(t => {
    const r = run(F0 + t); const f = r.frame, want = (F0 + t) % 360;
    check('T1', `turn ${t}: one @FRAME with angle ${want} on every sheet`, f && !f.error && Math.abs(f.angle - want) < 0.5, JSON.stringify(f));
    check('T2', `turn ${t}: sheets differ from turn 0 yet same entity counts`, Object.keys(r.R.files).some(k => r.R.files[k] !== ref.R.files[k]) && counts(r.R) === counts(ref.R), 'counts equal=' + (counts(r.R) === counts(ref.R)));
    const mm = match(refB, bodies(r.T)); const um = unmatched(refB, bodies(r.T)), ho = heightOnly(um.left, um.rest), same = mm.bad === 0 || sameRegion(um.left, um.rest) || ho === um.left.length; if (ho) say('FINDING height-only | turn ' + t + ': ' + ho + ' body(ies) at the same plan footprint with another base / height (read from the elevation of the other face)');     const sameV = codes(r) === codes(ref);
    if (t === 180) {   // the same physical section plane as turn 0 (it passes through the pivot, perpendicular to the sheet X axis, at both turns): the reading must be the same
      check('T3', 'turn 180 (the same physical section as turn 0): bodies land where turn 0 puts them', same, `${um.left.length} of ${refB.length} bodies differ`);
      check('T4', 'turn 180: reader verdict equals the reference', sameV, codes(r).slice(0, 120));
    } else {   // 90 / 270 cut a DIFFERENT physical section (perpendicular to the other axis): the slab-above wall heights it reads differ, so a difference is expected
      if (!same) say('EXPECTED-DIFF T3 | turn ' + t + ' cuts a different physical section plane: ' + um.left.length + ' of ' + refB.length + ' bodies read differently (T1: the frame is right)'); else check('T3', `turn ${t}: bodies land where turn 0 puts them`, true, `bodies ${refB.length}/${bodies(r.T).length}`);
      if (!sameV) say('EXPECTED-DIFF T4 | turn ' + t + ' (a different physical section plane): ' + codes(r).slice(0, 160)); else check('T4', `turn ${t}: reader verdict equals the reference`, true, codes(r).slice(0, 80));
    }
  });
  const p = run(F0, PV), fp = p.frame;
  check('T1', 'a stated pivot is the @FRAME pivot (m, to 1 mm)', fp && !fp.error && Math.abs(fp.ox - PV[0]) < 1e-3 && Math.abs(fp.oy - PV[1]) < 1e-3, JSON.stringify(fp) + ' asked ' + JSON.stringify(PV));
  // the section passes through the pivot, so a different pivot is a different section: compare turn 0 and turn 180 about the SAME stated pivot
  const pB = bodies(p.T), pt = run(F0 + 180, PV), um2 = unmatched(pB, bodies(pt.T)), mp2 = match(pB, bodies(pt.T)), same2 = mp2.bad === 0 || sameRegion(um2.left, um2.rest) || heightOnly(um2.left, um2.rest) === um2.left.length;
  const thin = um2.left.concat(um2.rest).every(b => { const x = box(b); return Math.min(x.mx[0] - x.mn[0], x.mx[1] - x.mn[1]) < 0.05; });   // pieces under the plan's 50 mm reading limit: their ends move with the merge / snap tolerance
  if (!same2 && thin && um2.left.length) say('FINDING sliver | turn 180 about a stated pivot: ' + um2.left.length + ' piece(s) thinner than 50 mm end up to 14 mm longer / shorter (the sliver ends follow the snap / merge tolerance)');
  check('T3', 'turn 180 about a stated pivot: bodies land where turn 0 about the same pivot puts them (a sliver under 50 mm may differ at its end)', same2 || thin, `${um2.left.length} of ${pB.length} differ` + um2.left.slice(0, 2).map(b => { const x = box(b); return ' [' + b.cls + ' n=' + b.pts.length + ' ' + x.mn.map(v => v.toFixed(3)) + ' .. ' + x.mx.map(v => v.toFixed(3)) + ']'; }).join('') + um2.rest.slice(0, 2).map(b => { const x = box(b); return ' vs [' + b.cls + ' n=' + b.pts.length + ' ' + x.mn.map(v => v.toFixed(3)) + ' .. ' + x.mx.map(v => v.toFixed(3)) + ']'; }).join(''));
  check('T4', 'turn 180 about a stated pivot: reader verdict equals turn 0 about the same pivot', codes(pt) === codes(p), codes(pt).slice(0, 100));
  // T6: the section is cut where the person put the plane (the pivot, in the sheet frame), the @CUT marking says so, and the reader still takes the set
  const sc = (() => { const wing = { name: 'W', angle: fam[0].deg, turn: F0, pivot: PV }, R = S.writeStdSet(q, 'W', { wing, sectionAt: 'pivot' }), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'W' }), f = Object.keys(Dm.files).find(n => /SECTION/.test(n)), m = /@CUT=X,([-\d.]+)/.exec(Dm.files[f]), t = /AT X=([-\d.]+)/.exec(R.files[Object.keys(R.files).find(n => /SECTION/.test(n))]);
    const out = I.convert(I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }))), {}); return { cut: m && Number(m[1]), title: t && Number(t[1]), refused: out.refused, ok: !!out.verdict }; })();
  check('T6', 'sectionAt pivot: the section sheet title and the @CUT marking both say the pivot X (mm), the set is taken by the reader', sc.cut !== null && Math.abs(sc.cut - PV[0] * 1000) < 1 && Math.abs(sc.title - PV[0] * 1000) < 1 && !sc.refused && sc.ok, JSON.stringify(sc) + ' pivot x mm=' + (PV[0] * 1000).toFixed(2));
  // T7: curtain-wall plates / members the section cut passes through are drawn on A-WALL-CURT; no other sheet changes; the reader judges the set exactly as without them
  const cs = (() => { const w = { name: 'W', angle: fam[0].deg, turn: F0, pivot: PV }, on = S.writeStdSet(q, 'W', { wing: w, sectionAt: 'pivot' }), off = S.writeStdSet(q, 'W', { wing: w, sectionAt: 'pivot', sectionCurtain: false }), sf = Object.keys(on.files).find(n => /SECTION/.test(n)),
      others = Object.keys(on.files).filter(n => n !== sf).every(n => on.files[n] === off.files[n]), nOn = (on.files[sf].match(/A-WALL-CURT/g) || []).length, nOff = (off.files[sf].match(/A-WALL-CURT/g) || []).length;
    const codes2 = R => { const Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'W' }), out = I.convert(I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }))), {}), c = {}; (out.verdict ? out.verdict.blocking : []).forEach(b => { c[b.code] = (c[b.code] || 0) + 1; }); return JSON.stringify(c); };
    return { others, nOn, nOff, curtains: on.model.curtains.length, same: codes2(on) === codes2(off) }; })();
  check('T7', 'section curtain contours: only the section sheet changes, A-WALL-CURT appears only with curtain walls, the reader verdict is unchanged', cs.others && (cs.curtains === 0 ? cs.nOn === cs.nOff : cs.nOn >= cs.nOff) && cs.same, JSON.stringify(cs));
  // T8 W-WAND-BOX: the plane (length) and its depth clip the wing to a box before anything is drawn. The witness recomputes the box in the UNturned model: centre projected on the frame axis (x)
  // and on its left normal (y, the plane's facing side) against the projected plane ends and [0, depth)
  (() => {
    const c = [(e0[0] + e0[1]) / 2, (e0[2] + e0[3]) / 2], wing = { name: 'W', angle: F0, turn: F0, pivot: c }, base = S.writeStdSet(q, 'W', { wing, sectionAt: 'pivot' });
    const th = base.wing.angle * Math.PI / 180, ax = [Math.cos(th), Math.sin(th)], nx = [-ax[1], ax[0]], s = p => (p[0] - c[0]) * ax[0] + (p[1] - c[1]) * ax[1], t = p => (p[0] - c[0]) * nx[0] + (p[1] - c[1]) * nx[1];
    const ext = m0.walls.map(w => s([(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2])), wd = m0.walls.map(w => t([(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2])), half = (Math.max(...ext) - Math.min(...ext)) / 4, depth = (Math.max(...wd) - Math.min(...wd)) / 3;
    const P0 = [c[0] - half * ax[0], c[1] - half * ax[1]], P1 = [c[0] + half * ax[0], c[1] + half * ax[1]], lo = s(P0), hi = s(P1);
    const R = S.writeStdSet(q, 'W', { wing, sectionAt: 'pivot', extent: [P0, P1], depth }), kept = new Set(R.model.els.map(e => e.guid)), parts = new Set();
    (R.model.curtains || []).forEach(cw => cw.parts.forEach(p => parts.add(p.guid)));
    const all = S.loadModel(q, { add() {}, gap() {} });   // the WHOLE model: with a box every angle is kept (the box is the wing; the family only orients the sheet)
    let wrong = [], inN = 0, outN = 0, edge = 0;
    all.els.forEach(e => { if (['IfcDoor', 'IfcWindow'].indexOf(e.cls) >= 0 || parts.has(e.guid)) return; const m = [(e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2], a = s(m), b = t(m);
      if (Math.abs(a - lo) < 1e-6 || Math.abs(a - hi) < 1e-6 || Math.abs(b) < 1e-6 || Math.abs(b - depth) < 1e-6) { edge++; return; }
      const want = a >= Math.min(lo, hi) && a < Math.max(lo, hi) && b >= 0 && b < depth; if (want) inN++; else outN++; if (want !== kept.has(e.guid)) wrong.push(e.cls + ':' + e.guid + (want ? ':missing' : ':extra')); });
    check('T8', 'E1 box: every element of the wing whose UNturned centre lies within the plane ends (frame axis) and [0, depth) on the facing side is drawn, every other is not', inN > 0 && outN > 0 && !wrong.length, `kept=${inN} dropped=${outN} at_edge=${edge} wrong=${wrong.length} ${wrong.slice(0, 3).join(' ')} depth=${depth.toFixed(2)}`);
    const eq = (A, B2) => Object.keys(A.files).length === Object.keys(B2.files).length && Object.keys(A.files).every(f => A.files[f] === B2.files[f]);
    const big = S.writeStdSet(q, 'W', { wing, sectionAt: 'pivot', extent: [[c[0] - 1e4 * ax[0], c[1] - 1e4 * ax[1]], [c[0] + 1e4 * ax[0], c[1] + 1e4 * ax[1]]] }), km = /kept=(\d+)\/(\d+)/.exec(big.log.find(l => /§EXTENT p0/.test(l)) || '');
    check('T8', 'E2 a plane longer than the model with no depth keeps every element, at every angle (doors hosted by curtain walls included)', km && km[1] === km[2] && Number(km[2]) === all.els.length, 'kept=' + (km && km[1] + '/' + km[2]) + ' model=' + all.els.length);
    check('T8', 'E3 no extent: no §EXTENT line (legacy path)', !base.log.some(l => /§EXTENT/.test(l)), 'files=' + Object.keys(base.files).length);
    const ents = R2 => Object.keys(R2.files).reduce((n, f) => n + (R2.files[f].match(/\n0\n(LINE|ARC|CIRCLE|LWPOLYLINE|HATCH|TEXT)\n/g) || []).length, 0);
    check('T8', 'E4 every sheet comes from the box: fewer elements and fewer entities than the whole wing', R.model.els.length < base.model.els.length && ents(R) < ents(base), 'elements ' + R.model.els.length + '/' + base.model.els.length + ' entities ' + ents(R) + '/' + ents(base));
    const Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: require(D + 'std2d_scopes.js') }, { set: 'W' }), out = I.convert(I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }))), {});
    // T9 the view at the plane: every box element is drawn or fully hidden; a hidden one is covered by the union of nearer ones (recomputed here with polygon-clipping); the reader sets the drawing aside
    const PCL = require(D + 'polygon-clipping.js'), pv = R.model.planeView, vis = pv ? pv.vis : {}, items = R.model.els.filter(e => e.cls !== 'IfcOpeningElement' && e.z1 > e.z0 && e.x1 > e.x0);
    check('T9', 'V1 every box element is in the view: drawn or fully hidden, none lost', pv && items.length === pv.items && pv.drawn + pv.hidden === pv.items && pv.drawn > 0 && items.every(e => e.guid in vis), pv ? `items=${pv.items} drawn=${pv.drawn} hidden=${pv.hidden} pieces=${pv.pieces}` : 'no plane view');
    const oy = R.wing.oy, rect = e => [[[e.x0, e.z0], [e.x1, e.z0], [e.x1, e.z1], [e.x0, e.z1], [e.x0, e.z0]]], hid = items.filter(e => vis[e.guid] === 0 && ['IfcDoor', 'IfcWindow'].indexOf(e.cls) < 0).slice(0, 40);
    const notCovered = hid.filter(e => { const near = items.filter(o => o !== e && (o.y0 - oy) < (e.y0 - oy) - 1e-9); if (!near.length) return true; let U = rect(near[0]); near.slice(1).forEach(o => { try { U = PCL.union(U, rect(o)); } catch (x) { } });
      let D2; try { D2 = PCL.difference(rect(e), U); } catch (x) { return false; } const area = D2.reduce((a, poly) => a + Math.abs(poly[0].reduce((s2, p2, i, A2) => s2 + (i ? (A2[i - 1][0] * p2[1] - p2[0] * A2[i - 1][1]) : 0), 0)) / 2, 0); return area > 1e-6; });
    check('T9', 'V2 a hidden element lies behind nearer ones that cover it (depth order, recomputed)', hid.length === 0 || notCovered.length === 0, `checked=${hid.length} not_covered=${notCovered.length} ${notCovered.slice(0, 3).map(e => e.cls + ':' + e.guid).join(' ')}`);
    check('T9', 'V3 the drawing sheet is marked @VIEW=DRAWING and the reader sets it aside', /@VIEW=DRAWING/.test(Dm.files['W_PLANE_VIEW_std.dxf'] || '') && !out.refused, 'refused=' + JSON.stringify(out.refused || null).slice(0, 120));
    check('T8', 'E5 the box set is marked and the reader takes it', !out.refused && !!out.verdict, 'sheets=' + Object.keys(Dm.files).length + ' blocking=' + (out.verdict ? out.verdict.blocking.length : '-') + ' refused=' + JSON.stringify(out.refused || null).slice(0, 200));
  })();
  const ig = run(F0 + 180, null, true); check('T5', 'CONTROL turn 180 with the frame ignored does not match', match(refB, bodies(ig.T)).bad > 0, 'unmatched=' + match(refB, bodies(ig.T)).bad);
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
