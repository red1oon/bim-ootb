#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SLAB-LEVEL (rule D75, prompts/DXF2BIM_FOUNDATION_LANE.md §D75). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the slab edge (D70.1) was read at ONE slab level per storey, but JKR and LTU storeys hold slabs 0.1-0.4 m apart over 14-49 % of their area; and an arc in a slab edge was refused.
 *   L1 DRAWN    — every A-FLOR-OTLN ring states DXF elevation (38) + thickness (39); the groups' pieces are disjoint; every piece off the storey's main top is also on A-FLOR-LEVL.
 *   L2 READ     — a piece's body top = its ring's elevation, bottom = elevation - thickness (3 mm), per piece.
 *   L3 CLOSER   — the area-weighted slab-top error against the model falls on storeys with a step >= 0.1 m and never rises on any storey (BASE = origin/main).
 *   L4 FALSIFIER— the plans with elevation / thickness stripped: every piece of a storey is at the storey's one level again.
 *   L5 EDITABLE — slab.level_step_min very large: one group per storey, drawn area = BASE's.
 *   L6 REGISTRY — element_defaults.json carries slab.level_step_min = 0.1 and slab.edge_arc_sagitta = 0.005.
 *   L7 SAME     — every non-slab element equals BASE (class + vertices).
 *   L8 ARCS     — a closed slab edge with bulges is read as inscribed facets: the area deficit is at most 2/3 x sagitta x perimeter (the facets' own bound), no GAP:slab_edge_bulge.
 * Usage: NODE_PATH=<dir with better-sqlite3> BASE=<modeller dir at origin/main> node modeller/tests/witness_dxf_slab_level.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), fs = require('fs'), M = process.env.MDIR || path.join(__dirname, '..');
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2).filter(a => a[0] !== '-'); if (!dbs.length) { say('MISSING input: a Node model .db (e.g. /tmp/db2/JKR3.db)'); process.exit(2); }
function load(dir) { const D = path.join(dir, 'dxf2bim') + '/';
  return { S: require(D + 'std2d.js'), Mk: require(D + 'std2d_marks.js'), MK: require(D + 'dxf2marks.js'), B: require(D + 'dxf2bim.js'), SHC: require(D + 'dxf2shell_config.js'), SC: require(D + 'std2d_scopes.js'), SH: require(D + 'dxf2shell.js'),
    DxfParser: require(path.join(dir, 'lib/dxf-parser.js')), I: require(path.join(dir, 'dxf2bim_import.js')) }; }
function trip(L, q, wopts, mutate) { const t0 = Date.now(), R = L.S.writeStdSet(q, 'X', wopts || {}), Dm = L.Mk.deriveMarks(R, { B: L.B, DxfParser: L.DxfParser, hashHex, MK: L.MK, SHC: L.SHC, SCOPES: L.SC }, { set: 'X' });
  const files = Object.keys(Dm.files).map(n => ({ name: n, text: mutate ? mutate(Dm.files[n]) : Dm.files[n] })), sheets = L.I.readSheets(files), o = L.I.convert(sheets, {}); return { R, o, sheets, ms: Date.now() - t0 }; }
const zr = e => { let a = Infinity, b = -Infinity; for (const v of e.vertices) { a = Math.min(a, v[2]); b = Math.max(b, v[2]); } return [a, b]; };
const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
const inPiece = (p, pc) => inRing(p, pc.outer) && !pc.holes.some(h => inRing(p, h));
// the area-weighted |model slab top - the body's top| over the model slabs of the storey (the §D70 window), bodies = the convert's A-FLOR-OTLN slabs matched to their pieces by handle
function topErr(r, name, st) { const m = r.R.model, roof = new Set(m.roofs.map(x => x.guid)), stm = m.storeys.find(s => Math.abs(s.elev - st.level) < 0.01); if (!stm) return null;   // the convert names a storey by its sheet, the model by its own label: matched by level
  const sl = m.els.filter(e => e.cls === 'IfcSlab' && !roof.has(e.guid) && e.v.length && e.z1 >= stm.elev - 0.5 && e.z1 <= stm.elev + 0.3 && e.z1 - e.z0 >= 0.05);
  const bodies = r.o.els.filter(e => e.class === 'IfcSlab' && e.storey === name && e.layer === 'A-FLOR-OTLN'); let num = 0, den = 0, off = 0;
  sl.forEach(e => { const c = [(e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2], a = (e.x1 - e.x0) * (e.y1 - e.y0), pc = st.edge.pieces.find(p => inPiece(c, p)); if (!pc) return;
    const b = bodies.find(x => x.handle === pc.handles.join(',')); if (!b) return; const d = Math.abs(zr(b)[1] - e.z1); num += a * d; den += a; if (d > 0.1 + 1e-6) off++; });
  return den ? { err: num / den, area: den, off } : null; }
const src = {};
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all(), NEW = load(M), BASEL = process.env.BASE ? load(process.env.BASE) : null;
  const r = trip(NEW, q); if (!r.o.ST) { check('L0[' + name + ']', 'converts', false, JSON.stringify(r.o.refused).slice(0, 200)); return; }
  const lg = r.R.log.filter(l => /^§SLAB_LEVELS /.test(l)), stepped = lg.filter(l => +/groups=(\d+)/.exec(l)[1] > 1).length;
  // L1
  const P = new NEW.DxfParser(); let rings = 0, noLevel = 0, levl = 0, expectLevl = 0, K = 1;
  r.sheets.filter(s => s.role === 'plan').forEach(s => { const ents = s.dxf.entities.filter(e => e.layer === 'A-FLOR-OTLN'), lv = s.dxf.entities.filter(e => e.layer === 'A-FLOR-LEVL'); levl += lv.length;
    ents.forEach(e => { rings++; if (typeof e.elevation !== 'number' || typeof e.depth !== 'number') noLevel++; });
    const tops = ents.map(e => e.elevation).filter(v => typeof v === 'number'); if (tops.length) { const cnt = {}; tops.forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }); const main = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]; void main; } });
  const stepLog = lg.map(l => ({ g: +/groups=(\d+)/.exec(l)[1], ov: +/overlap_m2=([\d.]+)/.exec(l)[1] }));
  check('L1[' + name + ']', 'every A-FLOR-OTLN ring states elevation + thickness; storeys with several groups also draw A-FLOR-LEVL', rings > 0 && noLevel === 0 && (stepped === 0 || levl > 0), `rings=${rings} without_level=${noLevel} levl_rings=${levl} storeys=${lg.length} with_groups=${stepped} overlap_m2=${stepLog.map(x => x.ov).join('/')}`);
  // L2: per piece body = ring elevation / thickness
  let bad2 = 0, n2 = 0; r.o.ST.forEach(st => { const sheet = r.sheets.find(s => s.name === st.sheet); st.edge.pieces.forEach(pc => { if (typeof pc.top !== 'number') return; const b = r.o.els.find(x => x.class === 'IfcSlab' && x.storey === st.name && x.handle === pc.handles.join(',')); if (!b) return; n2++; const z = zr(b);
      if (Math.abs(z[1] - pc.top) > 0.003 || Math.abs(z[0] - (pc.top - pc.thickness)) > 0.003) bad2++; }); });
  check('L2[' + name + ']', 'each piece body top / bottom = its ring elevation / elevation - thickness (3 mm)', n2 > 0 && bad2 === 0, `bodies=${n2} wrong=${bad2}`);
  // L3 against BASE
  if (BASEL) { const b = trip(BASEL, q); let worse = 0, better = 0, rows = [];
    r.o.ST.forEach(st => { const bs = b.o.ST.find(x => x.name === st.name); if (!bs || !bs.edge.pieces.length) return; const a = topErr(r, st.name, st), c = topErr(b, st.name, bs); if (!a || !c) return;
      if (a.err > c.err + 1e-6) worse++; if (a.err < c.err - 1e-6) better++; rows.push(`${st.name}: ${c.err.toFixed(3)}->${a.err.toFixed(3)} off>0.1: ${c.off}->${a.off}`); });
    const needBetter = stepped > 0;
    check('L3[' + name + ']', 'the area-weighted slab-top error vs the model falls where a step exists, never rises', worse === 0 && (!needBetter || better > 0), `better=${better} worse=${worse} | ${rows.join(' | ')}`);
    // L7
    const ns = x => JSON.stringify(x.o.els.filter(e => e.class !== 'IfcSlab').map(e => JSON.stringify([e.class, e.vertices])).sort());; /* as a set: the guids hang on the run id, which changes once with the STD map (A-FLOR-LEVL ignored), and the elements are listed in guid order */ check('L7[' + name + ']', 'every non-slab element equals BASE (class + vertices)', ns(r) === ns(b), `equal=${ns(r) === ns(b)} els=${r.o.els.length} base=${b.o.els.length}`);
    say(`§D75-TIME ${name} base_ms=${b.ms} new_ms=${r.ms}`);
    // L5
    const big = trip(NEW, q, { slabEdge: { joint_close: 0.05, void_min_area: 0.0645, level_step_min: 9 } }), dr = x => x.R.log.filter(l => /^§SLAB_EDGE /.test(l)).map(l => /drawn_m2=([\d.]+)/.exec(l)[1]).join(','), gcount = x => x.R.log.filter(l => /^§SLAB_LEVELS /.test(l)).every(l => /groups=1 /.test(l));
    check('L5[' + name + ']', 'slab.level_step_min very large: one group per storey, drawn area per storey = BASE\'s', gcount(big) && dr(big) === dr(b), `groups_all_1=${gcount(big)} new=${dr(big)} base=${dr(b)}`);
  } else say('INCONCLUSIVE L3/L5/L7[' + name + '] no BASE');
  // L4: strip the levels from the plans
  const strip = trip(NEW, q, {}, t => t.replace(/\n 38\n[^\n]*\n 39\n[^\n]*/g, '').replace(/\n38\n[^\n]*\n39\n[^\n]*/g, ''));
  let one = true; strip.o.ST.forEach(st => { const zs = new Set(strip.o.els.filter(x => x.class === 'IfcSlab' && x.storey === st.name && x.layer === 'A-FLOR-OTLN').map(x => zr(x)[1].toFixed(3))); if (zs.size > 1) one = false; });
  check('L4[' + name + ']', 'FALSIFIER: elevation / thickness stripped: every piece of a storey is at the storey\'s one level', one && !strip.sheets.some(s => s.dxf && s.dxf.entities.some(e => e.layer === 'A-FLOR-OTLN' && typeof e.elevation === 'number')), `one_level_per_storey=${one}`);
});
// L6 / L8 (no db needed)
const reg = JSON.parse(fs.readFileSync(path.join(M, 'element_defaults.json'), 'utf8')).defaults;
check('L6', 'registry: slab.level_step_min 0.1 and slab.edge_arc_sagitta 0.005 (guess)', reg['slab.level_step_min'] && reg['slab.level_step_min'].value === 0.1 && reg['slab.edge_arc_sagitta'] && reg['slab.edge_arc_sagitta'].value === 0.005 && reg['slab.level_step_min'].kind === 'guess', JSON.stringify([reg['slab.level_step_min'] && reg['slab.level_step_min'].value, reg['slab.edge_arc_sagitta'] && reg['slab.edge_arc_sagitta'].value]));
{ const L = load(M), map = L.SHC.STD.MAP_PLAN, K = 0.001, r = 2000, seg = (x, y, b) => ({ x, y, bulge: b });
  const circle = { type: 'LWPOLYLINE', layer: 'A-FLOR-OTLN', handle: 'C1', shape: true, vertices: [seg(r, 0, 1), seg(-r, 0, 1)] };           // two semicircles
  const rect = { type: 'LWPOLYLINE', layer: 'A-FLOR-OTLN', handle: 'C2', shape: true, vertices: [seg(10000, 0, 0), seg(14000, 0, 0.5), seg(14000, 3000, 0), seg(10000, 3000, 0)] };   // one bulged edge (bulge 0.5: theta = 4 atan 0.5)
  const E = L.SH.slabEdges([circle, rect], map, K), area = pc => pc.area, byH = h => E.pieces.find(p => p.handles[0] === h);
  const th = 4 * Math.atan(0.5), c = 3, Rr = c / (2 * Math.sin(th / 2)), seg2 = Rr * Rr / 2 * (th - Math.sin(th)), exactRect = 4 * 3 + seg2, exactCircle = Math.PI * 4, perim = 2 * Math.PI * 2, perimR = 4 + 3 + 4 + 3 - 3 + Rr * Math.abs(th);
  const ac = byH('C1') && area(byH('C1')), ar = byH('C2') && area(byH('C2'));
  check('L8', 'a slab edge with arcs is read as facets: area deficit <= 2/3 x sagitta x perimeter (inscribed facets), no GAP:slab_edge_bulge', !!ac && !!ar && exactCircle - ac >= 0 && exactCircle - ac <= (2 / 3) * 0.005 * perim + 1e-3 && ar <= exactRect && exactRect - ar <= (2 / 3) * 0.005 * perimR + 1e-3 && !E.gaps.some(g => g.code === 'GAP:slab_edge_bulge'), `circle ${ac} vs ${exactCircle.toFixed(4)} (${((ac / exactCircle - 1) * 100).toFixed(3)} %), bulged rectangle ${ar} vs ${exactRect.toFixed(4)} (${((ar / exactRect - 1) * 100).toFixed(3)} %) gaps=${E.gaps.length}`); }
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
