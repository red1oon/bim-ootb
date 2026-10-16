// ⚠ DO NOT REMOVE — W-PLUGIN-HYDRATE-LIVE (Host work H1; spec ~/Projects/Mfg/HOST_PLUGIN_LIFECYCLE_SPEC.md). READ THE LOG: §PLG-LIVE lines carry the numbers.
// THE ISSUE it proves/disproves, in a REAL browser: (1) a bundle (plugins/wip_token.mjs, a real shipped bundle) installs + starts through the page's PluginRegistry, its GL token {Production.WIP} resolves from the seed; (2) after a page RELOAD the registry
//   restores it ACTIVE from IndexedDB through registry.restore() (the path this lane changed) and the token is live again; (3) STOP removes the token (automatic undo) and a second reload does NOT bring it back (STOPPED is persisted).
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }); });
let fails = 0; const ok = (n, c, i) => { if (!c) fails++; console.log('  §PLG-LIVE ' + n + ' ' + (c ? 'PASS' : 'FAIL') + (c ? '' : ' ' + JSON.stringify(i))); };
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US';
  const browser = await chromium.launch({ args: ['--no-sandbox'] }); const ctx = await browser.newContext(); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const boot = async () => { await pg.goto(base, { waitUntil: 'networkidle' }); await pg.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && !!window.PluginRegistry, null, { timeout: 30000 }); };
  const state = () => pg.evaluate(() => { const r = window.PluginEngine._reg(); const x = r && r.get('com.example.wip-token'); const t = window.PostResolver && window.PostResolver.TOKENS && window.PostResolver.TOKENS['{Production.WIP}']; return { state: x ? x.state : null, token: !!t, resolved: t && t.resolved ? t.resolved.name : null }; });
  await boot();
  const s0 = await state(); ok('L0 before install: no bundle, no token', s0.state === null && !s0.token, s0);
  const url = await pg.evaluate(async () => { const r = window.PluginEngine._reg(); const u = new URL('plugins/wip_token.mjs', location.href).href; await r.installBundle(u); await r.startBundle('com.example.wip-token');
    // the pill persists the registry list to IndexedDB after each action (plugin_overlay _persist): emulate exactly that record shape
    await new Promise((res, rej) => { const rq = indexedDB.open('fold_plugins', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('kv'); rq.onsuccess = () => { const tx = rq.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(r.list(), 'bundles'); tx.oncomplete = res; tx.onerror = rej; }; rq.onerror = rej; }); return u; });
  const s1 = await state(); console.log('§PLG-LIVE-1 after start: ' + JSON.stringify(s1) + ' url=' + url);
  ok('L1 started through the page registry: ACTIVE and its token {Production.WIP} is contributed', s1.state === 'ACTIVE' && s1.token, s1);
  await boot(); await pg.waitForTimeout(500);   // NO manual ensure/open: the page's own boot must restore it
  const s2 = await state(); console.log('§PLG-LIVE-2 after RELOAD (restore from IndexedDB): ' + JSON.stringify(s2));
  ok('L2 a plain page reload restores the ACTIVE bundle at BOOT (no pill opened) and its token is live again', s2.state === 'ACTIVE' && s2.token, s2);
  const s3 = await pg.evaluate(async () => { const r = window.PluginEngine._reg(); await r.stopBundle('com.example.wip-token'); const t = window.PostResolver.TOKENS['{Production.WIP}']; return { state: r.get('com.example.wip-token').state, tokenGone: !t }; });
  ok('L3 STOP removes the token automatically (no hand-written cleanup beyond the bundle\'s own)', s3.state === 'STOPPED' && s3.tokenGone, s3);
  await pg.evaluate(async () => { const r = window.PluginEngine._reg(); await new Promise((res, rej) => { const rq = indexedDB.open('fold_plugins', 1); rq.onsuccess = () => { const tx = rq.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(r.list(), 'bundles'); tx.oncomplete = res; tx.onerror = rej; }; rq.onerror = rej; }); });
  await boot(); await pg.waitForTimeout(500);
  const s4 = await state(); console.log('§PLG-LIVE-4 after 2nd reload (was STOPPED): ' + JSON.stringify(s4));
  ok('L4 a STOPPED bundle is installed but NOT re-activated by the next reload (no token)', s4.state === 'INSTALLED' && !s4.token, s4);
  ok('L5 zero page errors across 3 loads', errs.length === 0, errs.slice(0, 3));
  console.log('§PLG-LIVE-VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' failed=' + fails); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§PLG-LIVE-VERDICT FAIL harness: ' + e.stack); process.exit(2); });
