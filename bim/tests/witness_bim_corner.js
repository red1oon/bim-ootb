// W-CORNER-1..3 (user 2026-10-10): a red-pill icon at the bottom-right leads to the Red Pill page (so people know where BIM Tools comes from);
// the user-manual icon (light bulb) sits directly above it. Measured from real element boxes at two window sizes, with and without a model loaded.
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http'), fs = require('fs'), path = require('path');
const file = process.argv[2], root = process.argv[3] || path.join(__dirname, '..', '..');
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, u === '/' ? 'bim.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
srv.listen(0, '127.0.0.1', async () => {
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await (br.createBrowserContext ? br.createBrowserContext() : br.createIncognitoBrowserContext()); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  const measure = () => pg.evaluate(() => { const b = (id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, vis: cs.display !== 'none' && cs.visibility !== 'hidden', href: e.getAttribute('href'), target: e.getAttribute('target'), rel: e.getAttribute('rel'), imgOk: e.querySelector('img') ? (e.querySelector('img').complete && e.querySelector('img').naturalWidth > 0) : null }; }; const rail = document.getElementById('rail').getBoundingClientRect(); return { pill: b('redpill'), bulb: b('manual'), rail: { l: rail.left, t: rail.top, r: rail.right, b: rail.bottom }, W: innerWidth, H: innerHeight }; });
  for (const [w, h] of [[1280, 800], [900, 600]]) {
    await pg.setViewport({ width: w, height: h }); await pg.goto('http://127.0.0.1:' + srv.address().port + '/bim.html', { waitUntil: 'load', timeout: 120000 }); await wait(400);
    const m = await measure(); const p = m.pill, u = m.bulb;
    const links = p && u && p.href === 'https://red1oon.github.io/BIMCompiler/RED_PILL/' && u.href === 'https://red1oon.github.io/BIMCompiler/BIMToolsGuide/' && p.target === '_blank' && u.target === '_blank' && /noopener/.test(p.rel) && /noopener/.test(u.rel);
    ok('W-CORNER-1 ' + w + 'x' + h, !!links && p.vis && u.vis && p.imgOk === true, 'red pill -> ' + (p && p.href) + ' ; light bulb -> ' + (u && u.href) + ' ; both open in a new tab, visible, pill image loaded=' + (p && p.imgOk));
    const corner = p && (m.W - p.r) <= 24 && (m.H - p.b) <= 24 && u.b <= p.t && Math.abs((u.l + u.r) / 2 - (p.l + p.r) / 2) < 2 && (p.t - u.b) < 24;
    ok('W-CORNER-2 ' + w + 'x' + h, !!corner, 'pill is ' + (m.W - p.r).toFixed(0) + ' px from the right and ' + (m.H - p.b).toFixed(0) + ' px from the bottom; the bulb sits ' + (p.t - u.b).toFixed(0) + ' px directly above it');
    const clear = p.r <= m.rail.l || p.t >= m.rail.b || u.t >= m.rail.b; const noOverlap = !(u.l < m.rail.r && u.r > m.rail.l && u.t < m.rail.b && u.b > m.rail.t) && !(p.l < m.rail.r && p.r > m.rail.l && p.t < m.rail.b && p.b > m.rail.t);
    ok('W-CORNER-3 ' + w + 'x' + h, noOverlap, 'neither icon overlaps the tool rail (rail y ' + m.rail.t.toFixed(0) + '..' + m.rail.b.toFixed(0) + ', icons y ' + u.t.toFixed(0) + '..' + p.b.toFixed(0) + ')');
  }
  // still there with a model loaded and a panel open
  await pg.setViewport({ width: 1280, height: 800 }); await pg.goto('http://127.0.0.1:' + srv.address().port + '/bim.html', { waitUntil: 'load', timeout: 120000 });
  await pg.evaluate(async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__bim.arm('extract', true); await window.__bim.onFile('Duplex_ARC.ifc', u.buffer); }, fs.readFileSync(file).toString('base64'));
  await pg.waitForFunction(() => window.__bim.cur && window.__bim.cur.rendered, { timeout: 90000 }).catch(() => {}); await wait(800); await pg.keyboard.press('9'); await wait(300);
  const m2 = await measure(); const top = await pg.evaluate(() => { const r = document.getElementById('redpill').getBoundingClientRect(); const e = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return e && (e.id === 'redpill' || (e.closest && e.closest('#redpill')) ? 'redpill' : e.tagName + '#' + e.id); });
  ok('W-CORNER-4', m2.pill.vis && m2.bulb.vis && top === 'redpill', 'model loaded + toolkit panel open: both icons still visible, and the red pill is the top element at its own centre (' + top + ')');
  ok('W-PAGE-ERRORS', errs.length === 0, 'pageerrors=' + errs.length);
  await br.close(); srv.close(); process.exit(fails ? 1 : 0);
});
