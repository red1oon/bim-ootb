// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for REFRESOLVE_SPEC.md W-REFRESOLVE (USER_JOURNEY_LANE punch-list #1).
//   Proves the LIVE idempiere.html (ad_ref_table now sliced into the seed + fmt() widened + resolveFK rewritten
//   to the AD reference chain) renders reference values as HUMAN LABELS, not raw FK ids / List codes — across the
//   Sales Order grid AND form. EXTRACT, never invent: every label traces to ad_ref_table / ad_ref_list / the FK row.
//   §-log first — READ tests/poc_refresolve_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_refresolve_live.js   (cwd = erp)
'use strict';
const os = require('os');
const { chromium } = require(process.env.PW || (os.homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html'; fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); }); });

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/idempiere.html?client=garden`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

  // (1) ENGINE: seed carries ad_ref_table + resolveFK resolves the aliased / list refs the old code leaked.
  const eng = await page.evaluate(() => {
    let db = null;
    for (const k of Object.keys(window)) { try { const o = window[k]; if (o && typeof o.exec === 'function') { o.exec('SELECT 1'); db = o; break; } } catch (e) {} }
    if (!db) return { hasDb: false };
    const cnt = (() => { try { return db.exec('SELECT COUNT(*) FROM ad_ref_table')[0].values[0][0]; } catch (e) { return -1; } })();
    const R = (c, v) => { try { return window.ADData.resolveFK(db, c, v); } catch (e) { return 'ERR'; } };
    return { hasDb: true, refTableCount: cnt,
      salesRep: R('SalesRep_ID', 101), docTgt: R('C_DocTypeTarget_ID', 135), billBP: R('Bill_BPartner_ID', 112),
      currency: R('C_Currency_ID', 100), payRule: R('PaymentRule', 'B'), delivery: R('DeliveryViaRule', 'P') };
  });
  ok('seed carries ad_ref_table (>0 rows)', eng.hasDb && eng.refTableCount > 0, 'count=' + eng.refTableCount);
  ok("resolveFK SalesRep_ID 101 → 'GardenAdmin' (Table ref, display=key → identifier)", eng.salesRep === 'GardenAdmin', JSON.stringify(eng.salesRep));
  ok("resolveFK C_DocTypeTarget_ID 135 → 'POS Order' (aliased Table ref)", eng.docTgt === 'POS Order', JSON.stringify(eng.docTgt));
  ok("resolveFK Bill_BPartner_ID 112 → 'Standard' (aliased Search ref)", eng.billBP === 'Standard', JSON.stringify(eng.billBP));
  ok("resolveFK C_Currency_ID 100 → 'USD' (TableDir ISO_Code — no Name col)", eng.currency === 'USD', JSON.stringify(eng.currency));
  ok("resolveFK PaymentRule 'B' → 'Cash' (List ref)", eng.payRule === 'Cash', JSON.stringify(eng.payRule));
  ok("resolveFK DeliveryViaRule 'P' → 'Pickup' (List ref)", eng.delivery === 'Pickup', JSON.stringify(eng.delivery));

  // (2) RENDER: log in, open Sales Order, open the POS Order record (doc 80000) into form. Scrape by data-ad-column.
  await page.locator('text="GardenAdmin"').first().click(); await page.waitForTimeout(1200);
  await page.locator('text="Log In ›"').first().click().catch(async () => { await page.locator('button:has-text("Log In")').first().click(); });
  await page.waitForTimeout(2500);
  const top = page.locator('input[placeholder*="Search menu" i]').first();
  await top.click(); await top.fill('Sales Order'); await page.waitForTimeout(1200);
  await page.locator('text=/Sales Order$/i').first().click().catch(() => {}); await page.waitForTimeout(2500);
  await page.locator('tbody tr, [role=row]').nth(1).dblclick().catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(__dirname, 'refresolve_form.png') });

  const formOpen = await page.evaluate(() => /Completed/.test(document.body.innerText));
  ok('Sales Order record opened in form view', formOpen);
  const vals = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.idmp-fld[data-ad-column]').forEach(f => { const v = f.querySelector('.val'); out[f.getAttribute('data-ad-column')] = v ? v.innerText.trim() : ''; });
    return out;
  });
  console.log('   form values: ' + JSON.stringify(vals));
  ok("FORM C_DocTypeTarget_ID renders 'POS Order' (was 135)", vals.C_DocTypeTarget_ID === 'POS Order', JSON.stringify(vals.C_DocTypeTarget_ID));
  ok("FORM SalesRep_ID renders 'GardenAdmin' (was 101)", vals.SalesRep_ID === 'GardenAdmin', JSON.stringify(vals.SalesRep_ID));
  ok("FORM PaymentRule renders 'Cash' (was 'B')", vals.PaymentRule === 'Cash', JSON.stringify(vals.PaymentRule));
  ok("FORM DeliveryViaRule renders 'Pickup' (was 'P')", vals.DeliveryViaRule === 'Pickup', JSON.stringify(vals.DeliveryViaRule));
  ok("FORM Bill_Location_ID renders 'Monroe' (was 108)", vals.Bill_Location_ID === 'Monroe', JSON.stringify(vals.Bill_Location_ID));
  ok("FORM C_Currency_ID renders 'USD' (was 100)", vals.C_Currency_ID === 'USD', JSON.stringify(vals.C_Currency_ID));
  const numericLeak = Object.keys(vals).filter(k => /_ID$/.test(k) && /^\d+$/.test(vals[k]));
  ok('NO _ID field still renders a bare numeric id', numericLeak.length === 0, 'leak=' + JSON.stringify(numericLeak.map(k => k + '=' + vals[k])));

  ok('0 pageerrors', errs.length === 0, errs.slice(0, 5).join(' | '));

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' W-REFRESOLVE-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); server.close(); process.exit(1); });
