// §21.44 (W, pierce) RE-SWEEP RUNNER — RESUME_ROOMPATH_AXIS_RESWEEP.md §6.1, spec written first.
//
// One node process = ONE pierce value (ROOMPATH_PIERCE env, in CELLS — room_walker.js reads it once
// at module load). For both fixtures it runs spineMap for the six W modes of the §2 matrix plus one
// uncarved run (§T5 denominator), and prints per cell:
//   §SW  <fixture> pierce=<p> W=<mode>  unroutable  stranded/rooms  wall m²  encl m²  retention
//   §SW_O3 <fixture> pierce=<p>  gain/kept/phantom + verdict  — same arithmetic as
//          witness_room_path_overlink.js §O3 (B vs W:2.0 vs cur), so it is constant across the
//          W row by construction; recorded per row anyway so every cell carries its verdict.
//   TSV\t... lines for machine assembly of the full matrix.
// Metrics are copied from witness_room_path_aperture_tier.js measure() / overlink run() so the
// numbers are comparable to every prior section — same union-find, same area>=2.0 stranded filter.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

const PIERCE = +(process.env.ROOMPATH_PIERCE || 10);
const MODES = ['B', 'W:1.5', 'W:2.0', 'W:3.0', 'W:6.0', 'cur'];

function measure(db, mode) {
  const map = quiet(() => RW.spineMap(db, { voidMode: mode }));
  let wall = 0, encl = 0;
  let rooms = 0, stranded = 0, pairs = 0, bad = 0;
  Object.keys(map).forEach(st => {
    const m = map[st], g = m.grid;
    for (let k = 0; k < g.raw.length; k++) { if (g.raw[k]) wall++; if (g.enclosed[k]) encl++; }
    if (!m.pockets.length) return;
    const others = m.groups.filter(x => x.id !== m.spineGroup);
    rooms += others.length;
    stranded += others.filter(x => x.depth === -1 && x.area >= 2.0).length;
    // same union-find as witness_room_path_overlink.js run() — identical arithmetic
    const ids = m.groups.map(x => x.id), p = {}; ids.forEach(i => p[i] = i);
    const find = a => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
    m.links.forEach(l => { const ra = find(l.a), rb = find(l.b); if (ra !== rb) p[ra] = rb; });
    const sz = {}; ids.forEach(i => { const r = find(i); sz[r] = (sz[r] || 0) + 1; });
    const n = ids.length, t = n * (n - 1) / 2;
    const same = Object.values(sz).reduce((s, k) => s + k * (k - 1) / 2, 0);
    pairs += t; bad += t - same;
  });
  const A = c => c * RW.RES * RW.RES;
  return { rooms, stranded, unroutable: 100 * bad / Math.max(1, pairs), wall: A(wall), encl: A(encl) };
}

(async () => {
  const SQL = await initSqlJs();
  console.log('§SW_START pierce=' + PIERCE + ' cells (' + (PIERCE * RW.RES).toFixed(2) + ' m)  modes=' + MODES.join(','));
  for (const f of ['Hospital_extracted.db']) {
    const fx = f.replace('_extracted.db', '');
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, f))));
    // §T5 denominator — uncarved enclosed area (pierce-independent; recomputed per process for isolation)
    const uncarved = (() => {
      const map = quiet(() => RW.spineMap(db, { carve: false }));
      let encl = 0;
      Object.keys(map).forEach(st => { const g = map[st].grid; for (let k = 0; k < g.enclosed.length; k++) if (g.enclosed[k]) encl++; });
      return encl * RW.RES * RW.RES;
    })();
    console.log('§SW_UNCARVED ' + fx + ' enclosed=' + uncarved.toFixed(0) + 'm²');
    const R = {};
    for (const m of MODES) {
      R[m] = measure(db, m);
      const r = R[m], ret = 100 * r.encl / Math.max(1e-6, uncarved);
      r.retention = ret;
      console.log('§SW ' + fx.padEnd(10) + ' pierce=' + String(PIERCE).padStart(2) + ' W=' + m.padEnd(6) +
        ' unroutable=' + r.unroutable.toFixed(1) + '%  stranded=' + r.stranded + '/' + r.rooms +
        '  wall=' + r.wall.toFixed(0) + 'm²  encl=' + r.encl.toFixed(0) + 'm²' +
        '  §T5retention=' + ret.toFixed(1) + '%' + (ret >= 90 ? ' PASS' : ' FAIL'));
    }
    // §O3 — same arithmetic as witness_room_path_overlink.js, at THIS pierce
    const gain = R['B'].unroutable - R['cur'].unroutable;
    const kept = R['B'].unroutable - R['W:2.0'].unroutable;
    const phantom = gain > 0 ? (100 * (gain - kept) / gain) : NaN;
    const verdict = gain <= 0 ? 'N/A' : (kept / gain >= 0.7 ? 'PASS' : 'FAIL');
    console.log('§SW_O3 ' + fx + ' pierce=' + PIERCE + '  gain(cur vs B)=' + gain.toFixed(1) +
      'pts  kept@2m=' + kept.toFixed(1) + 'pts  phantom=' + (isNaN(phantom) ? 'n/a' : phantom.toFixed(0) + '%') +
      '  VERDICT ' + verdict);
    for (const m of MODES) {
      const r = R[m];
      console.log(['TSV', fx, PIERCE, m, r.unroutable.toFixed(1), r.stranded, r.rooms,
        isNaN(phantom) ? 'n/a' : phantom.toFixed(0), verdict, r.retention.toFixed(1),
        r.wall.toFixed(0), r.encl.toFixed(0)].join('\t'));
    }
    db.close();
  }
  console.log('§SW_DONE pierce=' + PIERCE);
})();
