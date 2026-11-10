#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOOR-HELP (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.V item 10). READ THE §-LOG after every run.
 * ISSUE: help that drifts from the vocabulary, an example that does not run, or help that touches the journal/engine is a wrong guide.
 *   H1 the verbs under `!help all` = verbs.json, name for name, count for count
 *   H2 every example line help prints is accepted by the door's own parser and validator (all required inputs present, no unknown key); every `read` example is
 *      then RUN-checked only for the verbs that need no engine boot here (parse + validate) — the run of read examples is left to the guide witness
 *   H3 `!help nosuch` exits 1 and names the topic
 *   H4 help writes no journal line (the journal file does not exist after) and exits 0
 *   H5 `!help <app>` lists that app's verbs; `!help <verb>` prints title, every input, harm, who, example; a refusal line says "Type !help"
 *   H6 the "common" set = the verbs flagged common in verbs.json (no hand list): `!help` shows exactly those
 * Falsifier: HELP_BREAK=handlist (help takes its verb list from a stale hand list) must fail H1.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const { kit, DOOR } = require('./_kit');
const D = require('../door.js'), R = require('../render.js');
const k = kit('W-DOOR-HELP');
const run = (argv) => new Promise((res) => { let o = '', e = ''; const p = spawn(process.execPath, [DOOR].concat(argv), { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); p.on('close', c => res({ code: c, out: o, err: e })); });
(async () => {
  const vocab = D.loadVocab(), names = vocab.verbs.map(v => v.verb);
  const j = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'help_')), 'j.jsonl');
  const all = await run(['--journal', j, '!help all']);
  const seen = (all.out.match(/^  (\w+\.\w+)/gm) || []).map(x => x.trim());
  k.chk('H1 `!help all` lists exactly the vocabulary (' + names.length + ' verbs)', seen.length === names.length && names.every(n => seen.indexOf(n) >= 0), 'listed=' + seen.length);
  let bad = [];
  for (const line of all.out.split('\n').filter(l => /^  \w+\.\w+/.test(l))) {
    const ex = line.trim().split(/\s{2,}/)[0], pl = D.parseLine(ex), e = vocab.byVerb.get(pl.verb), args = {};
    try { pl.kv.forEach(x => { const inp = e.inputs.filter(i => i.name === x.k)[0]; if (!inp) throw new Error('unknown key ' + x.k); args[x.k] = D.coerce(inp, x.raw); });
      const miss = e.inputs.filter(i => i.required && !(i.name in args)); if (miss.length) throw new Error('missing ' + miss.map(i => i.name)); const v = D.validate(e, args); if (v && v.length) throw new Error(String(v)); }
    catch (er) { bad.push(ex + ' → ' + er.message); }
  }
  k.chk('H2 every printed example parses, names real inputs, has all required ones and validates', bad.length === 0, bad.slice(0, 2).join(' ; '));
  const no = await run(['--journal', j, '!help nosuch']);
  k.chk('H3 `!help nosuch` exits 1 and names it', no.code === 1 && /nosuch/.test(no.err), 'exit=' + no.code);
  k.chk('H4 help wrote no journal line and exited 0', !fs.existsSync(j) && all.code === 0, 'journal exists=' + fs.existsSync(j));
  const app = await run(['!help erp']), one = await run(['!help erp.find']), ref = await run(['--journal', j, 'not a command']);
  const erpN = names.filter(n => /^erp\./.test(n)).length;
  k.chk('H5a `!help erp` lists every erp verb', (app.out.match(/^  erp\.\w+/gm) || []).length === erpN, 'erp=' + erpN);
  const e = vocab.byVerb.get('erp.find');
  k.chk('H5b `!help erp.find` has title, each input, harm, who, example', one.out.indexOf(e.title) >= 0 && e.inputs.every(i => one.out.indexOf(i.name + ' (') >= 0) && /Harm: read/.test(one.out) && /Who may run it: human, ai/.test(one.out) && /Example: erp\.find kind=Order number=50000/.test(one.out));
  k.chk('H5c the not-a-command refusal says "Type !help"', /Type !help/.test(ref.out), ref.out.slice(0, 60));
  const common = vocab.verbs.filter(v => v.common).map(v => v.verb), plain = await run(['!help']);
  const shown = (plain.out.match(/^  (\w+\.\w+)/gm) || []).map(x => x.trim());
  k.chk('H6 `!help` shows exactly the verbs flagged common (' + common.length + ')', common.length > 0 && shown.length === common.length && common.every(c => shown.indexOf(c) >= 0), 'common=' + common.join(','));
  k.end();
})().catch(e => { console.log('§WITNESS_DOOR_HELP verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
