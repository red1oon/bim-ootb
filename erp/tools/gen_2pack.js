// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// gen_2pack.js - write a bundle's declared rows (manifest.provides) out as <bundle dir>/<packsDir>/2Pack_<version>.zip (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §26, slice D).
//   Runs the ONE engine (erp/pipo_packgen.js -> pipo_packout.js) in a headless idempiere.html, on the page's own dictionary DB (seed + patches), then writes the zip.
//   A released pack is immutable (Incremental2PackActivator applies a version once): an existing file whose PackOut.xml differs is REFUSED - bump provides.version; same XML -> unchanged.
// Run: node erp/tools/gen_2pack.js erp/plugins/libero_manufacturing.mjs   (READ the §PACKGEN lines it prints)
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
function packXml(file) { return execFileSync('unzip', ['-p', file, '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 28 }); }
// writePack(file, bytes, xml) -> 'written' | 'unchanged'; throws when a different released pack is already there
function writePack(file, bytes, xml) {
  if (fs.existsSync(file)) {
    if (packXml(file) === xml) return 'unchanged';
    throw new Error('refused: ' + file + ' is a released pack with different content - bump provides.version (a pack version is applied once)');
  }
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(bytes)); return 'written';
}
module.exports = { writePack, packXml };
if (require.main === module) (async () => {
  const bundle = path.resolve(process.argv[2] || ''), REPO = path.join(__dirname, '..', '..');
  if (!fs.existsSync(bundle)) { console.error('usage: node erp/tools/gen_2pack.js <bundle.mjs>'); process.exit(2); }
  const { manifest } = await import(bundle);
  const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
  const http = require('http'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.sql': 'text/plain', '.css': 'text/css' };
  const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]), fp = path.join(REPO, p);
    fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  let code = 0;
  try {
    const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
    page.on('console', m => { if (/^§PACKGEN/.test(m.text())) console.log(m.text()); });
    await page.goto('http://localhost:' + server.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.PipoPackOut, null, { timeout: 60000 });
    await page.addScriptTag({ url: '/erp/pipo_packgen.js' });
    const r = await page.evaluate(async (m) => { try { const g = await window.PipoPackGen.generate(window.__idmpDb, m); return { file: g.file, xml: g.xml, zip: Array.from(g.zip) }; } catch (e) { return { error: e.message }; } }, manifest);
    if (r.error) throw new Error(r.error);
    const file = path.join(path.dirname(bundle), manifest.provides.packsDir || '.', r.file);
    console.log('§PACKGEN-WRITE file=' + path.relative(REPO, file) + ' result=' + writePack(file, Uint8Array.from(r.zip), r.xml));
  } catch (e) { console.log('§PACKGEN-WRITE FAILED ' + e.message); code = 1; }
  await browser.close(); server.close(); process.exit(code);
})();
