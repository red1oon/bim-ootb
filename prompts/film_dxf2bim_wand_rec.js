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
const WING = { deg: 70, centre: [6.57, 103.06], u: [-28.4, 22.32] };   // the 70-deg wing: walls of family 70 in the writer's extraction (prompts/FILM_DXF2BIM_WAND.md, measured with Std2d.frameModel)
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
  const scr = (x, y) => pg.evaluate((x, y) => { const A = window.APP, S = A._wing2d, z = (S.z0 + S.z1) / 2, t = A.ifc2three(x, y, z), v = new window.THREE.Vector3(t.x, t.y, t.z).project(A.camera), r = A.canvas.getBoundingClientRect(); return { x: r.left + (v.x * .5 + .5) * r.width, y: r.top + (-v.y * .5 + .5) * r.height }; }, x, y);
  const plane = () => pg.evaluate(() => APP.wing2dState().plane);
  const dragPath = async pts => { await pg.mouse.move(pts[0].x, pts[0].y, { steps: 6 }); await sleep(300); await pg.mouse.down(); for (const p of pts.slice(1)) { await pg.mouse.move(p.x, p.y, { steps: 2 }); await sleep(28); } await sleep(250); await pg.mouse.up(); await sleep(600); };

  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const T0 = now();
  // ---- chapter 1 LOAD ----
  await card('<div style="font-size:30px;color:#9aa3b2">Loading the Hospital sample model</div>');
  await chapter(1, 'load', process.env.STILL1 || null);
  await beat('c1');
  await pg.goto(URL, { timeout: 180000 });
  await uncard();
  await beat('h01');
  for (let i = 0; i < 120; i++) { const st = await pg.evaluate(() => ((document.getElementById('s-active') || {}).textContent || '')); if (/DONE/.test(st)) { fact('loaded', st.trim()); fact('load_s', (now() - T0).toFixed(1)); break; } await sleep(1000); }
  await sleep(1500);
  await beat('h02'); await orbit(70, 9000); await sleep(500);
  // ---- chapter 2 THE PLANE ----
  await chapter(2, 'plane');
  await beat('s01');
  await pg.evaluate(() => APP.toggleSection()); await sleep(1500);
  await pg.click('#sec-axis-wing'); await pg.waitForFunction(() => APP.wing2dState().side, { timeout: 120000 });
  const st0 = await pg.evaluate(() => APP.wing2dState()); fact('families', st0.fam.map(f => f.deg + ':' + f.n).join(' ')); fact('plane0', st0.plane);
  fact('nothing_cut', await pg.evaluate(() => APP.renderer.localClippingEnabled === false));
  await sleep(2000);
  // the target: the plane's midpoint on the wing's centre, turned to the wing (its length is the Viewer's default; the drag never changes a length)
  const L = st0.plane.length, th = WING.deg * Math.PI / 180, ax = [Math.cos(th), Math.sin(th)], um = (WING.u[0] + WING.u[1]) / 2, M = [WING.centre[0] + um * ax[0], WING.centre[1] + um * ax[1]];
  const S0 = [M[0] - L / 2 * ax[0], M[1] - L / 2 * ax[1]];   // the fixed end after the turn
  await beat('s02');
  const mid0 = [(st0.plane.p0[0] + st0.plane.p1[0]) / 2, (st0.plane.p0[1] + st0.plane.p1[1]) / 2], z = (st0.plane.z[0] + st0.plane.z[1]) / 2;
  const span = [Math.min(mid0[0], S0[0], M[0]) - 20, Math.max(st0.plane.p1[0], S0[0] + L, M[0]) + 20, Math.min(mid0[1], S0[1], M[1]) - 20, Math.max(mid0[1], S0[1] + L * ax[1], M[1]) + 20];
  const tg = [(span[0] + span[1]) / 2, (span[2] + span[3]) / 2, z - 10], D = 1.05 * Math.max(span[1] - span[0], span[3] - span[2]);
  await camTo(tg, -60, 48, D, 3500); await sleep(800);
  // (1) drag the plane body: its west end onto the wing's start (the plane is still at 0 deg)
  const dx = S0[0] - st0.plane.p0[0], dy = S0[1] - st0.plane.p0[1], body = [];
  for (let i = 0; i <= 40; i++) { const k = i / 40; body.push(await scr(mid0[0] + dx * k, mid0[1] + dy * k)); }
  await dragPath(body); const st1 = await plane(); fact('after_move', st1);
  await sleep(1200);
  // (2) drag the east handle round the fixed west end, 0 -> the wing direction (it snaps within 3 deg)
  const arc = []; for (let i = 0; i <= 60; i++) { const a = (WING.deg + 1.5) * Math.PI / 180 * i / 60; arc.push(await scr(st1.p0[0] + L * Math.cos(a), st1.p0[1] + L * Math.sin(a))); }
  await dragPath(arc); const st2 = await plane(); fact('after_turn', st2); fact('plane_log', lastLog(/§WING2D_PLANE/));
  fact('panel', await pg.evaluate(() => (document.getElementById('section-slider-panel') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 300)));
  await camTo([st2.pivot[0], st2.pivot[1], z - 10], -70 + WING.deg - 90, 40, L * 1.15, 3500); await sleep(1500);
  // ---- chapter 3 THE SHEETS ----
  await chapter(3, 'sheets');
  await beat('x01');
  await pg.click('#wing-2d-btn'); await pg.waitForFunction(() => document.getElementById('wing-2d-overlay'), { timeout: 120000 }); await sleep(1500);
  fact('export_log', lastLog(/§WING2D_EXPORT/)); fact('north_log', lastLog(/§WING2D_NORTH/)); fact('sidecar_log', plog.filter(l => /§WING2D_SIDECAR/.test(l)).join(' | '));
  const ov = await pg.evaluate(() => { const o = APP.wing2dState().overlay; return { sheet: o.sheet, drawn: o.drawn && o.drawn.entities, ok: !!(o.drawn && o.drawn.stats && JSON.stringify(o.drawn.stats.by_type) === JSON.stringify(o.drawn.stats.drawn_by_type)), foot: document.getElementById('wing-2d-foot').textContent }; });
  fact('card', ov);
  await sleep(2500);
  await beat('x02');
  await pg.click('#wing-2d-canvas'); await sleep(1800);
  const cv = await pg.evaluate(() => { const r = document.getElementById('wing-2d-canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await pg.mouse.move(cv.x + 200, cv.y - 60); for (let i = 0; i < 6; i++) { await pg.mouse.wheel({ deltaY: -240 }); await sleep(260); }
  await sleep(1200); await pg.mouse.down(); await pg.mouse.move(cv.x - 120, cv.y + 40, { steps: 30 }); await pg.mouse.up(); await sleep(1500);
  const tabs = await pg.evaluate(() => [...document.querySelectorAll('#wing-2d-overlay button')].map(b => b.textContent).filter(t => t !== 'Save' && t !== 'Cancel')); fact('tabs', tabs);
  const visit = async name => { await pg.evaluate(n => { const b = [...document.querySelectorAll('#wing-2d-overlay button')].find(x => x.textContent === n); if (b) b.scrollIntoView({ inline: 'center' }); }, name); await sleep(400);
    const h = (await pg.$$('#wing-2d-overlay button')); for (const b of h) { if ((await b.evaluate(x => x.textContent)) === name) { await b.click(); break; } } await sleep(2600);
    fact('sheet_' + name, await pg.evaluate(() => { const o = APP.wing2dState().overlay; return { drawn: o.drawn && o.drawn.entities, ok: !!(o.drawn && o.drawn.stats && JSON.stringify(o.drawn.stats.by_type) === JSON.stringify(o.drawn.stats.drawn_by_type)) }; })); };
  await beat('x03'); for (const n of ['FRONT', 'SECTION']) if (tabs.includes(n)) await visit(n);
  await beat('x04'); for (const n of ['ROOF']) if (tabs.includes(n)) await visit(n);
  const plan = tabs.find(t => /^FLOOR_LEVEL_2/.test(t)) || tabs[0]; await visit(plan);
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
  await chapter(4, 'limits');
  await beat('l01');
  const gaps = (ov.foot.match(/(\d+) writer gap/) || [])[1];
  await card('<div style="font-size:24px;color:#9aa3b2;letter-spacing:3px;margin-bottom:24px">WHAT THIS DOES NOT DO YET</div><div style="text-align:left;font-size:26px;line-height:1.7">' +
    ['The writer lists ' + gaps + ' gaps for this wing, none filled in.', 'Elevations draw only the walls on the wing\'s outer face.', 'Room names are not drawn: the rooms are computed, not named.', 'Recorded on a desktop; a phone is not measured.'].map(s => '· ' + s).join('<br>') + '</div>');
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
