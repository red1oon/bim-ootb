// W-PROGRESS-1..4 (user 2026-10-10, after opening a 200 MB CW file: "put a status message 'opening..' with progress indicator").
// Records every change of the on-screen "Opening…" panel while a file is opened, and judges the SEQUENCE, the percentages and that the panel is gone at the end.
// The parser is told to hand the thread back every 1 ms so even the small Duplex yields many real progress points.
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http'), fs = require('fs'), path = require('path');
const file = process.argv[2], root = process.argv[3] || path.join(__dirname, '..', '..');
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, u === '/' ? 'bim.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
srv.listen(0, '127.0.0.1', async () => {
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await (br.createBrowserContext ? br.createBrowserContext() : br.createIncognitoBrowserContext()); const pg = await ctx.newPage(); await pg.setViewport({ width: 1280, height: 800 }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/bim.html', { waitUntil: 'load', timeout: 120000 });
  await pg.evaluate(() => { window.BIM_STEP.PARSE_SLICE_MS = 1; window.__seq = []; const b = document.getElementById('busy'); if (!b) return; const rec = () => window.__seq.push({ on: b.classList.contains('on'), t: document.getElementById('btxt').textContent, w: document.getElementById('bfill').style.width, ind: document.getElementById('bbar').classList.contains('ind') }); new MutationObserver(rec).observe(b, { subtree: true, childList: true, characterData: true, attributes: true }); });
  await pg.evaluate(async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__bim.arm('extract', true); await window.__bim.onFile('Duplex_ARC.ifc', u.buffer); }, fs.readFileSync(file).toString('base64'));
  await pg.waitForFunction(() => window.__bim.cur && window.__bim.cur.rendered, { timeout: 90000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 800));
  const seq = await pg.evaluate(() => window.__seq || []); const end = await pg.evaluate(() => { const b = document.getElementById('busy'); return b ? { on: b.classList.contains('on'), view: document.body.classList.contains('view') } : null; });
  const texts = []; for (const s of seq) { const k = s.t.replace(/\s*\d+%$/, '').replace(/\(.*?\)/, '()'); if (s.on && texts[texts.length - 1] !== k) texts.push(k); }
  const idx = (re) => texts.findIndex((t) => re.test(t));
  const order = [/reading…|loading/, /reading structure/, /indexing items/, /Building 3D — starting/, /opening .* in the IFC engine/, /drawing the shapes/].map(idx);
  ok('W-PROGRESS-1', order.every((v) => v >= 0) && order.every((v, i) => i === 0 || v > order[i - 1]), 'phases shown in order: ' + texts.map((t) => '“' + t.slice(0, 44) + '”').join(' → '));
  const pcts = seq.filter((s) => s.on && /reading structure/.test(s.t)).map((s) => +(s.t.match(/(\d+)%$/) || [0, -1])[1]); const distinct = [...new Set(pcts)];
  ok('W-PROGRESS-2', distinct.length >= 5 && pcts.every((v, i) => i === 0 || v >= pcts[i - 1]) && Math.max(...pcts) === 100, 'reading-structure percentages: ' + distinct.join(', ') + '% (' + distinct.length + ' distinct, never going backwards, ends at 100)');
  const bar = seq.filter((s) => s.on && /reading structure/.test(s.t) && !s.ind).every((s) => /%$/.test(s.w)); const ind = seq.some((s) => s.on && s.ind && /Building 3D/.test(s.t));
  ok('W-PROGRESS-3', bar && ind, 'percentage steps drive a filled bar; the blocking 3D steps show the moving (indeterminate) bar: ' + JSON.stringify({ filledBarOnPercentSteps: bar, movingBarOn3D: ind }));
  ok('W-PROGRESS-4', !!end && end.on === false && end.view === true && errs.length === 0, 'at the end the panel is gone and the model is on the canvas: ' + JSON.stringify(end) + ', pageerrors=' + errs.length);
  await br.close(); srv.close(); process.exit(fails ? 1 : 0);
});
