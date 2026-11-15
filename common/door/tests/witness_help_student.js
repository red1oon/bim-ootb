// ⚠ DO NOT REMOVE — W-HELP-STUDENT (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §4, P3a: a Student level for `help <word>`, built from the vocabulary). READ THE LOG; an exit code is not evidence.
//   S1 ISSUE (the new level leaks into the default): for every topic, helpText(t) and helpText(t,'short') equal the pre-change core (git MSG_BASE) byte for byte.
//   S2 ISSUE (an invented or wrong tip): for every word form, recomputed from verbs.json apart from the core: "what it does" is exactly the description of the verb the
//      example names; "you type" names the form's values in order, each with exactly its input's description; "taken from where you are" is exactly the verb's
//      inputs among building/kind/role that the sample place supplies.
//   S3 ISSUE (an example that does not run): each worked line passes the door's own validator and equals the line the shell prints (→ …) for the same example in the same place.
//   S4 ISSUE (a form quietly without a block): coverage X of N word forms; a form with no example, no description or a refused example is named, never a pass. VACUOUS if N = 0.
//   S5 ISSUE (the level does not reach the person, or sticks): a session `level student`, `help clash`, `level`, `help clash` prints the Student block, then the short text;
//      one-shot `--level student 'help clash'` prints the session's Student bytes; `level xyz` is refused naming the levels.
//   A placeholder pair <Key>=<value> in an example is read as Key=value (the spec's rule, applied here apart from the core).
//   S6 ISSUE (a tip that nags or never shows): on opening a terminal the tip follows the greeting; `red1 --fast` drops it (the greeting stays); a pipe shows no tip.
//   Falsifiers: WORDS_BREAK=swapdesc (another verb's description: must FAIL S2) · WORDS_BREAK=dropctx (the worked line loses its building: must FAIL S3).
//   Run: node common/door/tests/witness_help_student.js > common/door/tests/logs/help_student.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-HELP-STUDENT'), BRK = process.env.WORDS_BREAK || '', BASE = process.env.MSG_BASE || '78aa51b6';
const DD = path.join(ROOT, 'common/door'), RED1 = path.join(DD, 'red1.js'), D = require(DOOR), MC = require(path.join(DD, 'msg_core.js')), MIS = require(path.join(DD, 'mis_core.js'));
const catalog = JSON.parse(fs.readFileSync(path.join(DD, 'vocab/messages.json'), 'utf8')), T = MC.create(catalog).t;
const vocab = D.loadVocab(), words = JSON.parse(fs.readFileSync(path.join(DD, 'vocab/words.json'), 'utf8')), byVerb = {}; vocab.verbs.forEach(e => { byVerb[e.verb] = e; });
const opts = (W, brk) => ({ vocab, words, msg: MC.create(catalog), tokenize: D.tokenize, pickColumns: MIS.pickColumns, buildings: ['Duplex'], brk: brk || '' });
const W = require(path.join(DD, 'words_core.js')), core = W.create(opts(W, BRK)), plainCore = W.create(opts(W, ''));
const run = (argv, input) => { const r = cp.spawnSync(process.execPath, argv, { input: input || '', env: Object.assign({}, process.env, { WORDS_BREAK: '' }), encoding: 'utf8' }); return { out: r.stdout || '', err: r.stderr || '', code: r.status }; };

// ── S1: the short level against the pre-change core ──
const baseR = cp.spawnSync('git', ['-C', ROOT, 'show', BASE + ':common/door/words_core.js'], { encoding: 'utf8' });
const topics = ['', 'bim', 'mis', 'erp', 'verbs', 'zzz'].concat(Object.keys(words.words));
if (baseR.status !== 0) k.incon('S1', 'no baseline words_core.js from git at ' + BASE + ': ' + String(baseR.stderr).trim().slice(0, 120));
else {
  const of = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hstud_')), 'words_core_old.js'); fs.writeFileSync(of, baseR.stdout);
  const old = require(of).create(opts(null, '')), d1 = [];
  topics.forEach(t => { const o = old.helpText(t), a = plainCore.helpText(t), b = plainCore.helpText(t, 'short'); if (o !== a || o !== b) d1.push(JSON.stringify(t)); });
  k.L('S1 base=' + BASE + ' topics=' + topics.length + ' differing=' + JSON.stringify(d1));
  k.chk('S1 the default and `short` help equal the pre-change core byte for byte (' + (topics.length - d1.length) + ' of ' + topics.length + ' topics)', !d1.length, d1.join(', '));
}

// ── S2-S4: each word form's Student block, judged from verbs.json apart from the core ──
const SAMPLE = { building: { building: 'Duplex' }, kind: { building: 'Duplex', kind: 'Element', columns: ['guid'] }, erp: { erp: 'Order', ecolumns: ['DocumentNo'] }, any: {} };
const PLACE_NAME = { building: 'Duplex', kind: 'Duplex/Element', erp: 'Order', any: null };
let N = 0, covered = 0; const bad2 = [], bad3 = [], missing = [];
Object.keys(words.words).forEach(w => {
  const d = words.words[w], text = core.helpText(w, 'student').split('\n');
  // split the text into the blocks of each form: a form line starts with two spaces and a non-space; its block lines start with four spaces
  const blocks = []; text.slice(1).forEach(l => { if (/^ {2}\S/.test(l)) blocks.push({ head: l, lines: [] }); else if (/^ {4}\S/.test(l) && blocks.length) blocks[blocks.length - 1].lines.push(l); });
  d.forms.forEach((f, fi) => {
    N++; const id = w + '@' + f.in, b = blocks[fi];
    if (!b) { missing.push(id + ' (no form line)'); return; }
    const ex = String(f.ex || w).replace(/<([A-Za-z_]\w*)>=<([^<>\s]+)>/g, '$1=$2'), toks = D.tokenize(ex), get = (pre) => { const l = b.lines.filter(x => x.indexOf(pre) === 0)[0]; return l == null ? null : l.slice(pre.length); };
    // the verb the example names, from words.json alone: {1} is the action (a legacy code read through the form's codes, else the word typed)
    let verb = f.verb; if (verb.indexOf('{1}') >= 0) { const a0 = (toks[1] && toks[1].text) || '', code = f.codes && f.codes[a0.toUpperCase()]; verb = verb.replace('{1}', (code || a0).toLowerCase()); }
    const e = byVerb[verb];
    if (!e) { missing.push(id + ' (no verb ' + verb + ' in verbs.json)'); return; }
    if (!e.description) { missing.push(id + ' (verb ' + verb + ' has no description)'); }
    const exLine = b.lines.filter(x => /^ {4}e\.g\./.test(x))[0];
    if (!exLine) { missing.push(id + ' (no worked line: the expander refused the example)'); return; }
    covered++;
    // S2 the facts
    const want = {
      does: e.description || null,
      you: (function () { const parts = (f.pick ? [T('words.student.action', f.pick.join(', '))] : []).concat((f.args || []).map(n => { const i = e.inputs.filter(x => x.name === n)[0]; return i && i.description ? n + ' (' + i.description + ')' : n; })); return parts.length ? parts.join(' · ') : 'nothing more'; })(),
      from: (function () { const sp = SAMPLE[f.in], app = verb.split('.')[0], has = (n) => e.inputs.some(i => i.name === n), typed = toks.slice(1).map(t => (/^([A-Za-z_]\w*)=/.exec(t.text) || [])[1]).filter(Boolean), out = [];
        if (sp.building && has('building') && typed.indexOf('building') < 0) out.push('building');
        const kv = app === 'object' ? sp.kind : (app === 'mis' || app === 'erp') ? sp.erp : null; if (kv && has('kind') && typed.indexOf('kind') < 0) out.push('kind');
        return out.length ? out.join(', ') : null; })()
    };
    const got = { does: get('    what it does: '), you: get('    you type: '), from: get('    taken from where you are: ') };
    ['does', 'you', 'from'].forEach(x => { if (got[x] !== want[x]) bad2.push(id + ' ' + x + ': got ' + JSON.stringify(String(got[x]).slice(0, 90)) + ' want ' + JSON.stringify(String(want[x]).slice(0, 90))); });
    // S3 the worked line: its place, the door's validator, and the line the shell itself prints for the same example in the same place
    const m = /^ {4}e\.g\.(?: in (.+?))?: (.+)$/.exec(exLine), place = m && m[1] || null, line = m && m[2];
    if (place !== PLACE_NAME[f.in]) bad3.push(id + ' place ' + place + ' want ' + PLACE_NAME[f.in]);
    let v = 'unparsed'; try { const pl = D.parseLine(line), args = {}; pl.kv.forEach(kv2 => { const inp = e.inputs.filter(i => i.name === kv2.k)[0]; args[kv2.k] = inp ? D.coerce(inp, kv2.raw) : kv2.raw; }); v = pl.verb !== verb ? 'verb ' + pl.verb + ' want ' + verb : D.validate(e, args); } catch (er) { v = er.message; }
    if (v) bad3.push(id + ' → ' + line + ': ' + v);
    const s = plainCore.step(Object.assign(plainCore.init(), SAMPLE[f.in]), { text: ex }), shown = (s.effects[0] && s.effects[0].line) || s.state.pending || null;
    if (shown !== line) bad3.push(id + ' worked=' + line + ' shell=' + shown);
  });
});
k.L('S4 forms=' + N + ' with a block=' + covered + ' named=' + JSON.stringify(missing));
k.L('S2 bad=' + JSON.stringify(bad2.slice(0, 8)));
k.L('S3 bad=' + JSON.stringify(bad3.slice(0, 8)));
if (!N) k.incon('S4', 'VACUOUS: words.json has no form');
else {
  k.chk('S2 every fact of every Student block equals verbs.json, recomputed apart (' + covered + ' blocks; ' + bad2.length + ' wrong)', covered > 0 && !bad2.length, bad2.slice(0, 3).join(' | '));
  k.chk('S3 every worked line passes the door\'s validator and is the line the shell prints for that example there (' + (covered - new Set(bad3.map(x => x.split(' ')[0])).size) + ' of ' + covered + ')', covered > 0 && !bad3.length, bad3.slice(0, 3).join(' | '));
  if (missing.length) k.incon('S4', 'forms with no block: ' + missing.join('; ')); else k.chk('S4 every word form has a Student block (' + covered + ' of ' + N + ')', covered === N);
}

// ── S5: the setting reaches the person and does not stick ──
const one = run([RED1, '--level', 'student', 'help clash']), short1 = run([RED1, 'help clash']);
const ses = run([RED1], 'level student\nhelp clash\nlevel\nhelp clash\nlevel xyz\nexit\n');
const iStu = ses.out.indexOf(one.out), iShort = ses.out.indexOf(short1.out, iStu + one.out.length), bad = run([RED1, '--level', 'xyz', 'help clash']);
const refused = ses.out.indexOf(T('words.level_bad', 'xyz', 'short, student')) >= 0 && bad.code === 2 && bad.err.indexOf(T('words.level_bad', 'xyz', 'short, student')) >= 0;
k.L('S5 one-shot student bytes=' + one.out.length + ' short bytes=' + short1.out.length + ' session bytes=' + ses.out.length + ' student at=' + iStu + ' short after at=' + iShort + ' refused=' + refused + ' oneshot-bad exit=' + bad.code);
if (one.out.length <= short1.out.length) k.incon('S5', 'the one-shot Student text is not longer than the short one: nothing to judge');
else k.chk('S5 `level student` then `help clash` prints the one-shot `--level student` bytes; `level` returns to the short text; `level xyz` is refused (session and one-shot)', iStu >= 0 && iShort > iStu && refused, 'student at ' + iStu + ', short at ' + iShort + ', refused ' + refused);
// ── S6 (P3a-1): the tip on opening, skipped by --fast, never on a pipe ──
const TIP = T('words.tip_level'), pty = (flag) => (cp.spawnSync('bash', ['-c', "(sleep 2; printf 'exit\\r') | script -qc \"stty cols 200; node " + RED1 + (flag ? ' ' + flag : '') + "\" /dev/null"], { encoding: 'utf8', env: Object.assign({}, process.env, { RED1_WARM: 'off' }) }).stdout || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
if (cp.spawnSync('bash', ['-c', 'command -v script']).status !== 0) k.incon('S6', 'no `script` for a terminal');
else {
  const t1 = pty(''), t2 = pty('--fast'), pipe = run([RED1], 'exit\n').out, iTip = t1.indexOf(TIP), iHelp = t1.indexOf('Type help for the list of commands'), iP = t1.indexOf('red1> ');
  k.L('S6 terminal tip@' + iTip + ' after-greeting@' + iHelp + ' prompt@' + iP + ' · --fast tip=' + (t2.indexOf(TIP) >= 0) + ' greeting=' + (t2.indexOf('Welcome to red1') >= 0) + ' · pipe tip=' + (pipe.indexOf(TIP) >= 0));
  if (iHelp < 0) k.incon('S6', 'no greeting on the terminal: nothing to judge');
  else k.chk('S6 on opening, the tip follows the greeting and comes before the prompt; `--fast` keeps the greeting and drops the tip; a pipe shows neither', iTip > iHelp && iP > iTip && t2.indexOf(TIP) < 0 && t2.indexOf('Welcome to red1') >= 0 && pipe.indexOf(TIP) < 0, 'tip@' + iTip);
}
k.end();
