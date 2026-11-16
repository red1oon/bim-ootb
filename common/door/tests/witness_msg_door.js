// ⚠ DO NOT REMOVE — W-MSG-DOOR (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §6, P2b: door.js's answers moved to the message catalog). READ THE LOG; an exit code is not evidence.
//   D1 ISSUE (moving the text changes an envelope, the journal or a replay): the pre-change door.js (git DOOR_BASE) and the new one, sibling copies in common/door/,
//      get the SAME corpus (the exported validate/coerce/parseLine/tokenize/evalExpr/TYPES, loadVocab + checkComposed on broken vocabularies, createDoor().execArgs /
//      runLine / confirm over every decide and engineResult branch with a stub program, and the CLI spawned in a flat folder); every result, every §DOOR say line,
//      every exit code is byte for byte the same (ms normalised). No baseline from git -> INCONCLUSIVE.
//   D2 ISSUE (a key the corpus never reached was never proven byte-identical): door.* keys reached X of N; an unreached key -> INCONCLUSIVE naming it, never PASS.
//   D3 ISSUE (a key renamed in code alone throws at a person's terminal): through the ONE scanner msg_keys.js, prefix door.: unknown, unused, template, arg-count, computed-key = 0.
//   D4 ISSUE (half-moved text, the deletion budget): the person-facing literals of door.js before and after; after = 0 but the named guard. §DOOR log lines stay by rule (listed).
//   D5 ISSUE (the flat download breaks: #2766 class): a folder with ONLY the listed files runs a door line and the connector lists its 4 tools; with msg_core.js or
//      messages.json removed, door.js and bim_mcp.js each exit 1 and print that file's curl line.
//   Falsifiers: MSG_BREAK=edittemplate (one door.* template changed by one character in a catalog copy: must FAIL D1 naming the text) ·
//               MSG_BREAK=renamekey (door.input_twice renamed in a copy of door.js only: must FAIL D3, and D1 where the corpus reaches it).
//   Run: node common/door/tests/witness_msg_door.js > common/door/tests/logs/msg_door.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { kit, ROOT } = require('./_kit');
const k = kit('W-MSG-DOOR'), BRK = process.env.MSG_BREAK || '', BASE = process.env.DOOR_BASE || '304a30a0';
const DD = path.join(ROOT, 'common/door'), MK = require(path.join(DD, 'msg_keys.js')), CATF = path.join(DD, 'vocab/messages.json');
const tmpd = fs.mkdtempSync(path.join(os.tmpdir(), 'msgdoor_')), TAG = '.w_msgdoor_' + process.pid;
const sib = { old: path.join(DD, TAG + '_old.js'), new: path.join(DD, TAG + '_new.js') };
const cleanup = () => { Object.values(sib).forEach(f => { try { fs.unlinkSync(f); } catch (e) { /* gone */ } }); try { fs.rmSync(tmpd, { recursive: true, force: true }); } catch (e) { /* tmp */ } };
process.on('exit', cleanup);

// ── the two door.js sources ──
const baseR = cp.spawnSync('git', ['-C', ROOT, 'show', BASE + ':common/door/door.js'], { encoding: 'utf8' });
const oldSrc = baseR.status === 0 ? baseR.stdout : null, liveSrc = fs.readFileSync(path.join(DD, 'door.js'), 'utf8');
let newSrc = liveSrc, catalogFile = CATF;
if (BRK === 'edittemplate') { const c = JSON.parse(fs.readFileSync(CATF, 'utf8')); c.messages['door.input_twice'].en = c.messages['door.input_twice'].en.replace('twice', 'twise'); catalogFile = path.join(tmpd, 'messages_edit.json'); fs.writeFileSync(catalogFile, JSON.stringify(c)); k.L('BREAK edittemplate door.input_twice -> ' + JSON.stringify(c.messages['door.input_twice'].en) + ' in a copy of the catalog'); }
if (BRK === 'renamekey') { newSrc = newSrc.replace("M('door.input_twice'", "M('door.input_twicee'"); k.L('BREAK renamekey door.input_twice -> door.input_twicee in a copy of door.js'); }
// the witness's copy reads the (maybe falsified) catalog, and reports the keys it used (W_MSG_USED, a file) at exit; the bytes it prints are untouched
const USED = path.join(tmpd, 'used.jsonl');
const instrument = (src, cat) => src.replace("fs.readFileSync(locate('messages.json'), 'utf8')", cat ? 'fs.readFileSync(' + JSON.stringify(cat) + ', \'utf8\')' : "fs.readFileSync(locate('messages.json'), 'utf8')")
  .replace("'use strict';\n", "'use strict';\nif (process.env.W_MSG_USED) process.on('exit', () => { try { require('fs').appendFileSync(process.env.W_MSG_USED, JSON.stringify(typeof MSG !== 'undefined' && MSG ? MSG.used() : {}) + '\\n'); } catch (e) { /* witness only */ } });\n")
  + "\nmodule.exports.__msgUsed = () => (MSG ? MSG.used() : {});\n";
if (oldSrc) fs.writeFileSync(sib.old, oldSrc);
fs.writeFileSync(sib.new, instrument(newSrc, catalogFile === CATF ? null : catalogFile));
process.env.W_MSG_USED = USED;

// ── the stub program: exit code, stdout, stderr from its argv (base64; '-' = empty) ──
const STUB = path.join(tmpd, 'stub.js');
fs.writeFileSync(STUB, "const d = (s) => s === '-' ? '' : Buffer.from(s, 'base64').toString('utf8'); const [c, o, e] = process.argv.slice(2); if (d(o)) process.stdout.write(d(o)); if (d(e)) process.stderr.write(d(e)); process.exitCode = +c;\n");
const b64 = (s) => (s ? Buffer.from(s, 'utf8').toString('base64') : '-');
const IO = [{ name: 'code', type: 'string', required: true }, { name: 'out', type: 'string', required: true }, { name: 'err', type: 'string', required: true }];
const V = (verb, cli, o) => Object.assign({ verb, app: verb.split('.')[0], title: verb, harm: 'read', actors: ['human', 'ai'], inputs: IO, calls: { cli, argv: ['{code}', '{out}', '{err}'] }, returns: { fields: [] } }, o || {});
const CLIS = ['edit_cli', 'viewer_verbs', 'film_path_vis', 'schedule_verbs', 'object_cli', 'erp_cli', 'ops_cli', 'legacy_cli', 'walk_cli', 'model_session', 'weird_cli'];
const TV = CLIS.map(c => V('s.' + c.replace(/_/g, ''), c)).concat([
  V('s.who', 'edit_cli', { calls: { cli: 'edit_cli', who: 'the Modeller', argv: ['{code}', '{out}', '{err}'] } }),
  V('s.write', 'edit_cli', { harm: 'writes' }), V('s.trial', 'edit_cli', { harm: 'trial' }), V('s.aionly', 'edit_cli', { actors: ['ai'] }),
  V('s.notable', 'not_there'),
  { verb: 's.comp', app: 's', title: 'c', harm: 'read', actors: ['human', 'ai'], inputs: [], body: ['s.editcli code=0 out=' + b64('{"ok":true}') + ' err=-', 's.editcli code=1 out=- err=-'], returns: { fields: [] } }
]);
const TVOC = { verbs: TV, byVerb: new Map(TV.map(e => [e.verb, e])), raw: { verbs: TV } };
const cliMap = Object.fromEntries(CLIS.map(c => [c, STUB]));

// ── the corpus: the SAME calls on a door module; every result a normalised string ──
const norm = (s) => String(s).replace(/"ms":\d+/g, '"ms":0').replace(/ ms=\d+/g, ' ms=0').replace(/d-[a-z0-9]+-\d+-\d+/g, 'd-ID').replace(/\\?"t\\?":\\?"\d{4}-[^"\\]*\\?"/g, '"t":"T"');   // ms, request ids and journal times differ between any two runs
const res = (f) => { try { const v = f(); return 'OK ' + JSON.stringify(v); } catch (e) { return 'THROW ' + e.message; } };
const ares = async (f) => { try { const v = await f(); return 'OK ' + JSON.stringify(v); } catch (e) { return 'THROW ' + e.message; } };
async function corpus(D) {
  const out = [], put = (label, v) => out.push([label, norm(v)]);
  // (a) the types' words
  Object.keys(D.TYPES).forEach(t => put('what ' + t, D.TYPES[t].what));
  // (b) the validator over a test entry holding every type
  const T = { verb: 't.v', inputs: [{ name: 'building', type: 'building', required: true }, { name: 'line', type: 'grid_line' }, { name: 'disc', type: 'discipline' }, { name: 's', type: 'string' }, { name: 'f', type: 'file' }, { name: 'n', type: 'number', unit: 'm' }, { name: 'e', type: 'string', enum: ['a', 'b'] }, { name: 'q', type: 'weird' }], calls: { cli: 'edit_cli', argv: [] } };
  const TR = Object.assign({}, T, { calls: { cli: 'erp_cli', argv: [], rest: { flag: '--where' } } });
  [{}, { buildng: 'B' }, { buildng: 'B', zz: 1 }, { building: 'B', zz: '1' }, { building: 'bad name!' }, { building: 'B', line: '9x' }, { building: 'B', disc: 'TOO-LONG-CODE-XYZ!' }, { building: 'B', s: '\u0001' }, { building: 'B', f: '' }, { building: 'B', n: 'x' }, { building: 'B', n: 3 }, { building: 'B', s: 5 }, { building: 'B', e: 'c' }, { building: 'B', e: 'a' }, { building: 'B', q: 'x' }]
    .forEach((a, i) => put('validate#' + i, res(() => D.validate(T, a))));
  [{ building: 'B', 'bad-col': 'x' }, { building: 'B', Col: '\u0002' }, { building: 'B', Col: 'ok' }].forEach((a, i) => put('validate-rest#' + i, res(() => D.validate(TR, a))));
  // (c) coerce: number with and without a unit, with and without the units hint
  const NU = { name: 'n', type: 'number', unit: 'm' }, NN = { name: 'n', type: 'number' };
  [[NU, 'abc'], [NU, '3m'], [NN, 'abc'], [NN, '3m'], [NN, '1.50'], [{ name: 's', type: 'string' }, 7]].forEach(([i, v], j) => put('coerce#' + j, res(() => String(D.coerce(i, v)))));
  // (d) tokenize and parseLine
  ['a "b', 'a {b', 'x.y a=1', 'x.y a', 'x.y a-b=1', 'x.y a=1 a=2', 'hello there', '', '-- c', 'n = x.y a={1+2}'].forEach((t, j) => { put('tokenize#' + j, res(() => D.tokenize(t))); put('parseLine#' + j, res(() => D.parseLine(t))); });
  // (e) {expr}: every error of the arithmetic and of a reference
  const fields = ['a', 's', 'o', 'q', 'a[*]', 'items[*].w'].map(p => ({ path: p }));
  const scope = new Map([['n', { kind: 'input', value: D.Dec.parse('4') }], ['r', { kind: 'result', verb: 'v.x', verbEntry: { returns: { fields } }, answer: { a: 1, s: 't', o: {}, items: [{ id: 'i1', w: 2 }] } }], ['r0', { kind: 'result', verb: 'v.y', verbEntry: { returns: { fields: [] } }, answer: {} }]]);
  ['1 $', 'zz+1', 'r', 'r0', 'n.x', 'r.b', 'r.a+n', 'r.s+1', 'r.o', 'r.q', 'r.a[i1]', 'r.items[zz].w', 'r.items[i1].w*2', '1/0', '(1+2', '1+', '1 2', ')', '7/3'].forEach((x, j) => put('expr#' + j, res(() => { const v = D.evalExpr(x, scope); return String(v); })));
  // (f) broken vocabularies: loadVocab (file) and checkComposed (createDoor)
  const vf = (name, verbs) => { const f = path.join(tmpd, name + '.json'); fs.writeFileSync(f, JSON.stringify({ verbs })); return f; };
  const one = V('a.b', 'edit_cli');
  put('vocab-dup', res(() => D.loadVocab(vf('dup', [one, one])).verbs.length));
  put('vocab-alias-none', res(() => D.loadVocab(vf('aln', [one, Object.assign({}, one, { verb: 'a.c', alias_of: 'a.zz' })])).verbs.length));
  put('vocab-alias-differs', res(() => D.loadVocab(vf('ald', [one, Object.assign({}, one, { verb: 'a.c', alias_of: 'a.b', harm: 'writes' })])).verbs.length));
  const comp = (body, o) => Object.assign({ verb: 'c.x', app: 'c', title: 'c', harm: 'read', actors: ['human', 'ai'], inputs: [], body, returns: { fields: [] } }, o || {});
  const bad = { cycle: [comp(['c.x'])], notcmd: [comp(['hello'])], unknown: [comp(['z.z a=1'])], input: [one, comp(['a.b zz=1'])], harm: [Object.assign({}, one, { harm: 'writes' }), comp(['a.b code=1 out=- err=-'])], actors: [Object.assign({}, one, { actors: ['human'] }), comp(['a.b code=1 out=- err=-'])] };
  Object.keys(bad).forEach(n => put('compose-' + n, res(() => { D.createDoor({ journal: path.join(tmpd, 'jc'), say: () => {}, vocab: { verbs: bad[n], byVerb: new Map(bad[n].map(e => [e.verb, e])), raw: { verbs: bad[n] } } }); return 'loaded'; })));
  // (g) the door over the test vocabulary with the stub program: every engineResult branch, every decide refusal, composed, runLine, confirm
  const J = path.join(tmpd, 'journal.jsonl'); try { fs.unlinkSync(J); } catch (e) { /* new */ }
  const says = [], mk = (o) => D.createDoor(Object.assign({ journal: J, say: (s) => says.push(s), vocab: TVOC, cli: cliMap }, o || {}));
  const door = mk(), dry = mk({ dry: true }), lost = mk({ cli: { edit_cli: '/nonexistent/edit_cli.js', viewer_verbs: '/nonexistent/viewer_verbs.js', object_cli: '/nonexistent/object_cli.js' } });
  let rq = 0; const run = async (d, verb, code, o, e, actor) => put('exec ' + verb + ' ' + code + ' ' + JSON.stringify([o, e]) + ' ' + (actor || 'human'), await ares(() => d.execArgs({ verb, args: { code: String(code), out: b64(o), err: b64(e) }, actor: actor || 'human', request: 'rq-' + (++rq) })));
  const cases = {
    'edit_cli': [[0, 'xx', ''], [3, '{"edits":[{"refused":true}]}', ''], [3, '{"edits":[{"refused":true,"reason":"no"}]}', ''], [1, '', ''], [1, '', 'a\nb\nc\nd'], [0, '{"edits":[]}', '']],
    'viewer_verbs': [[0, 'xx', ''], [1, '', ''], [1, '', 'x\n§VIEWER_VERB FAIL the Viewer says INCONCLUSIVE here'], [0, '{"verdict":"OK"}', ''], [0, '{"verdict":"VACUOUS","summary":"s"}', '']],
    'film_path_vis': [[3, '{"log":[]}', ''], [0, '{"verdict":"INCONCLUSIVE","log":["verdict=INCONCLUSIVE x"]}', ''], [1, '', ''], [1, 'o', '']],
    'schedule_verbs': [[1, '', ''], [1, '', '§SCHED_VERB FAIL nope'], [3, '{"summary":"s"}', '']],
    'object_cli': [[3, '{}', ''], [1, '', ''], [1, '', '§OBJECT FAIL bad kind'], [0, '{"verdict":"VACUOUS","summary":"v"}', '']],
    'erp_cli': [[3, '{}', ''], [1, '', ''], [1, '', '§ERP FAIL e'], [0, '{"actions":["a"]}', '']],
    'ops_cli': [[3, '{"refused":true}', ''], [3, '{}', ''], [1, '', ''], [1, '', '§OPS FAIL o']], 'legacy_cli': [[1, '', '']],
    'walk_cli': [[1, '', ''], [1, '', '§WALK FAIL w'], [0, '{"verdict":"VACUOUS","summary":"w"}', '']],
    'model_session': [[3, '{}', ''], [3, '{"error":"no session"}', ''], [1, '', ''], [1, '', 'a\nb']], 'weird_cli': [[0, '{}', '']]
  };
  for (const c of Object.keys(cases)) for (const [code, o, e] of cases[c]) await run(door, 's.' + c.replace(/_/g, ''), code, o, e);
  await run(door, 's.who', 0, 'xx', '');
  for (const v of ['s.editcli', 's.viewerverbs', 's.objectcli']) await run(lost, v, 0, '', '');
  await run(door, 's.write', 0, '{"edits":[]}', '', 'ai');          // a claim
  await run(door, 's.aionly', 0, '{}', '', 'human');                // actor not allowed
  await run(door, 's.notable', 0, '{}', '');                         // a program not in the table
  await run(dry, 's.trial', 0, '{}', '');                            // a dry run cannot hold it back
  put('exec unknown', await ares(() => door.execArgs({ verb: 'no.verb', args: {}, request: 'rq-u' })));
  put('exec missing', await ares(() => door.execArgs({ verb: 's.editcli', args: {}, request: 'rq-m' })));
  fs.appendFileSync(J, JSON.stringify({ request: 'rq-prior', state: 'started', t: 'T', actor: 'human', line: 's.write', verb: 's.write' }) + '\n');
  put('exec not-rerun', await ares(() => door.execArgs({ verb: 's.write', args: { code: '0', out: '-', err: '-' }, request: 'rq-prior' })));
  put('exec composed', await ares(() => door.execArgs({ verb: 's.comp', args: {}, request: 'rq-comp' })));
  for (const [j, t] of ['hello there', 'x.y a', 'no.verb a=1', 's.editcli code=0 out=- err=- code=1', 's.editcli code={1 $} out=- err=-'].entries()) put('runLine#' + j, await ares(() => door.runLine(t, { request: 'rl-' + j })));
  put('confirm none', await ares(() => mk({ journal: path.join(tmpd, 'jnone') }).confirm('zz')));
  put('confirm unknown', await ares(() => door.confirm('zz')));
  put('confirm ok-request', await ares(() => door.confirm('rq-1')));
  fs.appendFileSync(J, JSON.stringify({ request: 'rq-noenv', state: 'started', t: 'T', actor: 'human', line: 's.write', verb: 's.write' }) + '\n' + JSON.stringify({ request: 'rq-noenv', state: 'done', t: 'T' }) + '\n');
  put('confirm never-answered', await ares(() => door.confirm('rq-noenv')));
  const claim = door.claims()[0]; put('claims', JSON.stringify(door.claims()));
  put('confirm by ai', await ares(() => door.confirm(claim ? claim.request : 'none', { actor: 'ai' })));
  put('says', JSON.stringify(says));
  put('journal', fs.readFileSync(J, 'utf8'));
  return out;
}
// (h) the CLI, spawned from a FLAT folder holding door.js + verbs.json (+ the catalog for the new one): usage, --dry, the dry op-log refusal, menu without mis.js, help without render.js
function flat(which, files) {
  const d = fs.mkdtempSync(path.join(tmpd, 'flat_' + which + '_'));
  fs.writeFileSync(path.join(d, 'door.js'), which === 'old' ? oldSrc : instrument(newSrc, catalogFile === CATF ? null : catalogFile));
  (files || []).forEach(([rel, name]) => fs.copyFileSync(path.join(ROOT, rel), path.join(d, name)));
  return d;
}
const VF = [['common/door/verbs.json', 'verbs.json']], CF = [['common/door/msg_core.js', 'msg_core.js'], ['common/door/vocab/messages.json', 'messages.json']];
const spawnIn = (dir, file, argv, env) => { const r = cp.spawnSync(process.execPath, [path.join(dir, file)].concat(argv), { cwd: dir, encoding: 'utf8', env: Object.assign({}, process.env, { BIM_OBJECT_OPLOG: '', BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl') }, env || {}), timeout: 60000 }); return { code: r.status, out: norm(r.stdout), err: norm(r.stderr).split(dir).join('DIR') }; };
// [argv, render.js beside?]: without render.js, `help` and a script stop at its curl line; with it, the script reaches the --dry op-log refusal
const CLI_CASES = [[[], 0], [['--dry'], 0], [['--dry', 'no.verb a=1'], 0], [['--script', 'x.door', '--dry'], 0], [['--script', 'x.door', '--dry'], 1], [['menu'], 0], [['help'], 0], [['--list', 'no.verb a=1'], 0], [['no.verb a=1'], 0], [['--claims'], 0]];
function cliRuns(which) {
  const RF = [['common/door/render.js', 'render.js']], base = which === 'old' ? VF : VF.concat(CF), dirs = [flat(which, base), flat(which, base.concat(RF))];
  dirs.forEach(d => fs.writeFileSync(path.join(d, 'x.door'), 'no.verb a=1\n'));
  return CLI_CASES.map(([a, r]) => ['cli ' + JSON.stringify(a) + (r ? ' +render.js' : ''), JSON.stringify(spawnIn(dirs[r], 'door.js', a))]);
}

(async () => {
  // ── D1 / D2 ──
  let oldOut = null, newOut;
  if (oldSrc) { oldOut = await corpus(require(sib.old)); oldOut = oldOut.concat(cliRuns('old')); }
  try { fs.unlinkSync(USED); } catch (e) { /* new */ }
  newOut = await corpus(require(sib.new)); newOut = newOut.concat(cliRuns('new'));
  const diffs = [];
  if (oldOut) newOut.forEach(([l, v], i) => { const o = oldOut[i]; if (!o || o[0] !== l || o[1] !== v) { let c = 0; const a = o ? o[1] : ''; while (c < a.length && a[c] === v[c]) c++; diffs.push(l + ' at char ' + c + ' old=…' + a.slice(Math.max(0, c - 40), c + 60) + ' new=…' + v.slice(Math.max(0, c - 40), c + 60)); } });
  k.L('D1 base=' + BASE + (oldSrc ? '' : ' (git show failed: ' + String(baseR.stderr).trim().slice(0, 120) + ')') + ' steps=' + newOut.length + ' diffs=' + diffs.length);
  diffs.slice(0, 12).forEach(d => k.L('D1 DIFF ' + d));
  newOut.filter(([l]) => /^cli /.test(l)).forEach(([l, v]) => k.L('D1 ' + l + ' -> ' + v.slice(0, 230)));   // the CLI steps, for the reader: not vacuous (each reaches its own sentence)
  if (!oldSrc) k.incon('D1', 'no baseline door.js from git at ' + BASE);
  else k.chk('D1 the pre-change and the new door.js answer the same corpus byte for byte (' + (newOut.length - diffs.length) + ' of ' + newOut.length + ' steps: functions, broken vocabularies, every engine branch, confirm, the journal, the § say lines, the CLI)', diffs.length === 0 && newOut.length === oldOut.length, diffs.length ? diffs[0].slice(0, 220) : '');
  const live = JSON.parse(fs.readFileSync(CATF, 'utf8')), doorKeys = Object.keys(live.messages).filter(x => x.indexOf('door.') === 0);
  // ── D3 static: the ONE scanner ──
  const uses = MK.scan(newSrc, 'common/door/door.js'), findings = MK.check(live, uses, { prefixes: ['door.'] });
  k.L('D3 uses=' + uses.length + ' keys=' + new Set(uses.map(u => u.key)).size + ' catalog door.* keys=' + doorKeys.length + ' findings=' + JSON.stringify(findings.map(f => f.kind + ' ' + (f.key || '?') + ' ' + f.file.split('/').pop() + ':' + f.line + ' ' + (f.detail || ''))));
  if (!uses.length) k.incon('D3', 'no M(\'door.…\') use found in door.js');
  else k.chk('D3 keys both ways through msg_keys.js (prefix door.): ' + uses.length + ' uses, ' + doorKeys.length + ' catalog keys, ' + findings.length + ' findings', findings.length === 0, findings.map(f => f.kind + ' ' + f.key).join(', '));
  // ── D4 the deletion budget ──
  // a §DOOR line or a say() call (say writes '§DOOR ' + its text) is the log: it stays in code by rule
  const CODES = ['ok', 'refused', 'claim', 'error', 'inconclusive', 'human', 'ai'];   // a status or an actor is a CODE the envelope carries, not a word a person reads
  const strip = (src) => src.split('\n').map((l, i) => [i + 1, l.replace(/\s\/\/ .*$/, '')]).filter(([, l]) => !/^\s*\/\//.test(l));
  const lits = (src, guard) => { const hits = [], logs = []; strip(src).forEach(([n, l]) => { const m = (l.match(/'(?:[^'\\\n]|\\.)*'/g) || []).filter(x => x !== "'use strict'" && CODES.indexOf(x.slice(1, -1)) < 0 && (/[A-Za-z]{2,} [A-Za-z]{2,}/.test(x) || new RegExp("\\|\\| " + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(l) && /^'[a-z ]{3,}'$/.test(x)));
    if (!m.length) return; if (/§DOOR|\bsay\(/.test(l)) { logs.push(n); return; } if (guard && /catalogMissing = /.test(l)) return; m.forEach(x => hits.push(n + ':' + x.slice(0, 60))); }); return { hits, logs }; };
  const before = oldSrc ? lits(oldSrc, false) : null, after = lits(newSrc, true);
  k.L('D4 person-facing literals in door.js: before=' + (before ? before.hits.length : '?') + ' after=' + after.hits.length + (after.hits.length ? ' left: ' + JSON.stringify(after.hits) : '') + '; §DOOR log lines left by rule: ' + after.logs.length + ' (lines ' + after.logs.join(',') + '); named guard: catalogMissing');
  if (!before) k.incon('D4', 'no baseline to count against');
  else if (!before.hits.length) k.incon('D4', 'the literal patterns found nothing in the baseline either (the instrument is blind)');
  else k.chk('D4 no person-facing literal left in door.js (' + before.hits.length + ' before, ' + after.hits.length + ' after, the guard named)', after.hits.length === 0, after.hits.join(' | '));
  // ── D5 the flat download ──
  const d5 = flat('new', VF.concat(CF)), ok5 = spawnIn(d5, 'door.js', ['no.verb a=1']);
  k.L('D5 flat door.js+verbs.json+msg_core.js+messages.json: exit=' + ok5.code + ' out=' + ok5.out.slice(0, 120));
  const doorRan = ok5.code === 1 && /"why":"unknown verb: no\.verb\. Verbs: /.test(ok5.out);
  const gone = ['msg_core.js', 'messages.json'].map(n => { const d = flat('new', VF.concat(CF.filter(c => c[1] !== n))), r = spawnIn(d, 'door.js', ['no.verb a=1']); const rel = CF.filter(c => c[1] === n)[0][0], ok = r.code === 1 && r.err.indexOf('curl -O https://red1oon.github.io/bim-ootb/' + rel) >= 0; k.L('D5 door.js without ' + n + ': exit=' + r.code + ' ' + r.err.split('\n').slice(0, 2).join(' | ')); return ok; });
  const MCP = [['modeller/tools/bim_mcp.js', 'bim_mcp.js'], ['modeller/tools/edit_cli.js', 'edit_cli.js']];
  const mcp = (files) => { const d = flat('new', files); const r = cp.spawnSync(process.execPath, [path.join(d, 'bim_mcp.js')], { cwd: d, encoding: 'utf8', input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n' + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n', env: Object.assign({}, process.env, { HOME: d }), timeout: 60000 }); return r; };
  const m6 = mcp(VF.concat(CF, MCP)); let tools = ''; try { tools = m6.stdout.split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(x => x.id === 2)[0].result.tools.map(t => t.name).join(','); } catch (e) { /* none */ }
  k.L('D5 connector from the 6 files: tools=' + tools + ' exit=' + m6.status);
  const mGone = ['msg_core.js', 'messages.json'].map(n => { const r = mcp(VF.concat(CF.filter(c => c[1] !== n), MCP)), rel = CF.filter(c => c[1] === n)[0][0]; k.L('D5 connector without ' + n + ': exit=' + r.status + ' ' + String(r.stderr).split('\n').filter(Boolean).slice(0, 2).join(' | ')); return r.status === 1 && String(r.stderr).indexOf('curl -O https://red1oon.github.io/bim-ootb/' + rel) >= 0; });
  k.chk('D5 the flat download: door.js answers a line from the 6 files; the connector lists the 4 tools; without msg_core.js or messages.json both exit 1 and print its curl line', doorRan && gone.every(Boolean) && tools === 'bim_lines,bim_try_shift,viewer_counts,viewer_clashes' && mGone.every(Boolean), 'door ran=' + doorRan + ' door missing named=' + gone + ' tools=' + tools + ' connector missing named=' + mGone);
  // D2 last: the keys used in THIS process (the copy's __msgUsed) plus those of every spawned CLI (one line each in W_MSG_USED, written at its exit)
  const used2 = Object.assign({}, require(sib.new).__msgUsed()); try { fs.readFileSync(USED, 'utf8').split('\n').filter(Boolean).forEach(l => { const o = JSON.parse(l); Object.keys(o).forEach(x => { used2[x] = (used2[x] || 0) + o[x]; }); }); } catch (e) { /* none */ }
  const reached = doorKeys.filter(x => used2[x]), unreached = doorKeys.filter(x => !used2[x]);
  k.L('D2 reached ' + reached.length + ' of ' + doorKeys.length + ' door.* keys; uses=' + JSON.stringify(used2));
  if (unreached.length) k.incon('D2', 'keys the corpus never reached: ' + unreached.join(', '));
  else k.chk('D2 every door.* key was reached by the corpus (' + reached.length + ' of ' + doorKeys.length + ')', reached.length > 0);
  cleanup();
  k.end();
})().catch(e => { console.log('§WITNESS_MSG_DOOR verdict=INCONCLUSIVE ' + (e && e.stack || e)); cleanup(); process.exit(2); });
