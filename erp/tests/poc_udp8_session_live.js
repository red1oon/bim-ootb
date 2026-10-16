// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-UDP8-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-8). READ tests/poc_udp8_session_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: does each login leave an AD_Session row the way legacy does (AdempiereWebUI :317 -> MSession :194-210: the login's role,
//   LoginDate = today, a WebSession id, ServerName, Processed='N') and does log-out close it (MSession.logout :314-320 Processed='Y'),
//   persisted (signed op-log) across a reload? Remote_Addr / Remote_Host have no browser-side value and stay NULL (named in the spec).
//   On origin/main nothing writes AD_Session (RED).
// Run: node tests/poc_udp8_session_live.js 2>&1 | tee tests/poc_udp8_session_live.log        (cwd = bim-ootb/erp)
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
  const url = 'http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US';
  const login = async () => {
    await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
    await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
    if (await pg.locator("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))").isVisible().catch(() => false)) { await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); }
    await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  };
  const waitLog = async (re, from) => { for (let i = 0; i < 60; i++) { const l = logs.slice(from).find(x => re.test(x)); if (l) return l; await pg.waitForTimeout(250); } return null; };
  const sessions = () => pg.evaluate(() => new Promise(res => {
    const base = (() => { try { const r = window.__idmpDb.exec('SELECT * FROM ad_session'); return r.length ? r[0].values.map(v => { const o = {}; r[0].columns.forEach((c, i) => o[c.toLowerCase()] = v[i]); return o; }) : []; } catch (e) { return []; } })();
    const c = window.__crud; c.withSidecar(sdb => res((sdb ? c.core.listTip(sdb, 'ad_session', 'ad_session_id', base, null).rows : base)
      .filter(r => Number(r.ad_session_id) < 0).map(r => ({ id: r.ad_session_id, by: r.createdby, role: r.ad_role_id, client: r.ad_client_id, org: r.ad_org_id, date: r.logindate, ws: r.websession, server: r.servername, processed: r.processed, addr: r.remote_addr }))));
  }));
  await pg.goto(url, { waitUntil: 'networkidle' });
  let from = logs.length; await login();
  const o1 = await waitLog(/§UDP8-SESSION open/, from); await pg.waitForTimeout(500);
  const s1 = await sessions(), today = new Date(); const ymd = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const a = s1[s1.length - 1] || {};
  ok('S1', 'a login writes ONE AD_Session row: GardenAdmin, its role, the tenant, LoginDate today, a WebSession id, ServerName, Processed=N', s1.length === 1 && /committed=true/.test(o1 || '') && String(a.by) === '101' && String(a.role) === '102' && String(a.client) === '11' && String(a.date).slice(0, 10) === ymd && !!a.ws && !!a.server && a.processed === 'N' && a.addr == null, (o1 || 'no §UDP8-SESSION line') + ' ' + JSON.stringify(a));
  from = logs.length; await pg.click('#idmp-switch-btn'); const c1 = await waitLog(/§UDP8-SESSION close/, from); await pg.waitForTimeout(500);
  const s2 = await sessions();
  ok('S2', 'log-out closes that session (MSession.logout: Processed=Y)', /committed=true/.test(c1 || '') && s2.length === 1 && s2[0].processed === 'Y', (c1 || 'no close line') + ' ' + JSON.stringify(s2));
  from = logs.length; await login(); await waitLog(/§UDP8-SESSION open/, from); await pg.waitForTimeout(500);
  const s3 = await sessions();
  ok('S3', 'logging in again writes a NEW session row with its own WebSession', s3.length === 2 && s3.filter(x => x.processed === 'N').length === 1 && s3[0].ws !== s3[1].ws, JSON.stringify(s3));
  await pg.reload({ waitUntil: 'networkidle' }); from = logs.length; await login(); await waitLog(/§UDP8-SESSION open/, from); await pg.waitForTimeout(500);
  const s4 = await sessions();
  ok('S4', 'after a reload + login the earlier sessions are still there (signed op-log) and a third is open', s4.length === 3, JSON.stringify(s4.map(x => x.processed)));
  const real = errs.filter(e => !/ResizeObserver/.test(e));
  ok('S5', 'no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  console.log('§UDP8L-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§UDP8L-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
