#!/usr/bin/env node
// ⚠ DO NOT REMOVE — §ALTS_ALL GIGO witness harness (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "### ALTS-ALL BUILD").
// Scope: every pending Alt+S fix on fix/alts-all + every bake channel this lane touches, judged by NUMBERS, with explicit
// INCONCLUSIVE / VACUOUS / NO-OP / SCOPE-BLIND states. READ THE LOG (<out>/alts_all.log) AFTER EVERY RUN — the exit code is not evidence.
// ISSUE IT EXPOSES: a witness that passes on garbage-in — a stale SW / wrong tree served, a meter that read an all-sky frame, a fix whose
// switch is dead or whose effect is zero, a bake with black/reused frames or a double page init — must not print PASS.
// Channels: (1) Alt+S stills (puppeteer, fresh profile per press, real key press); (2) --film: cli_silent_bake.js parity A, control C
// (--film-exposure 0 --film-fill restore), parity-off E (--film-parity 0), torch-off T (--url-query &torch=0), optional base B
// (--base-tree); (3) --altc N: the in-browser Alt+C MaxQ recorder (APP.startMaxQualityOrbit, the function scene.js's Alt+C calls,
// frames capped at N) — its console log + downloaded mp4. Per-frame luma from §FRAME_QA (in page) and ffprobe (the file).
// RUN ONCE, PERSIST, READ FOREVER: raw records go to <out>/raw; --judge <out> re-judges without a browser; a record is re-run only
// with --rerun. One GPU browser at a time (strictly sequential).
// USAGE (GPU agent):
//   node ~/bin/serve_tree.js /tmp/wt-all 8640 &
//   node viewer/tests/witness_alts_all.js --port 8640 --tree /tmp/wt-all --out /tmp/alts_all [--poses a,b] [--arms default|all|a,b]
//        [--arm-poses p,q] [--noise] [--film] [--film-only] [--altc 90] [--base-tree /tmp/wt-torch] [--frame-range 0:90] [--db-film HospitalAjaibPath]
//   node viewer/tests/witness_alts_all.js --judge /tmp/alts_all          # re-judge persisted records only
//   node viewer/tests/witness_alts_all.js --selftest                      # fixture red controls, no browser
//   node viewer/tests/witness_alts_all.js --plan ...                      # print the press/bake plan + time estimate, run nothing
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), vm = require('vm'), cp = require('child_process');
const J = require('./alts_all_judge.js');
const argv = process.argv.slice(2), arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; }, has = n => argv.includes('--' + n);
const TREE = path.resolve(arg('tree', path.join(__dirname, '..', '..'))), PORT = +arg('port', 8640), OUT = path.resolve(arg('out', has('judge') ? arg('judge') : '/tmp/alts_all'));
const EDITED = ['light_law.js', 'sourced_light.js', 'effects.js', 'gi_still.js', 'light_zones.js', 'cinema_maxq.js'];
const POSES = {
  clinic: ['Clinic', '&ghost=1', [21.243, -0.606, -1.261], [1.197, -4.155, -2.608]], inner: ['Hospital', '&ghost=1', [9.947, -7.699, 0.098], [14.735, -8.114, 2.081]],
  term: ['Terminal', '', [7.473, -7.532, 1.036], [6.397, -8.016, 3.054]], p2: ['Hospital', '&ghost=1', [-7.307, -6.507, 12.017], [-2.403, -7.682, 3.378]],
  night: ['Hospital', '&ghost=1', [33.5, 8.121, 11.498], [0, 0, 0]], p614: ['Hospital', '&ghost=1', [-23.76, 3.076, -4.558], [-20.601, 1.748, -1.316]],
  p698: ['Hospital', '&ghost=1', [-5.864, -6.079, 16.896], [-5.384, -6.921, 12.025]], p672: ['Hospital', '&ghost=1', [-13.552, 1.366, -1.289], [-10.764, 0.228, 1.354]],
  a616: ['Hospital', '&ghost=1', [26.431, 36.87, 42.209], [-4.751, -4.707, 11.027]], a202: ['Hospital', '&ghost=1', [-44.334, 20.357, 48.696], [-2.924, -11.908, 7.912]],
  plenum: ['Hospital', '&ghost=1', [-20.496, -5.619, -34.439], [-23.527, -6.051, -22.952]], hhs_z18: ['HHS_Office_Federated', '&ghost=1', [-10.011, -4.496, -21.246], [0.306, -2.129, 0.238]]
};
const ARM_POSES = { torch0: ['inner', 'night'], srgbfix0: ['inner'], groundlaw0: ['night'], aoindirect0: ['inner'], gialb0: ['inner'], skyshell0: ['a202'], shellreach2: ['a202'], gridblend1: ['hhs_z18'], specsmooth0: ['hhs_z18'], meterband7095: ['inner', 'night'] };
const log = (() => { let fd = null; return s => { console.log(s); try { if (!fd) { fs.mkdirSync(OUT, { recursive: true }); fd = fs.openSync(path.join(OUT, 'alts_all.log'), 'a'); } fs.writeSync(fd, s + '\n'); } catch (e) {} }; })();
const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };

// ── node facts of the tree (what the served page MUST match)
function treeFacts(tree) {
  const V = path.join(tree, 'viewer'), html = fs.readFileSync(path.join(V, 'viewer.html'), 'utf8'), sw = (/CACHE_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(V, 'sw.js'), 'utf8')) || [])[1];
  const versions = {}, hashes = {}; EDITED.forEach(f => { const m = new RegExp(f.replace('.', '\\.') + '\\?v=(\\d+)').exec(html); versions[f] = m ? m[1] : null; hashes[f] = fnv(fs.readFileSync(path.join(V, f), 'utf8')); });
  delete require.cache[require.resolve(path.join(V, 'light_law.js'))]; const LL = require(path.join(V, 'light_law.js'));
  const w = { location: { search: '' } }; w.window = w; vm.runInNewContext(fs.readFileSync(path.join(V, 'light_zones.js'), 'utf8'), { window: w, console: { log() {}, warn() {} }, location: w.location, performance: { now: () => 0 } });
  let commit = '?'; try { commit = cp.execFileSync('git', ['-C', tree, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) {}
  return { tree, commit, sw, versions, hashes, lawHash: LL.hash(LL.LAW), lzSrc: w.LightZones.cacheKey() };
}
// ── minimal PNG reader (8-bit RGB/RGBA, non-interlaced: what canvas.toBlob writes) + tEXt chunks
function readPng(buf) {
  let p = 8, w = 0, h = 0, ct = 0, idat = [], text = {};
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } else if (type === 'IDAT') idat.push(d); else if (type === 'tEXt') { const z = d.indexOf(0); text[d.toString('latin1', 0, z)] = d.toString('latin1', z + 1); }
    p += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * bpp), st = w * bpp;
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], r = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), o = y * st;
    for (let x = 0; x < st; x++) { const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - st + x] : 0, c = (x >= bpp && y) ? px[o - st + x - bpp] : 0; let v = r[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      px[o + x] = v & 255; } }
  const L = new Float32Array(w * h); let c15 = 0, c250 = 0; for (let i = 0; i < w * h; i++) { const r = px[i * bpp], g = px[i * bpp + 1], b = px[i * bpp + 2]; L[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b; if ((r + g + b) / 3 <= 15) c15++; if (L[i] >= 250) c250++; }
  const so = Float32Array.from(L).sort(), q = f => +so[Math.floor(so.length * f)].toFixed(1);
  return { w, h, text, stats: { p5: q(.05), p50: q(.5), p95: q(.95), le15pct: +(100 * c15 / (w * h)).toFixed(3), ge250pct: +(100 * c250 / (w * h)).toFixed(2) } };
}
// ── in-page facts after a press (lum.js definitions: composite = __giStillDebugCanvas.bounce where alpha > 0)
const PAGE_FACTS = async (edited, z8) => {
  const A = window.APP, R = A.renderer, D = window.__giStillDebugCanvas, out = { programs: R.info.programs ? R.info.programs.length : null };
  out.scripts = Array.from(document.scripts).map(s => (s.getAttribute('src') || '').split('/').pop()).filter(Boolean);
  const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  out.fileHash = {}; for (const f of edited) { const src = out.scripts.find(s => s.split('?')[0] === f); if (src) try { out.fileHash[f] = fnv(await (await fetch(src, { cache: 'no-store' })).text()); } catch (e) {} }
  try { out.swServed = (/CACHE_VERSION = '([^']+)'/.exec(await (await fetch('sw.js', { cache: 'no-store' })).text()) || [])[1]; } catch (e) {}
  out.swCtlAtLoad = window.__swCtlAtLoad; out.lawHash = window.LightLaw ? window.LightLaw.snapshot().lawHash : null; out.lzSrc = window.LightZones ? window.LightZones.cacheKey() : null;
  out.pose = A._stillPoseLast ? { cam: A._stillPoseLast.cam, tgt: A._stillPoseLast.tgt, sw: A._stillPoseLast.sw } : null;
  let w = 0, h = 0, fin = null, app = null;
  if (D && D.bounce && D.under) { w = D.under.width; h = D.under.height; fin = D.bounce.getContext('2d').getImageData(0, 0, w, h).data; app = D.under.getContext('2d').getImageData(0, 0, w, h).data; out.compSrc = 'bounce'; }
  else { const c = document.createElement('canvas'); w = c.width = R.domElement.width; h = c.height = R.domElement.height; c.getContext('2d').drawImage(R.domElement, 0, 0); app = c.getContext('2d').getImageData(0, 0, w, h).data; out.compSrc = 'app'; }
  const L = new Float32Array(w * h); let s = 0, c250 = 0, c15 = 0;
  for (let i = 0, p = 0; p < w * h; i += 4, p++) { const src = fin && fin[i + 3] > 0 ? fin : app, r = src[i], g = src[i + 1], b = src[i + 2], l = 0.2126 * r + 0.7152 * g + 0.0722 * b; L[p] = l; s += l; if (l >= 250) c250++; if ((r + g + b) / 3 <= 15) c15++; }
  const so = L.slice().sort(), q = f => +so[Math.floor(so.length * f)].toFixed(1);
  out.comp = { p5: q(.05), p50: q(.5), p95: q(.95), mean: +(s / (w * h)).toFixed(2), ge250pct: +(100 * c250 / (w * h)).toFixed(2), le15pct: +(100 * c15 / (w * h)).toFixed(3), w, h };
  // Z18 step proxy: isolated jumps >= 4 codes (neighbours' gradients < 1.5) along rows of the lower half, per 1000 px
  let n = 0, st = 0; for (let y = h >> 1; y < h; y += 2) for (let x = 1; x < w - 2; x++) { const i = y * w + x, g0 = Math.abs(L[i] - L[i - 1]), g1 = Math.abs(L[i + 1] - L[i]), g2 = Math.abs(L[i + 2] - L[i + 1]); n++; if (g1 >= 4 && g0 < 1.5 && g2 < 1.5) st++; }
  out.steps = { n, per1000: +(1000 * st / Math.max(1, n)).toFixed(3) };
  if (z8 && window.LightZones && window.LightZones.get()) { const Z = window.LightZones.get(); out.z8cells = z8.map(c => ({ cell: c, zone: Z.zone[c], F: (Z.field && Z.zone[c] !== 65535 && (Z.zone[c] & 0x3FFF) !== 0) ? Z.field.G[c] / 1e4 : null })); }
  return out;
};
async function pressStill(puppeteer, pose, arm, T) {
  const [DB, Q0, CAM, TGT] = POSES[pose], armQ = arm === 'base' || /^base_r/.test(arm) ? '' : J.FIXES[arm].q, q = Q0 + armQ;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'altsall-prof-')), dl = path.join(OUT, 'png', pose + '__' + arm); fs.mkdirSync(dl, { recursive: true });
  const rec = { pose, arm, db: DB, q, cam: CAM, tgt: TGT, lines: [], started: new Date().toISOString() };
  let b = null; const t0 = Date.now();
  try {
    b = await puppeteer.launch({ headless: true, userDataDir: prof, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
      args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--window-size=1705,1054'].concat((arg('chrome-args', '') || '').split(/\s+/).filter(Boolean)) });
    const p = await b.newPage(); await p.setViewport({ width: 1685, height: 874 });
    const cdp = await p.target().createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    await p.evaluateOnNewDocument(() => { window.__swCtlAtLoad = !!(navigator.serviceWorker && navigator.serviceWorker.controller); });
    p.on('console', m => rec.lines.push(m.text().replace(/\n/g, '\\n'))); p.on('pageerror', e => rec.lines.push('PAGEERROR ' + e.message));
    rec.url = 'http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + DB + '_extracted.db' + q;
    await p.goto(rec.url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    const cnt = () => p.evaluate(() => window.APP && window.APP.guidMap ? Object.keys(window.APP.guidMap).length : 0);
    let last = -1, same = 0; for (let i = 0; i < 300 && same < 4; i++) { await new Promise(r => setTimeout(r, 2000)); const n = await cnt(); if (n > 0 && n === last) same++; else same = 0; last = n; }
    rec.elements = last; rec.loadSecs = (Date.now() - t0) / 1000;
    await p.evaluate((c, t) => { const A = window.APP; A.camera.position.fromArray(c); A.controls.target.fromArray(t); A.controls.update(); }, CAM, TGT);
    await new Promise(r => setTimeout(r, 500)); const j0 = rec.lines.length, tp = Date.now();
    await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
    let ok = false; for (let i = 0; i < 2800 && !ok; i++) { ok = rec.lines.slice(j0).some(t => /§GI_STILL result|§GI_STILL_FAIL|§GI_STILL_OFF/.test(t)); if (!ok) await new Promise(r => setTimeout(r, 250)); }
    if (ok && rec.lines.slice(j0).some(t => /§GI_STILL_OFF/.test(t))) for (let i = 0; i < 1200 && !rec.lines.slice(j0).some(t => /§STILL_REFINE done/.test(t)); i++) await new Promise(r => setTimeout(r, 250));
    await new Promise(r => setTimeout(r, 1500)); rec.pressSecs = +((Date.now() - tp) / 1000).toFixed(1); rec.timeout = !ok;
    rec.eval = await p.evaluate(PAGE_FACTS, EDITED, pose === 'a202' ? [9911662, 9911663] : null);
    const clicked = await p.evaluate(() => { const bt = Array.from(document.querySelectorAll('#gi-still-overlay button')).find(x => /Save PNG/.test(x.textContent)); if (bt) { bt.click(); return true; } return false; });
    if (clicked) { for (let i = 0; i < 60; i++) { const f = fs.readdirSync(dl).filter(x => /\.png$/.test(x)); if (f.length) { await new Promise(r => setTimeout(r, 800)); try { const P = readPng(fs.readFileSync(path.join(dl, f[0]))); rec.png = { file: path.join(dl, f[0]), w: P.w, h: P.h, stats: P.stats, pose: P.text['bim-still-pose'] ? JSON.parse(P.text['bim-still-pose']) : null }; } catch (e) { rec.png = { err: e.message }; } break; } await new Promise(r => setTimeout(r, 500)); } }
  } catch (e) { rec.fatal = e.message; }
  finally { try { if (b) await b.close(); } catch (e) {} try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} }
  rec.wallSecs = (Date.now() - t0) / 1000; return rec;
}
// ── film channels
function ffFrames(mp4) {
  if (!fs.existsSync(mp4)) return [];
  try { const y = cp.execFileSync('ffprobe', ['-v', 'error', '-f', 'lavfi', '-i', 'movie=' + mp4 + ',signalstats', '-show_entries', 'frame_tags=lavfi.signalstats.YAVG', '-of', 'csv=p=0'], { maxBuffer: 1 << 26 }).toString().trim().split('\n').map(Number);
    const m = cp.execFileSync('ffmpeg', ['-v', 'error', '-i', mp4, '-f', 'framemd5', '-'], { maxBuffer: 1 << 26 }).toString().split('\n').filter(l => l && l[0] !== '#').map(l => l.split(',').pop().trim());
    return y.map((v, i) => ({ i, yavg: +((v - 16) * 255 / 219).toFixed(2), yavgRaw: v, md5: m[i] || null }));
  } catch (e) { return [{ i: -1, yavg: NaN, err: e.message }]; }   // yavg: limited-range Y (16..235) -> full 0..255, same scale as §FRAME_QA
}
const TAP = `window.__maxqTapReport = function () { var A = window.APP; return { lines: [], scripts: Array.from(document.scripts).map(function (s) { return (s.getAttribute('src') || '').split('/').pop(); }).filter(Boolean),
  lawHash: window.LightLaw ? window.LightLaw.snapshot().lawHash : null, swCtl: !!(navigator.serviceWorker && navigator.serviceWorker.controller), programs: A && A.renderer && A.renderer.info.programs ? A.renderer.info.programs.length : null }; };`;
function runBake(armK, tree, extra) {
  const dir = path.join(OUT, 'film'); fs.mkdirSync(dir, { recursive: true }); const out = path.join(dir, armK + '.mp4'), lg = path.join(dir, armK + '.log'), tap = path.join(dir, 'tap.js'); fs.writeFileSync(tap, TAP);
  if (fs.existsSync(lg) && !has('rerun')) { log('  film ' + armK + ': persisted log reused (' + lg + ')'); return; }
  const args = [path.join(tree, 'cli_silent_bake.js'), '--db', arg('db-film', 'HospitalAjaibPath'), '--gpu', 'real', '--fps', '15', '--frame-range', arg('frame-range', '0:90'), '--out', out, '--log', lg, '--tap', tap, '--port', String(+PORT + 20)].concat(extra, (arg('film-flags', '--clash --measure --label')).split(/\s+/).filter(Boolean));
  log('  film ' + armK + ': node ' + args.join(' ')); const t = Date.now();
  try { cp.execFileSync('node', args, { cwd: tree, stdio: ['ignore', 'ignore', 'ignore'], timeout: 3600e3 }); } catch (e) { log('  film ' + armK + ' exit ' + (e.status != null ? e.status : e.message)); }
  log('  film ' + armK + ' wall ' + ((Date.now() - t) / 1000).toFixed(0) + ' s');
}
function loadBake(armK) {
  const dir = path.join(OUT, 'film'), lg = path.join(dir, armK + '.log'); if (!fs.existsSync(lg)) return null;
  const lines = fs.readFileSync(lg, 'utf8').split('\n'), q = (lines.find(l => /§CLI_BAKE_NAV/.test(l)) || '');
  let tap = null; try { tap = JSON.parse(fs.readFileSync(path.join(dir, armK + '_tap.json'), 'utf8')); } catch (e) { const tl = lines.find(l => /§CLI_BAKE_TAP/.test(l)); if (tl) try { tap = JSON.parse(tl.replace(/^.*§CLI_BAKE_TAP\s*/, '')); } catch (e2) {} }
  const fp = path.join(dir, armK + '_frames.json'); let frames = null; try { frames = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { frames = ffFrames(path.join(dir, armK + '.mp4')); try { fs.writeFileSync(fp, JSON.stringify(frames)); } catch (e2) {} }
  return { arm: armK, lines, q, tap, frames };
}
async function runAltc(puppeteer, N) {
  const dir = path.join(OUT, 'film'); fs.mkdirSync(dir, { recursive: true }); const lg = path.join(dir, 'altc.log'); if (fs.existsSync(lg) && !has('rerun')) return;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'altsall-altc-')), L = []; let b = null;
  try { b = await puppeteer.launch({ headless: true, userDataDir: prof, protocolTimeout: 3600000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }), args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--window-size=1300,760'] });
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 }); const cdp = await p.target().createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
    p.on('console', m => L.push(m.text().replace(/\n/g, '\\n'))); p.on('pageerror', e => L.push('PAGEERROR ' + e.message));
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + arg('db-film', 'HospitalAjaibPath') + '.db', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await p.waitForFunction(() => window.APP && typeof window.APP.startMaxQualityOrbit === 'function' && window.APP.guidMap && Object.keys(window.APP.guidMap).length > 0 && !window.APP.streaming, { timeout: 600000, polling: 2000 });
    await new Promise(r => setTimeout(r, 5000)); L.push('§ALTC_ENTRY APP.startMaxQualityOrbit({frames:' + N + ', fps:15}) — the function scene.js Alt+C calls, frames capped');
    await p.evaluate(n => { window.APP.startMaxQualityOrbit({ frames: n, fps: 15 }); }, N);
    for (let i = 0; i < 14400 && !L.some(t => /§MAXQ_DONE|§MAXQ_FAIL|§MAXQ_CANCEL/.test(t)); i++) await new Promise(r => setTimeout(r, 500));
    await new Promise(r => setTimeout(r, 5000)); const tap = await p.evaluate(new Function(TAP + ' return window.__maxqTapReport();')); fs.writeFileSync(path.join(dir, 'altc_tap.json'), JSON.stringify(tap));
    const f = fs.readdirSync(dir).filter(x => /\.(mp4|webm)$/.test(x) && !/^[ACETB]\.mp4$/.test(x)).map(x => path.join(dir, x)).sort((a, c) => fs.statSync(c).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (f) fs.renameSync(f, path.join(dir, 'altc.mp4'));
  } catch (e) { L.push('PAGEERROR harness: ' + e.message); } finally { try { if (b) await b.close(); } catch (e) {} fs.writeFileSync(lg, L.join('\n')); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} }
}
// ── plan + judge + report
function plan() {
  const poses = (arg('poses', Object.keys(POSES).join(','))).split(',').filter(p => POSES[p]), armsArg = arg('arms', 'default'), armList = armsArg === 'all' || armsArg === 'default' ? Object.keys(J.FIXES) : armsArg.split(',').filter(a => J.FIXES[a]);
  const jobs = poses.map(p => [p, 'base']);
  armList.forEach(a => { const ps = armsArg === 'all' ? poses : (arg('arm-poses', null) ? arg('arm-poses').split(',') : ARM_POSES[a]); ps.filter(p => POSES[p]).forEach(p => jobs.push([p, a])); });
  if (has('noise')) [...new Set(jobs.filter(j => j[1] !== 'base').map(j => j[0]))].forEach(p => jobs.push([p, 'base_r2']));
  return has('film-only') ? [] : jobs;
}
function judgeAll(T) {
  const rows = [], raw = path.join(OUT, 'raw'), recs = {}; if (fs.existsSync(raw)) fs.readdirSync(raw).filter(f => f.endsWith('.json')).forEach(f => { const r = JSON.parse(fs.readFileSync(path.join(raw, f), 'utf8')); recs[r.pose + '|' + r.arm] = r; });
  const poseState = {};
  Object.values(recs).forEach(r => { const g1 = J.g1(r, T), inst = g1.some(x => x.state !== 'PASS'); poseState[r.pose + '|' + r.arm] = inst ? 'INCONCLUSIVE' : 'OK';
    g1.forEach(x => rows.push(Object.assign(x, { pose: r.pose, arm: r.arm })));
    if (inst) { rows.push({ group: 'G1', id: 'pose verdict', state: 'INCONCLUSIVE', detail: 'instrument sanity failed — no look/fix row judged for this press', pose: r.pose, arm: r.arm }); return; }
    if (r.arm === 'base') [].concat(J.g3(r), J.g4(r), J.g5(r), J.gz(r)).forEach(x => rows.push(Object.assign(x, { pose: r.pose, arm: r.arm }))); });
  Object.values(recs).filter(r => J.FIXES[r.arm]).forEach(r => { const b = recs[r.pose + '|base'], b2 = recs[r.pose + '|base_r2'];
    if (poseState[r.pose + '|' + r.arm] !== 'OK' || !b || poseState[r.pose + '|base'] !== 'OK') { rows.push({ group: 'G2', id: J.FIXES[r.arm].name, state: 'INCONCLUSIVE', detail: 'base or arm press failed instrument sanity / missing', pose: r.pose, arm: r.arm }); return; }
    const noise = (b2 && b2.eval && b.eval && poseState[r.pose + '|base_r2'] === 'OK') ? +Math.max(Math.abs(b.eval.comp.mean - b2.eval.comp.mean), Math.abs(b.eval.comp.p50 - b2.eval.comp.p50)).toFixed(3) : null;
    J.g2(b, r, r.arm, noise).forEach(x => rows.push(Object.assign(x, { pose: r.pose, arm: r.arm }))); });
  // film
  const bakes = {}; ['A', 'C', 'E', 'T', 'B', 'altc'].forEach(k => { const x = k === 'altc' ? (() => { const lg = path.join(OUT, 'film', 'altc.log'); if (!fs.existsSync(lg)) return null; let tap = null; try { tap = JSON.parse(fs.readFileSync(path.join(OUT, 'film', 'altc_tap.json'), 'utf8')); } catch (e) {} return { arm: 'altc', lines: fs.readFileSync(lg, 'utf8').split('\n'), tap, frames: ffFrames(path.join(OUT, 'film', 'altc.mp4')) }; })() : loadBake(k); if (x) bakes[k] = x; });
  const filmRows = []; Object.keys(bakes).forEach(k => { const others = k === 'A' ? { C: bakes.C, E: bakes.E, T: bakes.T, B: bakes.B } : null; J.filmJudge(bakes[k], T, others).forEach(x => filmRows.push(Object.assign(x, { pose: 'film', arm: k }))); });
  return { rows, filmRows, nRecs: Object.keys(recs).length, bakes: Object.keys(bakes) };
}
function report(T, R) {
  const all = R.rows.concat(R.filmRows), cnt = s => all.filter(r => r.state === s).length;
  log('\n| pose | arm | group | row | state | detail |'); log('|---|---|---|---|---|---|');
  all.forEach(r => log('| ' + r.pose + ' | ' + r.arm + ' | ' + r.group + ' | ' + r.id + ' | ' + r.state + ' | ' + r.detail.replace(/\|/g, '/').slice(0, 260) + ' |'));
  const still = R.rows, stillGate = !still.length ? 'INCONCLUSIVE (no still record judged)' : J.gate(still), filmGate = !R.filmRows.length ? 'INCONCLUSIVE' : J.gate(R.filmRows);
  const incPoses = [...new Set(still.filter(r => r.id === 'pose verdict').map(r => r.pose + '/' + r.arm))];
  log('\n§ALTS_ALL_SUMMARY tree=' + T.commit + ' sw=' + T.sw + ' lawHash=' + T.lawHash + ' records=' + R.nRecs + ' bakes=' + (R.bakes.join(',') || 'none') + ' PASS=' + cnt('PASS') + ' FAIL=' + cnt('FAIL') + ' INCONCLUSIVE=' + cnt('INCONCLUSIVE') + ' VACUOUS=' + cnt('VACUOUS') + ' NO-OP=' + cnt('NO-OP') + ' SCOPE-BLIND=' + cnt('SCOPE-BLIND') + ' WARN=' + cnt('WARN'));
  log('§ALTS_ALL_VERDICT ' + stillGate + (incPoses.length ? ' inconclusivePresses=' + incPoses.join(',') : '') + ' (PASS only if no FAIL/INCONCLUSIVE/VACUOUS/NO-OP row; SCOPE-BLIND and WARN are listed, not blocking)');
  log('§BAKE_RELEASE_GATE ' + (R.filmRows.length ? filmGate : 'INCONCLUSIVE (no bake judged)') + ' — nothing ships (FF to look / any publish) unless PASS');
  fs.writeFileSync(path.join(OUT, 'alts_all.json'), JSON.stringify({ tree: T, rows: R.rows, filmRows: R.filmRows, stillGate, filmGate: R.filmRows.length ? filmGate : 'INCONCLUSIVE', when: new Date().toISOString() }, null, 1));
  return stillGate === 'PASS' && (!R.filmRows.length || filmGate === 'PASS') ? 0 : 1;
}
async function main() {
  if (has('selftest')) return require('./witness_alts_all_selftest.js').run();
  const T = treeFacts(TREE); log('§ALTS_ALL tree=' + T.tree + ' commit=' + T.commit + ' sw=' + T.sw + ' lawHash=' + T.lawHash + ' lzSrc=' + T.lzSrc + ' versions=' + JSON.stringify(T.versions));
  const jobs = has('judge') ? [] : plan(), film = has('film') || has('film-only'), altc = +arg('altc', 0);
  const bakes = film ? ['A', 'C', 'E', 'T'].concat(arg('base-tree', null) ? ['B'] : []) : [];
  log('§ALTS_ALL_PLAN presses=' + jobs.length + ' (each: fresh profile + load 60-90 s + press 15-215 s => ~2-5 min; est ' + Math.round(jobs.length * 2) + '-' + Math.round(jobs.length * 5) + ' min) bakes=' + (bakes.join(',') || 'none') + (bakes.length ? ' (~6-8 min each at 90 frames => ' + bakes.length * 6 + '-' + bakes.length * 8 + ' min)' : '') + (altc ? ' altc=' + altc + ' frames (~' + Math.round(altc * 2 / 60 + 3) + ' min)' : '') + ' full matrix = ' + Object.keys(POSES).length + ' poses x ' + (Object.keys(J.FIXES).length + 1) + ' arms = ' + Object.keys(POSES).length * (Object.keys(J.FIXES).length + 1) + ' presses');
  jobs.forEach(j => log('  press ' + j[0] + ' / ' + j[1] + ' -> ' + POSES[j[0]][0] + POSES[j[0]][1] + (J.FIXES[j[1]] ? J.FIXES[j[1]].q : '')));
  if (has('plan')) return 0;
  if (jobs.length || altc) {
    const puppeteer = require(process.env.PUPPETEER_PATH || '/home/red1/bim-compiler/node_modules/puppeteer'); fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });
    for (const [p, a] of jobs) { const f = path.join(OUT, 'raw', p + '__' + a + '.json'); if (fs.existsSync(f) && !has('rerun')) { log('  ' + p + '/' + a + ': persisted record reused'); continue; }
      log('  pressing ' + p + '/' + a + ' ...'); const r = await pressStill(puppeteer, p, a, T); fs.writeFileSync(f, JSON.stringify(r)); log('  ' + p + '/' + a + ' done wall ' + r.wallSecs.toFixed(0) + ' s' + (r.fatal ? ' FATAL ' + r.fatal : '') + (r.timeout ? ' TIMEOUT' : '')); }
    if (altc) await runAltc(puppeteer, altc);
  }
  if (film) { runBake('A', TREE, []); runBake('C', TREE, ['--film-exposure', '0', '--film-fill', 'restore']); runBake('E', TREE, ['--film-parity', '0']); runBake('T', TREE, ['--url-query', '&torch=0']); if (arg('base-tree', null)) runBake('B', path.resolve(arg('base-tree')), []); }
  return report(T, judgeAll(T));
}
module.exports = { readPng, treeFacts, judgeAll, report, POSES, ARM_POSES, EDITED };
if (require.main === module) main().then(c => { process.exitCode = c; }).catch(e => { log('§ALTS_ALL FATAL ' + (e && e.stack)); process.exitCode = 2; });
