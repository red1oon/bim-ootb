#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-REPLY-HONEST (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.6 detail 8, §0.7). READ THE §-LOG after every run. Real runs (Viewer headless, CPU).
 * ISSUE: a vacuous pass. A verb whose engine judged nothing must reply inconclusive, never ok; an actor without proof must get a claim, not a run.
 *   H1 viewer.clashes on a pair with no rule (Duplex ARC/ZZZ): the Viewer says INCONCLUSIVE -> status inconclusive, no answer, the Viewer's reason in why
 *   H2 viewer.film_path on a DB with no film path or drawn services: nothing judged -> inconclusive (exit 3 of the tool), the engine's JSON inside
 *   H3 control, so H1/H2 are not "the door can only say no": viewer.counts on the same building -> ok, with a total
 *   H4 an email actor asks for modeller.try_shift (trial): status claim, nothing spawned; the same actor may read (viewer.counts -> not a claim)
 * Falsifier: the stub below says verdict OK for a pair with no rule; H1' (door fed that stub) must NOT be inconclusive, proving H1 reads the engine, not the door's mood.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { kit, tmp } = require('./_kit');
const D = require('../door.js');
const k = kit('W-REPLY-HONEST'), DB = [process.env.FIXTURE_DB, path.join(D.CLI_TABLE.edit_cli, '..', '..', '..', 'buildings', 'Duplex_extracted.db'), path.join(require('os').homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db')].filter(Boolean).filter(p => fs.existsSync(p) && fs.statSync(p).size > 100000)[0];
(async () => {
  if (!DB) { k.incon('ALL', 'no Duplex_extracted.db (public fixture) found'); return k.end(); }
  const door = D.createDoor({ journal: tmp('honest_j_'), say: (s) => console.log('§DOOR ' + s) });
  const [h1, h2, h3] = await Promise.all([
    door.runLine('viewer.clashes building=Duplex discA=ARC discB=ZZZ', { actor: 'ai' }),
    door.runLine('viewer.film_path db=' + DB, { actor: 'ai' }),
    door.runLine('viewer.counts building=Duplex', { actor: 'ai' })]);
  k.chk('H1 no clash rule for the pair: inconclusive, never ok; the Viewer\'s reason is in why; no answer invented', h1.status === 'inconclusive' && /INCONCLUSIVE: no rule for ARC\/ZZZ/.test(h1.why) && h1.answer === null, 'status=' + h1.status + ' why=' + String(h1.why).slice(0, 110));
  k.chk('H2 film path with nothing to judge: inconclusive, the tool\'s own JSON (verdict INCONCLUSIVE) inside', h2.status === 'inconclusive' && !!h2.answer && h2.answer.verdict === 'INCONCLUSIVE' && h2.notChecked.length > 0, 'status=' + h2.status + ' verdict=' + (h2.answer && h2.answer.verdict) + ' notChecked=' + h2.notChecked.length);
  k.chk('H3 control: viewer.counts on the same building is ok with a total', h3.status === 'ok' && h3.answer && h3.answer.value && h3.answer.value.total > 0, 'status=' + h3.status + ' total=' + (h3.answer && h3.answer.value && h3.answer.value.total));
  const before = door.spawned, c = await door.runLine('modeller.try_shift building=HospitalGarage line=gx6 move=1', { actor: 'email' });
  k.chk('H4a an actor with no proof (email) asking for a trial verb: claim, not run', c.status === 'claim' && door.spawned === before && /Held as a claim/.test(c.why), 'status=' + c.status);
  const r = await door.runLine('viewer.counts building=Duplex', { actor: 'email' });
  k.chk('H4b the same actor on a read verb is not a claim (it is refused only because verbs.json does not list email as an actor)', r.status === 'refused' && /not allowed to use viewer\.counts/.test(r.why) && door.spawned === before, 'status=' + r.status);
  // falsifier: feed the door an engine that says OK for the no-rule pair
  const STUB = path.join(__dirname, 'stub_cli.js'), d2 = D.createDoor({ journal: tmp('honest_j2_'), say: () => {}, cli: { viewer_verbs: STUB } }), f = await d2.runLine('viewer.clashes building=Duplex discA=ARC discB=ZZZ', { actor: 'ai' });
  k.chk('H1\' falsifier: an engine that answers OK is passed through as ok (so H1 above came from the Viewer\'s own INCONCLUSIVE)', f.status === 'ok');
  k.L('honest: ' + [h1, h2, h3, c, r].map(e => e.verb + '=' + e.status).join(' '));
  k.end();
})().catch(e => { console.log('§WITNESS_REPLY_HONEST verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
