#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-DASH-TWIN (spec prompts/CAPEX_DASHBOARD.md §5.61). READ THE LOG: verdict = §DASH_TWIN_W_VERDICT; a spread-less health tile or an empty store is INCONCLUSIVE, never PASS.
// ISSUE it proves/disproves: "the film's dashboard shows numbers the twin's own rows do not hold (or the seed's demo projects), or the chain drill changed the glance". Reads the page's SHIPPED §DASH_TILE log lines; expected values come from SQL on the same store.
// D1 total projects == TD projects == drop-down · D2 approved budget and actual cost == SUM by SQL · D3 open POs == non-completed POs by SQL · D4 health sums to the project count with more than one colour · D5 the project page Procurement tab shows the Supply chain card for the BRIDGE project (declared stage partpaid -> invoiced) · D6 no page error.
// DASHTWIN_BREAK=1 raises one project's PlannedAmt by 1000 in the SERVED copy only: D2 must FAIL. Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_dash_twin.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), initSqlJs = require('sql.js'), ROOT = path.join(__dirname, '..', '..'), SC_ = require(path.join(ROOT, 'capex/tools/td_scenario.js')), BREAK = process.env.DASHTWIN_BREAK === '1', log = console.log, TODAY = '2026-11-12';
let judged = 0, fails = 0, inc = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §DASH_TWIN_W ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const incon = (n, w) => { inc++; log('  §DASH_TWIN_W ' + n + ' INCONCLUSIVE ' + w); };
(async () => {
  const out = path.join(os.tmpdir(), 'dash_twin_' + process.pid + '.db'), { build } = require(path.join(ROOT, 'capex/tools/twin_mockchain.js')), _l = console.log, held = []; console.log = (...a) => held.push(a.join(' '));
  let r; try { r = await build({ today: TODAY, out }); } finally { console.log = _l; } held.filter(l => /TWIN_MOCK_BUILT|removed from the export/.test(l)).forEach(l => log(l.slice(0, 200)));
  if (r.errs.length) { ck('D0 the store was built', false, r.errs); return done(out); }
  const SQL = await initSqlJs(), db = new SQL.Database(fs.readFileSync(out)), q = (s, p) => { const x = db.exec(s, p || []); return x.length ? x[0].values.map(v => { const o = {}; x[0].columns.forEach((c, i) => { o[c] = v[i]; }); return o; }) : []; };
  const prj = q("select c_project_id as id, value as val, plannedamt as pa, projectbalanceamt as bal from c_project where value like 'TD\\_%' escape '\\' order by c_project_id"), n = prj.length, sumPA = prj.reduce((a, x) => a + Number(x.pa || 0), 0), sumBal = prj.reduce((a, x) => a + Number(x.bal || 0), 0);
  const open = q("select count(*) as n from c_order where issotrx='N' and docstatus not in ('CO','CL','VO','RE') and c_project_id in (select c_project_id from c_project where value like 'TD\\_%' escape '\\')")[0].n;
  let served = Buffer.from(db.export()); if (BREAK) { db.run('UPDATE c_project SET plannedamt = plannedamt + 1000 WHERE c_project_id=?', [prj[0].id]); served = Buffer.from(db.export()); log('§DASH_TWIN_W_BREAK +1000 on ' + prj[0].val + ' in the served copy'); }
  let pw = null; try { pw = require('/home/red1/bim-ootb/tests/node_modules/playwright'); } catch (e) { }
  if (!pw) { incon('D1', 'playwright missing'); return done(out); }
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
  const srv = http.createServer((rq, rs) => { const u = decodeURIComponent(rq.url.split('?')[0]); if (u === '/__twin.db') { rs.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return rs.end(served); }
    fs.readFile(path.join(ROOT, u), (e, b) => { if (e) { rs.writeHead(404); return rs.end('404'); } rs.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); rs.end(b); }); });
  await new Promise(r => srv.listen(0, r)); const br = await pw.chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), logs = [], errs = [];
  try {
    const pg = await (await br.newContext({ viewport: { width: 1500, height: 900 } })).newPage(); pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    const base = 'http://localhost:' + srv.address().port + '/capex/index.html?db=/__twin.db&today=' + TODAY; await pg.goto(base, { waitUntil: 'load' }); await pg.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 30000 }); await pg.waitForTimeout(600);
    const tile = k => { const l = logs.filter(x => x.indexOf('§DASH_TILE source=sqlite tile=' + k + ' ') === 0).slice(-1)[0]; return l ? l.split(' value=')[1] : null; }, money = v => (v || '').split(',').reduce((a, x) => a + Number((x.split(':')[1]) || 0), 0);
    const opts = await pg.$$eval('#fProject option, select[data-filter="project"] option, #project option', e => e.map(x => x.textContent.trim()).filter(Boolean));
    ck('D1 total_projects ' + tile('total_projects') + ' == the ' + n + ' TD projects of the store; the drop-down lists them (' + opts.filter(x => /^TD_/.test(x)).length + ') and no seed demo project', n === SC_.SC.length && Number(tile('total_projects')) === n && opts.filter(x => /^TD_/.test(x)).length === n && !opts.some(x => /Landscape|Standard|Hospital/.test(x)), { opts: opts.slice(0, 4) });
    ck('D2 approved_budget ' + money(tile('approved_budget')).toFixed(2) + ' == SUM(PlannedAmt) ' + sumPA.toFixed(2) + ' and actual_cost ' + money(tile('actual_cost')).toFixed(2) + ' == SUM(ProjectBalanceAmt) ' + sumBal.toFixed(2) + (BREAK ? ' (served copy +1000)' : ''), n > 0 && Math.abs(money(tile('approved_budget')) - sumPA) < 0.01 && Math.abs(money(tile('actual_cost')) - sumBal) < 0.01);
    const po = (tile('proc_openpo') || '').split(' / ')[0];
    ck('D3 proc_openpo ' + po + ' == the non-completed purchase orders of the TD projects by SQL (' + open + ')', Number(po) === Number(open) && open > 0);
    const hv = tile('health') || '', hs = {}; hv.split(' ').forEach(x => { const m = x.split('='); hs[m[0]] = Number(m[1]); }); const tot = Object.keys(hs).reduce((a, k) => a + hs[k], 0), colours = ['green', 'amber', 'red'].filter(k => hs[k] > 0).length;
    if (tot === n && colours < 2) incon('D4', 'health has no spread (' + hv + '): nothing for the film to show'); else ck('D4 health ' + hv + ' sums to ' + n + ' with ' + colours + ' colours', tot === n && colours >= 2);
    const bridge = prj.find(x => x.val === 'TD_BRIDGE');
    await pg.goto(base + '#project/' + bridge.id + '/procurement', { waitUntil: 'load' }); await pg.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 30000 }); await pg.waitForTimeout(500);
    const rows = await pg.$$eval('#view [data-chain] tr[data-order]', e => e.map(x => x.getAttribute('data-stage'))), strip = await pg.$$eval('#view [data-chain] [data-strip]', e => e.map(x => x.getAttribute('data-strip') + '=' + x.getAttribute('data-count')));
    ck('D5 the BRIDGE project page shows the Supply chain card: ' + JSON.stringify(rows) + ' strip ' + strip.join(','), rows.indexOf('invoiced') >= 0 && rows.indexOf('unfinished') >= 0 && strip.indexOf('invoiced=1') >= 0, { rows, strip });
    ck('D6 no page error', errs.length === 0, errs);
  } finally { await br.close(); srv.close(); }
  done(out);
  function done(o) { try { fs.unlinkSync(o); } catch (e) { } const v = fails ? 'FAIL' : (judged && !inc) ? 'PASS' : 'INCONCLUSIVE'; log('§DASH_TWIN_W_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1); }
})().catch(e => { console.error('§DASH_TWIN_W_ERROR ' + (e && e.stack || e)); process.exit(2); });
