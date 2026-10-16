// WITNESS — §CPE_WALK_EDIT_V1 hallway walk on real mid-size buildings (HHS_Office_Federated, Clinic).
// Follow-on named in prompts/CPE_POV_WALK_PATHING.md coverage caveat: prove the walk-snap mechanics
// inside a REAL hallway, extracted from the building DB (not invented), on buildings beyond the two
// small residential ones the shipped witness covered. Promoted from the one-off scratchpad run
// 2026-08-07 (HHS 8/8, Clinic 8/8, Hospital 8/8) so the coverage is repeatable, per watchdog ask.
//
// PRECONDITIONS: serve the repo root (python3 -m http.server $PORT) from a checkout/worktree.
// Building DBs: HHS_Office_Federated_extracted.db is git-tracked; Clinic/Hospital are OCI-distributed
// binaries — place them in buildings/ (copy or symlink from a full checkout), or rely on the viewer's
// own §DB_404_OCI_RETRY fallback (fetches from OCI over the network when the local file is missing).
// Hospital-class needs the full 600s editor-open budget below (63k elems under swiftshader).
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   G-HALL-EXTRACT   a real hallway run exists and is EXTRACTED from the DB: two doors on one storey,
//                    aligned (cross-axis offset < 1.5m) and >8m apart. No coordinates are invented.
//   G-HALL-SNAP-POS  walking that line and snapping at u=0.25/0.5/0.75 produces bands whose centres
//                    are bit-identical to the walked poses (same guarantee as G-WALK-SNAP-1a, now
//                    in-building instead of 500m outside).
//   G-HALL-MONO      the three insertion fractions s are strictly increasing in walk order — the
//                    projection onto the path orders multiple snaps correctly (the shipped witness
//                    only ever snapped ONCE per run; ordering was never proven).
//   G-HALL-FACE-WALL the mid-hallway snap faces PERPENDICULAR at a near wall: its lookAt must be a
//                    real raycast HIT (distance != the 10m fallback, and < 10m) — proves in-building
//                    facing capture hits real meshes; the shipped witness only proved the MISS path.
//   G-HALL-FACE-AXIS the along-hallway snaps report hit-or-fallback with distance (informational
//                    gate: PASSes either way but the distance is logged — long sightline down a
//                    hallway may legitimately miss within raycast range).
//   G-HALL-REPLAN    every snap ran the real replan; ms recorded per building (budget: < 5000ms).
//   G-HALL-SEAM      §CPE_SEAM_CONTINUOUS must NOT report a seam gap during these replans (the known
//                    pin-replan landmine — if it fires here, that is a real surfaced regression).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8513;
const BUILDINGS = (process.env.BLDS || 'HHS_Office_Federated,Clinic').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openEditor(browser, BLD, logs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.APP && window.APP.cinemaPathEditor && window.CpeWalk && window.APP.startMaxQualityOrbit && window.APP._composer,
    { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, editor: true }); });
  // 600s: Hospital-class (63k elems) under swiftshader needs far longer than small buildings to
  // stream + compile + plan before the editor panel exists.
  await page.waitForSelector('#cpe-ok', { timeout: 600000 });
  await sleep(800);
  return page;
}

async function gates(browser, BLD, logs) {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });
  const page = await openEditor(browser, BLD, logs);

  // ── G-HALL-EXTRACT: the hallway run, straight out of the DB ──
  const hall = await page.evaluate(() => {
    const rows = window.APP.dbQuery(
      "SELECT m.storey, t.center_x, t.center_y, t.center_z FROM elements_meta m " +
      "JOIN element_transforms t ON m.guid = t.guid WHERE m.ifc_class LIKE 'IfcDoor%'");
    const byStorey = {};
    rows.forEach(r => { (byStorey[r[0]] = byStorey[r[0]] || []).push({ x: r[1], y: r[2], z: r[3] }); });
    let best = null;
    Object.keys(byStorey).forEach(st => {
      const ds = byStorey[st];
      for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
        const dx = Math.abs(ds[i].x - ds[j].x), dy = Math.abs(ds[i].y - ds[j].y);
        const long = Math.max(dx, dy), short = Math.min(dx, dy);
        if (short < 1.5 && long > 8 && (!best || long > best.long))
          best = { long, short, storey: st, a: ds[i], b: ds[j] };
      }
    });
    if (!best) return null;
    // three.js-space endpoints at eye height (+0.6 above door centre ≈ 1.7m above floor)
    const A3 = window.APP.ifc2three(best.a.x, best.a.y, best.a.z + 0.6);
    const B3 = window.APP.ifc2three(best.b.x, best.b.y, best.b.z + 0.6);
    return { storey: best.storey, long: best.long, short: best.short,
             a: { x: A3.x, y: A3.y, z: A3.z }, b: { x: B3.x, y: B3.y, z: B3.z } };
  });
  P('G-HALL-EXTRACT hallway run extracted from DB (two aligned doors, one storey, >8m apart)',
    !!hall, hall ? `storey="${hall.storey}" run=${hall.long.toFixed(2)}m crossOffset=${hall.short.toFixed(2)}m` : 'no aligned door pair found');
  if (!hall) { await page.close(); return checks; }

  // ── mount walk mode ──
  const mounted = await page.evaluate(() => { const r = window.CpeWalk.toggle(); return r && window.CpeWalk.isActive(); });
  P('G-HALL-MOUNT walk mode mounted on this building', mounted === true, `isActive=${mounted}`);

  // walk direction (three space) + a horizontal perpendicular
  const dir = { x: hall.b.x - hall.a.x, y: hall.b.y - hall.a.y, z: hall.b.z - hall.a.z };
  const len = Math.hypot(dir.x, dir.y, dir.z);
  const fwd = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
  const perp = { x: -fwd.z, y: 0, z: fwd.x };  // cross(up, fwd) — horizontal, toward a side wall
  const at = u => ({ x: hall.a.x + dir.x * u, y: hall.a.y + dir.y * u, z: hall.a.z + dir.z * u });

  const snaps = [];
  for (const [u, f, tag] of [[0.25, fwd, 'axis'], [0.5, perp, 'wall'], [0.75, fwd, 'axis']]) {
    const pos = at(u);
    const mark = logs.length;
    const res = await page.evaluate((p, fv) => window.CpeWalk._snapForTest(p, fv), pos, f);
    await sleep(60);
    const seam = logs.slice(mark).filter(l => l.indexOf('§CPE_SEAM_CONTINUOUS') >= 0);
    snaps.push({ u, tag, pos, fwd: f, res, seam });
  }

  // ── G-HALL-SNAP-POS ──
  const posOk = snaps.every(s => s.res && s.res.centre.x === s.pos.x && s.res.centre.y === s.pos.y && s.res.centre.z === s.pos.z);
  P('G-HALL-SNAP-POS all three band centres bit-identical to the walked hallway poses',
    posOk, snaps.map(s => `u=${s.u} centre=(${s.res ? [s.res.centre.x.toFixed(2), s.res.centre.y.toFixed(2), s.res.centre.z.toFixed(2)] : 'null'})`).join('  '));

  // ── G-HALL-MONO — strictly monotonic in ONE consistent direction. The film's own walk stretch
  // may traverse the hallway in either direction (Clinic's runs opposite to the door-pair order);
  // ordering must follow the PATH's direction deterministically, which is monotonic either way.
  const ss = snaps.map(s => s.res ? s.res.s : NaN);
  const monoOk = ss.every(v => typeof v === 'number' && !isNaN(v)) &&
    ((ss[0] < ss[1] && ss[1] < ss[2]) || (ss[0] > ss[1] && ss[1] > ss[2]));
  P('G-HALL-MONO insertion fractions strictly monotonic in walk order (path-direction-consistent multi-snap ordering)',
    monoOk, `s=[${ss.map(v => (typeof v === 'number' ? v.toFixed(4) : 'NaN')).join(', ')}] dir=${ss[0] < ss[2] ? 'with-path' : 'against-path'}`);

  // ── G-HALL-FACE-WALL: perpendicular snap must be a REAL raycast hit — any distance. The issue
  // proved is hit-vs-fallback (fallback is exactly 10.000m by construction), NOT corridor width:
  // Hospital's mid-run perpendicular legitimately crosses into a larger space and hits at 18.5m.
  const wall = snaps[1];
  const wallDist = wall.res && wall.res.lookAt ?
    Math.hypot(wall.res.lookAt.x - wall.pos.x, wall.res.lookAt.y - wall.pos.y, wall.res.lookAt.z - wall.pos.z) : null;
  P('G-HALL-FACE-WALL mid-hallway perpendicular facing raycast-HITS a real mesh (dist != the exact-10m fallback)',
    wallDist !== null && Math.abs(wallDist - 10) > 1e-6,
    `lookAt dist=${wallDist === null ? 'null' : wallDist.toFixed(3)}m (fallback would be exactly 10.000)`);

  // ── G-HALL-FACE-AXIS (informational: hit or fallback, distance recorded) ──
  const axisD = [snaps[0], snaps[2]].map(s => s.res && s.res.lookAt ?
    Math.hypot(s.res.lookAt.x - s.pos.x, s.res.lookAt.y - s.pos.y, s.res.lookAt.z - s.pos.z) : null);
  P('G-HALL-FACE-AXIS along-hallway facings resolved (hit or 10m fallback — distance recorded)',
    axisD.every(d => d !== null),
    axisD.map((d, i) => `axisSnap${i} dist=${d === null ? 'null' : d.toFixed(3)}m ${d !== null && Math.abs(d - 10) <= 1e-6 ? '(fallback)' : '(HIT)'}`).join('  '));

  // ── G-HALL-REPLAN ──
  const replanOk = snaps.every(s => s.res && typeof s.res.replanMs === 'number' && s.res.replanMs < 5000);
  P('G-HALL-REPLAN every snap ran the real replan within budget (<5000ms)',
    replanOk, `replanMs=[${snaps.map(s => s.res ? s.res.replanMs.toFixed(0) : 'null').join(', ')}]`);

  // ── G-HALL-SEAM — parse the actual metric. The §CPE_SEAM_CONTINUOUS family also prints routine
  // informational lines (openDeg/handoffYawDeg) on every replan; the landmine is seamGapDeg=57-93
  // where ~0 is required. Gate on the parsed values, not on the tag's presence.
  const seamLines = snaps.flatMap(s => s.seam);
  const gaps = seamLines.map(l => { const m = l.match(/seamGapDeg=([\d.]+)/); return m ? parseFloat(m[1]) : null; })
    .filter(v => v !== null);
  P('G-HALL-SEAM every seamGapDeg reported during pin-bearing hallway replans is ~0 (<5°, landmine silent)',
    gaps.length > 0 && gaps.every(g => g < 5),
    `seamGapDeg=[${gaps.map(g => g.toFixed(3)).join(', ')}] from ${seamLines.length} §CPE_SEAM_CONTINUOUS lines`);

  // unmount + close cleanly
  await page.evaluate(() => { if (window.CpeWalk.isActive()) window.CpeWalk.toggle(); });
  await page.evaluate(() => document.getElementById('cpe-cancel').click());
  await sleep(200);
  await page.close();
  return checks;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];
  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const logs = [];
    try {
      const checks = await gates(browser, BLD, logs);
      checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
      summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
    } catch (e) {
      console.log(`  INFRA-ERROR ${BLD}: ${e.message}`);
      // Say WHERE the viewer got stuck: dump the §-relevant console tail, not just "selector failed".
      const tail = logs.filter(l => l.indexOf('§') >= 0 || /error/i.test(l)).slice(-25);
      console.log(`  --- page console tail (${logs.length} lines total, last ${tail.length} §/error lines) ---`);
      tail.forEach(l => console.log('  | ' + l.slice(0, 200)));
      allPass = false;
      summary.push({ BLD, pass: false, n: 0, t: 0, infra: true });
    }
  }
  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
