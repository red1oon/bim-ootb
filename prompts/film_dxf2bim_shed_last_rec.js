#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope: prompts/FILM_DXF2BIM_WHY_MARKINGS.md §LAST PART ("Drawings to a building you can edit and service"): the 9 marked shed sheets open placed, Convert assembles the shed, Export ▸ Viewer
// database saves it, a fresh Modeller reopens that file as editable ARC, the fans are picked on the left, the left DISC rows walk lights and sprinklers (the Farming Shed reference, §D62). LIVE recorder in the
// pattern of film_dxf2bim_why_rec.js: real pointer, clicks and wheel; the page's state is READ for facts only (§FILM_FACT); a pointer dot, chapter backdrops (stated film-only additions). Software GL.
// Read take.log after every run: §PAGEERR, a missing fact, or 0 lights / sprinklers = not a take.
// usage: SITE=<modeller.html of bim-ootb main> SHED_MARKED_DIR=<the 9 CLI-marked sheets> node prompts/film_dxf2bim_shed_last_rec.js <take dir> [beat_min.json]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const OUT = path.resolve(process.argv[2] || '.'), BEAT_MIN = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};
const SITE = process.env.SITE || 'https://red1oon.github.io/bim-ootb/modeller/modeller.html';
const MARKED = process.env.SHED_MARKED_DIR || path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked');
const dxfs = d => fs.readdirSync(d).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(d, f));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (!fs.existsSync(MARKED) || dxfs(MARKED).length !== 9) throw new Error('SHED_MARKED_DIR must hold the 9 CLI-marked sheets: ' + MARKED);
  fs.mkdirSync(OUT, { recursive: true });
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1440,810'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810, deviceScaleFactor: 4 / 3 });
  const plog = []; pg.on('console', m => { const t = m.text(); plog.push(t); if (/§DXF-CONVERT counts|§VIEWERDB|§LOCAL-OPEN|§DW-RULES-REF|§DW-PRIM-LOD disc|§DISC-WALK-COMMIT|PAGEERR/.test(t)) console.log(t.slice(0, 260)); });
  pg.on('pageerror', e => console.log('§PAGEERR ' + String(e).slice(0, 300)));
  await pg.evaluateOnNewDocument(() => { const mk = () => { if (document.getElementById('film-ptr')) return; const d = document.createElement('div'); d.id = 'film-ptr';
      d.style.cssText = 'position:fixed;left:-50px;top:-50px;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,214,64,.95);border:2px solid #14161c;box-shadow:0 0 0 2px rgba(255,214,64,.45);z-index:2147483647;pointer-events:none;transition:transform .12s';
      document.documentElement.appendChild(d);
      document.addEventListener('mousemove', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
      document.addEventListener('mousedown', () => { d.style.transform = 'scale(.7)'; }, true); document.addEventListener('mouseup', () => { d.style.transform = ''; }, true); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk(); });
  const cdp = await pg.createCDPSession();
  const SAVED = path.join(OUT, 'saved'); fs.rmSync(SAVED, { recursive: true, force: true }); fs.mkdirSync(SAVED, { recursive: true });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVED }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVED }));
  const fact = (k, v) => console.log('§FILM_FACT ' + k + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  const FR = path.join(OUT, 'frames'); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
  const frames = []; let nf = 0;
  cdp.on('Page.screencastFrame', async ev => { const f = path.join(FR, String(nf++).padStart(6, '0') + '.jpg'); fs.writeFileSync(f, Buffer.from(ev.data, 'base64')); frames.push({ f, ts: ev.metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) { } });
  const beatLog = [], chapLog = []; let beatStart = 0, beatId = null, chapNext = null; const now = () => Date.now() / 1000;
  const hold = async () => { if (beatId) { const need = (BEAT_MIN[beatId] || 5) + 0.8 - (now() - beatStart); if (need > 0) await sleep(need * 1000); } };
  const beat = async id => { await hold(); beatId = id; beatStart = now(); beatLog.push([id, beatStart]); if (chapNext) { chapLog.push([chapNext[0], chapNext[1], beatStart]); chapNext = null; } console.log('§FILM_BEAT_AT ' + id); };
  const chapter = (n, key) => { chapNext = [n, key]; };
  const backdrop = n => pg.screenshot({ path: path.join(OUT, 'bd' + n + '.png') });
  let mx = 720, my = 405;
  const moveTo = async (x, y, ms = 650) => { const steps = Math.max(8, Math.round(ms / 22)); for (let i = 1; i <= steps; i++) { const k = i / steps, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await pg.mouse.move(mx + (x - mx) * e, my + (y - my) * e); await sleep(ms / steps); } mx = x; my = y; };
  const rect = sel => pg.$eval(sel, e => { e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const clickAt = async (sel, ms) => { const r = await rect(sel); await moveTo(r.x + Math.min(r.w / 2, 60), r.y + r.h / 2, ms); await sleep(250); await pg.mouse.down(); await sleep(90); await pg.mouse.up(); return r; };
  // the camera: the built model in the strip the open panels leave free (fixed panels: tested by display and width), then a slow turn
  const fitBuilt = (fill, ms) => pg.evaluate(([fill, ms]) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls, box = new T.Box3();
      A.scene.children.filter(o => /^Bonsai/.test(o.name || '') && o.visible).forEach(o => { const b = new T.Box3().setFromObject(o); if (!b.isEmpty()) box.union(b); });
      if (box.isEmpty()) { const g = A.scene.children.find(o => (o.name === 'dxf-arrange' || o.name === 'dxf-sheets') && o.visible && o.children.length); if (g) box.setFromObject(g); }
      if (box.isEmpty()) { res(false); return; }
      const ctr = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3()), r = Math.max(size.x, size.y, size.z * 2, 0.5) * 0.5;
      const pr = ['dm-panel', 'dxf-panel', 'ol'].filter(id => !(id === 'ol' && document.body.classList.contains('ol-collapsed'))).map(id => document.getElementById(id)).filter(e => e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0).map(e => e.getBoundingClientRect().right), x0 = Math.max(0, ...pr), x1 = innerWidth - 70;
      const th = Math.tan(c.fov * Math.PI / 360), W = Math.max(200, x1 - x0), dist = Math.max(r / th, r / (th * (W / innerHeight))) * fill + r * 0.1, dir = new T.Vector3(1, -1, 0.9).normalize();
      c.up.set(0, 0, 1); const p0 = c.position.clone(), q0 = ctl.target.clone(); c.position.copy(ctr).addScaledVector(dir, dist); ctl.target.copy(ctr); ctl.update(); c.updateMatrixWorld();
      const ndcX = ((x0 + x1) / 2) / innerWidth * 2 - 1, hw = dist * th * c.aspect, sh = new T.Vector3().setFromMatrixColumn(c.matrixWorld, 0).multiplyScalar(-ndcX * hw), P1 = c.position.clone().add(sh), Q1 = ctl.target.clone().add(sh);
      c.position.copy(p0); ctl.target.copy(q0); ctl.update(); const t0 = performance.now();
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.lerpVectors(p0, P1, s); ctl.target.lerpVectors(q0, Q1, s); ctl.update(); if (k < 1) requestAnimationFrame(step); else res(true); })(); }), [fill, ms || 1800]);
  const orbitZ = (deg, ms) => pg.evaluate((deg, ms) => new Promise(res => { const A = window.A, T = window.THREE, ctl = A.controls, c = A.camera, o = ctl.target.clone(), v0 = c.position.clone().sub(o), t0 = performance.now();
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.copy(o).add(v0.clone().applyAxisAngle(new T.Vector3(0, 0, 1), deg * Math.PI / 180 * s)); ctl.update(); if (k < 1) requestAnimationFrame(step); else res(); })(); }), deg, ms);
  const fresh = async () => { await pg.goto(SITE, { timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 }); await sleep(1200); };
  // inside the shed at eye height, looking down its length (the fixtures hang under the truss: from outside the roof hides them), then a slow dolly along it
  const inside = (ms, dolly) => pg.evaluate(([ms, dolly]) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls, G = window.Bonsai.group(), b = new T.Box3();
      G.children.filter(m => m.isMesh && m.visible && !m.isInstancedMesh).forEach(m => b.union(new T.Box3().setFromObject(m))); if (b.isEmpty()) { res(); return; }
      const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, ax = sx >= sy ? 0 : 1, lo = b.min.getComponent(ax), L = (ax ? sy : sx), mid = b.getCenter(new T.Vector3()), z = (window.__filmFloorZ || b.min.z + 1.2) + 1.7;
      const at = f => { const v = mid.clone(); v.setComponent(ax, lo + L * f); v.z = z; return v; };
      const P1 = at(0.06), Q1 = at(0.94).add(new T.Vector3(0, 0, 0.9)), P2 = at(0.06 + dolly), Q2 = at(0.94 + dolly).add(new T.Vector3(0, 0, 0.9)), p0 = c.position.clone(), q0 = ctl.target.clone(); c.up.set(0, 0, 1);
      let t0 = performance.now(); const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      (function s1() { const k = Math.min(1, (performance.now() - t0) / 2200), e = ease(k); c.position.lerpVectors(p0, P1, e); ctl.target.lerpVectors(q0, Q1, e); ctl.update();
        if (k < 1) requestAnimationFrame(s1); else { t0 = performance.now(); (function s2() { const k2 = Math.min(1, (performance.now() - t0) / ms); c.position.lerpVectors(P1, P2, k2); ctl.target.lerpVectors(Q1, Q2, k2); ctl.update(); if (k2 < 1) requestAnimationFrame(s2); else res(); })(); } })(); }), [ms, dolly]);
  // the 2D wireframes from above, then a slow push-in (the camera only)
  const topPush = (ms) => pg.evaluate(ms => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls, g = A.scene.children.find(o => (o.name === 'dxf-arrange' || o.name === 'dxf-sheets') && o.visible && o.children.length); if (!g) { res(false); return; }
      const b = new T.Box3().setFromObject(g), ctr = b.getCenter(new T.Vector3()), sz = b.getSize(new T.Vector3()), r = Math.max(sz.x, sz.y) * 0.5, th = Math.tan(c.fov * Math.PI / 360), d0 = r / th * 1.05, d1 = d0 * 0.62;
      const dir0 = new T.Vector3(0, -0.04, 1).normalize(), dir1 = new T.Vector3(0.25, -0.55, 1).normalize(), P0 = ctr.clone().addScaledVector(dir0, d0), P1 = ctr.clone().addScaledVector(dir1, d1); c.up.set(0, 0, 1);
      c.position.copy(P0); ctl.target.copy(ctr); ctl.update(); const t0 = performance.now();
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.lerpVectors(P0, P1, e); ctl.update(); if (k < 1) requestAnimationFrame(step); else res(true); })(); }), ms);
  // a close-up on ONE walked fixture: the placement nearest the point the camera looks at ahead; the camera eases to `dist` m off it, slightly below, looking up at it
  const closeUp = (disc, dist, ms, ahead) => pg.evaluate(([disc, dist, ms, ahead]) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls;
      const IM = []; A.scene.traverse(o => { if (o.isInstancedMesh && o.visible && o.userData && o.userData.dwDisc === disc) IM.push(o); }); if (!IM.length) { res(null); return; }
      const fwd = ctl.target.clone().sub(c.position).normalize(), aim = c.position.clone().addScaledVector(fwd, ahead), M = new T.Matrix4(), W = new T.Matrix4(); let best = null;
      IM.forEach(im => { im.updateMatrixWorld(); if (!im.geometry.boundingBox) im.geometry.computeBoundingBox(); const gb = im.geometry.boundingBox;
        for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, M); W.multiplyMatrices(im.matrixWorld, M); const bb = gb.clone().applyMatrix4(W), ctr = bb.getCenter(new T.Vector3()), d = Math.hypot(ctr.x - aim.x, ctr.y - aim.y);
          if (!best || d < best.d) best = { d, ctr, size: bb.getSize(new T.Vector3()).length() }; } });   // the DRAWN instance (its own matrix), not the placement record
      const tg = best.ctr, h = new T.Vector3(fwd.x, fwd.y, 0).normalize(), D = Math.max(dist, best.size * 1.6), toP = tg.clone().addScaledVector(h, -D).add(new T.Vector3(0, 0, -D * 0.45)), fromP = c.position.clone(), fromT = ctl.target.clone(), t0 = performance.now();
      c.near = Math.min(c.near, Math.max(0.01, D / 20)); c.updateProjectionMatrix(); if (window.__filmMinD === undefined) window.__filmMinD = ctl.minDistance; ctl.minDistance = Math.min(ctl.minDistance, D / 2);   // the controls' own clamp would push a macro back
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.lerpVectors(fromP, toP, e); ctl.target.lerpVectors(fromT, tg, e); ctl.update(); if (k < 1) requestAnimationFrame(step); else res({ x: +tg.x.toFixed(2), y: +tg.y.toFixed(2), z: +tg.z.toFixed(3), size_m: +best.size.toFixed(3), dist_m: +D.toFixed(2) }); })(); }), [disc, dist, ms, ahead]);
  // a real canvas click on one body of a class that the camera sees unobstructed (raycast first, nothing rendered), read back from the status line
  const pickClass = async cls => { const pk = await pg.evaluate(cls => { const A = window.A, T = window.THREE, G = window.Bonsai.group(), rc = new T.Raycaster(), meshes = G.children.filter(x => x.isMesh && x.visible && !x.isInstancedMesh), cv = A.renderer.domElement.getBoundingClientRect();
      const ids = new Set(window.Bonsai.oplog._geomOps().filter(o => { const P = o.params || (typeof o.parameters === 'string' ? JSON.parse(o.parameters) : o.parameters) || {}; return P.ifc_class === cls; }).map(o => o.id));
      for (const m of meshes) { if (!ids.has(m.userData.featureId)) continue; const ctr = new T.Box3().setFromObject(m).getCenter(new T.Vector3()), v = ctr.clone().project(A.camera); if (v.z > 1 || Math.abs(v.x) > 0.8 || Math.abs(v.y) > 0.8) continue;
        rc.setFromCamera(new T.Vector2(v.x, v.y), A.camera); const h = rc.intersectObjects(meshes, false)[0]; if (h && h.object === m) return { fid: m.userData.featureId, x: cv.left + (v.x + 1) / 2 * cv.width, y: cv.top + (1 - v.y) / 2 * cv.height }; }
      return null; }, cls);
    if (!pk) return null; await moveTo(pk.x, pk.y, 800); await sleep(250); await pg.mouse.down(); await sleep(90); await pg.mouse.up(); await sleep(1200);
    const st = await pg.$eval('#stat', e => e.innerText), m = /selected feature #(\d+)/.exec(st); return m && +m[1] === pk.fid ? pk.fid : null; };
  const closeMeta = async () => { for (let g = 0; g < 20; g++) { const open = await pg.evaluate(() => { const e = document.getElementById('dm-panel'); return !!(e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0); });
      if (!open) return; if (await pg.$('#dm-close')) await clickAt('#dm-close', 500); await sleep(700); } };
  const walkDisc = async disc => { await pg.evaluate(() => { window.__dwLastDoneDisc = null; }); await clickAt('#bo-tree [data-disc="' + disc + '"]', 700);
    await pg.waitForFunction(d => window.__dwLastDoneDisc === d, { timeout: 300000, polling: 200 }, disc); await sleep(1500);
    return pg.evaluate(d => ({ n: (window.__dwWalks[d] || []).length, stat: (document.getElementById('stat') || {}).innerText || '' }), disc); };

  // ================= TAKE =================
  await fresh();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  // ---- chapter 1 ASSEMBLED ----
  chapter(1, 'assembled'); await beat('s01');
  await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
  await clickAt('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true }); await sleep(700);
  const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 30000 }), clickAt('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(dxfs(MARKED));
  await pg.waitForFunction(() => window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length === 9 && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict, { timeout: 300000, polling: 100 });
  await sleep(1500); await closeMeta();   // both panels away: the 2D wireframes fill the canvas
  if (await pg.$('#dxf-fold')) { await clickAt('#dxf-fold', 500); await sleep(600); }
  fact('sheets', String(await pg.evaluate(() => window.DxfMetaEditor.state.sheets.length)));
  await topPush(9000); await backdrop(1);
  await beat('s02');
  if (await pg.$('#dxf-fold')) { await clickAt('#dxf-fold', 500); await sleep(600); }   // unfold: the option and Convert are in this panel
  if (await pg.$('#dxf-complete') && !(await pg.$eval('#dxf-complete', e => e.checked))) { await clickAt('#dxf-complete', 700); await sleep(600); }   // the floor slab and the roof the drawings imply
  fact('complete_ticked', String(await pg.evaluate(() => { const e = document.getElementById('dxf-complete'); return !!(e && e.checked); })));
  await clickAt('#dxf-convert', 800); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 300000 }); await sleep(2000);
  { const L = await pg.evaluate(() => ({ n: window.DxfImportUI.state.last.nInserts, counts: window.DxfImportUI.state.last.counts })), sum = re => Object.keys(L.counts).filter(k => re.test(k)).reduce((a, k) => a + L.counts[k], 0);
    fact('bodies', String(L.n)); fact('n_fans', String(sum(/IfcFan$/))); fact('n_columns', String(sum(/IfcColumn$/))); fact('n_walls', String(sum(/IfcWall$/))); }
  await closeMeta(); if (await pg.$('#dxf-fold')) { await clickAt('#dxf-fold', 500); await sleep(500); }
  await fitBuilt(0.55, 3200); await orbitZ(40, 6000);   // the crane from the plan view up into the three-quarter view, then a turn
  await beat('s02b');
  // the fans: a real click on a gable-end fan in the canvas (the Modeller's own pick: select + frame); a try that hits another body is cleared with Escape
  { const fans = await pg.evaluate(() => window.Bonsai.oplog._geomOps().filter(o => { const P = o.params || (typeof o.parameters === 'string' ? JSON.parse(o.parameters) : o.parameters) || {}; return P.ifc_class === 'IfcFan'; }).map(o => o.id));
    // choose, off screen, a fan the camera would see unobstructed from outside its gable (a raycast from a probe camera, nothing rendered), then one camera move and one click
    const pick = await pg.evaluate(fans => { const A = window.A, T = window.THREE, G = window.Bonsai.group(), bc = new T.Box3().setFromObject(G).getCenter(new T.Vector3()), rc = new T.Raycaster();
      const meshes = G.children.filter(x => x.isMesh && x.visible);
      for (const fid of fans) { const m = meshes.find(x => x.userData && x.userData.featureId === fid); if (!m) continue;
        const fc = new T.Box3().setFromObject(m).getCenter(new T.Vector3()), d = fc.clone().sub(bc); d.z = 0; if (Math.abs(d.x) >= Math.abs(d.y)) d.set(Math.sign(d.x), 0, 0); else d.set(0, Math.sign(d.y), 0);
        const P = fc.clone().addScaledVector(d, 7).add(new T.Vector3(0, 0, 0.6)); rc.set(P, fc.clone().sub(P).normalize());
        const h = rc.intersectObjects(meshes, false)[0]; if (h && h.object.userData.featureId === fid) return { fid, P: P.toArray(), fc: fc.toArray() }; }
      return null; }, fans);
    let hit = null;
    if (pick) {
      await pg.evaluate(pk => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls, toP = new T.Vector3().fromArray(pk.P), tg = new T.Vector3().fromArray(pk.fc), fromP = c.position.clone(), fromT = ctl.target.clone(), t0 = performance.now(); c.up.set(0, 0, 1);
        (function step() { const k = Math.min(1, (performance.now() - t0) / 2200), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.lerpVectors(fromP, toP, s); ctl.target.lerpVectors(fromT, tg, s); ctl.update(); if (k < 1) requestAnimationFrame(step); else res(); })(); }), pick);
      await sleep(600);
      const pt = await pg.evaluate(pk => { const A = window.A, T = window.THREE, v = new T.Vector3().fromArray(pk.fc).project(A.camera), cv = A.renderer.domElement.getBoundingClientRect(); return [cv.left + (v.x + 1) / 2 * cv.width, cv.top + (1 - v.y) / 2 * cv.height]; }, pick);
      await moveTo(pt[0], pt[1], 800); await sleep(250); await pg.mouse.down(); await sleep(90); await pg.mouse.up(); await sleep(1200);
      const st = await pg.$eval('#stat', e => e.innerText), m = /selected feature #(\d+)/.exec(st); if (m && +m[1] === pick.fid) hit = pick.fid;
      console.log('§FILM_DBG fan pick fid=' + pick.fid + ' stat="' + st.slice(0, 60) + '"'); }
    fact('fan_clicked', hit ? 'yes' : 'no'); await sleep(3500); await pg.keyboard.press('Escape'); await sleep(500); }
  await fitBuilt(1.2, 1800); await orbitZ(30, 4000);
  // ---- chapter 2 SAVED, REOPENED AS ARC ----
  chapter(2, 'saved'); await beat('s03');
  await clickAt('#b-export', 700); await pg.waitForSelector('#m-export-panel .me-row[data-key="vdb"]', { visible: true }); await sleep(900);
  await clickAt('#m-export-panel .me-row[data-key="vdb"]', 700);
  let dbFile = null; for (let g = 0; g < 600 && !dbFile; g++) { await sleep(200); const f = fs.readdirSync(SAVED).filter(x => /\.db$/i.test(x)); if (f.length) dbFile = path.join(SAVED, f[0]); }
  if (!dbFile) throw new Error('the Viewer database never landed in ' + SAVED);
  await sleep(1500); fact('saved_file', path.basename(dbFile)); fact('saved_mb', (fs.statSync(dbFile).size / 1048576).toFixed(1));
  await backdrop(2); await sleep(1500);
  await beat('s04');
  await fresh();
  if (await pg.evaluate(() => document.body.classList.contains('ol-collapsed'))) { await clickAt('#ol-collapse', 500); await sleep(600); }
  await clickAt('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true }); await sleep(700);
  const [c2] = await Promise.all([pg.waitForFileChooser({ timeout: 30000 }), clickAt('#m-open-panel .mo-row[data-key="__local"]')]); await c2.accept([dbFile]);
  await pg.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await pg.evaluate(async () => { await window.__arcSeedReady; }); await sleep(2500);
  fact('reopened_ops', String(await pg.evaluate(() => window.Bonsai.oplog.length)));
  fact('reopened_elements', ((/§BOMTREE seeded \S+ elements=(\d+)/.exec(plog.filter(t => /§BOMTREE seeded/.test(t)).pop() || '')) || [])[1] || 'none');
  await fitBuilt(1.25, 2000); await sleep(800);
  { const w = await pickClass('IfcWall'); fact('wall_picked', w ? 'yes' : 'no'); await sleep(2500); await pg.keyboard.press('Escape'); await sleep(400); await fitBuilt(1.25, 1500); }
  await beat('s05');
  // the fans stay in the file, listed on the left under ACMV (the Modeller seeds the architecture for editing; the services are walked, not drawn from the file): the pointer rests on the row
  await pg.waitForSelector('#bo-tree [data-bnode$="|C|IfcFan"]', { timeout: 60000 });
  { const r = await rect('#bo-tree [data-bnode$="|C|IfcFan"]'); await moveTo(r.x + Math.min(r.w / 2, 60), r.y + r.h / 2, 900); }
  fact('acmv_listed', ((/\((\d+)\)/.exec(await pg.$eval('#bo-tree [data-bnode$="|C|IfcFan"]', e => e.innerText))) || [])[1] || 'none');
  await sleep(3500);
  { const fz = await pg.evaluate(() => { try { const db = new window.SQL.Database(new Uint8Array(window.__dwBuf)), r = db.exec("SELECT MAX(t.center_z + t.bbox_z/2) FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class='IfcSlab'"); db.close(); return r.length ? r[0].values[0][0] : null; } catch (e) { return null; } });
    await pg.evaluate(z => { window.__filmFloorZ = z; }, fz); }
  await inside(6000, 0.05);   // inside, empty: no light, no sprinklers
  // the ELEC row is clicked here and walks while the camera keeps dollying; the lights' line starts when they land
  chapter(3, 'services'); await pg.evaluate(() => { window.__dwLastDoneDisc = null; }); await clickAt('#bo-tree [data-disc="ELEC"]', 700);
  await inside(9000, 0.08);
  await pg.waitForFunction(() => window.__dwLastDoneDisc === 'ELEC', { timeout: 300000, polling: 200 }); await sleep(600);
  fact('lights', String(await pg.evaluate(() => (window.__dwWalks.ELEC || []).length))); fact('reference', ((/standard=(\S+)/.exec(plog.filter(t => /§DW-RULES-REF/.test(t)).pop() || '')) || [])[1] || 'none');
  await beat('s06'); await backdrop(3);
  await inside(5000, 0.06);
  // the FP row is clicked now and walks while the camera rises to one light; the sprinkler line starts when its fixtures land
  await pg.evaluate(() => { window.__dwLastDoneDisc = null; }); await clickAt('#bo-tree [data-disc="FP"]', 700);
  fact('light_closeup', await closeUp('ELEC', 1.6, 4500, 7)); await sleep(3000);
  await pg.waitForFunction(() => window.__dwLastDoneDisc === 'FP', { timeout: 300000, polling: 200 }); await sleep(600);
  fact('sprinklers', String(await pg.evaluate(() => (window.__dwWalks.FP || []).length)));
  await inside(2500, 0.03);
  await beat('s07');
  fact('sprinkler_closeup', await closeUp('FP', 0.12, 5500, 6)); await sleep(3500);
  await beat('s08'); await pg.evaluate(() => { const c = window.A.camera; c.near = 0.1; c.updateProjectionMatrix(); if (window.__filmMinD !== undefined) window.A.controls.minDistance = window.__filmMinD; }); await fitBuilt(1.0, 2800); await orbitZ(60, 6000);
  await beat('end'); await hold(); await sleep(600);
  await cdp.send('Page.stopScreencast'); await br.close();
  const t0 = frames[0].ts, lines = [];
  frames.forEach((fr, i) => { const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].ts - fr.ts) : 1.0; lines.push("file '" + fr.f + "'", 'duration ' + d.toFixed(4)); });
  lines.push("file '" + frames[frames.length - 1].f + "'"); fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n'));
  const mk = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'scale=1920:1080,fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', path.join(OUT, 'film.mp4')], { encoding: 'utf8' });
  console.log('§FILM_SYNC frames=' + frames.length + ' ffmpeg_rc=' + mk.status + ' ' + (mk.stderr || '').slice(0, 200));
  beatLog.forEach(([id, ep]) => console.log('§FILM_BEAT id=' + id + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  chapLog.forEach(([n, key, ep]) => console.log('§FILM_CHAPTER n=' + n + ' key=' + key + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  fs.writeFileSync(path.join(OUT, 'backdrops.txt'), chapLog.map(([n]) => 'c' + n + ' ' + path.join(OUT, 'bd' + n + '.png')).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'page.log'), plog.join('\n'));
  fs.rmSync(FR, { recursive: true, force: true });
  console.log('§FILM_REC sec=' + (frames[frames.length - 1].ts - t0 + 1).toFixed(1) + ' out=' + path.join(OUT, 'film.mp4'));
})().catch(e => { console.log('§FILM_REC_ERROR ' + (e && e.stack || e)); process.exit(1); });
