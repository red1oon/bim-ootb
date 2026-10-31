#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope: prompts/FILM_DXF2BIM_WHY_MARKINGS.md "WHAT'S NEW FILM — STORYLINE (2026-11-01)" + "WHAT'S NEW FILM — RECORDER SPEC": the converted BricsCAD shed, ONLY what is new since the Submission-Pack film
// (§D101 sheet read right, §D99 P4 notes -> facts, §D102 marks checked across the set, §D99 P2 Measure impact, §D97 Load Summary ballpark, RR.6 Regulatory Report, §D103 STAAD export), each shown live and then BLOWN UP by a "spotlight":
// spot() = a REAL screenshot (page.screenshot clip of the element's rect, never a mock) shown enlarged on a dark backdrop with a one-line caption, then removed; every spotlight logs §FILM_SPOT <id> rect=<x,y,w,h> scale=<s>.
// LIVE recorder: the Modeller (SITE= a local server), REAL clicks / typing / wheel; the pages' state is READ for facts only. Every number the narration or a caption quotes is a §FILM_FACT line of THIS take.
// Private-name blur on the Sheet view (FILM_PRIVATE_RE at run time, never written here). READ take.log after every run: §PAGEERR, §FILM_GAP, a missing fact or walker_lines > 0 = not a take.
// NEVER run the real take on the GPU without the owner's go (FILM_GL=swiftshader = the CPU dry run).
// usage: [FILM_GL=swiftshader] SHED_RAW_DIR=<9 raw sheets> [SHED_MARKED_DIR=<9 CLI-marked sheets>] SITE=<modeller.html> node prompts/film_dxf2bim_whatsnew_rec.js <take dir> [beat_min.json] > <take dir>.log
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
  const pg = await br.newPage(); await pg.setViewport(VP);
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
  const cdp = await pg.createCDPSession();
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

  // ================= TAKE =================
  await fresh();
  await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
  const mk = dxfs(MARKED);
  // ---- prelude (not recorded): the 9 marked sheets, Complete ticked, Convert ----
  await openSet(mk); const v0 = await verdict(); fact('open_chip', v0.chip);
  if (await pg.$('#dxf-complete')) { await clickAt('#dxf-complete', 600); await sleep(600); } fact('complete_ticked', String(await pg.evaluate(() => { const e = document.getElementById('dxf-complete'); return !!(e && e.checked); })));
  await clickAt('#dxf-convert', 700); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 600000 }); await sleep(2500);
  await clickAt('#dm-close', 500); await sleep(400); await fitCentre(1.15, 600); await moveTo(900, 520, 300);
  await cdp.send('Page.startScreencast', SC); await sleep(600);

  // ---- 1 NEW SINCE THE LAST FILM ----
  chapter(1, 'new'); await beat('b01'); await backdropP(1);
  await card('<div style="font-size:15px;letter-spacing:.2em;color:#9fb4c8;margin-bottom:18px">PREVIOUSLY</div><div style="font-size:30px">The Submission Pack film</div><div style="font-size:19px;margin-top:14px;color:#9fb4c8">this film shows only what is new</div>'); await sleep(3500); await uncard();
  { const n = await pg.evaluate(() => window.DxfImportUI.state.gate.R.els.length); fact('bodies', String(n)); }
  await fitCentre(1.15, 1800); orbitZ(40, 6000).catch(() => { }); await sleep(6500);

  // ---- 2 THE SHEET, READ RIGHT (§D101): the DETAILS sheet; a beam long section with its dimensions and a bar label; the NOTES row ----
  chapter(2, 'sheet'); await beat('b02');
  if (!(await dmShown())) { await setFold(false); await clickAt('#dxf-meta', 700); await sleep(800); await idle(); }
  await backdropP(2);
  const di = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.findIndex(s => /DETAIL/i.test(s.name))); if (di < 0) throw new Error('no DETAILS sheet in the set');
  fact('details_sheet', await pg.evaluate(i => window.DxfMetaEditor.state.sheets[i].name.replace(/_marked\.dxf$/i, '').replace(/^\d+_?/, ''), di));
  { const D = await pg.evaluate(() => { const V = window.DxfSheetView, S = window.DxfMetaEditor.state.sheets, per = S.map(s => { const st = V.toDrawList(V.parse(s.text || '')).stats; return [s.name, (st.drawn_by_type || {}).DIMENSION || 0, st.dim_unmatched || 0, (st.dim_parts || 0)]; });
      const di = S.findIndex(s => /DETAIL/i.test(s.name)), ds = V.toDrawList(V.parse(S[di].text || '')); const tx = ds.list.filter(d => d.k === 'text' || d.k === 'mtext').map(d => d.k === 'text' ? d.s : d.lines.join(' '));
      return { set: per.reduce((a, r) => a + r[1], 0), unmatched: per.reduce((a, r) => a + r[2], 0), det: per[di][1], parts: per[di][3], phi: tx.filter(t => /Ø/.test(t)).length, pct: tx.filter(t => /%%[cC]/.test(t)).length, dtx: tx.filter(t => /^\d+'-\d+"( \/ \d+'-\d+")?$/.test(t)) }; });
    fact('dims_drawn', String(D.det)); fact('dims_set', String(D.set)); fact('dims_unmatched', String(D.unmatched)); fact('dim_parts', String(D.parts)); fact('phi_labels', String(D.phi)); fact('pct_c_left', String(D.pct)); fact('dim_texts', JSON.stringify(D.dtx.slice(0, 6))); }
  await openSheet(di);
  { const T = await sheetTexts(), title = T.find(t => /^Long Section of Beam-2/.test(t.s)); if (!title) throw new Error('no Long Section of Beam-2 on DETAILS');
    const R = { x0: title.x - 8, x1: title.x + 450, y0: title.y - 8, y1: title.y + 100 }, inR = T.filter(t => t.x >= R.x0 && t.x <= R.x1 && t.y >= R.y0 && t.y <= R.y1);
    const dd = inR.map(t => /(\d+'-\d+")\s*\/\s*(\d+'-\d+")/.exec(t.s)).filter(Boolean)[0], bar = inR.find(t => /Ø/.test(t.s));
    if (!dd || !bar) throw new Error('beam-2 section lacks its dimension pair or bar label: ' + JSON.stringify(inR.map(t => t.s)));
    fact('dim_a', dd[1]); fact('dim_b', dd[2]); fact('dim_a_say', sayDim(dd[1])); fact('dim_b_say', sayDim(dd[2])); fact('bar_label', bar.s.trim()); console.log('§FILM_SPOT_CONTENT beam2 texts_in_rect=' + inR.length + ' dims=' + inR.filter(t => t.layer === 'Dim').length);
    await moveTo(1000, 330, 1200); await sleep(1500);
    await zoomSpot('beam_section', async () => { const g = await sheetGeom(), a = toCss(g, R.x0, R.y1), b = toCss(g, R.x1, R.y0); return clampCanvas(g, { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] }); },
      'Beam-2 long section: every dimension drawn (' + dd[1] + ' / ' + dd[2] + ') and the bar label with its Ø', 5500, 2.4); }
  await beat('b03');
  { const rw = '#dxf-panel [data-notes-sheet]'; await pg.waitForSelector(rw, { visible: true }); await pg.$eval(rw, e => e.scrollIntoView({ block: 'center' })); await sleep(500);   // stated: the 2D list scrolled so the row is on screen
    await moveTo(300, 300, 500); const r = await pg.$eval(rw, e => { const p = e.parentElement, a = e.getBoundingClientRect(), b = p.getBoundingClientRect(), nm = e.previousElementSibling ? e.previousElementSibling.getBoundingClientRect() : a; return { x: Math.min(b.left, a.left), y: Math.min(nm.top, a.top), w: Math.max(b.width, a.width), h: a.bottom - Math.min(nm.top, a.top) }; });
    const txt = await pg.$eval(rw, e => e.innerText), nn = (/general notes read: (\d+)/.exec(txt) || [])[1] || 'none', chip = await pg.evaluate(() => [...document.querySelectorAll('#dxf-panel .dxf-role')].filter(e => e.innerText.trim() === 'NOTES').length);
    fact('notes_read', nn); fact('notes_chip', String(chip)); await sleep(1500);
    await spot(pg, 'notes_row', r, 'The details sheet is marked NOTES, not "no role": ' + txt.trim().replace(/\s+/g, ' '), 4500); }

  // ---- 3 YOUR NOTES BECOME FACTS (§D99 P4): the casting-ratio note on the sheet ----
  chapter(3, 'notes'); await beat('b04');
  { const F = await pg.evaluate(() => { const els = window.DxfImportUI.state.gate.R.els, P = e => (e.ifc && e.ifc.props) || {}, cls = e => e.ifc && e.ifc.ifc_class, foot = els.find(e => cls(e) === 'IfcFooting' && P(e).Note_CastingRatio), slab = els.find(e => cls(e) === 'IfcSlab' && P(e).Note_CastingRatio); if (!foot) return null;
      const ra = P(foot).Note_CastingRatio, withRa = c => els.filter(e => cls(e) === c && P(e).Note_CastingRatio === ra).length; return { ratio_a: ra, ratio_b: slab ? P(slab).Note_CastingRatio : 'none', n_ratio_footing: withRa('IfcFooting'), n_ratio_column: withRa('IfcColumn'), src: P(foot).NoteSource_CastingRatio || '' }; });
    if (!F) throw new Error('no footing carrying a casting ratio'); ['ratio_a', 'ratio_b', 'n_ratio_footing', 'n_ratio_column'].forEach(k => fact(k, String(F[k]))); fact('ratio_say', String(F.ratio_a).replace(/:/g, ' to ')); fact('ratio_source', F.src);
    const boxes = await textBoxes(/Casting Ratio|f'c/); if (boxes.length < 2) throw new Error('notes texts not found on DETAILS: ' + boxes.length); fact('note_lines', JSON.stringify(boxes.map(b => b.s)));
    await moveTo(1100, 560, 1000); await sleep(1500);
    await zoomSpot('ratio_note', async () => { const g = await sheetGeom(), bs = await textBoxes(/Casting Ratio|f'c/); return clampCanvas(g, unionCss(bs)); }, 'Your note on the sheet: ' + (boxes.find(b => /Footing, Column/.test(b.s)) || boxes[0]).s + '. The model reads it as a fact.', 5500, 2.4); }
  await closeSheet(); await sleep(500);

  // ---- 4 CHECKED ACROSS THE SET (§D102): GB-1 tagged + detailed, not modelled ----
  chapter(4, 'marks'); await beat('b05');
  { const MR = await pg.evaluate(() => window.DxfImportUI.state.gate.R.bodies.markRefs), gb = MR.rows.find(r => r.mark === 'GB-1'); if (!gb) throw new Error('no GB-1 in markRefs');
    fact('mr_marks', String(MR.rows.length)); fact('mr_modelled', String(MR.rows.filter(r => r.status === 'modelled').length)); fact('gb_mark', gb.mark); fact('gb_tags', String(gb.nTags)); fact('gb_bodies', String(gb.bodies)); fact('gb_detail', gb.details[0] ? gb.details[0].title : 'none'); fact('gb_status', gb.status); fact('mr_log', MR.log); }
  await backdropP(4);
  await secOpen('verdict'); await pg.$eval('#dm-body [data-act="vtab"][data-tab="advisory"]', e => e.scrollIntoView({ block: 'nearest' })); await clickAt('#dm-body [data-act="vtab"][data-tab="advisory"]', 700); await sleep(600);
  { const ik = '#dm-body .dm-it.adv'; const idx = await pg.evaluate(sel => [...document.querySelectorAll(sel)].findIndex(e => /mark_not_modelled/.test(e.querySelector('.c').innerText)), ik); if (idx < 0) throw new Error('no mark_not_modelled item in the advisory list');
    await pg.evaluate((sel, i) => { document.querySelectorAll(sel)[i].setAttribute('data-film', 'gbadv'); }, ik, idx); const el = '#dm-body [data-film="gbadv"]'; await wheelTo(el, { margin: 120 }); await pointAt(el, 700); await sleep(1200);
    const r = await rect(el); const adv = await pg.$eval(el, e => e.innerText.replace(/\s+/g, ' ')); fact('gb_advisory', adv); fact('adv_total', String(await pg.evaluate(sel => document.querySelectorAll(sel).length, ik)));
    await spot(pg, 'gb_advisory', r, 'An advisory, never a block: the mark GB-1 is tagged and detailed, but no body is modelled for it', 5500); }
  await beat('b06');
  { const fi = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.findIndex(s => /FOUNDATION/i.test(s.name))); await openSheet(fi); await sleep(600);
    const T = await sheetTexts(), tags = T.filter(t => /^GB-1$/.test(t.s)); fact('gb_tags_on_sheet', String(tags.length)); if (!tags.length) throw new Error('no GB-1 tag drawn on FOUNDATION');
    const tag = tags.slice().sort((p, q) => p.y - q.y)[0], s0 = (await sheetGeom()).v.s; await moveTo(1150, 300, 900); await sleep(1200);   // the box is in SHEET units (80 x 56 px at the opening view), so it grows with the zoom
    await zoomSpot('gb_tag', async () => { const g = await sheetGeom(), c = toCss(g, tag.x, tag.y); const k = g.v.s / s0; return clampCanvas(g, { x: c[0] - 40 * k, y: c[1] - 32 * k, w: 80 * k, h: 56 * k }); }, 'The GB-1 tag on the foundation layout: the checks found it, and found nothing modelled under it', 5000, 3.4); }
  await closeSheet(); await sleep(500);

  // ---- 5 WHICH DEFAULT MATTERS (§D99 P2): Element defaults > Measure impact ----
  chapter(5, 'impact'); await beat('b07'); await backdropP(5);
  await idle();   // the gate may re-render the panel after the Sheet view closed
  for (let g = 0; g < 4 && !(await pg.$('#dm-impact-go')); g++) { await clickAt('#dm-body [data-act="sec"][data-sec="edefaults"]', 700); await sleep(900); }
  if (!(await pg.$('#dm-impact-go'))) throw new Error('Element defaults did not open');
  { await wheelTo('#dm-impact-go', { margin: 120 });
    for (let g = 0; g < 4; g++) { await clickAt('#dm-impact-go', 800); if (await pg.waitForSelector('#dm-body [data-impact-msg], #dm-impact-pack', { timeout: 8000 }).then(() => true, () => false)) break; console.log('§FILM_DIAG impact click ' + g + ' had no effect (panel re-rendered between down and up?), clicked again'); }
    try { await pg.waitForSelector('#dm-impact-pack', { visible: true, timeout: 120000 }); } catch (e) { console.log('§FILM_DIAG impact_first_click ' + JSON.stringify(await pg.evaluate(() => [(document.querySelector('[data-impact-msg]') || {}).innerText, !!document.getElementById('dm-impact-pack'), !!window.RegReportUI, !!window.LOCALE_RATE_MAP, (document.getElementById('dm-impact-go') || {}).disabled, !!document.querySelector('#dm-body [data-act="sec"][data-sec="edefaults"] + .dm-sb')]))); throw e; }
    await sleep(900);
    await pointAt('#dm-impact-pack', 600); await sleep(300); await pg.select('#dm-impact-pack', RATES); await sleep(900); fact('impact_pack', await pg.$eval('#dm-impact-pack', e => e.value));
    for (let g = 0; g < 4; g++) { await clickAt('#dm-impact-go', 700); if (await pg.waitForFunction(() => /Measuring/.test((document.querySelector('[data-impact-msg]') || {}).innerText || '') || document.querySelector('#dm-body [data-impact-row]') || (document.getElementById('dm-impact-go') || {}).disabled, { timeout: 10000 }).then(() => true, () => false)) break; console.log('§FILM_DIAG measure click ' + g + ' had no effect, clicked again'); }
    await pg.waitForSelector('#dm-body [data-impact-row]', { timeout: 900000 }); await sleep(1200);
    const rows = await pg.evaluate(() => [...document.querySelectorAll('#dm-body [data-impact-row]')].map(e => ({ key: e.getAttribute('data-impact-row'), opt: e.getAttribute('data-impact-option'), d: +e.getAttribute('data-impact-dbill'), txt: e.innerText.replace(/\s+/g, ' ') })));
    if (rows.length < 3) throw new Error('fewer than 3 ranked rows: ' + rows.length);
    fact('impact_rows', String(rows.length)); const fm = v => Math.abs(Math.round(v)).toLocaleString('en-US'); rows.slice(0, 3).forEach((r, i) => { fact('imp_k' + (i + 1), r.key); fact('imp_k' + (i + 1) + '_say', sayKey(r.key)); fact('imp_o' + (i + 1), r.opt); fact('imp_d' + (i + 1), fm(r.d)); fact('imp_t' + (i + 1), r.txt); });
    fact('imp_log', (plog.filter(t => /impact pack=/.test(t)).slice(-1)[0] || 'none').slice(0, 260));
    await pg.evaluate(() => { const h = [...document.querySelectorAll('#dm-body .dm-sub')].find(e => /^ranked by impact/i.test(e.innerText)); if (h) h.setAttribute('data-film', 'ranked'); }); if (!(await pg.$('#dm-body [data-film="ranked"]'))) throw new Error('no ranked heading');
    await wheelTo('#dm-body [data-film="ranked"]', { top: true, margin: 14 }); await pointAt('#dm-body [data-film="ranked"]', 700); await sleep(1500);
    const rr = await pg.evaluate(k => { const h = document.querySelector('#dm-body [data-film="ranked"]'), l = document.querySelector('#dm-body [data-impact-row="' + k + '"]'), a = h.getBoundingClientRect(), b = l.getBoundingClientRect(); return { x: a.left, y: a.top, w: Math.max(a.width, b.width), h: b.bottom - a.top }; }, rows[2].key);
    await spot(pg, 'impact_rows', rr, 'Ranked by what each default moves in the bill (' + RATES + '): ' + rows.slice(0, 3).map(r => r.key).join(', '), 6000); }

  // ---- 6 A BALLPARK RIGHT AWAY (§D97): Export > Load Summary (a new tab) ----
  chapter(6, 'ballpark'); await beat('b08');
  await setFold(true); await fitCentre(1.1, 900);
  await inTab('load_summary', async () => { await clickAt('#b-export', 700); await pg.waitForSelector('#m-export-panel .me-row[data-key="load"]', { visible: true }); await clickAt('#m-export-panel .me-row[data-key="load"]', 700); }, async (np, nlog) => {
    await np.waitForFunction(() => document.querySelectorAll('#cards .card').length >= 5 && document.querySelectorAll('#groups tr').length > 2, { timeout: 120000 }); await sleep(1200); await backdropP(6, np);
    const T = mkTab(np), cards = await np.evaluate(() => [...document.querySelectorAll('#cards .card')].map(c => c.innerText.split('\n').filter(Boolean)));
    const cardOf = re => cards.find(c => re.test(c[0])) || [];
    fact('ls_total_kN', num(cardOf(/Own weight/)[1])); fact('ls_parts', num((cardOf(/Own weight/)[2] || '').replace(/^.*?·/, ''))); fact('ls_footings', num(cardOf(/Carried by/)[2])); fact('ls_unweighed', num(cardOf(/Not weighed/)[1]));
    fact('ls_handoff', plog.filter(t => /§LOAD_SUMMARY handoff/.test(t)).slice(-1)[0] || 'none');
    await T.move(760, 300, 700); await sleep(1800);
    const cr = await np.evaluate(() => { const c = [...document.querySelectorAll('#cards .card')].find(c => /Own weight/.test(c.innerText)), r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await spot(np, 'own_weight', cr, 'A quick dead-load estimate: own weight ' + num(cardOf(/Own weight/)[1]) + ' kN, pending the engineer\'s analysis. Not a design.', 5500);
    await beat('b09'); await T.toHead(/What only you can state/); await sleep(1500);
    const miss = await np.evaluate(() => [...document.querySelectorAll('#missing li')].map(l => l.innerText)); fact('ls_soil_not_stated', String(miss.some(t => /Soil bearing capacity/.test(t)))); fact('ls_missing_n', String(miss.length));
    await spotTab(np, 'not_stated', 'missing', 'In red: what only you can state (' + miss.length + ' inputs, the soil capacity among them)', 5000, 2);
    await hold(); });

  // ---- 7 HAND IN, AND HAND ON (RR.6, §D103) ----
  let sorA = '', sorP = '', sorBook = ''; chapter(7, 'handin'); await beat('b10'); await backdropP(7);
  await clickAt('#b-export', 700); await pg.waitForSelector('#m-export-panel .me-row[data-key="regrep"]', { visible: true }); await clickAt('#m-export-panel .me-row[data-key="regrep"]', 700);
  await pg.waitForSelector('#m-regrep-panel #rr-build', { visible: true, timeout: 60000 }); await sleep(800);
  await pg.evaluate(() => { localStorage.removeItem('dagevu_reg_facts'); document.querySelectorAll('#m-regrep-panel input[data-fact]').forEach(i => { i.value = ''; }); });   // stated: a clean form, only the typed soil below
  await typeIn('#m-regrep-panel input[data-fact="soil_kPa"]', '150', false); await sleep(600);
  await pointAt('#rr-pack', 600); await sleep(300); await pg.select('#rr-pack', RATES); await sleep(900);
  { const f = await pg.evaluate(() => [...document.querySelectorAll('#m-regrep-panel input[data-fact]')].map(i => [i.dataset.fact, i.value])); fact('soil_typed', (f.find(x => x[0] === 'soil_kPa') || [])[1] || 'none'); fact('pack', await pg.$eval('#rr-pack', e => e.value)); }
  await sleep(1200); await beat('b11');
  await inTab('reg_report', async () => { await pg.$eval('#rr-build', e => e.scrollIntoView({ block: 'center' })); await sleep(400); await clickAt('#rr-build', 800); }, async (np, nlog) => {
    await np.waitForFunction(() => /^Regulatory Report/.test(document.body.innerText) && document.querySelectorAll('h2').length >= 9, { timeout: 240000 }); await sleep(1200);
    const T = mkTab(np), txt0 = await T.text(), S = sections(txt0);
    fact('rr_verdict_line', plog.filter(t => /^§REG_REPORT sections=/.test(t)).slice(-1)[0] || 'none'); fact('rr_cert_line', String(/It is not a compliance certificate/.test(txt0)));
    { const sg = (S['1'] ? S['1'].body : []).map(l => l.split('\t')).filter(c => c.length >= 4 && c[0] !== 'Role'); fact('rr_sig_roles', String(sg.length)); fact('rr_sig_blank', String(sg.filter(c => !c[3].trim()).length)); }
    await T.move(760, 330, 700); await sleep(1500);
    // the sentence's own element: the smallest element whose text holds it, scrolled into view by the real wheel
    { const cr = await tabRect(np, 'cert'); if (!cr) throw new Error('no certificate line element'); fact('rr_cert_text', cr.t); await sleep(800);
      await spotTab(np, 'cert_line', 'cert', 'The report states what it is not: a compliance certificate. The signature blocks stay blank.', 5000, 2); }
    await beat('b12'); await T.toHead(/^7\. /); await sleep(1200);
    { const sec = S['7']; const si = sec.body.findIndex(l => /^SoR item\t/.test(l)), sor = []; for (let i = si + 1; i < sec.body.length && /^\d[\d.]*\t/.test(sec.body[i]); i++) sor.push(sec.body[i].split('\t')); fact('sor_rows', String(sor.length));
      const item = id => sor.find(r => r[0] === id) || []; sorA = item('07.3.1')[0] || 'none'; sorP = (/ p\.(\d+)/.exec(item('07.3.1')[1] || '') || [])[1] || 'none'; sorBook = (/PWD SoR \d{4} for Civil Works/.exec(item('07.3.1')[1] || '') || ['PWD SoR'])[0]; fact('sor_a', item('07.3.1')[0] || 'none'); fact('sor_b', item('07.3.2')[0] || 'none'); fact('sor_a_say', saySor(item('07.3.1')[0] || 'none')); fact('sor_page_a', (/ p\.(\d+)/.exec(item('07.3.1')[1] || '') || [])[1] || 'none'); fact('sor_book', (/PWD SoR \d{4} for Civil Works/.exec(item('07.3.1')[1] || '') || ['none'])[0]); fact('bill_total', (row(sec, /^Total\t/)[1]) || 'none'); }
    await T.toHead(/SoR item/, 'th'); await sleep(800);
    await T.move(700, 400, 500);
    await spotTab(np, 'sor_row', 'sor', 'Footings and columns are priced at item ' + sorA + ', page ' + sorP + ' of the ' + sorBook + ': the drawing\'s own note picked the row', 6000, 2);
    await hold(); }, 240000);
  // ---- hand on: Export > Analytical model (STAAD)...: the downloaded model.std opened as text ----
  await beat('b13');
  await clickAt('#b-export', 700); await pg.waitForSelector('#m-export-panel .me-row[data-key="analytical"]', { visible: true }); await clickAt('#m-export-panel .me-row[data-key="analytical"]', 700);
  let stdF = null; for (let g = 0; g < 600 && !stdF; g++) { await sleep(500); const f = fs.readdirSync(SAVED).filter(n => /\.std$/.test(n)); if (f.length) { const p = path.join(SAVED, f[0]), a = fs.statSync(p).size; await sleep(400); if (a > 0 && a === fs.statSync(p).size) stdF = p; } }
  if (!stdF) throw new Error('no .std downloaded');
  const STD = fs.readFileSync(stdF, 'utf8'), LN = STD.split('\n'), secOf = k => { const i = LN.findIndex(l => l === k); if (i < 0) return []; const o = []; for (let j = i + 1; j < LN.length && !/^[A-Za-z]/.test(LN[j]); j++) if (LN[j].trim() && !/^\*/.test(LN[j])) o.push(LN[j]); return o; };
  const nJ = secOf('JOINT COORDINATES').length, nM = secOf('MEMBER INCIDENCES').length, supL = secOf('SUPPORTS');
  const nS = supL.reduce((a, l) => { const t = l.replace(/\b(FIXED|PINNED)\b/g, '').trim().split(/\s+/).filter(t => t && t !== '-'); let c = 0; for (let i = 0; i < t.length; i++) { if (t[i + 1] === 'TO') { c += (+t[i + 2]) - (+t[i]) + 1; i += 2; } else c++; } return a + c; }, 0);
  const stat2 = await stat(), sm = k => (new RegExp(k + '=(\\d+)').exec(stat2) || [])[1] || 'none';
  fact('std_file', path.basename(stdF) + ' ' + STD.length + ' bytes'); fact('st_joints', String(nJ)); fact('st_members', String(nM)); fact('st_supports', String(nS)); fact('st_dangling', sm('dangling ends')); fact('st_findings', sm('findings'));
  fact('st_stat_match', String(sm('joints') === String(nJ) && sm('members') === String(nM) && sm('supports') === String(nS))); fact('st_status', stat2.slice(0, 220)); fact('st_header', LN.slice(0, 3).join(' | ').slice(0, 220));
  fact('st_log', plog.filter(t => /^§ANALYTICAL/.test(t)).slice(-1)[0] || 'none');
  await inTab('staad_text', async () => { await br.newPage(); }, async (np) => {   // headless Chrome downloads a .std instead of showing it: the file's own text is set into a <pre>
    await np.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0"><pre>' + STD.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>');
    await np.evaluate(() => { document.documentElement.style.background = '#14161c'; document.body.style.background = '#14161c'; const pre = document.querySelector('pre'); pre.style.color = '#F3EEE8'; pre.style.fontSize = '15px'; pre.style.lineHeight = '1.35'; pre.style.margin = '14px'; pre.style.whiteSpace = 'pre'; });   // stated: the text file shown dark; the text is the file's, unchanged
    await backdropP(7, np).catch(() => { });
    const T = mkTab(np), lineRect = (from, nLines) => np.evaluate((from, nLines) => { const pre = document.querySelector('pre'), tn = pre.firstChild, t = tn.data; let i = from === 0 ? 0 : t.indexOf('\n' + from + '\n') + 1; if (from !== 0 && i === 0) return null; let e = i; for (let k = 0; k < nLines; k++) { const n = t.indexOf('\n', e); if (n < 0) { e = t.length; break; } e = n + 1; }
      const rg = document.createRange(); rg.setStart(tn, i); rg.setEnd(tn, Math.max(i, e - 1)); const rs = [...rg.getClientRects()].filter(r => r.width > 2), x0 = Math.min(...rs.map(r => r.left)), y0 = Math.min(...rs.map(r => r.top)), x1 = Math.max(...rs.map(r => r.right)), y1 = Math.max(...rs.map(r => r.bottom)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }, from, nLines);
    const showKey = async (key, nl, id, cap) => { let r = await lineRect(key, nl); if (!r) throw new Error('no ' + key + ' in the std'); for (let g = 0; g < 400 && (r.y < 70 || r.y + r.h > 640); g++) { await np.mouse.wheel({ deltaY: Math.sign(r.y - 250) * Math.min(300, Math.max(60, Math.abs(r.y - 250))) }); await sleep(35); r = await lineRect(key, nl); }
      await T.move(760, 440, 500); await sleep(900); await spot(np, id, r, cap, 4200); };
    await T.move(760, 330, 600); await sleep(1500);
    { const r = await lineRect(0, 3); await spot(np, 'std_header', r, 'model.std: a STARTING model, not a design. Its own first lines say the engineer reviews supports, releases, sections and loads', 5000); }
    await beat('b14');
    await showKey('JOINT COORDINATES', 5, 'std_joints', 'JOINT COORDINATES: ' + nJ + ' joints, in metres, Z up');
    await showKey('MEMBER INCIDENCES', 5, 'std_members', 'MEMBER INCIDENCES: ' + nM + ' members, each from joint to joint');
    await showKey('SUPPORTS', 2, 'std_supports', 'SUPPORTS: ' + nS + ' (FIXED), every column base on a footing; ' + sm('dangling ends') + ' dangling member ends are listed, not hidden');
    await hold(); }, 60000);

  // ---- end ----
  await beat('end'); await card('<div style="font-size:15px;letter-spacing:.2em;color:#9fb4c8;margin-bottom:18px">WHAT IS NEW</div><div style="max-width:980px;font-size:26px;line-height:1.5">The sheet read right, notes as facts, marks checked across the set, which default matters, a ballpark, and a hand-off.<br>Same converted shed. Facts of the model, never a design.</div>'); await sleep(1500);
  fact('raw_unchanged', String(rawFiles.map(sha).every((h, i) => h === rawSha0[i])));
  await hold(); await sleep(600);
  fact('walker_lines', String(plog.filter(t => /§DW[A-Z_-]*\b|§STRWALK|§MEP[-_ ]WALK|§DISC-WALK/.test(t)).filter(t => !/module loaded|registered|wrapped/.test(t)).length));
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
