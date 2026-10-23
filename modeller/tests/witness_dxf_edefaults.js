#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-EDEFAULTS: prompts/DXF2BIM_MODELLER_LANE.md §L18. Read the log after every run; exit code is not evidence.
 * Issue proved: every setting a 2D layout may not carry is visible BEFORE conversion, tagged standard or guess, and a person can state a value that the drawing set keeps; otherwise the default is used.
 *   E1 the "Element defaults" section lists all 49 settings (door.operation_standard added 2026-10-22, F7 D18; slab.outline_when_not_rect 2026-10-23, D51; wall.top_when_unseen, D54; slab.edge_*, D70.1) grouped by element, door.height highlighted (used) at 2.1 m, guess   E2 type 2.4 + Set: the door body is 2.4 m high, the row says stated, the marking
 *   @DEFAULT=door.height,2.4 is in the saved sheet text   E3 re-open the saved sheets: still 2.4 (the setting travels with the drawing set)   E4 remove: back to 2.1   E5 CONTROL bad input (text, negative): no marking
 */
const fs = require('fs'), os = require('os'), path = require('path');
const { runE2E } = require('./e2e_harness');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edef-'));
const g = (c, v) => c + '\n' + v + '\n';
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const poly = (layer, x0, y0, x1, y1, h) => g(0, 'LWPOLYLINE') + g(5, h) + g(8, layer) + g(90, 4) + g(70, 1) + g(10, x0) + g(20, y0) + g(10, x1) + g(20, y0) + g(10, x1) + g(20, y1) + g(10, x0) + g(20, y1);
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const lbox = (layer, x0, y0, x1, y1) => line(layer, x0, y0, x1, y0) + line(layer, x1, y0, x1, y1) + line(layer, x1, y1, x0, y1) + line(layer, x0, y1, x0, y0);
const arc = (layer, cx, cy, r, a0, a1, h) => g(0, 'ARC') + g(5, h) + g(8, layer) + g(10, cx) + g(20, cy) + g(30, 0) + g(40, r) + g(50, a0) + g(51, a1);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 7000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 4150], ['@LAYER=Col,column'], ['@LAYER=Rod,doorswing']];
const SOUTH = [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=S'], ['@GRIDH=A', 1000, 0], ['@GRIDH=B', 7000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Col,column']];
const cols = []; [850, 6850].forEach(x => [0, 4000].forEach(y => cols.push([x, y])));
const planBody = cols.map(([x, y], i) => poly('Col', x, y, x + 300, y + 300, 'C' + i)).join('') + arc('Rod', 2000, 1000, 900, 0, 90, 'D1') + line('Rod', 2000, 1000, 2000, 1900);
const f = (n, t) => { const p = path.join(dir, n); fs.writeFileSync(p, t); return p; };
runE2E('W-DXF-EDEFAULTS', async (t) => {
  const pg = t.pg, sleep = t.sleep;
  const idle = async () => { await pg.waitForFunction('!window.DxfMetaEditor.state.busy', { timeout: 120000 }); await sleep(700); };
  const open = async (files) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true, timeout: 20000 });
    const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 20000 }), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 120000 }); await sleep(900); };
  const secOpen = async () => { await pg.evaluate(() => { const s = window.DxfMetaEditor.state; if (!s.sec.edefaults) document.querySelector('#dm-panel .dm-sh[data-sec="edefaults"]').click(); }); await sleep(400); };
  const st = () => pg.evaluate(() => { const g = window.DxfImportUI.state.gate, els = (g && g.R && g.R.els) || [], door = els.find(e => e.class === 'IfcDoor'), rows = [...document.querySelectorAll('#dm-panel [data-edef]')];
    const dh = rows.find(r => r.getAttribute('data-edef') === 'door.height');
    return { structure: !!(g && g.structure), nrows: rows.length, doorH: door ? +(door.z1 - door.z0).toFixed(4) : null, src: door && door.size.d.source, hl: !!(dh && dh.classList.contains('dm-defrow')), label: dh ? dh.querySelector('label').textContent : null, marks: [...document.querySelectorAll('#dm-panel [data-act="edefdel"]')].map(b => b.getAttribute('data-key')), idx: rows.findIndex(r => r.getAttribute('data-edef') === 'door.height') }; });
  await open([f('plan.dxf', doc(planBody, PLAN)), f('south.dxf', doc(lbox('Col', 850, 0, 1150, 3000) + lbox('Col', 6850, 0, 7150, 3000), SOUTH))]); await secOpen();
  let s = await st(); console.log('state E1', JSON.stringify(s));
  t.assert('E1 the Element defaults section lists all 49 settings (door.operation_standard added 2026-10-22, F7 D18; slab.outline_when_not_rect 2026-10-23, D51; wall.top_when_unseen, D54; slab.underside_when_stepped, D57; slab.edge_joint_close + slab.edge_void_min_area, D70.1) grouped by element; door.height is highlighted (used in this model), tagged guess, the door is 2.1 m high', s.structure && s.nrows === 49 && s.hl && /guess/.test(s.label) && s.doorH === 2.1 && s.src === 'default', JSON.stringify(s));
  const ord = s.idx;
  await pg.evaluate((i) => { document.querySelector('#dm-ed-' + i).value = '2.4'; }, ord);
  await pg.click('#dm-panel [data-act="edefset"][data-key="door.height"]'); await idle(); await secOpen();
  s = await st(); console.log('state E2', JSON.stringify(s));
  const eff = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(sh => ({ name: sh.name, text: window.DxfMetaEditor.effText(sh) })));
  t.assert('E2 Set 2.4: the door body is 2.4 m high (source stated), the row says stated, a remove button appears, and @DEFAULT=door.height,2.4 is in the saved plan sheet text', s.doorH === 2.4 && s.src === 'stated' && /stated/.test(s.label) && s.marks.includes('door.height') && eff.some(e => e.text.includes('@DEFAULT=door.height,2.4')), JSON.stringify(s));
  await open(eff.map(x => f('rt_' + x.name, x.text))); await secOpen(); s = await st();
  t.assert('E3 re-opening the saved sheets: still 2.4 m, still stated (the setting travels with the drawing set, no sidecar)', s.doorH === 2.4 && s.src === 'stated' && s.marks.includes('door.height'), JSON.stringify(s));
  await pg.click('#dm-panel [data-act="edefdel"][data-key="door.height"]'); await idle(); await secOpen(); s = await st();
  t.assert('E4 remove: back to the 2.1 m guess, highlighted again, no stated settings', s.doorH === 2.1 && s.src === 'default' && s.marks.length === 0 && /guess/.test(s.label), JSON.stringify(s));
  const bi = await pg.evaluate(() => [...document.querySelectorAll('#dm-panel [data-edef]')].findIndex(r => r.getAttribute('data-edef') === 'building.type'));
  await pg.select('#dm-ed-' + bi, 'Farming Shed'); await pg.click('#dm-panel [data-act="edefset"][data-key="building.type"]'); await idle(); await secOpen(); s = await st();
  t.assert('E6 the Building type selector (a select, options General | Farming Shed) set to Farming Shed: the door becomes 1.83 m (the cited 6 ft door, source type) and the saved sheets carry @DEFAULT=building.type,Farming Shed', s.doorH === 1.83 && s.src === 'type' && (await pg.evaluate(() => window.DxfMetaEditor.state.sheets.some(sh => window.DxfMetaEditor.effText(sh).includes('@DEFAULT=building.type,Farming Shed')))), JSON.stringify(s));
  await pg.evaluate(() => { const s = window.DxfMetaEditor.state; if (!s.sec.typology) document.querySelector('#dm-panel .dm-sh[data-sec="typology"]').click(); }); await sleep(400);
  const typ = await pg.evaluate(() => [...document.querySelectorAll('#dm-panel [data-typ]')].map(r => r.getAttribute('data-typ')));
  t.assert('E7 (§L22) as Farming Shed the Typology section lists advisories (the 4 test columns are not measurable as a house here, but the expected classes IfcFan/IfcCovering/IfcRoof/IfcSlab are reported missing)', typ.includes('TYP:expected_missing') && typ.includes('TYP:expected_present'), JSON.stringify(typ));
  await pg.click('#dm-panel [data-act="edefdel"][data-key="building.type"]'); await idle(); await secOpen(); s = await st();
  const typ0 = await pg.evaluate(() => document.querySelectorAll('#dm-panel [data-typ]').length + '/' + !!document.querySelector('#dm-panel .dm-sh[data-sec="typology"]'));
  t.assert('E8 (§L22) back to General: no Typology section at all (the typology never speaks without a stated type)', typ0 === '0/false', typ0);
  for (const bad of ['tall', '-2']) { await pg.evaluate((i, v) => { document.querySelector('#dm-ed-' + i).value = v; }, s.idx, bad); await pg.click('#dm-panel [data-act="edefset"][data-key="door.height"]'); await sleep(600); }
  s = await st();
  t.assert('E5 CONTROL a text or negative value writes no marking (refused, the default stays)', s.marks.length === 0 && s.doorH === 2.1, JSON.stringify(s));
});
