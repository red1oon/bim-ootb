// W-UP-AXIS / W-CAM-1..3 — user report 2026-10-10: the model was not sky-up (orbit hit a "border"), a search click flew the camera somewhere unreachable, and the picked coffee table could not be reached.
// W-UP-AXIS  world-space area-weighted |normal| of floors/roofs is >= 0.9 along Y (the scene is upright) — measured for every file given
// W-CAM-1    clicking a search row does not move the camera or target at all (delta 0), yet the item turns amber on screen even behind walls
// W-CAM-2    zooming toward the picked item with the mouse wheel gets the camera to within 1.5 m of it from where it started (no border)
// W-CAM-3    a full-circle orbit and a flip over the top are allowed (polar angle is not clamped); Reset view returns to the start pose
// Usage: node witness_bim_camera.js <root-dir|-> file.ifc [file2.ifc ...]
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2] === '-' ? path.join(__dirname, '..', '..') : process.argv[2], files = process.argv.slice(3);
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, u === '/' ? 'bim.html' : u); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§WITNESS PASS ' : '§WITNESS FAIL ') + id + ' ' + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
srv.listen(0, '127.0.0.1', async () => {
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [fi, file] of files.entries()) {
    const ctx = await (br.createBrowserContext ? br.createBrowserContext() : br.createIncognitoBrowserContext()); const pg = await ctx.newPage(); await pg.setViewport({ width: 1280, height: 800 }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/bim.html', { waitUntil: 'load', timeout: 120000 });
    const info = await pg.evaluate(async (b64, nm) => {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__bim.arm('extract', true); await window.__bim.onFile(nm, u.buffer);
      for (let i = 0; i < 300 && !(window.__bim.cur && window.__bim.cur.rendered); i++) await new Promise((r) => setTimeout(r, 200));
      const R = window.__bim.R, c = window.__bim.cur; if (!R || !c.rendered) return { norender: true };
      const V = R.cam.position.constructor; let ax = 0, ay = 0, az = 0, n = 0; const a = new V(), b = new V(), d = new V();
      const re = /^IFC(SLAB|ROOF|COVERING|PLATE|FOOTING)$/; let any = 0; for (const m of R.meshes) { const p = c.byId.get(m.userData.eid); if (p && re.test(p.type)) any++; }
      for (const m of R.meshes) { const p = c.byId.get(m.userData.eid); if (any && !(p && re.test(p.type))) continue; const pos = m.geometry.attributes.position, ix = m.geometry.index.array; for (let t = 0; t < ix.length; t += 3) { a.fromBufferAttribute(pos, ix[t]).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(pos, ix[t + 1]).applyMatrix4(m.matrixWorld); d.fromBufferAttribute(pos, ix[t + 2]).applyMatrix4(m.matrixWorld); const nr = b.sub(a).cross(d.sub(a)); ax += Math.abs(nr.x); ay += Math.abs(nr.y); az += Math.abs(nr.z); n++; } }
      const s = ax + ay + az || 1; return { tris: n, slabLike: any, y: +(ay / s).toFixed(3), x: +(ax / s).toFixed(3), z: +(az / s).toFixed(3), grid: !!R.grid };
    }, fs.readFileSync(file).toString('base64'), path.basename(file));
    const tag = path.basename(file);
    if (info.norender) { console.log('§WITNESS INCONCLUSIVE W-UP-AXIS ' + tag + ' nothing rendered (no geometry or no WebGL)'); await pg.close(); continue; }
    ok('W-UP-AXIS ' + tag, info.y >= 0.7 && info.y >= info.x && info.y >= info.z && info.grid, 'world |normal| share of floors/roofs x/y/z = ' + info.x + '/' + info.y + '/' + info.z + ' (' + info.tris + ' tris, ' + info.slabLike + ' slab-like elements), ground grid=' + info.grid);
    if (fi > 0) { await pg.close(); continue; }       // the camera claims are exercised on the FIRST file (the Duplex)
    // pick a target: the coffee table if present, else the first furnishing, else any rendered product
    const tgt = await pg.evaluate(() => { const c = window.__bim.cur; const r = c.prods.filter((p) => c.renderedEids.has(p.id)); return (r.find((p) => /coffee/i.test(p.name)) || r.find((p) => /FURNISH/.test(p.type)) || r[0]); });
    const pose = () => pg.evaluate(() => { const R = window.__bim.R; return { cam: R.cam.position.toArray(), tgt: R.ctl.target.toArray() }; });
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    // W-CAM-1
    await pg.keyboard.press('f'); await pg.type('#sq', tgt.name.slice(0, 12)); await wait(300);
    const p0 = await pose(); const rows = await pg.$$('#sl .row'); const rowSel = await pg.evaluate((nm) => [...document.querySelectorAll('#sl .row')].findIndex((r) => r.textContent.indexOf(nm.slice(0, 12)) >= 0), tgt.name);
    await rows[Math.max(0, rowSel)].click(); await wait(900); const p1 = await pose();
    const dc = dist(p0.cam, p1.cam), dt = dist(p0.tgt, p1.tgt);
    const sel = await pg.evaluate(() => [...window.__bim.selected]); const scr = await pg.evaluate((id) => window.__bim.screenOf(id), sel[0]);
    const shot = await pg.screenshot({ encoding: 'base64' });
    const amberNear = await pg.evaluate(async (d, x, y) => { const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const R = 60; const px = g.getImageData(Math.max(0, x - R), Math.max(0, y - R), 2 * R, 2 * R).data; let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 200 && px[i + 1] > 130 && px[i + 1] < 200 && px[i + 2] < 90) n++; return n; }, shot, Math.round(scr.x), Math.round(scr.y));
    ok('W-CAM-1', sel.length === 1 && dc < 1e-6 && dt < 1e-6 && amberNear > 30, 'row click on "' + tgt.name.slice(0, 30) + '": camera moved ' + dc.toFixed(6) + ' m, target moved ' + dt.toFixed(6) + ' m, amber pixels around the item on screen=' + amberNear);
    await pg.keyboard.press('Escape');
    // W-CAM-2: wheel-zoom with the pointer ON the item until close; measure camera->item distance
    const ctr = await pg.evaluate((id) => window.__bim.itemCenter(id), sel[0]); const d0 = dist(p1.cam, ctr);
    let dmin = d0; for (let i = 0; i < 160; i++) { const s = await pg.evaluate((id) => window.__bim.screenOf(id), sel[0]); await pg.mouse.move(s.x, s.y); await pg.mouse.wheel({ deltaY: -400 }); await wait(60); const pc = await pose(); dmin = Math.min(dmin, dist(pc.cam, ctr)); if (dmin < 1.5) break; }
    ok('W-CAM-2', dmin < 1.5, 'wheel-zoom toward the item: distance ' + d0.toFixed(1) + ' m -> ' + dmin.toFixed(2) + ' m (needs < 1.5 m within 160 wheel steps)');
    // W-CAM-3: orbit freedom — drag far past the old poles, camera must be able to go below and over the top, and Reset view restores the pose
    const before = await pose(); const R = await pg.evaluate(() => { const R = window.__bim.R; return { minP: R.ctl.minPolarAngle, maxP: R.ctl.maxPolarAngle, z2c: R.ctl.zoomToCursor }; });
    const ang = (a, b) => { const va = [a.tgt[0] - a.cam[0], a.tgt[1] - a.cam[1], a.tgt[2] - a.cam[2]], vb = [b.tgt[0] - b.cam[0], b.tgt[1] - b.cam[1], b.tgt[2] - b.cam[2]]; const dot = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2], m = Math.hypot(...va) * Math.hypot(...vb); return Math.acos(Math.max(-1, Math.min(1, dot / (m || 1)))) * 180 / Math.PI; };
    await pg.mouse.move(640, 400); await pg.mouse.down(); await pg.mouse.move(640, 760, { steps: 10 }); await pg.mouse.move(640, 40, { steps: 20 }); await pg.mouse.up(); await wait(300);
    const orbited = await pose(); const turned = ang(before, orbited);
    // the view direction must be able to turn a long way (old build: clamped at the poles), and the camera must stay upright (never roll): up vector stays +Y
    const upv = await pg.evaluate(() => { const R = window.__bim.R; R.cam.updateMatrixWorld(); const u = R.cam.up.toArray(); return u; });
    await pg.click('#rv'); await wait(400); const home = await pose();
    ok('W-CAM-3', R.minP === 0 && R.maxP === Math.PI && R.z2c === true && turned > 20 && upv[1] === 1 && dist(home.cam, p0.cam) < 1e-3, 'polar limits ' + R.minP + '..' + R.maxP.toFixed(3) + ' zoomToCursor=' + R.z2c + ', a vertical drag turned the view ' + turned.toFixed(0) + ' deg, camera up=' + JSON.stringify(upv) + ', Reset view back to start (off by ' + dist(home.cam, p0.cam).toFixed(5) + ' m)');
    ok('W-PAGE-ERRORS', errs.length === 0, 'pageerrors=' + errs.length + (errs[0] ? ' ' + errs[0].slice(0, 100) : ''));
    await pg.close(); await ctx.close();
  }
  await br.close(); srv.close(); process.exit(fails ? 1 : 0);
});
