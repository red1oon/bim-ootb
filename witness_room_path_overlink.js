// §21.33 OVER-LINKING TEST — §21.32 item 1. Written BEFORE any default change, because §21.32's
// headline is a LEAD, not a result: with §PRECARVE protecting the enclosure, admitting every
// floor-level opening ('cur') posts LTU 32/294 stranded @ 26.1% unroutable, beating the §21.24
// room-graph baseline of 32.4% for the first time in this lane. The question is whether that
// connectivity is REAL or invented.
//
// WHY IT COULD BE INVENTED. Layer 1 fuses two pockets across any DOORLESS opening. An opening is
// detected on the CARVED mask. So every void the carve admits can manufacture a fusion — and 'cur'
// admits 1,595 voids on LTU that no door fills, including facade/atrium voids up to 55 m across.
// Fusing across one of those asserts "these two spaces are one walkable room" on the strength of a
// hole that is not an aperture. This is the same failure §21.21 found in proximity door-adjacency
// (a third of doors claiming 3-4 rooms) and §21.24 restated: a correct map is a SPARSER map, and a
// flattering unroutable number is the symptom of phantom edges, not of success.
//
// WHAT THIS PROVES OR DISPROVES (written before the run):
//   O1 ATTRIBUTION — for every doorless (fusing) opening, WHICH admitted void created it, and how
//      wide is that void? If the fusions come from door-hosted and narrow unhosted voids, 'cur' is
//      carving real archways. If a material share trace to >2 m unhosted voids, they are phantom.
//   O2 WIDTH CAP SWEEP — re-measure with unhosted voids admitted only up to a cap, swept over
//      1.5/2.0/3.0/6.0 m. The cap is SWEPT, not chosen, so the threshold is read off the data.
//      FALSIFICATION: if 'cur' survives capping (unroutable stays near 26.1%), the advantage is
//      genuine archways -> 'cur' becomes the default. If capping collapses it back toward tier B's
//      46.2%, the advantage was the giant voids and tier B stands.
//   O3 THE DECIDING CONTRAST — the difference between 'cur' and the tightest cap that keeps the
//      gain IS the phantom share. Report it as a number, not as a judgement.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname);
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

// Is point (px,py) inside the rect the carve actually cut for void v? Same geometry _rasterizeSpine
// uses, so attribution answers for the cut that was really made, not an approximation of it.
function inCarve(v, px, py) {
  const RES = RW.RES;
  const lng = Math.max(v[2], v[3]), thin = Math.min(v[2], v[3]);
  const pierce = v[5] ? 6 * RES : RES;
  const hx = (lng + 2 * RES) / 2, hy = (thin + pierce) / 2;
  const th = v[4] || 0, ct = Math.cos(th), st = Math.sin(th);
  const dx = px - v[0], dy = py - v[1];
  const lx = dx * ct + dy * st, ly = -dx * st + dy * ct;
  return Math.abs(lx) <= hx && Math.abs(ly) <= hy;
}

function run(db, mode) {
  const map = quiet(() => RW.spineMap(db, { voidMode: mode }));
  let rooms = 0, stranded = 0, pairs = 0, bad = 0, spineA = 0, intA = 0, fused = 0;
  Object.keys(map).forEach(st => {
    const m = map[st];
    if (!m.pockets.length) return;
    spineA += m.spineArea; intA += m.interiorArea;
    fused += m.doorlessOpenings;
    const others = m.groups.filter(x => x.id !== m.spineGroup);
    rooms += others.length;
    stranded += others.filter(x => x.depth === -1 && x.area >= 2.0).length;
    const ids = m.groups.map(x => x.id), p = {}; ids.forEach(i => p[i] = i);
    const find = a => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
    m.links.forEach(l => { const ra = find(l.a), rb = find(l.b); if (ra !== rb) p[ra] = rb; });
    const sz = {}; ids.forEach(i => { const r = find(i); sz[r] = (sz[r] || 0) + 1; });
    const n = ids.length, t = n * (n - 1) / 2;
    const same = Object.values(sz).reduce((s, k) => s + k * (k - 1) / 2, 0);
    pairs += t; bad += t - same;
  });
  return { rooms, stranded, fused, unroutable: 100 * bad / Math.max(1, pairs),
    spinePct: 100 * spineA / Math.max(1e-6, intA) };
}

(async () => {
  const SQL = await initSqlJs();
  for (const f of ['Clinic_extracted.db', 'LTU_AHouse_extracted.db']) {
    console.log('\n================ ' + f + ' ================');
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, f))));
    const anch = RW.storeyZAnchors(db);

    // ---- O1 ATTRIBUTION: which void made each fusing (doorless) opening?
    const voidsBy = RW.storeyVoids(db, anch, 'cur');
    const map = quiet(() => RW.spineMap(db, { voidMode: 'cur' }));
    const bucket = { doorVoid: 0, hostedOpening: 0, unhostedLE2: 0, unhostedGT2: 0, noVoid: 0 };
    const widths = [];
    const hosted = RW.storeyVoids(db, anch, 'B');
    const hostedKey = new Set();
    Object.keys(hosted).forEach(st => hosted[st].forEach(v => hostedKey.add(st + '|' + v[0].toFixed(3) + '|' + v[1].toFixed(3))));
    Object.keys(map).forEach(st => {
      const vs = voidsBy[st] || [];
      map[st].openings.filter(g => !g.doors.length).forEach(g => {
        let hit = null, hw = 0;
        for (const v of vs) {
          if (!v[6]) continue;
          if (inCarve(v, g.cx, g.cy)) { const w = Math.max(v[2], v[3]); if (w > hw) { hw = w; hit = v; } }
        }
        if (!hit) { bucket.noVoid++; return; }
        widths.push(hw);
        if (hit[5]) bucket.doorVoid++;
        else if (hostedKey.has(st + '|' + hit[0].toFixed(3) + '|' + hit[1].toFixed(3))) bucket.hostedOpening++;
        else if (hw <= 2.0) bucket.unhostedLE2++;
        else bucket.unhostedGT2++;
      });
    });
    const totF = Object.values(bucket).reduce((a, b) => a + b, 0);
    console.log('§O1 FUSION ATTRIBUTION (doorless openings, mode cur) total=' + totF +
      '  doorVoid=' + bucket.doorVoid + '  hostedOpening=' + bucket.hostedOpening +
      '  unhosted<=2m=' + bucket.unhostedLE2 + '  unhosted>2m=' + bucket.unhostedGT2 +
      '  noVoid(pre-existing wall gap)=' + bucket.noVoid);
    if (totF) console.log('§O1_RISK fusions resting on an unhosted void WIDER than 2 m = ' +
      bucket.unhostedGT2 + '/' + totF + ' (' + (100 * bucket.unhostedGT2 / totF).toFixed(1) + '%)');
    if (widths.length) {
      widths.sort((a, b) => a - b);
      console.log('§O1_WIDTH attributed void width: median=' + widths[widths.length >> 1].toFixed(2) +
        'm  p90=' + widths[Math.floor(widths.length * 0.9)].toFixed(2) + 'm  max=' + widths[widths.length - 1].toFixed(2) + 'm');
    }

    // ---- O2 WIDTH CAP SWEEP
    const modes = ['C', 'B', 'W:1.5', 'W:2.0', 'W:3.0', 'W:6.0', 'cur'];
    const R = {};
    for (const m of modes) {
      R[m] = run(db, m);
      console.log('§O2 ' + m.padEnd(6) + ' fusions=' + String(R[m].fused).padStart(4) +
        '  spine=' + R[m].spinePct.toFixed(0) + '%' +
        '  stranded=' + R[m].stranded + '/' + R[m].rooms +
        '  unroutable=' + R[m].unroutable.toFixed(1) + '%');
    }
    // ---- O3 the phantom share, stated as a number
    const base = f[0] === 'C' ? 43.3 : 32.4;   // §21.24 room-graph baseline for this fixture
    const gain = R['B'].unroutable - R['cur'].unroutable;
    const kept = R['B'].unroutable - R['W:2.0'].unroutable;
    console.log('§O3 gain(cur vs B)=' + gain.toFixed(1) + 'pts  kept under a 2 m cap=' + kept.toFixed(1) +
      'pts  -> phantom share=' + (gain > 0 ? (100 * (gain - kept) / gain).toFixed(0) : 'n/a') + '%' +
      '   [§21.24 room-graph baseline ' + base + '%]');
    const verdict = gain <= 0 ? 'N/A (no gain to explain)'
      : (kept / gain >= 0.7 ? 'PASS — the gain survives capping; it is genuine archways, not giant voids'
        : 'FAIL — the gain depends on unhosted voids wider than 2 m; tier B stands');
    console.log('§O3 VERDICT ' + verdict);
    db.close();
  }
})();
