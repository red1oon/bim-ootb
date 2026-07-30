#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — probe for W-ROOM-PATH-REDUNDANCY (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §20)
 * SCOPE: verify the CHECKER before trusting what it reports about the code under test
 * ([[feedback_verify_checker_before_code_under_test]]). Dumps ONE route end to end — anchors with
 * kind/storey/position, every drawn polyline vertex, per-segment length and turn angle — so each
 * §REDUN_R* number can be recomputed by hand from the same data.
 * RUN: node probe_redundancy_route.js <dbFile> <fromNameSubstr> <toNameSubstr>
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RG = require('./common/room_graph.js');
const RoomWalker = require('./viewer/lib/room_walker.js');
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');

const [dbFile, fromS, toS] = process.argv.slice(2);

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, dbFile))));
  const realLog = console.log; console.log = () => {};
  RoomWalker.walk(db, { write: true });
  const g = RG.buildGraph((sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return []; } }, { log: () => {} });
  console.log = realLog;

  const rooms = g.nodes.filter(n => n.kind === 'room');
  const a = rooms.find(r => String(r.name || '').indexOf(fromS) >= 0);
  const b = rooms.find(r => String(r.name || '').indexOf(toS) >= 0);
  if (!a || !b) { console.log('room not found: ' + (a ? '' : fromS) + ' ' + (b ? '' : toS)); process.exit(1); }
  console.log('§PROBE from="' + a.name + '" (' + a.cx.toFixed(2) + ',' + a.cy.toFixed(2) + ') storey=' + a.storey +
    '  to="' + b.name + '" (' + b.cx.toFixed(2) + ',' + b.cy.toFixed(2) + ') storey=' + b.storey +
    '  straight=' + Math.hypot(b.cx - a.cx, b.cy - a.cy).toFixed(2) + 'm');

  const res = RG.shortestPath(g, a.guid, b.guid);
  if (!res) { console.log('§PROBE UNREACHABLE'); process.exit(0); }
  console.log('§PROBE_LOGICAL distance=' + res.distance.toFixed(2) + 'm anchors=' + res.path.length + ' doors=' + res.doors.length);
  res.path.forEach((gu, i) => {
    const n = g.nodesByGuid[gu];
    console.log('   A' + i + ' kind=' + n.kind + ' storey=' + n.storey + ' (' + n.cx.toFixed(2) + ',' + n.cy.toFixed(2) + ') ' + (n.name || gu));
  });
  const poly = res.polyline || [];
  let L = 0;
  console.log('§PROBE_DRAWN vertices=' + poly.length);
  for (let i = 0; i < poly.length; i++) {
    let seg = '', turn = '';
    if (i > 0) { const d = Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y); L += d; seg = ' seg=' + d.toFixed(2) + 'm'; }
    if (i > 0 && i + 1 < poly.length) {
      const ax = poly[i].x - poly[i - 1].x, ay = poly[i].y - poly[i - 1].y;
      const bx = poly[i + 1].x - poly[i].x, by = poly[i + 1].y - poly[i].y;
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la > 1e-6 && lb > 1e-6) {
        const deg = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) * 180 / Math.PI;
        turn = ' turn=' + deg.toFixed(0) + '°' + (deg > 150 ? '  <<< REVERSAL' : '');
      }
    }
    console.log('   P' + i + ' (' + poly[i].x.toFixed(2) + ',' + poly[i].y.toFixed(2) + ',' + (poly[i].z || 0).toFixed(2) + ')' + seg + turn);
  }
  console.log('§PROBE_TOTAL drawn=' + L.toFixed(2) + 'm straight=' + Math.hypot(b.cx - a.cx, b.cy - a.cy).toFixed(2) +
    'm ratio=' + (L / Math.hypot(b.cx - a.cx, b.cy - a.cy)).toFixed(2) + ' logicalDistance=' + res.distance.toFixed(2) + 'm');
  db.close();
})();
