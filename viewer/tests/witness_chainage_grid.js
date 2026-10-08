#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CHAINAGE_GRID (2026-10-08, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §CHAINAGE_GRID). No bake.
// Read the log after every run — the exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: are the stations read from the model's OWN chainage markers (3D text solids, no name/pset/text),
// and do the panel, ticks, tags, hover chip and bottom strip all agree with them?
// GREEN = (1) mainline reads as a gap-free 0..N run in steps of major_m, monotone along the route by the witness's OWN projection
// of each label centre (brute-force 0.25 m resample); every arm monotone with distance from its own 0 marker; every character's
// IoU + margin logged · (2) RED control on the READER: one glyph of one label deleted → the run check fails · (3) tags == parsed
// labels, text == independent format · (4) tick counts == independent count over the anchored range · (5) hover at 3 points → chip
// chainage == the witness's own interpolation ±0.5 m · (6) strip at 3 x → camera on the route at that s ±1 m · (7) hide → 0 objects,
// strip + chip gone · (8) Duplex VACUOUS, never PASS.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load failed / nothing read), VACUOUS (Duplex), RED CONTROL.
// Env: GPU=real|sw (default sw = CPU SwiftShader), BLD, BLD_DIR, DUP_DIR, PORT, LOG.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'CivilWorksPath';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const DUP_DIR = process.env.DUP_DIR || '/home/red1/bim-compiler/deploy/buildings';
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8593);
const LOG = process.env.LOG || '/tmp/witness_chainage_grid.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
const _cl = console.log.bind(console);
function log(l) { logStream.write(l + '\n'); _cl(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (u.startsWith('/buildings/')) { const n = u.slice('/buildings/'.length); fp = fs.existsSync(path.join(BLD_DIR, n)) ? path.join(BLD_DIR, n) : path.join(DUP_DIR, n); }
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });
const STD = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'std_values.json'), 'utf8'));
const MAP = STD._chainage_map || {};
const AUTO = [];

// ── independent helpers (not the engine's) ──
function project(route, x, z) { let best = null, cum = 0;
  for (let i = 1; i < route.length; i++) { const L = Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z), n = Math.max(1, Math.ceil(L / 0.25));
    for (let k = 0; k <= n; k++) { const u = k / n, px = route[i - 1].x + u * (route[i].x - route[i - 1].x), pz = route[i - 1].z + u * (route[i].z - route[i - 1].z), d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, s: cum + u * L }; } cum += L; } return best; }
// own station crossing: walk the route at 0.25 m, signed distance of each sample to the label's text line, take the zero crossing
// nearest the label (|t| <= 300 m); none → projection onto the route EXTENDED past its ends (negative / > L s allowed)
function crossing(route, w, theta) { const dx = Math.cos(theta), dz = -Math.sin(theta); let prev = null, cum = 0, best = null;
  for (let i = 1; i < route.length; i++) { const L = Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z), n = Math.max(1, Math.ceil(L / 0.25));
    for (let k = 0; k <= n; k++) { const u = k / n, px = route[i - 1].x + u * (route[i].x - route[i - 1].x), pz = route[i - 1].z + u * (route[i].z - route[i - 1].z), s = cum + u * L;
      const sd = (px - w.x) * dz - (pz - w.z) * dx, t = (px - w.x) * dx + (pz - w.z) * dz;
      if (prev && Math.sign(sd) !== Math.sign(prev.sd)) { const f = prev.sd / (prev.sd - sd), sc = prev.s + f * (s - prev.s), tc = prev.t + f * (t - prev.t); if (Math.abs(tc) <= 300 && (!best || Math.abs(tc) < Math.abs(best.t))) best = { s: sc, t: tc }; }
      prev = { sd, s, t }; } cum += L; }
  if (best) return { s: best.s, d: Math.abs(best.t), how: 'axis' };
  const a = route[0], b = route[1], ux = b.x - a.x, uz = b.z - a.z, l0 = Math.hypot(ux, uz), s0 = ((w.x - a.x) * ux + (w.z - a.z) * uz) / l0;
  const c = route[route.length - 2], e = route[route.length - 1], vx = e.x - c.x, vz = e.z - c.z, l1 = Math.hypot(vx, vz), s1 = ((w.x - e.x) * vx + (w.z - e.z) * vz) / l1;
  return s0 < 0 ? { s: s0, d: 0, how: 'ext' } : s1 > 0 ? { s: cum + s1, d: 0, how: 'ext' } : { s: project(route, w.x, w.z).s, d: project(route, w.x, w.z).d, how: 'nearest' }; }
function pointAt(route, s) { let cum = 0; for (let i = 1; i < route.length; i++) { const L = Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  if (s <= cum + L || i === route.length - 1) { const u = L ? Math.max(0, Math.min(1, (s - cum) / L)) : 0; return { x: route[i - 1].x + u * (route[i].x - route[i - 1].x), z: route[i - 1].z + u * (route[i].z - route[i - 1].z) }; } cum += L; } }
function routeLen(route) { let c = 0; for (let i = 1; i < route.length; i++) c += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z); return c; }
function fmtI(ch) { const r = Math.round(ch); return Math.floor(r / 1000) + '+' + String(r % 1000).padStart(3, '0'); }
// independent anchor interpolation from (s, ch) pairs sorted by s
function interp(an, s) { if (s <= an[0].s) return an[0].ch + (s - an[0].s); for (let i = 1; i < an.length; i++) if (s <= an[i].s) { const a = an[i - 1], b = an[i]; return a.ch + (s - a.s) / (b.s - a.s) * (b.ch - a.ch); } const e = an[an.length - 1]; return e.ch + (s - e.s); }
function runCheck(main, step) { // main = [{value, s}] → gap-free 0..N in `step`, monotone by s
  const byS = main.slice().sort((a, b) => a.s - b.s), vals = byS.map(m => m.value);
  const mono = vals.every((v, i) => !i || v > vals[i - 1]), sorted = vals.slice().sort((a, b) => a - b);
  const gapFree = sorted.length > 1 && sorted[0] === 0 && sorted.every((v, i) => v === i * step);
  return { mono, gapFree, n: vals.length, vals: vals.join(',') };
}

async function open(browser, bld) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); if (/§CHAINAGE_AUTO_READ/.test(t)) AUTO.push(bld + ' ' + t); logStream.write('[con:' + bld + '] ' + t + '\n'); if (/§CHAINAGE_(READ|ANCHOR|GRID|PANEL|STRIP|OFF)/.test(t)) _cl('  [' + bld + '] ' + t.slice(0, 220)); });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${bld}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 25 * 60 * 1000, polling: 1000 });
  return page;
}

async function probe(page) {
  return page.evaluate(async () => {
    const A = window.APP, out = { civil: A.isCivilModel() }, sleep = ms => new Promise(r => setTimeout(r, ms));
    const std = await (await fetch('std_values.json?v=3')).json();
    // auto-read must happen with NO panel open: wait for it before opening Road standards
    for (let i = 0; i < 150 && !(A.civilChainReal && A.civilChainReal()); i++) await sleep(100);
    out.autoBeforePanel = !!(A.civilChainReal && A.civilChainReal());
    await A.showRoadStandards();
    for (let i = 0; i < 600 && !document.querySelector('.cg-section'); i++) await sleep(100);
    const sec = document.querySelector('.cg-section'); out.panel = sec ? { kv: [...sec.querySelectorAll('.cg-kv')].map(e => e.textContent), rows: sec.querySelectorAll('.cg-row').length, ivs: sec.querySelectorAll('.cg-iv').length, arms: [...sec.querySelectorAll('.cg-arm summary')].map(e => e.textContent) } : null;
    const C = A.chainage.read(std); if (!C) return out;
    const lab = l => ({ theta: l.theta, text: l.text, alignment: l.alignment, value: l.value, x: l.x, y: l.y, z: l.z, w: A.ifc2three(l.x, l.y, l.z), minIoU: Math.min(...l.chars.map(c => c.iou)), minMargin: Math.min(...l.chars.map(c => c.margin)), guids: l.guids, chars: l.chars.map(c => c.c + ':' + c.iou.toFixed(2)) });
    out.labels = C.res.labels.map(lab);
    out.route = C.route.map(p => ({ x: p.x, z: p.z }));
    out.engineIv = C.anc.intervals;
    // RED control on the reader: delete the first glyph of the "1300" label → re-read
    const l13 = C.res.labels.find(l => l.value === 1300 && !l.alignment);
    if (l13) { A._chainageDropGuid = l13.chars[0].guids[0]; A.chainage.reset(); const Cr = A.chainage.read(std); out.red = { dropped: A._chainageDropGuid, labels: Cr.res.labels.map(lab) }; A._chainageDropGuid = null; A.chainage.reset(); A.chainage.read(std); }
    // draw
    const st = await A.chainage.show(std); await sleep(300);
    out.state = st ? { tags: st.tags, minor: st.minor, major: st.major, verts: st.verts, objects: st.objects, range: st.range, ticks: st.ticks } : null;
    out.realAtEnds = [A.chainage.realAt(0), A.chainage.realAt(routeLenOf(C.route))];
    function routeLenOf(r) { let c = 0; for (let i = 1; i < r.length; i++) c += Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z); return c; }
    out.strip = !!document.getElementById('chainage-strip');
    // hover at 3 route points: fly there, project the road point 40 m ahead to the screen, dispatch pointermove, read the chip
    const P = A.civilProfile(), cv = A.renderer.domElement, rc = cv.getBoundingClientRect(); out.hover = [];
    for (const s0 of [300, 1000, 1800]) {
      A.civilGotoChainage(s0); A.camera.updateMatrixWorld(); await sleep(150);
      const q = A.civilRouteAt(s0 + 40), y = P.road[Math.round((s0 + 40) / P.ds)], v = new THREE.Vector3(q.x, y === y ? y : q.y, q.z).project(A.camera);
      const cx = rc.left + (v.x + 1) / 2 * rc.width, cy = rc.top + (1 - v.y) / 2 * rc.height; A.chainage.lastHover = null;
      cv.dispatchEvent(new PointerEvent('pointermove', { clientX: cx, clientY: cy, bubbles: true }));
      for (let i = 0; i < 20 && !A.chainage.lastHover; i++) await sleep(50);
      const chip = document.getElementById('chainage-chip'), h = A.chainage.lastHover;
      out.hover.push({ s0, world: { x: q.x, z: q.z }, h: h ? { ch: h.ch, s: h.s, x: h.x, z: h.z, lateral: h.lateral } : null, chip: chip ? chip.textContent : null, shown: chip ? chip.style.display !== 'none' : false });
    }
    // strip at 3 x positions
    const sc = document.querySelector('#chainage-strip canvas'), sr = sc.getBoundingClientRect(); out.stripW = sr.width; out.stripGo = [];
    for (const f of [0.1, 0.5, 0.9]) {
      const x = sr.left + 12 + (sr.width - 24) * f;
      sc.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: sr.top + 20, bubbles: true, pointerId: 1 })); sc.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: sr.top + 20, bubbles: true, pointerId: 1 }));
      await sleep(100); out.stripGo.push({ f, cam: { x: A.camera.position.x, z: A.camera.position.z }, now: document.querySelector('#chainage-strip .cg-now').textContent });
    }
    // hide
    const before = A.scene.children.filter(o => o.name === 'chainage-grid').length; A.hideRoadStandards('witness');
    // §CHAINAGE_EVERYWHERE: the one label owner, anchored and not
    out.labelReal = [300, 1000, 1800].map(s => ({ s, lbl: A.civilChainLabel(s), rng: A.civilChainRange(s, s + 100) }));
    A.chainage.reset(); out.labelNone = { lbl: A.civilChainLabel(1000), rng: A.civilChainRange(1000, 1100), real: A.civilChainReal() }; A.chainage.read(std);
    out.autoRead = window.__cgAuto || null;
    out.hide = { before, after: A.scene.children.filter(o => o.name === 'chainage-grid').length, strip: !!document.getElementById('chainage-strip'), chip: !!document.getElementById('chainage-chip'), active: A.chainage.active() };
    return out;
  });
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cg-profile-')), protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1280,720', ...gpuArgs] });
  const R = { gpu: GPU };
  try {
    const pr = await open(browser, BLD); R.road = await probe(pr);
    const pd = await open(browser, 'Duplex_extracted');
    R.dup = await pd.evaluate(async () => { const A = window.APP, std = await (await fetch('std_values.json?v=3')).json(); return { civil: A.isCivilModel(), read: A.chainage ? A.chainage.read(std) : 'no-api', shown: A.chainage ? await A.chainage.show(std) : 'no-api' }; });
    log('§CHAINAGE_DUPLEX ' + JSON.stringify(R.dup) + (R.dup.read === null && R.dup.shown === null ? ' verdict=VACUOUS' : ''));
  } catch (e) { log('§CHAINAGE verdict=INCONCLUSIVE reason=' + e.message); R.err = e.message; process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (R.err) { logStream.end(); return; }
  const r = R.road;
  if (!r.labels || !r.labels.length) { log('§WITNESS_CHAINAGE_GRID verdict=INCONCLUSIVE reason=nothing read (labels=0) — not a pass'); process.exitCode = 2; logStream.end(); return; }
  // ── independent recomputation ──
  const L = routeLen(r.route), step = MAP.major_m || 100, minor = MAP.minor_m || 20;
  const withS = ls => ls.filter(l => l.value != null).map(l => { const c = crossing(r.route, l.w, l.theta); return Object.assign({}, l, { s: c.s, lat: c.d, how: c.how }); });
  const labs = withS(r.labels), main = labs.filter(l => !l.alignment), arms = {};
  labs.filter(l => l.alignment).forEach(l => (arms[l.alignment] = arms[l.alignment] || []).push(l));
  labs.forEach(l => log('§CHAINAGE_INDEP_LABEL text="' + l.text + '" s=' + l.s.toFixed(1) + ' offset=' + l.lat.toFixed(1) + ' via=' + l.how + ' minIoU=' + l.minIoU.toFixed(3) + ' minMargin=' + l.minMargin.toFixed(3) + ' chars=' + l.chars.join(' ')));
  const rc = runCheck(main, step); log('§CHAINAGE_INDEP_RUN n=' + rc.n + ' mono=' + rc.mono + ' gapFree=' + rc.gapFree + ' bySvalues=' + rc.vals);
  const armOk = Object.keys(arms).map(k => { const a = arms[k], z = a.find(l => l.value === 0); if (!z) return { k, ok: false, why: 'no 0 marker' };
    const d = a.map(l => ({ v: l.value, d: Math.hypot(l.x - z.x, l.y - z.y) })).sort((p, q) => p.v - q.v); return { k, ok: d.every((p, i) => !i || p.d > d[i - 1].d), d: d.map(p => p.v + '@' + p.d.toFixed(0)).join(',') }; });
  armOk.forEach(a => log('§CHAINAGE_INDEP_ARM ' + a.k + ' monotone=' + a.ok + ' ' + (a.d || a.why)));
  const an = main.filter(l => l.how === 'axis').map(l => ({ s: l.s, ch: l.value })).sort((a, b) => a.s - b.s);
  log('§CHAINAGE_INDEP_ANCHORS axis=' + an.length + ' notOnRoute=' + main.filter(l => l.how !== 'axis').map(l => l.value + '@' + l.s.toFixed(1) + '(' + l.how + ')').join(','));
  const c0 = Math.min(interp(an, 0), interp(an, L)), c1 = Math.max(interp(an, 0), interp(an, L));
  let iMin = 0, iMaj = 0; for (let ch = Math.ceil(c0 / minor) * minor; ch <= c1 + 1e-6; ch += minor) { if (Math.abs(ch / step - Math.round(ch / step)) < 1e-6) iMaj++; else iMin++; }
  log('§CHAINAGE_INDEP_TICKS range=' + c0.toFixed(1) + '..' + c1.toFixed(1) + ' minor=' + iMin + ' major=' + iMaj + ' engine minor=' + (r.state && r.state.minor) + ' major=' + (r.state && r.state.major) + ' verts=' + (r.state && r.state.verts));
  const redMain = r.red ? withS(r.red.labels).filter(l => !l.alignment) : [], redRun = runCheck(redMain, step);
  log('§CHAINAGE_RED dropped=' + (r.red && r.red.dropped) + ' run mono=' + redRun.mono + ' gapFree=' + redRun.gapFree + ' values=' + redRun.vals);
  r.hover.forEach(h => { const own = h.h ? interp(an, project(r.route, h.h.x, h.h.z).s) : null; h.own = own; log('§CHAINAGE_INDEP_HOVER s0=' + h.s0 + ' chip="' + h.chip + '" engine=' + (h.h && h.h.ch.toFixed(2)) + ' own=' + (own != null ? own.toFixed(2) : 'NA') + ' lateral=' + (h.h && h.h.lateral.toFixed(1))); });
  r.stripGo.forEach(g => { const s = L * g.f, p = pointAt(r.route, s); g.err = Math.hypot(g.cam.x - p.x, g.cam.z - p.z); g.wantCh = interp(an, s); log('§CHAINAGE_INDEP_STRIP f=' + g.f + ' s=' + s.toFixed(1) + ' camErr=' + g.err.toFixed(2) + ' now="' + g.now + '" wantCh=' + fmtI(g.wantCh)); });
  log('§CHAINAGE_LABELS real=' + JSON.stringify(r.labelReal) + ' none=' + JSON.stringify(r.labelNone) + ' auto=' + JSON.stringify(AUTO));
  log('§CHAINAGE_HIDE ' + JSON.stringify(r.hide) + ' panel=' + JSON.stringify(r.panel));

  const rows = [Object.assign({ id: BLD }, { r, rc, armOk, iMin, iMaj, redRun, an })];
  const W = Witness('CHAINAGE_GRID')
    .population(() => rows)
    .schema({ type: 'object', required: ['id', 'r', 'rc'], properties: { id: { type: 'string' } } })
    .invariant('(1) READ: every label parsed; mainline = gap-free 0..N in ' + step + ' m steps AND strictly increasing along the route by the witness\'s own projection; ≥ 2 stations', rs => rs.every(x => x.r.labels.every(l => l.value != null) && x.rc.gapFree && x.rc.mono && x.rc.n >= 2))
    .invariant('(1b) arms: each arm has a 0 marker and its values grow with distance from it', rs => rs.every(x => x.armOk.length > 0 && x.armOk.every(a => a.ok)))
    .invariant('(1c) engine interval check == independent: same count (mainline − 1) and route length per interval within 0.5 m of the own projection', rs => rs.every(x => { const iv = x.r.engineIv, a = x.an; return iv.length === a.length - 1 && iv.every((q, i) => Math.abs(q.routeM - (a[i + 1].s - a[i].s)) < 0.5 && q.from === a[i].ch && q.to === a[i + 1].ch); }))
    .invariant('(2) RED control on the reader: dropping one glyph of "1300" breaks the run (not gap-free or not monotone)', rs => rs.every(x => x.r.red && !(x.redRun.gapFree && x.redRun.mono)))
    .invariant('(3) tags: one per parsed label, text == "CH " + independent k+mmm format', rs => rs.every(x => x.r.state && x.r.state.tags.length === x.r.labels.length && x.r.state.tags.every(t => t.text === 'CH ' + fmtI(t.value))))
    .invariant('(4) ticks: minor and major counts == independent count over the anchored range (±1 each for a sample with no road under it)', rs => rs.every(x => x.r.state && Math.abs(x.r.state.minor - x.iMin) <= 1 && Math.abs(x.r.state.major - x.iMaj) <= 1 && x.iMaj > 0))
    .invariant('(5) hover: chip shown at 3 points, its chainage == own interpolation of own projection ±0.5 m, chip text carries that CH', rs => rs.every(x => x.r.hover.length === 3 && x.r.hover.every(h => h.shown && h.h && h.own != null && Math.abs(h.h.ch - h.own) <= 0.5 && h.chip.indexOf('CH ' + fmtI(h.h.ch)) === 0)))
    .invariant('(6) strip: click at 10/50/90 % → camera on the route at that s (±1 m) and the strip shows CH of that s (±1 m)', rs => rs.every(x => x.r.stripGo.every(g => g.err <= 1 && Math.abs(parseInt(g.now.replace(/\D/g, ''), 10) - Math.round(g.wantCh)) <= 1)))
    .invariant('(7) hide (panel close): 0 chainage groups left, strip + chip removed, inactive', rs => rs.every(x => x.r.hide.before === 1 && x.r.hide.after === 0 && !x.r.hide.strip && !x.r.hide.chip && !x.r.hide.active))
    .invariant('(9) §CHAINAGE_EVERYWHERE label owner: anchored → "CH " + own k+mmm of own interpolation at 3 s (±1 m), range likewise; markers not read → "N m (inferred)"; auto-read ran once on the road model after load (not on Duplex)', rs => rs.every(x => x.r.labelReal.every(q => { const v = t => { const m = /(\d+)\+(\d{3})/.exec(t); return m ? +m[1] * 1000 + +m[2] : NaN; }, r2 = q.rng.split('\u2013'); console.log('§CHAINAGE_LABEL_CMP s=' + q.s + ' lbl=' + q.lbl + ' own=' + interp(x.an, q.s).toFixed(2) + ' rng=' + q.rng + ' ownEnd=' + interp(x.an, q.s + 100).toFixed(2));
      return /^CH \d+\+\d{3}$/.test(q.lbl) && Math.abs(v(q.lbl) - interp(x.an, q.s)) <= 1 && Math.abs(v(r2[0]) - interp(x.an, q.s)) <= 1 && Math.abs(v(r2[1]) - interp(x.an, q.s + 100)) <= 1; }) &&
      x.r.labelNone.lbl === '1000 m (inferred)' && x.r.labelNone.rng === '1000\u20131100 m (inferred)' && !x.r.labelNone.real && x.r.autoBeforePanel) && AUTO.filter(t => t.startsWith(BLD + ' ') && /anchored=true/.test(t)).length === 1 && !AUTO.some(t => t.startsWith('Duplex')))
    .invariant('(8) Duplex: not civil → read null, show null (VACUOUS, not a pass)', () => R.dup && !R.dup.civil && R.dup.read === null && R.dup.shown === null)
    .redControl(rs => rs.map(x => Object.assign({}, x, { rc: Object.assign({}, x.rc, { gapFree: false }) })));
  console.log = (...a) => { const s = a.join(' '); logStream.write(s + '\n'); _cl(...a); };
  try { W.run(); } finally { console.log = _cl; }
  await new Promise(res => logStream.end(res));
})();
