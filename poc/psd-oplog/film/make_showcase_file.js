// Usage: node film/make_showcase_file.js <clouds.jpg> <balloon.jpg> <outdir>   Builds the finished balloon showcase file through the real editor page (nothing is deployed):
// Background + Paint (empty) + Clouds (Fill centre) + Balloon (Fill 3/4 along, sky wand tol 45, Grow 1, Feather 3, mask inverted) + "Text: Up, up and away" (white, bottom, size 72, shadow); finally Paint is moved up to sit just below the caption.
// Writes <outdir>/balloon_showcase.oplog.json (the editor's "Save log"), balloon_showcase.psd, balloon_showcase.png, facts_showcase.tsv (log size, entries, reload check). The photos are NOT in the repo (Unsplash licence, credit lines in the resume doc).
const fs = require('fs'), path = require('path'), http = require('http');
const [clouds, balloon, outdir] = process.argv.slice(2); if (!clouds || !balloon || !outdir) { console.error('usage: node film/make_showcase_file.js clouds.jpg balloon.jpg outdir'); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });
const ROOT = path.join(__dirname, '..'), { chromium } = require('playwright-core'), J = JSON.stringify;
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0, '127.0.0.1');
(async () => {
  await new Promise((r) => srv.on('listening', r)); const url = 'http://127.0.0.1:' + srv.address().port + '/editor/index.html', br = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); pg.errs = []; pg.on('pageerror', (e) => pg.errs.push(e.message)); await pg.goto(url); await pg.waitForFunction(() => window.__ed); await pg.evaluate(() => window.__ed.reset());
  const add = async (file, mode) => { const n0 = await pg.evaluate(() => window.__ed.ops.length); await pg.selectOption('#pfit', mode); await pg.setInputFiles('#photo', file); await pg.waitForFunction((k) => window.__ed.ops.length > k, n0, { timeout: 60000 }); };
  await pg.evaluate(() => window.__ed.renameLayer(1, 'Paint'));
  await add(clouds, 'centre'); await pg.evaluate(() => window.__ed.renameLayer(2, 'Clouds'));
  await add(balloon, 'q3'); await pg.evaluate(() => window.__ed.renameLayer(3, 'Balloon'));
  await pg.evaluate(() => { const e = window.__ed; e.params.layer = 3; e.params.tool = 'wand'; e.params.tol = 45; e.params.contig = true; e.params.wandMode = 'new'; e.wandAt(60, 40); e.growSel(1); e.maskOp(3, 'sel', 3); e.maskOp(3, 'invert'); e.clearSel(); e.params.tool = 'hard'; e.params.layer = 1; });
  await pg.evaluate(() => document.getElementById('addt').click()); await pg.fill('#t-text', 'Up, up and away'); await pg.evaluate(() => { document.getElementById('t-size').value = 72; document.getElementById('t-size').dispatchEvent(new Event('input')); }); await pg.click('#t-add'); await pg.waitForTimeout(800);
  await pg.evaluate(() => window.__ed.moveLayer(1, 3));   // Paint above the photos (below the caption), so strokes on it are visible
  const log = await pg.evaluate(() => window.__ed.save()), h = await pg.evaluate(() => window.__ed.hashes()), names = await pg.evaluate(() => window.__ed.tree().map((n) => n.name)), nOps = await pg.evaluate(() => window.__ed.ops.length);
  fs.writeFileSync(path.join(outdir, 'balloon_showcase.oplog.json'), log); fs.writeFileSync(path.join(outdir, 'balloon_showcase.psd'), Buffer.from(await pg.evaluate(async () => Array.from(await window.__ed.exportPSD()))));
  await pg.screenshot({ path: path.join(outdir, 'balloon_showcase.png'), clip: { x: 186, y: 100, width: 764, height: 764 } });
  // reload check in a fresh page: load the saved file, the hashes must equal
  const pg2 = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); await pg2.goto(url); await pg2.waitForFunction(() => window.__ed); await pg2.evaluate((s) => window.__ed.load(s), log); const h2 = await pg2.evaluate(() => window.__ed.hashes());
  const ok = J(h) === J(h2), facts = [['entries in the log', nOps], ['layer names (top to bottom)', names.join(' | ')], ['saved log size (bytes)', log.length], ['saved log size (MB)', (log.length / 1048576).toFixed(2)], ['reload in a fresh page: hashes equal', ok], ['page errors', pg.errs.length]];
  fs.writeFileSync(path.join(outdir, 'facts_showcase.tsv'), facts.map((r) => r.join('\t')).join('\n') + '\n'); console.log(facts.map((r) => r.join(': ')).join('\n')); await br.close(); srv.close(); process.exit(ok && !pg.errs.length ? 0 : 1);
})();
