#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-ATTN: prompts/DXF2BIM_MODELLER_LANE.md §L7.2. Read the log after every run; exit code is not evidence.
 * Issue proved: a value the drawing does not state, only SUGGESTED by the editor, must be visible to the user (Metadata button shivers, suggestion rows yellow) until confirmed.
 *   A0/A1 raw sheet: the editor auto-opens (no shiver while open); closed with values unconfirmed -> #dxf-meta shivers; reopen stops it; rows yellow
 *   D1-D3 applied defaults (state.defaults rows) listed with a yellow `default` badge; a change makes them `you`
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
  let s = await st(); console.log('state raw (editor auto-opened)', JSON.stringify(s));
  t.assert('A0 editor open after import: it shows the suggestions itself, so the button does not shiver', s.shiver === false && s.attn > 0, JSON.stringify(s));
  const yellow = await pg.evaluate(() => { const r = [...document.querySelectorAll('#dm-panel .dm-pr, #dm-panel .dm-defrow')]; return { n: r.length, bg: r.length ? getComputedStyle(r[0]).backgroundColor : null }; });
  t.assert('A1b suggestion rows are drawn on a yellow background', yellow.n > 0 && /245,\s*217,\s*10/.test(yellow.bg || ''), JSON.stringify(yellow));
  await pg.evaluate(() => window.DxfMetaEditor.close()); await t.sleep(300);
  s = await st(); console.log('state closed', JSON.stringify(s));
  t.assert('A1 panel closed while values are still unconfirmed -> the Metadata button shivers (reminder)', s.shiver === true && s.attn > 0, JSON.stringify(s));
  await pg.evaluate(() => window.DxfMetaEditor.show()); await t.sleep(300);
  s = await st();
  t.assert('A1c reopening stops the shiver', s.shiver === false, JSON.stringify(s));
  // applied defaults (rows the import applied because the drawing does not state them): yellow `default` badge, a change makes it the user's
  await pg.evaluate(() => { const st = window.DxfImportUI.state; st.defaults = [{ key: 'roof.sheet.thickness', value: 1, kind: 'default', why: 'not stated in the drawing', options: [0.5, 1, 1.5] }, { key: 'truss.spacing', value: 'every column line', kind: 'default', why: 'spacing is not drawn', options: ['every column line', 'every 2nd column line'] }]; window.DxfMetaEditor.show(); });
  await t.sleep(400);
  const dd = await pg.evaluate(() => ({ rows: document.querySelectorAll('#dm-panel .dm-defrow[data-default]').length, badges: [...document.querySelectorAll('#dm-panel [data-default] .dm-src.default')].map(e => getComputedStyle(e).backgroundColor), attn: window.DxfMetaEditor.state.attn }));
  t.assert('D1 applied defaults listed, each with a yellow `default` badge', dd.rows === 2 && dd.badges.length === 2 && dd.badges.every(b => /245,\s*217,\s*10/.test(b)), JSON.stringify(dd));
  await pg.select('#dm-panel select[data-key="roof.sheet.thickness"]', '1.5'); await t.sleep(400);
  const dc = await pg.evaluate(() => ({ choices: window.DxfMetaEditor.defaultChoices(), row: window.DxfImportUI.state.defaults[0], badge: document.querySelector('#dm-panel [data-default="roof.sheet.thickness"] .dm-src').dataset.src, left: window.DxfMetaEditor.state.attn }));
  t.assert('D2 changing a default makes it the user\'s (badge `you`, value kept as a number, choice recorded)', dc.badge === 'user' && dc.row.kind === 'chosen' && dc.row.value === 1.5 && dc.choices['roof.sheet.thickness'] === '1.5', JSON.stringify(dc));
  t.assert('D3 one default left unconfirmed -> still counted', dc.left >= 1, String(dc.left));
  // one place that repeats every yellow item
  const y1 = await pg.evaluate(() => ({ rows: document.querySelectorAll('#dm-yellows .dm-pr').length, attn: window.DxfMetaEditor.state.attn, blocking: window.DxfMetaEditor.state.verdict.blocking.length }));
  t.assert('Y1 the "All defaults" section lists every yellow item (suggestions + applied defaults) once', y1.rows === y1.attn && y1.rows >= 4, JSON.stringify(y1));
  await pg.evaluate(() => document.querySelector('#dm-yellows [data-act="confirm"]').click()); await t.sleep(500);
  await pg.waitForFunction('!window.DxfMetaEditor.state.busy', { timeout: 120000 }); await t.sleep(400);
  const y1b = await pg.evaluate(() => ({ rows: document.querySelectorAll('#dm-yellows .dm-pr').length, attn: window.DxfMetaEditor.state.attn, blocking: window.DxfMetaEditor.state.verdict.blocking.length }));
  t.assert('Y1b ticking one row there removes just that one', y1b.rows === y1.rows - 1 && y1b.attn === y1.attn - 1, JSON.stringify(y1b));
  await pg.evaluate(() => window.DxfMetaEditor.close()); await t.sleep(300);
  const ig = await pg.evaluate(() => { const b = document.getElementById('dxf-meta'); return { shiver: b.classList.contains('dxf-shiver'), attn: window.DxfMetaEditor.state.attn, blocking: window.DxfMetaEditor.state.verdict.blocking.length, verdict: window.DxfMetaEditor.state.verdict.verdict }; });
  t.assert('Y3 IGNORE path: closed with yellows left -> shiver on, defaults stay applied, the verdict (what gates Convert) is unchanged by them', ig.shiver && ig.attn > 0 && ig.blocking === y1b.blocking, JSON.stringify(ig));
  await pg.evaluate(() => window.DxfMetaEditor.show()); await t.sleep(300);
  await pg.evaluate(() => document.querySelector('#dm-yellows [data-act="acceptall"]').click()); await t.sleep(900);
  const y2 = await pg.evaluate(() => ({ attn: window.DxfMetaEditor.state.attn, rows: document.querySelectorAll('#dm-yellows .dm-pr').length, defs: window.DxfImportUI.state.defaults.map(r => r.key + ':' + r.kind), marks: window.DxfMetaEditor.state.sheets[0].marks.map(m => m.key + ':' + m.source) }));
  t.assert('Y2 Accept all takes every yellow: nothing left, applied defaults kept as the user\'s, suggestions written as `user` markings', y2.attn === 0 && y2.rows === 0 && y2.defs.every(x => /:chosen$/.test(x)) && y2.marks.length >= 3 && y2.marks.every(x => /:user$/.test(x)), JSON.stringify(y2));
  await pg.evaluate(() => { window.DxfImportUI.state.defaults = []; });
  s = await st(); console.log('state confirmed', JSON.stringify(s));
  t.assert('A3 every suggestion confirmed by real clicks -> nothing unconfirmed', s.attn === 0 && s.shiver === false, JSON.stringify(s));
  const by = await pg.evaluate(() => window.DxfMetaEditor.state.sheets[0].marks.map(m => m.key + ':' + m.source));
  t.assert('A3b the confirmed values are the user\'s markings', by.length > 0 && by.every(x => /:user$/.test(x)), by.join(','));
  // A2 control: the confirmed marks written out and re-opened -> nothing left to suggest
  const marks = await pg.evaluate(() => window.DxfMetaEditor.state.sheets[0].marks.map(m => '@' + m.key + '=' + m.value + (m.x || m.y ? '' : '')));
  fs.writeFileSync(path.join(dir, 'marked.dxf'), dxf(marks));
  await open(path.join(dir, 'marked.dxf'));
  s = await st(); console.log('state marked', JSON.stringify(s));
  t.assert('A2 CONTROL: a sheet stating what could be suggested -> no shiver', s.shiver === false && s.attn === 0, JSON.stringify(s));
});
