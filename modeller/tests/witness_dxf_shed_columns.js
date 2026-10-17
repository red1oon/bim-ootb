#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-SHED: prompts/DXF2BIM_MODELLER_LANE.md §L7.10-L7.12. Read the log after every run; exit code is not evidence.
 * Real CAD (an open-sided shed, DWG-derived DXF, inches; local material, SKIP when absent: $SHED_SHEETS or ~/Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets/).
 * Issue proved: a common CAD drawing set, RAW (no markings), reaches the Modeller through the product alone: suggestions accepted, only the facts the drawing cannot state typed
 * (SET name, the plan level, the second level datum), the layers typed Column -> typed columns on the canvas, nothing else invented.
 *   H1 raw: only UNITS/VIEW/NAME suggested (no plan/elevation roles yet)   H2 after Accept all: grid positions come from the dimension TICKS (14 on the elevation), ground-line @Z=0
 *   H3 after the typed facts both sheets have roles   H4 layers typed Column -> structure set: 24 bodies, 8 left out (advisory), Convert enabled
 *   H5 Convert: 24 IfcColumn on Level 1, heights from the elevation (12 full 24..122 in above FGL, 12 drawn 36 in tall), 0 cuts
 */
const fs = require('fs'), path = require('path');
const SH = process.env.SHED_SHEETS || path.join(process.env.HOME, 'Projects/SYSNOVA/DXF2BIM/ShedDrawing/sheets/');
if (!fs.existsSync(path.join(SH, '0_FLOOR_PLAN.dxf'))) { console.log('SKIP W-DXF-SHED: local shed sheets not present'); process.exit(0); }
const { runE2E } = require('./e2e_harness');
runE2E('W-DXF-SHED', async (t) => {
  const pg = t.pg, sleep = t.sleep;
  const idle = async () => { await pg.waitForFunction('!window.DxfMetaEditor.state.busy', { timeout: 180000 }); await sleep(900); };
  await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
  const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept([SH + '0_FLOOR_PLAN.dxf', SH + '1S_ELEV_SOUTH.dxf']);
  await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 180000 }); await sleep(1500);
  const sug = () => pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(sh => sh.prop.list.map(p => p.rule).join(',')));
  const s1 = await sug();
  t.assert('H1 raw shed sheets: the first suggestions are UNITS / VIEW / NAME only', s1.every(x => /^PR-UNITS,PR-VIEW,PR-NAME$/.test(x)), JSON.stringify(s1));
  const acceptAll = async () => { await pg.evaluate(() => { const b = document.querySelector('#dm-yellows [data-act="acceptall"]'); if (b) b.click(); }); await idle(); };
  await acceptAll();
  const m = await pg.evaluate(() => { const E = window.DxfMetaEditor.state.sheets[1].marks, v = {}; E.forEach(x => { if (x.key === 'GRIDH') v[x.value] = Number(x.value && x.x); }); return { gridh: E.filter(x => x.key === 'GRIDH').length, z: E.filter(x => x.key === 'Z').map(x => [x.value, x.y]), face: (E.find(x => x.key === 'FACE') || {}).value, src: [...new Set(E.map(x => x.source))] }; });
  t.assert('H2 Accept all: 14 elevation grid marks from the dimension ticks, @Z=0 at the ground line (y -4470.581), FACE minY from "South", all `user`', m.gridh === 14 && m.z.length === 1 && m.z[0][0] === '0' && Math.abs(m.z[0][1] + 4470.581) < 1e-3 && m.face === 'minY' && m.src.join() === 'user', JSON.stringify(m));
  const type = async (sel, v) => { await pg.click(sel, { clickCount: 3 }); await pg.type(sel, String(v)); await pg.keyboard.press('Tab'); await sleep(500); };
  await type('#dm-f-0-SET', 'SHED'); await idle(); await type('#dm-f-1-SET', 'SHED'); await idle(); await type('#dm-f-0-LEVEL', '0'); await idle(); await acceptAll();
  if (!(await pg.evaluate(() => (document.getElementById('dm-f-1-HAXIS') || {}).value))) { await pg.select('#dm-f-1-HAXIS', '+X'); await idle(); }
  await pg.type('#dm-av-1-Z', '0.6096'); await pg.type('#dm-ap-1-Z', '-4446.6');
  await pg.evaluate(() => document.querySelector('#dm-panel [data-act="add"][data-group="Z"]').click()); await idle();
  const roles = await pg.evaluate(() => window.DxfImportUI.state.sheets.map(s => s.name + ':' + (s.role || 'NONE')));
  t.assert('H3 after the typed facts (SET, LEVEL, the PL datum +24 in) both sheets have roles', roles.join() === '0_FLOOR_PLAN.dxf:plan,1S_ELEV_SOUTH.dxf:elev', JSON.stringify(roles));
  await pg.evaluate(() => { const s = window.DxfMetaEditor.state; if (!s.sec.layers) document.querySelector('#dm-panel .dm-sh[data-sec="layers"]').click(); }); await sleep(400);
  await pg.select('#dm-panel [data-layer-row="plan|Col"] select', 'column'); await idle();
  await pg.select('#dm-panel [data-layer-row="elev|0"] select', 'column'); await idle();
  const g = await pg.evaluate(() => { const g = window.DxfImportUI.state.gate; return { ok: g.ok, st: g.structure, adv: [...new Set(g.verdict.advisory.map(a => a.code))], conv: !document.getElementById('dxf-convert').disabled }; });
  t.assert('H4 layers typed Column -> structure set: 24 bodies, 8 left out (advisory GAP:body_no_elevation only), Convert enabled', g.ok && g.st.bodies === 24 && g.st.left_out === 8 && g.adv.join() === 'GAP:body_no_elevation' && g.conv, JSON.stringify(g));
  const zr = await pg.evaluate(() => { const z = {}; window.DxfImportUI.state.gate.R.els.forEach(e => { const k = (e.z0 / 0.0254).toFixed(1) + '..' + (e.z1 / 0.0254).toFixed(1); z[k] = (z[k] || 0) + 1; }); return z; });
  await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 120000 }); await sleep(1500);
  const c = await pg.evaluate(() => ({ counts: window.DxfImportUI.state.last.counts, cuts: window.DxfImportUI.state.last.nCuts }));
  t.assert('H5 Convert: 24 IfcColumn on Level 1, 0 cuts; heights as drawn: 12 at 24..122 in, 12 at 24..60 in (FGL = 0)', c.counts['Level 1/IfcColumn'] === 24 && c.cuts === 0 && zr['24.0..122.0'] === 12 && zr['24.0..60.0'] === 12, JSON.stringify({ c, zr }));
  const nm = await pg.evaluate(() => [...new Set(window.DxfImportUI.state.gate.R.els.map(e => e.ifc.type_name))]);
  t.assert('H6 the 24 columns carry the drawing\'s own label as type name (the one text naming a column)', nm.length === 1 && nm[0] === '12"x12" R.C.C Column', JSON.stringify(nm));
});

