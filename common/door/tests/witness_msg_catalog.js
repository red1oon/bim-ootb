// ⚠ DO NOT REMOVE — W-MSG-CATALOG (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §3, P2a: the pass-through message catalog, first file words_core.js). READ THE LOG; an exit code is not evidence.
//   M1 ISSUE (moving the text to the catalog changes what a person sees or what a replay prints): the pre-change words_core.js (git MSG_BASE) and the new one, given
//      the SAME corpus of states and inputs, answer byte for byte the same (every step result, every helpText). No baseline from git -> INCONCLUSIVE.
//   M2 ISSUE (a key the corpus never reached was never proven byte-identical): keys reached X of N; an unreached key -> INCONCLUSIVE naming it, never PASS.
//   M3 ISSUE (a key renamed in code alone throws at a person's terminal; a template with a gap or a stray brace): every M('…') key of words_core.js is in the catalog,
//      every words.* key of the catalog is used in code, every template's placeholders are {0}..{n-1} with no gap and no other brace, no call passes more arguments than its template takes.
//   M4 ISSUE (half-moved text, the deletion budget): the person-facing literals of words_core.js (screen.push('…, error: '…, throw new Error('…, title: '…, the helpText sentences) before and after; after must be 0.
//   M5 ISSUE (a wording change slips in unrecorded): the live catalog differs from the P2a catalog (git MSG_P2A) only by the LEDGER of deliberate changes, each exactly its new text.
//   Falsifiers: MSG_BREAK=unledgered (one key changed with no ledger entry: must FAIL M5) · MSG_BREAK=edittemplate (one template changed by one character in a copy of the catalog: must FAIL M1 naming the key) ·
//               MSG_BREAK=extraarg (one call passes an argument too many: must FAIL M3, arg-count) · MSG_BREAK=computedkey (a key built at run time: must FAIL M3) ·
//               MSG_BREAK=renamekey (one key renamed in a copy of words_core.js only: must FAIL M3, and M1 where the corpus reaches it).
//   Run: node common/door/tests/witness_msg_catalog.js > common/door/tests/logs/msg_catalog.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-MSG-CATALOG'), BRK = process.env.MSG_BREAK || '', BASE = process.env.MSG_BASE || '1cc4f2cd';
const DD = path.join(ROOT, 'common/door'), D = require(DOOR), MC = require(path.join(DD, 'msg_core.js')), MIS = require(path.join(DD, 'mis_core.js')), MENU = require(path.join(DD, 'menu_core.js'));
const tmpd = fs.mkdtempSync(path.join(os.tmpdir(), 'msgcat_'));
let catalog = JSON.parse(fs.readFileSync(path.join(DD, 'vocab/messages.json'), 'utf8'));
// THE LEDGER of deliberate wording changes since P2a (VOCAB_MESSAGE_CATALOG.md §4 P3a-1). M1 proves the CODE byte-identical, so it runs on the catalog as it was
// at P2a: the live one with each ledgered change reverted. M5 proves the ledger is the ONLY drift, against the P2a catalog read from git (MSG_P2A, the P2a merge).
const LEDGER = [
  { key: 'words.help_footer', from: 'Type bim, mis or erp for its words · help <word> for one word · help verbs for the full door lines.', to: 'Type bim, mis or erp for its words · help <word> for one word (level student first for the full explanation) · help verbs for the full door lines.', owner: 'Yes it should (mention level student), 2026-11-16' }
];
const live = JSON.parse(JSON.stringify(catalog));
if (BRK === 'unledgered') { live.messages['words.pwd_nowhere'].en += ' '; k.L('BREAK unledgered words.pwd_nowhere gets a trailing space in a copy of the catalog, with no ledger entry'); }
LEDGER.forEach(c => { if (catalog.messages[c.key]) catalog.messages[c.key] = { en: c.from }; });   // `catalog` is now the P2a wording for M1
let newSrc = fs.readFileSync(path.join(DD, 'words_core.js'), 'utf8');
if (BRK === 'edittemplate') { catalog = JSON.parse(JSON.stringify(catalog)); catalog.messages['words.cd_unknown'].en = catalog.messages['words.cd_unknown'].en.replace('cd:', 'cd;'); k.L('BREAK edittemplate words.cd_unknown -> ' + JSON.stringify(catalog.messages['words.cd_unknown'].en)); }
if (BRK === 'extraarg') { newSrc = newSrc.replace("M('words.not_done', pend)", "M('words.not_done', pend, pend)"); k.L('BREAK extraarg words.not_done gets one argument too many in a copy of words_core.js'); }
if (BRK === 'computedkey') { newSrc = newSrc.replace("M('words.cd_building', b)", "M('words.cd_' + 'building', b)"); k.L('BREAK computedkey words.cd_building built at run time in a copy of words_core.js'); }
if (BRK === 'renamekey') { newSrc = newSrc.replace("M('words.not_done'", "M('words.not_donee'"); k.L('BREAK renamekey words.not_done -> words.not_donee in a copy of words_core.js'); }
const newFile = path.join(tmpd, 'words_core_new.js'); fs.writeFileSync(newFile, newSrc);
const baseR = cp.spawnSync('git', ['-C', ROOT, 'show', BASE + ':common/door/words_core.js'], { encoding: 'utf8' });
const oldSrc = baseR.status === 0 ? baseR.stdout : null;
const vocab = D.loadVocab(), words0 = JSON.parse(fs.readFileSync(path.join(DD, 'vocab/words.json'), 'utf8'));
// the corpus' own word table: words.json plus ONE word that names a verb the vocabulary does not have (the only way to reach words.verb_not_in_vocab); both cores get the same table
const wordsX = JSON.parse(JSON.stringify(words0)); wordsX.words.zzbad = { help: 'zz: a word for the witness', forms: [{ in: 'any', verb: 'nope.verb', args: [] }] };

// ── M3 / M4 static: read the code ──
// the code that reads the catalog: words_core.js (M('…')) and red1.js (.t('…'), the greeting's tip and the --level refusal)
const red1Src = fs.readFileSync(path.join(DD, 'red1.js'), 'utf8');
// M3 reads the code through the ONE key scanner, common/door/msg_keys.js (VOCAB_MESSAGE_CATALOG.md §5; the X0 Navigator reads it too)
const MK = require(path.join(DD, 'msg_keys.js'));
const uses = MK.scan(newSrc, 'common/door/words_core.js').concat(MK.scan(red1Src, 'common/door/red1.js'));
const codeKeys = Array.from(new Set(uses.filter(u => u.key !== null).map(u => u.key)));
const catKeys = Object.keys(catalog.messages), catWords = catKeys.filter(x => x.indexOf('words.') === 0);
const findings = MK.check(live, uses, { prefixes: ['words.'] });
const notInCat = findings.filter(f => f.kind === 'unknown-key').map(f => f.key), notInCode = findings.filter(f => f.kind === 'unused-key').map(f => f.key);
const tplBad = findings.filter(f => f.kind === 'template').map(f => f.key + ' ' + f.detail);
const argBad = findings.filter(f => f.kind === 'arg-count' || f.kind === 'computed-key').map(f => f.kind + ' ' + (f.key || '?') + ' ' + f.file.split('/').pop() + ':' + f.line + ' ' + f.detail);
const strip = (src) => src.split('\n').map(l => l.replace(/\s\/\/ .*$/, '')).filter(l => !/^\s*\/\//.test(l)).join('\n');
const LIT = [/screen\.push\(\s*'[^']*[A-Za-z]{2,}/g, /error:\s*'[^']*[A-Za-z]{2,}/g, /error:\s*'"'/g, /throw new Error\(\s*'[^']*[A-Za-z]{2,}/g, /title:\s*'[^']*[A-Za-z]{2,}/g, /title:\s*pf\.word \+ '/g, /name:\s*'\([a-z]/g, /'red1: type a short word/g, /'Type bim, mis or erp/g, /'  everywhere: /g, /' \(start with: '/g, /'start with: '/g, /' properties; ls shows '/g, /': nothing to pick from'/g, /' works '/g, /' is needed: '/g, /'   run it\? y\/N'/g, /'   codes: '/g, /'   → '/g, /'<action>'/g, /\{ building: 'in a building'/g];
const lits = (src) => { const s = strip(src), hits = []; LIT.forEach(re => { (s.match(re) || []).forEach(h => hits.push(h.slice(0, 50))); }); return hits; };

// ── M1 / M2 dynamic: run the corpus through both cores ──
function load(file) { delete require.cache[require.resolve(file)]; return require(file); }
let oldW = null; if (oldSrc) { const of = path.join(tmpd, 'words_core_old.js'); fs.writeFileSync(of, oldSrc); oldW = load(of); }
const newW = load(newFile);
const extra = [];   // calls that pass more arguments than the template takes (an argument silently dropped)
function msgFor() { const m = MC.create(catalog), t = m.t; return { t: function (key) { const e = catalog.messages[key], n = e ? (e.en.match(/\{(\d+)\}/g) || []).reduce((a, s) => Math.max(a, +s.slice(1, -1) + 1), 0) : 0; if (e && arguments.length - 1 > n) extra.push(key + ' got ' + (arguments.length - 1) + ' takes ' + n); return t.apply(null, arguments); }, keys: m.keys, used: m.used }; }
const MSG = msgFor();
function mk(W, withMsg, o) { return W.create(Object.assign({ vocab, words: wordsX, tokenize: D.tokenize, pickColumns: MIS.pickColumns, menuCore: MENU }, o, withMsg ? { msg: MSG } : {})); }
const VARIANTS = { plain: { buildings: ['Duplex'] }, nob: { buildings: [] }, inter: { buildings: ['Duplex'], interactive: true } };
function cores(v) { return { o: oldW ? mk(oldW, false, VARIANTS[v]) : null, n: mk(newW, true, VARIANTS[v]) }; }
const C = { plain: cores('plain'), nob: cores('nob'), inter: cores('inter') };
const res = (f) => { try { return JSON.stringify(f()); } catch (e) { return 'THROW ' + e.message; } };
let steps = 0; const diffs = [];
const where = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; const f = Math.max(0, i - 50); return 'at char ' + i + ' old=…' + a.slice(f, i + 70) + ' new=…' + b.slice(f, i + 70); };   // the first differing place, with its context
// one case = a chain of inputs from a state; each core walks its OWN state chain; every step result is compared
function chain(v, label, st0, inputs) {
  const c = C[v]; let so = st0, sn = st0;
  inputs.forEach((inp, i) => {
    steps++;
    let ro = null, rn = null;
    const a = c.o ? res(() => { ro = c.o.step(so, inp); return ro; }) : null, b = res(() => { rn = c.n.step(sn, inp); return rn; });
    if (c.o && a !== b) diffs.push(label + '#' + i + ' ' + where(a, b));
    so = ro ? ro.state : so; sn = rn ? rn.state : sn;
  });
}
// a word whose form uses an option a LATER phase added (fixed / fill / fold, §29.6 P3c) cannot be expanded by the P2a-era core at all: judged by that phase's witness (W-RED1-POST P5), named here, not by M1
const NEWFORM = (w) => (wordsX.words[w].forms || []).some(f => f.fixed || f.fill || f.fold || f.ctx || f.for);   // f.ctx (§29.1 P4): `cat` draws the record as a record: judged by W-RED1-RECORD R6; f.for (§29.4: status, claim work in one window): judged by W-RED1-STATUS S4 / W-RED1-CLAIM C4
const S = (o) => Object.assign(C.plain.n.init(), o || {});
const PLACES = { any: {}, building: { building: 'Duplex' }, kind: { building: 'Duplex', kind: 'Element', columns: ['guid', 'Name'] }, erp: { erp: 'Order', ecolumns: ['DocumentNo', 'Name'] } };
// (1) every word, every place, a few shapes of arguments, in each core variant (expand: not a word, works in/nowhere, needs one of, too many values, usage, confirm, ls filter, lines)
Object.keys(VARIANTS).forEach(v => Object.keys(PLACES).forEach(p => {
  Object.keys(wordsX.words).filter(w => !NEWFORM(w)).concat(['zzzz']).forEach(w => ['', ' X', ' X Y Z W V', ' CO 7', ' zz 7', ' abc'].forEach(a => chain(v, v + '/' + p + '/' + w + a, S(PLACES[p]), [{ text: w + a }])));
  // `role 102` runs (it reaches words.role_set) but its M1 difference is excused: since §30 L1 it asks the door the role's client (one read line), by design: judged by W-RED1-LOGIN G1 / G5
  ['pwd', 'role abc', 'role 102', 'role', 'cd Duplex', 'cd Element', 'cd ..', 'cd', 'cd "Business Partner"'].forEach(t => chain(v, v + '/' + p + '/' + t, S(PLACES[p]), [{ text: t }]));
}));
chain('plain', 'quote-in-value', S({ building: 'Duplex', kind: 'El"x', columns: ['guid'] }), [{ text: 'count' }]);
// (2) the door's answers fed back: cd-kind / cd-erp (ok, and not found with and without buildings)
const props = { status: 'ok', answer: { kind: 'Element', properties: [{ name: 'guid', type: 'string' }, { name: 'Name', type: 'string' }] } };
['plain', 'nob'].forEach(v => {
  chain(v, v + '/cd-kind-ok', S({ building: 'Duplex', pendingCd: 'Element' }), [{ result: { purpose: 'cd-kind', envelope: props } }]);
  chain(v, v + '/cd-kind-no', S({ building: 'Duplex', pendingCd: 'Nope' }), [{ result: { purpose: 'cd-kind', envelope: { status: 'refused', why: 'no kind' } } }]);
  chain(v, v + '/cd-erp-ok', S({ pendingCd: 'Order' }), [{ result: { purpose: 'cd-erp', envelope: { status: 'ok', answer: { kind: 'Order', properties: [{ name: 'DocumentNo' }] } } } }]);
  chain(v, v + '/cd-erp-no', S({ pendingCd: 'Nope' }), [{ result: { purpose: 'cd-erp', envelope: { status: 'refused', why: 'not found' } } }]);
});
// (3) choices: none (with and without why), then a menu: pick (Enter), quit (Esc)
const pickFor = { text: 'walk', input: 'discipline', type: 'discipline', word: 'walk' };
chain('inter', 'choices-none-why', S({ building: 'Duplex', pickFor }), [{ result: { purpose: 'choices', envelope: { status: 'refused', why: 'no data' } } }]);
chain('inter', 'choices-none', S({ building: 'Duplex', pickFor }), [{ result: { purpose: 'choices', envelope: { status: 'ok', answer: { rows: [] } } } }]);
const chRows = { status: 'ok', answer: { rows: [['ARC', 3], ['MEP', 2]] } };
chain('inter', 'choices-pick', S({ building: 'Duplex', pickFor }), [{ result: { purpose: 'choices', envelope: chRows } }, { key: 'Down' }, { key: 'Enter' }]);
chain('inter', 'choices-quit', S({ building: 'Duplex', pickFor }), [{ result: { purpose: 'choices', envelope: chRows } }, { key: 'Esc' }]);
chain('inter', 'choices-text', S({ building: 'Duplex', pickFor }), [{ result: { purpose: 'choices', envelope: chRows } }, { text: 'q' }]);
// (4) run: no parameters, the questions (default / needed / context / none), the answers, a lookup (none, with whys, with rows + leave it out)
const ERP = { erp: 'Project', ecolumns: ['Name'] };
['inter', 'plain'].forEach(v => {
  chain(v, v + '/run-paras-none-why', S(Object.assign({ runFor: { text: 'run P', name: 'P' } }, ERP)), [{ result: { purpose: 'run-paras', envelope: { status: 'refused', why: 'no rows' } } }]);
  chain(v, v + '/run-paras-none', S(Object.assign({ runFor: { text: 'run P', name: 'P' } }, ERP)), [{ result: { purpose: 'run-paras', envelope: { status: 'ok', answer: { rows: [] } } } }]);
});
const para = (o) => Object.assign({ ColumnName: 'A', Name: 'Alpha', IsMandatory: 'N', DefaultValue: null, SeqNo: 10, AD_Reference_ID: 10 }, o);
const PARAS = { default: para({ DefaultValue: '5' }), needed: para({ IsMandatory: 'Y' }), context: para({ DefaultValue: '@#Date@', IsMandatory: 'Y' }), none: para({}) };
Object.keys(PARAS).forEach(n => {
  const st = S(Object.assign({ paras: { name: 'P', rows: [PARAS[n]], skipped: [] } }, ERP));
  chain('inter', 'ask-' + n, st, [{ text: 'run P 1' }, { text: '' }]);
  chain('inter', 'ask-' + n + '-value', st, [{ text: 'run P 1' }, { text: '7' }]);
  chain('inter', 'ask-' + n + '-quit', st, [{ text: 'run P 1' }, { text: 'q' }]);
  chain('inter', 'ask-' + n + '-paras', S(Object.assign({ runFor: { text: 'run P 1', name: 'P' } }, ERP)), [{ result: { purpose: 'run-paras', envelope: { status: 'ok', answer: { rows: [PARAS[n]] } } } }, { text: '' }]);
});
const tdPara = (o) => para(Object.assign({ ColumnName: 'C_BPartner_ID', Name: 'Partner', AD_Reference_ID: 19 }, o));
[['opt', tdPara({})], ['mand', tdPara({ IsMandatory: 'Y' })], ['def', tdPara({ DefaultValue: '100' })]].forEach(([n, pr]) => {
  const st = S(Object.assign({ paras: { name: 'P', rows: [pr], skipped: [] } }, ERP));
  chain('inter', 'lookup-' + n + '-none-answerwhy', st, [{ text: 'run P 1' }, { result: { purpose: 'lookup', envelope: { status: 'ok', answer: { rows: [], why: 'rule says none' } } } }, { text: '' }]);
  chain('inter', 'lookup-' + n + '-none-why', st, [{ text: 'run P 1' }, { result: { purpose: 'lookup', envelope: { status: 'refused', why: 'refused here' } } }]);
  chain('inter', 'lookup-' + n + '-none', st, [{ text: 'run P 1' }, { result: { purpose: 'lookup', envelope: { status: 'ok', answer: { rows: [] } } } }]);
  const rows = { status: 'ok', answer: { rows: [{ C_BPartner_ID: 11, Name: 'Joe' }, { value: 'X', name: 'Ex' }] } };
  chain('inter', 'lookup-' + n + '-enter', st, [{ text: 'run P 1' }, { result: { purpose: 'lookup', envelope: rows } }, { key: 'Enter' }]);
  chain('inter', 'lookup-' + n + '-down', st, [{ text: 'run P 1' }, { result: { purpose: 'lookup', envelope: rows } }, { key: 'Down' }, { key: 'Enter' }]);
  chain('inter', 'lookup-' + n + '-esc', st, [{ text: 'run P 1' }, { result: { purpose: 'lookup', envelope: rows } }, { key: 'Esc' }]);
});
// (5) y/N
chain('plain', 'rm-yes', S(ERP), [{ text: 'rm 5' }, { text: 'y' }]);
chain('plain', 'rm-no', S(ERP), [{ text: 'rm 5' }, { text: 'n' }]);
// (6) helpText: every topic
let helps = 0;
Object.keys(VARIANTS).forEach(v => ['', 'bim', 'mis', 'erp', 'verbs', 'zzz', '_'].concat(Object.keys(wordsX.words)).forEach(t => {
  helps++; steps++; const c = C[v];
  const a = c.o ? res(() => c.o.helpText(t)) : null, b = res(() => c.n.helpText(t));
  if (c.o && a !== b) diffs.push(v + '/help ' + JSON.stringify(t) + ' ' + where(a, b));
}));

// ── verdicts ──
{ const ex = diffs.filter(d => /\/role 102#/.test(d)); if (ex.length) { k.L('M1 excused ' + ex.length + ' role 102 step(s): the new role-client read line (§30 L1, W-RED1-LOGIN)'); for (let i = diffs.length - 1; i >= 0; i--) if (/\/role 102#/.test(diffs[i])) diffs.splice(i, 1); } }
k.L('M1 base=' + BASE + (oldSrc ? '' : ' (git show failed: ' + String(baseR.stderr).trim().slice(0, 120) + ')') + ' steps=' + steps + ' (helpText ' + helps + ') diffs=' + diffs.length);
diffs.slice(0, 12).forEach(d => k.L('M1 DIFF ' + d));
if (!oldSrc) k.incon('M1', 'no baseline words_core.js from git at ' + BASE);
else k.chk('M1 the pre-change and the new words_core.js answer the same corpus byte for byte (' + (steps - diffs.length) + ' of ' + steps + ' steps)', diffs.length === 0, diffs.length ? 'first: ' + diffs[0].slice(0, 200) : '');
// keys a LATER phase added are judged by that phase's witness, named here (M2's scope is the P2a move): words.level_*, words.student.* and words.tip_* -> W-HELP-STUDENT (S5, S6); words.offer_* -> W-RED1-POST (P3), words.login_* / role_unknown -> W-RED1-LOGIN (§30), words.cd_record_* / cd_tab_* / link_* -> W-RED1-RECORD (R1, R3, R8), works_for / here_nowhere -> W-RED1-STATUS (S4) (VOCAB_MESSAGE_CATALOG.md §4)
const LATER = (x) => /^words\.(level_|student\.|tip_|offer_|cd_record_|cd_tab_|link_|works_for|here_nowhere|login_|role_unknown)/.test(x), handed = catWords.filter(LATER);
const used = MSG.used(), reached = catWords.filter(x => !LATER(x) && used[x]), unreached = catWords.filter(x => !LATER(x) && !used[x]);
k.L('M2 handed to W-HELP-STUDENT: ' + handed.length + ' keys ' + JSON.stringify(handed));
k.L('M2 reached ' + reached.length + ' of ' + catWords.length + ' keys; uses=' + JSON.stringify(used));
if (unreached.length) k.incon('M2', 'keys the corpus never reached: ' + unreached.join(', '));
else k.chk('M2 every P2a words.* key was reached by the corpus (' + reached.length + ' of ' + (catWords.length - handed.length) + '; ' + handed.length + ' later keys handed on)', reached.length > 0 && reached.length === catWords.length - handed.length);
k.L('M3 code keys=' + codeKeys.length + ' catalog words.* keys=' + catWords.length + ' notInCatalog=' + JSON.stringify(notInCat) + ' notInCode=' + JSON.stringify(notInCode) + ' templates bad=' + JSON.stringify(tplBad) + ' extra-argument calls (run)=' + JSON.stringify(Array.from(new Set(extra))) + ' static arg/computed=' + JSON.stringify(argBad) + ' uses=' + uses.length);
if (!codeKeys.length) k.incon('M3', 'no M(\'…\') key found in words_core.js');
else k.chk('M3 keys both ways: ' + (codeKeys.length - notInCat.length) + ' of ' + codeKeys.length + ' code keys in the catalog, ' + (catWords.length - notInCode.length) + ' of ' + catWords.length + ' catalog keys in code; templates {0}..{n-1}, no stray brace; every call passes what its template takes; no computed key (msg_keys.js, ' + uses.length + ' uses)',
  !notInCat.length && !notInCode.length && !tplBad.length && !extra.length && !argBad.length, (notInCat.length ? 'missing in catalog: ' + notInCat.join(', ') : '') + (notInCode.length ? ' unused: ' + notInCode.join(', ') : '') + (argBad.length ? ' ' + argBad.join('; ') : ''));
// NAMED exemption: the create() guard is a developer's wiring error, thrown when the catalog itself is missing, so it cannot come from the catalog
const EXEMPT = ["throw new Error('words_core: no message catalog ha"];
const before = oldSrc ? lits(oldSrc) : null, after = lits(newSrc).filter(h => EXEMPT.indexOf(h) < 0);
// for the reader, not pass/fail: every string literal of two or more words still in the code (data keys, regex sources, separators show here too)
k.L('M4 two-word literals still in words_core.js: ' + JSON.stringify(Array.from(new Set((strip(newSrc).match(/'(?:[^'\\\n]|\\.)*'/g) || []).filter(l => /[A-Za-z]{2,} [A-Za-z]{2,}/.test(l))))));
k.L('M4 person-facing literals in words_core.js: before=' + (before ? before.length : '?') + ' after=' + after.length + (after.length ? ' left: ' + JSON.stringify(after) : ''));
if (!before) k.incon('M4', 'no baseline to count against');
else if (!before.length) k.incon('M4', 'the literal patterns found nothing in the baseline either (the instrument is blind)');
else k.chk('M4 no person-facing literal left in words_core.js (' + before.length + ' before, ' + after.length + ' after)', after.length === 0, after.join(' | '));
// M5: the ledger is the only drift from the P2a catalog (git MSG_P2A); keys added since are additions, logged, not drift
const P2A = process.env.MSG_P2A || '78aa51b6', p2r = cp.spawnSync('git', ['-C', ROOT, 'show', P2A + ':common/door/vocab/messages.json'], { encoding: 'utf8' });
if (p2r.status !== 0) k.incon('M5', 'no P2a catalog from git at ' + P2A);
else {
  const p2 = JSON.parse(p2r.stdout).messages, drift = [], ledgerBad = [], added = Object.keys(live.messages).filter(x => !p2[x]);
  Object.keys(p2).forEach(x => { const L = LEDGER.filter(c => c.key === x)[0], now = live.messages[x] ? live.messages[x].en : null;
    if (L) { if (p2[x].en !== L.from || now !== L.to) ledgerBad.push(x); } else if (now !== p2[x].en) drift.push(x); });
  k.L('M5 p2a=' + P2A + ' keys=' + Object.keys(p2).length + ' ledgered=' + LEDGER.length + ' drift=' + JSON.stringify(drift) + ' ledger-mismatch=' + JSON.stringify(ledgerBad) + ' added since=' + added.length + ' ' + JSON.stringify(added));
  k.chk('M5 the catalog differs from P2a only by the ledger (' + LEDGER.length + ' change' + (LEDGER.length === 1 ? '' : 's') + ', each exactly its new text); ' + added.length + ' keys added since', !drift.length && !ledgerBad.length, drift.concat(ledgerBad).join(', '));
}
try { fs.rmSync(tmpd, { recursive: true, force: true }); } catch (e) { /* tmp */ }
k.end();
