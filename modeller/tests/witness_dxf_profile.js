#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-PROFILE-MESH (rule D67.1, prompts/DXF2BIM_FOUNDATION_LANE.md §D67.1). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a drawn steel angle (`1.5"x1.5"x1/4" Angle`) became a b x b BOX (a 3.3x volume error) and a fan a 24-sided disc, though the drawing states the profile / the rings. The L section and the fan are
 * built from what the drawing states; everything it does not state stays the drawn prism and is listed.
 *   P1 ANGLE   — each single equal-leg angle bar is an L: 12 vertices, watertight, volume = t(2b-t) x length (1 %), the b x b envelope and the placement of the drawn prism (3 mm), same guid / handle / class / storey / z-range.
 *   P2 LISTED  — every other bar keeps its drawn prism (vertices equal), and is listed GAP:profile_not_bound with its reason (pair, family not stated, default width).
 *   P3 FAN     — each fan: housing radius = the drawn outer ring, hub radius = the drawn inner ring (1 mm), every solid watertight, the blade / wall defaults listed once (GAP:fan_detail_defaulted).
 *   P4 OFF     — DXF_PROFILES=0 gives the drawn prisms back (every body's vertices equal the other run's, and BASE's when BASE is given).
 *   P5 SAME    — every body other than the angles and fans is identical with and without.
 *   P6 IFC     — the IFC carries the L (a 12-point list per angle) and the fan meshes.
 *   P7 VOLUME  — the angles' total volume falls from the boxes' to the sections' (stated).
 * Input: the CLI-marked shed set (SHED_MARKED_DIR; default ~/Videos/dxf2bim_film_work/why/cli/marked; absent -> INCONCLUSIVE). Node only.
 * Usage: NODE_PATH=<dir with web-ifc, better-sqlite3, sql.js> [BASE=<modeller dir>] node modeller/tests/witness_dxf_profile.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), M = process.env.MDIR || path.join(__dirname, '..');
const MARKED = process.env.SHED_MARKED_DIR || path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
(async () => {
  if (!fs.existsSync(MARKED)) { say('INCONCLUSIVE | the marked shed set is absent: ' + MARKED); say('SUMMARY fail=0'); process.exit(0); }
  const CLI = require(path.join(M, 'dxf2bim_cli.js')), PF = require(path.join(M, 'dxf2profile.js')), S = require(path.join(M, 'dxf2prep.js')).Solid, DxfParser = require(path.join(M, 'lib/dxf-parser.js'));
  const files = fs.readdirSync(MARKED).filter(f => /\.dxf$/.test(f)).map(f => path.join(MARKED, f));
  const run = (loader, off) => { if (off) process.env.DXF_PROFILES = '0'; else delete process.env.DXF_PROFILES; try { return loader.run({ sheets: files, layer: [], datum: [], haxis: [], bodyz: [], choice: [], accept: false, set: null, level: null, ifc: false, complete: true }, () => {}); } finally { delete process.env.DXF_PROFILES; } };
  const ON = run(CLI, false), OFF = run(CLI, true), eOn = ON.out.gate.R.els, eOff = OFF.out.gate.R.els, byG = {}; eOff.forEach(e => { byG[e.guid] = e; });
  const J = x => JSON.stringify([x.vertices, x.faces]), bbox = e => { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; e.vertices.forEach(v => { for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], v[a]); b[a + 3] = Math.max(b[a + 3], v[a]); } }); return b; };
  const isAngle = e => e.kind === 'bar' && PF.angleOf(e.ifc.type_name).ok, ang = eOn.filter(isAngle);
  // P1
  let bad = [], nL = 0;
  ang.forEach(e => { const o = byG[e.guid], a = PF.angleOf(e.ifc.type_name), bb = bbox(e), bo = bbox(o), len = Math.abs(S.vol(o)) / (a.b * a.b), vl = Math.abs(S.vol(e)), want = PF.areaL(a.b, a.t) * len;
    const ok = e.vertices.length === 12 && PF.watertight(e) && Math.abs(vl / want - 1) <= 0.01 && bb.every((v, i) => Math.abs(v - bo[i]) <= 0.003) && e.handle === o.handle && e.class === o.class && e.storey === o.storey && e.z0 === o.z0 && e.z1 === o.z1 && e.size && e.size.profile && e.size.profile.family === 'L';
    if (ok) nL++; else if (bad.length < 4) bad.push(`${e.guid}: v=${e.vertices.length} wt=${PF.watertight(e)} vol=${(vl / want).toFixed(4)}`); });
  check('P1', 'each single equal-leg angle bar is an L (12 vertices, watertight, t(2b-t) x length to 1 %, the drawn envelope and placement)', ang.length > 0 && nL === ang.length, `angle_bars=${ang.length} as_L=${nL} ${bad.join('; ')}`);
  // P2
  const others = eOn.filter(e => e.kind === 'bar' && !isAngle(e)), moved = others.filter(e => J(e) !== J(byG[e.guid])), gp = ON.out.gate.R.gaps.filter(g => g.code === 'GAP:profile_not_bound' && g.kind === 'bar');
  const reasons = {}; gp.forEach(g => { const r = /pair|family is not stated|default width|stated by the user|unequal|overridden/.exec(g.detail || '')[0]; reasons[r] = (reasons[r] || 0) + 1; });
  check('P2', 'every other bar keeps its drawn prism and is listed with its reason', others.length > 0 && moved.length === 0 && gp.length > 0 && Object.keys(reasons).length >= 3, `other_bars=${others.length} changed=${moved.length} listed_bar_lines=${gp.length} reasons=${JSON.stringify(reasons)}`);
  // P3
  const fans = eOn.filter(e => e.kind === 'fan'), parseFile = f => new DxfParser().parseSync(fs.readFileSync(f, 'utf8')).entities.filter(x => x.type === 'CIRCLE');
  const circles = []; files.filter(f => /ELEV/.test(f)).forEach(f => parseFile(f).forEach(c => circles.push(c)));
  const comps = e => { const par = e.vertices.map((_, i) => i), find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }; e.faces.forEach(f => { par[find(f[0])] = find(f[1]); par[find(f[1])] = find(f[2]); }); const g = {}; e.faces.forEach(f => { (g[find(f[0])] = g[find(f[0])] || []).push(f); }); return Object.values(g).map(fs2 => { const used = [...new Set([].concat(...fs2))], idx = {}; used.forEach((u, i) => { idx[u] = i; }); return { vertices: used.map(u => e.vertices[u]), faces: fs2.map(f => f.map(u => idx[u])) }; }); };
  let fbad = [], fok = 0;
  fans.forEach(e => { const p = e.size && e.size.profile; if (!p) { fbad.push(e.guid + ' no profile'); return; } const parts = comps(e), wt = parts.every(PF.watertight), R = e.size.d.number / 2;
    const cs = circles.filter(c => c.handle === e.handle), c0 = cs[0], conc = c0 ? circles.filter(c => Math.hypot(c.center.x - c0.center.x, c.center.y - c0.center.y) < 1e-3 * Math.max(1, c0.radius)) : [], outer = conc.length ? Math.max(...conc.map(c => c.radius)) : null, inner = conc.length ? Math.min(...conc.map(c => c.radius)) : null, k = outer ? R / outer : null;
    const ok = wt && Math.abs(p.housing_r - R) <= 0.001 && k && Math.abs(p.hub_r - inner * k) <= 0.001 && parts.length === 2 + p.blades; if (ok) fok++; else fbad.push(`${e.guid}: wt=${wt} housing=${p.housing_r}/${R} hub=${p.hub_r}/${inner && k ? (inner * k).toFixed(4) : '?'} solids=${parts.length}`); });
  const gd = ON.out.gate.R.gaps.filter(g => g.code === 'GAP:fan_detail_defaulted');
  check('P3', 'each fan: housing radius = the drawn outer ring, hub radius = the drawn inner ring (1 mm), every solid watertight; the defaults listed once', fans.length > 0 && fok === fans.length && gd.length === 1, `fans=${fans.length} ok=${fok} detail_gaps=${gd.length} ${fbad.slice(0, 3).join('; ')}`);
  // P4 / P5
  const rest = eOn.filter(e => !isAngle(e) && e.kind !== 'fan'), restMoved = rest.filter(e => J(e) !== J(byG[e.guid]));
  let baseEq = 'no BASE'; if (process.env.BASE) { const B = run(require(path.join(path.resolve(process.env.BASE), 'dxf2bim_cli.js')), false), bm = {}; B.out.gate.R.els.forEach(e => { bm[e.guid] = e; }); baseEq = eOff.every(e => bm[e.guid] && J(bm[e.guid]) === J(e)) && B.out.gate.R.els.length === eOff.length; }
  check('P4', 'DXF_PROFILES=0 gives the drawn prisms back: every body equal to BASE\'s' + (process.env.BASE ? '' : ' (INCONCLUSIVE without BASE: compared with the other run only)'), eOn.length === eOff.length && (baseEq === true || baseEq === 'no BASE'), `bodies on/off=${eOn.length}/${eOff.length} equal_to_BASE=${baseEq}`);
  check('P5', 'every body other than the angles and fans is identical with and without the profiles', rest.length > 0 && restMoved.length === 0, `other_bodies=${rest.length} changed=${restMoved.length}`);
  // P6
  const pts = txt => { const c = {}; (txt.match(/IFCCARTESIANPOINTLIST3D\(\((.*?)\)\)\);/g) || []).forEach(l => { const n = l.split('),(').length; c[n] = (c[n] || 0) + 1; }); return c; };
  const d1 = fs.mkdtempSync(path.join(os.tmpdir(), 'prof1-')), d0 = fs.mkdtempSync(path.join(os.tmpdir(), 'prof0-'));
  await CLI.writeIfc(ON, d1); process.env.DXF_PROFILES = '0'; await CLI.writeIfc(OFF, d0); delete process.env.DXF_PROFILES;
  const c1 = pts(fs.readFileSync(path.join(d1, 'model.ifc'), 'latin1')), c0 = pts(fs.readFileSync(path.join(d0, 'model.ifc'), 'latin1'));
  check('P6', 'the IFC carries the L (12-point lists +' + ang.length + ') and the fan meshes (178-point lists)', (c1[12] || 0) - (c0[12] || 0) === ang.length && (c1[178] || 0) === fans.length && !(c0[178]), `12-point lists ${c0[12] || 0}->${c1[12] || 0}; 178-point ${c0[178] || 0}->${c1[178] || 0}; ifc bytes ${fs.statSync(path.join(d0, 'model.ifc')).size}->${fs.statSync(path.join(d1, 'model.ifc')).size}`);
  // P7
  const vOn = ang.reduce((n, e) => n + Math.abs(S.vol(e)), 0), vOff = ang.reduce((n, e) => n + Math.abs(S.vol(byG[e.guid])), 0);
  check('P7', 'the angles\' total volume falls from the boxes\' to the sections\' (' + (100 * (vOn / vOff - 1)).toFixed(1) + ' %): t(2b-t)/b2 of a box', ang.length > 0 && Math.abs(vOn / vOff - PF.areaL(0.0381, 0.00635) / (0.0381 * 0.0381)) < 0.002, `boxes=${(vOff * 1e6).toFixed(0)} cm3 sections=${(vOn * 1e6).toFixed(0)} cm3`);
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
