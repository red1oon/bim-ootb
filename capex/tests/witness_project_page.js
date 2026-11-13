#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-PROJECT-PAGE (spec prompts/CAPEX_DASHBOARD.md §5.54). READ THE LOG: verdict = §PROJECT_PAGE_VERDICT; the exit code alone is not evidence.
// ISSUE it proves/disproves: "a drill ends at a row and jumps to an ERP window; the project's own story (why amber) is not on the page, or the page draws something its rows do not say". P1-P9 are in the spec. PP_BREAK=1 flips one drawn bar's status: P2 must FAIL.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_project_page.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const ROOT = path.join(__dirname, '..', '..'), T = require('./pa_harness.js'), BREAK = process.env.PP_BREAK === '1', log = console.log;
(async () => { await require('./pa_harness.js').init({ quiet: true });   // §5.75 step 3: the numbers come from the PA rows (pa_harness.js), not the hand formulas in tiles.js
const SNAPS = [['pilot', path.join(ROOT, 'capex/sample/pilot_snapshot.json'), '2026-11-04'], ['order', path.join(process.env.HOME, '.cache/capex_film/seq_2026-11-11/data/legacy_all.json'), '2026-11-11']];
let judged = 0, fails = 0, inc = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §PROJECT_PAGE ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const incon = (n, w) => { inc++; log('  §PROJECT_PAGE ' + n + ' INCONCLUSIVE ' + w); };
const dn = x => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10)) / 864e5, near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.006;
// independent recompute of a project's phases from the raw rows (no tiles.js code)
function indep(s, id, today) { const tn = dn(today); return (s.phases || []).filter(p => String(p.C_Project_ID) === String(id)).map(p => { const end = p.EndDate ? p.EndDate.slice(0, 10) : null, st0 = p.StartDate ? p.StartDate.slice(0, 10) : null, c = p.IsComplete === 'Y'; let st = c ? 'complete' : (end && end < today) ? 'overdue' : (st0 && end && st0 <= today && today <= end) ? 'inprogress' : 'tocome'; return { name: p.Name, status: st, late: st === 'overdue' ? Math.round(tn - dn(end)) : 0, planned: Number(p.PlannedAmt) || 0, committed: Number(p.CommittedAmt) || 0, due: end && end <= today ? Number(p.PlannedAmt) || 0 : 0, done: c ? Number(p.PlannedAmt) || 0 : 0 }; }); }
// P1 node: every project of both snapshots
let p1n = 0; const p1bad = [];
for (const [nm, f, today] of SNAPS) { if (!fs.existsSync(f)) { incon('P1 ' + nm, 'snapshot missing ' + f); continue; } const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const p of s.projects) { const d = T.projectDetail(s, { today }, p.C_Project_ID), ex = indep(s, p.C_Project_ID, today); p1n++;
    if (!d) { p1bad.push(nm + ':' + p.Value + ' no detail'); continue; }
    if (d.phases.length !== ex.length) p1bad.push(nm + ':' + p.Value + ' phases ' + d.phases.length + '/' + ex.length);
    ex.forEach((e) => { const g = d.phases.find(q => q.name === e.name); if (!g || g.status !== e.status || g.lateDays !== e.late || !near(g.planned, e.planned) || !near(g.committed, e.committed)) p1bad.push(nm + ':' + p.Value + ' phase ' + e.name + ' ' + JSON.stringify([g && g.status, e.status])); });
    const due = ex.reduce((a, e) => a + e.due, 0), done = ex.reduce((a, e) => a + e.done, 0); if (!near(d.money.due, due) || !near(d.money.done, done)) p1bad.push(nm + ':' + p.Value + ' due/done'); } }
ck('P1 projectDetail == an independent recompute (phase status, late days, planned, committed, due, done) for ' + p1n + ' projects of two snapshots', p1n > 5 && !p1bad.length, p1bad.slice(0, 3));
// P5/P6 node fixtures
const fx = { projects: [{ C_Project_ID: 1, Value: 'A', Name: 'A', IsActive: 'Y', Processed: 'N', C_Currency_ID: 100, PlannedAmt: '1000', ProjectBalanceAmt: '0' }, { C_Project_ID: 2, Value: 'B', Name: 'B', IsActive: 'Y', Processed: 'N', C_Currency_ID: 100, PlannedAmt: '500', ProjectBalanceAmt: '0' }],
  phases: [{ C_ProjectPhase_ID: 11, C_Project_ID: 1, Name: 'Late one', StartDate: '2026-01-01', EndDate: '2026-02-01', IsComplete: 'N', PlannedAmt: '100', CommittedAmt: '0', SeqNo: 1 }, { C_ProjectPhase_ID: 21, C_Project_ID: 2, Name: 'Fine', StartDate: '2026-01-01', EndDate: '2026-12-01', IsComplete: 'N', PlannedAmt: '100', CommittedAmt: '0', SeqNo: 1 }],
  bimdocs: [{ BIM_Document_ID: 1, C_Project_ID: 1, DeliverableNo: 'A-101', Revision: 1, DocStatus: 'RE', IsActive: 'Y', Name: 'Plan' }, { BIM_Document_ID: 2, C_Project_ID: 1, DeliverableNo: 'A-101', Revision: 2, DocStatus: 'CO', IsActive: 'Y', Name: 'Plan B' }, { BIM_Document_ID: 3, C_Project_ID: 1, DeliverableNo: 'C-301', Revision: 1, DocStatus: 'DR', IsActive: 'Y', Name: 'Elev' }, { BIM_Document_ID: 4, C_Project_ID: 2, DeliverableNo: 'Z-1', Revision: 1, DocStatus: 'CO', IsActive: 'Y' }],
  orders: [{ C_Order_ID: 1, C_Project_ID: 1, GrandTotal: '50', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'DR' }, { C_Order_ID: 2, C_Project_ID: 1, GrandTotal: '70', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' }, { C_Order_ID: 3, C_Project_ID: 1, GrandTotal: '9', C_Currency_ID: 100, IsSOTrx: 'Y', DocStatus: 'CO' }], tasks: [], lines: [], phaseRef: [], wf: [], currencies: [], unavailable: [] };
const dA = T.projectDetail(fx, { today: '2026-06-01' }, 1), dB = T.projectDetail(fx, { today: '2026-06-01' }, 2), noOrd = T.projectDetail(Object.assign({}, fx, { orders: null, bimdocs: null, unavailable: ['orders', 'bimdocs'] }), { today: '2026-06-01' }, 1);
ck('P5 documents: latest revision per deliverable (A-101 rev 2 CO, C-301 DR) -> 2 deliverables, 1 issued; another project\'s document stays out; absent module -> null (not installed)', dA.docs && dA.docs.total === 2 && dA.docs.issued === 1 && dA.docs.rows.find(r => r.no === 'A-101').rev === 2 && noOrd.docs === null, dA.docs && JSON.stringify(dA.docs.rows.map(r => r.no + ' r' + r.rev + ' ' + r.status)));
ck('P4a orders: only this project\'s purchase orders (a sales order is not one), the draft is open; absent entity -> null (not installed), never an empty list', dA.orders && dA.orders.rows.length === 2 && dA.orders.open === 1 && noOrd.orders === null, dA.orders && JSON.stringify(dA.orders.rows.map(r => r.id + ' ' + r.status + (r.open ? ' open' : ''))));
ck('P6 statements: A (a phase ended 2026-02-01, not complete) says overdue and names it; B (nothing overdue) has no overdue statement', dA.why.some(w => w.kind === 'overdue' && w.src.phase === 'Late one' && /Late one is overdue/.test(w.text)) && !dB.why.some(w => w.kind === 'overdue'), { A: dA.why.map(w => w.kind), B: dB.why.map(w => w.kind) });
// the page
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
(async () => {
  const orderFile = SNAPS[1][1]; if (!fs.existsSync(orderFile)) { incon('P2-P9', 'order snapshot missing'); return fin(); }
  const snap = JSON.parse(fs.readFileSync(orderFile, 'utf8')), BA = snap.projects.find(p => p.Value === 'BUILDING_A').C_Project_ID; snap.unavailable = (snap.unavailable || []).filter(u => u !== 'orders' && u !== 'bimdocs');
  // §5.75 step 4: this snapshot was taken before the page read PA rows; a page without them shows "no data" on every moved tile, so the browser is served the same rows the node side is lent (pa_harness.js)
  if (!(snap.pacalc || []).length) { snap.pacalc = T.rows(); snap.unavailable = snap.unavailable.filter(u => u !== 'pacalc'); log('§PROJECT_PAGE_DATA the order snapshot holds no PA_MeasureCalc rows: lent ' + snap.pacalc.length + ' (the pilot rows of the sample)'); }
  snap.orders = (snap.orders || []).concat([{ C_Order_ID: 9001, C_Project_ID: BA, GrandTotal: 500, C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'DR' }]);
  snap.bimdocs = [{ BIM_Document_ID: 1, C_Project_ID: BA, DeliverableNo: 'A-101', Revision: 1, DocStatus: 'RE', IsActive: 'Y', Name: 'Plan' }, { BIM_Document_ID: 2, C_Project_ID: BA, DeliverableNo: 'A-101', Revision: 2, DocStatus: 'CO', IsActive: 'Y', Name: 'Plan B' }, { BIM_Document_ID: 3, C_Project_ID: BA, DeliverableNo: 'C-301', Revision: 1, DocStatus: 'DR', IsActive: 'Y', Name: 'Elev' }];
  const want = T.projectDetail(snap, { today: '2026-11-11' }, BA);
  const server = http.createServer((q, r) => { const u = q.url.split('?')[0]; if (u.endsWith('/__snap.json')) { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(JSON.stringify(snap)); } fs.readFile(path.join(ROOT, decodeURIComponent(u)), (e, b) => { if (e) { r.writeHead(404); return r.end('404'); } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise(r => server.listen(0, r));
  const br = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), errs = [], base = 'http://localhost:' + server.address().port + '/capex/index.html?snapshot=__snap.json&source=legacy&today=2026-11-11';
  try {
    const cx = await br.newContext({ viewport: { width: 1500, height: 844 } }), p = await cx.newPage(); p.on('pageerror', e => errs.push(String(e)));
    await p.goto(base + '#project/' + BA + '/overview', { waitUntil: 'load' }); await p.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 30000 }); await p.waitForTimeout(500);
    const tabs = await p.$$eval('#view [role=tab]', e => e.map(x => x.getAttribute('data-tab')));
    ck('P2a the page opens at #project/<id> with the five tabs (' + tabs.join(', ') + ')', tabs.join() === 'overview,schedule,cost,procurement,documents', tabs);
    const chips = await p.$$eval('#view .pchip', e => e.map(x => x.getAttribute('data-kind') + '=' + x.textContent.trim().toLowerCase()));
    ck('P2b header chips carry the buckets as words (' + chips.join(' ') + ')', chips.some(c => c.indexOf('health=amber') === 0) && chips.some(c => /^schedule=delayed/.test(c)) && chips.some(c => /^budget=.*within/.test(c)), chips);
    const go = async t => { await p.evaluate(h => { location.hash = h; }, '#project/' + BA + '/' + t); await p.waitForTimeout(350); };
    const ov = await p.$$eval('#view [data-pp]', e => Object.fromEntries(e.map(x => [x.getAttribute('data-pp'), x.getAttribute('data-value')])));
    ck('P2c overview numbers == projectDetail (planned, spent, due, done)', near(ov.planned, want.money.planned) && near(ov.spent, want.money.spent) && near(ov.due, want.money.due) && near(ov.done, want.money.done), { ov, want: want.money });
    const why = await p.$$eval('#view [data-panel=overview] .why li', e => e.map(x => x.textContent.trim()));
    ck('P6b the page prints exactly the statements projectDetail made (' + want.why.length + ')', why.length === want.why.length && want.why.every((w, i) => why[i] === w.text), { why: why.slice(0, 2) });
    await go('schedule');
    if (BREAK) await p.evaluate(() => { const b = document.querySelector('#view .pbar'); if (b) b.setAttribute('data-status', b.getAttribute('data-status') === 'complete' ? 'overdue' : 'complete'); });
    const bars = await p.$$eval('#view [data-panel=schedule] .pbar', e => e.map(x => [x.getAttribute('data-phase'), x.getAttribute('data-status'), x.getAttribute('data-late')])), trs = await p.$$eval('#phTable tbody tr', e => e.length);
    if (!want.phases.length) incon('P2d', 'no phases'); else ck('P2d Schedule: ' + bars.length + ' bars == the phases with the right status and late days, the table lists the same ' + trs, bars.length === want.phases.length && trs === want.phases.length && want.phases.every((ph, i) => bars[i] && bars[i][0] === ph.name && bars[i][1] === ph.status && Number(bars[i][2]) === ph.lateDays), bars.filter((b, i) => !want.phases[i] || b[1] !== want.phases[i].status).slice(0, 2));
    await go('cost');
    const cr = await p.$$eval('#costTable tbody tr[data-phase]', e => e.map(x => [x.getAttribute('data-phase'), Number(x.getAttribute('data-planned')), Number(x.getAttribute('data-committed'))])), tot = await p.$eval('#costTable tr.total', e => [Number(e.getAttribute('data-planned')), Number(e.getAttribute('data-committed'))]);
    ck('P3 Cost: ' + cr.length + ' phase rows == the phase planned/committed; the totals row == the sums (' + want.totals.phasePlanned.toFixed(2) + ')', cr.length === want.phases.length && want.phases.every((ph, i) => cr[i][0] === ph.name && near(cr[i][1], ph.planned) && near(cr[i][2], ph.committed)) && near(tot[0], want.totals.phasePlanned) && near(tot[1], want.totals.phaseCommitted), { tot });
    await go('procurement');
    const po = await p.$$eval('#poTable tbody tr[data-order]', e => e.map(x => [x.getAttribute('data-order'), x.getAttribute('data-open')]));
    ck('P4 Procurement: the project\'s ' + want.orders.rows.length + ' purchase orders (1 open) and nothing else', po.length === want.orders.rows.length && want.orders.rows.every(r => po.some(q => q[0] === String(r.id) && (q[1] === '1') === r.open)), po);
    await go('documents');
    const dc = await p.$$eval('#docTable tbody tr[data-deliverable]', e => e.map(x => [x.getAttribute('data-deliverable'), x.getAttribute('data-rev'), x.getAttribute('data-status')])), sm = await p.$eval('#view [data-panel=documents] .docsum', e => e.getAttribute('data-issued') + '/' + e.getAttribute('data-total'));
    ck('P5b Documents on the page: latest revision per deliverable (' + dc.map(d => d.join(' ')).join('; ') + '), issued/total ' + sm, dc.length === 2 && dc.some(d => d[0] === 'A-101' && d[1] === '2' && d[2] === 'CO') && sm === '1/2', dc);
    // P7 overflow on every tab at both widths
    const ov7 = [];
    for (const w of [1500, 390]) { await p.setViewportSize({ width: w, height: 844 }); for (const t of tabs) { await go(t); const o = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); if (o[0] > o[1] + 1) ov7.push(w + ' ' + t + ' ' + o.join('>')); } }
    ck('P7 no horizontal overflow on any of the 5 tabs at 1500 and 390 px', ov7.length === 0, ov7.slice(0, 3)); await p.setViewportSize({ width: 1500, height: 844 });
    // P8 keyboard and back
    await go('overview'); await p.focus('#view [role=tab][aria-selected=true]'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250);
    const t1 = await p.$eval('#view [role=tab][aria-selected=true]', e => e.getAttribute('data-tab')); await p.keyboard.press('End'); await p.waitForTimeout(200); const t2 = await p.$eval('#view [role=tab][aria-selected=true]', e => e.getAttribute('data-tab'));
    await p.click('#pBack'); await p.waitForTimeout(400); const back = await p.evaluate(() => [location.hash, !!document.querySelector('#view [data-theme]') || !!document.querySelector('#view .card')]);
    ck('P8 ArrowRight -> ' + t1 + ', End -> ' + t2 + ', "‹ Dashboard" returns (' + back[0] + ')', t1 === 'schedule' && t2 === 'documents' && !/project/.test(back[0]) && back[1], { t1, t2, back });
    // P9 the drill panel's project code opens the page; the ERP link is the source system's record
    await p.goto(base, { waitUntil: 'load' }); await p.waitForFunction(() => window.__capex && window.__capex.rendered); await p.evaluate(() => document.querySelector('#view [data-drill="approved_budget"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await p.waitForTimeout(300);
    const lk = await p.$$eval('#drill tbody tr', e => e.map(x => [x.getAttribute('data-project'), (x.querySelector('a.open') || {}).getAttribute && x.querySelector('a.open').getAttribute('href'), (x.querySelector('a.erp') || {}).getAttribute && x.querySelector('a.erp') && x.querySelector('a.erp').getAttribute('href')]));
    ck('P9 each drill row: the code opens #project/<id>, a second link opens that record in the source system (' + lk.length + ' rows)', lk.length > 0 && lk.every(l => l[1] === '#project/' + l[0] && new RegExp('Action=Zoom&TableName=C_Project&Record_ID=' + l[0] + '$').test(l[2] || '')), lk.slice(0, 2));
    ck('P10 no page error', errs.length === 0, errs.slice(0, 2));
  } catch (e) { ck('P run', false, String(e).slice(0, 260)); }
  await br.close(); server.close(); fin();
})();
function fin() { const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§PROJECT_PAGE_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1); }

})().catch(function (e) { console.log('§PA_HARNESS_CRASH ' + (e && e.stack || e)); process.exit(1); });