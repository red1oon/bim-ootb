// ⚠ DO NOT REMOVE — MEASUREMENT (no product code). READ THE LOG. Question (bim-compiler §INTERNAL-UAT, owner 2026-11-23 "even if the user does UAT in either version,
// the system will not break?"): the Viewer served by a legacy iDempiere (/bimootb, BIM OOTB plugin) pushes the whole Shed TWICE. Does iDempiere then hold one project SHED
// or two, and do its phases / tasks / lines double? Case A: the same page, › ERP again → "Push again?" → Push again. Case B: a FRESH page (no session memory) pushes again.
// After each push the iDempiere tables are read (B:READ, psql on the TEST instance only). Needs: the plugin on :8108 (prepL.sh up), SHED_DB.
// Run: SHED_DB=<copy> LOG=<file> node viewer/tests/measure_legacy_push_twice.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const fs = require('fs'), { execFileSync } = require('child_process');
const SHED = process.env.SHED_DB, LOGF = process.env.LOG || '/tmp/measure_legacy_push_twice.log';
const URL = 'http://localhost:8108/bimootb/viewer/viewer.html?blank=1&erpUser=GardenAdmin&erpClient=11&erpRole=102&erpOrg=11&erpWarehouse=103';
const out = fs.createWriteStream(LOGF); const L = m => { out.write(m + '\n'); if (/§MEASURE/.test(m)) console.log(m); };
const q = sql => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere_bimdoc', '-qtA', '-c', 'set search_path=adempiere; ' + sql]).toString().trim();   // B:READ the test instance
const counts = tag => { const r = q("select (select count(*) from c_project where value='SHED'), (select count(*) from c_projectphase f join c_project p using(c_project_id) where p.value='SHED'), (select count(*) from c_projecttask t join c_projectphase f using(c_projectphase_id) join c_project p on p.c_project_id=f.c_project_id where p.value='SHED'), (select count(*) from c_projectline l join c_project p using(c_project_id) where p.value='SHED'), (select coalesce(string_agg(c_project_id||':'||plannedamt, ','),'') from c_project where value='SHED')").split('|');
  L('§MEASURE ' + tag + ' iDempiere projects_SHED=' + r[0] + ' phases=' + r[1] + ' tasks=' + r[2] + ' lines=' + r[3] + ' project_id:planned=' + r[4]); return r; };
async function openShed(page) {
  page.on('console', m => L('[console] ' + m.text()));
  await page.goto(URL); await page.waitForFunction('window.APP && typeof window.APP.openModelDb === "function"', null, { timeout: 240000 }); await page.waitForTimeout(2000);
  await page.evaluate(() => { window.showOpenFilePicker = undefined; }); await page.mouse.click(900, 640);
  const fc = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o'); (await fc).setFiles(SHED);
  await page.waitForFunction(() => /DONE/.test(document.getElementById('status').textContent), null, { timeout: 300000 });
  await page.mouse.click(900, 640); await page.keyboard.press('f'); await page.waitForTimeout(2500);
  await page.locator('#find-tree .find-tree-row[data-find-parent="Level 1"] > span:nth-child(2)').first().click();
  await page.waitForFunction(() => /USD\s*[\d,]+\.\d{2}(?!\d)/.test((document.getElementById('find-selected') || {}).innerText || ''), null, { timeout: 120000 });
}
const st = page => page.evaluate(() => document.getElementById('status').textContent);
const link = page => page.evaluate(() => { const a = document.getElementById('find-erp-open'); return a && getComputedStyle(a).display !== 'none' ? a.innerText.trim() + ' ' + a.getAttribute('href') : null; });
async function signInIfAsked(page, tag) {
  for (let i = 0; i < 40; i++) {
    const f = await page.evaluate(() => !![...document.querySelectorAll('form')].find(x => /Sign in to iDempiere/.test(x.innerText) && x.getBoundingClientRect().width > 0));
    if (f) { await page.fill('form input[type=password]', 'GardenAdmin'); await page.locator('form button[type=submit]', { hasText: 'Push' }).first().click(); L('§MEASURE ' + tag + ' signed in'); return true; }
    if (/iDempiere Project #\d+|failed/.test(await st(page))) return false; await page.waitForTimeout(250);
  } return false;
}
async function waitPush(page, before) { for (let i = 0; i < 900; i++) { const s = await st(page); if (s !== before && /iDempiere Project #\d+|failed|refused/i.test(s)) return s; await page.waitForTimeout(200); } return await st(page); }
(async () => {
  if (!SHED || !fs.existsSync(SHED)) { console.log('§MEASURE INCONCLUSIVE SHED_DB missing'); process.exit(2); }
  counts('C0 before any push');
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--use-gl=swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); let page = await ctx.newPage();
  await openShed(page);
  let b = await st(page); await page.locator('#find-erp-btn').click(); await signInIfAsked(page, 'P1');
  const s1 = await waitPush(page, b); L('§MEASURE P1 status="' + s1.slice(0, 220) + '" link=' + await link(page)); counts('C1 after push 1');
  // Case A: same page, › ERP again → the in-page prompt → Push again
  b = await st(page); await page.locator('#find-erp-btn').click(); await page.waitForTimeout(1500);
  const prompt = await page.evaluate(() => { const e = [...document.querySelectorAll('div,section')].find(x => /^Push again\?/.test((x.innerText || '').trim()) && x.getBoundingClientRect().width > 0); return e ? e.innerText.replace(/\s+/g, ' ').slice(0, 160) : null; });
  L('§MEASURE A prompt=' + JSON.stringify(prompt));
  if (prompt) await page.locator('button', { hasText: /^Push again$/ }).first().click();
  await signInIfAsked(page, 'A'); const s2 = await waitPush(page, b); L('§MEASURE A status="' + s2.slice(0, 220) + '" link=' + await link(page)); counts('C2 after push 2 (same page, Push again)');
  await ctx.close();
  // Case B: a fresh page (new context: no session memory of the legacy id) pushes again
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); page = await ctx.newPage();
  await openShed(page); L('§MEASURE B link-before-push=' + await link(page));
  b = await st(page); await page.locator('#find-erp-btn').click(); await page.waitForTimeout(1500);
  const promptB = await page.evaluate(() => !![...document.querySelectorAll('div,section')].find(x => /^Push again\?/.test((x.innerText || '').trim()) && x.getBoundingClientRect().width > 0));
  L('§MEASURE B prompt=' + promptB); if (promptB) await page.locator('button', { hasText: /^Push again$/ }).first().click();
  await signInIfAsked(page, 'B'); const s3 = await waitPush(page, b); L('§MEASURE B status="' + s3.slice(0, 220) + '" link=' + await link(page)); counts('C3 after push 3 (fresh page)');
  await browser.close(); out.end();
})().catch(e => { L('§MEASURE ERROR ' + (e && e.stack || e)); process.exit(2); });
