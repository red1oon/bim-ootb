#!/usr/bin/env node
// §MAXQ_OFFLINE_RUNNER — bake a MaxQ movie headless, on the real GPU, without holding a browser.
//
// SPEC: bim-compiler/prompts/PHOTOREAL_STILL_RENDER.md §MAXQ_OFFLINE_RUNNER (2026-07-26).
// ISSUE THIS FIXES: witness_maxq_mp4.js already proved a headless bake works, but it launches with
//   --use-angle=swiftshader (SOFTWARE rendering). That is fine for a 6-frame Duplex witness and
//   useless for real work: the same 16-frame Duplex bake never finished under SwiftShader (died at
//   puppeteer's 180s protocolTimeout) vs 24.0s on the RTX 4060 — >7.5x slower, lower bound.
//   This runner is that witness upgraded into a usable offline baker:
//     1. real-GPU flags, and it REFUSES TO RUN on a software renderer unless told otherwise
//        (silent SwiftShader fallback is the single trap this whole feature has),
//     2. fire-and-poll instead of awaiting the bake (see §EVALUATE_AWAITS below),
//     3. measured ETA reported before committing — never a per-building-size restriction,
//     4. graceful cancel that KEEPS the frames already cooked,
//     5. ffprobe verification, because a file that downloads but does not play is a FAIL.
//
// §EVALUATE_AWAITS (the bug that cost the SwiftShader measurement — do not reintroduce):
//   page.evaluate(o => APP.startMaxQualityOrbit(o), opts)     <- concise body RETURNS the promise,
//                                                                puppeteer awaits the ENTIRE bake
//                                                                and dies at protocolTimeout.
//   page.evaluate(o => { APP.startMaxQualityOrbit(o); }, opts) <- braces: fire and return.
//   A 360-frame LTU bake runs 19+ minutes and would blow ANY default protocol timeout, so progress
//   MUST come from polling the §MAXQ_* console lines. Raising protocolTimeout is NOT the fix.
//
// USAGE
//   node maxq_offline_runner.js --db buildings/Duplex_extracted.db --frames 360 --fps 15 \
//        --out ./out [--w 1852 --h 960] [--serve-root .] [--url http://localhost:PORT/viewer/viewer.html]
//        [--camera px,py,pz,tx,ty,tz] [--budget-min 30] [--allow-software] [--keep-open]
//   Ctrl-C once = graceful cancel: stops baking and STILL stitches what is already cooked.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

let puppeteer;
try { puppeteer = require('puppeteer'); }
catch (e) { puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); }

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const o = { frames: 360, fps: 15, w: 1852, h: 960, out: './maxq_out', budgetMin: 0,
              allowSoftware: false, forceSoftware: false, keepOpen: false, serveRoot: null, url: null, db: null, camera: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--db') o.db = next();
    else if (a === '--frames') o.frames = parseInt(next(), 10);
    else if (a === '--fps') o.fps = parseInt(next(), 10);
    else if (a === '--w') o.w = parseInt(next(), 10);
    else if (a === '--h') o.h = parseInt(next(), 10);
    else if (a === '--out') o.out = next();
    else if (a === '--serve-root') o.serveRoot = path.resolve(next());
    else if (a === '--url') o.url = next();
    else if (a === '--budget-min') o.budgetMin = parseFloat(next());
    else if (a === '--camera') o.camera = next().split(',').map(Number);
    else if (a === '--allow-software') o.allowSoftware = true;
    // --force-software exists ONLY so §RUNNER_GPU_ASSERT is witnessable: it requests the software
    // renderer while LEAVING the assert armed, so the refusal path can be proven rather than assumed.
    else if (a === '--force-software') o.forceSoftware = true;
    else if (a === '--keep-open') o.keepOpen = true;
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).join('\n')); process.exit(0); }
    else { console.error('unknown arg: ' + a); process.exit(2); }
  }
  if (!o.db) { console.error('ERROR --db is required (e.g. --db buildings/Duplex_extracted.db)'); process.exit(2); }
  if (o.camera && o.camera.length !== 6) { console.error('ERROR --camera needs 6 numbers: px,py,pz,tx,ty,tz'); process.exit(2); }
  return o;
}

// ---------------------------------------------------------------- static server (offline: no CDN, no network)
// Deliberately built in rather than assuming a server is running: "completely offline" is the whole
// point of this runner. MIME types are explicit for the same reason the OCI upload rule exists —
// a wrong/absent Content-Type on .js/.wasm is a silent script failure, not a loud one.
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream',
  '.sql': 'application/sql', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.hdr': 'application/octet-stream',
  '.exr': 'application/octet-stream', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain' };

function startServer(root) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let p;
      try { p = path.join(root, decodeURIComponent(req.url.split('?')[0])); }
      catch (e) { res.writeHead(400); return res.end('bad url'); }
      if (!p.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
      fs.stat(p, (err, st) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        if (st.isDirectory()) { p = path.join(p, 'index.html'); }
        let st2; try { st2 = fs.statSync(p); } catch (e) { res.writeHead(404); return res.end('not found'); }
        const type = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
        // Range support: sql.js / large-asset fetches may issue partial requests; a server that
        // ignores Range and 200s the whole body can break a lazy reader in ways that look like data
        // corruption rather than a transport bug.
        const range = req.headers.range;
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          if (m) {
            const start = m[1] ? parseInt(m[1], 10) : 0;
            const end = m[2] ? parseInt(m[2], 10) : st2.size - 1;
            res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes',
              'Content-Range': `bytes ${start}-${end}/${st2.size}`, 'Content-Length': (end - start + 1) });
            return fs.createReadStream(p, { start, end }).pipe(res);
          }
        }
        res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st2.size });
        fs.createReadStream(p).pipe(res);
      });
    });
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

// ---------------------------------------------------------------- helpers
const sleep = ms => new Promise(r => setTimeout(r, ms));
function fmtDur(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? s + 's' : Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's';
}
function ffprobe(file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-count_frames',
      '-select_streams', 'v:0', '-of', 'default=noprint_wrappers=1', file], { encoding: 'utf8' });
    const g = k => (out.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1];
    return { codec: g('codec_name'), profile: g('profile'), w: g('width'), h: g('height'),
             frames: g('nb_read_frames'), fps: g('r_frame_rate'), dur: g('duration'), fmt: g('format_name') };
  } catch (e) { return { err: (e.message || '').split('\n')[0] }; }
}
function ffdecode(file) {
  try { execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }); return ''; }
  catch (e) { return ((e.stderr || '') + '').trim() || 'decode failed'; }
}

// ---------------------------------------------------------------- main
(async () => {
  const opt = parseArgs(process.argv);
  const OUT = path.resolve(opt.out);
  fs.mkdirSync(OUT, { recursive: true });

  let server = null, baseUrl = opt.url;
  if (!baseUrl) {
    const root = opt.serveRoot || __dirname;
    server = await startServer(root);
    baseUrl = `http://127.0.0.1:${server.port}/viewer/viewer.html`;
    console.log(`§RUNNER_SERVE root=${root} port=${server.port} (built-in, offline)`);
  }
  const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'db=' + encodeURIComponent(opt.db);

  // §RUNNER_GPU: these flags are the entire reason this file exists. Default headless Chrome silently
  // picks SwiftShader; the assertion below is what makes that impossible to ship by accident.
  const GPU_ARGS = ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu', '--no-sandbox'];
  const SW_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'];
  // handleSIGINT:false is LOAD-BEARING, witnessed 2026-07-26 (W3): puppeteer installs its OWN
  // SIGINT/SIGTERM/SIGHUP handlers by default, which kill the browser and process.exit(130) BEFORE
  // our graceful-cancel handler can dispatch. With the defaults left on, Ctrl-C threw away 30 cooked
  // frames and produced no film at all — the exact opposite of the §MAXQ_PARTIAL behaviour we are
  // reusing. We own the signals; we close the browser ourselves.
  const browser = await puppeteer.launch({ headless: 'new',
    handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    args: (opt.allowSoftware || opt.forceSoftware) ? SW_ARGS : GPU_ARGS });

  const page = await browser.newPage();
  await page.setViewport({ width: opt.w, height: opt.h });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });

  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  // Best-effort capture of GPU-process driver messages (the "Framebuffer is surfaceless" class,
  // §MAXQ_SURFACELESS_FRAMEBUFFER). These are emitted by the GPU process, NOT the page, so whether
  // they arrive here is NOT guaranteed — treat a hit as a real signal, a miss as inconclusive.
  try {
    const proc = browser.process();
    if (proc && proc.stderr) proc.stderr.on('data', d => { const s = d.toString(); if (/GL_INVALID_FRAMEBUFFER_OPERATION|surfaceless|context lost/i.test(s)) logs.push('GPUPROC ' + s.trim()); });
  } catch (e) { /* non-fatal */ }

  // §RUNNER_GPU_ASSERT — fail FAST and LOUD on a software renderer.
  await page.goto('about:blank');
  const renderer = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'NO_WEBGL_CONTEXT';
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'UNKNOWN';
  });
  console.log('§RUNNER_GPU renderer=' + renderer);
  const isSoftware = /swiftshader|softwar|llvmpipe|NO_WEBGL_CONTEXT/i.test(renderer);
  if (isSoftware && !opt.allowSoftware) {
    console.error('\n§RUNNER_ABORT software renderer detected — refusing to bake.');
    console.error('  A software (SwiftShader) bake is >7.5x slower and will not finish a real film.');
    console.error('  Fix the GPU, or pass --allow-software to override deliberately.');
    await browser.close(); if (server) server.srv.close();
    process.exit(3);
  }
  if (isSoftware) console.warn('§RUNNER_GPU_WARN baking on SOFTWARE renderer by explicit --allow-software');

  console.log('§RUNNER_LOAD ' + url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.startMaxQualityOrbit && window.APP.camera && window.APP._composer,
    { timeout: 180000 });
  await sleep(8000);   // let the DB/geometry settle; the bake also drains streaming itself (§MAXQ_STREAM_WAIT)
  console.log('§RUNNER_READY ' + (logs.find(l => l.startsWith('§MAXQ_LOADED')) || '§MAXQ_LOADED MISSING'));

  // §RUNNER_POSE — restore the opening scene. The film is a pure function of these 6 floats: the
  // plan (A.cinemaPathPlan) is derived from them and contains no Math.random, and staging variation
  // comes from _freezeRandom()'s HARDCODED seed (987654321 -> first draw 0.0653), so the same pose
  // reproduces the same film on any machine. That is what makes "Alt+C and forget" honest.
  if (opt.camera) {
    const [px, py, pz, tx, ty, tz] = opt.camera;
    await page.evaluate(c => {
      window.APP.camera.position.set(c[0], c[1], c[2]);
      window.APP.controls.target.set(c[3], c[4], c[5]);
      window.APP.controls.update();
      if (window.APP.markDirty) window.APP.markDirty();
    }, opt.camera);
    console.log(`§RUNNER_POSE cam=(${px},${py},${pz}) target=(${tx},${ty},${tz})`);
  } else {
    const pose = await page.evaluate(() => ({ p: window.APP.camera.position.toArray(), t: window.APP.controls.target.toArray() }));
    console.log('§RUNNER_POSE default (no --camera) cam=' + pose.p.map(n => n.toFixed(1)) + ' target=' + pose.t.map(n => n.toFixed(1)));
  }

  // §RUNNER_CANCEL — re-invoking startMaxQualityOrbit() IS the cancel (cinema_maxq.js start():
  // `if (_active) { _cancel = true; ... return; }`), and MaxQ's own §MAXQ_PARTIAL path then stitches
  // every frame already cooked (needs >= fps frames = 1s of footage). NEVER cancel by closing the
  // browser — that discards the cooked frames and the graceful-partial behaviour with them.
  let cancelling = false;
  const onSigint = async (why) => {
    if (cancelling) { console.log('\n§RUNNER_CANCEL_FORCE second Ctrl-C — abandoning frames'); process.exit(130); }
    cancelling = true;
    console.log('\n§RUNNER_CANCEL requested (' + (why || 'user Ctrl-C') + ') — stopping after this frame;'
      + ' frames already cooked are KEPT if there are at least ' + opt.fps + ' of them (1s of footage)');
    try { await page.evaluate(() => { window.APP.startMaxQualityOrbit(); }); } catch (e) { console.warn('  cancel dispatch failed: ' + e.message); }
  };
  process.on('SIGINT', () => onSigint('user Ctrl-C'));

  // §RUNNER_BAKE — fire and poll. Braces are load-bearing (see §EVALUATE_AWAITS in the header).
  console.log(`§RUNNER_BAKE db=${opt.db} frames=${opt.frames} fps=${opt.fps} size=${opt.w}x${opt.h} preview=false`);
  const t0 = Date.now();
  const mark = logs.length;
  await page.evaluate(o => { window.APP.startMaxQualityOrbit(o); },
    { frames: opt.frames, fps: opt.fps, preview: false });

  let seen = mark, done = false, failed = null, timeoutFrames = 0, lastPerFrame = 0, budgetTripped = false;
  const glTrouble = [];
  while (true) {
    for (; seen < logs.length; seen++) {
      const l = logs[seen];
      let m;
      if ((m = /§MAXQ_FRAME i=(\d+)\/(\d+).*?perFrameMs=(\d+).*?etaSec=(-?\d+)/.exec(l))) {
        const [, i, n, per, eta] = m;
        lastPerFrame = Number(per);
        const projected = lastPerFrame * Number(n);
        console.log(`  §RUNNER_PROGRESS ${i}/${n}  perFrame=${per}ms  eta=${eta < 0 ? '…' : fmtDur(eta * 1000)}  projectedTotal=${fmtDur(projected)}`);
        // §RUNNER_BUDGET — REPORT, do not restrict by building size. The largest building tested
        // (LTU_AHouse, 122k) baked 360/360 in 19m24s at 3666ms/frame on this GPU, so "big building"
        // is NOT a proxy for "infeasible". Enforcement happens only against an explicit --budget-min.
        // Note the honest wording: the projection is ~constant, so this trips on the FIRST
        // §MAXQ_FRAME (i=0) — i.e. it is a pre-flight REFUSAL after one measured frame, not a
        // mid-run cancel, and there will be under 1s of footage so MaxQ saves nothing. That is
        // correct behaviour (don't invest 4 hours), but it must not be reported as a cancel that
        // "kept your frames" — it didn't, because there were none worth keeping.
        if (opt.budgetMin > 0 && !budgetTripped && projected > opt.budgetMin * 60000) {
          budgetTripped = true;
          console.warn(`  §RUNNER_BUDGET_ABORT measured ${per}ms/frame → projected ${fmtDur(projected)} exceeds --budget-min ${opt.budgetMin}m`);
          console.warn(`  §RUNNER_BUDGET_ABORT refusing after 1 measured frame; re-run with a larger --budget-min to proceed`);
          await onSigint("--budget-min exceeded");
        }
      }
      else if (/§MAXQ_FRAME_TIMEOUT/.test(l)) { timeoutFrames++; console.warn('  ' + l); }
      else if (/§MAXQ_CANCEL_PARTIAL|§MAXQ_MP4|§MAXQ_IDB_READY|§MAXQ_STREAM_WAIT/.test(l)) console.log('  ' + l);
      else if (/§MAXQ_FAIL/.test(l)) failed = l;
      else if (/§WEBGL_CONTEXT_LOST|GL_INVALID_FRAMEBUFFER_OPERATION|surfaceless|GPUPROC/.test(l)) glTrouble.push(l);
      else if (/§MAXQ_DONE/.test(l)) { console.log('  ' + l); done = true; }
    }
    if (done || failed) break;
    // §RUNNER_TERMINAL — do NOT rely on §MAXQ_DONE as the only terminal signal. Witnessed 2026-07-26:
    // a cancel with under 1s of footage (fps frames) takes cinema_maxq.js's `else if (_cancel)` branch,
    // which only calls _status() — it logs §MAXQ_CANCEL i=N and then NOTHING else, no §MAXQ_DONE ever.
    // Polling §MAXQ_DONE alone hung the runner until the 24h ceiling (caught by the --budget-min
    // witness, W2). A._maxqActive is cleared on EVERY exit path, so it is the reliable terminal state.
    if (Date.now() - t0 > 3000) {
      let stillActive = true;
      try { stillActive = await page.evaluate(() => !!window.APP._maxqActive); } catch (e) { stillActive = false; }
      if (!stillActive) {
        for (; seen < logs.length; seen++) { if (/§MAXQ_DONE/.test(logs[seen])) { console.log('  ' + logs[seen]); done = true; } }
        console.log('  §RUNNER_TERMINAL bake no longer active (_maxqActive=false)' + (done ? '' : ' — ended without §MAXQ_DONE'));
        break;
      }
    }
    if (Date.now() - t0 > 24 * 3600 * 1000) { failed = 'RUNNER hard 24h ceiling hit'; break; }
    await sleep(1000);
  }
  process.removeListener('SIGINT', onSigint);
  const wall = Date.now() - t0;
  await sleep(4000);   // let the download land

  // ---------------------------------------------------------------- report
  console.log('\n================ §RUNNER_REPORT ================');
  console.log('renderer      : ' + renderer);
  console.log('wall clock    : ' + fmtDur(wall) + '  (' + wall + 'ms)');
  console.log('per-frame     : ' + (lastPerFrame ? lastPerFrame + 'ms (rolling-15)' : 'n/a'));
  console.log('cancelled     : ' + (budgetTripped ? 'YES — §RUNNER_BUDGET_ABORT (pre-flight refusal, no film expected)'
    : cancelling ? 'YES — partial film' : 'no'));
  if (timeoutFrames) console.log('QUALITY       : ' + timeoutFrames + ' frame(s) hit the 30s fold ceiling and were captured UNDER-CONVERGED (§MAXQ_FRAME_TIMEOUT)');
  else console.log('QUALITY       : all frames fully converged (no §MAXQ_FRAME_TIMEOUT)');
  if (glTrouble.length) {
    console.log('GL TROUBLE    : ' + glTrouble.length + ' line(s) — this is the §MAXQ_SURFACELESS_FRAMEBUFFER / context-loss class:');
    glTrouble.slice(0, 5).forEach(l => console.log('   ! ' + l.slice(0, 160)));
  } else console.log('GL TROUBLE    : none seen (note: GPU-process capture is best-effort, a miss is inconclusive)');
  if (failed) console.log('FAILED        : ' + failed);

  const vids = fs.readdirSync(OUT).filter(n => /\.(mp4|webm)$/.test(n))
    .map(n => ({ n, p: path.join(OUT, n), m: fs.statSync(path.join(OUT, n)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  let exitCode = 0;
  // exit 4 = deliberate budget refusal (a successful "no", not a failure); 3 = software-renderer
  // refusal; 1 = real failure; 0 = playable film produced.
  if (!vids.length && budgetTripped) { console.log('OUTPUT        : none — budget refusal, as designed'); exitCode = 4; }
  else if (!vids.length) { console.log('OUTPUT        : NONE — no video produced'); exitCode = 1; }
  else {
    const v = vids[0];
    const pr = ffprobe(v.p), dec = ffdecode(v.p);
    console.log('OUTPUT        : ' + v.p + '  (' + (fs.statSync(v.p).size / 1e6).toFixed(2) + ' MB)');
    console.log('ffprobe       : ' + (pr.err ? 'ERR ' + pr.err
      : `${pr.fmt} / ${pr.codec} ${pr.profile} ${pr.w}x${pr.h} fps=${pr.fps} frames=${pr.frames} dur=${pr.dur}`));
    console.log('decode        : ' + (dec === '' ? 'clean (ffmpeg -f null - exit 0)' : 'ERRORS: ' + dec.slice(0, 200)));
    // A file that downloads but does not play is a FAIL — same bar witness_maxq_mp4.js sets.
    if (pr.err || dec !== '') exitCode = 1;
    else if (!cancelling && Number(pr.frames) !== opt.frames) {
      console.log('WARN          : frame count ' + pr.frames + ' != requested ' + opt.frames);
      exitCode = 1;
    }
  }
  console.log('================================================');

  if (!opt.keepOpen) { await browser.close(); if (server) server.srv.close(); }
  else console.log('(--keep-open: browser + server left running; Ctrl-C to exit)');
  process.exit(failed ? 1 : exitCode);
})().catch(e => { console.error('§RUNNER_CRASH ' + (e && e.stack || e)); process.exit(1); });
