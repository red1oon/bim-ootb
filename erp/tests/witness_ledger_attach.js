#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LEDGER-ATTACH (bim-compiler prompts/CLI_ERP_IVR.md §55, ledger step 3 pieces (3)). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: the page kept its ops only in IndexedDB, so an order made at `red1>` was never in the browser. crud_overlay.attachLedger() makes a folder's JSONL the page's sidecar. The headless browser gives REAL
 *   File System Access handles through OPFS (no picker), so the page code runs against real swap-on-close semantics; the door half runs in Node on the file copied out and back.
 *   A1 attach to an empty folder with the page's own history of N ops: the file holds the N rows as they were; the page's verifyChain over the hydrated file is as before
 *   A2 a new page op after attach: the file gains exactly that group, ids continue, one chain, verifyChain ok on a re-hydrate
 *   A3 the file copied out is verified in Node by the DOOR's verifier (ledger_sign.verify) with only the page's PUBLIC key
 *   A4 the door appends 2 ops to the copy, the copy goes back; a page op then re-hydrates: the file holds page + door + page rows, the page's verifyChain (door key added as peer) is ok
 *   A5 attach to a file the door already wrote (M rows) with the page's history of N: M+N rows, the N rebased onto the tip (ids M+1..), v2 signatures unchanged, one chain
 *   A6 attach again to the first folder: nothing joined twice (op_uuid dedupe)
 *   A7 fold-back undo in file mode is refused with §LEDGER unsupported and changes nothing
 *   A8 the file lock spans the commit: with a door's lock file present the page's commit does NOT run, then runs when the lock goes
 * Falsifiers: LEDGER_ATTACH_BREAK=nojoin -> A1 FAIL; LEDGER_ATTACH_BREAK=nolock -> A8 FAIL.
 */
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const REPO = path.join(__dirname, '..', '..'), BREAK = process.env.LEDGER_ATTACH_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(REPO, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
let pass = 0, fail = 0, inc = 0; const say = (s) => console.log(s);
const judge = (id, ok, ev) => { if (ok === null) inc++; else if (ok) pass++; else fail++; say('  ' + (ok === null ? '⚪' : ok ? '✅' : '❌') + ' ' + id + '  ' + (ev || '')); };
(async () => {
  await new Promise((r) => server.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerattach_')), LS = (() => { process.env.RED1_DOOR_KEY = path.join(dir, 'door_key.json'); return require('../../common/door/ledger_sign.js'); })();
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), page = await b.newPage(), LOG = [], errs = [];
  page.on('console', (m) => LOG.push(m.text())); page.on('pageerror', (e) => errs.push(String(e)));
  try {
    await page.goto('http://localhost:' + server.address().port + '/erp/idempiere.html?login=GardenAdmin&window=146', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__crud && window.ErpSigner && window.ErpSigner.pubKeyHex && window.LedgerFile && window.KernelOps && window.__idmpDb, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    if (BREAK) await page.evaluate((v) => { window.__LEDGER_BREAK = v; }, BREAK);
    // helpers in the page
    await page.evaluate(() => {
      window.__fi = 0;
      window.__edit = () => new Promise((resolve) => { let done = false; const v = 'W-LEDGER-ATTACH ' + (window.__fi++);   // a Business Partner description: client 11's own record, so the CRUD gate accepts it
        const h = () => { if (done) return; done = true; window.removeEventListener('overlay:committed', h); resolve({ v }); }; window.addEventListener('overlay:committed', h);
        window.__crud.applyOp({ key: 'c_bpartner', table: 'C_BPartner', verb: 'update', ownerGated: false, op_type: 'CRUD_UPDATE', id: 112, changes: { Description: { old: window.__prev || null, new: v } }, actor: 100 }); window.__prev = v;
        setTimeout(() => { if (!done) { done = true; window.removeEventListener('overlay:committed', h); resolve({ v, timeout: true }); } }, 6000); });
      window.__idbCount = () => new Promise((res) => { const q = indexedDB.open('glassbowl_kernel_ops'); q.onsuccess = () => { const g = q.result.transaction('ops', 'readonly').objectStore('ops').getAll(); g.onsuccess = () => { const ids = {}; g.result.forEach((r) => { ids[r.id] = 1; }); res(Object.keys(ids).length); }; }; q.onerror = () => res(-1); });
      window.__opfs = async (n) => (await navigator.storage.getDirectory()).getDirectoryHandle(n, { create: true });
      window.__read = async (n) => { try { const d = await window.__opfs(n); return await (await (await d.getFileHandle('ops.jsonl')).getFile()).text(); } catch (e) { return ''; } };
      window.__write = async (n, t) => { const d = await window.__opfs(n), w = await (await d.getFileHandle('ops.jsonl', { create: true })).createWritable(); await w.write(t); await w.close(); };
      window.__chain = async () => { const v = await window.KernelOps.verifyChain(window.__crud.kernelDb()); return { ok: v.ok, len: v.len, why: v.why }; };
    });
    const settle = async () => { let last = -2, same = 0; for (let i = 0; i < 40 && same < 4; i++) { const c = await page.evaluate(() => window.__idbCount()); same = c === last ? same + 1 : 0; last = c; await page.waitForTimeout(300); } return last; };
    const rows = (t) => t.split('\n').filter(Boolean).map(JSON.parse);
    // history before any attach
    await page.evaluate(() => window.__edit()); await page.evaluate(() => window.__edit()); await settle();
    const pre = await page.evaluate(async () => ({ info: window.__crud.ledgerInfo(), chain: await window.__chain(), idb: await window.__idbCount() })), N = pre.idb;   // N = the rows in the page's IndexedDB store (the sidecar view can be one commit behind)
    say('§W-LEDGER-ATTACH page history before attach: ' + N + ' ops, chain ' + JSON.stringify(pre.chain));
    // A1
    const a1 = await page.evaluate(async () => { const d = await window.__opfs('L1'); const r = await window.__crud.attachLedger(d, 'ops.jsonl'); return { r, text: await window.__read('L1'), chain: await window.__chain(), info: window.__crud.ledgerInfo() }; });
    const r1 = rows(a1.text);
    judge('A1 attach to an empty folder: the file holds the page\'s ' + N + ' ops (' + r1.length + ' rows), ids 1..N in order, chain as before (' + JSON.stringify(a1.chain) + ')', a1.r.ok === true && r1.length === N && r1.every((x, i) => x.id === i + 1) && a1.chain.ok === true && a1.chain.len === N && N >= 2, JSON.stringify(a1.r) + ' ' + JSON.stringify(a1.info));
    // A2
    await page.evaluate(() => window.__edit()); await page.waitForTimeout(600);
    const a2 = await page.evaluate(async () => ({ text: await window.__read('L1'), chain: await window.__chain() })), r2 = rows(a2.text);
    judge('A2 one more page op: the file gains exactly that group (' + (r2.length - N) + ' rows), ids continue, prev_hash links, verifyChain ok', r2.length > N && r2.every((x, i) => x.id === i + 1 && (i === 0 || x.prev_hash === r2[i - 1].op_hash)) && a2.chain.ok === true && a2.chain.len === r2.length, JSON.stringify(a2.chain));
    // A3
    const copy = path.join(dir, 'copy.jsonl'), pubf = path.join(dir, 'page_pub.json'); fs.writeFileSync(copy, a2.text);
    fs.writeFileSync(pubf, JSON.stringify(await page.evaluate(() => window.ErpSigner.pubKeyJwk)));
    const v3 = await LS.verify(copy, pubf);
    judge('A3 the door\'s verifier (ledger_sign.verify), given only the page\'s public key, accepts the page\'s file', v3.ok === true && v3.len === r2.length, JSON.stringify(v3));
    // A4
    const t0 = fs.readFileSync(copy, 'utf8').split('\n').filter(Boolean).length;
    LS.append(copy, [{ op_type: 'CRUD_UPDATE', table: 'c_order', id: 50000, changes: { description: { new: 'door-1' } }, t: new Date().toISOString() }, { op_type: 'CRUD_UPDATE', table: 'c_order', id: 50000, changes: { description: { new: 'door-2' } }, t: new Date().toISOString() }]);
    const doorText = fs.readFileSync(copy, 'utf8');
    await page.evaluate((t) => window.__write('L1', t), doorText);
    await page.evaluate(() => window.__edit()); await page.waitForTimeout(600);
    const a4 = await page.evaluate(async () => ({ text: await window.__read('L1'), chain: await window.__chain() })), r4 = rows(a4.text), kids = new Set(r4.map((x) => JSON.parse(x.parameters).signed_by));
    judge('A4 the door added 2 rows; the next page op chains after them: ' + r4.length + ' rows, 2 keys, the page\'s verifyChain (door key as peer) ok', r4.length > t0 + 2 && kids.size === 2 && a4.chain.ok === true && a4.chain.len === r4.length, 'before=' + t0 + ' keys=' + kids.size + ' ' + JSON.stringify(a4.chain));
    // A5: attach to a file the door already wrote, with the page's history
    const doorOnly = path.join(dir, 'door_only.jsonl'); LS.append(doorOnly, [{ op_type: 'CRUD_UPDATE', table: 'c_order', id: 50000, changes: { description: { new: 'd1' } }, t: new Date().toISOString() }, { op_type: 'CRUD_UPDATE', table: 'c_order', id: 50000, changes: { description: { new: 'd2' } }, t: new Date().toISOString() }]);
    const M = 2, hist = await page.evaluate(async () => { window.__crud.detachLedger(); await new Promise((r) => setTimeout(r, 300)); return window.__crud.ledgerInfo(); });
    await page.evaluate((t) => window.__write('L2', t), fs.readFileSync(doorOnly, 'utf8'));
    const a5 = await page.evaluate(async () => { const d = await window.__opfs('L2'); const r = await window.__crud.attachLedger(d, 'ops.jsonl'); return { r, text: await window.__read('L2'), chain: await window.__chain() }; });
    const r5 = rows(a5.text);
    judge('A5 attach to a door-written file (' + M + ' rows) with the page\'s own history: ' + r5.length + ' rows, the rest rebased onto the tip (ids ' + (M + 1) + '..), one chain, verifyChain ok', a5.r.ok === true && a5.r.fileRows === M && r5.length === M + a5.r.joined && a5.r.joined >= N && r5.every((x, i) => x.id === i + 1 && (i === 0 || x.prev_hash === r5[i - 1].op_hash)) && a5.chain.ok === true, JSON.stringify(a5.r) + ' ' + JSON.stringify(a5.chain) + ' idb-view-after-detach=' + JSON.stringify(hist));
    // A6
    const a6 = await page.evaluate(async () => { window.__crud.detachLedger(); await new Promise((r) => setTimeout(r, 300)); const d = await window.__opfs('L2'); const before = (await window.__read('L2')).split('\n').filter(Boolean).length; const r = await window.__crud.attachLedger(d, 'ops.jsonl'); return { r, before, after: (await window.__read('L2')).split('\n').filter(Boolean).length }; });
    judge('A6 attach again to the same folder: nothing is joined twice', a6.r.ok === true && a6.r.joined === 0 && a6.before === a6.after, JSON.stringify(a6));
    // A7
    const n7 = LOG.length, a7b = (await page.evaluate(() => window.__read('L2'))).length;
    await page.evaluate(() => window.crudFoldBack && window.crudFoldBack('ad_field', 'DR', 'CO')); await page.waitForTimeout(300);
    const a7 = (await page.evaluate(() => window.__read('L2'))).length, l7 = LOG.slice(n7).filter((l) => /§LEDGER unsupported/.test(l));
    judge('A7 fold-back undo in file mode is refused (§LEDGER unsupported) and the file is unchanged', l7.length === 1 && a7 === a7b, 'lines=' + l7.length + ' bytes ' + a7b + '->' + a7);
    // A8: the lock spans the commit
    const a8 = await page.evaluate(async () => {
      const d = await window.__opfs('L2'), lk = await d.getFileHandle('ops.jsonl.lock', { create: true }), w = await lk.createWritable(); await w.write('pid:1'); await w.close();
      const n0 = (await window.__read('L2')).split('\n').filter(Boolean).length; let finished = false;
      const p = window.__edit().then((x) => { finished = true; return x; });
      await new Promise((r) => setTimeout(r, 1800)); const during = finished, nDuring = (await window.__read('L2')).split('\n').filter(Boolean).length;
      await d.removeEntry('ops.jsonl.lock'); const res = await p; await new Promise((r) => setTimeout(r, 400));
      return { during, nDuring, n0: (n0), after: (await window.__read('L2')).split('\n').filter(Boolean).length, res };
    });
    judge('A8 a door\'s lock file stops the page commit (nothing written while it is held), and the commit goes through when it is released', a8.during === false && a8.nDuring === a8.n0 && a8.after > a8.n0 && !a8.res.timeout, JSON.stringify(a8));
  } catch (e) { judge('harness', null, e.message.split('\n')[0]); }
  if (process.env.LA_LOG || fail) LOG.filter((l) => /§LEDGER|§OPLOG|§CRUD|§KRN_CHAIN|ledger|refused|REJECT|rror/i.test(l)).slice(-60).forEach((l) => say('    · ' + l.slice(0, 230)));
  judge('page-errors', errs.length === 0, 'n=' + errs.length + ' ' + errs.slice(0, 2).join(' | '));
  say('§WITNESS_LEDGER_ATTACH pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS'));
  await b.close(); server.close(); process.exit(fail || inc ? 1 : 0);
})();
