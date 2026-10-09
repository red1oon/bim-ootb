// W-PERSIST-1..3 — user demo log 2026-10-10: pressing U / 6 (background tools) with a model open hid the canvas, so the Duplex did not stay on screen.
// Replays that sequence with REAL screenshots measured as numbers: after every step the model must still be drawn (share of non-background pixels), the camera must not have been moved by a tool, and the tools must still have run.
// Usage: node witness_bim_persist.js <file.ifc> [rootDir]
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const file = process.argv[2], root = process.argv[3] || path.join(__dirname, '..', '..');
const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'bimpd-'));
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, u === '/' ? 'bim.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
srv.listen(0, '127.0.0.1', async () => {
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await (br.createBrowserContext ? br.createBrowserContext() : br.createIncognitoBrowserContext()); const pg = await ctx.newPage(); await pg.setViewport({ width: 1280, height: 800 });
  const errs = [], logs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => logs.push(m.text()));
  const cdp = await pg.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/bim.html', { waitUntil: 'load', timeout: 120000 });
  const cover = async () => { const b64 = await pg.screenshot({ encoding: 'base64' }); return pg.evaluate(async (d) => { const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const px = x.getImageData(0, 0, c.width, c.height).data; const bg = [px[0], px[1], px[2]]; let diff = 0; for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 30) diff++; return +(100 * diff / (px.length / 4)).toFixed(1); }, b64); };
  const state = () => pg.evaluate(() => { const R = window.__bim.R; return { view: document.body.classList.contains('view'), cam: R ? R.cam.position.toArray() : null, sel: window.__bim.selected.size, label: document.getElementById('fname').textContent }; });
  const steps = []; const check = async (label) => { await wait(900); const s = await state(), c = await cover(); steps.push({ label, view: s.view, pct: c, sel: s.sel, cam: s.cam }); return { s, c }; };
  // 1. drop with a BACKGROUND tool armed (Upgrade) — the tool runs and the model is shown
  await pg.evaluate(async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__bim.arm('upgrade', true); await window.__bim.onFile('Duplex_ARC.ifc', u.buffer); }, fs.readFileSync(file).toString('base64'));
  await pg.waitForFunction(() => window.__bim.cur && window.__bim.cur.rendered, { timeout: 90000 }).catch(() => {}); await check('dropped, Upgrade armed');
  const upRan = logs.filter((l) => /^§UPGRADE file=/.test(l)).length;
  // 2. the keys from the user's log, in order, each with the model still open
  for (const k of ['e', '6', 'k', 'u']) { await pg.keyboard.press(k); await check('pressed ' + k.toUpperCase()); }
  // 3. search, select, select all, with a background tool armed last
  await pg.keyboard.press('f'); await pg.type('#sq', 'table'); await wait(300); await pg.click('#sa'); await check('F search + select all');
  await pg.keyboard.press('Escape'); await pg.keyboard.press('6'); await check('Escape then 6');
  const camMoves = steps.slice(1).map((s, i) => (s.cam && steps[i].cam) ? Math.hypot(...s.cam.map((v, k) => v - steps[i].cam[k])) : Infinity);   // no camera at all = never drawn = not persisting
  const allShown = steps.every((s) => s.view && s.pct > 20);
  ok('W-PERSIST-1', allShown, steps.map((s) => s.label + ': canvas=' + s.view + ' drawn=' + s.pct + '%').join(' | '));
  ok('W-PERSIST-2', Math.max(...camMoves) < 1e-6 && steps[steps.length - 1].sel >= 1, 'a tool key never moves the camera (largest move ' + Math.max(...camMoves).toExponential(1) + ' m) and the selection survives (' + steps[steps.length - 1].sel + ' selected)');
  const ran = { upgrade: logs.filter((l) => /^§UPGRADE file=/.test(l)).length, health: logs.filter((l) => /^§HEALTH file=/.test(l)).length, split: logs.filter((l) => /^§SPLIT file=/.test(l)).length };
  ok('W-PERSIST-3', upRan === 1 && ran.upgrade === 2 && ran.health === 2 && ran.split === 1, 'the tools still ran and saved: upgrade x' + ran.upgrade + ' (U twice), health x' + ran.health + ' (6 twice), split x' + ran.split + '');
  ok('W-PAGE-ERRORS', errs.length === 0, 'pageerrors=' + errs.length + (errs[0] ? ' ' + errs[0].slice(0, 100) : ''));
  await br.close(); srv.close(); process.exit(fails ? 1 : 0);
});
