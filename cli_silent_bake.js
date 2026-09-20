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
//     [--measure] [--no-measure]                      setting-out datum drawing (§FLYTHRU_DATUM, MEP_CLASH_REVEAL_MOVIE.md §28.1);
//                                                       since §129 GATING (2026-09-15) this ALSO gates the load path 3D
//                                                       effect (§129.1). Cost/Ledger moved OFF this gate — §129.6 item 6b
//                                                       (2026-09-15) puts them under --label/--4d5d instead (below)
//     [--nohome] [--opening-only]                     §33 §CLI_BAKE_OPENING: skip the datum-legibility gate / judge the opening and exit
//     [--findings-only]                               §RULE_REPORT (STRUCTURAL_SANITY.md T8): run the Sanity + Egress
//                                                       evaluators, write <out>.json, exit before ANY cinema work
//     [--rules-overlay ID]                            §RULE_OVERLAY (T8.14): also apply rates/<kind>_rules_<ID>.json
//                                                       over the base rulebook (per-FIELD merge, same shape as the
//                                                       16 rates packs). Absent file = no override, not an error.
//     [--storey-reveal] [--no-storey-reveal]           each storey tints in sequence during the closing
//                                                       orbit (§STOREY_HIGHLIGHT_REVEAL)
//     [--load-path] [--no-load-path]                    a geological section cut through the deepest
//                                                       support stack, held at topout (§129.1); FOLDED under
//                                                       --measure since §129 GATING — a bare --load-path with
//                                                       --measure off does nothing new, --no-load-path stays as
//                                                       a control-only override (forces it off even with --measure)
//     [--ledger] [--no-ledger]                          §129.2 kernel-ops verification HUD row, DIRECTLY BELOW
//                                                       Cost, both inside the pie-chart HUD (§129.6 item 6b,
//                                                       2026-09-15) — folded under --label/--4d5d, NOT --measure
//     [--cost] [--no-cost]                              §129.5 running cost/hours figure, a row of the SAME
//                                                       pie-chart HUD, directly above Ledger — same --label/--4d5d
//                                                       fold as Ledger, not --measure (§129.6 item 6b)
//     [--escape-route] [--no-escape-route]            §ESCAPE_ROUTE_REVEAL: during the closing orbit the
//                                                       worst-case room shines through and an orange dotted
//                                                       line traces its REAL computed route to the exit,
//                                                       counting up in walking time (1.19 m/s, SFPE) and in
//                                                       steps (0.75 m stride, uncited). Draws nothing on a
//                                                       building whose room graph reaches no exit — the log
//                                                       says §ESCAPE_ROUTE_BUILD VACUOUS, read it.
//     [--sun-date YYYY-MM-DD]                         §SUN_DAY: light the WHOLE film on that one
//                                                       day, sun rising to late afternoon across it.
//                                                       The build still follows the 4D timeline.
//     [--dlod-proxy]                                  LARGE_DB_BAKE.md §8.3 L8c: render already-built
//                                                       elements outside the view as instanced boxes.
//                                                       Large buildings only (>=50k elements, the
//                                                       tm-lod toggle's own gate). MEASURED on LTU:
//                                                       -41% per frame, 1.72% of pixels changed.
//                                                       OFF by default — verified on one 30s slice,
//                                                       not yet on a full film. Read the film.
//     [--sun-compass] [--no-sun-compass]              true-north ground compass + sun path + day of
//                                                       the year (§SUN_COMPASS, GEOREF_SUNPATH_COMPASS.md
//                                                       §7). OFF by default; needs a site lat/long in
//                                                       project_metadata or it draws nothing and says so.
//     [--no-buildup] [--no-label] [--no-reveal]       turn a SAVED setting off for this run
//   With no flag given, the path's OWN saved settings are used (§CPE_FLAGS_PORTABLE) — a path saved
//   in the viewer bakes exactly as it was authored, with no arguments at all.
//     [--frames N | --seconds S] [--fps N]            length (default: the plan's own pacing)
//     [--gpu sw|real|headful] [--chrome-args "..."]   GPU mode (stage-3 feasibility decides)
//     [--width W --height H] [--port P] [--log FILE] [--profile DIR]
//     [--stall-min N] [--max-frame-ms N]              health watchdog (abort early, not at the end)
//     [--timeout-min N]                               hard wall-clock cap
//     [--progress-every-sec N] [--abort-land-min N]   progress cadence (30) / abort landing cap (10)
//     [--still-budget taa,ao]                          override the 8/12 bake fold (LARGE_DB_BAKE.md
//                                                       §2 L3); absent = unchanged default quality
//     [--frame-range a:b]                              render frames a..b-1 of the FULL film,
//                                                       frame-exact (LARGE_DB_BAKE.md §2 L4) — NOT
//                                                       the same grid as --clip (§0), mutually exclusive
//
//   PROGRESS + ETA print as §CLI_BAKE_PROGRESS while the bake runs. Ctrl-C (SIGINT) aborts CLEANLY:
//   the frames baked so far are stitched and delivered to --out. Press it twice to give up on that.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');
// ⚠ puppeteer is RESOLVED, not hardcoded. This line used to read
//   require('/home/red1/bim-compiler/node_modules/puppeteer')
// — an absolute path carrying one developer's username, in the very file the usage block above
// tells every user to run. It failed for everyone else with a MODULE_NOT_FOUND naming a home
// directory they do not have. puppeteer is a HEAVY optional dep (it ships a browser), so it is
// deliberately NOT in package.json: resolve it, and if it is genuinely absent say what to install
// instead of dying on someone else's path.
const puppeteer = (function () {
  const tried = [];
  for (const id of [process.env.PUPPETEER_PATH,
                    'puppeteer',
                    path.join(process.env.HOME || '', 'bim-compiler', 'node_modules', 'puppeteer')]) {
    if (!id) continue;
    tried.push(id);
    try { return require(id); } catch (e) { /* next */ }
  }
  console.error('§CLI_BAKE_NO_PUPPETEER could not load puppeteer. Tried: ' + tried.join(', '));
  console.error('  This script drives a real headless browser, so puppeteer is required.');
  console.error('  Fix: `npm install puppeteer` in the repo root, or set PUPPETEER_PATH=/abs/path.');
  console.error('  (The in-BROWSER bake needs none of this — open index.html and bake from the viewer.)');
  process.exit(1);
})();

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
// LARGE_DB_BAKE.md §2 L4 — `--frame-range a:b` renders frames a..b-1 of the FULL film at that
// film's own tn_i = i/(N-1) step (§0's Clip-to-frame mapping note: a --clip is NOT this — its n
// frames re-derive tn_i = i/(n-1) across [in,out], a different grid). Lets K bakes on K ports split
// one long film into disjoint, byte-identical-at-the-seam ranges (§FRAME_HASH proves it).
const FRAME_RANGE = (() => { const v = arg('frame-range', null); if (!v) return null; const m = v.split(':').map(Number);
  return (m.length === 2 && Number.isInteger(m[0]) && Number.isInteger(m[1]) && m[1] > m[0] && m[0] >= 0) ? { a: m[0], b: m[1] } : null; })();
if (FRAME_RANGE && CLIP) { console.error('§CLI_BAKE_ARG_CONFLICT --frame-range and --clip are two different frame grids (§0) — pass only one'); process.exit(1); }
const TAP_FILE = arg('tap', null) ? path.resolve(arg('tap')) : null;
// §DLOD_PROXY (2026-09-19, LARGE_DB_BAKE.md §8.3 L8c) — `--dlod-proxy` swaps ALREADY-BUILT elements
// outside the camera's view for instanced boxes during the bake. The mechanism is time_machine.js's
// own `tm-lod` toggle, which has always existed and has always been unreachable from a headless run
// because it needs a click; this only asks for it. It obeys that toggle's OWN large-building gate
// (DLOD_TM_MIN_ELEMENTS, 50,000 elements), so asking for it on a small building does nothing.
// MEASURED on a paired 150-frame LTU slice, same camera, one flag apart: 1212.5 -> 717.1 ms/frame
// (-41%), visible meshes 3645 -> 1234, matched frames differing in 1.72% of pixels.
// OFF BY DEFAULT and staying that way until a FULL film is compared, not one 30 s slice: the risk
// case is a wide establishing shot where a distant wing becomes a box, and no such frame has been
// looked at yet. Turn it on deliberately, per bake, and check the film.
const DLOD_PROXY = !!arg('dlod-proxy', false);
// §DATUM_DECOUPLE (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §53) — dev-only bisect instrument:
//   --burnin-datum-src clean.mp4   skip the GPU render + every other overlay; load clean.mp4's own
//                                   frames instead and draw ONLY the datum layer on top. Use the SAME
//                                   --clip/--fps/--width/--height the clean.mp4 was baked with, or the
//                                   frame count will not line up (a mismatch fails loudly per-frame,
//                                   §DATUM_DECOUPLE_ERR, not silently).
const BURNIN_SRC = arg('burnin-datum-src', null) ? path.resolve(arg('burnin-datum-src')) : null;
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
// §129.6 item 6b (2026-09-15): the "Label" toggle's on-screen text becomes "4D/5D" (it now also
// carries the day counter/cost/ledger rows) — `--4d5d`/`--no-4d5d` is an ALIAS for the same
// FLAGS.roomTitle so no existing bake command using --label breaks. `--label` wins if BOTH are
// somehow given (first-parsed-wins via `??`, matching triState's own "absent = undefined" contract).
const _f4d5d = triState('4d5d', 'no-4d5d');
const _fReveal = triState('reveal', 'no-reveal');
// §CLASH_FILM_P1 — the mesh-true clash pairs as persistent world content (MEP_CLASH_REVEAL_MOVIE.md).
const _fClash = triState('clash', 'no-clash');
// §FLYTHRU_DATUM (MEP_CLASH_REVEAL_MOVIE.md §28.1) — the Measure checkbox's CLI form, same tri-state as clash.
const _fMeasure = triState('measure', 'no-measure');
// §STOREY_HIGHLIGHT_REVEAL — each storey tints in sequence during the closing orbit (same file).
const _fStoreyReveal = triState('storey-reveal', 'no-storey-reveal');
// §129.1 LOAD PATH (MEP_CLASH_REVEAL_MOVIE.md §129.1/§129.4) — the geological-section beat held at
// topout. Same three-state contract as every other flag here: absent = the stored path decides.
const _fLoadPath = triState('load-path', 'no-load-path');
// §129.2 LEDGER TICKER / §129.5 COST ODOMETER — placement ruling §129.6 item 6b (2026-09-15)
// SUPERSEDES the original §129 GATING fold-under-measure: both are now rows of the pie-chart HUD,
// gated by the SAME toggle as --label/--4d5d, NOT --measure (the load path 3D effect stays under
// --measure, untouched). --no-ledger/--no-cost remain as control-only overrides.
const _fLedger = triState('ledger', 'no-ledger');
const _fCost = triState('cost', 'no-cost');
// §ESCAPE_ROUTE_REVEAL (bim-compiler prompts/ESCAPE_ROUTE_REVEAL.md) — same tri-state as the rest.
const _fEscapeRoute = triState('escape-route', 'no-escape-route');
// §SUN_COMPASS (bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §7) — the true-north ground rose
// with the 4D day-of-year and the sun's angle of attack. Its OWN flag, not folded into --measure:
// the datum draws the model's own setting-out grid, this draws the model's relationship to the
// planet. OFF unless asked for, so every existing saved path re-bakes byte-identically.
// It draws nothing at all on a building whose DB has no site latitude/longitude, and the bake log
// says §SUN_COMPASS INCONCLUSIVE with the reason — read the log, do not infer from the video.
const _fSunCompass = triState('sun-compass', 'no-sun-compass');
if (_fBuildup !== undefined) FLAGS.buildup = _fBuildup;
if (_fLabel !== undefined) FLAGS.roomTitle = _fLabel;
else if (_f4d5d !== undefined) FLAGS.roomTitle = _f4d5d;
if (_fReveal !== undefined) FLAGS.reveal = _fReveal;
if (_fClash !== undefined) FLAGS.clash = _fClash;
if (_fMeasure !== undefined) FLAGS.measure = _fMeasure;
if (_fStoreyReveal !== undefined) FLAGS.storeyReveal = _fStoreyReveal;
if (_fLoadPath !== undefined) FLAGS.loadPath = _fLoadPath;
if (_fLedger !== undefined) FLAGS.ledger = _fLedger;
if (_fCost !== undefined) FLAGS.cost = _fCost;
if (_fEscapeRoute !== undefined) FLAGS.escapeRoute = _fEscapeRoute;
if (_fSunCompass !== undefined) FLAGS.sunCompass = _fSunCompass;
// §SUN_DAY — light the whole film on one day (yyyy-mm-dd), hour sweeping morning to late
// afternoon. Absent = the 4D timeline's own dates drive the light, which is the shipped behaviour.
if (arg('sun-date', null)) FLAGS.sunDate = String(arg('sun-date'));
// `--day off` is already the documented way to turn the counter off, so it needs no --no- form.
if (arg('day', null)) FLAGS.dayCounter = arg('day');
// LARGE_DB_BAKE.md §2 L3 — `--still-budget taa,ao` overrides cinema_maxq.js's hardcoded 8/12 bake
// fold (20 renders/frame — ~1.7s of every LTU/Hospital frame). Absent = byte-identical to before
// this flag existed; the default delivery quality is unchanged unless the caller asks for less.
const STILL_BUDGET = (() => {
  const v = arg('still-budget', null); if (!v) return null;
  const m = v.split(',').map(Number);
  return (m.length === 2 && m[0] >= 0 && m[1] >= 0) ? { taa: m[0], ao: m[1] } : null;
})();

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
    // §CLI_BAKE_OFFLINE (2026-09-19) — the film needs NO network: every asset (three.js,
    // sql-wasm, the HDRI, the fonts, the DB) is served from this checkout by the local server
    // below, viewer/loader.js is local-first, and §SUN_PATH is NOAA arithmetic computed in
    // process. But headless Chrome still opens its OWN background channels: MEASURED with `ss`
    // during a 1080p bake on this date, the bake's browser held one connection to Google push
    // (port 5228) for the whole run. Nothing the film reads, yet it is the difference between
    // "needs no network" and "makes no connection", and only the second one is checkable.
    // These three flags close it: no push/variations/safe-browsing fetches, no first-run ping.
    args: ['--no-sandbox', '--hide-crash-restore-bubble',
           '--disable-background-networking', '--disable-component-update', '--no-first-run',
           `--window-size=${W + 20},${H + 120}`]
      .concat(gpuArgs, extra)
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });

  // console firehose → log file; §-lines also drive the health watchdog + summary
  const S = { frames: 0, total: 0, elapsedMs: 0, lastProgress: Date.now(), perFrame: [], fatal: null,
              done: false, claims: {}, heap: [], abortRequested: null, lastProgressLog: 0, rateHist: [],
              // §CLI_BAKE_POINT_OF_NO_RETURN — set the moment __maxqSinkBegin fires. Past it there
              // are no frames left to abandon: the film is fully encoded and muxed in the page and
              // the only work remaining is writing it to disk. See the handler below.
              sinkBegun: false, sinkBytes: 0, sinkTotal: 0 };
  // ══ §CLI_BAKE_LAND_ON_ABORT — Ctrl-C is the abort switch, and it LANDS the film ════════════════
  // USER, 2026-09-04: "an abort switch where the frames to date are landed." A plain Ctrl-C killed
  // node outright, taking the browser and every baked frame with it — even though cinema_maxq's
  // cancel path stitches whatever it has. The handler turns the signal into the SAME cancel the
  // stall/timeout watchdogs already use, so there is ONE abort path, not a second one to keep in
  // step. A second Ctrl-C is honoured immediately: an operator who has changed their mind about
  // waiting for a 2,000-frame encode must never be trapped by the graceful path.
  //
  // ⚠ §CLI_BAKE_POINT_OF_NO_RETURN (2026-09-12) — THE CANCEL MUST NOT FIRE DURING THE FINAL WRITE.
  // MEASURED, and the reason this guard exists: the Hospital v86 bake (4,699 frames, 1h41m) took a
  // SIGTERM at +6101.9s — five seconds AFTER `§MAXQ_MP4 encoded chunks=4699 bytes=242117405`,
  // after the mux, and after `§CLI_BAKE_SINK begin totalBytes=242156095`. Every frame was already
  // encoded and muxed; the only work left was streaming a finished 242 MB blob to disk. The
  // handler cancelled anyway — "stitching what exists" — and left 121,634,816 bytes, exactly
  // 50.2%, unplayable as delivered. The salvage path destroyed a finished film because it had no
  // notion of a point past which there is nothing to salvage.
  //
  // Landing frames early is right DURING capture and wrong during delivery. So: once the sink has
  // begun, the first signal declines to cancel and lets the write finish (seconds, not minutes).
  // A second signal still exits immediately — an operator is never trapped, which was the whole
  // point of the original handler.
  let sigCount = 0;
  ['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => {
    sigCount++;
    if (sigCount === 1 && S.sinkBegun) {
      log(`§CLI_BAKE_SIGINT ${sig} received DURING THE FINAL WRITE (${S.sinkBytes} of ${S.sinkTotal} bytes written) —` +
          ' the film is already fully encoded; finishing the write rather than truncating it.' +
          ' Press again to abandon a half-written file.');
    } else if (sigCount === 1) {
      S.abortRequested = `user (${sig}) — landing the ${S.frames} frames baked so far`;
      log(`§CLI_BAKE_SIGINT ${sig} received at frame ${S.frames}/${S.total || '?'}` +
          ' — cancelling the bake and stitching what exists. Press again to give up on the partial film.');
    } else {
      log(`§CLI_BAKE_SIGINT ${sig} again — abandoning the partial film, exiting now`);
      process.exit(130);
    }
  }));
  // §CLI_BAKE_OVERLAY_CLAIMS (2026-09-19) — the whitelist below decides what a READER of the bake
  // log can ever learn, and until today it carried the film's machinery (frames, quality, path,
  // buildup) and NOT ONE of the overlays those frames are judged on. A full HHS bake with
  // --measure --load-path --ledger --cost --storey-reveal --sun-compass produced 869 log lines and
  // zero §SUN_COMPASS, zero §LOADPATH_*, zero §STOREY_* — so "did the compass draw?" could only be
  // answered by extracting frames from the mp4, which is exactly the check CLAUDE.md's Log Mandate
  // says the log itself should answer. The sun lane's own hard-won warning applies here too: a
  // witness calling a draw function proves nothing about whether the BAKE's call site ran, and the
  // bake's own log was the one place that could have told them apart.
  // Added below: each overlay's BUILD/hold/witness lines — the once-per-bake ones that say the
  // feature ran, refused (INCONCLUSIVE, e.g. a DB with no site lat/long) or was held by the freeze.
  // §129.62 ADDITION (2026-09-20): the three lines §129.62 tells the next session to READ were
  // NOT on this whitelist, so none of them could ever reach out/<db>_hires_<stamp>.log — only
  // the 3.6 MB firehose in /tmp, which is the file the Log Mandate is trying to spare a reader.
  // Measured on the 2026-09-20 09:36 Hospital run: §STOREY_REVEAL_TINT/_MODE and every
  // §ESCAPE_ROUTE_* line were firehose-only. STOREY_REVEAL_TINT is the tint's ONLY evidence
  // (scope=storey meshesTouched=N — whether §129.59's whole-storey scope reached the geometry),
  // ESCAPE_ROUTE_BUILD is the only thing that separates a drawn route from a VACUOUS one, and
  // bare FRAME_REUSE carries the per-run detail behind FRAME_REUSE_TOTAL's single number.
  // `\b` keeps these distinct: STOREY_REVEAL_TINT does not swallow STOREY_REVEAL_TINT_SHARED_MATERIAL,
  // and FRAME_REUSE does not swallow FRAME_REUSE_TOTAL, because `_` is a word character.
  const CLAIM_RX = /§(PHOTO_PREWARM|CPE_STATS_TAIL|CPE_PIE_HOLD|MAXQ_FRAME_BUDGET|MAXQ_MP4_FALLBACK|MAXQ_DONE|MAXQ_QUALITY|MAXQ_DELIVERED|CLI_BAKE_RESOLVED|MAXQ_OVERRIDE_IN|MAXQ_START|MAXQ_START_REVISED|FRAME_COST|CPE_REVEAL_HIDDEN|CPE_REVEAL_LEAK|INTERIOR_LIGHTS_BOUNDARY|INTERIOR_LIGHTS_WITNESS|INTERIOR_LIGHTS_ON|CPE_APPLIED|CINEMA_PATH_RESTORE|CPE_BUILDUP_TOPOUT|CPE_BUILDUP_SKIP|MAXQ_HDRI_RACE|MAXQ_STREAM_WAIT|CPE_REVEAL|SUN_COMPASS|SUN_COMPASS_HELD|SUN_PATH|SUN_CLOCK|SUN_ONE|SUN_ONE_ALL_DARK|SUN_DAY|LOADPATH_BUILD|LOADPATH_ARM|LOADPATH_HOLD|LOADPATH_FOCUS|LOADPATH_CARD|LOADPATH_INFOPANEL|LEDGER_TICKER_INIT|HUD_LAYOUT|HUD_LAYOUT_ARM|STOREY_ARCH_WITNESS|STOREY_LABEL_WITNESS|STOREY_CUT_RESTORE_WITNESS|STOREY_ARM_BASELINE|FLYTHRU_DATUM_BUILT|FRAME_REUSE_TOTAL|FRAME_REUSE|DLOD_TM_CENSUS|STOREY_REVEAL_TINT_RESTORE|STOREY_REVEAL_TINT|STOREY_REVEAL_MODE|PLACE_TABLE|PLACE_RESOLVED|RULE_TINT_CEASE|RULE_TINT_ENTER|FILM_LAYER|FINDINGS_CEASE_3D|FINDINGS_CEASE|ESCAPE_ROUTE_CASING|ESCAPE_ROUTE_ALTERNATES|ESCAPE_ROUTE_BUILD|ESCAPE_ROUTE_WINDOW|ESCAPE_ROUTE_POPULATION|ESCAPE_ROUTE_BREACH)\b/;
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
    // §CLI_BAKE_FAIL_NO_TIMELINE (MEP_CLASH_REVEAL_MOVIE.md §88.10e/§88.12) — the Time Machine
    // refusing to arm is a FAILED buildup, not a cosmetic note. It used to pass through as a
    // page-side warning while the run delivered a film with the buildup silently dropped and
    // exited 0, because S.fatal was only ever set by §MAXQ_FAIL or --max-frame-ms. §88 cost
    // four sessions partly because a bake's exit code said nothing about what it actually drew.
    if (/§CPE_BUILDUP_ARM_GATE timeout/.test(t)) S.fatal = t;
  });
  page.on('pageerror', e => { logRaw('[pageerror] ' + e.message); log('⚠ PAGEERROR ' + e.message.slice(0, 160)); });

  // delivery sink: page → node file (chunked base64 through an exposed function)
  let sink = null, sinkName = null, sinkBytes = 0;
  await page.exposeFunction('__maxqSinkBegin', (name, type, total) => {
    sinkName = name; sinkBytes = 0;
    S.sinkBegun = true; S.sinkBytes = 0; S.sinkTotal = total;   // §CLI_BAKE_POINT_OF_NO_RETURN — past here a cancel only truncates
    sink = fs.createWriteStream(OUT);
    log(`§CLI_BAKE_SINK begin name=${name} type=${type} totalBytes=${total} → ${OUT}`);
  });
  await page.exposeFunction('__maxqSink', b64 => new Promise((res, rej) => {
    const buf = Buffer.from(b64, 'base64'); sinkBytes += buf.length; S.sinkBytes = sinkBytes;
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
  // §DLOD_PROXY — set before any page script runs, so time_machine.js's own large-building gate
  // sees it at activation. A separate evaluateOnNewDocument so it composes with --tap rather than
  // competing for it.
  if (DLOD_PROXY) {
    await page.evaluateOnNewDocument('window.__dlodProxyBake = 1;');
    log('§CLI_BAKE_DLOD_PROXY requested — distant already-built elements render as instanced boxes' +
        ' (large buildings only; §DLOD_BAKE_PROXY in the page log confirms the gate passed)');
  }

  const dbUrl = DB.includes('/') ? DB : `/buildings/${DB}.db`;
  const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=${dbUrl}`;
  log(`§CLI_BAKE_NAV ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // ⚠ §CLI_BAKE_SW_PURGE (2026-09-08, MEP_CLASH_REVEAL_MOVIE.md §43) — THE BAKE MUST NOT RUN STALE JS.
  // viewer.html and every module are precached by viewer/sw.js at a FIXED `?v=` query, so a profile
  // that has ever loaded the viewer keeps serving the OLD viewer.html — which means a NEW <script>
  // tag added this session is simply absent, and the bake silently exercises the previous build.
  // MEASURED: the 0-30 s Hospital bake of 2026-09-08 printed the PREVIOUS build's
  // `§SLAB_BEAT_INIT … depth-tested tint + X, shine-through label` and emitted no §HUD_BOX /
  // §STATUS_BOX / §MEASURE_BOX / §SLAB_BEAT_AREA at all — 8 minutes of GPU spent testing code that
  // was not in the film. Every witness_*.js already does exactly this; the bake runner never did.
  const _swPurge = await page.evaluate(async () => {
    let regs = 0, ks = 0;
    try { if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations();
      regs = rs.length; for (const r of rs) await r.unregister(); } } catch (e) {}
    try { if (window.caches) { const k = await caches.keys(); ks = k.length; for (const n of k) await caches.delete(n); } } catch (e) {}
    return { regs, ks };
  });
  log(`§CLI_BAKE_SW_PURGE unregistered=${_swPurge.regs} cachesDeleted=${_swPurge.ks} — reloading so the bake runs THIS build, not the precached one`);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
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
  // ── §RULE_REPORT (prompts/STRUCTURAL_SANITY.md T8) — the findings WITHOUT the film ──────────
  // MEASURED case for the flag: Hospital knows all 509 findings at +101.3s and finishes the film
  // at ~+6,000s (1.7% analysis); Terminal, 3.5%. Of Hospital's 101.3s, 71.3s is the model load
  // just logged above and ~29s is the cinema path planning + render staging BELOW this block —
  // which is exactly why the exit goes HERE, before the datum gate, not next to --opening-only.
  //
  // ⚠ T8.3 — this must NOT call A.ruleFindingsFilmBuild. That needs a plan (its dwell precompute
  // calls plan.poseAt), a tint and later a camera: everything findings-only exists to skip. Call
  // the evaluators directly — the same two the panels use, with zero duplicated rule logic.
  if (has('findings-only')) {
    const jsonOut = OUT.replace(/\.mp4$/i, '') + '.json';
    const report = await page.evaluate(async (OVERLAY_ID) => {
      const A = window.APP;
      const out = { err: null };
      try {
        if (typeof RuleReport === 'undefined') return { err: 'rule_report.js not loaded' };
        if (!A.dbQuery) return { err: 'no A.dbQuery' };
        // T8.13 — the SAME loader the panel uses, with the SAME fallback constants the
        // evaluators own. This path used to hand `null` to evaluate() and let the evaluator's
        // own inline defaults apply silently; now the fallback is explicit and `source` says so.
        // T8.14 — an overlay id makes this a jurisdiction run; without one it is the global
        // rulebook exactly as before. The id is passed in from the CLI flag, never guessed here.
        const ov = (id, kind) => id ? { overlayUrl: 'rates/' + kind + '_rules_' + id + '.json', overlayId: id } : {};
        const sj = await RuleReport.loadRules(fetch.bind(window), 'rates/structural_rules.json',
          (typeof StructuralSanity !== 'undefined') ? StructuralSanity.FALLBACK_RULES : { structural_rules: [] },
          Object.assign({ log: (m) => console.log(m) }, ov(OVERLAY_ID, 'structural')));
        const ej = await RuleReport.loadRules(fetch.bind(window), 'rates/egress_rules.json',
          (typeof EgressSanity !== 'undefined') ? EgressSanity.FALLBACK_RULES : { egress_rules: [] },
          Object.assign({ log: (m) => console.log(m) }, ov(OVERLAY_ID, 'egress')));
        let rowsS = [], rowsE = [], rgFacts = null;
        const logS = [], logE = [];
        if (typeof StructuralSanity !== 'undefined') {
          // witness:true — T8.12. A report exists to be inspected; a row that cannot show WHY it
          // fired is the thing this whole surface is trying to stop being. Additive only.
          rowsS = StructuralSanity.evaluate(A.dbQuery, sj.rules, { log: (m) => { logS.push(m); console.log(m); }, witness: true }) || [];
        }
        if (typeof EgressSanity !== 'undefined') {
          // RoomGraph genuinely IS needed by egress rules 2/3 — findings-only skips the film, not
          // the data. Same lazy loader the Egress panel awaits (§EGRESS_ROOMGRAPH_LATE_BIND).
          if (!window.RoomGraph && A.loadNavigate) { try { await A.loadNavigate(); } catch (e) {} }
          rowsE = EgressSanity.evaluate(A.dbQuery, ej.rules, { log: (m) => { logE.push(m); console.log(m); }, witness: true }) || [];
          if (window.RoomGraph) {
            // §ROOM_GRAPH_EXITS is emitted by buildGraph, whose log egress_sanity.js silences.
            const capt = [];
            try { window.RoomGraph.buildGraph(A.dbQuery, { log: (m) => capt.push(m) }); } catch (e) {}
            rgFacts = RuleReport.parseRoomGraphExits(capt);
          }
        }
        const pops = RuleReport.rulePopulations(A.dbQuery);
        // T12.6 — support_classes_present reads the evaluator's OWN lists; without them it
        // reports 'unavailable' rather than fall back to a copy that can go stale.
        const suff = RuleReport.runSufficiencyProbes(A.dbQuery, Object.assign({ log: console.log },
          (typeof StructuralSanity !== 'undefined')
            ? { supportClasses: StructuralSanity.SUPPORT_CLASSES, colSupportClasses: StructuralSanity.COL_SUPPORT_CLASSES }
            : {}));
        out.report = RuleReport.buildRuleReport({
          rowsS: rowsS, rowsE: rowsE,
          ruleDefs: [sj.rules, ej.rules].filter(Boolean),
          meta: {
            building: A.activeBuilding,
            rulesSource: { structural: sj.source, egress: ej.source },
            rulesOverlay: { structural: sj.overlay, egress: ej.overlay },
            rulesProvenance: (sj.provenance || []).concat(ej.provenance || []),
            roomGraph: rgFacts, sufficiency: suff, populations: pops
          }
        });
      } catch (e) { out.err = e.message; }
      return out;
    }, arg('rules-overlay', null) || null);
    if (report.err) {
      log('§RULE_REPORT_FAIL ' + report.err);
      try { await browser.close(); } catch (e) {}
      server.close(); process.exit(1);
    }
    const r = report.report;
    r.db = DB; r.commit = (() => { try { return execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) { return null; } })();
    try { r.dbBytes = fs.statSync(DB.includes('/') ? DB : path.join(ROOT, 'buildings', DB + '.db')).size; } catch (e) { r.dbBytes = null; }
    fs.writeFileSync(jsonOut, JSON.stringify(r, null, 2));
    (r.rulesProvenance || []).forEach(x => log('§RULE_OVERLAY_APPLIED rule=' + x.rule + ' source=' + x.source +
        (x.added ? ' added=true' : ' changed=' + x.changed.map(c => c.field + ' ' + JSON.stringify(c.from) + '->' + JSON.stringify(c.to)).join(' '))));
    log('§RULE_REPORT building=' + r.building + ' findings=' + r.totals.findings + ' rules=' + r.totals.rules +
        ' critical=' + r.totals.severity.CRITICAL + ' warning=' + r.totals.severity.WARNING +
        ' rulesSource=' + JSON.stringify(r.rulesSource) +
        ' roomGraph=' + (r.roomGraph ? JSON.stringify(r.roomGraph) : 'null') +
        ' out=' + jsonOut);
    (r.rules || []).forEach(x => log('§RULE_REPORT_SET rule=' + x.rule + ' count=' + x.count +
        ' critical=' + x.severity.CRITICAL + ' warning=' + x.severity.WARNING + ' unit=' + x.unit));
    (r.dataSufficiency || []).forEach(x => log('§RULE_REPORT_SUFFICIENCY check=' + x.check + ' verdict=' + x.verdict +
        ' rules=' + x.rules.join(',') + ' measured=' + JSON.stringify(x.measured)));
    (r.flagRates || []).forEach(x => log('§RULE_REPORT_RATE rule=' + x.rule + ' flagged=' + x.flagged +
        ' population=' + x.population + ' rate=' + x.rate));
    log('§RULE_REPORT_ONLY exit — no bake requested, no frame drawn');
    try { await browser.close(); } catch (e) {}
    server.close(); process.exit(0);
  }

  // §CLI_BAKE_OPENING (MEP_CLASH_REVEAL_MOVIE.md §33 CORRECTED, user 2026-09-08: "The HHS opening frame has to
  // be some distance away to let the dive in catch the 2D Z plane"). The film opens from the DB's SAVED VIEW
  // (scene_state, restored at load by main.js §SCENE_STATE_RESTORE) — the user's own framing — UNLESS Measure
  // is on and the datum is not wholly legible from there. "Legible" is judged by the datum's OWN layout pass
  // at filmSec 0 (bubbles drawn == bubbles total AND overalls == 3/3), never by a distance threshold: the
  // datum is the owner of "is my drawing in frame", and §17 requires it up at second 0. Then the viewer's
  // Home key is pressed ONCE on document (a double dispatch fired §ROOM_HOME twice and left the plan on the
  // load camera — MEASURED, witness_slab_beat.js) and the datum is judged again. MEASURED before this gate:
  // Hospital's saved view already shows 37/37 bubbles + 3/3 overalls (kept); HHS's saved view (8.7 m up,
  // 49.8 m out) does not and its dive went underground by 3.1 s (§28.2). Must run BEFORE any plan is trusted.
  const measureOn = await page.evaluate((f) => {
    if (f.measure !== undefined) return !!f.measure;
    const a = window.APP;
    try { if (typeof a.cinemaPathPlan === 'function') a.cinemaPathPlan(60); } catch (e) {}
    const st = (a._getCinemaPathEdit && a._getCinemaPathEdit()) || null;
    return !!(st && st.measure);
  }, FLAGS);
  if (has('nohome')) log('§CLI_BAKE_OPENING kept=load-camera (--nohome) — the datum gate was not consulted');
  else if (!measureOn) log('§CLI_BAKE_OPENING kept=load-camera (Measure off — the datum gate does not apply; the film opens from the saved view)');
  else {
    const jg = await page.evaluate(() => {
      const A = window.APP;
      const rd = () => ({ x: +A.camera.position.x.toFixed(1), y: +A.camera.position.y.toFixed(1), z: +A.camera.position.z.toFixed(1) });
      if (!A.flythruDatumBuild || !A.flythruDatumCompositeOntoCanvas) return { err: 'no datum module on APP' };
      try { A.flythruDatumBuild(); } catch (e) { return { err: 'datum build: ' + e.message }; }
      const cv = document.createElement('canvas');
      cv.width = (A.renderer && A.renderer.domElement.width) || 1280; cv.height = (A.renderer && A.renderer.domElement.height) || 720;
      const ctx = cv.getContext('2d');
      const judge = () => {
        A.camera.updateMatrixWorld(true); A.camera.updateProjectionMatrix();
        try { A.flythruDatumCompositeOntoCanvas(ctx, cv.width, cv.height, 0, 100); } catch (e) { return { err: 'datum composite: ' + e.message }; }
        const L = A._flythruDatumLast || {};
        return { cam: rd(), drawn: L.drawn, bubbles: L.bubbles, bubblesTotal: L.bubblesTotal, overalls: L.overalls,
                 full: L.bubblesTotal > 0 && L.bubbles === L.bubblesTotal && L.overalls === 3 };
      };
      const atLoad = judge(); if (atLoad.err) return atLoad;
      if (atLoad.full) return { load: atLoad, pressed: false };
      try { document.body.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); }
      catch (e) { return { load: atLoad, pressed: false, err: 'Home: ' + e.message }; }
      // §36 W3 — the datum was built at the saved view: its ribbon width (§35) and its side decisions (§36 W1)
      // both read the camera at build / first composite. Rebuild at the opening the gate actually chose.
      try { A.flythruDatumDispose(); A.flythruDatumBuild(); } catch (e2) { return { load: atLoad, pressed: true, err: 'rebuild: ' + e2.message }; }
      const atHome = judge();
      return { load: atLoad, pressed: true, home: atHome };
    });
    const f = (j) => j ? ('cam=' + JSON.stringify(j.cam) + ' bubbles=' + j.bubbles + '/' + j.bubblesTotal + ' overalls=' + j.overalls + '/3 drawn=' + j.drawn + (j.full ? ' FULL' : ' PARTIAL')) : 'n/a';
    if (jg.err) log('§CLI_BAKE_OPENING INCONCLUSIVE ' + jg.err + ' — opening left as loaded');
    else if (!jg.pressed) log('§CLI_BAKE_OPENING kept=saved-view ' + f(jg.load) + ' — the whole datum is legible from the saved view (§33)');
    else log('§CLI_BAKE_OPENING moved=Home load[' + f(jg.load) + '] -> home[' + f(jg.home) + '] — the saved view did not show the whole datum (§33)' +
             (jg.home && !jg.home.full ? ' ⚠ Home is not FULL either — the datum will open partially' : ''));
    await new Promise(r => setTimeout(r, 300));
  }
  if (has('opening-only')) {   // dry run: judge the opening, bake nothing (no GPU cost)
    log('§CLI_BAKE_OPENING_ONLY exit — no bake requested');
    try { await browser.close(); } catch (e) {}
    server.close(); process.exit(0);
  }
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
    if (/FAILED|no-hook/.test(tm)) {
      // §CLI_BAKE_FAIL_NO_TIMELINE — buildup was RESOLVED ON (cli flag or the stored path) and the
      // shipped activation verb then produced no timeline. Delivering the film anyway hands back a
      // silent, exit-0 lie: the requested feature is simply absent from the frames. Refuse here,
      // before a single frame is spent. Nothing is repaired — this bake only declines to pretend.
      log(`§CLI_BAKE_FAIL_NO_TIMELINE buildup=on source=${willBuildup.src} prime=${tm} — ` +
          'the Time Machine armed no timeline; refusing to deliver a film with the buildup silently dropped');
      server.close();
      process.exit(1);
    }

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
  if (STILL_BUDGET) { bakeOpts.stillBudget = STILL_BUDGET; log(`§CLI_BAKE_STILL_BUDGET taa=${STILL_BUDGET.taa} ao=${STILL_BUDGET.ao} (default 8/12)`); }
  if (FRAME_RANGE) { bakeOpts.frameRange = FRAME_RANGE; log(`§CLI_BAKE_FRAME_RANGE a=${FRAME_RANGE.a} b=${FRAME_RANGE.b} (frame-exact subset of the FULL film)`); }
  if (BURNIN_SRC) {
    const stem = path.basename(BURNIN_SRC).replace(/\.[a-z0-9]+$/i, '');
    const frameDir = path.join(ROOT, 'out', stem + '_burninframes');
    fs.mkdirSync(frameDir, { recursive: true });
    let existing = fs.readdirSync(frameDir).filter(f => /^frame_\d{5}\.png$/.test(f));
    if (!existing.length) {
      log(`§DATUM_DECOUPLE_EXTRACT src=${BURNIN_SRC} dir=${frameDir} (ffmpeg, one-time)`);
      execFileSync('ffmpeg', ['-y', '-i', BURNIN_SRC, '-start_number', '0', path.join(frameDir, 'frame_%05d.png')]);
      existing = fs.readdirSync(frameDir).filter(f => /^frame_\d{5}\.png$/.test(f));
    } else {
      log(`§DATUM_DECOUPLE_EXTRACT dir=${frameDir} already has ${existing.length} frames — reusing`);
    }
    bakeOpts.burninDatumDir = '/' + path.relative(ROOT, frameDir) + '/';
    log(`§DATUM_DECOUPLE_EXTRACT frames=${existing.length} urlDir=${bakeOpts.burninDatumDir} — ` +
      `must match this bake's own nFrames or per-frame loads will fail loudly (§DATUM_DECOUPLE_ERR)`);
  }
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

  // shipped-claim summary (the big-prize § lines, verbatim).
  // CAPPED per tag (2026-09-19). Some of these fire every frame — the HHS bake of this date printed
  // §MAXQ_FRAME_BUDGET 822 times, 95% of an 869-line log, which buries every once-per-bake line the
  // Log Mandate exists to make readable. Nothing is dropped silently: the first CLAIM_CAP and the
  // LAST line of each tag are kept and the suppressed count is printed, so a per-frame tag still
  // shows its first frames, its final state and how many it fired.
  const CLAIM_CAP = 6;
  for (const k of Object.keys(S.claims)) {
    const lines = S.claims[k];
    const head = lines.slice(0, CLAIM_CAP);
    for (const line of head) log('§CLAIM ' + line.slice(0, 1400));
    if (lines.length > CLAIM_CAP) {
      log(`§CLAIM_SUPPRESSED §${k} fired ${lines.length}x — ${lines.length - CLAIM_CAP - 1} identical-tag lines omitted, last one follows`);
      log('§CLAIM ' + lines[lines.length - 1].slice(0, 1400));
    }
  }
  log(`§CLI_BAKE_WALL totalSec=${((Date.now() - t0) / 1000).toFixed(0)} aborted=${aborted || 'no'} fileOk=${fileOk}`);

  await browser.close();
  server.close();
  logStream.end();
  process.exit(aborted || !fileOk ? 1 : 0);
})().catch(e => { log('§CLI_BAKE_CRASH ' + (e && e.stack || e)); process.exit(2); });
