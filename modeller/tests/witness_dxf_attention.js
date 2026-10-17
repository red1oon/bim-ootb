#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-ATTN: prompts/DXF2BIM_MODELLER_LANE.md §L7.2 + §L7.8. Read the log after every run; exit code is not evidence.
 * Issue proved: a value the drawing does not state (a suggestion, or a default the pre-processor APPLIED) must be visible until confirmed:
 * yellow rows, one "All defaults" list, the Metadata button shivers while the editor is closed; ignoring it is valid (never gates Convert).
 *   Part 1 raw sheet (units in the header, a title text, nothing marked): A0 editor auto-open -> no shiver; A1 closed -> shiver; A1c reopen -> stops; A1b rows yellow;
 *          A3 confirm by real clicks -> nothing left; A2 control (a sheet that states them) -> no shiver.
 *   Part 2 line-work sheet (CAD-style loose lines, one open corner): E1 the pre-processor APPLIED one default (snap tolerance) and reports the regions found;
 *          E1b yellow in "Defaults applied" and in "All defaults"; E1c closed -> shiver; E2 CONTROL choosing another tolerance re-runs it (1 -> 2 regions);
 *          D1 badge `default` yellow, then `you` after the choice; Y1/Y1b the one list, one tick; Y3 ignore path (verdict unchanged by the default); Y2 Accept all; E3 non-line-work -> none.
 * Input is written here (tiny synthetic DXF); no local material needed.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const { runE2E } = require('./e2e_harness');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attn-'));
const dxf = (marks) => ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LINE', '8', 'A-WALL-FULL', '10', '0', '20', '0', '30', '0', '11', '5000', '21', '0', '31', '0',
  '0', 'TEXT', '8', 'A-ANNO-TEXT', '10', '100', '20', '100', '30', '0', '40', '50', '1', 'GROUND FLOOR PLAN']
  .concat(marks.flatMap((m, i) => ['0', 'TEXT', '8', 'DXF2BIM-MARK', '10', '0', '20', String(-100 * (i + 1)), '30', '0', '40', '20', '1', m])).concat(['0', 'ENDSEC', '0', 'EOF']).join('\n');
const L8 = (x0, y0, x1, y1) => ['0', 'LINE', '8', '0', '10', String(x0), '20', String(y0), '30', '0', '11', String(x1), '21', String(y1), '31', '0'];
const box = (x0, y0, x1, y1, gap) => [L8(x0, y0, x1, y0), L8(x1, y0, x1, y1), L8(x1, y1, x0, y1), L8(x0, y0 + (gap || 0), x0, y1)].flat();
fs.writeFileSync(path.join(dir, 'raw.dxf'), dxf([]));
fs.writeFileSync(path.join(dir, 'lines.dxf'), ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES']
  .concat(box(0, 0, 10, 5), box(20, 0, 30, 5, 0.05), ['0', 'TEXT', '8', 'DXF2BIM-MARK', '10', '0', '20', '-100', '30', '0', '40', '20', '1', '@LAYER=0,elevwall'], ['0', 'ENDSEC', '0', 'EOF']).join('\n'));
const YEL = /245,\s*217,\s*10/;
runE2E('W-DXF-ATTN', async (t) => {
  const pg = t.pg;
  const open = async (f) => { await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true, timeout: 20000 });
    const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 20000 }), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept([f]);
    await pg.waitForFunction('window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict', { timeout: 120000 }); await t.sleep(600); };
  const idle = async () => { await pg.waitForFunction('!window.DxfMetaEditor.state.busy', { timeout: 120000 }); await t.sleep(400); };
  const st = () => pg.evaluate(() => { const b = document.getElementById('dxf-meta'); return { shiver: !!b && b.classList.contains('dxf-shiver'), attn: window.DxfMetaEditor.state.attn, title: b && b.title }; });
  const close = async () => { await pg.evaluate(() => window.DxfMetaEditor.close()); await t.sleep(300); };
  const show = async () => { await pg.evaluate(() => window.DxfMetaEditor.show()); await t.sleep(300); };

  // ---- Part 1: raw sheet ----
  await open(path.join(dir, 'raw.dxf'));
  let s = await st();
  t.assert('A0 editor open after import: it shows the suggestions itself, so the button does not shiver', s.shiver === false && s.attn > 0, JSON.stringify(s));
  const yellow = await pg.evaluate(() => { const r = [...document.querySelectorAll('#dm-panel .dm-pr, #dm-panel .dm-defrow')]; return { n: r.length, bg: r.length ? getComputedStyle(r[0]).backgroundColor : null }; });
  t.assert('A1b suggestion rows are drawn on a yellow background', yellow.n > 0 && YEL.test(yellow.bg || ''), JSON.stringify(yellow));
  await close(); s = await st();
  t.assert('A1 panel closed while values are unconfirmed -> the Metadata button shivers (reminder)', s.shiver === true && s.attn > 0, JSON.stringify(s));
  await show(); s = await st();
  t.assert('A1c reopening stops the shiver', s.shiver === false, JSON.stringify(s));
  for (let i = 0; i < 40; i++) { const n = await pg.evaluate(() => { const b = document.querySelector('#dm-panel [data-act="confirm"]'); if (b) { b.click(); return 1; } return 0; }); if (!n) break; await t.sleep(500); }
  await idle(); s = await st();
  t.assert('A3 every suggestion confirmed by real clicks -> nothing unconfirmed', s.attn === 0 && s.shiver === false, JSON.stringify(s));
  const by = await pg.evaluate(() => window.DxfMetaEditor.state.sheets[0].marks.map(m => m.key + ':' + m.source));
  t.assert('A3b the confirmed values are the user\'s markings', by.length > 0 && by.every(x => /:user$/.test(x)), by.join(','));
  const marks = await pg.evaluate(() => window.DxfMetaEditor.state.sheets[0].marks.map(m => '@' + m.key + '=' + m.value));
  fs.writeFileSync(path.join(dir, 'marked.dxf'), dxf(marks));
  await open(path.join(dir, 'marked.dxf')); s = await st();
  t.assert('A2 CONTROL: a sheet stating what could be suggested -> no shiver', s.shiver === false && s.attn === 0, JSON.stringify(s));

  // ---- Part 2: line-work ELEVATION sheet; the reader synthesises its wall rectangles, the tolerance it applies is a default ----
  await open(path.join(dir, 'lines.dxf'));
  const e0 = await pg.evaluate(() => ({ defaults: window.DxfImportUI.state.defaults.length, synth: window.DxfImportUI.state.sheets[0].synth }));
  t.assert('E0 line-work sheet with its layer typed elevwall but no @VIEW yet: the reader has not used the tolerance -> NO default row (no yellow noise)', e0.defaults === 0 && e0.synth === null, JSON.stringify(e0));
  await pg.select('#dm-panel select[data-key="VIEW"]', 'ELEV'); await idle();
  const e1 = await pg.evaluate(() => { const U = window.DxfImportUI.state, r = U.defaults.filter(x => x.key === 'loops.snap_tol'), pr = U.prep['lines.dxf']; return { n: r.length, kind: r[0] && r[0].kind, value: r[0] && r[0].value, rects: pr && pr.loops, segs: pr && pr.segments }; });
  t.assert('E1 user marks the sheet @VIEW=ELEV: the reader synthesised wall rectangles and APPLIED one default (snap tolerance 0.01): 1 of 2 rectangles (one corner is open)', e1.n === 1 && e1.kind === 'default' && e1.value === 0.01 && e1.rects === 1 && e1.segs === 8, JSON.stringify(e1));
  const e1b = await pg.evaluate(() => { const r = document.querySelector('#dm-panel [data-default="loops.snap_tol"]'); return { row: !!r, bg: r ? getComputedStyle(r).backgroundColor : null, badge: !!document.querySelector('#dm-panel [data-default="loops.snap_tol"] .dm-src.default'), inAll: !!document.querySelector('#dm-yellows .dm-pr [data-act="defkeep"][data-key="loops.snap_tol"]'), report: (document.querySelector('#dm-panel [data-prep="lines.dxf"]') || {}).textContent }; });
  t.assert('E1b yellow in "Defaults applied" (badge `default`) and again in "All defaults", with the rectangles line', e1b.row && YEL.test(e1b.bg) && e1b.badge && e1b.inAll && /line work: 1 wall rectangles synthesised/.test(e1b.report || ''), JSON.stringify(e1b));
  const y1 = await pg.evaluate(() => ({ rows: document.querySelectorAll('#dm-yellows .dm-pr').length, attn: window.DxfMetaEditor.state.attn, blocking: window.DxfMetaEditor.state.verdict.blocking.length }));
  t.assert('Y1 the "All defaults" list holds every yellow item once (suggestion + applied default)', y1.rows === y1.attn && y1.rows >= 2, JSON.stringify(y1));
  await close(); s = await st();
  t.assert('E1c closed with those unconfirmed -> the Metadata button shivers; ignoring is valid: the verdict that gates Convert is not changed by the default', s.shiver === true && (await pg.evaluate(() => window.DxfMetaEditor.state.verdict.blocking.length)) === y1.blocking, JSON.stringify(s));
  await show();
  await pg.select('#dm-panel select[data-key="loops.snap_tol"]', '0.1'); await idle();
  const e2 = await pg.evaluate(() => { const U = window.DxfImportUI.state; return { loops: U.prep['lines.dxf'].loops, tol: U.prep['lines.dxf'].tol, kind: U.defaults.filter(x => x.key === 'loops.snap_tol')[0].kind, badge: document.querySelector('#dm-panel [data-default="loops.snap_tol"] .dm-src').dataset.src, report: (document.querySelector('#dm-panel [data-prep="lines.dxf"]') || {}).textContent }; });
  t.assert('E2 CONTROL choosing tolerance 0.1 re-runs the pre-processor: the open corner closes (1 -> 2 rectangles), the row is now the user\'s (`you`)', e2.loops === 2 && e2.tol === 0.1 && e2.kind === 'chosen' && e2.badge === 'user' && /line work: 2 wall rectangles synthesised/.test(e2.report || ''), JSON.stringify(e2));
  await open(path.join(dir, 'lines.dxf')); await pg.select('#dm-panel select[data-key="VIEW"]', 'ELEV'); await idle();
  await pg.evaluate(() => document.querySelector('#dm-yellows [data-act="defkeep"]').click()); await t.sleep(400);
  const y1b = await pg.evaluate(() => ({ rows: document.querySelectorAll('#dm-yellows .dm-pr').length, tol: window.DxfImportUI.state.prep['lines.dxf'].tol, kind: window.DxfImportUI.state.defaults[0].kind }));
  t.assert('Y1b one tick in "All defaults" keeps that value (tolerance stays 0.01) as the user\'s and removes just that row', y1b.rows === y1.rows - 1 && y1b.tol === 0.01 && y1b.kind === 'chosen', JSON.stringify(y1b));
  await pg.evaluate(() => document.querySelector('#dm-yellows [data-act="acceptall"]').click()); await t.sleep(900);
  const y2 = await pg.evaluate(() => ({ attn: window.DxfMetaEditor.state.attn, rows: document.querySelectorAll('#dm-yellows .dm-pr').length, marks: window.DxfMetaEditor.state.sheets[0].marks.map(m => m.key + ':' + m.source) }));
  t.assert('Y2 Accept all: nothing yellow left, suggestions written as `user` markings', y2.attn === 0 && y2.rows === 0 && y2.marks.filter(x => /:user$/.test(x)).length >= 1 && y2.marks.filter(x => !/:file$/.test(x)).every(x => /:user$/.test(x)), JSON.stringify(y2));
  await open(path.join(dir, 'raw.dxf'));
  t.assert('E3 a sheet that is not line work leaves state.defaults empty (no yellow noise)', (await pg.evaluate(() => window.DxfImportUI.state.defaults.length)) === 0);
});
