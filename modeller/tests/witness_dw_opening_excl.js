#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DW-OPENING-EXCL
 * SCOPE: bim-compiler prompts/FUNCTIONAL_SPACES_ENSEMBLE.md §OPENING-EXCL (2026-07-13, Task A) —
 * axis-based opening exclusion: hostBind SIDE wall-mounts (switches/outlets) must land on SOLID
 * wall, never inside a real door/window opening's 2D interval (run axis AND z).
 * ISSUES THIS WITNESS PROVES/DISPROVES:
 *  (A) How many CURRENT production placements does _onSolidWall flag, STRATIFIED per building
 *      (flagged = §DW-OPENING-SLIDE + §DW-OPENING-REFUSE lines — one per placement)? Duplex's own
 *      18 REAL devices are the measured negative control (18/18 solid, logs/poc_opening_duplex.log)
 *      — the check itself is POC-validated before this fleet run trusts it.
 *  (B) AFTER the fix, ZERO committed side-mounted placements may remain inside any opening
 *      (independent in-page recheck via the exported _wallOpenings/_onSolidWall on a fresh DB
 *      handle — not trusting the walk's own logs for the final state).
 *  (C) Committed counts must equal the §SPACE-GATE baseline minus opening-REFUSALS only (slides
 *      preserve count) — the check must not silently change fleet counts any other way.
 *  (D) Task B measurement (spacing-rule path audit, MEASURE-not-fix): pairwise measured-bbox
 *      overlap count over the committed placements per building, stratified by prov pair — the
 *      schedule path has rule_code_spacing + the §W7 clearance slide; legacy place() and
 *      placeMeasured() have NEITHER, this quantifies what that gap costs today.
 * Read the log after every run — exit code alone is not evidence.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

// Committed AFTER-counts from W-DW-SPACE-GATE (logs/wdwsg_GATE_AFTER.log, this branch) — the
// baseline this run's committed counts are diffed against (delta must be -openingRefused only).
const BASE = { SampleHouse: 24, HHS: 545, Duplex: 102, SampleCastle: 325, Terminal: 896, Clinic: 406, HospitalGarage: 2756, Hospital: 3190 };

async function runOne(pg, key, consoleLines) {
  console.log(`\n═══ ${key} ═══`);
  const mark = consoleLines.length;
  await pg.click('#b-open'); await sleep(200);
  await pg.click(`#m-open-panel .mo-row[data-key="${key}"]`);
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 60000 }).catch(() => {});
  await sleep(4000);
  await pg.evaluate((b) => window.discWalk('ELEC', { building: b }), key);
  const walked = await pg.waitForFunction((d) => window.__dwLastCommitDisc === d, { timeout: 180000, polling: 250 }, 'ELEC').then(() => true).catch(() => false);
  await sleep(500);

  // (A) flagged count = §DW-OPENING-SLIDE/-REFUSE lines this building's walk emitted (1 per placement)
  let slid = 0, refusedOp = 0;
  for (let i = mark; i < consoleLines.length; i++) {
    if (consoleLines[i].includes('§DW-OPENING-SLIDE')) slid++;
    if (consoleLines[i].includes('§DW-OPENING-REFUSE')) refusedOp++;
  }

  // (B) independent recheck + (D) pairwise overlap measurement, in-page on the committed set
  const r = await pg.evaluate(() => {
    const pls = (window.__dwWalks && window.__dwWalks.ELEC) || [];
    const DW = window.DiscWalker;
    // (B) every committed side-mount rechecked against a FRESH DB handle
    const side = pls.filter(p => /-side$/.test(p.prov || '') && p.host);
    let inside = 0; const insideEx = [];
    // §DEVICE-FACING (Task C) recheck: every side-mount's yaw must equal the ROOM-SIDE
    // perpendicular convention (local +Y forward onto perp from the wall centreline to the
    // device — catalog conn_points face=BACK + forward_axis=Y). Recomputed independently here.
    let facingBad = 0, yawHist = {};
    if (side.length && window.__dwBuf) {
      const bdb = new window.SQL.Database(new Uint8Array(window.__dwBuf));
      let gdb = null; try { if (window.__dwGeoBuf) gdb = new window.SQL.Database(new Uint8Array(window.__dwGeoBuf)); } catch (e) { }
      const openings = DW._wallOpenings(bdb, gdb);
      const lineCache = {};
      side.forEach(p => {
        let L = lineCache[p.host];
        if (L === undefined) {
          const rs = bdb.exec("SELECT center_x, center_y, center_z, bbox_x, bbox_y, bbox_z, rotation_x, rotation_y, rotation_z FROM element_transforms WHERE guid='" + p.host + "'");
          if (!rs.length) { lineCache[p.host] = null; return; }
          const [cx, cy, cz, bx, by, bz, rx, ry, rot] = rs[0].values[0];
          const mid = DW._trueMidpoint(bdb, p.host, { x: cx, y: cy, z: cz, rx, ry, rot }, gdb);
          const horiz = bx >= by ? 0 : 1, hlen = (horiz === 0 ? bx : by) / 2, thick = horiz === 0 ? by : bx;
          const a = [mid.x, mid.y], b = [mid.x, mid.y]; a[horiz] -= hlen; b[horiz] += hlen;
          L = lineCache[p.host] = { a, b, horiz, thick, w: { tz: mid.z, bz } };
        }
        if (!L) return;
        const blk = DW._onSolidWall({ x: p.x, y: p.y, z: p.z }, L, openings);
        if (blk) { inside++; if (insideEx.length < 5) insideEx.push(p.host + '@z=' + p.z.toFixed(2) + ' in ' + blk.c); }
        // facing: perp from the wall centreline projection to the device = the room side
        const abx = L.b[0] - L.a[0], aby = L.b[1] - L.a[1], l2 = abx * abx + aby * aby;
        let t = l2 > 0 ? ((p.x - L.a[0]) * abx + (p.y - L.a[1]) * aby) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = L.a[0] + t * abx, cy = L.a[1] + t * aby;
        const expYaw = Math.atan2(p.y - cy, p.x - cx) - Math.PI / 2;
        let dy = (p.yaw || 0) - expYaw;
        while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        if (Math.abs(dy) > 1e-6) { facingBad++;
          if (!yawHist.__badEx) yawHist.__badEx = [];
          if (yawHist.__badEx.length < 5) yawHist.__badEx.push({ host: p.host, x: +p.x.toFixed(4), y: +p.y.toFixed(4),
            yaw: +((p.yaw || 0) * 180 / Math.PI).toFixed(2), expYawDeg: +(expYaw * 180 / Math.PI).toFixed(2),
            dyDeg: +(dy * 180 / Math.PI).toFixed(2), t, cx: +cx.toFixed(4), cy: +cy.toFixed(4) });
        }
        const deg = Math.round((p.yaw || 0) * 180 / Math.PI);
        yawHist[deg] = (yawHist[deg] || 0) + 1;
      });
      try { bdb.close(); } catch (e) { } try { if (gdb) gdb.close(); } catch (e) { }
    }
    // (D) pairwise measured-bbox overlap (same semantics as placeSchedule's _clashAt, 0.2 fallback)
    let overlaps = 0; const byProvPair = {};
    const provKey = p => (p.prov || '?').replace(/^(sched|shim|placed):.*/, '$1:' + ((p.prov || '').split(':')[1] || ''));
    for (let i = 0; i < pls.length; i++) for (let j = i + 1; j < pls.length; j++) {
      const a = pls[i], b = pls[j];
      if (Math.abs(a.z - b.z) >= ((a.bz || 0.2) + (b.bz || 0.2)) / 2) continue;
      if (Math.abs(a.x - b.x) >= ((a.bx || 0.2) + (b.bx || 0.2)) / 2) continue;
      if (Math.abs(a.y - b.y) >= ((a.by || 0.2) + (b.by || 0.2)) / 2) continue;
      overlaps++;
      const k = [provKey(a), provKey(b)].sort().join(' × ');
      byProvPair[k] = (byProvPair[k] || 0) + 1;
    }
    return { committed: pls.length, sideCount: side.length, inside, insideEx, overlaps, byProvPair, facingBad, yawHist };
  });

  const base = BASE[key];
  console.log(`§DWOE-${key} committed=${r.committed} (baseline ${base}) side=${r.sideCount} flagged=${slid + refusedOp} (slid=${slid} refused=${refusedOp}) recheck-inside=${r.inside}${r.insideEx.length ? ' ' + JSON.stringify(r.insideEx) : ''}`);
  console.log(`§DWOE-${key} §FACING facingBad=${r.facingBad} yawHist=${JSON.stringify(r.yawHist)}`);
  console.log(`§DWOE-${key} §TASKB pairwise-bbox-overlaps=${r.overlaps}${Object.keys(r.byProvPair).length ? ' ' + JSON.stringify(r.byProvPair) : ''}`);
  const pass = walked && r.inside === 0 && r.committed === base - refusedOp && r.facingBad === 0;
  console.log(`§DWOE-${key} ${pass ? 'PASS' : 'FAIL'} (walked=${walked} inside=${r.inside} facingBad=${r.facingBad} committed=${r.committed} expect=${base}-${refusedOp})`);
  return pass;
}

// Duplex forced-LEGACY leg: production Duplex takes the schedule path (no hostBind SIDE), so the
// ground-truth building never exercises the new check in the fleet loop above. This leg drives
// hostBind SIDE directly on Duplex (legacy walk, non-committed) — the building whose real devices
// measured 18/18 solid — and reports flagged counts there.
async function duplexLegacyLeg(pg, consoleLines) {
  console.log('\n═══ Duplex (forced legacy walk — hostBind SIDE ground-truth leg) ═══');
  const mark = consoleLines.length;
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 60000 }).catch(() => {});
  await sleep(4000);
  const r = await pg.evaluate(async () => {
    await window.DiscWalker.dwInit(window.SQL, './', window._dwRules('Duplex'));
    const bdb = new window.SQL.Database(new Uint8Array(window.__dwBuf));
    let gdb = null; try { if (window.__dwGeoBuf) gdb = new window.SQL.Database(new Uint8Array(window.__dwGeoBuf)); } catch (e) { }
    const w = window.DiscWalker.dwWalk('ELEC', bdb, 'Duplex', { geoDb: gdb || undefined });   // legacy: no schedule flag
    const hb = w.hostBind || {};
    try { bdb.close(); } catch (e) { } try { if (gdb) gdb.close(); } catch (e) { }
    return { placed: w.placed, refused: !!w.refused, hostBound: hb.bound || 0 };
  });
  let slid = 0, refusedOp = 0;
  for (let i = mark; i < consoleLines.length; i++) {
    if (consoleLines[i].includes('§DW-OPENING-SLIDE')) slid++;
    if (consoleLines[i].includes('§DW-OPENING-REFUSE')) refusedOp++;
  }
  console.log(`§DWOE-DuplexLegacy placed=${r.placed} hostBound=${r.hostBound} flagged=${slid + refusedOp} (slid=${slid} refused=${refusedOp})`);
  return !r.refused;
}

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1400, height: 950, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const consoleLines = [];
  pg.on('console', m => { const t = m.text(); consoleLines.push(t);
    if (/§(DW|WALK|SCHED|DISC)/.test(t)) console.log('  [pg] ' + t); });
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});

  const keys = (process.env.DWOE_BUILDINGS || Object.keys(BASE).join(',')).split(',').map(s => s.trim()).filter(Boolean);
  const results = {};
  for (let i = 0; i < keys.length; i++) {
    if (i > 0) {
      await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
      await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});
    }
    results[keys[i]] = await runOne(pg, keys[i], consoleLines);
  }
  // ground-truth leg (fresh page)
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});
  const legacyOk = await duplexLegacyLeg(pg, consoleLines);

  const allPass = keys.every(k => results[k]) && legacyOk;
  console.log('\nerrors=' + errs.length + (errs.length ? ' ' + JSON.stringify(errs) : ''));
  console.log('W-DW-OPENING-EXCL ' + (allPass ? 'PASS' : 'FAIL') + ' — ' + keys.map(k => k + '=' + (results[k] ? 'PASS' : 'FAIL')).join(' ') + ' DuplexLegacy=' + (legacyOk ? 'PASS' : 'FAIL'));
  await br.close(); server.close();
  process.exit(allPass && errs.length === 0 ? 0 : 1);
})();
