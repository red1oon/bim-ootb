// §21.25 — CAN THE MAP BE MADE WHOLE? Measuring the three levers §21.24 named, one at a time and
// then together, against the one number that decides the two-layer design: does the spine connect?
//
// Baseline to beat (§21.24, committed relation): Clinic spine 8 components / Q4 43.3% unroutable;
// LTU spine 17 / 32.4%.
//
// LEVER A — the wall normal is ASSUMED (door bbox short axis), not measured. §21.15's funnel was
//   burned by exactly this proxy. Replaced by §APERTURE-AXIS: the blocked band is thin across a
//   wall and long along it, so measure which way is through. PROVES/DISPROVES: whether the 31/62
//   interior single-sided doors are a door-orientation artefact.
// LEVER B — §DOOR-RESCUE deletes sub-MIN_AREA pockets that look doorless, judged by the same
//   proximity doorAdjacent() §21.21 condemned. Put the dropped regions back in the owner set and
//   ask the APERTURE whether a door really reaches them. PROVES/DISPROVES: whether the 34/117
//   deleted rooms are wrongly deleted, and how many the correct test would keep.
// LEVER C — §OPEN-THRESHOLD promoted from diagnostic to real link (already measured in §21.24;
//   included here so the combined projection is honest).
//
// FALSIFICATION, written before the run: if A+B+C together do not materially reduce the spine
// component count, the substrate is not recoverable by relation-level fixes and the two-layer
// design needs a different foundation than the walker's pockets. That is a real possible outcome.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const HB = require(path.join(WT, 'common/hallway_backbone.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

function componentSizes(ids, links) {
  const p = {}; ids.forEach(g => p[g] = g);
  const find = a => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
  links.forEach(([a, b]) => { if (p[a] === undefined || p[b] === undefined) return;
    const ra = find(a), rb = find(b); if (ra !== rb) p[ra] = rb; });
  const sz = {}; ids.forEach(g => { const r = find(g); sz[r] = (sz[r] || 0) + 1; });
  return Object.values(sz).sort((a, b) => b - a);
}
function unroutablePct(idsByStorey, links) {
  let pairs = 0, bad = 0;
  Object.keys(idsByStorey).forEach(st => {
    const ids = idsByStorey[st], idset = new Set(ids);
    const sz = componentSizes(ids, links.filter(([a, b]) => idset.has(a) && idset.has(b)));
    const n = ids.length, tot = n * (n - 1) / 2;
    pairs += tot; bad += tot - sz.reduce((s, k) => s + k * (k - 1) / 2, 0);
  });
  return { pct: 100 * bad / Math.max(1, pairs), bad, pairs };
}

(async () => {
  const SQL = await initSqlJs();
  for (const f of ['Clinic_extracted.db', 'LTU_AHouse_extracted.db']) {
    console.log('\n================ ' + f + ' ================');
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, f))));
    quiet(() => RW.walk(db, { write: true }));
    const dbq = s => { try { const r = db.exec(s); return r.length ? r[0].values : []; } catch (e) { return []; } };
    const rel = quiet(() => RW.doorRoomAdjacency(db, { experiment: true }));

    // storey of every kept room (logical guids), for per-storey component counting
    const roomStorey = {};
    dbq("SELECT s.guid, p.name, s.room_guid FROM spatial_structure s LEFT JOIN spatial_structure p " +
        "ON p.guid=s.parent_guid WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL")
      .forEach(r => { roomStorey[r[2] || r[0]] = r[1] || ''; });
    const corridors = new Set(Object.keys(quiet(() => HB.classifyCorridorRooms(dbq, { log: () => {} })) || {})
      .filter(g => roomStorey[g] !== undefined));

    // ---------- committed relation (the §21.24 baseline) ----------
    const baseDoorLinks = [], baseOpenLinks = [];
    Object.keys(rel.doorAdj).forEach(st => rel.doorAdj[st].forEach(a => {
      if (a.guids.length === 2) baseDoorLinks.push(a.guids.slice()); }));
    Object.keys(rel.openAdj || {}).forEach(st => (rel.openAdj[st] || []).forEach(pr => baseOpenLinks.push(pr.slice())));

    // ---------- experimental relation (lever A + B; C is the `open` list) ----------
    const expDoorLinks = [], expOpenLinks = [];
    let expDoors = [], keptIds = [], droppedIds = [], droppedAreas = [];
    const storeyOf = {};
    Object.keys(rel.expAdj).forEach(st => {
      const e = rel.expAdj[st];
      e.kept.forEach(g => storeyOf[g] = st);
      e.dropped.forEach(g => storeyOf[g] = st);
      keptIds = keptIds.concat(e.kept); droppedIds = droppedIds.concat(e.dropped);
      droppedAreas = droppedAreas.concat(e.droppedAreas || []);
      e.doors.forEach(d => { expDoors.push(d); if (d.ids.length === 2) expDoorLinks.push(d.ids.slice()); });
      e.open.forEach(pr => expOpenLinks.push(pr.slice()));
    });

    // ---- LEVER A: did measuring the normal resolve doors the bbox proxy could not?
    const baseDoors = [];
    Object.keys(rel.doorAdj).forEach(st => rel.doorAdj[st].forEach(a => baseDoors.push(a)));
    const b2 = baseDoors.filter(d => d.guids.length === 2).length;
    const e2 = expDoors.filter(d => d.ids.length === 2).length;
    console.log('§LEVER_A doors resolving to 2 sides:  bbox-axis=' + b2 + '/' + baseDoors.length +
      '   measured-axis(+dropped in set)=' + e2 + '/' + expDoors.length);
    console.log('         single-sided ' + baseDoors.filter(d => d.guids.length === 1).length +
      ' -> ' + expDoors.filter(d => d.ids.length === 1).length +
      ' ;  orphan ' + baseDoors.filter(d => !d.guids.length).length +
      ' -> ' + expDoors.filter(d => !d.ids.length).length);

    // ---- LEVER B: how many dropped regions does a real door aperture actually reach?
    const reached = new Set();
    expDoors.forEach(d => d.ids.forEach(g => { if (g.startsWith('DROP_')) reached.add(g); }));
    const areaOf = {}; droppedIds.forEach((g, i) => areaOf[g] = droppedAreas[i]);
    const reachedArea = [...reached].reduce((s, g) => s + (areaOf[g] || 0), 0);
    console.log('§LEVER_B dropped regions=' + droppedIds.length + '  reached by a real door aperture=' +
      reached.size + '  (' + reachedArea.toFixed(0) + ' m2)  ← rooms §DOOR-RESCUE deleted on the' +
      ' strength of the broken proximity test');
    const byWhy = {}; [...reached].forEach(g => { const w = g.split('_').slice(2).join('_'); byWhy[w] = (byWhy[w] || 0) + 1; });
    console.log('         by drop reason: ' + JSON.stringify(byWhy));

    // ---- the number that decides it: spine + routability, lever by lever
    const keptStorey = {}; keptIds.forEach(g => (keptStorey[storeyOf[g]] = keptStorey[storeyOf[g]] || []).push(g));
    const rescuedIds = keptIds.concat([...reached]);
    const rescStorey = {}; rescuedIds.forEach(g => (rescStorey[storeyOf[g]] = rescStorey[storeyOf[g]] || []).push(g));
    const keep = ls => ls.filter(([a, b]) => !a.startsWith('DROP_') && !b.startsWith('DROP_'));
    const keepR = ls => ls.filter(([a, b]) => (!a.startsWith('DROP_') || reached.has(a)) &&
                                             (!b.startsWith('DROP_') || reached.has(b)));

    const scenarios = [
      ['baseline  (§21.24 committed)      ', keptStorey, baseDoorLinks.concat(baseOpenLinks)],
      ['+A measured wall normal           ', keptStorey, keep(expDoorLinks).concat(keep(expOpenLinks))],
      ['+A+B rescued rooms                ', rescStorey, keepR(expDoorLinks)],
      ['+A+B+C rescued rooms + thresholds ', rescStorey, keepR(expDoorLinks).concat(keepR(expOpenLinks))]
    ];
    for (const [label, idsByStorey, links] of scenarios) {
      const u = unroutablePct(idsByStorey, links);
      const corIds = {};
      Object.keys(idsByStorey).forEach(st => {
        const c = idsByStorey[st].filter(g => corridors.has(g));
        if (c.length) corIds[st] = c;
      });
      let sizes = [];
      Object.keys(corIds).forEach(st => {
        const idset = new Set(corIds[st]);
        sizes = sizes.concat(componentSizes(corIds[st], links.filter(([a, b]) => idset.has(a) && idset.has(b))));
      });
      sizes.sort((a, b) => b - a);
      const nRooms = Object.values(idsByStorey).reduce((s, a) => s + a.length, 0);
      console.log('§OVERCOME ' + label + ' rooms=' + String(nRooms).padStart(4) +
        ' links=' + String(links.length).padStart(4) +
        '  spine components=' + String(sizes.length).padStart(3) + ' largest=' + String(sizes[0] || 0).padStart(3) +
        '  unroutable=' + u.pct.toFixed(1) + '%');
    }
    db.close();
  }
})();
