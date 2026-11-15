// ⚠ DO NOT REMOVE — W-RED1-WORDS (bim-compiler prompts/CLI_ERP_IVR.md §22.11 step R1: the short words). READ THE LOG; an exit code is not evidence.
//   R1 ISSUE (a word expands to a line the door would refuse: a word that cannot work) · R2 ISSUE (a word in a BIM place reaches an ERP verb or the reverse)
//   R3 ISSUE (the printed `→` line is not the line that ran: run alone, with no session, it answers differently, so the shell teaches a wrong line)
//   Falsifier: WORDS_BREAK=dropkey (the printed line lacks the context's building: must FAIL R3). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_red1_words.js > common/door/tests/logs/red1_words.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-WORDS'), RED1 = path.join(ROOT, 'common/door/red1.js'), BRK = process.env.WORDS_BREAK || '';
const D = require(DOOR), W = require(path.join(ROOT, 'common/door/words_core.js')), M = require(path.join(ROOT, 'common/door/mis_core.js'));
const vocab = D.loadVocab(), words = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/vocab/words.json'), 'utf8')), byVerb = {};
vocab.verbs.forEach(v => { byVerb[v.verb] = v; });
const run = (argv, env) => new Promise((res) => { let o = '', e = ''; const p = cp.spawn(process.execPath, argv, { env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); p.on('close', c => res({ code: c, out: o, err: e })); });
const mask = (x) => JSON.stringify(x, (key, v) => (key === 'request' || key === 'ms' ? undefined : v));
(async () => {
  // R1 + R2: every word, every form, in a place that fits it, with a sample value per positional input (the vocabulary's example, else a type-shaped value)
  const core = W.create({ vocab, words, msg: require(path.join(ROOT, 'common/door/msg_core.js')).create(JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/vocab/messages.json'), 'utf8'))), tokenize: D.tokenize, pickColumns: M.pickColumns, buildings: ['Duplex'] });
  const place = { kind: { building: 'Duplex', kind: 'Element', columns: ['guid'] }, building: { building: 'Duplex' }, erp: { erp: 'Business Partner', ecolumns: ['Value'] }, any: {} };
  const APPS = { kind: ['object', 'viewer', 'modeller'], building: ['object', 'viewer', 'modeller'], erp: ['mis', 'erp'], any: ['model', 'ninja'] };
  const sample = (inp) => (inp && inp.example != null ? String(inp.example) : (inp && inp.type === 'number' ? '1' : 'x1'));
  let judged = 0; const bad1 = [], bad2 = [];
  Object.keys(words.words).forEach(w => words.words[w].forms.forEach(f => {
    const st = Object.assign(core.init(), place[f.in]);
    const verb0 = f.verb.replace('{1}', (f.pick || [''])[0]), e0 = byVerb[verb0];
    const vals = (f.pick ? [f.pick[0]] : []).concat(f.args.map(a => sample(e0 && e0.inputs.filter(i => i.name === a)[0])));
    const text = [w].concat(vals.map(v => /\s/.test(v) ? '"' + v + '"' : v)).join(' ');
    const x = core.expand(st, D.tokenize(text)); judged++;
    if (x.error) { bad1.push(w + '@' + f.in + ': ' + x.error); return; }
    const pl = D.parseLine(x.line), e = byVerb[pl.verb], args = {};
    pl.kv.forEach(kv => { const inp = e.inputs.filter(i => i.name === kv.k)[0]; args[kv.k] = inp ? D.coerce(inp, kv.raw) : kv.raw; });
    const v = D.validate(e, args); if (v) bad1.push(w + '@' + f.in + ' → ' + x.line + ': ' + v);
    if (APPS[f.in].indexOf(pl.verb.split('.')[0]) < 0) bad2.push(w + '@' + f.in + ' → ' + pl.verb);
    k.L('expand ' + JSON.stringify(text) + ' @' + f.in + ' → ' + x.line + (v ? '  REFUSED: ' + v : ''));
  }));
  if (!judged) k.incon('R1', 'words.json has no form'); else k.chk('R1 every word in every place it names expands to a line the door\'s own validator accepts (' + judged + ' word-forms)', !bad1.length, bad1.slice(0, 5).join(' | '));
  if (!judged) k.incon('R2', 'nothing expanded'); else k.chk('R2 a word in a BIM place reaches only object/viewer/modeller verbs, in an ERP kind only mis/erp, anywhere only model/ninja', !bad2.length, bad2.join(' | '));

  // R3: the printed line, run alone through door.js, answers as the session's line did (Duplex objects: no browser)
  const shot = await run([RED1, 'cd Duplex; cd Element; count discipline=ARC'], BRK ? { WORDS_BREAK: BRK } : {});
  const arrows = (shot.err.match(/^→ .*$/mg) || []).map(l => l.slice(2)), envs = shot.out.split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l));
  const last = arrows[arrows.length - 1], sess = envs[envs.length - 1];
  k.L('R3 arrows=' + JSON.stringify(arrows) + ' session status=' + (sess && sess.status));
  if (!sess || sess.status !== 'ok' || !last) k.incon('R3', 'the session line did not answer ok (is buildings/Duplex_extracted.db here?): ' + shot.err.slice(-300));
  else {
    const alone = await run([DOOR, '--actor', 'human', last]), a = alone.out.split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l)).pop();
    k.chk('R3 the printed line `' + last + '`, run alone through door.js, gives the session\'s answer (request, ms masked)', !!a && mask(a.answer) === mask(sess.answer) && a.status === 'ok',
      'alone=' + (a && a.status) + ' ' + (a && a.answer && a.answer.summary) + ' · session=' + sess.answer.summary + (a && a.why ? ' · why=' + a.why : ''));
  }
  k.end();
})().catch(e => { console.log('§W-RED1-WORDS FAIL ' + (e && e.stack || e)); process.exit(1); });
