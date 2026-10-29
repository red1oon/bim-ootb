#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-SHED: prompts/DXF2BIM_MODELLER_LANE.md §L7.10-L7.13. Read the log after every run; exit code is not evidence.
 * Real CAD (an open-sided shed, DWG-derived DXF, inches; local material, SKIP when absent: $SHED_SHEETS or ~/Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets/).
 * Issue proved: a common CAD drawing set, RAW (no markings), reaches the Modeller through the product alone: suggestions accepted, only the facts the drawing cannot state typed
 * (SET name, the plan level, the PL datum), the layers typed Column -> typed columns on the canvas, nothing else invented.
 *   Flow A (plan + South elevation): H1 raw: only UNITS/VIEW/NAME suggested   H2 Accept all: grid from the dimension TICKS (14), ground-line @Z=0, FACE minY from "South"
 *   H3 typed facts -> both sheets have roles   H4 layers typed Column -> structure set: ALL 32 columns built, 0 left out   H5 Convert: 32 IfcColumn on Level 1, heights as drawn
 *   H6 type name = the drawing's own label   Flow B (plan + North + South): B1 North reads right-to-left (HAXIS -X, FACE maxY from "North", ticks reversed) and the SAME 32 bodies with the
 *   SAME heights come out, 0 ambiguous_z: two independent elevations agree (nothing guessed to reconcile them)
 */
const fs = require('fs'), path = require('path');
const SH = process.env.SHED_SHEETS || path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets/');
if (!fs.existsSync(path.join(SH, '0_FLOOR_PLAN.dxf'))) { console.log('SKIP W-DXF-SHED: local shed sheets not present'); process.exit(0); }
const { runE2E } = require('./e2e_harness');
const PL_Y = { '1S_ELEV_SOUTH.dxf': -4446.6, '1N_ELEV_NORTH.dxf': -3895.2 };   // the line the PL label sits on (ground + 24 in), read from each elevation
runE2E('W-DXF-SHED', async (t) => {
  const pg = t.pg, sleep = t.sleep;
  const idle = async () => { await pg.waitForFunction('!window.DxfMetaEditor.state.busy', { timeout: 180000 }); await sleep(900); };
  const acceptAll = async () => { await pg.evaluate(() => { const b = document.querySelector('#dm-yellows [data-act="acceptall"]'); if (b) b.click(); }); await idle(); };
  const type = async (sel, v) => { await pg.click(sel, { clickCount: 3 }); await pg.type(sel, String(v)); await pg.keyboard.press('Tab'); await sleep(500); };
  const open = async (names) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(names.map(n => SH + n));
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 180000 }); await sleep(1500); };
  const facts = async () => {   // SET on every sheet, the plan level, HAXIS if still open, the PL datum on every elevation
    const names = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.name));
    for (let i = 0; i < names.length; i++) { await type('#dm-f-' + i + '-SET', 'SHED'); await idle(); }
    await type('#dm-f-0-LEVEL', '0'); await idle(); await acceptAll();
    for (let i = 1; i < names.length; i++) { if (!(await pg.evaluate((k) => (document.getElementById('dm-f-' + k + '-HAXIS') || {}).value, i))) { await pg.select('#dm-f-' + i + '-HAXIS', /NORTH/.test(names[i]) ? '-X' : '+X'); await idle(); } }
    for (let i = 1; i < names.length; i++) { await pg.type('#dm-av-' + i + '-Z', '0.6096'); await pg.type('#dm-ap-' + i + '-Z', String(PL_Y[names[i]]));
      await pg.evaluate((k) => document.querySelector('#dm-panel [data-act="add"][data-group="Z"][data-sheet="' + k + '"]').click(), i); await idle(); }
    return names; };
  const typeColumns = async () => { await pg.evaluate(() => { const s = window.DxfMetaEditor.state; if (!s.sec.layers) document.querySelector('#dm-panel .dm-sh[data-sec="layers"]').click(); }); await sleep(400);
    await pg.select('#dm-panel [data-layer-row="plan|Col"] select', 'column'); await idle(); await pg.select('#dm-panel [data-layer-row="elev|0"] select', 'column'); await idle(); };
  const zdist = () => pg.evaluate(() => { const z = {}; window.DxfImportUI.state.gate.R.els.forEach(e => { const k = (e.z0 / 0.0254).toFixed(0) + '..' + (e.z1 / 0.0254).toFixed(0); z[k] = (z[k] || 0) + 1; }); return z; });
  const gate = () => pg.evaluate(() => { const g = window.DxfImportUI.state.gate; return { ok: g.ok, st: g.structure, adv: [...new Set(g.verdict.advisory.map(a => a.code))], refused: g.refused.map(r => r.reason), conv: !document.getElementById('dxf-convert').disabled }; });

  // ---- Flow A: plan + South elevation ----
  await open(['0_FLOOR_PLAN.dxf', '1S_ELEV_SOUTH.dxf']);
  const s1 = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(sh => sh.prop.list.map(p => p.rule).join(',')));
  t.assert('H1 raw shed sheets: the first suggestions are UNITS / VIEW / NAME only', s1.every(x => /^PR-UNITS,PR-VIEW,PR-NAME$/.test(x)), JSON.stringify(s1));
  await acceptAll();
  const m = await pg.evaluate(() => { const E = window.DxfMetaEditor.state.sheets[1].marks; return { gridh: E.filter(x => x.key === 'GRIDH').length, z: E.filter(x => x.key === 'Z').map(x => [x.value, x.y, x.rule]), face: (E.find(x => x.key === 'FACE') || {}).value, src: [...new Set(E.map(x => x.source))] }; });
  // §D96: Accept all now also takes the second height the drawing's own dimension gives (PR-Z-DIM): z = (y - ground y) x 0.0254 on this inch sheet
  t.assert('H2 Accept all: 14 elevation grid marks from the dimension ticks, @Z=0 at the ground line (y -4470.581), a second @Z from the drawing\'s own dimension (PR-Z-DIM, on the ground line\'s scale), FACE minY from "South", all `user`',
    m.gridh === 14 && m.z.length === 2 && m.z[0][0] === '0' && Math.abs(m.z[0][1] + 4470.581) < 1e-3 && m.z[1][2] === 'PR-Z-DIM' && Math.abs((m.z[1][1] - m.z[0][1]) * 0.0254 - Number(m.z[1][0])) < 1e-5 && m.face === 'minY' && m.src.join() === 'user', JSON.stringify(m));
  await facts();
  const roles = await pg.evaluate(() => window.DxfImportUI.state.sheets.map(s => s.name + ':' + (s.role || 'NONE')));
  t.assert('H3 after the typed facts (SET, LEVEL, the PL datum +24 in) both sheets have roles', roles.join() === '0_FLOOR_PLAN.dxf:plan,1S_ELEV_SOUTH.dxf:elev', JSON.stringify(roles));
  await typeColumns();
  const g = await gate(), zA = await zdist();
  t.assert('H4 layers typed Column -> structure set: ALL 32 columns built, 0 left out, no advisory, Convert enabled', g.ok && g.st.bodies === 32 && g.st.left_out === 0 && g.adv.length === 0 && g.conv, JSON.stringify(g));
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 120000 }); await sleep(1500);
  const c = await pg.evaluate(() => ({ counts: window.DxfImportUI.state.last.counts, cuts: window.DxfImportUI.state.last.nCuts }));
  t.assert('H5 Convert: 32 IfcColumn on Level 1, 0 cuts; heights as drawn: 16 at 24..122 in, 12 at 24..60 in (right block drawn 36 in tall), 4 at 24..120 (east end) above FGL', c.counts['Level 1/IfcColumn'] === 32 && c.cuts === 0 && zA['24..122'] === 16 && zA['24..60'] === 12 && zA['24..120'] === 4, JSON.stringify({ c, zA }));
  const nm = await pg.evaluate(() => [...new Set(window.DxfImportUI.state.gate.R.els.map(e => e.ifc.type_name))]);
  t.assert('H6 the 32 columns carry the drawing\'s own label as type name (the one text naming a column)', nm.length === 1 && nm[0] === '12"x12" R.C.C Column', JSON.stringify(nm));

  // ---- Flow B: plan + North + South ----
  await open(['0_FLOOR_PLAN.dxf', '1N_ELEV_NORTH.dxf', '1S_ELEV_SOUTH.dxf']); await acceptAll();
  const face = await pg.evaluate(() => ({ n: window.DxfMetaEditor.state.sheets[1].marks.find(x => x.key === 'FACE'), grid: window.DxfMetaEditor.state.sheets[1].marks.filter(x => x.key === 'GRIDH').length }));
  await facts(); await typeColumns();
  const gB = await gate(), zB = await zdist();
  t.assert('B1 plan + North + South: North is read right-to-left (FACE maxY from "North", 14 tick grid marks, HAXIS -X) and the SAME 32 bodies with the SAME heights come out: two independent elevations agree, 0 ambiguous', face.n && face.n.value === 'maxY' && face.grid === 14 && gB.ok && gB.st.bodies === 32 && gB.st.left_out === 0 && !gB.adv.includes('GAP:body_ambiguous_z') && JSON.stringify(zB) === JSON.stringify(zA), JSON.stringify({ face, gB, zB }));

  // ---- Flow C (§L7.14): plan + foundation plan + South: footings from the foundation plan, their z range STATED by the user (detail: FGL to underside 5'-0" = 3" blinding + 12" footing + 45" column in the ground) ----
  await open(['0_FLOOR_PLAN.dxf', '4_FOUNDATION_LAYOUT.dxf', '1S_ELEV_SOUTH.dxf']); await acceptAll();
  const fm = await pg.evaluate(() => { const S = window.DxfMetaEditor.state.sheets; return S.map(sh => ({ n: sh.name, gx: sh.marks.filter(x => x.key === 'GRIDX').length, gy: sh.marks.filter(x => x.key === 'GRIDY').length })); });
  t.assert('F1 the foundation plan\'s grid also comes from its dimension ticks (same 14 + 4 labels as the floor plan)', fm[0].gx === fm[2].gx && fm[0].gy === fm[2].gy && fm[0].gx === 14 && fm[0].gy === 4, JSON.stringify(fm));
  const names = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.name));
  for (let i = 0; i < names.length; i++) { await type('#dm-f-' + i + '-SET', 'SHED'); await idle(); }
  await type('#dm-f-0-LEVEL', '0'); await idle(); await type('#dm-f-2-LEVEL', '0'); await idle(); await acceptAll();
  if (!(await pg.evaluate(() => (document.getElementById('dm-f-1-HAXIS') || {}).value))) { await pg.select('#dm-f-1-HAXIS', '+X'); await idle(); }
  await pg.type('#dm-av-1-Z', '0.6096'); await pg.type('#dm-ap-1-Z', String(PL_Y['1S_ELEV_SOUTH.dxf']));
  await pg.evaluate(() => document.querySelector('#dm-panel [data-act="add"][data-group="Z"][data-sheet="1"]').click()); await idle();
  await pg.evaluate(() => { const s = window.DxfMetaEditor.state; if (!s.sec.layers) document.querySelector('#dm-panel .dm-sh[data-sec="layers"]').click(); }); await sleep(400);
  await pg.select('#dm-panel [data-layer-row="plan|Col"] select', 'column'); await idle(); await pg.select('#dm-panel [data-layer-row="elev|0"] select', 'column'); await idle();
  await pg.select('#dm-panel [data-layer-row="plan|Fo"] select', 'footing'); await idle();
  const w = await pg.evaluate(() => { const g = window.DxfImportUI.state.gate; return { ok: g.ok, st: g.structure, adv: [...new Set(g.verdict.advisory.map(a => a.code))], waiting: (document.querySelector('#dm-panel [data-bodyz="footing"]') || {}).textContent || null }; });
  t.assert('F2 plan + foundation plan + South, layers typed: 32 columns (the foundation plan\'s columns dedupe with the floor plan\'s) built; the 32 footings wait for a height, listed in "Body heights" (no elevation shows them)', w.ok && w.st.bodies === 32 && w.st.left_out === 32 && w.adv.join() === 'GAP:body_no_elevation' && /32 waiting/.test(w.waiting || ''), JSON.stringify(w));
  await pg.type('#dm-bz-footing-0', '-1.4478'); await pg.type('#dm-bz-footing-1', '-1.143');
  await pg.evaluate(() => document.querySelector('#dm-panel [data-act="bodyzadd"][data-kind="footing"]').click()); await idle();
  const w2 = await pg.evaluate(() => { const g = window.DxfImportUI.state.gate; const F = g.R.els.filter(e => e.kind === 'footing'), C = g.R.els.filter(e => e.kind === 'column'); const ext = F.map(e => { const xs = e.vertices.map(v => v[0]), ys = e.vertices.map(v => v[1]); return [((Math.max(...xs) - Math.min(...xs)) / 0.0254).toFixed(0), ((Math.max(...ys) - Math.min(...ys)) / 0.0254).toFixed(0)].join('x'); });
    const cx = {}; C.forEach(e => { const xs = e.vertices.map(v => v[0]), ys = e.vertices.map(v => v[1]); cx[Math.round((Math.min(...xs) + Math.max(...xs)) / 2 * 1000) + ',' + Math.round((Math.min(...ys) + Math.max(...ys)) / 2 * 1000)] = 1; });
    const centred = F.filter(e => { const xs = e.vertices.map(v => v[0]), ys = e.vertices.map(v => v[1]); return cx[Math.round((Math.min(...xs) + Math.max(...xs)) / 2 * 1000) + ',' + Math.round((Math.min(...ys) + Math.max(...ys)) / 2 * 1000)]; }).length;
    return { ok: g.ok, st: g.structure, nF: F.length, sizes: [...new Set(ext)], z: [...new Set(F.map(e => e.z0 + '..' + e.z1))], centred }; });
  t.assert('F3 typing the range builds the 32 footings: 48 x 60 in as drawn (4\'-0" x 5\'-0", F-1), z -1.4478..-1.143 m as stated, EACH centred on a column of the floor plan (the two plans align by their shared grid labels)', w2.ok && w2.st.bodies === 64 && w2.st.left_out === 0 && w2.nF === 32 && w2.sizes.join() === '48x60' && w2.z.join() === '-1.4478..-1.143' && w2.centred === 32, JSON.stringify(w2));

  // ---- Flow D (§L9): + the beam-layout plan. The shared layer Dim holds dimensions on the other plans: typed beam on THAT sheet only (per-sheet row) ----
  await open(['0_FLOOR_PLAN.dxf', '1S_ELEV_SOUTH.dxf', '3_BEAM_LAYOUT.dxf', '4_FOUNDATION_LAYOUT.dxf']); await acceptAll();
  const nD = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.name));
  for (let i = 0; i < nD.length; i++) { await type('#dm-f-' + i + '-SET', 'SHED'); await idle(); }
  for (const i of [0, 2, 3]) { await type('#dm-f-' + i + '-LEVEL', '0'); await idle(); }
  await acceptAll();
  if (!(await pg.evaluate(() => (document.getElementById('dm-f-1-HAXIS') || {}).value))) { await pg.select('#dm-f-1-HAXIS', '+X'); await idle(); }
  await pg.type('#dm-av-1-Z', '0.6096'); await pg.type('#dm-ap-1-Z', String(PL_Y['1S_ELEV_SOUTH.dxf']));
  await pg.evaluate(() => document.querySelector('#dm-panel [data-act="add"][data-group="Z"][data-sheet="1"]').click()); await idle();
  await pg.evaluate(() => { const s = window.DxfMetaEditor.state; if (!s.sec.layers) document.querySelector('#dm-panel .dm-sh[data-sec="layers"]').click(); }); await sleep(400);
  await pg.select('#dm-panel [data-layer-row="plan|Col"] select', 'column'); await idle(); await pg.select('#dm-panel [data-layer-row="elev|0"] select', 'column'); await idle();
  await pg.select('#dm-panel [data-layer-row="plan|Fo"] select', 'footing'); await idle();
  await pg.evaluate(() => { const b = document.querySelector('#dm-panel [data-act="laysplit"][data-key="plan|Dim"]'); if (b) b.click(); }); await sleep(400);
  const subs = await pg.evaluate(() => [...document.querySelectorAll('#dm-panel [data-layer-row^="plan|Dim|"]')].map(e => e.getAttribute('data-layer-row').split('|')[2]));
  await pg.select('#dm-panel [data-layer-row="plan|Dim|3_BEAM_LAYOUT.dxf"] select', 'beam'); await idle();
  const d = await pg.evaluate(() => { const g = window.DxfImportUI.state.gate, B = g.R.els.filter(e => e.kind === 'beam'), W = {}; g.R.gaps.forEach(x => { W[x.kind] = (W[x.kind] || 0) + 1; });
    return { ok: g.ok, bodies: g.structure.bodies, beams: B.length, z: [...new Set(B.map(e => (e.z0 / 0.0254).toFixed(0) + '..' + (e.z1 / 0.0254).toFixed(0) + ' ' + e.height_source))], waiting: W, sec: (document.querySelector('#dm-panel [data-bodyz="beam"]') || {}).textContent || null,
      dimMarks: window.DxfMetaEditor.state.sheets.map(sh => sh.name + ':' + sh.marks.filter(m => m.key === 'LAYER' && /^Dim,/.test(m.value)).length) }; });
  t.assert('D1 beams on the real shed through the page: the shared layer Dim typed beam on 3_BEAM_LAYOUT only (the floor and foundation plans keep their dimension lines untyped); 17 spans at 122..132 in from the elevation band; the other 22 regions + 32 footings wait in "Body heights" (no elevation evidence)', subs.length === 3 && d.dimMarks.filter(x => /:1$/.test(x)).length === 1 && /3_BEAM_LAYOUT\.dxf:1/.test(d.dimMarks.join()) && d.ok && d.beams === 17 && d.z.join() === '122..132 elevation' && d.waiting.beam === 22 && d.waiting.footing === 32 && /22 waiting/.test(d.sec || ''), JSON.stringify({ subs, d }));
});

