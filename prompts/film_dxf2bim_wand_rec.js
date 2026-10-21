#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope: prompts/FILM_DXF2BIM_WAND.md (the 2D wand on the Hospital, live data). LIVE recorder: the published Viewer (GH Pages) on the Hospital in the OCI bucket, the plane moved
// and turned with REAL pointer drags (never wing2dSet); the camera is tweened by the recorder (stated in the spec). CDP screencast frames with their own timestamps; writes §FILM_CHAPTER / §FILM_BEAT
// (video seconds) and every number the narration may use as a §FILM_FACT line of THIS take. Read film.log after every run: a take with §PAGEERR or a missing fact is not a take.
// GPU: headless Chrome on the real GPU (`--use-angle=gl-egl`; NVIDIA through PRIME offload env), software GL starves the Hospital (measured 2026-10-21: no status poll returned in minutes).
// usage: node prompts/film_dxf2bim_wand_rec.js <outDir> [beatMin.json]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const OUT = path.resolve(process.argv[2] || '.'); fs.mkdirSync(OUT, { recursive: true });
const BEAT_MIN = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};
const OCI = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/';
const URL = (process.env.VIEWER || 'https://red1oon.github.io/bim-ootb/viewer/viewer.html') + '?db=' + OCI + 'buildings/Hospital_extracted.db&ghost=1';
// the green-roof south-west block (sighted 2026-10-21: roof-garden slabs at z 176.9, centre 5.1, 68.7, 42 x 26 m; its face runs along the 85-deg family's quarter 355): the plane's two ends in front of
// its south face, the depth across it; the camera views (target IFC m, azimuth / elevation deg, distance m)
const GREEN = { p0: [-17, 52.4], p1: [26.8, 48.57], depth: 30, view: { t: [30, 92, 182], az: 225, el: 30, d: 140 }, work: { t: [8, 64, 178], az: 230, el: 30, d: 95 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GPU_ENV = Object.assign({}, process.env, { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' });
(async () => {
  const br = await puppeteer.launch({ headless: 'new', env: GPU_ENV, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--window-size=1920,1080'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const plog = []; pg.on('console', m => { const t = m.text(); plog.push(t); if (/§WING2D|§LOAD|PAGEERR/.test(t)) console.log(t.slice(0, 400)); });
  pg.on('pageerror', e => console.log('§PAGEERR ' + String(e).slice(0, 300)));
  const cdp = await pg.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT }));
  const fact = (k, v) => console.log('§FILM_FACT ' + k + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  const lastLog = re => { for (let i = plog.length - 1; i >= 0; i--) if (re.test(plog[i])) return plog[i]; return null; };
  const FR = path.join(OUT, 'frames'); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
  const frames = []; let nf = 0, lastDim = '';
  cdp.on('Page.screencastFrame', async ev => { const f = path.join(FR, String(nf++).padStart(6, '0') + '.jpg'); fs.writeFileSync(f, Buffer.from(ev.data, 'base64')); frames.push({ f, ts: ev.metadata.timestamp }); const dim = ev.metadata.deviceWidth + 'x' + ev.metadata.deviceHeight; if (dim !== lastDim) { lastDim = dim; console.log('§FILM_FRAME_SIZE n=' + nf + ' device=' + dim + ' scale=' + ev.metadata.pageScaleFactor); } try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) { } });
  const beatLog = [], chapLog = []; let beatStart = 0, beatId = null; const now = () => Date.now() / 1000;
  const hold = async () => { if (beatId) { const need = (BEAT_MIN[beatId] || 5) + 0.8 - (now() - beatStart); if (need > 0) await sleep(need * 1000); } };
  const beat = async id => { await hold(); beatId = id; beatStart = now(); beatLog.push([id, now()]); };
  const chapter = async (n, key, still) => { chapLog.push([n, key, now()]); const f = path.join(OUT, 'bd' + n + '.png'); if (still) fs.copyFileSync(still, f); else await pg.screenshot({ path: f }); };
  const card = html => pg.evaluate(h => { let c = document.getElementById('film-card'); if (!c) { c = document.createElement('div'); c.id = 'film-card'; c.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#14161c;color:#F3EEE8;display:flex;flex-direction:column;align-items:center;justify-content:center;font:28px/1.5 DejaVu Sans,sans-serif;text-align:center;padding:30px'; document.body.appendChild(c); } c.innerHTML = h; c.style.display = 'flex'; }, html);
  const uncard = () => pg.evaluate(() => { const c = document.getElementById('film-card'); if (c) c.style.display = 'none'; });
  // camera tween (recorder-driven, eased), target + position in IFC metres; the controls stay the Viewer's own
  const camTo = (tgt, az, el, dist, ms) => pg.evaluate((tgt, az, el, dist, ms) => new Promise(res => {
    const A = window.APP, T = window.THREE, c = A.camera, ctl = A.controls, t3 = A.ifc2three(tgt[0], tgt[1], tgt[2]), to = new T.Vector3(t3.x, t3.y, t3.z);
    const a = az * Math.PI / 180, e = el * Math.PI / 180, ifcOff = [Math.cos(e) * Math.cos(a) * dist, Math.cos(e) * Math.sin(a) * dist, Math.sin(e) * dist], p3 = A.ifc2three(tgt[0] + ifcOff[0], tgt[1] + ifcOff[1], tgt[2] + ifcOff[2]);
    const toP = new T.Vector3(p3.x, p3.y, p3.z), fromP = c.position.clone(), fromT = ctl ? ctl.target.clone() : to.clone(), t0 = performance.now();
    (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      c.position.lerpVectors(fromP, toP, s); if (ctl) { ctl.target.lerpVectors(fromT, to, s); ctl.update(); } else c.lookAt(to); if (A.markDirty) A.markDirty();
      if (k < 1) requestAnimationFrame(step); else res(); })();
  }), tgt, az, el, dist, ms);
  const orbit = (deg, ms) => pg.evaluate((deg, ms) => new Promise(res => { const A = window.APP, T = window.THREE, ctl = A.controls, c = A.camera, o = ctl.target.clone(), v0 = c.position.clone().sub(o), t0 = performance.now();
    (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, v = v0.clone().applyAxisAngle(new T.Vector3(0, 1, 0), deg * Math.PI / 180 * s);
      c.position.copy(o).add(v); ctl.update(); if (A.markDirty) A.markDirty(); if (k < 1) requestAnimationFrame(step); else res(); })(); }), deg, ms);
  // measured centring: project the IFC point, then shift camera + target along the view's right / up so it lands at the screen centre (two passes; the Viewer may move the target after a set)
  const centreOn = async (pt, ms) => { for (let k = 0; k < 2; k++) await pg.evaluate((pt, ms) => new Promise(res => { const A = window.APP, T = window.THREE, c = A.camera, ctl = A.controls, t3 = A.ifc2three(pt[0], pt[1], pt[2]);
      c.updateMatrixWorld(); const v = new T.Vector3(t3.x, t3.y, t3.z).project(c), dist = c.position.distanceTo(ctl.target), hh = dist * Math.tan(c.fov * Math.PI / 360), hw = hh * c.aspect;
      const right = new T.Vector3().setFromMatrixColumn(c.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(c.matrixWorld, 1), d = right.multiplyScalar(v.x * hw).add(up.multiplyScalar(v.y * hh));
      const p0 = c.position.clone(), q0 = ctl.target.clone(), t0 = performance.now(); (function step() { const kk = Math.min(1, (performance.now() - t0) / ms), e = kk < .5 ? 2 * kk * kk : 1 - Math.pow(-2 * kk + 2, 2) / 2;
        c.position.copy(p0).addScaledVector(d, e); ctl.target.copy(q0).addScaledVector(d, e); ctl.update(); if (A.markDirty) A.markDirty(); if (kk < 1) requestAnimationFrame(step); else res(); })(); }), pt, k ? 300 : ms); };
  const scr = (x, y) => pg.evaluate((x, y) => { const A = window.APP, S = A._wing2d, z = (S.z0 + S.z1) / 2, t = A.ifc2three(x, y, z), v = new window.THREE.Vector3(t.x, t.y, t.z).project(A.camera), r = A.canvas.getBoundingClientRect(); return { x: r.left + (v.x * .5 + .5) * r.width, y: r.top + (-v.y * .5 + .5) * r.height }; }, x, y);
  const plane = () => pg.evaluate(() => APP.wing2dState().plane);
  const dragPath = async pts => { await pg.mouse.move(pts[0].x, pts[0].y, { steps: 6 }); await sleep(300); await pg.mouse.down(); for (const p of pts.slice(1)) { await pg.mouse.move(p.x, p.y, { steps: 2 }); await sleep(28); } await sleep(250); await pg.mouse.up(); await sleep(600); };

  // ---- load OFF camera (owner: "start from when loaded") ----
  const T0 = now(); await pg.goto(URL, { timeout: 180000 });
  for (let i = 0; i < 180; i++) { const st = await pg.evaluate(() => ((document.getElementById('s-active') || {}).textContent || '')); if (/DONE/.test(st)) { fact('loaded', st.trim()); fact('elements', (plog.join('\n').match(/(\d+) shown=\1/) || [])[1] || 'unknown'); fact('load_s', (now() - T0).toFixed(1)); break; } await sleep(1000); }
  await sleep(1500);
  await camTo(GREEN.view.t, GREEN.view.az, GREEN.view.el, GREEN.view.d, 10); await sleep(800); await centreOn(GREEN.view.t, 10); await sleep(1200);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  // ---- chapter 1 THE HOSPITAL ----
  await chapter(1, 'hospital'); await beat('h01');
  await orbit(-35, 9000); await sleep(400); await orbit(35, 7000);
  // ---- chapter 2 THE BOX ----
  await chapter(2, 'box'); await beat('s01');
  await pg.evaluate(() => APP.toggleSection()); await sleep(1500);
  await pg.click('#sec-axis-wing'); await pg.waitForFunction(() => APP.wing2dState().side, { timeout: 120000 });
  const st0 = await pg.evaluate(() => APP.wing2dState()); fact('families', st0.fam.map(f => f.deg + ':' + f.n).join(' ')); fact('plane0', st0.plane);
  fact('nothing_cut', await pg.evaluate(() => APP.renderer.localClippingEnabled === false));
  await camTo(GREEN.work.t, GREEN.work.az, GREEN.work.el, GREEN.work.d, 3000); await centreOn(GREEN.work.t, 900); await sleep(1200);
  await beat('s02');
  // (1) the plane body: its west end to the block's south-west corner
  const mid0 = [(st0.plane.p0[0] + st0.plane.p1[0]) / 2, (st0.plane.p0[1] + st0.plane.p1[1]) / 2], dx = GREEN.p0[0] - st0.plane.p0[0], dy = GREEN.p0[1] - st0.plane.p0[1], body = [];
  for (let i = 0; i <= 40; i++) { const k = i / 40; body.push(await scr(mid0[0] + dx * k, mid0[1] + dy * k)); }
  await dragPath(body); const st1 = await plane(); fact('after_move', st1); await sleep(900);
  // (2) the end handle: along the block's face and as long as the block (it snaps to the wall family)
  const arc = []; for (let i = 0; i <= 50; i++) { const k = i / 50; arc.push(await scr(st1.p1[0] + (GREEN.p1[0] - st1.p1[0]) * k, st1.p1[1] + (GREEN.p1[1] - st1.p1[1]) * k)); }
  await dragPath(arc); const st2 = await plane(); fact('after_turn', st2); await sleep(900);
  await beat('s03');
  // (3) the green depth handle: across the block
  const hdFrom = await pg.evaluate(() => { const v = APP._wing2d.parts.hd.position.clone().project(APP.camera), r = APP.canvas.getBoundingClientRect(); return { x: r.left + (v.x * .5 + .5) * r.width, y: r.top + (-v.y * .5 + .5) * r.height }; });
  const up = [-(st2.p1[1] - st2.p0[1]) / st2.length, (st2.p1[0] - st2.p0[0]) / st2.length], dpts = [hdFrom];
  for (let i = 1; i <= 40; i++) { const k = i / 40, dd = 4 + (GREEN.depth - 4) * k; dpts.push(await scr(st2.pivot[0] + up[0] * dd, st2.pivot[1] + up[1] * dd)); }
  await dragPath(dpts); const st3 = await plane(); fact('after_depth', st3); fact('plane_log', lastLog(/§WING2D_PLANE/));
  fact('panel', await pg.evaluate(() => document.getElementById('wing-2d-state').textContent));
  await sleep(1500);
  // ---- chapter 3 JUST THE WING ----
  await chapter(3, 'wing'); await beat('x01');
  await pg.click('#wing-2d-btn'); await pg.waitForFunction(() => { const o = APP.wing2dState().overlay; return o && o.drawn; }, { timeout: 120000, polling: 250 }); await sleep(1500);
  fact('export_log', lastLog(/§WING2D_EXPORT/)); fact('face_log', lastLog(/§WING2D_FACE/)); fact('north_log', lastLog(/§WING2D_NORTH/));
  const ov = await pg.evaluate(() => { const o = APP.wing2dState().overlay; return { sheet: o.sheet, drawn: o.drawn && o.drawn.entities, ok: !!(o.drawn && o.drawn.stats && JSON.stringify(o.drawn.stats.by_type) === JSON.stringify(o.drawn.stats.drawn_by_type)), foot: document.getElementById('wing-2d-foot').textContent }; });
  fact('card', ov); await sleep(2500);
  await beat('x02');
  await pg.click('#wing-2d-canvas'); await sleep(1800);
  const cv = await pg.evaluate(() => { const r = document.getElementById('wing-2d-canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await pg.mouse.move(cv.x, cv.y + 80); await pg.mouse.wheel({ deltaY: -200 }); await sleep(300);
  await sleep(1500); await pg.mouse.down(); await pg.mouse.move(cv.x + 160, cv.y + 40, { steps: 30 }); await pg.mouse.up(); await sleep(1500);
  const tabs = await pg.evaluate(() => [...document.querySelectorAll('#wing-2d-overlay button')].map(b => b.textContent).filter(t => t !== 'Save' && t !== 'Cancel')); fact('tabs', tabs);
  const visit = async name => { await pg.evaluate(n => { const b = [...document.querySelectorAll('#wing-2d-overlay button')].find(x => x.textContent === n); if (b) b.scrollIntoView({ inline: 'center' }); }, name); await sleep(400);
    for (const b of await pg.$$('#wing-2d-overlay button')) { if ((await b.evaluate(x => x.textContent)) === name) { await b.click(); break; } } await sleep(2600);
    fact('sheet_' + name, await pg.evaluate(() => { const o = APP.wing2dState().overlay; return { drawn: o.drawn && o.drawn.entities, ok: !!(o.drawn && o.drawn.stats && JSON.stringify(o.drawn.stats.by_type) === JSON.stringify(o.drawn.stats.drawn_by_type)) }; })); };
  await beat('x03'); await visit(tabs.find(t => /^FLOOR_LEVEL_2/.test(t)) || tabs[0]);
  await beat('x04'); if (tabs.includes('SECTION')) await visit('SECTION');
  // ---- save ----
  await beat('x05');
  const before = fs.readdirSync(OUT); await pg.click('#wing-2d-save'); let zip = null;
  for (let i = 0; i < 60 && !zip; i++) { await sleep(500); zip = fs.readdirSync(OUT).find(f => /\.zip$/.test(f) && !before.includes(f)); }
  await sleep(1500);
  if (zip) { const li = cp.spawnSync('python3', ['-I', '-c', 'import zipfile,sys,re;z=zipfile.ZipFile(sys.argv[1]);n=z.namelist();print(len(n));[print(x) for x in n];t=z.read(n[0]).decode("utf8","replace");m=re.search(r"@FRAME=[^\\r\\n]*",t);print(m.group(0) if m else "-")', path.join(OUT, zip)], { encoding: 'utf8' }).stdout.trim().split('\n');
    fact('zip', { file: zip, n: Number(li[0]), frame: li[li.length - 1] }); const names = li.slice(1, -1);
    await card('<div style="font-size:24px;color:#9aa3b2;letter-spacing:3px;margin-bottom:18px">SAVED: ' + zip + ' · ' + names.length + ' DXF SHEETS</div><div style="font:20px/1.45 DejaVu Sans Mono,monospace;color:#F3EEE8;text-align:left;columns:2;column-gap:60px">' + names.map(n => n.replace(/</g, '&lt;')).join('<br>') + '</div><div style="margin-top:22px;font:22px DejaVu Sans Mono,monospace;color:#4fc3f7">' + li[li.length - 1].replace(/ @BY=.*/, '') + '</div><div style="margin-top:8px;font-size:20px;color:#9aa3b2">every sheet carries the frame: angle (deg), pivot x, y (mm)</div>');
  } else fact('zip', 'NONE');
  await beat('x06'); await sleep(1000); await uncard(); await sleep(1200);
  // ---- chapter 4 LIMITS ----
  await chapter(4, 'limits'); await beat('l01');
  const gaps = (ov.foot.match(/(\d+) writer gap/) || [])[1];
  await card('<div style="font-size:24px;color:#9aa3b2;letter-spacing:3px;margin-bottom:24px">WHAT THIS DOES NOT DO YET</div><div style="text-align:left;font-size:26px;line-height:1.7">' +
    ['The writer lists ' + gaps + ' gaps for this box, none filled in.', 'The view at the plane is a drawing; it is not read back into 3D.', 'Curved walls are drawn, but stated as not orthogonal.', 'Recorded on a desktop GPU; a phone is not measured.'].map(x => '· ' + x).join('<br>') + '</div>');
  await beat('end');
  await card('<div style="font-size:24px;color:#9aa3b2">Hospital: the repository\'s open IFC sample (architecture + structure)<br>Viewer: red1oon.github.io/bim-ootb · data from the live bucket</div>');
  await hold(); await sleep(1200);
  await cdp.send('Page.stopScreencast'); await br.close();
  const t0 = frames[0].ts, lines = [];
  frames.forEach((fr, i) => { const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].ts - fr.ts) : 1.0; lines.push("file '" + fr.f + "'", 'duration ' + d.toFixed(4)); });
  lines.push("file '" + frames[frames.length - 1].f + "'"); fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n'));
  const mk = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', path.join(OUT, 'film.mp4')], { encoding: 'utf8' });
  console.log('§FILM_SYNC firstFrame=' + t0.toFixed(3) + ' firstBeat=' + beatLog[0][1].toFixed(3) + ' lastFrame=' + frames[frames.length - 1].ts.toFixed(3) + ' frames=' + frames.length + ' ffmpeg_rc=' + mk.status + ' ' + (mk.stderr || '').slice(0, 200));
  beatLog.forEach(([id, ep]) => console.log('§FILM_BEAT id=' + id + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  chapLog.forEach(([n, key, ep]) => console.log('§FILM_CHAPTER n=' + n + ' key=' + key + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  fs.writeFileSync(path.join(OUT, 'backdrops.txt'), chapLog.map(([n]) => 'c' + n + ' ' + path.join(OUT, 'bd' + n + '.png')).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'page.log'), plog.join('\n'));
  fs.rmSync(FR, { recursive: true, force: true });
  console.log('§FILM_REC sec=' + (frames[frames.length - 1].ts - t0 + 1).toFixed(1) + ' out=' + path.join(OUT, 'film.mp4'));
})().catch(e => { console.log('§FILM_REC_ERROR ' + (e && e.stack || e)); process.exit(1); });
