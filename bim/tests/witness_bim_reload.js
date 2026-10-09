// W-RELOAD-1/2 (user report 2026-10-09: "browser empty, not loaded" after a refresh): a plain reload brings back the last model AND its selection.
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..'), file = process.argv[2];
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, u === '/' ? 'bim.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
srv.listen(0, '127.0.0.1', async () => {
  const url = 'http://127.0.0.1:' + srv.address().port + '/bim.html';
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); const pg = await br.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(url, { waitUntil: 'load' });
  const first0 = await pg.evaluate(async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__bim.arm('extract', true); await window.__bim.onFile('Duplex_ARC.ifc', u.buffer); for (let i = 0; i < 300 && !(window.__bim.cur && window.__bim.cur.rendered); i++) await new Promise((r) => setTimeout(r, 200)); const c = window.__bim.cur; return { name: c.name, n: c.prods.length }; }, fs.readFileSync(file).toString('base64'));
  // select through the REAL UI path: search panel -> "Select all matches" (this is what calls the persistence)
  await pg.keyboard.press('f'); await pg.type('#sq', 'ifcwallstandardcase'); await new Promise((r) => setTimeout(r, 200)); await pg.click('#sa'); await new Promise((r) => setTimeout(r, 500));
  const first = Object.assign(first0, await pg.evaluate(() => ({ ids: [...window.__bim.selected].map((id) => window.__bim.cur.byId.get(id).guid) })));
  await pg.reload({ waitUntil: 'load' });
  await pg.waitForFunction(() => window.__bim && window.__bim.cur && window.__bim.cur.rendered, { timeout: 90000 }).catch(() => {});
  const second = await pg.evaluate(() => { const c = window.__bim.cur; return c ? { name: c.name, n: c.prods.length, rendered: !!c.rendered, view: document.body.classList.contains('view'), sel: [...window.__bim.selected].map((id) => c.byId.get(id).guid) } : null; });
  ok('W-RELOAD-1', !!second && second.name === first.name && second.n === first.n && second.rendered, 'before reload: ' + first.name + ' products=' + first.n + '; after: ' + JSON.stringify(second && { name: second.name, n: second.n, rendered: second.rendered, view: second.view }));
  ok('W-RELOAD-2', !!second && JSON.stringify(second.sel.sort()) === JSON.stringify(first.ids.slice().sort()) && first.ids.length > 0, 'selection restored ' + (second ? second.sel.length : 0) + '/' + first.ids.length + ' GlobalIds');
  ok('W-PAGE-ERRORS', errs.length === 0, 'pageerrors=' + errs.length + (errs[0] ? ' ' + errs[0].slice(0, 120) : ''));
  await br.close(); srv.close(); process.exit(fails ? 1 : 0);
});
