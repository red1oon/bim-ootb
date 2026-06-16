// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for ERP_CRITIC_UX_LANE.md P0 / J1 (THE FRONT DOOR) — W-CRITIC-FRONTDOOR.
//   PROVES (issue: "all 5 demo tenants must be PRESENT + enterable at login with NO install step; today a bare
//   seed auto-skips to a single tenant and the 5 demos are reachable only through the Install dialog"):
//     1. On a COLD boot (empty idb → 1 resident GardenWorld), login STEP 0 is rendered (not auto-skipped) and
//        carries 6 tenant rows: 1 resident + the 5 demo tenants (Odoo, iDempiere, SAP, Oracle, Dynamics).
//     2. The 5 demo tenants are present BY NAME, tagged demo·ready / demo·PoC, with NO Install dialog open
//        (#ep-overlay absent) — the "a demo all ready" first impression, zero install step.
//     3. Picking the Odoo demo row LAZY-INSTALLS its shard in-page (the same installShard the dialog drives):
//        §IDEMPIERE shard-in fires for 12-odoo.db, §CRITIC-FRONTDOOR install logs, and the flow lands on the
//        user list (step 1) scoped to Odoo — never an Install dialog, never a ?shard= URL.
//     4. CANONICAL SHARD: the merged Odoo(12) carries 38 C_BPartner (the full W-P4-MASTERS extraction), not the
//        stale 5-BP postcfg slim — proving the served shard is the lane's stated denominator.
//     5. 0 pageerrors.
//   §-log first — READ tests/poc_critic_frontdoor_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_critic_frontdoor_live.js   (cwd = bim-ootb/erp)
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

  await page.goto(`http://localhost:${port}/idempiere.html`, { waitUntil: 'networkidle' });
  // wait for the front door to fold: demo rows present
  await page.waitForSelector('#idmp-login-step0 .idmp-login-demo', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

  // (1)+(2) STEP 0 surfaced cold with 1 resident + 5 demo, NO install dialog
  const door = await page.evaluate(() => {
    const step0 = document.getElementById('idmp-login-step0');
    const visible = !!step0 && step0.style.display !== 'none';
    const rows = Array.from(document.querySelectorAll('#idmp-login-clients .idmp-login-user'));
    const demos = rows.filter(r => r.classList.contains('idmp-login-demo'));
    const resident = rows.filter(r => !r.classList.contains('idmp-login-demo'));
    const nameOf = r => { const n = r.querySelector('.nm'); return n ? n.textContent.trim() : ''; };
    return {
      visible, total: rows.length,
      residentNames: resident.map(nameOf),
      demoNames: demos.map(nameOf),
      demoTags: demos.map(r => { const t = r.querySelector('.tag'); return t ? t.textContent.trim() : ''; }),
      installDialog: !!document.getElementById('ep-overlay')
    };
  });
  ok('STEP 0 rendered cold (not auto-skipped)', door.visible, JSON.stringify({ total: door.total }));
  ok('1 resident tenant present (GardenWorld)', door.residentNames.length === 1 && /Garden/i.test(door.residentNames[0] || ''), JSON.stringify(door.residentNames));
  const want = ['Odoo', 'iDempiere', 'SAP', 'Oracle', 'Dynamics'];
  const haveAll = want.every(w => door.demoNames.some(n => n.toLowerCase().indexOf(w.toLowerCase()) >= 0));
  ok('all 5 demo tenants PRESENT by name', door.demoNames.length === 5 && haveAll, JSON.stringify(door.demoNames));
  ok('demo tenants tagged honestly (demo · ready / PoC)', door.demoTags.length === 5 && door.demoTags.every(t => /demo · (ready|PoC)/.test(t)), JSON.stringify(door.demoTags));
  ok('NO Install dialog open at the front door (#ep-overlay absent)', door.installDialog === false);

  // §-log proof of the front-door fold with install-dialog=N
  ok('§CRITIC-FRONTDOOR step0 logged install-dialog=N', logs.some(l => /§CRITIC-FRONTDOOR step0/.test(l) && /install-dialog=N/.test(l)),
     (logs.filter(l => /§CRITIC-FRONTDOOR step0/.test(l))[0] || '').slice(0, 160));

  // (3) PICK the Odoo demo row → lazy install → land on the Odoo user list (NO dialog)
  const clicked = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#idmp-login-clients .idmp-login-demo'));
    const odoo = rows.filter(r => { const n = r.querySelector('.nm'); return n && /^Odoo$/i.test(n.textContent.trim()); })[0];
    if (!odoo) return false; odoo.click(); return true;
  });
  ok('Odoo demo row is clickable', clicked === true);
  await page.waitForSelector('#idmp-login-step1:not([style*="display: none"])', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);

  const landed = await page.evaluate(() => {
    const s1 = document.getElementById('idmp-login-step1');
    const s1visible = !!s1 && s1.style.display !== 'none';
    const label = (document.getElementById('idmp-login-step1-label') || {}).textContent || '';
    const users = Array.from(document.querySelectorAll('#idmp-login-users .idmp-login-user')).map(r => { const n = r.querySelector('.nm'); return n ? n.textContent.trim() : ''; });
    const installDialog = !!document.getElementById('ep-overlay');
    let bp = -1;
    try { const r = window.__idmpDb.exec('SELECT COUNT(*) FROM C_BPartner WHERE AD_Client_ID=12'); bp = r.length ? r[0].values[0][0] : -1; } catch (e) {}
    let clients = []; try { const r = window.__idmpDb.exec('SELECT AD_Client_ID FROM AD_Client WHERE AD_Client_ID=12'); clients = r.length ? r[0].values.map(v => v[0]) : []; } catch (e) {}
    return { s1visible, label, users, installDialog, bp, odooResident: clients.length === 1 };
  });
  ok('lazy-installed Odoo in-page (§IDEMPIERE shard-in 12-odoo.db)', logs.some(l => /§IDEMPIERE shard-in 12-odoo.db/.test(l)),
     (logs.filter(l => /§IDEMPIERE shard-in/.test(l))[0] || '').slice(0, 140));
  ok('§CRITIC-FRONTDOOR install logged for the pick', logs.some(l => /§CRITIC-FRONTDOOR installed 12-odoo.db ok=true/.test(l)),
     (logs.filter(l => /§CRITIC-FRONTDOOR installed/.test(l))[0] || '').slice(0, 140));
  ok('landed on the user list (step 1) scoped to Odoo — NO Install dialog', landed.s1visible && /Odoo/i.test(landed.label) && landed.installDialog === false, JSON.stringify({ label: landed.label, users: landed.users, dialog: landed.installDialog }));
  ok('Odoo(12) now resident with the CANONICAL 38-BP shard (not the 5-BP slim)', landed.odooResident && landed.bp === 38, JSON.stringify({ resident: landed.odooResident, bpartners: landed.bp }));

  // (5) no page errors
  ok('0 pageerrors', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '');

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' W-CRITIC-FRONTDOOR-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); server.close(); process.exit(1); });
