#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOTTED (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.13 item 3). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE it proves or disproves: the dotted form (a front end for people) is a second grammar or a second way to be wrong: it gives another answer than its door line, reaches the door raw,
 *   leaves a dotted string in the journal, or guesses at a name.
 * The four examples of §0.10.4 on real public fixtures (Duplex): rooms, the walker's count, a clash pair (headless Viewer on the CPU; DOTTED_SKIP_VIEWER=1 leaves it out and says so), the 4D state at a day.
 * Falsifier (must make this witness FAIL): DOTTED_BREAK=line (the front end compiles another building than the one typed).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { kit, run, stripMs, ROOT, DOOR } = require('./_kit');
const k = kit('W-DOTTED');
const DOTTED = path.join(ROOT, 'common', 'door', 'dotted.js');
const EX = [
  { id: 'rooms', chain: 'viewer(Duplex).Room.count', line: 'object.count building=Duplex kind=Room', field: 'count' },
  { id: 'rooms-on-a-storey', chain: 'viewer(Duplex).Room[storey="Level 1"].count', line: 'object.count building=Duplex kind=Room storey="Level 1"', field: 'count' },
  { id: 'walk', chain: 'modeller(Duplex).walk(FP).count', line: 'modeller.walk building=Duplex discipline=FP', field: 'count', mask: true },
  { id: '4D-at-a-day', chain: 'viewer(Duplex).schedule_at(day=5).counts.placed', line: 'viewer.schedule_at building=Duplex day=5', field: 'counts.placed' },
  { id: 'clash-pair', chain: 'viewer(Duplex).clashes(ARC, MEP).value.bboxOverlaps', line: 'viewer.clashes building=Duplex discA=ARC discB=MEP', field: 'value.bboxOverlaps', viewer: true, mask: true }
];
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotted_')), J = path.join(dir, 'journal.jsonl'); let seq = 0;
  const last = (r) => { try { return JSON.parse(r.out.split('\n').pop()); } catch (e) { return null; } };
  const norm = (env, mask) => { const o = JSON.parse(stripMs(env)); delete o.request; let s = JSON.stringify(o); if (mask) s = s.replace(/heapDeltaMB=-?[\d.]+/g, 'heapDeltaMB=*').replace(/\b\d+(\.\d+)?\s?ms\b/g, '*ms').replace(/\b(ms|msPerPair|time)=[\d.]+/g, '$1=*'); return s; };   // two runs of one engine differ in the timing and heap figures of the engine's OWN log lines; those are not the answer
  const get = (o, f) => f.split('.').reduce((n, key) => (n == null ? undefined : n[key]), o);
  let judged = 0;
  for (const e of EX) {
    if (e.viewer && process.env.DOTTED_SKIP_VIEWER) { k.incon('EX-' + e.id, 'left out by DOTTED_SKIP_VIEWER (needs a headless Viewer)'); continue; }
    const d = await run(DOTTED, ['--journal', J, '--request', 'dt-' + (++seq), e.chain]), dj = last(d);
    const r = await run(DOOR, ['--journal', J, '--request', 'dl-' + seq, e.line]), rj = last(r);
    if (!dj || !rj) { k.chk('EX ' + e.id + ': both forms answered with JSON', false, (d.err || '').slice(-200) + ' | ' + (r.err || '').slice(-200)); continue; }
    if (e.viewer && (rj.status !== 'ok' || (dj.envelope && dj.envelope.status !== 'ok'))) { k.incon('EX-' + e.id, 'the Viewer could not answer here: ' + String(rj.why).slice(0, 140)); continue; }
    judged++;
    k.chk('EX ' + e.id + ': `' + e.chain + '` compiles to exactly `' + e.line + '` and prints it', dj.lines && dj.lines.length === 1 && dj.lines[0] === e.line && /§DOTTED line=/.test(d.err), JSON.stringify(dj.lines));
    k.chk('EX ' + e.id + ': the dotted envelope = the door line\'s envelope byte for byte apart from request and ms', dj.envelope && rj.status === 'ok' && norm(dj.envelope, e.mask) === norm(rj, e.mask), 'status=' + rj.status + (e.mask ? ' (timing and heap figures in the engine\'s own log lines masked)' : ''));
    const want = get(rj.answer, e.field);
    k.chk('EX ' + e.id + ': the value shown is the field ' + e.field + ' of that envelope', dj.field === e.field && want !== undefined && dj.value === want, 'value=' + JSON.stringify(dj.value) + ' envelope=' + JSON.stringify(want));
    k.L('EX ' + e.id + ' ' + e.chain + ' -> ' + e.line + ' -> ' + e.field + '=' + JSON.stringify(dj.value));
  }
  if (!judged) k.incon('EX', 'no example was judged');
  // ── the door refuses a dotted string, and runs nothing ──
  const raw = await run(DOOR, ['--journal', J, '--request', 'raw-1', 'viewer(Duplex).Room.count']), rawj = last(raw);
  k.chk('DOOR a dotted string sent raw to the door is refused as not a command; nothing ran', rawj && rawj.status === 'refused' && /not a command/.test(rawj.why) && rawj.answer && !('count' in rawj.answer), rawj && rawj.status + ' ' + rawj.why);
  // ── the journal holds door lines only ──
  const lines = fs.readFileSync(J, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(x => x.state === 'started');
  const dottedIn = lines.filter(x => /^dt-/.test(x.request)), withParen = dottedIn.filter(x => /[()\[\]]/.test(x.line));
  k.chk('JOURNAL every request the dotted tool made is recorded as its door line (no chain text)', dottedIn.length >= judged && judged > 0 && withParen.length === 0 && dottedIn.every(x => EX.some(e => e.line === x.line)), 'recorded=' + dottedIn.length + ' withParen=' + withParen.length);
  // ── wrong names are errors that name them (from the vocabulary; a kind and a column by the engine through the door) ──
  const bad = async (chain, re, what) => { const r = await run(DOTTED, ['--journal', J, chain]), j = last(r), msg = j && (j.error || (j.envelope && j.envelope.why)); k.chk('NAMES ' + what + ' is an error naming it', !!msg && re.test(msg) && r.code !== 0, String(msg).slice(0, 170)); };
  await bad('revit(Duplex).Room.count', /unknown app "revit".*viewer/, 'an unknown app');
  await bad('viewer(Duplex).Rum.count', /unknown kind "Rum".*Room/, 'an unknown kind (by the engine)');
  await bad('viewer(Duplex).Room[floor=1].count', /no property "floor".*storey/, 'an unknown column (by the engine)');
  await bad('viewer(Duplex).Room.sum', /unknown measure "sum".*count/, 'an unknown measure');
  await bad('modeller(Duplex).fly(FP).count', /unknown method "fly".*walk/, 'an unknown method');
  await bad('modeller(Duplex).walk(FP).nope', /unknown field "nope".*count/, 'an unknown field');
  await bad('modeller(Duplex).walk(colour=FP).count', /unknown argument "colour".*discipline/, 'an unknown argument');
  await bad('viewer(Duplex).Room.count.count', /unexpected|one verb call/, 'a second step after the measure');
  await bad('viewer(Duplex).schedule_at(day={2+3}).counts.placed', /no expression/, 'an expression inside a chain');
  const before = fs.readFileSync(J, 'utf8').split('\n').filter(Boolean).length;
  const un = await run(DOTTED, ['--journal', J, 'viewer(Duplex).Room.sum']);
  k.chk('NAMES a chain that does not compile reaches no door (the journal does not grow)', fs.readFileSync(J, 'utf8').split('\n').filter(Boolean).length === before && un.code === 2, 'exit=' + un.code);
  // ── people only ──
  const ai = await run(DOTTED, ['--journal', J, '--actor', 'ai', 'viewer(Duplex).Room.count']), aij = last(ai);
  k.chk('ACTOR --actor ai is refused: the dotted form is not offered to an AI; nothing ran', aij && aij.refused === true && ai.code === 3 && fs.readFileSync(J, 'utf8').split('\n').filter(Boolean).length === before, aij && aij.reason);
  const mcp = fs.readFileSync(path.join(ROOT, 'modeller', 'tools', 'bim_mcp.js'), 'utf8'), vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'common', 'door', 'verbs.json'), 'utf8'));
  k.chk('ACTOR the AI connector does not know the dotted tool, and no verb in the vocabulary is the dotted form', !/dotted/.test(mcp) && !vocab.verbs.some(v => /dotted/.test(JSON.stringify(v.calls || {}))), '');
  // ── a harm class is still the vocabulary's: a dotted write by the tool runs as the person, and the verb's own class is unchanged ──
  const src = fs.readFileSync(DOTTED, 'utf8');
  k.chk('ONE-DOOR the tool calls only door.runLine (no CLI, no SQL, no eval, no child process of its own)', /door\.runLine\(c\.line/.test(src) && !/child_process|eval\(|new Function|spawn\(/.test(src), '');
  k.L('examples judged=' + judged + ' of ' + EX.length + (process.env.DOTTED_BREAK ? ' DOTTED_BREAK=' + process.env.DOTTED_BREAK : ''));
  k.end();
})().catch(e => { console.error('§W-DOTTED HARNESS-ERROR ' + (e && e.stack || e)); process.exit(1); });
