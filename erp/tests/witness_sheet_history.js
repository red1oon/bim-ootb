#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SHEET-HISTORY (bim-compiler prompts/SHEET_FRONT_DOOR.md §6, slice S9). READ THE LOG after every run: every verdict is a
//   §SHIST line; the exit code is not the evidence. INCONCLUSIVE when nothing was judged. A mutant that crashes is NOT a kill.
// SPEC (claims written before the code, each names the issue it exposes):
//   H1 RECORD     an entry lists exactly the changed cells (changed / added / cleared) with before+after; no change -> NO-OP, no entry   -> history misses or invents edits
//   H2 FORMAT     every history line passes the ERP kernel's own verifyJournal (ws_kernel.js) - one verifier, one format               -> a second divergent log format
//   H3 TAMPER     a hand-edited recorded value is caught (payload digest); a removed entry is caught (chain)                            -> history rewritten unseen
//   H4 AS-OF      replaying the first N entries gives exactly the sheet at step N, for every N                                         -> time travel wrong
//   H5 CELL STORY a cell's story lists every value it had, in order, with who and when                                                -> per-cell history incomplete
//   H6 MERGE      two copies forked from one history: different cells combine; the same cell changed differently = CONFLICT with both
//                 values and the base kept; the same change on both sides is not a conflict                                           -> version chaos / silent overwrite
//   H7 TYPED-OVER a formula replaced by a typed number is flagged typedOverFormula                                                     -> hardcoded overrides missed
//   H8 COST       genesis + per-step time and history bytes on the real workbook, logged                                               -> unmeasured weight
// Real workbook: erp/ninja_sample.xlsx (sheet BACKUP: B5:B8 values, B9 = SUM(B5:B8) = 541.02), read with the ERP's own SheetJS build.
// Command: node erp/tests/witness_sheet_history.js     (SHIST_MUTANTS=1 adds the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..');
var ENGINE = process.env.SHIST_ENGINE || path.join(ERP, 'sheet_history.js'), MUTANT = process.env.SHIST_MUTANT || '';
var H = require(ENGINE), K = require(path.join(ERP, 'ws_kernel.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function say(s) { console.log(s); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §SHIST-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info)));
}
async function guard(cs, key, rule, fn) { try { await fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); } }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§SHIST-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function clone(x) { return JSON.parse(J(x)); }

// the host's job, done here the way a menu would: every cell of every sheet as { v, f }
function snapshotOf(file) {
  var wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellFormula: true }), snap = {};
  wb.SheetNames.forEach(function (n) { var s = wb.Sheets[n], o = snap[n] = {}; Object.keys(s).forEach(function (k) { if (k[0] !== '!') o[k] = { v: s[k].v === undefined ? null : s[k].v, f: s[k].f || null }; }); });
  return snap;
}

(async function main() {
  var FILE = path.join(ERP, 'ninja_sample.xlsx'), S0 = snapshotOf(FILE);
  var nCells = Object.keys(S0).reduce(function (a, s) { return a + Object.keys(S0[s]).length; }, 0);
  say('§SHIST-LOAD engine=' + ENGINE + ' mutant=' + (MUTANT || 'none') + ' workbook=ninja_sample.xlsx sheets=' + Object.keys(S0).length + ' cells=' + nCells + ' BACKUP!B9=' + J(S0.BACKUP && S0.BACKUP.B9));
  var real = S0.BACKUP && S0.BACKUP.B9 && S0.BACKUP.B9.f === 'SUM(B5:B8)' && S0.BACKUP.B6 && typeof S0.BACKUP.B6.v === 'number' && !S0.BACKUP.F2;
  // the user's day: step 2 changes B6 and adds a note in F2 (outside the used range A1:D11, so empty); step 3 types a number over the SUM in B9; step 4 clears the note
  var S1 = clone(S0); S1.BACKUP.B6.v = Math.round((S0.BACKUP.B6.v + 100) * 100) / 100; S1.BACKUP.F2 = { v: 'checked by QS', f: null };
  var S2 = clone(S1); S2.BACKUP.B9 = { v: 600, f: null };
  var S3 = clone(S2); delete S3.BACKUP.F2;
  var SNAPS = [S0, S1, S2, S3], WHO = ['owner', 'qs', 'clerk', 'qs'], hist = [], lines = [], T = [], noop = null;
  var t0 = Date.now(), g = await H.record(hist, null, S0, WHO[0], '2026-11-27T01:00:00Z'); T.push(Date.now() - t0); hist.push(g.entry); lines.push(g.line);
  for (var i = 1; i < SNAPS.length; i++) { t0 = Date.now(); var r = await H.record(hist, SNAPS[i - 1], SNAPS[i], WHO[i], '2026-11-27T0' + (i + 1) + ':00:00Z'); T.push(Date.now() - t0); hist.push(r.entry); lines.push(r.line); }
  noop = await H.record(hist, S3, clone(S3), 'qs');

  // ═══ H1 RECORD ═══
  await guard('H1', 'record', 'each step records exactly its changed cells', async function () {
    check('H1', 'real', 'the workbook is real: BACKUP!B9 is =SUM(B5:B8), B6 a number', !!real, S0.BACKUP && S0.BACKUP.B9);
    check('H1', 'genesis', 'entry 1 (genesis) holds every non-empty cell (' + nCells + ') of the file', hist[0].ops === nCells && hist[0].meta.genesis === true, { ops: hist[0].ops });
    var k = function (e) { return e.payload.ops.map(function (o) { return o.sheet + '!' + o.cell; }); };
    check('H1', 'step2', 'step 2 = exactly BACKUP!F2 (added) + BACKUP!B6 (changed), with before/after', J(k(hist[1])) === J(['BACKUP!F2', 'BACKUP!B6']) && hist[1].payload.ops[0].before === null && hist[1].payload.ops[1].before.v === S0.BACKUP.B6.v && hist[1].payload.ops[1].after.v === S1.BACKUP.B6.v, hist[1].payload.ops);
    check('H1', 'cleared', 'step 4 = exactly BACKUP!F2 cleared (after null, before = the note)', J(k(hist[3])) === J(['BACKUP!F2']) && hist[3].payload.ops[0].after === null && hist[3].payload.ops[0].before.v === 'checked by QS', hist[3].payload.ops);
    check('H1', 'noop', 'no change -> verdict NO-OP and no entry', noop.verdict === 'NO-OP' && noop.entry === null, noop.verdict);
  });
  // ═══ H2 FORMAT ═══
  await guard('H2', 'format', 'the kernel\'s own verifyJournal verifies the sheet history', async function () {
    var v = K.verifyJournal(lines.join('\n'));
    check('H2', 'kernel-verify', 'ws_kernel.verifyJournal ok over all ' + lines.length + ' lines, actors as recorded', v.ok === true && v.entries === 4 && v.actors.qs === 2, v);
    var own = await H.verify(lines);
    check('H2', 'own-verify', 'the engine\'s own verify agrees (ok, 4 entries)', own.ok === true && own.entries === 4, own);
  });
  // ═══ H3 TAMPER ═══
  await guard('H3', 'tamper', 'edits and removals are caught', async function () {
    var bad = JSON.parse(lines[1]); bad.payload.ops[1].before.v = 1; var L1 = lines.slice(); L1[1] = J(bad);
    var v1 = await H.verify(L1);
    check('H3', 'value', 'changing a recorded before-value of B6 is caught at entry 2 as a payload edit', v1.ok === false && v1.brokenAt === 2 && /payload/.test(v1.why), v1);
    var L2 = lines.slice(0, 1).concat(lines.slice(2)), v2 = await H.verify(L2);
    check('H3', 'removed', 'removing entry 2 is caught at the next entry as a chain break', v2.ok === false && v2.brokenAt === 2 && /prev-hash/.test(v2.why), v2);
    var bad3 = JSON.parse(lines[2]); bad3.actor = 'owner'; var L3 = lines.slice(); L3[2] = J(bad3); var v3 = await H.verify(L3);
    check('H3', 'actor', 'changing who made entry 3 is caught as a content edit', v3.ok === false && v3.brokenAt === 3, v3);
  });
  // ═══ H4 AS-OF ═══
  await guard('H4', 'asof', 'replay to every step gives that step\'s sheet exactly', async function () {
    var okAll = true, bad = [];
    for (var n = 1; n <= 4; n++) { var d = H.diff(H.asOf(hist, n), SNAPS[n - 1]); if (d.length) { okAll = false; bad.push({ n: n, diff: d.slice(0, 3) }); } }
    check('H4', 'every-step', 'asOf(n) == snapshot n for n = 1..4 (zero cell differences)', okAll, bad);
  });
  // ═══ H5 CELL STORY ═══
  await guard('H5', 'story', 'B6 and B9 tell their whole story', async function () {
    var b6 = H.cellStory(hist, 'BACKUP', 'B6'), b9 = H.cellStory(hist, 'BACKUP', 'B9');
    check('H5', 'B6', 'B6: genesis value by owner, then the new value by qs at step 2', b6.length === 2 && b6[0].actor === 'owner' && b6[0].after.v === S0.BACKUP.B6.v && b6[1].actor === 'qs' && b6[1].seq === 2 && b6[1].after.v === S1.BACKUP.B6.v, b6);
    check('H5', 'B9', 'B9: =SUM by owner, then 600 typed by clerk at step 3, flagged as typed over a formula', b9.length === 2 && b9[0].after.f === 'SUM(B5:B8)' && b9[1].actor === 'clerk' && b9[1].after.v === 600 && b9[1].typedOverFormula === true, b9);
  });
  // ═══ H7 TYPED-OVER ═══
  await guard('H7', 'typed', 'the formula overwritten by a number is flagged, nothing else is', async function () {
    var flagged = []; hist.forEach(function (e) { e.payload.ops.forEach(function (o) { if (o.typedOverFormula) flagged.push(o.sheet + '!' + o.cell + '@' + e.seq); }); });
    check('H7', 'typed-over', 'exactly one flag: BACKUP!B9 at entry 3 (was =SUM(B5:B8), now 600)', J(flagged) === J(['BACKUP!B9@3']), flagged);
  });
  // ═══ H6 MERGE ═══
  await guard('H6', 'merge', 'two emailed copies merge, conflicts shown not overwritten', async function () {
    var base = [hist[0], hist[1]];                                                     // both copies start from step 2
    var A1 = clone(S1); A1.BACKUP.B7.v = 11; A1.BACKUP.C5 = { v: 'site A', f: null }; A1.BACKUP.B8.v = 99;   // copy A: B7, C5, B8
    var B1 = clone(S1); B1.BACKUP.B7.v = 22; B1.BACKUP.C6 = { v: 'site B', f: null }; B1.BACKUP.B8.v = 99;   // copy B: B7 differently, C6, B8 the same
    var ra = await H.record(base, S1, A1, 'qs-laptop', '2026-11-27T05:00:00Z'), rb = await H.record(base, S1, B1, 'site-pc', '2026-11-27T05:30:00Z');
    var m = H.merge(base.concat([ra.entry]), base.concat([rb.entry]));
    check('H6', 'fork', 'the fork point is entry 2 (shared history found)', m.ok && m.fork === 2, { ok: m.ok, fork: m.fork, why: m.why });
    check('H6', 'conflict', 'exactly one conflict: BACKUP!B7 with A=11, B=22, base = the original value', m.conflicts.length === 1 && m.conflicts[0].cell === 'B7' && m.conflicts[0].a.v === 11 && m.conflicts[0].b.v === 22 && m.conflicts[0].base.v === S1.BACKUP.B7.v, m.conflicts);
    check('H6', 'kept-base', 'the merged sheet keeps the base value at the conflict (neither copy overwrote it)', m.merged.BACKUP.B7.v === S1.BACKUP.B7.v, m.merged.BACKUP.B7);
    check('H6', 'combined', 'C5 from A, C6 from B, B8 = 99 from both (same change, no conflict)', m.merged.BACKUP.C5.v === 'site A' && m.merged.BACKUP.C6.v === 'site B' && m.merged.BACKUP.B8.v === 99 &&
      J(m.applied.map(function (x) { return x.cell + ':' + x.from; })) === J(['C5:a', 'C6:b', 'B8:both']), m.applied);
    var other = await H.record([], null, { X: { A1: { v: 1, f: null } } }, 'stranger'), mx = H.merge([other.entry], base);
    check('H6', 'unrelated', 'two files with no shared history are refused, not merged', mx.ok === false, mx);
  });
  // ═══ H8 COST ═══
  await guard('H8', 'cost', 'time and size measured and logged', async function () {
    var bytes = lines.reduce(function (a, l) { return a + Buffer.byteLength(l); }, 0), fileBytes = fs.statSync(FILE).size;
    say('§SHIST-COST cells=' + nCells + ' genesisMs=' + T[0] + ' stepMs=' + J(T.slice(1)) + ' historyBytes=' + bytes + ' genesisBytes=' + Buffer.byteLength(lines[0]) + ' fileBytes=' + fileBytes + ' heapMB=' + Math.round(process.memoryUsage().heapUsed / 1048576));
    check('H8', 'measured', 'the cost line was produced with real numbers (genesis + 3 steps timed, bytes > 0)', T.length === 4 && bytes > 0, { T: T, bytes: bytes });
  });

  var vs = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8'].map(verdict);
  if (process.env.SHIST_MUTANTS === '1' && !MUTANT) {
    var MUT = [
      { name: 'M1-cleared-cells-dropped', kills: 'H1', from: "if (same(b, a)) return;", to: "if (same(b, a) || a == null) return;" },
      { name: 'M2-digest-not-checked', kills: 'H3', from: "if (!e.payload || await sha256(JSON.stringify(e.payload.ops)) !== e.opsDigest)", to: "if (!e.payload)" },
      { name: 'M3-asof-off-by-one', kills: 'H4', from: "for (var i = 0; i < n && i < history.length; i++)", to: "for (var i = 0; i < n - 1 && i < history.length; i++)" },
      { name: 'M4-side-b-wins-silently', kills: 'H6', from: "if (x.a && x.b && !same(x.a.after, x.b.after)) {", to: "if (false) {" },
      { name: 'M5-formulas-ignored', kills: 'H7', from: "if (b && b.f != null && a && a.f == null && a.v != null) op.typedOverFormula = true;", to: "" }
    ];
    var src = fs.readFileSync(ENGINE, 'utf8'), killed = 0, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shist-mut-'));
    MUT.forEach(function (m) {
      var n = src.split(m.from).length - 1;
      if (n !== 1) { say('§SHIST-MUTANT name=' + m.name + ' NOT-APPLIED matches=' + n); return; }
      var f = path.join(tmp, m.name + '.js'); fs.writeFileSync(f, src.replace(m.from, m.to));
      var out = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { SHIST_ENGINE: f, SHIST_MUTANT: m.name, SHIST_MUTANTS: '' }), encoding: 'utf8' }).stdout || '';
      var line = (out.match(new RegExp('§SHIST-' + m.kills + ' verdict=\\w+[^\\n]*')) || [''])[0], k = /verdict=FAIL/.test(line);
      if (k) killed++; say('§SHIST-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + (k ? 'KILLED' : 'SURVIVED') + ' child="' + line + '"');
    });
    say('§SHIST-MUTANTS killed=' + killed + '/' + MUT.length); if (killed !== MUT.length) ALL.failed++;
  }
  var overall = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§SHIST-VERDICT ' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(vs));
  process.exit(overall === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§SHIST-VERDICT FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
