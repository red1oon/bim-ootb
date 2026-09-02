// W-BONSAI-CURSOR — DAGeVu modeller: the canvas cursor reflects the ACTIVE mode/tool (RESUME_MODELLER_POLISH.md #5).
// Crosshair = place a sketch/route point, copy = drop a component, grab = drag a gridline, move = drag the gizmo.
// Driven by real toolbar-button clicks (reliable — no gizmo pointer-capture flake). Proves each mode sets its cursor,
// exiting restores the default, and a mode cursor WINS over the M3 hover-pointer (setHover defers to modeCursor()).
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
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready && window.Bonsai.oplog", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());

  const cur = () => pg.$eval('#viewport, canvas', () => document.querySelector('canvas').style.cursor).catch(() => null);
  const click = id => pg.evaluate(i => document.getElementById(i).click(), id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let PASS = 0, FAIL = 0;
  const ok = (c, m) => { (c ? PASS++ : FAIL++); console.log('  ' + (c ? '✅' : '❌') + ' ' + m); };

  // each: [button id, mode label, expected cursor]. Toggle ON → assert; toggle OFF → assert default ''.
  const MODES = [
    ['b-sketch', 'sketch', 'crosshair'],
    ['b-route', 'route', 'crosshair'],
    ['b-gridmove', 'gridMove', 'grab'],
    ['b-insert', 'insert', 'copy'],
  ];
  try {
    const base = await cur();
    ok(base === '' || base === 'default' || base == null, 'default (no mode) cursor is neutral (got "' + base + '")');
    for (const [id, label, want] of MODES) {
      await click(id); await sleep(150);
      const on = await cur();
      ok(on === want, label + ' ON → cursor="' + on + '" (want "' + want + '")');
      await click(id); await sleep(150);
      const off = await cur();
      ok(off === '' || off === 'default', label + ' OFF → cursor restored to default (got "' + off + '")');
    }
    // MOVE needs a selection: op-log insert a component, select it, then toggle Move → 'move'
    const moved = await pg.evaluate(async () => {
      const O = window.Bonsai.oplog, L = window.Bonsai.library;
      const cat = L.catalog() || []; const hash = cat[0] && cat[0].hash;
      const I = await O.commit({ op_type: 'GEOM_INSERT', parameters: { hash, placement: { x: 0, y: 0, z: 0, rot: 0 }, lod: '200' } });
      await O.scrubTo(O.length); await new Promise(r => setTimeout(r, 200));
      window.Bonsai.selectMany([I.id]); return I.id;
    });
    await click('b-move'); await sleep(150);
    const mv = await cur();
    ok(mv === 'move', 'move ON (with selection #' + moved + ') → cursor="' + mv + '" (want "move")');
    await click('b-move'); await sleep(150);
    const mvOff = await cur();
    ok(mvOff === '' || mvOff === 'default', 'move OFF → cursor restored (got "' + mvOff + '")');
    // composition: served source defers hover to the mode cursor (modeCursor() wins in setHover)
    const src = await (await fetch(`http://localhost:${port}/modeller.html`)).text();
    ok(/canvas\.style\.cursor = modeCursor\(\) \|\| \(mesh \? 'pointer' : ''\)/.test(src),
      'setHover defers to modeCursor() (mode cursor wins over the hover-pointer)');
  } catch (e) { console.log('  ERR ' + (e && e.stack || e)); FAIL++; }

  await br.close(); server.close();
  console.log('  §CURSOR VERDICT ' + (FAIL ? 'FAIL' : 'PASS') + ' — ' + PASS + ' PASS / ' + FAIL + ' FAIL');
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
