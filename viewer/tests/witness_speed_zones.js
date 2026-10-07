#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §SPEED_ZONES (2026-10-07, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §SPEED_ZONES). No bake.
// Read the log after every run — the exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: speed zones are DERIVED from ATJ 8/86 rows (never typed), and the road colouring, legend,
// sign list, click and the user lever (derived / class / manual) all agree with an INDEPENDENT recomputation.
// GREEN = (1) every derived speed is a cell of the ATJ 8/86 text (grep of the PDF's own .txt) and carries table+page,
// (2) terrain per window == recomputed in node from the page's long-section samples, (3) zone boundaries == the speed-sign
// chainages projected independently in node (+ terrain-class changes), (4) legend swatch == the colour read back from every
// painted ROAD slot; toggle off restores the saved colours exactly, (5) click a sign row -> camera on the sign + card cites
// the ATJ table/page, (6) lever: class / manual / per-zone / area-type overrides change speeds per the table and the label
// says so, (7) Duplex VACUOUS (never PASS).
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load failed / nothing judged), VACUOUS (Duplex), RED CONTROL.
// Env: GPU=real|sw (real only if nvidia-smi < 50% used), BLD, BLD_DIR, DUP_DIR, ATJ_TXT, PORT, LOG.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'CivilWorksPath';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const DUP_DIR = process.env.DUP_DIR || '/home/red1/bim-compiler/deploy/buildings';
const ATJ_TXT = process.env.ATJ_TXT || path.join(BLD_DIR, 'standards', 'ATJ_8-86.txt');
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8592);
const LOG = process.env.LOG || '/tmp/witness_speed_zones.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (u.startsWith('/buildings/')) { const n = u.slice('/buildings/'.length); fp = fs.existsSync(path.join(BLD_DIR, n)) ? path.join(BLD_DIR, n) : path.join(DUP_DIR, n); }
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

const STD = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'std_values.json'), 'utf8'));
const GEO = STD.geometric;
const ATJ = fs.existsSync(ATJ_TXT) ? fs.readFileSync(ATJ_TXT, 'utf8') : null;
// does the PDF's own text contain this table row?  "R5   100  80  60"
function atjHasSpeedRow(cls, row) { return !!ATJ && new RegExp('^\\s*' + cls + '\\s+' + row.join('\\s+') + '\\s*$', 'm').test(ATJ); }
const TERR = ['FLAT', 'ROLLING', 'MOUNTAINOUS'], ROM = ['I', 'II', 'III'];
// independent speed lookup straight from the JSON table (not the engine)
function speedOf(cls, terrain, areaType) { const t = GEO.design_speed[cls[0] === 'R' ? 'rural' : 'urban'].rows[cls]; return t[cls[0] === 'R' ? TERR.indexOf(terrain) : ROM.indexOf(areaType)]; }
function median(a) { a = a.slice().sort((x, y) => x - y); const n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; }
function terrOf(p) { return p < 3 ? 'FLAT' : p <= 25 ? 'ROLLING' : 'MOUNTAINOUS'; }
// independent projection: brute-force nearest point on a 0.25 m resampling of the polyline
function project(route, x, z) { let best = null, cum = 0;
  for (let i = 1; i < route.length; i++) { const L = Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z), n = Math.max(1, Math.ceil(L / 0.25));
    for (let k = 0; k <= n; k++) { const u = k / n, px = route[i - 1].x + u * (route[i].x - route[i - 1].x), pz = route[i - 1].z + u * (route[i].z - route[i - 1].z), d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, s: cum + u * L }; } cum += L; } return best; }

async function open(browser, bld) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); logStream.write('[con:' + bld + '] ' + t + '\n'); if (/§(SPEED|SIGN_CHECK_PANEL|ZOOM_MISS|PROFILE_LENS_PRECOMPUTE)/.test(t)) console.log('  [' + bld + '] ' + t.slice(0, 260)); });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${bld}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 25 * 60 * 1000, polling: 1000 });
  return page;
}
// open the panel with an optional std override; wait until the Speed section has been derived
const OPEN_FN = `window.__openSZ = async (ov) => {
  const A = window.APP; localStorage.removeItem('json_std_values');
  if (ov) { const std = await (await fetch('std_values.json?v=1')).json(); ov(std); localStorage.setItem('json_std_values', JSON.stringify(std)); }
  A._speedZones = null; await A.showRoadStandards();
  for (let i = 0; i < 400 && !A._speedZones; i++) await new Promise(r => setTimeout(r, 100));
  localStorage.removeItem('json_std_values'); return A._speedZones;
};`;
const SUM = `(r) => r && ({ mode: r.mode, ok: r.ok, msgs: r.msgs, assumed: r.assumed, zones: r.zones.map(z => ({ id: z.id, s0: z.s0, s1: z.s1, opens: z.opens, terrain: z.terrain, measured: z.terrainMeasured, pct: z.terrainPct, cls: z.cls, speed: z.speed, label: z.label, lane: z.lane && z.lane.m, grade: z.grade && z.grade.pct, gradeRef: z.grade && z.grade.ref, speedRef: z.speedRef && { table: z.speedRef.table, page: z.speedRef.page }, notes: z.notes })),
  speedSigns: r.speedSigns, signRows: r.signRows.map(s => ({ guid: s.guid, code: s.code, s: s.s, speed: s.speed, label: s.label, isSpeedSign: s.isSpeedSign })) })`;

async function roadProbe(page) {
  return page.evaluate(async (OPEN, SUMSRC) => {
    const A = window.APP, out = { civil: A.isCivilModel() }, sum = eval(SUMSRC);
    // base (derived) run
    const r0 = await window.__openSZ(null); out.base = sum(r0);
    const P = A.civilProfile(); out.prof = { ds: P.ds, n: P.n, ground: Array.from(P.ground), road: Array.from(P.road) };
    out.route = A.civilDriveRoute().map(p => ({ x: p.x, z: p.z }));
    out.title = A.dbQuery("SELECT value FROM element_psets WHERE name='01_Project_Title' LIMIT 1")[0][0];
    // legend swatches + sign rows from the DOM
    const pan = document.getElementById('road-standards-panel');
    out.signPos = {}; (r0.signRows || []).filter(q => q.isSpeedSign).forEach(q => { const c = A.dbQuery('SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?', [q.guid])[0], p = A.ifc2three(c[0], c[1], c[2]); out.signPos[q.guid] = { x: p.x, z: p.z }; });
    out.legend = [...pan.querySelectorAll('.sz-leg')].map(e => ({ zone: e.dataset.zone, bg: e.querySelector('.sz-sw').style.backgroundColor, text: e.textContent }));
    out.signDom = [...pan.querySelectorAll('.sz-row')].map(e => e.textContent);
    // ROAD elements: independent inputs (ifc2three centres) + pre-paint colours
    const rows = A.dbQuery("SELECT m.guid, t.center_x, t.center_y, t.center_z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='ROAD'");
    const road = {}; rows.forEach(r => { const p = A.ifc2three(r[1], r[2], r[3]); road[r[0]] = { x: p.x, z: p.z }; }); out.roadN = rows.length; out.roadPos = road;
    const ms = {}; A.collectMeshes(o => o.isMesh || o.isInstancedMesh || o.isBatchedMesh).forEach(o => { ms[o.id] = o; });
    const C = new THREE.Color();
    function snap() { const s = {}; Object.keys(A.guidMap).forEach(k => { const g = A.guidMap[k]; if (!road[g]) return; const us = k.indexOf('_'); if (us <= 0) return; const m = ms[+k.slice(0, us)], slot = +k.slice(us + 1); if (!m || !m.getColorAt) return;
      let hex = 0xffffff; try { if (m.isInstancedMesh && !m.instanceColor) hex = 0xffffff; else { m.getColorAt(slot, C); hex = C.getHex(); } } catch (e) { return; } s[k] = { g, hex }; }); return s; }
    const before = snap(); out.nSlots = Object.keys(before).length;
    const tg = pan.querySelector('.sz-toggle'); tg.checked = true; tg.dispatchEvent(new Event('change'));
    const on = snap(); out.on = Object.keys(on).map(k => ({ g: on[k].g, hex: on[k].hex }));
    tg.checked = false; tg.dispatchEvent(new Event('change'));
    const off = snap(); out.revertMismatch = Object.keys(before).filter(k => !off[k] || off[k].hex !== before[k].hex).length;
    out.tintStateAfterOff = A._speedZonesTint;
    // click first sign row (RP. 7 first) -> camera on that GUID's centre
    tg.checked = true; tg.dispatchEvent(new Event('change'));
    const el = pan.querySelector('.sz-row'), g = el.dataset.guid; el.click();
    const row0 = A.dbQuery('SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?', [g])[0], w0 = A.ifc2three(row0[0], row0[1], row0[2]);
    for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 250)); const t = A.controls.target; if (Math.hypot(w0.x - t.x, w0.y - t.y, w0.z - t.z) < 0.05) break; }
    const row = A.dbQuery('SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?', [g])[0], want = A.ifc2three(row[0], row[1], row[2]), t = A.controls.target;
    out.click = { guid: g, dist: Math.hypot(want.x - t.x, want.y - t.y, want.z - t.z), card: pan.querySelector('.rs-card').textContent, rowText: el.textContent };
    tg.checked = false; tg.dispatchEvent(new Event('change'));
    // lever runs (each through the real Settings override path)
    out.lever = {};
    out.lever.classR6 = sum(await window.__openSZ(s => { s.geometric.speed_setting.mode = 'class'; s.geometric.speed_setting['class'] = 'R6'; }));
    out.lever.legendClassR6 = [...document.querySelectorAll('#road-standards-panel .sz-leg')].map(e => e.textContent);
    out.lever.signClassR6 = [...document.querySelectorAll('#road-standards-panel .sz-row')].slice(0, 3).map(e => e.textContent);
    out.lever.manual70 = sum(await window.__openSZ(s => { s.geometric.speed_setting.mode = 'manual'; s.geometric.speed_setting.design_speed_kmh = 70; }));
    out.lever.manualPerZone = sum(await window.__openSZ(s => { s.geometric.speed_setting.mode = 'manual'; s.geometric.speed_setting.design_speed_kmh = 70; s.geometric.speed_setting.per_zone = { Z1: 60 }; }));
    out.lever.manualNoRow = sum(await window.__openSZ(s => { s.geometric.speed_setting.mode = 'manual'; s.geometric.speed_setting.design_speed_kmh = 65; }));
    out.lever.manualUnset = sum(await window.__openSZ(s => { s.geometric.speed_setting.mode = 'manual'; }));
    const urb = (at) => s => { s.geometric.road_category_map.rows[0].category = 'Arterials'; s.geometric.road_category_map.rows[0].status = 'user'; s.geometric.inputs.area.value = 'URBAN'; s.geometric.inputs.area.status = 'user'; s.geometric.inputs.adt.value = 10001; s.geometric.inputs.adt.status = 'user'; s.geometric.inputs.area_type.value = at; s.geometric.inputs.area_type.status = 'user'; };
    out.lever.urbanI = sum(await window.__openSZ(urb('I'))); out.lever.urbanIII = sum(await window.__openSZ(urb('III')));
    out.lever.noCategory = sum(await window.__openSZ(s => { s.geometric.road_category_map.rows[0].title_regex = 'NO-SUCH-TEXT-XYZ'; }));
    await window.__openSZ(null);
    return out;
  }, OPEN_FN, SUM);
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'sz-profile-')), protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1280,720', ...gpuArgs] });
  const R = { gpu: GPU };
  try {
    const pr = await open(browser, BLD);
    await pr.evaluate(OPEN_FN); R.road = await roadProbe(pr);
    const sh = Object.assign({}, R.road); delete sh.roadPos; delete sh.prof; delete sh.route; delete sh.on; log('§SPEED_ROAD ' + JSON.stringify(sh).slice(0, 6000));
    const pd = await open(browser, 'Duplex_extracted');
    R.dup = await pd.evaluate(async () => { const A = window.APP; const o = await A.showRoadStandards(); return { civil: A.isCivilModel(), opened: o, panel: !!document.getElementById('road-standards-panel'), zones: A._speedZones || null, hasApi: !!A.speedZones }; });
    log('§SPEED_DUPLEX ' + JSON.stringify(R.dup) + (R.dup.opened === null ? ' verdict=VACUOUS' : ''));
  } catch (e) { log('§SPEED_ZONES verdict=INCONCLUSIVE reason=' + e.message); R.err = e.message; process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (R.err) { logStream.end(); return; }
  const rd = R.road, B = rd.base;
  log('§SPEED_CLICK ' + JSON.stringify(rd.click));
  rd.prof.ground = rd.prof.ground.map(v => v == null ? NaN : v); rd.prof.road = rd.prof.road.map(v => v == null ? NaN : v);
  if (!B || !B.zones || !B.zones.length) { log('§SPEED_ZONES verdict=INCONCLUSIVE reason=no zones derived on road'); process.exitCode = 2; logStream.end(); return; }
  // ── independent recomputation ──
  const ds = rd.prof.ds, ti = GEO.terrain_inputs, arr = rd.prof[ti.source];
  let L = 0; for (let i = 1; i < rd.route.length; i++) L += Math.hypot(rd.route[i].x - rd.route[i - 1].x, rd.route[i].z - rd.route[i - 1].z);
  const win = []; for (let s0 = 0; s0 < L - 1e-6; s0 += ti.window_m) { const s1 = Math.min(L, s0 + ti.window_m), sl = [];
    for (let i = Math.floor(s0 / ds) + 1; i <= Math.min(arr.length - 1, Math.floor(s1 / ds)); i++) if (arr[i] === arr[i] && arr[i - 1] === arr[i - 1]) sl.push(Math.abs(arr[i] - arr[i - 1]) / ds * 100);
    win.push(sl.length < ti.min_pairs ? { s0, s1, t: ti.assumed_terrain, m: false } : { s0, s1, t: terrOf(median(sl)), m: true, p: median(sl) }); }
  R.indep = { L, win, nWinMeasured: win.filter(w => w.m).length };
  log('§SPEED_INDEP routeLen=' + L.toFixed(1) + ' windows=' + win.length + ' measured=' + R.indep.nWinMeasured + ' terrains=' + win.map(w => w.t[0] + (w.m ? '' : '?')).join(''));
  Witness('speed_zones')
    .population(() => [R])
    .schema({ type: 'object', required: ['road', 'dup'] })
    .invariant('road: civil, zones derived, every zone has a speed (nothing judged => INCONCLUSIVE above)', rs => rs.every(r => r.road.civil && r.road.base.ok && r.road.base.zones.every(z => z.speed != null)))
    .invariant('ATJ extraction: each derived speed is a cell of the ATJ 8/86 .txt row for that class (grep of the PDF text) AND carries table+page', rs => rs.every(r => ATJ !== null && r.road.base.zones.every(z => z.speedRef && z.speedRef.table && z.speedRef.page > 0 && atjHasSpeedRow(z.cls, GEO.design_speed[z.cls[0] === 'R' ? 'rural' : 'urban'].rows[z.cls]) && z.speed === speedOf(z.cls, z.terrain, GEO.inputs.area_type.value))))
    .invariant('ATJ extraction: Table 2.4 chain — Highway/RURAL -> R5 appears in the 2.4 selection rows and the PDF text lists "Highway   R5"', rs => rs.every(r => r.road.base.zones.every(z => z.cls === 'R5') && GEO.selection.rows.some(x => x.area === 'RURAL' && x.category === 'Highway' && x.class === 'R5') && /Highway\s+R5/.test(ATJ || '')))
    .invariant('lane width and max grade per zone == the extracted tables AND the PDF text carries those cells (R5 lane 3.50; grade row for the zone speed/terrain)', rs => rs.every(r => r.road.base.zones.every(z => z.lane === GEO.lane_width.rows[z.cls].lane_width_m && /R5 \/ U5\s+3\.50/.test(ATJ || '') && z.grade != null && GEO.max_grade.rows.some(g => g.classes.includes(z.cls) && g.speed_kmh === z.speed && g.max_grade_pct === z.grade))))
    .invariant('terrain per window == node recomputation from the page long-section samples (median |gradient|, ATJ 3%/25%); measured windows > 0', rs => rs.every(r => win.some(w => w.m) && win.every(w => { const z = r.road.base.zones.find(q => q.s0 <= w.s0 + 1e-6 && q.s1 > w.s0 + 1e-6); return z && z.terrain === w.t && (!w.m || (z.measured && Math.abs(z.pct - w.p) < 1e-6) || z.s0 < w.s0 - 1e-6); })))
    .invariant('speed-sign chainage == independent brute-force projection of the sign centre onto the route (<0.5 m), and zone boundaries == those chainages + terrain-window class changes only', rs => rs.every(r => {
      const sg = r.road.base.speedSigns, ind = sg.map(q => project(r.road.route, r.road.signPos[q.guid].x, r.road.signPos[q.guid].z).s);
      const bps = r.road.base.zones.map(z => z.s0), winChanges = win.filter((w, i) => i && w.t !== win[i - 1].t).map(w => w.s0);
      const near = (a, b) => Math.abs(a - b) < 0.5;
      return sg.length >= 1 && sg.every((q, i) => near(q.s, ind[i])) && ind.every(s => s <= 0.5 || s >= L - 0.5 || bps.some(b => near(b, s))) && bps.every(b => b < 0.05 || ind.some(s => near(s, b)) || winChanges.some(w => near(w, b))); }))
    .invariant('legend: one swatch per zone; swatch colour == colour read back from EVERY painted ROAD slot of that zone (independent chainage projection of each element centre)', rs => rs.every(r => {
      const hexOf = css => { const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(css); return (+m[1] << 16) | (+m[2] << 8) | +m[3]; };
      const sw = {}; r.road.legend.forEach(l => { sw[l.zone] = hexOf(l.bg); });
      if (r.road.legend.length !== r.road.base.zones.length || !r.road.on.length) return false;
      const near = (a, b) => ['r', 'g', 'b'].every((_, i) => Math.abs(((a >> (16 - 8 * i)) & 255) - ((b >> (16 - 8 * i)) & 255)) <= 4);   // setColorAt stores float16/8-bit; tolerance 4/255
      return r.road.on.every(o => { const pj = project(r.road.route, r.road.roadPos[o.g].x, r.road.roadPos[o.g].z); const z = r.road.base.zones.find(q => pj.s >= q.s0 && pj.s < q.s1) || r.road.base.zones[r.road.base.zones.length - 1]; return near(o.hex, sw[z.id]); }); }))
    .invariant('toggle off restores the saved colours of every slot (mismatch 0) and clears the tint state; slots judged > 0', rs => rs.every(r => r.road.nSlots > 0 && r.road.revertMismatch === 0 && r.road.tintStateAfterOff === null))
    .invariant('sign list: RP. 7 rows first with a speed + label each; list size == SIGNAGE count; DOM row text carries the km/h', rs => rs.every(r => r.road.base.signRows.length === r.road.signDom.length && r.road.base.signRows[0].isSpeedSign && r.road.base.signRows.every(s => s.speed != null && s.label) && r.road.signDom[0].includes(r.road.base.signRows[0].speed + ' km/h')))
    .invariant('click a sign row: camera target lands on that GUID centre (<0.05 m); card names the ATJ 8/86 table + page, the mode label and the assumed inputs', rs => rs.every(r => r.road.click.dist < 0.05 && /ATJ 8\/86 Table 3\.2A/.test(r.road.click.card) && /p\.\d+/.test(r.road.click.card) && /assumed/.test(r.road.click.card) && /derived/.test(r.road.click.card)))
    .invariant('LEVER class R6: every zone speed == Table 3.2A R6 at that terrain (independent), label "class R6 (user)", legend + sign list show it', rs => rs.every(r => { const L6 = r.road.lever.classR6; return L6.mode === 'class' && L6.zones.every(z => z.speed === speedOf('R6', z.terrain) && z.label === 'class R6 (user)' && z.lane === 3.65) && r.road.lever.legendClassR6.every(t => t.includes('class R6 (user)')) && r.road.lever.signClassR6.every(t => t.includes('class R6 (user)')); }))
    .invariant('LEVER manual 70: all zones 70 km/h, label "manual (user)"; per_zone Z1=60 overrides only Z1; 65 (no table row) says "manual (user), no table row"; unset manual = no speed + visible message', rs => rs.every(r => { const m = r.road.lever.manual70, pz = r.road.lever.manualPerZone, nr = r.road.lever.manualNoRow, un = r.road.lever.manualUnset;
      return m.zones.every(z => z.speed === 70 && /^manual \(user\)/.test(z.label)) && pz.zones.every(z => z.speed === (z.id === 'Z1' ? 60 : 70)) && nr.zones.every(z => z.speed === 65 && z.label === 'manual (user), no table row' && z.lane === null) && un.zones.every(z => z.speed === null) && un.msgs.length > 0 && un.ok === false; }))
    .invariant('LEVER area type: URBAN Arterial ADT 10001 -> U5; area type I vs III change the speed exactly per Table 3.2B (80 vs 50) and both PDF rows exist', rs => rs.every(r => { const a = r.road.lever.urbanI, b = r.road.lever.urbanIII; return a.zones.every(z => z.cls === 'U5' && z.speed === speedOf('U5', 'FLAT', 'I')) && b.zones.every(z => z.cls === 'U5' && z.speed === speedOf('U5', 'FLAT', 'III')) && speedOf('U5', 'FLAT', 'I') !== speedOf('U5', 'FLAT', 'III') && atjHasSpeedRow('U5', GEO.design_speed.urban.rows.U5); }))
    .invariant('no silent fall-through: a title that matches no category row derives nothing and says why (vacuous, message names the title mapping)', rs => rs.every(r => r.road.lever.noCategory.zones.length === 0 && r.road.lever.noCategory.msgs.some(m => /matches no road_category_map row/.test(m))))
    .invariant('Duplex: not civil, no panel, no Speed section => VACUOUS (not a pass of anything)', rs => rs.every(r => !r.dup.civil && r.dup.opened === null && !r.dup.panel && r.dup.zones === null))
    .redControl(rs => rs.map(r => Object.assign({}, r, { road: Object.assign({}, r.road, { base: Object.assign({}, r.road.base, { zones: r.road.base.zones.map(z => Object.assign({}, z, { speed: z.speed + 10 })) }) }) })))
    .run();
  logStream.end();
})();
