#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-ATTN: prompts/DXF2BIM_MODELLER_LANE.md §L7.2. Read the log after every run; exit code is not evidence.
 * Issue proved: a value the drawing does not state, only SUGGESTED by the editor, must be visible to the user (Metadata button shivers, suggestion rows yellow) until confirmed.
 *   A1 a raw sheet (units in the header, a title text, nothing marked) -> suggestions exist -> #dxf-meta has .dxf-shiver, rows .dm-pr are yellow
 *   A2 CONTROL a sheet that already states every marking the editor could suggest -> no shiver
 *   A3 confirming every suggestion (real clicks) -> unconfirmed 0 -> shiver gone, the markings are 'you'
 * Input is written here (tiny synthetic DXF); no local material needed.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const { runE2E } = require('./e2e_harness');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attn-'));
const dxf = (marks) => ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LINE', '8', 'A-WALL-FULL', '10', '0', '20', '0', '30', '0', '11', '5000', '21', '0', '31', '0',
  '0', 'TEXT', '8', 'A-ANNO-TEXT', '10', '100', '20', '100', '30', '0', '40', '50', '1', 'GROUND FLOOR PLAN']
  .concat(marks.flatMap((m, i) => ['0', 'TEXT', '8', 'DXF2BIM-MARK', '10', '0', '20', String(-100 * (i + 1)), '30', '0', '40', '20', '1', m])).concat(['0', 'ENDSEC', '0', 'EOF']).join('\n');
fs.writeFileSync(path.join(dir, 'raw.dxf'), dxf([]));
runE2E('W-DXF-ATTN', async (t) => {
  const pg = t.pg;
  const open = async (f) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true, timeout: 20000 });
    const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 20000 }), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept([f]);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 120000 }); await t.sleep(600); };
  const st = () => pg.evaluate(() => { const b = document.getElementById('dxf-meta'); return { shiver: !!b && b.classList.contains('dxf-shiver'), attn: window.DxfMetaEditor.state.attn, title: b && b.title }; });
  await open(path.join(dir, 'raw.dxf'));
  let s = await st(); console.log('state raw', JSON.stringify(s));
  t.assert('A1 raw sheet: suggestions pending -> Metadata button shivers', s.shiver === true && s.attn > 0, JSON.stringify(s));
  await pg.evaluate(() => window.DxfMetaEditor.show()); await t.sleep(400);
  const yellow = await pg.evaluate(() => { const r = [...document.querySelectorAll('#dm-panel .dm-pr, #dm-panel .dm-defrow')]; return { n: r.length, bg: r.length ? getComputedStyle(r[0]).backgroundColor : null }; });
  t.assert('A1b suggestion rows are drawn on a yellow background', yellow.n > 0 && /245,\s*217,\s*10/.test(yellow.bg || ''), JSON.stringify(yellow));
  for (let i = 0; i < 40; i++) { const n = await pg.evaluate(() => { const b = document.querySelector('#dm-panel [data-act="confirm"]'); if (b) { b.click(); return 1; } return 0; }); if (!n) break; await t.sleep(500); }
  await pg.waitForFunction('!window.DxfMetaEditor.state.busy', { timeout: 120000 }); await t.sleep(600);
  s = await st(); console.log('state confirmed', JSON.stringify(s));
  t.assert('A3 every suggestion confirmed by real clicks -> shiver gone', s.shiver === false && s.attn === 0, JSON.stringify(s));
  const by = await pg.evaluate(() => window.DxfMetaEditor.state.sheets[0].marks.map(m => m.key + ':' + m.source));
  t.assert('A3b the confirmed values are the user\'s markings', by.length > 0 && by.every(x => /:user$/.test(x)), by.join(','));
  // A2 control: the confirmed marks written out and re-opened -> nothing left to suggest
  const marks = await pg.evaluate(() => window.DxfMetaEditor.state.sheets[0].marks.map(m => '@' + m.key + '=' + m.value + (m.x || m.y ? '' : '')));
  fs.writeFileSync(path.join(dir, 'marked.dxf'), dxf(marks));
  await open(path.join(dir, 'marked.dxf'));
  s = await st(); console.log('state marked', JSON.stringify(s));
  t.assert('A2 CONTROL: a sheet stating what could be suggested -> no shiver', s.shiver === false && s.attn === 0, JSON.stringify(s));
});
