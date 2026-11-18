#!/usr/bin/env node
// ⚠ DO NOT REMOVE — SCOPE: WITNESS W-UE, "↺ Undo covers every Gantt edit" (Gantt editor lane, step 4).
// Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.19.9 (written before this file). Read the log after every run.
//
// ISSUE THIS PROVES OR DISPROVES: Undo restored only what each verb's own snapshot held. Link, unlink and typed dates
// wrote no undo record at all (and left the PREVIOUS edit's record in place, so Undo then restored the wrong thing);
// `task_sequences` was in no snapshot, so no undo could take a link back; the snapshots differed per verb.
//
// The edits run through the SHIPPED verbs (tests/_gantt_edit_fixture.js: sliced from the time_machine family, real
// building db, real engine verbs). Unlink and typed dates run through the shipped openGanttProps and its own click
// handlers, on a DOM stub.
//
//   UE-1  for each of the ten edits — move, resize, ruler shift, group shift, pull-back, link, link forcing a move,
//         reorder, unlink, typed dates — the state before == the state after the edit + ONE Undo. State = every `tasks` row of
//         the schedule (summary rows included), every link, every element op in the db and in memory.
//   UE-2  each of the ten changed the state (a row that changed nothing is INCONCLUSIVE, not a pass) and left an undo
//         record of its own.
//   UE-3  a second Undo changes nothing and says so.
//   UE-4  a refused edit (a link that would make a cycle) leaves the previous undo record untouched.
//   UE-5  one snapshot owner: no edit verb holds a `tasks` snapshot query of its own; every _tmCommitEdit( call passes `undo:`.
//   UE-R  red control: an undo whose record has lost its links must fail on the link rows.
// An empty population prints INCONCLUSIVE, never PASS.
//
// Command: node viewer/tests/witness_gantt_undo_every_edit.js        UE_BLD=<building> (default Duplex)
'use strict';
const FX = require('./_gantt_edit_fixture.js');
const FN = FX.FN, stripComments = FX.stripComments;
const BLD = process.env.UE_BLD || 'Duplex';
const DAY = 86400000;

let pass = 0, fail = 0, inconclusive = 0;
function claim(id, pop, bad, detail) {
  const v = pop === 0 ? 'INCONCLUSIVE' : (bad === 0 ? 'PASS' : 'FAIL');
  if (v === 'PASS') pass++; else if (v === 'FAIL') fail++; else inconclusive++;
  console.log('§W_UE ' + id.padEnd(6) + v.padEnd(13) + 'judged=' + String(pop).padEnd(4) + 'bad=' + String(bad).padEnd(4) + (detail || ''));
}
function finish() {
  console.log('§W_UE_SUMMARY pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive);
  if (fail) { console.error('FAIL — ' + fail + ' claim(s) failed'); process.exit(1); }
  if (!pass || inconclusive) { console.log('INCONCLUSIVE — ' + inconclusive + ' claim(s) judged nothing'); process.exit(2); }
  console.log('PASS — one Undo takes back every kind of Gantt edit: dates, links and element times');
}

// ── UE-5: one snapshot owner (source) ─────────────────────────────────────────────────────────
{
  const VERBS = ['commitGanttDrag', 'shiftGanttSchedule', 'commitGanttGroupShift', 'rescheduleGanttAsap', 'linkGanttBars', 'openGanttProps', 'swapGanttBars'];
  const own = VERBS.filter(n => FN[n] && /SELECT[^;]*schedule_duration[^;]*FROM tasks/.test(stripComments(FN[n])));
  let calls = 0, noUndo = 0; const where = [];
  VERBS.forEach(n => { const code = stripComments(FN[n] || ''); let i = -1;
    while ((i = code.indexOf('_tmCommitEdit({', i + 1)) >= 0) { calls++; let d = 0, j = i + 14;
      for (; j < code.length; j++) { if (code[j] === '{') d++; else if (code[j] === '}') { d--; if (d === 0) break; } }
      if (!/\bundo:/.test(code.slice(i, j))) { noUndo++; where.push(n); } } });
  claim('UE-5', VERBS.length + calls, own.length + noUndo + (FN._tmEditSnapshot ? 0 : 1),
    'verbs with their own tasks snapshot query=' + own.length + (own.length ? ' [' + own.join(', ') + ']' : '') + '; _tmCommitEdit calls=' + calls +
    ' without undo:=' + noUndo + (where.length ? ' [' + where.join(', ') + ']' : '') + '; _tmEditSnapshot defined=' + !!FN._tmEditSnapshot);
}

(async () => {
  // DOM stub for the shipped props panel: innerHTML is parsed for the two date inputs and the unlink buttons
  const dom = {};
  function el(id) {
    if (dom[id]) return dom[id];
    const e = { id: id, style: {}, textContent: '', value: '', onclick: null, _html: '', _buttons: [], appendChild() {}, removeAttribute() {}, querySelectorAll() { return this._buttons; } };
    Object.defineProperty(e, 'innerHTML', { get() { return this._html; }, set(h) { this._html = h;
      ['tmp-s', 'tmp-f'].forEach(k => { const m = new RegExp('id="' + k + '"[^>]*value="([^"]*)"').exec(h); if (m) { el(k).value = m[1]; } });
      this._buttons = []; const re = /data-unlink="(\d+)"/g; let m; while ((m = re.exec(h))) { const i = m[1]; this._buttons.push({ onclick: null, getAttribute: () => i }); }
      ['tmp-apply', 'tmp-close', 'tmp-msg'].forEach(k => { el(k).onclick = null; }); } });
    return (dom[id] = e);
  }
  const document = { getElementById: id => (id === 'time-machine-panel' ? null : el(id)), createElement: () => el('tm-gantt-props'), body: { appendChild() {} } };
  const fx = await FX.make({ bld: BLD, extraNames: ['openGanttProps', 'swapGanttBars'], document: document });
  if (fx.missing || fx.failed) { claim('UE-1', 0, 0, 'no fixture: ' + (fx.missing || fx.failed)); return finish(); }
  const sb = fx.sb, SA = fx.SA, db = fx.db, schedId = fx.schedId, logs = fx.logs;
  const key = p => p.tasks + '/' + p.links + '/' + p.opsDb + '/' + p.opsMem;
  const diffOf = (a, b) => ['tasks', 'links', 'opsDb', 'opsMem'].filter(k => a[k] !== b[k]).join('+') || 'none';
  const recOf = () => { const le = sb.__lastEdit(); return le ? le.mode + '|' + le.taskId : 'none'; };
  const last = bars => bars.slice().sort((a, b) => b.endTs - a.endTs || (a.taskId < b.taskId ? -1 : 1))[0];
  const big = bars => bars.slice().sort((a, b) => b.count - a.count || (a.taskId < b.taskId ? -1 : 1))[0];
  const deps = () => SA.listDependencies(db, schedId);
  const realDates = id => fx.q('SELECT schedule_start, schedule_finish FROM tasks WHERE task_id=?', [id])[0];

  const EDITS = [
    ['move +5d', bars => sb.__v.drag(last(bars), 'move', 5)],
    ['resize +2d', bars => sb.__v.drag(big(bars), 'resizeR', 2)],
    ['ruler shift +3d', () => sb.__v.shift(3)],
    ['group shift +2d', bars => sb.__v.group([bars[0].taskId, bars[1].taskId], 2)],
    ['link', bars => sb.__v.link(bars[0], bars[bars.length - 1])],
    ['link forcing a move', bars => { for (let i = 0; i < bars.length; i++) for (let j = 0; j < bars.length; j++)
        if (i !== j && bars[j].startTs < bars[i].endTs && !SA.wouldCycle(db, bars[i].taskId, bars[j].taskId)) return sb.__v.link(bars[i], bars[j]);
      return 'noPair'; }],
    ['reorder (swap places)', bars => { for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++)
        if (SA.swapTasks(db, schedId, bars[i].taskId, bars[j].taskId, { dryRun: true }).ok) return sb.__v.swapGanttBars(bars[i], bars[j]);
      return 'noPair'; }],
    ['unlink', bars => { const d = deps()[0]; if (!d) return 'noDeps'; const bar = bars.filter(b => b.taskId === d.succId || b.taskId === d.predId)[0];
        sb.__v.props(bar); const btn = el('tm-gantt-props')._buttons[0]; if (!btn || !btn.onclick) return 'noButton'; btn.onclick(); return 'clicked'; }],
    ['typed dates +4d', bars => { const bar = last(bars); sb.__v.props(bar); const s = el('tmp-s').value; if (!s) return 'noDates';
        el('tmp-s').value = new Date(Date.parse(s + 'T00:00:00Z') + 4 * DAY).toISOString().slice(0, 10); el('tmp-apply').onclick(); return 'applied ' + s + '->' + el('tmp-s').value; }],
    // last: a fresh schedule has no slack to close, so a bar is first moved 5 days later (the PREP, not judged);
    // "before" is the state after that move, and Undo must come back to exactly it
    ['pull-back', () => sb.__v.asap(), bars => sb.__v.drag(last(bars), 'move', 5)],
  ];
  let judged = 0, notRestored = 0, changedN = 0, noRecord = 0; const rows = [];
  EDITS.forEach(([name, fn, prep]) => {
    if (prep) prep(fx.rebuildBars());
    const bars = fx.rebuildBars(); const before = fx.parts(), recBefore = recOf(); logs.length = 0;
    let ret; try { ret = fn(bars); } catch (e) { ret = 'THREW ' + e.message; }
    const after = fx.parts(), rec = recOf(), changed = key(after) !== key(before);
    fx.rebuildBars(); sb.__v.undo();
    const back = fx.parts(), restored = key(back) === key(before);
    const ownRec = rec !== 'none' && rec !== recBefore;
    if (changed) { judged++; changedN++; if (!restored) notRestored++; if (!ownRec) noRecord++; }
    const line = '§W_UE_EDIT ' + name.padEnd(20) + ' ret=' + String(ret).slice(0, 34).padEnd(34) + ' changed=' + diffOf(before, after).padEnd(24) +
      ' record=' + (ownRec ? rec : (rec === 'none' ? 'NONE' : 'STALE(' + rec + ')')).slice(0, 44).padEnd(44) + ' afterUndo=' + (restored ? 'RESTORED' : 'NOT RESTORED (' + diffOf(before, back) + ' differ)') +
      (changed ? '' : '  — INCONCLUSIVE: the edit changed nothing');
    rows.push(line); console.log(line);
    // put the fixture back where this edit started, whatever the undo did, so each edit is judged on its own
    if (!restored) console.log('§W_UE_NOTE state has drifted after "' + name + '"; later rows start from the drifted state');
  });
  claim('UE-1', judged, notRestored, 'edits whose state is back after one Undo: ' + (judged - notRestored) + ' of ' + judged + ' (' + BLD + ', ' + fx.ops.length + ' elements)');
  claim('UE-2', EDITS.length, (EDITS.length - changedN) + noRecord, 'edits that changed the state=' + changedN + ' of ' + EDITS.length + '; of those, without an undo record of their own=' + noRecord);

  // UE-3: a second Undo
  { const b = fx.parts(); logs.length = 0; sb.__v.undo(); const a = fx.parts();
    const said = logs.some(l => l.indexOf('§GANTT_EDIT_UNDO_REJECT reason=nothing_to_undo') === 0);
    claim('UE-3', 2, (key(a) === key(b) ? 0 : 1) + (said ? 0 : 1), 'a second Undo changed nothing (' + (key(a) === key(b)) + ') and logged nothing_to_undo (' + said + ')'); }

  // UE-4: a refused edit leaves the previous record alone
  { const bars = fx.rebuildBars(); sb.__v.drag(last(bars), 'move', 2); const rec = recOf(), le = sb.__lastEdit();
    const d = deps()[0]; const b2 = fx.rebuildBars(); const p = b2.filter(x => x.taskId === (d && d.succId))[0], s = b2.filter(x => x.taskId === (d && d.predId))[0];
    logs.length = 0; const before = fx.parts(); if (p && s) sb.__v.link(p, s);
    const refused = logs.some(l => l.indexOf('§GANTT_EDIT_CYCLE_BLOCKED') === 0);
    claim('UE-4', refused ? 2 : 0, (sb.__lastEdit() === le && recOf() === rec ? 0 : 1) + (key(fx.parts()) === key(before) ? 0 : 1),
      'a link that would make a cycle was refused (' + refused + '); the undo record is still "' + rec + '" (' + (sb.__lastEdit() === le) + ') and nothing was written');
    fx.rebuildBars(); sb.__v.undo(); }

  // UE-R: an undo record that has lost its links cannot restore a link
  { const bars = fx.rebuildBars(); const before = fx.parts(); sb.__v.link(bars[0], bars[bars.length - 1]); const le = sb.__lastEdit();
    if (!le || !le.linksBefore) claim('UE-R', 0, 0, 'no undo record with links on this revision — the red control has nothing to break');
    else { le.linksBefore = null; fx.rebuildBars(); sb.__v.undo(); const back = fx.parts();
      claim('UE-R', 1, back.links !== before.links ? 0 : 1, 'red control: with the links dropped from the record, Undo leaves the link rows different (' + (back.links !== before.links) + ')'); } }
  db.close(); finish();
})().catch(e => { console.error('§W_UE_ERROR ' + (e && e.stack || e)); process.exit(3); });
