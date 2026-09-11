#!/usr/bin/env node
// witness_ground_connected.js — §GROUND_CONNECTED (bim-compiler prompts/4D_MODEL_INTEGRITY.md §N,
// found 2026-09-11 by the user watching an HHS MaxQ buildup bake: a teal IfcBuildingElementProxy
// revealed alone near the skyline with nothing built under it — three real 7m Stahlbalkon brackets).
//
// ISSUE this witness proves/disproves: `_contactGraph` (support_sweep.js) and its twin `contactGraph`
// (cpm_schedule.js) reused `grounded[i]` — "nothing beneath me in my own XY column", a FOOTPRINT-LOCAL
// test — as the answer to "is this element allowed to be unsupported at all", the question §I.2 says
// is answered by CLASSIFICATION (seq===1). Two shapes of the same defect: (a) an element with zero
// contacts and nothing below it defaulted into "grounded" by the absence of any comparison; (b) the
// bottom of a stack that never reaches real ground read grounded=1 because it is locally lowest. Both
// were silently absorbed into groundedN and never counted as orphans, so nothing downstream saw them.
// The fix seeds a DIRECTED walk (supporter -> supported) over the contacts the function already builds
// from the classified ground population, with a ground-band fallback for a building that models no
// substructure at all (HHS). This witness is RED on unmodified main (no groundConnected field, HHS
// orphans=36 with the three brackets absorbed) and GREEN after — cite the two logs, not the exit code.
//
//   G-1  REAL HHS_Office_Federated_extracted.db: the three Stahlbalkon GUIDs are orphans (named in the
//        §GROUND_CONNECTED_ORPHANS line), HHS's engine orphan count rises from the locked 36 by >= 3,
//        and HHS takes the ground-band fallback because it has no classified ground at all.
//   G-2  The exemption is DERIVED from classification, not from geometric absence of neighbours: a
//        lone seq===1 footing with zero neighbours is ground-connected; a lone seq!==1 element with
//        zero neighbours is NOT, even though grounded[i]===1 for it (case a, the old rule's trap).
//   G-3  Parity: SupportSweep.contactGraph and CpmSchedule.contactGraph agree verdict-for-verdict on
//        every synthetic case and on real HHS (the two copies are patched identically); the walk's
//        propagation is real (a stack ON a footing is fully connected, so G-4 is not vacuous).
//   G-4  Case (b): a synthetic stack touching only itself, none of it classified ground, is NOT
//        exempted regardless of which member is locally lowest — the bottom member reads
//        grounded[i]===1 (footprint-local) AND groundConnected===0 (the exact trap). Reclassifying
//        the bottom member seq===1 connects the whole stack; the walk is directed, so a segment
//        resting ON a floating member cannot rescue it.
//   G-5  Fallback and strictness: a population with no classified ground takes the ground-band
//        (seedMode reported, never silent) and a stack floating above the band is still orphaned;
//        items with no .seq/.phase at all never crash and are never exempt by classification.
//
// Command: node viewer/tests/witness_ground_connected.js   — read the § lines, not the exit code.
// RED CONTROL: VIEWER_DIR=/path/to/unfixed/viewer node viewer/tests/witness_ground_connected.js
//   (points every module at another checkout's engine; on main @a552d22b this is pass=0 on G-1/G-2/G-4/G-5).
'use strict';
const fs = require('fs');
const path = require('path');
const VIEWER = process.env.VIEWER_DIR || path.join(__dirname, '..');
const ScheduleGate = require(path.join(VIEWER, 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));
const SupportSweep = require(path.join(VIEWER, 'support_sweep.js'));
const CpmSchedule = require(path.join(VIEWER, 'cpm_schedule.js'));
const initSqlJs = require(path.join(VIEWER, '..', 'modeller', 'lib', 'sql-wasm.js'));
// Absolute, same convention as witness_true_orphan_floating.js (PR #1712): the extracted DBs are
// dev-machine-local fixtures shared by every worktree, never git/LFS.
const HHS_DB = '/home/red1/bim-ootb/buildings/HHS_Office_Federated_extracted.db';
const HHS_LOCKED_ORPHANS_BEFORE = 36;   // baselines/midair.json orphans.HHS_Office_Federated before this fix
const STAHLBALKON = ['3XrBtx9eX7mQE6EqWHPf0l', '3XrBtx9eX7mQE6EqWHPe$q', '3XrBtx9eX7mQE6EqWHPezS'];

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function finish() { console.log('\n§GROUND_CONNECTED_SUMMARY pass=' + pass + ' fail=' + fail); process.exit(fail ? 1 : 0); }

// A box: seq/phase are the classification the engine reads; s/e only so midairAudit can run over it.
function box(guid, seq, x0, x1, y0, y1, bz, tz, extra) {
  return Object.assign({ guid, seq, phase: seq === 1 ? 'Substructure' : 'Architecture', cls: seq === 1 ? 'IfcFooting' : 'IfcBuildingElementProxy',
    x0, x1, y0, y1, bz, tz, s: 0, e: 60000 }, extra || {});
}
const gc = (G, i) => (G.groundConnected ? G.groundConnected[i] : undefined);
function parity(label, items) {
  const a = SupportSweep.contactGraph(items), b = CpmSchedule.contactGraph(items);
  let diff = 0;
  for (let i = 0; i < items.length; i++) if (gc(a, i) !== gc(b, i)) diff++;
  assert(a.ok && b.ok && a.orphans === b.orphans && a.groundSeedMode === b.groundSeedMode && diff === 0,
    'G-3 ' + label + ' the two copies agree verdict-for-verdict (orphans ' + a.orphans + '/' + b.orphans +
    ', seedMode ' + a.groundSeedMode + '/' + b.groundSeedMode + ', elementDiff=' + diff + ')');
  return a;
}

// ── G-2: exemption derived from classification, not from geometric absence of neighbours ─────────
{
  const footing = [box('F', 1, 0, 1, 0, 1, 0, 0.5)];
  const G = parity('lone footing', footing);
  assert(G.contacts[0] === null && G.grounded[0] === 1 && gc(G, 0) === 1 && G.orphans === 0 && G.groundSeedMode === 'classification',
    'G-2a a lone seq===1 footing with ZERO neighbours is ground-connected (exempt by classification, not by having nothing below it): orphans=' + G.orphans);
  const caseA = [box('F', 1, 0, 1, 0, 1, 0, 0.5), box('P', 5, 100, 101, 0, 1, 5, 6)];
  const G2 = parity('footing + isolated proxy', caseA);
  assert(G2.contacts[1] === null && G2.grounded[1] === 1 && gc(G2, 1) === 0 && G2.orphans === 1,
    'G-2b a lone seq!==1 element with ZERO neighbours is an ORPHAN even though grounded[i]===1 for it (case a: the old ' +
    '`if (grounded[i]) groundedN++; else if (!list) orphans++` absorbed it): grounded=' + G2.grounded[1] + ' groundConnected=' + gc(G2, 1) + ' orphans=' + G2.orphans);
  assert(gc(G2, 0) === 1, 'G-2c the footing in the same population is still exempt (orphans counts only the proxy)');
}

// ── G-4: case (b) — a disconnected stack is never exempt, whichever member is locally lowest ───────
{
  const stack = () => [box('A', 5, 50, 51, 0, 1, 5, 6), box('B', 5, 50, 51, 0, 1, 6, 7), box('C', 5, 50, 51, 0, 1, 7, 8)];
  const items = [box('F', 1, 0, 1, 0, 1, 0, 0.5)].concat(stack());
  const G = parity('floating stack + far footing', items);
  const cA = (G.contacts[1] || []).slice().sort(), cB = (G.contacts[2] || []).slice().sort(), cC = (G.contacts[3] || []).slice().sort();
  // The carrier-above clause has no upper bound (§DAY_GAP_TAIL, deliberately left alone), so the
  // bottom box lists BOTH members above it — the relations are untouched by this fix.
  assert(JSON.stringify(cA) === '[2,3]' && JSON.stringify(cB) === '[1,3]' && JSON.stringify(cC) === '[2]',
    'G-4a the stack touches ONLY itself under the three unchanged relations (A:[B,C] carrier-above unbounded, B:[A,C], C:[B] bearing-below; the footing at index 0 appears in none): ' + JSON.stringify([cA, cB, cC]));
  assert(G.grounded[1] === 1 && gc(G, 1) === 0,
    'G-4b the bottom member reads grounded[i]===1 (nothing below it in its own column — footprint-locally TRUE) AND groundConnected===0 — the exact case-(b) trap that absorbed the HHS brackets');
  assert(gc(G, 2) === 0 && gc(G, 3) === 0 && G.orphans === 3 && gc(G, 0) === 1,
    'G-4c NONE of the stack is exempted (orphans=' + G.orphans + ' of 3), the far footing stays exempt');
  const reclassified = [box('F', 1, 0, 1, 0, 1, 0, 0.5)].concat(stack()); reclassified[1].seq = 1; reclassified[1].phase = 'Substructure';
  const G2 = parity('stack with its bottom reclassified seq===1', reclassified);
  assert(gc(G2, 1) === 1 && gc(G2, 2) === 1 && gc(G2, 3) === 1 && G2.orphans === 0,
    'G-4d reclassifying the bottom member seq===1 connects the WHOLE stack through the walk (orphans=' + G2.orphans + ') — the exemption is classification + reachability');
  const onFooting = [box('F', 1, 0, 1, 0, 1, 0, 0.5), box('A', 5, 0, 1, 0, 1, 0.5, 1.5), box('B', 5, 0, 1, 0, 1, 1.5, 2.5), box('C', 5, 0, 1, 0, 1, 2.5, 3.5)];
  const G3 = parity('stack ON the footing', onFooting);
  assert(gc(G3, 1) === 1 && gc(G3, 2) === 1 && gc(G3, 3) === 1 && G3.orphans === 0,
    'G-3b the walk PROPAGATES: the same stack resting on the footing is fully ground-connected (orphans=' + G3.orphans + ') — G-4 is not vacuous');
  // Directed, not undirected: a segment resting ON a floating bracket lists the bracket as its bearing
  // contact; the bracket itself lists nothing. If the walk were undirected, connecting the upper
  // segment to ground (via a slab it also touches) would "rescue" the bracket from below.
  const bracket = [box('F', 1, 0, 1, 0, 1, 0, 0.5),
    box('SLAB', 4, 0, 60, 0, 1, 0.5, 0.8),                  // ground-connected: rests on the footing
    box('BRK', 5, 50, 51, 0, 1, 3.74, 10.81),               // the bracket: nothing below it within GAP, touches nothing
    box('SEG', 5, 50, 51, 0, 1, 7.76, 14.8, { x0: 50, x1: 51 })];   // rests on BRK (bearing) — BRK does not hang from it
  const G4 = parity('bracket + segment resting on it', bracket);
  const segContacts = (G4.contacts[3] || []).slice().sort();
  assert(G4.contacts[2] === null && segContacts.indexOf(2) >= 0,
    'G-4e fixture shape holds: the bracket touches nothing; the segment lists the bracket as a contact (' + JSON.stringify(segContacts) + ')');
  assert(gc(G4, 2) === 0 && gc(G4, 3) === 0 && G4.orphans === 2,
    'G-4f DIRECTED walk: the segment resting ON the floating bracket cannot rescue it (an undirected walk would) — both orphans (orphans=' + G4.orphans + ')');
}

// ── G-5: fallback mode and strictness on a population with no classified ground ─────────────────
{
  const noSub = [box('SLAB', 4, 0, 10, 0, 1, 0, 0.3), box('WALL', 4, 0, 1, 0, 1, 0.3, 3),
    box('A', 5, 50, 51, 0, 1, 5, 6), box('B', 5, 50, 51, 0, 1, 6, 7), box('C', 5, 50, 51, 0, 1, 7, 8)];
  const G = parity('no classified ground', noSub);
  assert(G.groundSeedMode === 'ground-band' && G.groundSeeds >= 1 && gc(G, 0) === 1 && gc(G, 1) === 1,
    'G-5a a population with NO seq===1/phase===Substructure member takes the ground-band fallback (mode=' + G.groundSeedMode + ', seeds=' + G.groundSeeds +
    '): the footprint-grounded slab at the datum seeds, the wall on it is connected');
  assert(gc(G, 2) === 0 && gc(G, 3) === 0 && gc(G, 4) === 0 && G.orphans === 3,
    'G-5b under the fallback a stack floating ' + (5 - 0).toFixed(1) + 'm above the datum (> GROUND_BAND=' + ScheduleGate.GROUND_BAND + ') is STILL orphaned (orphans=' + G.orphans + ') — grounded[i]===1 alone never seeds');
  const bare = noSub.map(it => ({ guid: it.guid, x0: it.x0, x1: it.x1, y0: it.y0, y1: it.y1, bz: it.bz, tz: it.tz }));   // bbox only, no seq/phase
  let threw = null, Gb = null;
  try { Gb = SupportSweep.contactGraph(bare); } catch (e) { threw = e; }
  assert(!threw && Gb && Gb.ok && Gb.groundSeedMode === 'ground-band' && Gb.orphans === 3,
    'G-5c items with NO .seq/.phase at all never crash and are never exempt by classification (mode=' + (Gb && Gb.groundSeedMode) + ', orphans=' + (Gb && Gb.orphans) + (threw ? ', THREW ' + threw.message : '') + ')');
  const empty = SupportSweep.contactGraph([]);
  assert(empty.ok && empty.orphans === 0 && empty.groundSeeds === 0, 'G-5d an empty population is ok with orphans=0 (no seeds, no NaN datum)');
}

// ── G-1: the real building, the real three brackets ──────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(HHS_DB)) { assert(false, 'G-1 fixture missing: ' + HHS_DB + ' — HHS claims NOT proved on this machine'); return finish(); }
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(VIEWER, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const ratesSrc = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  const RATES = (new Function(ratesSrc + '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();
  const db = new SQL.Database(fs.readFileSync(HHS_DB));
  const nameOf = {};
  const nr = db.exec("SELECT guid, COALESCE(element_name,'') FROM elements_meta");
  if (nr.length) nr[0].values.forEach(v => { nameOf[v[0]] = v[1]; });
  const quiet = console.log; console.log = () => {};
  let raw;
  try {
    raw = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
      laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES, defaultRule: RATES.SEQUENCE_DEFAULT });
  } finally { console.log = quiet; }
  db.close();
  const items = raw.map(el => ({ guid: el.guid, cls: el.cls, seq: el.seq, phase: el.phase, storey: el.storey,
    x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, bz: el.base_z, tz: el.top_z, s: 0, e: 60000 }));
  const G = parity('real HHS (' + items.length + ' elements)', items);
  const idx = {}; items.forEach((it, i) => { idx[it.guid] = i; });
  const classified = items.filter(it => it.seq === 1 || it.phase === 'Substructure').length;
  console.log('§GROUND_CONNECTED HHS_Office_Federated total=' + items.length + ' classifiedGround=' + classified + ' seedMode=' + G.groundSeedMode +
    ' seeds=' + G.groundSeeds + ' groundConnected=' + G.groundConnectedN + ' orphans=' + G.orphans + ' groundedN(footprint-local)=' + G.groundedN +
    ' lockedBefore=' + HHS_LOCKED_ORPHANS_BEFORE);
  const orphanGuids = [];
  for (let i = 0; i < items.length; i++) if (gc(G, i) === 0) orphanGuids.push(items[i].guid);
  console.log('§GROUND_CONNECTED_ORPHANS HHS_Office_Federated n=' + orphanGuids.length + ' guids=' + JSON.stringify(orphanGuids));
  STAHLBALKON.forEach(g => {
    const i = idx[g]; const T = i != null ? items[i] : null;
    console.log('§GROUND_CONNECTED_WATCH ' + g + (T ? ' cls=' + T.cls + ' "' + (nameOf[g] || '') + '" seq=' + T.seq + ' bz=' + T.bz.toFixed(2) + ' tz=' + T.tz.toFixed(2) +
      ' contacts=' + (G.contacts[i] ? G.contacts[i].length : 0) + ' grounded(footprint-local)=' + G.grounded[i] + ' groundConnected=' + gc(G, i) : ' NOT IN POPULATION'));
    assert(T && G.contacts[i] === null && G.grounded[i] === 1 && gc(G, i) === 0,
      'G-1a ' + g + ' (Stahlbalkon, ' + (T ? T.bz.toFixed(2) + '..' + T.tz.toFixed(2) + 'm' : '?') + ') touches nothing, reads grounded[i]===1 (the trap), and is now an ORPHAN (groundConnected=' + gc(G, i) + ')');
  });
  assert(STAHLBALKON.every(g => orphanGuids.indexOf(g) >= 0),
    'G-1b all three brackets appear BY NAME in the §GROUND_CONNECTED_ORPHANS list (before this fix no log line named any orphan)');
  assert(G.orphans >= HHS_LOCKED_ORPHANS_BEFORE + 3,
    'G-1c HHS engine orphans rose from the locked ' + HHS_LOCKED_ORPHANS_BEFORE + ' by at least 3 (got ' + G.orphans + ', delta=' + (G.orphans - HHS_LOCKED_ORPHANS_BEFORE) + ')');
  assert(classified === 0 && G.groundSeedMode === 'ground-band',
    'G-1d HHS models NO classified ground (seq===1/phase===Substructure members=' + classified + ', the buildingModelsSubstructure=false case) so the ground-band fallback is what seeds it (mode=' + G.groundSeedMode + ') — reported, never silent');
  const ma = SupportSweep.midairAudit(items);
  assert(ma.orphans === G.orphans && Array.isArray(ma.orphanGuids) && STAHLBALKON.every(g => ma.orphanGuids.indexOf(g) >= 0) && ma.groundSeedMode === G.groundSeedMode,
    'G-1e midairAudit (the lock-gate judge and the §CPM_DISPLAY log source) carries the same orphans (' + ma.orphans + ') and names the three brackets in orphanGuids');
  finish();
})().catch(e => { console.error('§GROUND_CONNECTED_ERROR ' + (e && e.stack || e)); fail++; finish(); });
