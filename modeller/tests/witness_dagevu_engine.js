#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DAGEVU-ENGINE: §DAGEVU value witness (PURE NODE, REAL SampleHouse substrate).
 * Implementing prompts/SPEC_DAGEVU_ENGINE.md §5. Read the log after every run — exit code alone is not evidence.
 *
 * Issue under test: grid-stretching a wall used to ALWAYS ride its hosted opening proportionally (a door at 1/3 of
 * a wall stays at 1/3 — "distortion" of the opening's real position). The engine makes ANCHOR (opening keeps its
 * world position, the wall's free end absorbs the delta) the default, RIDE an explicit opt-in, and refuses honestly
 * when the dictated end is NOT free. Every number below is measured off the production fold's real AABBs and the
 * recovered rel_fills_host rows — the same substrate witness_stretch_ride.js proves.
 *
 *   D1 CONTRACT         — base propagate throws; subclasses instanceof RelationEdge; #edges == resolvable real rows
 *   D2 RIDE-WRAP        — mode ride ≡ SdgCascade.stretchRide output (riders exact, same strip) — a wrap, not a fork
 *   D3 ANCHOR-GROW      — default: host SCALE grow ⇒ filling delta 0, own cmd stripped, held, no refusal, label w→f·w
 *   D4 ANCHOR-TRANSLATE — host TRANSLATE d ⇒ anchored filling still rides by EXACTLY d (anchor = length change only)
 *   D5 ANCHOR-REFUSE    — shrink crossing the filling ⇒ null + refusal{fids,axis}, commands untouched, and the gate's
 *                         own door-crush fires on the same before/after boxes (preview oracle == commit oracle)
 *   D6 MULTI            — the real 2-filling host: each filling refused iff the gate's rule says so, independently
 *   D7 TOGGLE           — default anchor; toggle→ride→anchor; reset restores anchor
 *   D8 ABUTS-WRAP       — real wall + constructed flush neighbour (A8 precedent): proposal == gate proposedDelta;
 *                         the commands list is NOT changed by it (report-only)
 *   D9 ROSETTA          — anchor: stretch then exact inverse ⇒ host extent restored ≤1e-9, filling delta 0 both ways
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = global.window || {};
global.fetch = undefined;
global.location = { href: 'http://localhost/' };
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;

var ROOT = path.join(__dirname, '..');
var ArcEditable = require(path.join(ROOT, 'arc_editable.js'));
var SdgCascade = require(path.join(ROOT, 'sdg_cascade.js'));
var SdgGate = require(path.join(ROOT, 'sdg_gate.js'));
var CrossEdges = require(path.join(ROOT, 'cross_edges.js'));
var D = require(path.join(ROOT, 'dagevu_engine.js'));
require(path.join(ROOT, 'kernel_ops.js'));
require(path.join(ROOT, 'bonsai_library.js'));
var KernelOps = global.window.KernelOps, Library = global.window.Bonsai.library;
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var DBPATH = path.join(ROOT, 'SampleHouse_extracted.db');

var pass = 0, fail = 0;
function chk(n, c, e) { if (c) { pass++; console.log('  ✅ ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  ❌ ' + n + (e ? '  ' + e : '')); } }
function bboxOf(positions) {
  var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (var i = 0; i < positions.length; i += 3) for (var k = 0; k < 3; k++) { if (positions[i + k] < mn[k]) mn[k] = positions[i + k]; if (positions[i + k] > mx[k]) mx[k] = positions[i + k]; }
  return [mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]];
}
function centreOf(b) { return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]; }
function withinXY(box, pt, tol) { return pt[0] >= box[0] - tol && pt[0] <= box[1] + tol && pt[1] >= box[2] - tol && pt[1] <= box[3] + tol; }
function fits(inner, outer, k) { return inner[2 * k] >= outer[2 * k] - 0.05 && inner[2 * k + 1] <= outer[2 * k + 1] + 0.05; }
function j(x) { return JSON.stringify(x); }

initSqlJs({ wasmBinary: wasmBinary }).then(async function (SQL) {
  console.log('═══ W-DAGEVU-ENGINE — anchor-default relationship edges (node, REAL SampleHouse) ═══');
  var bdb = new SQL.Database(fs.readFileSync(DBPATH));
  var oplog = new SQL.Database();
  var seed = await ArcEditable.seedArc(bdb, {
    commitGroup: function (ops, gid) { return KernelOps.commitGroup(oplog, ops, { gid: gid, baseTs: 1700000000000 }); },
    building: 'SampleHouse'
  });
  var fbg = seed.bridge.fidByGuid, gbf = seed.bridge.guidByFid;
  var opByFid = {}; seed.ops.forEach(function (o) { opByFid[fbg[o.outputGuid]] = o; });
  var X = CrossEdges.deriveAll(bdb), fills = X.fills;
  var boxByFid = {};
  Object.keys(opByFid).forEach(function (fid) { boxByFid[fid] = bboxOf(Library.foldInsert({ id: +fid, op_type: 'GEOM_INSERT', parameters: opByFid[fid].params }, null).positions); });
  var edgeRow = fills.find(function (e) {
    var hf = fbg[e.host_guid], rf = fbg[e.filling_guid];
    return hf != null && rf != null && boxByFid[hf] && boxByFid[rf] && withinXY(boxByFid[hf], centreOf(boxByFid[rf]), 0.05);
  });
  var hostFid = fbg[edgeRow.host_guid], doorFid = fbg[edgeRow.filling_guid];
  var hb = boxByFid[hostFid], fb = boxByFid[doorFid];
  var ext3 = [hb[1] - hb[0], hb[3] - hb[2]], K = ext3[0] >= ext3[1] ? 0 : 1, ax = 'xy'[K];   // the wall's long (run) axis
  var ext = hb[2 * K + 1] - hb[2 * K];
  var resolvable = fills.filter(function (e) { return fbg[e.host_guid] != null && fbg[e.filling_guid] != null; }).length;
  chk('D0 substrate: seeded bridge + real fills + hosted pair on the wall\'s run axis', seed.committed > 0 && fills.length > 0 && fits(fb, hb, K),
    'host=' + hostFid + ' door=' + doorFid + ' axis=' + ax + ' ext=' + ext.toFixed(3) + ' resolvable=' + resolvable + '/' + fills.length);

  function mk(opts) { return new D.DagevuEngine(Object.assign({ guidByFid: gbf, fidByGuid: fbg, fills: fills, abuts: [], cascade: SdgCascade, gate: SdgGate }, opts || {})); }

  // D1 CONTRACT
  var threw = false; try { new D.RelationEdge('x', 1, 2).propagate(); } catch (e) { threw = /abstract/.test(e.message); }
  var eng = mk();
  var hostFillCount = eng.edges.filter(function (e) { return e instanceof D.HostFillEdge; }).length;
  var badRow = mk({ fills: fills.concat([{ host_guid: 'NOT-A-GUID', filling_guid: edgeRow.filling_guid, provenance: 'ifc:recovered' }]) });
  chk('D1 CONTRACT: abstract propagate throws; HostFillEdge/AbutsEdge instanceof RelationEdge; #edges == resolvable real rows; unresolvable row ⇒ no edge',
    threw && eng.edges[0] instanceof D.RelationEdge && new D.AbutsEdge({ a: 1, b: 2, gate: SdgGate }) instanceof D.RelationEdge &&
    hostFillCount === resolvable && badRow.edges.length === eng.edges.length,
    'edges=' + hostFillCount + ' resolvable=' + resolvable);

  // D2 RIDE-WRAP — opt every filling of this host into ride, compare with stretchRide over the same rows
  var f = 1.4;
  var scaleCmd = { featureId: hostFid, action: 'SCALE', axis: ax, newScale: f, translateDelta: 0, edge: 'far' };
  var engineDoorCmd = { featureId: doorFid, action: 'SCALE', axis: ax, newScale: 1.2, translateDelta: 0, edge: 'far' };
  var hostRows = fills.filter(function (e) { return e.host_guid === edgeRow.host_guid && fbg[e.filling_guid] != null; });
  var rideEng = mk({ rideFids: hostRows.map(function (e) { return fbg[e.filling_guid]; }) });
  var r2 = rideEng.propagateCommands([scaleCmd, engineDoorCmd], boxByFid);
  var ref2 = SdgCascade.stretchRide([scaleCmd, engineDoorCmd], gbf, fbg, hostRows, boxByFid);
  var sameRiders = r2.riders.length === ref2.riders.length && ref2.riders.every(function (rr) { var m = r2.riders.find(function (q) { return q.featureId === rr.featureId; }); return m && m.dx === rr.dx && m.dy === rr.dy && m.dz === rr.dz; });
  var sameCmds = j(r2.commands) === j(ref2.commands);
  chk('D2 RIDE-WRAP: mode ride ≡ stretchRide (riders exact to the bit, identical strip)', sameRiders && sameCmds && r2.refusals.length === 0,
    'riders=' + j(r2.riders.map(function (r) { return [r.featureId, +r.dx.toFixed(4), +r.dy.toFixed(4)]; })));

  // D3 ANCHOR-GROW (default)
  var r3 = eng.propagateCommands([scaleCmd, engineDoorCmd], boxByFid);
  var doorRides3 = r3.riders.some(function (r) { return r.featureId === doorFid; });
  var stripped3 = !r3.commands.some(function (c) { return c.featureId === doorFid; }) && r3.commands.some(function (c) { return c.featureId === hostFid; });
  var wantLbl = ext.toFixed(2) + '→' + (f * ext).toFixed(2) + 'm';
  chk('D3 ANCHOR-GROW: default holds the filling (delta 0, own cmd stripped, host cmd kept, no refusal); label carries measured w→f·w',
    !doorRides3 && r3.held.indexOf(doorFid) >= 0 && stripped3 && r3.refusals.length === 0 && r3.dimLabel.indexOf(wantLbl) >= 0,
    'held=' + j(r3.held) + ' label="' + r3.dimLabel + '"');

  // D4 ANCHOR-TRANSLATE
  var dT = 1.25;
  var r4 = eng.propagateCommands([{ featureId: hostFid, action: 'TRANSLATE', axis: ax, delta: dT }], boxByFid);
  var rid4 = r4.riders.find(function (r) { return r.featureId === doorFid; });
  chk('D4 ANCHOR-TRANSLATE: a translated host still carries its anchored filling by EXACTLY d (anchor = length change only)',
    rid4 && (ax === 'x' ? rid4.dx === dT && rid4.dy === 0 : rid4.dy === dT && rid4.dx === 0) && rid4.dz === 0 && r4.held.length === 0,
    'rider=' + j(rid4));

  // D5 ANCHOR-REFUSE — shrink from the max end until the host's max crosses INTO the door's span
  var fShrink = ((fb[2 * K] - hb[2 * K]) / ext) * 0.5;               // host' max lands halfway between host min and the door's min
  var shrinkCmd = { featureId: hostFid, action: 'SCALE', axis: ax, newScale: fShrink, translateDelta: 0, edge: 'far' };
  var r5 = eng.propagateCommands([shrinkCmd], boxByFid);
  var ref5 = r5.refusals.find(function (r) { return r.fillingFid === doorFid && r.hostFid === hostFid; });
  var edge5 = eng.byFilling[doorFid][0];
  var direct5 = edge5.propagate([shrinkCmd], { boxByFid: boxByFid, guidByFid: gbf, fidByGuid: fbg });
  var after5 = {}; after5[hostFid] = D.RelationEdge.foldBox(hb, [shrinkCmd]); after5[doorFid] = fb;
  var before5 = {}; before5[hostFid] = hb; before5[doorFid] = fb;
  var hostOf5 = {}; hostOf5[doorFid] = hostFid;
  var gate5 = SdgGate.evaluate(before5, after5, [hostFid], { related: function () { return true; }, hostOf: hostOf5, abuts: [] }, {});
  var crush5 = gate5.red.find(function (x) { return x.kind === 'door-crush' && x.a === doorFid && x.b === hostFid; });
  chk('D5 ANCHOR-REFUSE: shrink crossing the held filling ⇒ propagate null + refusal{host,filling,axis}; commands untouched; the gate\'s door-crush agrees on the same boxes',
    direct5 === null && ref5 && ref5.axis === ax && ref5.kind === 'anchor-no-free-end' && j(r5.commands) === j([shrinkCmd]) && r5.riders.length === 0 && !!crush5 && crush5.axis === ax,
    'f=' + fShrink.toFixed(3) + ' refusal=' + j(ref5) + ' gate=' + j(crush5));

  // D6 MULTI — the real host with the most rows: each filling refused iff the gate's rule says so
  var byHostGuid = {}; hostRows.length; fills.forEach(function (e) { if (fbg[e.host_guid] != null && fbg[e.filling_guid] != null) (byHostGuid[e.host_guid] = byHostGuid[e.host_guid] || []).push(fbg[e.filling_guid]); });
  var multiGuid = Object.keys(byHostGuid).sort(function (a, b) { return byHostGuid[b].length - byHostGuid[a].length; })[0];
  var mHost = fbg[multiGuid], mFills = byHostGuid[multiGuid], mb = boxByFid[mHost];
  var mK = (mb[1] - mb[0]) >= (mb[3] - mb[2]) ? 0 : 1, mAx = 'xy'[mK], mExt = mb[2 * mK + 1] - mb[2 * mK];
  var mHostAfter = D.RelationEdge.foldBox(mb, [{ action: 'SCALE', axis: mAx, newScale: 0.55, translateDelta: 0 }]);
  var r6 = eng.propagateCommands([{ featureId: mHost, action: 'SCALE', axis: mAx, newScale: 0.55, translateDelta: 0, edge: 'far' }], boxByFid);
  var agree6 = mFills.every(function (fid) {
    var b = boxByFid[fid]; if (!b) return true;
    var expectRefuse = fits(b, mb, mK) && !fits(b, mHostAfter, mK);
    var refused = r6.refusals.some(function (r) { return r.fillingFid === fid; });
    var held = r6.held.indexOf(fid) >= 0;
    return expectRefuse ? (refused && !held) : (!refused && held);
  });
  chk('D6 MULTI: ' + mFills.length + ' real fillings on host #' + mHost + ' — each independently refused iff the gate\'s fit rule says so (delta-honest on a never-fit filling)',
    mFills.length >= 2 && agree6, 'refused=' + j(r6.refusals.map(function (r) { return r.fillingFid; })) + ' held=' + j(r6.held));

  // D7 TOGGLE
  var e7 = mk();
  var m0 = e7.modeOf(doorFid), m1 = e7.toggleMode(doorFid), m2 = e7.toggleMode(doorFid); e7.setMode(doorFid, 'ride'); e7.reset();
  chk('D7 TOGGLE: default anchor; toggle→ride→anchor; reset restores anchor; non-filling has no mode',
    m0 === 'anchor' && m1 === 'ride' && m2 === 'anchor' && e7.modeOf(doorFid) === 'anchor' && e7.modeOf(hostFid) === null && e7.isFilling(doorFid) && !e7.isFilling(hostFid));

  // D8 ABUTS-WRAP — real wall + constructed flush neighbour on its thinnest (face-normal) axis (witness_sdg_gate A8)
  var ext8 = [hb[1] - hb[0], hb[3] - hb[2], hb[5] - hb[4]], k8 = ext8.indexOf(Math.min.apply(null, ext8));
  var nb = hb.slice(); nb[2 * k8] = hb[2 * k8 + 1]; nb[2 * k8 + 1] = hb[2 * k8 + 1] + 0.1;
  var NB = 9002, gbf8 = Object.assign({}, gbf), fbg8 = Object.assign({}, fbg); gbf8[NB] = 'g-nb'; fbg8['g-nb'] = NB;
  var box8 = Object.assign({}, boxByFid); box8[NB] = nb;
  var e8 = mk({ guidByFid: gbf8, fidByGuid: fbg8, abuts: [{ a: edgeRow.host_guid, b: 'g-nb' }] });
  var mv8 = { featureId: hostFid, action: 'TRANSLATE', axis: 'xyz'[k8], delta: ext8[k8] + 0.5 };
  var r8 = e8.propagateCommands([mv8], box8);
  var b8 = {}; b8[hostFid] = hb; b8[NB] = nb; var a8 = {}; a8[hostFid] = D.RelationEdge.foldBox(hb, [mv8]); a8[NB] = nb;
  var g8 = SdgGate.evaluate(b8, a8, [hostFid], { related: function () { return false; }, hostOf: {}, abuts: [{ a: hostFid, b: NB }] }, {}).orange.find(function (o) { return o.kind === 'abuts-realign'; });
  var p8 = r8.proposals[0];
  chk('D8 ABUTS-WRAP: AbutsEdge proposal == the gate\'s own abuts-realign proposedDelta (neighbour, gap, axis); commands untouched (report-only)',
    e8.edges.some(function (e) { return e instanceof D.AbutsEdge; }) && p8 && g8 && p8.featureId === g8.a && p8.proposed === true &&
    p8.dx === g8.proposedDelta[0] && p8.dy === g8.proposedDelta[1] && p8.dz === g8.proposedDelta[2] && j(r8.commands) === j([mv8]),
    'proposal=' + j(p8) + ' gate=' + j(g8 && g8.proposedDelta));

  // D9 ROSETTA — anchor: SCALE f then SCALE 1/f about the (unchanged) min ⇒ extent restored; filling delta 0 both ways
  var box9 = Object.assign({}, boxByFid); box9[hostFid] = D.RelationEdge.foldBox(hb, [scaleCmd]);
  var r9 = eng.propagateCommands([{ featureId: hostFid, action: 'SCALE', axis: ax, newScale: 1 / f, translateDelta: 0, edge: 'far' }], box9);
  var back9 = D.RelationEdge.foldBox(box9[hostFid], [{ action: 'SCALE', axis: ax, newScale: 1 / f, translateDelta: 0 }]);
  var extErr = Math.abs((back9[2 * K + 1] - back9[2 * K]) - ext), minErr = Math.abs(back9[2 * K] - hb[2 * K]);
  chk('D9 ROSETTA: stretch then exact inverse ⇒ host extent + min restored ≤1e-9; the held filling never moved (0 both ways)',
    extErr <= 1e-9 && minErr <= 1e-9 && r3.held.indexOf(doorFid) >= 0 && r9.held.indexOf(doorFid) >= 0 && !r9.riders.some(function (r) { return r.featureId === doorFid; }),
    'extErr=' + extErr.toExponential(2) + ' minErr=' + minErr.toExponential(2));

  console.log('W-DAGEVU-ENGINE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
