#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-TICKS: prompts/DXF2BIM_MODELLER_LANE.md §L7.11. Read the log after every run; exit code is not evidence.
 * Issue proved: CAD sets have no grid layer; their grid labels sit beside the dimension chain's ticks (label text ~10 units off the grid position) and the datum is the ground line.
 * Marks placed at the label text made the elevation miss the plan by that offset (0 of 32 shed columns matched). The editor must SUGGEST the true positions (yellow), never guess.
 *   T1 suggestions at the TICK positions (not the label positions) + the ground line @Z=0, yellow   T2 ticking them -> the elevation aligns with the plan (residual < 1 mm)
 *   T3 CONTROL a label with no tick -> not proposed   T4 CONTROL two ticks near one label -> refused (ambiguous), not proposed   T5 CONTROL a sheet with a typed grid layer + labels: PR-GRID unchanged, no tick duplicates
 */
const fs = require('fs'), os = require('os'), path = require('path');
const { runE2E } = require('./e2e_harness');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticks-'));
const g = (c, v) => c + '\n' + v + '\n';
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const txt = (layer, x, y, t) => g(0, 'TEXT') + g(8, layer) + g(10, x) + g(20, y) + g(30, 0) + g(40, 40) + g(1, t);
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 4000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 2150]];
const planDxf = doc(line('Col', 850, 0, 1150, 0), PLAN);
const ELEVM = [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=E'], ['@Z=3', 0, 3000]];
// building outline above a ground line (y=0, full width); labels A,B 10 units left of their ticks; C has no tick
const body = (extra) => line('0', 0, 0, 8000, 0) + line('0', 500, 0, 500, 3000) + line('0', 7500, 0, 7500, 3000) + line('0', 500, 3000, 7500, 3000) +
  line('Dim', 1000, -80, 1000, -60) + line('Dim', 4000, -80, 4000, -60) + txt('Tex', 990, -140, 'A') + txt('Tex', 3990, -140, 'B') + txt('Tex', 6990, -140, 'C') + (extra || '');
const elevDxf = doc(body(), ELEVM), elevAmb = doc(body(line('Dim', 1200, -80, 1200, -60)), ELEVM);
const elevGrid = doc(line('A-GRID', 1000, -100, 1000, 3000) + line('A-GRID', 4000, -100, 4000, 3000) + txt('Tex', 1000, -140, 'A') + txt('Tex', 4000, -140, 'B') + line('0', 0, 0, 8000, 0), ELEVM.concat([['@LAYER=A-GRID,grid']]));
// ground line drawn in two segments, plus a short dimension line LOWER than it: the ground is still the segmented line (80% rule over the whole group), not the stray line
const elevSeg = doc(line('0', 0, 0, 3000, 0) + line('0', 3000, 0, 8000, 0) + line('0', 500, 0, 500, 3000) + line('0', 7500, 0, 7500, 3000) + line('Dim', 6000, -900, 6200, -900) + line('Dim', 1000, -80, 1000, -60) + txt('Tex', 990, -140, 'A'), ELEVM);
const f = (n, t) => { const p = path.join(dir, n); fs.writeFileSync(p, t); return p; };
runE2E('W-DXF-TICKS', async (t) => {
  const pg = t.pg;
  const open = async (files) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true, timeout: 20000 });
    const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 20000 }), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 120000 }); await t.sleep(700); };
  const props = (name) => pg.evaluate((n) => { const sh = window.DxfMetaEditor.state.sheets.find(s => s.name === n); const P = sh.prop || { list: [], refused: [] };
    return { list: P.list.map(p => [p.rule, p.key, p.value, p.x, p.y, p.why]), refused: P.refused.map(r => r.rule + ': ' + r.why) }; }, name);
  const YEL = /245,\s*217,\s*10/;
  await open([f('plan.dxf', planDxf), f('elev.dxf', elevDxf)]);
  let P = await props('elev.dxf'); console.log('props elev', JSON.stringify(P));
  const gh = P.list.filter(p => p[0] === 'PR-GRID-TICK'), gz = P.list.filter(p => p[0] === 'PR-Z-GROUND');
  t.assert('T1 suggestions sit at the TICK positions (A=1000, B=4000), not at the label text (990 / 3990), and the ground line gives @Z=0 at y 0', gh.length === 2 && gh.every(p => p[1] === 'GRIDH') && gh.find(p => p[2] === 'A')[3] === 1000 && gh.find(p => p[2] === 'B')[3] === 4000 && gz.length === 1 && gz[0][2] === '0' && gz[0][4] === 0, JSON.stringify({ gh, gz }));
  t.assert('T3 CONTROL label C has no tick near: not proposed', !P.list.some(p => p[2] === 'C'), JSON.stringify(P.list.map(p => p[2])));
  const yel = await pg.evaluate(() => { const r = [...document.querySelectorAll('#dm-panel .dm-pr')].filter(e => /PR-GRID-TICK|PR-Z-GROUND/.test(e.getAttribute('data-prop') || '')); return { n: r.length, bg: r.length ? getComputedStyle(r[0]).backgroundColor : null }; });
  t.assert('T1b the tick / ground suggestions are drawn yellow', yel.n >= 3 && YEL.test(yel.bg || ''), JSON.stringify(yel));
  // tick the three suggestions with real clicks (the sheet-level rows)
  for (let i = 0; i < 12; i++) { const n = await pg.evaluate(() => { const b = [...document.querySelectorAll('#dm-panel .dm-pr')].filter(e => /PR-GRID-TICK|PR-Z-GROUND/.test(e.getAttribute('data-prop') || '')).map(e => e.querySelector('[data-act="confirm"]')).filter(Boolean)[0]; if (b) { b.click(); return 1; } return 0; }); if (!n) break; await t.sleep(600); }
  await pg.waitForFunction('!window.DxfMetaEditor.state.busy', { timeout: 120000 }); await t.sleep(600);
  const al = await pg.evaluate(() => { const S = window.DxfImportUI.state.sheets, pl = S.find(s => s.name === 'plan.dxf'), el = S.find(s => s.name === 'elev.dxf'); const r = window.Dxf2Marks.align(pl.desc, el.desc, 0.001);
    return { role: el.role, ok: r.ok, errs: r.errors.map(e => e.code), toPlan1000: r.map ? r.map.toPlan(1000) : null, toPlan4000: r.map ? r.map.toPlan(4000) : null, z0: r.map && r.map.zOf ? r.map.zOf(0) : null, z3: r.map && r.map.zOf ? r.map.zOf(3000) : null, marks: window.DxfMetaEditor.state.sheets.find(s => s.name === 'elev.dxf').marks.map(m => m.key + '=' + m.value + ':' + m.source) }; });
  console.log('align', JSON.stringify(al));
  t.assert('T2 ticking them writes user markings and the elevation ALIGNS with the plan: tick x 1000 -> plan 1.000 m, 4000 -> 4.000 m, z 0 -> 0, y 3000 -> 3 m, no align_fail', al.role === 'elev' && al.ok && Math.abs(al.toPlan1000 - 1) < 1e-6 && Math.abs(al.toPlan4000 - 4) < 1e-6 && Math.abs(al.z0) < 1e-9 && Math.abs(al.z3 - 3) < 1e-9, JSON.stringify(al));
  // T4 ambiguity
  await open([f('plan2.dxf', planDxf), f('elevamb.dxf', elevAmb)]);
  P = await props('elevamb.dxf');
  t.assert('T4 CONTROL two ticks within 0.5 m of label A: A is not proposed and the ambiguity is listed (B still is)', !P.list.some(p => p[0] === 'PR-GRID-TICK' && p[2] === 'A') && P.list.some(p => p[0] === 'PR-GRID-TICK' && p[2] === 'B') && P.refused.some(r => /label A: 2 ticks/.test(r)), JSON.stringify(P));
  // T5 typed grid layer: strict PR-GRID decides, no tick duplicates
  await open([f('plan3.dxf', planDxf), f('elevgrid.dxf', elevGrid)]);
  P = await props('elevgrid.dxf');
  t.assert('T5 CONTROL a typed grid layer + labels: PR-GRID proposals exist for A and B and NO PR-GRID-TICK duplicates them', P.list.filter(p => p[0] === 'PR-GRID').length === 2 && !P.list.some(p => p[0] === 'PR-GRID-TICK'), JSON.stringify(P.list));
  // T7 segmented ground line + a lower stray dimension line
  await open([f('plan4.dxf', planDxf), f('elevseg.dxf', elevSeg)]);
  P = await props('elevseg.dxf'); const g7 = P.list.filter(p => p[0] === 'PR-Z-GROUND');
  t.assert('T7 a ground line drawn in two segments is found (80% over the group at one height) and a stray lower dimension line is not mistaken for it: @Z=0 at y 0', g7.length === 1 && g7[0][4] === 0, JSON.stringify(P.list));
  // T8 CAD titles are mixed case and the face is named by compass: "South Elevation" -> VIEW=ELEV, FACE=minY (south = the minY face, north up: a stated convention, not evidence)
  const elevTitled = doc(body() + txt('Tex', 100, -400, 'South Elevation'), [['@SET=T'], ['@VIEW=ELEV'], ['@UNITS=mm'], ['@NAME=E']]);
  await open([f('plan5.dxf', planDxf), f('1S_ELEV_SOUTH.dxf', elevTitled)]);
  P = await props('1S_ELEV_SOUTH.dxf');
  t.assert('T8 mixed-case title "South Elevation" is read (PR-VIEW=ELEV on an unmarked sheet, see the raw shed) and once the view is stated "SOUTH" proposes FACE=minY with the convention named', P.list.some(p => p[0] === 'PR-FACE' && p[2] === 'minY' && /north up/.test(p[5] || '')), JSON.stringify(P.list));
  const elevNoView = doc(body() + txt('Tex', 100, -400, 'South Elevation'), [['@SET=T'], ['@UNITS=mm']]);
  await open([f('plan6.dxf', planDxf), f('e9.dxf', elevNoView)]);
  P = await props('e9.dxf');
  t.assert('T9 an unmarked sheet titled "South Elevation" (mixed case, as CAD writes it) gets PR-VIEW=ELEV', P.list.some(p => p[0] === 'PR-VIEW' && p[2] === 'ELEV'), JSON.stringify(P.list.map(p => p[0] + '=' + p[2])));
});
