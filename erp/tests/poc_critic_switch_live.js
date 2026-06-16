// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for ERP_CRITIC_UX_LANE.md P2 — FAN TO ALL 5 TENANTS (J2 ORIENT + J3 READ + J8
//   SWITCH). W-CRITIC-SWITCH. The CRITIC drives the SERVED bundle, once per tenant, with ONE lens code path —
//   only the data changes. The thesis under test: "the UI is a cheap, swappable lens over ONE owned model;
//   switching tenant repeats the lens, the data is unmistakably that tenant's, and nothing bleeds across."
//
//   ACT A — FAN (per tenant, fresh deep-link): enter the tenant via ?shard=<file>&login=<uid>&window=<wid>,
//     then assert, off the ACTUAL loaded sql.js db (truth, not the DOM's word):
//       J2 ORIENT  — the role-scoped menu is real (window leaves present); the window grid renders rows that ALL
//                    belong to THIS tenant's AD_Client_ID (or 0 = System). W-CRITIC-ORIENT.
//       GATING     — GardenWorld(11) physically co-resides in the merged db AND holds rows of the SAME table,
//                    yet ZERO of them appear in the grid (the AD_Client_ID scope is load-bearing). W-CRITIC-GATING.
//       J3 READ    — open the first row → the form opens on a real record of this tenant; its key field renders
//                    the db value (DocumentNo for a doc-complete tenant, Name for a master-only one). W-CRITIC-READ.
//     Doc-complete tenants (Odoo 12, iDempiere 13) read a SALES ORDER (window 143). The PoC tenants (SAP 14,
//     Oracle 15, Dynamics 16) are HONEST about thin doc cycles — they carry master data only, so they orient +
//     read a BUSINESS PARTNER (window 123); J4/J5/J6 stay ⛔ pending the build-side doc-cycle (P5).
//
//   ACT B — SWITCH IN ONE SESSION (J8, the killer gating proof): in a SINGLE page, install BOTH the Odoo and the
//     iDempiere shards, enter Odoo → read its order grid (all client 12), then SWITCH tenant via the login rail to
//     iDempiere → its order grid is ALL client 13, with ZERO of Odoo's client-12 orders (now physically in the
//     SAME db) and ZERO GardenWorld(11) bleed. Same window(143) code, two tenants, no cross-leak. W-CRITIC-SWITCH.
//
//   The critic's bar: "Could I sign into five different ERPs, orient + read each one's own documents this fast,
//   and switch between them with the SAME interface — and is each tenant's data unmistakably its own, never
//   another tenant's row leaking through?  A leak, an empty menu, or a 'not in seed' dead-end is a FAIL, logged."
//   §-log first — READ tests/poc_critic_switch_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_critic_switch_live.js   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

// The 5 tenants of erp_picker.js TENANT_SHARD. Doc-complete = read a Sales Order (143); master-only = read a
// Business Partner (123). login = the tenant admin's AD_User_ID (numeric → exact match in _tryAutoLogin).
const TENANTS = [
  { key:'odoo',      shard:'12-odoo.db',      client:12, login:'12000',   window:143, table:'C_Order',    pk:'C_Order_ID',    keyCol:'DocumentNo', docComplete:true,  label:'Odoo' },
  { key:'idempiere', shard:'13-idempiere.db', client:13, login:'1300101', window:143, table:'C_Order',    pk:'C_Order_ID',    keyCol:'DocumentNo', docComplete:true,  label:'iDempiere' },
  { key:'sap',       shard:'14-sap.db',       client:14, login:'14000',   window:123, table:'C_BPartner', pk:'C_BPartner_ID', keyCol:'Name',       docComplete:false, label:'SAP Flights' },
  { key:'oracle',    shard:'15-oracle.db',    client:15, login:'15000',   window:123, table:'C_BPartner', pk:'C_BPartner_ID', keyCol:'Name',       docComplete:false, label:'Oracle Scott' },
  { key:'dynamics',  shard:'16-dynamics.db',  client:16, login:'16000',   window:123, table:'C_BPartner', pk:'C_BPartner_ID', keyCol:'Name',       docComplete:false, label:'Dynamics Cronus' },
];

let pass = 0, fail = 0;
const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

async function gotoTenant(page, t, port) {
  const url = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=${t.shard}&login=${t.login}&window=${t.window}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  // login=<uid> auto-logs-in; window=<wid> opens the grid after login. Manual fallback if the deep link stalls.
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const okb = await page.$('#idmp-login-ok'); if (okb) await okb.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForTimeout(1100);
}

// Read the CURRENT grid against the loaded db: which client does each rendered row belong to, and does the
// co-resident GardenWorld(11) hold rows of the same table that did NOT appear?
async function probeGrid(page, t) {
  return page.evaluate((cfg) => {
    const ad = window.__idmpDb;
    const menuWins = document.querySelectorAll('#idmp-tree .idmp-row.leaf').length;
    const rows = Array.from(document.querySelectorAll('.idmp-grid tr[data-ad-record], .idmp-cards [data-ad-record]'));
    const recIds = rows.map(r => Number(r.getAttribute('data-ad-record'))).filter(n => !isNaN(n));
    const clientOf = id => { try { const r = ad.exec('SELECT AD_Client_ID FROM ' + cfg.table + ' WHERE ' + cfg.pk + '=' + id); return r.length ? r[0].values[0][0] : null; } catch (e) { return null; } };
    const keyOf = id => { try { const r = ad.exec('SELECT ' + cfg.keyCol + ' FROM ' + cfg.table + ' WHERE ' + cfg.pk + '=' + id); return r.length ? r[0].values[0][0] : null; } catch (e) { return null; } };
    const clients = recIds.map(clientOf);
    const keys = recIds.map(keyOf);
    let gwTotal = 0;
    try { gwTotal = ad.exec('SELECT COUNT(*) FROM ' + cfg.table + ' WHERE AD_Client_ID=11')[0].values[0][0]; } catch (e) {}
    const gwShown = clients.filter(c => c === 11).length;
    const foreignShown = clients.filter(c => c !== null && c !== 0 && c !== cfg.client).length;
    return { menuWins, n: recIds.length, clients, sampleKeys: keys.slice(0, 5).map(String),
      allMine: recIds.length > 0 && clients.every(c => c === cfg.client || c === 0),
      gwTotal, gwShown, foreignShown };
  }, t);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  // ───────────────────────────── ACT A — FAN TO ALL 5 ─────────────────────────────
  console.log('\n§CRITIC-SWITCH ===== ACT A : FAN — same lens, five tenants, only the data changes =====');
  for (const t of TENANTS) {
    const errs = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errs.push(e.message));
    await gotoTenant(page, t, port);
    const g = await probeGrid(page, t);
    console.log('§CRITIC-SWITCH[' + t.key + '] window=' + t.window + '(' + t.table + ') menuWins=' + g.menuWins
      + ' rows=' + g.n + ' allClient' + t.client + '=' + g.allMine + ' gwInDb=' + g.gwTotal + ' gwShown=' + g.gwShown
      + ' foreignShown=' + g.foreignShown + ' keys=[' + g.sampleKeys.join(',') + ']');

    // J2 ORIENT
    ok('[' + t.key + '] role-scoped menu is real (window leaves present)', g.menuWins > 0, 'leaves=' + g.menuWins);
    ok('[' + t.key + '] ' + t.table + ' grid renders THIS tenant\'s own rows (rows>0, every row AD_Client_ID=' + t.client + '/0)', g.n > 0 && g.allMine, 'rows=' + g.n);
    // GATING — load-bearing: GardenWorld co-resides and holds same-table rows, but 0 appear
    ok('[' + t.key + '] GATING: GardenWorld(11) holds ' + t.table + ' rows but ZERO bleed in', g.gwTotal > 0 && g.gwShown === 0, 'gwInDb=' + g.gwTotal + ' gwShown=' + g.gwShown);

    // J3 READ — open the first row → the form opens on a real record; its key field renders the db value.
    await page.evaluate(() => {
      const r = document.querySelector('.idmp-grid tr[data-ad-record]') || document.querySelector('.idmp-cards [data-ad-record]');
      if (r) r.click();
    });
    await page.waitForSelector('[data-ad-column]', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    const read = await page.evaluate((cfg) => {
      const ad = window.__idmpDb;
      const recEl = document.querySelector('[data-ad-column]');
      const holder = recEl ? recEl.closest('[data-ad-record]') : null;
      const recId = holder ? Number(holder.getAttribute('data-ad-record')) : null;
      function fieldText(col) {
        const f = document.querySelector('[data-ad-column="' + col + '"]'); if (!f) return null;
        const inp = f.querySelector('input,select,textarea');
        return (inp ? (inp.value != null ? inp.value : inp.textContent) : f.textContent).trim();
      }
      const uiVal = fieldText(cfg.keyCol);
      let dbVal = null, dbClient = null;
      if (recId != null) { try { const r = ad.exec('SELECT ' + cfg.keyCol + ', AD_Client_ID FROM ' + cfg.table + ' WHERE ' + cfg.pk + '=' + recId);
        if (r.length) { dbVal = r[0].values[0][0]; dbClient = r[0].values[0][1]; } } catch (e) {} }
      return { recId, uiVal, dbVal, dbClient, matches: dbVal != null && String(uiVal || '').indexOf(String(dbVal)) >= 0 };
    }, t);
    console.log('§CRITIC-SWITCH[' + t.key + '] READ recId=' + read.recId + ' ' + t.keyCol + 'Ui="' + read.uiVal + '" db="' + read.dbVal + '" recClient=' + read.dbClient);
    ok('[' + t.key + '] READ: form opened on a real client-' + t.client + ' record', read.recId != null && read.dbClient === t.client, 'recClient=' + read.dbClient);
    ok('[' + t.key + '] READ: ' + t.keyCol + ' renders the db value', read.matches, 'ui="' + read.uiVal + '" ⊇ "' + read.dbVal + '"');
    ok('[' + t.key + '] 0 pageerrors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  // ───────────────────────────── ACT B — IN-SESSION SWITCH (J8) ─────────────────────────────
  console.log('\n§CRITIC-SWITCH ===== ACT B : SWITCH in one session — Odoo → iDempiere, both co-resident, 0 leak =====');
  {
    const errs = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errs.push(e.message));
    // Enter Odoo via the deep link (the front-door demo pick is P0-proven; here we start signed-in on Odoo).
    const odoo = TENANTS[0], idmp = TENANTS[1];
    await gotoTenant(page, odoo, port);
    const gA = await probeGrid(page, odoo);
    console.log('§CRITIC-SWITCH[B/odoo] rows=' + gA.n + ' allClient12=' + gA.allMine + ' keys=[' + gA.sampleKeys.join(',') + ']');
    ok('[B] entered Odoo: order grid is all client 12', gA.n > 0 && gA.allMine, 'rows=' + gA.n);

    // Drive the rail: switch button → "‹ Tenants" → step0 now lists residents AND the demo manifest (the P2/J8
    // fix). iDempiere is not yet resident, so it lists as a DEMO row; picking it lazy-installs its shard
    // (_enterDemoTenant) and lands on its user list — the genuine "switch tenant from the rail" journey.
    await page.evaluate(() => { const b = document.getElementById('idmp-switch-btn'); if (b) b.click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const tb = document.getElementById('idmp-login-tenants-back'); if (tb) tb.click(); });
    await page.waitForTimeout(400);
    const railState = await page.evaluate(() => {
      const vis = id => { const e = document.getElementById(id); return e && e.style.display !== 'none'; };
      const rows = Array.from(document.querySelectorAll('#idmp-login-clients .idmp-login-user'))
        .map(r => (r.textContent || '').replace(/\s+/g, ' ').trim());
      return { step0: vis('idmp-login-step0'), loginOverlay: vis('idmp-login'), clientRows: rows };
    });
    console.log('§CRITIC-SWITCH[B] rail-state ' + JSON.stringify(railState));
    // pick the iDempiere row (demo or resident) → lazy-install + land on its user list
    const picked = await page.evaluate((cfg) => {
      const rows = Array.from(document.querySelectorAll('#idmp-login-clients .idmp-login-user'));
      const row = rows.find(r => ((r.querySelector('.nm') || {}).textContent || '').toLowerCase().indexOf('idempiere') >= 0
        || ((r.querySelector('.tag') || {}).textContent || '').indexOf('· ' + cfg.client) >= 0);
      if (row) { row.click(); return true; }
      return false;
    }, idmp);
    // _enterDemoTenant installs the shard (network + merge) then renders the user list — give it room.
    await page.waitForSelector('#idmp-login-users .idmp-login-user', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    // pick the tenant's first user, advance to the role step, log in
    await page.evaluate(() => {
      const u = document.querySelector('#idmp-login-users .idmp-login-user:not(.disabled)');
      if (u) u.click();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const okb = document.getElementById('idmp-login-ok'); if (okb && okb.offsetParent !== null) okb.click(); });
    await page.waitForSelector('#idmp-tree .idmp-row.leaf', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);
    // open the Sales Order window again — the SAME lens code path (window 143), now over iDempiere's data
    await page.evaluate(() => {
      const leaf = Array.from(document.querySelectorAll('#idmp-tree .idmp-row.leaf')).find(l => /sales order/i.test(l.textContent || ''));
      if (leaf) leaf.click();
    });
    await page.waitForTimeout(1000);
    console.log('§CRITIC-SWITCH[B] picked-iDempiere=' + picked);

    const gB = await probeGrid(page, idmp);
    // odoo(12) rows physically present now → the falsifier: do ANY appear in iDempiere's grid?
    const odooShown = gB.clients.filter(c => c === 12).length;
    console.log('§CRITIC-SWITCH[B/idempiere] rows=' + gB.n + ' allClient13=' + gB.allMine + ' odooShown=' + odooShown
      + ' gwShown=' + gB.gwShown + ' keys=[' + gB.sampleKeys.join(',') + ']');
    ok('[B] switched to iDempiere via the rail: order grid is all client 13', gB.n > 0 && gB.allMine, 'rows=' + gB.n);
    ok('[B] SWITCH GATING: Odoo(12) orders co-reside but ZERO appear in iDempiere\'s grid', odooShown === 0, 'odooShown=' + odooShown);
    ok('[B] SWITCH GATING: GardenWorld(11) ZERO bleed after switch', gB.gwShown === 0, 'gwShown=' + gB.gwShown);
    ok('[B] same lens, only data changed (window 143 rendered both)', gA.n > 0 && gB.n > 0);
    ok('[B] 0 pageerrors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  // ─────────────────────────── verdict ───────────────────────────
  const verdict = (fail === 0)
    ? 'CRITIC ✔ I signed into five migrated ERPs through ONE interface, oriented + read each tenant\'s own records, and switched between them with the SAME lens — every grid was unmistakably its own tenant\'s, with 0 cross-tenant bleed even when two tenants shared the db. The PoC tenants are honest: master data reads cleanly, their doc cycle is openly pending. I would pick this multi-tenant lens over standing up five separate ERP stacks.'
    : 'CRITIC ✘ a leg dead-ended — see the 🔴 above; NOT pickable over the incumbents until fixed.';
  console.log('\n§CRITIC-VERDICT(P2/J2-J3-J8) ' + verdict);
  console.log((fail === 0 ? '✅' : '❌') + ' W-CRITIC-SWITCH-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
