#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope: prompts/FILM_DXF2BIM_WHY_MARKINGS.md §LAST PART v2 SHORT ("A saved building, serviced"): a fresh Modeller opens the shed's saved Viewer database as editable ARC, then the left
// DISC rows walk lights and sprinklers and the camera FOLLOWS the build-up (the reveal fronts of §D64 / §D64.1), close-ups on a lamp, a sprinkler head and its joint (§D66). LIVE recorder (the v1 recorder's helpers):
// real pointer and clicks; the page's state is READ for facts and for the camera's follow target only. One stated edit: the walk's compute wait is cut (§FILM_CUT). Software GL.
// Read take.log after every run: §PAGEERR, a missing fact, 0 lights / sprinklers / pipe segments, or §FILM_FOLLOW moves=0 = not a take.
// usage: SITE=<modeller.html of bim-ootb main> SHED_DB=<the shed's Viewer database> node prompts/film_dxf2bim_shed_v2_rec.js <take dir> [beat_min.json]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const OUT = path.resolve(process.argv[2] || '.'), BEAT_MIN = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};
const SITE = process.env.SITE || 'https://red1oon.github.io/bim-ootb/modeller/modeller.html', DB = process.env.SHED_DB;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (!DB || !fs.existsSync(DB)) throw new Error('SHED_DB must name the shed\'s Viewer database (v1 chapter 1 writes <take>/saved/SHED_extracted.db): ' + DB);
  fs.mkdirSync(OUT, { recursive: true });
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1440,810'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810, deviceScaleFactor: 4 / 3 });
  const plog = []; pg.on('console', m => { const t = m.text(); plog.push(t); if (/§BOMTREE seeded|§DW-RULES-REF|§DISC-WALK |§DW-REVEAL|§DW-CHAIN-ANIM|§DISC-WALK-COMMIT|PAGEERR/.test(t)) console.log(t.slice(0, 260)); });
  pg.on('pageerror', e => console.log('§PAGEERR ' + String(e).slice(0, 300)));
  await pg.evaluateOnNewDocument(() => { const mk = () => { if (document.getElementById('film-ptr')) return; const d = document.createElement('div'); d.id = 'film-ptr';
      d.style.cssText = 'position:fixed;left:-50px;top:-50px;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,214,64,.95);border:2px solid #14161c;box-shadow:0 0 0 2px rgba(255,214,64,.45);z-index:2147483647;pointer-events:none;transition:transform .12s';
      document.documentElement.appendChild(d);
      document.addEventListener('mousemove', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
      document.addEventListener('mousedown', () => { d.style.transform = 'scale(.7)'; }, true); document.addEventListener('mouseup', () => { d.style.transform = ''; }, true); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk(); });
  const cdp = await pg.createCDPSession();
  const fact = (k, v) => console.log('§FILM_FACT ' + k + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  const FR = path.join(OUT, 'frames'); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
  const frames = []; let nf = 0;
  cdp.on('Page.screencastFrame', async ev => { const f = path.join(FR, String(nf++).padStart(6, '0') + '.jpg'); fs.writeFileSync(f, Buffer.from(ev.data, 'base64')); frames.push({ f, ts: ev.metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) { } });
  const beatLog = [], chapLog = [], cuts = []; let beatStart = 0, beatId = null, chapNext = null; const now = () => Date.now() / 1000;
  const hold = async () => { if (beatId) { const need = (BEAT_MIN[beatId] || 5) + 0.8 - (now() - beatStart) + cutIn(beatStart, now()); if (need > 0) await sleep(need * 1000); } };
  const beat = async id => { await hold(); beatId = id; beatStart = now(); beatLog.push([id, beatStart]); if (chapNext) { chapLog.push([chapNext[0], chapNext[1], beatStart]); chapNext = null; } console.log('§FILM_BEAT_AT ' + id); };
  const chapter = (n, key) => { chapNext = [n, key]; };
  const backdrop = n => pg.screenshot({ path: path.join(OUT, 'bd' + n + '.png') });
  // the one stated edit: [a, b] wall-clock spans dropped from the film; film time = wall time minus the cut seconds before it
  const cutIn = (a, b) => cuts.reduce((s, [c0, c1]) => s + Math.max(0, Math.min(b, c1) - Math.max(a, c0)), 0);
  let mx = 720, my = 405;
  const moveTo = async (x, y, ms = 650) => { const steps = Math.max(8, Math.round(ms / 22)); for (let i = 1; i <= steps; i++) { const k = i / steps, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await pg.mouse.move(mx + (x - mx) * e, my + (y - my) * e); await sleep(ms / steps); } mx = x; my = y; };
  const rect = sel => pg.$eval(sel, e => { e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const clickAt = async (sel, ms) => { const r = await rect(sel); await moveTo(r.x + Math.min(r.w / 2, 60), r.y + r.h / 2, ms); await sleep(250); await pg.mouse.down(); await sleep(90); await pg.mouse.up(); return r; };
  // the built model in the strip the open panels leave free, eased (v1)
  const fitBuilt = (fill, ms) => pg.evaluate(([fill, ms]) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls, box = new T.Box3();
      A.scene.children.filter(o => /^Bonsai/.test(o.name || '') && o.visible).forEach(o => { const b = new T.Box3().setFromObject(o); if (!b.isEmpty()) box.union(b); });
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
  // inside at eye height looking down the shed's length, then a slow dolly (v1)
  const inside = (ms, dolly, ease0) => pg.evaluate(([ms, dolly, ease0]) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls, G = window.Bonsai.group(), b = new T.Box3();
      G.children.filter(m => m.isMesh && m.visible && !m.isInstancedMesh).forEach(m => b.union(new T.Box3().setFromObject(m))); if (b.isEmpty()) { res(); return; }
      const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, ax = sx >= sy ? 0 : 1, lo = b.min.getComponent(ax), L = (ax ? sy : sx), mid = b.getCenter(new T.Vector3()), z = (window.__filmFloorZ || b.min.z + 1.2) + 1.7;
      const at = f => { const v = mid.clone(); v.setComponent(ax, lo + L * f); v.z = z; return v; };
      const P1 = at(0.06), Q1 = at(0.94).add(new T.Vector3(0, 0, 0.9)), P2 = at(0.06 + dolly), Q2 = at(0.94 + dolly).add(new T.Vector3(0, 0, 0.9)), p0 = c.position.clone(), q0 = ctl.target.clone(); c.up.set(0, 0, 1);
      let t0 = performance.now(); const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      (function s1() { const k = Math.min(1, (performance.now() - t0) / ease0), e = ease(k); c.position.lerpVectors(p0, P1, e); ctl.target.lerpVectors(q0, Q1, e); ctl.update();
        if (k < 1) requestAnimationFrame(s1); else { t0 = performance.now(); (function s2() { const k2 = Math.min(1, (performance.now() - t0) / ms); c.position.lerpVectors(P1, P2, k2); ctl.target.lerpVectors(Q1, Q2, k2); ctl.update(); if (k2 < 1) requestAnimationFrame(s2); else res(); })(); } })(); }), [ms, dolly, ease0 || 2200]);
  // §D64 / §D64.1 FOLLOW: every frame read the reveal front (fixtures: __dwReveal[disc]; pipes: the last drawn instance of the dwChain mesh) and ease the camera toward it (time-constant smoothing),
  // inside at eye height, trailing `trail` m behind it along the shed's long axis (clamped inside the shed), looking at it. Ends `tail` ms after the reveal is done. Returns how often the front moved.
  const follow = (disc, kind, trail, tail) => pg.evaluate(([disc, kind, trail, tail]) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls, G = window.Bonsai.group(), b = new T.Box3();
      G.children.filter(m => m.isMesh && m.visible && !m.isInstancedMesh).forEach(m => b.union(new T.Box3().setFromObject(m)));
      const ax = (b.max.x - b.min.x) >= (b.max.y - b.min.y) ? 0 : 1, lat = 1 - ax, lo = b.min.getComponent(ax) + 0.6, hi = b.max.getComponent(ax) - 0.6, midLat = b.getCenter(new T.Vector3()).getComponent(lat), eye = (window.__filmFloorZ || b.min.z + 1.2) + 1.7;
      const M = new T.Matrix4(), P = new T.Vector3();
      const front = () => { if (kind === 'chain') { let im = null; A.scene.traverse(o => { if (o.isInstancedMesh && o.userData && o.userData.dwChain === disc) im = o; }); if (!im || !im.count) return null;
          im.getMatrixAt(im.count - 1, M); P.setFromMatrixPosition(M).applyMatrix4(im.matrixWorld); return { p: P.clone(), i: im.count, done: im.count >= im.instanceMatrix.count && !(window.__dwChainAnimating || {})[disc] }; }
        const f = window.__dwReveal[disc]; if (!f || !f.i) return null; return { p: new T.Vector3(f.x, f.y, f.z), i: f.i, done: !!f.done && !window.__dwRevealMeta[disc] }; };
      let sp = null, st = null, sgn = 0, lastI = -1, moves = 0, doneAt = 0, prev = performance.now(); const t0 = prev; c.up.set(0, 0, 1);
      (function step() { const t = performance.now(), dt = (t - prev) / 1000; prev = t; const f = front();
        if (f) { if (f.i !== lastI) { moves++; lastI = f.i; }
          if (!sp) { sp = f.p.clone(); st = c.position.clone(); }
          const k = 1 - Math.exp(-dt / 0.7); sp.lerp(f.p, k);
          if (!sgn && moves > 3) sgn = Math.sign(f.p.getComponent(ax) - sp.getComponent(ax)) || 1;
          const want = new T.Vector3(); want.setComponent(ax, Math.max(lo, Math.min(hi, sp.getComponent(ax) - (sgn || 1) * trail))); want.setComponent(lat, midLat + (sp.getComponent(lat) - midLat) * (kind === 'chain' ? 0.6 : 0.35)); want.z = eye;
          st.lerp(want, 1 - Math.exp(-dt / 0.9)); c.position.copy(st); ctl.target.lerp(sp, 1 - Math.exp(-dt / 0.35)); ctl.update();
          if (f.done && !doneAt) doneAt = t; }
        if ((doneAt && t - doneAt > tail) || t - t0 > 60000) { res({ moves, ms: Math.round(t - t0), drawn: lastI }); return; }
        requestAnimationFrame(step); })(); }), [disc, kind, trail, tail]);
  // a close-up on ONE drawn instance nearest `aim` (a world point; default: ahead of the camera) — the camera eases to `dist` m off it, slightly below, looking up (v1, with an explicit aim)
  const closeUp = (pick, dist, ms, ahead) => pg.evaluate(([pick, dist, ms, ahead]) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls;
      const fwd = ctl.target.clone().sub(c.position).normalize(); let best = null;
      if (pick.point) { best = { ctr: new T.Vector3().fromArray(pick.point), size: pick.size || 0.2 }; }
      else { const IM = []; A.scene.traverse(o => { if (o.isInstancedMesh && o.visible && o.userData && o.userData.dwDisc === pick.disc) IM.push(o); }); if (!IM.length) { res(null); return; }
        const aim = c.position.clone().addScaledVector(fwd, ahead), M = new T.Matrix4(), W = new T.Matrix4();
        IM.forEach(im => { im.updateMatrixWorld(); if (!im.geometry.boundingBox) im.geometry.computeBoundingBox(); const gb = im.geometry.boundingBox;
          for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, M); W.multiplyMatrices(im.matrixWorld, M); const bb = gb.clone().applyMatrix4(W), ctr = bb.getCenter(new T.Vector3()), d = Math.hypot(ctr.x - aim.x, ctr.y - aim.y);
            if (!best || d < best.d) best = { d, ctr, size: bb.getSize(new T.Vector3()).length() }; } }); }
      const tg = best.ctr, h = new T.Vector3(fwd.x, fwd.y, 0).normalize(), D = Math.max(dist, best.size * 1.6), toP = tg.clone().addScaledVector(h, -D).add(new T.Vector3(0, 0, -D * 0.45)), fromP = c.position.clone(), fromT = ctl.target.clone(), t0 = performance.now();
      c.near = Math.min(c.near, Math.max(0.01, D / 20)); c.updateProjectionMatrix(); if (window.__filmMinD === undefined) window.__filmMinD = ctl.minDistance; ctl.minDistance = Math.min(ctl.minDistance, D / 2);
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.lerpVectors(fromP, toP, e); ctl.target.lerpVectors(fromT, tg, e); ctl.update(); if (k < 1) requestAnimationFrame(step); else res({ x: +tg.x.toFixed(2), y: +tg.y.toFixed(2), z: +tg.z.toFixed(3), size_m: +best.size.toFixed(3), dist_m: +D.toFixed(2) }); })(); }), [pick, dist, ms, ahead]);
  // a real canvas click on one body of a class the camera sees unobstructed (raycast first), read back from the status line (v1)
  const pickClass = async cls => { const pk = await pg.evaluate(cls => { const A = window.A, T = window.THREE, G = window.Bonsai.group(), rc = new T.Raycaster(), meshes = G.children.filter(x => x.isMesh && x.visible && !x.isInstancedMesh), cv = A.renderer.domElement.getBoundingClientRect();
      const ids = new Set(window.Bonsai.oplog._geomOps().filter(o => { const P = o.params || (typeof o.parameters === 'string' ? JSON.parse(o.parameters) : o.parameters) || {}; return P.ifc_class === cls; }).map(o => o.id));
      for (const m of meshes) { if (!ids.has(m.userData.featureId)) continue; const ctr = new T.Box3().setFromObject(m).getCenter(new T.Vector3()), v = ctr.clone().project(A.camera); if (v.z > 1 || Math.abs(v.x) > 0.8 || Math.abs(v.y) > 0.8) continue;
        rc.setFromCamera(new T.Vector2(v.x, v.y), A.camera); const h = rc.intersectObjects(meshes, false)[0]; if (h && h.object === m) return { fid: m.userData.featureId, x: cv.left + (v.x + 1) / 2 * cv.width, y: cv.top + (1 - v.y) / 2 * cv.height }; }
      return null; }, cls);
    if (!pk) return null; await moveTo(pk.x, pk.y, 700); await sleep(200); await pg.mouse.down(); await sleep(90); await pg.mouse.up(); await sleep(1000);
    const st = await pg.$eval('#stat', e => e.innerText), m = /selected feature #(\d+)/.exec(st); return m && +m[1] === pk.fid ? pk.fid : null; };
  // click a DISC row; the compute wait (click settle -> the first drawn fixture) is the stated cut
  const walkClick = async disc => { await pg.evaluate(() => { window.__dwLastDoneDisc = null; }); await clickAt('#bo-tree [data-disc="' + disc + '"]', 650); await sleep(700);
    const a = now(); await pg.waitForFunction(d => (window.__dwReveal[d] && window.__dwReveal[d].i > 0 && window.__dwRevealMeta[d]) || window.__dwLastDoneDisc === d, { timeout: 300000, polling: 50 }, disc);
    const b = now() - 0.15; if (b - a > 0.5) { cuts.push([a, b]); console.log('§FILM_CUT disc=' + disc + ' sec=' + (b - a).toFixed(1)); } };

  // ================= TAKE =================
  fact('db_sha256', crypto.createHash('sha256').update(fs.readFileSync(DB)).digest('hex').slice(0, 12));
  await fresh();
  if (await pg.evaluate(() => document.body.classList.contains('ol-collapsed'))) { await pg.click('#ol-collapse'); await sleep(600); }
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  // ---- chapter 1 REOPENED AS ARC ----
  chapter(1, 'reopened'); await beat('s01');
  await clickAt('#b-open', 600); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true }); await sleep(500);
  const [c2] = await Promise.all([pg.waitForFileChooser({ timeout: 30000 }), clickAt('#m-open-panel .mo-row[data-key="__local"]', 600)]); await c2.accept([DB]);
  await pg.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 240000 }); await pg.evaluate(async () => { await window.__arcSeedReady; }); await sleep(1200);
  fact('reopened_ops', String(await pg.evaluate(() => window.Bonsai.oplog.length)));
  fact('reopened_elements', ((/§BOMTREE seeded \S+ elements=(\d+)/.exec(plog.filter(t => /§BOMTREE seeded/.test(t)).pop() || '')) || [])[1] || 'none');
  await fitBuilt(1.15, 1800); await backdrop(1); await orbitZ(28, 4200);
  await beat('s02');
  { const w = await pickClass('IfcWall'); fact('wall_picked', w ? 'yes' : 'no'); await sleep(1800); await pg.keyboard.press('Escape'); await sleep(300); }
  { const fz = await pg.evaluate(() => { try { const db = new window.SQL.Database(new Uint8Array(window.__dwBuf)), r = db.exec("SELECT MAX(t.center_z + t.bbox_z/2) FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class='IfcSlab'"); db.close(); return r.length ? r[0].values[0][0] : null; } catch (e) { return null; } });
    await pg.evaluate(z => { window.__filmFloorZ = z; }, fz); }
  // ---- chapter 2 SERVICES WALKED ----
  chapter(2, 'services'); await beat('s03');
  await inside(2600, 0.04, 2600); await backdrop(2);
  await walkClick('ELEC');
  await beat('s04');
  { const f = await follow('ELEC', 'fix', 7, 900); console.log('§FILM_FOLLOW disc=ELEC moves=' + f.moves + ' ms=' + f.ms + ' drawn=' + f.drawn); fact('follow_elec_moves', String(f.moves)); }
  fact('lights', String(await pg.evaluate(() => (window.__dwWalks.ELEC || []).length))); fact('reference', ((/standard=(\S+)/.exec(plog.filter(t => /§DW-RULES-REF/.test(t)).pop() || '')) || [])[1] || 'none');
  await beat('s05');
  fact('light_closeup', await closeUp({ disc: 'ELEC' }, 1.5, 3200, 6)); await sleep(1500);
  await inside(1500, 0.02, 2000);
  await beat('s06');
  await walkClick('FP');
  { const f = await follow('FP', 'fix', 6, 300); console.log('§FILM_FOLLOW disc=FP moves=' + f.moves + ' ms=' + f.ms + ' drawn=' + f.drawn); fact('follow_fp_moves', String(f.moves)); }
  fact('sprinklers', String(await pg.evaluate(() => (window.__dwWalks.FP || []).length)));
  // §D66.1 the pipes and the joint parts start when the walk ends: the wait from the last head to the first visible change is the same stated cut (compute only). §D72: the lamps in the pipework's way
  // step aside at the walk's end: the cut ends BEFORE that (at the §DW-YIELD line or the first pipe, whichever comes first), so the step is in frame
  { const a = now(), n0 = plog.length; for (let g = 0; g < 6000; g++) { if (plog.slice(n0).some(t => /§DW-YIELD disc=ELEC/.test(t))) break;
      if (await pg.evaluate(() => { let c = 0; window.A.scene.traverse(o => { if (o.isInstancedMesh && o.userData && o.userData.dwChain === 'FP') c = o.count; }); return c > 0; })) break; await sleep(50); }
    const b = now() - 0.4; if (b - a > 0.5) { cuts.push([a, b]); console.log('§FILM_CUT disc=FP-pipe sec=' + (b - a).toFixed(1)); }
    const y = plog.filter(t => /§DW-YIELD disc=ELEC/.test(t)).pop() || ''; fact('lamps_moved', ((/moved=(\d+)/.exec(y)) || [])[1] || '0'); }
  await beat('s07');
  { const f = await follow('FP', 'chain', 3.5, 1200); console.log('§FILM_FOLLOW disc=FP-pipe moves=' + f.moves + ' ms=' + f.ms + ' drawn=' + f.drawn); fact('follow_pipe_moves', String(f.moves)); }
  // the pipes DRAWN (§D66: a drop edge is drawn as the head's joint parts, not as a pipe): the dwChain mesh's instances; the network's roles beside it
  { const P = await pg.evaluate(() => { const S = window.__dwChains.FP || [], by = {}; S.forEach(s => { by[s.role] = (by[s.role] || 0) + 1; }); let n = 0; window.A.scene.traverse(o => { if (o.isInstancedMesh && o.userData && o.userData.dwChain === 'FP') n = o.instanceMatrix.count; }); return { n, by }; }); fact('pipe_segs', String(P.n)); fact('pipe_roles', P.by); }
  await beat('s08');
  const head = await closeUp({ disc: 'FP' }, 0.14, 3800, 5); fact('sprinkler_closeup', head); await sleep(2000);
  // §D66 the head's joint mini-BOM (drop, transition, tee: the library's T_CONNECTOR_ASSEMBLY, stacked on the head): the camera eases back to frame the whole stack, head to tee
  { const J = await pg.evaluate(() => { const P = window.__dwAssembly && window.__dwAssembly.FP || [], by = {}; P.forEach(p => { const k = p.role || p.ifc_class || '?'; by[k] = (by[k] || 0) + 1; }); return { n: P.length, by }; });
    fact('joint_parts', String(J.n)); fact('joint_roles', J.by);
    // the stack runs up from the head toward its branch, beside a purlin: the first side approach (4 horizontal sides x 3 heights) from which neither the stack's middle nor its tee is hidden by a body
    // (a raycast against the editable group, nothing rendered); none = said, no close-up
    const V = head && J.n ? await pg.evaluate(h => { const T = window.THREE, G = window.Bonsai.group(), meshes = G.children.filter(x => x.isMesh && x.visible && !x.isInstancedMesh), rc = new T.Raycaster(), D = 0.45;
        const tgt = [new T.Vector3(h.x, h.y, h.z + 0.06), new T.Vector3(h.x, h.y, h.z + 0.118)];
        for (const dz of [0.02, -0.08, -0.2]) for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const P = new T.Vector3(h.x + d[0] * D, h.y + d[1] * D, h.z + 0.06 + dz);
          if (tgt.every(t => { const dir = t.clone().sub(P), L = dir.length(); rc.set(P, dir.normalize()); rc.far = L - 0.03; return !rc.intersectObjects(meshes, false).length; })) return { P: P.toArray(), T: tgt[0].toArray() }; }
        return null; }, head) : null;
    fact('joint_visible', V ? 'yes' : 'no');
    if (V) { await pg.evaluate(v => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls, toP = new T.Vector3().fromArray(v.P), tg = new T.Vector3().fromArray(v.T), fromP = c.position.clone(), fromT = ctl.target.clone(), t0 = performance.now();
        c.near = 0.02; c.updateProjectionMatrix(); ctl.minDistance = Math.min(ctl.minDistance, 0.2);
        (function step() { const k = Math.min(1, (performance.now() - t0) / 3200), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.lerpVectors(fromP, toP, e); ctl.target.lerpVectors(fromT, tg, e); ctl.update(); if (k < 1) requestAnimationFrame(step); else res(); })(); }), V);
      fact('joint_closeup', { from: V.P.map(x => +x.toFixed(2)), at: V.T.map(x => +x.toFixed(3)) }); }
    await sleep(2600); }
  await beat('s09'); await pg.evaluate(() => { const c = window.A.camera; c.near = 0.1; c.updateProjectionMatrix(); if (window.__filmMinD !== undefined) window.A.controls.minDistance = window.__filmMinD; }); await fitBuilt(1.0, 2600); await orbitZ(50, 5200);
  await beat('end'); await hold(); await sleep(600);
  await cdp.send('Page.stopScreencast'); await br.close();
  // frames: drop the cut spans; each kept frame lasts until the next kept one, minus the cut seconds between them
  const inCut = ts => cuts.some(([a, b]) => ts > a && ts < b), kept = frames.filter(fr => !inCut(fr.ts)), t0 = kept[0].ts, ft = ep => Math.max(0, ep - t0 - cutIn(t0, ep)), lines = [];
  kept.forEach((fr, i) => { const d = i + 1 < kept.length ? Math.max(0.001, kept[i + 1].ts - fr.ts - cutIn(fr.ts, kept[i + 1].ts)) : 1.0; lines.push("file '" + fr.f + "'", 'duration ' + d.toFixed(4)); });
  lines.push("file '" + kept[kept.length - 1].f + "'"); fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n'));
  const mk = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'scale=1920:1080,fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', path.join(OUT, 'film.mp4')], { encoding: 'utf8' });
  console.log('§FILM_SYNC frames=' + kept.length + ' dropped=' + (frames.length - kept.length) + ' cut_sec=' + cuts.reduce((s, [a, b]) => s + b - a, 0).toFixed(1) + ' ffmpeg_rc=' + mk.status + ' ' + (mk.stderr || '').slice(0, 200));
  beatLog.forEach(([id, ep]) => console.log('§FILM_BEAT id=' + id + ' t=' + ft(ep).toFixed(3)));
  chapLog.forEach(([n, key, ep]) => console.log('§FILM_CHAPTER n=' + n + ' key=' + key + ' t=' + ft(ep).toFixed(3)));
  fs.writeFileSync(path.join(OUT, 'backdrops.txt'), chapLog.map(([n]) => 'c' + n + ' ' + path.join(OUT, 'bd' + n + '.png')).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'page.log'), plog.join('\n'));
  fs.rmSync(FR, { recursive: true, force: true });
  console.log('§FILM_REC sec=' + (ft(kept[kept.length - 1].ts) + 1).toFixed(1) + ' out=' + path.join(OUT, 'film.mp4'));
})().catch(e => { console.log('§FILM_REC_ERROR ' + (e && e.stack || e)); process.exit(1); });
