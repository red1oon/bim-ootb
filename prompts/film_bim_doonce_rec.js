#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope: prompts/FILM_BIM_DO_ONCE_REUSE_FOREVER.md "### RECORDER SPEC": the film "BIM - The Untold Story of Do Once, Reuse Forever" (chapters 0, 0a, 0c, 0d, 0b, 1-9): three charts (stills, CSS blow-ups on the one page timeline),
// then ONE note of the converted shed followed through every reuse (property, price, checks, IFC, analytical model, any other IFC). LIVE recorder: the Modeller (SITE= a local server), REAL clicks / typing / wheel / file chooser; pages' state is READ for facts only.
// spot()/chartSpot() = a REAL screenshot / the chart's own pixels, enlarged with a one-line caption; every one logs §FILM_SPOT <id>. Every number the narration or a caption quotes is a §FILM_FACT line of THIS take (chart dates are the charts' cited sources).
// Private-name blur on the Sheet view (FILM_PRIVATE_RE at run time, never written here). READ take.log after every run: §PAGEERR, §FILM_GAP, a missing fact or walker_lines > 0 = not a take.
// NEVER run the real take on the GPU without the owner's go (FILM_GL=swiftshader = the CPU dry run). Voices for the fit: FILM_VOX_F=af_kore FILM_VOX_M=am_onyx FILM_VOX_SPEED=0.92 (BIMCompiler film/vox-switch).
// usage: [FILM_GL=swiftshader] SHED_RAW_DIR=<9 raw sheets> [SHED_MARKED_DIR=<9 CLI-marked sheets>] SITE=<modeller.html> node prompts/film_bim_doonce_rec.js <take dir> [beat_min.json] > <take dir>.log
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const OUT = path.resolve(process.argv[2] || '.'), BEAT_MIN = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};
const SITE = process.env.SITE || 'https://red1oon.github.io/bim-ootb/modeller/modeller.html';
const RATES = process.env.FILM_RATES || 'pwd2024_bd', SITE_R = SITE + (SITE.indexOf('?') < 0 ? '?' : '&') + 'rates=' + RATES;
const PRIV = process.env.FILM_PRIVATE_RE ? new RegExp(process.env.FILM_PRIVATE_RE, 'i') : null;   // a private client name, given at run time (never written in this file)
const RAW = process.env.SHED_RAW_DIR || '', MARKED = process.env.SHED_MARKED_DIR || path.join(process.env.HOME, 'Videos/dxf2bim_film_work/why/cli/marked');
const SWIFT = process.env.FILM_GL === 'swiftshader';   // CPU dry run: no GPU, no NVIDIA env
const dxfs = d => fs.readdirSync(d).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(d, f));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GPU_ENV = Object.assign({}, process.env, { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' });
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const num = s => { const m = /-?[\d,]+(?:\.\d+)?/.exec(String(s || '')); return m ? m[0] : 'none'; };   // "5,402.1 kN" -> "5,402.1" (the page's own grouping, verbatim)

(async () => {
  if (!RAW || dxfs(RAW).length !== 9) throw new Error('SHED_RAW_DIR must hold the 9 raw sheets (private material, given by env; only sha-checked)');
  if (!fs.existsSync(MARKED) || dxfs(MARKED).length !== 9) throw new Error('SHED_MARKED_DIR must hold the 9 CLI-marked sheets: ' + MARKED);
  fs.mkdirSync(OUT, { recursive: true });
  const br = SWIFT ? await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1440,810'] })
    : await puppeteer.launch({ headless: 'new', env: GPU_ENV, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--window-size=1440,810'] });
  console.log('§FILM_GL ' + (SWIFT ? 'swiftshader (CPU dry run)' : 'GPU gl-egl'));
  const VP = { width: 1440, height: 810, deviceScaleFactor: 4 / 3 };   // browser zoom 133 %: small text legible in a 1920 x 1080 frame
  let pg = await br.newPage(); await pg.setViewport(VP);
  const plog = []; pg.on('console', m => { const t = m.text(); plog.push(t); if (/§LOAD_SUMMARY|§REG_REPORT|PAGEERR|§GATE /.test(t)) console.log(t.slice(0, 300)); });
  pg.on('pageerror', e => console.log('§PAGEERR ' + String(e).slice(0, 300)));
  const ptrInit = () => { const mk = () => { if (document.getElementById('film-ptr')) return; const d = document.createElement('div'); d.id = 'film-ptr';
      d.style.cssText = 'position:fixed;left:-50px;top:-50px;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,214,64,.95);border:2px solid #14161c;box-shadow:0 0 0 2px rgba(255,214,64,.45);z-index:2147483647;pointer-events:none;transition:transform .12s';
      document.documentElement.appendChild(d);
      document.addEventListener('mousemove', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
      document.addEventListener('mousedown', e => { d.style.transform = 'scale(.7)'; const r = document.createElement('div'); r.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid rgba(255,214,64,.95);z-index:2147483646;pointer-events:none;transition:all .6s;opacity:1';
        document.documentElement.appendChild(r); requestAnimationFrame(() => { r.style.width = r.style.height = '54px'; r.style.margin = '-27px 0 0 -27px'; r.style.opacity = '0'; }); setTimeout(() => r.remove(), 650); }, true);
      document.addEventListener('mouseup', () => { d.style.transform = ''; }, true); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk(); };
  await pg.evaluateOnNewDocument(ptrInit);
  let cdp = await pg.createCDPSession();
  const SAVED = path.join(OUT, 'saved'); fs.rmSync(SAVED, { recursive: true, force: true }); fs.mkdirSync(SAVED, { recursive: true });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVED }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVED }));
  const fact = (k, v) => console.log('§FILM_FACT ' + k + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  const gap = (k, why) => console.log('§FILM_GAP ' + k + ' ' + why);
  const FR = path.join(OUT, 'frames'); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
  const frames = []; let nf = 0, lastDim = '';
  const SC = { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 };
  const onFrame = c => async ev => { const f = path.join(FR, String(nf++).padStart(6, '0') + '.jpg'); fs.writeFileSync(f, Buffer.from(ev.data, 'base64')); frames.push({ f, ts: ev.metadata.timestamp });
    const dim = ev.metadata.deviceWidth + 'x' + ev.metadata.deviceHeight; if (dim !== lastDim) { lastDim = dim; console.log('§FILM_FRAME_SIZE n=' + nf + ' device=' + dim + ' scale=' + ev.metadata.pageScaleFactor); }
    try { await c.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) { } };
  cdp.on('Page.screencastFrame', onFrame(cdp));
  const beatLog = [], chapLog = []; let beatStart = 0, beatId = null; const now = () => Date.now() / 1000;
  const hold = async () => { if (beatId) { const need = (BEAT_MIN[beatId] || 5) + 0.8 - (now() - beatStart); if (need > 0) await sleep(need * 1000); } };
  let chapNext = null;
  const beat = async id => { await hold(); beatId = id; beatStart = now(); beatLog.push([id, beatStart]); if (chapNext) { chapLog.push([chapNext[0], chapNext[1], beatStart]); chapNext = null; } console.log('§FILM_BEAT_AT ' + id); };
  const chapter = (n, key) => { chapNext = [n, key]; };
  const backdrop = n => pg.screenshot({ path: path.join(OUT, 'bd' + n + '.png') });
  const CARD_CSS = 'position:fixed;inset:0;z-index:2147483645;background:#14161c;color:#F3EEE8;display:flex;flex-direction:column;align-items:center;justify-content:center;font:21px/1.5 DejaVu Sans,sans-serif;text-align:center;padding:24px';
  const card = html => pg.evaluate((h, css) => { let c = document.getElementById('film-card'); if (!c) { c = document.createElement('div'); c.id = 'film-card'; c.style.cssText = css; document.body.appendChild(c); } c.innerHTML = h; c.style.display = 'flex'; const p = document.getElementById('film-ptr'); if (p) p.style.visibility = 'hidden'; }, html, CARD_CSS);
  const uncard = () => pg.evaluate(() => { const c = document.getElementById('film-card'); if (c) c.style.display = 'none'; const p = document.getElementById('film-ptr'); if (p) p.style.visibility = ''; });
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
  const orbitZ = (deg, ms) => pg.evaluate((deg, ms) => new Promise(res => { const A = window.A, T = window.THREE, ctl = A.controls, c = A.camera, o = ctl.target.clone(), v0 = c.position.clone().sub(o), t0 = performance.now();
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.copy(o).add(v0.clone().applyAxisAngle(new T.Vector3(0, 0, 1), deg * Math.PI / 180 * s)); ctl.update();
        if (k < 1) requestAnimationFrame(step); else res(); })(); }), deg, ms);
  const fresh = async () => { await pg.goto(SITE_R, { timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    await sleep(1200); if (!(await pg.evaluate(() => document.body.classList.contains('ol-collapsed')))) { await clickAt('#ol-collapse', 500); await sleep(600); } await moveTo(900, 500, 300); };
  const openSet = async (files) => { await clickAt('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true }); await sleep(700);
    const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 30000 }), clickAt('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction(n => window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length === n && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict, { timeout: 300000, polling: 100 }, files.length); };
  const logHas = re => plog.filter(t => re.test(t));
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
  const fpIndex = () => pg.evaluate(() => window.DxfMetaEditor.state.sheets.findIndex(s => /FLOOR_PLAN/.test(s.name)));
  const openSheet = async (si) => { const BTN = '#dm-panel [data-act="sheetview"][data-sheet="' + si + '"]';
    for (let g = 0; g < 4 && !(await pg.$(BTN)); g++) { if (!(await pg.$('#dm-body [data-act="card"][data-sheet="' + si + '"]'))) { await clickAt('#dm-body [data-act="sec"][data-sec="sheets"]', 600); await sleep(500); }
      if (await pg.$('#dm-body [data-act="card"][data-sheet="' + si + '"]')) await clickEl('#dm-panel [data-act="card"][data-sheet="' + si + '"]', 700); await sleep(500); }
    for (let g = 0; g < 3; g++) { await clickAt(BTN, 800); try { await pg.waitForSelector('#dxf-sheet-frame', { timeout: 15000 }); break; } catch (e) { console.log('§FILM_DIAG openSheet retry ' + g + ' ' + JSON.stringify(await pg.evaluate(b => { const e = document.querySelector(b); const r = e && e.getBoundingClientRect(); const t = r && document.elementFromPoint(r.left + 10, r.top + r.height / 2); return [!!e, r && [r.left, r.top, r.width, r.height], t && (t.id || t.className || t.tagName)]; }, BTN))); await pg.screenshot({ path: path.join(OUT, 'diag_open' + g + '.png') }); } }
    await pg.waitForSelector('#dxf-sheet-frame', { timeout: 15000 }); await sleep(1200); await blurPrivate(); await sleep(300); };
  const closeSheet = async () => { await pg.evaluate(() => document.querySelectorAll('.film-blur').forEach(e => e.remove())); if (await pg.$('#dsf-close')) { await clickAt('#dsf-close', 600); await sleep(700); } };
  // a film overlay (stated): a blur over each text the Sheet view draws that matches FILM_PRIVATE_RE, at the renderer's own place (dxf_sheet_view.js: x = w/2 + (x - cx) s, font max(6, h s))
  const blurPrivate = async (quiet) => { if (!PRIV) { if (!quiet) fact('blurred_texts', 'no FILM_PRIVATE_RE'); return 0; }
    const n = await pg.evaluate(src => { const re = new RegExp(src, 'i'), st = window.DxfSheetFrame.state, cv = st.el && st.el.querySelector('canvas'); if (!cv || !st.view || !st.last) return -1;
      document.querySelectorAll('.film-blur').forEach(e => e.remove()); const cr = cv.getBoundingClientRect(), w = cv.clientWidth, h = cv.clientHeight, v = st.view, c2 = document.createElement('canvas').getContext('2d'); let k = 0;
      // §D101 D5 (owner: "just blur and no need to explain"): ONE blur region = the union of the matched texts' boxes + padding; no outline, no label, no tint
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      st.last.list.filter(d => d.k === 'text' && re.test(d.s)).forEach(d => { const px = Math.max(6, d.h * v.s); c2.font = px + 'px sans-serif'; const tw = c2.measureText(d.s).width;
        const ax = cr.left + w / 2 + (d.p[0] - v.cx) * v.s, ay = cr.top + h / 2 - (d.p[1] - v.cy) * v.s, L = d.mid ? ax - tw / 2 : ax, T = d.mid ? ay - px / 2 : ay - px;
        x0 = Math.min(x0, L); y0 = Math.min(y0, T); x1 = Math.max(x1, L + tw); y1 = Math.max(y1, T + px * 1.3); k++; });
      if (k) { const pad = 10, b = document.createElement('div'); b.className = 'film-blur';
        b.style.cssText = 'position:fixed;left:' + (x0 - pad) + 'px;top:' + (y0 - pad) + 'px;width:' + (x1 - x0 + 2 * pad) + 'px;height:' + (y1 - y0 + 2 * pad) + 'px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:6px;z-index:2147483600;pointer-events:none';
        document.body.appendChild(b); }
      return k; }, PRIV.source);
    if (quiet) return n;
    fact('blurred_texts', String(n)); fact('blur_regions', String(await pg.evaluate(() => document.querySelectorAll('.film-blur').length))); fact('blur_labels', String(await pg.evaluate(() => [...document.querySelectorAll('.film-blur')].filter(e => e.textContent.trim()).length))); return n; };
  const frameBox = (box, fill, ms, dir) => pg.evaluate(([box, fill, ms, dir]) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls;
      const ctr = new T.Vector3((box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2), r = Math.max(box[3] - box[0], box[4] - box[1], (box[5] - box[2]) * 2, 0.5) * 0.5;
      const pr = ['dm-panel', 'dxf-panel'].map(id => document.getElementById(id)).filter(e => e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0).map(e => e.getBoundingClientRect().right), x0 = Math.max(0, ...pr), x1 = innerWidth - 70;
      const th = Math.tan(c.fov * Math.PI / 360), W = x1 - x0, dist = Math.max(r / th, r / (th * (W / innerHeight))) * fill + r * 0.1, d = new T.Vector3(dir[0], dir[1], dir[2]).normalize();
      const p0 = c.position.clone(), q0 = ctl.target.clone(); c.up.set(0, 0, 1); c.position.copy(ctr).addScaledVector(d, dist); ctl.target.copy(ctr); ctl.update(); c.updateMatrixWorld();
      const ndcX = ((x0 + x1) / 2) / innerWidth * 2 - 1, hw = dist * th * c.aspect, sh = new T.Vector3().setFromMatrixColumn(c.matrixWorld, 0).multiplyScalar(-ndcX * hw), P1 = c.position.clone().add(sh), Q1 = ctl.target.clone().add(sh);
      c.position.copy(p0); ctl.target.copy(q0); ctl.update(); const t0 = performance.now();
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.lerpVectors(p0, P1, s); ctl.target.lerpVectors(q0, Q1, s); ctl.update(); if (k < 1) requestAnimationFrame(step); else res(); })(); }), [box, fill, ms, dir || [1, -1, 1.1]]);
  const setFold = async want => { const slim = await pg.evaluate(() => !!window.DxfImportUI.state.slim); if (slim !== want) { await clickAt('#dxf-fold', 500); await sleep(500); } };   // the 2D panel folded (true) or open (false), whatever it was
  const rawFiles = dxfs(RAW), sha = f => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16), rawSha0 = rawFiles.map(sha);
  const stat = () => pg.$eval('#stat', e => e.innerText.trim()).catch(() => '');

  // ---- a new tab (Load Summary, Regulatory Report): the screencast follows it, same frame list, then comes back ----
  const inTab = async (kind, trigger, body, waitMs) => {
    const tgt = new Promise(res => { const h = t => { if (t.type() === 'page') { br.off('targetcreated', h); res(t); } }; br.on('targetcreated', h); });
    await trigger();
    const t2 = await Promise.race([tgt, sleep(waitMs || 30000).then(() => null)]); if (!t2) throw new Error(kind + ' opened no tab in ' + (waitMs || 30000) / 1000 + ' s');
    const np = await t2.page(); await np.setViewport(VP); const nlog = []; np.on('console', m => nlog.push(m.text())); np.on('pageerror', e => console.log('§PAGEERR ' + kind + ' ' + String(e).slice(0, 300)));
    console.log('§FILM_TAB open ' + kind + ' ' + (/^blob:/.test(np.url()) ? 'blob' : np.url().replace(/^https?:\/\/[^/]+/, '')));
    await cdp.send('Page.stopScreencast'); const cdp2 = await np.createCDPSession(); cdp2.on('Page.screencastFrame', onFrame(cdp2)); await cdp2.send('Page.startScreencast', SC);
    await np.evaluate(ptrInit).catch(() => { });
    try { await body(np, nlog); } finally {
      await cdp2.send('Page.stopScreencast'); await np.close(); console.log('§FILM_TAB close ' + kind + ' logs_caught=' + nlog.length + (nlog.length ? ' first=' + nlog[0].slice(0, 120) : ''));
      await pg.bringToFront(); await cdp.send('Page.startScreencast', SC); await sleep(600); } };
  // the tab page's own pointer + wheel (its own position state)
  const mkTab = np => { let x = 720, y = 405;
    const move = async (tx, ty, ms = 600) => { const steps = Math.max(8, Math.round(ms / 22)); for (let i = 1; i <= steps; i++) { const k = i / steps, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await np.mouse.move(x + (tx - x) * e, y + (ty - y) * e); await sleep(ms / steps); } x = tx; y = ty; };
    // wheel until the heading whose text matches `re` sits ~70 px under the top (or the page end)
    const toHead = async (re, tag) => { await move(760, 420, 400);
      for (let g = 0; g < 200; g++) { const top = await np.evaluate((src, tag) => { const h = [...document.querySelectorAll(tag || 'h2')].find(e => new RegExp(src).test(e.innerText)); return h ? h.getBoundingClientRect().top : null; }, re.source, tag);
        if (top === null) return false; if (Math.abs(top - 70) < 12) return true; const st = await np.evaluate(() => [scrollY, document.documentElement.scrollHeight - innerHeight]);
        if ((top > 70 && st[0] >= st[1] - 1) || (top < 70 && st[0] <= 0)) return true; await np.mouse.wheel({ deltaY: Math.sign(top - 70) * Math.min(110, Math.abs(top - 70)) }); await sleep(60); } return false; };
    return { move, toHead, text: () => np.evaluate(() => document.body.innerText) }; };
  // a wide text line cannot be enlarged inside a 1440 px frame, so the tab is shown at real browser zoom (viewport 1440/z x 810/z, device scale x z): the same DOM, laid out larger; then the viewport is put back
  const tabRect = (np, kind) => np.evaluate(kind => {
    const U = rs => { rs = rs.filter(q => q.width > 1 && q.height > 1); const x0 = Math.min(...rs.map(q => q.left)), y0 = Math.min(...rs.map(q => q.top)), x1 = Math.max(...rs.map(q => q.right)), y1 = Math.max(...rs.map(q => q.bottom)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
    const rr = e => { const g = document.createRange(); g.selectNodeContents(e); return [...g.getClientRects()]; };
    if (kind === 'cert') { const re = /It is not a compliance certificate/; let best = null; document.querySelectorAll('body *').forEach(e => { if (re.test(e.innerText || '') && (!best || e.innerText.length < best.innerText.length)) best = e; }); if (!best) return null; const r = U(rr(best)); r.t = best.innerText.replace(/\s+/g, ' ').slice(0, 160); return r; }
    if (kind === 'missing') { const m = document.getElementById('missing'); if (!m) return null; const li = [...m.querySelectorAll('li')].find(l => /Soil bearing capacity/.test(l.innerText)) || m.querySelector('li'), h = m.previousElementSibling; const r = U(rr(li).concat(h && /^H/.test(h.tagName) ? rr(h) : [])); return { x: r.x - 8, y: r.y - 6, w: r.w + 16, h: r.h + 12 }; }
    if (kind === 'sor') { const th = [...document.querySelectorAll('th')].find(e => /^SoR item/.test(e.innerText)); if (!th) return null; const tb = th.closest('table'), rows = [...tb.querySelectorAll('tr')].filter(q => q.querySelector('th') || /^07\.3\.[12]/.test(q.innerText.trim())); if (!rows.some(q => /^07\.3\.1/.test(q.innerText.trim()))) return null; return U(rows.map(q => q.getBoundingClientRect())); }
    return null; }, kind);
  const spotTab = async (np, id, kind, caption, ms, z) => {
    await np.setViewport({ width: Math.round(1440 / z), height: Math.round(810 / z), deviceScaleFactor: (4 / 3) * z }); await np.mouse.move(360, 300); await sleep(700);
    let r = await tabRect(np, kind); if (!r) throw new Error('spotTab ' + id + ': no element ' + kind); const vh = Math.round(810 / z);
    for (let g = 0; g < 60 && (r.y < 40 || r.y + Math.min(r.h, vh * 0.6) > vh - 20); g++) { await np.mouse.wheel({ deltaY: Math.sign(r.y - vh * 0.25) * Math.min(160, Math.max(40, Math.abs(r.y - vh * 0.25))) }); await sleep(80); r = await tabRect(np, kind); }
    await sleep(900); console.log('§FILM_ZOOM ' + id + ' browser_zoom=' + z + ' rect=' + [r.x, r.y, r.w, r.h].map(v => v.toFixed(0)).join(','));
    await spot(np, id, r, caption, ms); await np.setViewport(VP); await np.mouse.move(760, 420); await sleep(500); return r; };
  // the report's sections, from its own text: "N. Title VERDICT" opens section N
  const sections = txt => { const out = {}, L = txt.split('\n'); let k = null; L.forEach(l => { const m = /^(\d)\. (.*)$/.exec(l); if (m) { k = m[1]; out[k] = { head: m[2], body: [] }; } else if (k) out[k].body.push(l); }); return out; };
  const row = (sec, re) => (sec.body.find(l => re.test(l)) || '').split('\t');

  // ---- the spotlight (film-only device, stated): a REAL screenshot of an element's rect, enlarged on a dark backdrop with a one-line caption, then removed ----
  const spotLog = []; fs.mkdirSync(path.join(OUT, 'spots'), { recursive: true });
  const SPOT_MAX = 2.0;   // target ~2x, capped by what fits the frame
  const spot = async (P, id, rc, caption, holdMs) => {
    const vp = await P.evaluate(() => [innerWidth, innerHeight]), pad = 6;
    const x = Math.max(0, rc.x - pad), y = Math.max(0, rc.y - pad), w = Math.min(vp[0] - x, rc.w + 2 * pad), h = Math.min(vp[1] - y, rc.h + 2 * pad);
    if (w < 8 || h < 8) throw new Error('spot ' + id + ': rect off screen ' + JSON.stringify(rc));
    await P.evaluate(() => { const p = document.getElementById('film-ptr'); if (p) p.style.visibility = 'hidden'; });
    const sc0 = await P.evaluate(() => [scrollX, scrollY]);   // puppeteer's clip is in DOCUMENT coordinates
    const buf = await P.screenshot({ clip: { x: x + sc0[0], y: y + sc0[1], width: w, height: h, scale: 2 }, type: 'png' }); fs.writeFileSync(path.join(OUT, 'spots', id + '.png'), buf);
    const sc = Math.min(SPOT_MAX, vp[0] * 0.86 / w, vp[1] * 0.66 / h);
    await P.evaluate((b64, wpx, cap, ssc) => { let o = document.getElementById('film-spot'); if (o) o.remove(); o = document.createElement('div'); o.id = 'film-spot';
      o.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(12,14,18,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;font:24px/1.4 DejaVu Sans,sans-serif;color:#F3EEE8;text-align:center;padding:24px';
      o.innerHTML = '<img src="data:image/png;base64,' + b64 + '" style="width:' + wpx + 'px;border:3px solid #FF6B78;border-radius:6px;box-shadow:0 8px 40px rgba(0,0,0,.6)"><div style="margin-top:18px;max-width:1100px">' + cap + '</div>'; document.documentElement.appendChild(o); }, buf.toString('base64'), Math.round(w * sc), esc(caption), sc);
    const a = now(); console.log('§FILM_SPOT ' + id + ' rect=' + [x, y, w, h].map(v => v.toFixed(0)).join(',') + ' scale=' + sc.toFixed(2) + ' caption="' + caption + '"');
    await sleep(holdMs || 5000); spotLog.push([id, a, now()]);
    await P.evaluate(() => { const o = document.getElementById('film-spot'); if (o) o.remove(); const p = document.getElementById('film-ptr'); if (p) p.style.visibility = ''; }); await sleep(250); };
  const backdropP = (n, P) => (P || pg).screenshot({ path: path.join(OUT, 'bd' + n + '.png') });
  // ---- the Sheet view's own geometry: the drawn texts in sheet units -> CSS px at the CURRENT view ----
  const sheetGeom = () => pg.evaluate(() => { const st = window.DxfSheetFrame.state, cv = st.el.querySelector('canvas'), cr = cv.getBoundingClientRect(); return { l: cr.left, t: cr.top, w: cv.clientWidth, h: cv.clientHeight, v: { cx: st.view.cx, cy: st.view.cy, s: st.view.s } }; });
  const sheetTexts = () => pg.evaluate(() => window.DxfSheetFrame.state.last.list.filter(d => d.k === 'text' || d.k === 'mtext').map(d => ({ k: d.k, s: d.k === 'text' ? d.s : d.lines.join(' '), x: d.p[0], y: d.p[1], h: d.h, layer: d.layer, mid: !!d.mid })));
  const toCss = (g, x, y) => [g.l + g.w / 2 + (x - g.v.cx) * g.v.s, g.t + g.h / 2 - (y - g.v.cy) * g.v.s];
  const clampCanvas = (g, r) => { const x0 = Math.max(g.l + 4, r.x), y0 = Math.max(g.t + 4, r.y), x1 = Math.min(g.l + g.w - 4, r.x + r.w), y1 = Math.min(g.t + g.h - 4, r.y + r.h); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  const unionCss = rs => { const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y)), x1 = Math.max(...rs.map(r => r.x + r.w)), y1 = Math.max(...rs.map(r => r.y + r.h)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  // the real wheel over the canvas = the product's own zoom (x1.15 a notch, about the pointer); n < 0 zooms back out to the same view
  const zoomAt = async (cx, cy, n) => { await moveTo(cx, cy, 500); for (let i = 0; i < Math.abs(n); i++) { await pg.mouse.wheel({ deltaY: n > 0 ? -100 : 100 }); await sleep(170); await blurPrivate(true); } await sleep(300); };
  // zoom the Sheet view into a box (the product's wheel), spotlight it, zoom back
  const zoomSpot = async (id, boxFn, caption, holdMs, maxK) => {
    const b0 = await boxFn(), g = await sheetGeom(), k = Math.min(maxK || 2.5, g.w * 0.9 / b0.w, g.h * 0.8 / b0.h), n = Math.max(0, Math.round(Math.log(k) / Math.log(1.15))), cx = b0.x + b0.w / 2, cy = b0.y + b0.h / 2;
    await zoomAt(cx, cy, n); const b1 = await boxFn(); console.log('§FILM_ZOOM ' + id + ' notches=' + n + ' k=' + Math.pow(1.15, n).toFixed(2));
    await spot(pg, id, b1, caption, holdMs); await zoomAt(cx, cy, -n); };
  const textBoxes = async re => { const g = await sheetGeom(), T = (await sheetTexts()).filter(t => re.test(t.s));   // each text's box, the renderer's own rule (dxf_sheet_view.js: font max(6, h s), left/baseline anchored)
    return pg.evaluate((g, T) => { const c2 = document.createElement('canvas').getContext('2d'); return T.map(d => { const px = Math.max(6, d.h * g.v.s); c2.font = px + 'px sans-serif'; const tw = c2.measureText(d.s).width, ax = g.l + g.w / 2 + (d.x - g.v.cx) * g.v.s, ay = g.t + g.h / 2 - (d.y - g.v.cy) * g.v.s;
      return { x: d.mid ? ax - tw / 2 : ax, y: d.mid ? ay - px / 2 : ay - px, w: tw, h: px * 1.3, s: d.s }; }); }, g, T); };
  const sayDim = s => { const m = /^(\d+)'-(\d+)"$/.exec(s); if (!m) return s; return m[1] + ' feet' + (+m[2] ? ' ' + m[2] + ' inches' : ''); };   // "16'-8"" -> "16 feet 8 inches": the drawn text, spoken
  const saySor = s => String(s).replace(/\./g, ' point '), sayKey = s => String(s).replace(/[._]/g, ' ');
  const dmShown = () => pg.evaluate(() => { const e = document.getElementById('dm-panel'); return !!(e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0); });
  const secOpen = async key => { if (!(await pg.$('#dm-body [data-act="sec"][data-sec="' + key + '"]'))) throw new Error('no section ' + key); const open = await pg.evaluate(k => { const h = document.querySelector('#dm-body [data-act="sec"][data-sec="' + k + '"]'); const n = h.nextElementSibling; return !!(n && n.classList.contains('dm-sb')); }, key);
    if (!open) await clickAt('#dm-body [data-act="sec"][data-sec="' + key + '"]', 700); await sleep(500); return open; };

  // ---- the charts (stills, composed on the ONE page timeline): full frame, then a CSS zoom into a region per narrated point ----
  const CHART_DIR = process.env.FILM_CHART_DIR || path.join(process.env.HOME, 'Videos/bim_do_once_reuse_forever');
  const chartSrc = f => { const b = fs.readFileSync(path.join(CHART_DIR, f)); console.log('§FILM_CHART ' + f + ' bytes=' + b.length + ' sha=' + require('crypto').createHash('sha256').update(b).digest('hex').slice(0, 16)); return 'data:image/png;base64,' + b.toString('base64'); };
  let curSpot = null;
  const endChartSpot = () => { if (curSpot) { spotLog.push([curSpot[0], curSpot[1], now()]); curSpot = null; } };
  const chartShow = async f => { endChartSpot(); const src = chartSrc(f);
    await pg.evaluate(async src => { let o = document.getElementById('film-chart'); if (!o) { o = document.createElement('div'); o.id = 'film-chart'; o.style.cssText = 'position:fixed;inset:0;z-index:2147483644;background:#14161c;overflow:hidden';
        o.innerHTML = '<img style="position:absolute;left:0;top:0;width:1440px;height:810px;transform-origin:0 0"><div id="film-chart-cap" style="position:absolute;left:50%;transform:translateX(-50%);bottom:20px;max-width:1280px;text-align:center;font:23px/1.4 DejaVu Sans,sans-serif;color:#F3EEE8;background:rgba(12,14,18,.86);padding:8px 22px;border-radius:8px;display:none"></div>'; document.body.appendChild(o); }
      const im = o.querySelector('img'); im.style.transition = 'none'; im.style.transform = 'none'; im.src = src; await im.decode(); o.style.display = 'block'; const c = o.querySelector('#film-chart-cap'); c.style.display = 'none'; c.innerHTML = '';
      const p = document.getElementById('film-ptr'); if (p) p.style.visibility = 'hidden'; }, src); await sleep(500); };
  const chartHide = async () => { endChartSpot(); await pg.evaluate(() => { const o = document.getElementById('film-chart'); if (o) o.style.display = 'none'; const p = document.getElementById('film-ptr'); if (p) p.style.visibility = ''; }); await sleep(300); };
  // region (x,y,w,h) in the PNG's own 1920 x 1080 pixels; the page shows the PNG at 1440 x 810 CSS px (0.75), the zoom fills ~88 % of the frame (cap 2.6)
  const chartSpot = async (id, rc, caption) => { endChartSpot();
    const k = await pg.evaluate(([rc, cap]) => { const b = 0.75, x = rc[0] * b, y = rc[1] * b, w = rc[2] * b, h = rc[3] * b, k = Math.min(1440 * 0.88 / w, 810 * 0.72 / h, 2.6), cx = x + w / 2, cy = y + h / 2;
      const o = document.getElementById('film-chart'), im = o.querySelector('img'); im.style.transition = 'transform 1.3s ease-in-out'; im.style.transform = 'translate(' + (720 - k * cx) + 'px,' + (370 - k * cy) + 'px) scale(' + k + ')';
      const c = o.querySelector('#film-chart-cap'); c.textContent = cap; c.style.display = 'block'; return k; }, [rc, caption]);
    console.log('§FILM_SPOT ' + id + ' rect=' + rc.join(',') + ' scale=' + k.toFixed(2) + ' caption="' + caption + '"'); curSpot = [id, now()]; await sleep(1500); };
  const chartWhole = async () => { await pg.evaluate(() => { const im = document.querySelector('#film-chart img'); im.style.transition = 'transform 1.0s ease-in-out'; im.style.transform = 'none'; const c = document.getElementById('film-chart-cap'); c.style.display = 'none'; }); await sleep(1000); };

  // ---- a text file shown in a new tab (headless Chrome downloads a .ifc / .std, never displays it): the file's own lines in a dark <pre> ----
  const textTab = async (kind, lines, body) => inTab(kind, async () => { await br.newPage(); }, async np => {
    await np.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0"><pre>' + lines.map(esc).join('\n') + '</pre>');
    await np.evaluate(() => { document.documentElement.style.background = '#14161c'; document.body.style.background = '#14161c'; const pre = document.querySelector('pre'); pre.style.color = '#F3EEE8'; pre.style.fontSize = '21px'; pre.style.lineHeight = '1.4'; pre.style.margin = '14px'; pre.style.whiteSpace = 'pre-wrap'; pre.style.wordBreak = 'break-all'; });
    const T = mkTab(np), lineRect = (re, n) => np.evaluate((src, n) => { const pre = document.querySelector('pre'), tn = pre.firstChild, t = tn.data, m = new RegExp(src, 'm').exec(t); if (!m) return null; let i = t.lastIndexOf('\n', m.index) + 1, e = i;
      for (let k = 0; k < n; k++) { const q = t.indexOf('\n', e); if (q < 0) { e = t.length; break; } e = q + 1; } const rg = document.createRange(); rg.setStart(tn, i); rg.setEnd(tn, Math.max(i, e - 1));
      const rs = [...rg.getClientRects()].filter(r => r.width > 2); if (!rs.length) return null; const x0 = Math.min(...rs.map(r => r.left)), y0 = Math.min(...rs.map(r => r.top)), x1 = Math.max(...rs.map(r => r.right)), y1 = Math.max(...rs.map(r => r.bottom)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }, re.source, n);
    await backdropP(900 + (textTab.n = (textTab.n || 0) + 1), np).catch(() => { });
    await T.move(760, 330, 600); await sleep(1200);
    await body(np, T, lineRect); }, 60000);

  // ---- the IFC the converter writes (the writer the Analytical export calls), from the converted set ----
  const buildIfc = async () => { const b64 = await pg.evaluate(async () => {
      const load = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load failed ' + src)); document.head.appendChild(s); });
      if (!window.RegReportUI) await load('reg_report_ui.js?v=1'); const eng = await window.RegReportUI.engine(), R = window.DxfImportUI.state.gate.R;
      const u8 = new Uint8Array(eng.Dxf2Ifc.build(eng.Dxf2Ifc.fromEls(R.els, R.ST), { api: eng.ifcApi, WebIFC: eng.WebIFC, name: 'dxf2bim.ifc' }).bytes); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); });
    return Buffer.from(b64, 'base64'); };
  const stepIndex = txt => { const M = {}; txt.split('\n').forEach(l => { const m = /^#(\d+)=(.*)$/.exec(l); if (m) M[m[1]] = l; }); return M; };
  const analyticalDownload = async (name, via) => { // Export > Analytical model (STAAD)...: the .std downloaded; via = a file path for the "any .ifc" route (a real file chooser)
    fs.readdirSync(SAVED).filter(n => /\.std$/.test(n)).forEach(n => fs.unlinkSync(path.join(SAVED, n)));
    const chooser = via ? pg.waitForFileChooser({ timeout: 300000 }).then(c => c.accept([via])) : null;
    await clickAt('#b-export', 700); await pg.waitForSelector('#m-export-panel .me-row[data-key="analytical"]', { visible: true }); await clickAt('#m-export-panel .me-row[data-key="analytical"]', 700);
    if (chooser) await chooser;
    if (via) { // the fresh page's downloads do not land in SAVED in headless Chrome: the page's own Blob (what its download link points at) is read instead (stated; the same bytes)
      for (let g = 0; g < 1200; g++) { await sleep(500); if (await pg.evaluate(() => !!window.__lastBlob)) break; }
      const b64 = await pg.evaluate(async () => { const b = window.__lastBlob; if (!b) return null; const u8 = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); window.__lastBlob = null; return btoa(s); });
      if (!b64) throw new Error('no blob for ' + name + ' stat=' + await stat()); const buf = Buffer.from(b64, 'base64'); fs.writeFileSync(path.join(SAVED, name + '.std'), buf); return buf; }
    let f = null; for (let g = 0; g < 1200 && !f; g++) { await sleep(500); const q = fs.readdirSync(SAVED).filter(n => /\.std$/.test(n)); if (q.length) { const p = path.join(SAVED, q[0]), a = fs.statSync(p).size; await sleep(400); if (a > 0 && a === fs.statSync(p).size) f = p; } }
    if (!f) throw new Error('no .std downloaded for ' + name + ' stat=' + await stat()); return fs.readFileSync(f); };
  const stdCounts = STD => { const LN = STD.split('\n'), secOf = k => { const i = LN.findIndex(l => l === k); if (i < 0) return []; const o = []; for (let j = i + 1; j < LN.length && !/^[A-Za-z]/.test(LN[j]); j++) if (LN[j].trim() && !/^\*/.test(LN[j])) o.push(LN[j]); return o; };
    const supL = secOf('SUPPORTS'), nS = supL.reduce((a, l) => { const t = l.replace(/\b(FIXED|PINNED)\b/g, '').trim().split(/\s+/).filter(t => t && t !== '-'); let c = 0; for (let i = 0; i < t.length; i++) { if (t[i + 1] === 'TO') { c += (+t[i + 2]) - (+t[i]) + 1; i += 2; } else c++; } return a + c; }, 0);
    return { LN, nJ: secOf('JOINT COORDINATES').length, nM: secOf('MEMBER INCIDENCES').length, nS }; };
  const sha8 = b => require('crypto').createHash('sha256').update(b).digest('hex').slice(0, 12);
  const bigCard = (kick, html) => card('<div style="font-size:15px;letter-spacing:.2em;color:#9fb4c8;margin-bottom:26px">' + kick + '</div><div style="max-width:1500px;font-size:44px;line-height:1.45">' + html + '</div>');

  // ================= TAKE =================
  await fresh();
  await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
  const mk = dxfs(MARKED);
  // ---- prelude (not recorded): the 9 marked sheets, Complete ticked, Convert ----
  await openSet(mk); const v0 = await verdict(); fact('open_chip', v0.chip);
  if (await pg.$('#dxf-complete')) { await clickAt('#dxf-complete', 600); await sleep(600); } fact('complete_ticked', String(await pg.evaluate(() => { const e = document.getElementById('dxf-complete'); return !!(e && e.checked); })));
  await clickAt('#dxf-convert', 700); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 600000 }); await sleep(2500);
  await clickAt('#dm-close', 500); await sleep(400); await fitCentre(1.15, 600); await moveTo(900, 520, 300);
  fact('bodies', String(await pg.evaluate(() => window.DxfImportUI.state.gate.R.els.length)));
  await cdp.send('Page.startScreencast', SC); await sleep(600);

  // ---- 0 THE QUESTION ----
  chapter(0, 'question'); await beat('q_card'); await backdropP(0);
  await bigCard('0 · THE QUESTION', 'Why is construction transforming from flat drawings to a digital twin?');
  await beat('q_sheet'); await uncard();
  if (!(await dmShown())) { await setFold(false); await clickAt('#dxf-meta', 700); await sleep(800); await idle(); }
  const di = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.findIndex(s => /DETAIL/i.test(s.name))); if (di < 0) throw new Error('no DETAILS sheet in the set');
  fact('details_sheet', await pg.evaluate(i => window.DxfMetaEditor.state.sheets[i].name.replace(/_marked\.dxf$/i, '').replace(/^\d+_?/, ''), di));
  await openSheet(di); await moveTo(1000, 330, 1200); await sleep(2500); await closeSheet(); await clickAt('#dm-close', 600); await sleep(500); await setFold(true);
  await fitCentre(1.15, 1600); orbitZ(40, 5000).catch(() => { }); await sleep(5200);

  // ---- 0a BEFORE THE SCREEN ----
  chapter(1, '0a'); await beat('a_full'); await chartShow('before_the_screen_1920x1080.png'); await backdropP(1);
  await beat('a_kites'); await chartSpot('c0a_kites', [60, 300, 400, 180], 'About 9,000 years ago: scale plans engraved on stone (desert kites, Jordan and Saudi Arabia)');
  await beat('a_uruk'); await chartSpot('c0a_uruk', [250, 690, 320, 100], 'c. 3350-3000 BC, Uruk clay tablets: accounts kept to be read again');
  await beat('a_saqqara'); await chartSpot('c0a_saqqara_gudea', [250, 300, 450, 180], 'c. 2650 BC, an architect\'s diagram of Djoser\'s age; c. 2130-2090 BC, Gudea\'s temple plan');
  await beat('a_cad'); await chartSpot('c0a_ifc_cad', [1090, 300, 270, 180], '1982 AutoCAD + DXF: lines go digital. 1996/97 IFC 1.0: an open model every tool can reuse');

  // ---- 0c HOW WE GOT HERE ----
  chapter(2, '0c'); await beat('h_full'); await chartShow('bim_history_timeline_1920x1080.png'); await backdropP(2);
  await beat('h_screen'); await chartSpot('c0c_screen', [100, 795, 1020, 105], 'Lines on a screen, reused by: a person, reading it (1963, 1982)');
  await beat('h_objects'); await chartSpot('c0c_objects', [180, 630, 1180, 160], 'Objects that carry data, reused by: the same tool (1975 to 2000)');
  await beat('h_ifc'); await chartSpot('c0c_ifc', [900, 495, 950, 150], 'One open shared model, reused by: any tool (IFC, 1994 to 2024)');
  await beat('h_standards'); await chartSpot('c0c_standards', [1300, 330, 560, 160], 'Information managed for life, reused by: everyone, over the years (2011 to 2019)');
  await beat('h_twin'); await chartSpot('c0c_twin', [1130, 190, 320, 95], 'A live digital twin, reused by: the running asset (the concept, 2002)');
  await beat('h_thiswork'); await chartSpot('c0c_thiswork', [1480, 570, 330, 320], '2026, this work: a raw 2D DXF set, an open IFC model, reused downstream');

  // ---- 0d NOT HISTORY: REUSABILITY ----
  chapter(3, '0d'); await beat('r_full'); await chartShow('recorded_not_reusable_1920x1080.png'); await backdropP(3);
  await beat('r_hollow'); await chartSpot('c0d_hollow', [190, 225, 520, 420], 'Four and a half thousand years: every mark hollow, recorded for a person to read');
  await beat('r_cad'); await chartSpot('c0d_cad', [1320, 225, 170, 300], 'CAD and DXF, 1982: lines a person measures, notes as text');
  await beat('r_shed'); await chartSpot('c0d_shed', [1495, 215, 190, 480], 'This work, the shed: its note on the concrete mix prices it and sets the stiffness');
  await beat('r_ifc'); await chartSpot('c0d_ifc', [1680, 215, 210, 400], 'One open model (IFC): what the schema can carry, filled all the way down');

  // ---- 0b THE PROMISE ----
  chapter(4, '0b'); await beat('p_promise'); await chartHide(); await backdropP(4);
  await bigCard('0b · THE PROMISE', 'Not for the picture.<br>For the information: entered once, reused forever.');

  // ---- 1 WRITTEN ONCE ----
  chapter(5, 'written'); await beat('w_sheet'); await uncard();
  if (!(await dmShown())) { await setFold(false); await clickAt('#dxf-meta', 700); await sleep(800); await idle(); }
  await backdropP(5);
  { const D = await pg.evaluate(() => { const V = window.DxfSheetView, S = window.DxfMetaEditor.state.sheets, per = S.map(s => { const st = V.toDrawList(V.parse(s.text || '')).stats; return [s.name, (st.drawn_by_type || {}).DIMENSION || 0]; });
      const di = S.findIndex(s => /DETAIL/i.test(s.name)), ds = V.toDrawList(V.parse(S[di].text || '')), tx = ds.list.filter(d => d.k === 'text' || d.k === 'mtext').map(d => d.k === 'text' ? d.s : d.lines.join(' '));
      return { det: per[di][1], phi: tx.filter(t => /Ø/.test(t)).length, dtx: tx.filter(t => /^\d+'-\d+"( \/ \d+'-\d+")?$/.test(t)) }; });
    fact('dims_drawn', String(D.det)); fact('phi_labels', String(D.phi)); }
  await openSheet(di);
  { const T = await sheetTexts(), title = T.find(t => /^Long Section of Beam-2/.test(t.s)); if (!title) throw new Error('no Long Section of Beam-2 on DETAILS');
    const R = { x0: title.x - 8, x1: title.x + 450, y0: title.y - 8, y1: title.y + 100 }, inR = T.filter(t => t.x >= R.x0 && t.x <= R.x1 && t.y >= R.y0 && t.y <= R.y1);
    const dd = inR.map(t => /(\d+'-\d+")\s*\/\s*(\d+'-\d+")/.exec(t.s)).filter(Boolean)[0], bar = inR.find(t => /Ø/.test(t.s)); if (!dd || !bar) throw new Error('beam-2 section lacks its dimension pair or bar label');
    fact('dim_a_say', sayDim(dd[1])); fact('dim_b_say', sayDim(dd[2])); fact('bar_label', bar.s.trim());
    await moveTo(1000, 330, 1200); await sleep(1500);
    await zoomSpot('beam_section', async () => { const g = await sheetGeom(), a = toCss(g, R.x0, R.y1), b = toCss(g, R.x1, R.y0); return clampCanvas(g, { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] }); }, 'Beam-2 long section: every dimension drawn (' + dd[1] + ' / ' + dd[2] + ') and the bar label with its Ø', 4500, 2.4); }
  await beat('w_note');
  { const F = await pg.evaluate(() => { const els = window.DxfImportUI.state.gate.R.els, P = e => (e.ifc && e.ifc.props) || {}, cls = e => e.ifc && e.ifc.ifc_class, foot = els.find(e => cls(e) === 'IfcFooting' && P(e).Note_CastingRatio); if (!foot) return null; return { ratio_a: P(foot).Note_CastingRatio, src: P(foot).NoteSource_CastingRatio || '' }; });
    if (!F) throw new Error('no footing carrying a casting ratio'); fact('ratio_a', F.ratio_a); fact('ratio_say', String(F.ratio_a).replace(/:/g, ' to ')); fact('ratio_source', F.src);
    const boxes = await textBoxes(/Casting Ratio|f'c/); if (boxes.length < 2) throw new Error('notes texts not found on DETAILS: ' + boxes.length); fact('note_lines', JSON.stringify(boxes.map(b => b.s)));
    const fcLine = boxes.find(b => /f'c/.test(b.s)); fact('fc_note', fcLine ? fcLine.s.trim() : 'none');
    await moveTo(1100, 560, 1000); await sleep(1200);
    await zoomSpot('ratio_note', async () => { const g = await sheetGeom(), bs = await textBoxes(/Casting Ratio|f'c/); return clampCanvas(g, unionCss(bs)); }, 'Your note on the sheet: ' + (boxes.find(b => /Footing, Column/.test(b.s)) || boxes[0]).s.trim() + (fcLine ? ' and ' + fcLine.s.trim() : ''), 5000, 2.4); }
  await beat('w_notes');
  { const rw = '#dxf-panel [data-notes-sheet]'; await pg.waitForSelector(rw, { visible: true }); await pg.$eval(rw, e => e.scrollIntoView({ block: 'center' })); await sleep(500);
    await moveTo(300, 300, 500); const r = await pg.$eval(rw, e => { const p = e.parentElement, a = e.getBoundingClientRect(), b = p.getBoundingClientRect(), nm = e.previousElementSibling ? e.previousElementSibling.getBoundingClientRect() : a; return { x: Math.min(b.left, a.left), y: Math.min(nm.top, a.top), w: Math.max(b.width, a.width), h: a.bottom - Math.min(nm.top, a.top) }; });
    const txt = await pg.$eval(rw, e => e.innerText), nn = (/general notes read: (\d+)/.exec(txt) || [])[1] || 'none', chip = await pg.evaluate(() => [...document.querySelectorAll('#dxf-panel .dxf-role')].filter(e => e.innerText.trim() === 'NOTES').length);
    fact('notes_read', nn); fact('notes_chip', String(chip)); await sleep(1000);
    await spot(pg, 'notes_row', r, 'The sheet is marked NOTES: ' + txt.trim().replace(/\s+/g, ' '), 4500); }
  await closeSheet(); await clickAt('#dm-close', 600); await sleep(500); await setFold(true);

  // ---- 2 READ, NOT RETYPED: a footing selected; its properties from the model's own IFC ----
  chapter(6, 'read'); await beat('x_foot');
  const F = await pg.evaluate(() => { const R = window.DxfImportUI.state.gate.R, els = R.els, P = e => (e.ifc && e.ifc.props) || {}, cls = e => e.ifc && e.ifc.ifc_class;
    const foot = els.find(e => cls(e) === 'IfcFooting' && P(e).Note_CastingRatio); if (!foot) return null;
    const ra = P(foot).Note_CastingRatio, withRa = c => els.filter(e => cls(e) === c && P(e).Note_CastingRatio === ra).length;
    const op = window.Bonsai.oplog._geomOps().find(o => o.parameters.ifc_class === 'IfcFooting' && (o.parameters.provenance || {}).dxf_handle === foot.handle && (o.parameters.provenance || {}).sheet === foot.sheet);
    const g = window.Bonsai.group(), m = op && g.children.find(q => q.isMesh && q.userData && q.userData.featureId === op.id); let bb = null; if (m) { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); bb = [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]; }
    return { id: op ? op.id : null, bb, ratio_a: ra, n_ratio_footing: withRa('IfcFooting'), n_ratio_column: withRa('IfcColumn'), foot_sched_t: P(foot).Sched_Footing_T || 'none', foot_drawn_m: +(foot.z1 - foot.z0).toFixed(4), foot_src: P(foot).NoteSource_CastingRatio || '' }; });
  if (!F || F.id == null || !F.bb) throw new Error('no footing carrying a casting ratio found: ' + JSON.stringify(F));
  ['n_ratio_footing', 'n_ratio_column', 'foot_sched_t', 'foot_drawn_m'].forEach(k => fact(k, String(F[k]))); fact('foot_ratio_source', F.foot_src);
  await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); await pg.keyboard.press('x'); await sleep(900);   // X = x-ray (the product's key): the footings lie under the floor
  await frameBox([F.bb[0] - 1.5, F.bb[1] - 1.5, F.bb[2], F.bb[3] + 1.5, F.bb[4] + 1.5, F.bb[5]], 1.0, 2200, [0.6, -1, 0.8]); await sleep(600); await backdropP(6);
  { const wc = await pg.evaluate(b => window.__worldToClient((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2), F.bb); await moveTo(wc.x, wc.y, 900); await sleep(300); await pg.mouse.down(); await sleep(90); await pg.mouse.up(); await sleep(900); }
  { const sel = await pg.evaluate(() => Array.from(window.Bonsai._selSet || [])); if (sel.length === 1 && sel[0] === F.id) fact('footing_pick', 'pointer'); else { fact('footing_pick', 'pointer picked ' + JSON.stringify(sel) + ': selected by id (stated)'); await pg.evaluate(id => window.Bonsai.select(id), F.id); } await sleep(1500);
    fact('footing_selected', JSON.stringify(await pg.evaluate(() => Array.from(window.Bonsai._selSet || []))));
    fact('props_panel', String(await pg.evaluate(() => /CastingRatio|Sched_Footing/.test(document.body.innerText)))); }   // the gap, measured: is the property on any page text after the select?
  await beat('x_pset');
  const IFC = await buildIfc(), IFCT = IFC.toString('latin1'), IDX = stepIndex(IFCT); fs.writeFileSync(path.join(SAVED, 'shed.ifc'), IFC);
  const psetLines = Object.values(IDX).filter(l => /IFCPROPERTYSET\(.*'Dxf2Bim_Evidence'/.test(l)), fcLines = Object.values(IDX).filter(l => /Note_fc_MPa/.test(l));
  fact('ifc_bytes', String(IFC.length)); fact('ifc_psets', String(psetLines.length)); fact('ifc_fc_lines', String(fcLines.length)); fact('ifc_schema', (/FILE_SCHEMA\(\('([A-Z0-9_]+)'/.exec(IFCT) || [])[1] || 'none');
  // a footing that carries the ratio: its entity line, its Dxf2Bim_Evidence pset and the pset's property lines, verbatim from the file
  const pickPset = (re, clsWant) => { for (const l of psetLines) { const m = /^#(\d+)=IFCPROPERTYSET\([^,]*,[^,]*,'Dxf2Bim_Evidence',[^,]*,\(([^)]*)\)\)/.exec(l); if (!m) continue; const props = m[2].split(',').map(s => IDX[s.replace('#', '')]).filter(Boolean); if (!props.some(p => re.test(p))) continue;
      const rel = Object.values(IDX).find(q => /IFCRELDEFINESBYPROPERTIES/.test(q) && new RegExp(',#' + m[1] + '\\);?$').test(q)); const objs = rel ? ((/\(\(([^)]*)\)/.exec(rel.replace(/^#\d+=IFCRELDEFINESBYPROPERTIES\([^,]*,[^,]*,[^,]*,[^,]*,/, '(')) || [])[1] || '') : '';
      const oid = objs.split(',')[0].replace('#', ''), ent = IDX[oid] || '', cls = (/^#\d+=(IFC[A-Z0-9]+)\(/.exec(ent) || [])[1] || ''; if (clsWant && cls !== clsWant) continue; return { ent, pset: l, props, cls }; } return null; };
  const footP = pickPset(/Note_CastingRatio/, 'IFCFOOTING');
  if (!footP) throw new Error('no Dxf2Bim_Evidence pset carrying Note_CastingRatio in the IFC'); fact('ifc_footing_entity', footP.cls || 'none'); fact('ifc_footing_props', JSON.stringify(footP.props.map(p => (/'([A-Za-z0-9_]+)',\$,IFC[A-Z]+\('?([^')]*)/.exec(p) || []).slice(1, 3).join('='))).slice(0, 700));
  await textTab('ifc_footing', ['# the converter\'s own IFC (' + IFC.length + ' bytes, ' + (/FILE_SCHEMA\(\('([A-Z0-9_]+)'/.exec(IFCT) || [])[1] + '): the footing and some of the properties in its Dxf2Bim_Evidence set (selected lines, copied from the file)', '', footP.ent].concat(footP.props.filter(q => /'(Kind|Note_CastingRatio|NoteSource_CastingRatio|Sched_Footing_T|SourceSheet)'/.test(q))), async (np, T, lineRect) => {
    const r = await np.evaluate(() => { const b = document.querySelector('pre').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }); await sleep(1200);
    await spot(np, 'ifc_footing_pset', r, 'The footing\'s properties, from the model\'s own IFC (the Modeller has no properties panel): the note, its sheet and handle, the schedule', 6500); await hold(); });

  // ---- 3 REUSED FOR COST: Measure impact, then the bill row the note chose ----
  chapter(7, 'cost'); await beat('c_impact'); await backdropP(7);
  await pg.keyboard.press('x'); await sleep(400);
  if (!(await dmShown())) { await setFold(false); await clickAt('#dxf-meta', 700); await sleep(800); await idle(); }
  await idle();
  for (let g = 0; g < 4 && !(await pg.$('#dm-impact-go')); g++) { await clickAt('#dm-body [data-act="sec"][data-sec="edefaults"]', 700); await sleep(900); }
  if (!(await pg.$('#dm-impact-go'))) { console.log('§FILM_DIAG edefaults ' + JSON.stringify(await pg.evaluate(() => ({ dm: !!document.getElementById('dm-panel') && document.getElementById('dm-panel').style.display, secs: [...document.querySelectorAll('#dm-body [data-act="sec"]')].map(e => e.dataset.sec), body: (document.getElementById('dm-body') || {}).innerText && document.getElementById('dm-body').innerText.slice(0, 200), x: window.A && window.A.xray })))); throw new Error('Element defaults did not open'); }
  { await wheelTo('#dm-impact-go', { margin: 120 });
    for (let g = 0; g < 4; g++) { await clickAt('#dm-impact-go', 800); if (await pg.waitForSelector('#dm-body [data-impact-msg], #dm-impact-pack', { timeout: 8000 }).then(() => true, () => false)) break; }
    await pg.waitForSelector('#dm-impact-pack', { visible: true, timeout: 120000 }); await sleep(900);
    await pointAt('#dm-impact-pack', 600); await sleep(300); await pg.select('#dm-impact-pack', RATES); await sleep(900); fact('impact_pack', await pg.$eval('#dm-impact-pack', e => e.value));
    for (let g = 0; g < 4; g++) { await clickAt('#dm-impact-go', 700); if (await pg.waitForFunction(() => /Measuring/.test((document.querySelector('[data-impact-msg]') || {}).innerText || '') || document.querySelector('#dm-body [data-impact-row]') || (document.getElementById('dm-impact-go') || {}).disabled, { timeout: 10000 }).then(() => true, () => false)) break; }
    await pg.waitForSelector('#dm-body [data-impact-row]', { timeout: 900000 }); await sleep(1200);
    const rows = await pg.evaluate(() => [...document.querySelectorAll('#dm-body [data-impact-row]')].map(e => ({ key: e.getAttribute('data-impact-row'), opt: e.getAttribute('data-impact-option'), d: +e.getAttribute('data-impact-dbill'), txt: e.innerText.replace(/\s+/g, ' ') })));
    if (rows.length < 3) throw new Error('fewer than 3 ranked rows: ' + rows.length); fact('impact_rows', String(rows.length)); rows.slice(0, 3).forEach((r, i) => { fact('imp_k' + (i + 1), r.key); fact('imp_k' + (i + 1) + '_say', sayKey(r.key)); });
    await pg.evaluate(() => { const h = [...document.querySelectorAll('#dm-body .dm-sub')].find(e => /^ranked by impact/i.test(e.innerText)); if (h) h.setAttribute('data-film', 'ranked'); }); if (!(await pg.$('#dm-body [data-film="ranked"]'))) throw new Error('no ranked heading');
    await wheelTo('#dm-body [data-film="ranked"]', { top: true, margin: 14 }); await pointAt('#dm-body [data-film="ranked"]', 700); await sleep(1200);
    const rr = await pg.evaluate(k => { const h = document.querySelector('#dm-body [data-film="ranked"]'), l = document.querySelector('#dm-body [data-impact-row="' + k + '"]'), a = h.getBoundingClientRect(), b = l.getBoundingClientRect(); return { x: a.left, y: a.top, w: Math.max(a.width, b.width), h: b.bottom - a.top }; }, rows[2].key);
    await spot(pg, 'impact_rows', rr, 'Ranked by what each default moves in the bill (' + RATES + '): ' + rows.slice(0, 3).map(r => r.key).join(', '), 5500); }
  await beat('c_sor'); await clickAt('#dm-close', 600); await sleep(400); await setFold(true);
  await clickAt('#b-export', 700); await pg.waitForSelector('#m-export-panel .me-row[data-key="regrep"]', { visible: true }); await clickAt('#m-export-panel .me-row[data-key="regrep"]', 700);
  await pg.waitForSelector('#m-regrep-panel #rr-build', { visible: true, timeout: 60000 }); await sleep(800);
  await pg.evaluate(() => { localStorage.removeItem('dagevu_reg_facts'); document.querySelectorAll('#m-regrep-panel input[data-fact]').forEach(i => { i.value = ''; }); });
  await typeIn('#m-regrep-panel input[data-fact="soil_kPa"]', '150', false); await sleep(600);
  await pointAt('#rr-pack', 600); await sleep(300); await pg.select('#rr-pack', RATES); await sleep(900);
  fact('soil_typed', (await pg.evaluate(() => [...document.querySelectorAll('#m-regrep-panel input[data-fact]')].map(i => [i.dataset.fact, i.value])).then(f => (f.find(x => x[0] === 'soil_kPa') || [])[1] || 'none')));
  await inTab('reg_report', async () => { await pg.$eval('#rr-build', e => e.scrollIntoView({ block: 'center' })); await sleep(400); await clickAt('#rr-build', 800); }, async (np, nlog) => {
    await np.waitForFunction(() => /^Regulatory Report/.test(document.body.innerText) && document.querySelectorAll('h2').length >= 9, { timeout: 240000 }); await sleep(1200);
    const T = mkTab(np), S = sections(await T.text());
    await T.move(760, 330, 700); await T.toHead(/^7\. /); await sleep(1200);
    { const sec = S['7'], si = sec.body.findIndex(l => /^SoR item\t/.test(l)), sor = []; for (let i = si + 1; i < sec.body.length && /^\d[\d.]*\t/.test(sec.body[i]); i++) sor.push(sec.body[i].split('\t'));
      const item = id => sor.find(r => r[0] === id) || []; const sorA = item('07.3.1')[0] || 'none', sorP = (/ p\.(\d+)/.exec(item('07.3.1')[1] || '') || [])[1] || 'none', sorBook = (/PWD SoR \d{4} for Civil Works/.exec(item('07.3.1')[1] || '') || ['PWD SoR'])[0];
      fact('sor_a', sorA); fact('sor_a_say', saySor(sorA)); fact('sor_page_a', sorP); fact('sor_book', sorBook); fact('bill_total', (row(sec, /^Total\t/)[1]) || 'none');
      await T.toHead(/SoR item/, 'th'); await sleep(800); await T.move(700, 400, 500);
      await spotTab(np, 'sor_row', 'sor', 'Footings and columns are priced at item ' + sorA + ', page ' + sorP + ' of the ' + sorBook + ': the drawing\'s own note picked the row', 6000, 2); }
    await hold(); }, 240000);

  // ---- 4 REUSED FOR CHECKS: the marks across the set, then the weight ----
  chapter(8, 'checks'); await beat('k_adv'); await backdropP(8);
  { const MR = await pg.evaluate(() => window.DxfImportUI.state.gate.R.bodies.markRefs), gb = MR.rows.find(r => r.mark === 'GB-1'); if (!gb) throw new Error('no GB-1 in markRefs');
    fact('mr_marks', String(MR.rows.length)); fact('gb_mark', gb.mark); fact('gb_tags', String(gb.nTags)); fact('gb_bodies', String(gb.bodies)); fact('gb_status', gb.status); }
  if (!(await dmShown())) { await setFold(false); await clickAt('#dxf-meta', 700); await sleep(800); await idle(); }
  await secOpen('verdict'); await pg.$eval('#dm-body [data-act="vtab"][data-tab="advisory"]', e => e.scrollIntoView({ block: 'nearest' })); await clickAt('#dm-body [data-act="vtab"][data-tab="advisory"]', 700); await sleep(600);
  { const ik = '#dm-body .dm-it.adv'; const idx = await pg.evaluate(sel => [...document.querySelectorAll(sel)].findIndex(e => /mark_not_modelled/.test(e.querySelector('.c').innerText)), ik); if (idx < 0) throw new Error('no mark_not_modelled item in the advisory list');
    await pg.evaluate((sel, i) => { document.querySelectorAll(sel)[i].setAttribute('data-film', 'gbadv'); }, ik, idx); const el = '#dm-body [data-film="gbadv"]'; await wheelTo(el, { margin: 120 }); await pointAt(el, 700); await sleep(1000);
    const r = await rect(el); fact('gb_advisory', await pg.$eval(el, e => e.innerText.replace(/\s+/g, ' ')));
    await spot(pg, 'gb_advisory', r, 'An advisory, never a block: the mark GB-1 is tagged and detailed, but no body is modelled for it', 5000); }
  await beat('k_tag');
  { const fi = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.findIndex(s => /FOUNDATION/i.test(s.name))); await openSheet(fi); await sleep(600);
    const T = await sheetTexts(), tags = T.filter(t => /^GB-1$/.test(t.s)); fact('gb_tags_on_sheet', String(tags.length)); if (!tags.length) throw new Error('no GB-1 tag drawn on FOUNDATION');
    const tag = tags.slice().sort((p, q) => p.y - q.y)[0], s0 = (await sheetGeom()).v.s; await moveTo(1150, 300, 900); await sleep(1000);
    await zoomSpot('gb_tag', async () => { const g = await sheetGeom(), c = toCss(g, tag.x, tag.y); const k = g.v.s / s0; return clampCanvas(g, { x: c[0] - 40 * k, y: c[1] - 32 * k, w: 80 * k, h: 56 * k }); }, 'The GB-1 tag on the foundation layout: the checks found it, and found nothing modelled under it', 4500, 3.4); }
  await closeSheet(); await sleep(400); await clickAt('#dm-close', 600); await sleep(400); await setFold(true); await fitCentre(1.1, 900);
  await beat('k_weight');
  await inTab('load_summary', async () => { await clickAt('#b-export', 700); await pg.waitForSelector('#m-export-panel .me-row[data-key="load"]', { visible: true }); await clickAt('#m-export-panel .me-row[data-key="load"]', 700); }, async (np, nlog) => {
    await np.waitForFunction(() => document.querySelectorAll('#cards .card').length >= 5 && document.querySelectorAll('#groups tr').length > 2, { timeout: 120000 }); await sleep(1200);
    const T = mkTab(np), cards = await np.evaluate(() => [...document.querySelectorAll('#cards .card')].map(c => c.innerText.split('\n').filter(Boolean))), cardOf = re => cards.find(c => re.test(c[0])) || [];
    fact('ls_total_kN', num(cardOf(/Own weight/)[1])); fact('ls_parts', num((cardOf(/Own weight/)[2] || '').replace(/^.*?·/, '')));
    await T.move(760, 300, 700); await sleep(1500);
    const cr = await np.evaluate(() => { const c = [...document.querySelectorAll('#cards .card')].find(c => /Own weight/.test(c.innerText)), r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await spot(np, 'own_weight', cr, 'A quick dead-load estimate: own weight ' + num(cardOf(/Own weight/)[1]) + ' kN, pending the engineer\'s analysis. Not a design.', 5500); await hold(); });

  // ---- 5 CARRIED IN THE IFC ----
  chapter(9, 'ifc'); await beat('i_header'); await backdropP(9);
  { const first = IFCT.split('\n').slice(0, 9), fcP = pickPset(/Note_fc_MPa/); if (!fcP) throw new Error('no pset carrying Note_fc_MPa'); const fcProp = fcP.props.find(p => /Note_fc_MPa/.test(p)); fact('ifc_fc_prop', fcProp.slice(0, 160));
    const fcVal = ((/IFCTEXT\('([^']*)'/.exec(fcProp) || /IFC[A-Z]+\(([^)]*)\)/.exec(fcProp) || [])[1] || 'none'); fact('ifc_fc_value', fcVal);
    await textTab('ifc_file', ['# the IFC file, as any BIM tool would open it: its first lines, then (... = lines left out) a column and the properties that carry the concrete\'s strength note', ''].concat(first.slice(0, 4), ['...', ''], [fcP.ent], fcP.props.filter(q => /'(Note_fc_MPa|NoteSource_fc_MPa|Note_fy_MPa)'/.test(q))), async (np, T, lineRect) => {
      const r1 = await lineRect(/^ISO-10303-21/, 4); await sleep(500); await spot(np, 'ifc_header', r1, 'The open handover: an IFC file, ISO 10303-21, schema ' + (/FILE_SCHEMA\(\('([A-Z0-9_]+)'/.exec(IFCT) || [])[1], 5000);
      await beat('i_fc'); const r2 = await lineRect(/IFCCOLUMN|IFC[A-Z]+\('/, 1); if (!r2) throw new Error('no pset line in the text tab'); const box = await np.evaluate(() => { const b = document.querySelector('pre').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
      await T.move(760, 440, 500); await sleep(800); await spot(np, 'ifc_fc', { x: box.x, y: r2.y - 30, w: box.w, h: box.y + box.h - r2.y + 30 }, 'The concrete\'s strength note travels in the file: the property Note_fc_MPa = ' + fcVal, 6500); await hold(); }); }

  // ---- 6 REUSED FOR STRUCTURE: the analytical model from the converted set (its IFC inside) ----
  chapter(10, 'structure'); await beat('s_std'); await backdropP(10);
  const STD1 = await analyticalDownload('set'), C1 = stdCounts(STD1.toString('utf8')), stat1 = await stat(), sm1 = k => (new RegExp(k + '=(\\d+)').exec(stat1) || [])[1] || 'none';
  fact('std_file', 'model.std ' + STD1.length + ' bytes'); fact('st_joints', String(C1.nJ)); fact('st_members', String(C1.nM)); fact('st_supports', String(C1.nS)); fact('st_dangling', sm1('dangling ends')); fact('st_stat_match', String(sm1('joints') === String(C1.nJ) && sm1('members') === String(C1.nM) && sm1('supports') === String(C1.nS)));
  fact('st_log', plog.filter(t => /^§ANALYTICAL/.test(t)).slice(-1)[0] || 'none');
  await textTab('staad_text', C1.LN, async (np, T, lineRect) => {
    const showKey = async (key, nl, id, cap) => { let r = await lineRect(new RegExp('^' + key + '$'), nl); if (!r) throw new Error('no ' + key + ' in the std'); const vh = 810; for (let g = 0; g < 400 && (r.y < 70 || r.y + r.h > 640); g++) { await np.mouse.wheel({ deltaY: Math.sign(r.y - 250) * Math.min(300, Math.max(60, Math.abs(r.y - 250))) }); await sleep(35); r = await lineRect(new RegExp('^' + key + '$'), nl); }
      await T.move(760, 440, 500); await sleep(800); await spot(np, id, r, cap, 4000); };
    { const mi = C1.LN.findIndex(l => l === 'DEFINE MATERIAL START'), note = mi >= 0 ? C1.LN[mi + 1] : ''; fact('std_material_note', note.trim()); fact('std_constants', C1.LN.filter(l => /^MATERIAL CONC_/.test(l)).join(' | ').slice(0, 160));
      if (mi < 0) throw new Error('no DEFINE MATERIAL in the std'); await showKey('DEFINE MATERIAL START', 3, 'std_material', 'DEFINE MATERIAL: ' + note.replace(/^\*\s*/, '').trim()); }
    await beat('s_joints'); await showKey('JOINT COORDINATES', 5, 'std_joints', 'JOINT COORDINATES: ' + C1.nJ + ' joints, in metres, Z up');
    await showKey('MEMBER INCIDENCES', 5, 'std_members', 'MEMBER INCIDENCES: ' + C1.nM + ' members, each from joint to joint');
    await showKey('SUPPORTS', 2, 'std_supports', 'SUPPORTS: ' + C1.nS + ' (FIXED), every column base on a footing'); await hold(); });
  // the parity: the SAME shed handed to a FRESH Modeller as an .ifc file, no 2D set at all
  await beat('s_parity');
  await bigCard('THE PROOF', 'Same shed, a fresh Modeller with no drawings,<br>only the IFC file, Export, Analytical model.');
  { const np = await br.newPage(); await np.setViewport(VP); await np.evaluateOnNewDocument(ptrInit); await np.evaluateOnNewDocument(() => { const o = URL.createObjectURL; URL.createObjectURL = function (b) { window.__lastBlob = b; return o.call(URL, b); }; }); np.on('console', m => { const t = m.text(); plog.push(t); if (/§ANALYTICAL|PAGEERR|§GATE /.test(t)) console.log(t.slice(0, 300)); }); np.on('pageerror', e => console.log('§PAGEERR ' + String(e).slice(0, 300)));
    const old = pg; pg = np; await fresh(); await cdp.send('Page.stopScreencast'); cdp = await np.createCDPSession(); { const bs = await br.target().createCDPSession(); await bs.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVED }); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVED }).catch(() => { }); } cdp.on('Page.screencastFrame', onFrame(cdp)); await cdp.send('Page.startScreencast', SC); await np.bringToFront(); await sleep(800);
    await old.close().catch(() => { }); }
  fact('fresh_has_set', String(await pg.evaluate(() => !!(window.DxfImportUI && window.DxfImportUI.state && window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.R && window.DxfImportUI.state.gate.R.els && window.DxfImportUI.state.gate.R.els.length))));
  const STD2 = await analyticalDownload('shed.ifc', path.join(SAVED, 'shed.ifc')), FIX = path.join(process.env.FILM_REPO || path.join(__dirname, '..'), 'modeller/tests/fixtures/analytical_shed_direct.std'), STDF = fs.existsSync(FIX) ? fs.readFileSync(FIX) : null;
  const same12 = Buffer.compare(STD1, STD2) === 0, sameF = STDF ? Buffer.compare(STD2, STDF) === 0 : null;
  fact('parity_set_bytes', String(STD1.length)); fact('parity_ifc_bytes', String(STD2.length)); fact('parity_fixture_bytes', STDF ? String(STDF.length) : 'none');
  fact('parity_set_vs_ifc', same12 ? 'identical' : 'different'); fact('parity_ifc_vs_fixture', sameF === null ? 'no fixture' : sameF ? 'identical' : 'different'); fact('parity_sha', sha8(STD1) + ' / ' + sha8(STD2) + ' / ' + (STDF ? sha8(STDF) : 'none'));
  await bigCard('THE PROOF · model.std, byte for byte', 'from the converted drawings: ' + STD1.length + ' bytes · ' + sha8(STD1) + '<br>from the IFC file alone: ' + STD2.length + ' bytes · ' + sha8(STD2) + '<br>' + (same12 ? 'identical' : 'DIFFERENT') + (STDF ? '<br><span style="font-size:22px;color:#9fb4c8">frozen fixture of the retired direct route: ' + STDF.length + ' bytes · ' + sha8(STDF) + ' · ' + (sameF ? 'identical' : 'different') + '</span>' : ''));
  console.log('§FILM_SPOT parity rect=card scale=1.00 caption="the three model.std files compared byte for byte"'); { const a = now(); await sleep(5500); spotLog.push(['parity', a, now()]); }

  // ---- 7 ANY MODEL: Ifc4_Revit_STR through the same Export row ----
  chapter(11, 'any'); await beat('m_pick'); await uncard(); await backdropP(11);
  const REVIT = process.env.FILM_IFC7 || path.join(process.env.HOME, 'bim-compiler/internal/UNMERGED/Ifc4_Revit_STR.ifc'); fact('m7_file', path.basename(REVIT)); fact('m7_bytes', String(fs.statSync(REVIT).size));
  const plogN = plog.length; const STD3 = await analyticalDownload('revit', REVIT), C3 = stdCounts(STD3.toString('utf8')), stat3 = await stat(), sm3 = k => (new RegExp(k + '=(\\d+)').exec(stat3) || [])[1] || 'none';
  fact('m7_members', String(C3.nM)); fact('m7_joints', String(C3.nJ)); fact('m7_supports', String(C3.nS)); fact('m7_dangling', sm3('dangling ends')); fact('m7_findings', sm3('findings')); fact('m7_status', stat3.slice(0, 260));
  plog.slice(plogN).filter(t => /^§ANALYTICAL/.test(t)).forEach(t => console.log('§FILM_DIAG m7 ' + t.slice(0, 260)));
  let m7e = '', m7w = '', m7f = '';
  { const L7 = plog.slice(plogN).filter(t => /^§ANALYTICAL/.test(t)), cnt = c => String(L7.filter(t => new RegExp('^§ANALYTICAL_FINDING ' + c + ' ').test(t)).length), inp = L7.find(t => /^§ANALYTICAL input ifc/.test(t)) || '';
    m7e = (/elements=(\d+)/.exec(inp) || [])[1] || 'none'; m7w = (/withEvidence=(\d+)/.exec(inp) || [])[1] || 'none'; m7f = cnt('fc_missing');
    fact('m7_elements', (/elements=(\d+)/.exec(inp) || [])[1] || 'none'); fact('m7_with_evidence', (/withEvidence=(\d+)/.exec(inp) || [])[1] || 'none'); fact('m7_fc_missing', cnt('fc_missing')); fact('m7_box_section', cnt('box_section\\w*'));
    fact('m7_finding_codes', JSON.stringify(L7.filter(t => /^§ANALYTICAL_FINDING/.test(t)).reduce((o, t) => { const c = t.split(' ')[1]; o[c] = (o[c] || 0) + 1; return o; }, {}))); }
  await beat('m_status');
  { await moveTo(700, 770, 600); const r = await pg.$eval('#stat', e => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }); await sleep(800);
    await spot(pg, 'm7_status', r, 'Another model, the same Export: ' + C3.nM + ' members, ' + C3.nJ + ' joints, ' + C3.nS + ' supports', 3500); }
  await bigCard('ANOTHER MODEL · what it states, and what it lacks', C3.nM + ' members · ' + C3.nJ + ' joints · ' + C3.nS + ' supports<br><span style="font-size:34px">from ' + m7e + ' elements, ' + m7w + ' carrying the evidence the shed carried<br>' + m7f + ' findings: no concrete strength stated, so no stiffness is given<br>(the engineer states it; listed, never guessed)</span>');
  console.log('§FILM_SPOT m7_card rect=card scale=1.00 caption="what the other model states and lacks"'); { const a = now(); await sleep(5000); spotLog.push(['m7_card', a, now()]); }

  // ---- 8 WHAT IT DOES NOT DO ----
  chapter(12, 'not'); await beat('n_not'); await backdropP(12);
  await bigCard('8 · WHAT IT DOES NOT DO', 'Not the engineer\'s analysis and design.<br>Not live, wind or seismic loads.<br>Not the reinforcement bars from the details.<br><span style="font-size:22px;color:#9fb4c8">The engineer\'s judgement is not reused. It is still theirs.</span>');

  // ---- 9 INFORMATION THAT GROWS ----
  chapter(13, 'grows'); await beat('g_recap'); await backdropP(13);
  await bigCard('9 · INFORMATION THAT GROWS', 'one note &rarr; a property &rarr; a price &rarr; a check &rarr; the IFC &rarr; the frame\'s stiffness<br><span style="font-size:24px;color:#9fb4c8">Entered once. Reused at every step. Never retyped.</span>');
  await beat('end'); await bigCard('THE ANSWER', 'A drawing is read once.<br>A twin is reused forever.');
  await sleep(1500);
  fact('raw_unchanged', String(rawFiles.map(sha).every((h, i) => h === rawSha0[i])));
  await hold(); await sleep(600);
  fact('walker_lines', String(plog.filter(t => /§DW[A-Z_-]*\b|§STRWALK|§MEP[-_ ]WALK|§DISC-WALK/.test(t)).filter(t => !/module loaded|registered|wrapped/.test(t)).length));
  endChartSpot();

  await cdp.send('Page.stopScreencast'); await br.close();
  const t0 = frames[0].ts, lines = [];
  frames.forEach((fr, i) => { const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].ts - fr.ts) : 1.0; lines.push("file '" + fr.f + "'", 'duration ' + d.toFixed(4)); });
  lines.push("file '" + frames[frames.length - 1].f + "'"); fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n'));
  const mkv = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'scale=1920:1080,fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', path.join(OUT, 'film.mp4')], { encoding: 'utf8' });
  console.log('§FILM_SYNC firstFrame=' + t0.toFixed(3) + ' firstBeat=' + beatLog[0][1].toFixed(3) + ' lastFrame=' + frames[frames.length - 1].ts.toFixed(3) + ' frames=' + frames.length + ' ffmpeg_rc=' + mkv.status + ' ' + (mkv.stderr || '').slice(0, 200));
  beatLog.forEach(([id, ep]) => console.log('§FILM_BEAT id=' + id + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  spotLog.forEach(([id, a, b]) => console.log('§FILM_SPOT_AT ' + id + ' t=' + Math.max(0, a - t0).toFixed(3) + ' t_end=' + Math.max(0, b - t0).toFixed(3)));
  chapLog.forEach(([n, key, ep]) => console.log('§FILM_CHAPTER n=' + n + ' key=' + key + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  // one backdrop per chapter (the card's dimmed still): the recorder's own screenshot where it took one, else the take's own frame 1.5 s into the chapter (session 16: take 3 had bd2/bd3 only)
  chapLog.forEach(([n, key, ep]) => { const f = path.join(OUT, 'bd' + n + '.png'); if (fs.existsSync(f) && fs.statSync(f).size) { console.log('§FILM_BACKDROP c' + n + ' recorder'); return; }
    const ss = (Math.max(0, ep - t0) + 1.5).toFixed(3), x = cp.spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', ss, '-i', path.join(OUT, 'film.mp4'), '-frames:v', '1', f]); console.log('§FILM_BACKDROP c' + n + ' from_video t=' + ss + ' rc=' + x.status); });
  fs.writeFileSync(path.join(OUT, 'backdrops.txt'), chapLog.map(([n]) => 'c' + n + ' ' + path.join(OUT, 'bd' + n + '.png')).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'page.log'), plog.join('\n'));
  fs.rmSync(FR, { recursive: true, force: true });
  console.log('§FILM_REC sec=' + (frames[frames.length - 1].ts - t0 + 1).toFixed(1) + ' out=' + path.join(OUT, 'film.mp4'));
})().catch(e => { console.log('§FILM_REC_ERROR ' + (e && e.stack || e)); process.exit(1); });
