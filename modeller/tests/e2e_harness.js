'use strict';
/**
 * e2e_harness.js — shared rig for the modeller's real-user, maths-asserted E2E suite (RESUME: user standard 2026-07-01,
 * see feedback_test_real_user_path_not_seams). Every tool test drives the REAL production path with REAL input
 * (puppeteer pg.mouse → Chrome pointer events, real toolbar clicks, the real history slider) and asserts by NUMBERS off
 * window.Bonsai.oplog + the scene graph + readPixels — never by eye, never via an engine seam. Also captures real
 * screenshots into modeller/tests/e2e_shots/ for the ModellerUserGuide (non-invent: real app frames).
 *
 * Usage:
 *   const { runE2E } = require('./e2e_harness');
 *   runE2E('W-E2E-INSERT', async (t) => {
 *     await t.open('Duplex');
 *     ... t.assert('A1 …', cond, detail);
 *   });
 *
 * ctx (t) API:
 *   t.pg                         puppeteer Page
 *   t.open(key)                  click Open → resident <key> → wait building → fit; injects window.__e2e helpers
 *   t.proj(x,y,z) -> [sx,sy,z]   project a world point to client px (THREE global, camera=window.A.camera)
 *   t.centre(fid) -> [x,y,z]     bbox-centre of the mesh with that featureId (world)
 *   t.pick() -> {fid,centre}     real mouse click on the largest-footprint element → selects it; null if none
 *   t.clickSel(sel)              await t.pg.click(sel)
 *   t.drag(downPx,upPx,steps)    real mouse down→move→up (CSS px)
 *   t.oplog() -> {len,cur}       op-log length + cursor (the maths oracle)
 *   t.lastOp() -> {op_type,parameters,...}   newest GEOM op
 *   t.census(pred)               count dwRoot/group meshes matching pred(userData,obj)
 *   t.pixsum() -> int            strided readPixels checksum (frame changed?)
 *   t.verifyChain() -> bool      KernelOps.verifyChain on the live db
 *   t.undoToCursor(c)            drive the real #hist-slider back to cursor c
 *   t.shot(label)                screenshot → e2e_shots/<NAME>-<label>.png
 *   t.slog                       captured §-console lines
 *   t.assert(name,cond,detail)   tally a claim
 *   t.sleep(ms)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'e2e_shots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };

function serve() {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
    fs.readFile(path.join(ROOT, p), (e, b) => {
      if (e) { r.writeHead(404); r.end('404 ' + p); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b);
    });
  });
}

async function runE2E(NAME, body, opts) {
  opts = opts || {};
  try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
  const server = serve();
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: opts.width || 1280, height: opts.height || 860, deviceScaleFactor: opts.dpr || 1 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 180)));
  const slog = []; pg.on('console', m => { const t = m.text(); if (/^§/.test(t)) slog.push(t); });

  let pass = 0, fail = 0;
  const t = {
    pg, sleep, slog, errs,
    assert(n, c, x) { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } },
    async shot(label) { try { await pg.screenshot({ path: path.join(SHOTS, NAME + '-' + label + '.png') }); } catch (e) {} },
    async open(key) {
      await pg.click('#b-open'); await sleep(200);
      await pg.click('#m-open-panel .mo-row[data-key="' + key + '"]');
      await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => {});
      await sleep(2200);
      const fit = await pg.$('#b-fit'); if (fit) { await fit.click(); await sleep(600); }
      await pg.evaluate(() => {
        window.__e2e = {
          proj(x, y, z) { const v = new window.THREE.Vector3(x, y, z).project(window.A.camera); const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect(); return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top, v.z]; },
          centre(fid) { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid); if (!m) return null; const b = new window.THREE.Box3().setFromObject(m); const c = new window.THREE.Vector3(); b.getCenter(c); return [c.x, c.y, c.z]; },
          pixsum() { const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0; for (let i = 0; i < px.length; i += 257) s = (s + px[i]) >>> 0; return s; },
          candidates() { const g = window.Bonsai.group(); const out = []; const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect(); for (const m of g.children) { if (!m.isMesh || m.userData.featureId == null) continue; const b = new window.THREE.Box3().setFromObject(m); if (!isFinite(b.min.x)) continue; const c = new window.THREE.Vector3(); b.getCenter(c); const p = this.proj(c.x, c.y, c.z); if (p[0] < r.left + 24 || p[0] > r.right - 24 || p[1] < r.top + 24 || p[1] > r.bottom - 24 || p[2] > 1) continue; const sz = new window.THREE.Vector3(); b.getSize(sz); out.push({ fid: m.userData.featureId, sx: p[0], sy: p[1], vol: sz.x * sz.y * sz.z }); } out.sort((a, b) => b.vol - a.vol); return out.slice(0, 14); }
        }; return true;
      });
    },
    proj(x, y, z) { return pg.evaluate((a, b, c) => window.__e2e.proj(a, b, c), x, y, z); },
    centre(fid) { return pg.evaluate(f => window.__e2e.centre(f), fid); },
    pixsum() { return pg.evaluate(() => window.__e2e.pixsum()); },
    async pick() {
      const cands = await pg.evaluate(() => window.__e2e.candidates());
      for (const c of cands) { await pg.mouse.move(c.sx, c.sy); await sleep(40); await pg.mouse.click(c.sx, c.sy); await sleep(120);
        const sel = await pg.evaluate(() => Array.from(window.Bonsai._selSet || [])); if (sel.length === 1) return { fid: sel[0], centre: await this.centre(sel[0]) }; }
      return null;
    },
    clickSel(sel) { return pg.click(sel); },
    async drag(down, up, steps) { await pg.mouse.move(down[0], down[1]); await sleep(40); await pg.mouse.down(); await sleep(40); await pg.mouse.move((down[0] + up[0]) / 2, (down[1] + up[1]) / 2, { steps: Math.max(2, (steps || 6) >> 1) }); await sleep(30); await pg.mouse.move(up[0], up[1], { steps: steps || 6 }); await sleep(60); await pg.mouse.up(); await sleep(450); },
    oplog() { return pg.evaluate(() => ({ len: window.Bonsai.oplog.length, cur: window.Bonsai.oplog.cursor })); },
    lastOp() { return pg.evaluate(() => { const ops = window.Bonsai.oplog._geomOps(); const o = ops[ops.length - 1] || null; return o ? { op_type: o.op_type, parameters: o.parameters, id: o.id } : null; }); },
    census(predSrc) { return pg.evaluate(src => { const f = eval('(' + src + ')'); const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot); const all = g.children.concat(root ? root.children : []); let n = 0, inst = 0; for (const o of all) { if (f(o.userData || {}, o)) { n++; inst += (o.isInstancedMesh ? (o.count || 0) : 1); } } return { n, inst }; }, predSrc.toString()); },
    verifyChain() { return pg.evaluate(async () => { try { const db = await window.Bonsai.oplog._ensureDb(); const v = await window.KernelOps.verifyChain(db); return !!v.ok; } catch (e) { return 'ERR:' + e.message; } }); },
    undoToCursor(c) { return pg.evaluate(cur => { const s = document.getElementById('hist-slider'); s.value = cur; s.dispatchEvent(new Event('input', { bubbles: true })); }, c).then(() => sleep(700)); },
  };

  console.log('═══ ' + NAME + ' — real-user, maths-asserted (headless swiftshader) ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady===true && !!window.THREE && !!window.A && !!window.Bonsai', { timeout: 30000 }).catch(() => {});

  let fatal = null;
  try { await body(t); } catch (e) { fatal = String(e && e.message) + ' | ' + ((e.stack || '').split('\n')[1] || ''); }
  t.assert('NO-ERROR (no pageerror / no fatal)', errs.length === 0 && !fatal, (fatal || '') + ' ' + errs.slice(0, 2).join(' | '));

  await br.close(); server.close();
  console.log(NAME + ': ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}

module.exports = { runE2E, serve };
