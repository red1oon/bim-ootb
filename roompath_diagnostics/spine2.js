// §21.23 step 3 — re-measure the 2-layer design's feasibility on a MAP THAT IS NO LONGER WRONG.
//
// §21.23's numbers (Clinic 18 corridor components, largest 21%) were produced by two inputs that
// were both defective, and the caveat there says so:
//   - corridors identified by a SHAPE rule (aspect>=3 / side>=8m / area>=4x median) invented in
//     that probe. Replaced here by the engine's own common/hallway_backbone.js.
//   - "do two corridors join?" tested by rect-touch within 0.5m, against INSCRIBED rects that stop
//     short of the wall. Replaced here by RoomWalker's §DOOR-APERTURE relation: two pockets join
//     when a real door opens from one into the other.
//
// WHAT THIS PROVES OR DISPROVES (written before reading output):
//   Q1 does the corridor set form a connected SPINE, or islands? This is the go/no-go for the
//      two-layer design. §21.23 predicted the fragmentation was an artefact of the same defect as
//      §21.21; if the component count does not collapse, that prediction was wrong.
//   Q2 what fraction of non-corridor rooms have a door onto a corridor (can attach as leaves)?
//   Q3 how many doors join two non-corridor rooms with no corridor involved? §21.23 item 4 says
//      the end state must keep these, so this is a design input, not a failure.
//   Q4 ROUTABILITY — fraction of same-storey room pairs with no path on the door graph. §21.21
//      predicted 37% (Clinic) / 14.8% (LTU) unroutable under the proximity map, and named this as
//      a symptom of the same root cause. This is the third of the three symptoms.
//
// A shape-rule control is ALSO run, so any change is attributable to the corridor definition vs
// the adjacency independently rather than to both at once.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const HB = require(path.join(WT, 'common/hallway_backbone.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');

const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

// union-find over a room set, linked by the door pairs handed in
function components(ids, links) {
  const p = {}; ids.forEach(g => p[g] = g);
  const find = a => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
  links.forEach(([a, b]) => { if (p[a] === undefined || p[b] === undefined) return;
    const ra = find(a), rb = find(b); if (ra !== rb) p[ra] = rb; });
  const sz = {}; ids.forEach(g => { const r = find(g); sz[r] = (sz[r] || 0) + 1; });
  return Object.values(sz).sort((a, b) => b - a);
}

(async () => {
  const SQL = await initSqlJs();
  for (const f of ['Clinic_extracted.db', 'LTU_AHouse_extracted.db']) {
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, f))));
    // §20.1 regime fidelity: these DBs carry RM_ rooms only, so the browser recompiles on load.
    // Write them first or we measure a room set the viewer never routes.
    quiet(() => RW.walk(db, { write: true }));
    const dbq = s => { try { const r = db.exec(s); return r.length ? r[0].values : []; } catch (e) { return []; } };

    const rel = quiet(() => RW.doorRoomAdjacency(db));
    const adjByStorey = rel.doorAdj, openByStorey = rel.openAdj || {};
    // LOGICAL room guid -> storey + rect union. §MULTI-RECT: spatial_structure holds ONE ROW PER
    // SUB-RECT (Clinic 304 rows / 207 rooms), all sharing room_guid = the logical RM_ guid that
    // both doorRoomAdjacency() and classifyCorridorRooms() key on. Grouping by s.guid instead
    // measures rects as if they were rooms and reports the graph as disconnected — it did exactly
    // that on the first run of this probe (Q4 read 91.5%), so the grouping is load-bearing.
    const roomStorey = {}, roomRects = {};
    dbq("SELECT s.guid, p.name, s.center_x, s.center_y, s.size_x, s.size_y, s.room_guid FROM spatial_structure s " +
        "LEFT JOIN spatial_structure p ON p.guid=s.parent_guid WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL")
      .forEach(r => { const lg = r[6] || r[0]; roomStorey[lg] = r[1] || '';
        (roomRects[lg] = roomRects[lg] || []).push({ x0: r[2] - r[4] / 2, x1: r[2] + r[4] / 2, y0: r[3] - r[5] / 2, y1: r[3] + r[5] / 2 }); });
    const allRooms = Object.keys(roomStorey);
    const rectRows = dbq("SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace' AND center_x IS NOT NULL");
    console.log('§SPINE2_GROUPING ' + f + ' logicalRooms=' + allRooms.length +
      '  rectRows=' + (rectRows.length ? rectRows[0][0] : '?'));

    // ---- corridor identification: the ENGINE'S OWN backbone, not a shape rule
    const cls = quiet(() => HB.classifyCorridorRooms(dbq, { log: () => {} })) || {};
    const corHB = new Set(Object.keys(cls).filter(g => roomStorey[g] !== undefined));
    // ---- control: §21.23's shape rule, so the two changes stay attributable
    const shape = g => { const rs = roomRects[g] || []; let x0 = 1 / 0, y0 = 1 / 0, x1 = -1 / 0, y1 = -1 / 0, a = 0;
      rs.forEach(r => { x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1);
        a += (r.x1 - r.x0) * (r.y1 - r.y0); });
      const w = x1 - x0, h = y1 - y0;
      return { area: a, aspect: Math.max(w, h) / Math.max(.01, Math.min(w, h)), long: Math.max(w, h) }; };
    const areas = allRooms.map(g => shape(g).area).sort((a, b) => a - b);
    const medA = areas[Math.floor(areas.length / 2)] || 1;
    const corShape = new Set(allRooms.filter(g => { const s = shape(g); return s.aspect >= 3 || s.long >= 8 || s.area >= 4 * medA; }));

    // ---- the real door relation, as link lists
    const doorLinks = [], doors = [];
    Object.keys(adjByStorey).forEach(st => adjByStorey[st].forEach(a => {
      doors.push(a); if (a.guids.length === 2) doorLinks.push(a.guids.slice()); }));
    // §OPEN-THRESHOLD: pockets separated by seal dilation alone — no masonry, no door. A doorless
    // archway or corridor junction lands here, and NO door-based relation can ever recover it.
    const openLinks = [];
    Object.keys(openByStorey).forEach(st => openByStorey[st].forEach(pr => openLinks.push(pr.slice())));
    const links = doorLinks.concat(openLinks);
    console.log('§SPINE2_OPEN ' + f + ' doorLinks=' + doorLinks.length + '  openThresholdLinks=' + openLinks.length +
      '   (a corridor split by a doorless opening is only recoverable by the second kind)');

    console.log('§SPINE2 ' + f + '  rooms=' + allRooms.length + '  doors=' + doors.length +
      '  corridors: hallway_backbone=' + corHB.size + '  (shape-rule control=' + corShape.size + ')');
    if (!corHB.size) console.log('   ! hallway_backbone classified NOTHING — Q1-Q3 below are not meaningful');

    for (const [label, cor] of [['HB ', corHB], ['SHAPE', corShape]]) {
      // Q1 — corridor spine connectivity, per storey, linked by REAL doors
      const byStorey = {};
      [...cor].forEach(g => (byStorey[roomStorey[g]] = byStorey[roomStorey[g]] || []).push(g));
      const corLinks = links.filter(([a, b]) => cor.has(a) && cor.has(b));
      let sizes = [];
      Object.keys(byStorey).forEach(st => {
        const ids = byStorey[st];
        const idset = new Set(ids);
        sizes = sizes.concat(components(ids, corLinks.filter(([a, b]) => idset.has(a) && idset.has(b))));
      });
      sizes.sort((a, b) => b - a);
      // Q2 — non-corridor rooms with a door onto a corridor
      const others = allRooms.filter(g => !cor.has(g));
      const onCorridor = new Set();
      doors.forEach(a => { if (a.guids.length === 2) {
        const [x, y] = a.guids;
        if (cor.has(x) && !cor.has(y)) onCorridor.add(y);
        if (cor.has(y) && !cor.has(x)) onCorridor.add(x); } });
      // Q3 — doors joining two non-corridor rooms
      const roomToRoom = doors.filter(a => a.guids.length === 2 && !cor.has(a.guids[0]) && !cor.has(a.guids[1])).length;
      console.log('   [' + label + '] Q1 spine components=' + sizes.length + '  largest=' + (sizes[0] || 0) +
        ' (' + (100 * (sizes[0] || 0) / Math.max(1, cor.size)).toFixed(0) + '% of corridors)  sizes=' + sizes.slice(0, 8).join(','));
      console.log('   [' + label + '] Q2 rooms with a door onto a corridor = ' + onCorridor.size + '/' + others.length +
        ' (' + (100 * onCorridor.size / Math.max(1, others.length)).toFixed(0) + '%)');
      console.log('   [' + label + '] Q3 doors joining two non-corridor rooms = ' + roomToRoom + '/' + doors.length +
        ' (' + (100 * roomToRoom / Math.max(1, doors.length)).toFixed(0) + '%)');
    }

    // Q4 — routability of same-storey room pairs on the real door graph (no corridor notion needed)
    const byStoreyAll = {};
    allRooms.forEach(g => (byStoreyAll[roomStorey[g]] = byStoreyAll[roomStorey[g]] || []).push(g));
    for (const [lbl, ls] of [['doorsOnly ', doorLinks], ['doors+open', links]]) {
      let pairs = 0, unroutable = 0;
      Object.keys(byStoreyAll).forEach(st => {
        const ids = byStoreyAll[st], idset = new Set(ids);
        const sz = components(ids, ls.filter(([a, b]) => idset.has(a) && idset.has(b)));
        const n = ids.length;
        const tot = n * (n - 1) / 2;
        const same = sz.reduce((s, k) => s + k * (k - 1) / 2, 0);
        pairs += tot; unroutable += (tot - same);
      });
      console.log('§SPINE2_Q4 ' + f + ' [' + lbl + '] unroutable same-storey room pairs = ' +
        (100 * unroutable / Math.max(1, pairs)).toFixed(1) + '%  (' + unroutable + '/' + pairs + ')' +
        '   [proximity map predicted ' + (f[0] === 'C' ? '37%' : '14.8%') + ']');
    }
    db.close();
  }
})();
