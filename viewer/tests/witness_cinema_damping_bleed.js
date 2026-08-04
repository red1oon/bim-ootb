// WITNESS — §CINEMA_DAMPING_BLEED (prompts/PHOTOREAL_STILL_RENDER.md, user report 2026-07-26).
//
// ISSUE PROVEN/DISPROVEN: "there is a slight twitch at the first second of the movie, where the
//   screen size is adjusted slightly narrower. Tested on two buildings it is so."
//
// A recording is a FULLY AUTHORED camera — cinemaPathPlan owns every pose. But every authored loop
// does camera.position.set(pose) → controls.update(), and OrbitControls.update() recomputes the
// position from its OWN spherical state with the dampened deltas applied, OVERWRITING the pose just
// authored. This measures that overwrite directly: wrap controls.update(), record the camera
// position immediately before and immediately after each call, and report the distance between them.
// Any non-zero value is damping editing a pose it does not own.
//
// ⚠ THE PRECONDITION IS THE WHOLE TEST. The residual only exists if the user NAVIGATED just before
// starting — which a real user always has. Pressing Alt+C from a clean, untouched camera shows
// nothing at all (three earlier probes did exactly that and found a flat zero). So this witness
// dispatches a real wheel + drag on the canvas immediately before starting the recording. Remove
// that and the witness proves nothing.
//
//   G1 fixed tip: controls.update() moves the camera by 0 m on EVERY frame OF THE FILM (counting
//      starts at the '§CINEMA_ORBIT start' marker — before it the camera is still interactive and
//      damping SHOULD be live; the one-off flush is deliberately on the other side of that line).
//   G2 control — unfixed tip: frame-0 drift > 1% of the look distance, i.e. the first second of the
//      film really was rendered from a pose the plan did not author. A gate that only ever passes
//      proves nothing.
//   G3 the unfixed tip's drift decays at exactly (1 - dampingFactor) per frame. This NAMES the
//      mechanism — it is the damping residual and not some other drift.
//
// Run: node witness_cinema_damping_bleed.js [--baseline /path/to/unfixed/worktree]

const http = require('http'), fs = require('fs'), path = require('path');
let puppeteer;
try { puppeteer = require('puppeteer'); }
catch (e) { puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); }

const DB = 'buildings/Duplex_extracted.db';
const DAMPING_FACTOR = 0.08;   // scene.js — the constant this whole defect is made of
const MIME = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json',
  '.wasm':'application/wasm','.db':'application/octet-stream','.sql':'application/sql','.jpg':'image/jpeg',
  '.png':'image/png','.hdr':'application/octet-stream','.svg':'image/svg+xml','.ico':'image/x-icon' };

function serve(root) {
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      let p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
      fs.stat(p, (e, st) => {
        if (e) { r.writeHead(404); return r.end(); }
        if (st.isDirectory()) p = path.join(p, 'index.html');
        r.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes' });
        fs.createReadStream(p).pipe(r);
      });
    });
    s.listen(0, '127.0.0.1', () => res({ s, port: s.address().port }));
  });
}

async function sample(root, label, secs) {
  const { s, port } = await serve(root);
  const b = await puppeteer.launch({ headless: 'new', handleSIGINT: false, defaultViewport: null,
    args: ['--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist','--enable-gpu','--no-sandbox','--window-size=1280,800'] });
  const pg = (await b.pages())[0];
  const logs = []; pg.on('console', m => logs.push(m.text()));
  const remote = []; pg.on('response', r => { if (/oraclecloud|objectstorage/.test(r.url())) remote.push(r.url()); });
  await pg.goto(`http://127.0.0.1:${port}/viewer/viewer.html?db=${encodeURIComponent(DB)}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await pg.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls, { timeout: 180000 });
  await new Promise(r => setTimeout(r, 9000));

  // THE PRECONDITION: navigate, exactly as a user does before reaching for Alt+C.
  await pg.evaluate(() => {
    const c = window.APP.renderer.domElement, R = c.getBoundingClientRect();
    const cx = R.left + R.width / 2, cy = R.top + R.height / 2;
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, clientX: cx, clientY: cy, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: cx, clientY: cy, bubbles: true }));
    for (let i = 1; i <= 8; i++)
      c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: cx + i * 7, clientY: cy + i * 3, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, button: 0, bubbles: true }));
  });

  await pg.evaluate(() => {
    const A = window.APP;
    window.__d = []; window.__n = 0; window.__cine = false;
    // Count ONLY the film. '§CINEMA_ORBIT start' is the run's marker and both tips emit it; on the
    // fixed tip the one-off damping flush happens just BEFORE it, so it is correctly excluded —
    // that flush lands before the first authored pose and is overwritten by it.
    const _log = console.log.bind(console);
    console.log = function () {
      if (arguments[0] && String(arguments[0]).indexOf('§CINEMA_ORBIT start') === 0) window.__cine = true;
      return _log.apply(null, arguments);
    };
    const orig = A.controls.update.bind(A.controls);
    A.controls.update = function () {
      const p = A.camera.position, before = { x: p.x, y: p.y, z: p.z };
      const r = orig();
      if (window.__cine) {
        const drift = Math.hypot(p.x - before.x, p.y - before.y, p.z - before.z);
        const dist = Math.hypot(p.x - A.controls.target.x, p.y - A.controls.target.y, p.z - A.controls.target.z);
        window.__d.push({ n: window.__n++, drift: drift, pct: 100 * drift / (dist || 1) });
      }
      return r;
    };
    A.startCinemaOrbit();
  });
  await new Promise(r => setTimeout(r, secs * 1000));
  let d = []; try { d = await pg.evaluate(() => window.__d); } catch (e) {}
  await b.close(); s.close();
  return { label, root, d, ociHits: remote.length,
           held: logs.some(l => l.indexOf('§CINEMA_DAMPING_BLEED held') === 0) };
}

(async () => {
  const bi = process.argv.indexOf('--baseline');
  const baseline = bi > 0 ? process.argv[bi + 1] : '/tmp/wt-damp-base';
  const runs = [await sample(baseline, 'BEFORE (unfixed)', 30), await sample(path.join(__dirname, '..', '..'), 'AFTER  (fixed)', 30)];

  console.log('\n================= §CINEMA_DAMPING_BLEED WITNESS =================');
  for (const r of runs) {
    const nz = r.d.filter(x => x.drift > 1e-9);
    console.log('\n--- ' + r.label + '  (' + r.root + ')');
    console.log('  update() calls during the film   : ' + r.d.length);
    console.log('  calls that MOVED the camera      : ' + nz.length);
    console.log('  §CINEMA_DAMPING_BLEED held       : ' + r.held);
    console.log('  off-localhost object-storage     : ' + r.ociHits);
    if (r.d.length) {
      console.log('  drift, first 8 frames (% of look distance):');
      console.log('    ' + r.d.slice(0, 8).map(x => x.pct.toFixed(3) + '%').join('  '));
      console.log('  max drift anywhere in the film   : ' + Math.max(...r.d.map(x => x.drift)).toFixed(6) + ' m');
    }
  }
  const before = runs[0], after = runs[1];
  // Decay ratio across the pure-decay stretch (skip frames 0-1: the rotate residual and the zoom
  // scale residual are still both unwinding there).
  let ratios = [];
  for (let i = 3; i < Math.min(14, before.d.length); i++)
    if (before.d[i - 1].pct > 1e-6) ratios.push(before.d[i].pct / before.d[i - 1].pct);
  const meanRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : NaN;

  console.log('\n--- GATES');
  const g = [];
  const afterMax = after.d.length ? Math.max(...after.d.map(x => x.drift)) : Infinity;
  g.push(['G1 fixed: controls.update() never moves the authored pose (max drift = 0)',
          after.d.length > 0 && afterMax < 1e-9 && after.held, afterMax.toFixed(9) + ' m over ' + after.d.length + ' calls']);
  g.push(['G2 control: unfixed tip drifts > 1% of look distance on frame 0',
          before.d.length > 0 && before.d[0].pct > 1.0, (before.d.length ? before.d[0].pct.toFixed(3) : '0') + '%']);
  g.push(['G3 control: that drift decays at exactly 1 - dampingFactor (' + (1 - DAMPING_FACTOR).toFixed(2) + '), naming the mechanism',
          Math.abs(meanRatio - (1 - DAMPING_FACTOR)) < 0.01, 'measured ' + (isNaN(meanRatio) ? 'n/a' : meanRatio.toFixed(4))]);
  let pass = 0;
  for (const [n, ok, v] of g) { console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + n + '  [' + v + ']'); if (ok) pass++; }
  console.log('\n  ' + pass + '/' + g.length + ' gates green');
  console.log('=================================================================');
  process.exit(pass === g.length ? 0 : 1);
})().catch(e => { console.error('WITNESS CRASH ' + (e && e.stack || e)); process.exit(1); });
