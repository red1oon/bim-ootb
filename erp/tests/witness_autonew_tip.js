// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-AUTONEW-TIP (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §FB3). READ THE LOG after every run: the §WANT lines carry the evidence, the exit code is not.
// THE ISSUE it proves/disproves: a transaction window opened by URL decides "no rows -> open a New record" (AbstractADWindowContent.initQueryOnNew :721-740,
//   curTab.getRowCount() == 0) on the bundle rows alone, before the session's signed rows are folded in. A Sales Invoice made in the session then sits behind a blank
//   New record. Every arm opens the real window by URL and reads counts through the tip reader (bundle + signed op-log), which is what a user's data is.
// Run: node erp/tests/witness_autonew_tip.js [repoRoot] > <log>    CPU only. RED on main at F1 (and F2) before §FB3.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms)), say = s => console.log('§WANT ' + s);
let pass = 0, fail = 0, inc = 0;
const verdict = (id, v, info) => { if (v === 'PASS') pass++; else if (v === 'FAIL') fail++; else inc++; say(id + ' ' + v + ' ' + info); };
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp/idempiere.html';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); page.setDefaultTimeout(20000);
  const LOG = []; page.on('console', m => LOG.push(m.text())); page.on('pageerror', e => LOG.push('PAGEERR ' + e)); page.on('dialog', d => d.dismiss().catch(() => {}));
  const since = (n, re) => LOG.slice(n).filter(l => re.test(l));
  // open a window by URL and wait until it has settled: its tab line (or the Find dialog), then the fold
  async function open(wid) {
    const n0 = LOG.length;
    await page.goto('about:blank'); await page.goto(base + '?login=GardenAdmin&window=' + wid, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__idmpDb && window.__crud && window.__tipRead, null, { timeout: 45000 });
    for (let i = 0; i < 60 && !since(n0, /^§IDEMPIERE tab=/).length && !(await page.$('#idmp-find-ov')); i++) await sleep(250);
    await sleep(2500);
    return n0;
  }
  const rd = sql => page.evaluate(s => window.__tipRead.rows(s), sql);
  const dq = sql => page.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
  const snap = () => page.evaluate(() => (window.IdmpGridTab ? window.IdmpGridTab.snapshot() : null));
  const newOpen = async () => { const s = await snap(); return !!(s && s.newMode) && !!(await page.$('#idmp-inline-mount')); };
  const gridIds = async () => { for (let k = 0; k < 2; k++) { if (await page.$('tr[data-ad-record]')) break; await page.click('#idmp-toolbar button[data-tb="toggle"]').catch(() => {}); await sleep(900); }
    return page.evaluate(() => [...document.querySelectorAll('tr[data-ad-record]')].map(t => t.getAttribute('data-ad-record'))); };
  const CUR_INV = "SELECT c_invoice_id AS id FROM c_invoice WHERE issotrx='Y' AND ad_client_id IN (0,11) AND (processed='N' OR updated>datetime('now','localtime','-1 day'))";

  // ── R0 red control: with no current invoice the window DOES open a New record (the witness can see a New)
  let n0 = await open(167);
  const cur0 = (await rd(CUR_INV)).length, an0 = since(n0, /^§UDP4-AUTONEW window=167 /)[0] || null, new0 = await newOpen();
  verdict('R0 red control: no current rows -> New', cur0 !== 0 ? 'INCONCLUSIVE' : (an0 && new0 ? 'PASS' : 'FAIL'), 'handCount=' + cur0 + ' newRecordOpen=' + new0 + ' log=' + an0);

  // ── fixture: an On Credit order (C_DocType 133) with one line, signed like any user commit; completed from the Sales Order document bar
  const d = new Date(), p2 = x => (x < 10 ? '0' : '') + x, TODAY = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' 00:00:00';
  const hdr = { ad_org_id: 11, c_doctypetarget_id: 133, c_doctype_id: 0, issotrx: 'Y', c_bpartner_id: 112, c_bpartner_location_id: 108, bill_bpartner_id: 112, bill_location_id: 108, m_warehouse_id: 103,
    m_pricelist_id: 101, c_currency_id: 100, c_paymentterm_id: 108, salesrep_id: 101, paymentrule: 'P', invoicerule: 'I', deliveryrule: 'F', deliveryviarule: 'P', priorityrule: '5', freightcostrule: 'I',
    docaction: 'CO', docstatus: 'DR', processed: 'N', isapproved: 'N', posted: 'N', totallines: 0, grandtotal: 0, dateordered: TODAY, dateacct: TODAY, datepromised: TODAY, description: 'W-AUTONEW-TIP' };
  const line = { ad_org_id: 11, c_order_id: { __opRef: 0 }, m_product_id: 126, qtyentered: 1, qtyordered: 1, c_uom_id: 100, c_tax_id: 104, m_warehouse_id: 103, priceentered: 50, priceactual: 50, pricelist: 50, linenetamt: 50,
    qtydelivered: 0, qtyinvoiced: 0, qtyreserved: 0, line: 10, isdescription: 'N', processed: 'N', c_currency_id: 100, c_bpartner_id: 112, c_bpartner_location_id: 108, dateordered: TODAY };
  const mk = (t, f) => ({ key: t, table: t, verb: 'create', op_type: 'CRUD_CREATE', op_uuid: null, cas: null, fields: f, stdDefaults: null });
  await open(143);
  const cm = await page.evaluate(o => new Promise(r => { const A = window.APP || {}, std = { actor: A.actor, clientId: A.clientId, orgId: A.orgId || 0 }; o.forEach(x => { x.stdDefaults = std; }); window.__crud.applyOpGroup(o, x => r(x)); }), [mk('c_order', hdr), mk('c_orderline', line)]);
  await sleep(1200);
  const ord = (await rd("SELECT c_order_id AS id FROM c_order WHERE description='W-AUTONEW-TIP'"))[0];
  let inv = [];
  if (ord) {
    await open(143); await gridIds();
    for (let k = 0; k < 3; k++) { await page.evaluate(i => { const tr = document.querySelector('tr[data-ad-record="' + i + '"]'); const c = tr && tr.querySelector('.idmp-rowind'); if (c) c.click(); }, ord.id); await sleep(1200);
      const s = await snap(); if (s && s.currentKey == ord.id && await page.$('.idmp-docfsm')) break; }
    const n1 = LOG.length;
    if (await page.$('.idmp-docfsm [data-doc-action="CO"]')) { await page.click('.idmp-docfsm [data-doc-action="CO"]'); for (let i = 0; i < 100 && !since(n1, /^§CRUD process committed key=c_order|REFUSED by the model|REJECTED/).length; i++) await sleep(250); await sleep(2000); }
    inv = await rd("SELECT c_invoice_id AS id, documentno, docstatus, processed, updated FROM c_invoice WHERE c_order_id=" + ord.id);
    say('fixture order=' + ord.id + ' commit=' + (cm && cm.committed) + ' ' + (since(n1, /^§ORDER-CREATEINVOICE /)[0] || 'no §ORDER-CREATEINVOICE') + ' invoice=' + JSON.stringify(inv));
  }

  // the sweep's own measure, taken HERE (the page the rows were made in), not from the window under test: per transaction window, the session rows (synthetic key < 0) its
  //   header tab must show = AD_Tab.WhereClause + the only-current clause over the tip. A WhereClause with a context variable is not evaluated here (null = not judged by this measure).
  const wins = (await dq("SELECT w.AD_Window_ID, w.Name FROM AD_Window w WHERE w.WindowType='T' AND w.IsActive='Y' AND EXISTS (SELECT 1 FROM AD_Window_Access a WHERE a.AD_Window_ID=w.AD_Window_ID AND a.AD_Role_ID=102 AND a.IsActive='Y') ORDER BY 1")).map(r => ({ id: Number(r[0]), name: r[1] }));
  for (const w of wins) {
    const t = (await dq("SELECT tb.TableName, t.WhereClause FROM AD_Tab t JOIN AD_Table tb ON tb.AD_Table_ID=t.AD_Table_ID WHERE t.AD_Window_ID=" + w.id + " AND t.IsActive='Y' AND COALESCE(t.TabLevel,0)=0 ORDER BY t.SeqNo LIMIT 1"))[0];
    w.sess = null; if (!t) continue; const wc = t[1] ? String(t[1]) : '';
    if (/@/.test(wc)) continue;
    const r = await rd('SELECT count(*) AS n FROM ' + t[0] + ' WHERE ' + t[0] + '_ID<0 AND AD_Client_ID IN (0,11)' + (wc ? ' AND (' + wc + ')' : '') + " AND (Processed='N' OR Updated>datetime('now','localtime','-1 day'))");
    w.sess = r && r.length ? Number(r[0].n) : null;
  }
  say('F2 pre-measure: windows whose header tab must show session rows = ' + JSON.stringify(wins.filter(w => w.sess > 0).map(w => w.id + ':' + w.sess)) + ' not measurable=' + wins.filter(w => w.sess == null).length);

  // ── F1 the case: that invoice, Sales Invoice opened by URL
  if (!ord || inv.length !== 1) verdict('F1 session invoice listed by URL', 'INCONCLUSIVE', 'the fixture made no invoice (order=' + JSON.stringify(ord) + ' invoices=' + inv.length + ')');
  else {
    const hand = (await rd(CUR_INV)).map(r => String(r.id)).sort();   // the hand count is read where the invoice was made, before the window under test opens
    n0 = await open(167);
    const after = (await rd(CUR_INV)).length, isNew = await newOpen(), s = await snap();
    const an = since(n0, /^§UDP4-AUTONEW(-STAY)? window=167 /)[0] || null, ids = isNew ? [] : (await gridIds()).sort(), f = [];
    if (isNew) f.push('a New record is open over ' + hand.length + ' current row(s)');
    if (!isNew && JSON.stringify(ids) !== JSON.stringify(hand)) f.push('rows ' + JSON.stringify(ids) + ' vs hand ' + JSON.stringify(hand));
    if (!isNew && String(s && s.currentKey) !== String(inv[0].id)) f.push('current record ' + (s && s.currentKey) + ' not the invoice ' + inv[0].id);
    if (hand.indexOf(String(inv[0].id)) < 0) f.push('hand count does not hold the invoice: population');
    verdict('F1 session invoice listed by URL', f.length ? 'FAIL' : 'PASS', (f.length ? f.join(' ; ') + ' | ' : '') + 'rows=' + JSON.stringify(ids) + ' handCount=' + hand.length + ' current=' + (s && s.currentKey) + ' newRecordOpen=' + isNew + ' tipReadAfterOpen=' + after + ' log=' + an);
  }

  // ── F2 sweep: every transaction window the role can open, by URL: New record open <=> 0 rows once the fold has landed
  let X = 0, judged = 0, withSession = 0, noTable = 0, findFirst = 0, notOpened = 0; const bad = [];
  for (const w of wins) {
    let m0; try { m0 = await open(w.id); } catch (e) { notOpened++; say('F2 window=' + w.id + ' not opened: ' + String(e).slice(0, 80)); continue; }
    if (since(m0, /rows=n\/a\(table-not-in-seed\)/).length) { noTable++; continue; }
    if (await page.$('#idmp-find-ov')) { findFirst++; continue; }
    const tabL = since(m0, /^§IDEMPIERE tab=.* rows=\d+/)[0], ini = since(m0, new RegExp('^§UDP4-INITIAL window=' + w.id + ' '))[0];
    if (!tabL || !ini) { notOpened++; say('F2 window=' + w.id + ' "' + w.name + '" not opened (no tab line)'); continue; }
    const tbl = (/ table=(\S+)/.exec(tabL) || [])[1], baseN = Number((/ rows=(\d+)/.exec(tabL) || [])[1]);
    const foldRe = new RegExp('^§LIST-TIP overlay table=' + String(tbl).toLowerCase() + ' ');
    if (w.sess > 0) for (let i = 0; i < 40 && !since(m0, foldRe).length; i++) await sleep(250);   // a window that must show session rows gets up to 10 s more for its fold to land (the fold is async)
    const fold = since(m0, foldRe).pop(), rows = fold ? Number((/ folded=(\d+)/.exec(fold) || [])[1]) : baseN, created = fold ? Number((/ created=(\d+)/.exec(fold) || [])[1]) : 0;
    const isNew = await newOpen(), s = await snap(), canIns = !!(s && s.canInsert);
    const must = Math.max(rows, baseN + (w.sess || 0));   // the fold line when the window printed one, else the pre-measure: a dropped fold cannot hide a row
    judged++; if (created > 0 || w.sess > 0) withSession++;
    const want = must === 0 && canIns, ok = isNew === want && (isNew || rows >= must);
    if (ok) X++; else bad.push({ window: w.id, name: w.name, table: tbl, rowsShown: rows, base: baseN, foldCreated: created, sessionRowsMeasured: w.sess, newRecordOpen: isNew, canInsert: canIns });
  }
  say('F2 sweep transaction windows N=' + wins.length + ' judged=' + judged + ' hold=' + X + ' withSessionRows=' + withSession + ' tableNotInSeed=' + noTable + ' findFirst=' + findFirst + ' notOpened=' + notOpened);
  bad.forEach(b => say('F2 BROKEN ' + JSON.stringify(b)));
  verdict('F2 New record <=> 0 rows after the fold', (!judged || !withSession) ? 'INCONCLUSIVE' : (bad.length ? 'FAIL' : 'PASS'), X + ' of ' + judged + ' judged windows (' + withSession + ' with a session row; N=' + wins.length + ')');
  const pe = LOG.filter(l => /^PAGEERR/.test(l));
  verdict('E no page errors', pe.length ? 'FAIL' : 'PASS', pe.length + ' ' + JSON.stringify(pe.slice(0, 3)));
  LOG.filter(l => /^§UDP4-AUTONEW/.test(l)).slice(0, 40).forEach(l => console.log('  log| ' + l.slice(0, 200)));
  if (process.env.PAGELOG) fs.writeFileSync(process.env.PAGELOG, LOG.join('\n'));
  console.log('§WANT-VERDICT ' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  await browser.close(); server.close(); process.exit(fail ? 1 : inc ? 2 : 0);
})().catch(e => { console.log('§WANT-VERDICT INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
