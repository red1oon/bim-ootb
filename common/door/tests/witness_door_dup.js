#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOOR-DUP (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.6 detail 5, §0.7). READ THE §-LOG after every run.
 * ISSUE: a duplicate delivery (a re-sent mail, a retried tool call) acts twice. A request id sent twice must run the CLI once and be answered from the journal.
 * A counting stub stands in for the CLI (injected into the door), so "spawned once" is a count of lines in a file, not an inference.
 *   D1 same id twice, one after the other: one spawn, equal envelopes   D2 same id three times at once: one more spawn only   D3 a NEW door process over the same journal: still no new spawn
 *   D4 the journal holds one started and one done for that id (recorded before the run)   D5 a different id runs again (the check is not "never run")
 *   D6 a request recorded as started with no result is re-run for a trial verb (safe) and refused for a writes verb (planted vocabulary)
 */
'use strict';
const fs = require('fs'), path = require('path');
const { kit, tmp } = require('./_kit');
const D = require('../door.js');
const k = kit('W-DOOR-DUP'), STUB = path.join(__dirname, 'stub_cli.js'), count = tmp('dup_cnt_'), journal = tmp('dup_j_');
process.env.STUB_COUNT = count;
const spawned = () => (fs.existsSync(count) ? fs.readFileSync(count, 'utf8').trim().split('\n').filter(Boolean).length : 0);
const mk = (extra) => D.createDoor(Object.assign({ journal, cli: { edit_cli: STUB, viewer_verbs: STUB, film_path_vis: STUB }, say: () => {} }, extra || {}));
const J = () => fs.readFileSync(journal, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const LINE = 'modeller.try_shift building=HospitalGarage line=gx6 move=1.824';
(async () => {
  const d = mk();
  const a = await d.runLine(LINE, { actor: 'human', request: 'R-1' }), b = await d.runLine(LINE, { actor: 'human', request: 'R-1' });
  k.chk('D1 the same request id twice, in turn: the CLI ran once, the answers are equal', spawned() === 1 && a.status === 'ok' && JSON.stringify(a) === JSON.stringify(b), 'spawned=' + spawned());
  const [c1, c2, c3] = await Promise.all([1, 2, 3].map(() => d.runLine(LINE, { actor: 'ai', request: 'R-2' })));
  k.chk('D2 the same id three times at once: one more spawn only', spawned() === 2 && c1.status === 'ok' && JSON.stringify(c1) === JSON.stringify(c2) && JSON.stringify(c2) === JSON.stringify(c3), 'spawned=' + spawned());
  const d2 = mk(), e = await d2.runLine(LINE, { actor: 'human', request: 'R-1' });
  k.chk('D3 a new door over the same journal answers R-1 from the record, no spawn', spawned() === 2 && JSON.stringify(e) === JSON.stringify(a), 'spawned=' + spawned());
  const rows = J().filter(x => x.request === 'R-1');
  k.chk('D4 the journal holds exactly one started and one done for R-1, started first, with the line, actor and proof', rows.length === 2 && rows[0].state === 'started' && rows[1].state === 'done' && rows[0].line === LINE && rows[0].actor === 'human' && rows[0].proof === 'local-session', 'rows=' + rows.map(x => x.state).join(','));
  const f = await d.runLine(LINE, { actor: 'human', request: 'R-3' });
  k.chk('D5 a different id runs again', spawned() === 3 && f.status === 'ok');
  fs.appendFileSync(journal, JSON.stringify({ request: 'R-4', state: 'started', actor: 'human', line: LINE }) + '\n');
  const g = await mk().runLine(LINE, { actor: 'human', request: 'R-4' });
  k.chk('D6a started-but-never-finished, a trial verb: re-run (safe)', g.status === 'ok' && spawned() === 4, 'spawned=' + spawned());
  const raw = JSON.parse(JSON.stringify(d.vocab.raw)), w = JSON.parse(JSON.stringify(raw.verbs[1])); w.verb = 'modeller.save_it'; w.harm = 'writes'; w.actors = ['human']; raw.verbs.push(w);
  fs.appendFileSync(journal, JSON.stringify({ request: 'R-5', state: 'started', actor: 'human', line: 'x' }) + '\n');
  const dw = mk({ vocab: { verbs: raw.verbs, byVerb: new Map(raw.verbs.map(x => [x.verb, x])), raw } }), h = await dw.runLine('modeller.save_it building=HospitalGarage line=gx6 move=1', { actor: 'human', request: 'R-5' });
  k.chk('D6b started-but-never-finished, a writes verb: refused, not re-run on a guess', h.status === 'refused' && /not re-run/.test(h.why) && spawned() === 4, 'status=' + h.status);
  k.L('dup requests judged: spawns=' + spawned() + ' journalRows=' + J().length);
  if (spawned() === 0) k.incon('DUP', 'nothing was spawned, so nothing was judged');
  k.end();
})().catch(e => { console.log('§WITNESS_DOOR_DUP verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
