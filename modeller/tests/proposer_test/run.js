#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-PROPOSER (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §12 first test, §13 this version). READ THE LOG after every run.
 * ISSUE: "a deterministic layer gives better results than the AI alone" has never been measured. Rules are fixed in the spec before the first model call.
 *   node run.js --stub                  the scorer against known outcomes, no model call. Must pass before any run.
 *   node run.js --handoff <dir> --answered-by "<who>" --reps 1 --out x.json
 *                                       §14.6 the free path: each prompt is written to <dir>/q_*.txt and the run waits for <dir>/a_*.json. A rehearsal, never a measurement.
 *   node run.js --model-calls --reps 3 --out x.json   spawns `claude -p`. Owner directive 2026-11-08: no session passes --model-calls (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §14.6).
 * Arm A = the proposer alone: its first proposal and its own forecast. Arm B = the same run continued: the report goes back, up to 2 revisions.
 * The proposer runs isolated: no tools, no files, no project instructions.
 * §13: a shift is one edit (--shift), every building is on its own grid (--own-grid), overlaps are judged on lattice boxes (--lattice-boxes), a judged-fine result ends the run, the report names the limit and the bay.
 * §14: everything crossing a shift's line follows it by one rule, and one that is left behind scores LEFT_BEHIND.
 * §15: edit_cli stops an edit that adds red, and it scores STOPPED.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const CLI = path.join(__dirname, '..', '..', 'tools', 'edit_cli.js');
const BRIEFS = JSON.parse(fs.readFileSync(path.join(__dirname, 'briefs.json'), 'utf8')).briefs;
const MODEL = 'claude-sonnet-5-5', MAX_ATTEMPTS = 3;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const log = (m) => console.log(m);

function runCmd(cmd, a, opts) { return new Promise((res) => { let o = '', e = ''; const p = spawn(cmd, a, Object.assign({ stdio: ['ignore', 'pipe', 'pipe'] }, opts)); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); p.on('close', c => res({ code: c, out: o, err: e })); }); }

// edit_cli is deterministic (W-EDIT-CLI C2/C3), so an identical call is not re-run.
const cache = new Map(), linesCache = new Map(), INSTRUMENT = ['--own-grid', '--lattice-boxes'];
async function judge(building, edits) {
  const key = building + '|' + JSON.stringify(edits);
  if (cache.has(key)) return cache.get(key);
  const a = [CLI, '--building', building].concat(INSTRUMENT); edits.forEach(e => { if (e.shift != null) a.push('--shift', String(e.shift), '--move', String(e.move)); else a.push('--grid', String(e.grid), '--move', String(e.move)); });
  const r = await runCmd('node', a, { env: process.env });
  let j = null; try { j = JSON.parse(r.out); } catch (e) {}
  const res = { code: r.code, json: j };
  cache.set(key, res); return res;
}
async function modelOf(building) {
  if (linesCache.has(building)) return linesCache.get(building);
  const r = await runCmd('node', [CLI, '--building', building].concat(INSTRUMENT, ['--lines']), { env: process.env });
  const m = JSON.parse(r.out).model;
  if (!m.grid_source || m.grid_source === 'app-default') throw new Error(building + ': its grid is the app default, and a proposer must not be told that is the building\'s (§13.2)');
  linesCache.set(building, m); return m;
}

// ── scoring: fixed in the spec, §12 ─────────────────────────────────────
const RED_NEW = ['clash', 'abuts-clash', 'door-out', 'door-crush'];
function classify(edits, verdict, decline) {
  if (decline) return 'DECLINED';
  if (!edits.length) return 'INVALID';
  const out = verdict.json;
  if (!out || !Array.isArray(out.edits) || out.edits.length !== edits.length) return 'FAILED';
  if (out.edits.some(e => e.stopped_by_gate)) return 'STOPPED';   // §15.1 the stop undid an edit that added red
  if (out.edits.some(e => e.refused)) return 'REFUSED';
  const row = (r, id) => r.rows.filter(x => x.id === id)[0] || {};
  const red = out.edits.some(r => (row(r, 'span_red').state === 'JUDGED' && row(r, 'span_red').delta > 0) || r.newRows.some(n => RED_NEW.indexOf(n.id) >= 0 && n.count > 0));
  if (red) return 'RED';
  if (out.edits.some(r => r.change && r.change.kind === 'block-shift' && r.change.left && r.change.left.count > 0)) return 'LEFT_BEHIND';   // §14.1 a shift that left crossing elements behind is not clean
  if (out.edits.some(r => row(r, 'overlap').state !== 'JUDGED')) return 'PARTLY_JUDGED';
  return 'CLEAN';
}
function applyMoves(lines, edits) {
  const pos = {}, num = (id) => +id.slice(2); lines.forEach(l => { pos[l.id] = l.pos; });
  edits.forEach(e => {
    if (e.shift != null) { const at = lines.filter(l => l.id === e.shift)[0]; if (at) lines.forEach(l => { if (l.axis === at.axis && num(l.id) >= num(at.id)) pos[l.id] += e.move; }); }
    else if (pos[e.grid] != null) pos[e.grid] += e.move;
  });
  return pos;
}
function goalMet(brief, lines, edits) {
  const p0 = {}; lines.forEach(l => { p0[l.id] = l.pos; }); const p1 = applyMoves(lines, edits);
  return brief.goal.every(g => {
    if (g.type === 'pos') return Math.abs((p1[g.line] - p0[g.line]) - g.delta) <= g.tol;
    const w0 = Math.abs(p0[g.b] - p0[g.a]), w1 = Math.abs(p1[g.b] - p1[g.a]);
    if (g.type === 'keep') return Math.abs(w1 - w0) <= g.tol;
    if (g.target != null) return Math.abs(w1 - g.target) <= g.tol;
    return Math.abs((w1 - w0) - g.delta) <= g.tol;
  });
}
// Blind spot of the report, judged independently of it: did a line reach or pass its neighbour?
function crossed(lines, edits) {
  const p1 = applyMoves(lines, edits);
  for (const ax of ['x', 'y']) { const ls = lines.filter(l => l.axis === ax); for (let i = 1; i < ls.length; i++) if (p1[ls[i].id] - p1[ls[i - 1].id] < 0.05) return true; }
  return false;
}
function parseProposal(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}'); if (a < 0 || b < a) return null;
  let j; try { j = JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
  const edits = Array.isArray(j.edits) ? j.edits.filter(e => e && (typeof e.grid === 'string' || typeof e.shift === 'string') && typeof e.move === 'number' && isFinite(e.move)) : [];
  if (Array.isArray(j.edits) && edits.length !== j.edits.length) return null;
  return { edits, decline: j.decline === true, reason: String(j.reason || ''), expect_problems: j.expect_problems === true, forecast: String(j.problems_expected || '') };
}
const SYSTEM = 'You propose edits to a building model. You are given its grid lines and a request. Answer with JSON only, no other text.';
function prompt(brief, m, history) {
  const lines = m.lines.map(l => l.id + ' ' + l.axis + '=' + l.pos).join('\n');
  let t = 'Building: ' + brief.building + '\nStructural system: ' + (m.system === 'column-framed' ? 'column-framed, ' + m.girders + ' girders, mostly ' + m.material + (m.mixed ? ' (mixed)' : '') : 'wall-bearing') + '\nGrid lines, derived from the building\'s own ' + (m.grid_source === 'column-derived' ? 'columns' : 'walls') + ', positions in metres:\n' + lines + '\n\nRequest: ' + brief.text + '\n\n' +
    'There are two kinds of edit, each by a signed number of metres along the line\'s axis:\n' +
    '{"grid":"<line id>","move":<metres>} moves that one line. Walls and other elements attached to it follow, and the bays on both sides change.\n' +
    '{"shift":"<line id>","move":<metres>} moves that line and every later line on its axis together. Elements at or beyond it travel unchanged, elements crossing it stretch only inside that bay, and only the bay just before that line changes width.\n' +
    'A line may be moved more than once.\n' +
    'Reply with exactly this JSON:\n{"edits":[<edits>],"decline":false,"reason":"<why, if you decline or anything the requester should know>","expect_problems":<true or false>,"problems_expected":"<what you expect to go wrong, if anything>"}\n' +
    'If you should not make this change, set "decline":true and "edits":[].';
  history.forEach((h, i) => { t += '\n\nYour proposal ' + (i + 1) + ' was tried on the model and not kept:\n' + JSON.stringify(h.edits) + '\nThe compiler reported:\n' + JSON.stringify(h.feedback) + '\nRevise it, or decline. Reply with the same JSON.'; });
  return t;
}
let cost = 0, models = {};
// §14.6 hand-off: the prompt goes to a file, the answer comes back as a file. Whoever answers, nothing here calls a model.
const qName = (brief, rep, n) => brief.id + '_' + rep + '_' + n;
async function handoffAsk(dir, key, text, waitS) {
  const q = path.join(dir, 'q_' + key + '.txt'), a = path.join(dir, 'a_' + key + '.json');
  fs.writeFileSync(q, 'SYSTEM: ' + SYSTEM + '\n\n' + text + '\n');
  log('§PROPOSER_HANDOFF waiting q=' + q + ' answer=' + a);
  for (let i = 0; i < waitS * 2; i++) { if (fs.existsSync(a)) { await new Promise(r => setTimeout(r, 200)); return fs.readFileSync(a, 'utf8'); } await new Promise(r => setTimeout(r, 500)); }
  throw new Error('no answer at ' + a + ' within ' + waitS + ' s');
}
function stamp(mode, answeredBy) { return mode === 'handoff' ? { mode: 'handoff rehearsal', measurement: false, answered_by: answeredBy, model: null, note: 'answered outside an isolated model: never quote as a measurement (§14.6)' } : { mode: 'model', measurement: true, model: MODEL }; }
async function askModel(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prop_iso_'));
  const r = await runCmd('claude', ['-p', text, '--model', MODEL, '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--system-prompt', SYSTEM, '--no-session-persistence', '--output-format', 'json'], { cwd: dir, env: process.env });
  fs.rmSync(dir, { recursive: true, force: true });
  let j = null; try { j = JSON.parse(r.out); } catch (e) {}
  if (!j) return { text: '', error: r.err.slice(0, 200) };
  cost += j.total_cost_usd || 0; Object.keys(j.modelUsage || {}).forEach(k => { models[k] = 1; });
  return { text: j.result || '' };
}
function feedbackOf(verdict) { const o = verdict.json; if (!o) return { error: 'the call failed' }; return o.edits.map(e => e.stopped_by_gate ? { stopped: true, line: e.grid, reason: e.reason, change: e.report.change, rows: e.report.rows, new_from_this_edit: e.report.newRows, not_checked: e.report.notChecked } : e.refused ? { refused: true, line: e.grid, reason: e.reason } : { change: e.change, rows: e.rows, new_from_this_edit: e.newRows, not_checked: e.notChecked }); }

async function runBrief(brief, rep, propose, judgeWith) {
  const m = await modelOf(brief.building), attempts = [], history = [], jd = judgeWith || judge;
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    const raw = await propose(brief, m, history, n), p = parseProposal(raw);
    if (!p) { attempts.push({ n, raw, cls: 'INVALID', goal: false, crossed: false }); history.push({ edits: [], feedback: { error: 'not valid JSON in the requested shape' } }); continue; }
    const verdict = (p.decline || !p.edits.length) ? { json: null } : await jd(brief.building, p.edits);
    const cls = classify(p.edits, verdict, p.decline), a = { n, raw, edits: p.edits, decline: p.decline, reason: p.reason, expect_problems: p.expect_problems, forecast: p.forecast, cls, goal: p.decline ? false : goalMet(brief, m.lines, p.edits), crossed: p.decline ? false : crossed(m.lines, p.edits), code: verdict.code, ms: verdict.json && verdict.json.ms };
    attempts.push(a);
    log('§PROPOSER brief=' + brief.id + ' rep=' + rep + ' attempt=' + n + ' class=' + cls + ' goal=' + a.goal + ' crossed=' + a.crossed + ' expect_problems=' + a.expect_problems + ' edits=' + JSON.stringify(p.edits));
    if (cls === 'DECLINED' || cls === 'CLEAN' || cls === 'PARTLY_JUDGED') break;   // §13.3 a judged-fine result ends the run, so "not kept" is said only after a bad one
    history.push({ edits: p.edits, feedback: feedbackOf(verdict) });
  }
  return { brief: brief.id, rep, attempts };
}
function summarise(runs) {
  const bad = ['RED', 'STOPPED', 'LEFT_BEHIND', 'REFUSED', 'FAILED', 'INVALID'], s = { runs: runs.length, A: {}, B: {} };
  const tally = (a, key) => { s[key][a.cls] = (s[key][a.cls] || 0) + 1; };
  let usedShiftA = 0, usedShiftB = 0, falseAssurance = 0, forecastRight = 0, badFirst = 0, goalA = 0, goalB = 0, goodA = 0, goodB = 0, crossedHidden = 0, wrongGoalHidden = 0;
  runs.forEach(r => {
    const b = BRIEFS.filter(x => x.id === r.brief)[0], first = r.attempts[0], last = r.attempts[r.attempts.length - 1];
    tally(first, 'A'); tally(last, 'B');
    const hasShift = (a) => (a.edits || []).some(e => e.shift != null); if (hasShift(first)) usedShiftA++; if (hasShift(last)) usedShiftB++;
    const isBad = bad.indexOf(first.cls) >= 0;
    if (isBad) { badFirst++; if (first.expect_problems === false) falseAssurance++; else forecastRight++; }
    if (first.goal) goalA++; if (last.goal) goalB++;
    const ok = (a) => (a.cls === 'CLEAN' || a.cls === 'PARTLY_JUDGED') && a.goal && !a.crossed || (a.cls === 'DECLINED' && b.impossible);
    if (ok(first)) goodA++; if (ok(last)) goodB++;
    if ((last.cls === 'CLEAN' || last.cls === 'PARTLY_JUDGED') && last.crossed) crossedHidden++;
    if ((last.cls === 'CLEAN' || last.cls === 'PARTLY_JUDGED') && !last.goal) wrongGoalHidden++;
  });
  Object.assign(s, { used_a_shift_A: usedShiftA, used_a_shift_B: usedShiftB, bad_first_proposals: badFirst, of_those_forecast_no_problem: falseAssurance, of_those_forecast_a_problem: forecastRight, goal_met_A: goalA, goal_met_B: goalB, right_outcome_A: goodA, right_outcome_B: goodB, passed_report_but_lines_crossed: crossedHidden, passed_report_but_goal_missed: wrongGoalHidden });
  return s;
}

(async () => {
  if (process.argv.indexOf('--stub') >= 0) {
    // The scorer against outcomes already measured elsewhere. No model call.
    let fail = 0; const chk = (n, c, d) => { if (!c) fail++; log((c ? '  ✅ ' : '  ❌ ') + n + (d ? '  ' + d : '')); };
    const by = (id) => BRIEFS.filter(b => b.id === id)[0];
    const script = {
      G5: [{ edits: [{ grid: 'gy12', move: 0.6 }], expect_problems: false }, { edits: [], decline: true, reason: 'engine refused' }],
      S2: [{ edits: [{ grid: 'nope', move: 1 }], expect_problems: false }, 'not json', { edits: [{ grid: 'nope', move: 2 }] }],
      G1: [{ edits: [{ grid: 'gy9', move: 1.51 }], expect_problems: true }, { edits: [{ shift: 'gy9', move: 1.51 }] }, { edits: [], decline: true, reason: 'must not be reached: the shift is CLEAN' }]
    };
    const stub = (b, m, h, n) => { const v = script[b.id][n] != null ? script[b.id][n] : { edits: [], decline: true, reason: 'stub has no further proposal' }; return Promise.resolve(typeof v === 'string' ? v : JSON.stringify(v)); };
    const g5 = await runBrief(by('G5'), 0, stub), s2 = await runBrief(by('S2'), 0, stub), g1 = await runBrief(by('G1'), 0, stub);
    log('§PROPOSER_STUB_G1 ' + JSON.stringify(g1.attempts.map(a => [a.cls, a.goal])));
    chk('S1a engine refusal scores REFUSED, then a decline stops the run', g5.attempts[0].cls === 'REFUSED' && g5.attempts[1].cls === 'DECLINED' && g5.attempts.length === 2);
    chk('S1b §15.1 the single-line move into a wall is stopped: gy9 +1.51 scores STOPPED', g1.attempts[0].cls === 'STOPPED');
    chk('S1c an unknown line scores REFUSED, and bad JSON scores INVALID', s2.attempts[0].cls === 'REFUSED' && s2.attempts[1].cls === 'INVALID');
    chk('S1d attempts stop at the limit', s2.attempts.length === MAX_ATTEMPTS);
    chk('S1e the same goal as one shift scores CLEAN, meets the goal, and ends the run', g1.attempts[1].cls === 'CLEAN' && g1.attempts[1].goal === true && g1.attempts.length === 2);
    const fakeP = { json: { edits: [{ rows: [{ id: 'overlap', state: 'NOT_JUDGED' }, { id: 'span_red', state: 'JUDGED', delta: 0 }], newRows: [] }] } };
    const prompts = [], pj = await runBrief(by('S3'), 0, (b, m, h) => { prompts.push(prompt(b, m, h)); return Promise.resolve(JSON.stringify({ edits: [{ grid: 'gy1', move: 1.355 }] })); }, async () => fakeP);
    chk('S1f §13.3 PARTLY_JUDGED ends the run, and "not kept" was never said', pj.attempts.length === 1 && pj.attempts[0].cls === 'PARTLY_JUDGED' && !/not kept/.test(prompts.join('')));
    const mG = await modelOf('HospitalGarage');
    chk('S2a the goal check can fail: gy9 +1.0 misses 7.0', goalMet(by('G1'), mG.lines, [{ grid: 'gy9', move: 1 }]) === false);
    chk('S2b the unit trap: gx8 +1.5 meets it, gx8 +1500 does not', goalMet(by('G3'), mG.lines, [{ grid: 'gx8', move: 1.5 }]) === true && goalMet(by('G3'), mG.lines, [{ grid: 'gx8', move: 1500 }]) === false);
    chk('S2c the neighbour trap: gy5 +2 alone breaks it, gy5 and gy6 +2 meets it', goalMet(by('G6'), mG.lines, [{ grid: 'gy5', move: 2 }]) === false && goalMet(by('G6'), mG.lines, [{ grid: 'gy5', move: 2 }, { grid: 'gy6', move: 2 }]) === true);
    chk('S2d crossing, judged here: gy20 +3 passes gy21, +1 does not', crossed(mG.lines, [{ grid: 'gy20', move: 3 }]) === true && crossed(mG.lines, [{ grid: 'gy20', move: 1 }]) === false);
    chk('S2e the proposer sees the system and the lines', /column-framed/.test(prompt(by('G1'), mG, [])) && /gy8 y=92\.436/.test(prompt(by('G1'), mG, []))   /* §17: the building-frame position (world 86.616) */, mG.system + ' ' + mG.material + ' lines=' + mG.lines.length);
    const mS = await modelOf('SampleHouse');
    chk('S4a §13.2 the wall-bearing building is on its own lines, and the prompt says where they came from', mS.grid_source === 'derived:arc-semigrid' && /derived from the building's own walls/.test(prompt(by('S1'), mS, [])) && /derived from the building's own columns/.test(prompt(by('G1'), mG, [])), mS.lines.map(l => l.id + '=' + l.pos).join(' '));
    chk('S4b every brief names lines that exist', BRIEFS.every(b => b.goal.every(g => [g.a, g.b, g.line].filter(Boolean).every(id => (b.building === 'SampleHouse' ? mS : mG).lines.some(l => l.id === id)))));
    chk('S4c §13.1 the shift arithmetic: gy5 shifted +2 keeps both neighbours, G1 by shifting gy9', goalMet(by('G6'), mG.lines, [{ shift: 'gy5', move: 2 }]) === true && goalMet(by('G1'), mG.lines, [{ shift: 'gy9', move: 1.51 }]) === true);
    chk('S4d a shift cannot cross where a single move does: gy20 +3', crossed(mG.lines, [{ shift: 'gy20', move: 3 }]) === false && crossed(mG.lines, [{ grid: 'gy20', move: 3 }]) === true);
    chk('S4e the proposer is told both kinds of edit', /"shift":"<line id>"/.test(prompt(by('G1'), mG, [])) && /"grid":"<line id>"/.test(prompt(by('G1'), mG, [])));
    chk('S4f a shift proposal parses, and a shapeless one does not', parseProposal('{"edits":[{"shift":"gy9","move":1}]}').edits.length === 1 && parseProposal('{"edits":[{"move":1}]}') === null);
    chk('S2f the proposer is not told the rule limit', !/\b12 ?m\b|span limit|maxBeamSpan/i.test(prompt(by('G4'), mG, [])));
    const sum = summarise([g5, s2, g1]);
    log('§PROPOSER_STUB_SUMMARY ' + JSON.stringify(sum));
    chk('S3a the summary separates a bad proposal forecast as fine from one forecast as a problem', sum.bad_first_proposals === 3 && sum.of_those_forecast_no_problem === 2 && sum.of_those_forecast_a_problem === 1);
    const rep = (ov, sr, news) => ({ rows: [{ id: 'overlap', state: ov }, { id: 'span_red', state: 'JUDGED', delta: sr }], newRows: news || [] });
    const E1 = [{ grid: 'a', move: 1 }];
    chk('S3b nothing red, all judged: CLEAN', classify(E1, { json: { edits: [rep('JUDGED', 0)] } }, false) === 'CLEAN');
    chk('S3c nothing red, scene not judged: PARTLY_JUDGED, never CLEAN', classify(E1, { json: { edits: [rep('NOT_JUDGED', 0)] } }, false) === 'PARTLY_JUDGED');
    chk('S3d a span over limit, or a new RED row, beats both', classify(E1, { json: { edits: [rep('NOT_JUDGED', 1)] } }, false) === 'RED' && classify(E1, { json: { edits: [rep('JUDGED', 0, [{ id: 'abuts-clash', count: 1 }])] } }, false) === 'RED');
    chk('S3f §14.1 a shift that left crossing elements behind is LEFT_BEHIND, never CLEAN, and RED still beats it', classify(E1, { json: { edits: [Object.assign(rep('JUDGED', 0), { change: { kind: 'block-shift', left: { count: 3 } } })] } }, false) === 'LEFT_BEHIND' && classify(E1, { json: { edits: [Object.assign(rep('JUDGED', 1), { change: { kind: 'block-shift', left: { count: 3 } } })] } }, false) === 'RED');
    // ---- §14.6 hand-off and the gate ----
    const hd = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff_stub_'));
    const answerer = setInterval(() => { fs.readdirSync(hd).filter(f => /^q_.*\.txt$/.test(f)).forEach(f => { const a = path.join(hd, f.replace(/^q_/, 'a_').replace(/\.txt$/, '.json')); if (!fs.existsSync(a)) fs.writeFileSync(a, JSON.stringify({ edits: [{ shift: 'gy9', move: 1.51 }], decline: false, reason: 'stub answerer', expect_problems: false, problems_expected: '' })); }); }, 300);
    const hb = await runBrief(by('G1'), 0, (b, m, h, n) => handoffAsk(hd, qName(b, 0, n), prompt(b, m, h), 60));
    clearInterval(answerer);
    const qText = fs.readFileSync(path.join(hd, 'q_G1_0_0.txt'), 'utf8'); fs.rmSync(hd, { recursive: true, force: true });
    chk('H1 a hand-off answer is scored like any other: the G1 shift is CLEAN and ends the run', hb.attempts.length === 1 && hb.attempts[0].cls === 'CLEAN' && hb.attempts[0].goal === true);
    chk('H1b the question file is the exact prompt a model would get', qText.indexOf(SYSTEM) >= 0 && qText.indexOf(prompt(by('G1'), mG, [])) >= 0);
    const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'fakeclaude_')), mark = path.join(fakeBin, 'CALLED');
    fs.writeFileSync(path.join(fakeBin, 'claude'), '#!/bin/sh\ntouch ' + mark + '\n'); fs.chmodSync(path.join(fakeBin, 'claude'), 0o755);
    const gated = await runCmd('node', [__filename, '--reps', '1', '--out', path.join(fakeBin, 'x.json')], { env: Object.assign({}, process.env, { PATH: fakeBin + ':' + process.env.PATH }) });
    chk('H2 without --model-calls: refused, it names the hand-off, and no claude process ran', gated.code === 2 && /--handoff/.test(gated.out + gated.err) && !fs.existsSync(mark), 'exit=' + gated.code);
    fs.rmSync(fakeBin, { recursive: true, force: true });
    const st = stamp('handoff', 'this session');
    chk('H3 a hand-off results file says it is a rehearsal, not a measurement, and who answered', st.measurement === false && st.mode === 'handoff rehearsal' && st.answered_by === 'this session' && st.model === null);
    chk('S3g a stopped edit is STOPPED, not REFUSED and not RED', classify(E1, { json: { edits: [{ refused: true, stopped_by_gate: true, reason: 'stopped: x', report: rep('JUDGED', 1) }] } }, false) === 'STOPPED');
    chk('S3e a new clearance is not RED, and a span count that falls is not RED', classify(E1, { json: { edits: [rep('JUDGED', -2, [{ id: 'clearance', count: 3 }])] } }, false) === 'CLEAN');
    log('§PROPOSER_STUB fail=' + fail + ' verdict=' + (fail ? 'FAIL' : 'PASS')); process.exit(fail ? 1 : 0);
  }
  const hdir = arg('--handoff', null), who = arg('--answered-by', null), modelCalls = process.argv.indexOf('--model-calls') >= 0;
  if (!hdir && !modelCalls) { log('§PROPOSER refused: no --model-calls, so no model is called (owner directive 2026-11-08, §14.6). For a free rehearsal: --handoff <dir> --answered-by "<who>"'); process.exit(2); }
  if (hdir && modelCalls) { log('§PROPOSER refused: --handoff and --model-calls together'); process.exit(2); }
  if (hdir && !who) { log('§PROPOSER refused: --handoff needs --answered-by "<who>", so the results say who answered'); process.exit(2); }
  const only = arg('--briefs', null), list = only ? BRIEFS.filter(b => only.split(',').indexOf(b.id) >= 0) : BRIEFS;
  const reps = +arg('--reps', 3), outFile = arg('--out', path.join(os.tmpdir(), 'proposer_results.json')), runs = [], S0 = stamp(hdir ? 'handoff' : 'model', who);
  if (hdir) fs.mkdirSync(hdir, { recursive: true });
  const propose = hdir ? ((brief, m, history, n) => handoffAsk(hdir, qName(brief, curRep, n), prompt(brief, m, history), +arg('--wait-s', 3600)))
                       : (async (brief, m, history) => { const r = await askModel(prompt(brief, m, history)); return r.text; });
  let curRep = 0;
  for (let rep = 0; rep < reps; rep++) for (const b of list) {
    curRep = rep; runs.push(await runBrief(b, rep, propose));
    fs.writeFileSync(outFile, JSON.stringify(Object.assign({}, S0, { modelsSeen: Object.keys(models), cost_usd: hdir ? 0 : +cost.toFixed(4), reps, briefs: list.map(b => b.id), runs, summary: summarise(runs) }), null, 1) + '\n');
  }
  const summary = summarise(runs);
  log('§PROPOSER_SUMMARY ' + JSON.stringify(summary)); log('§PROPOSER_MODE ' + JSON.stringify(S0)); log('§PROPOSER_COST usd=' + cost.toFixed(4) + ' models=' + Object.keys(models).join(',') + ' cliCalls=' + cache.size);
  process.exit(0);
})().catch(e => { log('§PROPOSER verdict=INCONCLUSIVE reason=' + (e && e.stack || e)); process.exit(1); });
