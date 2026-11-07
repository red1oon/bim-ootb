#!/usr/bin/env node
// W-IMPORT-SPACES-LIVE (prompts/IMPORT_KEEPS_IFCSPACE.md). Issue: a real page import records the file's rooms without taking any room away from the Find panel injection. Set ROOT to a clean main tree for the baseline.
// Software rendering only (SwiftShader), no GPU. Drives the landing pipeline (handleImportFile), then opens the Viewer it would open.
// Usage: IFC=<file.ifc> ROOT=<repo tree> node witness_import_keeps_spaces_live.js
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..'), IFC = process.env.IFC;
if (!IFC) { console.log('§WL VERDICT INCONCLUSIVE no IFC named'); process.exit(2); }
const pup = require(path.join(process.env.NODE_MODULES || '/home/red1/bim-compiler/node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
let pass = 0, fail = 0; const W = (o, n, d) => { console.log(`§WL ${o ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); o ? pass++ : fail++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await pup.launch({ headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-compositing'] });
  const pg = await br.newPage(); const logs = [];
  pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERROR ' + e));
  await pg.evaluateOnNewDocument(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return { focus() {} }; }; });
  await pg.goto(`http://localhost:${port}/index.html?home=1`, { waitUntil: 'load', timeout: 60000 });
  await pg.evaluate(() => window.openHub && window.openHub());
  await pg.waitForFunction(() => typeof window.handleImportFile === 'function', { timeout: 15000 });
  const b64 = fs.readFileSync(IFC).toString('base64');
  if (process.env.IFC2) {   // federated drop: two files, one DB
    const b2 = fs.readFileSync(process.env.IFC2).toString('base64');
    await pg.evaluate(async (a, an, c, cn) => { const mk = (x, n) => { const bin = atob(x), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], n); }; await window.importMultiIFC([mk(a, an), mk(c, cn)]); }, b64, path.basename(IFC), b2, path.basename(process.env.IFC2));
  } else
  await pg.evaluate(async (b, name) => { const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); await window.handleImportFile(new File([u], name)); }, b64, path.basename(IFC));
  await pg.waitForFunction(() => window.__opened.some(u => /viewer\.html/.test(u)), { timeout: 90000 }).catch(() => {});
  logs.filter(l => /§IMPORT|PAGEERROR|Failed/.test(l)).slice(-12).forEach(l => console.log('  ' + l.slice(0, 220)));
  const url = (await pg.evaluate(() => window.__opened)).find(u => /viewer\.html/.test(u));
  W(!!url, 'landing import finished and opened the Viewer', url || 'no viewer url');
  if (!process.env.BASELINE) W(logs.some(l => /§IMPORT_SPACES_DB spaces=[1-9]/.test(l)), 'builder recorded the rooms in a real page');
  if (url) {
    const vp = await br.newPage(); const vl = [];
    vp.on('console', m => vl.push(m.text())); vp.on('pageerror', e => vl.push('PAGEERROR ' + e));
    await vp.goto(new URL(url, `http://localhost:${port}/`).href, { waitUntil: 'load', timeout: 90000 });
    await vp.waitForFunction(() => window.APP && window.APP.db, { timeout: 120000 }).catch(() => {});
    await vp.waitForFunction(() => window.APP && window.APP.streaming === false, { timeout: 120000 }).catch(() => {});
    await new Promise(z => setTimeout(z, 3000));
    // Press the real needle in the Find panel: the one thing the owner said must not change.
    const opened = await vp.evaluate(() => { try { window.APP.openFindPanel(); return true; } catch (e) { return String(e); } });
    await vp.waitForSelector('#find-needle-btn', { timeout: 20000 }).catch(() => {});
    const before = await vp.evaluate(() => { const b = document.getElementById('find-needle-btn'); return b ? b.title : null; });
    const pressed = await vp.evaluate(() => { const b = document.getElementById('find-needle-btn'); if (!b) return false; b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; });
    await vp.waitForFunction(() => { try { const x = window.APP.db.exec("SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace'"); return x.length && x[0].values[0][0] > 0; } catch (e) { return false; } }, { timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 60 && !vl.some(l => /§NEEDLE_PERSIST/.test(l)); i++) await new Promise(z => setTimeout(z, 1000));
    W(vl.some(l => /§NEEDLE_PERSIST idb=ok/.test(l)), 'the injected rooms persist as they do today', (vl.find(l => /§NEEDLE_PERSIST/.test(l)) || 'no §NEEDLE_PERSIST line in 60 s').replace(/\s+/g, ' ').slice(0, 120));
    const r = await vp.evaluate(() => { const A = window.APP; if (!A || !A.db) return null; const v = (s) => { try { const x = A.db.exec(s); return x.length ? x[0].values : []; } catch (e) { return []; } };
      const c = (s) => { const x = v(s); return x.length ? x[0][0] : null; };
      return { spaces: c("SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace'"), compiled: c("SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace' AND guid LIKE 'RM\\_%' ESCAPE '\\'"), roomsMeta: c('SELECT room_count FROM rooms_meta'), recorded: c('SELECT COUNT(*) FROM ifc_spaces'), el: c('SELECT COUNT(*) FROM elements_meta'),
        names: v("SELECT name FROM spatial_structure WHERE type='IfcSpace' ORDER BY guid").map(x => x[0]).join('|').slice(0, 400) }; }).catch(e => ({ err: String(e) }));
    console.log('  §WL_FIND opened=' + opened + ' needleTitle=' + JSON.stringify(before) + ' pressed=' + pressed);
    console.log('  §WL_STATE ' + JSON.stringify(r));
    vl.filter(l => /§NEEDLE/.test(l)).forEach(l => console.log('    ' + l.replace(/\s+/g, ' ').slice(0, 170)));
    if (!pressed) { console.log('§WL INCONCLUSIVE the needle was not reached: injection not judged'); fail++; }
    W(pressed && r && r.spaces > 0 && r.compiled === r.spaces, 'needle present with no rooms, press compiles rooms, and every room in the Viewer is compiled, none from the import', '');
    const errs = vl.filter(l => /^PAGEERROR/.test(l)); W(errs.length === 0, 'no page errors in the Viewer', errs.slice(0, 3).join(' | ').slice(0, 300));
    vl.filter(l => /§LENS_PROBE|§NEEDLE|§ROOM_/.test(l)).slice(0, 6).forEach(l => console.log('  ' + l.slice(0, 200)));
  }
  await br.close(); srv.close();
  console.log(`§WL VERDICT ${fail ? 'FAIL' : 'PASS'} ${pass} of ${pass + fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§WL VERDICT FAIL ' + e); process.exit(1); });
