#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §ALTC_PANELS (2026-10-06, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_PANELS)
// Scope: road data cards on quiet stretches of the road film's drive (viewer/cpe_road_panels.js). No bake.
// Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES (user 2026-10-05): "pop up panels similar to freeze load path but running along the length of
// the film where it is clear and silent" — cards must sit on QUIET stretches only (the noise law's own busy probes), never over
// the parade half or the junction orbit, carry model numbers only, and never appear on a building.
// GREEN = JELAPANG: ≥ 3 slots, non-overlapping, all inside the build-up drive window, each slot's busy ≤ the window median, every
// number on every card equals an SQL count over the card's own guids, a card drawn at a slot mid paints pixels ONLY inside its
// returned rect (which lies inside the frame), nothing is painted between slots; Duplex: build returns null, draws nothing.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load failed), VACUOUS guard (slots ≥ 3), RED CONTROL (a busy slot injected).
// Env: ROOT · BLD_DIR · GPU=sw|real · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'JELAPANG_AFTER';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8579);
const LOG = process.env.LOG || '/tmp/witness_road_panels.log';
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

async function probe(browser, bld, dir) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); logStream.write('[con:' + bld + '] ' + t + '\n'); if (/§(ROAD_PANEL|ALTC_V2)/.test(t)) console.log('  [' + bld + '] ' + t.slice(0, 320)); });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${bld}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming && (!window.APP.isCivilModel() || window.APP._civilLabels), { timeout: 1800000, polling: 1000 });
  const r = await page.evaluate(async () => {
    const A = window.APP, civil = A.isCivilModel();
    let ov = { reveal: true };
    if (civil) { const R = A.civilRoutePath(), big = R.stops.reduce((m, j) => (!m || j.n > m.n ? j : m), null);
      const P = big && big.at < (R.path.length - 1) / 2 ? R.path.slice().reverse() : R.path; ov = { waypoints: P.map(p => ({ x: p.x, y: p.y, z: p.z })), reveal: true }; }
    const plan = A.cinemaPathPlan(60, ov), filmSec = plan.naturalTotal;
    const rp = await A.roadPanelsBuild(plan, filmSec);
    const out = { civil, filmSec, built: !!rp };
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const ctx = c.getContext('2d');
    const painted = (box) => { const d = ctx.getImageData(0, 0, 1280, 720).data; let inside = 0, outside = 0;
      for (let y = 0; y < 720; y++) for (let x = 0; x < 1280; x++) { if (!d[(y * 1280 + x) * 4 + 3]) continue; if (box && x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h) inside++; else outside++; } return { inside, outside }; };
    if (!rp) { A._hudLayoutRects = []; const b = A.roadPanelsCompositeOntoCanvas(ctx, 1280, 720, 0.3, 1); out.drawNone = painted(null); out.drawBox = b; return out; }
    out.w0 = rp.w0; out.w1 = rp.w1; out.median = rp.median; out.out = plan.beats.out;
    out.slots = rp.slots.map(s => {
      const card = s.card, chk = [];
      const inList = card.guids.map(g => "'" + String(g).replace(/'/g, "''") + "'").join(',');
      card.rows.forEach(row => {
        let sql = null;
        if (card.kind === 'counts') sql = "SELECT COUNT(*) FROM elements_meta WHERE discipline='" + row.disc + "' AND guid IN (" + inList + ")";
        else if (card.kind === 'drainage') sql = "SELECT COUNT(DISTINCT a.guid) FROM element_psets a WHERE a.name='02_Type' AND a.value='" + row.key.replace(/'/g, "''") + "' AND a.guid IN (" + inList + ")" +
          (row.sub ? " AND a.guid IN (SELECT guid FROM element_psets WHERE name='03_Dimension' AND value='" + row.sub.replace(/'/g, "''") + "')" : " AND a.guid NOT IN (SELECT guid FROM element_psets WHERE name='03_Dimension')");
        else if (card.kind === 'signs') sql = "SELECT COUNT(DISTINCT a.guid) FROM element_psets a WHERE a.name='17_Code' AND a.value='" + row.key.replace(/'/g, "''") + "' AND a.guid IN (" + inList + ")" +
          (row.sub ? " AND a.guid IN (SELECT guid FROM element_psets WHERE name='16_Name' AND value='" + row.sub.replace(/'/g, "''") + "')" : " AND a.guid NOT IN (SELECT guid FROM element_psets WHERE name='16_Name')");
        if (sql) chk.push({ shown: row.value, sql: (A.dbQuery(sql)[0] || [null])[0] });
        else chk.push({ shown: row.value, planned: /^planned/.test(String(row.value)) });
      });
      if (card.kind === 'check') return { t0: s.t0, t1: s.t1, busy: s.busy, kind: card.kind, rows: card.rows.length, chk: [], check: { rule: card.rule, guid: card.guid, measured: card.measured, status: card.status, tag: card.rows[3].label } };
      return { t0: s.t0, t1: s.t1, busy: s.busy, kind: card.kind, rows: card.rows.length, chk };
    });
    // §ALTC_CHECKS oracle: run road_check ITSELF (own adapter) + read the tracking list straight from rates/road_rules.json
    if (civil && window.RoadCheck) {
      const cfg = await fetch('rates/road_rules.json').then(x => x.json());
      const q = (sql, p) => { const st = A.db.prepare(sql), o = []; if (p && p.length) st.bind(p); while (st.step()) o.push(st.getAsObject()); st.free(); return o; };
      const res = window.RoadCheck.run(q, cfg, {}); out.oracleRows = {}; (res.rows || []).forEach(rw => { (out.oracleRows[rw.guid] = out.oracleRows[rw.guid] || []).push({ rule: rw.rule, measured: rw.measured }); });
      out.statusOf = {}; cfg.road_rules.forEach(rr => { out.statusOf[rr.name] = rr.film_status && rr.film_status.status; });
    }
    const s0 = rp.slots[0];
    A._hudLayoutRects = []; ctx.clearRect(0, 0, 1280, 720);
    out.box = A.roadPanelsCompositeOntoCanvas(ctx, 1280, 720, (s0.t0 + s0.t1) / 2, 1); out.paintMid = painted(out.box);
    ctx.clearRect(0, 0, 1280, 720);
    const gapT = rp.slots.length > 1 ? (rp.slots[0].t1 + rp.slots[1].t0) / 2 : (rp.w1 + plan.beats.out) / 2;
    out.gapBox = A.roadPanelsCompositeOntoCanvas(ctx, 1280, 720, gapT, 1); out.paintGap = painted(null);
    ctx.clearRect(0, 0, 1280, 720);
    out.orbitBox = A.roadPanelsCompositeOntoCanvas(ctx, 1280, 720, (plan.beats.rise + 1) / 2, 1); out.paintOrbit = painted(null);
    return out;
  });
  await page.close(); return r;
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rpw-profile-')), protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1300,840'].concat(gpuArgs) });
  const R = {};
  try {
    R.road = await probe(browser, BLD, BLD_DIR); log('§RPW_ROAD ' + JSON.stringify(R.road));
    R.bld = await probe(browser, 'Duplex_extracted', '/home/red1/bim-ootb/buildings'); log('§RPW_BLD ' + JSON.stringify(R.bld));
  } catch (e) { log('§RPW verdict=INCONCLUSIVE reason=' + e.message); R.err = e.message; process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (R.err) { logStream.end(); return; }
  const inFrame = b => b && b.x >= 0 && b.y >= 0 && b.x + b.w <= 1280 && b.y + b.h <= 720;
  Witness('road_panels')
    .population(() => [R])
    .schema({ type: 'object', required: ['road', 'bld'] })
    .invariant('road: civil, ≥ 3 slots built (else nothing judged)', rs => rs.every(r => r.road.civil && r.road.built && r.road.slots.length >= 3))
    .invariant('road: slots never overlap', rs => rs.every(r => r.road.slots.every((s, i, a) => i === 0 || s.t0 >= a[i - 1].t1)))
    .invariant('road: every slot inside the build-up drive window (never the parade half or the orbit)', rs => rs.every(r => r.road.slots.every(s => s.t0 >= r.road.w0 && s.t1 <= r.road.w1 && s.t1 <= r.road.out)))
    .invariant('road: every slot quiet (busy ≤ the window median)', rs => rs.every(r => r.road.slots.every(s => s.busy <= +r.road.median.toFixed(3) + 1e-9)))
    .invariant('road: every number on every card = SQL count over its own guids; planned rows carry no number', rs => rs.every(r => r.road.slots.every(s => s.chk.every(c => (c.sql != null ? +c.shown === +c.sql : c.planned)))))
    .invariant('road §ALTC_CHECKS: ≥ 1 road-check card; its measured value = road_check row for that element; its tag = the rule\'s film_status in road_rules.json', rs => rs.every(r => { const cs = r.road.slots.filter(s => s.kind === 'check'); return cs.length > 0 && cs.every(s => { const o = (r.road.oracleRows[s.check.guid] || []).filter(x => x.rule === s.check.rule); return o.some(x => x.measured === s.check.measured) && s.check.status === r.road.statusOf[s.check.rule] && s.check.tag === (s.check.status === 'valid' ? 'VALID' : 'SPECULATIVE'); }); }))
    .invariant('road: card drawn at a slot mid paints only inside its rect, rect inside the frame', rs => rs.every(r => inFrame(r.road.box) && r.road.paintMid.inside > 0 && r.road.paintMid.outside === 0))
    .invariant('road: nothing drawn between slots or during the junction orbit', rs => rs.every(r => !r.road.gapBox && r.road.paintGap.outside === 0 && !r.road.orbitBox && r.road.paintOrbit.outside === 0))
    .invariant('building (Duplex): no panels built, nothing drawn', rs => rs.every(r => !r.bld.civil && !r.bld.built && !r.bld.drawBox && r.bld.drawNone.outside === 0))
    .redControl(rs => rs.map(r => { const c = JSON.parse(JSON.stringify(r)); c.road.slots[0].busy = 1; c.road.median = 0.5; return c; }))
    .run();
  logStream.end();
})();
