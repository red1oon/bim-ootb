#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope: prompts/FILM_DXF2BIM_WHY_MARKINGS.md "SUBMISSION-PACK FILM — STORYLINE" + "SUBMISSION FILM — RECORDER SPEC (2026-10-31)": the converted BricsCAD shed (the 9 CLI-marked sheets, Complete ticked, Convert) and the question
// "can I hand this in?": what the drawing's own notes said (DETAILS sheet, a footing), the Load Summary (new tab), the Regulatory Report from the Modeller (facts form, soil TYPED 150 kPa as an example, new tab): checks with their codes,
// foundations, the bill with each rate's SoR item, what it does not claim. No walker. LIVE recorder: the Modeller (SITE= a local server, else GH Pages), REAL clicks / typing / wheel; the pages' state is READ for facts only.
// Stated film-only choices: a pointer dot, one "previously" card, an end card, the private-name blur on the Sheet view. Every number the narration quotes is a §FILM_FACT line of THIS take. READ take.log after every run:
// §PAGEERR, §FILM_GAP, a missing fact or walker_lines > 0 = not a take. NEVER run the real take on the GPU without the owner's go (FILM_GL=swiftshader = the CPU dry run).
// usage: [FILM_GL=swiftshader] SHED_RAW_DIR=<9 raw sheets> SHED_MARKED_DIR=<9 CLI-marked sheets> SITE=<modeller.html> node prompts/film_dxf2bim_submission_rec.js <take dir> [beat_min.json] > <take dir>.log
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
  const openSheet = async (si) => { if (!(await pg.$('#dm-panel [data-act="sheetview"][data-sheet="' + si + '"]'))) await clickEl('#dm-panel [data-act="card"][data-sheet="' + si + '"]', 700);
    await clickAt('#dm-panel [data-act="sheetview"][data-sheet="' + si + '"]', 800); await pg.waitForSelector('#dxf-sheet-frame', { timeout: 30000 }); await sleep(1200); await blurPrivate(); await sleep(300); };
  const closeSheet = async () => { await pg.evaluate(() => document.querySelectorAll('.film-blur').forEach(e => e.remove())); if (await pg.$('#dsf-close')) { await clickAt('#dsf-close', 600); await sleep(700); } };
  // a film overlay (stated): a blur over each text the Sheet view draws that matches FILM_PRIVATE_RE, at the renderer's own place (dxf_sheet_view.js: x = w/2 + (x - cx) s, font max(6, h s))
  const blurPrivate = async () => { if (!PRIV) { fact('blurred_texts', 'no FILM_PRIVATE_RE'); return 0; }
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
  // the report's sections, from its own text: "N. Title VERDICT" opens section N
  const sections = txt => { const out = {}, L = txt.split('\n'); let k = null; L.forEach(l => { const m = /^(\d)\. (.*)$/.exec(l); if (m) { k = m[1]; out[k] = { head: m[2], body: [] }; } else if (k) out[k].body.push(l); }); return out; };
  const row = (sec, re) => (sec.body.find(l => re.test(l)) || '').split('\t');

  // ================= TAKE =================
  await fresh();
  await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });   // stated: an automated browser opens without the Arrange play
  const mk = dxfs(MARKED);
  // ---- prelude (not recorded): the v2 state, the 9 marked sheets, Complete ticked, Convert ----
  await openSet(mk); const v0 = await verdict(); fact('open_chip', v0.chip);
  if (await pg.$('#dxf-complete')) { await clickAt('#dxf-complete', 600); await sleep(600); } fact('complete_ticked', String(await pg.evaluate(() => { const e = document.getElementById('dxf-complete'); return !!(e && e.checked); })));
  await clickAt('#dxf-convert', 700); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 600000 }); await sleep(2500);
  await clickAt('#dm-close', 500); await sleep(400); await fitCentre(1.15, 600); await moveTo(900, 520, 300);
  await cdp.send('Page.startScreencast', SC); await sleep(600);

  // ---- 1 WHERE WE LEFT THE SHED ----
  chapter(1, 'left'); await beat('b01');
  await card('<div style="font-size:15px;letter-spacing:.2em;color:#9fb4c8;margin-bottom:18px">PREVIOUSLY</div><div style="font-size:30px">BricsCAD 2D to BIM 5D</div>'); await sleep(5000); await uncard();
  { const L = await pg.evaluate(() => { const els = window.DxfImportUI.state.gate.R.els, c = {}; els.forEach(e => { const k = e.ifc && e.ifc.ifc_class; c[k] = (c[k] || 0) + 1; }); return { n: els.length, counts: c, inserts: window.DxfImportUI.state.last.nInserts }; });   // the report's own population: the gate's bodies (the Load Summary + the report count these)
    fact('bodies', String(L.n)); fact('inserts', String(L.inserts)); ['Column', 'Beam', 'Footing', 'Wall', 'Door', 'Member', 'Plate'].forEach(k => fact('n_' + k.toLowerCase(), String(L.counts['Ifc' + k] || 0))); }
  await fitCentre(1.15, 1800); orbitZ(45, 9000).catch(() => { }); await sleep(9500);

  // ---- 2 WHAT YOUR DRAWING ALREADY SAID: the DETAILS sheet, then a footing ----
  chapter(2, 'said'); await beat('b02');
  const dmShown = () => pg.evaluate(() => { const e = document.getElementById('dm-panel'); return !!(e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0); });
  if (!(await dmShown())) { await setFold(false); await clickAt('#dxf-meta', 700); await sleep(800); await idle(); }
  const di = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.findIndex(s => /DETAIL/i.test(s.name))); if (di < 0) throw new Error('no DETAILS sheet in the set');
  fact('details_sheet', await pg.evaluate(i => window.DxfMetaEditor.state.sheets[i].name.replace(/_marked\.dxf$/i, '').replace(/^\d+_?/, ''), di));
  await openSheet(di); await backdrop(2);
  await moveTo(1000, 200, 1400); await sleep(1800); await moveTo(760, 330, 1400); await sleep(1500); await moveTo(1000, 480, 1400); await sleep(1500);
  await beat('b03'); await closeSheet(); await clickAt('#dm-close', 600); await sleep(500); await setFold(true);
  const F = await pg.evaluate(() => { const R = window.DxfImportUI.state.gate.R, els = R.els, P = e => (e.ifc && e.ifc.props) || {}, cls = e => e.ifc && e.ifc.ifc_class;
    const foot = els.find(e => cls(e) === 'IfcFooting' && P(e).Note_CastingRatio), slab = els.find(e => cls(e) === 'IfcSlab' && P(e).Note_CastingRatio); if (!foot) return null;
    const ra = P(foot).Note_CastingRatio, withRa = c => els.filter(e => cls(e) === c && P(e).Note_CastingRatio === ra).length;
    const op = window.Bonsai.oplog._geomOps().find(o => o.parameters.ifc_class === 'IfcFooting' && (o.parameters.provenance || {}).dxf_handle === foot.handle && (o.parameters.provenance || {}).sheet === foot.sheet);
    const g = window.Bonsai.group(), m = op && g.children.find(q => q.isMesh && q.userData && q.userData.featureId === op.id); let bb = null; if (m) { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); bb = [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]; }
    return { id: op ? op.id : null, bb, ratio_a: ra, ratio_b: slab ? P(slab).Note_CastingRatio : 'none', n_ratio_footing: withRa('IfcFooting'), n_ratio_column: withRa('IfcColumn'), foot_sched_t: P(foot).Sched_Footing_T || 'none', foot_drawn_m: +(foot.z1 - foot.z0).toFixed(4), foot_src: P(foot).NoteSource_CastingRatio || '' }; });
  if (!F || F.id == null || !F.bb) throw new Error('no footing carrying a casting ratio found: ' + JSON.stringify(F));
  ['ratio_a', 'ratio_b', 'n_ratio_footing', 'n_ratio_column', 'foot_sched_t', 'foot_drawn_m'].forEach(k => fact(k, String(F[k]))); fact('foot_ratio_source', F.foot_src);
  await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); await pg.keyboard.press('x'); await sleep(900);   // X = x-ray (the product's key): the footings lie under the floor
  await frameBox([F.bb[0] - 1.5, F.bb[1] - 1.5, F.bb[2], F.bb[3] + 1.5, F.bb[4] + 1.5, F.bb[5]], 1.0, 2200, [0.6, -1, 0.8]); await sleep(600); await backdrop(3);
  { const wc = await pg.evaluate(b => window.__worldToClient((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2), F.bb); await moveTo(wc.x, wc.y, 900); await sleep(300); await pg.mouse.down(); await sleep(90); await pg.mouse.up(); await sleep(900); }
  { const sel = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    if (sel.length === 1 && sel[0] === F.id) fact('footing_pick', 'pointer'); else { fact('footing_pick', 'pointer picked ' + JSON.stringify(sel) + ': selected by id (stated)'); await pg.evaluate(id => window.Bonsai.select(id), F.id); }
    await sleep(500);
    // §D101 D6: the product's select frames the one footing so close it fills the frame; re-frame it with its nearest neighbours (the 3 nearest footings' boxes, from the converted model)
    { const nb = await pg.evaluate(b => { const els = window.DxfImportUI.state.gate.R.els.filter(e => e.ifc && e.ifc.ifc_class === 'IfcFooting'), bx = e => { const xs = e.vertices.map(v => v[0]), ys = e.vertices.map(v => v[1]); return [Math.min(...xs), Math.min(...ys), e.z0, Math.max(...xs), Math.max(...ys), e.z1]; };
        const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2], bs = els.map(bx).sort((p, q) => Math.hypot((p[0] + p[3]) / 2 - c[0], (p[1] + p[4]) / 2 - c[1]) - Math.hypot((q[0] + q[3]) / 2 - c[0], (q[1] + q[4]) / 2 - c[1])).slice(0, 4);
        const u = bs.reduce((u, q) => [Math.min(u[0], q[0]), Math.min(u[1], q[1]), Math.min(u[2], q[2]), Math.max(u[3], q[3]), Math.max(u[4], q[4]), Math.max(u[5], q[5])], b);
        const hx = Math.max(c[0] - u[0], u[3] - c[0]), hy = Math.max(c[1] - u[1], u[4] - c[1]); return [c[0] - hx, c[1] - hy, u[2], c[0] + hx, c[1] + hy, u[5]]; }, F.bb);   // centred on the picked footing
      await frameBox(nb, 1.0, 1400, [0.6, -1, 0.8]); await sleep(1800);
      const span = Math.max(nb[3] - nb[0], nb[4] - nb[1]), foot = Math.max(F.bb[3] - F.bb[0], F.bb[4] - F.bb[1]); console.log('§FILM_FRAME footing_in_context span_m=' + span.toFixed(2) + ' footing_m=' + foot.toFixed(2) + ' ratio=' + (span / foot).toFixed(2)); }
    fact('footing_selected', JSON.stringify(await pg.evaluate(() => Array.from(window.Bonsai._selSet || []))));
    const shown = await pg.evaluate(v => { const t = document.body.innerText; return /CastingRatio|Sched_Footing/.test(t) || t.indexOf(v) >= 0; }, F.ratio_a);   // is the property on any page text after the click?
    fact('props_visible', String(shown)); if (!shown) gap('beat2', 'no_properties_panel: selecting a body frames + highlights it (§ZOOM-SEL) but the Modeller renders none of its ifc.props (Note_CastingRatio, Sched_Footing_T); the values are READ from the converted model for the narration, not shown; the DETAILS sheet (b02) shows the drawn notes. status: "' + (await stat()).slice(0, 80) + '"'); }
  await sleep(2500); await pg.keyboard.press('x'); await pg.keyboard.press('Escape'); await sleep(500);

  // ---- 3 WHAT IT WEIGHS: Export > Load Summary (a new tab) ----
  chapter(3, 'weighs'); await beat('b04');
  await setFold(true); await fitCentre(1.1, 900);
  await inTab('load_summary', async () => { await clickAt('#b-export', 700); await pg.waitForSelector('#m-export-panel .me-row[data-key="load"]', { visible: true }); await clickAt('#m-export-panel .me-row[data-key="load"]', 700); }, async (np, nlog) => {
    await np.waitForFunction(() => document.querySelectorAll('#cards .card').length >= 5 && document.querySelectorAll('#groups tr').length > 2, { timeout: 120000 }); await sleep(1200);
    const T = mkTab(np), cards = await np.evaluate(() => [...document.querySelectorAll('#cards .card')].map(c => c.innerText.split('\n').filter(Boolean)));
    const cardOf = re => cards.find(c => re.test(c[0])) || [];
    fact('ls_total_kN', num(cardOf(/Own weight/)[1])); fact('ls_parts', num((cardOf(/Own weight/)[2] || '').replace(/^.*?·/, ''))); fact('ls_footings', num(cardOf(/Carried by/)[2])); fact('ls_heaviest_kN', num(cardOf(/Heaviest/)[1])); fact('ls_heaviest_kPa', num(cardOf(/Heaviest/)[2])); fact('ls_unweighed', num(cardOf(/Not weighed/)[1]));
    fact('ls_handoff', plog.filter(t => /§LOAD_SUMMARY handoff/.test(t)).slice(-1)[0] || 'none');
    await T.move(760, 300, 700); await sleep(2500); await T.toHead(/Own weight by part/); await sleep(3000);
    await beat('b05'); await T.toHead(/Load on each footing/); await sleep(3000); await T.toHead(/What only you can state/); await sleep(1500);
    const miss = await np.evaluate(() => [...document.querySelectorAll('#missing li')].map(l => l.innerText)); fact('ls_soil_not_stated', String(miss.some(t => /Soil bearing capacity/.test(t)))); fact('ls_missing_n', String(miss.length));
    await T.move(700, 560, 700); await hold(); });

  // ---- 4 WHAT YOU HAND IN: Export > Regulatory Report (facts form; soil typed; a new tab) ----
  chapter(4, 'handin'); await beat('b06');
  await clickAt('#b-export', 700); await pg.waitForSelector('#m-export-panel .me-row[data-key="regrep"]', { visible: true }); await clickAt('#m-export-panel .me-row[data-key="regrep"]', 700);
  await pg.waitForSelector('#m-regrep-panel #rr-build', { visible: true, timeout: 60000 }); await sleep(800);
  await pg.evaluate(() => { localStorage.removeItem('dagevu_reg_facts'); document.querySelectorAll('#m-regrep-panel input[data-fact]').forEach(i => { i.value = ''; }); });   // stated: a clean form, only the typed soil below
  await typeIn('#m-regrep-panel input[data-fact="soil_kPa"]', '150', false); await sleep(600);
  await pointAt('#rr-pack', 600); await sleep(300); await pg.select('#rr-pack', RATES); await sleep(900);
  { const f = await pg.evaluate(() => [...document.querySelectorAll('#m-regrep-panel input[data-fact]')].map(i => [i.dataset.fact, i.value])); fact('soil_typed', (f.find(x => x[0] === 'soil_kPa') || [])[1] || 'none'); fact('form_facts', String(f.length)); fact('form_empty', String(f.filter(x => x[1] === '').length));
    fact('pack', await pg.$eval('#rr-pack', e => e.value)); }
  await sleep(1500);
  await beat('b07');
  await inTab('reg_report', async () => { await pg.$eval('#rr-build', e => e.scrollIntoView({ block: 'center' })); await sleep(400); const r0 = await rect('#rr-build'); fact('build_btn', { x: +r0.x.toFixed(0), y: +r0.y.toFixed(0), w: +r0.w.toFixed(0), h: +r0.h.toFixed(0), vh: await pg.evaluate(() => innerHeight), top: await pg.evaluate(p => { const e = document.elementFromPoint(p[0], p[1]); return e ? e.id || e.tagName : 'none'; }, [r0.x + Math.min(r0.w / 2, 60), r0.y + r0.h / 2]) });
    await clickAt('#rr-build', 800); }, async (np, nlog) => {
    await np.waitForFunction(() => /^Regulatory Report/.test(document.body.innerText) && document.querySelectorAll('h2').length >= 9, { timeout: 180000 }); await sleep(1200);
    const T = mkTab(np), txt0 = await T.text(), S = sections(txt0);
    fact('rr_verdict_line', plog.filter(t => /^§REG_REPORT sections=/.test(t)).slice(-1)[0] || 'none'); fact('rr_sections', ((/§REG_REPORT sections=(\d+)/.exec(plog.filter(t => /^§REG_REPORT sections=/.test(t)).slice(-1)[0] || '') || [])[1]) || 'none'); fact('rr_h2', String(Object.keys(S).length));
    fact('rr_cert_line', String(/It is not a compliance certificate/.test(txt0)));
    { const sg = (S['1'] ? S['1'].body : []).map(l => l.split('\t')).filter(c => c.length >= 4 && c[0] !== 'Role'); fact('rr_sig_roles', String(sg.length)); fact('rr_sig_blank', String(sg.filter(c => !c[3].trim()).length)); }
    await T.move(760, 330, 700); await sleep(2500); await T.toHead(/^1\. /); await sleep(3500);
    chapter(5, 'checks'); await beat('b08'); await T.toHead(/^3\. /); await sleep(1500);
    { const sec = S['3'], rl = /Rules (\d+): (\d+) ran/.exec(sec.body.join('\n')) || []; fact('rules_total', rl[1] || 'none'); fact('rules_ran', rl[2] || 'none');
      const door = row(sec, /^door_clear_width/); fact('door_result', door[1] || 'none'); fact('door_code', (/IBC \d{4} §[\d.]+/.exec(door[3] || '') || ['none'])[0]); fact('eg_inconclusive', String(sec.body.filter(l => /^\w+\t+INCONCLUSIVE/.test(l)).length)); fact('eg_head', sec.head); }
    await T.move(700, 520, 900); await sleep(3500);
    await beat('b09'); await T.toHead(/^4\. /); await sleep(1500);
    { const sec = S['4'], cant = row(sec, /^span_depth_cantilever/), cont = row(sec, /^column_continuity/); fact('cant_result', cant[1] || 'none'); fact('cont_result', cont[1] || 'none'); fact('cont_judged', cont[2] || 'none'); fact('st_inconclusive', String(sec.body.filter(l => /^\w+\t+INCONCLUSIVE/.test(l)).length)); fact('st_head', sec.head); }
    await T.move(700, 520, 900); await sleep(3500);
    chapter(6, 'costs'); await beat('b10'); await T.toHead(/^6\. /); await sleep(1500);
    { const sec = S['6'], soil = row(sec, /^Soil bearing capacity/); fact('found_verdict', (/\b(PASS|FINDINGS[^\n]*|NOT STATED|INCONCLUSIVE)$/.exec(sec.head) || [sec.head])[0]); fact('soil_stated', soil[1] || 'none'); fact('found_ratio', (/capacity = ([\d.]+)/.exec(soil[1] || '') || [])[1] || 'none'); }
    await T.move(700, 520, 900); await sleep(3000);
    await beat('b11'); await T.toHead(/^7\. /); await sleep(2500);
    { const sec = S['7'], tot = row(sec, /^Total\t/), un = row(sec, /^Lines priced/); fact('bill_total', tot[1] || 'none'); fact('bill_unpriced', un[1] || 'none'); fact('bill_head', sec.head);
      const nz = sec.body.find(l => /^NOT PRICED:/.test(l)) || ''; fact('shutter_lines', (/\((\d+) lines\)/.exec(nz) || [])[1] || 'none'); fact('shutter_text', nz.slice(0, 160) || 'none');
      const si = sec.body.findIndex(l => /^SoR item\t/.test(l)), sor = []; for (let i = si + 1; i < sec.body.length && /^\d[\d.]*\t/.test(sec.body[i]); i++) sor.push(sec.body[i].split('\t')); fact('sor_rows', String(sor.length));
      const item = id => sor.find(r => r[0] === id) || []; fact('sor_a', item('07.3.1')[0] || 'none'); fact('sor_b', item('07.3.2')[0] || 'none'); fact('sor_c', item('07.2.3')[0] || 'none'); fact('sor_page_a', (/ p\.(\d+)/.exec(item('07.3.1')[1] || '') || [])[1] || 'none'); fact('sor_book', (/PWD SoR \d{4} for Civil Works/.exec(item('07.3.1')[1] || '') || ['none'])[0]); }
    await T.toHead(/SoR item/, 'th'); await T.move(700, 330, 700); await sleep(2500); for (let k = 0; k < 4; k++) { await np.mouse.wheel({ deltaY: 110 }); await sleep(900); } await sleep(1500);
    chapter(7, 'claims'); await beat('b12'); await T.toHead(/^9\. /); await sleep(1500);
    { const sec = S['9'], rows = sec.body.map(l => l.split('\t')).filter(c => c.length >= 4 && c[0] !== 'Setting'), fi = sec.body.findIndex(l => /^Fact\t/.test(l)), facts = fi < 0 ? [] : sec.body.slice(fi + 1).map(l => l.split('\t')).filter(c => c.length >= 2);
      fact('assump_rows', String(rows.length)); fact('assump_guess', String(rows.filter(c => /best effort/.test(c[2])).length)); fact('assump_stated', String(rows.filter(c => /^stated/.test(c[2])).length)); fact('facts_not_stated', String(facts.filter(c => /^not stated/.test(c[1])).length)); fact('facts_total', String(facts.length));
      const sl = rows.find(c => c[0] === 'synth.slab.thickness') || []; fact('slab_value', sl[1] || 'none'); fact('slab_note', String(/no sheet states the slab thickness/.test(sl[3] || ''))); }
    await T.move(700, 520, 900); await sleep(3000); for (let k = 0; k < 6; k++) { await np.mouse.wheel({ deltaY: 110 }); await sleep(800); } await sleep(1500);
    await hold(); }, 240000);   // Build composes the report + the IFC first (CPU dry run: tens of seconds)

  // ---- end ----
  await beat('end'); await card('<div style="font-size:15px;letter-spacing:.2em;color:#9fb4c8;margin-bottom:18px">SUBMISSION PACK</div><div style="max-width:980px;font-size:26px;line-height:1.5">Load Summary and Regulatory Report, from the same converted shed.<br>Facts of the model, the checks that ran, and what is not stated.</div>'); await sleep(1500);
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
  chapLog.forEach(([n, key, ep]) => console.log('§FILM_CHAPTER n=' + n + ' key=' + key + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  fs.writeFileSync(path.join(OUT, 'backdrops.txt'), chapLog.filter(([n]) => n <= 3).map(([n]) => 'c' + n + ' ' + path.join(OUT, 'bd' + n + '.png')).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'page.log'), plog.join('\n'));
  fs.rmSync(FR, { recursive: true, force: true });
  console.log('§FILM_REC sec=' + (frames[frames.length - 1].ts - t0 + 1).toFixed(1) + ' out=' + path.join(OUT, 'film.mp4'));
})().catch(e => { console.log('§FILM_REC_ERROR ' + (e && e.stack || e)); process.exit(1); });
