// One-off VISUAL capture of the modeller — renders real pixels (not projection math) so we can SEE the
// background grid orientation. Spec MODELLER_BOM_CATALOG_SPEC §ORIENTATION: "reproduce visually, don't iterate
// on headless math again." Saves: shot_empty (default view), shot_door (after inserting a door + Fit).
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
  await pg.setViewport({ width: 1100, height: 800 });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 160)));
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready && window.A && window.A.camera", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());
  await new Promise(r => setTimeout(r, 400));
  await pg.screenshot({ path: path.join(__dirname, 'shot_empty.png') });
  console.log('§SHOT empty written');

  // insert a door + fit (iso)
  await pg.evaluate(async () => {
    window.Bonsai.grid.define({ xs: [0, 4], ys: [0, 3] }); window.Bonsai.oplog.clear();
    document.getElementById('b-insert').click(); await window.Bonsai.library.ready();
    const door = [...document.querySelectorAll('#ins-body .ins-c')].find(b => /door/i.test(b.textContent + b.title));
    door.click();
    const THREE = window.THREE, cam = window.A.camera;
    const c = document.getElementById('c'), rect = c.getBoundingClientRect();
    const v = new THREE.Vector3(2, 1.5, 0).project(cam);
    c.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: rect.left + (v.x + 1) / 2 * rect.width, clientY: rect.top + (1 - v.y) / 2 * rect.height, bubbles: true }));
    for (let i = 0; i < 80 && window.Bonsai.oplog.length < 1; i++) await new Promise(r => setTimeout(r, 50));
  });
  await new Promise(r => setTimeout(r, 1200));
  await pg.evaluate(() => document.getElementById('b-fit').click());
  await new Promise(r => setTimeout(r, 500));
  await pg.screenshot({ path: path.join(__dirname, 'shot_door.png') });
  console.log('§SHOT door written');

  await br.close(); server.close();
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
