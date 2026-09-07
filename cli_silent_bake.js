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
//     [--clash] [--no-clash]                          mesh-true clash pairs as world content (§CLASH_FILM_P1)
//     [--storey-reveal] [--no-storey-reveal]           each storey tints in sequence during the closing
//                                                       orbit (§STOREY_HIGHLIGHT_REVEAL)
//     [--no-buildup] [--no-label] [--no-reveal]       turn a SAVED setting off for this run
//   With no flag given, the path's OWN saved settings are used (§CPE_FLAGS_PORTABLE) — a path saved
//   in the viewer bakes exactly as it was authored, with no arguments at all.
//     [--frames N | --seconds S] [--fps N]            length (default: the plan's own pacing)
//     [--gpu sw|real|headful] [--chrome-args "..."]   GPU mode (stage-3 feasibility decides)
//     [--width W --height H] [--port P] [--log FILE] [--profile DIR]
//     [--stall-min N] [--max-frame-ms N]              health watchdog (abort early, not at the end)
//     [--timeout-min N]                               hard wall-clock cap
//     [--progress-every-sec N] [--abort-land-min N]   progress cadence (30) / abort landing cap (10)
//
//   PROGRESS + ETA print as §CLI_BAKE_PROGRESS while the bake runs. Ctrl-C (SIGINT) aborts CLEANLY:
//   the frames baked so far are stitched and delivered to --out. Press it twice to give up on that.
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
// §SDC (2026-09-04, PHOTOREAL_STILL_RENDER.md §BME.7) — dev-only instrument hooks:
//   --clip in:out   bake only that window of the SAME film (§CPE_CLIP: poseAt remaps, frames scale)
//   --tap file.js   a page script installed at document start (after the pose tap) that may define
//                   window.__maxqTapReport() → { lines: [...], rows: [...] }; lines are logged as
//                   §CLI_BAKE_TAP, the whole object is written to <out>_tap.json.
const CLIP = (() => { const v = arg('clip', null); if (!v) return null; const m = v.split(':').map(Number);
  return (m.length === 2 && m[1] > m[0] && m[0] >= 0 && m[1] <= 1) ? { in: m[0], out: m[1] } : null; })();
const TAP_FILE = arg('tap', null) ? path.resolve(arg('tap')) : null;
// ══ §CLI_BAKE_FLAG_OVERRIDE (2026-09-04, user) ═══════════════════════════════════════════════════
// USER: "when user saves alt-c setting in path in the DB, during silent bake, user need not pass any
// argument further and use the stored path settings. Of course user may still pass args to overwrite
// those settings."
// THREE STATES, not two. A flag left off the command line must stay UNDEFINED so the stored path's
// own value survives the merge in cinema_maxq.js's __maxqBake (`if (o.flags[fk] !== undefined)`).
// Setting it to `false` here would silently overwrite a saved `buildup=1` with off — which is what
// "no argument passed" must never mean, now that §CPE_FLAGS_PORTABLE makes the saved value real.
// The `--no-*` forms exist so an override can also turn something OFF: before them the command line
// could only ever add features, so a path saved with reveal ON could not be baked without it.
function triState(on, off) {
  if (has(off)) return false;
  if (has(on)) return true;
  return undefined;      // absent — the stored path decides
}
const FLAGS = {};
const _fBuildup = triState('buildup', 'no-buildup');
const _fLabel = triState('label', 'no-label');
const _fReveal = triState('reveal', 'no-reveal');
// §CLASH_FILM_P1 — the mesh-true clash pairs as persistent world content (MEP_CLASH_REVEAL_MOVIE.md).
const _fClash = triState('clash', 'no-clash');
// §STOREY_HIGHLIGHT_REVEAL — each storey tints in sequence during the closing orbit (same file).
const _fStoreyReveal = triState('storey-reveal', 'no-storey-reveal');
if (_fBuildup !== undefined) FLAGS.buildup = _fBuildup;
if (_fLabel !== undefined) FLAGS.roomTitle = _fLabel;
if (_fReveal !== undefined) FLAGS.reveal = _fReveal;
if (_fClash !== undefined) FLAGS.clash = _fClash;
if (_fStoreyReveal !== undefined) FLAGS.storeyReveal = _fStoreyReveal;
// `--day off` is already the documented way to turn the counter off, so it needs no --no- form.
if (arg('day', null)) FLAGS.dayCounter = arg('day');

// §CLI_BAKE_PROGRESS / §CLI_BAKE_LAND_ON_ABORT — how often the progress line prints, and how long an
// abort is allowed to spend landing the partial film before the runner gives up on it.
const PROGRESS_EVERY_MS = +arg('progress-every-sec', 30) * 1000;
const ABORT_LAND_MIN = +arg('abort-land-min', 10);
const RATE_WINDOW = 10;   // §CLI_BAKE_PROGRESS — trailing samples the ETA rate is measured over
function fmtDur(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return (h ? h + 'h' : '') + (h || m ? m + 'm' : '') + sec + 's';
}
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
// §CLI_BAKE_LOG_TS (2026-09-04, user: "it be good if it has some timestamp") — ONE clock format for
// every line in the file. The CLI's own lines already carried HH:MM:SS; the page-console firehose,
// which is the bulk of a bake log and the half that carries the § evidence, carried none — so a
// §-line could not be placed against a §CLI_BAKE_PROGRESS frame without counting lines. Milliseconds
// because the bake renders ~1 frame/s and dozens of console lines land inside the same second.
const _t0 = Date.now();
function _ts() { const d = new Date(); return d.toISOString().slice(11, 23) + ' +' + ((Date.now() - _t0) / 1000).toFixed(1).padStart(7) + 's'; }
function log(line) { const s = _ts() + ' ' + line; logStream.write(s + '\n'); console.log(s); }
function logRaw(line) { logStream.write(_ts() + ' ' + line + '\n'); }   // full console firehose → file only

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
    // §HEADFUL_GPU_SELECT (2026-09-04) — headful used to pass NO gpu args and NO env, so a windowed
    // run fell through to whatever ANGLE picked by default. MEASURED: it picked the integrated chip
    // ("ANGLE (Intel, Mesa Intel(R) UHD Graphics (ADL-S GT0.5))") while the headless '--gpu real'
    // run of the SAME film on the SAME machine got "ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX
    // 4060 Laptop GPU)". That made the headful-vs-headless A/B measure TWO variables at once — the
    // window AND the GPU — which is no measurement at all; the run produced 0 frames in 20 minutes
    // and the stall watchdog aborted it. Headful now takes the SAME selector as `real`, so the
    // window is the only thing that differs and the comparison means something.
    headful: ['--use-angle=gl-egl', '--ignore-gpu-blocklist',
              '--disable-backgrounding-occluded-windows']   // §MAXQ_HIDDEN_PAUSE parks hidden tabs
  }[GPU] || [];
  // The EGL VENDOR pin is the lever, not the ANGLE backend flag: with both 10_nvidia.json and
  // 50_mesa.json present, '--use-angle=gl-egl' alone resolves to Mesa/Intel. Naming the vendor file
  // is what reaches the discrete card. Same value for headful as for real — one selector, not two.
  const gpuEnv = (GPU === 'real' || GPU === 'headful')
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
  const S = { frames: 0, total: 0, elapsedMs: 0, lastProgress: Date.now(), perFrame: [], fatal: null,
              done: false, claims: {}, heap: [], abortRequested: null, lastProgressLog: 0, rateHist: [] };
  // ══ §CLI_BAKE_LAND_ON_ABORT — Ctrl-C is the abort switch, and it LANDS the film ════════════════
  // USER, 2026-09-04: "an abort switch where the frames to date are landed." A plain Ctrl-C killed
  // node outright, taking the browser and every baked frame with it — even though cinema_maxq's
  // cancel path stitches whatever it has. The handler turns the signal into the SAME cancel the
  // stall/timeout watchdogs already use, so there is ONE abort path, not a second one to keep in
  // step. A second Ctrl-C is honoured immediately: an operator who has changed their mind about
  // waiting for a 2,000-frame encode must never be trapped by the graceful path.
  let sigCount = 0;
  ['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => {
    sigCount++;
    if (sigCount === 1) {
      S.abortRequested = `user (${sig}) — landing the ${S.frames} frames baked so far`;
      log(`§CLI_BAKE_SIGINT ${sig} received at frame ${S.frames}/${S.total || '?'}` +
          ' — cancelling the bake and stitching what exists. Press again to give up on the partial film.');
    } else {
      log(`§CLI_BAKE_SIGINT ${sig} again — abandoning the partial film, exiting now`);
      process.exit(130);
    }
  }));
  const CLAIM_RX = /§(PHOTO_PREWARM|CPE_STATS_TAIL|CPE_PIE_HOLD|MAXQ_FRAME_BUDGET|MAXQ_MP4_FALLBACK|MAXQ_DONE|MAXQ_QUALITY|MAXQ_DELIVERED|CLI_BAKE_RESOLVED|MAXQ_OVERRIDE_IN|MAXQ_START|MAXQ_START_REVISED|CPE_APPLIED|CINEMA_PATH_RESTORE|CPE_BUILDUP_TOPOUT|CPE_BUILDUP_SKIP|MAXQ_HDRI_RACE|MAXQ_STREAM_WAIT|CPE_REVEAL)\b/;
  // §CLI_BAKE_LOAD_FATAL (2026-09-05) — a DB that cannot be fetched must abort NOW, not in 15 minutes.
  // MEASURED: a wrong/missing buildings/<name>.db logged `§INIT_ERROR … 404` at 2.7 s, then the load
  // predicate below (which can never become true without a DB) burned its full 900 s timeout and
  // died with a bare `TimeoutError: Waiting failed`, naming nothing. Fifteen minutes to learn a path
  // was wrong. The page already says exactly what happened — read it and stop.
  let _loadFatal = null;
  const FATAL_RX = /§INIT_ERROR|§DB_404_OCI_FAIL|Failed to fetch .*\b(40\d|50\d)\b/;
  page.on('console', m => {
    const t = m.text();
    logRaw('[con] ' + t);
    if (!_loadFatal && FATAL_RX.test(t)) _loadFatal = t.slice(0, 400);
    const mm = t.match(CLAIM_RX);
    if (mm) { (S.claims[mm[1]] = S.claims[mm[1]] || []).push(t); }
    if (/§MAXQ_FRAME i=|§CPE_BUILDUP frame=|§MAXQ_STREAM|warming up|§MAXQ_MP4 |§MAXQ_STITCH|§MAXQ_IDB_READY/.test(t)) S.lastProgress = Date.now();
    const fm = t.match(/§MAXQ_FRAME i=(\d+)\/(\d+) elapsedMs=(\d+) perFrameMs=(\d+)/);
    if (fm) { S.frames = +fm[1]; S.total = +fm[2]; S.elapsedMs = +fm[3]; S.perFrame.push(+fm[4]);
      // §CLI_BAKE_PROGRESS — a short trailing window of (frame, elapsed) so the ETA is priced at the
      // rate the bake is running NOW, not its cumulative average. MEASURED on the 2,937-frame
      // Hospital bake of 2026-09-04 (true total 45.9 min): the cumulative average predicted 38.3 min
      // at 28% because early frames are light and the buildup gets heavier as the model fills in;
      // the trailing window over the same sample predicts 42.6 min. The first ~25% is optimistic
      // either way and the progress line says so rather than implying a precision it does not have.
      S.rateHist.push([+fm[1], +fm[3]]);
      if (S.rateHist.length > RATE_WINDOW) S.rateHist.shift();
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
  // §SDC (2026-09-04, PHOTOREAL_STILL_RENDER.md §BME.7): --tap file.js is installed AFTER the pose
  // tap above so it can wrap window.__maxqPoseTap (frame boundaries) — dev-only, same family.
  if (TAP_FILE) await page.evaluateOnNewDocument(fs.readFileSync(TAP_FILE, 'utf8'));

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
  // §CLI_BAKE_LOAD_FATAL — race the load predicate against the page's own error report.
  await Promise.race([
    page.waitForFunction(() => window.APP.activeBuilding && window.APP.db &&
      window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) &&
      !window.APP.streaming, { timeout: 900000, polling: 1000 }),
    new Promise((_, reject) => {
      const iv = setInterval(() => {
        if (!_loadFatal) return;
        clearInterval(iv);
        reject(new Error('§CLI_BAKE_LOAD_FATAL the building never loaded — ' + _loadFatal +
          '  [db=' + DB + ' url=' + dbUrl + ' root=' + ROOT + ']  Check that ' +
          (DB.includes('/') ? DB : 'buildings/' + DB + '.db') + ' exists under --root (a symlink is fine).'));
      }, 250);
    })
  ]);
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
  // §CLI_BAKE_FLAG_OVERRIDE — the gate must ask what the bake WILL ACTUALLY DO, not what the command
  // line asked for. Since §CPE_FLAGS_PORTABLE the buildup can come from the saved path with no flag
  // on the command line at all, and gating the prime on FLAGS.buildup alone meant such a run reached
  // the bake with no timeline primed — the exact case the warning below exists for. Resolution order
  // here MIRRORS __maxqBake's own merge (CLI wins, else the stored path), and the stored value is read
  // through the SHIPPED lazy loader (`cinemaPathPlan` triggers `_cpeLoadFromDb`, then
  // `_getCinemaPathEdit`) rather than a second reader — guarded on `a.db` for the same reason
  // __maxqBake guards it: probing before the DB is open latches `_cpeLoaded` and blinds the session.
  const willBuildup = await page.evaluate((f) => {
    if (f.buildup !== undefined) return { on: !!f.buildup, src: 'cli' };
    const a = window.APP;
    if (!a || !a.db) return { on: false, src: 'no-db-yet' };
    try { if (typeof a.cinemaPathPlan === 'function') a.cinemaPathPlan(60); } catch (e) {}
    const st = (a._getCinemaPathEdit && a._getCinemaPathEdit()) || null;
    return { on: !!(st && st.buildup), src: st ? 'stored-path' : 'no-stored-path' };
  }, FLAGS);
  log(`§CLI_BAKE_BUILDUP_RESOLVED on=${willBuildup.on ? 1 : 0} source=${willBuildup.src}` +
      ' — decides whether the Time Machine is primed before the bake asks for a timeline');
  if (willBuildup.on) {
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
  // ══ §CPE_BAKE_RES (2026-09-05) — the panel's "Silent-bake size" choice, honoured here ═══════════
  // Same contract as §CLI_BAKE_FLAG_OVERRIDE: save it once in the Alt+C panel and bake with no
  // arguments; an explicit --width/--height still wins. The viewport IS the canvas the bake renders
  // from (cinema_maxq.js:1120 reads renderer.domElement), so setting it here is the whole mechanism.
  let _fps = FPS, _frames = FRAMES;
  if (!has('width') && !has('height')) {
    const storedRes = await page.evaluate(() => {
      try {
        const a = window.APP;
        if (!a.db) return null;
        if (typeof a.cinemaPathPlan === 'function') { try { a.cinemaPathPlan(60); } catch (e) {} }
        const st = (a._getCinemaPathEdit && a._getCinemaPathEdit()) || null;
        return (st && st.bakeRes) ? String(st.bakeRes) : null;
      } catch (e) { return null; }
    }).catch(() => null);
    const m = storedRes && storedRes.match(/^(\d+)x(\d+)(?:@(\d+))?$/);
    if (m) {
      const sw = +m[1], sh = +m[2], sf = m[3] ? +m[3] : null;
      await page.setViewport({ width: sw, height: sh });
      if (sf && !has('fps')) _fps = sf;
      log(`§CPE_BAKE_RES applied ${sw}x${sh}${sf ? '@' + sf + 'fps' : ''} from the stored Alt+C path ` +
        `(was ${W}x${H}${FPS ? '@' + FPS : ''}; pass --width/--height to override)`);
    } else if (storedRes) {
      log(`§CPE_BAKE_RES ignored stored="${storedRes}" — not <w>x<h>[@fps]; baking at ${W}x${H}`);
    }
  }
  const bakeOpts = { name: PLAN_NAME || undefined, flags: FLAGS, frames: _frames, fps: _fps };
  if (OV_FILE) bakeOpts.override = JSON.parse(fs.readFileSync(OV_FILE, 'utf8'));
  if (CLIP) { bakeOpts.clip = CLIP; log(`§CLI_BAKE_CLIP in=${CLIP.in} out=${CLIP.out} (§SDC — a window of the same film)`); }
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
    // ══ §CLI_BAKE_PROGRESS (2026-09-04, user: "will the CLI show frame in progress and ETA?") ═════
    // The runner already parsed §MAXQ_FRAME for its stall watchdog and threw the numbers away. A bake
    // is tens of minutes with nothing on screen; "is it moving, and how long more" should not require
    // tailing the log and doing the arithmetic by hand. Rate comes from the VIEWER's own elapsedMs /
    // frame index, not from wall clock here, so load, streaming and the Time Machine prime are not
    // charged to the per-frame rate — the ETA is about the frames that are left, which is the
    // question being asked. Throttled to PROGRESS_EVERY_MS so a 40-minute bake logs ~80 lines, not
    // thousands; §MAXQ_FRAME itself already fires roughly every 8 frames in the raw log.
    if (S.frames > 0 && S.total > 0 && Date.now() - S.lastProgressLog >= PROGRESS_EVERY_MS) {
      S.lastProgressLog = Date.now();
      const h = S.rateHist;
      const win = (h.length >= 2 && h[h.length - 1][0] > h[0][0])
        ? (h[h.length - 1][1] - h[0][1]) / (h[h.length - 1][0] - h[0][0])
        : null;
      const rate = win != null ? win : S.elapsedMs / Math.max(1, S.frames);
      const left = Math.max(0, S.total - S.frames);
      const pct = 100 * S.frames / S.total;
      log(`§CLI_BAKE_PROGRESS frame=${S.frames}/${S.total} ${pct.toFixed(1)}%` +
          ` rate=${(rate / 1000).toFixed(3)}s/frame (${win != null ? 'trailing ' + h.length : 'cumulative'})` +
          ` elapsed=${fmtDur(S.elapsedMs)} eta=${fmtDur(left * rate)} (${left} frames left)` +
          (pct < 25 ? ' — early estimate runs LOW; frames get heavier as the model fills in' : ''));
    }
    if (S.abortRequested) { aborted = S.abortRequested; break; }
    if (S.fatal) { aborted = 'fatal: ' + S.fatal; break; }
    if ((Date.now() - S.lastProgress) / 60000 > STALL_MIN) { aborted = `stall: no progress line for ${STALL_MIN} min (last frame=${S.frames})`; break; }
    if (mins > TIMEOUT_MIN) { aborted = `timeout: ${TIMEOUT_MIN} min wall-clock cap`; break; }
  }
  clearInterval(heapIv);
  if (aborted) {
    // ══ §CLI_BAKE_LAND_ON_ABORT (2026-09-04, user: "an abort switch where the frames to date are
    // landed") — cinema_maxq's own cancel path ALREADY stitches what it has whenever at least one
    // second of footage exists (`framesDone >= (_cancel ? fps : 1)`), so the film is not thrown away
    // by cancelling. What was missing here is the WAIT: this used to sleep a flat 10 s, which is
    // nowhere near enough to encode two thousand frames, so the process tore down mid-stitch and the
    // partial film was lost anyway — the exact thing the viewer had gone to the trouble of saving.
    // Now it waits for the bake's own promise to settle (delivery included), bounded, and says which
    // it got. The bound is generous because an abort at frame 2,000 has a real encode ahead of it.
    log(`§CLI_BAKE_ABORT ${aborted}`);
    try {
      await page.evaluate(() => window.APP.cancelMaxQualityOrbit());
      const landT0 = Date.now();
      let landed = null;
      while ((Date.now() - landT0) / 60000 < ABORT_LAND_MIN) {
        await new Promise(r => setTimeout(r, 2000));
        landed = await page.evaluate(() => window.__bakeResult).catch(() => null);
        if (landed) break;
      }
      const bytes = await page.evaluate(() => window.__maxqDeliveredBytes || 0).catch(() => 0);
      log(`§CLI_BAKE_LANDED framesAtAbort=${S.frames} settled=${landed ? 'yes' : 'NO (still encoding when the ' +
          ABORT_LAND_MIN + '-min landing cap ran out)'} deliveredBytes=${bytes}` +
          (bytes ? ' — the frames baked so far ARE in the output file' :
                   ' — nothing delivered; too few frames, or the encode did not finish'));
    } catch (e) { log('§CLI_BAKE_LAND_FAIL ' + e.message); }
  } else {
    log(`§CLI_BAKE_RESULT ${JSON.stringify(result)}`);
  }

  // §SDC — the tap's own report, if a --tap script defined one (numbers + lines only come back)
  if (TAP_FILE) {
    const rep = await page.evaluate(() => { try { return window.__maxqTapReport ? window.__maxqTapReport() : { lines: ['§SDC_VERDICT INCONCLUSIVE reason=no __maxqTapReport in page'] }; }
      catch (e) { return { lines: ['§SDC_VERDICT INCONCLUSIVE reason=tap-report-threw ' + String(e && e.message)] }; } }).catch(e => ({ lines: ['§SDC_VERDICT INCONCLUSIVE reason=evaluate-failed ' + String(e && e.message)] }));
    for (const l of (rep && rep.lines) || []) log('§CLI_BAKE_TAP ' + l);
    const tapOut = OUT.replace(/\.[a-z0-9]+$/i, '') + '_tap.json';
    fs.writeFileSync(tapOut, JSON.stringify(rep));
    log(`§CLI_BAKE_TAP_FILE ${tapOut} lines=${((rep && rep.lines) || []).length} rows=${((rep && rep.rows) || []).length}`);
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
