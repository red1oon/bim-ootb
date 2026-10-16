// W-FOCUS-1..6 — user report 2026-10-10: the lit tool survived a refresh, so the next drop silently ran it; no way to un-light it.
// Contract: nothing is armed after a refresh · a drop with nothing armed only OPENS the file · clicking the lit button again clears it · Esc clears it (after closing any panel) · Extract with a selection still exports on click.
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const file = process.argv[2], root = process.argv[3] || path.join(__dirname, '..', '..');
const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'bimfc-'));
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, u === '/' ? 'bim.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
srv.listen(0, '127.0.0.1', async () => {
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await (br.createBrowserContext ? br.createBrowserContext() : br.createIncognitoBrowserContext()); const pg = await ctx.newPage(); await pg.setViewport({ width: 1280, height: 800 });
  const errs = [], logs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => logs.push(m.text()));
  const cdp = await pg.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  const url = 'http://127.0.0.1:' + srv.address().port + '/bim.html';
  const lit = () => pg.evaluate(() => { const b = document.querySelector('#rail .pill.on'); return b ? b.dataset.id : null; });
  const ran = (t) => logs.filter((l) => l.indexOf('§' + t + ' file=') === 0).length;
  const toastText = () => pg.$eval('#toast', (e) => e.textContent);
  const drop = (name) => pg.evaluate(async (b64, nm) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); await window.__bim.onFile(nm, u.buffer); }, fs.readFileSync(file).toString('base64'), name);
  await pg.goto(url, { waitUntil: 'load', timeout: 120000 });
  // 1. fresh page: nothing lit
  const t0 = await pg.$eval('#armed', (e) => e.textContent);
  ok('W-FOCUS-1', (await lit()) === null && /nothing yet/.test(t0), 'fresh page: lit tool=' + (await lit()) + ', status line="' + t0.slice(0, 40) + '…"');
  // 2. light Upgrade, refresh -> must be cleared
  await pg.click('#rail .pill[data-id="upgrade"]'); const litBefore = await lit();
  await pg.reload({ waitUntil: 'load', timeout: 120000 }); await wait(500);
  ok('W-FOCUS-2', litBefore === 'upgrade' && (await lit()) === null, 'lit before refresh=' + litBefore + ', lit after refresh=' + (await lit()));
  // 3. drop with nothing armed: only opens
  logs.length = 0; await drop('Duplex_ARC.ifc'); await pg.waitForFunction(() => window.__bim.cur && window.__bim.cur.rendered, { timeout: 90000 }).catch(() => {}); await wait(1500);
  const files3 = fs.readdirSync(dl), v3 = await pg.evaluate(() => document.body.classList.contains('view'));
  ok('W-FOCUS-3', files3.length === 0 && ran('UPGRADE') + ran('SPLIT') + ran('HEALTH') === 0 && v3 && /Press U/.test(await toastText()), 'nothing armed + drop: files saved=' + files3.length + ', tool runs=' + (ran('UPGRADE') + ran('SPLIT') + ran('HEALTH')) + ', model shown=' + v3 + ', message="' + (await toastText()).slice(0, 60) + '…"');
  // 4. click Upgrade: runs on the open model; click again: cleared, no second run
  await pg.click('#rail .pill[data-id="upgrade"]'); await wait(800); const afterFirst = { lit: await lit(), n: ran('UPGRADE') };
  await pg.click('#rail .pill[data-id="upgrade"]'); await wait(500);
  ok('W-FOCUS-4', afterFirst.lit === 'upgrade' && afterFirst.n === 1 && (await lit()) === null && ran('UPGRADE') === 1, 'first click: lit=' + afterFirst.lit + ' runs=' + afterFirst.n + '; second click: lit=' + (await lit()) + ' runs=' + ran('UPGRADE') + ' (no repeat)');
  // 5. key 6 lights Health and runs; Esc with nothing open clears; next drop only opens
  await pg.keyboard.press('6'); await wait(700); const h1 = { lit: await lit(), n: ran('HEALTH') };
  await pg.keyboard.press('Escape'); await wait(300); const afterEsc = await lit();
  const before5 = fs.readdirSync(dl).length; await drop('Duplex_ARC.ifc'); await wait(1500);
  ok('W-FOCUS-5', h1.lit === 'health' && h1.n === 1 && afterEsc === null && ran('HEALTH') === 1 && fs.readdirSync(dl).length === before5, 'key 6: lit=' + h1.lit + ' runs=' + h1.n + '; Esc: lit=' + afterEsc + '; drop afterwards: health runs still ' + ran('HEALTH') + ', new files=' + (fs.readdirSync(dl).length - before5));
  // 6. Esc closes an open panel FIRST and leaves the tool lit; a second Esc clears it
  await pg.keyboard.press('6'); await wait(500); await pg.keyboard.press('f'); await wait(300);
  await pg.keyboard.press('Escape'); await wait(300); const afterPanel = { lit: await lit(), open: await pg.$eval('#search', (e) => e.classList.contains('open')) };
  await pg.keyboard.press('Escape'); await wait(300);
  ok('W-FOCUS-6', afterPanel.lit === 'health' && !afterPanel.open && (await lit()) === null, 'first Esc: search closed=' + !afterPanel.open + ', tool still lit=' + afterPanel.lit + '; second Esc: lit=' + (await lit()));
  // 7. Extract: with a selection the button EXPORTS (stays lit); with nothing selected a second click clears it
  await pg.click('#rail .pill[data-id="extract"]'); await wait(500); await pg.keyboard.press('f'); await pg.type('#sq', 'ifcdoor'); await wait(300); await pg.click('#sa'); await pg.keyboard.press('Escape'); await wait(300);
  const nE = logs.filter((l) => /^§BIM_EXPORT selected=/.test(l)).length; await pg.click('#rail .pill[data-id="extract"]'); await wait(1200);   // Chrome blocks repeat automatic downloads, so count the page's own export log, which is written before the download
  const exported = logs.filter((l) => /^§BIM_EXPORT selected=/.test(l)).length === nE + 1, stillLit = await lit();
  await pg.click('#clr'); await pg.click('#rail .pill[data-id="extract"]'); await wait(400);
  ok('W-FOCUS-7', exported && stillLit === 'extract' && (await lit()) === null, 'Extract with a selection: exported=' + exported + ', still lit=' + stillLit + '; with nothing selected a click clears it: lit=' + (await lit()));
  ok('W-PAGE-ERRORS', errs.length === 0, 'pageerrors=' + errs.length + (errs[0] ? ' ' + errs[0].slice(0, 100) : ''));
  await br.close(); srv.close(); process.exit(fails ? 1 : 0);
});
