#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope: prompts/FILM_DXF2BIM_YELLOW_MARKINGS.md ("Yellow until it is yours": the markings of a DXF2BIM drawing, Duplex sample). LIVE recorder: the published Modeller (GH Pages; SITE= for a
// local server) driven with REAL clicks, typing and wheel scrolls on the sets written by film_dxf2bim_yellow_sets.js; DxfMetaEditor / DxfImportUI state is READ for facts only, never set. Film-only pixels:
// the chapter backdrops, the code cards (lines READ from this take's files), the limits + credits cards, and a pointer dot (headless screencast draws no cursor; pointer-events none). The camera is
// tweened by the recorder (Z up; stated in the spec). Role picks use the select element's own value + change event (a native dropdown is not drawn by a headless screencast; stated in the spec).
// Writes §FILM_CHAPTER / §FILM_BEAT (video seconds) and every value the narration quotes as a §FILM_FACT line of THIS take. Read take.log after every run: §PAGEERR or a missing fact = not a take.
// usage: node prompts/film_dxf2bim_yellow_rec.js <take dir (holds sets/marked + sets/plain)> [beat_min.json]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const OUT = path.resolve(process.argv[2] || '.'), BEAT_MIN = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};
const SITE = process.env.SITE || 'https://red1oon.github.io/bim-ootb/modeller/modeller.html';
const MARKED = path.join(OUT, 'sets', 'marked'), PLAIN = path.join(OUT, 'sets', 'plain'), SAVED = path.join(OUT, 'saved');
const dxfs = d => fs.readdirSync(d).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(d, f));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GPU_ENV = Object.assign({}, process.env, { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' });
// the DXF read by a group-code walk (no product code): TEXT entities with their handle, layer, insert and string
const texts = file => { const L = fs.readFileSync(file, 'utf8').split(/\r?\n/).map(s => s.trim()), out = [];
  for (let i = 0; i < L.length - 1; i++) { if (L[i] !== '0' || L[i + 1] !== 'TEXT') continue; const e = { codes: [['0', 'TEXT']] }; let j = i + 2;
    for (; j < L.length - 1 && L[j] !== '0'; j += 2) { e.codes.push([L[j], L[j + 1]]); e[L[j]] = e[L[j]] === undefined ? L[j + 1] : e[L[j]]; } out.push(e); i = j - 1; } return out; };
const marks = file => texts(file).filter(e => e['8'] === 'DXF2BIM-MARK');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
// the title / level texts every number typed in this film comes from (never a value written into this script)
const titleOf = (file, re) => { const t = texts(file).map(e => e['1']).find(s => re.test(s || '')); return t || null; };
const num = s => String(Number(s));

(async () => {
  for (const d of [MARKED, PLAIN]) if (!fs.existsSync(d) || dxfs(d).length === 0) throw new Error('no set at ' + d + ' (run film_dxf2bim_yellow_sets.js first)');
  fs.rmSync(SAVED, { recursive: true, force: true }); fs.mkdirSync(SAVED, { recursive: true });
  const br = await puppeteer.launch({ headless: 'new', env: GPU_ENV, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--window-size=1440,810'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 810, deviceScaleFactor: 4 / 3 });   // browser zoom 133 %: the panels' 10-11 px text legible in a 1920 x 1080 frame (stated in the spec)
  const plog = []; pg.on('console', m => { const t = m.text(); plog.push(t); if (/§DXF-META|PAGEERR/.test(t)) console.log(t.slice(0, 300)); });
  pg.on('pageerror', e => console.log('§PAGEERR ' + String(e).slice(0, 300)));
  // the pointer dot (film pixels, pointer-events none): follows the REAL mouse events the recorder sends; a ring on each press
  await pg.evaluateOnNewDocument(() => { const mk = () => { if (document.getElementById('film-ptr')) return; const d = document.createElement('div'); d.id = 'film-ptr';
      d.style.cssText = 'position:fixed;left:-50px;top:-50px;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,214,64,.95);border:2px solid #14161c;box-shadow:0 0 0 2px rgba(255,214,64,.45);z-index:2147483647;pointer-events:none;transition:transform .12s';
      document.documentElement.appendChild(d);
      document.addEventListener('mousemove', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
      document.addEventListener('mousedown', e => { d.style.transform = 'scale(.7)'; const r = document.createElement('div'); r.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid rgba(255,214,64,.95);z-index:2147483646;pointer-events:none;transition:all .5s ease-out';
        document.documentElement.appendChild(r); requestAnimationFrame(() => { r.style.width = r.style.height = '54px'; r.style.margin = '-27px 0 0 -27px'; r.style.opacity = '0'; }); setTimeout(() => r.remove(), 650); }, true);
      document.addEventListener('mouseup', () => { d.style.transform = ''; }, true); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk(); });
  const cdp = await pg.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVED }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVED }));
  const fact = (k, v) => console.log('§FILM_FACT ' + k + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  const FR = path.join(OUT, 'frames'); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
  const frames = []; let nf = 0, lastDim = '';
  cdp.on('Page.screencastFrame', async ev => { const f = path.join(FR, String(nf++).padStart(6, '0') + '.jpg'); fs.writeFileSync(f, Buffer.from(ev.data, 'base64')); frames.push({ f, ts: ev.metadata.timestamp });
    const dim = ev.metadata.deviceWidth + 'x' + ev.metadata.deviceHeight; if (dim !== lastDim) { lastDim = dim; console.log('§FILM_FRAME_SIZE n=' + nf + ' device=' + dim + ' scale=' + ev.metadata.pageScaleFactor); }
    try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) { } });
  const beatLog = [], chapLog = []; let beatStart = 0, beatId = null; const now = () => Date.now() / 1000;
  const hold = async () => { if (beatId) { const need = (BEAT_MIN[beatId] || 5) + 0.8 - (now() - beatStart); if (need > 0) await sleep(need * 1000); } };
  let chapNext = null;   // a chapter is stamped with its FIRST beat (after the previous beat's hold), so its card never covers the end of the chapter before
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
  // bring a panel element into the visible part of #dm-body with real wheel steps over the panel (never scrollIntoView on screen)
  const wheelTo = async (sel, opts = {}) => { const step = opts.step || 100, pace = opts.pace || 70, margin = opts.margin || 60;
    for (let g = 0; g < 200; g++) { const b = await bodyRect(), r = await rect(sel); const want = opts.top ? r.y - (b.y + margin) : r.y < b.y + margin ? r.y - (b.y + margin) : r.y + r.h > b.y + b.h - margin ? r.y + r.h - (b.y + b.h - margin) : 0;
      if (Math.abs(want) < 8) return; const st = await pg.$eval('#dm-body', e => e.scrollTop), mxs = await pg.$eval('#dm-body', e => e.scrollHeight - e.clientHeight);
      if ((want < 0 && st <= 0) || (want > 0 && st >= mxs - 1)) return;
      if (mx < b.x + 20 || mx > b.x + b.w - 20 || my < b.y + 20 || my > b.y + b.h - 20) await moveTo(b.x + b.w * .55, b.y + b.h * .5, 450);
      await pg.mouse.wheel({ deltaY: Math.sign(want) * Math.min(step, Math.abs(want)) }); await sleep(pace); } };
  const wheelTop = async () => { const b = await bodyRect(); await moveTo(b.x + b.w * .55, b.y + b.h * .5, 450); for (let g = 0; g < 80 && (await pg.$eval('#dm-body', e => e.scrollTop)) > 0; g++) { await pg.mouse.wheel({ deltaY: -120 }); await sleep(60); } };
  const inPanel = sel => pg.$eval(sel, e => !!e.closest('#dm-body')).catch(() => false);
  const pointAt = async (sel, ms, side) => { if (await inPanel(sel)) await wheelTo(sel); const r = await rect(sel); await moveTo(side ? r.x + r.w - Math.min(70, r.w * .15) : r.x + Math.min(r.w / 2, 60), r.y + r.h / 2, ms); return r; };
  const hover = (sel, ms) => pointAt(sel, ms, true);
  const idle = async () => { await pg.waitForFunction(() => window.DxfMetaEditor && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict, { timeout: 300000, polling: 100 }); await sleep(400); };
  const clickAt = async (sel, ms) => { const r = await pointAt(sel, ms); await sleep(250); await pg.mouse.down(); await sleep(90); await pg.mouse.up(); return r; };
  const clickEl = async (sel, ms) => { await clickAt(sel, ms); await sleep(300); await idle(); };
  // D36: Accept all, or (both tiers listed) the split pair; each button brought into view with the wheel, then clicked
  const ACC = '#dm-yellows [data-act="acceptall"],#dm-yellows [data-act="acceptsr"],#dm-yellows [data-act="acceptinf"]';
  const acceptY = async (o) => { for (let g = 0; g < 3 && await pg.$(ACC); g++) { if (o) await wheelTo(ACC, o); await clickEl(ACC); } };
  const typeIn = async (sel, v) => { const r = await pointAt(sel); await sleep(250); await pg.mouse.click(r.x + Math.min(r.w / 2, 60), r.y + r.h / 2, { clickCount: 3 }); await sleep(250);
    await pg.keyboard.type(String(v), { delay: 110 }); await sleep(350); await pg.keyboard.press('Tab'); await idle(); };
  const pick = async (sel, v) => { await pointAt(sel); await sleep(300); await pg.select(sel, v); await sleep(200); await idle(); };
  // page readers (facts only)
  const yrows = () => pg.evaluate(() => { const y = document.getElementById('dm-yellows'); if (!y) return { n: 0, rules: {}, rows: [] }; const rows = [...y.querySelectorAll('.dm-pr')].map(r => r.innerText.replace(/\s+/g, ' ').trim()), rules = {};
    rows.forEach(t => { const m = / · (PR-[A-Z-]+|[A-Z]+-[A-Z-]+):/.exec(t); const k = m ? m[1] : '?'; rules[k] = (rules[k] || 0) + 1; }); return { n: rows.length, rules, rows }; });
  const verdict = () => pg.evaluate(() => { const v = window.DxfMetaEditor.state.verdict || {}, c = {}; (v.blocking || []).forEach(x => c[x.code] = (c[x.code] || 0) + 1);
    return { chip: (document.getElementById('dm-chip') || {}).innerText, blocking: (v.blocking || []).length, advisory: (v.advisory || []).length, codes: c }; });
  const srcCount = () => pg.evaluate(() => { const o = {}; document.querySelectorAll('#dm-panel .dm-src[data-src]').forEach(e => o[e.dataset.src] = (o[e.dataset.src] || 0) + 1); return o; });
  const fieldSrc = sel => pg.evaluate(s => { const e = document.querySelector(s); const l = e && e.parentElement.querySelector('.dm-src'); return l ? l.innerText.trim() : ''; }, sel);
  const sheetIdx = () => pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.name));
  // ---- camera (recorder-driven, eased; the Modeller's OrbitControls, Z up): frame the sheets in the canvas right of the panels ----
  const freeX = () => pg.evaluate(() => { const r = ['dm-panel', 'dxf-panel'].map(id => document.getElementById(id)).filter(e => e && e.offsetParent).map(e => e.getBoundingClientRect().right); return { x0: Math.max(0, ...r), x1: innerWidth - 70 }; });
  const camFrame = (dirDeg, elDeg, fill, ms) => pg.evaluate((dirDeg, elDeg, fill, ms) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls;
      const g = A.scene.children.find(o => o.name === 'dxf-sheets'), bb = new T.Box3().setFromObject(g), ctr = bb.getCenter(new T.Vector3()), rad = bb.getSize(new T.Vector3()).length() / 2;
      const r = ['dm-panel', 'dxf-panel'].map(id => document.getElementById(id)).filter(e => e && e.offsetParent).map(e => e.getBoundingClientRect().right), x0 = Math.max(0, ...r), x1 = innerWidth - 70;
      const fw = (x1 - x0) / innerWidth, a = dirDeg * Math.PI / 180, e = elDeg * Math.PI / 180, vfov = c.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * c.aspect * fw);
      const dist = rad / Math.sin(Math.min(vfov, hfov) / 2) * fill, dir = new T.Vector3(Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e));
      // shift the target left along the view's right vector so the sheets' centre lands mid free canvas
      const right = new T.Vector3().crossVectors(dir.clone().negate(), new T.Vector3(0, 0, 1)).normalize(), ndcX = ((x0 + x1) / 2) / innerWidth * 2 - 1, hw = dist * Math.tan(vfov / 2) * c.aspect;
      const tgt = ctr.clone().addScaledVector(right, -ndcX * hw), toP = tgt.clone().addScaledVector(dir, dist), fromP = c.position.clone(), fromT = ctl.target.clone(), t0 = performance.now();
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.lerpVectors(fromP, toP, s); ctl.target.lerpVectors(fromT, tgt, s); ctl.update();
        if (k < 1) requestAnimationFrame(step); else res({ ctr: ctr.toArray().map(v => +v.toFixed(2)), rad: +rad.toFixed(2) }); })(); }), dirDeg, elDeg, fill, ms);
  // the verdict zoom can land behind the panels: move camera + target along the view's right / up so the controls' target sits mid free canvas
  const centreFree = ms => pg.evaluate(ms => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls;
      const r = ['dm-panel', 'dxf-panel'].map(id => document.getElementById(id)).filter(e => e && e.offsetParent).map(e => e.getBoundingClientRect().right), x0 = Math.max(0, ...r), x1 = innerWidth - 70;
      c.updateMatrixWorld(); const ndcX = ((x0 + x1) / 2) / innerWidth * 2 - 1, dist = c.position.distanceTo(ctl.target), hw = dist * Math.tan(c.fov * Math.PI / 360) * c.aspect;
      const right = new T.Vector3().setFromMatrixColumn(c.matrixWorld, 0), d = right.multiplyScalar(-ndcX * hw), p0 = c.position.clone(), q0 = ctl.target.clone(), t0 = performance.now();
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.copy(p0).addScaledVector(d, s); ctl.target.copy(q0).addScaledVector(d, s); ctl.update();
        if (k < 1) requestAnimationFrame(step); else res(); })(); }), ms);
  const orbitZ = (deg, ms) => pg.evaluate((deg, ms) => new Promise(res => { const A = window.A, T = window.THREE, ctl = A.controls, c = A.camera, o = ctl.target.clone(), v0 = c.position.clone().sub(o), t0 = performance.now();
      (function step() { const k = Math.min(1, (performance.now() - t0) / ms), s = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; c.position.copy(o).add(v0.clone().applyAxisAngle(new T.Vector3(0, 0, 1), deg * Math.PI / 180 * s)); ctl.update();
        if (k < 1) requestAnimationFrame(step); else res(); })(); }), deg, ms);
  const camNow = () => pg.evaluate(() => window.A.camera.position.toArray().map(v => +v.toFixed(2)));

  const fresh = async () => { await pg.goto(SITE, { timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.A && window.A.scene', { timeout: 120000 });
    await sleep(1200); if (!(await pg.evaluate(() => document.body.classList.contains('ol-collapsed')))) { await clickAt('#ol-collapse', 500); await sleep(600); } await moveTo(900, 500, 300); };
  const openSet = async (files, label) => { await clickAt('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true }); await sleep(700);
    const t0 = Date.now(); const [ch] = await Promise.all([pg.waitForFileChooser({ timeout: 30000 }), clickAt('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction(n => window.DxfMetaEditor && window.DxfMetaEditor.state.sheets.length === n && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict, { timeout: 300000, polling: 100 }, files.length);
    await sleep(900); if (!(await pg.$eval('#dm-panel', e => !!e.offsetParent).catch(() => false))) { await clickEl('#dxf-meta'); } fact(label + '_open_ms', String(Date.now() - t0)); };

  // ================= TAKE =================
  await fresh();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await sleep(600);
  // ---- chapter 1 INSIDE THE DRAWING ----
  chapter(1, 'inside'); await beat('m01'); await sleep(3000);
  await openSet(dxfs(MARKED), 'model');
  const nModel = dxfs(MARKED).reduce((s, f) => s + marks(f).length, 0);
  fact('sheets', String((await sheetIdx()).length)); fact('model_marks', String(nModel)); const y0 = await yrows(); fact('model_yellow', String(y0.n)); fact('model_src', await srcCount());
  fact('model_verdict', await verdict());
  await camFrame(-60, 28, 1.05, 2500); await backdrop(1);
  await pointAt('#dm-panel .dm-sh[data-sec="sheets"], #dm-panel .dm-ch'); await sleep(900);
  { const lab = await pg.$$eval('#dm-panel .dm-src[data-src]', es => es.slice(0, 3).map(e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
    for (const [x, y] of lab) { await moveTo(x, y, 500); await sleep(400); } }
  // m02: the FRONT sheet's markings as they stand in the file
  await beat('m02');
  const FRONT = dxfs(MARKED).find(f => /_FRONT_/.test(f)), fm = marks(FRONT), pickM = re => fm.find(e => re.test(e['1']));
  const shown = [/^@VIEW=/, /^@FACE=/, /^@HAXIS=/, /^@Z=3\.1 /].map(pickM).filter(Boolean), zE = shown[shown.length - 1];
  fact('mark_lines', shown.map(e => e['1'])); fact('mark_z', zE['1'].replace(/^@Z=(\S+).*/, '$1')); fact('mark_z_y', zE['20']);
  const codeCard = (fname, ents, hiKey, byHi, extra) => card('<div style="font-size:16px;color:#9aa3b2;letter-spacing:3px;margin-bottom:14px">' + esc(fname) + ' &nbsp;·&nbsp; TEXT entities on the layer DXF2BIM-MARK, as stored in the file</div>' +
    '<div style="display:flex;gap:26px;align-items:flex-start;justify-content:center">' + ents.map(e => '<div style="font:17px/1.45 DejaVu Sans Mono,monospace;text-align:left;background:#1b1e26;border:1px solid #2c303a;border-radius:8px;padding:12px 16px">' +
      e.codes.filter(([c]) => ['0', '8', '10', '20', '1'].includes(c)).map(([c, v]) => { const hi = (c === '20' && e === hiKey) || (c === '1' && e === hiKey);
        const val = c === '1' && byHi ? esc(v).replace(/(@BY=\w+)/, '<span style="color:#14161c;background:#ffd640;padding:0 3px">$1</span>') : esc(v);
        return '<div><span style="color:#6b7385;display:inline-block;width:34px">' + c + '</span><span style="color:' + (hi ? '#ffd640' : c === '1' ? '#4fc3f7' : '#F3EEE8') + '">' + val + '</span></div>'; }).join('') + '</div>').join('') + '</div>' + (extra || ''));
  await card('<div></div>'); await sleep(300);
  await codeCard(path.basename(FRONT), shown, zE, false, '<div style="margin-top:20px;font-size:19px;color:#9aa3b2">group code 1 = the text &nbsp;·&nbsp; 8 = its layer &nbsp;·&nbsp; 10 / 20 = where it sits (mm): <span style="color:#ffd640">@Z=' + esc(zE['1'].replace(/^@Z=(\S+).*/, '$1')) + ' sits at y ' + esc(zE['20']) + '</span></div>');
  // m03: the @BY suffix; a marking with no suffix = stated in the CAD file (dxf2marks.js: no @BY -> 'file')
  await beat('m03');
  const by = {}; dxfs(MARKED).forEach(f => marks(f).forEach(e => { const m = /@BY=\w+/.exec(e['1']); const k = m ? m[0] : '(none)'; by[k] = (by[k] || 0) + 1; })); fact('by_counts', by);
  await codeCard(path.basename(FRONT), shown, null, true, '<div style="margin-top:22px;font:19px/1.7 DejaVu Sans,sans-serif;color:#F3EEE8;text-align:left">' +
    '<div><span style="font-family:DejaVu Sans Mono,monospace;color:#ffd640">@BY=model</span> &nbsp; derived from the model by our export</div>' +
    '<div><span style="font-family:DejaVu Sans Mono,monospace;color:#ffd640">@BY=user</span> &nbsp;&nbsp; stated by a person in the Modeller</div>' +
    '<div><span style="font-family:DejaVu Sans Mono,monospace;color:#ffd640">no ending</span> &nbsp; typed in the CAD file</div></div>');
  // m04: a fresh page, the same drawings with no marking
  await beat('m04');
  await fresh(); await uncard();
  fact('plain_marks', String(dxfs(PLAIN).reduce((s, f) => s + marks(f).length, 0)));
  await openSet(dxfs(PLAIN), 'plain'); const v0 = await verdict(), r1 = await yrows();
  fact('open_blocking', String(v0.blocking)); fact('open_yellow', String(r1.n)); fact('open_codes', v0.codes);
  await pointAt('#dm-chip', 700); await sleep(900); await pointAt('#dxf-panel .dxf-row, #dxf-panel [class*="role"], #dxf-panel', 700); await sleep(600);
  // ---- chapter 2 YELLOW UNTIL YOURS ----
  chapter(2, 'yellow'); await beat('y01'); await backdrop(2); await sleep(3000);
  await wheelTop(); fact('r1_rows', String(r1.n)); fact('r1_rules', r1.rules); fact('r1_sample', r1.rows[0]);
  await hover('#dm-yellows .dm-pr', 800); await sleep(1500);
  { const u = await pg.evaluate(() => { const s = [...document.querySelectorAll('#dm-panel select[data-key="UNITS"]')]; return s.map(e => e.value); }); fact('r1_units_fields', u); }
  await beat('y02');
  fact('one_row', r1.rows[0]); await clickEl('#dm-yellows [data-act="confirm"]'); const r1b = await yrows(); fact('one_left', String(r1b.n));
  fact('one_src', await pg.evaluate(() => { const s = document.querySelector('#dm-panel select[data-key="UNITS"]'); const l = s && s.parentElement.querySelector('.dm-src'); return l ? l.innerText.trim() : ''; }));
  await sleep(1500); await acceptY(); fact('r1_after_yellow', String((await yrows()).n)); fact('r1_after_verdict', await verdict());
  // y03: each sheet's role from its dropdown (titles end in a scale, so no role is read)
  await beat('y03');
  const names = await sheetIdx(), ROLE = n => /_FLOOR_LEVEL_/.test(n) ? 'PLAN' : /_(FRONT|LEFT|REAR|RIGHT)_/.test(n) ? 'ELEV' : /_ROOF_/.test(n) ? 'ROOF' : /_SECTION_/.test(n) ? 'SECTION' : '';
  fact('role_why', await pg.evaluate(() => { const e = [...document.querySelectorAll('#dm-panel *')].find(x => x.children.length === 0 && /PR-VIEW not proposed/.test(x.textContent)); return e ? e.textContent.trim() : ''; }));
  let picks = 0; for (let i = 0; i < names.length; i++) { const sel = '#dm-f-' + i + '-VIEW', cur = await pg.$eval(sel, e => e.value).catch(() => null); if (cur === '' && ROLE(names[i])) { await pick(sel, ROLE(names[i])); picks++; } }
  fact('role_picks', String(picks)); const r2 = await yrows(); fact('r2_rows', String(r2.n)); fact('r2_rules', r2.rules);
  await wheelTop(); await sleep(500);
  { const b = await bodyRect(); for (let g = 0; g < 10; g++) { await pg.mouse.wheel({ deltaY: 60 }); await sleep(260); } }   // read the first rows (grid, datums, faces) at a legible pace
  // y04: the suggested cut against the section title, typed over BEFORE any Accept all
  await beat('y04');
  const SECT = names.findIndex(n => /_SECTION_/.test(n)), cutRow = r2.rows.find(t => /^@CUT=/.test(t)) || '';
  fact('cut_row', cutRow); fact('cut_suggested', (cutRow.match(/^@CUT=(\S+)/) || [])[1] || 'none');
  const stitle = titleOf(dxfs(PLAIN).find(f => /_SECTION_/.test(f)), /^SECTION .* AT [XY]=/); const cm = /AT ([XY])=([-\d.]+)/.exec(stitle || '');
  fact('cut_title_text', stitle); fact('cut_title', cm ? cm[2] : 'none');
  { const rr = await pg.evaluate(() => { const r = [...document.querySelectorAll('#dm-yellows .dm-pr')].find(x => /^@CUT=/.test(x.innerText.trim())); if (!r) return null; r.setAttribute('data-film-cut', '1'); return true; });
    if (rr) { await hover('[data-film-cut="1"]', 800); await sleep(2500); } }
  await hover('#dm-f-' + SECT + '-NAME', 900); await sleep(2200);
  const cutSel = '#dm-f-' + SECT + '-CUT'; fact('cut_field_before', await pg.$eval(cutSel, e => e.value));
  const cutTyped = cm[1] + ',' + cm[2]; await typeIn(cutSel, cutTyped);
  fact('cut_typed', cutTyped); fact('r2_after_cut', String((await yrows()).n)); fact('cut_src', await fieldSrc(cutSel)); await hover(cutSel, 400); await sleep(1500);
  // y05: Accept all, at the end of the list
  await beat('y05');
  fact('acceptall_below_px', String(await pg.evaluate(() => { const e = document.getElementById('dm-body'), b = document.querySelector('#dm-yellows [data-act="acceptall"],#dm-yellows [data-act="acceptsr"]').getBoundingClientRect(), p = e.getBoundingClientRect(); return Math.round(b.top - p.top + e.scrollTop - e.clientHeight); })));
  await wheelTop(); await acceptY({ step: 140, pace: 55 });
  fact('r2_after', String((await yrows()).n)); fact('r2_after_verdict', await verdict());
  // ---- chapter 3 THE DATUMS ----
  chapter(3, 'datums'); await beat('d01'); await backdrop(3); await sleep(3000);
  const setName = (path.basename(dxfs(PLAIN)[0]).match(/^([A-Z0-9]+)_/) || [])[1];   // the files' own prefix
  await typeIn('#dm-f-0-SET', setName); const r3 = await yrows(); fact('set_typed', setName); fact('r3_rows', String(r3.n)); fact('r3_rules', r3.rules);
  await sleep(1200); await acceptY({ step: 140, pace: 55 });
  await beat('d02');
  const PL1 = names.findIndex(n => /_FLOOR_LEVEL_1_/.test(n)), PL2 = names.findIndex(n => /_FLOOR_LEVEL_2_/.test(n));
  const t1 = titleOf(dxfs(PLAIN).find(f => /_FLOOR_LEVEL_1_/.test(f)), /PLAN \(FFL/), t2 = titleOf(dxfs(PLAIN).find(f => /_FLOOR_LEVEL_2_/.test(f)), /PLAN \(FFL/);
  const lv1 = num(/FFL ([-+\d.]+)/.exec(t1)[1]), lv2 = num(/FFL ([-+\d.]+)/.exec(t2)[1]); fact('level_title', t2); fact('level_1', lv1); fact('level_2', lv2);
  await typeIn('#dm-f-' + PL1 + '-LEVEL', lv1); await typeIn('#dm-f-' + PL2 + '-LEVEL', lv2); const r4 = await yrows(); fact('r4_rows', String(r4.n)); fact('r4_rules', r4.rules);
  await sleep(1000); await acceptY({ step: 140, pace: 55 });
  await beat('d03');
  const RF = names.findIndex(n => /_ROOF_/.test(n)), rt = titleOf(dxfs(PLAIN).find(f => /_ROOF_/.test(f)), /^ROOF PLAN .*\(([-+\d.]+)\)/), roofLv = num(/\(([-+\d.]+)\)/.exec(rt)[1]);
  const tt = titleOf(dxfs(PLAIN).find(f => /_SECTION_/.test(f)), /^T\/ROOF [-+\d.]+/), roofTop = num(/([-+\d.]+)$/.exec(tt)[1]);
  fact('roof_title', rt); fact('roof_level', roofLv); fact('roof_top_text', tt); fact('roof_top', roofTop);
  await typeIn('#dm-f-' + RF + '-LEVEL', roofLv);
  const roofIds = await pg.evaluate(() => [...document.querySelectorAll('#dm-panel input[id$="-ROOF"]')].filter(e => !e.value).map(e => e.id)); fact('roof_fields', roofIds);
  for (const id of roofIds) await typeIn('#' + id, roofTop);
  fact('roof_typed', String(roofIds.length)); const vr = await verdict(); fact('after_roof_blocking', String(vr.blocking)); fact('after_roof_yellow', String((await yrows()).n));
  if ((await yrows()).n) await acceptY({ step: 140, pace: 55 });
  // d04: the FRONT sheet's card, then the sheets standing in 3D
  await beat('d04');
  const FI = names.findIndex(n => /_FRONT_/.test(n)), fsel = '#dm-panel .dm-ch[data-sheet="' + FI + '"]';
  if (!(await pg.$('#dm-f-' + FI + '-FACE'))) { await clickEl(fsel, 800); }
  await wheelTo(fsel, { top: true, step: 120, pace: 60 }); await sleep(600);
  fact('front_marks', await pg.evaluate(fi => [...document.querySelectorAll('#dm-panel [data-sheet="' + fi + '"][data-key]')].map(e => e.getAttribute('data-key') + '=' + e.value + ' ' + ((e.parentElement.querySelector('.dm-src') || {}).innerText || '').trim()), FI));
  { const lab = await pg.$$eval('#dm-panel .dm-card[data-card="' + FI + '"] .dm-src[data-src]', es => es.slice(0, 6).map(e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.top > 60 && r.bottom < innerHeight - 60]; }));
    for (const [x, y, ok] of lab) if (ok) { await moveTo(x, y, 380); await sleep(250); } }
  const vd = await verdict(); fact('sheets_done_blocking', String(vd.blocking)); fact('sheets_done_src', await srcCount());
  await moveTo(1150, 420, 600); fact('cam_frame', await camFrame(-62, 24, 1.0, 3500)); await orbitZ(28, 5000);
  // ---- chapter 4 THE VERDICT ----
  chapter(4, 'verdict'); await beat('v01'); await backdrop(4); await sleep(3000);
  if (!(await pg.$('#dm-panel .dm-it[data-act="item"]'))) await clickEl('#dm-panel .dm-sh[data-sec="verdict"]');
  await wheelTo('#dm-panel .dm-sh[data-sec="verdict"]', { top: true, step: 140, pace: 55 }); await sleep(800);
  fact('verdict', await verdict());
  { const it = await pg.evaluate(() => { const e = document.querySelector('#dm-panel .dm-it[data-act="item"]:not(.nopos)'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }); fact('item', it); }
  const c0 = await camNow(); await clickAt('#dm-panel .dm-it[data-act="item"]:not(.nopos)', 700); await sleep(1600); await centreFree(1400); await sleep(400); fact('item_cam', { before: c0, after: await camNow() });
  await sleep(1500);
  await beat('v02');
  if (!(await pg.$('#dm-panel input[data-act="walltop"]'))) await clickEl('#dm-panel .dm-sh[data-sec="walltops"]');
  await wheelTo('#dm-panel .dm-sh[data-sec="walltops"]', { top: true, step: 140, pace: 55 }); await sleep(600);
  let ticks = 0; for (let g = 0; g < 10; g++) { const si = await pg.evaluate(() => { const b = [...document.querySelectorAll('#dm-panel input[data-act="walltop"]')].find(x => !x.checked); return b ? b.getAttribute('data-sheet') : null; }); if (si === null) break;
    await clickEl('#dm-panel input[data-act="walltop"][data-sheet="' + si + '"]', 700); ticks++; await sleep(500); }
  const vw = await verdict(); fact('walltop_ticks', String(ticks)); fact('walltop_blocking', String(vw.blocking)); fact('walltop_codes', vw.codes);
  await pointAt('#dm-chip', 600); await sleep(1200);
  await beat('v03');
  fact('convert_status', await pg.$eval('#dxf-status', e => e.innerText.trim())); await hover('#dxf-status', 800); await sleep(2200);
  await wheelTo('#dm-panel .dm-sh[data-sec="doors"]', { step: 140, pace: 55 }); fact('doors_head', await pg.$eval('#dm-panel .dm-sh[data-sec="doors"]', e => e.innerText.replace(/\s+/g, ' ').trim()));
  await pointAt('#dm-panel .dm-sh[data-sec="doors"]', 700); await sleep(1200);
  // ---- chapter 5 IT TRAVELS ----
  chapter(5, 'travels'); await beat('t01'); await backdrop(5); await sleep(3000);
  const before = fs.readdirSync(SAVED); await clickAt('#dm-save', 800);
  let saved = []; for (let i = 0; i < 80; i++) { await sleep(250); saved = fs.readdirSync(SAVED).filter(f => /\.dxf$/i.test(f) && !before.includes(f)); if (saved.length >= names.length) break; }
  await sleep(1200); saved = fs.readdirSync(SAVED).filter(f => /\.dxf$/i.test(f)).sort(); fact('saved_n', String(saved.length)); fact('saved_names', saved);
  fact('save_note', await pg.$eval('#dm-note', e => e.innerText.trim())); await hover('#dm-note', 700); await sleep(1200);
  const SS = path.join(SAVED, saved.find(f => /_SECTION_/.test(f)) || saved[0]), sm = marks(SS), sp = re => sm.find(e => re.test(e['1']));
  const sShown = [/^@CUT=/, /^@Z=3\.1 /, /^@ROOF=/].map(sp).filter(Boolean); fact('saved_lines', sShown.map(e => e['1']));
  const sby = {}; saved.forEach(f => marks(path.join(SAVED, f)).forEach(e => { const m = /@BY=\w+/.exec(e['1']); const k = m ? m[0] : '(none)'; sby[k] = (sby[k] || 0) + 1; })); fact('saved_by', sby);
  await card('<div></div>'); await sleep(250);
  await codeCard(path.basename(SS), sShown, sShown.find(e => /^@Z=/.test(e['1'])), true, '<div style="margin-top:20px;font-size:19px;color:#9aa3b2">the copy saved in this take &nbsp;·&nbsp; every value accepted or typed is now a marking inside its drawing</div>');
  await sleep(6000);   // take3: the card showed 1.6 s before t02; the saved lines must be readable
  await beat('t02');
  await fresh(); await uncard(); await openSet(saved.map(f => path.join(SAVED, f)), 'reopen');
  const vre = await verdict(), yre = await yrows(); fact('reopen_yellow', String(yre.n)); fact('reopen_blocking', String(vre.blocking)); fact('reopen_src', await srcCount());
  fact('reopen_same', String(JSON.stringify(Object.entries(vre.codes).sort()) === JSON.stringify(Object.entries(vw.codes).sort())));
  await camFrame(-60, 28, 1.05, 2500); await pointAt('#dm-chip', 700); await sleep(1000);
  { const lab = await pg.$$eval('#dm-panel .dm-src[data-src]', es => es.slice(0, 3).map(e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })); for (const [x, y] of lab) { await moveTo(x, y, 450); await sleep(350); } }
  // ---- limits + credits ----
  await beat('l01');
  const LIM = ['Not shown: doors and windows (schedule rows, tags), layers, element defaults, the yellow band on exported plans.',
    'The suggested section cut on our standard sets was wrong in this take: check it against the title.',
    'Titles that end in a scale are not read: the role is picked by hand (' + picks + ' times here).',
    'The roof top is typed on ' + roofIds.length + ' sheets.',
    'Round two of the list is ' + r2.n + ' rows; Accept all is at its end.',
    'Recorded on a desktop browser at 133 % zoom; a phone is not measured.'];
  fact('limits', LIM);
  await card('<div style="font-size:19px;color:#9aa3b2;letter-spacing:3px;margin-bottom:20px">WHAT THIS FILM DOES NOT SHOW, AND WHAT IS NOT DONE YET</div><div style="text-align:left;font-size:21px;line-height:1.75;max-width:1200px">' + LIM.map(x => '· ' + esc(x)).join('<br>') + '</div>');
  await beat('end');
  await card('<div style="font-size:20px;color:#9aa3b2;line-height:1.8">Duplex: the repository\'s open IFC sample, written as 2D by our own writer<br>Modeller: red1oon.github.io/bim-ootb/modeller · every number from this take</div>');
  await hold(); await sleep(1200);
  await cdp.send('Page.stopScreencast'); await br.close();
  const t0 = frames[0].ts, lines = [];
  frames.forEach((fr, i) => { const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].ts - fr.ts) : 1.0; lines.push("file '" + fr.f + "'", 'duration ' + d.toFixed(4)); });
  lines.push("file '" + frames[frames.length - 1].f + "'"); fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n'));
  const mk = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'scale=1920:1080,fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', path.join(OUT, 'film.mp4')], { encoding: 'utf8' });
  console.log('§FILM_SYNC firstFrame=' + t0.toFixed(3) + ' firstBeat=' + beatLog[0][1].toFixed(3) + ' lastFrame=' + frames[frames.length - 1].ts.toFixed(3) + ' frames=' + frames.length + ' ffmpeg_rc=' + mk.status + ' ' + (mk.stderr || '').slice(0, 200));
  beatLog.forEach(([id, ep]) => console.log('§FILM_BEAT id=' + id + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  chapLog.forEach(([n, key, ep]) => console.log('§FILM_CHAPTER n=' + n + ' key=' + key + ' t=' + Math.max(0, ep - t0).toFixed(3)));
  fs.writeFileSync(path.join(OUT, 'backdrops.txt'), chapLog.map(([n]) => 'c' + n + ' ' + path.join(OUT, 'bd' + n + '.png')).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'page.log'), plog.join('\n'));
  fs.rmSync(FR, { recursive: true, force: true });
  console.log('§FILM_REC sec=' + (frames[frames.length - 1].ts - t0 + 1).toFixed(1) + ' out=' + path.join(OUT, 'film.mp4'));
})().catch(e => { console.log('§FILM_REC_ERROR ' + (e && e.stack || e)); process.exit(1); });
