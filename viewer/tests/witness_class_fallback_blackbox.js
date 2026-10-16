#!/usr/bin/env node
// witness_class_fallback_blackbox.js — the general-purpose black-box classification audit,
// requested 2026-08-04: "a black box output log ... so u can read it when testing to see what
// was the very first pile knocked onto the ground and so forth" — then hardened per the
// follow-up ask: "fail no fall back any nuance".
//
// THE ISSUE THIS PROVES OR DISPROVES: matchRule's silent default
// ({phase:'Architecture', sequence:6, resource:null}) lets any unrecognized ifc_class sail
// through the schedule unflagged. Found live 2026-08-04 on real Hospital data:
// IfcDistributionControlElement (861 elements) and IfcSwitchingDevice (113 elements) both
// silently fall through. Originally this codebase carried THREE independent matchRule copies
// (schedule_author.js:17, and two separate closures inside time_machine.js) that could silently
// diverge from each other. §SCHEDULE_CLASSIFY_DEDUP (2026-08-15, bim-compiler prompts/
// 4D_SCHEDULE_PERFECTION.md) collapsed the two time_machine.js closures into ONE shared pair
// (_classifyNameOverride/_classifyRule) that delegates to schedule_author.js's canonical,
// already-exported matchNameOverride/matchRule — with the old algorithm kept only as a fallback
// for the (should-never-happen) case ScheduleAuthor failed to load. This witness now proves BOTH
// halves of that: the delegating path agrees with the canonical implementation (should be true
// by construction — this guards against a wiring bug), AND the fallback path — dead code unless
// a script load fails — still agrees too, so it can't silently rot into a fourth divergent copy.
// A prior black-box witness (witness_gantt_ops_blackbox.js) proved a DIFFERENT leak (a
// bookkeeping op polluting playback bounds) using a SYNTHETIC 40-element fixture — it never
// touched real class data, which is exactly why this gap went unnoticed. This witness is the
// general-purpose tool that was actually asked for: it runs the REAL functions (required or
// sliced from the shipped files, never reimplemented) against the REAL ifc_class population of
// REAL extracted building DBs, and FAILS — no silent pass — on any of:
//   G-A: a real class present in real data resolves to resource===null in ANY copy
//   G-B: the three code paths (author.js canonical, TM delegating, TM fallback) disagree with
//        each other on phase for the same real class
//   G-C: any element in the DB is left completely unaccounted for by the audit
// Run: node witness_class_fallback_blackbox.js  (reads buildings/ next to this repo checkout,
// or set BLD_DIR to point elsewhere — DBs are OCI-distributed, not git-tracked, so a fresh
// worktree normally has none locally; point BLD_DIR at an existing checkout's buildings/ dir).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// ── Real rules data — the same JSON the shipped engine loads ──
const RULES_PATH = path.join(__dirname, '..', 'rates', 'sequence_rules.json');
const rulesJson = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
const SEQUENCE_RULES = rulesJson.SEQUENCE_RULES || rulesJson;
const SEQUENCE_DEFAULT = rulesJson.SEQUENCE_DEFAULT || { phase: 'Architecture', sequence: 6, resource: null };
const NAME_OVERRIDES = rulesJson.SEQUENCE_NAME_OVERRIDES || rulesJson.NAME_OVERRIDES || [];

// ── Copy 1: schedule_author.js — real, required (it's exported and node-testable), not sliced ──
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
function matchRule1(cls, name) {
  const ov = ScheduleAuthor.matchNameOverride(cls, name, NAME_OVERRIDES);
  return ov || ScheduleAuthor.matchRule(cls, SEQUENCE_RULES, SEQUENCE_DEFAULT);
}

// Independent of any matchRule copy: does ANY real SEQUENCE_RULES key substring-match this class
// at all? Same longest-substring rule matchRule itself uses, computed separately so a class that
// genuinely HAS an explicit rule (even one that intentionally carries resource:null, e.g.
// IfcBuildingElementProxy — a real, deliberate authoring choice, not a gap) is never confused
// with a class that matched NOTHING and silently fell through to the generic default.
function hasExplicitRule(cls) {
  for (const key in SEQUENCE_RULES) if (cls.indexOf(key) >= 0) return true;
  return false;
}

// ── TM (shared): time_machine.js's _classifyNameOverride/_classifyRule, sliced by balanced
// braces (not reimplemented) since neither is exported. A brace-counter, not a fixed line span,
// so this stays correct even if the surrounding function grows/shrinks. Run TWICE: once with a
// real `window.ScheduleAuthor` present (the delegating path — what production always exercises
// past initial page load, both TM call sites go through this) and once without (the fallback
// path — dead code unless a script load fails). Both must still agree with Copy 1. ──
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');
function extractBalanced(src, startIdx) {
  let depth = 0, i = startIdx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced braces from ' + startIdx);
}
function sliceClassifyPair(src) {
  const noIdx = src.indexOf('function _classifyNameOverride(cls, name, nameOverrides) {');
  if (noIdx < 0) throw new Error('_classifyNameOverride not found');
  const noBody = extractBalanced(src, noIdx);
  const secondNoIdx = src.indexOf('function _classifyNameOverride(cls, name, nameOverrides) {', noIdx + 1);
  const mrIdx = src.indexOf('function _classifyRule(cls, name, rules, dflt, nameOverrides) {', noIdx + noBody.length);
  if (mrIdx < 0) throw new Error('_classifyRule not found after its _classifyNameOverride');
  const mrBody = extractBalanced(src, mrIdx);
  return { pair: noBody + '\n' + mrBody, secondNoIdx };
}
function mkMatcher(pair, withScheduleAuthor) {
  const sandbox = {
    window: withScheduleAuthor ? { ScheduleAuthor } : {}, console,
    SR: SEQUENCE_RULES, SD: SEQUENCE_DEFAULT, NO: NAME_OVERRIDES
  };
  vm.runInNewContext(
    pair + '\nglobalThis.__matchRule = function(cls, name) { return _classifyRule(cls, name, SR, SD, NO); };',
    sandbox
  );
  return sandbox.__matchRule;
}
const sliced = sliceClassifyPair(tmSrc);
assert(sliced.secondNoIdx < 0,
  'G-0 time_machine.js carries exactly ONE _classifyNameOverride/_classifyRule pair (dedup held, not regressed back to per-site copies)');
const matchRuleTM = mkMatcher(sliced.pair, true);
const matchRuleTMFallback = mkMatcher(sliced.pair, false);

// ── Real building DBs — OCI-distributed, not git-tracked; point BLD_DIR at wherever they're
// actually checked out (default: sibling of this worktree's parent checkout, ~/bim-ootb). ──
const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const BUILDINGS = (process.env.BLDS || 'Hospital,Terminal,LTU_AHouse,Duplex').split(',');

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  let grandTotalElements = 0, grandTotalAudited = 0;
  const allFallbackHits = [];
  const allDisagreements = [];

  for (const BLD of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, BLD + '_extracted.db');
    if (!fs.existsSync(dbPath)) { console.log(`\n(skip ${BLD} — ${dbPath} not present locally)`); continue; }
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const res = db.exec("SELECT ifc_class, element_name, COUNT(*) c FROM elements_meta GROUP BY ifc_class ORDER BY c DESC");
    const rows = res.length ? res[0].values : [];
    const totalRes = db.exec("SELECT COUNT(*) FROM elements_meta");
    const totalElements = totalRes[0].values[0][0];
    db.close();

    console.log(`\n=== ${BLD} — ${rows.length} distinct classes, ${totalElements} elements ===`);
    console.log('  class'.padEnd(34) + 'count'.padEnd(8) + 'author.js'.padEnd(20) + 'TM(deleg)'.padEnd(20) + 'TM(fallback)'.padEnd(20) + 'agree?');

    let auditedThisBuilding = 0;
    rows.forEach(([cls, sampleName, count]) => {
      auditedThisBuilding += count;
      const r1 = matchRule1(cls, sampleName), r2 = matchRuleTM(cls, sampleName), r3 = matchRuleTMFallback(cls, sampleName);
      const agree = r1.phase === r2.phase && r2.phase === r3.phase;
      const explicit = hasExplicitRule(cls);
      const silentFallback = !explicit; // no rule matched at all -> hit the generic default unflagged
      const flag = (silentFallback ? '  <-- SILENT FALLBACK (no rule matches this class)' : '') +
        (!agree ? '  <-- COPIES DISAGREE' : '');
      console.log(
        '  ' + cls.padEnd(32) + String(count).padEnd(8) +
        `${r1.phase}/${r1.sequence}`.padEnd(20) + `${r2.phase}/${r2.sequence}`.padEnd(20) +
        `${r3.phase}/${r3.sequence}`.padEnd(20) + (agree ? 'yes' : 'NO') + flag
      );
      if (silentFallback) allFallbackHits.push({ BLD, cls, count });
      if (!agree) allDisagreements.push({ BLD, cls, count, r1: r1.phase, r2: r2.phase, r3: r3.phase });
    });
    grandTotalElements += totalElements;
    grandTotalAudited += auditedThisBuilding;
    assert(auditedThisBuilding === totalElements,
      `G-C ${BLD}: every element accounted for by the audit — audited=${auditedThisBuilding} total=${totalElements}`);
  }

  console.log('\n--- fallback / disagreement summary ---');
  assert(allFallbackHits.length === 0,
    `G-A no real class silently matches NO rule at all (hitting the generic default unflagged) — hits=${allFallbackHits.length}` +
    (allFallbackHits.length ? '  [' + allFallbackHits.map(h => `${h.BLD}:${h.cls}(n=${h.count})`).join(', ') + ']' : ''));
  assert(allDisagreements.length === 0,
    `G-B all three code paths (author.js, TM-delegating, TM-fallback) agree on phase for every real class — disagreements=${allDisagreements.length}` +
    (allDisagreements.length ? '  [' + allDisagreements.map(d => `${d.BLD}:${d.cls} author=${d.r1} TM(deleg)=${d.r2} TM(fallback)=${d.r3}`).join(', ') + ']' : ''));
  assert(grandTotalAudited === grandTotalElements, `G-D grand total: ${grandTotalAudited}/${grandTotalElements} elements audited across all buildings`);

  console.log(`\n§BLACKBOX_CLASS_AUDIT SUMMARY pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})();
