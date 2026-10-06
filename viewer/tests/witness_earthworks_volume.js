#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §EARTHWORKS_VOLUME (2026-10-06, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md "NEXT SESSION" item 3)
// Scope: the earthworks volume line on the Alt+C 'planned' card (viewer/cpe_road_panels.js A.earthworksVolume / A.meshSolidVolume).
// No bake. Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES: V (m3) of the EARTHWORK solid is extracted (|sum of signed tetra volumes|) ONLY from a CLOSED
// surface, equals an independent computation (viewer/tests/earthworks_volume_independent.py: numpy float64, own weld, own edge
// test), and an OPEN surface shows NO number (never guessed). Instrument controls: analytic solids (cube, box, tetra) with known V,
// the same cube translated (origin-independence), cube with a face removed (open), cube with a flipped triangle (orientation).
// TOLERANCE |JS - independent| <= 0.01 m3: both sum the same float32 inputs in float64; terms are ~1e9 m3 each over 7e4 triangles,
// so summation-order rounding is ~1e-9 relative (<=1e-4 m3 on 2.2e4); 0.01 m3 = 5e-7 relative is a loose bound that still catches any
// real defect (a single wrong triangle moves V by orders more).
// VERDICT: MEASURED (closed, V compared) | INCONCLUSIVE (EARTHWORK present, surface open — engine and independent AGREE it is open,
// card shows no number) | VACUOUS (no EARTHWORK: buildings). RED control = ROOT at origin/main: no volume function, no line.
// Env: ROOT · BLD · BLD_DIR · GPU=sw|real · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'CivilWorks';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const GPU = process.env.GPU || 'sw', PORT = +(process.env.PORT || 8581), TOL = 0.01;
const LOG = process.env.LOG || '/tmp/witness_earthworks_volume.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

async function probe(browser, bld) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); logStream.write('[con:' + bld + '] ' + t + '\n'); });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${bld}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming && (!window.APP.isCivilModel() || window.APP._civilLabels), { timeout: 1800000, polling: 1000 });
  const r = await page.evaluate(() => {
    const A = window.APP, out = { civil: A.isCivilModel(), hasFn: typeof A.earthworksVolume === 'function', hasCore: typeof A.meshSolidVolume === 'function' };
    out.ewRows = (A.dbQuery("SELECT COUNT(*) FROM elements_meta WHERE discipline='EARTHWORK'")[0] || [0])[0];
    if (typeof A.roadPanelsCardOf === 'function') { const c = A.roadPanelsCardOf('planned'); out.plannedRows = c ? c.rows.map(r => ({ label: r.label, value: String(r.value), vol: !!r.vol })) : null; }
    if (out.hasFn) { const t0 = performance.now(); const v = A.earthworksVolume(); out.ev = { n: v.n, verdict: v.verdict, total: v.total, elements: v.elements }; out.ms = performance.now() - t0; }
    if (out.hasCore) {   // instrument controls: analytic solids, outward-facing triangles (counter-clockwise seen from outside)
      const cube = (sx, sy, sz, ox, oy, oz) => { const V = [], P = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
        P.forEach(p => V.push(p[0] * sx + ox, p[1] * sy + oy, p[2] * sz + oz));
        const F = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7]; return { V: new Float32Array(V), F: new Uint32Array(F) }; };
      const M = (c) => { const r = A.meshSolidVolume(c.V, c.F); return { closed: r.closed, volume: r.volume, tris: r.tris, open: r.openEdges, wrong: r.wrongWayEdges }; };
      const c1 = cube(1, 1, 1, 0, 0, 0); out.ctl = {};
      out.ctl.cube = M(c1); out.ctl.box = M(cube(2, 3, 4, 0, 0, 0)); out.ctl.moved = M(cube(1, 1, 1, 5000, -3000, 700));
      out.ctl.open = M({ V: c1.V, F: c1.F.slice(0, 33) });                                   // last triangle removed
      const fl = c1.F.slice(); const t = fl[0]; fl[0] = fl[1]; fl[1] = t; out.ctl.flipped = M({ V: c1.V, F: fl });   // one triangle wound backwards
      // split vertices (soup welded by position, like the blob): every triangle with its own 3 vertices
      const sv = [], sf = []; for (let i = 0; i < c1.F.length; i++) { sv.push(c1.V[3 * c1.F[i]], c1.V[3 * c1.F[i] + 1], c1.V[3 * c1.F[i] + 2]); sf.push(i); }
      out.ctl.soup = M({ V: new Float32Array(sv), F: new Uint32Array(sf) });
      out.ctl.tetraV = (() => { const V = new Float32Array([0,0,0, 3,0,0, 0,3,0, 0,0,3]); const F = new Uint32Array([0,2,1, 0,1,3, 0,3,2, 1,2,3]); return M({ V, F }); })();
    }
    return out;
  });
  await page.close(); return r;
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ewv-profile-')), protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1300,840'].concat(gpuArgs) });
  const R = { root: ROOT };
  try {
    R.civil = await probe(browser, BLD); log('§EWV_CIVIL ' + JSON.stringify(Object.assign({}, R.civil, { ev: R.civil.ev && Object.assign({}, R.civil.ev, { elements: R.civil.ev.elements.map(e => ({ guid: e.guid, tris: e.tris, closed: e.closed, openEdges: e.openEdges, nonManifoldEdges: e.nonManifoldEdges, signedSum: e.signedSum })) }) })));
    R.bld = await probe(browser, 'Duplex_extracted'); R.bld.dir = 'bim-ootb/buildings'; log('§EWV_BLD ' + JSON.stringify({ civil: R.bld.civil, ewRows: R.bld.ewRows, plannedRows: R.bld.plannedRows, ev: R.bld.ev && { n: R.bld.ev.n, verdict: R.bld.ev.verdict } }));
  } catch (e) { log('§EWV verdict=INCONCLUSIVE reason=' + e.message); R.err = e.message; process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (R.err) { logStream.end(); return; }
  try { R.indep = JSON.parse(cp.execFileSync('python3', ['-I', path.join(__dirname, 'earthworks_volume_independent.py'), path.join(BLD_DIR, BLD + '.db')], { maxBuffer: 1 << 26 }).toString()); }
  catch (e) { log('§EWV verdict=INCONCLUSIVE reason=independent computation failed: ' + e.message); logStream.end(); process.exitCode = 2; return; }
  log('§EWV_INDEP ' + JSON.stringify(R.indep));
  const ev = R.civil.ev, el = ev && ev.elements, ind = R.indep;
  if (!R.civil.ewRows) { log('§EWV verdict=INCONCLUSIVE reason=no EARTHWORK element in ' + BLD); logStream.end(); process.exitCode = 2; return; }
  if (el) el.forEach((e, i) => { const x = ind.find(y => y.guid === e.guid) || {};
    log('§EWV element=' + e.guid + ' tris=' + e.tris + '/' + x.tris + ' closed=' + e.closed + '/' + x.closed + ' openEdges=' + e.openEdges + '/' + x.openEdges + ' nonManifold=' + e.nonManifoldEdges + '/' + x.nonManifoldEdges +
      ' signedSum JS=' + (e.signedSum != null ? e.signedSum.toFixed(4) : 'NA') + ' indep=' + (x.signedSum != null ? x.signedSum.toFixed(4) : 'NA') + ' delta=' + (e.signedSum != null && x.signedSum != null ? Math.abs(e.signedSum - x.signedSum).toExponential(2) : 'NA') + ' (js/indep)'); });
  const verdict = !ev ? 'RED(no engine on this tree)' : ev.verdict;
  const indClosed = ind.every(x => x.closed), indTotal = indClosed ? ind.reduce((s, x) => s + x.volume, 0) : null;
  log('§EWV verdict=' + verdict + (ev && ev.total != null ? ' V_m3=' + ev.total.toFixed(3) + ' independent_V_m3=' + (indTotal != null ? indTotal.toFixed(3) : 'NA') + ' delta=' + (indTotal != null ? Math.abs(ev.total - indTotal).toExponential(2) : 'NA') + ' tol=' + TOL : ' (NO NUMBER SHOWN: surface not closed)') + ' tol=' + TOL + ' rootTree=' + ROOT);
  const near = (a, b, t) => Math.abs(a - b) <= t;
  Witness('earthworks_volume')
    .population(() => [R])
    .schema({ type: 'object', required: ['civil', 'bld', 'indep'] })
    .invariant('instrument present: A.earthworksVolume + A.meshSolidVolume exist (RED on origin/main)', rs => rs.every(r => r.civil.hasFn && r.civil.hasCore))
    .invariant('not vacuous: EARTHWORK element(s) found with a mesh, independent computation saw the same elements', rs => rs.every(r => r.civil.ev && r.civil.ev.n >= 1 && r.indep.length === r.civil.ev.n))
    .invariant('controls: unit cube V=1, box 2x3x4 V=24, tetra 3-3-3 V=4.5, cube translated by (5000,-3000,700) still V=1, vertex-soup cube V=1 — all closed', rs => rs.every(r => { const c = r.civil.ctl; return c && c.cube.closed && near(c.cube.volume, 1, 1e-9) && c.box.closed && near(c.box.volume, 24, 1e-9) && c.tetraV.closed && near(c.tetraV.volume, 4.5, 1e-9) && c.moved.closed && near(c.moved.volume, 1, 1e-3) && c.soup.closed && near(c.soup.volume, 1, 1e-9); }))
    .invariant('controls: cube with a face removed = OPEN and NO volume; cube with one flipped triangle = NOT closed and NO volume', rs => rs.every(r => { const c = r.civil.ctl; return c && !c.open.closed && c.open.volume === null && c.open.open > 0 && !c.flipped.closed && c.flipped.volume === null; }))
    .invariant('closedness verdict, triangle count, edge counts: JS = independent, per element', rs => rs.every(r => r.civil.ev.elements.every(e => { const x = r.indep.find(y => y.guid === e.guid); return x && e.closed === x.closed && e.tris === x.tris && e.openEdges === x.openEdges && e.nonManifoldEdges === x.nonManifoldEdges && e.wrongWayEdges === x.wrongWayEdges; })))
    .invariant('raw signed tetra sum JS = independent within ' + TOL + ' m3 (engine arithmetic check, shown or not)', rs => rs.every(r => r.civil.ev.elements.every(e => { const x = r.indep.find(y => y.guid === e.guid); return x && near(e.signedSum, x.signedSum, TOL); })))
    .invariant('open surface => verdict INCONCLUSIVE, total null, and the card shows NO digits-with-m3 volume; closed => V = independent V within tol and the card shows its rounding', rs => rs.every(r => {
      const ev = r.civil.ev, row = (r.civil.plannedRows || []).find(x => x.vol);
      if (!row) return false;
      if (ev.verdict === 'INCONCLUSIVE') return ev.total === null && !/m³/.test(row.value) && /not measurable/.test(row.value);
      const iv = r.indep.reduce((s, x) => s + x.volume, 0);
      return ev.verdict === 'MEASURED' && near(ev.total, iv, TOL) && row.value === Math.round(ev.total).toLocaleString('en-US') + ' m³';
    }))
    .invariant('NON-IMPACT building (Duplex): not civil, 0 EARTHWORK rows, verdict VACUOUS, no volume line on the planned card', rs => rs.every(r => !r.bld.civil && r.bld.ewRows === 0 && r.bld.ev && r.bld.ev.verdict === 'VACUOUS' && !(r.bld.plannedRows || []).some(x => x.vol)))
    .redControl(rs => rs.map(r => { const c = JSON.parse(JSON.stringify(r)); c.indep[0].openEdges += 1; c.indep[0].signedSum += 5; return c; }))
    .run();
  logStream.end();
})();
