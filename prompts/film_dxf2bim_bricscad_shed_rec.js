#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope: prompts/FILM_DXF2BIM_WHY_MARKINGS.md "BRICSCAD FILM — STORYBOARD" (owner 2026-10-27 request, 2026-10-28 "Proceed.. your advice"): a BricsCAD user's 9 raw shed sheets,
// what they do not state (the grouped list), the Sheet view with its rings, the grid stated, the rest stated (READ from the CLI-marked set, as the Why take), saved, Convert, one wall edited in small
// typed steps, one more bay with its cost, the marked sheet saved as SVG, the prior-art card (text EXTRACTED from the guide). No walker. LIVE recorder: the Modeller (SITE= a local server, else GH
// Pages), REAL clicks / typing / wheel; the page's state is READ for facts only. Stated film-only choices: no Arrange play on open, a pointer dot, chapter backdrops and cards. Every number the
// narration quotes is a §FILM_FACT line of THIS take. Read take.log after every run: §PAGEERR, a missing fact or walker_lines > 0 = not a take.
// usage: SHED_RAW_DIR=<9 raw sheets> SHED_MARKED_DIR=<the 9 CLI-marked sheets> node prompts/film_dxf2bim_bricscad_shed_rec.js <take dir> [beat_min.json]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const OUT = path.resolve(process.argv[2] || '.'), BEAT_MIN = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};
const SITE = process.env.SITE || 'https://red1oon.github.io/bim-ootb/modeller/modeller.html';
const RATES = process.env.FILM_RATES || 'pwd2024_bd', SITE_R = SITE + (SITE.indexOf('?') < 0 ? '?' : '&') + 'rates=' + RATES;   // owner 2026-10-28: the client is in Bangladesh, its rates (PWD 2024)
const PRIV = process.env.FILM_PRIVATE_RE ? new RegExp(process.env.FILM_PRIVATE_RE, 'i') : null;   // a private client name, given at run time (never written in this file): blurred where the Sheet view draws it
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
  const plog = []; pg.on('console', m => { const t = m.text(); plog.push(t); if (/§DXF-ARRANGE (start|done|skip|hand)|§DXF-META|PAGEERR|§DXF-BAY|§GATE /.test(t)) console.log(t.slice(0, 300)); });
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

  const fresh = async () => { await pg.goto(SITE_R, { timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
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

  // ================= TAKE (FILM_DXF2BIM_WHY_MARKINGS.md "BRICSCAD FILM — STORYBOARD") =================
  const sha = f => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
  const rawFiles = dxfs(RAW), rawSha0 = rawFiles.map(sha);
  const stat = () => pg.$eval('#stat', e => e.innerText.trim()).catch(() => '');
  const groups = () => pg.evaluate(() => [...document.querySelectorAll('#dm-yellows .dm-grp')].map(g => ({ key: g.getAttribute('data-grp'), n: JSON.parse(g.getAttribute('data-grp-ids') || '[]').length,
    label: ((g.innerText || '').split(String.fromCharCode(10)).filter(Boolean)[0] || '').slice(0, 120) })));
  const head = () => pg.evaluate(() => { const y = document.getElementById('dm-yellows'); return y ? ((y.innerText || '').split(String.fromCharCode(10)).find(t => /yellow in \d+ group/.test(t)) || '') : ''; });
  const tickGroup = async (key, ms) => { const sel = '#dm-yellows [data-act="grpok"][data-grp="' + key + '"]'; if (!(await pg.$(sel))) { fact('tick_missing', key); return false; }
    await wheelTo(sel, { step: 120, pace: 60 }); await clickEl(sel, ms || 700); await sleep(600); return true; };
  const sheetMarks = () => logHas(/§SHEET-MARKS sheet=0_FLOOR_PLAN/).slice(-1)[0] || '';
  const fpIndex = () => pg.evaluate(() => window.DxfMetaEditor.state.sheets.findIndex(s => /FLOOR_PLAN/.test(s.name)));
  const openSheet = async (si) => { if (!(await pg.$('#dm-panel [data-act="sheetview"][data-sheet="' + si + '"]'))) await clickEl('#dm-panel [data-act="card"][data-sheet="' + si + '"]', 700);
    await clickAt('#dm-panel [data-act="sheetview"][data-sheet="' + si + '"]', 800); await pg.waitForSelector('#dxf-sheet-frame', { timeout: 30000 }); await sleep(1200); await blurPrivate(); await sleep(300); };
  const closeSheet = async () => { await pg.evaluate(() => document.querySelectorAll('.film-blur').forEach(e => e.remove())); if (await pg.$('#dsf-close')) { await clickAt('#dsf-close', 600); await sleep(700); } };
  // a film overlay (stated): a blur over each text the Sheet view draws that matches FILM_PRIVATE_RE, at the renderer's own place (dxf_sheet_view.js: x = w/2 + (x - cx) s, font max(6, h s))
  const blurPrivate = async () => { if (!PRIV) { fact('blurred_texts', 'no FILM_PRIVATE_RE'); return 0; }
    const n = await pg.evaluate(src => { const re = new RegExp(src, 'i'), st = window.DxfSheetFrame.state, cv = st.el && st.el.querySelector('canvas'); if (!cv || !st.view || !st.last) return -1;
      document.querySelectorAll('.film-blur').forEach(e => e.remove()); const cr = cv.getBoundingClientRect(), w = cv.clientWidth, h = cv.clientHeight, v = st.view, c2 = document.createElement('canvas').getContext('2d'); let k = 0;
      st.last.list.filter(d => d.k === 'text' && re.test(d.s)).forEach(d => { const px = Math.max(6, d.h * v.s); c2.font = px + 'px sans-serif'; const tw = c2.measureText(d.s).width;
        const x0 = cr.left + w / 2 + (d.p[0] - v.cx) * v.s, y0 = cr.top + h / 2 - (d.p[1] - v.cy) * v.s, L = d.mid ? x0 - tw / 2 : x0, T = d.mid ? y0 - px / 2 : y0 - px;
        const b = document.createElement('div'); b.className = 'film-blur'; b.style.cssText = 'position:fixed;left:' + (L - 8) + 'px;top:' + (T - 5) + 'px;width:' + (tw + 16) + 'px;height:' + (px * 1.35 + 10) + 'px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);background:rgba(20,23,28,.3);border:1px dashed rgba(255,214,64,.85);border-radius:4px;z-index:2147483600;pointer-events:none';
        const lab = document.createElement('div'); lab.textContent = 'private client name (kept in the DXF)'; lab.style.cssText = 'position:absolute;left:0;top:100%;margin-top:3px;font:12px sans-serif;color:#ffd640;white-space:nowrap;text-shadow:0 0 3px #000'; b.appendChild(lab); document.body.appendChild(b); k++; });
      return k; }, PRIV.source);
    fact('blurred_texts', String(n)); return n; };
  const frameBox = (box, fill, ms, dir) => pg.evaluate(([box, fill, ms, dir]) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls;
      const ctr = new T.Vector3((box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2), r = Math.max(box[3] - box[0], box[4] - box[1], (box[5] - box[2]) * 2, 0.5) * 0.5;
      const pr = ['dm-panel', 'dxf-panel'].map(id => document.getElementById(id)).filter(e => e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0).map(e => e.getBoundingClientRect().right), x0 = Math.max(0, ...pr), x1 = innerWidth - 70;
      const th = Math.tan(c.fov * Math.PI / 360), W = x1 - x0, dist = Math.max(r / th, r / (th * (W / innerHeight))) * fill + r * 0.1, d = new T.Vector3(dir[0], dir[1], dir[2]).normalize();
      const p0 = c.position.clone(), q0 = ctl.target.clone(); c.up.set(0, 0, 1); c.position.copy(ctr).addScaledVector(d, dist); ctl.target.copy(ctr); ctl.update(); c.updateMatrixWorld();
      const ndcX = ((x0 + x1) / 2) / innerWidth * 2 - 1, hw = dist * th * c.aspect, sh = new T.Vector3().setFromMatrixColumn(c.matrixWorld, 0).multiplyScalar(-ndcX * hw), P1 = c.position.clone().add(sh), Q1 = ctl.target.clone().add(sh);
      c.position.copy(p0); ctl.target.copy(q0); ctl.update(); const t0 = performance.now();
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.lerpVectors(p0, P1, s); ctl.target.lerpVectors(q0, Q1, s); ctl.update(); if (k < 1) requestAnimationFrame(step); else res(); })(); }), [box, fill, ms, dir || [1, -1, 1.1]]);
  const setFold = async want => { const slim = await pg.evaluate(() => !!window.DxfImportUI.state.slim); if (slim !== want) { await clickAt('#dxf-fold', 500); await sleep(500); } };   // the 2D panel folded (true) or open (false), whatever it was
  const flyRow = async (rule) => { const grp = '#dm-yellows [data-act="grpopen"][data-grp="' + rule + '"]', row = '#dm-yellows .dm-pr[data-rule="' + rule + '"]';
    if (!(await pg.$(row)) && await pg.$(grp)) { await wheelTo(grp, { step: 120, pace: 50 }); await clickEl(grp, 600); }
    if (!(await pg.$(row))) { fact('fly_' + rule, 'no row'); return false; } await wheelTo(row, { step: 120, pace: 50 }); await clickAt(row, 700); await sleep(2200);
    fact('fly_' + rule, await pg.$eval(row, e => e.getAttribute('data-ev'))); return true; };
  const frameSheet = async (name, fill, ms) => { const b = await pg.evaluate(n => { const T = window.THREE, A = window.A, box = new T.Box3();
      A.scene.children.filter(o => (o.name === 'dxf-sheets' || o.name === 'dxf-arrange') && o.visible).forEach(g => g.traverse(o => { const nm = o.userData && (o.userData.arrSheet || o.userData.dxfSheet); if (nm === n && o.geometry) box.expandByObject(o); }));
      return box.isEmpty() ? null : [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]; }, name);
    if (b) await frameBox(b, fill || 1.05, ms || 1800, [0, -0.3, 1]); fact('framed', name + (b ? '' : ' (not on the canvas)')); return !!b; };
  const keyCtl = async k => { await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); await pg.keyboard.down('Control'); await pg.keyboard.press(k); await pg.keyboard.up('Control'); await sleep(1800); };
  const priorArt = cp.spawnSync('git', ['-C', path.join(process.env.HOME, 'bim-compiler'), 'show', 'origin/master:docs/DXF2BIMGuide.md'], { encoding: 'utf8' }).stdout || '';
  const paText = ((/## Prior art\s+([\s\S]*?)\n---/.exec(priorArt) || [])[1] || '').replace(/\*\*\[Prior art\]\(DXF2BIM_Prior_Art\.md\)\*\*/, 'the guide\'s Prior art page').replace(/\s+/g, ' ').trim();
  if (!paText) throw new Error('the guide has no "## Prior art" section on BIMCompiler origin/master');
  fact('prior_art_text', paText);

  await fresh();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 }); tScreen0 = now(); sampling = true;
  await sleep(600);
  // ---- chapter 1 WHAT YOUR DRAWING DOES NOT SAY: the raw sheets open (no Arrange play: shown in the earlier films), the list grouped, three groups ticked ----
  chapter(1, 'notsay'); await beat('b01');
  await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });   // stated: an automated browser opens without the play
  fact('sheets', String(rawFiles.length)); fact('raw_marks', String(rawFiles.reduce((s, f) => s + marks(f).length, 0)));
  await openSet(rawFiles); await sleep(1200); await backdrop(1);
  const gN = (G, k) => { const g = G.find(x => x.key === k); return g ? String(g.n) : 'none'; }, chipN = c => ((/(\d+)/.exec(String(c)) || [])[1] || 'none');
  const v0 = await verdict(); fact('open_chip', v0.chip); fact('open_n', chipN(v0.chip)); fact('open_head', await head());
  { const G = await groups(); fact('open_groups', G); fact('g_units', gN(G, 'PR-UNITS')); fact('g_view', gN(G, 'PR-VIEW')); fact('g_name', gN(G, 'PR-NAME')); fact('open_yellow', String(G.reduce((a, g) => a + g.n, 0))); }
  await beat('b02'); await wheelTo('#dm-yellows', { top: true }); await sleep(800); await flyRow('PR-VIEW');   // a row = the canvas flies to where that value was read (the product's own §D36)
  await beat('b03');
  for (const k of ['PR-UNITS', 'PR-VIEW', 'PR-NAME']) await tickGroup(k, 650);
  await sleep(800); await flyRow('PR-GRID-TICK'); { const G = await groups(); fact('round2_groups', G); fact('g_grid', gN(G, 'PR-GRID-TICK')); fact('g_level', gN(G, 'PR-LEVEL')); fact('g_ground', gN(G, 'PR-Z-GROUND')); fact('g_face', gN(G, 'PR-FACE')); } fact('round2_chip', (await verdict()).chip);
  // ---- chapter 2 THE SHEET, AS YOU DREW IT ----
  chapter(2, 'sheet'); await beat('b04');
  const fp = await fpIndex(); await openSheet(fp); await backdrop(2);
  { const ob = (/open_box="([^"]*)"/.exec(sheetMarks()) || [])[1] || ''; fact('box_open_rows', ob);   // the frame's own log: the box's open rows as written on the sheet
    fact('box_open_word', /^@LEVEL\b/.test(ob) ? 'the floor level' : (ob || 'none')); }
  fact('sheet_open', sheetMarks()); { const m = /rings=(\d+) boxed_open=(\d+)/.exec(sheetMarks()) || []; fact('rings', m[1] || 'none'); fact('boxed_open', m[2] || 'none'); }
  await moveTo(1000, 160, 1400); await sleep(1500); await moveTo(760, 260, 1400); await sleep(1200);
  await beat('b05'); await closeSheet();
  const gridGroup = (await groups()).find(g => g.key === 'PR-GRID-TICK'); fact('grid_group', gridGroup || 'none');
  await tickGroup('PR-GRID-TICK', 800);
  await beat('b06'); await openSheet(fp); fact('sheet_marked', sheetMarks()); { const m = /positional=(\d+)/.exec(sheetMarks()) || []; fact('positional', m[1] || 'none'); }
  await moveTo(1000, 160, 1400); await sleep(2000); await closeSheet();
  // ---- chapter 3 WHAT A PERSON STATES (rush): the rest accepted; the set, heights, layers, body heights, exclude READ from the CLI-marked set; the building type; Save ----
  chapter(3, 'states'); await beat('b07'); await backdrop(3);
  await wheelTop(); await acceptY(); await sleep(800); { const c = (await verdict()).chip; fact('after_accept_chip', c); fact('after_accept_n', chipN(c)); }
  await clickAt('#dxf-fold', 600); await sleep(500);
  const names = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.name));
  const roleOf = {}; names.forEach(n => { const f = markedOf(n), v = f && readMarks(f).find(m => /^@VIEW=/.test(m)); roleOf[n] = v ? v.replace('@VIEW=', '') : null; });
  const slow = { set: true, z: true, layer: true, bz: true };   // the first of each kind is typed slowly, the rest fast
  // (a) the set name: one word, READ from the marked set, fills the SET row of every sheet
  await beat('b08');
  const setName = readMarks(markedOf(names[0])).find(m => /^@SET=/.test(m)).replace('@SET=', ''); fact('set_name', setName);
  if (!(await pg.$('#dm-f-0-SET'))) await clickEl('#dm-panel [data-act="card"][data-sheet="0"]', 700);
  await wheelTo('#dm-f-0-SET', { step: 120, pace: 60 }); await typeIn('#dm-f-0-SET', setName, true); await idle(); fact('set_rows', String(await yrows())); await sleep(1200); await acceptY(); await sleep(800);
  const v2 = await verdict(); fact('after_set_blocking', String(v2.blocking));
  // (b) the second height of each elevation / section: the panel asks; the values are READ from the marked set's own @Z markings
  await beat('b09'); await frameSheet(names.find(n => /ELEV_NORTH/i.test(n)) || names[1], 1.0, 1600);
  const second = {}; names.forEach(n => { const f = markedOf(n); if (!f) return; const m = marks(f).filter(e => /^@Z=/.test(e['1'])); if (m.length >= 2) { const z = m.map(e => ({ z: Number(/^@Z=(\S+)/.exec(e['1'])[1]), y: e['20'] })).sort((a, b) => b.z - a.z)[0]; second[n] = z; } });
  fact('second_z', String(Object.values(second)[0].z)); let typed = 0;
  for (let si = 0; si < names.length; si++) { const z = second[names[si]]; if (!z) continue; const fast = true;
    if (!(await pg.$('#dm-av-' + si + '-Z'))) await clickEl('#dm-panel [data-act="card"][data-sheet="' + si + '"]', fast ? 300 : 700);
    await wheelTo('#dm-av-' + si + '-Z', { step: 120, pace: fast ? 25 : 60 });
    if (!fast) { fact('height_question', await pg.evaluate(si => { const v = document.getElementById('dm-av-' + si + '-Z'), q = v.closest('.dm-row').previousElementSibling; return q && q.classList.contains('dm-ask') ? q.innerText : 'none'; }, si)); await sleep(2500); }
    await typeIn('#dm-av-' + si + '-Z', z.z, fast); await typeIn('#dm-ap-' + si + '-Z', z.y, fast);
    await clickEl('#dm-panel [data-act="add"][data-sheet="' + si + '"][data-group="Z"]', fast ? 250 : 600); typed++; await sleep(fast ? 150 : 400); }
  fact('heights_typed', String(typed)); await wheelTop(); await acceptY(); await sleep(800);
  const v3 = await verdict(); fact('after_heights_blocking', String(v3.blocking));
  // (c) what each CAD layer is: the types READ from the marked set's own @LAYER markings, chosen in the Layers section (the layers the set states; the others stay as they are)
  await beat('b10'); await frameSheet(names.find(n => /FLOOR_PLAN/i.test(n)) || names[0], 1.0, 1600);
  const stated = {}; names.forEach(n => { const f = markedOf(n); if (!f) return; readMarks(f).filter(m => /^@LAYER=/.test(m)).forEach(m => { const [l, t] = m.replace('@LAYER=', '').split(','); const role = { PLAN: 'plan', ELEV: 'elev', SECTION: 'section', ROOF: 'roof' }[roleOf[n]]; (stated[role + '|' + l] = stated[role + '|' + l] || new Set()).add(t); }); });
  fact('layers_to_state', String(Object.keys(stated).length));
  if (!(await pg.$('#dm-panel select[data-act="layer"]'))) await clickEl('#dm-panel [data-sec="layers"]', 700);
  const statedSheets = {}; names.forEach(n => { const f = markedOf(n); if (!f) return; readMarks(f).filter(m => /^@LAYER=/.test(m)).forEach(m => { const [l] = m.replace('@LAYER=', '').split(','); const role = { PLAN: 'plan', ELEV: 'elev', SECTION: 'section', ROOF: 'roof' }[roleOf[n]]; (statedSheets[role + '|' + l] = statedSheets[role + '|' + l] || new Set()).add(n); }); });
  const selOf = (role, layer, sheet) => '#dm-panel select[data-act="layer"][data-role="' + role + '"][data-layer="' + layer.replace(/"/g, '\\"') + '"]' + (sheet ? '[data-sheet="' + sheet + '"]' : ':not([data-sheet])');
  const pickSel = async (sel, ui, fast) => { await wheelTo(sel, { step: 120, pace: fast ? 25 : 60 }); await pointAt(sel, fast ? 240 : 650); await sleep(fast ? 80 : 300); await pg.select(sel, ui); await sleep(fast ? 100 : 250); await idle(); };
  let nLay = 0, nSplit = 0; for (const key of Object.keys(stated)) { const [role, layer] = key.split('|'), t = [...stated[key]]; if (t.length !== 1) { fact('layer_mixed', key); continue; } const ui = t[0] === 'elevdoor' ? 'door' : t[0], want = statedSheets[key], fast = true;
    const rowBtn = '[data-layer-row="' + role + '|' + layer + '"] [data-act="laysplit"]';
    if (await pg.$(rowBtn)) { if (!(await pg.$('[data-layer-row^="' + role + '|' + layer + '|"]'))) await clickEl(rowBtn, fast ? 250 : 600); }
    const all = await pg.evaluate((role, layer) => [...document.querySelectorAll('[data-layer-row^="' + role + '|' + layer + '|"]')].map(e => e.dataset.layerRow.split('|')[2]), role, layer);
    if (!all.length || (all.length === want.size && all.every(n => want.has(n)))) { if (!(await pg.$(selOf(role, layer)))) { fact('layer_missing', key); continue; } await pickSel(selOf(role, layer), ui, fast); }
    else for (const n of want) { if (!(await pg.$(selOf(role, layer, n)))) { fact('layer_missing', key + '|' + n); continue; } await pickSel(selOf(role, layer, n), ui, fast); nSplit++; }
    nLay++; }
  fact('layers_split_by_sheet', String(nSplit));
  fact('layers_stated', String(nLay)); const v4 = await verdict(); fact('after_layers_blocking', String(v4.blocking)); await sleep(1200);
  // (d) the body heights no elevation shows, READ from @BODYZ
  await beat('b11');
  const bz = {}; names.forEach(n => { const f = markedOf(n); if (!f) return; readMarks(f).filter(m => /^@BODYZ=/.test(m)).forEach(m => { const [kind, a, b] = m.replace('@BODYZ=', '').split(','); bz[kind] = [a, b]; }); });
  if (!(await pg.$('#dm-panel [data-bodyz]'))) { const h = await pg.$('#dm-panel [data-sec="bodyz"]'); if (h) await clickEl('#dm-panel [data-sec="bodyz"]', 700); }
  const waiting = await pg.evaluate(() => [...document.querySelectorAll('#dm-panel [data-bodyz]')].map(e => e.dataset.bodyz)); fact('bodyz_waiting', waiting);
  let nBz = 0; for (const kind of Object.keys(bz)) { if (!(await pg.$('#dm-bz-' + kind + '-0'))) continue; const fast = true; await wheelTo('#dm-bz-' + kind + '-0', { step: 120, pace: fast ? 25 : 60 });
    await typeIn('#dm-bz-' + kind + '-0', bz[kind][0], fast); await typeIn('#dm-bz-' + kind + '-1', bz[kind][1], fast); await clickEl('#dm-panel [data-act="bodyzadd"][data-kind="' + kind + '"]', fast ? 250 : 600); nBz++; await sleep(300); }
  fact('bodyz_typed', String(nBz)); const v5 = await verdict(); fact('after_bodyz_blocking', String(v5.blocking));
  // (e) one stray area excluded: a REAL drag with the Exclude tool on the beam plan, from the @EXCLUDE box of the marked set
  const ex = readMarks(markedOf('3_BEAM_LAYOUT.dxf')).find(m => /^@EXCLUDE=/.test(m)).replace('@EXCLUDE=', '').split(',').map(Number); fact('exclude_from_set', ex.join(','));
  const exStatus0 = await pg.$eval('#dxf-status', e => e.innerText.trim());
  if (!(await pg.$('#dm-panel [data-act="exsheet"]'))) await clickEl('#dm-panel [data-sec="excludes"]', 700);
  await wheelTo('#dm-panel [data-act="exsheet"]', { step: 120, pace: 40 }); await pick('#dm-panel [data-act="exsheet"]', '3_BEAM_LAYOUT.dxf'); await clickAt('#dm-panel [data-act="tool"][data-tool="exclude"]', 650); await sleep(300);
  const kz = await pg.evaluate(() => { const c = window.DxfImportUI.state.canvas['3_BEAM_LAYOUT.dxf']; return { k: c.k, z: c.z }; });
  // the excluded strip stands ~130 m from the build in empty space: frame the build AND the strip together (the canvas never goes empty), then drag with a 2 px margin
  await pg.evaluate(([ex, k, z]) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls, box = new T.Box3(), g = A.scene.children.find(o => o.name === 'dxf-sheets' && o.visible); if (g) box.setFromObject(g);
    box.expandByPoint(new T.Vector3(ex[0] * k, ex[1] * k, z)); box.expandByPoint(new T.Vector3(ex[2] * k, ex[3] * k, z));
    const ctr = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3()), r = Math.max(size.x, size.y, 0.5) * 0.5;
    const pr = ['dm-panel', 'dxf-panel'].map(id => document.getElementById(id)).filter(e => e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0).map(e => e.getBoundingClientRect().right), x0 = Math.max(0, ...pr), x1 = innerWidth - 70;
    const th = Math.tan(c.fov * Math.PI / 360), W = x1 - x0, dist = Math.max(r / th, r / (th * (W / innerHeight))) * 1.1 + r * 0.1, dir = new T.Vector3(0, -0.35, 1).normalize();
    const p0 = c.position.clone(), q0 = ctl.target.clone(); c.up.set(0, 0, 1); c.position.copy(ctr).addScaledVector(dir, dist); ctl.target.copy(ctr); ctl.update(); c.updateMatrixWorld();
    const ndcX = ((x0 + x1) / 2) / innerWidth * 2 - 1, hw = dist * th * c.aspect, sh = new T.Vector3().setFromMatrixColumn(c.matrixWorld, 0).multiplyScalar(-ndcX * hw), P1 = c.position.clone().add(sh), Q1 = ctl.target.clone().add(sh);
    c.position.copy(p0); ctl.target.copy(q0); ctl.update(); const t0 = performance.now();
    (function step() { const kk = Math.min(1, (performance.now() - t0) / 2200), s = kk < .5 ? 2 * kk * kk : 1 - Math.pow(-2 * kk + 2, 2) / 2; c.position.lerpVectors(p0, P1, s); ctl.target.lerpVectors(q0, Q1, s); ctl.update(); if (kk < 1) requestAnimationFrame(step); else res(); })(); }), [ex, kz.k, kz.z]);
  await sleep(500);
  const px = await pg.evaluate((ex, k, z) => { const A = window.A, T = window.THREE, cv = A.renderer.domElement.getBoundingClientRect(), f = (x, y) => { const v = new T.Vector3(x * k, y * k, z).project(A.camera); return [cv.left + (v.x + 1) / 2 * cv.width, cv.top + (1 - v.y) / 2 * cv.height]; }; return { a: f(ex[0], ex[1]), b: f(ex[2], ex[3]) }; }, ex, kz.k, kz.z);
  fact('exclude_px', { w: +Math.abs(px.b[0] - px.a[0]).toFixed(1), h: +Math.abs(px.b[1] - px.a[1]).toFixed(1) });
  const mg = 2; px.a[0] -= mg; px.a[1] += mg; px.b[0] += mg; px.b[1] -= mg;
  await moveTo(px.a[0], px.a[1], 700); await pg.mouse.down(); await sleep(150); await moveTo(px.b[0], px.b[1], 900); await sleep(150); await pg.mouse.up(); await sleep(300); fitCentre(0.9, 1600).catch(() => { }); await idle();   // back to the build alone while the facts are read
  fact('exclude_drawn', await pg.evaluate(() => window.DxfMetaEditor.state.sheets.flatMap(s => s.marks.filter(m => m.key === 'EXCLUDE').map(m => m.value)).join(' ')));
  const exStatus1 = await pg.$eval('#dxf-status', e => e.innerText.trim()); fact('bodies_before_exclude', ((/(\d+) bodies will be built/.exec(exStatus0)) || [])[1] || 'none'); fact('bodies_after_exclude', ((/(\d+) bodies will be built/.exec(exStatus1)) || [])[1] || 'none');
  const v6 = await verdict(); fact('after_exclude_blocking', String(v6.blocking)); await sleep(1200); await sleep(2200);

  await beat('b12');
  { const sh = '#dm-panel [data-act="sec"][data-sec="edefaults"]'; if (!(await pg.$('#dm-panel [data-edef="building.type"]'))) await clickEl(sh, 700);
    await pick('#dm-panel [data-edef="building.type"] select', 'Farming Shed'); await clickEl('#dm-panel [data-edef="building.type"] [data-act="edefset"]', 700); await sleep(1200); }
  fact('building_type', await pg.evaluate(() => { const R = window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.R, r = R && (R.defaults_table || []).find(x => x.key === 'building.type'); return r ? String(r.value) : 'none'; }));
  const before = fs.readdirSync(SAVED).length; await clickAt('#dm-save', 900); await sleep(3500);
  const saved = fs.readdirSync(SAVED).filter(f => /\.dxf$/i.test(f)); fact('saved_files', String(saved.length - before)); fact('saved_names', saved.slice(0, 3).join(','));
  fact('raw_unchanged', String(rawFiles.map(sha).every((h, i) => h === rawSha0[i])));
  const vS = await verdict(); fact('before_convert_chip', vS.chip);
  // ---- chapter 4 ONE SHED (rush) ----
  chapter(4, 'shed'); await beat('b13');
  await setFold(false);
  if (await pg.$('#dxf-complete')) { await clickAt('#dxf-complete', 700); await sleep(600); } fact('complete_ticked', String(await pg.evaluate(() => { const e = document.getElementById('dxf-complete'); return !!(e && e.checked); })));
  await clickAt('#dxf-convert', 800); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 }); await sleep(2500); await backdrop(4);
  { const L = await pg.evaluate(() => ({ n: window.DxfImportUI.state.last.nInserts, counts: window.DxfImportUI.state.last.counts })); fact('converted', String(L.n));
    const sum = re => Object.keys(L.counts).filter(k => re.test(k)).reduce((a, k) => a + L.counts[k], 0); ['Column', 'Beam', 'Footing', 'Wall', 'Door', 'Member', 'Plate'].forEach(k => fact('n_' + k.toLowerCase(), String(sum(new RegExp('Ifc' + k + '$'))))); }
  fact('door_gap_cuts', await pg.evaluate(() => window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_CUT' && /^door-gap:/.test((o.parameters.slide || {}).opening || '')).length));
  await clickAt('#dm-close', 600); await sleep(400); await fitCentre(1.15); orbitZ(40, 9000).catch(() => { }); await sleep(9500);
  // ---- chapter 5 ONE WALL, SMALL STEPS: the longest door-free wall (W-SHED-WALL-EDIT E0's rule), picked on the canvas with the pointer ----
  chapter(5, 'wall'); await beat('b14');
  const W = await pg.evaluate(() => { const g = window.Bonsai.group(), mesh = fid => g.children.find(m => m.isMesh && m.userData && m.userData.featureId === fid);
    const bb = fid => { const m = mesh(fid); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]; };
    window.__fb = bb; const ins = window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT'), cls = o => (o.parameters || {}).ifc_class;
    const doors = ins.filter(o => cls(o) === 'IfcDoor').map(o => bb(o.id)).filter(Boolean), walls = ins.filter(o => cls(o) === 'IfcWall').map(o => ({ id: o.id, b: bb(o.id), lb: o.parameters.bbox })).filter(w => w.b);
    const free = walls.filter(w => { const k = (w.b[3] - w.b[0]) >= (w.b[4] - w.b[1]) ? 0 : 1, j = 1 - k; return !doors.some(d => d[j + 3] >= w.b[j] - 0.05 && d[j] <= w.b[j + 3] + 0.05 && d[k + 3] >= w.b[k] - 1.5 && d[k] <= w.b[k + 3] + 1.5); });
    const foot = Math.min(...walls.map(w => w.b[2])), ground = free.filter(w => w.b[2] <= foot + 0.05);   // the brief: a ground wall (a gable piece sits under the roof's overhang)
    const len = w => Math.max(w.b[3] - w.b[0], w.b[4] - w.b[1]); ground.sort((a, b) => len(b) - len(a)); const w = ground[0], ld = [w.lb[1] - w.lb[0], w.lb[3] - w.lb[2], w.lb[5] - w.lb[4]];
    return { id: w.id, b: w.b, k: (w.b[3] - w.b[0]) >= (w.b[4] - w.b[1]) ? 0 : 1, len: +len(w).toFixed(3), localAxis: 'xyz'[ld.indexOf(Math.max.apply(null, ld))] }; });
  fact('wall_id', String(W.id)); fact('wall_len', W.len.toFixed(2));
  const wb = W.b, pad = 3, C0 = await pg.evaluate(() => { const T = window.THREE, b = new T.Box3(); window.Bonsai.group().children.forEach(m => { if (m.isMesh) b.union(new T.Box3().setFromObject(m)); }); const c = b.getCenter(new T.Vector3()); return [c.x, c.y]; });
  const j = 1 - W.k, out = ((wb[j] + wb[j + 3]) / 2) >= C0[j] ? 1 : -1, vd = W.k === 0 ? [0.25, out, 0.35] : [out, 0.25, 0.35];   // look at the wall from outside the shed, low, so no roof covers it
  await frameBox([wb[0] - pad, wb[1] - pad, wb[2], wb[3] + pad, wb[4] + pad, wb[5]], 1.0, 2200, vd); await sleep(600); await backdrop(5);
  fact('wall_side', (W.k === 0 ? (out > 0 ? '+y' : '-y') : (out > 0 ? '+x' : '-x')));
  const wc = await pg.evaluate(([b, k, out]) => { const j = 1 - k, p = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]; p[j] = out > 0 ? b[j + 3] : b[j]; p[2] = b[2] + (b[5] - b[2]) * 0.3; return window.__worldToClient(p[0], p[1], p[2]); }, [wb, W.k, out]);   // the outward face, mid length, low (under any eave)
  await moveTo(wc.x, wc.y, 900); await sleep(300); await pg.mouse.down(); await sleep(90); await pg.mouse.up(); await sleep(800);
  let sel = await pg.evaluate(() => Array.from(window.Bonsai._selSet || [])); if (sel.length !== 1 || sel[0] !== W.id) { const hc = await pg.evaluate(id => { const o = window.Bonsai.oplog._geomOps().find(q => q.id === id); return o ? o.parameters.ifc_class + ' ' + ((o.parameters.provenance || {}).dxf_handle || '') : '?'; }, sel[0]); fact('wall_pick', 'pointer picked ' + JSON.stringify(sel) + ' (' + hc + '): selected by id (stated)'); fact('pick_boxes', await pg.evaluate(([a, b]) => ({ hit: window.__fb(a), wall: window.__fb(b) }), [sel[0], W.id])); await pg.evaluate(id => window.Bonsai.select(id), W.id); } else fact('wall_pick', 'pointer');
  await clickAt('#b-move', 700); await sleep(700);
  const w0 = await pg.evaluate(id => window.__fb(id), W.id);
  const n0 = await pg.evaluate(() => window.Bonsai.oplog.length);
  { const r = await pointAt('#dim-move'); await sleep(250); await pg.mouse.click(r.x + Math.min(r.w / 2, 60), r.y + r.h / 2, { clickCount: 3 }); await sleep(250); await pg.keyboard.type('0.1', { delay: 110 }); await sleep(400);
    await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); await sleep(300); }
  await pg.keyboard.press(W.k === 0 ? 'ArrowRight' : 'ArrowUp'); await sleep(2200);
  const w1 = await pg.evaluate(id => window.__fb(id), W.id); fact('move_status', await stat()); fact('moved_m', (w1[W.k] - w0[W.k]).toFixed(3)); fact('moved_cm', String(Math.round((w1[W.k] - w0[W.k]) * 100))); { const g = await pg.evaluate(() => window.__lastGate || ''), r = (/(\d+) RED/.exec(g) || [])[1], o = (/(\d+) ORANGE/.exec(g) || [])[1]; fact('move_gate', g || 'clean'); fact('move_gate_pairs', await pg.evaluate(() => { const d = window.__lastGateDetail, ops = window.Bonsai.oplog._geomOps(), c = f => { const o = ops.find(q => q.id === +f); return o ? o.parameters.ifc_class : '?'; }; return d ? d.red.concat(d.orange).map(x => x.kind + ' ' + c(x.a) + '#' + x.a + '/' + c(x.b) + '#' + x.b) : []; }));
    fact('move_gate_words', r ? (r === '1' ? 'one red clash' : r + ' red clashes') : o ? (o === '1' ? 'one orange warning' : o + ' orange warnings') : 'nothing'); }
  await beat('b15');
  { const r = await pointAt('#dim-scale'); await sleep(250); await pg.mouse.click(r.x + Math.min(r.w / 2, 60), r.y + r.h / 2, { clickCount: 3 }); await sleep(250); await pg.keyboard.type(W.localAxis + '1.05', { delay: 110 }); await sleep(350); await pg.keyboard.press('Enter'); await sleep(2600); }
  const w2 = await pg.evaluate(id => window.__fb(id), W.id); fact('scale_status', await stat()); fact('len_after', (Math.max(w2[3] - w2[0], w2[4] - w2[1])).toFixed(3)); fact('len_before', (Math.max(w1[3] - w1[0], w1[4] - w1[1])).toFixed(3));
  await beat('b16');
  const nOps = (await pg.evaluate(() => window.Bonsai.oplog.length)) - n0; fact('wall_ops', String(nOps)); if (nOps !== 2) throw new Error('the wall edit made ' + nOps + ' ops (want 2: move, scale)');
  await keyCtl('z'); fact('undo1_status', await stat()); await keyCtl('z'); fact('undo2_status', await stat());
  const w3 = await pg.evaluate(id => window.__fb(id), W.id); fact('undo_back_m', Math.max(...w3.map((v, i) => Math.abs(v - w0[i]))).toFixed(4));
  await keyCtl('y'); await keyCtl('y'); const w4 = await pg.evaluate(id => window.__fb(id), W.id); fact('redo_back_m', Math.max(...w4.map((v, i) => Math.abs(v - w2[i]))).toFixed(4));
  await pg.keyboard.press('Escape'); await sleep(500);
  // ---- chapter 6 ONE MORE BAY ----
  chapter(6, 'bay'); await beat('b17');
  await setFold(false); await fitCentre(1.15, 1800); await sleep(400);
  if (!(await pg.$('#dxf-bay-max'))) throw new Error('no "Add a bay" row: the building type is ' + JSON.stringify(await pg.evaluate(() => window.DxfImportUI.bayRule && window.DxfImportUI.bayRule().type)));
  fact('bay_button', await pg.$eval('#dxf-bay-max', e => e.textContent.trim()));
  const nBayLog = logHas(/§DXF-BAY (committed|plan end=\S+ ok=false|refused)/).length;
  await pg.$eval('#dxf-bay-max', e => e.scrollIntoView({ block: 'center' })); await sleep(500); await clickAt('#dxf-bay-max', 900);
  for (let g = 0; g < 240 && logHas(/§DXF-BAY (committed|plan end=\S+ ok=false|refused)/).length === nBayLog; g++) await sleep(500);
  const bayOut = logHas(/§DXF-BAY (committed|plan end=\S+ ok=false|refused)/).slice(nBayLog)[0] || 'no §DXF-BAY outcome in 120 s'; fact('bay_outcome', bayOut);
  if (!/committed/.test(bayOut)) throw new Error('add a bay did not commit: ' + bayOut + ' | status ' + await pg.$eval('#dxf-status', e => e.innerText.trim()).catch(() => '')); await sleep(2500); await backdrop(6);
  const B = await pg.evaluate(() => { const L = window.DxfImportUI.state.lastBay; return { ok: L.plan.ok, copies: L.plan.copied.length, moved: L.plan.moved.length, riders: (L.plan.riders || []).length, stretched: L.plan.stretched.length,
    hinge: L.plan.hingeLabel, pitch: L.plan.pitch, cost: L.cost, gate: L.res.gate || 'clean', cur: (window._TRL && window._TRL.cur) || '' }; });
  Object.keys(B).forEach(k => fact('bay_' + k, typeof B[k] === 'object' ? B[k] : String(B[k])));
  fact('bay_added', B.cost ? B.cost.added : 'none'); fact('bay_changed', B.cost ? B.cost.changed : 'none'); fact('bay_total', B.cost ? B.cost.total : 'none'); fact('bay_gate_words', B.gate === 'clean' ? 'clean' : B.gate); fact('bay_cur_words', ({ USD: 'US dollars', BDT: 'taka', MYR: 'ringgit', GBP: 'pounds', EUR: 'euros', SGD: 'Singapore dollars', AUD: 'Australian dollars' })[B.cur] || B.cur); fact('bay_status', await pg.$eval('#dxf-status', e => e.innerText.trim()).catch(() => ''));
  { const P = await pg.evaluate(() => { const L = window.DxfImportUI.state.lastBay; return { to: L.plan.copied.map(c => c.to).filter(x => x != null), cls: L.plan.copied.map(c => c.cls), st: L.plan.stretched.map(x => x.cls), lines: (L.cost && L.cost.lines) || [] }; });
    const NAME = { IfcBeam: ['beam', 'beams'], IfcColumn: ['column', 'columns'], IfcFooting: ['footing', 'footings'], IfcMember: ['member', 'members'], IfcPlate: ['roof sheet', 'roof sheets'], IfcWall: ['wall', 'walls'], IfcSlab: ['floor slab', 'floor slabs'], IfcRoof: ['roof', 'roofs'], IfcCovering: ['covering', 'coverings'] };
    const words = list => { const o = {}; list.forEach(c => { o[c] = (o[c] || 0) + 1; }); const ks = Object.keys(o).sort(), w = ks.map(k => o[k] + ' ' + (NAME[k] ? NAME[k][o[k] === 1 ? 0 : 1] : k.replace(/^Ifc/, '').toLowerCase())); return w.length > 1 ? w.slice(0, -1).join(', ') + ' and ' + w[w.length - 1] : w.join(''); };
    fact('copied_words', words(P.cls)); fact('stretched_words', words(P.st)); fact('cost_lines', String(P.lines.length));
    await setFold(true); await sleep(300);
    const nb = await pg.evaluate(ids => { const g = window.Bonsai.group(), T = window.THREE, b = new T.Box3(); g.children.forEach(m => { if (m.isMesh && ids.indexOf(m.userData.featureId) >= 0) b.union(new T.Box3().setFromObject(m)); }); return b.isEmpty() ? null : [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]; }, P.to);
    await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); await pg.keyboard.press('x'); await sleep(900);   // X = x-ray (the product's key)
    fact('xray', String(await pg.evaluate(() => { const b = document.getElementById('b-xray'); return !!(b && (b.classList.contains('on') || b.getAttribute('aria-pressed') === 'true')); })));
    await pg.evaluate(ids => window.Bonsai.selectMany(ids), P.to); fact('tinted', String(P.to.length));   // stated: the copies are selected so their tint shows each part the bay added
    if (nb) { await frameBox(nb, 1.25, 2200, [1, -1.1, 0.75]); await orbitZ(35, 7000); } }
  await beat('b18'); await setFold(false); await sleep(400);
  // the cost table, row by row (the pointer rests on each line while it is told), then where the rates live
  { await pg.$eval('#dxf-bay-detail', e => e.scrollIntoView({ block: 'center' })).catch(() => {}); await sleep(500);
    const nRows = await pg.$$eval('#dxf-bay-cost tr[data-line]', rs => rs.length);
    for (let i = 0; i < nRows; i++) { const [x, y] = await pg.evaluate(i => { const r = document.querySelectorAll('#dxf-bay-cost tr[data-line]')[i]; r.scrollIntoView({ block: 'nearest' }); const b = r.getBoundingClientRect(); return [b.left + b.width * 0.6, b.top + b.height / 2]; }, i); await moveTo(x, y, 420); await sleep(650); } fact('rates_name', await pg.evaluate(() => (window.RATE_TEMPLATE_META || {}).name || 'none')); fact('rates_label', await pg.$eval('#dxf-bay-detail', e => ((/Rates: [^\n]*/.exec(e.innerText) || [])[0] || '')).catch(() => '')); }
  await beat('b18r');
  { // Edit rates opens the Viewer's rate editor in a new tab: the screencast follows it (a second CDP session, the same frame list), then comes back
    const tgt = new Promise(r => br.once('targetcreated', t => r(t)));
    await pg.$eval('#dxf-bay-rates', e => e.scrollIntoView({ block: 'center' })); await sleep(400); await clickAt('#dxf-bay-rates', 800);
    const t2 = await Promise.race([tgt, sleep(20000).then(() => null)]); if (!t2) throw new Error('Edit rates opened no tab in 20 s (' + (logHas(/§DXF-BAY edit-rates/).slice(-1)[0] || 'no §DXF-BAY edit-rates line') + ')');
    const np = await t2.page(); await np.setViewport({ width: 1440, height: 810, deviceScaleFactor: 4 / 3 });
    await cdp.send('Page.stopScreencast'); const cdp2 = await np.createCDPSession();
    cdp2.on('Page.screencastFrame', async ev => { const f = path.join(FR, String(nf++).padStart(6, '0') + '.jpg'); fs.writeFileSync(f, Buffer.from(ev.data, 'base64')); frames.push({ f, ts: ev.metadata.timestamp }); try { await cdp2.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) { } });
    await cdp2.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    const vlog = []; np.on('console', m => vlog.push(m.text())); np.on('pageerror', e => console.log('§PAGEERR viewer ' + String(e).slice(0, 300)));
    await np.waitForFunction(p => { const e = document.getElementById('json-editor-rates_' + p); return !!e && e.getBoundingClientRect().width > 0; }, { timeout: 120000 }, RATES).catch(() => {});
    const ed = await np.evaluate(() => { const r = document.querySelector('[data-row-id="materials/IfcColumn"]'); if (!r) return null; r.scrollIntoView({ block: 'center' }); r.style.outline = '2px solid #ffd640'; r.style.outlineOffset = '2px'; const i = r.querySelector('input'); return { value: i ? i.value : '', pack: window.RATE_TEMPLATE_NAME, meta: (window.RATE_TEMPLATE_META || {}).name || '' }; });
    fact('rates_editor', ed || 'not open'); { let r = null; try { r = JSON.parse(ed.value).rate; } catch (e) { } fact('col_rate', r != null ? String(r) : 'none'); } fact('rates_link_log', vlog.find(t => /§EDIT_RATES_LINK/.test(t)) || 'none');   // the outline: a film overlay (stated) on the row the narration names
    await sleep(Math.max(4000, ((BEAT_MIN.b18r || 10) - 4) * 1000));
    await cdp2.send('Page.stopScreencast'); await np.close(); await pg.bringToFront(); await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 }); await sleep(600); }
  await setFold(true); await fitCentre(1.1, 1500); await orbitZ(50, 8000);
  // ---- chapter 7 THE MARKED SHEET, then the prior-art card ----
  chapter(7, 'print'); await beat('b19');
  await setFold(false);
  const dmShown = () => pg.evaluate(() => { const e = document.getElementById('dm-panel'); return !!(e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0); });
  if (!(await dmShown())) { await clickAt('#dxf-meta', 700); await sleep(800); await idle(); }   // the 2D panel's Metadata button reopens the editor
  if (await dmShown()) { await openSheet(fp); await backdrop(7); const n0 = fs.readdirSync(SAVED).length; await clickAt('#dsf-svg', 800); await sleep(2500);
    const svg = fs.readdirSync(SAVED).filter(f => /\.svg$/i.test(f)); fact('svg_saved', svg.length ? svg[0] + ' ' + fs.statSync(path.join(SAVED, svg[0])).size + ' B' : 'none'); await moveTo(900, 300, 1200); await sleep(2500); }
  else fact('svg_saved', 'editor not open: skipped');
  await beat('b20');
  await card('<div style="font-size:15px;letter-spacing:.2em;color:#9fb4c8;margin-bottom:18px">PRIOR ART</div><div style="max-width:980px;font-size:22px;line-height:1.6">' + esc(paText) + '</div><div style="margin-top:22px;font-size:14px;color:#8a93a0">from the DXF2BIM guide, section Prior art</div>');
  await sleep(1500);
  await beat('end'); await hold(); await sleep(600);
  fact('walker_lines', String(logHas(/§DW[A-Z_-]*\b|§STRWALK|§MEP[-_ ]WALK|§DISC-WALK/).filter(t => !/module loaded|registered|wrapped/.test(t)).length));   // boot lines (a module loaded, a category registered) are not a walk
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
  fs.writeFileSync(path.join(OUT, 'backdrops.txt'), chapLog.filter(([n]) => n <= 7).map(([n]) => 'c' + n + ' ' + path.join(OUT, 'bd' + n + '.png')).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'page.log'), plog.join('\n'));
  fs.rmSync(FR, { recursive: true, force: true });
  console.log('§FILM_REC sec=' + (frames[frames.length - 1].ts - t0 + 1).toFixed(1) + ' out=' + path.join(OUT, 'film.mp4'));
})().catch(e => { console.log('§FILM_REC_ERROR ' + (e && e.stack || e)); process.exit(1); });
