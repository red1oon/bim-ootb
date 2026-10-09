// W-DRAG-1: dragging a pill out produces a DownloadURL payload with the right file name + content (the OS-side drop itself is not testable here: INCONCLUSIVE by design).
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'bim.html' : decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
srv.listen(0, '127.0.0.1', async () => {
  const url = 'http://127.0.0.1:' + srv.address().port + '/bim.html';
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] }); const pg = await br.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(url, { waitUntil: 'load', timeout: 120000 });
  let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
  for (const shift of [false, true]) {
    const r = await pg.evaluate((sh) => { const b = document.querySelector('.pill[data-id="upgrade"]'); const dt = new DataTransfer(); const ev = new DragEvent('dragstart', { bubbles: true, dataTransfer: dt, shiftKey: sh }); b.dispatchEvent(ev); return { dl: dt.getData('DownloadURL'), uri: dt.getData('text/uri-list'), last: window.__bim.lastDrag }; }, shift);
    const parts = r.dl.split(':'); const mime = parts[0], name = parts[1], dataUrl = r.dl.slice(mime.length + name.length + 2);
    const body = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1));
    ok('W-DRAG-1' + (shift ? 'b' : 'a'), name === r.last.name && body === r.last.body && (shift ? /bim-cli\.js upgrade/.test(body) : /URL=|<string>http|URL=http/.test(body) && /tool=upgrade/.test(body)), 'kind=' + r.last.kind + ' file=' + name + ' bodyHead=' + JSON.stringify(body.slice(0, 70)) + ' uri=' + r.uri);
  }
  await pg.goto(url + '?kit=1', { waitUntil: 'load', timeout: 120000 });
  const kitOpen = await pg.evaluate(() => document.getElementById('kit').classList.contains('open') && document.querySelectorAll('#kt input').length);
  ok('W-KIT-LINK', kitOpen > 0, 'bim.html?kit=1 opens the toolkit panel with ' + kitOpen + ' tools ticked-able');
  ok('W-PAGE-ERRORS', errs.length === 0, 'pageerrors=' + errs.length); console.log('§WITNESS INCONCLUSIVE W-DRAG-2 OS-level drop onto a real desktop cannot be exercised headless — owner check once per OS');
  await br.close(); srv.close(); process.exit(fails ? 1 : 0);
});
