#!/usr/bin/env node
/**
 * W-BILLBOARD-NAME-ELEMENT — prompts/PHOTOREAL_STILL_RENDER.md §BILLBOARD_NAME_ELEMENT §7.
 *
 * ISSUE THIS TEST EXPOSES (both halves named by the user, verbatim):
 *   1. the building name plate had NO DB row, so it could not be quantified, costed or scheduled;
 *   2. "it shall appear last, not like now it came on" — the lettering was built unconditionally
 *      and therefore rendered from frame 0 of a Time Machine buildup.
 * A gate that only checked the plate is visible at the END would PASS on the broken build too, so
 * V2 below asserts the opposite end of the scrub: invisible at project start.
 *
 * NOT A REIMPLEMENTATION. The two behaviours under test are executed from the SHIPPED SOURCE TEXT,
 * extracted from viewer/time_machine.js and viewer/effects.js by exact-substring match and run via
 * new Function(). If either source changes shape, extraction FAILS LOUDLY rather than silently
 * grading a stale copy of the logic.
 *
 * Run:  node tests/witness_billboard_nameplate.js 2>&1 | tee /tmp/W_NAMEPLATE.log
 *       (then READ THE LOG — exit code is not evidence.)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BIM = '/home/red1/Downloads/OPEN SOURCE BIM';
const DB_HI = path.join(BIM, 'Terminal_Hi.db');
const DB_4D = path.join(BIM, 'TerminalHi4D.db');
const CFG = path.join(BIM, 'Terminal.config.json');
const MIG = '/home/red1/bim-compiler/migration/billboards';
const GUID = 'BB0BIMOOTBNAME000001A';
const HASH = 'bimootb_np_1p2x4_v1';
const PANEL = 'BB0BIMOOTBSIGN000001A';

let pass = 0, fail = 0;
function gate(id, claim, ok, detail) {
  (ok ? pass++ : fail++);
  console.log((ok ? '✅' : '❌') + ' ' + id + ' — ' + claim + '\n     ' + detail);
}
function q(db, sql) {
  return execFileSync('sqlite3', ['-noheader', db, sql], { encoding: 'utf8' }).trim();
}
function qrows(db, sql) {
  const out = q(db, sql);
  return out ? out.split('\n').map(l => l.split('|')) : [];
}

console.log('§NAMEPLATE_WITNESS start db_hi=' + DB_HI + ' db_4d=' + DB_4D);

// ───────────────────────────────────────────────────────────── G1: geometry topology reused ──
const vHexNew = q(DB_4D, `SELECT hex(vertices) FROM component_geometries WHERE geometry_hash='${HASH}'`).toLowerCase();
const fHexNew = q(DB_4D, `SELECT hex(faces)    FROM component_geometries WHERE geometry_hash='${HASH}'`).toLowerCase();
const vHexOld = q(DB_4D, `SELECT hex(vertices) FROM component_geometries WHERE geometry_hash='bimootb_bb_8x4_v1'`).toLowerCase();
const fHexOld = q(DB_4D, `SELECT hex(faces)    FROM component_geometries WHERE geometry_hash='bimootb_bb_8x4_v1'`).toLowerCase();

function decode(vHex, fHex) {
  const vb = Buffer.from(vHex, 'hex'), fb = Buffer.from(fHex, 'hex');
  return {
    V: new Float32Array(vb.buffer, vb.byteOffset, vb.length / 4),
    F: new Uint32Array(fb.buffer, fb.byteOffset, fb.length / 4)
  };
}
const gNew = decode(vHexNew, fHexNew), gOld = decode(vHexOld, fHexOld);
function extent(V) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < V.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], V[i + a]); mx[a] = Math.max(mx[a], V[i + a]); }
  return mx.map((v, a) => v - mn[a]);
}
// sign pattern equality: normalise each blob by its own half-extents, compare the ±1 patterns
function signs(V, half) {
  const s = [], bad = [];
  for (let i = 0; i < V.length; i += 3) {
    const t = [];
    for (let a = 0; a < 3; a++) {
      const n = V[i + a] / half[a];
      if (Math.abs(Math.abs(n) - 1) > 1e-6) bad.push('v' + (i / 3) + '.axis' + a + '=' + n);
      t.push(Math.sign(n));
    }
    s.push(t.join(','));
  }
  return { s, bad };
}
const sOld = signs(gOld.V, [0.2, 4.0, 2.0]);
const sNew = signs(gNew.V, [0.05, 0.6, 2.0]);
const patternSame = sOld.s.join('|') === sNew.s.join('|');
gate('G1', 'the blob is the shipped panel topology rescaled, not a hand-derived box',
  gNew.V.length === 72 && gNew.F.length === 36 && fHexNew === fHexOld && patternSame &&
  sOld.bad.length === 0 && sNew.bad.length === 0,
  'verts=' + (gNew.V.length / 3) + ' tris=' + (gNew.F.length / 3) +
  ' indexBlobByteIdentical=' + (fHexNew === fHexOld) +
  ' signPatternIdentical=' + patternSame +
  ' nonUnitNormalized=' + (sOld.bad.length + sNew.bad.length) + ' (0 = a true ±1 box on both)');

// ─────────────────────────────────────────────── G2: stored bbox == decoded geometry extent ──
const [tr] = qrows(DB_4D, `SELECT printf('%.17g',center_x),center_y,center_z,rotation_x,rotation_y,rotation_z,bbox_x,bbox_y,bbox_z FROM element_transforms WHERE guid='${GUID}'`);
const cx = parseFloat(tr[0]), cy = parseFloat(tr[1]), cz = parseFloat(tr[2]);
const bx = parseFloat(tr[6]), by = parseFloat(tr[7]), bz = parseFloat(tr[8]);
const ext = extent(gNew.V);
const TOL = 1e-5;   // float32 stores 0.6 as 0.60000002384 → exact equality would be the WRONG gate
const dExt = [Math.abs(ext[0] - bx), Math.abs(ext[1] - by), Math.abs(ext[2] - bz)];
gate('G2', 'stored bbox equals the decoded geometry extent (point-to-curve tolerance, not eyeballed)',
  dExt.every(d => d < TOL),
  'decoded=' + ext.map(v => v.toFixed(9)).join(',') + '  stored=' + [bx, by, bz].join(',') +
  '  |delta|=' + dExt.map(d => d.toExponential(3)).join(',') + '  tol=' + TOL);

// ──────────────────────────────────────────── G3: no penetration, no collision (real rows) ──
const [w] = qrows(DB_4D, `SELECT printf('%.17g',center_x),printf('%.17g',bbox_x),printf('%.17g',center_y),printf('%.17g',bbox_y) FROM element_transforms WHERE guid='317rFPKoL6eO76U6ttKqzG'`);
const wallOuter = parseFloat(w[0]) + parseFloat(w[1]) / 2;
const wallYmax = parseFloat(w[2]) + parseFloat(w[3]) / 2;
const plate = { x: [cx - bx / 2, cx + bx / 2], y: [cy - by / 2, cy + by / 2], z: [cz - bz / 2, cz + bz / 2] };
const standoff = plate.x[0] - wallOuter;
const clearWallEdge = wallYmax - plate.y[1];
const neighbours = qrows(DB_4D, `SELECT guid,center_x,center_y,center_z,bbox_x,bbox_y,bbox_z FROM element_transforms WHERE guid LIKE 'BB0BIMOOTB%' AND guid<>'${GUID}'`);
const hits = [];
const overlaps = [];
for (const n of neighbours) {
  const [g, ncx, ncy, ncz, nbx, nby, nbz] = [n[0], +n[1], +n[2], +n[3], +n[4], +n[5], +n[6]];
  const o = {
    X: Math.min(plate.x[1], ncx + nbx / 2) - Math.max(plate.x[0], ncx - nbx / 2),
    Y: Math.min(plate.y[1], ncy + nby / 2) - Math.max(plate.y[0], ncy - nby / 2),
    Z: Math.min(plate.z[1], ncz + nbz / 2) - Math.max(plate.z[0], ncz - nbz / 2)
  };
  const collide = o.X > 0 && o.Y > 0 && o.Z > 0;
  if (collide) hits.push(g);
  overlaps.push(g + '[X=' + o.X.toFixed(4) + ' Y=' + o.Y.toFixed(4) + ' Z=' + o.Z.toFixed(4) + ' collide=' + collide + ']');
}
const panelYmax = +q(DB_4D, `SELECT center_y + bbox_y/2.0 FROM element_transforms WHERE guid='${PANEL}'`);
gate('G3', 'the plate penetrates neither its host wall nor any neighbouring injected element',
  standoff > 0 && clearWallEdge > 0 && hits.length === 0,
  'standoff_from_wall_outer_face=' + standoff.toFixed(9) + 'm (>0)  clear_to_wall_right_edge=' +
  clearWallEdge.toFixed(6) + 'm (>0)  gap_to_panel_right_edge=' + (plate.y[0] - panelYmax).toFixed(6) +
  'm  collisions=' + hits.length + '\n     ' + overlaps.join('\n     '));

// ─────────────────────────────────────────────────── S1: bound to the LAST leaf task ──
const boundTask = q(DB_4D, `SELECT task_id FROM task_elements WHERE guid='${GUID}'`);
const lastLeaf = qrows(DB_4D, `SELECT task_id,schedule_start,schedule_finish FROM tasks WHERE (is_summary IS NULL OR is_summary=0) AND schedule_finish IS NOT NULL ORDER BY schedule_finish DESC, task_id LIMIT 1`)[0];
gate('S1', 'it is bound to the leaf task with the max schedule_finish — the literal "last" phase',
  boundTask === 'TASK_Finishes' && lastLeaf[0] === 'TASK_Finishes',
  'task_elements says "' + boundTask + '"; max(schedule_finish) leaf is "' + lastLeaf[0] +
  '" ' + lastLeaf[1] + '..' + lastLeaf[2] + ' of ' +
  q(DB_4D, 'SELECT count(*) FROM tasks WHERE (is_summary IS NULL OR is_summary=0)') + ' leaves');

// ───────────────────────────────── S2: it is the last-STARTING op of that phase, end == phase end ──
const myOp = qrows(DB_4D, `SELECT timestamp, json_extract(parameters,'$._end_ts'), json_extract(parameters,'$._task'), json_extract(parameters,'$.phase'), json_extract(parameters,'$._captured') FROM kernel_ops WHERE op_type='ELEMENT_PLACE' AND output_guid='${GUID}'`)[0];
const myStart = +myOp[0], myEnd = +myOp[1];
const otherMaxStart = +q(DB_4D, `SELECT max(timestamp) FROM kernel_ops WHERE op_type='ELEMENT_PLACE' AND json_extract(parameters,'$._task')='TASK_Finishes' AND output_guid<>'${GUID}'`);
const phaseEndMs = Date.parse(lastLeaf[2]);
gate('S2', 'its ELEMENT_PLACE op starts after every other op in the phase and ends at the phase finish',
  myStart > otherMaxStart && myEnd === phaseEndMs && myOp[2] === 'TASK_Finishes' && myOp[4] === '1',
  'start_ts=' + myStart + ' (' + new Date(myStart).toISOString() + ') vs next-latest ' + otherMaxStart +
  ' → +' + (myStart - otherMaxStart) + 'ms;  end_ts=' + myEnd + ' == schedule_finish(' + lastLeaf[2] + ')=' +
  phaseEndMs + ';  _task=' + myOp[2] + ' phase=' + myOp[3] + ' _captured=' + myOp[4]);

// ═══════════════ V1/V2: the overlay's visibility EQUALS the real element's, over a real scrub ═══
// Both pieces of logic are lifted from the SHIPPED SOURCE, not rewritten here.
const tmSrc = fs.readFileSync(path.join(ROOT, 'viewer/time_machine.js'), 'utf8');
const fxSrc = fs.readFileSync(path.join(ROOT, 'viewer/effects.js'), 'utf8');

// (a) renderAtTime's op→state loop, verbatim.
const LOOP_HEAD = '    for (var i = 0; i < _ops.length; i++) {\n      var op = _ops[i];\n      if (op.start_ts > cursorMs) break;';
const li = tmSrc.indexOf(LOOP_HEAD);
if (li < 0) { console.log('❌ EXTRACT — renderAtTime op loop not found in viewer/time_machine.js (source changed shape)'); process.exit(1); }
let depth = 0, end = -1;
for (let i = li; i < tmSrc.length; i++) {
  if (tmSrc[i] === '{') depth++;
  else if (tmSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const LOOP_SRC = tmSrc.slice(li, end);

// (b) the §TM_OVERLAY_SYNC predicate handed to the overlay, verbatim.
const PRED = 'return !!placed[g] || !!frontier[g] || recent[g] !== undefined;';
if (tmSrc.indexOf(PRED) < 0) { console.log('❌ EXTRACT — §TM_OVERLAY_SYNC predicate not found in viewer/time_machine.js'); process.exit(1); }

// (c) effects.js's registered setter, verbatim.
const FX_HEAD = '    window.__tmOverlaySync = function(isVisible) {';
const fi = fxSrc.indexOf(FX_HEAD);
if (fi < 0) { console.log('❌ EXTRACT — window.__tmOverlaySync assignment not found in viewer/effects.js'); process.exit(1); }
depth = 0; end = -1;
for (let i = fxSrc.indexOf('{', fi + FX_HEAD.length - 1); i < fxSrc.length; i++) {
  if (fxSrc[i] === '{') depth++;
  else if (fxSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const FX_SRC = FX_HEAD.slice(FX_HEAD.indexOf('window')) + fxSrc.slice(fxSrc.indexOf('{', fi + FX_HEAD.length - 1) + 1, end) + ';';
console.log('§NAMEPLATE_WITNESS extracted shipped source: tmLoop=' + LOOP_SRC.length + 'B fxSetter=' + FX_SRC.length + 'B');

// Real ops for the whole Finishes phase + phase boundaries; the plate's op is the one under test.
// (Loading all 48,434 through sqlite3 CLI is slow and unnecessary — renderAtTime's `break` means
// only ops with start_ts <= cursor matter, and the predicate is per-guid.)
const opRows = qrows(DB_4D, `SELECT timestamp, json_extract(parameters,'$._end_ts'), output_guid FROM kernel_ops WHERE op_type='ELEMENT_PLACE' AND output_guid IN ('${GUID}','${PANEL}') ORDER BY timestamp`);
const _ops = opRows.map(r => ({ start_ts: +r[0], end_ts: +r[1], output_guid: r[2], input_guids: [r[2]], parameters: {} }));

function tickMs() { return 3200000; }   // DAY mode, time_machine.js — only feeds `recent` linger

function tmState(cursorMs) {
  const placed = {}, frontier = {}, recent = {}, arrival = {};
  const lingerMs = tickMs() * 3;
  const _isMobileTM = false; const window_ = {};
  // execute the SHIPPED loop
  const run = new Function('_ops', 'cursorMs', 'placed', 'frontier', 'recent', 'arrival', 'lingerMs', 'window', '_sfxPhases',
    LOOP_SRC + '\n return null;');
  run(_ops, cursorMs, placed, frontier, recent, arrival, lingerMs, window_, null);
  return { placed, frontier, recent };
}
// the SHIPPED predicate, applied to the SHIPPED state
const predFn = new Function('placed', 'frontier', 'recent', 'return function(g){ ' + PRED + ' };');

// the SHIPPED overlay setter, with its closure vars supplied
function makeOverlay(guid) {
  const mesh = { visible: true };
  const logs = [];
  const mk = new Function('MESH', 'GUID', 'LOGS', `
    var _billboardNameMesh = MESH, _billboardNameGuid = GUID, _nameVisLast = null;
    var A = { markDirty: function(){} };
    var console = { log: function(s){ LOGS.push(s); } };
    var window = {};
    ${FX_SRC}
    return window.__tmOverlaySync;`);
  return { mesh, logs, sync: mk(mesh, guid, logs) };
}

const ov = makeOverlay(GUID);
const projectStart = +q(DB_4D, `SELECT min(timestamp) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'`);
const scrub = [
  ['project start (2026-01-01)', projectStart],
  ['end of Superstructure', Date.parse('2026-01-31')],
  ['end of MEP Rough-in', Date.parse('2026-03-02')],
  ['end of Architecture', Date.parse('2026-04-01')],
  ['TASK_Finishes opens (2026-05-01)', Date.parse('2026-05-01')],
  ['1 ms BEFORE the plate installs', myStart - 1],
  ['the instant it installs', myStart],
  ['mid-install', Math.floor((myStart + myEnd) / 2)],
  ['programme end (2026-05-31)', myEnd]
];
let vMismatch = 0;
const rowsOut = [];
for (const [label, t] of scrub) {
  const st = tmState(t);
  const pred = predFn(st.placed, st.frontier, st.recent);
  const elementVisible = pred(GUID);          // what TM applies to the REAL element this tick
  ov.sync(pred);                              // drive the SHIPPED overlay setter
  const overlayVisible = ov.mesh.visible;     // what the overlay ends up as
  if (elementVisible !== overlayVisible) vMismatch++;
  rowsOut.push('t=' + t + ' (' + new Date(t).toISOString().slice(0, 19) + ') ' + label.padEnd(34) +
    ' element=' + String(elementVisible).padEnd(5) + ' overlay=' + String(overlayVisible).padEnd(5) +
    (elementVisible === overlayVisible ? '' : '  ← MISMATCH'));
}
gate('V1', 'overlay visibility EQUALS the real element\'s at every sampled point of a real scrub',
  vMismatch === 0 && scrub.length >= 3,
  scrub.length + ' sample points, mismatches=' + vMismatch + '\n     ' + rowsOut.join('\n     '));

// V2 — the LITERAL regression the user reported. A gate that only checked the end would pass on
// the broken build, where the quad was built unconditionally and was visible at every cursor.
const stStart = tmState(projectStart);
ov.sync(predFn(stStart.placed, stStart.frontier, stStart.recent));
const atStart = ov.mesh.visible;
// The restore path that actually matters: TM is switched off while the plate is HIDDEN (a scrub
// that ended early). Nothing TM imposed may survive deactivate, or the sign stays missing from the
// finished building. Sequencing matters here — off-from-visible would pass trivially.
const offFromHidden = ov.mesh.visible;          // currently false, from atStart above
ov.sync(null);                                  // TM switched off while hidden
const restoredFromHidden = ov.mesh.visible;
const stEnd = tmState(myEnd);
ov.sync(predFn(stEnd.placed, stEnd.frontier, stEnd.recent));
const atEnd = ov.mesh.visible;
ov.sync(null);                                  // TM switched off while visible
const afterOff = ov.mesh.visible;
gate('V2', '"it shall appear last, not like now it came on" — invisible at project start, visible at the end, and TM-off restores it from EITHER state',
  atStart === false && atEnd === true && afterOff === true &&
  offFromHidden === false && restoredFromHidden === true,
  'visible@projectStart=' + atStart + ' (must be false — this is the reported defect)  ' +
  'visible@programmeEnd=' + atEnd + '\n     TM-off while HIDDEN: ' + offFromHidden + ' → ' +
  restoredFromHidden + ' (must restore to true);  TM-off while visible: ' + afterOff +
  '\n     §-log lines the shipped setter emitted: ' + JSON.stringify(ov.logs));

// ─────────────────────────────────────── C1: text is config-only, config carries no geometry ──
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const geomKeys = Object.keys(cfg).filter(k => k !== 'buildingName' && k[0] !== '_');
const fxUsesCfg = fxSrc.indexOf('cfg.buildingName') >= 0;
const fxHasNamePlateCfg = /cfg\.namePlate|np\.widthM|np\.heightM|np\.gapM|np\.orientation/.test(fxSrc);
const fxHardcodesText = /TERMINAL PENUMPANG/.test(fxSrc);
gate('C1', 'the wording is config-only; no geometry in config, no text in code',
  geomKeys.length === 0 && fxUsesCfg && !fxHasNamePlateCfg && !fxHardcodesText,
  'config keys besides buildingName/_comment = [' + geomKeys.join(',') + '] (must be empty);  ' +
  'effects.js reads cfg.buildingName=' + fxUsesCfg + ';  still reads namePlate geometry keys=' +
  fxHasNamePlateCfg + ' (must be false);  hardcodes the text=' + fxHardcodesText + ' (must be false)');

// ────────────────────────────────────────────────────────── M1: the migration is idempotent ──
function snapshot(db, withSchedule) {
  const parts = [
    q(db, `SELECT count(*)||'|'||coalesce(group_concat(ifc_class||element_name||storey||discipline||material_name||material_rgba||building),'') FROM elements_meta WHERE guid='${GUID}'`),
    q(db, `SELECT count(*)||'|'||coalesce(group_concat(printf('%.17g',center_x)||center_y||center_z||bbox_x||bbox_y||bbox_z),'') FROM element_transforms WHERE guid='${GUID}'`),
    q(db, `SELECT count(*)||'|'||coalesce(group_concat(geometry_hash),'') FROM element_instances WHERE guid='${GUID}'`),
    q(db, `SELECT count(*)||'|'||coalesce(group_concat(hex(vertices)||hex(faces)),'') FROM component_geometries WHERE geometry_hash='${HASH}'`),
    q(db, 'SELECT count(*) FROM elements_meta')
  ];
  if (withSchedule) {
    parts.push(q(db, `SELECT count(*)||'|'||coalesce(group_concat(task_id),'') FROM task_elements WHERE guid='${GUID}'`));
    parts.push(q(db, `SELECT count(*)||'|'||coalesce(group_concat(timestamp||parameters),'') FROM kernel_ops WHERE output_guid='${GUID}'`));
    parts.push(q(db, "SELECT count(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'"));
    parts.push(q(db, 'SELECT count(*) FROM task_elements'));
  }
  return parts.join('##');
}
const before4d = snapshot(DB_4D, true), beforeHi = snapshot(DB_HI, false);
execFileSync('bash', ['-c', `sqlite3 "${DB_HI}" < "${MIG}/terminal_billboard_nameplate.sql" && sqlite3 "${DB_4D}" < "${MIG}/terminal_billboard_nameplate.sql" && sqlite3 "${DB_4D}" < "${MIG}/terminal_billboard_nameplate_4d.sql"`]);
const after4d = snapshot(DB_4D, true), afterHi = snapshot(DB_HI, false);
gate('M1', 're-applying both migrations changes nothing (idempotent)',
  before4d === after4d && beforeHi === afterHi,
  'TerminalHi4D snapshot identical=' + (before4d === after4d) + ';  Terminal_Hi identical=' +
  (beforeHi === afterHi) + ';  elements_meta total=' + q(DB_4D, 'SELECT count(*) FROM elements_meta') +
  '  task_elements total=' + q(DB_4D, 'SELECT count(*) FROM task_elements') +
  '  ELEMENT_PLACE total=' + q(DB_4D, "SELECT count(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'"));

// ─────────────────────────────────── 5D: the shipped rate that applies, quoted not fabricated ──
const ratesSrc = fs.readFileSync(path.join(ROOT, 'viewer/rates.js'), 'utf8');
const m = ratesSrc.match(/IfcBuildingElementProxy\s*:\s*\{[^}]*\}/);
const cls = q(DB_4D, `SELECT ifc_class FROM elements_meta WHERE guid='${GUID}'`);
gate('D1', '5D folds this element through the ALREADY-SHIPPED rate row keyed by ifc_class — no new category',
  !!m && cls === 'IfcBuildingElementProxy' && /rate\s*:\s*850/.test(m[0]),
  'elements_meta.ifc_class="' + cls + '"  →  viewer/rates.js  ' + (m ? m[0] : 'NOT FOUND') +
  '\n     bound to ' + boundTask + ', so schedule_author.js foldCost picks it up via ' +
  'JOIN task_elements (bbox_x=' + bx + ' > 0, the fold\'s WHERE gate)');

console.log('\n§NAMEPLATE_WITNESS done pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
