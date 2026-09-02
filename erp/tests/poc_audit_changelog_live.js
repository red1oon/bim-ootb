// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser WIRING §-witness for ERP_AUDIT_CHANGELOG.md (Tasks 0/2 + iDempiere-convention polish).
//   VALUE verification is headless (scripts/poc_audit_changelog.js 25/25) — this proves only that the LIVE
//   page wires the parts: (1) user_names.js loaded → window.UserNames present; (2) Task 0 actor wire fires at
//   login (§ACTOR with the real AD_User id); (3) engine v6 loaded → window.__crud.fmtTs formats an epoch-ms ts
//   to iDempiere 'yyyy-MM-dd HH:mm:ss'; (4) UserNames resolves a REAL AD_User_ID → its real Name live (NON-INVENT);
//   (5) the change-log gate condition (AD_Table.IsChangeLog='Y') holds for a real doc table (C_Order) so the
//   '🕒 Log' affordance would appear. 0 pageerrors.
//   §-log first — READ tests/poc_audit_changelog_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_audit_changelog_live.js   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/idempiere.html?client=garden`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

  // (1) user_names.js loaded
  const hasUserNames = await page.evaluate(() => !!(window.UserNames && typeof window.UserNames.resolveSender === 'function'));
  ok('user_names.js loaded (window.UserNames.resolveSender)', hasUserNames);

  // Commit a client: pick a user WITH roles, then Log In (drives applySession → §ACTOR + _buildUserNameMap)
  await page.evaluate(() => {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#idmp-login-users .idmp-login-user'));
    var r = rows.find(x => !x.classList.contains('disabled')); if (r) r.click();
  });
  await page.waitForTimeout(400);
  await page.click('#idmp-login-ok');
  await page.waitForTimeout(1200);

  // (2) Task 0 actor wire — §ACTOR fired with a real user id, and window.APP.actor matches
  const actorLog = [...logs].reverse().find(l => l.startsWith('§ACTOR')) || '(none)';
  const appActor = await page.evaluate(() => (window.APP && window.APP.actor != null) ? window.APP.actor : null);
  console.log('§ACTOR-LIVE ' + actorLog + ' | window.APP.actor=' + appActor);
  ok('Task 0: §ACTOR fired at login + window.APP.actor set', /§ACTOR login user=\d+/.test(actorLog) && appActor != null);

  // (3) engine v6 — __crud.fmtTs formats epoch-ms to iDempiere convention
  const fmt = await page.evaluate(() => (window.__crud && window.__crud.fmtTs) ? window.__crud.fmtTs(1700000000000) : null);
  console.log('§FMT-LIVE __crud.fmtTs(1700000000000)=' + fmt);
  ok('engine v6: __crud.fmtTs → yyyy-MM-dd HH:mm:ss', typeof fmt === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fmt));

  // (4) UserNames resolves a REAL AD_User_ID → real Name live (NON-INVENT)
  const nameRes = await page.evaluate(() => {
    try {
      var db = window.__idmpDb; if (!db) return null;
      var r = db.exec('SELECT AD_User_ID, Name FROM AD_User');
      var rows = (r.length && r[0].values.length) ? r[0].values.map(function (v) { return { AD_User_ID: v[0], Name: v[1] }; }) : [];
      if (!rows.length) return null;
      var realId = rows[0].AD_User_ID, realName = rows[0].Name;
      var res = window.UserNames.resolveSender(realId, rows);
      return { id: realId, expect: realName, got: res && res.name, resolved: res && res.resolved };
    } catch (e) { return { err: e.message }; }
  });
  console.log('§NAME-LIVE ' + JSON.stringify(nameRes));
  ok('UserNames resolves real AD_User_ID → real Name (resolved=true)', !!(nameRes && nameRes.resolved && nameRes.got === nameRes.expect));

  // (5) change-log gate — a real doc table is IsChangeLog='Y' (so '🕒 Log' would appear)
  const gate = await page.evaluate(() => {
    try {
      var db = window.__idmpDb;
      var r = db.exec("SELECT IsChangeLog FROM AD_Table WHERE UPPER(TableName)='C_ORDER' LIMIT 1");
      return r.length && r[0].values.length ? String(r[0].values[0][0]) : null;
    } catch (e) { return 'err:' + e.message; }
  });
  console.log('§GATE-LIVE C_Order IsChangeLog=' + gate);
  ok("change-log gate: C_Order IsChangeLog='Y'", gate === 'Y');

  // (6) no page errors
  ok('0 pageerrors', errs.length === 0, errs.length ? errs.join(' | ') : '');

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' W-AUDIT-CHANGELOG-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
