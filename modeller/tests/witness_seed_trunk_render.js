#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SEED-TRUNK-RENDER scope (read this block first)
 * SCOPE: prompts/RESUME_SEED_TRUNK.md §TASK 1 — the STANDING render gate for the seed→3D corridor trunk. Closes the
 *   "eyeball gap": the seed-trunk ENGINE is witnessed in bim-compiler (W-SEED-TRUNK / -CORRIDOR / -RISER / -ENGINE),
 *   but the modeller RENDER of the trunk (disc-coloured LineSegments: per-storey corridor polylines + vertical risers)
 *   shipped (#580) proven only by eyeball. This headless readback machine-verifies that _renderSeedTrunk paints the
 *   trunk and that the rendered geometry == SeedTrunk.planTrunk's net (counts + a sampled coord), so every future
 *   render change is GATED, not eyeballed.
 *
 *   ⚠ Drives the render via the IDB-FREE engine API (dwOpen/dwBorrow with PLAIN-FETCHED rules DBs) + the
 *   window.__seedTrunkProbe seam — NOT the production discWalk()/seedTrunk() path, which caches rules in the
 *   bim_ootb_cache IndexedDB layer (unreliable under puppeteer+swiftshader; fine in real browsers). The RENDER
 *   function exercised here (_renderSeedTrunk) is byte-for-byte the one window.seedTrunk() invokes.
 *
 *   WIRING/deploy check (TestArchitecture §Browser Testing) — the trunk's geometry VALUES are proven by the
 *   bim-compiler node witnesses (W-SEEDTRUNK-ENGINE 6/6 etc.). Read the §-log; exit ≠ evidence.
 *
 * THE WORKING SWIFTSHADER FLAGS (the eyeball-blocker was a wrong flag, not a wall — see the card): the precedent is
 *   witness_dw_pixelprobe.js. `--use-gl=angle --use-angle=swiftshader` works; `--use-gl=swiftshader` FAILS
 *   ("Error creating WebGL context"). Do NOT repeat the wrong flag.
 *
 * CLAIMS (ELEC trunk on Duplex — residential, walked via duplex_rules.db):
 *   P1 RENDERED       — dwRoot carries exactly 1 LineSegments tagged userData.dwTrunk==='ELEC' (the trunk drew).
 *   P2 VERTS==DATA    — rendered geometry.position.count == 2 × (Σ corridor polyline segs + risers) computed from net
 *                       (the gate asserts render==planTrunk data, NOT a magic number).
 *   P3 RISERS==DATA   — vertical rendered segments (Δz≠0) == net's climbing risers; corridor segs == Σ(poly.length-1).
 *   P4 NO-DRIFT       — every sampled net polyline/riser point maps to a rendered vertex within 1e-3m (order-independent
 *                       whitebox, like §DW-TUBE endpointDrift): the render carries planTrunk's coords verbatim.
 *   P5 PAINTED        — litPixels > 0 after render (canvas non-blank; the trunk reached the framebuffer).
 *   P6 NO-ERROR       — no pageerror / no walk error.
 *   P7 ANIM-ENDS-FULL — the construction animation (Task 2) ends EXACTLY on the full proven geometry: driving the
 *                       ANIMATED render path emits §SEED-TRUNK-ANIM with finalSegs == net segs over >1 frame.
 *   P8 REDUCED-MOTION — with prefers-reduced-motion:reduce emulated, the render falls back to instant (full geometry,
 *                       frames=0) — accessibility-safe, still ends on the proven geometry.
 *   REGRESSION        — W-DW-PIXELPROBE must still be green (run separately; this gate does not perturb it).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ROOT = path.join(__dirname, '..', '..');   // repo root → ../modeller/<db> + rules DBs resolve
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };

const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' });
    r.end(b);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1100, height: 800 });
  const logs = [];
  pg.on('console', m => { const t = m.text(); if (/^§(SEED-TRUNK|DISC-WALK|DW-)/.test(t)) logs.push(t); });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));

  // Standing gate = Duplex ELEC; argv overrides for the held-out generalization check (e.g. SampleCastle ELEC, 7-storey).
  const BUILDING = process.argv[2] || 'Duplex';
  const DISC = process.argv[3] || 'ELEC';
  console.log('═══ W-SEED-TRUNK-RENDER — seed→3D trunk render paints + render==planTrunk net (headless, ' + BUILDING + ' ' + DISC + ') ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.SQL && !!window.DiscWalker && !!window.SeedTrunk && !!window.__seedTrunkProbe',
    { timeout: 30000 }).catch(() => {});

  // open the building (sets window.__dwBuf + establishes the scene/dwRoot host)
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="' + BUILDING + '"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => {});
  await sleep(500);

  // Drive the ELEC walk + seed + trunk plan via the IDB-FREE engine API, then render via __seedTrunkProbe (the seam
  // that calls the SAME _renderSeedTrunk window.seedTrunk() calls). Return the net summary + the scene-graph census.
  logs.length = 0;
  const res = await pg.evaluate(async (BUILDING, DISC) => {
    try {
      const SQL = window.SQL, DW = window.DiscWalker, ST = window.SeedTrunk;
      const dxBuf = await (await fetch('./duplex_rules.db')).arrayBuffer();
      DW.dwOpen(new SQL.Database(new Uint8Array(dxBuf)));               // residential rules (duplex_rules.db)
      const bdb = new SQL.Database(new Uint8Array(window.__dwBuf));
      const w = DW.dwWalk(DISC, bdb, BUILDING);
      const fixtures = w.placements;
      const seed = DW.defaultSeed(bdb, { vertical: true });             // door/stair entry (deterministic default)
      // storey levels (the modeller's caller path): each named storey at its median fixture z
      const byS = {}; fixtures.forEach(p => { if (p.storey && !/^unknown$/i.test(p.storey)) (byS[p.storey] = byS[p.storey] || []).push(p.z); });
      const storeys = Object.keys(byS).map(nm => { const zs = byS[nm].slice().sort((a, b) => a - b); return { name: nm, z: zs[zs.length >> 1] }; })
        .sort((a, b) => a.z - b.z);
      // risers = real IfcStair columns, deduped by XY
      const rr = bdb.exec("SELECT m.guid g, t.center_x x, t.center_y y FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class LIKE '%Stair%'");
      const risers = []; if (rr.length) rr[0].values.forEach(v => { const s = { guid: v[0], x: v[1], y: v[2] };
        if (!risers.some(o => Math.hypot(o.x - s.x, o.y - s.y) < 0.5)) risers.push(s); });
      const net = ST.planTrunk(bdb, fixtures, { x: seed.x, y: seed.y, storey: seed.storey }, risers,
        { storeys: storeys, groundStorey: seed.storey });
      const diag = { walk: fixtures.length, placed: w.placed, seedRefused: !!seed.refused, seedReason: seed.reason || '',
        seedStorey: seed.storey, storeys: storeys.map(s => s.name + '@' + (s.z != null ? s.z.toFixed(2) : '?')), risers: risers.length };
      bdb.close();
      if (net.refused === true) return { err: 'planTrunk refused: ' + (net.reason || '(none)'), diag };   // boolean refusal (net.refused is else a fixture COUNT)
      // EXPECTED counts derived from the SAME net the render consumes (render==data, not a magic number)
      let expCorridor = 0;
      net.storeys.forEach(s => (s.edges || []).forEach(poly => { expCorridor += Math.max(0, poly.length - 1); }));
      const expRiserClimb = net.risers.filter(r => Math.abs(r.z1 - r.z0) > 1e-6).length;
      const expSegs = expCorridor + net.risers.length;
      window.__stNet = net; window.__stDisc = DISC;                    // keep for the animated/reduced-motion runs (P7/P8)
      const probe = window.__seedTrunkProbe(DISC, net);                // ← RENDERS (instant) via _renderSeedTrunk + censuses dwRoot
      return { fixtures: fixtures.length, served: net.served, refused: net.refused, risers: net.risers.length,
        expCorridor, expRiserClimb, expSegs, probe };
    } catch (e) { return { err: String(e && e.message) + ' | ' + ((e.stack || '').split('\n')[1] || '') }; }
  }, BUILDING, DISC);
  await sleep(300);

  if (res.err) { console.log('  §ERR ' + res.err); if (res.diag) console.log('  §DIAG ' + JSON.stringify(res.diag)); await br.close(); server.close(); console.log('W-SEED-TRUNK-RENDER: 0 PASS / 1 FAIL'); process.exit(1); }
  const p = res.probe;
  console.log('  §NET fixtures=' + res.fixtures + ' served=' + res.served + ' refused=' + res.refused + ' risers=' + res.risers +
    ' expSegs=' + res.expSegs + ' (corridor=' + res.expCorridor + ' riserClimb=' + res.expRiserClimb + ')');
  console.log('  §PROBE ' + JSON.stringify(p));
  console.log('  ' + (logs.find(l => /§SEED-TRUNK-PROBE/.test(l)) || '(no §SEED-TRUNK-PROBE)'));

  // P7 — drive the ANIMATED render path (no instant), let rAF run to completion, read the §SEED-TRUNK-ANIM log.
  logs.length = 0;
  await pg.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await pg.evaluate(() => window.__seedTrunkRender(window.__stDisc, window.__stNet));   // animated (opts default)
  await pg.waitForFunction(() => !!window.console, { timeout: 100 }).catch(() => {});
  await sleep(2800);                                                  // DUR=2000ms + margin for rAF to settle
  const animLog = logs.find(l => /§SEED-TRUNK-ANIM \S+ mode=animated/.test(l)) || '';
  const animSegs = (animLog.match(/finalSegs=(\d+)/) || [])[1];
  const animFrames = +((animLog.match(/frames=(\d+)/) || [])[1] || 0);
  console.log('  ' + (animLog || '(no animated §SEED-TRUNK-ANIM)'));

  // P8 — reduced-motion instant fallback.
  logs.length = 0;
  await pg.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await pg.evaluate(() => window.__seedTrunkRender(window.__stDisc, window.__stNet));
  await sleep(300);
  const rmLog = logs.find(l => /§SEED-TRUNK-ANIM \S+ mode=reduced-motion/.test(l)) || '';
  const rmSegs = (rmLog.match(/finalSegs=(\d+)/) || [])[1];
  console.log('  ' + (rmLog || '(no reduced-motion §SEED-TRUNK-ANIM)'));

  await br.close(); server.close();

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  chk('P1 RENDERED (1 dwTrunk LineSegments)', p.lineSegments === 1, 'lineSegments=' + p.lineSegments);
  chk('P2 VERTS == 2×data segs', p.vertices === 2 * res.expSegs && p.segments === res.expSegs, 'vertices=' + p.vertices + ' expVertices=' + (2 * res.expSegs) + ' segments=' + p.segments);
  chk('P3 RISERS+CORRIDOR == data', p.verticalSegs === res.expRiserClimb && p.corridorSegs === (res.expSegs - res.expRiserClimb), 'verticalSegs=' + p.verticalSegs + ' expRiserClimb=' + res.expRiserClimb + ' corridorSegs=' + p.corridorSegs);
  chk('P4 NO-DRIFT (all sampled net pts on rendered verts)', p.samples > 0 && p.maxDrift < 1e-3, 'maxDrift=' + (p.maxDrift != null ? p.maxDrift.toExponential(2) : '?') + 'm samples=' + p.samples);
  chk('P5 PAINTED (canvas non-blank)', p.litPct > 0, 'litPixels=' + p.litPct + '%');
  chk('P6 no pageerror', errs.length === 0 && !p.err, (p.err || '') + ' ' + errs.slice(0, 2).join(' | '));
  chk('P7 ANIM ends on full proven geometry', animSegs === String(res.expSegs) && animFrames > 1, 'finalSegs=' + animSegs + ' expSegs=' + res.expSegs + ' frames=' + animFrames);
  chk('P8 REDUCED-MOTION instant fallback', rmSegs === String(res.expSegs), 'finalSegs=' + rmSegs + ' expSegs=' + res.expSegs);

  console.log('W-SEED-TRUNK-RENDER: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
