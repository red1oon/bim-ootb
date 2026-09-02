// W-CONNECT-TIMELINE — Connect Scene P2 witness (prompts/CONNECT_SCENE_SPEC.md P2).
// CLAIM: the signed op-log IS the timeline. Two SEPARATE same-origin Modeller surfaces joined by the Connect
// broker author the SAME signed chain (identical deterministic op_hashes); a scrub on surface A broadcasts the
// op-cursor over the 'timeline' channel and surface B folds the one signed log to the SAME cursor. And the log
// folds TWO ways at once — geometry (meshes) AND records (rows) — so scrubbing BACK before a feature makes its
// geometry AND its record BOTH vanish, and forward restores both: one log, two folds, co-vanishing, in lockstep
// across surfaces. (3D draw GPU-gated; the MESH COUNT + RECORD COUNT + cross-surface §-log are the assertions.)
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
const meshCount = () => { const g = window.Bonsai.group && window.Bonsai.group(); return g ? g.children.filter(o => o.isMesh).length : -1; };
const recCount = () => { const el = document.getElementById('rec-count'); return el ? +el.textContent : -1; };
const state = "(" + (function () { const g = window.Bonsai.group && window.Bonsai.group(); const m = g ? g.children.filter(o => o.isMesh).length : -1; const el = document.getElementById('rec-count'); const r = el ? +el.textContent : -1; return { mesh: m, rec: r, cursor: window.Bonsai.oplog.cursor }; }).toString() + ")()";
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mk = (tag) => br.newPage().then(pg => {
    pg.on('console', m => { const t = m.text(); if (/^§(CONNECT-TL|MODELLER connecttl)/.test(t)) console.log('  [' + tag + '] ' + t); });
    pg.on('pageerror', e => console.log('  [' + tag + '] ERR ' + String(e).slice(0, 160)));
    return pg;
  });
  // A AUTHORS the 2-feature recipe into the shared store (the only author → no competing identity traffic).
  const A = await mk('A');
  await A.goto(`http://localhost:${port}/modeller.html?connecttl=demo&connect=1`, { waitUntil: 'load', timeout: 90000 });
  await A.waitForFunction('window.__connectTlReady === true && window.__connectTlResult.length === 2', { timeout: 120000 })
    .catch(() => console.log('  ✗ [A] connecttl not ready'));
  // B is a PASSIVE connected surface — restores A's shared store (length 2), then follows A's scrub over 'timeline'.
  const B = await mk('B');
  await B.goto(`http://localhost:${port}/modeller.html?connect=1`, { waitUntil: 'load', timeout: 90000 });
  await B.waitForFunction('window.Bonsai && window.Bonsai.oplog && window.Bonsai.oplog.length === 2 && window.Connect && window.Connect.on', { timeout: 120000 })
    .catch(() => console.log('  ✗ [B] did not restore shared store to length 2'));
  await new Promise(r => setTimeout(r, 400));

  // Scrub A to cursor 1 → B should fold to 1 (geometry 1 mesh, records 1). Drive A's shared-scrub seam and await it.
  await A.evaluate(() => window.__scrubShared(1, true));
  await new Promise(r => setTimeout(r, 600));
  const a1 = await A.evaluate(state), b1 = await B.evaluate(state);
  // Scrub A back to 0 → both empty (geometry gone, records gone).
  await A.evaluate(() => window.__scrubShared(0, true));
  await new Promise(r => setTimeout(r, 600));
  const a0 = await A.evaluate(state), b0 = await B.evaluate(state);
  // Scrub A forward to 2 → both restore.
  await A.evaluate(() => window.__scrubShared(2, true));
  await new Promise(r => setTimeout(r, 600));
  const a2 = await A.evaluate(state), b2 = await B.evaluate(state);

  await br.close(); server.close();

  const J = o => JSON.stringify(o);
  console.log('  §CONNECT-TIMELINE A@1=' + J(a1) + ' B@1=' + J(b1));
  console.log('  §CONNECT-TIMELINE A@0=' + J(a0) + ' B@0=' + J(b0));
  console.log('  §CONNECT-TIMELINE A@2=' + J(a2) + ' B@2=' + J(b2));
  const co = (s, mesh, rec) => s.mesh === mesh && s.rec === rec && s.cursor === (mesh);   // both folds + cursor agree
  const checks = {
    crossSurface_1: co(b1, 1, 1),                  // A's scrub crossed to B → B folded both projections to 1
    coVanish_0:     co(a0, 0, 0) && co(b0, 0, 0),  // scrub back before feature 1 → geometry AND records gone, both surfaces
    restore_2:      co(a2, 2, 2) && co(b2, 2, 2),  // forward → both folds restore, both surfaces
    twoFoldsTrack:  a1.mesh === a1.rec && b1.mesh === b1.rec   // the two folds move together (one log, two folds)
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §CONNECT-TIMELINE VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' ') + '  (3D draw GPU-gated 🟡)');
  process.exit(pass ? 0 : 1);
})();
