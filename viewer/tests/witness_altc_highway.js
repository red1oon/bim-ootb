#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §ALTC_HIGHWAY (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_HIGHWAY). Read the log.
// ISSUE (user 2026-10-05): "alt-c to give more realistic daytime (perhaps late evening) with lamps on and hitting surface …
// special treatment for outdoor CW roads". Before: the film plan dived to the bbox CENTRE of a 2 km road and left through a
// "facade" (no road), under a 55° → 6° sun. PROVES OR DISPROVES WITHOUT A BAKE (no film is rendered — bakes need the user's
// go): (1) the civil plan's waypoints ARE the Fly route (A.civilRoutePath), settle = route start; (2) the sun arc reads
// 15° at tNorm 0 and 6° at 1 on the road, 55° → 6° on a building (A._sunArcStep's return); (3) Duplex plan has no road
// seeding (non-impact); (4) the road film is paced at the Fly speed (was 1243 s at the 2.3 m/s interior walk). NOT judged here: the interior-lights gate and lamp cap run only inside a bake loop (code-read only).
// Env: BLD_DIR · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(path.join(__dirname, '..', '..'));
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const PORT = +(process.env.PORT || 8585), LOG = process.env.LOG || '/tmp/witness_altc_highway.log';
const out = []; const log = l => { out.push(l); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/jel/')) fp = path.join(BLD_DIR, u.slice(5));
  if (!fs.existsSync(fp)) { const alt = path.join('/home/red1/bim-ootb', u); if (fs.existsSync(alt)) fp = alt; else { res.writeHead(404); res.end(); return; } }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size }); fs.createReadStream(fp).pipe(res);
} catch (e) { res.writeHead(500); res.end(); } });
async function probe(b, url, tag) {
  const p = await b.newPage(); const con = [];
  p.on('console', m => { const t = m.text(); if (/§ALTC_HIGHWAY|§SUN_ARC_STEP|§CINEMA_PACING/.test(t)) con.push(t); });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 600000 });
  let ok = false;
  for (let i = 0; i < 900 && !ok; i++) { await new Promise(r => setTimeout(r, 1000)); try { ok = await p.evaluate(() => !!(window.APP && APP.db && APP.streaming === false && Object.keys(APP.guidMap || {}).length && (!APP.isCivilModel || !APP.isCivilModel() || APP._civilLabels))); } catch (e) {} }
  if (!ok) { await p.close(); return null; }
  const r = await p.evaluate(() => {
    const civil = !!(APP.isCivilModel && APP.isCivilModel());
    const plan = APP.cinemaPathPlan(60);
    const R = civil && APP.civilRoutePath ? APP.civilRoutePath() : null;
    const wp = (plan && plan.waypoints) || [];
    let wpMatch = 0; if (R) wp.forEach((w, i) => { const q = R.path[i]; if (q && Math.hypot(w.x - q.x, w.y - q.y, w.z - q.z) < 0.01) wpMatch++; });
    const st = plan && plan.settle, s0 = R && R.path[0];
    const settleToStart = (st && s0) ? Math.hypot(st.x - s0.x, st.z - s0.z) : null;
    const el0 = APP._sunArcStep(0), el1 = APP._sunArcStep(1);
    // §ALTC_ONEWAY: the SAME plan with Reveal ticked (road: seeded with its route, as the editor does; building: derived)
    const ovR = civil && R ? { waypoints: R.path.map(p => ({ x: p.x, y: p.y, z: p.z })), reveal: true } : { reveal: true };
    const pr = APP.cinemaPathPlan(60, ovR);
    const rv = (pr && pr.reveal) || {};
    return { civil, wp: wp.length, routePts: R ? R.path.length : 0, wpMatch, settleToStart: settleToStart == null ? null : +settleToStart.toFixed(2),
      el0: +(+el0).toFixed(1), el1: +(+el1).toFixed(1), naturalTotal: plan && plan.naturalTotal ? +plan.naturalTotal.toFixed(1) : null,
      revealTotal: pr && pr.naturalTotal ? +pr.naturalTotal.toFixed(1) : null, revealRound2Sec: rv.roundSec != null ? +(+rv.roundSec).toFixed(1) : null,
      revealFlybackSec: rv.flybackSec != null ? +(+rv.flybackSec).toFixed(1) : null, revealTailSec: rv.tailSec != null ? +(+rv.tailSec).toFixed(1) : null };
  });
  r.lines = con.filter(l => /§ALTC_HIGHWAY/.test(l)).slice(0, 2);
  const pc = con.filter(l => /§CINEMA_PACING/.test(l)).pop() || ''; const wm = pc.match(/\(walk [0-9.]+m @([0-9.]+)m\/s/);
  r.walkMps = wm ? +wm[1] : null; r.pacing = pc.slice(0, 200);
  log('  [' + tag + '] ' + JSON.stringify(r)); await p.close(); return r;
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ach-')), protocolTimeout: 1800000,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=8192'] });
  const base = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=`;
  const road = await probe(b, base + '/jel/JELAPANG.db', 'road');
  const bld = await probe(b, base + 'buildings/Duplex_extracted.db', 'building');
  if (!road || !bld) { log('§WITNESS_ALTC_HIGHWAY INCONCLUSIVE — a model never loaded'); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); }
  const checks = [
    ['road model detected as civil (else nothing judged)', road.civil === true],
    ['road film waypoints ARE the Fly route (every point within 1 cm)', road.routePts >= 2 && road.wp === road.routePts && road.wpMatch === road.routePts],
    ['road film settles at the route start (< 1 m)', road.settleToStart != null && road.settleToStart < 1],
    ['road sun arc 15° → 6° (late afternoon → dusk)', road.el0 === 15 && road.el1 === 6],
    ['building not seeded with a road (no §ALTC_HIGHWAY line)', bld.civil === false && bld.lines.length === 0],
    ['building sun arc unchanged 55° → 6°', bld.el0 === 55 && bld.el1 === 6],
    ['road film cruise 35 m/s (§ALTC_ONEWAY) — was 2.3 m/s interior walk (1243 s)', road.walkMps === 35],
    ['§ALTC_ONEWAY road film WITH Reveal under 3 min, one drive (round 2 + fly-back = 0, tail kept)', road.revealTotal < 180 && road.revealRound2Sec === 0 && road.revealFlybackSec === 0 && road.revealTailSec > 0],
    ['building Reveal still flies its second lap (non-impact)', bld.revealRound2Sec > 0 && bld.revealFlybackSec > 0],
    ['building film pace unchanged (2.3 m/s interior walk)', bld.walkMps === 2.3],
  ];
  let fail = 0; checks.forEach(([n, v]) => { if (!v) fail++; log('  ' + (v ? 'PASS ' : 'FAIL ') + n); });
  log('§WITNESS_ALTC_HIGHWAY ' + (fail ? 'FAIL ' : 'PASS ') + (checks.length - fail) + '/' + checks.length);
  fs.writeFileSync(LOG, out.join('\n') + '\n'); await b.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { log('CRASH ' + e.stack); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); });
