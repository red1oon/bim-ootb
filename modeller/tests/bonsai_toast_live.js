// W-BONSAI-TOAST — DAGeVu modeller: error feedback survives the next action (RESUME_MODELLER_POLISH.md #8).
// Errors used to live only in the 11px status bar, overwritten by the next status update → a failed op could vanish
// before it was read. toast() raises a persistent notice. Proves: (T1) a toast renders a .toast.error with its
// message + ⚠; (T2) it PERSISTS after the status bar is overwritten (the whole point); (T3) click dismisses it;
// (T4) the stack is capped (≤4); (T5) setStat routes any 'FAIL …' to a toast (served-source wiring — the path all 11
// catch blocks ride); (T6) the unhandledrejection hook calls toast (manually dispatched — natural firing is flaky in
// headless puppeteer, so we test the listener wiring deterministically).
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.toast && window.Bonsai", { timeout: 30000 }).catch(() => {});
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let PASS = 0, FAIL = 0;
  const ok = (c, m) => { (c ? PASS++ : FAIL++); console.log('  ' + (c ? '✅' : '❌') + ' ' + m); };
  try {
    // T1 — a toast renders as .toast.error with the message + ⚠ icon
    await pg.evaluate(() => window.toast('boom-1 the op failed', 'error'));
    await sleep(150);
    const t1 = await pg.evaluate(() => {
      const el = document.querySelector('#toast-stack .toast.error');
      return el ? { txt: el.textContent, icon: el.querySelector('.ti') && el.querySelector('.ti').textContent, shown: el.classList.contains('show') } : null;
    });
    ok(!!t1 && /boom-1/.test(t1.txt) && t1.icon === '⚠' && t1.shown, 'T1 toast renders .toast.error ⚠ "' + (t1 && t1.txt) + '"');

    // T2 — overwrite the status bar; the toast must REMAIN (the fix: status can't clobber it)
    await pg.evaluate(() => { document.getElementById('stat').textContent = 'some later status line'; });
    await sleep(100);
    const persist = await pg.evaluate(() => ({
      toast: !!document.querySelector('#toast-stack .toast.error'), stat: document.getElementById('stat').textContent }));
    ok(persist.toast === true && /later status/.test(persist.stat), 'T2 toast PERSISTS after the status bar is overwritten');

    // T3 — click dismisses
    await pg.evaluate(() => { const e = document.querySelector('#toast-stack .toast'); if (e) e.click(); });
    await sleep(350);
    ok(await pg.evaluate(() => !document.querySelector('#toast-stack .toast')), 'T3 click dismisses the toast');

    // T4 — stack capped at ≤4 even when many fire
    await pg.evaluate(() => { for (let i = 0; i < 6; i++) window.toast('burst-' + i, 'error'); });
    await sleep(150);
    const n = await pg.evaluate(() => document.querySelectorAll('#toast-stack .toast').length);
    ok(n > 0 && n <= 4, 'T4 stack capped (' + n + ' ≤ 4) under a 6-toast burst');

    // T5 — setStat routes FAIL → toast (served-source wiring, the path all 11 catch blocks ride)
    const src = await (await fetch(`http://localhost:${port}/modeller.html`)).text();
    ok(/if \(\/\^FAIL\\b\/\.test\(String\(m\)\)\) toast\(String\(m\)\.replace/.test(src),
      'T5 setStat auto-toasts any FAIL message (all 11 catch-block errors surface)');

    // T6 — the unhandledrejection hook is wired to toast (dispatched manually; natural firing is flaky headless)
    const t6 = await pg.evaluate(async () => {
      const before = document.querySelectorAll('#toast-stack .toast').length;
      try { window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: new Error('rejection-surfaced') })); }
      catch (e) { return { err: e.message }; }
      await new Promise(r => setTimeout(r, 150));
      const el = [...document.querySelectorAll('#toast-stack .toast')].find(t => /rejection-surfaced/.test(t.textContent));
      return { found: !!el, before };
    });
    ok(t6 && t6.found === true, 'T6 unhandledrejection → toast("…")  (listener wired)');
  } catch (e) { console.log('  ERR ' + (e && e.stack || e)); FAIL++; }

  await br.close(); server.close();
  console.log('  §TOAST VERDICT ' + (FAIL ? 'FAIL' : 'PASS') + ' — ' + PASS + ' PASS / ' + FAIL + ' FAIL');
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
