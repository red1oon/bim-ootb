// §21.42 FALSIFICATION PROBE — written BEFORE the fix, per §21.41's own condition.
//
// THE CLAIM UNDER TEST: "a pocket whose cells lie ENTIRELY within carved void footprints is a
// DOORWAY, not a room." This probe does not change the engine. It only classifies every pocket by
// PROVENANCE (were its cells created by the carve?) and cross-tabs that against AREA.
//
// THE ISSUE IT PROVES OR DISPROVES:
//   PASS  — doorway-provenance pockets are a large share of the sub-2 m² pockets and near-zero of
//           the >10 m² ones. Then provenance separates doorways from rooms and the merge may ship.
//   FAIL  — any material share of >10 m² pockets classifies as doorway. Then the provenance test is
//           wrong, it would swallow real rooms, and IT MUST NOT SHIP (§21.41).
// A run that classifies nothing at all is also a FAIL: it would mean §21.41's mechanism is not the
// one producing the 1 m² far-end pockets, and the fix would be a no-op.
//
// §DP1 provenance x area cross-tab      §DP2 sensitivity (frac thresholds 1.0 / 0.9 / 0.75)
// §DP3 doorway pockets that are their OWN layer-1 group — the graph-terminating case of §21.41
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };
const RES = RW.RES;

// EXACT replica of _stampRect's cell test (same RES/2 slack), so "inside the carve" here means
// exactly the cells _rasterizeSpine cleared. No tolerance of its own.
function stamp(mask, g, cx, cy, bx, by, rot) {
  const nx = g.nx, ny = g.ny, xs0 = g.xs0, ys0 = g.ys0;
  const th = rot || 0, ct = Math.cos(th), st = Math.sin(th);
  const hx = bx / 2, hy = by / 2;
  const ax = Math.abs(hx * ct) + Math.abs(hy * st);
  const ay = Math.abs(hx * st) + Math.abs(hy * ct);
  const i0 = Math.max(0, Math.floor((cx - ax - xs0) / RES)), i1 = Math.min(nx - 1, Math.floor((cx + ax - xs0) / RES));
  const j0 = Math.max(0, Math.floor((cy - ay - ys0) / RES)), j1 = Math.min(ny - 1, Math.floor((cy + ay - ys0) / RES));
  const half = RES / 2;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const px = xs0 + (i + 0.5) * RES - cx, py = ys0 + (j + 0.5) * RES - cy;
    const lx = px * ct + py * st, ly = -px * st + py * ct;
    if (Math.abs(lx) <= hx + half && Math.abs(ly) <= hy + half) mask[i * ny + j] = 1;
  }
}

function bucket(area) { return area < 2 ? '<2' : area <= 10 ? '2-10' : '>10'; }

async function run(SQL, name, file) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, file))));
  const anch = RW.storeyZAnchors(db);
  const voidsBy = RW.storeyVoids(db, anch);            // default 'W:3.0', same as spineMap
  const map = quiet(() => RW.spineMap(db));
  const TH = [1.0, 0.9, 0.75];
  const tab = {};                                       // bucket -> {n, doorway[th]}
  ['<2', '2-10', '>10'].forEach(b => tab[b] = { n: 0, d: [0, 0, 0], areaSum: 0 });
  let ownGroup = { total: 0, doorway: 0, doorwayDepthNeg: 0 };

  Object.keys(map).sort().forEach(st => {
    const m = map[st];
    if (!m.pockets.length) return;
    const g = m.grid, nx = g.nx, ny = g.ny;
    // the carve footprint, rebuilt with _rasterizeSpine's own geometry
    const vm = new Uint8Array(nx * ny);
    (voidsBy[st] || []).forEach(v => {
      if (!v[6]) return;                                 // §VOID-AT-FLOOR
      const lng = Math.max(v[2], v[3]), thin = Math.min(v[2], v[3]);
      const pierce = v[5] ? 10 * RES : RES;
      stamp(vm, g, v[0], v[1], lng + 2 * RES, thin + pierce, v[4] || 0);
    });
    // pocket ids, same scan order as _pocketComponents so ids line up with m.pockets
    const owner = new Int32Array(nx * ny);
    let next = 0;
    const inVoid = [0], cells = [0];
    for (let si = 0; si < nx; si++) for (let sj = 0; sj < ny; sj++) {
      const sk = si * ny + sj;
      if (!g.enclosed[sk] || owner[sk]) continue;
      const id = ++next; inVoid[id] = 0; cells[id] = 0;
      const stack = [sk]; owner[sk] = id;
      while (stack.length) {
        const k = stack.pop(), i = Math.floor(k / ny), j = k % ny;
        cells[id]++; if (vm[k]) inVoid[id]++;
        [[k - ny, i > 0], [k + ny, i < nx - 1], [k - 1, j > 0], [k + 1, j < ny - 1]].forEach(([kk, ok]) => {
          if (ok && g.enclosed[kk] && !owner[kk]) { owner[kk] = id; stack.push(kk); }
        });
      }
    }
    const frac = id => cells[id] ? inVoid[id] / cells[id] : 0;
    m.pockets.forEach(p => {
      const b = bucket(p.area), f = frac(p.id);
      tab[b].n++; tab[b].areaSum += p.area;
      TH.forEach((t, ti) => { if (f >= t) tab[b].d[ti]++; });
    });
    // §DP3 — a single-pocket layer-1 group has id === that pocket's id (union-find root of itself)
    m.groups.forEach(gr => {
      if (gr.pockets !== 1) return;
      ownGroup.total++;
      if (frac(gr.id) >= 1.0) { ownGroup.doorway++; if (gr.depth === -1) ownGroup.doorwayDepthNeg++; }
    });
  });

  const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';
  console.log('\n=== ' + name + ' ===');
  console.log('§DP1 provenance x area  (doorway = ALL cells inside a carve footprint)');
  ['<2', '2-10', '>10'].forEach(b => {
    const t = tab[b];
    console.log('  area ' + b.padEnd(5) + ' pockets=' + String(t.n).padStart(5) +
      '  doorway=' + String(t.d[0]).padStart(5) + ' (' + pct(t.d[0], t.n) + ')' +
      '  meanArea=' + (t.n ? (t.areaSum / t.n).toFixed(2) : '0') + ' m2');
  });
  console.log('§DP2 sensitivity  frac>=1.00 / >=0.90 / >=0.75');
  ['<2', '2-10', '>10'].forEach(b => {
    const t = tab[b];
    console.log('  area ' + b.padEnd(5) + ' ' + t.d.map((d, i) => pct(d, t.n)).join(' / '));
  });
  console.log('§DP3 single-pocket groups=' + ownGroup.total + '  of which doorway-provenance=' +
    ownGroup.doorway + '  and unreachable(depth -1)=' + ownGroup.doorwayDepthNeg);
  const big = tab['>10'];
  console.log('§DP-VERDICT >10m2 doorway share=' + pct(big.d[0], big.n) +
    '  <2m2 doorway share=' + pct(tab['<2'].d[0], tab['<2'].n) +
    '  => ' + ((big.d[0] === 0 || big.d[0] / Math.max(1, big.n) < 0.01) && tab['<2'].d[0] > 0
      ? 'PASS (provenance separates)' : 'FAIL (do not ship the merge)'));
}

(async () => {
  const SQL = await initSqlJs();
  await run(SQL, 'Clinic', 'Clinic_extracted.db');
  await run(SQL, 'LTU', 'LTU_AHouse_extracted.db');
})();
