#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-STRUCT: prompts/DXF2BIM_MODELLER_LANE.md §L7.12. Read the log after every run; exit code is not evidence.
 * Issue proved: a CAD set whose columns/beams the wall/slab/roof pipeline cannot express must be importable through the product UI: the user types the layer
 * (Layers section offers the body kinds), the set is judged as a STRUCTURE set, Convert builds ONLY what the drawing states, and what it cannot state is left out loudly.
 *   S1 Layers select offers `column` (and `grade beam`) on plan and elevation   S2 choose Column on both -> structure verdict qualifies, 0 blocking, 3 bodies, Convert enabled
 *   S3 real Convert click -> 3 IfcColumn GEOM_INSERT with provenance.ifc COLUMN, z range as drawn   S4 CONTROL a 4th plan column with no elevation counterpart -> 1 advisory, still 3 built
 *   S5 CONTROL layer left untyped -> the standard gate (no structure verdict)   S6 CONTROL a wall layer typed next to a body kind -> refused "mixed sets"
 *   S7 round trip: the effective (marked) sheets re-opened state the layers themselves -> the same 3 bodies with no UI choice
 * Input is written here (tiny synthetic DXF); no local material needed.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const { runE2E } = require('./e2e_harness');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'struct-'));
const g = (c, v) => c + '\n' + v + '\n';
const poly = (layer, x0, y0, x1, y1, h) => g(0, 'LWPOLYLINE') + g(5, h) + g(8, layer) + g(90, 4) + g(70, 1) + g(10, x0) + g(20, y0) + g(10, x1) + g(20, y0) + g(10, x1) + g(20, y1) + g(10, x0) + g(20, y1);
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const lbox = (layer, x0, y0, x1, y1) => line(layer, x0, y0, x1, y0) + line(layer, x1, y0, x1, y1) + line(layer, x1, y1, x0, y1) + line(layer, x0, y1, x0, y0);
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 4000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 2150]];
const ELEV = [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=E'], ['@GRIDH=A', 1000, 0], ['@GRIDH=B', 4000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000]];
const cols = [[850, 1150], [3850, 4150], [6850, 7150]];
const planDxf = (list, wall) => doc(list.map(([a, b], i) => poly('Col', a, 0, b, 300, 'C' + i)).join('') + (wall ? line('Wl', 0, 1000, 5000, 1000) : ''), PLAN);
const elevDxf = doc(cols.map(([a, b]) => lbox('Col', a, 0, b, 3000)).join(''), ELEV);
const f = (n, t) => { const p = path.join(dir, n); fs.writeFileSync(p, t); return p; };
runE2E('W-DXF-STRUCT', async (t) => {
  const pg = t.pg;
  const open = async (files) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true, timeout: 20000 });
    const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 20000 }), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 120000 }); await t.sleep(600); };
  const idle = async () => { await pg.waitForFunction('!window.DxfMetaEditor.state.busy', { timeout: 120000 }); await t.sleep(500); };
  const layersOpen = async () => { await pg.evaluate(() => { const s = window.DxfMetaEditor.state; if (!s.sec.layers) document.querySelector('#dm-panel .dm-sh[data-sec="layers"]').click(); }); await t.sleep(300); };
  const opts = (role, layer) => pg.evaluate((r, l) => { const s = document.querySelector('#dm-panel [data-layer-row="' + r + '|' + l + '"] select'); return s ? [...s.options].map(o => o.text) : null; }, role, layer);
  const choose = async (role, layer, v) => { await pg.select('#dm-panel [data-layer-row="' + role + '|' + layer + '"] select', v); await idle(); };
  const gate = () => pg.evaluate(() => { const g = window.DxfImportUI.state.gate, v = g.verdict; return { ok: g.ok, structure: g.structure || null, verdict: v && v.verdict, blocking: v ? v.blocking.length : -1, advisory: v ? v.advisory.map(a => a.code) : [], refused: g.refused.map(r => r.reason), conv: !document.getElementById('dxf-convert').disabled, status: (document.getElementById('dxf-status') || {}).textContent }; });

  const P = f('plan.dxf', planDxf(cols)), E = f('south.dxf', elevDxf);
  await open([P, E]); await layersOpen();
  const o1 = await opts('plan', 'Col'), o2 = await opts('elev', 'Col');
  t.assert('S1 the Layers select offers the body kinds on plan and elevation (and "grade beam")', !!o1 && !!o2 && ['column', 'beam', 'footing', 'grade beam', 'member', 'plate'].every(k => o1.includes(k) && o2.includes(k)), JSON.stringify(o1));
  let s5 = await gate();
  t.assert('S5 CONTROL layer untyped -> the standard gate decides (no structure verdict)', s5.structure === null && s5.ok === false, JSON.stringify(s5).slice(0, 200));
  await choose('plan', 'Col', 'column'); await choose('elev', 'Col', 'column');
  let s2 = await gate(); console.log('state S2', JSON.stringify(s2));
  t.assert('S2 Column typed on both sheets -> STRUCTURE set qualifies: 3 bodies, 0 blocking, 0 advisory, Convert enabled', s2.ok && s2.structure && s2.structure.bodies === 3 && s2.blocking === 0 && s2.advisory.length === 0 && s2.conv && /Structure set: 3 bodies/.test(s2.status || ''), JSON.stringify(s2).slice(0, 300));
  const before = await t.oplog();
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 60000 }); await t.sleep(800);
  const after = await t.oplog(), lastOp = await t.lastOp();
  const conv = await pg.evaluate(() => { const L = window.DxfImportUI.state.last; return { counts: L.counts, n: L.nInserts, cuts: L.nCuts }; });
  const P1 = lastOp && (lastOp.parameters || lastOp.params) || {}, bb = P1.bbox || [];
  t.assert('S3 real Convert: 3 IfcColumn inserts on Level 1, no cuts, provenance.ifc = IfcColumn/COLUMN, drawn z height 3 m', conv.n === 3 && conv.cuts === 0 && conv.counts['Level 1/IfcColumn'] === 3 && after.len - before.len === 3 && P1.provenance && P1.provenance.ifc && P1.provenance.ifc.PredefinedType === 'COLUMN' && bb.length === 6 && Math.abs((bb[5] - bb[4]) - 3) < 1e-6, JSON.stringify({ conv, d: after.len - before.len, ifc: P1.provenance && P1.provenance.ifc, bb }));
  // S10 (§L8) PARITY: the page's IFC and the headless writer's IFC (dxf2ifc.js over the same effective sheets) are the same model: same products (class, Name, ObjectType, PredefinedType), same storey, same vertices (float32 vs float64 tolerance)
  const brow = await pg.evaluate(async () => { const r = await window.Bonsai.ifc.build(); return { text: new TextDecoder().decode(r.bytes), eff: window.DxfMetaEditor.state.sheets.map(sh => ({ name: sh.name, text: window.DxfMetaEditor.effText(sh) })) }; });
  const CLIm = require('../dxf2bim_cli.js'), dd = fs.mkdtempSync(path.join(os.tmpdir(), 'par-')), paths = brow.eff.map(x => { const q = path.join(dd, x.name); fs.writeFileSync(q, x.text); return q; });
  const cres = CLIm.run({ sheets: paths, layer: [], datum: [], haxis: [], bodyz: [], choice: [], accept: false, set: null, level: null, ifc: false }, () => {});
  const node = await CLIm.writeIfc(cres, dd), nodeText = fs.readFileSync(path.join(dd, 'model.ifc'), 'utf8');
  const prods = tx => (tx.match(/#\d+=IFC(COLUMN|BEAM|FOOTING|MEMBER|PLATE|WALL|ROOF)\('[^']*',\$,'[^']*',\$,[^,]*,\$,#\d+,\$,[^)]*\)/g) || []).map(l => l.replace(/#\d+=/, '').replace(/\('[^']*'/, "('G'").replace(/#\d+/g, '#')).sort();
  const pts = tx => { const out = []; (tx.match(/IFCCARTESIANPOINTLIST3D\(\(([^;]*)\)\)\);/g) || []).forEach(l => { const nums = (l.match(/-?\d+\.?\d*(?:E[-+]?\d+)?/gi) || []).map(Number); out.push(nums); }); return out; };
  const bp = prods(brow.text), np = prods(nodeText);
  const bv = pts(brow.text).map(a => a.slice(0).sort((x, y) => x - y)), nv = pts(nodeText).map(a => a.slice(0).sort((x, y) => x - y));
  const norm = L => L.map(a => a.map(v => (Math.round(v * 1000) / 1000 + 0).toFixed(3)).join(',')).sort();
  const storeyOf = tx => (tx.match(/IFCBUILDINGSTOREY\('[^']*',\$,'([^']*)'/) || [])[1];
  t.assert('S10 PARITY page IFC == headless IFC: 3 IfcColumn products with the same Name/ObjectType/PredefinedType, the same storey, and the same vertices (3 mm)', bp.length === 3 && JSON.stringify(bp) === JSON.stringify(np) && storeyOf(brow.text) === storeyOf(nodeText) && JSON.stringify(norm(bv)) === JSON.stringify(norm(nv)), JSON.stringify({ prodEq: JSON.stringify(bp) === JSON.stringify(np), bs: storeyOf(brow.text), ns: storeyOf(nodeText), nb: bv.length, nn: nv.length, b0: norm(bv).slice(0, 1), n0: norm(nv).slice(0, 1) }));

  // S7 round trip: the effective sheets (the markings the user's choices wrote) re-opened
  const eff = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(sh => ({ name: sh.name, text: window.DxfMetaEditor.effText(sh) })));
  const RP = eff.map(x => f('rt_' + x.name, x.text));
  await open(RP); let s7 = await gate();
  t.assert('S7 round trip: the saved (marked) sheets state the layers themselves -> the same structure set, 3 bodies, no UI choice', s7.ok && s7.structure && s7.structure.bodies === 3, JSON.stringify(s7).slice(0, 240));
  // S4 gap control
  await open([f('plan4.dxf', planDxf(cols.concat([[9850, 10150]]))), E]); await layersOpen();
  await choose('plan', 'Col', 'column'); await choose('elev', 'Col', 'column');
  let s4 = await gate();
  t.assert('S4 CONTROL a 4th plan column without an elevation counterpart: still qualifies, 1 advisory GAP:body_no_elevation, 3 bodies (the 4th is left out, never given a height)', s4.ok && s4.structure.bodies === 3 && s4.structure.left_out === 1 && s4.advisory.join() === 'GAP:body_no_elevation' && /1 left out/.test(s4.status || ''), JSON.stringify(s4).slice(0, 300));
  // S6 mixed
  await open([f('planw.dxf', planDxf(cols, true)), E]); await layersOpen();
  await choose('plan', 'Col', 'column'); await choose('elev', 'Col', 'column'); await choose('plan', 'Wl', 'wall');
  let s6 = await gate();
  t.assert('S6 CONTROL a wall layer typed next to a body kind: refused as a mixed set (stated), Convert disabled', !s6.ok && s6.refused.some(r => /mixed sets are not supported/.test(r)) && s6.conv === false, JSON.stringify(s6).slice(0, 300));
  // S8 type names from the drawing's own label (§L7.13): one label naming the kind -> a yellow default, carried to the insert; the user's empty choice removes it
  const txtL = (layer, x, y, tx) => g(0, 'TEXT') + g(8, layer) + g(10, x) + g(20, y) + g(30, 0) + g(40, 40) + g(1, tx);
  const EL = f('southL.dxf', doc(cols.map(([a, b]) => lbox('Col', a, 0, b, 3000)).join('') + txtL('Tex', 100, -300, '12"x12" R.C.C Column'), ELEV));
  await open([f('planL.dxf', planDxf(cols)), EL]); await layersOpen();
  await choose('plan', 'Col', 'column'); await choose('elev', 'Col', 'column');
  const d8 = await pg.evaluate(() => { const r = document.querySelector('#dm-panel [data-default="column.type_name"]'); return { row: !!r, bg: r ? getComputedStyle(r).backgroundColor : null, inAll: !!document.querySelector('#dm-yellows [data-act="defkeep"][data-key="column.type_name"]'), name: window.DxfImportUI.state.gate.R.els[0].ifc.type_name }; });
  t.assert('S8 the one label naming the kind is applied as a yellow default (Defaults applied + All defaults) and is the bodies\' type name', d8.row && /245,\s*217,\s*10/.test(d8.bg) && d8.inAll && d8.name === '12"x12" R.C.C Column', JSON.stringify(d8));
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 60000 }); await t.sleep(800);
  const l8 = await t.lastOp(), P8 = l8 && (l8.parameters || l8.params) || {};
  t.assert('S8b Convert: the insert carries provenance.ifc.type_name (it becomes the IFC Name/ObjectType, the Viewer/ERP line name)', P8.provenance && P8.provenance.ifc && P8.provenance.ifc.type_name === '12"x12" R.C.C Column', JSON.stringify(P8.provenance && P8.provenance.ifc));
  await pg.select('#dm-panel [data-default="column.type_name"] select', ''); await idle();
  const e8 = await pg.evaluate(() => ({ name: window.DxfImportUI.state.gate.R.els[0].ifc.type_name, kind: window.DxfImportUI.state.defaults.find(r => r.key === 'column.type_name').kind }));
  t.assert('S8c CONTROL choosing the empty option: no type name, the row is the user\'s', e8.name === null && e8.kind === 'chosen', JSON.stringify(e8));
  // S9 (§L7.14) a second plan (the foundation plan, its own origin) + a z range the user states
  const PLANF = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=F'], ['@GRIDX=A', 6000, 0], ['@GRIDX=B', 9000, 0], ['@GRIDY=1', 0, 850], ['@GRIDY=2', 0, 2850]];
  const foundPlan = f('z_found.dxf', doc([[800, 1200], [3800, 4200]].map(([a, b], i) => poly('Fo', a + 5000, 700, b + 5000, 1000, 'F' + i)).join(''), PLANF));
  await open([P, E, foundPlan]); await layersOpen();
  await choose('plan', 'Col', 'column'); await choose('elev', 'Col', 'column'); await choose('plan', 'Fo', 'footing');
  let a9 = await pg.evaluate(() => { const g = window.DxfImportUI.state.gate; return { ok: g.ok, bodies: g.structure.bodies, left: g.structure.left_out, waiting: (document.querySelector('#dm-panel [data-bodyz="footing"]') || {}).textContent || null, sec: !!document.querySelector('#dm-panel .dm-sh[data-sec="bodyz"]') }; });
  t.assert('S9 a second plan with footings: the "Body heights" section lists them as waiting (2) and they are left out (3 columns built, 2 left out), no height guessed', a9.ok && a9.bodies === 3 && a9.left === 2 && a9.sec && /2 waiting/.test(a9.waiting || ''), JSON.stringify(a9));
  await pg.type('#dm-bz-footing-0', '-1.4'); await pg.type('#dm-bz-footing-1', '-1.1');
  await pg.evaluate(() => document.querySelector('#dm-panel [data-act="bodyzadd"][data-kind="footing"]').click()); await idle();
  let b9 = await pg.evaluate(() => { const g = window.DxfImportUI.state.gate, F = g.R.els.filter(e => e.kind === 'footing'); return { bodies: g.structure.bodies, left: g.structure.left_out, F: F.map(e => [e.z0, e.z1, e.height_source, e.prov, e.storey, Math.round(e.vertices[0][0] * 1000), Math.round(e.vertices[0][1] * 1000)]), row: !!document.querySelector('#dm-panel [data-bodyz-row="footing"]') }; });
  t.assert('S9b typing the range builds them: 5 bodies, 0 left out, the footings are stated (-1.4..-1.1 m, prov derived) on Level 1 and sit in the BASE frame (x 0.8 m / 3.8 m, y 0.0 m), the @BODYZ marking is a user row', b9.bodies === 5 && b9.left === 0 && b9.F.length === 2 && b9.F.every(r => r[0] === -1.4 && r[1] === -1.1 && r[2] === 'stated' && r[3] === 'derived' && r[4] === 'Level 1' && r[6] === 0) && b9.F.map(r => r[5]).sort((p, q) => p - q).join() === '800,3800' && b9.row, JSON.stringify(b9));
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 60000 }); await t.sleep(800);
  const c9 = await pg.evaluate(() => window.DxfImportUI.state.last.counts);
  t.assert('S9c Convert: 3 IfcColumn + 2 IfcFooting, all on Level 1 (two plans of one storey are ONE storey)', c9['Level 1/IfcColumn'] === 3 && c9['Level 1/IfcFooting'] === 2 && Object.keys(c9).length === 2, JSON.stringify(c9));
  await pg.evaluate(() => document.querySelector('#dm-panel [data-act="bodyzdel"]').click()); await idle();
  const d9 = await pg.evaluate(() => { const g = window.DxfImportUI.state.gate; return { left: g.structure.left_out, row: !!document.querySelector('#dm-panel [data-bodyz-row]') }; });
  t.assert('S9d CONTROL removing the statement puts them back to waiting (2 left out), never a remembered height', d9.left === 2 && !d9.row, JSON.stringify(d9));
  // S11 (§L9) beams: a layer name SHARED by two plan sheets (Dim) is typed beam on ONE of them (per-sheet row); the beam sheet has its own origin; the elevation band (layer typed column) gives the heights
  const GP = [[0, 850], [1150, 3850], [4150, 6850], [7150, 8000]];
  const bandPlan = (dx, dy) => line('Dim', 0 + dx, 1000 + dy, 8000 + dx, 1000 + dy) + GP.map(([a, b]) => line('Dim', a + dx, 1300 + dy, b + dx, 1300 + dy)).join('');
  const planS = f('a_plan.dxf', doc(cols.map(([a, b], i) => poly('Col', a, 0, b, 300, 'C' + i)).join('') + line('Dim', 0, 5000, 8000, 5000) + line('Dim', 0, 5300, 8000, 5300), PLAN));
  const PLANB = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=B'], ['@GRIDX=A', 6000, 0], ['@GRIDX=B', 9000, 0], ['@GRIDY=1', 0, 850], ['@GRIDY=2', 0, 2850]];
  const beamPlan = f('z_beams.dxf', doc(bandPlan(5000, 700), PLANB));
  const elevB = f('southB.dxf', doc(cols.map(([a, b]) => lbox('Col', a, 0, b, 3000)).join('') + line('Col', 0, 3300, 8000, 3300) + GP.map(([a, b]) => line('Col', a, 3000, b, 3000)).join(''), ELEV));
  await open([planS, elevB, beamPlan]); await layersOpen();
  await choose('plan', 'Col', 'column'); await choose('elev', 'Col', 'column');
  await pg.evaluate(() => { const b = document.querySelector('#dm-panel [data-act="laysplit"][data-key="plan|Dim"]'); if (b) b.click(); }); await t.sleep(400);
  const sub = await pg.evaluate(() => [...document.querySelectorAll('#dm-panel [data-layer-row^="plan|Dim|"]')].map(e => e.getAttribute('data-layer-row')));
  await pg.select('#dm-panel [data-layer-row="plan|Dim|z_beams.dxf"] select', 'beam'); await idle();
  const m11 = await pg.evaluate(() => { const g = window.DxfImportUI.state.gate, S = window.DxfMetaEditor.state.sheets, B = g.R.els.filter(e => e.kind === 'beam'); return { layerMarks: S.map(sh => sh.name + ':' + sh.marks.filter(m => m.key === 'LAYER').map(m => m.value).join(';')), ok: g.ok, bodies: g.structure.bodies, left: g.structure.left_out, beams: B.length, z: [...new Set(B.map(e => e.z0 + '..' + e.z1))], xs: B.map(e => Math.round(Math.min(...e.vertices.map(v => v[0])) * 1000)).sort((p, q) => p - q), pooled: (document.querySelector('#dm-panel [data-layer-row="plan|Dim"] select') || {}).value }; });
  t.assert('S11 per-sheet layer typing: the shared layer Dim is typed beam on the beam sheet ONLY (the plan sheet\'s own Dim lines stay untyped and produce nothing), the beam sheet (own origin) aligns by its grid labels: 4 spans at x 0 / 1.15 / 4.15 / 7.15 m in the base frame, z 3.0..3.3 m from the elevation band; the pooled row reads "(per sheet)"', sub.length === 2 && !/Dim/.test(m11.layerMarks.find(x => /^a_plan/.test(x))) && /z_beams\.dxf:.*Dim,beam/.test(m11.layerMarks.join('|')) && m11.ok && m11.beams === 4 && m11.left === 0 && m11.z.join() === '3..3.3' && m11.xs.join() === '0,1150,4150,7150' && m11.pooled === '__mixed', JSON.stringify(m11));
});

