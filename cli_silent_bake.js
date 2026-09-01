#!/usr/bin/env node
// ⚠ DO NOT REMOVE — §CLI_SILENT_BAKE runner (spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md
// §CLI_SILENT_BAKE, 2026-09-01). Scope: dev-only command-line silent bake of the SHIPPED MaxQ
// pipeline, taking a STORED PATH as argument. Read the log after every run — exit code is not
// evidence; the §-tagged lines in --log are the witness.
//
// Usage:
//   node cli_silent_bake.js --db HospitalAjaibPath --out /tmp/hospital.mp4 \
//     [--plan NAME | --override file.json]            path source (default: DB cinema_path table)
//     [--buildup] [--label] [--reveal] [--day tr|tl|br|bl|off]   flags composed onto the path
//     [--frames N | --seconds S] [--fps N]            length (default: the plan's own pacing)
//     [--gpu sw|real|headful] [--chrome-args "..."]   GPU mode (stage-3 feasibility decides)
//     [--width W --height H] [--port P] [--log FILE] [--profile DIR]
//     [--stall-min N] [--max-frame-ms N]              health watchdog (abort early, not at the end)
//     [--timeout-min N]                               hard wall-clock cap
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function arg(name, dflt) { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; }
function has(name) { return argv.indexOf('--' + name) >= 0; }
const ROOT = path.resolve(arg('root', __dirname));
const DB = arg('db', 'HospitalAjaibPath');                 // name (buildings/<name>.db) or path
const OUT = path.resolve(arg('out', '/tmp/silent_bake.mp4'));
const PORT = +arg('port', 8544);
const GPU = arg('gpu', 'sw');                              // sw | real | headful
const W = +arg('width', 1280), H = +arg('height', 720);
const FPS = arg('fps', null) ? +arg('fps') : undefined;
const FRAMES = arg('frames', null) ? +arg('frames')
  : (arg('seconds', null) ? Math.round(+arg('seconds') * (FPS || 15)) : undefined);
const LOG = path.resolve(arg('log', OUT.replace(/\.[a-z0-9]+$/i, '') + '.log'));
const PROFILE = arg('profile', '/tmp/silent-bake-profile-' + PORT);
const STALL_MIN = +arg('stall-min', 10);
const MAX_FRAME_MS = +arg('max-frame-ms', 0);              // 0 = off (stage 3 measures, stage 5 guards)
const TIMEOUT_MIN = +arg('timeout-min', 300);
const PLAN_NAME = arg('plan', null);
const OV_FILE = arg('override', null);
const FLAGS = {};
if (has('buildup')) FLAGS.buildup = true;
if (has('label')) FLAGS.roomTitle = true;
if (has('reveal')) FLAGS.reveal = true;
if (arg('day', null)) FLAGS.dayCounter = arg('day');

const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(line) { const s = new Date().toISOString().slice(11, 19) + ' ' + line; logStream.write(s + '\n'); console.log(s); }
function logRaw(line) { logStream.write(line + '\n'); }   // full console firehose → file only

// ── static server (serves the checkout; symlinked buildings/ resolve normally) ──
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  try {
    const u = decodeURIComponent(req.url.split('?')[0]);
    let fp = path.join(ROOT, u.replace(/^\/+/, ''));
    if (!fp.startsWith('/')) fp = '/' + fp;
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const commit = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim();
  const swv = (fs.readFileSync(path.join(ROOT, 'viewer/sw.js'), 'utf8').match(/CACHE_VERSION = '([^']+)'/) || [])[1];
  log(`§CLI_BAKE_ENV root=${ROOT} commit=${commit} sw=${swv} db=${DB} gpu=${GPU} out=${OUT}`);

  // MEASURED 2026-09-01 (gl_probe, this machine): headless '--use-angle=vulkan' = NO-CONTEXT;
  // plain headless = SwiftShader; '--use-angle=gl-egl' = Intel UHD via Mesa; gl-egl PLUS
  // __EGL_VENDOR_LIBRARY_FILENAMES=10_nvidia.json = the real RTX 4060 ("ANGLE (NVIDIA Corporation,
  // NVIDIA GeForce RTX 4060 Laptop GPU/PCIe/SSE2, OpenGL ES 3.2)"), fully headless, no X needed.
  const gpuArgs = {
    sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'],
    intel: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'],
    headful: ['--disable-backgrounding-occluded-windows']   // §MAXQ_HIDDEN_PAUSE parks hidden tabs
  }[GPU] || [];
  const gpuEnv = GPU === 'real'
    ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const extra = (arg('chrome-args', '') || '').split(/\s+/).filter(Boolean);
  const browser = await puppeteer.launch({
    headless: GPU === 'headful' ? false : true,
    userDataDir: PROFILE,
    protocolTimeout: 15 * 60 * 1000,
    env: Object.assign({}, process.env, gpuEnv),
    args: ['--no-sandbox', '--hide-crash-restore-bubble', `--window-size=${W + 20},${H + 120}`]
      .concat(gpuArgs, extra)
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });

  // console firehose → log file; §-lines also drive the health watchdog + summary
  const S = { frames: 0, lastProgress: Date.now(), perFrame: [], fatal: null, done: false,
              claims: {}, heap: [] };
  const CLAIM_RX = /§(PHOTO_PREWARM|CPE_STATS_TAIL|CPE_PIE_HOLD|MAXQ_FRAME_BUDGET|MAXQ_MP4_FALLBACK|MAXQ_DONE|MAXQ_QUALITY|MAXQ_DELIVERED|CLI_BAKE_RESOLVED|MAXQ_OVERRIDE_IN|MAXQ_START|MAXQ_START_REVISED|CPE_APPLIED|CINEMA_PATH_RESTORE|CPE_BUILDUP_TOPOUT|CPE_BUILDUP_SKIP|MAXQ_HDRI_RACE|MAXQ_STREAM_WAIT|CPE_REVEAL)\b/;
  page.on('console', m => {
    const t = m.text();
    logRaw('[con] ' + t);
    const mm = t.match(CLAIM_RX);
    if (mm) { (S.claims[mm[1]] = S.claims[mm[1]] || []).push(t); }
    if (/§MAXQ_FRAME i=|§CPE_BUILDUP frame=|§MAXQ_STREAM|warming up|§MAXQ_MP4 |§MAXQ_STITCH|§MAXQ_IDB_READY/.test(t)) S.lastProgress = Date.now();
    const fm = t.match(/§MAXQ_FRAME i=(\d+)\/(\d+) elapsedMs=(\d+) perFrameMs=(\d+)/);
    if (fm) { S.frames = +fm[1]; S.perFrame.push(+fm[4]);
      if (MAX_FRAME_MS && +fm[4] > MAX_FRAME_MS) S.fatal = `perFrameMs ${fm[4]} > --max-frame-ms ${MAX_FRAME_MS}: ${t}`; }
    if (/§MAXQ_FAIL|§MAXQ_GL_LOST|§MAXQ_IDB_LOST|§CPE_BUILDUP_SKIP/.test(t)) log('⚠ ' + t);
    if (/§MAXQ_FAIL/.test(t)) S.fatal = t;
  });
  page.on('pageerror', e => { logRaw('[pageerror] ' + e.message); log('⚠ PAGEERROR ' + e.message.slice(0, 160)); });

  // delivery sink: page → node file (chunked base64 through an exposed function)
  let sink = null, sinkName = null, sinkBytes = 0;
  await page.exposeFunction('__maxqSinkBegin', (name, type, total) => {
    sinkName = name; sinkBytes = 0;
    sink = fs.createWriteStream(OUT);
    log(`§CLI_BAKE_SINK begin name=${name} type=${type} totalBytes=${total} → ${OUT}`);
  });
  await page.exposeFunction('__maxqSink', b64 => new Promise((res, rej) => {
    const buf = Buffer.from(b64, 'base64'); sinkBytes += buf.length;
    sink.write(buf, e => e ? rej(e) : res());
  }));
  await page.exposeFunction('__maxqSinkEnd', () => new Promise(res => {
    sink.end(() => { log(`§CLI_BAKE_SINK end bytes=${sinkBytes}`); res(); });
  }));

  await page.evaluateOnNewDocument((flagsJson) => {
    window.__MAXQ_SILENT = true;                       // gates window.__maxqBake (dev-only)
    window.__maxqPoseLog = [];                          // §CLI_SILENT_BAKE item 4 — pose record
    window.__maxqPoseTap = function(i, x, y, z, tx, ty, tz) {
      window.__maxqPoseLog.push([i, x, y, z, tx, ty, tz, performance.now()]);
    };
    window.__maxqDeliverBlob = async function(blob, name, type) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      await window.__maxqSinkBegin(name, type, buf.length);
      const CH = 4 << 20;
      for (let off = 0; off < buf.length; off += CH) {
        const sub = buf.subarray(off, Math.min(off + CH, buf.length));
        let s = '';
        for (let i = 0; i < sub.length; i += 0x8000)
          s += String.fromCharCode.apply(null, sub.subarray(i, i + 0x8000));
        await window.__maxqSink(btoa(s));
      }
      await window.__maxqSinkEnd();
    };
  }, JSON.stringify(FLAGS));

  const dbUrl = DB.includes('/') ? DB : `/buildings/${DB}.db`;
  const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=${dbUrl}`;
  log(`§CLI_BAKE_NAV ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.renderer && window.APP.camera &&
    typeof window.APP.startMaxQualityOrbit === 'function' && typeof window.__maxqBake === 'function',
    { timeout: 300000 });
  // Authoritative load-complete signal: streaming.js's completion block adds the building to
  // A.buildingsRendered THE SAME tick it sets A.streaming=false — `!APP.streaming` alone races
  // the load (observed on the first smoke run: __maxqBake fired 7s after nav, before the DB).
  await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db &&
    window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) &&
    !window.APP.streaming, { timeout: 900000, polling: 1000 });
  log('§CLI_BAKE_LOADED building=' + await page.evaluate(() => window.APP.activeBuilding +
    ' meshes=' + (window.APP.scene ? window.APP.scene.children.length : -1)));
  // §R11: §PHOTO_PREWARM runs on requestIdleCallback (timeout 8s) after streaming completes.
  // Give it its window BEFORE the bake so the claim is observable as shipped — the fallback path
  // (first fold doing the work itself) would mask it. Proceed after 20s either way, with a note.
  for (let w = 0; w < 20 && !S.claims.PHOTO_PREWARM; w++) await new Promise(r => setTimeout(r, 1000));
  log(S.claims.PHOTO_PREWARM ? '§CLI_BAKE_PREWARM_SEEN ' + S.claims.PHOTO_PREWARM[0].slice(0, 200)
      : '§CLI_BAKE_PREWARM_SEEN none after 20s — the bake fold will do the work itself (fallback path)');

  // provable GPU identity (FUNDAMENTAL LAW: report the real context, not the flag we asked for)
  const gl = await page.evaluate(() => {
    const g = window.APP.renderer.getContext();
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return { vendor: d ? g.getParameter(d.UNMASKED_VENDOR_WEBGL) : g.getParameter(g.VENDOR),
             renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER) };
  });
  log(`§CLI_BAKE_GL vendor="${gl.vendor}" renderer="${gl.renderer}"`);

  // buildup needs an existing schedule; a fresh profile has no gantt cache — run the SHIPPED
  // generation verb (same one a real Time Machine open runs) BEFORE the bake asks.
  if (FLAGS.buildup) {
    const tm = await page.evaluate(async () => {
      if (typeof window.tmActivateForBake !== 'function') return 'no-hook';
      const t0 = performance.now();
      let ok = await window.tmActivateForBake();
      if (!ok) ok = await window.tmActivateForBake();   // generation may outlive the first 30s poll
      return (ok ? 'ok' : 'FAILED') + ' ms=' + Math.round(performance.now() - t0);
    });
    log(`§CLI_BAKE_TM_PRIME ${tm}`);
    if (/FAILED|no-hook/.test(tm)) log('⚠ buildup will be skipped by the bake (no timeline)');
  }

  // heap sampling (Log Mandate: numbers, on an interval, into the log)
  const heapIv = setInterval(async () => {
    try { const m = await page.metrics(); S.heap.push(m.JSHeapUsedSize);
      logRaw(`[heap] usedMB=${(m.JSHeapUsedSize / 1048576).toFixed(1)} totalMB=${(m.JSHeapTotalSize / 1048576).toFixed(1)}`);
    } catch (e) {}
  }, 20000);

  // start the bake WITHOUT holding a CDP call open for hours: fire, then poll a page global.
  const bakeOpts = { name: PLAN_NAME || undefined, flags: FLAGS, frames: FRAMES, fps: FPS };
  if (OV_FILE) bakeOpts.override = JSON.parse(fs.readFileSync(OV_FILE, 'utf8'));
  // The plan reads the live camera basis (§CPE_PREVIEW_DIVERGENCE) — save the pre-bake camera so
  // the post-bake pose assertion can rebuild the SAME plan the bake built, not one based at the
  // film's final pose (the loop leaves the camera at the last frame).
  await page.evaluate(() => {
    const A = window.APP;
    window.__maxqCamSave = { px: A.camera.position.x, py: A.camera.position.y, pz: A.camera.position.z,
                             tx: A.controls.target.x, ty: A.controls.target.y, tz: A.controls.target.z };
  });
  await page.evaluate(o => {
    window.__bakeResult = null;
    window.__maxqBake(o).then(r => { window.__bakeResult = { ok: true, r }; })
      .catch(e => { window.__bakeResult = { ok: false, err: String(e && e.message || e) }; });
  }, bakeOpts);
  const t0 = Date.now();
  let result = null, aborted = null;
  while (!result) {
    await new Promise(r => setTimeout(r, 5000));
    result = await page.evaluate(() => window.__bakeResult).catch(() => null);
    if (result) break;
    const mins = (Date.now() - t0) / 60000;
    if (S.fatal) { aborted = 'fatal: ' + S.fatal; break; }
    if ((Date.now() - S.lastProgress) / 60000 > STALL_MIN) { aborted = `stall: no progress line for ${STALL_MIN} min (last frame=${S.frames})`; break; }
    if (mins > TIMEOUT_MIN) { aborted = `timeout: ${TIMEOUT_MIN} min wall-clock cap`; break; }
  }
  clearInterval(heapIv);
  if (aborted) {
    log(`§CLI_BAKE_ABORT ${aborted}`);
    try { await page.evaluate(() => window.APP.cancelMaxQualityOrbit()); await new Promise(r => setTimeout(r, 10000)); } catch (e) {}
  } else {
    log(`§CLI_BAKE_RESULT ${JSON.stringify(result)}`);
  }

  // pose record + independent plan check happen in the page, numbers only come back
  const poseN = await page.evaluate(() => window.__maxqPoseLog.length);
  if (poseN) {
    const per = await page.evaluate(() => {
      const L = window.__maxqPoseLog, d = [];
      for (let i = 1; i < L.length; i++) d.push(L[i][7] - L[i - 1][7]);
      d.sort((a, b) => a - b);
      const mean = d.reduce((a, b) => a + b, 0) / (d.length || 1);
      return { n: L.length, meanMs: +mean.toFixed(1), p50: +(d[d.length >> 1] || 0).toFixed(1),
               worstMs: +(d[d.length - 1] || 0).toFixed(1) };
    });
    log(`§CLI_BAKE_FRAMES poses=${per.n} meanMs=${per.meanMs} p50Ms=${per.p50} worstMs=${per.worstMs}`);
    fs.writeFileSync(OUT.replace(/\.[a-z0-9]+$/i, '') + '_poses.json',
      JSON.stringify(await page.evaluate(() => window.__maxqPoseLog)));
    // ── §CLI_SILENT_BAKE item 4, the numeric assertion — did the STORED path drive the camera? ──
    // (a) rebuild the override plan at the pre-bake camera basis: flown poses must reproduce it
    //     to ~0 (same code path — catches plumbing loss);
    // (b) build the DERIVED plan (explicit null override): the flown track must DIFFER from it
    //     (a bake that silently ignored the passed path would match derived and fail here);
    // (c) the flown track must pass near every stored band anchor (ties to the DB rows themselves).
    const chk = await page.evaluate((fpsUsed) => {
      const A = window.APP, L = window.__maxqPoseLog, ov = window.__maxqResolvedOverride;
      if (!L || L.length < 2 || !ov) return { skip: 'no poses or no resolved override' };
      if (ov.clip) return { skip: 'clip window set — t-mapping not identity, check by hand' };
      const cs = window.__maxqCamSave;
      A.camera.position.set(cs.px, cs.py, cs.pz); A.controls.target.set(cs.tx, cs.ty, cs.tz);
      A.camera.lookAt(cs.tx, cs.ty, cs.tz); A.camera.updateMatrixWorld(true); A.controls.update();
      const n = L[L.length - 1][0] + 1;
      const planOv = A.cinemaPathPlan(n / fpsUsed, ov);
      const planDrv = A.cinemaPathPlan(n / fpsUsed, null);
      let maxErr = 0, sumDrv = 0;
      for (const r of L) {
        const t = n > 1 ? r[0] / (n - 1) : 0;
        const p = planOv.poseAt(t), d = planDrv.poseAt(t);
        maxErr = Math.max(maxErr, Math.hypot(r[1] - p.x, r[2] - p.y, r[3] - p.z),
                          Math.hypot(r[4] - p.tx, r[5] - p.ty, r[6] - p.tz));
        sumDrv += Math.hypot(r[1] - d.x, r[2] - d.y, r[3] - d.z);
      }
      const bandDist = (ov.bands || []).map(b => {
        let m = 1e9;
        for (const r of L) m = Math.min(m, Math.hypot(r[1] - b.c.x, r[2] - b.c.y, r[3] - b.c.z));
        return +m.toFixed(2);
      });
      return { n, maxErrM: +maxErr.toFixed(4), rmsVsDerivedM: +(sumDrv / L.length).toFixed(2), bandDist };
    }, FPS || 15).catch(e => ({ skip: 'check threw: ' + e.message }));
    if (chk.skip) log('§CLI_BAKE_POSECHECK INCONCLUSIVE ' + chk.skip);
    else {
      const pass = chk.maxErrM < 0.05;
      const differs = chk.rmsVsDerivedM > 1.0;
      log(`§CLI_BAKE_POSECHECK frames=${chk.n} maxErrVsOverridePlanM=${chk.maxErrM} (${pass ? 'MATCH' : '⚠ MISMATCH'})` +
          ` meanDistVsDerivedPlanM=${chk.rmsVsDerivedM} (${differs ? 'differs — the stored path, not the derived one' : '⚠ INDISTINGUISHABLE from derived — inconclusive discriminator'})` +
          ` bandAnchorMinDistM=[${chk.bandDist.join(',')}]`);
    }
  }
  const heapMB = S.heap.map(x => x / 1048576);
  if (heapMB.length) log(`§CLI_BAKE_HEAP samples=${heapMB.length} minMB=${Math.min(...heapMB).toFixed(0)} maxMB=${Math.max(...heapMB).toFixed(0)} lastMB=${heapMB[heapMB.length - 1].toFixed(0)}`);

  // the file, examined numerically — a zero-byte "success" is the guarded failure
  let fileOk = false;
  if (fs.existsSync(OUT) && fs.statSync(OUT).size > 0) {
    fileOk = true;
    log(`§CLI_BAKE_FILE path=${OUT} bytes=${fs.statSync(OUT).size}`);
    try {
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'quiet', '-print_format', 'json',
        '-show_format', '-show_streams', '-count_frames', OUT]).toString());
      const v = probe.streams.find(s => s.codec_type === 'video') || {};
      log(`§CLI_BAKE_FFPROBE codec=${v.codec_name} ${v.width}x${v.height} frames=${v.nb_read_frames} ` +
          `fps=${v.r_frame_rate} durationSec=${(probe.format || {}).duration} bitrate=${(probe.format || {}).bit_rate}`);
    } catch (e) { log('⚠ ffprobe failed: ' + e.message.slice(0, 200)); }
  } else {
    log(`§CLI_BAKE_FILE MISSING-OR-EMPTY path=${OUT} — the guarded failure mode`);
  }

  // shipped-claim summary (the big-prize § lines, verbatim)
  for (const k of Object.keys(S.claims)) for (const line of S.claims[k]) log('§CLAIM ' + line.slice(0, 300));
  log(`§CLI_BAKE_WALL totalSec=${((Date.now() - t0) / 1000).toFixed(0)} aborted=${aborted || 'no'} fileOk=${fileOk}`);

  await browser.close();
  server.close();
  logStream.end();
  process.exit(aborted || !fileOk ? 1 : 0);
})().catch(e => { log('§CLI_BAKE_CRASH ' + (e && e.stack || e)); process.exit(2); });
