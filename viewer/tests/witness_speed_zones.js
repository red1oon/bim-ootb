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
// §SIGN_VS_SPEED (2026-10-08): (10) advance-placement distances (ATJ 2B cl.2.2.8) == the .txt sentence + independent along-route recompute of every WD.22/WD.31
// sign vs its hazard; list holds only rule-applicable signs; levers flip verdicts; size-vs-speed recorded as NOT built with the speed-banded tables found;
// §LABEL_CLEAN: legend/sign rows are one line + a short tag (derived|demo|NCHRP 672|user), full provenance in the tooltip + HUD card.
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
const ATJ2B_TXT = process.env.ATJ2B_TXT || path.join(BLD_DIR, 'standards', 'ATJ_2B-85_Pindaan2019_SignApplication.txt');
const ATJ2A_TXT = process.env.ATJ2A_TXT || path.join(BLD_DIR, 'standards', 'ATJ_2A-85_Pindaan2019_StandardTrafficSigns.txt');
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
  page.on('console', m => { const t = m.text(); logStream.write('[con:' + bld + '] ' + t + '\n'); if (/§SIGN_SIZE_SPEED NOT_BUILT status=no_rule_for_model/.test(t)) global.__sizeLog = true; if (/§(SPEED|SIGN_ADVANCE|SIGN_SIZE|SIGN_CHECK_PANEL|ZOOM_MISS|PROFILE_LENS_PRECOMPUTE)/.test(t)) console.log('  [' + bld + '] ' + t.slice(0, 260)); });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${bld}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 25 * 60 * 1000, polling: 1000 });
  return page;
}
// open the panel with an optional std override; wait until the Speed section has been derived
const OPEN_FN = `window.__openSZ = async (ov) => {
  const A = window.APP; localStorage.removeItem('json_std_values');
  if (ov) { const std = await (await fetch('std_values.json?v=2')).json(); ov(std); localStorage.setItem('json_std_values', JSON.stringify(std)); }
  A._speedZones = null; await A.showRoadStandards();
  for (let i = 0; i < 400 && !A._speedZones; i++) await new Promise(r => setTimeout(r, 100));
  localStorage.removeItem('json_std_values'); return A._speedZones;
};`;
const SUM = `(r) => r && ({ tw: (r.terrainWindows || []).map(w => !!w.measured), mode: r.mode, ok: r.ok, msgs: r.msgs, assumed: r.assumed, zones: r.zones.map(z => ({ id: z.id, s0: z.s0, s1: z.s1, opens: z.opens, kind: z.kind, node: z.node, offRoute: z.offRoute, srcText: z.srcText, approachM: z.approachM, linkSpeed: z.linkSpeed, terrain: z.terrain, measured: z.terrainMeasured, pct: z.terrainPct, cls: z.cls, speed: z.speed, label: z.label, tag: z.tag, lane: z.lane && z.lane.m, grade: z.grade && z.grade.pct, gradeRef: z.grade && z.grade.ref, speedRef: z.speedRef && { table: z.speedRef.table, page: z.speedRef.page }, notes: z.notes })),
  speedSigns: r.speedSigns, nodes: Object.fromEntries(Object.entries(r.nodes || {}).map(([k, v]) => [k, Object.assign({}, v, { guids: undefined, zone: undefined })])), discPlan: r.discPlan, missingRows: r.missingRows, signRows: r.signRows.map(s => ({ guid: s.guid, code: s.code, s: s.s, speed: s.speed, label: s.label, tag: s.tag, zone: s.zone, isSpeedSign: s.isSpeedSign })), advance: r.advance })`;

async function roadProbe(page) {
  return page.evaluate(async (OPEN, SUMSRC) => {
    const A = window.APP, out = { civil: A.isCivilModel() }, sum = eval(SUMSRC);
    // base (derived) run
    const r0 = await window.__openSZ(null); out.base = sum(r0);
    // §CHAINAGE_EVERYWHERE: the legend's range text must be the one label owner's (its value is proven in witness_chainage_grid)
    out.chainReal = !!(A.civilChainReal && A.civilChainReal()); out.rangeOf = {}; r0.zones.forEach(z => { out.rangeOf[z.id] = A.civilChainRange(z.s0, z.s1); });
    const P = A.civilProfile(); out.prof = { ds: P.ds, n: P.n, ground: Array.from(P.ground), road: Array.from(P.road) };
    out.route = A.civilDriveRoute().map(p => ({ x: p.x, z: p.z }));
    out.title = A.dbQuery("SELECT value FROM element_psets WHERE name='01_Project_Title' LIMIT 1")[0][0];
    // legend swatches + sign rows from the DOM
    const pan = document.getElementById('road-standards-panel');
    out.signPos = {}; (r0.signRows || []).filter(q => q.isSpeedSign).forEach(q => { const c = A.dbQuery('SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?', [q.guid])[0], p = A.ifc2three(c[0], c[1], c[2]); out.signPos[q.guid] = { x: p.x, z: p.z }; });
    out.legend = [...pan.querySelectorAll('.sz-leg')].map(e => ({ zone: e.dataset.zone, bg: e.querySelector('.sz-sw').style.backgroundColor, text: e.title + ' | ' + e.textContent, short: e.textContent, title: e.title, lines: e.getClientRects().length, html: e.innerHTML }));
    out.signDom = [...pan.querySelectorAll('.sz-row')].map(e => e.textContent); out.signTitles = [...pan.querySelectorAll('.sz-row')].map(e => e.title);
    // §SIGN_VS_SPEED probe: SIGNAGE codes + centres by the witness's own query; the DOM group; click a CHECK row; legend click; size note
    { const MM2 = JSON.parse(await (await fetch('std_values.json?v=2')).text());
      const q = A.dbQuery("SELECT m.guid, t.center_x, t.center_y, t.center_z, (SELECT value FROM element_psets p WHERE p.guid = m.guid AND p.name = ? LIMIT 1) FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.discipline = ?", [MM2._model_map.code_prop, MM2._model_map.discipline]);
      out.advSigns = q.map(r => { const p = A.ifc2three(r[1], r[2], r[3]); return { guid: r[0], code: r[4], x: p.x, z: p.z }; });
      out.advDom = [...pan.querySelectorAll('.sz-adv')].map(e => ({ guid: e.dataset.guid, text: e.textContent, title: e.title, verdict: e.closest('details').dataset.verdict }));
      out.advGroups = [...pan.querySelectorAll('.sz-adv-v')].map(e => ({ verdict: e.dataset.verdict, n: e.querySelectorAll('.sz-adv').length, summary: e.querySelector('summary').textContent }));
      out.advHeader = (pan.querySelector('.sz-adv-grp') || {}).firstElementChild ? pan.querySelector('.sz-adv-grp').firstElementChild.textContent : null;
      const sn = pan.querySelector('.sz-sizenote'); out.sizeNote = sn ? { text: sn.textContent, title: sn.title } : null;
      const ck = pan.querySelector('.sz-adv-v[data-verdict="CHECK"] .sz-adv') || pan.querySelector('.sz-adv-v[data-verdict="OK"] .sz-adv');
      if (ck) { const g = ck.dataset.guid; if (A.loadNavigate && typeof A.focusElement !== 'function') await A.loadNavigate(); ck.click(); const rr = A.dbQuery('SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?', [g])[0], w = A.ifc2three(rr[0], rr[1], rr[2]);
        for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 250)); const t = A.controls.target; if (Math.hypot(w.x - t.x, w.y - t.y, w.z - t.z) < 0.05) break; }
        const t = A.controls.target; out.advClick = { guid: g, dist: Math.hypot(w.x - t.x, w.y - t.y, w.z - t.z), card: pan.querySelector('.rs-card').textContent }; }
      const sjz = out.base.zones.find(z => z.kind === 'signal_junction'); const sjLeg = [...pan.querySelectorAll('.sz-leg')].find(e => sjz && e.dataset.zone === sjz.id);
      if (sjLeg) { sjLeg.click(); out.legClick = { zone: sjLeg.dataset.zone, card: pan.querySelector('.rs-card').textContent, struct: { title: (pan.querySelector('.rs-card .sz-card-title') || {}).textContent, kv: [...pan.querySelectorAll('.rs-card .sz-kv')].length, whyOpen: (pan.querySelector('.rs-card details.sz-why') || {}).open } }; } }
    // §HUD_LAYOUT probe (whole upper panel): titles, collapsed Why/sources, no long visible paragraph, sign-check card layout
    { const rr = pan.querySelector('.rs-row'); if (rr) { rr.click(); }
      const c = pan.querySelector('.rs-card'), vis = e => e.getClientRects().length > 0 && !(e.closest('details:not([open])') && !e.closest('summary')), lines = e => { const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight) || fs * 1.2; return e.getBoundingClientRect().height / lh; };
      const own = [...pan.querySelectorAll('*')].filter(e => vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 0));
      out.layout = { rsTitle: (pan.querySelector('.rs-title') || {}).textContent || null, szTitle: (pan.querySelector('.sz-title') || {}).textContent || null,
        long: own.filter(e => lines(e) > 3.1).map(e => ({ cls: e.className, lines: +lines(e).toFixed(1), text: e.textContent.slice(0, 60) })), nVisibleText: own.length,
        whyTop: [...pan.querySelectorAll('details.rs-why-top, details.sz-why-top')].map(d => ({ cls: d.className, open: d.open, text: d.textContent })),
        szKv: [...pan.querySelectorAll('.sz-section > .sz-body > .sz-kv')].map(e => e.textContent),
        card: c ? { title: (c.querySelector('.rs-card-title') || {}).textContent || null, kv: c.querySelectorAll('.rs-kv').length, whyOpen: (c.querySelector('details.rs-why') || {}).open, whyText: (c.querySelector('details.rs-why') || {}).textContent || '', maxW: c.firstElementChild ? parseFloat(getComputedStyle(c.firstElementChild).maxWidth) : null } : null,
        panelW: pan.getBoundingClientRect().width }; }
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
    const MM = JSON.parse(await (await fetch('std_values.json?v=2')).text()).geometric.model_map;
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
      // §DISC_ON_FACE (independent of the viewer code): the board's REAL face from its world triangles — area-weighted folded horizontal
      //   normal, extreme planes along it, height range. (The old check used the world-axis bbox, which itself was the bug.)
      if (u.discKind !== 'free') { const T = [], m4 = new THREE.Matrix4(), v = new THREE.Vector3();
        const add = (g, M) => { const P = g.attributes.position, I = g.index, n = I ? I.count : P.count; for (let k = 0; k + 2 < n; k += 3) { const t = []; for (let j = 0; j < 3; j++) { v.fromBufferAttribute(P, I ? I.getX(k + j) : k + j).applyMatrix4(M); t.push([v.x, v.y, v.z]); } T.push(t); } };
        A.collectMeshes(m => m.isMesh).forEach(m => {
          if (m.isBatchedMesh && A._batchMeta && A._batchMeta[m.id]) A._batchMeta[m.id].forEach(mm => { if (mm.guid !== u.speedDisc) return; const g = m.userData.slotGeo && m.userData.slotGeo[mm.slotId]; if (!g) return; m.getMatrixAt(mm.slotId, m4); add(g, m4.clone().premultiply(m.matrixWorld)); });
          else if (m.isInstancedMesh && A._instanceMeta && A._instanceMeta[m.id]) A._instanceMeta[m.id].forEach((mm, k) => { if (mm.guid !== u.speedDisc) return; m.getMatrixAt(k, m4); add(m.geometry, m4.clone().premultiply(m.matrixWorld)); }); });
        let sx = 0, sz = 0, y0 = Infinity, y1 = -Infinity; T.forEach(t => { const e1 = t[1].map((a, k) => a - t[0][k]), e2 = t[2].map((a, k) => a - t[0][k]); let nx = e1[1] * e2[2] - e1[2] * e2[1], nz = e1[0] * e2[1] - e1[1] * e2[0]; if (nx < 0 || (nx === 0 && nz < 0)) { nx = -nx; nz = -nz; } const a = Math.hypot(nx, nz); sx += nx * a; sz += nz * a; t.forEach(q => { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }); });
        const L = Math.hypot(sx, sz), N = [sx / L, 0, sz / L]; let d0 = Infinity, d1 = -Infinity; T.forEach(t => t.forEach(q => { const d = q[0] * N[0] + q[2] * N[2]; d0 = Math.min(d0, d); d1 = Math.max(d1, d); }));
        const Tg = [-N[2], N[0]]; let u0 = Infinity, u1 = -Infinity; T.forEach(t => t.forEach(q => { const u = q[0] * Tg[0] + q[2] * Tg[1]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); }));
        ind = { tris: T.length, axis: N, d0, d1, y0, y1, wAll: u1 - u0 }; }
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
    out.click = { guid: g, dist: Math.hypot(want.x - t.x, want.y - t.y, want.z - t.z), card: pan.querySelector('.rs-card').textContent, rowText: el.textContent, struct: ((c) => ({ title: (c.querySelector('.sz-card-title') || {}).textContent || null, titleFont: c.querySelector('.sz-card-title') ? parseFloat(getComputedStyle(c.querySelector('.sz-card-title')).fontSize) : 0, kv: [...c.querySelectorAll('.sz-kv')].map(e => e.textContent), why: c.querySelector('details.sz-why') ? { open: c.querySelector('details.sz-why').open, text: c.querySelector('details.sz-why').textContent, fontMin: Math.min(...[...c.querySelectorAll('.sz-kv')].map(e => parseFloat(getComputedStyle(e).fontSize))) } : null, maxW: c.firstElementChild ? parseFloat(getComputedStyle(c.firstElementChild).maxWidth) : null }))(pan.querySelector('.rs-card')) };
    tg.checked = false; tg.dispatchEvent(new Event('change'));
    tg.checked = true; tg.dispatchEvent(new Event('change'));
    { const me = pan.querySelector('.sz-missing[data-guid]:not([data-guid=""])'); if (me) { const mg = me.dataset.guid; me.click(); const mr = A.dbQuery('SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?', [mg])[0], mw = A.ifc2three(mr[0], mr[1], mr[2]);
      for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 250)); const tt = A.controls.target; if (Math.hypot(mw.x - tt.x, mw.y - tt.y, mw.z - tt.z) < 0.05) break; }
      const tt = A.controls.target; out.missClick = { guid: mg, dist: Math.hypot(mw.x - tt.x, mw.y - tt.y, mw.z - tt.z), card: pan.querySelector('.rs-card').textContent }; } }
    tg.checked = false; tg.dispatchEvent(new Event('change'));
    // lever runs (each through the real Settings override path)
    out.lever = {};
    out.lever.classR6 = sum(await window.__openSZ(s => { s.geometric.speed_setting.mode = 'class'; s.geometric.speed_setting['class'] = 'R6'; }));
    out.lever.legendClassR6 = [...document.querySelectorAll('#road-standards-panel .sz-leg')].map(e => ({ zone: e.dataset.zone, text: e.title + ' | ' + e.textContent, short: e.textContent }));
    out.lever.signClassR6 = [...document.querySelectorAll('#road-standards-panel .sz-row')].map(e => e.title + ' | ' + e.textContent);
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
    out.lever.advMin30 = sum(await window.__openSZ(s => { if (s.advance_placement) s.advance_placement.clause_2_2_8.rural_or_high_speed.min_m = 30; }));
    out.lever.advMin50 = sum(await window.__openSZ(s => { if (s.advance_placement) s.advance_placement.clause_2_2_8.rural_or_high_speed.min_m = 50; }));
    out.lever.advNoRules = sum(await window.__openSZ(s => { if (s.advance_placement) s.advance_placement.rules = []; }));
    out.lever.advNoSJ = sum(await window.__openSZ(s => { s.geometric.model_map.signal_value = 'NO-SUCH-VALUE'; }));
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
  log('§SIGN_ADVANCE_UI ' + JSON.stringify({ dom: rd.advDom, groups: rd.advGroups, header: rd.advHeader, size: rd.sizeNote, click: rd.advClick, legClick: rd.legClick }).slice(0, 5000));
  rd.prof.ground = rd.prof.ground.map(v => v == null ? NaN : v); rd.prof.road = rd.prof.road.map(v => v == null ? NaN : v);
  if (!B || !B.zones || !B.zones.length) { log('§SPEED_ZONES verdict=INCONCLUSIVE reason=no zones derived on road'); process.exitCode = 2; logStream.end(); return; }
  if (!STD.advance_placement || !GEO.zone_tags || !GEO.signal_junction || !GEO.node_kinds || !B.zones.some(z => z.kind === 'signal_junction') || !GEO.roundabout || !GEO.stopping_sight_distance || !GEO.speed_ramp || !B.zones.some(z => z.kind === 'roundabout') ) {
    log('§WITNESS_SPEED_ZONES verdict=RED reason=§SIGN_VS_SPEED/§SIGNAL_JUNCTION_ZONE/§ROUNDABOUT_ZONE feature absent on this tree (advance_placement=' + !!STD.advance_placement + ' zone_tags=' + !!GEO.zone_tags + ' signal_junction=' + !!GEO.signal_junction + ' node_kinds=' + !!GEO.node_kinds + ' roundabout=' + !!GEO.roundabout + ' ssd=' + !!GEO.stopping_sight_distance + ' ramp=' + !!GEO.speed_ramp + ' zoneKinds=' + [...new Set(B.zones.map(z => z.kind))].join(',') + ')'); process.exitCode = 1; logStream.end(); return; }
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
  // §SIGN_VS_SPEED pure-engine synthetic: straight 2000 m route, signal junction at 1000..1030 (interior), WD.22 signs at known chainages
  function SYN2() {
    const SZ = require(path.join(ROOT, 'viewer', 'speed_zones.js')), std = JSON.parse(JSON.stringify(STD)), near = (a, b) => Math.abs(a - b) < 0.01;
    const route = []; for (let x = 0; x <= 2000; x += 100) route.push({ x, z: 0 });
    const prof = { ds: 1, ground: new Array(2001).fill(0).map((_, i) => i * 0.01), road: new Array(2001).fill(0) };
    const sg = (guid, code, x) => ({ guid, code, name: code, x, z: 5 });
    const signs = [sg('a', 'WD. 22', 800), sg('b', 'WD. 22', 900), sg('c', 'WD. 22', 1100), sg('d', 'WD. 22', 1015), sg('e', 'WD. 22', 0), sg('f', 'WD. 31', 700), sg('g', 'RP. 7', 300), sg('h', 'WD. 23 & WD. 22', 850)];
    const nodes = { roundabout: [], signal_junction: [{ guid: 'j1', x: 1000, z: 20 }, { guid: 'j2', x: 1030, z: -20 }] };
    const R = SZ.derive(std, { title: 'JALAN (FT240)', route, profile: prof, signs, nodes }, { log: l => logStream.write('[syn2] ' + l + '\n') });
    const rows = R.advance.rows, by = g => rows.find(r => r.guid === g);
    const want = { a: ['OK', 200], b: ['CHECK', 100], c: ['CHECK', 70], d: ['CHECK', 0], e: ['NOT_JUDGED', null], f: ['NOT_JUDGED', null], h: ['CHECK', 150] };
    const rural = Object.keys(want).every(g => { const r = by(g); return r && r.verdict === want[g][0] && (want[g][1] == null ? r.dist == null : near(r.dist, want[g][1])); }) && !by('g') && R.advance.applicable === 7 && R.advance.column === 'rural_or_high_speed' && by('a').why.includes('below nominal') && /clamped/.test(by('e').why) && /no roundabout derived/.test(by('f').why);
    const U = SZ.advanceCheck(std, R, SZ.routeLength(route), 'URBAN', () => {});
    const urban = U.column === 'urban' && U.rows.find(r => r.guid === 'h').verdict === 'OK' && U.rows.find(r => r.guid === 'b').verdict === 'CHECK' && U.rows.find(r => r.guid === 'a').verdict === 'OK';
    const e = JSON.parse(JSON.stringify(std)); e.advance_placement.rules = []; const E = SZ.advanceCheck(e, R, 2000, 'RURAL', () => {});
    const n = JSON.parse(JSON.stringify(std)); delete n.advance_placement; const N = SZ.advanceCheck(n, R, 2000, 'RURAL', () => {});
    console.log('§SIGN_ADVANCE_SYNTH rural=' + rural + ' urban=' + urban + ' noRules.vacuous=' + E.vacuous + ' noData.vacuous=' + N.vacuous + ' counts=' + JSON.stringify(R.advance.counts));
    return { ok: rural && urban && E.vacuous && N.vacuous };
  }
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
    .invariant('sign list (§SPEED_SIGN_LIST): only the signs carrying a speed disc — row count == distinct disc-bearing sign GUIDs in discPlan (real + borrowed, independent), RP. 7 rows first, each row carries its km/h, borrowed rows say "(borrowed)"', rs => rs.every(r => { const b = r.road.base, g = [...new Set((b.discPlan || []).filter(x => x.guid && x.kind !== 'free').map(x => x.guid))], dom = r.road.signDom; return dom.length === g.length && g.length > 0 && /km\/h/.test(dom[0]) && b.speedSigns.every((q, k) => dom[k] && dom[k].indexOf('(borrowed)') < 0) && dom.slice(b.speedSigns.length).every(t => t.indexOf('(borrowed)') >= 0); }))
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
    .invariant('DISC ON THE SIGN FACE (mesh, independent): every disc on a sign has normal ∥ the board\'s real face normal from its triangles (|dot| >= 0.99), sits within 0.10 m of the element\'s extreme plane on its side (painted on, not floating), its top within the element\'s height (no disc above the board), the two discs of a sign face opposite ways; judged > 0', rs => rs.every(r => { const D = r.road.discsOn.filter(d => d.ind && d.ind.tris > 0); return D.length > 0 && D.every(d => { const nd = dot(d.n, d.ind.axis), dd = d.pos[0] * d.ind.axis[0] + d.pos[2] * d.ind.axis[2], plane = nd > 0 ? d.ind.d1 : d.ind.d0; return Math.abs(nd) >= 0.99 && Math.abs(dd - plane) <= 0.10 && d.pos[1] + d.dia / 2 <= d.ind.y1 + 0.01 && d.pos[1] - d.dia / 2 >= d.ind.y0 - 0.01; }) && [...new Set(D.map(d => d.g))].every(g => { const s = D.filter(d => d.g === g); return s.length === 2 && dot(s[0].n, s[1].n) < -0.99; }); }))
    .invariant('DISC SIZE (§DISC_TOP_BOARD): every disc on a board is at least 25% of that element\'s width along its face and at least 0.2 m — a disc on a thin cap/edge strip (0.03–0.09 m seen) fails', rs => rs.every(r => { const D = r.road.discsOn.filter(d => d.ind && d.ind.tris > 0); return D.length > 0 && D.every(d => d.dia >= 0.2 && d.dia >= 0.25 * (d.ind.wAll || 0)); }))
    .invariant('§PROFILE_AFTER_LOAD: the long section was sampled after loading — at least 3 of the terrain windows are measured (a too-early sample left 5 of 5 unmeasured and lost the 80 km/h zone)', rs => rs.every(r => (r.road.base.tw || []).filter(Boolean).length >= 3))
    .invariant('ONE DISC PER ZONE START: zones whose start has no RP. 7 within disc_has_sign_m (independent) == set of borrowed/free discs by zone (one anchor each); borrowed -> nearest unused SIGNAGE board within disc_snap_m by independent projection, else free-standing; free-standing normal ∥ route tangent; nothing for zones that have an RP. 7 at the start', rs => rs.every(r => { const b = r.road.base, want = noRp(b), pl = b.discPlan.filter(x => x.kind !== 'real'), got = pl.map(x => x.zone).sort(), D = r.road.discsOn.filter(d => d.borrowed);
      const okAnchor = pl.every(x => { if (x.kind === 'free') return !b.signRows.some(s => Math.abs(s.s - x.zoneStart) <= GEO.disc_snap_m && !pl.some(y => y.guid === s.guid) && !b.speedSigns.some(q => q.guid === s.guid)); const z = b.signRows.filter(s => !b.speedSigns.some(q => q.guid === s.guid) && Math.abs(project(rd.route, rd.signPos[s.guid] ? rd.signPos[s.guid].x : 0, 0).s) >= 0).length; return Math.abs(x.s - x.zoneStart) <= GEO.disc_snap_m; });
      const tg = (x, ds) => { const z = ds.filter(d => d.zone === x.zone); return z.length === 2 && z.every(d => d.kind === x.kind); };
      return JSON.stringify(got) === JSON.stringify(want.slice().sort()) && okAnchor && pl.every(x => tg(x, D)) && D.length === 2 * pl.length && b.discPlan.filter(x => x.kind === 'real').every(x => !D.some(d => d.g === x.guid)); }))
    .invariant('BORROWED STYLE: discs on borrowed boards / free markers carry the amber ring pixel (255,179,0) + label "derived — no speed sign in model"; real RP. 7 discs do NOT (ring = the speed ramp colour of their speed)', rs => rs.every(r => { const D = r.road.discsOn, hx = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; return D.length > 0 && D.filter(d => d.borrowed).every(d => d.px[0] === 255 && d.px[1] === 179 && d.px[2] === 0 && /no speed sign in model/.test(d.label)) && D.filter(d => !d.borrowed).every(d => { const w = rampHex(d.speed); return !(d.px[0] === 255 && d.px[1] === 179 && d.px[2] === 0) && w.every((v, j) => Math.abs(v - d.px[j]) <= 2); }); }))
    .invariant('MISSING SPEED SIGN rows: group present, count of rows == zones whose start has no RP. 7 (independent), one row per such zone with text "Zone Zx (s0–s1 m, N km/h) has no speed-limit sign — shown on …"; click a borrowed-board row -> camera on that board (<0.05 m)', rs => rs.every(r => { const b = r.road.base, want = noRp(b), M = r.road.missingDom; return want.length > 0 ? (r.road.missingGrp && M.length === want.length && want.every(z => M.some(m => new RegExp('^Zone ' + z + ' \\(').test(m.text) && /has no speed-limit sign/.test(m.text) && /for demo$/.test(m.text))) && (!r.road.missClick || (r.road.missClick.dist < 0.05 && /MISSING SPEED SIGN/.test(r.road.missClick.card)))) : (M.length === 0 && !r.road.missingGrp); }))
    .invariant('§SIGN_VS_SPEED extraction (issue: are the advance distances typed from memory?): the shipped advance_placement distances (urban nominal/min, rural nominal/min) are the numbers in the clause 2.2.8 sentence of the ATJ 2B .txt (watermark lines dropped); ref.txt_line starts the clause; ref.page is that pdf page\'s printed number; rules WD22 + WD31 are the codes in the clause heading; re-running tools/extract_atj2b_advance.py on a copy of std_values.json reproduces advance_placement byte-for-byte', rs => {
      const AP = STD.advance_placement; if (!AP || !fs.existsSync(ATJ2B_TXT) || !fs.existsSync(ATJ2A_TXT)) return false;
      const T = fs.readFileSync(ATJ2B_TXT, 'utf8'), pg = T.split('\f'), c = AP.clause_2_2_8, lines = T.split('\n');
      const flat = x => x.split('\n').filter(l => !/^\s*[A-Z]{1,3}\s*$/.test(l)).join(' ').replace(/\s+/g, ' ');
      const sent = flat(T.slice(T.indexOf('2.2.8   Traffic Signal Ahead Sign (WD.22) and Roundabout'), T.indexOf('2.2.9   Chevron Sign', T.indexOf('2.2.8   Traffic Signal Ahead Sign (WD.22) and Roundabout'))));
      const m = /at a distance (\d+) m or not less than (\d+) m in urban areas, and (\d+) m or not less than (\d+) m in rural areas or high speed roads in advance/.exec(sent);
      const nums = pg[c.ref.pdf_page - 1].split('\n').filter(l => /^\s*\d{1,3}\s*$/.test(l)).map(l => +l.trim());
      const tmp = path.join(os.tmpdir(), 'std_repro_' + process.pid + '.json'); fs.writeFileSync(tmp, JSON.stringify(Object.assign({}, STD, { advance_placement: undefined }), null, 1));
      let same = false; try { require('child_process').execFileSync('python3', ['-I', path.join(ROOT, 'tools', 'extract_atj2b_advance.py'), ATJ2B_TXT, ATJ2A_TXT, tmp], { stdio: 'pipe' }); same = JSON.stringify(JSON.parse(fs.readFileSync(tmp, 'utf8')).advance_placement) === JSON.stringify(AP); } catch (e) { logStream.write('[repro] ' + e.message + '\n'); } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
      console.log('§SIGN_ADVANCE_EXTRACT txt=' + JSON.stringify(m && m.slice(1, 5).map(Number)) + ' shipped=' + JSON.stringify([c.urban.nominal_m, c.urban.min_m, c.rural_or_high_speed.nominal_m, c.rural_or_high_speed.min_m]) + ' line=' + c.ref.txt_line + ' pdf=' + c.ref.pdf_page + ' printed=' + c.ref.page + ' printedOnPage=' + JSON.stringify(nums) + ' reproduces=' + same + ' rules=' + AP.rules.map(r => r.code + '->' + r.hazard).join(','));
      return !!m && +m[1] === c.urban.nominal_m && +m[2] === c.urban.min_m && +m[3] === c.rural_or_high_speed.nominal_m && +m[4] === c.rural_or_high_speed.min_m && /2\.2\.8/.test(lines[c.ref.txt_line - 1]) && nums.length === 1 && nums[0] === c.ref.page &&
        JSON.stringify(AP.rules.map(r => r.code).sort()) === JSON.stringify(['WD22', 'WD31']) && /\(WD\.22\)/.test(sent) && /\(WD\.31\)/.test(sent) && same && AP._unread.length === 0; })
    .invariant('§SIGN_VS_SPEED verdicts (issue: do WD.22/WD.31 verdicts match an independent along-route recompute?): every sign whose code part is a rule code is judged; dist == |chainage gap to the near edge of the hazard extent| from the witness\'s own brute-force projection of the signal elements; clamped sign / off-route roundabout = NOT_JUDGED (never CHECK); verdict = dist >= rural min (assumed RURAL column); nothing judged => fails (VACUOUS is not a pass)', rs => rs.every(r => {
      const rd2 = r.road, A = rd2.base.advance, MMs = GEO.model_map; if (!A || A.vacuous) return false;
      const Lr = R.indep.L, pr = (x, z) => project(rd2.route, x, z), ext = pts => { const ss = pts.map(q => pr(q.x, q.z).s); return { s0: Math.min(...ss), s1: Math.max(...ss) }; };
      const sj = ext(rd2.sjPos), rbE = ext(rd2.rbPos), rbOff = (rbE.s1 - rbE.s0) < 1e-6 && (rbE.s1 <= 1e-6 || rbE.s0 >= Lr - 1e-6);
      const col = STD.advance_placement.clause_2_2_8[GEO.inputs.area.value === 'URBAN' ? 'urban' : 'rural_or_high_speed'];
      const nrm = c => String(c || '').toUpperCase().replace(/[\s.]/g, ''), hz = { WD22: 'sj', WD31: 'rb' };
      const exp = []; rd2.advSigns.forEach(sg => { const code = String(sg.code || '').split('&').map(nrm).find(x => hz[x]); if (!code) return; const s = pr(sg.x, sg.z).s;
        let v, d = null; if (hz[code] === 'rb' ? rbOff : false) v = 'NOT_JUDGED'; else if (s <= 1e-3 || s >= Lr - 1e-3) v = 'NOT_JUDGED'; else { const e = hz[code] === 'sj' ? sj : rbE; d = s < e.s0 ? e.s0 - s : (s > e.s1 ? s - e.s1 : 0); v = d >= col.min_m ? 'OK' : 'CHECK'; }
        exp.push({ guid: sg.guid, v, d }); });
      console.log('§SIGN_ADVANCE_INDEP applicable=' + exp.length + ' OK=' + exp.filter(e => e.v === 'OK').length + ' CHECK=' + exp.filter(e => e.v === 'CHECK').length + ' NOT_JUDGED=' + exp.filter(e => e.v === 'NOT_JUDGED').length + ' engine=' + JSON.stringify(A.counts) + ' sj=' + sj.s0.toFixed(1) + '..' + sj.s1.toFixed(1) + ' rbOff=' + rbOff + ' min=' + col.min_m + ' dists=' + exp.map(e => e.v + ':' + (e.d == null ? 'NA' : e.d.toFixed(1))).join(','));
      return exp.length > 0 && exp.length === A.rows.length && A.applicable === exp.length && exp.every(e => { const g = A.rows.find(q => q.guid === e.guid); return g && g.verdict === e.v && (e.d == null ? g.dist == null : Math.abs(g.dist - e.d) < 0.5); }) &&
        A.counts.OK + A.counts.CHECK + A.counts.NOT_JUDGED === exp.length && A.column === (GEO.inputs.area.value === 'URBAN' ? 'urban' : 'rural_or_high_speed'); }))
    .invariant('§SIGN_VS_SPEED list (issue: 138 signs listed when the rule covers few): the group lists ONLY rule-applicable signs — DOM rows == engine rows == independent applicable count, far fewer than all SIGNAGE elements; CHECK group before OK; each DOM row sits in the group of its verdict; NOT JUDGED rows say why in the tooltip; header names the count', rs => rs.every(r => {
      const rd2 = r.road, A = rd2.base.advance, D = rd2.advDom; if (!A || A.vacuous || !D) return false; const order = ['CHECK', 'OK', 'NOT_JUDGED'];
      return D.length === A.rows.length && D.length > 0 && D.length < rd2.advSigns.length && D.every(d => { const q = A.rows.find(x => x.guid === d.guid); return q && d.verdict === q.verdict && (d.verdict !== 'NOT_JUDGED' || /(off the route|clamped|derived)/.test(d.title)); }) &&
        D.map(d => order.indexOf(d.verdict)).every((v, i, a) => !i || v >= a[i - 1]) && rd2.advGroups.every(g => g.n === D.filter(d => d.verdict === g.verdict).length) && new RegExp('\\(' + A.applicable + ' signs a rule applies to\\)').test(rd2.advHeader || ''); }))
    .invariant('§SIGN_VS_SPEED click (HUD): click a CHECK row -> camera target on that sign (<0.05 m) and the card cites ATJ 2B/85 clause 2.2.8, its printed page, nominal + minimum, the model distance, the hazard chainage, and the zone approach speed', rs => rs.every(r => { const c = r.road.advClick, A = r.road.base.advance; if (!c) return false; const p = STD.advance_placement.clause_2_2_8, row = A.rows.find(q => q.guid === c.guid);
      return c.dist < 0.05 && !!row && c.card.includes('clause 2.2.8') && c.card.includes('p.' + p.ref.page) && c.card.includes('nominal ' + (row.column === 'urban' ? p.urban.nominal_m : p.rural_or_high_speed.nominal_m)) && c.card.includes('not less than ' + row.minM) && (row.dist == null || c.card.includes(row.dist.toFixed(1))) && /Approach speed of the zone at the sign/.test(c.card); }))
    .invariant('§SIGN_VS_SPEED levers (issue: is the verdict driven by the JSON, not hard-wired?): rural min 30 / 50 flip every row to the independent dist >= min; rules=[] -> VACUOUS (applicable 0, reason names the codes) not a pass; signal hazard not found -> every WD.22 row NOT_JUDGED "no signal_junction derived" while WD.31 rows are unchanged', rs => rs.every(r => { const b = r.road.base.advance, L2 = r.road.lever; if (!b || !L2.advMin30.advance) return false; const J = b.rows.filter(q => q.verdict !== 'NOT_JUDGED');
      const flip = (adv, m) => adv.rows.length === b.rows.length && adv.rows.every(q => { const o = b.rows.find(x => x.guid === q.guid); return o.verdict === 'NOT_JUDGED' ? q.verdict === 'NOT_JUDGED' : q.verdict === (o.dist >= m ? 'OK' : 'CHECK'); });
      const ns = L2.advNoSJ.advance, nr = L2.advNoRules.advance;
      return J.length > 0 && flip(L2.advMin30.advance, 30) && flip(L2.advMin50.advance, 50) && nr.vacuous === true && nr.applicable === 0 && nr.rows.length === 0 && /no advance_placement rules/.test(nr.reason || '') &&
        ns.rows.filter(q => q.hazard === 'signal_junction').length > 0 && ns.rows.filter(q => q.hazard === 'signal_junction').every(q => q.verdict === 'NOT_JUDGED' && /no signal_junction derived/.test(q.why)) &&
        ns.rows.filter(q => q.hazard === 'roundabout').every(q => b.rows.find(x => x.guid === q.guid).verdict === q.verdict); }))
    .invariant('§SIGN_VS_SPEED pure engine (SYNTHETIC straight route, interior signal junction 1000..1030): WD.22 at 800 -> OK 200 m (below nominal 230), 900 -> CHECK 100, 1100 -> CHECK 70 (other direction), inside -> CHECK 0, at route start -> NOT_JUDGED (clamped), WD.31 with no roundabout -> NOT_JUDGED, compound "WD. 23 & WD. 22" at 850 -> CHECK 150 rural but OK urban (min 150), RP. 7 not listed; empty rules / missing section -> VACUOUS', () => SYN2().ok)
    .invariant('§SIGN_VS_SPEED size-vs-speed (issue: PHASE-1 gate — is there a speed-banded sign-SIZE rule?): none is built because none exists for the model\'s boards: size_vs_speed.status = no_rule_for_model; an independent grep of ATJ 2A+2B finds every "km/h < Speed Limit" row only inside the recorded LETTER-HEIGHT tables (lettering is not in the model); the WD.39 block (chevron sizes) mentions neither speed nor km/h; the panel shows the "not judgeable" note with the finding in its tooltip; the log carries §SIGN_SIZE_SPEED NOT_BUILT', rs => rs.every(r => {
      const sv = STD.advance_placement.size_vs_speed, A2 = fs.readFileSync(ATJ2A_TXT, 'utf8'), B2 = fs.readFileSync(ATJ2B_TXT, 'utf8'); const rec = new Set(sv.speed_banded_tables.map(t => t.doc + ':' + t.pdf_page));
      const found = new Set(); [['ATJ 2B/85', B2], ['ATJ 2A/85', A2]].forEach(([doc, T]) => { const pg = T.split('\f'); pg.forEach((p, i) => { if (/km\/h\s*<\s*Speed [Ll]imit/.test(p)) found.add(doc + ':' + (i + 1)); }); });
      const wd = A2.slice(A2.indexOf('WD. 39a & 39b CHEVRON DELINEATOR'), A2.indexOf('WD. 39a & 39b CHEVRON DELINEATOR') + 2400);
      const letter = [...found].every(k => { const [doc, pdf] = k.split(':'), T = doc === 'ATJ 2A/85' ? A2 : B2, p = T.split('\f')[+pdf - 1]; return /letter/i.test(p) && /height/i.test(p); });
      console.log('§SIGN_SIZE_SPEED_INDEP speedBandedPages=' + [...found].join(',') + ' recorded=' + [...rec].join(',') + ' wd39Speed=' + /speed|km\/h/i.test(wd) + ' status=' + sv.status);
      return sv.status === 'no_rule_for_model' && found.size > 0 && [...found].every(k => rec.has(k)) && rec.size === found.size && letter && !/speed|km\/h/i.test(wd) && !!r.road.sizeNote && /not judgeable/.test(r.road.sizeNote.text) && /no speed-banded/i.test(r.road.sizeNote.title) && !!global.__sizeLog; }))
    .invariant('§LABEL_CLEAN legend (issue: the long provenance clutters every row): each legend row is ONE line "N km/h · s0–s1 m · class TAG" with TAG in {derived, demo, NCHRP 672, user} equal to the independent expected tag (link->zone_tags.link, node-><kind>.tag, approach->approach_tag); the row text carries none of the long phrases; the tooltip (title) still carries the full provenance (label, "assumed:" list for link zones); clicking a row puts that provenance in the HUD card', rs => rs.every(r => {
      const b = r.road.base, lg = r.road.legend, exp = z => z.kind === 'link' ? GEO.zone_tags.link : (z.kind === 'approach' ? GEO[z.node].approach_tag : GEO[z.kind].tag);
      const sj = b.zones.find(z => z.kind === 'signal_junction'), rbz = b.zones.find(z => z.kind === 'roundabout'), lc = r.road.legClick;
      console.log('§LABEL_CLEAN legend=' + lg.map(e => e.zone + ':' + e.short.slice(-12)).join(' | '));
      return lg.length === b.zones.length && lg.every(e => { const z = b.zones.find(q => q.id === e.zone); return /^\d+ km\/h · (CH \d+\+\d{3}–\d+\+\d{3}|\d+–\d+ m \(inferred\)) · \S+ (derived|demo|NCHRP 672|user)$/.test(e.short) && e.short.includes(r.road.rangeOf[z.id]) && e.short.endsWith(' ' + exp(z)) && z.tag === exp(z) && !/assumed|not from a standard|demo rule|demo default|marked|borrowed|disc:/.test(e.short) && e.short.length <= 52 && !/<br/.test(e.html) &&
          e.title.includes(z.label) && (z.kind !== 'link' || /assumed: /.test(e.title)); }) &&
        lg.some(e => e.short.endsWith(' derived')) && lg.some(e => e.short.endsWith(' demo')) && lg.some(e => e.short.endsWith(' NCHRP 672')) && !!lc && lc.zone === sj.id && lc.card.includes('not from a standard') && lc.card.includes(GEO.signal_junction.tag) && !!rbz; }))
    .invariant('§LABEL_CLEAN sign list + Speed section (issue: same clutter on the speed-sign rows and the mode line): sign rows end with a short tag and carry none of the long phrases; their tooltip carries code, chainage and the full label; the mode line says "assumed inputs (N)" with the list in the tooltip; lever class R6 -> link rows/legend show tag "user" and the tooltip still names "class R6 (user)"', rs => rs.every(r => {
      const rd2 = r.road, L6 = rd2.lever;
      return rd2.signDom.length > 0 && rd2.signDom.every((t, i) => /(derived|demo|NCHRP 672|user)$/.test(t) && !/not from a standard|demo rule|demo default|assumed/.test(t) && / @ (CH \d+\+\d{3}|\d+ m \(inferred\)): /.test(rd2.signTitles[i])) && rd2.base.signRows.every(q => q.tag) &&
        L6.legendClassR6.filter(e => /class R6 \(user\)/.test(e.text)).length > 0 && L6.legendClassR6.filter(e => /class R6 \(user\)/.test(e.text)).every(e => e.short.endsWith(' user')); }))
    .invariant('§HUD_CARD layout (issue: card was one wall of text, unreadable on a phone): clicking a sign row gives a bold title "N km/h · Zone Zx" (+ sign code), >=5 key/value rows (Chainage, Class, Terrain, Lane width, Max grade, Source tag), font >= 12 px, title larger, max width <= 360 px, and a COLLAPSED "Why / sources" section whose text still holds the ATJ table/page, mode label and assumed inputs; a zone legend click uses the same layout', rs => rs.every(r => { const c = r.road.click.struct, z = r.road.base.zones.find(q => q.id === (r.road.base.signRows.find(x => x.guid === r.road.click.guid) || {}).zone), lc = r.road.legClick;
      console.log('§HUD_CARD title=' + (c && c.title) + ' kv=' + (c && c.kv.length) + ' whyOpen=' + (c && c.why && c.why.open) + ' titleFont=' + (c && c.titleFont) + ' legend.kv=' + (lc && lc.struct.kv));
      console.log('§HUD_CARD_TERMS ' + JSON.stringify([!!c, !!z, c && z && c.title.startsWith(z.speed + ' km/h \u00b7 Zone ' + z.id), c.kv.length >= 5, ['Chainage', 'Class', 'Terrain', 'Lane width', 'Max grade', 'Source'].every(k => c.kv.some(t => t.startsWith(k))), c.why.open === false, c.why.fontMin >= 12, c.titleFont > c.why.fontMin, c.maxW <= 360, /ATJ 8\/86 Table 3\.2A/.test(c.why.text), z && c.why.text.includes(z.label), /assumed inputs/.test(c.why.text), !!lc, lc && lc.struct.kv >= 5, lc && lc.struct.whyOpen === false, lc && lc.struct.title])); 
      return !!c && !!z && c.title.startsWith(z.speed + ' km/h \u00b7 Zone ' + z.id) && c.kv.length >= 5 && ['Chainage', 'Class', 'Terrain', 'Lane width', 'Max grade', 'Source'].every(k => c.kv.some(t => t.startsWith(k))) && c.why && c.why.open === false && c.why.fontMin >= 12 && c.titleFont > c.why.fontMin && c.maxW <= 360 &&
        /ATJ 8\/86 Table 3\.2A/.test(c.why.text) && c.why.text.includes(z.label) && /assumed inputs/.test(c.why.text) && !!lc && lc.struct.kv >= 5 && lc.struct.whyOpen === false && /Zone Z\d|Z\d/.test(lc.struct.title); }))
    .invariant('§HUD_LAYOUT upper panel (issue: Road standards + Speed header were paragraphs of 10 px text): section titles present (.rs-title, .sz-title); counts line one row; Mode/Zones as key/value rows; the mode explanation, assumed-inputs list and every derivation message (terrain ASSUMED FLAT ...) are INSIDE a collapsed "Why / sources" (closed, text present); no visible text element wraps to more than ~3 lines; sign-check card = title + >=5 key/value rows + collapsed Why holding the full detail; panel and card <= 360 px wide', rs => rs.every(r => { const L = r.road.layout, b = r.road.base; if (!L || !L.card) return false;
      console.log('§HUD_LAYOUT titles=' + L.rsTitle + '|' + L.szTitle + ' visibleTextEls=' + L.nVisibleText + ' longVisible=' + JSON.stringify(L.long) + ' whyTop=' + L.whyTop.map(w => w.cls + ':open=' + w.open).join(',') + ' szKv=' + L.szKv.length + ' card.kv=' + L.card.kv + ' panelW=' + L.panelW);
      const top = L.whyTop.find(w => /sz-why-top/.test(w.cls)), rsTop = L.whyTop.find(w => /rs-why-top/.test(w.cls));
      return !!L.rsTitle && !!L.szTitle && L.nVisibleText > 10 && L.long.length === 0 && L.szKv.length >= 2 && !!top && top.open === false && b.assumed.every(a => top.text.includes(a)) && b.msgs.every(m => top.text.includes(m)) && !!rsTop && rsTop.open === false && /ATJ 2A\/85/.test(rsTop.text) &&
        !!L.card.title && L.card.kv >= 5 && L.card.whyOpen === false && L.card.whyText.length > 20 && L.card.maxW <= 360 && L.panelW <= 360; }))
    .invariant('Duplex: not civil, no panel, no Speed section => VACUOUS (not a pass of anything)', rs => rs.every(r => !r.dup.civil && r.dup.opened === null && !r.dup.panel && r.dup.zones === null))
    .redControl(rs => rs.map(r => Object.assign({}, r, { road: Object.assign({}, r.road, { base: Object.assign({}, r.road.base, { zones: r.road.base.zones.map(z => Object.assign({}, z, { speed: z.speed + 10 })) }) }) })))
    ;
  console.log = (...a) => { const s = a.join(' '); logStream.write(s + '\n'); _cl(...a); };   // the kit prints PASS/FAIL + the §WITNESS_ summary via console.log: mirror INTO the LOG
  try { W.run(); } finally { console.log = _cl; }
  await new Promise(r => logStream.end(r));
})();
