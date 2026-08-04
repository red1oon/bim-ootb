// witness_gantt_row_order.js — prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT K1.
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   User report 2026-08-04: "are you using any 4D convention used by P6 on gantt phase/task ordering?
//   Last session was a mess putting substructure which has above ground appearing first." The drawer
//   followed NO convention — rows sorted purely by startTs, so a phase's floors interleaved with
//   other phases' arbitrarily. K1 orders rows P6-style: WBS path (phase, in real construction
//   sequence) then early start.
//
//   The load-bearing risk is NOT the sort itself — it is the ORDER the sort uses. This codebase has a
//   documented history of hand-copied PHASE_ORDER arrays drifting from the engine: PR #1165 had to fix
//   MEP-rough-in-before-envelope across 18 rate-template sources, and time_machine.js still carries
//   copies it missed. This witness fails if the row order ever stops agreeing with SEQUENCE_RULES,
//   which is the only real source of construction sequence.
var fs = require('fs');
var path = require('path');
var VIEWER = path.join(__dirname, '..', '..', 'viewer');

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-ROWORDER PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-ROWORDER FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

// ---- The truth: phase order derived from SEQUENCE_RULES' own sequence numbers.
var txt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
var s = txt.indexOf('var RATES = {'), d = txt.indexOf('var SEQUENCE_DEFAULT');
var rules = (new Function(txt.slice(s, txt.indexOf('};', d) + 2) + '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES};'))();
var minSeq = {};
Object.keys(rules.SEQUENCE_RULES).forEach(function (k) {
  var r = rules.SEQUENCE_RULES[k];
  if (!r || !r.phase || r.sequence == null) return;
  if (minSeq[r.phase] == null || r.sequence < minSeq[r.phase]) minSeq[r.phase] = r.sequence;
});
var TRUE_ORDER = Object.keys(minSeq).sort(function (a, b) { return minSeq[a] - minSeq[b]; });
console.log('§W-ROWORDER engineOrder=' + JSON.stringify(TRUE_ORDER));
check('G-RO-0 engine-order-derivable', TRUE_ORDER.length >= 5, 'phases=' + TRUE_ORDER.length);

// ---- Real construction discipline, stated as assertions rather than trusted.
function before(a, b) { return TRUE_ORDER.indexOf(a) >= 0 && TRUE_ORDER.indexOf(b) >= 0 && TRUE_ORDER.indexOf(a) < TRUE_ORDER.indexOf(b); }
check('G-RO-1 substructure-is-first', TRUE_ORDER[0] === 'Substructure', 'first=' + TRUE_ORDER[0]);
check('G-RO-2 superstructure-before-everything-above-it', before('Superstructure', 'Architecture'),
  'Superstructure@' + TRUE_ORDER.indexOf('Superstructure') + ' Architecture@' + TRUE_ORDER.indexOf('Architecture'));
// PR #1165's fix, asserted so it cannot silently regress: the envelope precedes MEP rough-in.
check('G-RO-3 envelope-before-MEP-rough-in (PR #1165)', before('Architecture', 'MEP Rough-in'),
  'Architecture@' + TRUE_ORDER.indexOf('Architecture') + ' MEP Rough-in@' + TRUE_ORDER.indexOf('MEP Rough-in'));
check('G-RO-4 MEP-final-after-MEP-rough-in', before('MEP Rough-in', 'MEP Final'));
check('G-RO-5 finishes-last', TRUE_ORDER[TRUE_ORDER.length - 1] === 'Finishes', 'last=' + TRUE_ORDER[TRUE_ORDER.length - 1]);

// ---- The drawer must DERIVE its order, not hardcode a copy that can drift.
var tm = fs.readFileSync(path.join(VIEWER, 'time_machine.js'), 'utf8');
var i = tm.indexOf('var _ROW_PHASE_ORDER');
check('G-RO-6 row-order-exists', i >= 0);
var block = i >= 0 ? tm.slice(i, i + 1200) : '';
check('G-RO-7 row-order-is-derived-from-SEQUENCE_RULES', block.indexOf('window.SEQUENCE_RULES') >= 0,
  'a hardcoded list is what drifted in the first place');

// ---- The hardcoded FALLBACK inside that block must still match the engine order. This is the check
// that would have caught the first draft of this fix, which copied the stale _VAR_ORDER.
var fb = /return \[([^\]]+)\]/.exec(block);
var fallback = fb ? fb[1].split(',').map(function (x) { return x.trim().replace(/^'|'$/g, ''); }) : [];
console.log('§W-ROWORDER fallback=' + JSON.stringify(fallback));
check('G-RO-8 fallback-matches-engine-order', JSON.stringify(fallback) === JSON.stringify(TRUE_ORDER),
  'fallback=' + JSON.stringify(fallback) + ' engine=' + JSON.stringify(TRUE_ORDER));

// ---- Report (not assert) the other PHASE_ORDER copies still in the file and whether they agree.
// These are display-only today, but this is the drift class that produced the reported bug.
var stale = [];
var re = /(?:var\s+(?:_VAR_ORDER|PHASE_ORDER)\s*=\s*)\[([^\]]+)\]/g, m;
while ((m = re.exec(tm)) !== null) {
  var arr = m[1].split(',').map(function (x) { return x.trim().replace(/^'|'$/g, ''); });
  var agrees = JSON.stringify(arr.filter(function (p) { return TRUE_ORDER.indexOf(p) >= 0; })) ===
    JSON.stringify(TRUE_ORDER.filter(function (p) { return arr.indexOf(p) >= 0; }));
  if (!agrees) stale.push(arr.join('|'));
}
console.log('§W-ROWORDER otherPhaseOrderCopiesDisagreeingWithEngine=' + stale.length +
  (stale.length ? ' → ' + JSON.stringify(stale) : '') +
  '  (display-only today; reported, not gated — see §GANTT_EDIT K1)');

console.log('§W-ROWORDER RESULT pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
