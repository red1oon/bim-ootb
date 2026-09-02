#!/usr/bin/env node
// WITNESS — §RETYPED_CONSTANTS: every hand-typed copy of ScheduleGate's EPS/GAP and of
// SEQUENCE_DEFAULT is REGISTERED, and each still equals the source it copied.
// Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.5b + §I.5i · prompts/4D_GANTT_TM_REFACTOR.md
// §FUTURE item 7 Stage 5 / §STAGE45_PLAN (queue item B-2).
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1): SOURCE TEXT and one
// pure function. It judges the CONSTANTS — not a schedule, not a bar, not a frame.
//
// ISSUE THIS PROVES OR DISPROVES. schedule_gate.js:1298-1300 exports EPS/GAP alongside CELL with an
// explicit reason — "a consumer of the same geometry can test contact with THIS module's measured
// constants instead of re-typing them: a second copy is a second thing to drift." Production sites
// re-type them anyway (§I.5b). All of them still EQUAL their source, so this is a latent hazard, not
// a live defect — and a latent hazard with no instrument is exactly what §I.5i's SEQUENCE_DEFAULT
// copies became once they DID diverge (every copy is the pre-§S65 `resource: null` object, and only
// `||` ordering hides it). This witness is that missing instrument: it fails the day any registered
// copy stops matching, and it fails if a NEW unregistered copy appears.
//
// WHY A REGISTRY AND NOT "JUST UNIFY THEM" (§I.4). Three sites CANNOT read the module, and the
// reason is measured, not caution: this repo has a family of witnesses that slice ONE function out
// of a file as raw text and eval it in a bare sandbox, so a symbol declared elsewhere in the file is
// `undefined` there. witness_og_guard_bearing_bound.js executes `_ogSupportSweep` with a STUB
// `ScheduleGate: { CELL: 4 }` — no EPS, no GAP — which would silently turn every comparison in that
// block into NaN and return an empty sweep. That blocker is asserted below against the witness's own
// source, so it is machine-checked rather than remembered.
//
// Command: node viewer/tests/witness_retyped_constants.js
'use strict';
const fs = require('fs');
const path = require('path');
const VIEWER_DIR = process.env.VIEWER_DIR || path.join(__dirname, '..');
const ScheduleGate = require(path.join(VIEWER_DIR, 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(VIEWER_DIR, 'schedule_author.js'));
const KIT = path.join(__dirname, '..', '..', 'witness_kit');
const { Witness } = require(path.join(KIT, 'contract'));

const read = f => fs.readFileSync(path.join(VIEWER_DIR, f), 'utf8');
const lineOf = (src, frag) => { const i = src.indexOf(frag); return i < 0 ? -1 : src.slice(0, i).split('\n').length; };

// ── THE REGISTRY. Every production re-type of EPS(0.05)/GAP(0.5), with its verdict and its reason.
//    `expect` is the canonical value the copy must still equal. `status`:
//      source        — schedule_gate.js itself
//      consolidated  — now reads the module (this PR)
//      blocked       — cannot read the module; `blocker` names the measured mechanism
const REG = [
  { id: 'SRC_EPS', file: 'schedule_gate.js', frag: 'var EPS  = 0.05;', lit: 0.05, expect: ScheduleGate.EPS, status: 'source', blocker: '' },
  { id: 'SRC_GAP', file: 'schedule_gate.js', frag: 'var GAP  = 0.5;', lit: 0.5, expect: ScheduleGate.GAP, status: 'source', blocker: '' },
  { id: 'TM_WALLS_BEFORE_ROOF', file: 'time_machine.js',
    frag: 'var _rgCELL = (ScheduleGate.CELL || 4), _rgEPS = (ScheduleGate.EPS || 0.05), _rgGAP = (ScheduleGate.GAP || 0.5);',
    lit: 0.05, expect: ScheduleGate.EPS, status: 'consolidated', blocker: '' },
  { id: 'SS_OG_SWEEP', file: 'support_sweep.js', frag: 'var _ogEPS = 0.05, _ogGAP = 0.5;',
    lit: 0.05, expect: ScheduleGate.EPS, status: 'blocked',
    blocker: 'witness_og_guard_bearing_bound.js evals _ogSupportSweep with a STUB ScheduleGate: { CELL: 4 }' },
  { id: 'TM_XRAY_SUPPORT_CACHE', file: 'time_machine.js', frag: 'var CELL = 4, EPS = 0.05, GAP = 0.5;',
    lit: 0.05, expect: ScheduleGate.EPS, status: 'blocked',
    blocker: '_buildXraySupportCache names no ScheduleGate at all; the region is text-sliced by probes' },
  { id: 'TM_LP_GAP', file: 'time_machine.js', frag: 'var LP_GAP = 0.5;',
    lit: 0.5, expect: ScheduleGate.GAP, status: 'blocked',
    blocker: '_promoteRoofLoadPath is text-sliced into bare sandboxes by 7 witnesses/probes' }
];
// Sites carrying the same NUMBER for a genuinely different CONCERN. §I.5b raises level_deriver.js's
// EPS as an OPEN QUESTION and explicitly says do not "unify" it without deciding that first; the two
// time_machine.js ghost-ground sites are a Z-bottom epsilon over element_transforms, not a bearing
// tolerance, and §I.5b never listed them at all — found by this scan. Registered as EXCLUDED so the
// discovery check below does not report them as new, and so the exclusion is on the record.
const DIFFERENT_CONCERN = [
  'lib/level_deriver.js:var EPS = 0.05;',
  'time_machine.js:var EPS = 0.05, above = Object.create(null), rows;'
];

const rows = [];
for (const r of REG) {
  const src = read(r.file);
  const line = lineOf(src, r.frag);
  rows.push({ kind: 'const', id: r.id, file: r.file, line, found: line > 0,
    status: r.status, blocker: r.blocker, lit: r.lit, expect: r.expect, equal: r.lit === r.expect,
    readsModule: r.frag.indexOf('ScheduleGate.') >= 0 });
}

// ── discovery: any production EPS/GAP re-type carrying 0.05 or 0.5 that the registry does not name.
const SCAN_FILES = ['schedule_gate.js', 'schedule_author.js', 'support_sweep.js', 'cpm_schedule.js',
  'time_machine.js', 'panels.js', 'lib/level_deriver.js'];
const RE = /\b[A-Za-z0-9_$]*(?:EPS|GAP)[A-Za-z0-9_$]*\s*=\s*(0\.05|0\.5)\b/g;
const unregistered = [];
for (const f of SCAN_FILES) {
  const src = read(f);
  src.split('\n').forEach((ln, i) => {
    if (ln.trim().indexOf('//') === 0) return;                       // a comment is not a re-type
    RE.lastIndex = 0;
    if (!RE.test(ln)) return;
    const known = REG.some(r => r.file === f && ln.indexOf(r.frag.slice(0, 30)) >= 0) ||
      DIFFERENT_CONCERN.some(d => (f + ':' + ln.trim()).indexOf(d) === 0);
    if (!known) unregistered.push(f + ':' + (i + 1) + ' ' + ln.trim());
  });
}
unregistered.forEach(u => console.log('§RTC_UNREGISTERED ' + u));

// ── SEQUENCE_DEFAULT (§I.5i). Behavioural, in a BROWSER-SHAPED binding — and the reason it has to be
//    is itself a finding worth recording. schedule_author.js closes as
//    `})(typeof self !== 'undefined' ? self : this);` and in a node CommonJS module `this` is the
//    ORIGINAL `module.exports` object, which the file then REPLACES (`module.exports = API`). So in
//    node the IIFE's `global` is an orphaned empty object no caller can ever reach: every
//    `global.SEQUENCE_DEFAULT` fallback in this file is unreachable there, and omitting
//    `opts.defaultRule` in node lands on the LITERAL, always. That is the precise mechanism behind
//    §I.5i's "in node ... defaultRule MUST be passed", stated here as measured rather than assumed.
//    The fix therefore only bites in a browser, where `self` is `window` — so the test builds that.
const vm = require('vm');
const CANON = { phase: 'Architecture Envelope', sequence: 6, resource: 'MASON' };
function browserLike(withDefault) {
  const sb = { console: { log() {}, warn() {}, error() {} }, Math: Math, Date: Date, JSON: JSON,
    Object: Object, Array: Array, String: String, Number: Number, isFinite: isFinite };
  sb.self = sb; sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  if (withDefault) sb.SEQUENCE_DEFAULT = CANON;
  vm.runInContext(read('schedule_author.js'), sb);
  return sb.ScheduleAuthor.matchRule('IfcNoSuchClassAnywhere', {});
}
const withGlobal = browserLike(true), withoutGlobal = browserLike(false);
const srcSD = read('schedule_author.js');
rows.push({ kind: 'seqdefault', id: 'MATCHRULE_CONSULTS_GLOBAL', file: 'schedule_author.js',
  line: lineOf(srcSD, 'dflt = dflt || (global.SEQUENCE_DEFAULT)'), found: true, status: 'consolidated',
  blocker: '', lit: 0, expect: 0, equal: true,
  readsModule: srcSD.indexOf('dflt = dflt || (global.SEQUENCE_DEFAULT) ||') >= 0 });
console.log('§RTC_SEQDEFAULT browserBinding withGlobal=' + JSON.stringify(withGlobal) +
  ' withoutGlobal=' + JSON.stringify(withoutGlobal) +
  ' — the second is the PRE-§S65 literal, still shipped at 7 sites and REPORTED, not corrected (§I.5i)');

// ── the measured blocker, asserted against the blocking witness's own source, not remembered.
const ogSrc = fs.readFileSync(path.join(__dirname, 'witness_og_guard_bearing_bound.js'), 'utf8');
const stubReal = ogSrc.indexOf('ScheduleGate: { CELL: 4 }') >= 0;
rows.push({ kind: 'blockerproof', id: 'OG_GUARD_STUB_SANDBOX', file: 'tests/witness_og_guard_bearing_bound.js',
  line: lineOf(ogSrc, 'ScheduleGate: { CELL: 4 }'), found: stubReal, status: 'blocked',
  blocker: 'the stub sandbox that makes SS_OG_SWEEP unconsolidatable', lit: 0, expect: 0,
  equal: true, readsModule: false });

rows.forEach(r => console.log('§RTC_ROW ' + r.id.padEnd(26) + r.file.padEnd(38) + ':' + String(r.line).padEnd(6) +
  ' status=' + r.status.padEnd(13) + ' equalsSource=' + r.equal + ' readsModule=' + r.readsModule +
  (r.blocker ? '  blocker=' + r.blocker : '')));
console.log('§RTC_SUMMARY registered=' + REG.length + ' judged=' + rows.length +
  ' unregistered=' + unregistered.length + ' differentConcern=' + DIFFERENT_CONCERN.length);

Witness('RETYPED_CONSTANTS')
  .population(() => rows)
  .schema({
    type: 'object',
    required: ['kind', 'id', 'file', 'line', 'found', 'status', 'equal'],
    properties: {
      kind: { type: 'string', enum: ['const', 'seqdefault', 'blockerproof'] },
      id: { type: 'string', minLength: 1 },
      file: { type: 'string', minLength: 1 },
      // A registered site whose text is gone reads line=-1: the registry has drifted from the code,
      // which is the same defect one level up and must fail rather than pass quietly.
      line: { type: 'integer', minimum: 1 },
      found: { type: 'boolean', const: true },
      status: { type: 'string', enum: ['source', 'consolidated', 'blocked'] },
      equal: { type: 'boolean', const: true }
    }
  })
  // W-RTC-1 — the drift detector proper: every registered copy still equals ScheduleGate's value.
  .invariant('W-RTC-1 every registered EPS/GAP copy still equals its source',
    rs => rs.filter(r => r.kind === 'const').every(r => r.equal))
  // W-RTC-2 — no NEW unregistered re-type has appeared since this registry was written.
  .invariant('W-RTC-2 no unregistered EPS/GAP re-type in the scanned production files',
    () => unregistered.length === 0)
  // W-RTC-3 — the consolidated sites really do read the module, so this is not a comment-only claim.
  .invariant('W-RTC-3 every consolidated site reads the module (not a literal, not a comment)',
    rs => rs.filter(r => r.status === 'consolidated').every(r => r.readsModule))
  // W-RTC-4 — NOT VACUOUS: at least one site is genuinely blocked and its blocker is proven to exist
  // in the blocking file's own source. Without this the registry could be all-green by listing
  // nothing hard.
  .invariant('W-RTC-4 the measured blocker exists in witness_og_guard_bearing_bound.js', () => stubReal)
  // W-RTC-5 — matchRule reaches the canonical object when one is present (§I.5i's actual fix).
  // W-RTC-5 — the §I.5i fix, measured in the binding where it applies: with a canonical object in
  // scope matchRule reaches it; without one it still lands on the pre-§S65 literal, which is the
  // reported-not-shipped half and is printed rather than hidden.
  .invariant('W-RTC-5 matchRule with no dflt reaches the canonical object in a browser binding',
    () => withGlobal.resource === 'MASON' && withGlobal.phase === 'Architecture Envelope' &&
          withoutGlobal.resource === null)
  // RED CONTROL — pretend one registered copy drifted. The whole point of the registry.
  .redControl(rs => rs.map(r => r.id === 'SS_OG_SWEEP' ? Object.assign({}, r, { lit: 0.06, equal: false }) : r))
  .run();
