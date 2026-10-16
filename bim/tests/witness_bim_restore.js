// W-RESTORE-1..3 (user report 2026-10-10): every refresh saved files again (the restored model re-ran the armed Split), and there was no way to close a file.
// W-RESTORE-1 a reload with a BACKGROUND tool armed saves NOTHING and shows the model · W-RESTORE-2 "Close file" empties the page and the memory · W-RESTORE-3 after closing, a reload stays empty.
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const file = process.argv[2], root = path.join(__dirname, '..', '..');
const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'bimdl-'));
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, u === '/' ? 'bim.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
const files = () => fs.readdirSync(dl).filter((f) => !/\.crdownload$/.test(f)).sort();
srv.listen(0, '127.0.0.1', async () => {
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 800 }); const errs = [], logs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => logs.push(m.text()));
  const cdp = await pg.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  const url = 'http://127.0.0.1:' + srv.address().port + '/bim.html', wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await pg.goto(url, { waitUntil: 'load', timeout: 120000 });
  await pg.evaluate(async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__bim.arm('split', true); await window.__bim.onFile('Duplex_ARC.ifc', u.buffer); }, fs.readFileSync(file).toString('base64'));
  await wait(2500); const first = files();
  ok('W-RESTORE-0', first.length === 4 && first.every((f) => /^Duplex_ARC_.+\.ifc$/.test(f)), 'dropping with Split armed saved ' + JSON.stringify(first));
  logs.length = 0;   // only what the page logs AFTER the reload counts
  await pg.reload({ waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction(() => window.__bim && window.__bim.cur && window.__bim.cur.rendered, { timeout: 90000 }).catch(() => {}); await wait(3000);
  const after = files(), st = await pg.evaluate(() => ({ name: window.__bim.cur && window.__bim.cur.name, view: document.body.classList.contains('view'), armed: (document.querySelector('.pill.on') || { dataset: {} }).dataset.id }));
  // Chrome blocks repeat multi-file downloads, so a file count alone cannot prove nothing re-ran: also require NO tool run in the page log
  const reran = logs.filter((l) => /^§(SPLIT|UPGRADE|HEALTH|EXTRACT) file=/.test(l)).length;
  const label = await pg.$eval('#fname', (e) => e.textContent).catch(() => '(no label on this build)');
  ok('W-RESTORE-1b', reran === 0 && /^Duplex_ARC\.ifc · IFC2X3 · \d+ items$/.test(label), 'tool runs logged after reload=' + reran + '; canvas label="' + label + '"');
  ok('W-RESTORE-1', JSON.stringify(after) === JSON.stringify(first) && st.name === 'Duplex_ARC.ifc' && st.view, 'after reload with ' + st.armed + ' armed: files saved before=' + first.length + ' after=' + after.length + ', model restored=' + st.name + ', canvas visible=' + st.view);
  await pg.click('#cls'); await wait(800);
  const cl = await pg.evaluate(async () => { const d = await new Promise((res) => { const q = indexedDB.open('bim-tools', 1); q.onsuccess = () => res(q.result); }); const v = await new Promise((res) => { const q = d.transaction('last').objectStore('last').get('file'); q.onsuccess = () => res(q.result); }); d.close(); return { cur: window.__bim.cur, view: document.body.classList.contains('view'), stored: v, dropVisible: getComputedStyle(document.getElementById('drop')).display !== 'none' }; });
  ok('W-RESTORE-2', cl.cur === null && !cl.view && (cl.stored === null || cl.stored === undefined) && cl.dropVisible, 'Close file: loaded=' + cl.cur + ' canvas=' + cl.view + ' stored=' + cl.stored + ' dropPage=' + cl.dropVisible);
  await pg.reload({ waitUntil: 'load', timeout: 120000 }); await wait(2500);
  const again = await pg.evaluate(() => ({ cur: window.__bim.cur, view: document.body.classList.contains('view') }));
  ok('W-RESTORE-3', again.cur === null && !again.view && files().length === first.length, 'reload after closing: loaded=' + again.cur + ' canvas=' + again.view + ' files=' + files().length);
  ok('W-PAGE-ERRORS', errs.length === 0, 'pageerrors=' + errs.length + (errs[0] ? ' ' + errs[0].slice(0, 100) : ''));
  await br.close(); srv.close(); process.exit(fails ? 1 : 0);
});
