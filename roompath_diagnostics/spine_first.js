// §21.26 — the USER'S design, measured: a corridor walkable spine mapped FIRST, traversing the
// whole building, stopping at the first layer of doors; rooms hidden behind that first layer
// resolved separately by their depth from the spine.
//
// This is not "pick the corridor-ish rooms out of the room graph" — every attempt at that (shape
// §21.23, hallway_backbone §21.24, betweenness §21.25) inherits the room compile's fragmentation.
// Here the corridor is defined as WHAT YOU CAN WALK WITHOUT OPENING A DOOR: seal only the door
// apertures, flood the interior, and the spine is what comes back.
//
// WHAT THIS PROVES OR DISPROVES (written before the run):
//   S1 DOES THE SPINE TRAVERSE THE BUILDING? One dominant region per storey, spanning the plan.
//      Measured as: spine share of interior floor area, and bbox coverage of the storey extent.
//      §21.25's best room-graph spine reached 1 component only after taking the top 25% of rooms;
//      if this construction does not give ONE region covering most of the plan, the inversion has
//      not bought anything and the design needs the room graph after all.
//   S2 DOES IT STOP AT THE FIRST LAYER OF DOORS? Depth histogram of the non-spine regions. The
//      design predicts most rooms at depth 1, a real minority deeper ("hidden by the first").
//   S3 IS ANYTHING STRANDED? Regions at depth -1 reach the spine through no door at all. These are
//      the design's failures and must be near zero, not explained away.
//   S4 COMPARISON on the number that has decided everything else in this lane: unroutable
//      same-storey pairs. Baseline (§21.24 room graph, doors+open) = Clinic 43.3% / LTU 32.4%.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

(async () => {
  const SQL = await initSqlJs();
  for (const f of ['Clinic_extracted.db', 'LTU_AHouse_extracted.db', 'Duplex_extracted.db']) {
    const fp = path.join(BLD, f);
    if (!fs.existsSync(fp)) { console.log('\n(skip ' + f + ' — not present)'); continue; }
    console.log('\n================ ' + f + ' ================');
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(fp)));
    const map = quiet(() => RW.spineMap(db));

    let totRooms = 0, totStranded = 0, totPairs = 0, totBad = 0;
    Object.keys(map).sort().forEach(st => {
      const m = map[st];
      if (!m.pockets.length) return;
      const spineArea = m.spineArea, cov = 100 * spineArea / Math.max(1e-6, m.interiorArea);
      const others = m.groups.filter(g => g.id !== m.spineGroup);
      const hist = {};
      others.forEach(g => { hist[g.depth] = (hist[g.depth] || 0) + 1; });
      const strandedReal = others.filter(g => g.depth === -1 && g.area >= 2.0).length;
      totRooms += others.length; totStranded += strandedReal;

      const ids = m.groups.map(g => g.id);
      const p = {}; ids.forEach(i2 => p[i2] = i2);
      const find = a => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
      m.links.forEach(l => { const ra = find(l.a), rb = find(l.b); if (ra !== rb) p[ra] = rb; });
      const sz = {}; ids.forEach(i2 => { const r = find(i2); sz[r] = (sz[r] || 0) + 1; });
      const sizes = Object.values(sz).sort((a, b) => b - a);
      const n = ids.length, tot = n * (n - 1) / 2;
      const same = sizes.reduce((s2, k) => s2 + k * (k - 1) / 2, 0);
      totPairs += tot; totBad += tot - same;

      const spineG = m.groups.find(g => g.id === m.spineGroup);
      console.log('  ' + st);
      console.log('    §S1 spine = ' + spineArea.toFixed(0) + ' m² of ' + m.interiorArea.toFixed(0) +
        ' m² interior (' + cov.toFixed(0) + '%)  fused from ' + (spineG ? spineG.pockets : 0) +
        ' pockets of ' + m.pockets.length + '   openings: doorless=' + m.doorlessOpenings +
        ' withDoor=' + m.doorOpenings);
      console.log('    §S2 depth from spine: ' + Object.keys(hist).sort((a, b) => a - b)
        .map(d => (d === '-1' ? 'unreached' : 'depth ' + d) + ' ×' + hist[d]).join('  '));
      console.log('    §S3 stranded (no door path to spine, area≥2m²) = ' + strandedReal + '/' + others.length);
      console.log('    §S4 layer-1 groups=' + n + '  components=' + sizes.length + ' largest=' + sizes[0] +
        '  unroutable=' + (100 * (tot - same) / Math.max(1, tot)).toFixed(1) + '%');
    });
    console.log('  TOTAL rooms(non-spine regions)=' + totRooms + '  strandedReal=' + totStranded +
      '  unroutable=' + (100 * totBad / Math.max(1, totPairs)).toFixed(1) +
      '%   [§21.24 room-graph baseline: ' + (f[0] === 'C' ? '43.3%' : f[0] === 'L' ? '32.4%' : 'n/a') + ']');
    db.close();
  }
})();
