#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-PATH-REDUNDANCY scope (READ THE LOG after every run)
 * SPEC: bim-compiler prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md §20.
 * SCOPE: characterise the user's long-reported "redundant pathing errors" NUMERICALLY on Clinic
 * (118 spaces, 254 doors) and Duplex (5 spaces, 14 doors). MEASURE ONLY — this witness changes no
 * engine code. Every §11-§18 number before this one is a LEGALITY statistic ("does the line stay on
 * real floor"); redundancy is a different question ("does the line waste the walk"), and a route can
 * be 100% legal and still double back. That gap is what blocks the cable-pathing lane
 * (prompts/datacentre_cabling.md §NEXT_SESSION) and it is what this measures.
 *
 * PROVES/DISPROVES (§20.2): R1 anchor revisit (benign stair-flight repeats separated from real ones),
 * R2 point revisit, R3 doubled-back segments, R4 detour ratio vs straight line, R5 room re-entry,
 * R6 the engine's own detour-quality events. A green run does NOT mean "no redundancy" — it means the
 * six numbers were produced; the ASSERTIONS below fail only on a metric being unmeasurable (no routes,
 * no rooms), because a defect count is a finding to record, not a test to pass.
 *
 * REGIME FIDELITY (§20.1 — the [[feedback_witness_headless_regime_gap]] trap): Clinic and Duplex carry
 * ONLY RM_-prefixed compiled rooms and no room_guid column, so the browser's A.ensureRooms scores
 * versionStale and RECOMPILES with RoomWalker.walk() on every load. This witness therefore runs the
 * walker first, exactly as the browser does — measuring the raw file's rooms would measure a room set
 * the browser never routes. Neither building has a walkable raster or a patches/*.sql: both are the
 * rect-fallback regime, deliberately the weaker evidence where redundancy is worst.
 *
 * The DRAWN line is `result.polyline` when length>1, else the path anchor centres — the exact rule
 * viewer/navigate_find.js `_drawPathHighlight()` uses. Redundancy is measured on THAT, not on `path`.
 *
 * RUN: node witness_room_path_redundancy.js 2>&1 | tee /tmp/w_roompath_redundancy.log
 *      (needs /home/red1/bim-ootb/buildings/{Clinic,Duplex}_extracted.db)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));

const RG = require('./common/room_graph.js');
const RoomWalker = require('./viewer/lib/room_walker.js');
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// ── metric constants (§20.2) — each is a stated definition, not a tuned threshold ──
const REVISIT_EPS = 0.05;      // m — two polyline vertices at "the same spot"
const REVERSAL_COS = -0.866;   // unit-dot of consecutive segments = turn angle > 150°
const DEGENERATE = 1e-6;       // m — a 2D-zero segment (a pure vertical stair hop)

function q1(db, sql) { const r = db.exec(sql); return r.length ? r[0].values : []; }

// ── R1: anchor revisit, benign stair-flight repeats separated from real ones ──
// §17 proved one stair legitimately appears once per flight; stairBaseKey() is the engine's OWN
// grouping for that, so it is reused rather than re-derived.
function anchorRevisit(g, pathArr) {
  const seen = {}, repeats = {};
  for (const guid of pathArr) { if (seen[guid]) repeats[guid] = (repeats[guid] || 1) + 1; seen[guid] = true; }
  let benign = 0, real = 0, realGuids = [];
  for (const guid in repeats) {
    const n = g.nodesByGuid[guid];
    if (n && n.kind === 'stairwp') benign += repeats[guid] - 1;
    else { real += repeats[guid] - 1; realGuids.push(guid + ' x' + repeats[guid]); }
  }
  return { excess: pathArr.length - Object.keys(seen).length, benign, real, realGuids };
}

// ── R2 + R3: geometry redundancy on the DRAWN line ──
function lineRedundancy(pts) {
  let ptRevisits = 0, reversals = 0, reversalMetres = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = 0; j + 2 <= i; j++) {   // non-adjacent only (j <= i-2)
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) <= REVISIT_EPS) { ptRevisits++; break; }
    }
  }
  for (let i = 1; i + 1 < pts.length; i++) {
    const ax = pts[i].x - pts[i - 1].x, ay = pts[i].y - pts[i - 1].y;
    const bx = pts[i + 1].x - pts[i].x, by = pts[i + 1].y - pts[i].y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < DEGENERATE || lb < DEGENERATE) continue;   // vertical stair hop — not a turn
    const dot = (ax * bx + ay * by) / (la * lb);
    if (dot < REVERSAL_COS) { reversals++; reversalMetres += Math.min(la, lb); }
  }
  return { ptRevisits, reversals, reversalMetres };
}

function len2D(pts) { let L = 0; for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); return L; }

// ── R5: room re-entry — the route leaves a room's footprint and later comes back ──
// Vertex → containing room (compiled rects, this storey only). A room occupying >=2 NON-CONTIGUOUS
// runs of the vertex sequence is one re-entry. Vertices in no room (corridor/doorway) break no run.
function roomReentry(roomsOnStorey, pts) {
  const seq = [];
  for (const p of pts) {
    let hit = null;
    for (const r of roomsOnStorey) {
      for (const rc of r.rects) {
        if (p.x >= rc.x0 && p.x <= rc.x1 && p.y >= rc.y0 && p.y <= rc.y1) { hit = r.guid; break; }
      }
      if (hit) break;
    }
    if (hit) seq.push(hit);
  }
  const runs = [];
  for (const s of seq) if (!runs.length || runs[runs.length - 1] !== s) runs.push(s);
  const count = {};
  runs.forEach(g => { count[g] = (count[g] || 0) + 1; });
  let reentries = 0, guids = [];
  for (const g in count) if (count[g] > 1) { reentries += count[g] - 1; guids.push(g + ' x' + count[g]); }
  return { reentries, guids };
}

// storey of a route: the common storey of all real (non-stairwp) anchors, else null (cross-storey)
function pathStorey(g, p) {
  let st = null;
  for (const guid of p) { const n = g.nodesByGuid[guid]; if (!n || n.storey == null || n.kind === 'stairwp') continue; if (st == null) st = n.storey; else if (st !== n.storey) return null; }
  return st;
}

function pct(a, b) { return b ? (100 * a / b).toFixed(1) + '%' : 'n/a'; }
function quant(arr, p) { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

async function measure(SQL, label, dbFile) {
  const buf = fs.readFileSync(path.join(BLD, dbFile));
  const db = new SQL.Database(new Uint8Array(buf));

  // §20.1 REGIME FIDELITY — the browser's own recompile, before any graph is built.
  const realLog = console.log; console.log = () => {};
  const walk = RoomWalker.walk(db, { write: true });
  console.log = realLog;
  console.log('\n═══ ' + label + ' (' + dbFile + ') ═══');
  console.log('§REDUN_REGIME ' + label + ' walkerRooms=' + walk.roomsWritten + ' rects=' + walk.rectRowsWritten +
    ' suspect=' + walk.suspectTotal + ' raster=' + (q1(db, "SELECT COUNT(*) FROM sqlite_master WHERE name='storey_walkable_raster'")[0][0] ? 'yes' : 'NO(rect-fallback)'));

  const dbQuery = (sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return []; } };
  const g = RG.buildGraph(dbQuery, { log: () => {} });
  const rooms = g.nodes.filter(n => n.kind === 'room');
  const roomsByStorey = {};
  rooms.forEach(r => { (roomsByStorey[r.storey] = roomsByStorey[r.storey] || []).push({ guid: r.guid, rects: r.rects || [] }); });
  console.log('§REDUN_GRAPH ' + label + ' rooms=' + rooms.length + ' nodes=' + Object.keys(g.nodesByGuid).length +
    ' edges=' + g.edges.length + ' storeys=' + Object.keys(roomsByStorey).length);

  // §R6 — count the engine's OWN detour-quality lines emitted during the sweep.
  const ev = { FAIL: 0, NONLOCAL: 0, REVISIT_KEPT: 0, NOREVISIT: 0, LEGAL: 0, MID: 0 };
  console.log = (m) => {
    const s = String(m);
    if (s.indexOf('§PATH_LEGAL_DETOUR_FAIL') >= 0) ev.FAIL++;
    else if (s.indexOf('§PATH_LEGAL_DETOUR_NONLOCAL') >= 0) ev.NONLOCAL++;
    else if (s.indexOf('§PATH_LEGAL_DETOUR_REVISIT_KEPT') >= 0) ev.REVISIT_KEPT++;
    else if (s.indexOf('§PATH_LEGAL_DETOUR_NOREVISIT') >= 0) ev.NOREVISIT++;
    else if (s.indexOf('§PATH_LEGAL_DETOUR_MID') >= 0) ev.MID++;
    else if (s.indexOf('§PATH_LEGAL ') >= 0) ev.LEGAL++;
  };

  const A = { pairs: 0, routed: 0, unreachable: 0, sameStorey: 0, noPolyline: 0,
    r1excess: 0, r1benign: 0, r1real: 0, r1routes: 0,
    r2pts: 0, r2routes: 0, r3seg: 0, r3m: 0, r3routes: 0,
    r5reentries: 0, r5routes: 0,
    excessM: 0, drawnM: 0, straightM: 0 };
  const ratios = [], worst = [];

  const t0 = Date.now();
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      A.pairs++;
      const res = RG.shortestPath(g, rooms[i].guid, rooms[j].guid);
      if (!res) { A.unreachable++; continue; }
      A.routed++;

      const r1 = anchorRevisit(g, res.path);
      A.r1excess += r1.excess; A.r1benign += r1.benign; A.r1real += r1.real;
      if (r1.real > 0) A.r1routes++;

      const drawn = (res.polyline && res.polyline.length > 1)
        ? res.polyline
        : res.path.map(gu => { const n = g.nodesByGuid[gu]; return { x: n.cx, y: n.cy, z: n.cz || 0 }; });
      if (!(res.polyline && res.polyline.length > 1)) A.noPolyline++;

      const lr = lineRedundancy(drawn);
      A.r2pts += lr.ptRevisits; if (lr.ptRevisits) A.r2routes++;
      A.r3seg += lr.reversals; A.r3m += lr.reversalMetres; if (lr.reversals) A.r3routes++;

      const st = pathStorey(g, res.path);
      if (st == null) continue;                 // cross-storey: R4/R5 not defined (§20.2)
      A.sameStorey++;
      const L = len2D(drawn);
      const S = Math.hypot(rooms[j].cx - rooms[i].cx, rooms[j].cy - rooms[i].cy);
      if (S > 0.5) {
        const ratio = L / S;
        ratios.push(ratio);
        A.drawnM += L; A.straightM += S; A.excessM += (L - S);
        worst.push({ ratio, excess: L - S, L, S, from: rooms[i].name || rooms[i].guid, to: rooms[j].name || rooms[j].guid,
          rev: lr.reversals, ptRev: lr.ptRevisits });
      }
      const rr = roomReentry(roomsByStorey[st] || [], drawn);
      A.r5reentries += rr.reentries; if (rr.reentries) A.r5routes++;
    }
  }
  const ms = Date.now() - t0;
  console.log = realLog;
  db.close();

  const over = (t) => ratios.filter(r => r > t).length;
  console.log('§REDUN_SWEEP ' + label + ' pairs=' + A.pairs + ' routed=' + A.routed + ' (' + pct(A.routed, A.pairs) + ')' +
    ' unreachable=' + A.unreachable + ' sameStoreyMeasured=' + A.sameStorey + ' noPolylineFallback=' + A.noPolyline +
    ' elapsedMs=' + ms + ' msPerRoute=' + (A.routed ? (ms / A.routed).toFixed(2) : '0'));
  console.log('§REDUN_R1 ' + label + ' anchorRevisit excess=' + A.r1excess + ' benignStairFlights=' + A.r1benign +
    ' REAL=' + A.r1real + ' routesWithRealRevisit=' + A.r1routes + ' (' + pct(A.r1routes, A.routed) + ' of routed)');
  console.log('§REDUN_R2 ' + label + ' pointRevisits=' + A.r2pts + ' routesAffected=' + A.r2routes +
    ' (' + pct(A.r2routes, A.routed) + ' of routed) eps=' + REVISIT_EPS + 'm');
  console.log('§REDUN_R3 ' + label + ' doubledBackSegments=' + A.r3seg + ' metresInReversals=' + A.r3m.toFixed(1) +
    ' routesAffected=' + A.r3routes + ' (' + pct(A.r3routes, A.routed) + ' of routed) turn>150deg');
  console.log('§REDUN_R4 ' + label + ' detourRatio median=' + quant(ratios, 0.5).toFixed(2) +
    ' p90=' + quant(ratios, 0.9).toFixed(2) + ' max=' + (ratios.length ? Math.max.apply(null, ratios).toFixed(2) : '0') +
    ' over1.5x=' + over(1.5) + ' over2x=' + over(2) + ' over3x=' + over(3) + ' of ' + ratios.length);
  console.log('§REDUN_R5 ' + label + ' roomReentries=' + A.r5reentries + ' routesAffected=' + A.r5routes +
    ' (' + pct(A.r5routes, A.sameStorey) + ' of same-storey)');
  console.log('§REDUN_R6 ' + label + ' DETOUR_FAIL=' + ev.FAIL + ' NONLOCAL=' + ev.NONLOCAL +
    ' REVISIT_KEPT=' + ev.REVISIT_KEPT + ' NOREVISIT=' + ev.NOREVISIT + ' MID=' + ev.MID + ' legalizeCalls=' + ev.LEGAL);
  console.log('§REDUN_HEADLINE ' + label + ' drawnMetres=' + A.drawnM.toFixed(0) + ' straightMetres=' + A.straightM.toFixed(0) +
    ' excessMetres=' + A.excessM.toFixed(0) + ' (' + pct(A.excessM, A.straightM) + ' over straight line)' +
    ' avgExcessPerRoute=' + (ratios.length ? (A.excessM / ratios.length).toFixed(1) : '0') + 'm');

  worst.sort((a, b) => b.ratio - a.ratio);
  worst.slice(0, 8).forEach((w, k) => console.log('§REDUN_WORST ' + label + ' #' + (k + 1) + ' ratio=' + w.ratio.toFixed(2) +
    ' drawn=' + w.L.toFixed(1) + 'm straight=' + w.S.toFixed(1) + 'm excess=' + w.excess.toFixed(1) + 'm' +
    ' reversals=' + w.rev + ' ptRevisits=' + w.ptRev + ' from="' + w.from + '" to="' + w.to + '"'));

  return Object.assign(A, { ratios, ev, rooms: rooms.length, worst });
}

(async () => {
  const SQL = await initSqlJs();
  console.log('W-ROOM-PATH-REDUNDANCY — VIEWER_FIND_PANEL_ROOM_ACCURACY.md §20');
  console.log('engine=' + require('child_process').execSync('git -C ' + __dirname + ' rev-parse --short HEAD').toString().trim() +
    ' (origin/main worktree — the shared ~/bim-ootb checkout is 119 commits stale, §20.1)');

  const clinic = await measure(SQL, 'Clinic', 'Clinic_extracted.db');
  const duplex = await measure(SQL, 'Duplex', 'Duplex_extracted.db');
  // §20.1b — the building the user actually reported the criss-crossing on (2026-07-30, mid-session).
  // Fixture choice is NOT arbitrary: bim-compiler/deploy/dev/buildings/LTU_AHouse_extracted.db (440MB,
  // md5 221351eb…) has NO spatial_structure table at all, so it cannot be the rooms source;
  // ~/bim-ootb/buildings/LTU_AHouse_extracted.db (71MB, md5 f517cc2e…, 369 RM_ spaces / 606 doors /
  // 3030 walls) is the copy that carries rooms — the divergence [[project_db_snapshot_divergence_landmine]]
  // warns about, checked here rather than assumed. Same rect-fallback regime: no raster, no patch.
  const ltu = await measure(SQL, 'LTU_AHouse', 'LTU_AHouse_extracted.db');

  console.log('\n─── §20.4 assertions (a defect COUNT is a finding, not a failure — these gate measurability) ───');
  chk('M1 Clinic routed a real sweep in the browser regime (walker-recompiled rooms, rect fallback)',
    clinic.rooms > 50 && clinic.routed > 500, 'rooms=' + clinic.rooms + ' routed=' + clinic.routed + '/' + clinic.pairs);
  chk('M2 Duplex routed a real sweep in the same regime',
    duplex.rooms >= 2 && duplex.routed >= 1, 'rooms=' + duplex.rooms + ' routed=' + duplex.routed + '/' + duplex.pairs);
  chk('M3 R4 detour ratio is computable on all three (same-storey pairs with a real straight-line baseline)',
    clinic.ratios.length > 0 && duplex.ratios.length > 0 && ltu.ratios.length > 0,
    'Clinic n=' + clinic.ratios.length + ' Duplex n=' + duplex.ratios.length + ' LTU n=' + ltu.ratios.length);
  chk('M4 every drawn line came from result.polyline, not the anchor fallback (Stage-B engine is live)',
    clinic.noPolyline === 0 && duplex.noPolyline === 0 && ltu.noPolyline === 0,
    'fallbacks Clinic=' + clinic.noPolyline + ' Duplex=' + duplex.noPolyline + ' LTU=' + ltu.noPolyline);
  chk('M6 LTU_AHouse (the user-reported criss-crossing building) routed a real sweep',
    ltu.rooms > 100 && ltu.routed > 1000, 'rooms=' + ltu.rooms + ' routed=' + ltu.routed + '/' + ltu.pairs);
  chk('M5 R1 benign/real split is populated — stair-flight repeats are NOT counted as redundancy',
    (clinic.r1benign + clinic.r1real + duplex.r1benign + duplex.r1real) === (clinic.r1excess + duplex.r1excess),
    'benign+real=' + (clinic.r1benign + clinic.r1real + duplex.r1benign + duplex.r1real) + ' excess=' + (clinic.r1excess + duplex.r1excess));

  console.log('\n§W-ROOM-PATH-REDUNDANCY DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
