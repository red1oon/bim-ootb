#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CIVIL_ROUTE_SMOOTH / §CIVIL_ROUTE_JUNCTION (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §FLY).
// Read the log after every run — the exit code is not evidence.
// ISSUES (user 2026-10-05): "the Fly is jerky … moves facing backwards" and "it should orbit from junction to junction, but
// instead it backs away and returns to the same". PROVES OR DISPROVES from the tour ACTIONS A._civilRouteTour() returns
// (what the Fly player executes), not from the module's log: (1) no heading change > 30° between consecutive flyPath
// points; (2) no flyPath leg that goes BACK along the route (each leg's start index ≥ the previous leg's end);
// (3) orbits = junctions — no two orbit centres within 150 m of each other. INCONCLUSIVE if the tour is not the civil route.
// Env: BLD (default JELAPANG) · BLD_DIR · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'JELAPANG', BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const PORT = +(process.env.PORT || 8583), LOG = process.env.LOG || '/tmp/witness_civil_fly_route.log';
const out = []; const log = l => { out.push(l); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice(11));
  if (!fs.existsSync(fp)) { const alt = path.join('/home/red1/bim-ootb', u); if (fs.existsSync(alt)) fp = alt; else { res.writeHead(404); res.end(); return; } }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size }); fs.createReadStream(fp).pipe(res);
} catch (e) { res.writeHead(500); res.end(); } });
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cfr-')), protocolTimeout: 1800000,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=8192'] });
  const p = await b.newPage(); const con = [];
  p.on('console', m => { const t = m.text(); if (/§CIVIL_ROUTE/.test(t)) { con.push(t); log('  [con] ' + t); } });
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  let ok = false;
  for (let i = 0; i < 900 && !ok; i++) { await new Promise(r => setTimeout(r, 1000)); try { ok = await p.evaluate(() => !!(window.APP && APP.db && APP._civilLabels && APP.streaming === false && Object.keys(APP.guidMap || {}).length)); } catch (e) {} }
  if (!ok) { log('§WITNESS_CIVIL_FLY_ROUTE INCONCLUSIVE — model never ready'); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); }
  const r = await p.evaluate(() => {
    const acts = APP._civilRouteTour() || [];
    const legs = acts.filter(a => a.type === 'flyPath'), orb = acts.filter(a => a.type === 'orbit');
    let turns = 0, maxTurn = 0;
    legs.forEach(l => { const P = l.points; for (let j = 1; j < P.length - 1; j++) { const ax = P[j].x - P[j - 1].x, az = P[j].z - P[j - 1].z, bx = P[j + 1].x - P[j].x, bz = P[j + 1].z - P[j].z, la = Math.hypot(ax, az), lb = Math.hypot(bx, bz); if (la < 1e-6 || lb < 1e-6) continue; const d = Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / la / lb))) * 180 / Math.PI; if (d > 30) turns++; maxTurn = Math.max(maxTurn, d); } });
    // back-tracking: each leg must start where the previous leg ended (forward along one route)
    let back = 0; for (let k = 1; k < legs.length; k++) { const a = legs[k - 1].points, bb = legs[k].points; const e = a[a.length - 1], s = bb[0]; if (Math.hypot(e.x - s.x, e.z - s.z) > 1) back++; }
    let close = 0; for (let i = 0; i < orb.length; i++) for (let j = i + 1; j < orb.length; j++) if (Math.hypot(orb[i].cx - orb[j].cx, orb[i].cz - orb[j].cz) < 150) close++;
    return { actions: acts.map(a => a.type + (a.name ? ':' + a.name : '')), legs: legs.length, orbits: orb.length, radii: orb.map(o => Math.round(o.radius)), turns, maxTurn: +maxTurn.toFixed(1), back, close };
  });
  log('  [state] ' + JSON.stringify(r));
  const civ = con.some(l => /§CIVIL_ROUTE src=/.test(l));
  const checks = [
    ['tour is the civil route (else INCONCLUSIVE)', civ && r.legs > 0],
    ['no heading change > 30° along any flyPath (jerk / facing backwards)', r.turns === 0],
    ['every leg continues forward from the previous leg end (no back-and-forth)', r.back === 0],
    ['orbits are distinct junctions (no two centres within 150 m)', r.orbits > 0 && r.close === 0],
  ];
  let fail = 0; checks.forEach(([n, v]) => { if (!v) fail++; log('  ' + (v ? 'PASS ' : 'FAIL ') + n); });
  log('§WITNESS_CIVIL_FLY_ROUTE ' + (civ ? (fail ? 'FAIL ' : 'PASS ') + (checks.length - fail) + '/' + checks.length : 'INCONCLUSIVE'));
  fs.writeFileSync(LOG, out.join('\n') + '\n'); await b.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { log('CRASH ' + e.stack); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); });
