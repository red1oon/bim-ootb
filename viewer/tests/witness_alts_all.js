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
const EDITED = ['light_law.js', 'sourced_light.js', 'effects.js', 'gi_still.js', 'light_zones.js', 'cinema_maxq.js', 'glass_fresnel.js', 'streaming.js'];   // pass 3: + the FIX 11 / FIX 14 files
const POSES = {
  clinic: ['Clinic', '&ghost=1', [21.243, -0.606, -1.261], [1.197, -4.155, -2.608]], inner: ['Hospital', '&ghost=1', [9.947, -7.699, 0.098], [14.735, -8.114, 2.081]],
  term: ['Terminal', '', [7.473, -7.532, 1.036], [6.397, -8.016, 3.054]], p2: ['Hospital', '&ghost=1', [-7.307, -6.507, 12.017], [-2.403, -7.682, 3.378]],
  night: ['Hospital', '&ghost=1', [33.5, 8.121, 11.498], [0, 0, 0]], p614: ['Hospital', '&ghost=1', [-23.76, 3.076, -4.558], [-20.601, 1.748, -1.316]],
  p698: ['Hospital', '&ghost=1', [-5.864, -6.079, 16.896], [-5.384, -6.921, 12.025]], p672: ['Hospital', '&ghost=1', [-13.552, 1.366, -1.289], [-10.764, 0.228, 1.354]],
  a616: ['Hospital', '&ghost=1', [26.431, 36.87, 42.209], [-4.751, -4.707, 11.027]], a202: ['Hospital', '&ghost=1', [-44.334, 20.357, 48.696], [-2.924, -11.908, 7.912]],
  plenum: ['Hospital', '&ghost=1', [-20.496, -5.619, -34.439], [-23.527, -6.051, -22.952]],
  // ### ALTS-ALL FIX 4: the inner room camera moved along its own centre ray to 1.5 m from the centre hit (18.1,-8.4,3.5) (§LIGHT_STACK
  // point of the inner press): 900 cd at 1.5 m = 400 lx, where the torch must act; at 8.9 m (inner) it is 11 lx = physics, not a dead switch.
  inner_close: ['Hospital', '&ghost=1', [16.72, -8.28, 2.92], [18.1, -8.4, 3.5]],
  // DEFECT 6 (red1, v1464): Terminal interior stills where the glass went opaque in a long-lived tab (poses from the PNG tEXt of
  // ~/Downloads/bounce_still_17904958084 84/…6624063/…6658867/…6698786/…6721496/…6748431, in press order)
  tr1: ['Terminal', '', [24.432, -3.418, -6.092], [20.064, -5.41, -6.429]], tr2: ['Terminal', '', [14.751, -8.142, -10.258], [15.154, -7.431, -5.685]],
  tr3: ['Terminal', '', [13.795, -12.718, 8.441], [11.243, -14.311, 3.019]], tr4: ['Terminal', '', [-7.989, -16.079, 11.597], [-9.975, -14.634, 8.118]],
  tr5: ['Terminal', '', [-24.776, -10.142, -8.08], [-9.975, -14.634, 8.118]], tr6: ['Terminal', '', [-18.614, -11.684, -12.335], [-9.975, -14.634, 8.118]], hhs_z18: ['HHS_Office_Federated', '&ghost=1', [-10.011, -4.496, -21.246], [0.306, -2.129, 0.238]]
};
const ARM_POSES = { torch0: ['inner_close', 'inner', 'night'], srgbfix0: ['inner'], groundlaw0: ['night'], aoindirect0: ['inner'], gialb0: ['inner'], skyshell0: ['a202'], shellreach2: ['a202'], gridblend1: ['hhs_z18'], specsmooth0: ['hhs_z18'], meterband7095: ['inner', 'night'], gibound0: ['plenum'], metalpbr0: ['plenum'] };
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
// ### ALTS-ALL FIX 3: GPU memory per press — nvidia-smi every 3 s: total used + per-pid (the press's chrome gpu-process and every other
// GPU process, e.g. the user's own browser). Peak + the pid table at the peak go into rec.gpu and a §ALTS_GPU_MEM log line.
function gpuSample() {
  try { const tot = cp.execFileSync('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'], { timeout: 5000 }).toString().trim().split(',').map(Number);
    const apps = cp.execFileSync('nvidia-smi', ['--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits'], { timeout: 5000 }).toString().trim().split('\n').filter(Boolean).map(l => l.split(',').map(x => +x.trim()));
    return { t: Date.now(), used: tot[0], total: tot[1], apps };
  } catch (e) { return { t: Date.now(), err: e.message.slice(0, 80) }; }
}
function gpuWatch(browserPid) {
  const S = [], desc = pid => { try { return fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\0').join(' '); } catch (e) { return ''; } };
  const tick = () => { const g = gpuSample(); if (g.apps) g.apps = g.apps.map(([pid, mb]) => { const c = desc(pid); return { pid, mb, mine: browserPid != null && c.includes('altsall-'), gpuProc: /--type=gpu-process/.test(c), who: c.includes('altsall-') ? 'press' : (c.split(' ')[0] || '?').split('/').pop() }; }); S.push(g); };
  tick(); const h = setInterval(tick, 3000);
  return { stop() { clearInterval(h); tick(); const ok = S.filter(g => g.used != null), pk = ok.reduce((a, g) => (!a || g.used > a.used) ? g : a, null);
    const mine = ok.map(g => (g.apps || []).filter(a => a.mine).reduce((s, a) => s + a.mb, 0)), mpk = mine.length ? Math.max(...mine) : null;
    return { samples: ok.length, baseline: ok.length ? ok[0].used : null, peakUsed: pk ? pk.used : null, total: pk ? pk.total : null, pressPeakMB: mpk, atPeak: pk ? pk.apps : null, err: S.find(g => g.err) ? S.find(g => g.err).err : null }; } };
}
// DEFECT 6: glass see-through. Glass pixels = a 32x18 ray grid whose FIRST hit is a glass material (a §GLASS_FRESNEL clone, or
// transparent with opacity < 0.95, or transmission > 0). At those pixels: the staged scene rendered linear into a float target with the
// glass visible vs hidden (prime render first: a new program key gets fresh uniforms, ### ALTS-ALL FIX 1) -> ratio = L_vis / L_hid;
// physical: T x background + Fresnel x env, no diffuse => ratio in [0.5 T, T + 0.5] (T = 1 - opacity). Plus the composite luma there.
const GLASS_FACTS = async () => {
  const A = window.APP, R = A.renderer, THREE = window.THREE, D = window.__giStillDebugCanvas, out = { n: 0 };
  const isG = m => m && ((m.userData && m.userData.gfOf) || (m.transparent && m.opacity < 0.95) || m.transmission > 0);
  const meshes = []; A.scene.traverse(o => { if (o.visible && (o.isMesh || o.isBatchedMesh || o.isInstancedMesh) && o !== A._sky) meshes.push(o); });
  const rc = new THREE.Raycaster(), GX = 32, GY = 18, samp = [], gObjs = new Set(); let tRay = performance.now();
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) { const u = (gx + 0.5) / GX, v = (gy + 0.5) / GY; rc.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), A.camera);
    const h = rc.intersectObjects(meshes, false)[0]; if (!h) continue; const ms = Array.isArray(h.object.material) ? h.object.material : [h.object.material]; const m = ms[(h.face && h.face.materialIndex) || 0] || ms[0];
    if (isG(m)) { samp.push({ u, v, T: 1 - (m.opacity != null ? m.opacity : 1), clone: !!(m.userData && m.userData.gfOf), d: +h.distance.toFixed(2) }); gObjs.add(h.object); } }
  out.rayMs = Math.round(performance.now() - tRay); out.n = samp.length; if (!samp.length) return out;
  const W = 320, H = 180, rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, depthBuffer: true }), prev = R.getRenderTarget();
  const rd = () => { R.setRenderTarget(rt); R.clear(true, true, true); R.render(A.scene, A.camera); R.clear(true, true, true); R.render(A.scene, A.camera); const b = new Float32Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, b); return b; };
  const hideAll = []; A.scene.traverse(o => { if (!o.visible || !o.material) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; if (ms.every(isG)) hideAll.push(o); });
  let bv, bh; try { bv = rd(); hideAll.forEach(o => { o.visible = false; }); bh = rd(); } finally { hideAll.forEach(o => { o.visible = true; }); R.setRenderTarget(prev); rt.dispose(); }
  const Lat = (b, u, v) => { const x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(H - 1, Math.floor((1 - v) * H)), i = (y * W + x) * 4; return 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2]; };
  let cw = 0, ch = 0, cd = null, ud = null; if (D && D.bounce) { cw = D.bounce.width; ch = D.bounce.height; cd = D.bounce.getContext('2d').getImageData(0, 0, cw, ch).data; if (D.under) ud = D.under.getContext('2d').getImageData(0, 0, cw, ch).data; }
  const rows = samp.map(s => { const lv = Lat(bv, s.u, s.v), lh = Lat(bh, s.u, s.v); let cl = null; if (cd) { const i = (Math.min(ch - 1, Math.floor(s.v * ch)) * cw + Math.min(cw - 1, Math.floor(s.u * cw))) * 4; const src = cd[i + 3] > 0 ? cd : ud; cl = src ? 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2] : null; /* the saved image: bounce where alpha > 0, else the app frame (as PAGE_FACTS) */ } let ul = null, ba = null; if (cd && ud) { const i = (Math.min(ch - 1, Math.floor(s.v * ch)) * cw + Math.min(cw - 1, Math.floor(s.u * cw))) * 4; ul = 0.2126 * ud[i] + 0.7152 * ud[i + 1] + 0.0722 * ud[i + 2]; ba = cd[i + 3]; }
    return { T: s.T, lv, lh, r: lh > 1e-6 ? lv / lh : null, cl, ul, ba, clone: s.clone }; });
  const q = (a, f) => { const so = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return so.length ? +so[Math.floor(so.length * f)].toFixed(3) : null; };
  const rr = rows.map(x => x.r), okN = rows.filter(x => x.r != null && x.r >= 0.5 * x.T && x.r <= x.T + 0.5).length;
  Object.assign(out, { T: q(rows.map(x => x.T), 0.5), ratioP10: q(rr, 0.1), ratioP50: q(rr, 0.5), ratioP90: q(rr, 0.9), inBandPct: +(100 * okN / rows.length).toFixed(1), compL: q(rows.map(x => x.cl), 0.5), appL: q(rows.map(x => x.ul), 0.5), keepAbs: (() => { const d = rows.filter(x => x.cl != null && x.ul != null).map(x => Math.abs(x.cl - x.ul)); return d.length ? +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(2) : null; })(), bouncePct: +(100 * rows.filter(x => x.ba > 0).length / rows.length).toFixed(1), nanN: rows.filter(x => !isFinite(x.lv)).length, appBlackPct: +(100 * rows.filter(x => x.ul != null && x.ul <= 2).length / rows.length).toFixed(1),   /* ### ALTS-ALL FIX 14 */ clones: rows.filter(x => x.clone).length, hidden: hideAll.length, objs: gObjs.size });
  return out;
};
// ### ALTS-ALL FIX 10 (D1, red1 ruling 2): classify every CLIPPED pixel (L >= 250) of the saved composite by the surface under it, read
// from the staged scene: pass (b) first surface — lit opaque -> black, glass -> blue (after opaque, no depth write), any non-lit
// material (MeshBasic emitters, sprites, points, lines, raw shaders) -> red, background off; pass (a) — glass + non-lit hidden,
// SourcedLight.debugZones(1) (§SOURCED_LIGHT_ZONE_DEBUG: R,G = slFragZone zone) into a float target. EMITTER | EXTERIOR (sky, zone 0
// = outdoors, 65534 = off-grid) | INTERIOR (zone > 0). Percentages are of ALL frame pixels (the band's clip % is too).
const CLIP_FACTS = async () => {
  const A = window.APP, R = A.renderer, THREE = window.THREE, D = window.__giStillDebugCanvas, SL = window.SourcedLight, out = {};
  let cw, ch, img; if (D && D.bounce && D.under) { cw = D.under.width; ch = D.under.height; const fin = D.bounce.getContext('2d').getImageData(0, 0, cw, ch).data, app = D.under.getContext('2d').getImageData(0, 0, cw, ch).data; img = new Uint8ClampedArray(cw * ch * 4); for (let i = 0; i < img.length; i += 4) { const s = fin[i + 3] > 0 ? fin : app; img[i] = s[i]; img[i + 1] = s[i + 1]; img[i + 2] = s[i + 2]; } }
  else return { err: 'no composite canvas' };
  const clipIdx = []; for (let p = 0, i = 0; p < cw * ch; p++, i += 4) if (0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2] >= 250) clipIdx.push(p);
  out.w = cw; out.h = ch; out.clipped = clipIdx.length; out.clipPct = +(100 * clipIdx.length / (cw * ch)).toFixed(3);
  if (!clipIdx.length) { out.interiorPct = 0; out.exteriorPct = 0; out.emitterPct = 0; out.glassBackedPct = 0; return out; }
  if (!SL || !SL.debugZones || !(SL.isActive && SL.isActive())) return Object.assign(out, { err: 'sourced light not staged (no zone readback)' });
  const LIT = m => m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);
  const GLS = m => m && ((m.userData && m.userData.gfOf) || (m.transparent && m.opacity < 0.95) || m.transmission > 0);
  const objs = []; A.scene.traverse(o => { if (o.visible && o.material && (o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isSprite || o.isPoints || o.isLine)) objs.push(o); });
  const mk = (c, tr) => new THREE.MeshBasicMaterial({ color: c, transparent: !!tr, opacity: 1, depthWrite: !tr, side: THREE.DoubleSide });
  const M = { o: mk(0x000000), g: mk(0x0000ff, true), e: mk(0xff0000) }, SP = new THREE.SpriteMaterial({ color: 0xff0000 }), PT = new THREE.PointsMaterial({ color: 0xff0000 }), LN = new THREE.LineBasicMaterial({ color: 0xff0000 });
  const kind = m => GLS(m) ? 'g' : (LIT(m) ? 'o' : 'e');
  const saved = objs.map(o => [o, o.material]), bg = A.scene.background, fog = A.scene.fog, sky = A._sky, skyV = sky ? sky.visible : null, prev = R.getRenderTarget(), cc = R.getClearColor(new THREE.Color()), ca = R.getClearAlpha();
  const rt = new THREE.WebGLRenderTarget(cw, ch, { type: THREE.FloatType, depthBuffer: true }), B = new Float32Array(cw * ch * 4), Z = new Float32Array(cw * ch * 4);
  const hid = [];
  try {
    A.scene.background = null; A.scene.fog = null; if (sky) sky.visible = false; R.setClearColor(0x000000, 0);
    objs.forEach(o => { if (o.isSprite) o.material = SP; else if (o.isPoints) o.material = PT; else if (o.isLine) o.material = LN; else o.material = Array.isArray(o.material) ? o.material.map(m => M[kind(m)]) : M[kind(o.material)]; });
    R.setRenderTarget(rt); R.clear(true, true, true); R.render(A.scene, A.camera); R.readRenderTargetPixels(rt, 0, 0, cw, ch, B);
    saved.forEach(([o, m]) => { o.material = m; });
    // pass (a): glass + non-lit hidden (per material in arrays: material.visible = false), zone readback
    const mv = new Map(); objs.forEach(o => { if (o.isSprite || o.isPoints || o.isLine) { o.visible = false; hid.push(o); return; } (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && kind(m) !== 'o' && !mv.has(m)) { mv.set(m, m.visible); m.visible = false; } }); });
    SL.debugZones(1); R.setRenderTarget(rt); R.clear(true, true, true); R.render(A.scene, A.camera); R.render(A.scene, A.camera); R.readRenderTargetPixels(rt, 0, 0, cw, ch, Z);
    mv.forEach((v, m) => { m.visible = v; });
  } finally { SL.debugZones(0); saved.forEach(([o, m]) => { o.material = m; }); hid.forEach(o => { o.visible = true; }); A.scene.background = bg; A.scene.fog = fog; if (sky) sky.visible = skyV; R.setRenderTarget(prev); R.setClearColor(cc, ca); rt.dispose(); [M.o, M.g, M.e, SP, PT, LN].forEach(m => m.dispose()); }
  let nI = 0, nX = 0, nE = 0, nG = 0, nU = 0; const zs = {};
  clipIdx.forEach(p => { const x = p % cw, y = (p / cw) | 0, i = ((ch - 1 - y) * cw + x) * 4;   // float target rows are bottom-up
    const r = B[i], g = B[i + 1], b = B[i + 2], a = B[i + 3], glassFront = a > 0.5 && b > 0.5 && b > r;
    if (a > 0.5 && r > 0.5 && r >= b) { nE++; return; }
    if (Z[i + 3] < 0.5) { nX++; if (glassFront) nG++; return; }   // no opaque surface: sky
    const zr = Math.round(Z[i] * 255), zg = Math.round(Z[i + 1] * 255), zone = zr + 256 * zg, exact = Math.abs(Z[i] * 255 - zr) < 0.02 && Math.abs(Z[i + 1] * 255 - zg) < 0.02;
    if (!exact) { nU++; return; }
    if (zone === 0 || zone === 65534) { nX++; if (glassFront) nG++; } else { nI++; zs[zone] = (zs[zone] || 0) + 1; } });
  const pc = n => +(100 * n / (cw * ch)).toFixed(3);
  Object.assign(out, { interiorPct: pc(nI), exteriorPct: pc(nX), glassBackedPct: pc(nG), emitterPct: pc(nE), unclassifiedPct: pc(nU), topZones: Object.entries(zs).sort((a, b) => b[1] - a[1]).slice(0, 4) });
  return out;
};
const MEM_FACTS = () => { const A = window.APP, R = A.renderer, m = performance.memory || {}; let clones = 0; const seen = new Set(); A.scene.traverse(o => { if (!o.material) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(x => { if (x && !seen.has(x)) { seen.add(x); if (x.userData && x.userData.gfOf) clones++; } }); });
  return { heapMB: m.usedJSHeapSize ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs ? R.info.programs.length : null, materials: seen.size, glassClones: clones }; };
async function pressStill(puppeteer, pose, arm, T) {
  const [DB, Q0, CAM, TGT] = POSES[pose], armQ = arm === 'base' || /^base_r/.test(arm) ? '' : J.FIXES[arm].q, q = Q0 + armQ;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'altsall-prof-')), dl = path.join(OUT, 'png', pose + '__' + arm); fs.mkdirSync(dl, { recursive: true });
  const rec = { pose, arm, db: DB, q, cam: CAM, tgt: TGT, lines: [], started: new Date().toISOString() };
  let b = null, gw = null; const t0 = Date.now();
  try {
    b = await puppeteer.launch({ headless: true, userDataDir: prof, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
      args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--window-size=1705,1054'].concat((arg('chrome-args', '') || '').split(/\s+/).filter(Boolean)) });
    gw = gpuWatch(b.process() ? b.process().pid : null);
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
    try { rec.clip = await p.evaluate(CLIP_FACTS); } catch (e) { rec.clip = { err: e.message }; }   // ### ALTS-ALL FIX 10 (after the PNG is saved)
    if (/^tr\d/.test(pose)) { try { rec.glass = await p.evaluate(GLASS_FACTS); rec.mem = await p.evaluate(MEM_FACTS); } catch (e) { rec.glass = { err: e.message }; } }   // DEFECT 6 (after the PNG is saved)
  } catch (e) { rec.fatal = e.message; }
  finally { if (gw) rec.gpu = gw.stop(); try { if (b) await b.close(); } catch (e) {} try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} }
  if (rec.gpu) log('  §ALTS_GPU_MEM ' + pose + '/' + arm + ' baseline=' + rec.gpu.baseline + 'MiB peakUsed=' + rec.gpu.peakUsed + '/' + rec.gpu.total + 'MiB pressPeak=' + rec.gpu.pressPeakMB + 'MiB samples=' + rec.gpu.samples + ' atPeak=' + JSON.stringify((rec.gpu.atPeak || []).map(a => a.who + ':' + a.pid + ':' + a.mb)) + (rec.gpu.err ? ' err=' + rec.gpu.err : ''));
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
// ### ALTS-ALL FIX 2: cli_silent_bake.js serves only its --root; the film DBs are git-ignored, so link them into <tree>/buildings
// from the main checkout before baking, or refuse to bake and say which file is missing (F-G1 'building loaded' -> INCONCLUSIVE).
const FILM_DB_SRC = '/home/red1/bim-ootb/buildings';
function ensureFilmDbs(tree) {
  const need = [arg('db-film', 'HospitalAjaibPath') + '.db', 'Hospital_silent_local.db'], miss = [];
  need.forEach(f => { const dst = path.join(tree, 'buildings', f), src = path.join(FILM_DB_SRC, f);
    if (fs.existsSync(dst)) { log('  §ALTS_FILM_DB present ' + dst + ' (' + fs.statSync(dst).size + ' B)'); return; }
    if (!fs.existsSync(src)) { miss.push(f); log('  §ALTS_FILM_DB MISSING ' + f + ' (not in ' + tree + '/buildings nor ' + FILM_DB_SRC + ')'); return; }
    fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.symlinkSync(src, dst); log('  §ALTS_FILM_DB linked ' + dst + ' -> ' + src + ' (' + fs.statSync(src).size + ' B)'); });
  return miss;
}
function runBake(armK, tree, extra) {
  const dir = path.join(OUT, 'film'); fs.mkdirSync(dir, { recursive: true }); const out = path.join(dir, armK + '.mp4'), lg = path.join(dir, armK + '.log'), tap = path.join(dir, 'tap.js'); fs.writeFileSync(tap, TAP);
  if (fs.existsSync(lg) && !has('rerun')) { log('  film ' + armK + ': persisted log reused (' + lg + ')'); return; }
  const miss = ensureFilmDbs(tree); if (miss.length) { fs.writeFileSync(lg, '§ALTS_FILM_DB MISSING ' + miss.join(',') + ' — bake not run\n'); log('  film ' + armK + ': NOT RUN, missing ' + miss.join(',')); return; }
  // instrument (run 2026-09-27 film A: unregistered=1 + pre-purge _INITs = a stale SW in the CLI's persistent /tmp/silent-bake-profile-<port>):
  // every bake gets a FRESH profile (--profile), removed afterwards.
  const bprof = fs.mkdtempSync(path.join(os.tmpdir(), 'altsall-bake-'));
  const args = [path.join(tree, 'cli_silent_bake.js'), '--profile', bprof, '--db', arg('db-film', 'HospitalAjaibPath'), '--gpu', 'real', '--fps', '15', '--frame-range', arg('frame-range', '0:90'), '--out', out, '--log', lg, '--tap', tap, '--port', String(+PORT + 20)].concat(extra, (arg('film-flags', '--clash --measure --label')).split(/\s+/).filter(Boolean));
  log('  film ' + armK + ': node ' + args.join(' ')); const t = Date.now();
  try { cp.execFileSync('node', args, { cwd: tree, stdio: ['ignore', 'ignore', 'ignore'], timeout: 3600e3 }); } catch (e) { log('  film ' + armK + ' exit ' + (e.status != null ? e.status : e.message)); }
  log('  film ' + armK + ' wall ' + ((Date.now() - t) / 1000).toFixed(0) + ' s'); try { fs.rmSync(bprof, { recursive: true, force: true }); } catch (e) {}
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
    // ### ALTS-ALL FIX 5: program census — every time renderer.info.programs grows, log which materials now use a program they did not
    // have before (type/name + one object name), tagged with the last §FILM_EXPOSURE frame index seen. Instrument only.
    await p.evaluate(() => { const A = window.APP, R = A.renderer; let n = R.info.programs.length, f = -1; const seen = new WeakMap();
      const snap = () => { const out = []; A.scene.traverse(o => { if (!o.material) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m) return; const cp = R.properties.get(m).currentProgram; if (cp && seen.get(m) !== cp) { if (seen.has(m) || true) out.push({ m, o, cp }); seen.set(m, cp); } }); }); return out; };
      snap(); const oc = console.log.bind(console);
      console.log = function () { const t = String(arguments[0] || ''); const mm = /§FILM_EXPOSURE f=(\d+)/.exec(t); if (mm) f = +mm[1]; return oc.apply(console, arguments); };
      setInterval(() => { const k = R.info.programs.length; if (k === n) return; const nw = snap(), progs = new Set(R.info.programs.slice(n)); const hit = nw.filter(x => progs.has(x.cp));
        oc('§ALTC_PROGRAM_NEW f=' + f + ' programs=' + n + '->' + k + ' names=[' + (hit.length ? hit : nw).slice(0, 8).map(x => x.m.type + '/' + (x.m.name || '-') + '@' + (x.o.name || x.o.type) + '<' + ((x.o.parent && (x.o.parent.name || x.o.parent.type)) || '-') + ':' + Object.keys(x.o.userData || {}).slice(0, 3).join('+') + '>{' + (x.cp.name || '') + '}').join(' ').replace(/[\[\]]/g, '') + '] newProgramNames=' + [...progs].map(q => q.name || '?').join(',')); n = k; }, 200); });
    await new Promise(r => setTimeout(r, 5000)); L.push('§ALTC_ENTRY APP.startMaxQualityOrbit({frames:' + N + ', fps:15, editor:false}) — the function scene.js Alt+C calls, frames capped');
    await p.evaluate(n => { window.APP.startMaxQualityOrbit({ frames: n, fps: 15, editor: false }); }, N);   // coordinator 2026-09-27: editor:false (the OK click stays as a fallback)
    // instrument (GPU run 2026-09-27): start() opens the Cinema Path Editor (cinema_maxq.js §CINEMA_PATH_EDITOR, opts.editor !== false)
    // and awaits its OK — the harness waited 25 min on §CPE_OPEN with no frame. The real Alt+C flow is ONE click: "OK — record this"
    // (#cpe-ok; OK with no edit = the derived plan, guardrail 2). Click it when the editor opens; end on every terminal §MAXQ tag; stall
    // guard: 15 min with no new console line => stop and record the stall (INCONCLUSIVE via the PAGEERROR harness line).
    let okClicked = false, lastN = L.length, lastT = Date.now();
    for (let i = 0; i < 14400 && !L.some(t => /§MAXQ_DONE|§MAXQ_FAIL|§MAXQ_CANCEL|§MAXQ_DELIVER_FAIL|§MAXQ_STITCH_FAILED|§MAXQ_GL_LOST/.test(t)); i++) {
      if (!okClicked && L.some(t => /§CPE_OPEN/.test(t))) { okClicked = await p.evaluate(() => { const b = document.getElementById('cpe-ok'); if (b) { b.click(); return true; } return false; }); if (okClicked) L.push('§ALTC_CPE_OK clicked #cpe-ok (the Alt+C one-click OK, no edit)'); }
      if (L.length !== lastN) { lastN = L.length; lastT = Date.now(); } else if (Date.now() - lastT > 900e3) { L.push('PAGEERROR harness: altc stalled 15 min with no console line (last: ' + (L[L.length - 1] || '').slice(0, 100) + ')'); break; }
      await new Promise(r => setTimeout(r, 500)); }
    await new Promise(r => setTimeout(r, 5000)); const tap = await p.evaluate(new Function(TAP + ' return window.__maxqTapReport();')); fs.writeFileSync(path.join(dir, 'altc_tap.json'), JSON.stringify(tap));
    const f = fs.readdirSync(dir).filter(x => /\.(mp4|webm)$/.test(x) && !/^(A2|[ACETB])\.mp4$/.test(x)).map(x => path.join(dir, x)).sort((a, c) => fs.statSync(c).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (f) fs.renameSync(f, path.join(dir, 'altc.mp4'));
  } catch (e) { L.push('PAGEERROR harness: ' + e.message); } finally { try { if (b) await b.close(); } catch (e) {} fs.writeFileSync(lg, L.join('\n')); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} }
}
// ── DEFECT 6 SEQUENCE (S4 carried state): ONE tab on Terminal, the six red1 poses twice (12 presses, Esc between), per press:
// composite look + glass see-through + JS heap + renderer.info (geometries/textures/programs) + glass clones + GPU memory of this
// tab's gpu-process + any allocation failure line. The fresh-page presses tr1..tr6 (normal base presses) are the control.
const SEQ = ['tr1', 'tr2', 'tr3', 'tr4', 'tr5', 'tr6'];
async function runSequence(puppeteer) {
  const dir = path.join(OUT, 'seq'); fs.mkdirSync(dir, { recursive: true }); const sf = path.join(dir, 'seq.json'); if (fs.existsSync(sf) && !has('rerun')) { log('  sequence: persisted record reused'); return; }
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'altsall-seq-')), L = [], presses = []; let b = null; const t0 = Date.now();
  try {
    b = await puppeteer.launch({ headless: true, userDataDir: prof, protocolTimeout: 3600000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }), args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--window-size=1705,1054'] });
    const p = await b.newPage(); await p.setViewport({ width: 1685, height: 874 }); const dl = path.join(OUT, 'png', 'seq'); fs.mkdirSync(dl, { recursive: true });
    const cdp = await p.target().createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    await p.evaluateOnNewDocument(() => { window.__swCtlAtLoad = !!(navigator.serviceWorker && navigator.serviceWorker.controller); });
    p.on('console', m => L.push(m.text().replace(/\n/g, '\\n'))); p.on('pageerror', e => L.push('PAGEERROR ' + e.message));
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/Terminal_extracted.db', { waitUntil: 'domcontentloaded', timeout: 180000 });
    const cnt = () => p.evaluate(() => window.APP && window.APP.guidMap ? Object.keys(window.APP.guidMap).length : 0);
    let last = -1, same = 0; for (let i = 0; i < 300 && same < 4; i++) { await new Promise(r => setTimeout(r, 2000)); const n = await cnt(); if (n > 0 && n === last) same++; else same = 0; last = n; }
    const mem0 = await p.evaluate(MEM_FACTS); log('  §ALTS_SEQ loaded elements=' + last + ' mem0=' + JSON.stringify(mem0));
    const order = SEQ.concat(SEQ);
    for (let k = 0; k < order.length; k++) {
      const pose = order[k], [, , CAM, TGT] = POSES[pose], j0 = L.length, gw = gpuWatch(1), tp = Date.now();
      await p.evaluate((c, t) => { const A = window.APP; A.camera.position.fromArray(c); A.controls.target.fromArray(t); A.controls.update(); }, CAM, TGT);
      await new Promise(r => setTimeout(r, 800));
      await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
      let ok = false; for (let i = 0; i < 2800 && !ok; i++) { ok = L.slice(j0).some(t => /§GI_STILL result|§GI_STILL_FAIL|§GI_STILL_OFF/.test(t)); if (!ok) await new Promise(r => setTimeout(r, 250)); }
      if (ok && L.slice(j0).some(t => /§GI_STILL_OFF/.test(t))) for (let i = 0; i < 1200 && !L.slice(j0).some(t => /§STILL_REFINE done/.test(t)); i++) await new Promise(r => setTimeout(r, 250));
      await new Promise(r => setTimeout(r, 1500));
      const rec = { k, pose, cam: CAM, tgt: TGT, pressSecs: +((Date.now() - tp) / 1000).toFixed(1), timeout: !ok };
      try { rec.eval = await p.evaluate(PAGE_FACTS, EDITED, null); } catch (e) { rec.evalErr = e.message; }
      try { rec.glass = await p.evaluate(GLASS_FACTS); } catch (e) { rec.glass = { err: e.message }; }
      try { rec.mem = await p.evaluate(MEM_FACTS); } catch (e) { rec.mem = { err: e.message }; }
      rec.gpu = gw.stop(); rec.lines = L.slice(j0);
      rec.allocFail = rec.lines.filter(l => /GPUOutOfMemory|OUT_OF_DEVICE_MEMORY|CONTEXT_LOST|Context Lost|allocation fail|RangeError|§LOAD_FAIL|PAGEERROR/.test(l)).slice(0, 5);
      rec.meter = (rec.lines.filter(l => /§METER camera=/.test(l)).pop() || '').slice(0, 200);
      presses.push(rec);
      log('  §ALTS_SEQ press ' + k + ' ' + pose + ' p50=' + (rec.eval && rec.eval.comp ? rec.eval.comp.p50 : '-') + ' clip=' + (rec.eval && rec.eval.comp ? rec.eval.comp.ge250pct : '-') + ' glass n=' + rec.glass.n + ' keepAbs=' + rec.glass.keepAbs + ' bouncePct=' + rec.glass.bouncePct + ' compL=' + rec.glass.compL + ' appL=' + rec.glass.appL +
        ' heapMB=' + rec.mem.heapMB + ' geo=' + rec.mem.geometries + ' tex=' + rec.mem.textures + ' prog=' + rec.mem.programs + ' clones=' + rec.mem.glassClones + ' gpuPress=' + rec.gpu.pressPeakMB + 'MiB used=' + rec.gpu.peakUsed + ' alloc=' + rec.allocFail.length + ' secs=' + rec.pressSecs);
      await p.keyboard.press('Escape'); for (let i = 0; i < 40 && !L.slice(j0).some(t => /§STILL_EXIT/.test(t)); i++) await new Promise(r => setTimeout(r, 250));
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (e) { L.push('PAGEERROR harness: ' + e.message); log('  §ALTS_SEQ FATAL ' + e.message); }
  finally { try { if (b) await b.close(); } catch (e) {} try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} }
  fs.writeFileSync(sf, JSON.stringify({ presses, wallSecs: (Date.now() - t0) / 1000, errors: L.filter(l => /^PAGEERROR/.test(l)).slice(0, 5) }));
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
    if (r.arm === 'base') [].concat(J.g3(r), J.g4(r), J.g5(r), J.gz(r), J.g6(r)).forEach(x => rows.push(Object.assign(x, { pose: r.pose, arm: r.arm }))); });
  Object.values(recs).filter(r => J.FIXES[r.arm]).forEach(r => { const b = recs[r.pose + '|base'], b2 = recs[r.pose + '|base_r2'];
    if (poseState[r.pose + '|' + r.arm] !== 'OK' || !b || poseState[r.pose + '|base'] !== 'OK') { rows.push({ group: 'G2', id: J.FIXES[r.arm].name, state: 'INCONCLUSIVE', detail: 'base or arm press failed instrument sanity / missing', pose: r.pose, arm: r.arm }); return; }
    const noise = (b2 && b2.eval && b.eval && poseState[r.pose + '|base_r2'] === 'OK') ? +Math.max(Math.abs(b.eval.comp.mean - b2.eval.comp.mean), Math.abs(b.eval.comp.p50 - b2.eval.comp.p50)).toFixed(3) : null;
    J.g2(b, r, r.arm, noise).forEach(x => rows.push(Object.assign(x, { pose: r.pose, arm: r.arm }))); });
  // film
  const bakes = {}; ['A', 'A2', 'C', 'E', 'T', 'B', 'altc'].forEach(k => { const x = k === 'altc' ? (() => { const lg = path.join(OUT, 'film', 'altc.log'); if (!fs.existsSync(lg)) return null; let tap = null; try { tap = JSON.parse(fs.readFileSync(path.join(OUT, 'film', 'altc_tap.json'), 'utf8')); } catch (e) {} return { arm: 'altc', lines: fs.readFileSync(lg, 'utf8').split('\n'), tap, frames: ffFrames(path.join(OUT, 'film', 'altc.mp4')) }; })() : loadBake(k); if (x) bakes[k] = x; });
  // instrument (GPU run 2026-09-27): B is the pre-merge REFERENCE bake served from --base-tree — judging its sw/?v=/lawHash against THIS
  // tree made it INCONCLUSIVE by construction. B's instrument rows are judged against the base tree's own facts.
  let TB = null; if (bakes.B && arg('base-tree', null)) try { TB = treeFacts(path.resolve(arg('base-tree'))); } catch (e) { TB = null; }
  const filmRows = []; Object.keys(bakes).forEach(k => { const others = k === 'A' ? { C: bakes.C, E: bakes.E, T: bakes.T, B: bakes.B, A2: bakes.A2 } : null; J.filmJudge(bakes[k], k === 'B' && TB ? TB : T, others).forEach(x => filmRows.push(Object.assign(x, { pose: 'film', arm: k }))); });
  const sf = path.join(OUT, 'seq', 'seq.json'); if (fs.existsSync(sf)) { const S = JSON.parse(fs.readFileSync(sf, 'utf8')); J.seqJudge(S, recs).forEach(x => rows.push(Object.assign(x, { pose: 'seq', arm: 'terminal' }))); }
  return { rows, filmRows, nRecs: Object.keys(recs).length, bakes: Object.keys(bakes) };
}
function report(T, R) {
  const all = R.rows.concat(R.filmRows), cnt = s => all.filter(r => r.state === s).length;
  log('\n| pose | arm | group | row | state | detail |'); log('|---|---|---|---|---|---|');
  all.forEach(r => log('| ' + r.pose + ' | ' + r.arm + ' | ' + r.group + ' | ' + r.id + ' | ' + r.state + ' | ' + r.detail.replace(/\|/g, '/').slice(0, 260) + ' |'));
  const still = R.rows, stillGate = !still.length ? 'INCONCLUSIVE (no still record judged)' : J.gate(still), filmGate = !R.filmRows.length ? 'INCONCLUSIVE' : J.gate(R.filmRows);
  const incPoses = [...new Set(still.filter(r => r.id === 'pose verdict').map(r => r.pose + '/' + r.arm))];
  log('\n§ALTS_ALL_SUMMARY tree=' + T.commit + ' sw=' + T.sw + ' lawHash=' + T.lawHash + ' records=' + R.nRecs + ' bakes=' + (R.bakes.join(',') || 'none') + ' PASS=' + cnt('PASS') + ' FAIL=' + cnt('FAIL') + ' INCONCLUSIVE=' + cnt('INCONCLUSIVE') + ' VACUOUS=' + cnt('VACUOUS') + ' NO-OP=' + cnt('NO-OP') + ' SCOPE-BLIND=' + cnt('SCOPE-BLIND') + ' WARN=' + cnt('WARN') + ' INFO=' + cnt('INFO'));
  R.rows.filter(r => r.id === 'p50 40..200 & clipped < 2%').forEach(r => log('§ALTS_LOOK ' + r.pose + ' ' + r.state + ' ' + r.detail));
  log('§ALTS_ALL_VERDICT ' + stillGate + (incPoses.length ? ' inconclusivePresses=' + incPoses.join(',') : '') + ' (PASS only if no FAIL/INCONCLUSIVE/VACUOUS/NO-OP row; SCOPE-BLIND and WARN are listed, not blocking)');
  log('§BAKE_RELEASE_GATE ' + (R.filmRows.length ? filmGate : 'INCONCLUSIVE (no bake judged)') + ' — nothing ships (FF to look / any publish) unless PASS');
  fs.writeFileSync(path.join(OUT, 'alts_all.json'), JSON.stringify({ tree: T, rows: R.rows, filmRows: R.filmRows, stillGate, filmGate: R.filmRows.length ? filmGate : 'INCONCLUSIVE', when: new Date().toISOString() }, null, 1));
  return stillGate === 'PASS' && (!R.filmRows.length || filmGate === 'PASS') ? 0 : 1;
}
// --film (all: A,C,E,T[,B]) or --film A,C (only those arms)
function filmSel() { const v = arg('film', null); return v ? v.split(',').map(x => x.trim().toUpperCase()).filter(x => /^(A2|[ACETB])$/.test(x)) : ['A', 'C', 'E', 'T', 'B']; }
async function main() {
  if (has('selftest')) return require('./witness_alts_all_selftest.js').run();
  const T = treeFacts(TREE); log('§ALTS_ALL tree=' + T.tree + ' commit=' + T.commit + ' sw=' + T.sw + ' lawHash=' + T.lawHash + ' lzSrc=' + T.lzSrc + ' versions=' + JSON.stringify(T.versions));
  const jobs = has('judge') ? [] : plan(), film = has('film') || has('film-only'), altc = +arg('altc', 0);
  const bakes = film ? filmSel().filter(k => k !== 'B' || arg('base-tree', null)) : [];
  log('§ALTS_ALL_PLAN presses=' + jobs.length + ' (each: fresh profile + load 60-90 s + press 15-215 s => ~2-5 min; est ' + Math.round(jobs.length * 2) + '-' + Math.round(jobs.length * 5) + ' min) bakes=' + (bakes.join(',') || 'none') + (bakes.length ? ' (~6-8 min each at 90 frames => ' + bakes.length * 6 + '-' + bakes.length * 8 + ' min)' : '') + (altc ? ' altc=' + altc + ' frames (~' + Math.round(altc * 2 / 60 + 3) + ' min)' : '') + ' full matrix = ' + Object.keys(POSES).length + ' poses x ' + (Object.keys(J.FIXES).length + 1) + ' arms = ' + Object.keys(POSES).length * (Object.keys(J.FIXES).length + 1) + ' presses');
  jobs.forEach(j => log('  press ' + j[0] + ' / ' + j[1] + ' -> ' + POSES[j[0]][0] + POSES[j[0]][1] + (J.FIXES[j[1]] ? J.FIXES[j[1]].q : '')));
  if (has('plan')) return 0;
  if (jobs.length || altc || has('sequence')) {
    const puppeteer = require(process.env.PUPPETEER_PATH || '/home/red1/bim-compiler/node_modules/puppeteer'); fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });
    for (const [p, a] of jobs) { const f = path.join(OUT, 'raw', p + '__' + a + '.json'); if (fs.existsSync(f) && !has('rerun')) { log('  ' + p + '/' + a + ': persisted record reused'); continue; }
      log('  pressing ' + p + '/' + a + ' ...'); const r = await pressStill(puppeteer, p, a, T); fs.writeFileSync(f, JSON.stringify(r)); log('  ' + p + '/' + a + ' done wall ' + r.wallSecs.toFixed(0) + ' s' + (r.fatal ? ' FATAL ' + r.fatal : '') + (r.timeout ? ' TIMEOUT' : '')); }
    if (altc) await runAltc(puppeteer, altc);
    if (has('sequence')) await runSequence(puppeteer);
  }
  if (film) { const sel = filmSel(); if (sel.includes('A')) runBake('A', TREE, []); if (sel.includes('A2')) runBake('A2', TREE, []); if (sel.includes('C')) runBake('C', TREE, ['--film-exposure', '0', '--film-fill', 'restore']); if (sel.includes('E')) runBake('E', TREE, ['--film-parity', '0']); if (sel.includes('T')) runBake('T', TREE, ['--url-query', '&torch=0']); if (sel.includes('B') && arg('base-tree', null)) runBake('B', path.resolve(arg('base-tree')), []); }
  return report(T, judgeAll(T));
}
module.exports = { readPng, treeFacts, judgeAll, report, POSES, ARM_POSES, EDITED };
if (require.main === module) main().then(c => { process.exitCode = c; }).catch(e => { log('§ALTS_ALL FATAL ' + (e && e.stack)); process.exitCode = 2; });
