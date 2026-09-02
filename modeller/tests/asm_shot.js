// One-off VISUAL sanity of an assembly drop — pick a single ROOM/SET, drop it, screenshot. Calibration only;
// W-BOM-ASSEMBLY is the verifier. shot_asm.png.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1100, height: 800 });
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready && window.Bonsai.oplog", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());
  const picked = await pg.evaluate(async () => {
    const L = window.Bonsai.library, O = window.Bonsai.oplog, THREE = window.THREE;
    // a single ROOM with a handful of parts → clearest sanity read
    const cand = L.assemblies().filter(a => a.level === 'ROOM' || a.level === 'SET')
      .map(a => ({ a, n: L.expandAssembly(a.id, {}).length })).filter(x => x.n >= 4 && x.n <= 30).sort((x, y) => y.n - x.n)[0];
    const pick = cand.a;
    window.Bonsai.grid.define({ xs: [0, 4, 8], ys: [0, 3, 6] }); O.clear();
    document.getElementById('b-insert').click(); await L.ready();
    document.querySelector('.ins-chip[data-g="asm"]').click();
    const lc = document.querySelector('.ins-cat[data-cat="ASM_' + pick.level + '"]'); if (lc) lc.click();
    document.querySelector('.ins-a[data-asm="' + pick.id + '"]').click();
    const c = document.getElementById('c'), rect = c.getBoundingClientRect();
    const v = new THREE.Vector3(4, 3, 0).project(window.A.camera);
    c.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: rect.left + (v.x + 1) / 2 * rect.width, clientY: rect.top + (1 - v.y) / 2 * rect.height, bubbles: true }));
    const want = L.expandAssembly(pick.id, {}).length;
    for (let i = 0; i < 120 && O.length < want; i++) await new Promise(r => setTimeout(r, 50));
    await new Promise(r => setTimeout(r, 1500)); document.getElementById('b-fit').click(); await new Promise(r => setTimeout(r, 600));
    return { id: pick.id, name: pick.name, n: O.length };
  });
  await pg.screenshot({ path: path.join(__dirname, 'shot_asm.png') });
  console.log('§SHOT asm ' + JSON.stringify(picked));
  await br.close(); server.close();
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
