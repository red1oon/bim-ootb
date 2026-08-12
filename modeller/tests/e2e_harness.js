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
          candidates() { const g = window.Bonsai.group(); const out = []; const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect(); for (const m of g.children) { if (!m.isMesh || m.userData.featureId == null) continue; const b = new window.THREE.Box3().setFromObject(m); if (!isFinite(b.min.x)) continue; const c = new window.THREE.Vector3(); b.getCenter(c); const p = this.proj(c.x, c.y, c.z); if (p[0] < r.left + 24 || p[0] > r.right - 24 || p[1] < r.top + 24 || p[1] > r.bottom - 24 || p[2] > 1) continue; const sz = new window.THREE.Vector3(); b.getSize(sz); out.push({ fid: m.userData.featureId, sx: p[0], sy: p[1], vol: sz.x * sz.y * sz.z, sz: [sz.x, sz.y, sz.z] }); } out.sort((a, b) => b.vol - a.vol); return out.slice(0, 40); }
          // §F2-FRAMING: dolly the camera to a genuine element CLOSE-UP (spec G4) along the CURRENT view
          // direction — target the element's bbox centre, distance so the element fills `fill` of the frame
          // height. Pure camera maths off the real mesh bbox; no scene mutation.
          , frame(fid, fill) { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid); if (!m) return false; const b = new window.THREE.Box3().setFromObject(m); if (!isFinite(b.min.x)) return false; const c = new window.THREE.Vector3(); b.getCenter(c); const s = new window.THREE.Vector3(); b.getSize(s); const rad = Math.max(s.x, s.y, s.z) * 0.5 || 1; const cam = window.A.camera, ctl = window.A.controls; const dir = new window.THREE.Vector3().subVectors(cam.position, ctl.target).normalize(); const dist = Math.max(rad / Math.tan(cam.fov * Math.PI / 360) / fill, rad * 1.5); ctl.target.copy(c); cam.position.copy(c).addScaledVector(dir, dist); ctl.update(); if (window.A.requestRender) window.A.requestRender(); return true; }
          , dolly(f) { const cam = window.A.camera, ctl = window.A.controls; const d = new window.THREE.Vector3().subVectors(cam.position, ctl.target); cam.position.copy(ctl.target).addScaledVector(d, f); ctl.update(); if (window.A.requestRender) window.A.requestRender(); return true; }
          // §F2-FRAMING: deterministic overhead plan view over (cx,cy) at height h — the exact camera pattern
          // the app itself uses for its own top-down moments (modeller.html §deep-link: up=(0,1,0), position
          // above, target below). Saved/restored so tool state after the shot is untouched.
          , overhead(cx, cy, h) { const cam = window.A.camera, ctl = window.A.controls; this._camSave = { pos: cam.position.clone(), tgt: ctl.target.clone(), up: cam.up.clone() }; cam.up.set(0, 1, 0); cam.position.set(cx, cy, h); ctl.target.set(cx, cy, 0); ctl.update(); if (window.A.requestRender) window.A.requestRender(); return true; }
          , camRestore() { if (!this._camSave) return false; const cam = window.A.camera, ctl = window.A.controls; cam.position.copy(this._camSave.pos); ctl.target.copy(this._camSave.tgt); cam.up.copy(this._camSave.up); ctl.update(); this._camSave = null; if (window.A.requestRender) window.A.requestRender(); return true; }
          // §F2-FRAMING: find a ground square that is clear IN PLAN (no mesh bbox above it at ANY height —
          // roofs included), nearest the building for context. EXTRACTED from the live scene, not a hardcoded
          // "known clear" constant (the old (2,0)-(4.4,2.4) spot sits under the Duplex roof: clear at ground
          // level, roof-occluded from above — every plan capture there was doomed).
          , clearGround(size) {
            const g = window.Bonsai.group();
            const boxes = []; const all = new window.THREE.Box3();
            for (const m of g.children) { if (!m.isMesh) continue; const b = new window.THREE.Box3().setFromObject(m); if (!isFinite(b.min.x)) continue; boxes.push(b); all.union(b); }
            // Nearest-to-centroid finds interior COURTYARDS — plan-clear but wall-occluded from the camera,
            // so the tool's ground clicks hit walls instead (measured: 1/4 sketch points registered there).
            // Require: plan-clear AND outside the building footprint AND on the CAMERA side — the square
            // just outside the bbox edge facing the camera has open sightlines by construction.
            const camP = window.A.camera.position;
            const tx = Math.min(Math.max(camP.x, all.min.x), all.max.x), ty = Math.min(Math.max(camP.y, all.min.y), all.max.y);
            const cands = [];
            for (let x = all.min.x - 10; x <= all.max.x + 10; x += 1) for (let y = all.min.y - 10; y <= all.max.y + 10; y += 1) cands.push([x, y]);
            cands.sort((a, b) => ((a[0] - tx) ** 2 + (a[1] - ty) ** 2) - ((b[0] - tx) ** 2 + (b[1] - ty) ** 2));
            const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect();
            const meshes = g.children.filter(m => m.isMesh);
            // Prefer squares ON the rendered grid (the guide captions say "on the grid"; the floor is black
            // beyond the GridHelper) — measured from the actual helper in the scene, fallback = anywhere.
            let gridBox = null;
            window.A.scene.children.forEach(o => { if (o.type === 'GridHelper') gridBox = new window.THREE.Box3().setFromObject(o); });
            const inGrid = ([x, y]) => !gridBox || (x >= gridBox.min.x && x + size <= gridBox.max.x && y >= gridBox.min.y && y + size <= gridBox.max.y);
            cands.sort((a, b) => (inGrid(a) === inGrid(b)) ? 0 : (inGrid(a) ? -1 : 1));
            const rc = new window.THREE.Raycaster();
            const occluded = (px, py) => {   // a mesh between the camera and this ground point ⇒ the click would hit IT, not the ground
              const gp = new window.THREE.Vector3(px, py, 0);
              const dir = gp.clone().sub(camP); const dist = dir.length(); dir.normalize();
              rc.set(camP, dir); rc.far = dist - 0.05;
              return rc.intersectObjects(meshes, false).length > 0;
            };
            for (const [x0, y0] of cands) {
              let clear = true;
              for (const b of boxes) { if (x0 + size > b.min.x && x0 < b.max.x && y0 + size > b.min.y && y0 < b.max.y) { clear = false; break; } }
              if (!clear) continue;
              // every corner must PROJECT inside the canvas (pointerdown listens on the canvas only) AND be
              // unoccluded from the camera (a courtyard square is plan-clear but its clicks hit the walls)
              let ok = true;
              for (const [px, py] of [[x0, y0], [x0 + size, y0], [x0, y0 + size], [x0 + size, y0 + size]]) {
                const p = this.proj(px, py, 0);
                if (p[0] < r.left + 24 || p[0] > r.right - 24 || p[1] < r.top + 24 || p[1] > r.bottom - 24 || p[2] > 1 || occluded(px, py)) { ok = false; break; }
              }
              if (ok) return [x0, y0];
            }
            return null;
          }
          , bboxScreen(fid) { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid); if (!m) return null; const b = new window.THREE.Box3().setFromObject(m); if (!isFinite(b.min.x)) return null; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; for (let i = 0; i < 8; i++) { const x = (i & 1) ? b.max.x : b.min.x, y = (i & 2) ? b.max.y : b.min.y, z = (i & 4) ? b.max.z : b.min.z; const p = this.proj(x, y, z); if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; } return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }; }
          // Anti-flake (2026-07-30, found chasing W-E2E-CUT/W-E2E-SEL-TINT-REFOLD pick()=null runs): clicking a
          // candidate's projected BBOX CENTRE is a lottery — a low wall's centre is routinely occluded by an
          // upper-storey mesh, so whether the click lands depends on sub-pixel camera state that varies run to
          // run. Return a VERIFIED click point instead: sample the mesh's own triangle centroids, project each,
          // and keep the first whose raycast FIRST HIT (same raycast the app's pick uses) is this very mesh.
          // Deterministic given the camera; null = genuinely not visible from here (caller skips the candidate).
          , clickPointFor(fid) {
            const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid); if (!m) return null;
            const cam = window.A.camera, rc = new window.THREE.Raycaster();
            const meshes = g.children.filter(o => o.isMesh);
            const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect();
            m.updateMatrixWorld();
            const pos = m.geometry.attributes.position, idx = m.geometry.index;
            const triN = idx ? idx.count / 3 : pos.count / 3;
            const samples = Math.min(triN, 60), p = new window.THREE.Vector3();
            for (let s = 0; s < samples; s++) {
              const ti = Math.floor(s * triN / samples);
              const a = idx ? idx.getX(ti * 3) : ti * 3, b = idx ? idx.getX(ti * 3 + 1) : ti * 3 + 1, c = idx ? idx.getX(ti * 3 + 2) : ti * 3 + 2;
              p.set((pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3, (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3).applyMatrix4(m.matrixWorld);
              const sp = this.proj(p.x, p.y, p.z);
              if (sp[0] < r.left + 8 || sp[0] > r.right - 8 || sp[1] < r.top + 8 || sp[1] > r.bottom - 8 || sp[2] > 1) continue;
              rc.setFromCamera(new window.THREE.Vector2(((sp[0] - r.left) / r.width) * 2 - 1, -(((sp[1] - r.top) / r.height) * 2 - 1)), cam);
              const hits = rc.intersectObjects(meshes, false);
              if (hits.length && hits[0].object === m) return [sp[0], sp[1]];
            }
            return null;
          }
        }; return true;
      });
      // §OPEN-SETTLE (2026-08-07, guide-recapture hardening): on a loaded machine the fixed 2200/600ms
      // sleeps above aren't always enough — candidates() (on-screen-projected, camera-dependent) has been
      // observed returning 0 immediately post-fit, then 40 ~1-1.5s later once the fit/damping settles. This
      // is camera-timing flake, not an app bug (mesh/candidate DATA is present throughout — see diag capture
      // in RESUME_MODELLER_GUIDE_SCREENSHOT_FIX.md 2026-08-07). Poll instead of trusting the fixed sleep so
      // t.pick() never starts its scan against a transiently-empty candidate list.
      { const t0 = Date.now(); let n = 0;
        while (Date.now() - t0 < 6000) { n = await pg.evaluate(() => window.__e2e.candidates().length); if (n > 0) break; await sleep(200); }
        console.log('  §OPEN-SETTLE candidates=' + n + ' waitedMs=' + (Date.now() - t0)); }
    },
    proj(x, y, z) { return pg.evaluate((a, b, c) => window.__e2e.proj(a, b, c), x, y, z); },
    centre(fid) { return pg.evaluate(f => window.__e2e.centre(f), fid); },
    // real mouse click ON the mesh with this featureId, at a raycast-verified point (anti-flake — see
    // __e2e.clickPointFor); falls back to the projected bbox centre if no verified point is visible.
    async clickOn(fid) {
      let pt = await pg.evaluate(f => window.__e2e.clickPointFor(f), fid);
      if (!pt) { const c = await this.centre(fid); if (!c) return false; pt = await this.proj(c[0], c[1], c[2]); }
      await pg.mouse.click(pt[0], pt[1]); await sleep(250);
      return true;
    },
    pixsum() { return pg.evaluate(() => window.__e2e.pixsum()); },
    async bboxScreen(fid) { return pg.evaluate(f => window.__e2e.bboxScreen(f), fid); },
    // §F2-FRAMING: fly the camera to a real element close-up (spec G4 "element close-up") — use BEFORE
    // shotClip so the clip region is a legible close-up, not a sliver of a wide shot. fill≈0.4 → the element
    // spans ~40% of the frame height. Logged so a silent no-op (mesh not found) can't hide again.
    async frameElement(fid, fill) {
      const ok = await pg.evaluate((f, fl) => window.__e2e.frame(f, fl), fid, fill == null ? 0.4 : fill);
      await sleep(350);
      console.log('  §SHOTFRAME fid=' + fid + ' fill=' + (fill == null ? 0.4 : fill) + ' ok=' + ok);
      return ok;
    },
    async dolly(f) { await pg.evaluate(x => window.__e2e.dolly(x), f); await sleep(250); },
    async clearGround(size) { const r = await pg.evaluate(s => window.__e2e.clearGround(s), size); console.log('  §CLEARGROUND size=' + size + ' -> ' + JSON.stringify(r)); return r; },
    // §F2-FRAMING: pan the (already plan) mode camera over (cx,cy) — the deterministic stand-in for the real
    // user panning to their drawing area. Sketch/Route enter at a FIXED plan view over (2,1.5), which on the
    // Duplex is roof — everything drawn there is roof-occluded in every capture. No restore needed mid-mode:
    // exitSketch/exitRoute restore their own savedCam.
    async overheadTo(cx, cy, h) { await pg.evaluate((a, b, c) => window.__e2e.overhead(a, b, c), cx, cy, h == null ? 12 : h); await sleep(350); },
    // §F2-FRAMING fix (guide-screenshot card): the old clip was NOT clamped to the viewport — any element
    // whose bbox+margin left the page made puppeteer THROW, and the catch fell back to a full wide shot,
    // SILENTLY. That silent fallback (plus pick() always choosing the biggest slab) is exactly how 8 broken
    // guide frames shipped. Now: clamp to the viewport, enforce a minimum legible clip, and LOG the §SHOTCLIP
    // decision so a fallback is visible in the witness log.
    _clampClip(clip) {
      const vw = pg.viewport().width, vh = pg.viewport().height;
      const MIN = 320;   // a clip smaller than this is an unreadable sliver — grow it around its centre
      let { x, y, width, height } = clip;
      if (width < MIN) { x -= (MIN - width) / 2; width = MIN; }
      if (height < MIN) { y -= (MIN - height) / 2; height = MIN; }
      x = Math.max(0, Math.min(x, vw - 16)); y = Math.max(0, Math.min(y, vh - 16));
      width = Math.min(width, vw - x); height = Math.min(height, vh - y);
      return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
    },
    async shotClip(label, fid, margin) {
      const b = await this.bboxScreen(fid);
      if (!b) { console.log('  §SHOTCLIP ' + label + ' FALLBACK=full (no bbox for fid=' + fid + ')'); return this.shot(label); }
      const m = margin == null ? 48 : margin;
      const clip = this._clampClip({ x: b.x - m, y: b.y - m, width: b.width + m * 2, height: b.height + m * 2 });
      console.log('  §SHOTCLIP ' + label + ' clip=' + JSON.stringify(clip) + ' (bbox ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' +m' + m + ')');
      try { await pg.screenshot({ path: path.join(SHOTS, NAME + '-' + label + '.png'), clip }); }
      catch (e) { console.log('  §SHOTCLIP ' + label + ' FALLBACK=full (screenshot threw: ' + String(e && e.message).slice(0, 80) + ')'); await this.shot(label); }
    },
    async shotPts(label, pts, margin) {   // clip around a set of known client-space [x,y] points (e.g. a sketch profile)
      const m = margin == null ? 120 : margin;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      const clip = this._clampClip({ x: minX - m, y: minY - m, width: (maxX - minX) + m * 2, height: (maxY - minY) + m * 2 });
      console.log('  §SHOTCLIP ' + label + ' clip=' + JSON.stringify(clip) + ' (pts=' + pts.length + ' +m' + m + ')');
      try { await pg.screenshot({ path: path.join(SHOTS, NAME + '-' + label + '.png'), clip }); }
      catch (e) { console.log('  §SHOTCLIP ' + label + ' FALLBACK=full (screenshot threw: ' + String(e && e.message).slice(0, 80) + ')'); await this.shot(label); }
    },
    // opts.prefer='wall': §F2-FRAMING — guide frames captioned "the wall" used to get the BIGGEST element
    // (always a floor/roof slab; vol-desc order). Prefer wall-like candidates (tall, thin, room-scale) and
    // require the click to have selected THAT candidate (the old code returned whatever got selected).
    async pick(opts) {
      opts = opts || {};
      const wallish = c => c.sz && c.sz[2] >= 1.2 && Math.min(c.sz[0], c.sz[1]) <= 0.6 && Math.max(c.sz[0], c.sz[1]) >= 1.0 && Math.max(c.sz[0], c.sz[1]) <= 8;
      // opts.cuttable (W-E2E-CUT / W-E2E-SEL-TINT-REFOLD subject guard, 2026-07-30): keep only candidates the
      // PRODUCTION cut gate itself accepts — a rotated/non-box/non-layered ARC insert is HONESTLY refused by
      // bCut (Bonsai.canCut returns false), so a cut witness that picks one measures the refusal path, not
      // the cut. Eligibility is asked OF the production gate (reused, not re-implemented); a non-GEOM_INSERT
      // solid is worker-cuttable natively. §LAYER-SOLID-SEED (CUT_GATE_CSG_SPEC.md §THE CALL): canCut() now
      // also accepts a real authored multi-layer wall (not just a plain box) — was Bonsai._insertCutBox
      // directly, widened to canCut() so this witness can reach the SAME real-wall population the fix adds.
      const filterCuttable = async (list) => {
        if (!opts.cuttable) return list;
        const ok = await pg.evaluate(fids => {
          const ops = window.Bonsai.oplog._geomOps(); const byId = new Map(ops.map(o => [o.id, o]));
          const out = {};
          fids.forEach(f => { const op = byId.get(f); if (!op) { out[f] = false; return; } let c = false; try { c = window.Bonsai.canCut(op); } catch (e) { } out[f] = !!c; });
          return out;
        }, list.map(c => c.fid));
        return list.filter(c => ok[c.fid]);
      };
      // opts.axisSafe (2026-08-07, guide-recapture card, W-E2E-MOVE finding): a Move/Scale gizmo's per-axis
      // handle is LOCAL to the insert (§F2-FRAMING precedent in witness_e2e_scale.js: "the scaleX cube sits
      // on the insert's LOCAL x"). The size-only `wallish` heuristic can't tell a real wall from a genuinely
      // TILTED insert with the same world-AABB proportions — found live: fid=69 in Duplex is an IfcWindow
      // with placement.rotY=90° (a real pitch, not a wall) that "wallish" happily matched, and a world-+X
      // drag on it produced a 1.2m world-Z shift the op-log never recorded (local-X ≠ world-X once rotY≠0).
      // Filter to inserts whose OWN placement has near-zero rotX/rotY — world axes == local axes, so a
      // world-X drag and the op's dx/dy/dz mean the same thing (the assumption every axis-drag witness makes).
      const filterAxisSafe = async (list) => {
        if (!opts.axisSafe) return list;
        const ok = await pg.evaluate(fids => {
          const ops = window.Bonsai.oplog._geomOps(); const byId = new Map(ops.map(o => [o.id, o]));
          const out = {};
          fids.forEach(f => { const op = byId.get(f); if (!op) { out[f] = false; return; }
            if (op.op_type !== 'GEOM_INSERT') { out[f] = true; return; }
            const pl = op.parameters && op.parameters.placement;
            out[f] = !pl || (Math.abs(pl.rotX || 0) < 1e-6 && Math.abs(pl.rotY || 0) < 1e-6); });
          return out;
        }, list.map(c => c.fid));
        return list.filter(c => ok[c.fid]);
      };
      let cands = await filterAxisSafe(await filterCuttable(await pg.evaluate(() => window.__e2e.candidates())));
      // opts.maxVol (2026-08-07, W-E2E-MOVE finding): headless-swiftshader crashed reproducibly (3/3 runs,
      // "Target closed") capturing a close-up right after dragging Duplex's single BIGGEST panel (fid=112,
      // vol=11.38 — an 8.8m exterior wall with 2 hosted fillings; re-fold retessellates the whole span). Not
      // chased further (a real GPU-driver/software-rasterizer resource limit, not app logic — out of a
      // guide-screenshot lane's scope) — cap candidate volume so witnesses needing a legible single-element
      // close-up don't land on the pathological largest mesh in the building.
      if (opts.maxVol != null) cands = cands.filter(c => c.vol <= opts.maxVol);
      if (opts.prefer === 'wall') {
        cands = cands.filter(wallish).concat(cands.filter(c => !wallish(c)));
      }
      // §ZOOM-SEL: every selection now auto-flies the camera (modeller.html zoomToSelection). A real user
      // acts on the SETTLED frame, so pick() waits out the fly (window.__flyLive oracle) before returning —
      // otherwise every coordinate a witness computes right after pick() is stale mid-flight. On a wrong-fid
      // hit the fly also moved the camera, so the remaining precomputed candidate coords are stale too:
      // refetch them and restart the scan.
      for (let attempt = 0; attempt < 2; attempt++) {
        for (const c of cands) {
          // Anti-flake: click a raycast-VERIFIED point on the candidate itself (see __e2e.clickPointFor),
          // not its bbox centre — a centre occluded by an upper storey made pick() return null run-to-run.
          const pt = await pg.evaluate(f => window.__e2e.clickPointFor(f), c.fid);
          if (!pt && opts.prefer) continue;   // candidate genuinely not visible from this camera → next
          const cx = pt ? pt[0] : c.sx, cy = pt ? pt[1] : c.sy;
          await pg.mouse.move(cx, cy); await sleep(40); await pg.mouse.click(cx, cy); await sleep(120);
          const sel = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
          if (sel.length === 1 && (!opts.prefer || sel[0] === c.fid)) { await this.flySettle(); return { fid: sel[0], centre: await this.centre(sel[0]) }; }
          if (sel.length) {
            // selected the WRONG element (occluder in front of the candidate's projected centre) → the camera
            // flew to it, so every remaining candidate's precomputed coords are stale. Restore the EXACT frame
            // they were computed from (deselect = no fly on empty, then re-Fit = deterministic whole-model
            // frame, same as t.open's) and keep marching the list.
            await this.flySettle();
            await pg.evaluate(() => window.Bonsai.select(null));
            const fit = await pg.$('#b-fit'); if (fit) { await fit.click(); await sleep(600); }
          }
        }
        cands = await filterAxisSafe(await filterCuttable(await pg.evaluate(() => window.__e2e.candidates())));
        if (opts.maxVol != null) cands = cands.filter(c => c.vol <= opts.maxVol);
        if (opts.prefer === 'wall') cands = cands.filter(wallish).concat(cands.filter(c => !wallish(c)));
      }
      return null;
    },
    // §ZOOM-SEL: wait for an in-flight zoom-to-selection camera fly (plus OrbitControls damping tail) to
    // finish — headless-swiftshader rAF runs ~14fps so the 25-frame fly takes ~2s wall-clock.
    async flySettle(maxMs) {
      const t0 = Date.now(); maxMs = maxMs || 15000;
      while (Date.now() - t0 < maxMs && await pg.evaluate(() => !!window.__flyLive)) await sleep(120);
      await sleep(300);
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
