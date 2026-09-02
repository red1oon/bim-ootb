// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness that DISPOSABLE-HOST PERSISTENCE is wired into the live app on the REAL
//   signed op-log (prompts/ERP_SUBSTRATE_INTEGRATION.md Phase 2 slice B — §INTEG-WIRE-B). THE CLAIM:
//     1. backup — with real double-entry POST ops in the live `glassbowl_kernel_ops` sidecar,
//        window.ErpPersist.backup() seals + signs the tip with the EDGE key → a portable signed snapshot
//        (carries the exporting device's pubkey + fingerprint). signed=Y.
//     2. tamper REJECTED — a snapshot with one op rewritten is rejected by restore (recomputed tip !=
//        signed tip / signature invalid) — the books cannot be silently forged.
//     3. FRESH DEVICE — a NEW browser context (fresh IndexedDB ⇒ a DIFFERENT edge key, i.e. a new
//        device) restores the GENUINE backup: replay recomputes tip == signed tip, books == expected
//        net DR−CR to the cent, adopted + persisted; a reload keeps them. Recovery via the FILE the user
//        owns, not any host — the host/device is disposable.
//   NON-INVENT: POST ops are the app's real §13.1 shape; recovered books come from the replayed signed
//   snapshot, nowhere else. §-log first — READ poc_persist_wire.log before any conclusion.
// Run:  node tests/poc_persist_wire.js 2>&1 | tee tests/poc_persist_wire.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.wasm':'application/wasm', '.css':'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/glassbowl.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
const ready = (page) => page.waitForFunction(
  () => window.ErpPersist && window.ErpReplicaClient && window.KernelOps && window.ErpSigner && window.__crud,
  { timeout: 25000 });
const sidecarUp = (page) => page.waitForFunction(
  () => typeof window.initSqlJs === 'function' && window.__crud && window.__crud.kernelDb && window.__crud.kernelDb() != null,
  { timeout: 25000 }).then(() => true).catch(() => false);

// the app's REAL §13.1 POST shape — a sales invoice (AR/Revenue) + its payment (Cash/AR).
const POSTS = [
  { table: 'C_Invoice', id: 109, lines: [ { account_id: '101', amtacctdr: 434.13, amtacctcr: 0 }, { account_id: '400', amtacctdr: 0, amtacctcr: 434.13 } ] },
  { table: 'C_Payment', id: 77,  lines: [ { account_id: '108', amtacctdr: 434.13, amtacctcr: 0 }, { account_id: '101', amtacctdr: 0, amtacctcr: 434.13 } ] },
];
const EXPECT = { '101': 0, '400': -43413, '108': 43413 };   // net DR−CR cents (AR settles to 0)

function balEq(a, b) { const ks = {}; let max = 0; for (const k in a) ks[k] = 1; for (const k in b) ks[k] = 1;
  for (const k in ks) max = Math.max(max, Math.abs((a[k] | 0) - (b[k] | 0))); return max; }

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const url = `http://localhost:${port}/glassbowl.html`;
  const errs = [];
  const browser = await chromium.launch();

  // ── device 1: seed real POST ops, then BACKUP (export+sign) ──
  const ctx1 = await browser.newContext();   // device 1 IDB
  const page = await ctx1.newPage();
  page.on('pageerror', e => errs.push('d1:' + e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  const wired = await ready(page).then(() => true).catch(() => false);
  const hasRender = await page.evaluate(() => typeof window.ErpPersist.renderInto === 'function');
  console.log('§WIREB-SIDECAR initSqlJs+sidecar-built=' + await sidecarUp(page));

  const seeded = await page.evaluate((posts) => new Promise((res) => {
    window.__crud.withSidecar((db) => {
      try { posts.forEach(p => window.KernelOps.commitOp(db, 'POST', p)); window.__crud.persist();
        setTimeout(() => res({ ok: true, n: posts.length }), 300); }
      catch (e) { res({ ok: false, err: String(e && e.message || e) }); }
    });
  }), POSTS);
  console.log('§WIREB-SEED ops=' + (seeded && seeded.n) + ' ok=' + (seeded && seeded.ok) + (seeded && seeded.err ? ' err=' + seeded.err : ''));

  const snap = await page.evaluate(() => window.ErpPersist.backup().then(s => ({ ok: true, s })).catch(e => ({ ok: false, err: String(e && e.message || e) })));
  const s = snap && snap.s;
  console.log('§WIREB-BACKUP ok=' + (snap && snap.ok) + (snap && snap.err ? ' err=' + snap.err : '') +
    (s ? ' ops=' + s.ops.length + ' signed=' + (s.sig ? 'Y' : 'N') + ' fp=' + s.fp + ' tip=' + (s.tip || '').slice(0, 12) : ''));
  const backupOk = !!(s && s.ops.length === POSTS.length && s.sig && s.fp && s.tip && s.pub_jwk);

  // ── TAMPER — rewrite one op; restore must REJECT (in the SAME device for speed) ──
  const tampered = JSON.parse(JSON.stringify(s));
  tampered.ops[0].parameters = JSON.stringify({ table: 'C_Invoice', id: 109, lines: [ { account_id: '101', amtacctdr: 9999.99, amtacctcr: 0 }, { account_id: '400', amtacctdr: 0, amtacctcr: 9999.99 } ] });
  const tRes = await page.evaluate((t) => window.ErpPersist.restore(t).then(r => ({ ok: true, r })).catch(e => ({ ok: false, err: String(e && e.message || e) })), JSON.stringify(tampered));
  const tr = tRes && tRes.r;
  console.log('§WIREB-TAMPER restoreReturned=' + (tRes && tRes.ok) + ' accepted=' + (tr && tr.ok) + ' reason=' + (tr && tr.reason || (tRes && tRes.err) || '-'));
  const tamperRejected = !!(tRes && tRes.ok && tr && tr.ok === false);

  // ── device 2: a FRESH context (new IDB ⇒ fresh edge key) RESTORES the genuine backup ──
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  page2.on('pageerror', e => errs.push('d2:' + e.message));
  await page2.goto(url, { waitUntil: 'networkidle' });
  await ready(page2).catch(() => {});
  await sidecarUp(page2);
  // the fresh device's OWN edge key fingerprint — must DIFFER from the backup's (proves cross-device).
  const freshFp = await page2.evaluate(() => window.ErpSigner.loadOrMint('bim_erp_signer')
    .then(kp => crypto.subtle.exportKey('jwk', kp.publicKey))
    .then(j => crypto.subtle.digest('SHA-256', new TextEncoder().encode((j.x||'')+'|'+(j.y||''))))
    .then(d => Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,8)));
  const rRes = await page2.evaluate((js) => window.ErpPersist.restore(js).then(r => ({ ok: true, r })).catch(e => ({ ok: false, err: String(e && e.message || e) })), JSON.stringify(s));
  const rr = rRes && rRes.r;
  console.log('§WIREB-FRESH freshDeviceKeyFp=' + freshFp + ' backupKeyFp=' + (s && s.fp) +
    ' restoreOk=' + (rr && rr.ok) + ' books=' + JSON.stringify(rr && rr.books) + (rRes && rRes.err ? ' err=' + rRes.err : ''));
  const crossDevice = freshFp && s && freshFp !== s.fp;
  const recoverOk = !!(rr && rr.ok && balEq(rr.books, EXPECT) === 0);

  // reload the fresh device — restored books must survive (persisted op-log replays on boot).
  const afterReload = await page2.reload({ waitUntil: 'networkidle' }).then(() => ready(page2)).then(() => sidecarUp(page2)).then(() =>
    page2.evaluate(() => new Promise((res) => { window.__crud.withSidecar((db) => {
      try { res(window.ErpPeriodClose.foldBalances(window.KernelOps.replayOps(db), null).bal || {}); }
      catch (e) { res({ err: String(e && e.message || e) }); } }); }))).catch(e => ({ err: String(e) }));
  console.log('§WIREB-RELOAD afterReloadBooks=' + JSON.stringify(afterReload));
  const persistOk = balEq(afterReload, EXPECT) === 0;

  // ── verdict ──
  console.log('   ' + (wired ? '🟢' : '🔴') + ' W1 substrate wired into app (ErpPersist/ErpReplicaClient/KernelOps/ErpSigner/__crud) renderInto=' + hasRender);
  console.log('   ' + (backupOk ? '🟢' : '🔴') + ' W2 backup = signed snapshot (real POST ops, edge-signed, carries pubkey+fingerprint)');
  console.log('   ' + (tamperRejected ? '🟢' : '🔴') + ' W3 FALSIFIER: a tampered backup is REJECTED by restore (no silent forge)');
  console.log('   ' + (crossDevice ? '🟢' : '🔴') + ' W4 fresh device has a DIFFERENT edge key, yet accepts the owner\'s backup (recover via the file, host disposable)');
  console.log('   ' + (recoverOk ? '🟢' : '🔴') + ' W5 fresh-device restore recovers the books to the cent (== expected net DR−CR)');
  console.log('   ' + (persistOk ? '🟢' : '🔴') + ' W6 reload keeps the restored books (adopted op-log persists + replays)');

  const pass = wired && hasRender && backupOk && tamperRejected && crossDevice && recoverOk && persistOk && errs.length === 0;
  console.log('§INTEG-WIRE-B-RESULT ' + (pass ? 'PASS' : 'FAIL') + ' pageErrors=' + (errs.length ? errs.join('|') : 0));
  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
