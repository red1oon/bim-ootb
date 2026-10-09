// W-FID-1/2 and W-GEO-1/2 (bim-compiler prompts/GEOMETRY_TRUTH_CHAIN.md lesson + the baseline's georef rule).
// W-FID  real geometry reached the scene, not 12-triangle box proxies: mean triangles per mesh > 12 and box-like meshes < 90% (real extrusions ARE 12 triangles, so 'no boxes' would be wrong). A box would pass every count/pixel check, so this is asserted on its own.
// W-GEO  a georeferenced model (here: the Duplex with its site origin moved to E 500000 / N 3000000) is shown at a local origin, still drawn, and the file on disk is untouched; the unshifted Duplex is NOT rebased.
// Usage: node witness_bim_fidelity.js <Duplex_ARC.ifc> [rootDir]
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http'), fs = require('fs'), path = require('path');
const file = process.argv[2], root = process.argv[3] || path.join(__dirname, '..', '..');
const S = require('../tools/step.js');
// make the georeferenced variant: a RIGID shift. The site's root placement gets its OWN new point + new IfcAxis2Placement3D (the shared origin point is used by many placements, and editing it would compound the shift per parent and smear the building across millions of metres).
const text = fs.readFileSync(file, 'utf8'), model = S.parse(text); let variant = null;
let maxId = 0; for (const id of model.ents.keys()) if (id > maxId) maxId = id;
for (const e of model.ents.values()) if (e.type === 'IFCLOCALPLACEMENT') { const a = S.args(e); if (a[0] === '$') {
  const pt = ++maxId, ap = ++maxId; model.ents.set(pt, { id: pt, type: 'IFCCARTESIANPOINT', a: '(500000.,3000000.,0.)', _args: null }); model.ents.set(ap, { id: ap, type: 'IFCAXIS2PLACEMENT3D', a: '#' + pt + ',$,$', _args: null });
  S.setArgs(e, ['$', '#' + ap]); variant = S.write(model.schema, model.header, model.ents); break; } }
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, u === '/' ? 'bim.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
const inc = (id, m) => console.log('§WITNESS INCONCLUSIVE ' + id + ' ' + m);
srv.listen(0, '127.0.0.1', async () => {
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const run = async (name, content) => {
    const ctx = await (br.createBrowserContext ? br.createBrowserContext() : br.createIncognitoBrowserContext()); const pg = await ctx.newPage(); await pg.setViewport({ width: 1280, height: 800 }); const logs = [], errs = []; pg.on('console', (m) => logs.push(m.text())); pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/bim.html', { waitUntil: 'load', timeout: 120000 });
    await pg.evaluate(async (b64, nm) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__bim.arm('extract', true); await window.__bim.onFile(nm, u.buffer); }, Buffer.from(content).toString('base64'), name);
    await pg.waitForFunction(() => window.__bim.cur && window.__bim.cur.rendered, { timeout: 90000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 1000));
    const info = await pg.evaluate(() => { const R = window.__bim.R; if (!R || !R.group) return null; const b = new R.cam.position.constructor(); const v = new R.cam.position.constructor(); let mn = [1e18, 1e18, 1e18], mx = [-1e18, -1e18, -1e18]; for (const m of R.meshes) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 1) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v.getComponent(k)); mx[k] = Math.max(mx[k], v.getComponent(k)); } } } return { centre: mn.map((x, k) => (x + mx[k]) / 2), camDist: R.cam.position.distanceTo(R.ctl.target) }; });
    const shot = await pg.screenshot({ encoding: 'base64' });
    const pct = await pg.evaluate(async (d) => { const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const px = x.getImageData(0, 0, c.width, c.height).data; const bg = [px[0], px[1], px[2]]; let diff = 0; for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 30) diff++; return +(100 * diff / (px.length / 4)).toFixed(1); }, shot);
    await ctx.close(); return { logs, errs, info, pct };
  };
  const base = await run('Duplex_ARC.ifc', text);
  const fid = (base.logs.find((l) => l.startsWith('§BIM_FIDELITY')) || '').match(/trisPerMesh=([\d.]+) boxLikeMeshes=(\d+) of (\d+)/) || [];
  const boxShare = +fid[2] / +fid[3];
  ok('W-FID-1', +fid[1] > 12 && boxShare < 0.9, '§BIM_FIDELITY trisPerMesh=' + fid[1] + ' boxLikeMeshes=' + fid[2] + ' of ' + fid[3] + ' = ' + (100 * boxShare).toFixed(0) + '% (the fake-geometry signature is 100% boxes, mean 12; plain walls/slabs are legitimately 12 triangles, so zero boxes would be the WRONG rule)');
  const rb = base.logs.find((l) => l.startsWith('§BIM_REBASE')) || '';
  ok('W-GEO-1', /none/.test(rb) && base.pct > 20, 'unshifted Duplex: ' + rb.slice(0, 80) + ' ; drawn=' + base.pct + '%');
  if (!variant) inc('W-GEO-2', 'no site placement found to move'); else {
    const geo = await run('Duplex_geo.ifc', variant);
    const rg = geo.logs.find((l) => l.startsWith('§BIM_REBASE')) || ''; const c = geo.info ? geo.info.centre : [1e9, 1e9, 1e9];
    const sh = (rg.match(/shifted by (-?\d+),(-?\d+),(-?\d+)/) || []).slice(1).map(Number);
    ok('W-GEO-2', sh.length === 3 && Math.abs(sh[0] - 500000) < 50 && Math.abs(sh[2] + 3000000) < 50, 'georeferenced variant (site moved to 500000,3000000): ' + rg.slice(0, 110));
    ok('W-GEO-3', Math.max(...c.map(Math.abs)) < 1e3 && geo.pct > 20 && geo.errs.length === 0, 'after rebase the model centre is ' + c.map((x) => x.toFixed(0)).join(',') + ' m (< 1 km), drawn=' + geo.pct + '%, pageerrors=' + geo.errs.length);
  }
  ok('W-FILE-UNTOUCHED', fs.readFileSync(file, 'utf8') === text, 'the IFC on disk was not modified (variant built in memory)');
  await br.close(); srv.close(); process.exit(fails ? 1 : 0);
});
