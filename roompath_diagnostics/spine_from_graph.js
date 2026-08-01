// §21.25 part 2 — §OVERCOME's falsification fired: levers A+B+C left the spine at 9 and 17
// components. Adding rooms adds NODES faster than LINKS. So the map is not the thing to keep
// fixing, and the next question is whether the SPINE DEFINITION is what is wrong.
//
// The hypothesis this tests: corridors do not form a connected subgraph in these buildings because
// circulation runs THROUGH rooms that no corridor test will ever label — lobbies, waiting areas,
// vestibules, landings. Both corridor definitions tried so far ask "does this pocket LOOK like a
// corridor?" (shape) or "do its doors line up like a corridor?" (hallway_backbone). Neither asks
// the only question that matters for routing: DOES TRAFFIC HAVE TO GO THROUGH IT?
//
// That is betweenness centrality, and it is computed from the room graph itself — no shape rule,
// no name matching, nothing invented. Two things get measured:
//   C1 CEILING — component size distribution of the room graph. A spine can never serve rooms
//      outside the largest component, so this bounds every design downstream.
//   C2 does a betweenness-selected spine CONNECT, and what fraction of rooms hang off it within
//      one hop (the two-layer design's actual requirement: corridor spine + room leaves)?
// Compared head-to-head against hallway_backbone on the same graph, same run.
//
// FALSIFICATION: if the betweenness spine is also fragmented, or if leaf attachment is no better
// than hallway_backbone's, then the spine definition is not the problem either and the two-layer
// design has no support in this substrate — report that, do not keep hunting.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const HB = require(path.join(WT, 'common/hallway_backbone.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

// Brandes betweenness on an unweighted undirected graph given as adjacency map
function betweenness(nodes, adj) {
  const C = {}; nodes.forEach(n => C[n] = 0);
  nodes.forEach(s => {
    const S = [], P = {}, sigma = {}, d = {};
    nodes.forEach(n => { P[n] = []; sigma[n] = 0; d[n] = -1; });
    sigma[s] = 1; d[s] = 0;
    const Q = [s];
    while (Q.length) {
      const v = Q.shift(); S.push(v);
      (adj[v] || []).forEach(w => {
        if (d[w] < 0) { d[w] = d[v] + 1; Q.push(w); }
        if (d[w] === d[v] + 1) { sigma[w] += sigma[v]; P[w].push(v); }
      });
    }
    const delta = {}; nodes.forEach(n => delta[n] = 0);
    while (S.length) {
      const w = S.pop();
      P[w].forEach(v => { delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]); });
      if (w !== s) C[w] += delta[w];
    }
  });
  return C;
}
function comps(ids, adj) {
  const seen = new Set(), out = [];
  ids.forEach(s => {
    if (seen.has(s)) return;
    const st = [s]; seen.add(s); const c = [];
    while (st.length) { const v = st.pop(); c.push(v);
      (adj[v] || []).forEach(w => { if (!seen.has(w)) { seen.add(w); st.push(w); } }); }
    out.push(c);
  });
  return out.sort((a, b) => b.length - a.length);
}

(async () => {
  const SQL = await initSqlJs();
  for (const f of ['Clinic_extracted.db', 'LTU_AHouse_extracted.db']) {
    console.log('\n================ ' + f + ' ================');
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, f))));
    quiet(() => RW.walk(db, { write: true }));
    const dbq = s => { try { const r = db.exec(s); return r.length ? r[0].values : []; } catch (e) { return []; } };
    const rel = quiet(() => RW.doorRoomAdjacency(db, { experiment: true }));
    const roomStorey = {};
    dbq("SELECT s.guid, p.name, s.room_guid FROM spatial_structure s LEFT JOIN spatial_structure p " +
        "ON p.guid=s.parent_guid WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL")
      .forEach(r => { roomStorey[r[2] || r[0]] = r[1] || ''; });
    const corridors = new Set(Object.keys(quiet(() => HB.classifyCorridorRooms(dbq, { log: () => {} })) || {})
      .filter(g => roomStorey[g] !== undefined));

    // best available map: measured normal + rescued rooms + open thresholds (§OVERCOME's A+B+C)
    const links = [], storeyOf = {};
    const reached = new Set();
    Object.keys(rel.expAdj).forEach(st => {
      const e = rel.expAdj[st];
      e.kept.forEach(g => storeyOf[g] = st); e.dropped.forEach(g => storeyOf[g] = st);
      e.doors.forEach(d => d.ids.forEach(g => { if (g.startsWith('DROP_')) reached.add(g); }));
    });
    Object.keys(rel.expAdj).forEach(st => {
      const e = rel.expAdj[st];
      const ok = g => !g.startsWith('DROP_') || reached.has(g);
      e.doors.forEach(d => { if (d.ids.length === 2 && d.ids.every(ok)) links.push(d.ids.slice()); });
      e.open.forEach(pr => { if (pr.every(ok)) links.push(pr.slice()); });
    });
    const nodes = [...new Set(Object.keys(storeyOf).filter(g => !g.startsWith('DROP_') || reached.has(g)))];
    const adj = {}; nodes.forEach(n => adj[n] = []);
    links.forEach(([a, b]) => { if (adj[a] && adj[b] && adj[a].indexOf(b) < 0) { adj[a].push(b); adj[b].push(a); } });

    // ---- C1 CEILING
    const cs = comps(nodes, adj);
    const largest = cs[0] || [];
    console.log('§CEILING rooms=' + nodes.length + '  components=' + cs.length +
      '  largest=' + largest.length + ' (' + (100 * largest.length / nodes.length).toFixed(0) + '%)' +
      '  next sizes=' + cs.slice(1, 8).map(c => c.length).join(',') +
      '  singletons=' + cs.filter(c => c.length === 1).length);
    console.log('   -> no spine can ever serve more than ' + (100 * largest.length / nodes.length).toFixed(0) +
      '% of rooms on this substrate');

    // ---- C2 spine definitions, head to head, INSIDE the largest component
    const sub = largest, subset = new Set(sub);
    const subAdj = {}; sub.forEach(n => subAdj[n] = (adj[n] || []).filter(w => subset.has(w)));
    const bc = betweenness(sub, subAdj);
    const ranked = sub.slice().sort((a, b) => bc[b] - bc[a]);

    function report(label, spineSet) {
      const sp = sub.filter(g => spineSet.has(g));
      if (!sp.length) { console.log('§SPINE_DEF ' + label + ' — empty inside the largest component'); return; }
      const spAdj = {}; sp.forEach(n => spAdj[n] = (subAdj[n] || []).filter(w => spineSet.has(w)));
      const sc = comps(sp, spAdj);
      const onSpine = new Set(sp);
      const oneHop = sub.filter(g => !onSpine.has(g) && (subAdj[g] || []).some(w => onSpine.has(w)));
      const unreached = sub.length - sp.length - oneHop.length;
      console.log('§SPINE_DEF ' + label.padEnd(26) + ' size=' + String(sp.length).padStart(3) +
        '  components=' + String(sc.length).padStart(3) + ' largest=' + String(sc[0].length).padStart(3) +
        '  leaves within 1 hop=' + oneHop.length + '/' + (sub.length - sp.length) +
        ' (' + (100 * oneHop.length / Math.max(1, sub.length - sp.length)).toFixed(0) + '%)' +
        '  rooms needing 2+ hops=' + unreached);
    }
    report('hallway_backbone', corridors);
    [0.10, 0.15, 0.25].forEach(fr => {
      const k = Math.max(1, Math.round(sub.length * fr));
      report('betweenness top ' + (fr * 100).toFixed(0) + '%', new Set(ranked.slice(0, k)));
    });
    // articulation-style control: every node whose removal would disconnect a pair sits on the
    // spine by definition — the strictest possible "traffic must pass through here" set
    const degHi = new Set(sub.filter(g => (subAdj[g] || []).length >= 3));
    report('degree>=3', degHi);
    db.close();
  }
})();
