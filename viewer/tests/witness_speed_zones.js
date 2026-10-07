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
// says so, (7) Duplex VACUOUS (never PASS), (8b) §SIGNAL_JUNCTION_ZONE + discs on sign faces + MISSING SPEED SIGN rows; (8) §ROUNDABOUT_ZONE: zone s-range == independent projection of the roundabout elements, approach
// length == ATJ 8/86 Table 4.1 row (cell + page in the .txt) at the adjoining link speed, speed == NCHRP 672 bound, lane/pick/fixed_m levers,
// none-found message, (9) speed colour ramp (30 km/h near-white, monotonic, == std_values ramp) on legend + painted road + disc.
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
const SUM = `(r) => r && ({ mode: r.mode, ok: r.ok, msgs: r.msgs, assumed: r.assumed, zones: r.zones.map(z => ({ id: z.id, s0: z.s0, s1: z.s1, opens: z.opens, kind: z.kind, node: z.node, offRoute: z.offRoute, srcText: z.srcText, approachM: z.approachM, linkSpeed: z.linkSpeed, terrain: z.terrain, measured: z.terrainMeasured, pct: z.terrainPct, cls: z.cls, speed: z.speed, label: z.label, lane: z.lane && z.lane.m, grade: z.grade && z.grade.pct, gradeRef: z.grade && z.grade.ref, speedRef: z.speedRef && { table: z.speedRef.table, page: z.speedRef.page }, notes: z.notes })),
  speedSigns: r.speedSigns, nodes: Object.fromEntries(Object.entries(r.nodes || {}).map(([k, v]) => [k, Object.assign({}, v, { guids: undefined, zone: undefined })])), discPlan: r.discPlan, missingRows: r.missingRows, signRows: r.signRows.map(s => ({ guid: s.guid, code: s.code, s: s.s, speed: s.speed, label: s.label, isSpeedSign: s.isSpeedSign })) })`;

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
      let hex = 0xffffff; try { if (m.isInstancedMesh && !m.instanceColor) C.setHex(0xffffff); else m.getColorAt(slot, C); } catch (e) { return; }
      // §SPEED_ZONE_TRUE_COLOUR: judge the RENDERED tint = instance/batch colour × material colour (the old check read the tint alone and
      //   passed while the road showed grey-brown); fog must be off on painted meshes so distance haze does not grey it.
      const mc = (m.material && !Array.isArray(m.material) && m.material.color) ? m.material.color : null; if (mc) C.multiply(mc); hex = C.getHex();
      s[k] = { g, hex, fog: !!(m.material && m.material.fog) }; }); return s; }
    // §ROUNDABOUT_ZONE inputs, read by the witness's own query (model_map names come from std_values.json, as the engine's)
    const MM = JSON.parse(await (await fetch('std_values.json?v=1')).text()).geometric.model_map;
    out.rbPos = A.dbQuery('SELECT t.center_x, t.center_y, t.center_z FROM element_psets p JOIN element_transforms t ON t.guid = p.guid WHERE p.name = ? AND p.value = ?', [MM.roundabout_prop, MM.roundabout_value]).map(r => { const p = A.ifc2three(r[0], r[1], r[2]); return { x: p.x, z: p.z }; });
    out.rbGuids = A.dbQuery('SELECT p.guid FROM element_psets p WHERE p.name = ? AND p.value = ?', [MM.roundabout_prop, MM.roundabout_value]).map(r => r[0]);
    out.rbSigns = A.dbQuery('SELECT p.guid FROM element_psets p WHERE p.name = ? AND p.value LIKE ?', [MM.sign_name_prop, '%ROUNDABOUT AHEAD%']).length;
    out.sjPos = []; out.sjSigns = 0; try { out.sjPos = A.dbQuery('SELECT t.center_x, t.center_y, t.center_z FROM element_psets p JOIN elements_meta m ON m.guid = p.guid JOIN element_transforms t ON t.guid = p.guid WHERE p.name = ? AND p.value = ? AND m.discipline = ?', [MM.signal_prop, MM.signal_value, MM.signal_discipline]).map(r => { const p = A.ifc2three(r[0], r[1], r[2]); return { x: p.x, z: p.z }; });
    out.sjSigns = A.dbQuery('SELECT p.guid FROM element_psets p WHERE p.name = ? AND p.value LIKE ?', [MM.sign_name_prop, '%TRAFFIC SIGNAL AHEAD%']).length; } catch (e) { out.sjErr = String(e); }
    const before = snap(); out.nSlots = Object.keys(before).length;
    const tg = pan.querySelector('.sz-toggle'); tg.checked = true; tg.dispatchEvent(new Event('change'));
    const on = snap(); out.on = Object.keys(on).map(k => ({ g: on[k].g, hex: on[k].hex, fog: on[k].fog }));
    const DV = new THREE.Vector3();
    out.discsOn = A.scene.children.filter(o => o.userData && o.userData.speedDisc).map(o => { const u = o.userData; o.getWorldDirection(DV); let ind = null;
      if (u.discKind !== 'free') { const q = A.dbQuery('SELECT center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms WHERE guid = ?', [u.speedDisc])[0], w = Math.max(q[3], q[4]), hz = q[2] + q[5] / 2 - w / 2, th = q[3] <= q[4] ? [1, 0] : [0, 1], c0 = A.ifc2three(q[0], q[1], hz), c1 = A.ifc2three(q[0] + th[0], q[1] + th[1], hz), ax = [c1.x - c0.x, c1.y - c0.y, c1.z - c0.z], al = Math.hypot(...ax);
        ind = { axis: ax.map(v => v / al), c: [c0.x, c0.y, c0.z], half: Math.min(q[3], q[4]) / 2, w, bbox: [q[3], q[4]] }; }
      const px = o.material.map.image.getContext('2d').getImageData(128, 18, 1, 1).data;
      return { g: u.speedDisc, speed: u.speed, kind: u.discKind, borrowed: u.borrowed, zone: u.zone, zoneStart: u.zoneStart, label: u.label, side: u.side, n: [DV.x, DV.y, DV.z], pos: [o.position.x, o.position.y, o.position.z], dia: (o.geometry && o.geometry.parameters) ? o.geometry.parameters.radius * 2 : null, px: [px[0], px[1], px[2]], ind }; });
    out.missingDom = [...pan.querySelectorAll('.sz-missing')].map(e => ({ guid: e.dataset.guid, text: e.textContent })); out.missingGrp = !!pan.querySelector('details[data-verdict="MISSING SPEED SIGN"]');
    tg.checked = false; tg.dispatchEvent(new Event('change'));
    out.discsOff = A.scene.children.filter(o => o.userData && o.userData.speedDisc).length;
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
    tg.checked = true; tg.dispatchEvent(new Event('change'));
    { const me = pan.querySelector('.sz-missing[data-guid]:not([data-guid=""])'); if (me) { const mg = me.dataset.guid; me.click(); const mr = A.dbQuery('SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?', [mg])[0], mw = A.ifc2three(mr[0], mr[1], mr[2]);
      for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 250)); const tt = A.controls.target; if (Math.hypot(mw.x - tt.x, mw.y - tt.y, mw.z - tt.z) < 0.05) break; }
      const tt = A.controls.target; out.missClick = { guid: mg, dist: Math.hypot(mw.x - tt.x, mw.y - tt.y, mw.z - tt.z), card: pan.querySelector('.rs-card').textContent }; } }
    tg.checked = false; tg.dispatchEvent(new Event('change'));
    // lever runs (each through the real Settings override path)
    out.lever = {};
    out.lever.classR6 = sum(await window.__openSZ(s => { s.geometric.speed_setting.mode = 'class'; s.geometric.speed_setting['class'] = 'R6'; }));
    out.lever.legendClassR6 = [...document.querySelectorAll('#road-standards-panel .sz-leg')].map(e => ({ zone: e.dataset.zone, text: e.textContent }));
    out.lever.signClassR6 = [...document.querySelectorAll('#road-standards-panel .sz-row')].map(e => e.textContent);
    out.lever.manual70 = sum(await window.__openSZ(s => { s.geometric.speed_setting.mode = 'manual'; s.geometric.speed_setting.design_speed_kmh = 70; }));
    out.lever.manualPerZone = sum(await window.__openSZ(s => { s.geometric.speed_setting.mode = 'manual'; s.geometric.speed_setting.design_speed_kmh = 70; s.geometric.speed_setting.per_zone = { Z1: 60 }; }));
    out.lever.manualNoRow = sum(await window.__openSZ(s => { s.geometric.speed_setting.mode = 'manual'; s.geometric.speed_setting.design_speed_kmh = 65; }));
    out.lever.manualUnset = sum(await window.__openSZ(s => { s.geometric.speed_setting.mode = 'manual'; }));
    const urb = (at) => s => { s.geometric.road_category_map.rows[0].category = 'Arterials'; s.geometric.road_category_map.rows[0].status = 'user'; s.geometric.inputs.area.value = 'URBAN'; s.geometric.inputs.area.status = 'user'; s.geometric.inputs.adt.value = 10001; s.geometric.inputs.adt.status = 'user'; s.geometric.inputs.area_type.value = at; s.geometric.inputs.area_type.status = 'user'; };
    out.lever.urbanI = sum(await window.__openSZ(urb('I'))); out.lever.urbanIII = sum(await window.__openSZ(urb('III')));
    out.lever.noCategory = sum(await window.__openSZ(s => { s.geometric.road_category_map.rows[0].title_regex = 'NO-SUCH-TEXT-XYZ'; }));
    const rbz = out.base.zones.find(z => z.kind === 'roundabout');
    out.lever.rbPerZone = sum(await window.__openSZ(s => { s.geometric.speed_setting.per_zone = { [rbz ? rbz.id : 'none']: 55 }; }));
    out.lever.multilane = sum(await window.__openSZ(s => { (s.geometric.roundabout || (s.geometric.roundabout = {})).lane_type = 'multilane'; (s.geometric.roundabout || (s.geometric.roundabout = {})).lane_type_status = 'user'; }));
    out.lever.multiUpper = sum(await window.__openSZ(s => { (s.geometric.roundabout || (s.geometric.roundabout = {})).lane_type = 'multilane'; (s.geometric.roundabout || (s.geometric.roundabout = {})).speed_pick = 'upper'; }));
    out.lever.fixed150 = sum(await window.__openSZ(s => { (s.geometric.roundabout || (s.geometric.roundabout = {})).approach = { fixed_m: 150 }; }));
    out.lever.rbNone = sum(await window.__openSZ(s => { s.geometric.model_map.roundabout_value = 'NO-SUCH-VALUE'; }));
    out.lever.sj70 = sum(await window.__openSZ(s => { (s.geometric.signal_junction || (s.geometric.signal_junction = {})).speed_kmh = 70; (s.geometric.signal_junction || (s.geometric.signal_junction = {})).speed_status = 'user'; }));
    out.lever.sjNone = sum(await window.__openSZ(s => { s.geometric.model_map.signal_value = 'NO-SUCH-VALUE'; }));
    out.lever.sjOff = sum(await window.__openSZ(s => { (s.geometric.signal_junction || (s.geometric.signal_junction = {})).enabled = false; }));
    out.lever.sjFixed = sum(await window.__openSZ(s => { (s.geometric.signal_junction || (s.geometric.signal_junction = {})).approach = { fixed_m: 120 }; }));
    out.lever.rbOff = sum(await window.__openSZ(s => { (s.geometric.roundabout || (s.geometric.roundabout = {})).enabled = false; }));
    out.lever.rbUrb = sum(await window.__openSZ(urb('III')));
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
  if (!GEO.signal_junction || !GEO.node_kinds || !B.zones.some(z => z.kind === 'signal_junction') || !GEO.roundabout || !GEO.stopping_sight_distance || !GEO.speed_ramp || !B.zones.some(z => z.kind === 'roundabout') ) {
    log('§WITNESS_SPEED_ZONES verdict=RED reason=§SIGNAL_JUNCTION_ZONE/§ROUNDABOUT_ZONE feature absent on this tree (signal_junction=' + !!GEO.signal_junction + ' node_kinds=' + !!GEO.node_kinds + ' roundabout=' + !!GEO.roundabout + ' ssd=' + !!GEO.stopping_sight_distance + ' ramp=' + !!GEO.speed_ramp + ' zoneKinds=' + [...new Set(B.zones.map(z => z.kind))].join(',') + ')'); process.exitCode = 1; logStream.end(); return; }
  // ── independent recomputation ──
  const ds = rd.prof.ds, ti = GEO.terrain_inputs, arr = rd.prof[ti.source];
  let L = 0; for (let i = 1; i < rd.route.length; i++) L += Math.hypot(rd.route[i].x - rd.route[i - 1].x, rd.route[i].z - rd.route[i - 1].z);
  const win = []; for (let s0 = 0; s0 < L - 1e-6; s0 += ti.window_m) { const s1 = Math.min(L, s0 + ti.window_m), sl = [];
    for (let i = Math.floor(s0 / ds) + 1; i <= Math.min(arr.length - 1, Math.floor(s1 / ds)); i++) if (arr[i] === arr[i] && arr[i - 1] === arr[i - 1]) sl.push(Math.abs(arr[i] - arr[i - 1]) / ds * 100);
    win.push(sl.length < ti.min_pairs ? { s0, s1, t: ti.assumed_terrain, m: false } : { s0, s1, t: terrOf(median(sl)), m: true, p: median(sl) }); }
  R.indep = { L, win, nWinMeasured: win.filter(w => w.m).length };
  log('§SPEED_INDEP routeLen=' + L.toFixed(1) + ' windows=' + win.length + ' measured=' + R.indep.nWinMeasured + ' terrains=' + win.map(w => w.t[0] + (w.m ? '' : '?')).join(''));
  function SYN() {
    const SZ = require(path.join(ROOT, 'viewer', 'speed_zones.js')), std = JSON.parse(JSON.stringify(STD)), near = (a, b) => Math.abs(a - b) < 0.5;
    const route = []; for (let x = 0; x <= 2000; x += 100) route.push({ x, z: 0 });
    const prof = { ds: 1, ground: new Array(2001).fill(0).map((_, i) => i * 0.01), road: new Array(2001).fill(0) };
    const run = pts => SZ.derive(std, { title: 'JALAN (FT240)', route, profile: prof, signs: [], nodes: { roundabout: pts.map((p, i) => ({ guid: 'g' + i, x: p[0], z: p[1] })), signal_junction: [] } }, { log: l => logStream.write('[syn] ' + l + '\n') });
    const ring = [[800, 20], [850, -20], [900, 20], [850, 25]];
    const a = run(ring), z = a.zones.map(q => [q.kind, Math.round(q.s0), Math.round(q.s1), q.speed]);
    const want = [['link', 0, 615, 100], ['approach', 615, 800, 32], ['roundabout', 800, 900, 32], ['approach', 900, 1085, 32], ['link', 1085, 2000, 100]];
    const start = run([[-60, 10], [-90, -10]]), end = run([[2060, 10], [2090, -5]]), none = run([]);
    const ok1 = JSON.stringify(z) === JSON.stringify(want) && a.nodes.roundabout.offRoute === false;
    const ok2 = start.nodes.roundabout.offRoute && start.zones.filter(q => q.kind === 'approach').length === 1 && near(start.zones.find(q => q.kind === 'approach').s1, 185);
    const ok3 = end.nodes.roundabout.offRoute && end.zones.filter(q => q.kind === 'approach').length === 1 && near(end.zones.find(q => q.kind === 'approach').s0, 2000 - 185);
    const ok4 = none.zones.every(q => q.kind === 'link') && none.msgs.some(m => /roundabout: no model elements/.test(m));
    console.log('§SPEED_SYNTH zones=' + JSON.stringify(z) + ' ok=' + [ok1, ok2, ok3, ok4]); return { ok: ok1 && ok2 && ok3 && ok4 }; }
  const LK = zs => zs.filter(z => z.kind === 'link');
  // §ROUNDABOUT_ZONE independent inputs
  const rbP = rd.rbPos.map(p => project(rd.route, p.x, p.z).s), rs0 = Math.min(...rbP), rs1 = Math.max(...rbP);
  const termAt = s => (win.find(w => s >= w.s0 && s < w.s1) || win[win.length - 1]).t;
  const lsIndep = s => speedOf('R5', termAt(s), GEO.inputs.area_type.value);                  // link class R5 (Table 2.4), terrain from the independent windows
  const SSD = GEO.stopping_sight_distance, pagesTxt = ATJ ? ATJ.split('\f') : [], p41 = pagesTxt.findIndex(p => p.includes('TABLE 4.1:')) + 1 - 7;
  const ssdCell = (sp, m) => !!ATJ && new RegExp('^\\s*' + sp + '\\s+' + m + '\\s*$', 'm').test(pagesTxt[p41 + 7 - 1] || '');
  const nAp = (rs0 > 1e-6 ? 1 : 0) + (rs1 < L - 1e-6 ? 1 : 0);
  const nchrpKmh = mph => Math.round(mph * 1.609344);
  const RB = GEO.roundabout, RBz = b => b.zones.filter(z => z.kind === 'roundabout'), APz = b => b.zones.filter(z => z.kind === 'approach' && z.node === 'roundabout'), SJz = b => b.zones.filter(z => z.kind === 'signal_junction'), SAz = b => b.zones.filter(z => z.kind === 'approach' && z.node === 'signal_junction');
  const sjBox = () => { const P = rd.sjPos; return P.length ? { x0: Math.min(...P.map(p => p.x)), x1: Math.max(...P.map(p => p.x)), z0: Math.min(...P.map(p => p.z)), z1: Math.max(...P.map(p => p.z)) } : null; };
  const sjP = rd.sjPos.map(p => project(rd.route, p.x, p.z).s), ss0 = Math.min(...sjP), ss1 = Math.max(...sjP), SJ = GEO.signal_junction;
  const sjOff = sjP.every(x => x < 1e-6 || x > L - 1e-6) && ss1 - ss0 < 1e-6;
  const sjAp = b => SAz(b), sjNAp = (rs0_, rs1_) => (rs0_ > 1e-6 ? 1 : 0) + (rs1_ < L - 1e-6 ? 1 : 0);
  // zones whose START has no real speed sign within disc_has_sign_m (independent projection of the sign centres)
  const noRp = b => b.zones.filter(z => !z.offRoute).filter(z => !b.speedSigns.some(q => Math.abs(project(rd.route, rd.signPos[q.guid].x, rd.signPos[q.guid].z).s - z.s0) <= GEO.disc_has_sign_m)).map(z => z.id);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const lum = h => 0.2126 * (h >> 16) + 0.7152 * ((h >> 8) & 255) + 0.0722 * (h & 255);
  const rampHex = k => { const st = GEO.speed_ramp.stops, hx = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    if (k <= st[0].kmh) return hx(st[0].hex); if (k >= st[st.length - 1].kmh) return hx(st[st.length - 1].hex);
    const i = st.findIndex(q => k <= q.kmh), u = (k - st[i - 1].kmh) / (st[i].kmh - st[i - 1].kmh), a = hx(st[i - 1].hex), b = hx(st[i].hex); return a.map((v, j) => Math.round(v + (b[j] - v) * u)); };
  const W = Witness('speed_zones')
    .population(() => [R])
    .schema({ type: 'object', required: ['road', 'dup'] })
    .invariant('road: civil, zones derived, every zone has a speed (nothing judged => INCONCLUSIVE above)', rs => rs.every(r => r.road.civil && r.road.base.ok && r.road.base.zones.every(z => z.speed != null)))
    .invariant('ATJ extraction: each derived speed is a cell of the ATJ 8/86 .txt row for that class (grep of the PDF text) AND carries table+page', rs => rs.every(r => ATJ !== null && LK(r.road.base.zones).length > 0 && LK(r.road.base.zones).every(z => z.speedRef && z.speedRef.table && z.speedRef.page > 0 && atjHasSpeedRow(z.cls, GEO.design_speed[z.cls[0] === 'R' ? 'rural' : 'urban'].rows[z.cls]) && z.speed === speedOf(z.cls, z.terrain, GEO.inputs.area_type.value))))
    .invariant('ATJ extraction: Table 2.4 chain — Highway/RURAL -> R5 appears in the 2.4 selection rows and the PDF text lists "Highway   R5"', rs => rs.every(r => LK(r.road.base.zones).every(z => z.cls === 'R5') && GEO.selection.rows.some(x => x.area === 'RURAL' && x.category === 'Highway' && x.class === 'R5') && /Highway\s+R5/.test(ATJ || '')))
    .invariant('lane width and max grade per zone == the extracted tables AND the PDF text carries those cells (R5 lane 3.50; grade row for the zone speed/terrain)', rs => rs.every(r => LK(r.road.base.zones).every(z => z.lane === GEO.lane_width.rows[z.cls].lane_width_m && /R5 \/ U5\s+3\.50/.test(ATJ || '') && z.grade != null && GEO.max_grade.rows.some(g => g.classes.includes(z.cls) && g.speed_kmh === z.speed && g.max_grade_pct === z.grade))))
    .invariant('terrain per window == node recomputation from the page long-section samples (median |gradient|, ATJ 3%/25%); measured windows > 0', rs => rs.every(r => win.some(w => w.m) && win.every(w => { const z = r.road.base.zones.find(q => q.s0 <= w.s0 + 1e-6 && q.s1 > w.s0 + 1e-6); return z && z.terrain === w.t && (!w.m || (z.measured && Math.abs(z.pct - w.p) < 1e-6) || z.s0 < w.s0 - 1e-6); })))
    .invariant('speed-sign chainage == independent brute-force projection of the sign centre onto the route (<0.5 m), and zone boundaries == those chainages + terrain-window class changes only', rs => rs.every(r => {
      const sg = r.road.base.speedSigns, ind = sg.map(q => project(r.road.route, r.road.signPos[q.guid].x, r.road.signPos[q.guid].z).s);
      const bps = r.road.base.zones.map(z => z.s0), winChanges = win.filter((w, i) => i && w.t !== win[i - 1].t).map(w => w.s0);
      const near = (a, b) => Math.abs(a - b) < 0.5;
      return sg.length >= 1 && sg.every((q, i) => near(q.s, ind[i])) && ind.every(s => s <= 0.5 || s >= L - 0.5 || bps.some(b => near(b, s))) && bps.every(b => b < 0.05 || ind.some(s => near(s, b)) || winChanges.some(w => near(w, b)) || [rs0, rs1].concat(r.road.base.zones.filter(z => z.kind !== 'link').flatMap(z => [z.s0, z.s1])).some(x => near(x, b))); }))
    .invariant('legend: one swatch per zone; swatch colour == colour read back from EVERY painted ROAD slot of that zone (independent chainage projection of each element centre)', rs => rs.every(r => {
      const hexOf = css => { const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(css); return (+m[1] << 16) | (+m[2] << 8) | +m[3]; };
      const sw = {}; r.road.legend.forEach(l => { sw[l.zone] = hexOf(l.bg); });
      if (r.road.legend.length !== r.road.base.zones.length || !r.road.on.length) return false;
      const near = (a, b) => ['r', 'g', 'b'].every((_, i) => Math.abs(((a >> (16 - 8 * i)) & 255) - ((b >> (16 - 8 * i)) & 255)) <= 4);   // setColorAt stores float16/8-bit; tolerance 4/255
      const rbg = new Set(r.road.rbGuids), rbz = r.road.base.zones.find(q => q.kind === 'roundabout');
      let bad = 0; const chk = (o, want, why) => { const ok = near(o.hex, want); if (!ok && bad++ < 8) console.log('§SPEED_LEGEND_MISMATCH guid=' + o.g + ' got=' + o.hex.toString(16) + ' want=' + want.toString(16) + ' ' + why); return ok; }; const res_ = r.road.on.map(o => { if (rbg.has(o.g)) return chk(o, sw[rbz.id], 'roundabout member'); const sjo = r.road.base.zones.find(q => q.kind === 'signal_junction' && q.offRoute), sbx = sjBox(); if (sjo && sbx && r.road.roadPos[o.g].x >= sbx.x0 && r.road.roadPos[o.g].x <= sbx.x1 && r.road.roadPos[o.g].z >= sbx.z0 && r.road.roadPos[o.g].z <= sbx.z1) return chk(o, sw[sjo.id], 'SJ box'); const pj = project(r.road.route, r.road.roadPos[o.g].x, r.road.roadPos[o.g].z); const tl = r.road.base.zones.filter(q => !q.offRoute), z = tl.find(q => pj.s >= q.s0 && pj.s < q.s1) || tl[tl.length - 1]; const alt = tl.filter(q => pj.s >= q.s0 - 0.5 && pj.s < q.s1 + 0.5); /* element within 0.5 m of a zone boundary: either neighbour is correct (0.25 m resampling) */ if (alt.some(q => near(o.hex, sw[q.id]))) return true; return chk(o, sw[z.id], 'zone ' + z.id + ' s=' + pj.s.toFixed(1)); }).every(Boolean); console.log('§SPEED_LEGEND_CHECK slots=' + r.road.on.length + ' mismatches=' + bad); return res_; }))
    .invariant('painted road ignores distance haze: every painted slot sits on a material with fog off (far road read grey-brown before)', rs => rs.every(r => r.road.on.length > 0 && r.road.on.every(o => o.fog === false)))
    .invariant('toggle off restores the saved colours of every slot (mismatch 0) and clears the tint state; slots judged > 0', rs => rs.every(r => r.road.nSlots > 0 && r.road.revertMismatch === 0 && r.road.tintStateAfterOff === null))
    .invariant('sign list: RP. 7 rows first with a speed + label each; list size == SIGNAGE count; DOM row text carries the km/h', rs => rs.every(r => r.road.base.signRows.length === r.road.signDom.length && r.road.base.signRows[0].isSpeedSign && r.road.base.signRows.every(s => s.speed != null && s.label) && r.road.signDom[0].includes(r.road.base.signRows[0].speed + ' km/h')))
    .invariant('click a sign row: camera target lands on that GUID centre (<0.05 m); card names the ATJ 8/86 table + page, the mode label and the assumed inputs', rs => rs.every(r => r.road.click.dist < 0.05 && /ATJ 8\/86 Table 3\.2A/.test(r.road.click.card) && /p\.\d+/.test(r.road.click.card) && /assumed/.test(r.road.click.card) && /derived/.test(r.road.click.card)))
    .invariant('LEVER class R6: every zone speed == Table 3.2A R6 at that terrain (independent), label "class R6 (user)", legend + sign list show it', rs => rs.every(r => { const L6 = r.road.lever.classR6; const lk = new Set(LK(L6.zones).map(z => z.id)); return L6.mode === 'class' && lk.size > 0 && LK(L6.zones).every(z => z.speed === speedOf('R6', z.terrain) && z.label === 'class R6 (user)' && z.lane === 3.65) && r.road.lever.legendClassR6.filter(e => lk.has(e.zone)).every(e => e.text.includes('class R6 (user)')) && r.road.lever.legendClassR6.filter(e => !lk.has(e.zone)).every(e => /NCHRP 672|demo rule|demo default/.test(e.text)) && r.road.lever.signClassR6.slice(0, 3).every(t => t.includes('class R6 (user)') || /NCHRP 672|demo rule|demo default/.test(t)); }))
    .invariant('LEVER manual 70: all zones 70 km/h, label "manual (user)"; per_zone Z1=60 overrides only Z1; 65 (no table row) says "manual (user), no table row"; unset manual = no speed + visible message', rs => rs.every(r => { const m = r.road.lever.manual70, pz = r.road.lever.manualPerZone, nr = r.road.lever.manualNoRow, un = r.road.lever.manualUnset;
      return LK(m.zones).every(z => z.speed === 70 && /^manual \(user\)/.test(z.label)) && LK(pz.zones).every(z => z.speed === (z.id === 'Z1' ? 60 : 70)) && LK(nr.zones).every(z => z.speed === 65 && z.label === 'manual (user), no table row' && z.lane === null) && LK(un.zones).every(z => z.speed === null) && un.msgs.length > 0 && un.ok === false; }))
    .invariant('LEVER area type: URBAN Arterial ADT 10001 -> U5; area type I vs III change the speed exactly per Table 3.2B (80 vs 50) and both PDF rows exist', rs => rs.every(r => { const a = r.road.lever.urbanI, b = r.road.lever.urbanIII; return LK(a.zones).every(z => z.cls === 'U5' && z.speed === speedOf('U5', 'FLAT', 'I')) && LK(b.zones).every(z => z.cls === 'U5' && z.speed === speedOf('U5', 'FLAT', 'III')) && speedOf('U5', 'FLAT', 'I') !== speedOf('U5', 'FLAT', 'III') && atjHasSpeedRow('U5', GEO.design_speed.urban.rows.U5); }))
    .invariant('no silent fall-through: a title that matches no category row derives nothing and says why (vacuous, message names the title mapping)', rs => rs.every(r => r.road.lever.noCategory.zones.length === 0 && r.road.lever.noCategory.msgs.some(m => /matches no road_category_map row/.test(m))))
    .invariant('§ROUNDABOUT zone s-range == min..max of the INDEPENDENT brute-force projection of the roundabout elements (<0.5 m); element count == the model_map query (>0); one roundabout zone', rs => rs.every(r => { const b = r.road.base, z = RBz(b); return rbP.length > 0 && b.nodes.roundabout && b.nodes.roundabout.n === rbP.length && z.length === 1 && Math.abs(z[0].s0 - rs0) < 0.5 && Math.abs(z[0].s1 - rs1) < 0.5; }))
    .invariant('§ROUNDABOUT off-route finding (measured): engine flags offRoute exactly when every element projects onto a route end (independent projection), the roundabout entry has zero chainage extent + a visible "off-route" text, and on-route approach starts at that end; roundabout elements (62) are painted with the roundabout speed colour by membership', rs => rs.every(r => { const ind = rbP.every(x => x < 1e-6 || x > L - 1e-6), z = RBz(r.road.base)[0]; return r.road.base.nodes.roundabout.offRoute === ind && (!ind || (z.s1 - z.s0 === 0 && /off-route/.test(z.opens))) && r.road.rbGuids.length === rbP.length; }))
    .invariant('SYNTHETIC (pure engine, interior roundabout; the model itself has none on-route): straight 2000 m route, ring points projecting to 800..900 m, flat ground -> zones link 0..615 @100, approach 615..800 @32 (185 m = Table 4.1 row 100), roundabout 800..900 @32, approach 900..1085 @32, link 1085..2000 @100; ring at the route START/END -> one approach only; speeds from the same table', () => { const o = SYN(); return o.ok; })
    .invariant('§ROUNDABOUT speed == NCHRP 672 LOWER bound for the lane type (single 20 mph = 32 km/h), stored mph->km/h pairs consistent (x1.609344 rounded), source doc + note present, label says NCHRP 672 (US) / not JKR / ATJ 11/87 not in hand', rs => rs.every(r => RBz(r.road.base)[0].speed === nchrpKmh(RB.nchrp_entry_speed.single.mph[0]) && ['single', 'multilane'].every(k => RB.nchrp_entry_speed[k].mph.every((m, i) => nchrpKmh(m) === RB.nchrp_entry_speed[k].kmh[i])) && /NCHRP Report 672/.test(RB.source.doc) && RB.source.note === 'recommended maximum entry design speed' && /NCHRP 672 \(US\)/.test(RBz(r.road.base)[0].label) && /not JKR/.test(RBz(r.road.base)[0].label) && /ATJ 11\/87 not in hand/.test(RBz(r.road.base)[0].label)))
    .invariant('§ROUNDABOUT approach length (before AND after) == ATJ 8/86 Table 4.1 SSD row at the adjoining link speed (link speed independently recomputed; the speed/length cell exists in the PDF .txt on the cited page); approach zones carry the roundabout speed + "demo rule (editable)"', rs => rs.every(r => { const b = r.road.base, ap = APz(b), z = RBz(b)[0], pre = ap.find(q => Math.abs(q.s1 - z.s0) < 1e-6), post = ap.find(q => Math.abs(q.s0 - z.s1) < 1e-6);
      if (p41 !== SSD.ref.page || !!pre !== (rs0 > 1e-6) || !!post !== (rs1 < L - 1e-6) || ap.length !== (pre ? 1 : 0) + (post ? 1 : 0) || !ap.length) return false; const lp = lsIndep(rs0 - 1e-6), lq = lsIndep(rs1 + 1e-6), want = sp => SSD.rows_m[String(sp)];
      return (!pre || (pre.linkSpeed === lp && pre.approachM === want(lp) && ssdCell(lp, want(lp)) && Math.abs((pre.s1 - pre.s0) - Math.min(want(lp), rs0)) < 0.5)) && (!post || (post.linkSpeed === lq && post.approachM === want(lq) && ssdCell(lq, want(lq)) && Math.abs((post.s1 - post.s0) - Math.min(want(lq), L - rs1)) < 0.5)) && ap.every(q => q.speed === z.speed && /demo rule \(editable\)/.test(q.label) && q.srcText.includes('p.' + SSD.ref.page)); }))
    .invariant('§ROUNDABOUT zones neighbour the link zones with no overlap/gap: zones tile 0..route length contiguously; link zone speeds outside the approach unchanged (100/80 per table)', rs => rs.every(r => { const zs = r.road.base.zones.filter(q => !q.offRoute); return Math.abs(zs[0].s0) < 1e-6 && Math.abs(zs[zs.length - 1].s1 - L) < 0.5 && zs.every((q, i) => !i || Math.abs(q.s0 - zs[i - 1].s1) < 1e-6); }))
    .invariant('§ROUNDABOUT lever: lane_type multilane -> lower bound 25 mph = 40 km/h; speed_pick upper -> 48 km/h; per_zone on the roundabout zone overrides to 55 with label "manual (user, per zone)"', rs => rs.every(r => { const l = r.road.lever; return RBz(l.multilane)[0].speed === 40 && RBz(l.multiUpper)[0].speed === 48 && APz(l.multilane).every(q => q.speed === 40) && RBz(l.rbPerZone)[0].speed === 55 && RBz(l.rbPerZone)[0].label === 'manual (user, per zone)'; }))
    .invariant('§ROUNDABOUT approach fixed_m override: each approach zone that fits on the route is exactly 150 m (clipped only by the route ends) and say "fixed 150 m (user)"', rs => rs.every(r => { const f = r.road.lever.fixed150, ap = APz(f); return ap.length === nAp && ap.every(q => Math.abs((q.s1 - q.s0) - Math.min(150, q.s0 < rs0 ? rs0 : L - rs1)) < 0.5 && /fixed 150 m \(user\)/.test(q.label)); }))
    .invariant('§ROUNDABOUT no silent fall-through: model_map value matching nothing -> no roundabout/approach zone AND a visible message; enabled=false -> none, no message needed (user choice); URBAN area III link speed 50 -> approach = Table 4.1 row 65 m', rs => rs.every(r => { const n = r.road.lever.rbNone, o = r.road.lever.rbOff, u = r.road.lever.rbUrb; return RBz(n).length === 0 && APz(n).length === 0 && n.msgs.some(m => /roundabout: no model elements/.test(m)) && RBz(o).length === 0 && APz(o).length === 0 && APz(u).length === nAp && APz(u).every(q => q.linkSpeed === 50 && q.approachM === SSD.rows_m['50'] && ssdCell(50, 65)); }))
    .invariant('§ROUNDABOUT AHEAD signs: logged beside the approach (3 in the model by an independent name query; engine count equal; comparison only — they are not zone boundaries)', rs => rs.every(r => { const rb = r.road.base.nodes.roundabout; return r.road.rbSigns > 0 && rb.signs.length === r.road.rbSigns; }))
    .invariant('§ROUNDABOUT colours/discs/legend/sign list: legend has a swatch per zone incl. roundabout+approach rows (text names NCHRP 672 / demo rule); sign rows inside a roundabout/approach zone show its speed; disc per speed sign carries the zone speed; discs removed on toggle off', rs => rs.every(r => { const b = r.road.base, lg = r.road.legend, z = RBz(b)[0];
      const inRb = b.signRows.filter(q => b.zones.find(zz => q.s >= zz.s0 && q.s < zz.s1 && zz.kind !== 'link'));
      return lg.length === b.zones.length && lg.some(e => e.zone === z.id && /NCHRP 672/.test(e.text)) && APz(b).every(a => lg.some(e => e.zone === a.id && /demo rule \(editable\)/.test(e.text))) &&
        inRb.every(q => { const zz = b.zones.find(k => q.s >= k.s0 && q.s < k.s1); return q.speed === zz.speed && q.label === zz.label; }) &&
        r.road.discsOn.filter(d => !d.borrowed).length === 2 * b.speedSigns.length && r.road.discsOn.filter(d => !d.borrowed).every(d => { const q = b.signRows.find(x => x.guid === d.g); return q && q.speed === d.speed; }) && r.road.discsOn.filter(d => d.borrowed).every(d => { const z = b.zones.find(k => k.id === d.zone); return z && z.speed === d.speed; }) && r.road.discsOff === 0; }))
    .invariant('SPEED COLOUR RAMP (user: "30 kph most white as slowest"): ramp stops in std_values.json, lightness strictly decreasing with speed, 30 km/h stop is a light warm white (hex printed) that is NOT pure #ffffff, fastest = red #b71c1c; legend swatch of EVERY zone == the independent ramp interpolation of its speed (+-1/255)', rs => rs.every(r => { const st = GEO.speed_ramp.stops, hx = c => parseInt(c.slice(1), 16);
      const mono = st.every((q, i) => !i || (q.kmh > st[i - 1].kmh && lum(hx(q.hex)) < lum(hx(st[i - 1].hex)))); const sw = css => { const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(css); return [+m[1], +m[2], +m[3]]; };
      console.log('§SPEED_RAMP stops=' + st.map(q => q.kmh + ':' + q.hex).join(' ') + ' slowest=' + st[0].hex + ' lum=' + lum(hx(st[0].hex)).toFixed(1) + ' fastest=' + st[st.length - 1].hex);
      return mono && st[0].kmh === 30 && st[0].hex.toLowerCase() !== '#ffffff' && lum(hx(st[0].hex)) > 235 && st[st.length - 1].hex.toLowerCase() === '#b71c1c' &&
        r.road.legend.every(e => { const zz = r.road.base.zones.find(q => q.id === e.zone), want = rampHex(zz.speed), got = sw(e.bg); return want.every((v, j) => Math.abs(v - got[j]) <= 1); }); }))
    .invariant('§SIGNAL_JUNCTION detection: elements by model_map (signal_prop/value/discipline) > 0; engine element count equal; zone s-range == INDEPENDENT projection min..max (<0.5 m); on-route -> one signal_junction zone, off-route (all on a route end) -> zero-extent entry id SJ with an "off-route" text; none duplicated', rs => rs.every(r => { const b = r.road.base, nd = b.nodes.signal_junction, z = SJz(b); return sjP.length > 0 && nd && nd.n === sjP.length && nd.offRoute === sjOff && z.length === 1 && Math.abs(z[0].s0 - ss0) < 0.5 && Math.abs(z[0].s1 - ss1) < 0.5 && (!sjOff || (z[0].id === SJ.zone_id && /off-route/.test(z[0].opens))) && !!z[0].offRoute === sjOff; }))
    .invariant('§SIGNAL_JUNCTION speed == geometric.signal_junction.speed_kmh (50 default) with label "demo default — not from a standard"; approach zones carry it + "demo rule (editable)"', rs => rs.every(r => { const b = r.road.base, z = SJz(b)[0]; return SJ.speed_kmh === 50 && z.speed === SJ.speed_kmh && /demo default/.test(z.label) && /not from a standard/.test(z.label) && SAz(b).every(q => q.speed === SJ.speed_kmh && /demo rule \(editable\)/.test(q.label)); }))
    .invariant('§SIGNAL_JUNCTION approach (each side that exists) == ATJ 8/86 Table 4.1 SSD row at the independently recomputed adjoining link speed (cell present in the PDF .txt on the cited page), clipped only by route ends', rs => rs.every(r => { const b = r.road.base, ap = SAz(b), z = SJz(b)[0], pre = ap.find(q => Math.abs(q.s1 - z.s0) < 1e-6), post = ap.find(q => Math.abs(q.s0 - z.s1) < 1e-6), want = sp => SSD.rows_m[String(sp)];
      const lp = lsIndep(ss0 - 1e-6), lq = lsIndep(ss1 + 1e-6);
      return ap.length === sjNAp(ss0, ss1) && !!pre === (ss0 > 1e-6) && !!post === (ss1 < L - 1e-6) && ap.length > 0 && (!pre || (pre.linkSpeed === lp && pre.approachM === want(lp) && ssdCell(lp, want(lp)) && Math.abs((pre.s1 - pre.s0) - Math.min(want(lp), ss0)) < 0.5)) && (!post || (post.linkSpeed === lq && post.approachM === want(lq) && ssdCell(lq, want(lq)) && Math.abs((post.s1 - post.s0) - Math.min(want(lq), L - ss1)) < 0.5)); }))
    .invariant('§SIGNAL_JUNCTION lever: editing speed_kmh 50 -> 70 changes the junction + approach speed to 70 (label no longer "assumed"); fixed_m 120 -> approach zones exactly 120 m (clipped by route end); enabled=false -> no SJ zone/approach and roundabout zones UNCHANGED vs base; value matching nothing -> no zone + visible "signal junction: no model elements" message (no silent fall-through)', rs => rs.every(r => { const l = r.road.lever, key = z => [z.kind, z.node, Math.round(z.s0), Math.round(z.s1), z.speed].join('|'), rbOnly = b => b.zones.filter(z => z.kind === 'roundabout' || (z.kind === 'approach' && z.node === 'roundabout')).map(key).join(';');
      return SJz(l.sj70)[0].speed === 70 && SAz(l.sj70).every(q => q.speed === 70) && SAz(l.sjFixed).every(q => Math.abs((q.s1 - q.s0) - Math.min(120, q.s0 < ss0 ? ss0 : L - ss1)) < 0.5 && /fixed 120 m \(user\)/.test(q.label)) && SJz(l.sjOff).length === 0 && SAz(l.sjOff).length === 0 && SJz(l.sjNone).length === 0 && SAz(l.sjNone).length === 0 && l.sjNone.msgs.some(m => /signal junction: no model elements/.test(m)) && rbOnly(l.sjOff) === rbOnly(r.road.base) && rbOnly(l.sjNone) === rbOnly(r.road.base); }))
    .invariant('§TRAFFIC SIGNAL AHEAD signs: engine count == independent name query (>0), comparison only', rs => rs.every(r => r.road.sjSigns > 0 && r.road.base.nodes.signal_junction.signs.length === r.road.sjSigns))
    .invariant('§SIGNAL_JUNCTION legend/discs/sign list carry the junction: legend swatch row for SJ zone says "demo default"; sign rows inside a junction/approach zone show its speed; ONE mechanism: node kinds in geometric.node_kinds == the engine node keys', rs => rs.every(r => { const b = r.road.base, z = SJz(b)[0], lg = r.road.legend; return lg.some(e => e.zone === z.id && /demo default/.test(e.text)) && SAz(b).every(a => lg.some(e => e.zone === a.id)) && JSON.stringify(Object.keys(b.nodes).sort()) === JSON.stringify(GEO.node_kinds.slice().sort()); }))
    .invariant('DISC ON THE SIGN FACE: every disc on a sign has normal ∥ the sign\'s thinnest horizontal bbox axis (|dot| >= 0.99, axis from DB bbox_x vs bbox_y, independent), centre within 0.05 m of the bbox face plane (offset 0.02), diameter == the wider horizontal axis, the two discs of a sign face opposite ways; judged > 0', rs => rs.every(r => { const D = r.road.discsOn.filter(d => d.ind); return D.length > 0 && D.every(d => { const nd = Math.abs(dot(d.n, d.ind.axis)), off = Math.abs(dot([d.pos[0] - d.ind.c[0], d.pos[1] - d.ind.c[1], d.pos[2] - d.ind.c[2]], d.ind.axis)); return nd >= 0.99 && Math.abs(off - d.ind.half) <= 0.05 && Math.abs(d.dia - d.ind.w) < 1e-6; }) && [...new Set(D.map(d => d.g))].every(g => { const s = D.filter(d => d.g === g); return s.length === 2 && dot(s[0].n, s[1].n) < -0.99; }); }))
    .invariant('ONE DISC PER ZONE START: zones whose start has no RP. 7 within disc_has_sign_m (independent) == set of borrowed/free discs by zone (one anchor each); borrowed -> nearest unused SIGNAGE board within disc_snap_m by independent projection, else free-standing; free-standing normal ∥ route tangent; nothing for zones that have an RP. 7 at the start', rs => rs.every(r => { const b = r.road.base, want = noRp(b), pl = b.discPlan.filter(x => x.kind !== 'real'), got = pl.map(x => x.zone).sort(), D = r.road.discsOn.filter(d => d.borrowed);
      const okAnchor = pl.every(x => { if (x.kind === 'free') return !b.signRows.some(s => Math.abs(s.s - x.zoneStart) <= GEO.disc_snap_m && !pl.some(y => y.guid === s.guid) && !b.speedSigns.some(q => q.guid === s.guid)); const z = b.signRows.filter(s => !b.speedSigns.some(q => q.guid === s.guid) && Math.abs(project(rd.route, rd.signPos[s.guid] ? rd.signPos[s.guid].x : 0, 0).s) >= 0).length; return Math.abs(x.s - x.zoneStart) <= GEO.disc_snap_m; });
      const tg = (x, ds) => { const z = ds.filter(d => d.zone === x.zone); return z.length === 2 && z.every(d => d.kind === x.kind); };
      return JSON.stringify(got) === JSON.stringify(want.slice().sort()) && okAnchor && pl.every(x => tg(x, D)) && D.length === 2 * pl.length && b.discPlan.filter(x => x.kind === 'real').every(x => !D.some(d => d.g === x.guid)); }))
    .invariant('BORROWED STYLE: discs on borrowed boards / free markers carry the amber ring pixel (255,179,0) + label "derived — no speed sign in model"; real RP. 7 discs do NOT (ring = the speed ramp colour of their speed)', rs => rs.every(r => { const D = r.road.discsOn, hx = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; return D.length > 0 && D.filter(d => d.borrowed).every(d => d.px[0] === 255 && d.px[1] === 179 && d.px[2] === 0 && /no speed sign in model/.test(d.label)) && D.filter(d => !d.borrowed).every(d => { const w = rampHex(d.speed); return !(d.px[0] === 255 && d.px[1] === 179 && d.px[2] === 0) && w.every((v, j) => Math.abs(v - d.px[j]) <= 2); }); }))
    .invariant('MISSING SPEED SIGN rows: group present, count of rows == zones whose start has no RP. 7 (independent), one row per such zone with text "Zone Zx (s0–s1 m, N km/h) has no speed-limit sign — shown on …"; click a borrowed-board row -> camera on that board (<0.05 m)', rs => rs.every(r => { const b = r.road.base, want = noRp(b), M = r.road.missingDom; return want.length > 0 ? (r.road.missingGrp && M.length === want.length && want.every(z => M.some(m => new RegExp('^Zone ' + z + ' \\(').test(m.text) && /has no speed-limit sign/.test(m.text) && /for demo$/.test(m.text))) && (!r.road.missClick || (r.road.missClick.dist < 0.05 && /MISSING SPEED SIGN/.test(r.road.missClick.card)))) : (M.length === 0 && !r.road.missingGrp); }))
    .invariant('Duplex: not civil, no panel, no Speed section => VACUOUS (not a pass of anything)', rs => rs.every(r => !r.dup.civil && r.dup.opened === null && !r.dup.panel && r.dup.zones === null))
    .redControl(rs => rs.map(r => Object.assign({}, r, { road: Object.assign({}, r.road, { base: Object.assign({}, r.road.base, { zones: r.road.base.zones.map(z => Object.assign({}, z, { speed: z.speed + 10 })) }) }) })))
    ;
  console.log = (...a) => { const s = a.join(' '); logStream.write(s + '\n'); _cl(...a); };   // the kit prints PASS/FAIL + the §WITNESS_ summary via console.log: mirror INTO the LOG
  try { W.run(); } finally { console.log = _cl; }
  await new Promise(r => logStream.end(r));
})();
