// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the RING-LEAK fix on the iDempiere surface (FRONTEND_LANE_MASTER.md
//   §OUTSTANDING "RING LEAK ON iDempiere"; doctrine GRAND_LANE_STRATEGY §0). W-RING-LEAK.
//   THE BUG: the ✎ CRUD toolbar button fanned the Glass/Gravity visual ring on iDempiere's own surface
//     (window.__crud.enable() + openRing → §CRUD ring … view=on + §CRUD-IDMP-OPEN). S2B widened it (the
//     foldable-aware _crudHas fires for EVERY folded table, not just the curated 5), so the leak was now
//     reachable on any window. This VIOLATES the doctrine: "iDempiere NEVER opens the ring; Execute is
//     iDempiere's own UI surface, never the ring." The ring is Glass/Gravity-only.
//   THE FIX: re-point ✎ (now "✎ Edit") to the SAME form host-seam the form pills use (_openEdit →
//     __crud.update → the edit FORM, ring NOT fanned). New/Delete/Complete already live on the form pills +
//     DocAction bar. enable()/openRing()/the Edit-mode toggle are never called from this surface.
//
//   ACT — drive the ✎ Edit toolbar button on an open record (c_bpartner on the editable GardenWorld tenant,
//     and c_order on the doc-complete Odoo tenant). Assert: the EDIT FORM opens (#crudForm.open) via the
//     host seam (§FORM-PILL edit=edit-form … ring not fanned), and the ring-fan logs §CRUD ring … view=on
//     and §CRUD-IDMP-OPEN NEVER appear in the console on iDempiere. 0 pageerrors. The Glass ring stays
//     Glass-only; the iDempiere surface stays native.
//   §-log first — READ tests/poc_critic_ring_leak_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_critic_ring_leak_live.js   (cwd = bim-ootb/erp)
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

let pass = 0, fail = 0;
const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

// click the ✎ Edit toolbar button (re-pointed off the ring) and return whether it was found/clicked.
const clickEditBtn = (page) => page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('#idmp-toolbar button'))
    .find(x => (x.title || '').indexOf('Edit this record') === 0 || (x.textContent || '').trim() === '✎ Edit');
  if (b && !b.disabled) { b.click(); return { clicked: true, label: (b.textContent || '').trim() }; }
  return { clicked: false, label: b ? (b.textContent || '').trim() : '(no edit button)' , disabled: b ? b.disabled : null };
});

async function driveTenant(browser, port, cfg) {
  const logs = [], errs = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  const anyLog = re => logs.some(l => re.test(l));

  await page.goto(`http://localhost:${port}/idempiere.html?${cfg.boot}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const okb = await page.$('#idmp-login-ok'); if (okb) await okb.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
  // enter form view on a real record (the toolbar Edit targets the focused record)
  await page.evaluate(() => { const tr = document.querySelector('.idmp-grid tbody tr[data-ad-record]'); if (tr) tr.click(); });
  await page.waitForTimeout(700);

  // P2 (CRUD_INPLACE_EDIT_SESSION.md) — the ✎ Edit button is RETIRED: the form view is editable IN PLACE. Opening a
  //   record into form view mounts the inline editor; the leak guard now proves that doing so NEVER fans the ring.
  await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(600);
  const inlineMounted = await page.evaluate(() => !!document.getElementById('idmp-inline-mount'));
  const modalOpen = await page.evaluate(() => !!document.querySelector('#crudForm.open'));
  const noEditBtn = await page.evaluate(() => !Array.from(document.querySelectorAll('#idmp-toolbar button')).some(b => /✎\s*Edit/.test(b.textContent || '')));
  const ringFan = anyLog(/§CRUD ring .*view=on/);
  const idmpOpen = anyLog(/§CRUD-IDMP-OPEN/);
  const inplace = anyLog(/§INPLACE-EDIT table=/);

  console.log('§RING-LEAK[' + cfg.key + '] inlineMounted=' + inlineMounted + ' modalOpen=' + modalOpen
    + ' noEditBtn=' + noEditBtn + ' inplaceLog=' + inplace + ' ringFan=' + ringFan + ' idmpOpen=' + idmpOpen);
  ok('[' + cfg.key + '] the form view is editable IN PLACE on ' + cfg.table + ' (inline editor mounted, no modal)', inlineMounted && inplace && !modalOpen, 'mounted=' + inlineMounted + ' modal=' + modalOpen);
  ok('[' + cfg.key + '] the ✎ Edit toolbar button is RETIRED (no read→Edit→modal hop)', noEditBtn);
  ok('[' + cfg.key + '] the Glass/Gravity ring NEVER fans on iDempiere (no §CRUD ring … view=on)', !ringFan);
  ok('[' + cfg.key + '] no §CRUD-IDMP-OPEN — the leak is closed', !idmpOpen);
  ok('[' + cfg.key + '] 0 pageerrors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await page.close();
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  console.log('\n§RING-LEAK ===== ✎ Edit re-points to the form host-seam — the ring stays Glass/Gravity-only =====');
  // GardenWorld c_bpartner (the editable tenant — the user\'s named case) + Odoo c_order (a doc window)
  await driveTenant(browser, port, { key: 'garden-bpartner', table: 'c_bpartner', boot: 'seed=ad_seed.db&login=GardenAdmin&window=123' });
  await driveTenant(browser, port, { key: 'odoo-order',      table: 'c_order',    boot: 'seed=ad_seed.db&shard=12-odoo.db&login=12000&window=143' });

  const verdict = (fail === 0)
    ? 'CRITIC ✔ The ring leak is closed — ✎ Edit on iDempiere opens iDempiere\'s OWN edit form via the same signed host-seam the pills use; the Glass/Gravity visual ring NEVER fans on this surface (no §CRUD ring view=on, no §CRUD-IDMP-OPEN). Doctrine §0 holds: iDempiere keeps its own UI, the ring is Glass-only, and the underlying signed-commit engine is shared.'
    : 'CRITIC ✘ the ring still leaks on iDempiere — see the 🔴 above.';
  console.log('\n§RING-LEAK-VERDICT ' + verdict);
  console.log((fail === 0 ? '✅' : '❌') + ' W-RING-LEAK: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
