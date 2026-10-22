#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope: prompts/FILM_DXF2BIM_WHY_MARKINGS.md ("Why markings": a RAW BricsCAD shed set opens as drawn, is defaulted before your eyes, a person states the heights,
// the PROCESSED set opens placed with no replay (§D38), Convert gives the shed). LIVE recorder: the Modeller (SITE= a local server, else GH Pages) driven with REAL clicks, typing and wheel; the
// page's state is READ for facts only. Stated film-only choices: the play-on-open hooks (DxfImportUI.state.arrangeOnOpen / arrangeOpts: an automated browser opens without play, the spec's
// §D34 rule 2), a pointer dot, the chapter backdrops and cards. Every number the narration quotes is a §FILM_FACT line of THIS take; the second heights typed are READ from the CLI-marked set's
// own @Z markings (never written in this script). Read take.log after every run: §PAGEERR or a missing fact = not a take.
// usage: SHED_RAW_DIR=<9 raw sheets> SHED_MARKED_DIR=<the 9 CLI-marked sheets> node prompts/film_dxf2bim_why_rec.js <take dir> [beat_min.json]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const OUT = path.resolve(process.argv[2] || '.'), BEAT_MIN = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};
const SITE = process.env.SITE || 'https://red1oon.github.io/bim-ootb/modeller/modeller.html';
const RAW = process.env.SHED_RAW_DIR || '', MARKED = process.env.SHED_MARKED_DIR || path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked');
const dxfs = d => fs.readdirSync(d).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(d, f));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GPU_ENV = Object.assign({}, process.env, { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' });
const texts = file => { const L = fs.readFileSync(file, 'utf8').split(/\r?\n/).map(s => s.trim()), out = [];
  for (let i = 0; i < L.length - 1; i++) { if (L[i] !== '0' || L[i + 1] !== 'TEXT') continue; const e = { codes: [['0', 'TEXT']] }; let j = i + 2;
    for (; j < L.length - 1 && L[j] !== '0'; j += 2) { e.codes.push([L[j], L[j + 1]]); e[L[j]] = e[L[j]] === undefined ? L[j + 1] : e[L[j]]; } out.push(e); i = j - 1; } return out; };
const marks = file => texts(file).filter(e => e['8'] === 'DXF2BIM-MARK');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

(async () => {
  if (!RAW || dxfs(RAW).length !== 9) throw new Error('SHED_RAW_DIR must hold the 9 raw sheets (private material, given by env)');
  if (!fs.existsSync(MARKED) || dxfs(MARKED).length !== 9) throw new Error('SHED_MARKED_DIR must hold the 9 CLI-marked sheets: ' + MARKED);
  fs.mkdirSync(OUT, { recursive: true });
  const br = await puppeteer.launch({ headless: 'new', env: GPU_ENV, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--window-size=1440,810'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810, deviceScaleFactor: 4 / 3 });   // browser zoom 133 %: the panels' small text legible in a 1920 x 1080 frame
  const plog = []; pg.on('console', m => { const t = m.text(); plog.push(t); if (/§DXF-ARRANGE (start|done|skip|hand)|§DXF-META|PAGEERR/.test(t)) console.log(t.slice(0, 300)); });
  pg.on('pageerror', e => console.log('§PAGEERR ' + String(e).slice(0, 300)));
  await pg.evaluateOnNewDocument(() => { const mk = () => { if (document.getElementById('film-ptr')) return; const d = document.createElement('div'); d.id = 'film-ptr';
      d.style.cssText = 'position:fixed;left:-50px;top:-50px;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,214,64,.95);border:2px solid #14161c;box-shadow:0 0 0 2px rgba(255,214,64,.45);z-index:2147483647;pointer-events:none;transition:transform .12s';
      document.documentElement.appendChild(d);
      document.addEventListener('mousemove', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
      document.addEventListener('mousedown', e => { d.style.transform = 'scale(.7)'; const r = document.createElement('div'); r.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid rgba(255,214,64,.95);z-index:2147483646;pointer-events:none;transition:all .6s;opacity:1';
        document.documentElement.appendChild(r); requestAnimationFrame(() => { r.style.width = r.style.height = '54px'; r.style.margin = '-27px 0 0 -27px'; r.style.opacity = '0'; }); setTimeout(() => r.remove(), 650); }, true);
      document.addEventListener('mouseup', () => { d.style.transform = ''; }, true); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk(); });
  const cdp = await pg.createCDPSession();
  const SAVED = path.join(OUT, 'saved'); fs.rmSync(SAVED, { recursive: true, force: true }); fs.mkdirSync(SAVED, { recursive: true });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVED }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVED }));
  const fact = (k, v) => console.log('§FILM_FACT ' + k + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  const FR = path.join(OUT, 'frames'); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
  const frames = []; let nf = 0, lastDim = '';
  cdp.on('Page.screencastFrame', async ev => { const f = path.join(FR, String(nf++).padStart(6, '0') + '.jpg'); fs.writeFileSync(f, Buffer.from(ev.data, 'base64')); frames.push({ f, ts: ev.metadata.timestamp });
    const dim = ev.metadata.deviceWidth + 'x' + ev.metadata.deviceHeight; if (dim !== lastDim) { lastDim = dim; console.log('§FILM_FRAME_SIZE n=' + nf + ' device=' + dim + ' scale=' + ev.metadata.pageScaleFactor); }
    try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) { } });
  const beatLog = [], chapLog = []; let beatStart = 0, beatId = null; const now = () => Date.now() / 1000;
  const hold = async () => { if (beatId) { const need = (BEAT_MIN[beatId] || 5) + 0.8 - (now() - beatStart); if (need > 0) await sleep(need * 1000); } };
  let chapNext = null;
  const beat = async id => { await hold(); beatId = id; beatStart = now(); beatLog.push([id, beatStart]); if (chapNext) { chapLog.push([chapNext[0], chapNext[1], beatStart]); chapNext = null; } console.log('§FILM_BEAT_AT ' + id); };
  const chapter = (n, key) => { chapNext = [n, key]; };
  const backdrop = n => pg.screenshot({ path: path.join(OUT, 'bd' + n + '.png') });
  const CARD_CSS = 'position:fixed;inset:0;z-index:2147483645;background:#14161c;color:#F3EEE8;display:flex;flex-direction:column;align-items:center;justify-content:center;font:21px/1.5 DejaVu Sans,sans-serif;text-align:center;padding:24px';
  const card = html => pg.evaluate((h, css) => { let c = document.getElementById('film-card'); if (!c) { c = document.createElement('div'); c.id = 'film-card'; c.style.cssText = css; document.body.appendChild(c); } c.innerHTML = h; c.style.display = 'flex'; const p = document.getElementById('film-ptr'); if (p) p.style.visibility = 'hidden'; }, html, CARD_CSS);
  const uncard = () => pg.evaluate(() => { const c = document.getElementById('film-card'); if (c) c.style.display = 'none'; const p = document.getElementById('film-ptr'); if (p) p.style.visibility = ''; });

  // ---- real pointer, wheel, keys ----
  let mx = 720, my = 405;
  const moveTo = async (x, y, ms = 650) => { const steps = Math.max(8, Math.round(ms / 22)); for (let i = 1; i <= steps; i++) { const k = i / steps, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await pg.mouse.move(mx + (x - mx) * e, my + (y - my) * e); await sleep(ms / steps); } mx = x; my = y; };
  const rect = sel => pg.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const bodyRect = () => rect('#dm-body');
  const wheelTo = async (sel, opts = {}) => { const step = opts.step || 100, pace = opts.pace || 70, margin = opts.margin || 60;
    for (let g = 0; g < 200; g++) { const b = await bodyRect(), r = await rect(sel); const want = opts.top ? r.y - (b.y + margin) : r.y < b.y + margin ? r.y - (b.y + margin) : r.y + r.h > b.y + b.h - margin ? r.y + r.h - (b.y + b.h - margin) : 0;
      if (Math.abs(want) < 8) return; const st = await pg.$eval('#dm-body', e => e.scrollTop), mxs = await pg.$eval('#dm-body', e => e.scrollHeight - e.clientHeight);
      if ((want < 0 && st <= 0) || (want > 0 && st >= mxs - 1)) return;
      if (mx < b.x + 20 || mx > b.x + b.w - 20 || my < b.y + 20 || my > b.y + b.h - 20) await moveTo(b.x + b.w * .55, b.y + b.h * .5, 450);
      await pg.mouse.wheel({ deltaY: Math.sign(want) * Math.min(step, Math.abs(want)) }); await sleep(pace); } };
  const pick = async (sel, v) => { await pointAt(sel); await sleep(300); await pg.select(sel, v); await sleep(200); await idle(); };
  const wheelTop = async () => { const b = await bodyRect(); await moveTo(b.x + b.w * .55, b.y + b.h * .5, 450); for (let g = 0; g < 80 && (await pg.$eval('#dm-body', e => e.scrollTop)) > 0; g++) { await pg.mouse.wheel({ deltaY: -120 }); await sleep(60); } };
  const inPanel = sel => pg.$eval(sel, e => !!e.closest('#dm-body')).catch(() => false);
  const pointAt = async (sel, ms, side) => { if (await inPanel(sel)) await wheelTo(sel); const r = await rect(sel); await moveTo(side ? r.x + r.w - Math.min(70, r.w * .15) : r.x + Math.min(r.w / 2, 60), r.y + r.h / 2, ms); return r; };
  const idle = async () => { await pg.waitForFunction(() => window.DxfMetaEditor && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict, { timeout: 300000, polling: 100 }); await sleep(400); };
  const clickAt = async (sel, ms) => { const r = await pointAt(sel, ms); await sleep(250); await pg.mouse.down(); await sleep(90); await pg.mouse.up(); return r; };
  const clickEl = async (sel, ms) => { await clickAt(sel, ms); await sleep(300); await idle(); };
  const typeIn = async (sel, v, fast) => { const r = await pointAt(sel, fast ? 240 : undefined); await sleep(fast ? 70 : 250); await pg.mouse.click(r.x + Math.min(r.w / 2, 60), r.y + r.h / 2, { clickCount: 3 }); await sleep(fast ? 70 : 250);
    await pg.keyboard.type(String(v), { delay: fast ? 30 : 110 }); await sleep(fast ? 100 : 350); await pg.keyboard.press('Tab'); await sleep(fast ? 80 : 250); };
  const ACC = '#dm-yellows [data-act="acceptall"],#dm-yellows [data-act="acceptsr"],#dm-yellows [data-act="acceptinf"]';
  const acceptY = async () => { for (let g = 0; g < 4 && await pg.$(ACC); g++) { await wheelTo(ACC, { step: 140, pace: 55 }); await clickEl(ACC); } };
  const yrows = () => pg.evaluate(() => { const y = document.getElementById('dm-yellows'); return y ? y.querySelectorAll('.dm-pr').length : 0; });
  const verdict = () => pg.evaluate(() => { const v = window.DxfMetaEditor.state.verdict || {}, c = {}; (v.blocking || []).forEach(x => c[x.code] = (c[x.code] || 0) + 1); return { chip: (document.getElementById('dm-chip') || {}).innerText, blocking: (v.blocking || []).length, codes: c }; });
  const arrState = () => pg.evaluate(() => { const A = window.DxfImportUI.state.arr; return A ? { playing: !!A.playing, live: !!A.live, tinted: A.items.filter(it => it.tint || it.dtint).length, tintInf: A.items.filter(it => it.tintInf).length, sheets: A.items.length } : null; });
  // the camera: frame the arrangement (or the canvas group) in the strip the panels leave free
  const camFrame = (dirDeg, elDeg, fill, ms) => pg.evaluate((dirDeg, elDeg, fill, ms) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls;
      const g = A.scene.children.find(o => o.name === 'dxf-arrange' && o.visible) || A.scene.children.find(o => o.name === 'dxf-sheets'), bb = new T.Box3().setFromObject(g), ctr = bb.getCenter(new T.Vector3()), rad = bb.getSize(new T.Vector3()).length() / 2;
      const r = ['dm-panel', 'dxf-panel'].map(id => document.getElementById(id)).filter(e => e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0).map(e => e.getBoundingClientRect().right), x0 = Math.max(0, ...r), x1 = innerWidth - 70;
      const fw = (x1 - x0) / innerWidth, a = dirDeg * Math.PI / 180, e = elDeg * Math.PI / 180, vfov = c.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * c.aspect * fw);
      const dist = rad / Math.sin(Math.min(vfov, hfov) / 2) * fill, dir = new T.Vector3(Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e));
      const right = new T.Vector3().crossVectors(dir.clone().negate(), new T.Vector3(0, 0, 1)).normalize(), ndcX = ((x0 + x1) / 2) / innerWidth * 2 - 1, hw = dist * Math.tan(vfov / 2) * c.aspect;
      const tgt = ctr.clone().addScaledVector(right, -ndcX * hw), toP = tgt.clone().addScaledVector(dir, dist), fromP = c.position.clone(), fromT = ctl.target.clone(), t0 = performance.now();
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.lerpVectors(fromP, toP, s); ctl.target.lerpVectors(fromT, tgt, s); ctl.update();
        if (k < 1) requestAnimationFrame(step); else res({ rad: +rad.toFixed(2) }); })(); }), dirDeg, elDeg, fill, ms);
  const orbitZ = (deg, ms) => pg.evaluate((deg, ms) => new Promise(res => { const A = window.A, T = window.THREE, ctl = A.controls, c = A.camera, o = ctl.target.clone(), v0 = c.position.clone().sub(o), t0 = performance.now();
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.copy(o).add(v0.clone().applyAxisAngle(new T.Vector3(0, 0, 1), deg * Math.PI / 180 * s)); ctl.update();
        if (k < 1) requestAnimationFrame(step); else res(); })(); }), deg, ms);

  const fresh = async () => { await pg.goto(SITE, { timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    await sleep(1200); if (!(await pg.evaluate(() => document.body.classList.contains('ol-collapsed')))) { await clickAt('#ol-collapse', 500); await sleep(600); } await moveTo(900, 500, 300); };
  // the play-on-open hooks (stated): an automated browser opens without play; onStep only RECORDS each step (a read), it moves nothing
  const arm = (stepMs, holdMs) => pg.evaluate((stepMs, holdMs) => { window.__steps = []; const U = window.DxfImportUI.state; U.arrangeOnOpen = true;
    U.arrangeOpts = { stepMs, holdMs, onStep: async info => { window.__steps.push({ i: info.i, sheet: info.sheet, key: info.key, value: info.value, yellow: info.yellow, moves: info.moves }); } }; }, stepMs, holdMs);
  const openSet = async (files) => { await clickAt('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true }); await sleep(700);
    const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 30000 }), clickAt('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction(n => window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length === n && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict, { timeout: 300000, polling: 100 }, files.length); };
  const logHas = re => plog.filter(t => re.test(t));

  // ================= TAKE =================
  // the product's own zoom-to-fit, then slid into the strip the OPEN panels leave free (fixed panels have no offsetParent: tested by display and width) and dollied closer by `zoom`
  const fitCentre = async (fill, ms) => { await pg.evaluate(([fill, ms]) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls, box = new T.Box3();
      const built = A.scene.children.filter(o => /^Bonsai/.test(o.name || '') && o.visible);   // the converted shed, when there is one (else the placed sheets)
      built.forEach(o => { const b = new T.Box3().setFromObject(o); if (!b.isEmpty()) box.union(b); });
      if (box.isEmpty()) { const g = A.scene.children.find(o => o.name === 'dxf-arrange' && o.visible) || A.scene.children.find(o => o.name === 'dxf-sheets' && o.visible); if (g) box.setFromObject(g); }
      if (box.isEmpty()) { res(); return; }
      const ctr = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3()), r = Math.max(size.x, size.y, size.z * 2, 0.5) * 0.5;
      const pr = ['dm-panel', 'dxf-panel'].map(id => document.getElementById(id)).filter(e => e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0).map(e => e.getBoundingClientRect().right), x0 = Math.max(0, ...pr), x1 = innerWidth - 70;
      const th = Math.tan(c.fov * Math.PI / 360), W = x1 - x0, dist = Math.max(r / th, r / (th * (W / innerHeight) * 1.0)) * fill + r * 0.1, dir = new T.Vector3(1, -1, 1.1).normalize();
      c.up.set(0, 0, 1); const p0 = c.position.clone(), q0 = ctl.target.clone();
      // aim at the centre, then slide camera + target along the view's right so the centre lands mid free strip
      c.position.copy(ctr).addScaledVector(dir, dist); ctl.target.copy(ctr); ctl.update(); c.updateMatrixWorld();
      const ndcX = ((x0 + x1) / 2) / innerWidth * 2 - 1, hw = dist * th * c.aspect, sh = new T.Vector3().setFromMatrixColumn(c.matrixWorld, 0).multiplyScalar(-ndcX * hw), P1 = c.position.clone().add(sh), Q1 = ctl.target.clone().add(sh);
      c.position.copy(p0); ctl.target.copy(q0); ctl.update(); const t0 = performance.now();
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.lerpVectors(p0, P1, s); ctl.target.lerpVectors(q0, Q1, s); ctl.update(); if (k < 1) requestAnimationFrame(step); else res(); })(); }), [fill, ms || 2400]); };
  const readMarks = f => marks(f).map(e => e['1'].replace(/ @BY=.*/, ''));
  const markedOf = name => dxfs(MARKED).find(f => path.basename(f).startsWith(name.replace(/\.dxf$/i, '') + '_marked'));
  const strip = (async () => 0);
  // §FILM_SHARE: how much of the role sheets lies inside the free canvas strip, every 2 s (a witness of "always in frame")
  const shareNow = () => pg.evaluate(() => { try { const A = window.A, T = window.THREE, U = window.DxfImportUI.state;
      const bo = A.scene.children.filter(o => /^Bonsai/.test(o.name || '') && o.visible);
      const b = new T.Box3(); bo.forEach(o => { const q = new T.Box3().setFromObject(o); if (!q.isEmpty()) b.union(q); });
      if (!b.isEmpty()) { const cam = A.camera; cam.updateMatrixWorld(); const cv = A.renderer.domElement.getBoundingClientRect(), v = new T.Vector3();
        const pr = Math.max(cv.left, ...['dxf-panel', 'dm-panel'].map(id => { const e = document.getElementById(id); return e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0 ? e.getBoundingClientRect().right : 0; })); let inn = 0, n = 0;
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { v.set(x, y, z).project(cam); n++; const px = cv.left + (v.x + 1) / 2 * cv.width, py = cv.top + (1 - v.y) / 2 * cv.height; if (v.z < 1 && px >= pr && px <= cv.right - 60 && py >= cv.top && py <= cv.bottom - 40) inn++; }
        return inn / n; }
      const g = A.scene.children.find(o => o.name === 'dxf-arrange' && o.visible) || A.scene.children.find(o => o.name === 'dxf-sheets' && o.visible); if (!g) return null;
      const role = new Set(U.arr ? U.arr.items.filter(it => it.view).map(it => it.name) : Object.keys(U.canvas || {})); const cam = A.camera; cam.updateMatrixWorld(); const cv = A.renderer.domElement.getBoundingClientRect();
      const pr = Math.max(cv.left, ...['dxf-panel', 'dm-panel'].map(id => { const e = document.getElementById(id); return e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0 ? e.getBoundingClientRect().right : 0; })), v = new T.Vector3(); let n = 0, inn = 0;
      g.traverse(o => { const nm = o.userData && (o.userData.arrSheet || o.userData.dxfSheet); if (!o.geometry || !o.geometry.attributes.position || !nm || !role.has(nm)) return; const a = o.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 30) { v.set(a[i], a[i + 1], a[i + 2]).project(cam); n++; const px = cv.left + (v.x + 1) / 2 * cv.width, py = cv.top + (1 - v.y) / 2 * cv.height; if (v.z < 1 && px >= pr && px <= cv.right - 60 && py >= cv.top && py <= cv.bottom - 40) inn++; } });
      return n ? inn / n : null; } catch (e) { return null; } });
  let tScreen0 = 0; const shares = []; let sampling = false;
  const sampler = setInterval(async () => { if (!sampling || !tScreen0) return; const sh = await shareNow().catch(() => null); if (sh !== null) { shares.push([now() - tScreen0, sh]); console.log('§FILM_SHARE t=' + (now() - tScreen0).toFixed(1) + ' share=' + sh.toFixed(2) + ' beat=' + beatId); } }, 2000);

  await fresh();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 }); tScreen0 = now(); sampling = true;
  await sleep(600);
  const STEP_MS = 900, HOLD_MS = Math.max(3000, Math.round(((BEAT_MIN.w01 || 12) - 7.5) * 1000));
  // ---- chapter 1 AS DRAWN ----
  chapter(1, 'drawn'); await beat('w01'); await sleep(2500);
  await arm(STEP_MS, HOLD_MS);
  const rawFiles = dxfs(RAW); fact('sheets', String(rawFiles.length)); fact('raw_marks', String(rawFiles.reduce((s, f) => s + marks(f).length, 0)));
  const t0play = now(); await openSet(rawFiles);
  await pg.waitForFunction(() => window.DxfImportUI.state.arr && window.DxfImportUI.state.arr.playing, { timeout: 60000, polling: 50 });
  const st0 = await pg.evaluate(() => { const T = window.THREE, A = window.DxfImportUI.state.arr, all = new T.Box3(), per = {};
    A.items.forEach(it => { const b = new T.Box3(); it.obj.forEach(o => { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox); }); all.union(b); per[it.name.replace(/\.dxf$/i, '')] = b.getCenter(new T.Vector3()).toArray(); });
    const s = all.getSize(new T.Vector3()), f = per['0_FLOOR_PLAN'], fo = per['4_FOUNDATION_LAYOUT'];
    return { w: +s.x.toFixed(1), h: +s.y.toFixed(1), gap: +Math.hypot(f[0] - fo[0], f[1] - fo[1]).toFixed(1) }; });
  fact('pile_w', String(st0.w)); fact('pile_h', String(st0.h)); fact('plan_gap', String(st0.gap));
  await backdrop(1); await sleep(1500);
  // ---- chapter 2 DEFAULTED BEFORE YOUR EYES ----
  chapter(2, 'defaulted');
  await pg.waitForFunction(() => window.__steps && window.__steps.length >= 1, { timeout: 120000, polling: 50 });
  await beat('w02'); await backdrop(2);
  const startLog = logHas(/§DXF-ARRANGE start /)[0] || ''; fact('steps', ((/steps=(\d+)/.exec(startLog)) || [])[1] || 'none'); fact('yellow_steps', ((/yellow=(\d+)/.exec(startLog)) || [])[1] || 'none');
  const half = Math.floor(Number(((/steps=(\d+)/.exec(startLog)) || [])[1]) / 2);
  await pg.waitForFunction(h => window.__steps.length >= h, { timeout: 120000, polling: 50 }, half);
  await beat('w03');
  await pg.waitForFunction(() => { const A = window.DxfImportUI.state.arr; return !A || !A.playing; }, { timeout: 240000, polling: 100 });
  fact('play_s', ((now() - t0play)).toFixed(1));
  { const ks = await pg.evaluate(() => window.__steps.map(x => x.key)), ph = k => k === 'UNITS' ? 1 : /^(VIEW|LEVEL|ROOF|Z|HAXIS)$/.test(k) ? 2 : /^(GRIDX|GRIDY|GRIDH|FACE|CUT)$/.test(k) ? 3 : 4;
    [1, 2, 3, 4].forEach(q => fact('phase' + q, String(ks.filter(k => ph(k) === q).length))); }
  const lvSteps = await pg.evaluate(() => window.__steps.filter(s => s.key === 'LEVEL')); fact('level_steps', String(lvSteps.length)); fact('level_value', lvSteps.length ? lvSteps[0].value : 'none');
  await sleep(800); const as = await arrState(); fact('tinted', String(as ? as.tinted : 'none')); fact('tinted_inferred', String(as ? as.tintInf : 'none'));
  await beat('w04'); await sleep(2500);
  // ---- chapter 3 WHAT A PERSON STATES ----
  chapter(3, 'states'); await beat('w05'); await backdrop(3);
  const v0 = await verdict(); fact('open_blocking', String(v0.blocking)); fact('open_yellow_rows', String(await yrows()));
  await wheelTop(); await acceptY(); await sleep(1500);
  const v1 = await verdict(); fact('after_accept_blocking', String(v1.blocking)); fact('after_accept_yellow', String(await yrows()));
  await clickAt('#dxf-convert', 800); await sleep(1500); fact('convert_refused', await pg.$eval('#dxf-status', e => e.innerText.trim())); await pointAt('#dxf-status', 700); await sleep(1200);
  await clickAt('#dxf-fold', 600); await sleep(500);   // D39: more canvas for the typing that follows
  const names = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.name));
  const roleOf = {}; names.forEach(n => { const f = markedOf(n), v = f && readMarks(f).find(m => /^@VIEW=/.test(m)); roleOf[n] = v ? v.replace('@VIEW=', '') : null; });
  const slow = { set: true, z: true, layer: true, bz: true };   // the first of each kind is typed slowly, the rest fast
  // (a) the set name: one word, READ from the marked set, fills the SET row of every sheet
  await beat('w06');
  const setName = readMarks(markedOf(names[0])).find(m => /^@SET=/.test(m)).replace('@SET=', ''); fact('set_name', setName);
  if (!(await pg.$('#dm-f-0-SET'))) await clickEl('#dm-panel [data-act="card"][data-sheet="0"]', 700);
  await wheelTo('#dm-f-0-SET', { step: 120, pace: 60 }); await typeIn('#dm-f-0-SET', setName); await idle(); fact('set_rows', String(await yrows())); await sleep(1200); await acceptY(); await sleep(800);
  const v2 = await verdict(); fact('after_set_blocking', String(v2.blocking));
  // (b) the second height of each elevation / section: the panel asks; the values are READ from the marked set's own @Z markings
  await beat('w07');
  const second = {}; names.forEach(n => { const f = markedOf(n); if (!f) return; const m = marks(f).filter(e => /^@Z=/.test(e['1'])); if (m.length >= 2) { const z = m.map(e => ({ z: Number(/^@Z=(\S+)/.exec(e['1'])[1]), y: e['20'] })).sort((a, b) => b.z - a.z)[0]; second[n] = z; } });
  fact('second_z', String(Object.values(second)[0].z)); let typed = 0;
  for (let si = 0; si < names.length; si++) { const z = second[names[si]]; if (!z) continue; const fast = typed > 0;
    if (!(await pg.$('#dm-av-' + si + '-Z'))) await clickEl('#dm-panel [data-act="card"][data-sheet="' + si + '"]', fast ? 300 : 700);
    await wheelTo('#dm-av-' + si + '-Z', { step: 120, pace: fast ? 25 : 60 });
    if (!fast) { fact('height_question', await pg.evaluate(si => { const v = document.getElementById('dm-av-' + si + '-Z'), q = v.closest('.dm-row').previousElementSibling; return q && q.classList.contains('dm-ask') ? q.innerText : 'none'; }, si)); await sleep(2500); }
    await typeIn('#dm-av-' + si + '-Z', z.z, fast); await typeIn('#dm-ap-' + si + '-Z', z.y, fast);
    await clickEl('#dm-panel [data-act="add"][data-sheet="' + si + '"][data-group="Z"]', fast ? 250 : 600); typed++; await sleep(fast ? 150 : 400); }
  fact('heights_typed', String(typed)); await wheelTop(); await acceptY(); await sleep(800);
  const v3 = await verdict(); fact('after_heights_blocking', String(v3.blocking));
  // (c) what each CAD layer is: the types READ from the marked set's own @LAYER markings, chosen in the Layers section (the layers the set states; the others stay as they are)
  await beat('w08');
  const stated = {}; names.forEach(n => { const f = markedOf(n); if (!f) return; readMarks(f).filter(m => /^@LAYER=/.test(m)).forEach(m => { const [l, t] = m.replace('@LAYER=', '').split(','); const role = { PLAN: 'plan', ELEV: 'elev', SECTION: 'section', ROOF: 'roof' }[roleOf[n]]; (stated[role + '|' + l] = stated[role + '|' + l] || new Set()).add(t); }); });
  fact('layers_to_state', String(Object.keys(stated).length));
  if (!(await pg.$('#dm-panel select[data-act="layer"]'))) await clickEl('#dm-panel [data-sec="layers"]', 700);
  const statedSheets = {}; names.forEach(n => { const f = markedOf(n); if (!f) return; readMarks(f).filter(m => /^@LAYER=/.test(m)).forEach(m => { const [l] = m.replace('@LAYER=', '').split(','); const role = { PLAN: 'plan', ELEV: 'elev', SECTION: 'section', ROOF: 'roof' }[roleOf[n]]; (statedSheets[role + '|' + l] = statedSheets[role + '|' + l] || new Set()).add(n); }); });
  const selOf = (role, layer, sheet) => '#dm-panel select[data-act="layer"][data-role="' + role + '"][data-layer="' + layer.replace(/"/g, '\\"') + '"]' + (sheet ? '[data-sheet="' + sheet + '"]' : ':not([data-sheet])');
  const pickSel = async (sel, ui, fast) => { await wheelTo(sel, { step: 120, pace: fast ? 25 : 60 }); await pointAt(sel, fast ? 240 : 650); await sleep(fast ? 80 : 300); await pg.select(sel, ui); await sleep(fast ? 100 : 250); await idle(); };
  let nLay = 0, nSplit = 0; for (const key of Object.keys(stated)) { const [role, layer] = key.split('|'), t = [...stated[key]]; if (t.length !== 1) { fact('layer_mixed', key); continue; } const ui = t[0] === 'elevdoor' ? 'door' : t[0], want = statedSheets[key], fast = nLay > 0;
    const rowBtn = '[data-layer-row="' + role + '|' + layer + '"] [data-act="laysplit"]';
    if (await pg.$(rowBtn)) { if (!(await pg.$('[data-layer-row^="' + role + '|' + layer + '|"]'))) await clickEl(rowBtn, fast ? 250 : 600); }
    const all = await pg.evaluate((role, layer) => [...document.querySelectorAll('[data-layer-row^="' + role + '|' + layer + '|"]')].map(e => e.dataset.layerRow.split('|')[2]), role, layer);
    if (!all.length || (all.length === want.size && all.every(n => want.has(n)))) { if (!(await pg.$(selOf(role, layer)))) { fact('layer_missing', key); continue; } await pickSel(selOf(role, layer), ui, fast); }
    else for (const n of want) { if (!(await pg.$(selOf(role, layer, n)))) { fact('layer_missing', key + '|' + n); continue; } await pickSel(selOf(role, layer, n), ui, fast); nSplit++; }
    nLay++; }
  fact('layers_split_by_sheet', String(nSplit));
  fact('layers_stated', String(nLay)); const v4 = await verdict(); fact('after_layers_blocking', String(v4.blocking)); await sleep(1200);
  // (d) the body heights no elevation shows, READ from @BODYZ
  await beat('w09');
  const bz = {}; names.forEach(n => { const f = markedOf(n); if (!f) return; readMarks(f).filter(m => /^@BODYZ=/.test(m)).forEach(m => { const [kind, a, b] = m.replace('@BODYZ=', '').split(','); bz[kind] = [a, b]; }); });
  if (!(await pg.$('#dm-panel [data-bodyz]'))) { const h = await pg.$('#dm-panel [data-sec="bodyz"]'); if (h) await clickEl('#dm-panel [data-sec="bodyz"]', 700); }
  const waiting = await pg.evaluate(() => [...document.querySelectorAll('#dm-panel [data-bodyz]')].map(e => e.dataset.bodyz)); fact('bodyz_waiting', waiting);
  let nBz = 0; for (const kind of Object.keys(bz)) { if (!(await pg.$('#dm-bz-' + kind + '-0'))) continue; const fast = nBz > 0; await wheelTo('#dm-bz-' + kind + '-0', { step: 120, pace: fast ? 25 : 60 });
    await typeIn('#dm-bz-' + kind + '-0', bz[kind][0], fast); await typeIn('#dm-bz-' + kind + '-1', bz[kind][1], fast); await clickEl('#dm-panel [data-act="bodyzadd"][data-kind="' + kind + '"]', fast ? 250 : 600); nBz++; await sleep(300); }
  fact('bodyz_typed', String(nBz)); const v5 = await verdict(); fact('after_bodyz_blocking', String(v5.blocking));
  // (e) one stray area excluded: a REAL drag with the Exclude tool on the beam plan, from the @EXCLUDE box of the marked set
  const ex = readMarks(markedOf('3_BEAM_LAYOUT.dxf')).find(m => /^@EXCLUDE=/.test(m)).replace('@EXCLUDE=', '').split(',').map(Number); fact('exclude_from_set', ex.join(','));
  const exStatus0 = await pg.$eval('#dxf-status', e => e.innerText.trim());
  if (!(await pg.$('#dm-panel [data-act="exsheet"]'))) await clickEl('#dm-panel [data-sec="excludes"]', 700);
  await wheelTo('#dm-panel [data-act="exsheet"]', { step: 120, pace: 40 }); await pick('#dm-panel [data-act="exsheet"]', '3_BEAM_LAYOUT.dxf'); await clickAt('#dm-panel [data-act="tool"][data-tool="exclude"]', 650); await sleep(300);
  const kz = await pg.evaluate(() => { const c = window.DxfImportUI.state.canvas['3_BEAM_LAYOUT.dxf']; return { k: c.k, z: c.z }; });
  await pg.evaluate((ex, k, z) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls, cx = (ex[0] + ex[2]) / 2 * k, cy = (ex[1] + ex[3]) / 2 * k;
    const r = ['dm-panel', 'dxf-panel'].map(id => document.getElementById(id)).filter(e => e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0).map(e => e.getBoundingClientRect().right), x0 = Math.max(0, ...r), x1 = innerWidth - 70;
    const p0 = c.position.clone(), q0 = ctl.target.clone(), q1 = new T.Vector3(cx, cy, z), p1 = new T.Vector3(cx, cy - 4, z + 30); c.up.set(0, 0, 1);
    const save = { p: c.position.clone(), q: ctl.target.clone() }; c.position.copy(p1); ctl.target.copy(q1); ctl.update(); c.updateMatrixWorld();
    const ndcX = ((x0 + x1) / 2) / innerWidth * 2 - 1, dist = c.position.distanceTo(ctl.target), hw = dist * Math.tan(c.fov * Math.PI / 360) * c.aspect, sh = new T.Vector3().setFromMatrixColumn(c.matrixWorld, 0).multiplyScalar(-ndcX * hw);
    const P1 = p1.clone().add(sh), Q1 = q1.clone().add(sh); c.position.copy(p0); ctl.target.copy(q0); ctl.update(); const t0 = performance.now();
    (function step() { const kk = Math.min(1, (performance.now() - t0) / 2200), s = kk < .5 ? 2 * kk * kk : 1 - Math.pow(-2 * kk + 2, 2) / 2; c.position.lerpVectors(p0, P1, s); ctl.target.lerpVectors(q0, Q1, s); ctl.update(); if (kk < 1) requestAnimationFrame(step); else res(); })(); }), ex, kz.k, kz.z);
  await sleep(500);
  const px = await pg.evaluate((ex, k, z) => { const A = window.A, T = window.THREE, cv = A.renderer.domElement.getBoundingClientRect(), f = (x, y) => { const v = new T.Vector3(x * k, y * k, z).project(A.camera); return [cv.left + (v.x + 1) / 2 * cv.width, cv.top + (1 - v.y) / 2 * cv.height]; }; return { a: f(ex[0], ex[1]), b: f(ex[2], ex[3]) }; }, ex, kz.k, kz.z);
  await moveTo(px.a[0], px.a[1], 700); await pg.mouse.down(); await sleep(150); await moveTo(px.b[0], px.b[1], 900); await sleep(150); await pg.mouse.up(); fitCentre(0.9, 1600).catch(() => { }); await sleep(300); await idle();   // straight back to the whole build: the zoomed view of the excluded strip is empty by definition
  fact('exclude_drawn', await pg.evaluate(() => window.DxfMetaEditor.state.sheets.flatMap(s => s.marks.filter(m => m.key === 'EXCLUDE').map(m => m.value)).join(' ')));
  const exStatus1 = await pg.$eval('#dxf-status', e => e.innerText.trim()); fact('bodies_before_exclude', ((/(\d+) bodies will be built/.exec(exStatus0)) || [])[1] || 'none'); fact('bodies_after_exclude', ((/(\d+) bodies will be built/.exec(exStatus1)) || [])[1] || 'none');
  const v6 = await verdict(); fact('after_exclude_blocking', String(v6.blocking)); await sleep(1200); await sleep(2200);
  // ---- chapter 4 ONE SHED: Complete the building, Convert, the panels away, the finish ----
  chapter(4, 'shed'); await beat('w10'); await backdrop(4);
  await clickAt('#dxf-fold', 500); await sleep(400);   // unfold: the option boxes are in this panel
  if (await pg.$('#dxf-complete')) { await clickAt('#dxf-complete', 700); await sleep(600); } fact('complete_ticked', String(await pg.evaluate(() => { const e = document.getElementById('dxf-complete'); return !!(e && e.checked); })));
  await clickAt('#dxf-convert', 800); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 }); await sleep(2500);
  fact('converted', await pg.evaluate(() => ({ n: window.DxfImportUI.state.last.nInserts, counts: window.DxfImportUI.state.last.counts })));
  { const c = await pg.evaluate(() => window.DxfImportUI.state.last.counts), sum = re => Object.keys(c).filter(k => re.test(k)).reduce((a, k) => a + c[k], 0);
    ['Column', 'Beam', 'Footing', 'Wall', 'Slab', 'Roof', 'Member'].forEach(k => fact('n_' + k.toLowerCase() + 's', String(sum(new RegExp('Ifc' + k + '$'))))); }
  await fitCentre(1.5); orbitZ(30, 12000).catch(() => { });   // the shed in the strip the panels leave, turning slowly while it is told
  // save the marked copies of THIS take (chapter 5 reopens them), then the panels away and the finish
  const before = fs.readdirSync(SAVED); await clickAt('#dm-save', 800);
  let saved = []; for (let i = 0; i < 80; i++) { await sleep(250); saved = fs.readdirSync(SAVED).filter(f => /\.dxf$/i.test(f) && !before.includes(f)); if (saved.length >= names.length) break; }
  await sleep(1200); saved = fs.readdirSync(SAVED).filter(f => /\.dxf$/i.test(f)).sort(); fact('saved_n', String(saved.length));
  await clickAt('#dm-close', 600); await sleep(400); await clickAt('#dxf-fold', 500); await sleep(500);   // what is not needed any more is folded away: the canvas is all the shed
  await fitCentre(1.15);
  await orbitZ(110, 14000);
  // ---- chapter 5 OPENS PLACED NEXT TIME ----
  chapter(5, 'placed'); await beat('c5'); await backdrop(5);
  const skip0 = logHas(/skip-on-open/).length, start0 = logHas(/§DXF-ARRANGE start /).length;
  await fresh(); await arm(STEP_MS, HOLD_MS); await openSet(saved.map(f => path.join(SAVED, f))); await sleep(2500);
  await fitCentre(0.9); await beat('w11'); fact('reopen_skip', String(logHas(/skip-on-open/).length - skip0)); fact('reopen_replays', String(logHas(/§DXF-ARRANGE start /).length - start0)); fact('reopen_arrangement', String(await pg.evaluate(() => !!window.DxfImportUI.state.arr)));
  { const vr = await verdict(); fact('reopen_blocking', String(vr.blocking)); fact('reopen_status', await pg.$eval('#dxf-status', e => e.innerText.trim())); }
  await sleep(1500);
  // ---- closing card ----
  await beat('l01');
  const LIM = ['Not shown: doors and windows as schedules (rows and tags), and the rules that read the roof beyond the default.',
    'The values typed here are the ones this drawing set states in its own saved markings; a different set asks for its own.'];
  fact('limits', LIM);
  await card('<div style="font-size:19px;color:#9aa3b2;letter-spacing:3px;margin-bottom:20px">WHAT THIS FILM DOES NOT SHOW</div><div style="text-align:left;font-size:21px;line-height:1.75;max-width:1200px">' + LIM.map(x => '· ' + esc(x)).join('<br>') + '</div>');
  await beat('end');
  await card('<div style="font-size:20px;color:#9aa3b2;line-height:1.8">A common BricsCAD 2D set: nine drawings, one shed<br>Modeller: red1oon.github.io/bim-ootb/modeller · every number from this take</div>');
  await hold(); await sleep(1200);
  sampling = false; clearInterval(sampler);
  { const inCh = shares.filter(([t, v]) => t > 8); const mn = inCh.length ? Math.min(...inCh.map(x => x[1])) : null; console.log('§FILM_SHARE_SUMMARY samples=' + shares.length + ' min=' + (mn === null ? 'n/a' : mn.toFixed(2)) + ' below0.6=' + inCh.filter(x => x[1] < 0.6).map(x => x[0].toFixed(0) + 's').join(',')); }
  await cdp.send('Page.stopScreencast'); await br.close();
  const t0 = frames[0].ts, lines = [];
  frames.forEach((fr, i) => { const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].ts - fr.ts) : 1.0; lines.push("file '" + fr.f + "'", 'duration ' + d.toFixed(4)); });
  lines.push("file '" + frames[frames.length - 1].f + "'"); fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n'));
  const mk = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'scale=1920:1080,fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', path.join(OUT, 'film.mp4')], { encoding: 'utf8' });
  console.log('§FILM_SYNC firstFrame=' + t0.toFixed(3) + ' firstBeat=' + beatLog[0][1].toFixed(3) + ' lastFrame=' + frames[frames.length - 1].ts.toFixed(3) + ' frames=' + frames.length + ' ffmpeg_rc=' + mk.status + ' ' + (mk.stderr || '').slice(0, 200));
  beatLog.forEach(([id, ep]) => console.log('§FILM_BEAT id=' + id + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  chapLog.forEach(([n, key, ep]) => console.log('§FILM_CHAPTER n=' + n + ' key=' + key + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  fs.writeFileSync(path.join(OUT, 'backdrops.txt'), chapLog.filter(([n]) => n <= 5).map(([n]) => 'c' + n + ' ' + path.join(OUT, 'bd' + n + '.png')).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'page.log'), plog.join('\n'));
  fs.rmSync(FR, { recursive: true, force: true });
  console.log('§FILM_REC sec=' + (frames[frames.length - 1].ts - t0 + 1).toFixed(1) + ' out=' + path.join(OUT, 'film.mp4'));
})().catch(e => { console.log('§FILM_REC_ERROR ' + (e && e.stack || e)); process.exit(1); });
