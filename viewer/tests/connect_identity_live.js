// W-CONNECT-IDENTITY — Connect Scene P3 witness (prompts/CONNECT_SCENE_SPEC.md P3).
// CLAIM: a commit in one surface appends to the shared signed chain → it broadcasts {tip,length} over the
// 'identity' channel → a connected surface RE-FOLDS the shared signed store and reflects the new feature live,
// with verifyChain holding throughout (still one signed log). Two separate Modeller surfaces share the signed
// op-log via its persisted store; surface A commits a 2nd feature → surface B grows to match, geometry reflects
// it, chain verifies. (3D draw GPU-gated; length + mesh count + verifyChain + the cross-surface §-log assert it.)
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.map': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
const probe = "(async () => { const O = window.Bonsai.oplog; const g = window.Bonsai.group && window.Bonsai.group(); const mesh = g ? g.children.filter(o => o.isMesh).length : -1; let ok = null; try { ok = (await O.verify()).ok; } catch (e) { ok = 'ERR'; } return { length: O.length, mesh, verify: ok }; })()";
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mkPage = (tag) => br.newPage().then(pg => {
    pg.on('console', m => { const t = m.text(); if (/^§(CONNECT-ID|MODELLER connectid|OPLOG reload)/.test(t)) console.log('  [' + tag + '] ' + t); });
    pg.on('pageerror', e => console.log('  [' + tag + '] ERR ' + String(e).slice(0, 160)));
    return pg;
  });
  // A AUTHORS (clear + insert 1) into the shared signed store, then enables Connect.
  const A = await mkPage('A');
  await A.goto(`http://localhost:${port}/modeller.html?connectid=demo&connect=1`, { waitUntil: 'load', timeout: 90000 });
  await A.waitForFunction('window.__connectIdReady === true && window.__connectIdResult.length === 1', { timeout: 120000 })
    .catch(() => console.log('  ✗ [A] connectid not ready'));
  // B is a PASSIVE connected surface (?connect=1, NO clear) — its boot restore reads A's shared store → length 1.
  const B = await mkPage('B');
  await B.goto(`http://localhost:${port}/modeller.html?connect=1`, { waitUntil: 'load', timeout: 90000 });
  await B.waitForFunction('window.Bonsai && window.Bonsai.oplog && window.Bonsai.oplog.length === 1 && window.Connect && window.Connect.on', { timeout: 120000 })
    .catch(() => console.log('  ✗ [B] did not restore shared store to length 1'));

  // Baseline: both at length 1 (shared store, identical recipe).
  const a0 = await A.evaluate(probe), b0 = await B.evaluate(probe);
  // A COMMITS a second feature → grows the shared signed chain → broadcasts identity {tip, length:2}.
  await A.evaluate(() => window.__insertSecond());
  await new Promise(r => setTimeout(r, 1200));
  // B should have re-folded the shared store to length 2, geometry reflects it, chain still verifies.
  const a1 = await A.evaluate(probe), b1 = await B.evaluate(probe);

  await br.close(); server.close();

  const J = o => JSON.stringify(o);
  console.log('  §CONNECT-IDENTITY baseline A=' + J(a0) + ' B=' + J(b0));
  console.log('  §CONNECT-IDENTITY afterCommit A=' + J(a1) + ' B=' + J(b1));
  const checks = {
    baseline:     a0.length === 1 && b0.length === 1,
    committerGrew: a1.length === 2 && a1.mesh === 2 && a1.verify === true,
    peerReFolded:  b1.length === 2 && b1.mesh === 2,             // B reflected A's commit live over the shared store
    chainVerifies: b1.verify === true                            // still ONE signed log (verifyChain holds on B)
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §CONNECT-IDENTITY VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' ') + '  (3D draw GPU-gated 🟡)');
  process.exit(pass ? 0 : 1);
})();
