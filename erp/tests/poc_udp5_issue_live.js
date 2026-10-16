// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-UDP5-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-5). READ tests/poc_udp5_issue_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: (1) do selected error § lines and uncaught errors become AD_Issue rows like MIssue.create - but NOT spammy: a line repeated
//   in a session = 1 row, a non-error line = 0 rows, the same issue after a reload = a touch (no new row), 51 distinct issues = 50 rows
//   (cap)? (2) does the System Monitor show a runtime table over 500 rows in red with "OK to Housekeep", and does housekeeping delete the
//   rows older than 7 days while KEEPING Saved Parameters (a named AD_PInstance)? On origin/main nothing writes AD_Issue and the
//   monitor has no housekeeping panel (RED).
// Run: node tests/poc_udp5_issue_live.js 2>&1 | tee tests/poc_udp5_issue_live.log        (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.sql': 'text/plain' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let pass = 0, fail = 0;
const ok = (id, name, cond, detail) => { console.log((cond ? '  ✅ ' : '  ❌ ') + id + ' ' + name + (detail ? ' — ' + detail : '')); cond ? pass++ : fail++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const seed = (sql) => pg.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
  const url = 'http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US';
  const login = async () => {
    await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
    await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  };
  // rows as the twin holds them: seed + signed op-log tip, this client
  const tip = (t, pk) => pg.evaluate(([t, pk]) => new Promise(res => {
    const A = window.APP, base = (() => { try { const r = window.__idmpDb.exec('SELECT * FROM ' + t + ' WHERE ad_client_id=' + Number(A.clientId)); return r.length ? r[0].values.map(v => { const o = {}; r[0].columns.forEach((c, i) => o[c.toLowerCase()] = v[i]); return o; }) : []; } catch (e) { return []; } })();
    const c = window.__crud; if (!c || !c.withSidecar) { res(base); return; }
    c.withSidecar(sdb => res((sdb ? c.core.listTip(sdb, t, pk, base, null).rows : base).filter(r => r.ad_client_id == null || String(r.ad_client_id) === String(A.clientId))));
  }), [t, pk]);
  const issues = () => tip('ad_issue', 'ad_issue_id');
  const settle = async (n) => { for (let i = 0; i < 60; i++) { if (logs.filter(l => /^§UDP5-ISSUE /.test(l)).length >= n) break; await pg.waitForTimeout(250); } await pg.waitForTimeout(400); };
  await pg.goto(url, { waitUntil: 'networkidle' }); await login(); await pg.waitForTimeout(800);
  const i0 = await issues(), n0 = logs.filter(l => /^§UDP5-ISSUE /.test(l)).length;
  await pg.evaluate(() => { console.log('§TESTUDP5 error disk full op 17'); console.log('§TESTUDP5 error disk full op 18'); console.log('§TESTUDP5 error disk full op 19'); console.log('§TESTUDP5OK rows=3 failed=0'); });
  await pg.evaluate(() => { setTimeout(() => { throw new Error('boom udp5 witness'); }, 0); });
  await settle(n0 + 2);
  const i1 = await issues(), added = i1.filter(r => !i0.some(x => String(x.ad_issue_id) === String(r.ad_issue_id)));
  console.log('  added=' + JSON.stringify(added.map(r => ({ id: r.ad_issue_id, src: r.sourceclassname, sum: String(r.issuesummary).slice(0, 80), stack: !!r.stacktrace, rec: r.record_id, user: r.username, st: r.systemstatus }))));
  const disk = added.filter(r => r.sourceclassname === '§TESTUDP5'), boom = added.filter(r => r.sourceclassname === '§FIELD-ERROR' && /boom udp5/.test(r.issuesummary));
  ok('I1', 'a § error line logged 3 times (numbers differ) = ONE AD_Issue row; the counter line (failed=0) = none', disk.length === 1 && !added.some(r => r.sourceclassname === '§TESTUDP5OK'), added.length + ' added');
  ok('I2', 'an uncaught error = one row with its stack (MIssue: summary + StackTrace)', boom.length === 1 && !!boom[0].stacktrace, JSON.stringify(boom.map(r => String(r.stacktrace).slice(0, 60))));
  ok('I3', 'row shape: Record_ID 1, UserName "-" (no PII), SystemStatus E, LoggerName erp', disk.length === 1 && Number(disk[0].record_id) === 1 && disk[0].username === '-' && disk[0].systemstatus === 'E' && disk[0].loggername === 'erp');
  await pg.reload({ waitUntil: 'networkidle' }); await login(); await pg.waitForTimeout(800);
  const nR = logs.filter(l => /^§UDP5-ISSUE /.test(l)).length;
  await pg.evaluate(() => console.log('§TESTUDP5 error disk full op 42'));
  await settle(nR + 1);
  const i2 = await issues(), tl = logs.filter(l => /^§UDP5-ISSUE /.test(l)).pop() || '';
  ok('I4', 'the same issue after a reload = a touch of the existing row, no new row', i2.length === i1.length && /tag=§TESTUDP5 touch /.test(tl), tl + ' rows ' + i1.length + '->' + i2.length);
  const nC = logs.filter(l => /^§UDP5-ISSUE /.test(l)).length;
  for (let b = 0; b < 51; b += 10) { await pg.evaluate(b => { const L = 'abcdefghijklmnopqrstuvwxyz'; for (let k = b; k < Math.min(b + 10, 51); k++) console.log('§TESTCAP error case ' + L[k % 26] + L[Math.floor(k / 26)]); }, b); await settle(nC + Math.min(b + 10, 51)); }
  const i3 = await issues();
  ok('I5', '51 more distinct issues: the client holds at most 50 rows (cap, oldest deleted)', i3.length === 50, 'rows=' + i3.length);
  // housekeeping: 510 old AD_PInstance rows + 1 named old (Saved Parameters) + 5 recent, through the signed path
  const mk = await pg.evaluate(() => new Promise(res => {
    const A = window.APP, d = new Date(Date.now() - 30 * 864e5), p = n => ('0' + n).slice(-2), old = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' 10:00:00';
    const n = new Date(), now = n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate()) + ' ' + p(n.getHours()) + ':' + p(n.getMinutes()) + ':' + p(n.getSeconds());
    const op = f => ({ key: 'ad_pinstance', table: 'ad_pinstance', verb: 'create', op_uuid: null, op_type: 'CRUD_CREATE', fields: f, cas: null, stdDefaults: { actor: A.actor, clientId: A.clientId, orgId: 0 } });
    const ops = [];
    for (let k = 0; k < 510; k++) ops.push(op({ ad_process_id: 110, record_id: 0, ad_user_id: A.actor, created: old, updated: old }));
    ops.push(op({ ad_process_id: 110, record_id: 0, ad_user_id: A.actor, name: 'My saved run', created: old, updated: old }));
    for (let k = 0; k < 5; k++) ops.push(op({ ad_process_id: 110, record_id: 0, ad_user_id: A.actor, created: now, updated: now }));
    window.__crud.applyOpGroup(ops, cr => res(!!(cr && cr.committed)));
  }));
  const p0 = await tip('ad_pinstance', 'ad_pinstance_id');
  console.log('  seeded=' + mk + ' ad_pinstance rows=' + p0.length);
  await pg.evaluate(() => window.SystemMonitor.open());
  await pg.waitForSelector('#sm-hk tr[data-hk-table]', { timeout: 15000 }).catch(() => {});
  const red = await pg.evaluate(() => [...document.querySelectorAll('#sm-hk tr[data-hk-table]')].map(r => ({ t: r.getAttribute('data-hk-table'), rows: Number(r.getAttribute('data-hk-rows')), red: r.classList.contains('sm-hk-red'), btn: !!r.querySelector('[data-hk-go]') })));
  console.log('  panel=' + JSON.stringify(red));
  const pr = red.find(r => r.t === 'ad_pinstance');
  ok('H1', 'System Monitor: ad_pinstance over 500 rows glows red with "OK to Housekeep"; tables under 500 do not', pr && pr.red && pr.btn && pr.rows === p0.length && red.filter(r => r.rows <= 500).every(r => !r.red && !r.btn), JSON.stringify(pr));
  if (pr && pr.btn) { await pg.click('#sm-hk [data-hk-go="ad_pinstance"]'); for (let i = 0; i < 80; i++) { if (logs.some(l => /^§UDP5-HK run table=ad_pinstance /.test(l))) break; await pg.waitForTimeout(250); } await pg.waitForTimeout(800); }
  const hk = logs.filter(l => /^§UDP5-HK run table=ad_pinstance /.test(l)).pop() || '';
  const p1 = await tip('ad_pinstance', 'ad_pinstance_id');
  const named = p1.filter(r => r.name === 'My saved run'), oldLeft = p1.filter(r => r.name !== 'My saved run' && String(r.updated) < (() => { const d = new Date(Date.now() - 7 * 864e5), p = n => ('0' + n).slice(-2); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })());
  ok('H2', 'housekeeping deletes every row older than 7 days, keeps the recent ones and the named Saved Parameters row', hk && oldLeft.length === 0 && named.length === 1 && p1.length >= 6, hk + ' after=' + p1.length + ' named=' + named.length + ' oldLeft=' + oldLeft.length);
  const after = await pg.evaluate(() => { const r = document.querySelector('#sm-hk tr[data-hk-table="ad_pinstance"]'); return r ? { rows: Number(r.getAttribute('data-hk-rows')), red: r.classList.contains('sm-hk-red') } : null; });
  ok('H3', 'the panel re-reads: ad_pinstance no longer red', after && !after.red && after.rows === p1.length, JSON.stringify(after));
  const pageIssues = {}; logs.filter(l => /^§UDP5-ISSUE /.test(l)).forEach(l => { const t = (l.match(/tag=(\S+)/) || [])[1]; pageIssues[t] = (pageIssues[t] || 0) + 1; });
  console.log('§UDP5L-PAGE-ISSUES ' + JSON.stringify(pageIssues));
  const real = errs.filter(e => !/ResizeObserver|boom udp5 witness/.test(e));
  ok('H4', 'no page errors (besides the deliberate one)', real.length === 0, real.slice(0, 3).join(' | '));
  console.log('§UDP5L-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§UDP5L-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
