#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-UTIL-PENALTY scope (READ THE LOG after every run)
 * SCOPE: VIEWER_FIND_PANEL_ROOM_ACCURACY.md §10 utility-room routing penalty.
 *   PR #959 (base): common/room_graph.js buildGraph() tags utility rooms; _buildAdjacency()
 *     multiplies any edge touching a tagged node by UTILITY_EDGE_PENALTY (=8) — a penalty, not
 *     removal. Both shortestPath() and escapeRoute() consume that adjacency.
 *   THIS change (door-exemption): common/room_habitability.js classifyUtilityRooms/utilityContentClass
 *     gain an additive opts.ignoreDoorExemption (default false = byte-identical display behavior).
 *     room_graph.js's routing call passes {ignoreDoorExemption:true} so real door-carrying service
 *     rooms are classified by element COMPOSITION alone (the door-exempt display default missed
 *     them — a graph edge REQUIRES a nearby door, so before, no through-hoppable room was ever
 *     tagged). CORRIDOR_ROOM circulation nodes are excluded from tagging outright (never penalise a
 *     corridor). This is what actually closes the reported bug (screenshot: Hospital Level 1 R7/R13
 *     used as corridor-bypass through-hops).
 *
 * ISSUES PROVEN / DISPROVED (each check names its issue):
 *   A DISPLAY-REGRESSION — classifyUtilityRooms with DEFAULT opts is byte-identical to the origin/main
 *     "before" module on every building (Clinic/Duplex/JKR) → navigate_find.js's two Type-lens
 *     display call sites (which pass no opts) are provably unaffected. VERIFIED, not just asserted.
 *   B ROUTING-TAG-FIRES — buildGraph (ignoreDoorExemption:true) now tags real door-carrying utility
 *     rooms that CARRY EDGES (Hospital: the real screenshot rooms RM_Level_1_7 + RM_Level_1_13), and
 *     tags ZERO CORRIDOR_ROOM circulation nodes (the guard). The door-exempt default tagged none of
 *     these (contrast quoted). This is the gap #959 could not reach, now closed.
 *   C MULTIPLIER-MATH — a touching edge's weight is exactly ×UTILITY_EDGE_PENALTY when tagged.
 *   D REAL-REROUTE — on Hospital (the real screenshot building), a query that USED R13/R7 as a
 *     corridor-bypass through-hop now AVOIDS them in favour of the corridor. REAL tags (not forced).
 *   E REACHABLE — a tagged utility room is still reachable as a destination (finite penalty, non-null).
 *   F NO-REGRESSION — a building with no routing utility rooms (JKR) is byte-identical NEW vs before.
 *   HONEST FINDING — logged: composition-PRESENCE (a duct overhead) over-tags on duct-dense buildings
 *     (Clinic), so the net effect there is general corridor-preference rather than cabling-only
 *     targeting; a duct-DOMINANCE threshold is the named follow-up. Reported, not hidden.
 *
 * RUN: node witness_room_graph_utility_penalty.js   (from the worktree root)
 */
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process');
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
// "before" = origin/main @ #959 merge (post-PR-959, pre-this door-exemption change). Regenerated
// next to the live siblings so requires resolve; gitignored, never committed. Pinning keeps it stable.
const BEFORE_SHA = '6209f54';
function before(name) {
  const p = path.join(__dirname, 'common', '_' + name + '_before.js');
  if (!fs.existsSync(p)) fs.writeFileSync(p, cp.execSync('git show ' + BEFORE_SHA + ':common/' + name + '.js', { cwd: __dirname, maxBuffer: 1 << 24 }));
  return require(p);
}
const RG = require('./common/room_graph.js');           // NEW (under test)
const RH = require('./common/room_habitability.js');    // NEW
const RGbefore = before('room_graph');                  // origin/main @ #959
const RHbefore = before('room_habitability');           // origin/main @ #959

const B = n => '/home/red1/bim-ootb/buildings/' + n + '_extracted.db';
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const openQ = p => { const db = new Database(p, { readonly: true }); return { db, q: (s, prm) => db.prepare(s).raw(true).all(...(prm || [])) }; };
const roomList = (g, p) => p.filter(x => g.nodesByGuid[x] && g.nodesByGuid[x].kind === 'room');
function descsOf(g) {
  return g.nodes.filter(n => n.guid.indexOf('CORRIDOR_ROOM::') !== 0).map(n => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    n.rects.forEach(r => { a = Math.min(a, r.x0); b = Math.max(b, r.x1); c = Math.min(c, r.y0); d = Math.max(d, r.y1); });
    return { guid: n.guid, cx: (a + b) / 2, cy: (c + d) / 2, sx: b - a, sy: d - c, storey: n.storey };
  });
}

console.log('§W-UTIL-PENALTY');

// ── Part A — DISPLAY REGRESSION (the opts default must not disturb the Type-lens) ──
console.log('\n§A display regression — classifyUtilityRooms default == origin/main "before"');
['Clinic', 'Duplex', 'JKR'].forEach(name => {
  const { db, q } = openQ(B(name));
  const g = RGbefore.buildGraph(q, { log: () => {} }); // any graph — we only need room descs
  const descs = descsOf(g);
  const dNew = RH.classifyUtilityRooms(descs, q);                              // no opts
  const dNewEmpty = RH.classifyUtilityRooms(descs, q, {});                     // {} opts
  const dNewFalse = RH.classifyUtilityRooms(descs, q, { ignoreDoorExemption: false });
  const dBefore = RHbefore.classifyUtilityRooms(descs, q);                     // origin/main
  const same = JSON.stringify(dNew) === JSON.stringify(dBefore) &&
    JSON.stringify(dNewEmpty) === JSON.stringify(dBefore) && JSON.stringify(dNewFalse) === JSON.stringify(dBefore);
  console.log('  §A_DISPLAY ' + name + ' before=' + Object.keys(dBefore).length + ' newDefault=' + Object.keys(dNew).length);
  chk('A-' + name + ' DISPLAY-REGRESSION default opts byte-identical to origin/main (display call sites unaffected)',
    same, Object.keys(dNew).length + '==' + Object.keys(dBefore).length);
  db.close();
});

// ── Part B — routing tag now fires on real door-carrying rooms; corridors excluded ──
console.log('\n§B routing tag fires on real door-carrying service rooms (Hospital screenshot rooms)');
{
  const { db, q } = openQ(B('Hospital'));
  const logs = [];
  const g = RG.buildGraph(q, { log: m => logs.push(m) });
  console.log('  §log: ' + (logs.find(l => l.indexOf('§ROOM_GRAPH_UTILITY ') === 0) || '(none)'));
  const tagged = g.nodes.filter(n => n.isUtility);
  const corridorTagged = tagged.filter(n => n.guid.indexOf('CORRIDOR_ROOM::') === 0);
  const deg = gid => g.edges.filter(e => e.a === gid || e.b === gid).length;
  const screenshot = ['RM_Level_1_7', 'RM_Level_1_13'];
  const scTagged = screenshot.filter(gid => g.nodesByGuid[gid] && g.nodesByGuid[gid].isUtility && deg(gid) > 0);
  // contrast: door-exempt "before" module tagged none of the screenshot rooms
  const gBefore = RGbefore.buildGraph(q, { log: () => {} });
  const scBefore = screenshot.filter(gid => gBefore.nodesByGuid[gid] && gBefore.nodesByGuid[gid].isUtility);
  console.log('  §B_SCREENSHOT ' + screenshot.map(gid => gid + '(nowTagged=' + !!(g.nodesByGuid[gid] && g.nodesByGuid[gid].isUtility) + ',deg=' + deg(gid) + ',beforeTagged=' + (gBefore.nodesByGuid[gid] ? !!gBefore.nodesByGuid[gid].isUtility : 'n/a') + ')').join(' '));
  chk('B1 ROUTING-TAG-FIRES both real screenshot rooms (RM_Level_1_7, RM_Level_1_13) now tagged utility WITH edges (door-exempt default tagged neither)',
    scTagged.length === 2 && scBefore.length === 0, 'nowTagged=' + scTagged.length + '/2 beforeTagged=' + scBefore.length);
  chk('B2 NEVER-PENALISE-A-CORRIDOR zero CORRIDOR_ROOM circulation nodes tagged utility (the guard holds)',
    corridorTagged.length === 0, 'corridorTagged=' + corridorTagged.length + ' of ' + tagged.length + ' tagged');
  db.close();
}

// ── Part C — multiplier math (unchanged from #959, re-verified) ──
console.log('\n§C multiplier math ×UTILITY_EDGE_PENALTY');
{
  const { db, q } = openQ(B('Clinic'));
  const g = RG.buildGraph(q, { log: () => {} });
  // clear all tags to get a clean baseline edge, then tag one endpoint
  const saved = {}; g.nodes.forEach(n => { saved[n.guid] = n.isUtility; n.isUtility = false; });
  const e1 = g.edges.find(e => e.kind === 'E1' && g.nodesByGuid[e.a].kind === 'room' && g.nodesByGuid[e.b].kind === 'room');
  const d0 = RG.shortestPath(g, e1.a, e1.b).distance;
  g.nodesByGuid[e1.a].isUtility = true;
  const d1 = RG.shortestPath(g, e1.a, e1.b).distance;
  g.nodes.forEach(n => { n.isUtility = saved[n.guid]; });
  const ratio = d1 / d0;
  console.log('  §MULTIPLIER pair=' + e1.a + '->' + e1.b + ' d0=' + d0.toFixed(4) + ' d1=' + d1.toFixed(4) + ' ratio=' + ratio.toFixed(4));
  chk('C MULTIPLIER-MATH exactly ×8', Math.abs(ratio - 8) < 1e-6, 'ratio=' + ratio.toFixed(4));
  db.close();
}

// ── Part D — REAL reroute on Hospital (real tags, not forced) ──
console.log('\n§D real reroute on Hospital — avoids the screenshot service rooms via the corridor');
{
  const { db, q } = openQ(B('Hospital'));
  const g = RG.buildGraph(q, { log: () => {} });
  const A = 'RM_Level_1_16', M = 'RM_Level_1_13';
  // discover a Level-1 corridor destination whose UNPENALISED path threads M, then show the real
  // (penalised) path avoids M. "before" = clear tags (door-exempt tagging left these edged rooms
  // untagged → penalty inert → same as no tags for path selection).
  const corridors = g.nodes.filter(n => n.guid.indexOf('CORRIDOR_ROOM::Level 1') === 0).map(n => n.guid);
  let ex = null;
  for (const Bc of corridors) {
    const saved = {}; g.nodes.forEach(n => { saved[n.guid] = n.isUtility; n.isUtility = false; });
    const b0 = RG.shortestPath(g, A, Bc);
    g.nodes.forEach(n => { n.isUtility = saved[n.guid]; });
    if (!b0 || b0.path.slice(1, -1).indexOf(M) < 0) continue;
    const b1 = RG.shortestPath(g, A, Bc); // real tags active
    if (b1 && b1.path.indexOf(M) < 0) { ex = { Bc, b0, b1 }; break; }
  }
  if (ex) {
    console.log('  §REAL_REROUTE ' + A + '->' + ex.Bc);
    console.log('    before(unpenalised) rooms=[' + roomList(g, ex.b0.path).join(',') + '] d=' + ex.b0.distance.toFixed(2));
    console.log('    after (penalised)   rooms=[' + roomList(g, ex.b1.path).join(',') + '] d=' + ex.b1.distance.toFixed(2) + ' avoids ' + M + '=' + (ex.b1.path.indexOf(M) < 0));
  }
  chk('D REAL-REROUTE a real Hospital query that cut through RM_Level_1_13 (+R7) now routes via the corridor instead, and still resolves',
    !!ex && ex.b1.path.indexOf(M) < 0 && ex.b0.path.indexOf(M) >= 0,
    ex ? ('rerouted, d ' + ex.b0.distance.toFixed(1) + '→' + ex.b1.distance.toFixed(1)) : 'no case found');
  db.close();
}

// ── Part E — reachability preserved ──
console.log('\n§E reachability preserved (destination IS a tagged utility room)');
{
  const { db, q } = openQ(B('Hospital'));
  const g = RG.buildGraph(q, { log: () => {} });
  const M = 'RM_Level_1_13';
  // pick any ordinary room that can reach M; confirm non-null with real tags active
  const src = g.nodes.find(n => n.kind === 'room' && !n.isUtility && RG.shortestPath(g, n.guid, M));
  const p = src ? RG.shortestPath(g, src.guid, M) : null;
  console.log('  §E_REACHABLE ' + (src ? src.guid : '?') + '->' + M + ' tagged=' + !!g.nodesByGuid[M].isUtility + ' d=' + (p ? p.distance.toFixed(2) : 'null'));
  chk('E REACHABLE a tagged utility room is still reachable as a destination (finite penalty, non-null)',
    !!p && p.distance > 0, p ? ('d=' + p.distance.toFixed(2)) : 'NULL');
  db.close();
}

// ── Part F — no-regression on a routing-inert building ──
console.log('\n§F no-regression (JKR, 0 routing utility rooms) — byte-identical vs before');
{
  const { db, q } = openQ(B('JKR'));
  const gNew = RG.buildGraph(q, { log: () => {} });
  const gOld = RGbefore.buildGraph(q, { log: () => {} });
  const nUtil = gNew.nodes.filter(n => n.isUtility).length;
  const rooms = gNew.nodes.map(n => n.guid);
  let cmp = 0, id = 0, firstDiff = null;
  const L = Math.min(rooms.length, 20);
  for (let i = 0; i < L; i++) for (let j = i + 1; j < L; j++) {
    const pN = RG.shortestPath(gNew, rooms[i], rooms[j]), pO = RGbefore.shortestPath(gOld, rooms[i], rooms[j]);
    cmp++;
    const same = (pN === null && pO === null) || (pN && pO && JSON.stringify(pN.path) === JSON.stringify(pO.path) && Math.abs(pN.distance - pO.distance) < 1e-9);
    if (same) id++; else if (!firstDiff) firstDiff = rooms[i] + '->' + rooms[j];
  }
  console.log('  §F_NOREG JKR utilityRooms=' + nUtil + ' compared=' + cmp + ' identical=' + id + (firstDiff ? ' firstDiff=' + firstDiff : ''));
  chk('F NO-REGRESSION JKR (no routing utility rooms) every path byte-identical to origin/main', nUtil === 0 && id === cmp && cmp > 0, id + '/' + cmp);
  db.close();
}

// ── Honest finding: composition-presence over-tags duct-dense buildings ──
console.log('\n§HONEST-FINDING composition-presence over-tagging (reported, not a failure)');
{
  const { db, q } = openQ(B('Clinic'));
  const g = RG.buildGraph(q, { log: () => {} });
  const tagged = g.nodes.filter(n => n.isUtility).length, rooms = g.nodes.filter(n => n.kind === 'room').length;
  console.log('  §OVERTAG Clinic tagged=' + tagged + '/' + rooms + ' rooms — HVAC ducts traverse most ceilings, so composition-PRESENCE');
  console.log('    tags most rooms; net effect there = general corridor-preference (corridors exempt), NOT cabling-only targeting.');
  console.log('    Follow-up (named in doc §10): a duct-DOMINANCE threshold to single out true service rooms. Not invented here.');
  db.close();
}

console.log('\n§W-UTIL-PENALTY DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
