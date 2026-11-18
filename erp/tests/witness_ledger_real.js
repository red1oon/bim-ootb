#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LEDGER-REAL (bim-compiler prompts/CLI_ERP_IVR.md §57). READ THE §-LOG after every run; run it with erp/tests/smoke_ledger_real_picker.sh (a virtual display), never on the owner's screen.
 * ISSUE: W-LEDGER-UI stubbed the folder picker with an OPFS handle. This drives the REAL thing: headed Chromium on Xvfb, Chrome's own native GTK folder dialog answered with synthetic keys (xkeys.py, XTEST, the
 *   virtual display only), Chrome's own "Allow this site to edit files?" prompt, a REAL on-disk folder, and a REAL door process writing the SAME file. The evidence is page logs and file bytes, never pixels.
 *   R1 the native dialog + the permission prompt: the pill reads "Ledger: <folder> · N rows"; the file exists ON DISK
 *   R2 a page op: the on-disk file gains rows and the DOOR's verifier (ledger_sign.verify) accepts it with only the page's public key
 *   R3 a real door process (BIM_OBJECT_OPLOG = that on-disk file) makes an order and appends to it
 *   R4 the next page op re-hydrates from disk: the page's tip fold HAS the door's order; the page's verifyChain ok over page + door rows
 *   R5 a reload: the pill re-attaches by itself (Chrome still grants the folder); a page op chains after the door's rows
 *   R6 a second real door op after the page's rows: ids and prev_hash continue, the page's verifyChain ok
 * Falsifier: XKEYS_BREAK=skipallow (the permission prompt is left unanswered) -> R1 FAIL.
 */
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { run, DOOR } = require('../../common/door/tests/_kit.js');
const REPO = path.join(__dirname, '..', '..'), XK = path.join(__dirname, 'tools', 'xkeys.py'), BREAK = process.env.XKEYS_BREAK || '';
if (!process.env.DISPLAY || process.env.XKEYS_ALLOW !== process.env.DISPLAY) { console.log('§WITNESS_LEDGER_REAL refused: run erp/tests/smoke_ledger_real_picker.sh (virtual display only)'); process.exit(2); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(REPO, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
let pass = 0, fail = 0, inc = 0; const say = (s) => console.log(s);
const judge = (id, ok, ev) => { if (ok === null) inc++; else if (ok) pass++; else fail++; say('  ' + (ok === null ? '⚪' : ok ? '✅' : '❌') + ' ' + id + '  ' + (ev || '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keys = (...a) => cp.execFileSync('python3', [XK, ...a], { env: process.env });
const wins = () => { try { return cp.execSync('xwininfo -root -tree | grep -E "^ +0x" | grep -v "has no name"').toString(); } catch (e) { return ''; } };
(async () => {
  await new Promise((r) => server.listen(0, r));
  const FOLDER = fs.mkdtempSync(path.join('/tmp', 'lrs_')), FILE = path.join(FOLDER, 'ad_seed.db.ops.jsonl'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerreal_'));
  const env = { BIM_OBJECT_OPLOG: FILE, BIM_DOOR_JOURNAL: path.join(tmp, 'j.jsonl'), RED1_DOOR_KEY: path.join(tmp, 'door_key.json') };
  process.env.RED1_DOOR_KEY = env.RED1_DOOR_KEY; const LS = require('../../common/door/ledger_sign.js');
  const b = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-gpu'] }), page = await b.newPage(), LOG = [], errs = [];
  page.on('console', (m) => LOG.push(m.text())); page.on('pageerror', (e) => errs.push(String(e)));
  const URL = 'http://localhost:' + server.address().port + '/erp/idempiere.html?login=GardenAdmin&window=146';
  const inject = () => page.evaluate(() => {
    window.__fi = window.__fi || 0;
    window.__edit = () => new Promise((resolve) => { let done = false; const v = 'W-LEDGER-REAL ' + Date.now() + '-' + (window.__fi++);
      const h = () => { if (done) return; done = true; window.removeEventListener('overlay:committed', h); resolve({ v }); }; window.addEventListener('overlay:committed', h);
      window.__crud.applyOp({ key: 'c_bpartner', table: 'C_BPartner', verb: 'update', ownerGated: false, op_type: 'CRUD_UPDATE', id: 112, changes: { Description: { old: window.__prev || null, new: v } }, actor: 100 }); window.__prev = v;
      setTimeout(() => { if (!done) { done = true; window.removeEventListener('overlay:committed', h); resolve({ v, timeout: true }); } }, 8000); });
    window.__chain = async () => { const v = await window.KernelOps.verifyChain(window.__crud.kernelDb()); return { ok: v.ok, len: v.len, why: v.why }; };
  });
  const load = async () => { await page.goto(URL, { waitUntil: 'load' }); await page.waitForFunction(() => window.__crud && window.ErpSigner && window.ErpSigner.pubKeyHex && window.LedgerFile && window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await sleep(1500); await inject(); };
  const state = () => page.evaluate(() => window.LedgerUi.state()), pill = () => page.$eval('#erp-ledger-pill', (e) => e.textContent);
  const waitOn = async (ms) => { try { await page.waitForFunction(() => window.LedgerUi.state() === 'on', null, { timeout: ms || 15000 }); return true; } catch (e) { return false; } };
  const rows = () => { try { return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(JSON.parse); } catch (e) { return []; } };
  try {
    await load(); await page.evaluate(() => window.__edit()); await sleep(1500);
    // R1: the REAL dialog, driven
    page.click('#erp-ledger-pill').catch(() => {});
    let dlg = false; for (let i = 0; i < 40 && !dlg; i++) { await sleep(250); dlg = /Select where this site can save changes|Select|Open/.test(wins()); }
    if (dlg) { await sleep(600); keys('ctrl+l'); await sleep(500); keys('text:' + FOLDER); await sleep(500); keys('alt+o'); await sleep(1500); if (BREAK !== 'skipallow') { keys('Tab'); await sleep(500); keys('Return'); } }
    const on1 = await waitOn(BREAK === 'skipallow' ? 6000 : 20000), t1 = await pill(), r1 = rows();
    judge('R1 the REAL native folder dialog and Chrome\'s permission prompt: the pill reads "' + t1 + '" and the file exists on disk (' + r1.length + ' rows)', dlg && on1 && t1.indexOf(path.basename(FOLDER)) > 0 && fs.existsSync(FILE) && r1.length >= 1, 'dialog=' + dlg + ' state=' + (await state()));
    if (!on1) throw new Error('not attached: the rest cannot run');
    // R2
    await page.evaluate(() => window.__edit()); await sleep(1200);
    const pubf = path.join(tmp, 'page_pub.json'); fs.writeFileSync(pubf, JSON.stringify(await page.evaluate(() => window.ErpSigner.pubKeyJwk)));
    const r2 = rows(), v2 = await LS.verify(FILE, pubf);
    judge('R2 a page op: the on-disk file has ' + r2.length + ' rows and the DOOR\'s verifier accepts it with only the page\'s public key', r2.length >= 2 && v2.ok === true && v2.len === r2.length, JSON.stringify(v2));
    // R3: a real door process on the SAME on-disk file
    let seq = 0; const door = async (line) => { const r = await run(DOOR, ['--actor', 'human', '--request', 'real-' + (++seq), '--journal', env.BIM_DOOR_JOURNAL, line], env); let j = null; try { j = JSON.parse(r.out.trim()); } catch (e) {} return j; };
    const n3 = rows().length, h = await door('erp.new kind=Order issotrx=Y c_doctypetarget_id=132 c_bpartner_id=112 salesrep_id=101'), no = h && h.answer && h.answer.number, r3 = rows();
    const oc = r3.map((r) => { try { return JSON.parse(r.parameters); } catch (e) { return {}; } }).find((o) => o.op_type === 'CRUD_CREATE' && String(o.table).toLowerCase() === 'c_order'), oid = oc && oc.fields && oc.fields.c_order_id;
    judge('R3 a real door process on the same on-disk file made order ' + no + ' (c_order_id ' + oid + '): the file grew ' + n3 + ' -> ' + r3.length + ' rows', !!no && !!oid && r3.length > n3, JSON.stringify(h && h.status));
    // R4
    await page.evaluate(() => window.__edit()); await sleep(1500);
    await page.click('#erp-ledger-trust'); await sleep(1500);   // §58: the door's key is unpinned until the Trust click (the fingerprint the owner compares with `ledger_sign.js key`)
    const seen = oid ? await page.evaluate((id) => window.__crud.withTipQuery((q) => q('SELECT documentno FROM c_order WHERE c_order_id = ?', [id])), oid) : [], ch4 = await page.evaluate(() => window.__chain()), r4 = rows();
    judge('R4 the page, after its next op, HAS the door\'s order in its tip fold; verifyChain ok over ' + r4.length + ' rows, 2 keys', Array.isArray(seen) && seen.length === 1 && String(seen[0].documentno) === String(no) && ch4.ok === true && ch4.len === r4.length && new Set(r4.map((x) => JSON.parse(x.parameters).signed_by)).size === 2, JSON.stringify(seen) + ' ' + JSON.stringify(ch4));
    // R5
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await inject();
    const on5 = await waitOn(25000), b5 = rows(); if (on5) { await page.evaluate(() => window.__edit()); await sleep(1500); } const a5 = rows();
    judge('R5 after a reload the pill re-attaches by itself (' + (on5 ? await pill() : await pill()) + '); the next page op chains after the door\'s rows (' + b5.length + ' -> ' + a5.length + ')', on5 && a5.length > b5.length && a5[b5.length].prev_hash === b5[b5.length - 1].op_hash, 'state=' + (await state()));
    // R6
    const n6 = rows().length; await door('erp.new kind=Order issotrx=Y c_doctypetarget_id=132 c_bpartner_id=112 salesrep_id=101'); const r6 = rows();
    await page.evaluate(() => window.__edit()); await sleep(1500); const ch6 = await page.evaluate(() => window.__chain()), r6b = rows();
    judge('R6 a second door op after the page\'s rows continues the chain (ids ' + (n6 + 1) + '.., prev_hash links) and the page\'s verifyChain is ok over ' + r6b.length, r6.length > n6 && r6.every((x, i) => x.id === i + 1 && (i === 0 || x.prev_hash === r6[i - 1].op_hash)) && ch6.ok === true && ch6.len === r6b.length, JSON.stringify(ch6));
  } catch (e) { judge('harness', null, e.message.split('\n')[0]); }
  if (process.env.LA_LOG || fail) LOG.filter((l) => /§LEDGER|rror/i.test(l)).slice(-30).forEach((l) => say('    · ' + l.slice(0, 220)));
  judge('page-errors', errs.length === 0, 'n=' + errs.length + ' ' + errs.slice(0, 2).join(' | '));
  say('§WITNESS_LEDGER_REAL pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' folder=' + FOLDER);
  await b.close(); server.close(); process.exit(fail || inc ? 1 : 0);
})();
