#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CHAINAGE_LEVELS (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md 2f). Read the log, not the exit code.
// ISSUE (user 2026-10-05): "street lights are right away up even though build up is checked" / "the build path is hardcoded to
// MEP or building structure" / "make the buildup chainage". Measured cause: on a road+bridge merge the build ladder = the
// BRIDGE's storeys by height (§GANTT_STOREY_Z) → lamp columns in band 0. PROVES OR DISPROVES from what Time Machine's REAL
// generator writes (window.tmGenerateTimeline → kernel_ops ELEMENT_PLACE timestamp = start, parameters._end_ts = end), NOT from
// the module's own log: (1) per chainage section, no LIGHTING column starts before that section's ROAD (pavement) starts;
// (2) sections build in route order — rank correlation of a section's first ROAD start vs its chainage index;
// (3) the first 2 % of all placements contain no LIGHTING. Section of an element = nearest point of app.civilRoutePath (the
// route owner) — the same location source the code uses, but the ORDER is judged from the written timestamps.
// INCONCLUSIVE when the model is not civil or no placements were written. Env: BLD (JELAPANG) · BLD_DIR · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'JELAPANG', BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads');
const PORT = +(process.env.PORT || 8597), LOG = process.env.LOG || '/tmp/witness_civil_chainage_buildup.log';
const out = []; const log = l => { out.push(l); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/jel/')) fp = path.join(BLD_DIR, u.slice(5));
  if (!fs.existsSync(fp)) { const a = path.join('/home/red1/bim-ootb', u); if (fs.existsSync(a)) fp = a; else { res.writeHead(404); res.end(); return; } }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size }); fs.createReadStream(fp).pipe(res);
} catch (e) { res.writeHead(500); res.end(); } });
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'chb-')), protocolTimeout: 3600000,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=8192'] });
  const p = await b.newPage(); const con = [];
  p.on('console', m => { const t = m.text(); if (/§CHAINAGE_LEVELS|§CHAINAGE_E1|§CPM_DISPLAY|§GANTT_STOREY_Z|§4D_BAND_MONOTONIC|§CPM_RUN|§GANTT_SOURCE|§CIVIL_PHASE/.test(t)) { con.push(t.slice(0, 400)); log('  [con] ' + t.slice(0, 260)); } });
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/jel/${BLD}.db`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  let ok = false;
  for (let i = 0; i < 900 && !ok; i++) { await new Promise(r => setTimeout(r, 1000)); try { ok = await p.evaluate(() => !!(window.APP && APP.db && APP.streaming === false && Object.keys(APP.guidMap || {}).length && typeof window.tmGenerateTimeline === 'function' && APP._civilLabels)); } catch (e) {} }
  if (!ok) { log('§WITNESS_CIVIL_CHAINAGE INCONCLUSIVE — model/generator never ready'); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); }
  const r = await p.evaluate(async () => {
    const A = APP;
    if (!(A.isCivilModel && A.isCivilModel())) return { civil: false };
    await window.tmGenerateTimeline();
    const q = A.db.exec("SELECT k.output_guid, k.timestamp, k.parameters, m.discipline, t.center_x, t.center_y, t.center_z FROM kernel_ops k " +
      "JOIN elements_meta m ON m.guid = k.output_guid JOIN element_transforms t ON t.guid = k.output_guid WHERE k.op_type = 'ELEMENT_PLACE'");
    const rows = q.length ? q[0].values : [];
    // §CHAINAGE_V2: section = where the element STARTS along the DRIVE route (A.civilDriveRoute, the film's seed direction):
    // the lowest route index over its drawn box's plan corners — the code's location rule; the ORDER is still judged from
    // the written timestamps. Rank correlation is therefore expected POSITIVE (built in drive order).
    const P = (A.civilDriveRoute && A.civilDriveRoute()) || A.civilRoutePath().path;
    const near = (x, z) => { let bi = 0, bd = Infinity; P.forEach((p, k) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; bi = k; } }); return bi; };
    const secG = {};
    const sec = (x, y, z, g) => { if (g in secG) return secG[g]; const wb = A._loadPathInstanceWorldBox ? A._loadPathInstanceWorldBox(g) : null;
      let k; if (wb) k = Math.min(near(wb.minX, wb.minZ), near(wb.minX, wb.maxZ), near(wb.maxX, wb.minZ), near(wb.maxX, wb.maxZ)); else { const v = A.ifc2three(x, y, z); k = near(v.x, v.z); }
      return (secG[g] = k); };
    const S = {}; const all = [];
    rows.forEach(r => { const st = +r[1], pr = JSON.parse(r[2] || '{}'), en = +pr._end_ts || st, d = r[3], k = sec(r[4], r[5], r[6], r[0]);
      all.push({ st, d });
      const s = S[k] || (S[k] = { roadMin: Infinity, litMin: Infinity, litBeforeRoad: 0, lit: 0 });
      if (d === 'ROAD') s.roadMin = Math.min(s.roadMin, st);
      if (d === 'LIGHTING') { s.lit++; s.litMin = Math.min(s.litMin, st); } });
    rows.forEach(r => { if (r[3] !== 'LIGHTING') return; const k = sec(r[4], r[5], r[6], r[0]); if (+r[1] < S[k].roadMin) S[k].litBeforeRoad++; });
    let litBefore = 0, litTot = 0, judgedSecs = 0; const ser = [];
    Object.keys(S).forEach(k => { const s = S[k]; if (s.lit && isFinite(s.roadMin)) { judgedSecs++; litBefore += s.litBeforeRoad; litTot += s.lit; } if (isFinite(s.roadMin)) ser.push([+k, s.roadMin]); });
    // Spearman rank correlation, section index vs first-ROAD start
    const rk = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r2 = []; o.forEach((e, i) => r2[e[1]] = i); return r2; };
    const ra = rk(ser.map(x => x[0])), rb = rk(ser.map(x => x[1])); const n = ser.length;
    const rho = n > 1 ? 1 - 6 * ra.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0) / (n * (n * n - 1)) : null;
    all.sort((a, b) => a.st - b.st); const first = all.slice(0, Math.max(1, Math.floor(all.length * 0.02)));
    return { civil: true, placements: rows.length, sections: Object.keys(S).length, judgedSecs, litTot, litBefore, rho: rho == null ? null : +rho.toFixed(3),
      first2pctLighting: first.filter(x => x.d === 'LIGHTING').length, first2pctN: first.length,
      first2pctMix: Object.entries(first.reduce((m, x) => (m[x.d] = (m[x.d] || 0) + 1, m), {})).map(e => e.join(':')).join(',') };
  });
  log('  [state] ' + JSON.stringify(r));
  const checks = r.civil && r.placements ? [
    ['every judged section: no LIGHTING column starts before its pavement (ROAD) starts', r.judgedSecs > 0 && r.litBefore === 0],
    ['sections build in DRIVE order (rank corr. of first-ROAD start vs drive section ≥ 0.8)', r.rho != null && r.rho >= 0.8],
    ['the first 2 % of placements contain no LIGHTING (lamps-first gone)', r.first2pctLighting === 0],
  ] : null;
  if (!checks) { log('§WITNESS_CIVIL_CHAINAGE INCONCLUSIVE — ' + (r.civil ? 'no placements written' : 'model not civil')); fs.writeFileSync(LOG, out.join('\n') + '\n'); await b.close(); server.close(); process.exit(2); }
  let fail = 0; checks.forEach(([n, v]) => { if (!v) fail++; log('  ' + (v ? 'PASS ' : 'FAIL ') + n); });
  log('§WITNESS_CIVIL_CHAINAGE ' + (fail ? 'FAIL ' : 'PASS ') + (checks.length - fail) + '/' + checks.length);
  fs.writeFileSync(LOG, out.join('\n') + '\n'); await b.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { log('CRASH ' + e.stack); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); });
