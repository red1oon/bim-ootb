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
  const wheelTop = async () => { const b = await bodyRect(); await moveTo(b.x + b.w * .55, b.y + b.h * .5, 450); for (let g = 0; g < 80 && (await pg.$eval('#dm-body', e => e.scrollTop)) > 0; g++) { await pg.mouse.wheel({ deltaY: -120 }); await sleep(60); } };
  const inPanel = sel => pg.$eval(sel, e => !!e.closest('#dm-body')).catch(() => false);
  const pointAt = async (sel, ms, side) => { if (await inPanel(sel)) await wheelTo(sel); const r = await rect(sel); await moveTo(side ? r.x + r.w - Math.min(70, r.w * .15) : r.x + Math.min(r.w / 2, 60), r.y + r.h / 2, ms); return r; };
  const idle = async () => { await pg.waitForFunction(() => window.DxfMetaEditor && !window.DxfMetaEditor.state.busy && window.DxfMetaEditor.state.verdict, { timeout: 300000, polling: 100 }); await sleep(400); };
  const clickAt = async (sel, ms) => { const r = await pointAt(sel, ms); await sleep(250); await pg.mouse.down(); await sleep(90); await pg.mouse.up(); return r; };
  const clickEl = async (sel, ms) => { await clickAt(sel, ms); await sleep(300); await idle(); };
  const typeIn = async (sel, v) => { const r = await pointAt(sel); await sleep(250); await pg.mouse.click(r.x + Math.min(r.w / 2, 60), r.y + r.h / 2, { clickCount: 3 }); await sleep(250);
    await pg.keyboard.type(String(v), { delay: 110 }); await sleep(350); await pg.keyboard.press('Tab'); await sleep(250); };
  const ACC = '#dm-yellows [data-act="acceptall"],#dm-yellows [data-act="acceptsr"],#dm-yellows [data-act="acceptinf"]';
  const acceptY = async () => { for (let g = 0; g < 4 && await pg.$(ACC); g++) { await wheelTo(ACC, { step: 140, pace: 55 }); await clickEl(ACC); } };
  const yrows = () => pg.evaluate(() => { const y = document.getElementById('dm-yellows'); return y ? y.querySelectorAll('.dm-pr').length : 0; });
  const verdict = () => pg.evaluate(() => { const v = window.DxfMetaEditor.state.verdict || {}, c = {}; (v.blocking || []).forEach(x => c[x.code] = (c[x.code] || 0) + 1); return { chip: (document.getElementById('dm-chip') || {}).innerText, blocking: (v.blocking || []).length, codes: c }; });
  const arrState = () => pg.evaluate(() => { const A = window.DxfImportUI.state.arr; return A ? { playing: !!A.playing, live: !!A.live, tinted: A.items.filter(it => it.tint || it.dtint).length, tintInf: A.items.filter(it => it.tintInf).length, sheets: A.items.length } : null; });
  // the camera: frame the arrangement (or the canvas group) in the strip the panels leave free
  const camFrame = (dirDeg, elDeg, fill, ms) => pg.evaluate((dirDeg, elDeg, fill, ms) => new Promise(res => { const A = window.A, T = window.THREE, c = A.camera, ctl = A.controls;
      const g = A.scene.children.find(o => o.name === 'dxf-arrange' && o.visible) || A.scene.children.find(o => o.name === 'dxf-sheets'), bb = new T.Box3().setFromObject(g), ctr = bb.getCenter(new T.Vector3()), rad = bb.getSize(new T.Vector3()).length() / 2;
      const r = ['dm-panel', 'dxf-panel'].map(id => document.getElementById(id)).filter(e => e && e.offsetParent).map(e => e.getBoundingClientRect().right), x0 = Math.max(0, ...r), x1 = innerWidth - 70;
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
  await fresh();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await sleep(600);
  const STEP_MS = 900, HOLD_MS = Math.max(3000, Math.round(((BEAT_MIN.w01 || 12) - 7.5) * 1000));   // the pile holds while w01 is told: beat start -> play start is about 6.3 s (take1)
  // ---- chapter 1 AS DRAWN: the raw set opens; the play starts on open and holds the pile first ----
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
  await beat('w03'); const mid = await pg.evaluate(() => window.__steps[window.__steps.length - 1]); fact('mid_step', mid);
  await pg.waitForFunction(() => { const A = window.DxfImportUI.state.arr; return !A || !A.playing; }, { timeout: 240000, polling: 100 });
  fact('play_s', ((now() - t0play)).toFixed(1));
  const doneLog = logHas(/§DXF-ARRANGE done /)[0] || ''; fact('play_ms', ((/ ms=(\d+)/.exec(doneLog)) || [])[1] || 'none'); fact('final_equal', ((/final_equal=(\w+)/.exec(doneLog)) || [])[1] || 'none');
  const lvSteps = await pg.evaluate(() => window.__steps.filter(s => s.key === 'LEVEL')); fact('level_steps', String(lvSteps.length)); fact('level_value', lvSteps.length ? lvSteps[0].value : 'none');
  await sleep(800); const as = await arrState(); fact('tinted', String(as ? as.tinted : 'none')); fact('tinted_inferred', String(as ? as.tintInf : 'none'));
  await camFrame(-62, 24, 1.0, 2800); await beat('w04'); await sleep(2500);
  // ---- chapter 3 ONE HEIGHT MISSING ----
  chapter(3, 'height');
  await beat('w05'); await backdrop(3);
  const v0 = await verdict(); fact('open_blocking', String(v0.blocking)); fact('open_yellow_rows', String(await yrows()));
  await wheelTop(); await acceptY(); await sleep(1500);   // yellow until it is yours: Accept all makes every defaulted value yours
  const v0b = await verdict(); fact('after_accept_blocking', String(v0b.blocking)); fact('after_accept_codes', v0b.codes); fact('after_accept_yellow', String(await yrows()));
  await clickAt('#dxf-convert', 800); await sleep(1500);
  fact('convert_refused', await pg.$eval('#dxf-status', e => e.innerText.trim())); await pointAt('#dxf-status', 700); await sleep(1500);
  // the five second heights are READ from the CLI-marked set's own @Z markings (the larger of each sheet's two), then typed over the same sheets in the page
  const names = await pg.evaluate(() => window.DxfMetaEditor.state.sheets.map(s => s.name));
  const second = {}; dxfs(MARKED).forEach(f => { const m = marks(f).filter(e => /^@Z=/.test(e['1'])); if (m.length >= 2) { const z = m.map(e => ({ z: Number(/^@Z=(\S+)/.exec(e['1'])[1]), y: e['20'] })).sort((a, b) => b.z - a.z)[0]; second[path.basename(f).replace(/_marked\.dxf$/i, '')] = z; } });
  fact('second_heights', second); fact('second_z', String(Object.values(second)[0].z));
  await beat('w06');
  let typed = 0; for (let si = 0; si < names.length; si++) { const key = names[si].replace(/\.dxf$/i, ''), z = second[key]; if (!z) continue;
    if (!(await pg.$('#dm-av-' + si + '-Z'))) await clickEl('#dm-panel [data-act="card"][data-sheet="' + si + '"]', 700);
    await wheelTo('#dm-av-' + si + '-Z', { step: 120, pace: 60 }); await typeIn('#dm-av-' + si + '-Z', z.z); await typeIn('#dm-ap-' + si + '-Z', z.y);
    await clickEl('#dm-panel [data-act="add"][data-sheet="' + si + '"][data-group="Z"]', 600); typed++; await sleep(400); }
  fact('heights_typed', String(typed)); await wheelTop();
  fact('yellow_rows_after_typing', String(await yrows())); await acceptY(); await sleep(1500);
  const as2 = await arrState(); fact('tinted_after', String(as2 ? as2.tinted : 0)); const v1 = await verdict(); fact('blocking_after_heights', String(v1.blocking)); fact('codes_after_heights', v1.codes);
  // ---- chapter 4 ONE SHED: the processed set opens placed, with no replay (§D38) ----
  chapter(4, 'shed'); await beat('w07'); await backdrop(4);
  const skip0 = logHas(/skip-on-open/).length, start0 = logHas(/§DXF-ARRANGE start /).length;
  await fresh(); await arm(STEP_MS, HOLD_MS); await openSet(dxfs(MARKED)); await sleep(2500);
  fact('processed_skip_on_open', String(logHas(/skip-on-open/).length - skip0)); fact('processed_replays', String(logHas(/§DXF-ARRANGE start /).length - start0));
  fact('processed_blocking', String((await verdict()).blocking)); fact('processed_arrangement', String(await pg.evaluate(() => !!window.DxfImportUI.state.arr)));
  await camFrame(-62, 24, 1.0, 2800); await beat('w08');
  await clickAt('#dxf-convert', 800); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 240000 }); await sleep(2500);
  fact('converted', await pg.evaluate(() => ({ n: window.DxfImportUI.state.last.nInserts, counts: window.DxfImportUI.state.last.counts })));
  { const c = await pg.evaluate(() => window.DxfImportUI.state.last.counts), sum = re => Object.keys(c).filter(k => re.test(k)).reduce((a, k) => a + c[k], 0);
    fact('n_columns', String(sum(/IfcColumn$/))); fact('n_beams', String(sum(/IfcBeam$/))); fact('n_footings', String(sum(/IfcFooting$/))); fact('n_walls', String(sum(/IfcWall$/))); fact('n_members', String(sum(/IfcMember$/))); }
  await camFrame(-62, 24, 1.0, 3000); await orbitZ(60, 8000);
  // ---- chapter 5 LIMITS ----
  chapter(5, 'limits'); await beat('l01'); await backdrop(5);
  const LIM = ['The layer types, the body heights and one excluded area of the processed set were stated by the product\'s command line with the owner\'s settings; they are not typed in this take.',
    'A set whose plans state no level gets level 0 as an orange default; a plan title that names a storey is refused, its level is yours to state.',
    'After Accept all and ' + typed + ' stated heights, ' + v1.blocking + ' items still block Convert here: layer types, body heights and the roof are not stated in this take.',
    'The sheets here are a client\'s private drawings; the set is not published.',
    'Recorded on a desktop browser at 133 % zoom; a phone is not measured.'];
  fact('limits', LIM);
  await card('<div style="font-size:19px;color:#9aa3b2;letter-spacing:3px;margin-bottom:20px">WHAT THIS FILM DOES NOT SHOW, AND WHAT IS NOT DONE YET</div><div style="text-align:left;font-size:21px;line-height:1.75;max-width:1200px">' + LIM.map(x => '· ' + esc(x)).join('<br>') + '</div>');
  await beat('end');
  await card('<div style="font-size:20px;color:#9aa3b2;line-height:1.8">A common BricsCAD 2D set: nine drawings, one shed<br>Modeller: red1oon.github.io/bim-ootb/modeller · every number from this take</div>');
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
