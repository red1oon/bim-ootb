// W-CONNECT-BUS — Connect Scene P0 witness (prompts/CONNECT_SCENE_SPEC.md P0).
// CLAIM: the broker `window.Connect` lets two SEPARATE surfaces (a 'modeller' host + an embedded 'viewer'
// peer, distinct documents) exchange a ping ROUND-TRIP with ACK over auto-detected postMessage transport,
// and the opt-in TOGGLE gates ALL cross-surface traffic — off on either end ⇒ zero ACKs. Surfaces stay
// permanently separate (no shared DOM); only CONTEXT crosses. This is the bus P1–P3 channels ride on.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-connect', 'viewer');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/tests/connect_harness.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§CONNECT/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/tests/connect_harness.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__connectReady === true', { timeout: 30000 })
    .catch(() => console.log('  ✗ timeout waiting for __connectReady'));

  const peerFrame = pg.frames().find(f => /connect_peer\.html/.test(f.url()));

  // 1) both ON → ping round-trip should ACK from 'viewer'
  const bothOn = await pg.evaluate(async () => { window.Connect.enable(); return await window.Connect.ping(400); });
  // 2) host OFF → publish/ping gated at the sender → 0 acks
  const hostOff = await pg.evaluate(async () => { window.Connect.disable(); return await window.Connect.ping(400); });
  // 3) host ON again, but PEER OFF → inbound ping dropped at receiver → 0 acks (gating works on either end)
  await peerFrame.evaluate(() => window.Connect.disable());
  const peerOff = await pg.evaluate(async () => { window.Connect.enable(); return await window.Connect.ping(400); });
  // 4) peer ON again → round-trip restored
  await peerFrame.evaluate(() => window.Connect.enable());
  const restored = await pg.evaluate(async () => await window.Connect.ping(400));

  await br.close(); server.close();

  const a = (arr) => Array.isArray(arr) ? arr : [];
  console.log('  §CONNECT-BUS bothOn=[' + a(bothOn).join(',') + '] hostOff=[' + a(hostOff).join(',') +
    '] peerOff=[' + a(peerOff).join(',') + '] restored=[' + a(restored).join(',') + ']');

  const checks = {
    roundTrip:   a(bothOn).length === 1 && a(bothOn)[0] === 'viewer',   // ACK came back from the OTHER surface
    gateSender:  a(hostOff).length === 0,                               // toggle off at sender ⇒ no traffic
    gateReceiver:a(peerOff).length === 0,                               // toggle off at receiver ⇒ no ACK
    restores:    a(restored).length === 1 && a(restored)[0] === 'viewer'// re-enabling both restores the bus
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §CONNECT-BUS VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' '));
  process.exit(pass ? 0 : 1);
})();
