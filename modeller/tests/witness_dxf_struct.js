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
});
