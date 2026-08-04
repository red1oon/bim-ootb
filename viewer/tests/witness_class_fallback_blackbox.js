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
// silently fall through in ALL THREE independent matchRule copies this codebase carries
// (schedule_author.js:17, and two closures inside time_machine.js). A prior black-box witness
// (witness_gantt_ops_blackbox.js) proved a DIFFERENT leak (a bookkeeping op polluting playback
// bounds) using a SYNTHETIC 40-element fixture — it never touched real class data, which is
// exactly why this gap went unnoticed. This witness is the general-purpose tool that was
// actually asked for: it runs the REAL functions (required or sliced from the shipped files,
// never reimplemented) against the REAL ifc_class population of REAL extracted building DBs,
// and FAILS — no silent pass — on any of:
//   G-A: a real class present in real data resolves to resource===null in ANY copy
//   G-B: the three copies disagree with each other on phase for the same real class
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

// ── Copies 2 & 3: time_machine.js — two independent closures, sliced by balanced braces (not
// reimplemented) since neither is exported. A brace-counter, not a fixed line span, so this
// stays correct even if the surrounding function grows/shrinks. ──
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');
function extractBalanced(src, startIdx) {
  let depth = 0, i = startIdx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced braces from ' + startIdx);
}
function sliceMatcherPair(src, fromIdx) {
  const noIdx = src.indexOf('function matchNameOverride(cls, name) {', fromIdx);
  if (noIdx < 0) throw new Error('matchNameOverride not found from ' + fromIdx);
  const noBody = extractBalanced(src, noIdx);
  const mrIdx = src.indexOf('function matchRule(cls, name) {', noIdx + noBody.length);
  if (mrIdx < 0) throw new Error('matchRule not found after its matchNameOverride at ' + noIdx);
  const mrBody = extractBalanced(src, mrIdx);
  return noBody + '\n' + mrBody;
}
function mkMatcher(logic) {
  const sandbox = { SR: SEQUENCE_RULES, SD: SEQUENCE_DEFAULT, NO: NAME_OVERRIDES };
  vm.runInNewContext(logic + '\nglobalThis.__matchRule = matchRule;', sandbox);
  return sandbox.__matchRule;
}
const firstNoIdx = tmSrc.indexOf('function matchNameOverride(cls, name) {');
const secondNoIdx = tmSrc.indexOf('function matchNameOverride(cls, name) {', firstNoIdx + 1);
assert(firstNoIdx >= 0 && secondNoIdx > firstNoIdx, 'G-0 time_machine.js still carries exactly two matchRule/matchNameOverride closures (found at least 2)');
const matchRule2 = mkMatcher(sliceMatcherPair(tmSrc, 0));
const matchRule3 = mkMatcher(sliceMatcherPair(tmSrc, firstNoIdx + 1));

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
    console.log('  class'.padEnd(34) + 'count'.padEnd(8) + 'author.js'.padEnd(20) + 'TM#1'.padEnd(20) + 'TM#2'.padEnd(20) + 'agree?');

    let auditedThisBuilding = 0;
    rows.forEach(([cls, sampleName, count]) => {
      auditedThisBuilding += count;
      const r1 = matchRule1(cls, sampleName), r2 = matchRule2(cls, sampleName), r3 = matchRule3(cls, sampleName);
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
    `G-B all three matchRule copies agree on phase for every real class — disagreements=${allDisagreements.length}` +
    (allDisagreements.length ? '  [' + allDisagreements.map(d => `${d.BLD}:${d.cls} author=${d.r1} TM#1=${d.r2} TM#2=${d.r3}`).join(', ') + ']' : ''));
  assert(grandTotalAudited === grandTotalElements, `G-D grand total: ${grandTotalAudited}/${grandTotalElements} elements audited across all buildings`);

  console.log(`\n§BLACKBOX_CLASS_AUDIT SUMMARY pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})();
