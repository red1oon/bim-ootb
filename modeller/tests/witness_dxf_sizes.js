#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-SIZES: prompts/DXF2BIM_MODELLER_LANE.md §L10.9. Read the log after every run; exit code is not evidence.
 * Issue proved: the NUMBER is what the user checks and corrects. A drawing whose legend states 350 x 350 mm for columns drawn 300 x 300 shows one row per differing side in the
 * editor's "Stated sizes"; typing another number and Set writes @SIZE (the user's own statement) and the body is recalculated; removing the marking restores the label's number.
 *   Z1 two columns, legend C-1 = 350x350, marks beside them -> 4 differing sides listed (2 bodies x x,y), bodies 0.35 m   Z2 type 0.4 on one side + Set -> THAT body's x is 0.4, the others stay 0.35
 *   Z3 the marking is in the effective sheet text (@SIZE=<id>,x,0.4, source user) and survives a re-open   Z4 remove it -> back to 0.35   Z5 CONTROL: a bad input (0, text) writes nothing
 * Input is written here (tiny synthetic DXF); no local material needed.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const { runE2E } = require('./e2e_harness');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sizes-'));
const g = (c, v) => c + '\n' + v + '\n';
const poly = (layer, x0, y0, x1, y1, h) => g(0, 'LWPOLYLINE') + g(5, h) + g(8, layer) + g(90, 4) + g(70, 1) + g(10, x0) + g(20, y0) + g(10, x1) + g(20, y0) + g(10, x1) + g(20, y1) + g(10, x0) + g(20, y1);
const line = (layer, x0, y0, x1, y1) => g(0, 'LINE') + g(8, layer) + g(10, x0) + g(20, y0) + g(30, 0) + g(11, x1) + g(21, y1) + g(31, 0);
const lbox = (layer, x0, y0, x1, y1) => line(layer, x0, y0, x1, y0) + line(layer, x1, y0, x1, y1) + line(layer, x1, y1, x0, y1) + line(layer, x0, y1, x0, y0);
const mk = (t, x, y) => g(0, 'TEXT') + g(8, 'DXF2BIM-MARK') + g(10, x || 0) + g(20, y || 0) + g(30, 0) + g(40, 20) + g(1, t);
const tx = (t, x, y) => g(0, 'TEXT') + g(8, 'Tex') + g(10, x) + g(20, y) + g(30, 0) + g(40, 20) + g(1, t);
const doc = (body, marks) => g(0, 'SECTION') + g(2, 'ENTITIES') + body + marks.map(m => mk(m[0], m[1], m[2])).join('') + g(0, 'ENDSEC') + g(0, 'EOF');
const PLAN = [['@SET=T'], ['@VIEW=PLAN'], ['@UNITS=mm'], ['@LEVEL=0'], ['@NAME=P'], ['@GRIDX=A', 1000, 0], ['@GRIDX=B', 4000, 0], ['@GRIDY=1', 0, 150], ['@GRIDY=2', 0, 2150], ['@LAYER=Col,column']];
const ELEV = [['@SET=T'], ['@VIEW=ELEV'], ['@FACE=minY'], ['@HAXIS=+X'], ['@UNITS=mm'], ['@NAME=E'], ['@GRIDH=A', 1000, 0], ['@GRIDH=B', 4000, 0], ['@Z=0', 0, 0], ['@Z=3', 0, 3000], ['@LAYER=Col,column']];
const cols = [[850, 1150], [3850, 4150]];
const planDxf = doc(cols.map(([a, b], i) => poly('Col', a, 0, b, 300, 'C' + i)).join('') + tx('C-1 = 350x350', 6000, 900) + tx('C-1', 1000, 600) + tx('C-1', 4000, 600), PLAN);
const elevDxf = doc(cols.map(([a, b]) => lbox('Col', a, 0, b, 3000)).join(''), ELEV);
const f = (n, t) => { const p = path.join(dir, n); fs.writeFileSync(p, t); return p; };
runE2E('W-DXF-SIZES', async (t) => {
  const pg = t.pg, sleep = t.sleep;
  const idle = async () => { await pg.waitForFunction('!window.DxfMetaEditor.state.busy', { timeout: 120000 }); await sleep(600); };
  const open = async (files) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true, timeout: 20000 });
    const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 20000 }), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 120000 }); await sleep(900); };
  const state = () => pg.evaluate(() => { const gt = window.DxfImportUI.state.gate, els = (gt && gt.R && gt.R.els) || [], rows = [...document.querySelectorAll('#dm-panel [data-size-conf]')].map(r => r.getAttribute('data-size-conf')), marks = [...document.querySelectorAll('#dm-panel [data-size-row]')].map(r => r.getAttribute('data-size-row'));
    const ext = e => { const xs = e.vertices.map(v => v[0]); return +(Math.max(...xs) - Math.min(...xs)).toFixed(4); };
    return { structure: !!(gt && gt.structure), bodies: els.length, xs: els.map(e => [e.guid, ext(e), e.size && e.size.x && e.size.x.source]), rows, marks }; });
  const sizesOpen = async () => { await pg.evaluate(() => { const s = window.DxfMetaEditor.state; if (!s.sec.sizes) document.querySelector('#dm-panel .dm-sh[data-sec="sizes"]').click(); }); await sleep(300); };
  await open([f('plan.dxf', planDxf), f('south.dxf', elevDxf)]); await sizesOpen();
  let s = await state(); console.log('Z1 state', JSON.stringify(s));
  t.assert('Z1 legend C-1 = 350x350 vs drawn 300x300: structure set, 2 bodies at 0.35 m, 4 differing sides listed (2 bodies x x,y)', s.structure && s.bodies === 2 && s.xs.every(x => Math.abs(x[1] - 0.35) < 1e-6 && x[2] === 'label') && s.rows.length === 4 && s.marks.length === 0, JSON.stringify(s).slice(0, 300));
  const first = s.rows[0].split('|');   // [guid, axis]
  await pg.evaluate(() => { const i = document.querySelector('#dm-sz-0'); i.value = '0.4'; });
  await pg.click('#dm-panel [data-act="sizeadd"][data-i="0"]'); await idle(); await sizesOpen();
  s = await state(); console.log('Z2 state', JSON.stringify(s));
  const mine = s.xs.find(x => x[0] === first[0]), other = s.xs.find(x => x[0] !== first[0]);
  t.assert('Z2 typing 0.4 on the first row + Set recalculates exactly that body: ' + first[0] + ' ' + first[1] + ' = 0.4 (source user), the other body stays 0.35', first[1] === 'x' ? (Math.abs(mine[1] - 0.4) < 1e-6 && mine[2] === 'user') && Math.abs(other[1] - 0.35) < 1e-6 : s.marks.length === 1, JSON.stringify(s).slice(0, 300));
  const eff = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(sh => ({ name: sh.name, text: window.DxfMetaEditor.effText(sh) })));
  t.assert('Z3 the marking is in the effective sheet text (@SIZE=<id>,<axis>,0.4) and listed as a user statement', eff.some(e => e.text.includes('@SIZE=' + first[0] + ',' + first[1] + ',0.4')) && s.marks.length === 1, JSON.stringify(s.marks));
  const RP = eff.map(x => f('rt_' + x.name, x.text)); await open(RP); await sizesOpen();
  s = await state();
  t.assert('Z3b round trip: the saved sheets reopened carry the user number (marks listed, same body at 0.4)', s.marks.length === 1 && (first[1] !== 'x' || Math.abs(s.xs.find(x => x[0] === first[0])[1] - 0.4) < 1e-6), JSON.stringify(s).slice(0, 300));
  await pg.click('#dm-panel [data-act="sizedel"]'); await idle(); await sizesOpen();
  s = await state();
  t.assert('Z4 removing the marking restores the label number: 2 bodies at 0.35, no @SIZE rows, 4 sides listed again', s.marks.length === 0 && s.xs.every(x => Math.abs(x[1] - 0.35) < 1e-6) && s.rows.length === 4, JSON.stringify(s).slice(0, 300));
  await pg.evaluate(() => { document.querySelector('#dm-sz-1').value = '0'; });
  await pg.click('#dm-panel [data-act="sizeadd"][data-i="1"]'); await sleep(500);
  await pg.evaluate(() => { document.querySelector('#dm-sz-1').value = 'abc'; });
  await pg.click('#dm-panel [data-act="sizeadd"][data-i="1"]'); await sleep(500);
  s = await state();
  t.assert('Z5 CONTROL a bad input (0, text) writes no marking', s.marks.length === 0, JSON.stringify(s.marks));
});
