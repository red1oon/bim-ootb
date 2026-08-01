// §21.23 step 3, follow-through — WHY is the corrected map still disconnected?
//
// With the real §DOOR-APERTURE + §OPEN-THRESHOLD relations in place, 43.3% (Clinic) / 32.4% (LTU)
// of same-storey room pairs are still unroutable, and the corridor spine is still in 8/17 pieces.
// Two candidate explanations, and they call for different fixes:
//   (H1) the ROOMS are fine, the LINKS are still missing — some real openings are neither a door
//        nor a seal-only gap.
//   (H2) whole free-space REGIONS were dropped by the flood-fill's own gates. A dropped region is
//        invisible: every door onto it goes single-sided and the rooms behind it are cut off. The
//        biggest suspect is MAX_AREA_FRAC, which drops a region for being TOO LARGE — precisely
//        what a main corridor/lobby is.
// If (H2) fires, the fragmentation is upstream of the relation entirely and neither the funnel nor
// the two-layer design is the thing to work on next.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

(async () => {
  const SQL = await initSqlJs();
  for (const f of ['Clinic_extracted.db', 'LTU_AHouse_extracted.db']) {
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, f))));
    quiet(() => RW.walk(db, { write: true }));
    const rel = quiet(() => RW.doorRoomAdjacency(db));

    // ---- H2: what did the flood-fill throw away?
    let kept = 0, byWhy = {}, areaByWhy = {}, biggest = [];
    Object.keys(rel.floodDrops || {}).forEach(st => {
      const d = rel.floodDrops[st];
      kept += d.kept;
      d.drops.forEach(x => {
        byWhy[x.why] = (byWhy[x.why] || 0) + 1;
        areaByWhy[x.why] = (areaByWhy[x.why] || 0) + x.area;
        biggest.push({ st, why: x.why, area: x.area });
      });
    });
    biggest.sort((a, b) => b.area - a.area);
    console.log('§SHATTER ' + f + ' keptPockets=' + kept + '  droppedRegions=' +
      Object.values(byWhy).reduce((a, b) => a + b, 0));
    Object.keys(byWhy).sort((a, b) => areaByWhy[b] - areaByWhy[a]).forEach(w =>
      console.log('   drop ' + w.padEnd(18) + ' n=' + String(byWhy[w]).padStart(4) +
        '  totalArea=' + Math.round(areaByWhy[w]) + ' m2'));
    console.log('   largest dropped regions (m2): ' +
      biggest.slice(0, 6).map(b => Math.round(b.area) + ' [' + b.why + ']').join(', '));

    // ---- H1: of the doors that found only ONE pocket, how many sit in the interior of the plan?
    // An external/entry door legitimately has one side. An INTERIOR door with one side means the
    // other side's region is gone (H2) or was never linkable (H1).
    const doors = [];
    Object.keys(rel.doorAdj).forEach(st => rel.doorAdj[st].forEach(a => doors.push(a)));
    const xs = doors.map(d => d.cx), ys = doors.map(d => d.cy);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const inset = 0.15; // fraction of the plan span treated as "perimeter band"
    const isInterior = d => d.cx > x0 + inset * (x1 - x0) && d.cx < x1 - inset * (x1 - x0) &&
                            d.cy > y0 + inset * (y1 - y0) && d.cy < y1 - inset * (y1 - y0);
    const one = doors.filter(d => d.guids.length === 1);
    const zero = doors.filter(d => d.guids.length === 0);
    console.log('§SHATTER_DOORS ' + f + ' singleSided=' + one.length + ' of which interior=' +
      one.filter(isInterior).length + '   orphan=' + zero.length + ' of which interior=' +
      zero.filter(isInterior).length +
      '   (an INTERIOR one-sided door means the pocket on its far side is missing from the map)');
    // §APERTURE-MISS: for the rays that found no pocket, WHAT did they find? EXTERIOR means the
    // wall extraction leaks and the walker believes that side of the door is outdoors.
    const tally = {};
    doors.forEach(d => (d.miss || []).forEach(m => tally[m] = (tally[m] || 0) + 1));
    const itally = {};
    doors.filter(isInterior).forEach(d => (d.miss || []).forEach(m => itally[m] = (itally[m] || 0) + 1));
    console.log('§SHATTER_MISS ' + f + ' all rays: ' + JSON.stringify(tally) +
      '   interior doors only: ' + JSON.stringify(itally));
    db.close();
  }
})();
