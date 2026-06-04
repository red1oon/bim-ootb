// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness that the Share pill CAPTURES and RESTORES full ERP context (erp.html).
//   THE CLAIM (docs/ERP_SHARE_SPEC.md): the pill emits a URL with the SAME params erp.html restores on
//   load (client/window/record), and a fresh load of that URL lands on the same window+record.
//     1. §SHARE-CAPTURE — open a window holding records; ADUI.getContext() carries window+record;
//        ADUI.buildShareUrl() emits ?client=&window=&record=.
//     2. §SHARE-RESTORE — open that URL in a FRESH page; after hydrate, ADUI.getContext() restores the
//        SAME window+record (screen=window). Symmetric round-trip → the recipient lands where the sender was.
//   Issue it disproves: "the share pill copies a bare URL and the recipient lands on the home globe."
//   §-log first — READ tests/poc_share_roundtrip.log before any conclusion.
// Run:  node tests/poc_share_roundtrip.js 2>&1 | tee tests/poc_share_roundtrip.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/erp.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

function hydrateWaiter(page) {            // resolves when ADUI actually hydrates the DB (windows openable)
  let done = false;
  page.on('console', m => { if (m.text().includes('§AD_UI hydrate done')) done = true; });
  return async () => {
    for (let i = 0; i < 200 && !done; i++) await page.waitForTimeout(100);  // up to 20s
    if (!done) throw new Error('hydrate-timeout');
    await page.waitForFunction(() =>
      window.AD_MANIFEST && window.AD_MANIFEST.windows &&
      Object.keys(window.AD_MANIFEST.windows).length > 0, { timeout: 5000 });
    await page.waitForTimeout(800);
  };
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const base = `http://localhost:${port}/erp.html`;
  const browser = await chromium.launch();

  // ── Sender: open a window with records, capture the share URL ──
  const sender = await browser.newPage();
  const sErr = []; sender.on('pageerror', e => sErr.push(e.message));
  const sHydrated = hydrateWaiter(sender);
  await sender.goto(base, { waitUntil: 'networkidle' });
  await sHydrated();

  const capture = await sender.evaluate(() => {
    const ids = Object.keys(window.AD_MANIFEST.windows);
    // Prefer a window that has records (witnesses record-level too); else first window (window-level).
    let firstId = null;
    for (const id of ids) {
      window.ADUI.openWindow(Number(id));
      if (firstId === null) firstId = Number(id);
      if (window.ADUI.getRecordCount() > 0) {
        return { ok: true, level: 'record', id: Number(id), ctx: window.ADUI.getContext(),
                 url: window.ADUI.buildShareUrl(), recCount: window.ADUI.getRecordCount() };
      }
    }
    window.ADUI.openWindow(firstId);              // no business rows in this seed → window-level capture
    return { ok: true, level: 'window', id: firstId, ctx: window.ADUI.getContext(),
             url: window.ADUI.buildShareUrl(), recCount: 0 };
  });
  console.log('§SHARE-CAPTURE ' + JSON.stringify(capture));

  // ── Recipient: open the captured URL fresh, assert context restores ──
  let restore = { ok: false };
  if (capture.ok) {
    const url = capture.url.replace(/^https?:\/\/[^/]+\/[^?]*/, base);  // re-point origin to local server
    const rcv = await browser.newPage();
    const rErr = []; rcv.on('pageerror', e => rErr.push(e.message));
    const rHydrated = hydrateWaiter(rcv);
    await rcv.goto(url, { waitUntil: 'networkidle' });
    await rHydrated();
    await rcv.waitForTimeout(1500);               // let _restoreDeepLink run post-hydrate
    restore = await rcv.evaluate(() => window.ADUI.getContext());
    restore.pageErr = rErr.length;
    console.log('§SHARE-RESTORE url=' + url + ' ctx=' + JSON.stringify(restore));
    await rcv.screenshot({ path: path.join(__dirname, 'share_restore.png') });
  }

  const winOk = capture.ok && capture.ctx.window != null &&
    String(restore.window) === String(capture.ctx.window) && restore.screen === 'window';
  // record asserted ONLY if the seed carried a record to capture (non-invent — this seed is metadata-only)
  const recOk = capture.ctx && capture.ctx.record == null
    ? true
    : String(restore.record) === String(capture.ctx.record);
  const clientOk = String(restore.client) === String(capture.ctx.client);
  const pass = winOk && recOk && clientOk && (restore.pageErr || 0) === 0 && sErr.length === 0;
  console.log('§SHARE-ROUNDTRIP ' + (pass ? 'PASS' : 'FAIL') + ' level=' + capture.level +
    ' captured(client=' + capture.ctx.client + ',win=' + capture.ctx.window + ',rec=' + (capture.ctx.record != null ? capture.ctx.record : 'none-in-seed') + ')' +
    ' restored(client=' + restore.client + ',win=' + restore.window + ',rec=' + (restore.record != null ? restore.record : '-') + ')');

  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
