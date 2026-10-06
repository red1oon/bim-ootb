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
// §EARTHWORKS_VOLUME option (a) (user 2026-10-06 "Go with a. It is proof of compiler truth."): an OPEN surface with no wrong-way edge
// shows "≈ V m3 (E open edges, ±B m3)"; V = signed sum at the mesh's bbox centre; B = max |V(o)-V| over 14 fixed origin shifts (8 bbox
// corners from the centre, ±5000 m per axis), measured each time; B >= V or a wrong-way edge -> INCONCLUSIVE, no number.
// numpy computes V and B by RE-TRANSLATING every vertex (JS uses the closed form V0 - o.S/6). TOLERANCE: |V_js - V_np| <= 0.01 m3 and
// |B_js - B_np| <= 0.05 m3 — shifts of 5 km put ~1e11 m3-size terms through float64 (rel. 1e-16 x 1e11 x sqrt(7e4 tris) ~ 3e-3 m3), so B
// carries more rounding than V; 0.05 m3 is still 2 % of B and 1e-6 of V.
// VERDICT: EXACT (closed) | APPROXIMATE (open, bounded) | INCONCLUSIVE (wrong-way edge or B >= V) | VACUOUS (no EARTHWORK: buildings).
// RED control = ROOT at origin/main: no volume function, no line.
// Env: ROOT · BLD · BLD_DIR · GPU=sw|real · PORT · LOG · NODE_ONLY=1 (no browser: the code runs in a node vm on blobs dumped by the numpy script)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'CivilWorks';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const NODE_ONLY = !!process.env.NODE_ONLY, DUMP = process.env.DUMP || '/tmp/ewv_dump';
const GPU = process.env.GPU || 'sw', PORT = +(process.env.PORT || 8581), TOL_V = 0.01, TOL_B = 0.05;
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


// Everything judged lives in ONE self-contained function so the browser (page.evaluate) and node (vm stub) run the identical probe.
function probeBody(A) {
  const out = { civil: A.isCivilModel(), hasFn: typeof A.earthworksVolume === 'function', hasCore: typeof A.meshSolidVolume === 'function' };
  out.ewRows = (A.dbQuery("SELECT COUNT(*) FROM elements_meta WHERE discipline='EARTHWORK'")[0] || [0])[0];
  if (typeof A.roadPanelsCardOf === 'function') { const c = A.roadPanelsCardOf('planned'); out.plannedRows = c ? c.rows.map(r => ({ label: r.label, value: String(r.value), vol: !!r.vol })) : null; }
  if (out.hasFn) { const v = A.earthworksVolume(); out.ev = { n: v.n, verdict: v.verdict, total: v.total, V: v.V, B: v.B, E: v.E, elements: v.elements }; }
  if (out.hasCore) {   // instrument controls: analytic solids, outward-facing triangles (counter-clockwise seen from outside)
    const cube = (sx, sy, sz, ox, oy, oz) => { const V = [], P = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
      P.forEach(p => V.push(p[0] * sx + ox, p[1] * sy + oy, p[2] * sz + oz));
      const F = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7]; return { V: new Float32Array(V), F: new Uint32Array(F) }; };
    const M = (c) => { const r = A.meshSolidVolume(c.V, c.F); return { closed: r.closed, volume: r.volume, V: r.V, B: r.B, E: r.E, verdict: r.verdict, tris: r.tris, open: r.openEdges, wrong: r.wrongWayEdges }; };
    const c1 = cube(1, 1, 1, 0, 0, 0); out.ctl = {};
    out.ctl.cube = M(c1); out.ctl.box = M(cube(2, 3, 4, 0, 0, 0)); out.ctl.moved = M(cube(1, 1, 1, 5000, -3000, 700));
    out.ctl.open = M({ V: c1.V, F: c1.F.slice(0, 33) });                                   // last triangle removed (one open face-half)
    out.ctl.openBig = M({ V: cube(100, 100, 100, 0, 0, 0).V, F: c1.F.slice(0, 33) });      // same, 100 m cube
    const fl = c1.F.slice(); const t = fl[0]; fl[0] = fl[1]; fl[1] = t; out.ctl.flipped = M({ V: c1.V, F: fl });   // one triangle wound backwards
    const sv = [], sf = []; for (let i = 0; i < c1.F.length; i++) { sv.push(c1.V[3 * c1.F[i]], c1.V[3 * c1.F[i] + 1], c1.V[3 * c1.F[i] + 2]); sf.push(i); }
    out.ctl.soup = M({ V: new Float32Array(sv), F: new Uint32Array(sf) });
    out.ctl.tetraV = (() => { const V = new Float32Array([0,0,0, 3,0,0, 0,3,0, 0,0,3]); const F = new Uint32Array([0,2,1, 0,1,3, 0,3,2, 1,2,3]); return M({ V, F }); })();
  }
  return out;
}
async function probe(browser, bld) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); logStream.write('[con:' + bld + '] ' + t + '\n'); });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${bld}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming && (!window.APP.isCivilModel() || window.APP._civilLabels), { timeout: 1800000, polling: 1000 });
  const r = await page.evaluate('(' + probeBody.toString() + ')(window.APP)');
  await page.close(); return r;
}
// NODE_ONLY: load the shipped cpe_road_panels.js into a vm with a stub APP whose DB answers the few queries it makes, from the blobs
// the numpy script dumped (a read-only copy of the model). Same code, same probe, no browser.
function nodeProbe(ewGuid, civil) {
  const vm = require('vm'), lines = [];
  const blobs = ewGuid ? { v: fs.readFileSync(path.join(DUMP, ewGuid + '.v.bin')), f: fs.readFileSync(path.join(DUMP, ewGuid + '.f.bin')) } : null;
  const A = { db: {}, isCivilModel: () => civil, cpeRevealDiscLabel: d => d,
    dbQuery(sql) {
      if (/COUNT\(\*\) FROM elements_meta WHERE discipline='EARTHWORK'/.test(sql) || /COUNT\(\*\) FROM elements_meta WHERE discipline = 'EARTHWORK'/.test(sql)) return [[ewGuid ? 1 : 0]];
      if (/FROM elements_meta m JOIN element_instances i/.test(sql)) return ewGuid ? [[ewGuid, 'h']] : [];
      if (/FROM component_geometries/.test(sql)) return blobs ? [[blobs.v, blobs.f]] : [];
      return [];
    } };
  const ctx = { window: {}, console: { log: l => lines.push(l) }, Float32Array, Uint32Array, Int32Array, Map, Math };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'viewer', 'cpe_road_panels.js'), 'utf8') + '\nsetupCpeRoadPanels(__A);', Object.assign(ctx, { __A: A }));
  const r = probeBody(A); r.logLines = lines; return r;
}
(async () => {
  const R = { root: ROOT };
  let browser;
  if (!NODE_ONLY) {
    const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
    await new Promise(r => server.listen(PORT, '127.0.0.1', r));
    const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
    browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ewv-profile-')), protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1300,840'].concat(gpuArgs) });
  }
  const dbPath = process.env.DB_COPY || path.join(BLD_DIR, BLD + '.db');
  try {
    if (NODE_ONLY) {
      R.indep = JSON.parse(cp.execFileSync('python3', ['-I', path.join(__dirname, 'earthworks_volume_independent.py'), dbPath, '--dump', DUMP], { maxBuffer: 1 << 26 }).toString());
      R.civil = nodeProbe(R.indep[0] && R.indep[0].guid, true); R.bld = nodeProbe(null, false);
      R.civil.logLines.forEach(l => log(l));
    } else { R.civil = await probe(browser, BLD); R.bld = await probe(browser, 'Duplex_extracted'); }
    log('§EWV_CIVIL ' + JSON.stringify(Object.assign({}, R.civil, { logLines: undefined, ev: R.civil.ev && Object.assign({}, R.civil.ev, { elements: R.civil.ev.elements.map(e => ({ guid: e.guid, verdict: e.verdict, tris: e.tris, V: e.V, B: e.B, E: e.E, openEdges: e.openEdges, nonManifoldEdges: e.nonManifoldEdges })) }) })));
    log('§EWV_BLD ' + JSON.stringify({ civil: R.bld.civil, ewRows: R.bld.ewRows, plannedRows: R.bld.plannedRows, ev: R.bld.ev && { n: R.bld.ev.n, verdict: R.bld.ev.verdict } }));
  } catch (e) { log('§EWV verdict=INCONCLUSIVE reason=' + e.message); R.err = e.message; process.exitCode = 2; }
  finally { if (browser) { await browser.close(); server.close(); } }
  if (R.err) { logStream.end(); return; }
  if (!R.indep) try { R.indep = JSON.parse(cp.execFileSync('python3', ['-I', path.join(__dirname, 'earthworks_volume_independent.py'), dbPath], { maxBuffer: 1 << 26 }).toString()); }
  catch (e) { log('§EWV verdict=INCONCLUSIVE reason=independent computation failed: ' + e.message); logStream.end(); process.exitCode = 2; return; }
  log('§EWV_INDEP ' + JSON.stringify(R.indep));
  const ev = R.civil.ev, el = ev && ev.elements, ind = R.indep;
  if (!R.civil.ewRows) { log('§EWV verdict=INCONCLUSIVE reason=no EARTHWORK element in ' + BLD); logStream.end(); process.exitCode = 2; return; }
  const f4 = x => (x != null ? x.toFixed(4) : 'NA');
  if (el) el.forEach(e => { const x = ind.find(y => y.guid === e.guid) || {};
    log('§EWV element=' + e.guid + ' (js/numpy) verdict=' + e.verdict + '/' + x.verdict + ' tris=' + e.tris + '/' + x.tris + ' E=' + e.E + '/' + x.E + ' wrongWay=' + e.wrongWayEdges + '/' + x.wrongWayEdges +
      ' V=' + f4(e.V) + '/' + f4(x.V) + ' B=' + f4(e.B) + '/' + f4(x.B) + ' shifts=' + e.nShifts + '/' + x.nShifts + ' origin=bbox-centre; dV=' + (e.V != null && x.V != null ? Math.abs(e.V - x.V).toExponential(2) : 'NA') + ' dB=' + (e.B != null && x.B != null ? Math.abs(e.B - x.B).toExponential(2) : 'NA')); });
  const row0 = ((R.civil.plannedRows || []).find(x => x.vol) || {}).value;
  log('§EWV verdict=' + (ev ? ev.verdict : 'RED(no engine on this tree)') + (ev && ev.V != null ? ' V_m3=' + ev.V.toFixed(3) + ' B_m3=' + ev.B.toFixed(3) + ' E=' + ev.E : ' (NO NUMBER SHOWN)') + ' card="' + row0 + '" tolV=' + TOL_V + ' tolB=' + TOL_B + ' rootTree=' + ROOT);
  const c = R.civil.ctl || {}; log('§EWV_CONTROLS open-face cube(1 m) verdict=' + (c.open && c.open.verdict) + ' V=' + (c.open && c.open.V) + ' B=' + (c.open && c.open.B) + ' | open 100 m cube verdict=' + (c.openBig && c.openBig.verdict) + ' V=' + (c.openBig && c.openBig.V) + ' B=' + (c.openBig && c.openBig.B) + ' | flipped verdict=' + (c.flipped && c.flipped.verdict));
  const near = (a, b, t) => Math.abs(a - b) <= t;
  const fmtV = v => Math.round(v).toLocaleString('en-US');
  Witness('earthworks_volume')
    .population(() => [R])
    .schema({ type: 'object', required: ['civil', 'bld', 'indep'] })
    .invariant('instrument present: A.earthworksVolume + A.meshSolidVolume exist (RED on origin/main)', rs => rs.every(r => r.civil.hasFn && r.civil.hasCore))
    .invariant('not vacuous: EARTHWORK element(s) found with a mesh, independent computation saw the same elements', rs => rs.every(r => r.civil.ev && r.civil.ev.n >= 1 && r.indep.length === r.civil.ev.n))
    .invariant('controls EXACT: unit cube V=1 B=0, box 2x3x4 V=24, tetra V=4.5, cube moved by (5000,-3000,700) V=1, vertex-soup cube V=1 — all verdict EXACT, B<=1e-3', rs => rs.every(r => { const c = r.civil.ctl; return c && ['cube', 'box', 'tetraV', 'moved', 'soup'].every(k => c[k].verdict === 'EXACT' && c[k].closed && c[k].B <= 1e-3) && near(c.cube.V, 1, 1e-9) && near(c.box.V, 24, 1e-9) && near(c.tetraV.V, 4.5, 1e-9) && near(c.moved.V, 1, 1e-3) && near(c.soup.V, 1, 1e-9); }))
    .invariant('control open-face cube: verdict is APPROXIMATE with B>0 and B<V, OR INCONCLUSIVE exactly by the B>=V rule (never EXACT, never a bare volume); the 100 m cube (bounded by its own size) must be APPROXIMATE or INCONCLUSIVE by the same rule', rs => rs.every(r => { const c = r.civil.ctl; return ['open', 'openBig'].every(k => !c[k].closed && c[k].volume === null && ((c[k].verdict === 'APPROXIMATE' && c[k].B > 0 && c[k].B < c[k].V) || (c[k].verdict === 'INCONCLUSIVE' && c[k].B >= c[k].V))); }))
    .invariant('control flipped triangle: INCONCLUSIVE (wrong-way edge), no volume', rs => rs.every(r => { const c = r.civil.ctl.flipped; return c.verdict === 'INCONCLUSIVE' && !c.closed && c.wrong > 0 && c.volume === null; }))
    .invariant('verdict, triangle count, E, wrong-way count, shift count: JS = numpy, per element', rs => rs.every(r => r.civil.ev.elements.every(e => { const x = r.indep.find(y => y.guid === e.guid); return x && e.verdict === x.verdict && e.tris === x.tris && e.E === x.E && e.wrongWayEdges === x.wrongWayEdges && e.nShifts === x.nShifts; })))
    .invariant('V (bbox-centre origin) JS = numpy within ' + TOL_V + ' m3 and B JS = numpy within ' + TOL_B + ' m3 (B is measured by re-translating every vertex in numpy, closed form in JS)', rs => rs.every(r => r.civil.ev.elements.every(e => { const x = r.indep.find(y => y.guid === e.guid); return x && near(e.V, x.V, TOL_V) && near(e.B, x.B, TOL_B); })))
    .invariant('card line = the verdict: EXACT "N m³"; APPROXIMATE "≈ N m³ (E open edges, ±B m³)" with N,E,B from the numpy values; INCONCLUSIVE "not measurable" and no m³ figure; never a bare number for an open surface', rs => rs.every(r => {
      const ev = r.civil.ev, row = (r.civil.plannedRows || []).find(x => x.vol); if (!row) return false;
      const iV = r.indep.reduce((s, x) => s + x.V, 0), iB = r.indep.reduce((s, x) => s + x.B, 0), iE = r.indep.reduce((s, x) => s + x.E, 0);
      if (ev.verdict === 'INCONCLUSIVE') return /^not measurable/.test(row.value) && !/m³/.test(row.value);
      if (ev.verdict === 'EXACT') return row.value === fmtV(iV) + ' m³';
      const m = /^≈ ([\d,]+) m³ \((\d+) open edges, ±([\d.]+) m³\)$/.exec(row.value);
      return ev.verdict === 'APPROXIMATE' && !!m && +m[1].replace(/,/g, '') === Math.round(iV) && +m[2] === iE && near(+m[3], Math.ceil(iB * 10) / 10, 0.1 + TOL_B);
    }))
    .invariant('NON-IMPACT building (Duplex): not civil, 0 EARTHWORK rows, verdict VACUOUS, no volume line on the planned card', rs => rs.every(r => !r.bld.civil && r.bld.ewRows === 0 && r.bld.ev && r.bld.ev.verdict === 'VACUOUS' && !(r.bld.plannedRows || []).some(x => x.vol)))
    .redControl(rs => rs.map(r => { const c = JSON.parse(JSON.stringify(r)); c.indep[0].B += 1; c.indep[0].V += 5; return c; }))
    .run();
  logStream.end();
})();
