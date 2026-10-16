// W-SEARCH-1/2 — from the user's demo video (2026-10-10): a model is loaded but a BACKGROUND tool (Health) is armed, so the canvas is hidden
// ("Drop an IFC" page). The user presses F, gets a list, clicks a row — and sees no model. Expected: F brings the model back (Extract armed),
// the row click highlights it and the model stays drawn. Measured by NUMBERS from the real screenshot (share of non-background pixels, amber pixels), not by eye.
// Usage: node witness_bim_search.js <file.ifc> [rootDir]
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http'), fs = require('fs'), path = require('path');
const file = process.argv[2], root = process.argv[3] || path.join(__dirname, '..', '..');
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, u === '/' ? 'bim.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
srv.listen(0, '127.0.0.1', async () => {
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 800 }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/bim.html', { waitUntil: 'load', timeout: 120000 });
  const cover = async () => { const b64 = await pg.screenshot({ encoding: 'base64' }); return pg.evaluate(async (d) => { const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const px = x.getImageData(0, 0, c.width, c.height).data; const bg = [px[0], px[1], px[2]]; let diff = 0, amber = 0; for (let i = 0; i < px.length; i += 4) { if (Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 30) diff++; if (px[i] > 200 && px[i + 1] > 130 && px[i + 1] < 200 && px[i + 2] < 90) amber++; } return { pct: +(100 * diff / (px.length / 4)).toFixed(1), amber }; }, b64); };
  // the video's state: Health armed, model dropped
  await pg.evaluate(async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__bim.arm('health', true); await window.__bim.onFile('Duplex_ARC.ifc', u.buffer); }, fs.readFileSync(file).toString('base64'));
  await new Promise((r) => setTimeout(r, 600));
  const before = await pg.evaluate(() => ({ view: document.body.classList.contains('view'), armed: (document.querySelector('.pill.on') || { dataset: {} }).dataset.id }));
  await pg.waitForFunction(() => window.__bim.cur && window.__bim.cur.rendered, { timeout: 60000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 600));
  const before2 = await pg.evaluate(() => ({ view: document.body.classList.contains('view'), armed: (document.querySelector('.pill.on') || { dataset: {} }).dataset.id }));
  ok('W-SEARCH-0', before2.armed === 'health' && before2.view, 'start state = the video (Health armed, model dropped): the model STAYS on the canvas: armed=' + before2.armed + ' canvas visible=' + before2.view);
  await pg.keyboard.press('f');
  await pg.waitForFunction(() => window.__bim.cur && window.__bim.cur.rendered, { timeout: 60000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 800));
  const afterF = await pg.evaluate(() => ({ view: document.body.classList.contains('view'), armed: (document.querySelector('.pill.on') || { dataset: {} }).dataset.id, rows: document.querySelectorAll('#sl .row').length, panel: document.getElementById('search').classList.contains('open') }));
  const cF = await cover();
  ok('W-SEARCH-1', afterF.panel && afterF.view && afterF.rows > 0 && cF.pct > 20, 'after F: panel=' + afterF.panel + ' canvas visible=' + afterF.view + ' armed=' + afterF.armed + ' rows=' + afterF.rows + ' drawn=' + cF.pct + '%');
  await pg.type('#sq', 'ifcdoor'); await new Promise((r) => setTimeout(r, 300));
  const rows = await pg.$$('#sl .row'); if (rows.length) await rows[0].click(); await new Promise((r) => setTimeout(r, 900));
  const cR = await cover(); const sel = await pg.evaluate(() => window.__bim.selected.size);
  ok('W-SEARCH-2', sel === 1 && cR.amber > 200 && cR.pct > 20, 'after clicking a row: selected=' + sel + ' amberPixels=' + cR.amber + ' drawn=' + cR.pct + '% (model still on the canvas, selected item highlighted)');
  ok('W-PAGE-ERRORS', errs.length === 0, 'pageerrors=' + errs.length);
  await br.close(); srv.close(); process.exit(fails ? 1 : 0);
});
