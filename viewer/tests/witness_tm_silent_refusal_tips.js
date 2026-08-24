#!/usr/bin/env node
/**
 * witness_tm_silent_refusal_tips.js — every user-triggerable refusal in time_machine.js shows a tip.
 *
 * Implementing the tm-error-handling spec (feat/tm-error-handling) — Witness: W-TM-SRT
 *
 * THE ISSUE EACH CHECK PROVES OR DISPROVES. Before this change, ten refusal paths logged a
 * §..._REJECT / §..._FAIL line and returned with NO user-visible message: the drag snapped back,
 * the click did nothing, and only the console knew why (commitGanttDrag's ScheduleAuthor guard /
 * bar_has_no_task / no_real_task_snapshot / hard engine failure; shiftGanttSchedule's guard +
 * engine failure; commitGanttGroupShift's guard + engine failure; the dblclick lock gate;
 * openGanttProps' no_real_task_dates; linkGanttBars' guard). This witness makes that a CLASS
 * property, not a fixed list: it enumerates every _REJECT/_FAIL log call in the CURRENT source and
 * requires a tip-set in the same enclosing block — so a FUTURE refusal path added without a message
 * fails the suite instead of shipping silent.
 *
 * ANCHORING (the §4(d) lesson — witness_gantt_lock_integrity.js / G-COH-6 both produced false
 * results here by text-slicing instead of brace/line-anchoring): this file does NOT slice on text
 * offsets around a match. It runs a string/comment/template-aware brace scanner over the whole
 * source, records the innermost enclosing block for each refusal log call, and searches for the
 * message call INSIDE that block's exact brace span. The scanner self-checks: if its depth at EOF
 * is not exactly 0 it aborts as infrastructure breakage — it can never silently mis-anchor.
 *
 * EXCLUSIONS (each with the reason, house KNOWN_* pattern):
 *   §GANTT_SCHEDULE_STALE_REGEN_FAIL — load-time self-heal catch inside buildTaskIndex, not a user
 *     gesture: the drawer (and its #tm-gantt-tip) may not exist yet, and the code continues to a
 *     working fallback (reads the existing tasks as-is), so there is nothing to tell the user.
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const SRC_PATH = path.join(__dirname, '..', 'time_machine.js');
const src = fs.readFileSync(SRC_PATH, 'utf8');

// ── The scanner: brace depth per character, skipping strings/comments/templates ────────────────
// blockOpenAt[i] = source index of the '{' that opened the block containing index i (innermost).
// Built with an explicit open-brace stack. Regex literals are not tracked: the source was checked
// (2026-08-24) to contain no regex literal with a brace or quote in it, and the EOF self-check
// below turns any future violation into a loud abort, never a silent mis-count.
function scan(s) {
  const stack = [];            // indices of currently-open '{'
  const openerOf = new Array(s.length); // innermost opener index at each position (or -1)
  let mode = 'code';           // code | sq | dq | tpl | line | block
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    openerOf[i] = stack.length ? stack[stack.length - 1] : -1;
    if (mode === 'code') {
      if (c === "'") mode = 'sq';
      else if (c === '"') mode = 'dq';
      else if (c === '`') mode = 'tpl';
      else if (c === '/' && n === '/') mode = 'line';
      else if (c === '/' && n === '*') mode = 'block';
      else if (c === '{') stack.push(i);
      else if (c === '}') stack.pop();
    } else if (mode === 'sq') {
      if (c === '\\') i++;
      else if (c === "'") mode = 'code';
    } else if (mode === 'dq') {
      if (c === '\\') i++;
      else if (c === '"') mode = 'code';
    } else if (mode === 'tpl') {
      if (c === '\\') i++;
      else if (c === '`') mode = 'code';
    } else if (mode === 'line') {
      if (c === '\n') mode = 'code';
    } else if (mode === 'block') {
      if (c === '*' && n === '/') { mode = 'block-end'; }
    } else if (mode === 'block-end') { mode = 'code'; }
  }
  return { openerOf, eofDepth: stack.length, eofMode: mode };
}

// closeOf(openIdx): index of the '}' matching the '{' at openIdx — same skip rules.
function closeOf(s, openIdx) {
  let d = 0, mode = 'code';
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (mode === 'code') {
      if (c === "'") mode = 'sq';
      else if (c === '"') mode = 'dq';
      else if (c === '`') mode = 'tpl';
      else if (c === '/' && n === '/') mode = 'line';
      else if (c === '/' && n === '*') mode = 'block';
      else if (c === '{') d++;
      else if (c === '}') { d--; if (d === 0) return i; }
    } else if (mode === 'sq') { if (c === '\\') i++; else if (c === "'") mode = 'code'; }
    else if (mode === 'dq') { if (c === '\\') i++; else if (c === '"') mode = 'code'; }
    else if (mode === 'tpl') { if (c === '\\') i++; else if (c === '`') mode = 'code'; }
    else if (mode === 'line') { if (c === '\n') mode = 'code'; }
    else if (mode === 'block') { if (c === '*' && n === '/') mode = 'block-end'; }
    else if (mode === 'block-end') mode = 'code';
  }
  return -1;
}

const lineOf = idx => src.slice(0, idx).split('\n').length;

console.log('── witness_tm_silent_refusal_tips (W-TM-SRT) ──');

// W-SRT-0 — the scanner itself is sound on this source, or nothing below can be believed.
const scanned = scan(src);
if (scanned.eofDepth !== 0 || scanned.eofMode !== 'code') {
  assert(false, 'W-SRT-0 scanner self-check: depth at EOF must be 0 in code mode (got depth=' +
    scanned.eofDepth + ' mode=' + scanned.eofMode + ') — brace tracking is broken on this source, ABORTING rather than mis-anchoring');
  console.log('§TM_SILENT_REFUSAL_SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(1);
}
assert(true, 'W-SRT-0 scanner self-check: EOF depth=0 in code mode — block anchoring is trustworthy');

// W-SRT-1 — the shared tip helper exists (the mechanism every new refusal site uses).
assert(src.indexOf('function _tmSay(') >= 0, 'W-SRT-1 _tmSay (shared #tm-gantt-tip helper) is defined');

// ── Enumerate every refusal log call in the CURRENT source ─────────────────────────────────────
const SITE_RE = /console\.(?:log|warn)\('(§[A-Z0-9_]*?(?:_REJECT|_FAIL))\b/g;
const EXCLUDED = {
  '§GANTT_SCHEDULE_STALE_REGEN_FAIL': 'load-time self-heal catch (buildTaskIndex), not a user gesture; tip may not exist yet; flow continues to a working fallback',
  '§LOAD_FAIL': 'missing gantt_model.js script at load — fires on internal recompute paths (computeDays / buildGanttTasks, the latter on EVERY redraw), not on a gesture; a tip would spam and the drawer may not exist yet',
  '§GHOST_GROUND_TRIGGER_FAIL': 'DB-probe catch inside tmFirstAboveGroundMs/tmGroundSchedule — CPE bake helpers with a documented null-return contract ("treat null as never ghost"), consumed by cinema code, not a TM user gesture'
};
// A message reaching the user inside the SAME block: the shared helper, a local say() closure, or
// a direct tip .textContent set (the file's three real mechanisms — wireGanttDrag uses the third).
const MSG_RE = /\b_tmSay\s*\(|\bsay\s*\(|\.textContent\s*=/;

let sites = [], m;
while ((m = SITE_RE.exec(src)) !== null) sites.push({ tag: m[1], idx: m.index });

// W-SRT-2 — the enumerator is not vacuous: the known population is ~21 sites; finding far fewer
// means the regex rotted and the witness would be gating nothing.
assert(sites.length >= 18, 'W-SRT-2 enumerator found ' + sites.length + ' _REJECT/_FAIL log sites (>= 18 — not vacuous)');

// W-SRT-3 — every excluded tag still exists in the source (a renamed tag must not leave a stale
// exclusion silently narrowing the gate).
for (const tag in EXCLUDED) {
  assert(sites.some(s => s.tag === tag), 'W-SRT-3 excluded tag ' + tag + ' still exists in source (reason: ' + EXCLUDED[tag] + ')');
}

// W-SRT-4 — THE GATE. Each non-excluded site's innermost enclosing block must set a message.
let silent = [], checked = 0;
for (const s of sites) {
  if (EXCLUDED[s.tag]) continue;
  checked++;
  const open = scanned.openerOf[s.idx];
  if (open < 0) { silent.push(s.tag + ':' + lineOf(s.idx) + ' (top level?!)'); continue; }
  const close = closeOf(src, open);
  if (close < 0) { silent.push(s.tag + ':' + lineOf(s.idx) + ' (unclosed block?!)'); continue; }
  const block = src.slice(open, close + 1);
  if (!MSG_RE.test(block)) silent.push(s.tag + ' @ line ' + lineOf(s.idx));
}
assert(silent.length === 0, 'W-SRT-4 every user-triggerable refusal shows a tip in its own block' +
  (silent.length ? ' — SILENT: [' + silent.join(', ') + ']' : ' (' + checked + ' sites checked)'));

// W-SRT-5 — the gate can actually fail (negative control): a synthetic silent site, run through
// the same anchoring, must be flagged. A checker that cannot flag anything is not a check.
(function () {
  const synth = "function _synthetic() {\n  if (!x) {\n    console.log('§SYNTH_TEST_REJECT reason=x');\n    return;\n  }\n}\n";
  const sc = scan(synth);
  const mm = /console\.log\('(§[A-Z0-9_]*?_REJECT)/.exec(synth);
  const open = sc.openerOf[mm.index];
  const close = closeOf(synth, open);
  const flagged = !MSG_RE.test(synth.slice(open, close + 1));
  assert(sc.eofDepth === 0 && flagged, 'W-SRT-5 negative control: a synthetic silent refusal IS flagged by the same anchoring');
})();

console.log('§TM_SILENT_REFUSAL_SUMMARY pass=' + pass + ' fail=' + fail + ' sites=' + sites.length);
process.exit(fail ? 1 : 0);
