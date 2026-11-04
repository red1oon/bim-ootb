#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HOME-TIP (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.31). Headless CPU Chromium on the REAL erp/idempiere.html, no pilot needed. READ THE LOG: verdict = §HOME_TIP_VERDICT.
// THE ISSUE it proves/disproves: "the Home's document-status gadget reads the base only, so what a user saved never reaches its counts: legacy counts it, because its DB holds it". The Performance gadget
//   was fixed for this in §5.24 and this one was named open. Read from the page and the DB, never from a screenshot. Break (MUST FAIL): HOME_TIP_BREAK=1 takes withTipQuery away, the old read.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.HOME_TIP_BREAK === '1', log = console.log;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain', '.zip': 'application/zip' };
const NOTICE = 200002, UNPROCESSED = 200005, SO_TODAY = 200000, REQUEST = 200003;
let judged = 0, fails = 0;
const ck = (n, ok, info) => { judged++; if (!ok) fails++; log('  §HOME_TIP ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, buf) => { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); }); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port, browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), ctx = await browser.newContext();
  let pg, logs = [];
  const open = async () => { pg = await ctx.newPage(); logs = []; pg.on('console', m => { const t = m.text(); if (t.indexOf('§') === 0) logs.push(t); }); await pg.goto(url + '/erp/idempiere.html', { waitUntil: 'networkidle' }); await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 }); };
  const signIn = async () => { await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 20000 });
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible'); await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok'); };
  const counts = () => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('#idmp-home [data-ds-id]')].map(e => [e.getAttribute('data-ds-id'), e.getAttribute('data-ds-count')])));
  const baseCount = sql => pg.evaluate(s => window.__idmpDb.exec(s)[0].values[0][0], sql);
  try {
    await open(); await pg.evaluate(() => indexedDB.databases().then(ds => Promise.all(ds.map(d => new Promise(r => { const x = indexedDB.deleteDatabase(d.name); x.onsuccess = x.onerror = x.onblocked = () => r(); }))))); await pg.close();
    await open(); await signIn(); await pg.waitForSelector('#idmp-home [data-ds-id]', { timeout: 30000 });
    await pg.waitForFunction(() => window.__crud && window.__crud.applyOpGroup, null, { timeout: 15000 });
    // a fresh profile's tip holds nothing yet when the sidecar opens (its AD_Session op persists just after), so nothing is redrawn
    for (let i = 0; i < 40 && !logs.some(l => /^§DASH-HOME sidecar ready/.test(l)); i++) await pg.waitForTimeout(250);
    await pg.waitForTimeout(500);
    const a = await counts(), redrawnFresh = logs.some(l => /^§DASH-GADGET docstatus redrawn over base \+ tip/.test(l));
    log('§HOME_TIP before ' + JSON.stringify(a));
    ck('A the gadget is on the Home with the indicators this test moves', [NOTICE, UNPROCESSED, SO_TODAY].every(i => a[i] !== undefined && a[i] !== ''), a);
    if (![NOTICE, UNPROCESSED, SO_TODAY].every(i => a[i] !== undefined && a[i] !== '')) throw new Error('nothing can be judged');
    ck('B0 a profile with no saved edit does not redraw it', !redrawnFresh);
    const baseBefore = { n: await baseCount('SELECT COUNT(*) FROM ad_note'), o: await baseCount('SELECT COUNT(*) FROM c_order') };
    const today = await pg.evaluate(() => { const d = new Date(), p = n => ('0' + n).slice(-2); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':00'; });
    // the op shape a save commits (crud_core.buildOp; idempiere.html _procCrud), through the one commit path
    const op = (table, fields) => ({ key: table, table, verb: 'create', op_uuid: null, op_type: 'CRUD_CREATE', fields: Object.assign({ ad_client_id: 11, ad_org_id: 11, isactive: 'Y', createdby: 101, updatedby: 101 }, fields), cas: null, stdDefaults: { actor: 101, clientId: 11, orgId: 11 } });
    const committed = await pg.evaluate(ops => new Promise(res => window.__crud.applyOpGroup(ops, r => res(!!(r && r.committed)))), [
      op('ad_note', { ad_user_id: 101, ad_message_id: 100, processed: 'N' }),
      op('c_order', { issotrx: 'Y', docstatus: 'DR', docaction: 'CO', processed: 'N', dateordered: today, dateacct: today, c_doctype_id: 0, c_doctypetarget_id: 132, documentno: 'W-HOME-TIP', c_bpartner_id: 112, c_bpartner_location_id: 109, m_warehouse_id: 103, m_pricelist_id: 101, c_currency_id: 100 })]);
    log('§HOME_TIP two rows saved through applyOpGroup committed=' + committed);
    ck('C the rows committed to the signed tip', committed === true);
    await pg.close();
    await open();
    if (BREAK) { log('§HOME_TIP_BREAK=1 withTipQuery removed before the Home renders'); await pg.evaluate(() => { if (window.__crud) window.__crud.withTipQuery = undefined; }); }
    await signIn(); await pg.waitForSelector('#idmp-home [data-ds-id]', { timeout: 30000 });
    for (let i = 0; i < 40 && !logs.some(l => /^§DASH-GADGET docstatus redrawn over base \+ tip/.test(l)); i++) await pg.waitForTimeout(250);
    log('§HOME_TIP redraw lines ' + JSON.stringify(logs.filter(l => /redrawn over base/.test(l)).map(l => l.slice(0, 200))));
    const b = await counts();
    log('§HOME_TIP after ' + JSON.stringify(b));
    const baseAfter = { n: await baseCount('SELECT COUNT(*) FROM ad_note'), o: await baseCount('SELECT COUNT(*) FROM c_order') };
    ck('D the base did not change: what moves can only come from the tip', baseAfter.n === baseBefore.n && baseAfter.o === baseBefore.o, { baseBefore, baseAfter });
    ck('E1 Notice counts the saved note, ' + a[NOTICE] + ' + 1', Number(b[NOTICE]) === Number(a[NOTICE]) + 1, { before: a[NOTICE], after: b[NOTICE] });
    ck('E2 Sales Orders received today counts the saved order, ' + a[SO_TODAY] + ' + 1', Number(b[SO_TODAY]) === Number(a[SO_TODAY]) + 1, { before: a[SO_TODAY], after: b[SO_TODAY] });
    ck('E3 Unprocessed Documents counts it too, through the rv_unprocessed view, ' + a[UNPROCESSED] + ' + 1', Number(b[UNPROCESSED]) === Number(a[UNPROCESSED]) + 1, { before: a[UNPROCESSED], after: b[UNPROCESSED] });
    if (a[REQUEST] !== undefined) ck('F an indicator nothing touched stays put (Request)', b[REQUEST] === a[REQUEST], { before: a[REQUEST], after: b[REQUEST] });
    ck('G the Performance gadget is still drawn beside it', await pg.evaluate(() => document.querySelectorAll('#idmp-home .pi').length > 0));
  } catch (e) { ck('crash', false, String(e && e.stack || e).slice(0, 400)); } finally { await browser.close(); server.close(); }
  const v = fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE';
  log('§HOME_TIP_VERDICT ' + v + ' judged=' + judged + ' failed=' + fails);
  process.exit(fails ? 1 : judged ? 0 : 2);
})();
