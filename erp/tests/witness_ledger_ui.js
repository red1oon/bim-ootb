#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LEDGER-UI (bim-compiler prompts/CLI_ERP_IVR.md §56, ledger step 3 piece (4)). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: nothing in the page called attachLedger, so an order made at `red1>` was never visible in the browser. erp/ledger_ui.js adds the "Ledger" pill, the folder picker and the kept handle.
 * Headless Chromium's native showDirectoryPicker ABORTS at once (measured), so the page runs with showDirectoryPicker replaced by a function returning a REAL File System Access handle (OPFS: real
 *   swap-on-close, real structured-clone into IndexedDB); U7 calls the REAL native picker once. NOT verified here, by construction: a real on-disk folder chosen in the real dialog, and Chrome's
 *   permission re-prompt for such a folder after a reload.
 *   U1 the pill is there and reads off · U2 a click attaches: the pill names the folder, its row count = the file's rows · U3 the handle is kept in IndexedDB
 *   U4 reload: the pill re-attaches by itself (permission granted), the next page op chains after the file's last row, verifyChain ok
 *   U9 a REAL door process (log = a copy of the file) makes an order; the copy goes back; the next page op re-hydrates; the page's tip fold HAS the door's order
 *   U6 permission answers 'prompt': the pill reads click-to-re-grant, does NOT attach; the click attaches · U8 a click on the attached pill detaches, forgets the handle, the file is unchanged
 *   U7 the REAL native picker, refused: the page logs it, the pill stays off, no page error
 * Falsifiers: LEDGER_UI_BREAK=noperm -> U6 FAIL; LEDGER_UI_BREAK=nostore -> U3 and U4 FAIL.
 */
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const REPO = path.join(__dirname, '..', '..'), BREAK = process.env.LEDGER_UI_BREAK || '';
const { run, DOOR } = require('../../common/door/tests/_kit.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(REPO, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
let pass = 0, fail = 0, inc = 0; const say = (s) => console.log(s);
const judge = (id, ok, ev) => { if (ok === null) inc++; else if (ok) pass++; else fail++; say('  ' + (ok === null ? '⚪' : ok ? '✅' : '❌') + ' ' + id + '  ' + (ev || '')); };
const FILE = 'ad_seed.db.ops.jsonl';
(async () => {
  await new Promise((r) => server.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerui_')), env = { BIM_OBJECT_OPLOG: path.join(dir, 'door.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl'), RED1_DOOR_KEY: path.join(dir, 'door_key.json') };
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), ctx = await b.newContext(), LOG = [], errs = [];
  await ctx.addInitScript((a) => {
    window.__LEDGER_UI_BREAK = a.brk;
    if (!localStorage.getItem('__real_picker')) window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('UI1', { create: true });   // a REAL FSA handle, picker-free
    if (localStorage.getItem('__perm') === 'prompt' && window.FileSystemHandle) FileSystemHandle.prototype.queryPermission = async () => 'prompt';
  }, { brk: BREAK });
  const page = await ctx.newPage(); page.on('console', (m) => LOG.push(m.text())); page.on('pageerror', (e) => errs.push(String(e)));
  const URL = 'http://localhost:' + server.address().port + '/erp/idempiere.html?login=GardenAdmin&window=146';
  const inject = () => page.evaluate(() => {
    window.__fi = window.__fi || 0;
    window.__edit = () => new Promise((resolve) => { let done = false; const v = 'W-LEDGER-UI ' + Date.now() + '-' + (window.__fi++);
      const h = () => { if (done) return; done = true; window.removeEventListener('overlay:committed', h); resolve({ v }); }; window.addEventListener('overlay:committed', h);
      window.__crud.applyOp({ key: 'c_bpartner', table: 'C_BPartner', verb: 'update', ownerGated: false, op_type: 'CRUD_UPDATE', id: 112, changes: { Description: { old: window.__prev || null, new: v } }, actor: 100 }); window.__prev = v;
      setTimeout(() => { if (!done) { done = true; window.removeEventListener('overlay:committed', h); resolve({ v, timeout: true }); } }, 6000); });
    window.__read = async () => { try { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('UI1', { create: true }); return await (await (await d.getFileHandle('ad_seed.db.ops.jsonl')).getFile()).text(); } catch (e) { return ''; } };
    window.__write = async (t) => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('UI1', { create: true }), w = await (await d.getFileHandle('ad_seed.db.ops.jsonl', { create: true })).createWritable(); await w.write(t); await w.close(); };
    window.__chain = async () => { const v = await window.KernelOps.verifyChain(window.__crud.kernelDb()); return { ok: v.ok, len: v.len, why: v.why }; };
    window.__kept = () => new Promise((res) => { const q = indexedDB.open('bim_erp_ledger'); q.onsuccess = () => { try { const g = q.result.transaction('h', 'readonly').objectStore('h').count(); g.onsuccess = () => res(g.result); g.onerror = () => res(-1); } catch (e) { res(0); } }; q.onerror = () => res(-1); q.onupgradeneeded = () => { q.transaction.abort(); res(0); }; });
  });
  const load = async () => { await page.goto(URL, { waitUntil: 'load' }); await page.waitForFunction(() => window.__crud && window.ErpSigner && window.ErpSigner.pubKeyHex && window.LedgerFile && window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await page.waitForTimeout(1200); await inject(); };
  const settleState = async (want, ms) => { try { await page.waitForFunction((w) => window.LedgerUi.state() === w, want, { timeout: ms || 15000 }); return true; } catch (e) { return false; } };
  const pillText = () => page.$eval('#erp-ledger-pill', (e) => e.textContent);
  const rows = (t) => t.split('\n').filter(Boolean).map(JSON.parse);
  try {
    await load();
    // U1
    judge('U1 the Ledger pill is mounted and reads off (nothing kept)', (await pillText()) === 'Ledger: off', await pillText());
    await page.evaluate(() => window.__edit()); await page.evaluate(() => window.__edit()); await page.waitForTimeout(1500);
    // U2
    await page.click('#erp-ledger-pill'); const on = await settleState('on'); await page.waitForTimeout(500);
    const t2 = await pillText(), f2 = rows(await page.evaluate(() => window.__read())), n2 = Number((/(\d+) rows/.exec(t2) || [])[1]);
    judge('U2 a click attaches: the pill names the folder and its row count equals the file\'s (' + f2.length + ')', on && /^Ledger: UI1 · \d+ rows$/.test(t2) && n2 === f2.length && f2.length >= 2, t2);
    // U3
    const kept = await page.evaluate(() => window.__kept());
    judge('U3 the folder handle is kept in IndexedDB', kept === 1, 'count=' + kept);
    // U4
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await inject();
    const on4 = await settleState('on', 20000); const before4 = rows(await page.evaluate(() => window.__read()));
    if (on4) { await page.evaluate(() => window.__edit()); await page.waitForTimeout(1200); }
    const after4 = rows(await page.evaluate(() => window.__read())), ch4 = on4 ? await page.evaluate(() => window.__chain()) : null;
    judge('U4 after a reload the pill re-attaches by itself; the next page op chains after the file\'s last row (' + before4.length + ' -> ' + after4.length + ' rows), verifyChain ok', on4 && after4.length > before4.length && after4[before4.length].prev_hash === before4[before4.length - 1].op_hash && ch4.ok === true && ch4.len === after4.length, 'state=' + (on4 ? 'on' : await page.evaluate(() => window.LedgerUi.state())) + ' ' + JSON.stringify(ch4));
    // U9 + U5: a real door process on a copy of the file
    const text9 = await page.evaluate(() => window.__read()), copy = env.BIM_OBJECT_OPLOG; fs.writeFileSync(copy, text9);
    let seq = 0; const door = async (line) => { const r = await run(DOOR, ['--actor', 'human', '--request', 'ui-' + (++seq), '--journal', env.BIM_DOOR_JOURNAL, line], env); let j = null; try { j = JSON.parse(r.out.trim()); } catch (e) {} return j; };
    const h = await door('erp.new kind=Order issotrx=Y c_doctypetarget_id=132 c_bpartner_id=112 salesrep_id=101'), no = h && h.answer && h.answer.number;
    const copyRows = rows(fs.readFileSync(copy, 'utf8')), oc = copyRows.map((r) => { try { return JSON.parse(r.parameters); } catch (e) { return {}; } }).find((o) => o.op_type === 'CRUD_CREATE' && String(o.table).toLowerCase() === 'c_order'), oid = oc && oc.fields && oc.fields.c_order_id;
    if (!no || !oid) judge('U9', null, 'the door did not make an order: ' + JSON.stringify(h).slice(0, 160));
    else {
      await page.evaluate((t) => window.__write(t), fs.readFileSync(copy, 'utf8'));
      await page.evaluate(() => window.__edit()); await page.waitForTimeout(1500);   // the commit re-hydrates the sidecar from the file
      const seen = await page.evaluate((id) => window.__crud.withTipQuery((q) => q('SELECT documentno FROM c_order WHERE c_order_id = ?', [id])), oid), fin = rows(await page.evaluate(() => window.__read())), ch9 = await page.evaluate(() => window.__chain());
      judge('U9 an order made by a REAL door process (no. ' + no + ', c_order_id ' + oid + ') is in the page: its tip fold has the row; file ' + fin.length + ' rows, 2 keys, verifyChain ok', Array.isArray(seen) && seen.length === 1 && String(seen[0].documentno) === String(no) && new Set(fin.map((r) => JSON.parse(r.parameters).signed_by)).size === 2 && ch9.ok === true, 'tip rows=' + JSON.stringify(seen) + ' ' + JSON.stringify(ch9));
    }
    // U6: permission answers prompt
    await page.evaluate(() => localStorage.setItem('__perm', 'prompt')); await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await inject(); await page.waitForTimeout(2500);
    const st6 = await page.evaluate(() => window.LedgerUi.state()), tx6 = await pillText(), att6 = await page.evaluate(() => window.__crud.ledgerInfo().attached);
    await page.evaluate(() => localStorage.removeItem('__perm'));
    judge('U6 permission answers prompt: the pill reads "click to re-grant" and does NOT attach', st6 === 'regrant' && att6 === false && /re-grant/.test(tx6), 'state=' + st6 + ' attached=' + att6 + ' text=' + tx6);
    if (st6 === 'regrant') { await page.click('#erp-ledger-pill'); await settleState('on'); }
    // U8
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 }); await inject();
    const on8 = await settleState('on', 20000); await page.waitForTimeout(3000);   // the page's own boot-time commit is still landing in the file (it joined at attach): detaching mid-commit lets it finish into the file, by design
    const file8 = await page.evaluate(() => window.__read());
    if (on8) { await page.click('#erp-ledger-pill'); await page.waitForTimeout(800); }
    judge('U8 a click on the attached pill detaches, forgets the handle; the file is unchanged', on8 && (await pillText()) === 'Ledger: off' && (await page.evaluate(() => window.__kept())) === 0 && (await page.evaluate(() => window.__read())) === file8, 'text=' + (await pillText()) + ' kept=' + (await page.evaluate(() => window.__kept())));
    // U7: the REAL native picker
    await page.evaluate(() => localStorage.setItem('__real_picker', '1')); await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.LedgerUi && document.getElementById('erp-ledger-pill'), null, { timeout: 60000 });
    const n7 = LOG.length, e7 = errs.length; await page.click('#erp-ledger-pill'); await page.waitForTimeout(2500);
    const l7 = LOG.slice(n7).filter((l) => /§LEDGERUI pick refused/.test(l));
    judge('U7 the REAL native picker (headless: it aborts): the page logs the refusal, the pill stays off, no page error', l7.length === 1 && /AbortError/.test(l7[0]) && (await pillText()) === 'Ledger: off' && errs.length === e7, l7[0] || 'no §LEDGERUI pick refused line');
  } catch (e) { judge('harness', null, e.message.split('\n')[0]); }
  if (process.env.LA_LOG || fail) LOG.filter((l) => /§LEDGER|§OPLOG-HYDRATE|rror/i.test(l)).slice(-40).forEach((l) => say('    · ' + l.slice(0, 220)));
  judge('page-errors', errs.length === 0, 'n=' + errs.length + ' ' + errs.slice(0, 2).join(' | '));
  say('§WITNESS_LEDGER_UI pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS'));
  await b.close(); server.close(); process.exit(fail || inc ? 1 : 0);
})();
