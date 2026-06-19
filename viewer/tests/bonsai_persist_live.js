// W-BONSAI-PERSIST — persistence witness (operability leg 3). prompts/BONSAI_KERNEL_RESEARCH.md.
// CLAIM: authored work SURVIVES A RELOAD. The signed op-log autosaves to localStorage on every change and is
// restored + re-folded on boot. Fixes the "reload loses everything" blocker. Same browser context, two loads.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-bonsai', 'viewer');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const url = `http://localhost:${port}/modeller.html`;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|LIBRARY|KRN)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));

  // --- LOAD 1: author a wall + a door, which autosaves to localStorage ---
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true', { timeout: 60000 }).catch(() => {});
  const a = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog; O.clear();
    await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]] }, depth: 3 } });
    const door = window.Bonsai.library.catalog().find(c => c.ifc_class === 'IfcDoor');
    await O.commit({ op_type: 'GEOM_INSERT', parameters: { hash: door.hash, placement: { x: 6, y: 1, z: 0, rot: 0 }, lod: '200' } });
    return { len: O.length, tip: ((await O.verify()).tip || '').slice(0, 12), saved: !!localStorage.getItem('bonsai_model_v1') };
  }).catch(e => ({ err: String(e) }));
  console.log('  §BONSAI-PERSIST authored len=' + a.len + ' tip=' + a.tip + ' savedToLocalStorage=' + a.saved);

  // --- LOAD 2: reload (same context → localStorage persists). restore() should re-fold the saved model. ---
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__restoreDone === true', { timeout: 60000 }).catch(() => console.log('  ✗ no __restoreDone'));
  const b = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog; for (let i = 0; i < 60 && !O.db; i++) await new Promise(r => setTimeout(r, 50));
    const v = await O.verify(); const g = window.Bonsai.group && window.Bonsai.group();
    return { len: O.length, tip: (v.tip || '').slice(0, 12), verify: v.ok, meshes: g ? g.children.filter(o => o.isMesh).length : 0 };
  }).catch(e => ({ err: String(e) }));
  console.log('  §BONSAI-PERSIST afterReload len=' + b.len + ' tip=' + b.tip + ' verify=' + b.verify + ' meshes=' + b.meshes + (b.err ? ' ERR=' + b.err : ''));
  await br.close(); server.close();

  const authored = a.len === 2 && a.saved === true;
  const restored = b.len === 2 && b.meshes === 2 && b.verify === true;     // both features back in the scene
  const identical = b.tip === a.tip && !!a.tip;                            // same signed chain tip = byte-faithful restore
  const pass = authored && restored && identical;
  console.log('  §BONSAI-PERSIST VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — authoredAndSaved=' + authored + ' restoredOnReload=' + restored + ' chainTipIdentical=' + identical);
  console.log('── W-BONSAI-PERSIST ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
