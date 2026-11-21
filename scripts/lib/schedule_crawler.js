// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — schedule_crawler.js. SCOPE: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.56. Read the §CRAWL lines and the screenplay after every run.
// ISSUE IT EXPOSES: "does the schedule the product plays build the building in an order a person on site would accept?" — asked as SIMPLE TRUTHS, one
//   element at a time, in the order they appear. No solver, no election, no tolerance tuning: each truth is one sentence and one comparison of two starts.
//   It walks what the PRODUCT played (the browser's own ops) on the TRUE boxes. The eyes are not needed: every finding is a row with two days in it.
// THE TRUTHS (an element is counted once per truth it breaks):
//   onNothing     what I rest on has not appeared yet       — things of my own or an earlier trade touch my underside (top at my base, overlapping in plan) and none has started
//   beforeFloor   I am on a floor that is not there yet     — the structural slab directly under me has not started
//   beforeWall    I am in a wall that is not there yet      — a window / door whose wall (it spans my height, widest overlap) has not started
//   beforeFrame   I am glass and my frame is not there yet  — a panel of a curtain wall, none of whose framing members (same declared parent) has started
// OUTPUT: counts per truth, and a SCREENPLAY: per level, the trades in the order they first appear, with every broken truth as a line "day N: what, before what (day M)".
'use strict';
const DAY = 86400000, CELL = 4, TOUCH = 0.05;
const cellsOf = e => { const o = []; for (let i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++) for (let j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j); return o; };
const ovl = (a, b) => { const x = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), y = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return x > 0 && y > 0 ? x * y : 0; };
const SEG = /^Ifc(Flow|Pipe|Duct|CableCarrier|Cable)(Segment|Fitting)$/;
function trade(e) {   // the words of the screenplay: the schedule's own phase, with the one lumped phase (envelope) said by what the piece is
  const c = e.cls || '';
  if (e.phase === 'Architecture Envelope' || e.phase === 'Architecture') {
    if (c.indexOf('IfcWall') === 0) return 'walls'; if (c === 'IfcMember') return 'glass framing'; if (c === 'IfcPlate') return 'glazing';
    if (c === 'IfcWindow' || c === 'IfcDoor') return 'windows and doors'; if (c === 'IfcRoof' || c === 'IfcSlab') return 'roof and decks'; if (c === 'IfcRailing' || c.indexOf('IfcStair') === 0) return 'stairs and railings';
    return 'other envelope';
  }
  return ({ 'Substructure': 'foundations', 'Superstructure': 'frame and slabs', 'MEP Rough-in': 'services first fix', 'Architecture Closeup': 'ceilings', 'MEP Final': 'services second fix', 'Finishes': 'finishes' })[e.phase] || (e.phase || 'unfiled');
}
// crawl(items, parentOf) — items: [{guid, cls, phase, storey, seq, x0,x1,y0,y1,bz,tz, s, e}] (true boxes, the product's times); parentOf: {child guid: declared aggregate parent guid}
function crawl(items, parentOf) {
  parentOf = parentOf || {};
  const t0 = items.reduce((m, e) => Math.min(m, e.s), Infinity), day = t => (t - t0) / DAY;
  const grid = {}; items.forEach((e, i) => cellsOf(e).forEach(c => (grid[c] = grid[c] || []).push(i)));
  const near = e => { const seen = new Set(), out = []; cellsOf(e).forEach(c => (grid[c] || []).forEach(i => { if (!seen.has(i)) { seen.add(i); out.push(items[i]); } })); return out; };
  const isFloor = e => e.cls === 'IfcSlab' && (e.phase === 'Superstructure' || e.phase === 'Substructure');
  const frames = {}; items.forEach(e => { const p = parentOf[e.guid]; if (p && e.cls === 'IfcMember') (frames[p] = frames[p] || []).push(e); });
  const F = { onNothing: [], beforeFloor: [], beforeWall: [], beforeFrame: [] }, judged = { onNothing: 0, beforeFloor: 0, beforeWall: 0, beforeFrame: 0 };
  for (const T of items) {
    const N = near(T);
    // onNothing — everything whose top is at my base
    let under = [], floor = null, wall = null, wallA = 0;
    for (const S of N) { if (S === T) continue; const a = ovl(S, T); if (!a) continue;
      if (Math.abs(S.tz - T.bz) <= TOUCH && S.bz < T.bz - TOUCH && !(typeof S.seq === 'number' && typeof T.seq === 'number' && S.seq > T.seq)) under.push(S);   // a LATER trade under me (a light under a beam) is hung from me, not carrying me
      if (isFloor(S) && S.bz < T.bz - TOUCH && S.tz <= T.bz + 0.3 && (!floor || S.tz > floor.tz)) floor = S;   // my floor starts BELOW me (a slab I hang under is not my floor)
      if ((T.cls === 'IfcWindow' || T.cls === 'IfcDoor') && S.cls.indexOf('IfcWall') === 0 && S.bz <= T.bz + TOUCH && S.tz >= T.tz - TOUCH && a > wallA) { wall = S; wallA = a; } }
    if (under.length) { judged.onNothing++; const first = under.reduce((m, S) => S.s < m.s ? S : m); if (first.s > T.s + 60000) F.onNothing.push([T, first]); }
    if (floor && !isFloor(T) && T.phase !== 'Substructure') { judged.beforeFloor++; if (floor.s > T.s + 60000) F.beforeFloor.push([T, floor]); }
    if (wall) { judged.beforeWall++; if (wall.s > T.s + 60000) F.beforeWall.push([T, wall]); }
    const fr = T.cls === 'IfcPlate' && frames[parentOf[T.guid]];
    if (fr) { judged.beforeFrame++; const first = fr.reduce((m, S) => S.s < m.s ? S : m); if (first.s > T.s + 60000) F.beforeFrame.push([T, first]); }
  }
  // the screenplay
  const SAY = { onNothing: 'appears before anything under it', beforeFloor: 'appears before its floor', beforeWall: 'appears before its wall', beforeFrame: 'glass appears before its frame' };
  const lv = {}; items.forEach(e => { const L = lv[e.storey] || (lv[e.storey] = { first: Infinity, tr: {} }); L.first = Math.min(L.first, e.s);
    const k = trade(e), t = L.tr[k] || (L.tr[k] = { n: 0, a: Infinity, b: -Infinity }); t.n++; t.a = Math.min(t.a, e.s); t.b = Math.max(t.b, e.s); });
  const bad = {}; Object.keys(F).forEach(r => F[r].forEach(([T, S]) => { const k = T.storey + '|' + trade(T) + '|' + r + '|' + trade(S); const b = bad[k] || (bad[k] = { n: 0, a: Infinity, eg: null, late: 0 });
    b.n++; if (T.s < b.a) { b.a = T.s; b.eg = [T, S]; } b.late = Math.max(b.late, day(S.s) - day(T.s)); }));
  const lines = [];
  Object.keys(lv).sort((x, y) => lv[x].first - lv[y].first).forEach(L => {
    lines.push(''); lines.push('LEVEL  ' + L);
    Object.keys(lv[L].tr).sort((x, y) => lv[L].tr[x].a - lv[L].tr[y].a).forEach(k => { const t = lv[L].tr[k];
      lines.push('  day ' + String(Math.floor(day(t.a))).padStart(3) + ' to ' + String(Math.floor(day(t.b))).padStart(3) + '   ' + k + ' (' + t.n + ')');
      Object.keys(bad).filter(b => b.indexOf(L + '|' + k + '|') === 0).sort((x, y) => bad[y].n - bad[x].n).forEach(b => { const r = b.split('|')[2], v = bad[b], T = v.eg[0], S = v.eg[1];
        lines.push('      ✗ ' + v.n + ' ' + SAY[r] + ' (' + b.split('|')[3] + ') — first on day ' + day(T.s).toFixed(1) + ': ' + T.cls + ' ' + T.guid + ', and that ' + S.cls + ' ' + S.guid + ' starts day ' + day(S.s).toFixed(1) + '; worst wait ' + v.late.toFixed(1) + ' d'); });
    });
  });
  const counts = {}; Object.keys(F).forEach(r => { counts[r] = judged[r] ? F[r].length : null; });
  return { counts, judged, lines, guids: Object.fromEntries(Object.keys(F).map(r => [r, F[r].map(p => p[0].guid)])) };
}
module.exports = { crawl, trade };
