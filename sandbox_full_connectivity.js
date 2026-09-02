#!/usr/bin/env node
/**
 * SANDBOX (not a witness) — hand-built graphs with known connectivity, isolating
 * RoomGraph.fullConnectivity() from real-building data noise. Answers the user's own question
 * (2026-07-14): "is there a simple test where every door can go to any other door via a covered
 * path, no gap?" — this IS that test; these checks prove its core logic before trusting it on
 * real data (see witness_full_connectivity.js for the real-building report).
 * Run: node sandbox_full_connectivity.js
 */
'use strict';
const RG = require('./common/room_graph.js');
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  OK ' + n); } else { fail++; console.log('  FAIL ' + n + '  ' + (x || '')); } };

// ── Test A: a fully-connected graph (chain room-circ-room) reports fullyConnected=true ──
{
  const graph = {
    nodesByGuid: {
      R1: { kind: 'room' }, R2: { kind: 'room' }, C1: { kind: 'circ' }
    },
    edges: [
      { a: 'R1', b: 'C1', kind: 'E2', doorGuid: 'D1' },
      { a: 'C1', b: 'R2', kind: 'E2', doorGuid: 'D2' }
    ]
  };
  const fc = RG.fullConnectivity(graph);
  chk('A1 fully-connected 3-node graph reports components=1', fc.components === 1, 'components=' + fc.components);
  chk('A2 fullyConnected flag is true', fc.fullyConnected === true);
  chk('A3 totalNodes counts all 3 real nodes', fc.totalNodes === 3, 'totalNodes=' + fc.totalNodes);
  chk('A4 largestComponent equals totalNodes when fully connected', fc.largestComponent === 3);
}

// ── Test B: a real gap — one room with NO edge at all must show as its own isolated island ──
{
  const graph = {
    nodesByGuid: { R1: { kind: 'room' }, R2: { kind: 'room' }, R3: { kind: 'room' } },
    edges: [{ a: 'R1', b: 'R2', kind: 'E1', doorGuid: 'D1' }]   // R3 has no edge at all
  };
  const fc = RG.fullConnectivity(graph);
  chk('B1 a real doorless room produces components=2 (the gap IS detected)', fc.components === 2, 'components=' + fc.components);
  chk('B2 fullyConnected is false', fc.fullyConnected === false);
  chk('B3 R3 sits in its own size-1 island', fc.sizes.indexOf(1) >= 0 && fc.comp.R3 !== fc.comp.R1, JSON.stringify(fc.comp));
}

// ── Test C: the doorwp/stairwp-inflation bug this fix closes — a lookup-only waypoint node that
// is NEVER an edge endpoint must NOT be counted as a phantom island (real bug found building this:
// Clinic showed ~200 fake size-1 islands from exactly this before the fix) ──
{
  const graph = {
    nodesByGuid: {
      R1: { kind: 'room' }, R2: { kind: 'room' },
      DW1: { kind: 'doorwp' },   // registered for detour lookups, never wired into any edge
      SW1: { kind: 'stairwp' }   // registered for path-render lookups, never wired into any edge
    },
    edges: [{ a: 'R1', b: 'R2', kind: 'E1', doorGuid: 'D1' }]
  };
  const fc = RG.fullConnectivity(graph);
  chk('C1 fully connected (the 2 real rooms) despite 2 untouched lookup-only nodes present', fc.fullyConnected === true, 'components=' + fc.components);
  chk('C2 totalNodes counts only the 2 real rooms, NOT the 2 lookup-only nodes', fc.totalNodes === 2, 'totalNodes=' + fc.totalNodes);
}

// ── Test D: a doorwp node that IS wired into a real edge (§G7 orphan-door-to-spine, E7) DOES
// count — the fix must not blanket-exclude doorwp, only the untouched ones ──
{
  const graph = {
    nodesByGuid: { R1: { kind: 'room' }, SPINE1: { kind: 'spine' }, DW_ORPHAN: { kind: 'doorwp' } },
    edges: [
      { a: 'R1', b: 'SPINE1', kind: 'E6' },
      { a: 'DW_ORPHAN', b: 'SPINE1', kind: 'E7' }   // a real E7 edge — DW_ORPHAN must be a real vertex
    ]
  };
  const fc = RG.fullConnectivity(graph);
  chk('D1 an edge-wired doorwp (E7) IS included and connected', fc.fullyConnected === true && fc.totalNodes === 3,
    'totalNodes=' + fc.totalNodes + ' fullyConnected=' + fc.fullyConnected);
}

console.log('\n§SANDBOX_FULL_CONNECTIVITY DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
