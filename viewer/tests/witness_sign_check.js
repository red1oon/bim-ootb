#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §SIGN_CHECK (2026-10-07, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §SIGN_CHECK). No bake.
// Read the log after every run — the exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: model sign codes (SIGNAGE elements, property from std_values.json _model_map) are judged
// against the ATJ 2A/85 table. GREEN = (1) verdict counts equal an INDEPENDENT sqlite3 recount, (2) every OK code is in the
// shipped std_values.json, (3) the verdict tree (UNKNOWN, MISSING, OK; OK collapsed) matches the counts, (4) clicking a sign row
// moves the camera target onto that GUID's mesh centre, (5) a Settings override that drops one code flips exactly that code's
// signs OK->UNKNOWN, (6) the Inspect drawer carries the 'Road standards' row on the road and not on Duplex, (7) Duplex has no
// SIGNAGE: VACUOUS (reported as VACUOUS, never PASS).
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load failed / nothing judged), VACUOUS (Duplex), RED CONTROL.
// Env: GPU=real|sw (real only if nvidia-smi < 70% used), BLD, BLD_DIR, DUP_DIR, PORT, LOG.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'CivilWorksPath';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const DUP_DIR = process.env.DUP_DIR || '/home/red1/bim-compiler/deploy/buildings';
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8583);
const LOG = process.env.LOG || '/tmp/witness_sign_check.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (u.startsWith('/buildings/')) { const n = u.slice('/buildings/'.length); fp = fs.existsSync(path.join(BLD_DIR, n)) ? path.join(BLD_DIR, n) : path.join(DUP_DIR, n); }
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

// ── independent recount: sqlite3 CLI + its own normaliser, reading std_values.json from disk (not the engine) ──
const STD = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'std_values.json'), 'utf8'));
const nrm = s => String(s).toUpperCase().replace(/[\s.]/g, '');
function sql(db, q) { return JSON.parse(cp.execFileSync('sqlite3', ['-json', db, q], { maxBuffer: 1 << 28 }).toString() || '[]'); }
function recount(db) {
  const mm = STD._model_map, table = new Set(STD.signs.map(s => nrm(s.code)));
  const els = sql(db, `SELECT guid FROM elements_meta WHERE discipline='${mm.discipline}'`);
  const code = {}; sql(db, `SELECT guid,value FROM element_psets WHERE name='${mm.code_prop}'`).forEach(r => { if (r.value != null && String(r.value).trim() && code[r.guid] == null) code[r.guid] = String(r.value); });
  const c = { OK: 0, UNKNOWN: 0, MISSING: 0 }, byCode = {};
  els.forEach(e => { const v = code[e.guid]; if (v == null) { c.MISSING++; return; }
    const ok = v.split('&').map(nrm).filter(Boolean).every(p => table.has(p)); c[ok ? 'OK' : 'UNKNOWN']++; if (ok) byCode[v] = (byCode[v] || 0) + 1; });
  return { c, n: els.length, byCode };
}


// Opens the Inspect drawer through the real pill and reports its rows (order + roadstd label).
const DRAWER_FN = `window.__drawerProbe = async () => {
  const b = [...document.querySelectorAll('button, [role=button], div')].find(e => (e.title === 'Inspect' || e.getAttribute('aria-label') === 'Inspect') );
  if (!b) return { found: false };
  b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); b.click();
  await new Promise(r => setTimeout(r, 600));
  const ids = [...document.querySelectorAll('#inspect-drawer-panel .bim-drawer-row')].map(e => e.id);
  const rs = document.getElementById('drawer-row-roadstd');
  return { found: true, ids, label: rs ? rs.textContent.replace(/\\s+/g, ' ').trim() : null };
};`;
async function open(browser, bld) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); logStream.write('[con:' + bld + '] ' + t + '\n'); if (/§(SIGN_CHECK|JSON_OVERRIDE|ZOOM_MISS|DRAWER_BUILD)/.test(t)) console.log('  [' + bld + '] ' + t.slice(0, 220)); });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${bld}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 25 * 60 * 1000, polling: 1000 });
  await page.evaluate(DRAWER_FN);
  return page;
}
async function roadProbe(page) {
  return page.evaluate(async () => {
    const A = window.APP, out = { civil: A.isCivilModel() };
    localStorage.removeItem('json_std_values');
    const res = await A.showRoadStandards(); out.counts = res.counts; out.n = res.rows.length;
    out.okCodes = [...new Set(res.rows.filter(r => r.verdict === 'OK').map(r => r.code))];
    const P = document.getElementById('road-standards-panel');
    out.lvl1 = [...P.querySelectorAll('details[data-lvl="1"]')].map(d => ({ v: d.dataset.verdict, open: d.open, n: +d.querySelector('summary').textContent.match(/\((\d+)\)/)[1] }));
    out.lvl2 = [...P.querySelectorAll('details[data-lvl="2"] > summary')].map(s => s.textContent);
    out.lvl3 = [...P.querySelectorAll('details[data-lvl="3"] > summary')].map(s => s.textContent);
    out.unknownHasLvl2 = !!P.querySelector('details[data-verdict="UNKNOWN"] details[data-lvl="2"], details[data-verdict="MISSING"] details[data-lvl="2"]');
    // click: first row of the first OK code -> camera target must land on that element's own centre (independent: DB centroid via ifc2three)
    const el = P.querySelector('details[data-verdict="OK"] .rs-row') || P.querySelector('.rs-row'), g = el.dataset.guid;
    el.click();
    let last = null, stable = 0;
    for (let i = 0; i < 60 && stable < 5; i++) { await new Promise(r => setTimeout(r, 250)); const t = A.controls.target; const k = [t.x, t.y, t.z].join(','); stable = (k === last) ? stable + 1 : 0; last = k; }
    const row = A.dbQuery('SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?', [g])[0];
    const want = A.ifc2three(row[0], row[1], row[2]), t = A.controls.target;
    out.click = { guid: g, dist: Math.hypot(want.x - t.x, want.y - t.y, want.z - t.z), card: P.querySelector('.rs-card').textContent.slice(0, 120) };
    // override drops one OK code
    const drop = out.okCodes[0]; out.drop = drop;
    const std = await (await fetch('std_values.json?v=2')).json();
    const norm = s => String(s).toUpperCase().replace(/[\s.]/g, '');
    std.signs = std.signs.filter(s => norm(s.code) !== norm(drop));
    localStorage.setItem('json_std_values', JSON.stringify(std));
    const r2 = await A.showRoadStandards(); out.after = r2.counts;
    out.dropFlipped = r2.rows.filter(r => r.code === drop).every(r => r.verdict === 'UNKNOWN');
    out.dropN = r2.rows.filter(r => r.code === drop).length;
    localStorage.removeItem('json_std_values');
    // drawer row
    out.drawer = await window.__drawerProbe();
    return out;
  });
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'sgn-profile-')), protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1280,720', ...gpuArgs] });
  const R = { gpu: GPU };
  try {
    R.sql = recount(path.join(BLD_DIR, BLD + '.db')); log('§SIGN_RECOUNT ' + JSON.stringify({ c: R.sql.c, n: R.sql.n }));
    const pr = await open(browser, BLD); R.road = await roadProbe(pr); log('§SIGN_ROAD ' + JSON.stringify(Object.assign({}, R.road, { okCodes: R.road.okCodes.length })));
    const pd = await open(browser, 'Duplex_extracted');
    R.dup = await pd.evaluate(async () => { const A = window.APP; const std = await (await fetch('std_values.json?v=2')).json();
      const opened = await A.showRoadStandards(); const direct = window.RoadStandards.checkSigns((q, p) => { const st = A.db.prepare(q), o = []; if (p && p.length) st.bind(p); while (st.step()) o.push(st.getAsObject()); st.free(); return o; }, std, { log: console.log });
      const rows = [...document.querySelectorAll('.bim-drawer-row')].map(e => e.id);
      return { drawer: await window.__drawerProbe(), civil: A.isCivilModel(), opened, vacuous: direct.vacuous, reason: direct.reason, panel: !!document.getElementById('road-standards-panel') }; });
    log('§SIGN_DUPLEX ' + JSON.stringify(R.dup) + (R.dup.vacuous ? ' verdict=VACUOUS' : ''));
  } catch (e) { log('§SIGN_CHECK verdict=INCONCLUSIVE reason=' + e.message); R.err = e.message; process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (R.err) { logStream.end(); return; }
  if (!R.sql.n) { log('§SIGN_CHECK verdict=INCONCLUSIVE reason=no SIGNAGE elements judged on road'); process.exitCode = 2; logStream.end(); return; }
  const _c = console.log; console.log = (...a) => { logStream.write(a.join(' ') + '\n'); _c(...a); };   // mirror the kit's PASS/FAIL + §WITNESS_ summary INTO the LOG
  Witness('sign_check')
    .population(() => [R])
    .schema({ type: 'object', required: ['sql', 'road', 'dup'] })
    .invariant('road: civil model and SIGNAGE population non-empty (nothing judged => INCONCLUSIVE)', rs => rs.every(r => r.road.civil && r.road.n > 0))
    .invariant('counts per verdict == independent sqlite3 recount (OK/UNKNOWN/MISSING)', rs => rs.every(r => ['OK', 'UNKNOWN', 'MISSING'].every(k => r.road.counts[k] === r.sql.c[k]) && r.road.n === r.sql.n))
    .invariant('every OK code exists in the shipped std_values.json (independent normaliser)', rs => rs.every(r => r.road.okCodes.every(c => c.split('&').map(nrm).every(p => STD.signs.some(s => nrm(s.code) === p)))))
    .invariant('tree: level-1 order UNKNOWN, MISSING, OK (non-empty only), OK collapsed, counts == verdict counts, no level 2 under UNKNOWN/MISSING', rs => rs.every(r => {
      const o = r.road.lvl1.map(x => x.v), want = ['UNKNOWN', 'MISSING', 'OK'].filter(v => r.road.counts[v] > 0);
      return JSON.stringify(o) === JSON.stringify(want) && r.road.lvl1.every(x => x.n === r.road.counts[x.v] && (x.v === 'OK' ? !x.open : x.open)) && !r.road.unknownHasLvl2; }))
    .invariant('tree: level-3 shows "<code> ×<n>" matching the recount for every OK code', rs => rs.every(r => Object.keys(r.sql.byCode).every(c => r.road.lvl3.some(t => t.replace(/\s+/g, ' ') === c + ' ×' + r.sql.byCode[c]))))
    .invariant('click a sign row: camera target lands on that GUID mesh centre (<0.05 m) and the detail card shows', rs => rs.every(r => r.road.click && r.road.click.dist < 0.05 && r.road.click.card.length > 0))
    .invariant('Settings override dropping one OK code: exactly its signs flip OK->UNKNOWN', rs => rs.every(r => r.road.dropFlipped && r.road.dropN > 0 && r.road.after.OK === r.road.counts.OK - r.road.dropN && r.road.after.UNKNOWN === r.road.counts.UNKNOWN + r.road.dropN))
    .invariant('§SIGN_VS_SPEED link (issue: a rule whose sign code never occurs would be silently vacuous): every advance_placement rule code is a row of the ATJ 2A table whose name says AHEAD, its hazard is a geometric.node_kinds key, and the model carries >=1 sign with each rule code (independent recount of the OK codes)', rs => rs.every(r => {
      const AP = STD.advance_placement; if (!AP || !AP.rules.length) return false;
      const have = Object.keys(r.sql.byCode).flatMap(c => c.split('&').map(nrm));
      console.log('§SIGN_ADVANCE_LINK rules=' + AP.rules.map(x => x.code + ':' + x.hazard + ':' + (STD.signs.find(q => nrm(q.code) === nrm(x.code)) || {}).name + ':n=' + have.filter(h => h === nrm(x.code)).length).join(' '));
      return AP.rules.every(x => { const row = STD.signs.find(q => nrm(q.code) === nrm(x.code)); return row && /AHEAD/.test(row.name) && STD.geometric.node_kinds.includes(x.hazard) && have.filter(h => h === nrm(x.code)).length > 0; }); }))
    .invariant('Inspect drawer: road has the "Road standards  ·  j" row directly after Measure; Duplex has no such row', rs => rs.every(r => r.road.drawer.found && r.road.drawer.ids.indexOf('drawer-row-roadstd') === r.road.drawer.ids.indexOf('drawer-row-measure') + 1 && /Road standards\s+·\s+j/.test(r.road.drawer.label) && r.dup.drawer.found && r.dup.drawer.ids.indexOf('drawer-row-roadstd') < 0 && r.dup.drawer.ids.indexOf('drawer-row-measure') >= 0))
    .invariant('Duplex: not civil, no panel, SIGNAGE-less => VACUOUS (not a pass of anything)', rs => rs.every(r => !r.dup.civil && r.dup.opened === null && !r.dup.panel && r.dup.vacuous === true && r.dup.reason === 'no-elements'))
    .redControl(rs => rs.map(r => Object.assign({}, r, { road: Object.assign({}, r.road, { counts: Object.assign({}, r.road.counts, { OK: r.road.counts.OK + 1 }) }) })))
    .run();
  console.log = _c;
  await new Promise(r => logStream.end(r));
})();
