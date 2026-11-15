// ⚠ DO NOT REMOVE — W-RED1-HELP (bim-compiler prompts/CLI_ERP_IVR.md §24: help in three groups bim / mis / erp, legacy DocAction codes). READ THE LOG; an exit code is not evidence.
//   H1 ISSUE (one word, two answers: `red1 help` one-shot printed the door's text, the session printed the words) · H2 ISSUE (a word missing from its group, or in the wrong one)
//   H3 ISSUE (a printed example that would not run) · H4 ISSUE (the top help teaches internal names) · H5 ISSUE (the DocAction codes drift from the engine's ACT table)
//   Falsifiers (each must FAIL its claim): RED1_HELP_BREAK=oneshot (H1) · WORDS_BREAK=dropform (H2) · WORDS_BREAK=badexample (H3) · WORDS_BREAK=codes (H5).
//   A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_red1_help.js > common/door/tests/logs/red1_help.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-HELP'), RED1 = path.join(ROOT, 'common/door/red1.js'), BRK = process.env.WORDS_BREAK || '';
const D = require(DOOR), W = require(path.join(ROOT, 'common/door/words_core.js')), M = require(path.join(ROOT, 'common/door/mis_core.js'));
const vocab = D.loadVocab(), words = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/vocab/words.json'), 'utf8')), byVerb = {};
vocab.verbs.forEach(v => { byVerb[v.verb] = v; });
const run = (argv, input) => { const r = cp.spawnSync(process.execPath, argv, { input: input || '', env: process.env, encoding: 'utf8' }); return { out: r.stdout || '', err: r.stderr || '', code: r.status }; };
const core = W.create({ vocab, words, tokenize: D.tokenize, pickColumns: M.pickColumns, buildings: ['Duplex'], brk: BRK });
const PLACE = { 'in a building': { building: 'Duplex' }, 'in a kind of it (cd Element)': { building: 'Duplex', kind: 'Element', columns: ['guid'] }, 'in an ERP kind': { erp: 'Order', ecolumns: ['DocumentNo'] }, 'anywhere': {} };
const IN = { 'in a building': 'building', 'in a kind of it (cd Element)': 'kind', 'in an ERP kind': 'erp', 'anywhere': 'any' };
const GROUPS = Object.keys(words.groups).filter(g => g !== '_');
const groupOfApp = (app) => GROUPS.filter(g => words.groups[g].apps.indexOf(app) >= 0)[0];
// a group's text -> [{place, ex, help}] (the session words of the group, e.g. menu, are not words of words.json: kept apart)
const rowsOf = (text) => { let pl = null; const out = []; text.split('\n').forEach(l => { const m = /^ (\S.*):$/.exec(l); if (m && IN[m[1]]) { pl = m[1]; return; } const r = /^  (\S.*?)\s{2,}(\S.*)$/.exec(l); if (r && pl) out.push({ place: pl, ex: r[1], help: r[2] }); }); return out; };

// H1: the same bytes, one-shot and session, for each help form
const forms1 = ['help', 'bim', 'mis', 'erp', 'help do'], diff1 = [];
forms1.forEach(t => {
  const one = run([RED1, t]), ses = run([RED1], t + '\nexit\n');
  k.L('H1 ' + JSON.stringify(t) + ' one-shot bytes=' + one.out.length + ' session bytes=' + ses.out.length);
  if (one.out !== ses.out || one.out.length < 40) diff1.push(t + ' (' + one.out.length + ' vs ' + ses.out.length + ')');
});
k.chk('H1 `red1 <t>` one-shot prints exactly the session\'s text for ' + forms1.join(', '), !diff1.length, diff1.join(' | '));

// H2: every form of every word appears in the group its verb's app maps to (and in no other); every group lists a word
const texts = {}; GROUPS.forEach(g => { texts[g] = core.helpText(g); k.L('--- ' + g + '\n' + texts[g]); });
const listed = {}; GROUPS.forEach(g => { listed[g] = rowsOf(texts[g]); });
let nForms = 0; const miss2 = [], wrong2 = [];
Object.keys(words.words).forEach(w => words.words[w].forms.forEach(f => {
  nForms++; const g = groupOfApp(f.verb.split('.')[0]), ex = f.ex || w;
  if (!g) { wrong2.push(w + '@' + f.in + ' verb ' + f.verb + ' has no group'); return; }
  const hit = listed[g].filter(r => r.ex === ex && IN[r.place] === f.in).length;
  if (!hit) miss2.push(w + '@' + f.in + ' (' + ex + ') not in ' + g);
  GROUPS.filter(o => o !== g).forEach(o => { if (listed[o].some(r => r.ex === ex && IN[r.place] === f.in)) wrong2.push(w + '@' + f.in + ' also in ' + o); });
}));
const empty = GROUPS.filter(g => !listed[g].length);
if (!nForms || empty.length) k.incon('H2', 'nothing to judge: forms=' + nForms + ' empty groups=' + empty.join(','));
else k.chk('H2 each of the ' + nForms + ' word-forms is listed in the group of its verb\'s app (bim ' + listed.bim.length + ', mis ' + listed.mis.length + ', erp ' + listed.erp.length + ' rows)', !miss2.length && !wrong2.length, miss2.concat(wrong2).slice(0, 5).join(' | '));

// H3: every printed example, in its place, expands to a line the door's validator accepts
const SESSION = {}; GROUPS.forEach(g => (words.groups[g].session || []).forEach(s => { SESSION[s[0]] = 1; }));
let n3 = 0; const bad3 = [];
GROUPS.forEach(g => listed[g].forEach(r => {
  if (SESSION[r.ex]) return;
  const text = r.ex.replace(/<Column>=<value>/g, 'Name=x1').replace(/<[^>]+>/g, 'x1');
  const st = Object.assign(core.init(), PLACE[r.place]), x = core.expand(st, D.tokenize(text)); n3++;
  if (x.error) { bad3.push(g + ' ' + JSON.stringify(r.ex) + ': ' + x.error); return; }
  const pl = D.parseLine(x.line), e = byVerb[pl.verb], args = {};
  pl.kv.forEach(kv => { const inp = e.inputs.filter(i => i.name === kv.k)[0]; args[kv.k] = inp ? D.coerce(inp, kv.raw) : kv.raw; });
  const v = D.validate(e, args); if (v) bad3.push(g + ' ' + JSON.stringify(r.ex) + ' → ' + x.line + ': ' + v);
  k.L('H3 ' + g + ' ' + JSON.stringify(r.ex) + ' @' + IN[r.place] + ' → ' + x.line + (v ? '  REFUSED: ' + v : ''));
}));
if (!n3) k.incon('H3', 'no example printed'); else k.chk('H3 each of the ' + n3 + ' printed examples expands, in its place, to a line the door\'s validator accepts', !bad3.length, bad3.slice(0, 4).join(' | '));

// H4: the top help holds no internal name
const top = core.helpText(''), inner = ['object.', 'mis.', 'viewer.', 'modeller.', 'erp.', 'model.', 'ninja.', '->'].filter(s => top.indexOf(s) >= 0);
k.L('--- top\n' + top);
k.chk('H4 the top `help` names the three groups and no internal name (' + top.length + ' bytes)', !inner.length && GROUPS.every(g => top.indexOf('  ' + g + ' ') >= 0), inner.join(' '));

// H5: each legacy code expands to the line of the action it names; the words.json codes == erp_cli.js ACT
const ACT = require(path.join(ROOT, 'common/door/erp_cli.js')).ACT, codes = (words.words.do.forms[0] || {}).codes || {}, bad5 = [];
Object.keys(ACT).forEach(act => { if (codes[ACT[act]] !== act) bad5.push('ACT ' + act + '=' + ACT[act] + ' but words.json ' + ACT[act] + '=' + codes[ACT[act]]); });
Object.keys(codes).forEach(c => { if (ACT[codes[c]] !== c) bad5.push('words.json ' + c + ' not in ACT'); });
Object.keys(codes).forEach(c => {
  const st = () => Object.assign(core.init(), PLACE['in an ERP kind']), a = core.expand(st(), D.tokenize('do ' + c + ' 50000')), b = core.expand(st(), D.tokenize('do ' + codes[c] + ' 50000'));
  k.L('H5 do ' + c + ' → ' + (a.line || a.error) + '   do ' + codes[c] + ' → ' + (b.line || b.error));
  if (!a.line || a.line !== b.line) bad5.push(c + ': ' + (a.line || a.error) + ' ≠ ' + b.line);
});
if (!Object.keys(codes).length) k.incon('H5', 'the do word has no codes');
else k.chk('H5 `do CO|VO|CL|RC <n>` == `do complete|void|close|reverse <n>`, and the codes equal erp_cli.js ACT (' + Object.keys(codes).join(' ') + ')', !bad5.length, bad5.join(' | '));
k.end();
