#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-EDIT-REPORT (bim-compiler prompts/MODELLER_MASTER.md §EDIT-REPORT, row 41). READ THE §-LOG after every run.
 * Real Open, real toolbar, real mouse, numbers only. Each claim names the issue it proves or disproves:
 *   W0  pure: a table without its NOT-checked line, a refused check reading as a zero, a population change hidden behind a delta
 *   R1  the span row can be wrong: Before/After against a recount here from the walker's own lattice and the rule table, not through GridSpanGate
 *   R2  the report and the gate can disagree: the overlap row against a brute-force recount, every new pair against what the gate flagged
 *   R3  the report does not follow undo: Ctrl+Z and Ctrl+Y recounts against Before and After; the panel must not outlive its numbers
 *   R4  the report is not deterministic: the same edit from two fresh Opens must give byte-identical JSON
 *   R5  a NO-OP reads as a pass: a click on a gridline must report nothing and log NO-OP
 *   R6  a VACUOUS check reads as zero: a refused span rule must print "not judged" and no number
 *   R7  the report changes the model: exactly one op, the chain still verifies
 *   R8  the panel prints something else: DOM against the JSON, the banned words, overlap with the toolbar
 *   R9  a real drag: the same report from the real mouse path
 *   R10 the case this feature exists for: SampleHouse gx1 +1 m drives walls through wall 22
 *   R12 no proposer declined because the count rose without saying what the limit is (§13.4): the row names the limit and the bay, against a recount
 * Falsifier: EDIT_REPORT_BREAK=1 (the after-tally reuses the before) must turn this RED.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const SW = require('../str_walker.js'), GS = require('../grid_span_gate.js'), SG = require('../sdg_gate.js'), ER = require('../edit_report.js');
const BREAK = process.env.EDIT_REPORT_BREAK === '1';
const L = (m) => console.log('§W-EDIT-REPORT ' + m);
const row = (r, id) => r.rows.filter(x => x.id === id)[0] || {};
const nrow = (r, id) => r.newRows.filter(x => x.id === id)[0] || {};

// An independent recount: the walker's own datums and the rule table. Deliberately NOT GridSpanGate.fold/check.
function recountSpans(base0, mat, depth, moves) {
  const lines = { x: base0.grid.xLines.slice(), y: base0.grid.yLines.slice() }, R = SW.SW_SPAN_RULES[mat], out = { RED: 0, ORANGE: 0, GREEN: 0, n: 0 };
  moves.forEach(m => { lines[m.axis][m.index] += m.delta; });
  base0.girders.forEach(g => {
    const ax = g.axis === 'Xline@' ? 'y' : 'x', i = base0.grid[ax + 'Lines'].indexOf(g.fromDatum), j = base0.grid[ax + 'Lines'].indexOf(g.toDatum);
    const s = Math.abs(lines[ax][j] - lines[ax][i]); out.n++;
    if (s > R.maxBeamSpan) out.RED++; else if (depth < s / R.depthRatio - 1e-9) out.ORANGE++; else out.GREEN++;
  });
  return out;
}
function bruteOver(boxes, moved, relatedKeys, tol) {
  const pen = (a, b) => { let m = Infinity; for (let k = 0; k < 3; k++) m = Math.min(m, Math.min(a[2 * k + 1], b[2 * k + 1]) - Math.max(a[2 * k], b[2 * k])); return m > 0 ? m : 0; };
  const seen = new Set(), pairs = [];
  new Set(moved).forEach(m => { if (!boxes[m]) return; Object.keys(boxes).forEach(o => { o = +o; if (o === m) return; const a = Math.min(m, o), b = Math.max(m, o), k = a + '|' + b; if (seen.has(k)) return; seen.add(k); if (relatedKeys.has(k)) return; if (pen(boxes[m], boxes[o]) > tol) pairs.push(k); }); });
  return pairs;
}
async function openGarage(t) {
  await t.open('HospitalGarage', {});
  for (let i = 0; i < 60 && !t.slog.some(l => /§STRWALK-OL §GEO-SERVED HospitalGarage/.test(l)); i++) await t.sleep(500);
  await t.sleep(5000);
  await t.clickSel('#b-gridmove'); await t.sleep(600);
  await t.pg.evaluate((b) => { window.__editReportKeepBoxes = true; if (b) window.__editReportBreak = true; }, BREAK);
}
const stretch = (t, id, d) => t.pg.evaluate(async (a, b) => { await window.__gridStretch(a, b); return window.__lastEditReport; }, id, d);
const relKeys = (t, moved, boxes) => t.pg.evaluate((mv) => { const r = window.__gateRel(), out = [], b = window.__editReportBoxes.after, ks = Object.keys(b).map(Number); mv.forEach(m => ks.forEach(o => { if (o !== m && r.related(m, o)) out.push(Math.min(m, o) + '|' + Math.max(m, o)); })); return out; }, moved);

(async () => {
  let sampleA = null, sampleB = null, fails = 0;
  const run = async (name, body) => { const r = await runE2E(name, body, { noExit: true }); fails += r.fail; };
  await run('W-EDIT-REPORT', async (t) => {
    // ---- W0 pure ----
    let refused = false; try { ER.compose({ change: {}, notChecked: [] }); } catch (e) { refused = /NOT-checked/.test(e.message); }
    t.assert('W0a no NOT-checked list, no report', refused);
    const p0 = ER.compose({ change: {}, overlap: { refused: 'x', tolMm: 20 }, span: { refused: 'material unknown' }, gate: null, notChecked: ['a'] });
    t.assert('W0b a refused check has no number, and says why', p0.rows.every(r => r.state === 'NOT_JUDGED' && r.before === null && r.after === null && r.delta === null && r.note) && p0.newRows.every(r => r.count === null));
    const p1 = ER.compose({ change: {}, overlap: { tolMm: 20, before: { count: 1, moved: 3, against: 9, pairs: [] }, after: { count: 2, moved: 4, against: 9, pairs: [] } },
      span: { before: { RED: 1, ORANGE: 0, pieces: 5 }, after: { RED: 0, ORANGE: 0, pieces: 10 } }, gate: { red: [{ kind: 'brand-new-kind' }], orange: [] }, notChecked: ['a'] });
    t.assert('W0c different populations give INCONCLUSIVE and no delta', p1.rows.every(r => r.state === 'INCONCLUSIVE' && r.delta === null));
    t.assert('W0d a kind the composer has not heard of is still counted', p1.newRows.some(r => r.id === 'brand-new-kind' && r.count === 1 && r.level === 'red'));
    const p2 = ER.compose({ change: {}, overlap: { tolMm: 20, before: { count: 0, moved: 0, against: 9, pairs: [] }, after: { count: 0, moved: 0, against: 9, pairs: [] } }, gate: { red: [], orange: [] }, notChecked: ['a'] });
    t.assert('W0g nothing moved: "not judged", never a clean 0', row(p2, 'overlap').state === 'NOT_JUDGED' && row(p2, 'overlap').before === null && p2.newRows.every(n => n.state === 'NOT_JUDGED' && n.count === null));
    const hb = { 1: [0, 1, 0, 1, 0, 1], 2: [0.5, 1.5, 0, 1, 0, 1], 3: [0.99, 2, 0, 1, 0, 1], 4: [5, 6, 5, 6, 5, 6] };
    const hp = SG.pairsOver(hb, [1], { related: (a, b) => a + b === 4 });
    t.assert('W0e pairsOver by hand: 1-2 over, 1-3 related and left out, 4 clear; population stated', hp.count === 1 && hp.pairs[0].a === 1 && hp.pairs[0].b === 2 && hp.moved === 1 && hp.against === 4, JSON.stringify(hp));
    t.assert('W0f the unknown-material tally is null, never zeros', GS.tally({ base0: { grid: { xLines: [0, 1], yLines: [0, 1] }, walked: [], girders: [] } }, [], 0, 'WOOD', 0.5) === null);

    const hBays = (o) => ({ RED: 0, ORANGE: 0, pieces: 2, limit: 12, bays: o });
    const p3 = ER.compose({ change: {}, span: { before: hBays({ 'gx0-gx1': { span: 10, signal: 'GREEN' }, 'gx1-gx2': { span: 20, signal: 'RED' }, 'gx2-gx3': { span: 30, signal: 'RED' } }), after: hBays({ 'gx0-gx1': { span: 13, signal: 'RED' }, 'gx1-gx2': { span: 21, signal: 'RED' }, 'gx2-gx3': { span: 30, signal: 'RED' } }), material: 'RC' }, gate: null, notChecked: ['a'] });
    const c3 = row(p3, 'span_red').over_limit_changed;
    t.assert('W0h the row names only over-limit bays whose span changed, newly over first', row(p3, 'span_red').limit === 12 && row(p3, 'span_red').material === 'RC' && c3.length === 2 && c3[0].bay === 'gx0-gx1' && c3[0].newly_over && c3[1].bay === 'gx1-gx2' && !c3[1].newly_over, JSON.stringify(c3));
    t.assert('W0i a refused span has no limit and no bay', p0.rows.every(r => r.limit === undefined && r.over_limit_changed === undefined));

    await openGarage(t);
    const pg = t.pg;
    const info = await pg.evaluate(() => { const i = window.swbGateInfo(); return { base0: { grid: { xLines: i.base0.grid.xLines, yLines: i.base0.grid.yLines }, girders: i.base0.girders.map(g => ({ axis: g.axis, fromDatum: g.fromDatum, toDatum: g.toDatum })) }, depth: i.section.depth }; });
    const ops0 = await t.oplog();

    // ---- R1 span ----
    const D = 1.5, r1 = await stretch(t, 'gy8', D);
    sampleA = JSON.stringify(r1);
    L('report ' + sampleA);
    t.assert('R1z a report exists and the edit was a real grid move', !!r1 && r1.change.grid === 'gy8' && Math.abs(r1.change.delta - D) < 1e-9);
    const rb = recountSpans(info.base0, 'RC', info.depth, []), ra = recountSpans(info.base0, 'RC', info.depth, [{ axis: 'y', index: 8, delta: D }]);
    const sr = row(r1, 'span_red'), so = row(r1, 'span_orange');
    L('recount before=' + JSON.stringify(rb) + ' after=' + JSON.stringify(ra));
    t.assert('R1a span row Before = recount', sr.state === 'JUDGED' && sr.before === rb.RED && so.before === rb.ORANGE, JSON.stringify([sr.before, so.before]));
    t.assert('R1b span row After = recount', sr.after === ra.RED && so.after === ra.ORANGE, JSON.stringify([sr.after, so.after]));
    t.assert('R1c not vacuous: this edit really moved the count (recount says ' + (ra.ORANGE - rb.ORANGE) + ' more ORANGE)', ra.ORANGE !== rb.ORANGE);
    t.assert('R1d Before is not zero where the building is already over: baseline red is shown', sr.before === rb.RED && rb.RED > 0, 'RED before=' + rb.RED);

    // ---- R2 overlap and gate ----
    const bx = await pg.evaluate(() => window.__editReportBoxes), rk = new Set(await relKeys(t, bx.moved));
    const pb = bruteOver(bx.before, bx.moved, rk, SG.CLASH_TOL), pa = bruteOver(bx.after, bx.moved, rk, SG.CLASH_TOL), ov = row(r1, 'overlap');
    L('overlap moved=' + bx.moved.length + ' brute before=' + pb.length + ' after=' + pa.length + ' row=' + JSON.stringify(ov));
    t.assert('R2a overlap row = brute-force recount, both sides', ov.state === 'JUDGED' && ov.before === pb.length && ov.after === pa.length);
    t.assert('R2b not vacuous: real elements were judged', new Set(bx.moved).size > 0 && Object.keys(bx.after).length > 100, 'moved=' + new Set(bx.moved).size);
    const gate = await pg.evaluate(() => window.__lastGateDetail);
    const sumNew = r1.newRows.reduce((s, n) => s + n.count, 0);
    t.assert('R2c the new-rows total = what the gate flagged', sumNew === gate.red.length + gate.orange.length, sumNew + ' vs ' + (gate.red.length + gate.orange.length));
    const flagged = new Set(gate.red.filter(x => x.kind === 'clash').map(x => Math.min(x.a, x.b) + '|' + Math.max(x.a, x.b)));
    const unexplained = r1.newPairs.filter(p => { const k = p.a + '|' + p.b; if (flagged.has(k)) return false; const b0 = bx.before[p.a], b1 = bx.before[p.b]; return !(p.depth <= SG.penetration(b0, b1) + SG.CLASH_TOL); });
    t.assert('R2d every new pair is one the gate flagged, or one that crossed the tolerance by less than the tolerance', unexplained.length === 0, JSON.stringify(unexplained.slice(0, 3)));

    // ---- R7 model untouched ----
    const ops1 = await t.oplog();
    t.assert('R7 the edit is exactly one op and the chain verifies', ops1.len === ops0.len + 1 && await t.verifyChain(), ops0.len + '->' + ops1.len);

    // ---- R8 panel ----
    const dom = await pg.evaluate(() => {
      const el = document.getElementById('edit-report'); if (!el) return null;
      const cells = {}; el.querySelectorAll('tr[data-row]').forEach(tr => { cells[tr.dataset.row] = Array.from(tr.children).map(c => c.textContent); });
      const news = {}; el.querySelectorAll('.er-new').forEach(d => { news[d.dataset.row] = d.querySelector('b').textContent; });
      const btn = el.querySelector('.er-nc'), before = el.querySelector('ul').style.display; btn.click();
      const list = Array.from(el.querySelectorAll('ul li')).map(li => li.textContent), after = el.querySelector('ul').style.display;
      const rc = el.getBoundingClientRect(), hit = (s) => Array.from(document.querySelectorAll(s)).filter(q => { const r = q.getBoundingClientRect(); return r.width && getComputedStyle(q).visibility !== 'hidden' && r.left < rc.right && r.right > rc.left && r.top < rc.bottom && r.bottom > rc.top; }).map(q => q.id || q.tagName);
      return { display: getComputedStyle(el).display, cells, news, btn: btn.textContent, before, after, list, text: el.textContent, rect: [rc.left, rc.top, rc.right, rc.bottom], vw: innerWidth, vh: innerHeight, hits: hit('#bar button, #stat, #hist, #dim-row, #title, #ins-panel') };
    });
    t.assert('R8a panel is showing', !!dom && dom.display === 'block');
    t.assert('R8b every row in the panel = the JSON', r1.rows.every(r => r.state !== 'JUDGED' || (dom.cells[r.id][1] === String(r.before) && dom.cells[r.id][2] === String(r.after))), JSON.stringify(dom.cells));
    t.assert('R8c every new row in the panel = the JSON', r1.newRows.every(n => dom.news[n.id] === String(n.count)), JSON.stringify(dom.news));
    t.assert('R8d NOT checked: a count, closed, opening to the full list from the generated table', dom.btn.indexOf(r1.notChecked.length + ' items') >= 0 && dom.before === 'none' && dom.after === 'block' && dom.list.join('|') === r1.notChecked.join('|') && r1.notChecked.length > 0, dom.btn);
    t.assert('R8e the wording never claims an all-clear', !/\b(safe|safety|compliant|certified|all clear|passed)\b/i.test(dom.text), dom.text.slice(0, 200));
    t.assert('R8f the preliminary note is printed with the span rows', dom.text.indexOf(GS.PRELIM) >= 0);
    t.assert('R8g the panel sits in the window and covers no tool', dom.rect[0] >= 0 && dom.rect[1] >= 0 && dom.rect[2] <= dom.vw && dom.rect[3] <= dom.vh && dom.hits.length === 0, JSON.stringify({ rect: dom.rect, hits: dom.hits }));
    await t.shot('panel');
    const panel2 = await pg.evaluate(() => { const c = document.getElementById('edit-report').querySelector('.er-nc'); c.click(); const h = document.getElementById('edit-report').getBoundingClientRect().height; c.click(); return h; });
    L('panel height closed=' + panel2);

    // ---- R3 undo / redo ----
    await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await t.sleep(1500);
    const un = await pg.evaluate(() => ({ c: window.__editReportRecount(), disp: getComputedStyle(document.getElementById('edit-report')).display }));
    t.assert('R3a Ctrl+Z: span recount = Before', un.c.span && un.c.span.RED === sr.before && un.c.span.ORANGE === so.before, JSON.stringify(un.c.span));
    t.assert('R3b Ctrl+Z: overlap recount = Before', un.c.overlap === ov.before, un.c.overlap + ' vs ' + ov.before);
    t.assert('R3c Ctrl+Z: the panel does not outlive its numbers', un.disp === 'none' && t.slog.some(l => /§EDIT_REPORT stale/.test(l)));
    await pg.keyboard.down('Control'); await pg.keyboard.press('y'); await pg.keyboard.up('Control'); await t.sleep(1500);
    const re = await pg.evaluate(() => window.__editReportRecount());
    t.assert('R3d Ctrl+Y: recount = After', re.span && re.span.RED === sr.after && re.span.ORANGE === so.after && re.overlap === ov.after, JSON.stringify(re.span) + ' overlap=' + re.overlap);
    await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await t.sleep(1500);

    // ---- R5 NO-OP + R9 real mouse ----
    if (!(await pg.evaluate(() => !!window.__dg() || (window.Bonsai.gridspan && document.getElementById('b-gridmove') && document.getElementById('b-gridmove').classList.contains('active'))))) { await t.clickSel('#b-gridmove'); await t.sleep(600); }
    const setup = await pg.evaluate((J) => { const G = window.Bonsai.grid; const cx = (G.xs[0] + G.xs[G.xs.length - 1]) / 2, cy = (G.ys[0] + G.ys[G.ys.length - 1]) / 2; window.__e2e.overhead(cx, cy, G.z + 215); return { z: G.z, xm: (G.xs[6] + G.xs[7]) / 2, y0: G.ys[J] }; }, 8);
    await t.sleep(500);
    const P = (x, y) => pg.evaluate((a, b, c) => window.__e2e.proj(a, b, c), x, y, setup.z);
    const down = await P(setup.xm, setup.y0);
    const reports = () => t.slog.filter(l => /§EDIT_REPORT \{/.test(l)).length, n0 = reports(), o0 = await t.oplog();
    await pg.mouse.move(down[0], down[1]); await t.sleep(80); await pg.mouse.down(); await t.sleep(120); await pg.mouse.up(); await t.sleep(800);
    const o1 = await t.oplog();
    t.assert('R5 a click on a gridline: logged NO-OP, no report, no op', t.slog.some(l => /§EDIT_REPORT NO-OP/.test(l)) && reports() === n0 && o1.len === o0.len, 'reports ' + n0 + '->' + reports() + ' ops ' + o0.len + '->' + o1.len);
    const armed = await pg.evaluate(() => document.getElementById('b-gridmove').classList.contains('active'));
    if (!armed) { await t.clickSel('#b-gridmove'); await t.sleep(600); }
    await pg.mouse.move(down[0], down[1]); await t.sleep(80); await pg.mouse.down(); await t.sleep(80);
    for (let d = 0.2; d <= 1.2001; d += 0.2) { const q = await P(setup.xm, setup.y0 + d); await pg.mouse.move(q[0], q[1], { steps: 2 }); await t.sleep(60); }
    const dragged = await pg.evaluate(() => window.__dg() && window.__dg().delta);
    await pg.mouse.up(); await t.sleep(3000);
    const rm = await pg.evaluate(() => window.__lastEditReport), rma = recountSpans(info.base0, 'RC', info.depth, [{ axis: 'y', index: 8, delta: rm.change.delta }]);
    L('real drag delta=' + dragged + ' report=' + JSON.stringify(rm.rows));
    L('real drag recomposed=' + rm.change.recomposed + ' overlap=' + row(rm, 'overlap').state);
    t.assert('R9c real drag: the overlap row is judged only if something moved', rm.change.recomposed + rm.change.riders > 0 ? row(rm, 'overlap').state === 'JUDGED' : row(rm, 'overlap').state === 'NOT_JUDGED', 'recomposed=' + rm.change.recomposed);
    t.assert('R9a a real mouse drag reports once, for the delta the drag reached', reports() === n0 + 1 && Math.abs(rm.change.delta - dragged) < 1e-6 && rm.change.grid === 'gy8', 'delta=' + rm.change.delta);
    t.assert('R9b real drag: span row = recount', row(rm, 'span_red').after === rma.RED && row(rm, 'span_orange').after === rma.ORANGE && row(rm, 'span_orange').before === rb.ORANGE);

    // ---- R6 refusal, on the real path ----
    const r6 = await pg.evaluate(async () => { window.__gsgBreakRule = true; try { await window.__gridStretch('gy8', 0.3); } finally { window.__gsgBreakRule = false; } return window.__lastEditReport; });
    t.assert('R6 span rule refused: "not judged", the reason, no number', r6.change.delta === 0.3 && row(r6, 'span_red').state === 'NOT_JUDGED' && row(r6, 'span_red').before === null && /no span rule/.test(row(r6, 'span_red').note), JSON.stringify(row(r6, 'span_red')));
    const cost = t.slog.filter(l => /§EDIT_REPORT_COST/.test(l)).pop();
    L('cost ' + cost);
    t.assert('R11 the cost is logged', !!cost);
  });

  await run('W-EDIT-REPORT-LIMIT', async (t) => {
    await openGarage(t);
    const xl = await t.pg.evaluate(() => { const i = window.swbGateInfo(); return i.base0.grid.xLines.slice(); });
    const r = await stretch(t, 'gx6', 1.817), sr = row(r, 'span_red'), hit = (sr.over_limit_changed || []).filter(b => b.bay === 'gx5-gx6')[0];
    L('limit ' + JSON.stringify({ limit: sr.limit, material: sr.material, list: sr.over_limit_changed, total: sr.over_limit_changed_total }));
    t.assert('R12a the row names the limit, the material and the bay put over it', sr.limit === SW.SW_SPAN_RULES.RC.maxBeamSpan && sr.material === 'RC' && !!hit && hit.newly_over === true, JSON.stringify(hit));
    t.assert('R12b the bay\'s numbers = the walker\'s own lines', hit && Math.abs(hit.before - (xl[6] - xl[5])) < 1e-3 && Math.abs(hit.after - (xl[6] + 1.817 - xl[5])) < 1e-3 && hit.after > sr.limit, JSON.stringify([xl[5], xl[6]]));
    const txt = await t.pg.evaluate(() => document.querySelector('#edit-report tr[data-row="span_red_limit"]').textContent);
    t.assert('R12c the panel prints the same', txt.indexOf('Limit 12 m, RC') >= 0 && txt.indexOf('gx5-gx6') >= 0 && txt.indexOf(hit.after.toFixed(2)) >= 0, txt.slice(0, 120));
  });
  await run('W-EDIT-REPORT-NONEWBAY', async (t) => {
    await openGarage(t);
    const r = await stretch(t, 'gy8', 1.5), sr = row(r, 'span_red');
    t.assert('R12d a move that puts no bay over the limit names no new bay', sr.delta === 0 && (sr.over_limit_changed || []).every(b => !b.newly_over), JSON.stringify(sr.over_limit_changed));
  });

  await run('W-EDIT-REPORT-FRESH', async (t) => {
    await openGarage(t);
    sampleB = JSON.stringify(await stretch(t, 'gy8', 1.5));
    t.assert('R4 the same edit from a fresh Open: byte-identical JSON', !!sampleA && sampleA === sampleB, sampleA === sampleB ? 'bytes=' + sampleB.length : 'A=' + sampleA + ' B=' + sampleB);
  });

  await run('W-EDIT-REPORT-SAMPLEHOUSE', async (t) => {
    await t.open('SampleHouse'); await t.sleep(1500);
    await t.pg.evaluate(() => { window.__editReportKeepBoxes = true; });
    const r = await stretch(t, 'gx1', 1);
    L('samplehouse ' + JSON.stringify(r));
    const bx = await t.pg.evaluate(() => window.__editReportBoxes), rk = new Set(await relKeys(t, bx.moved));
    const pb = bruteOver(bx.before, bx.moved, rk, SG.CLASH_TOL), pa = bruteOver(bx.after, bx.moved, rk, SG.CLASH_TOL);
    t.assert('R10a the walls driven through wall 22 are in the report', nrow(r, 'abuts-clash').count === 2, 'abuts-clash=' + nrow(r, 'abuts-clash').count);
    t.assert('R10b overlap row = brute-force recount on this building too', row(r, 'overlap').before === pb.length && row(r, 'overlap').after === pa.length, pb.length + '->' + pa.length);
    t.assert('R10c a grid with no walked girders: spans "not judged", never zero', row(r, 'span_red').state === 'NOT_JUDGED' && row(r, 'span_orange').before === null, row(r, 'span_red').note);
    const txt = await t.pg.evaluate(() => document.getElementById('edit-report').textContent);
    t.assert('R10d the panel says "Not judged", with the reason', /Not judged: /.test(txt));
    await t.shot('panel-samplehouse');
  });
  console.log('§WITNESS_EDIT_REPORT fail=' + fails + ' verdict=' + (fails ? 'FAIL' : 'PASS'));
  process.exit(fails ? 1 : 0);
})();
