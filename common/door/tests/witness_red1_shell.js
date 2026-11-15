// ⚠ DO NOT REMOVE — W-RED1-SHELL (bim-compiler prompts/CLI_ERP_IVR.md §22.11 step R0: the `red1` command). READ THE LOG; an exit code is not evidence.
//   S1 ISSUE (`red1 'line'` answers differently from `door.js 'line'`: a second engine path) · S2 ISSUE (a session line is run or journalled more or less than once,
//   so a session writes differently from the same lines run one by one) · S3 ISSUE (`red1 -f FILE --dry` changes the real op-log) · S4 ISSUE (`help verbs` in a session is not the
//   door's help, `help` misses a word, or it journals/runs something) · S5 ISSUE (a refused line ends the session, so the lines after it never run).
//   Falsifier: RED1_BREAK=twice (the session runs a line twice: must FAIL S2). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_red1_shell.js > common/door/tests/logs/red1_shell.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-SHELL'), RED1 = path.join(ROOT, 'common/door/red1.js'), BRK = process.env.RED1_BREAK || '';
(async () => {
  const dir = path.dirname(tmp('r1_'));
  const PW = path.join(ROOT, 'common/door/samples/Ninja_Practice.xlsx');
  if (!fs.existsSync(PW)) { k.incon('S1-S5', 'common/door/samples/Ninja_Practice.xlsx is not in this checkout'); return k.end(); }
  fs.copyFileSync(PW, path.join(dir, 'Ninja_Practice.xlsx'));
  const logOf = (n) => path.join(dir, n + '.ops.jsonl'), jOf = (n) => path.join(dir, n + '.j.jsonl');
  const envOf = (n) => ({ BIM_OBJECT_OPLOG: logOf(n), BIM_DOOR_JOURNAL: jOf(n) });
  const run = (file, e, argv, input, brk) => new Promise((res) => { let o = '', er = ''; const env = Object.assign({}, process.env, e); delete env.RED1_BREAK; if (brk) env.RED1_BREAK = brk;
    const p = cp.spawn(process.execPath, [file].concat(argv), { cwd: dir, env, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { er += d; });
    if (input != null) { p.stdin.write(input); p.stdin.end(); }
    p.on('close', (code) => res({ code, out: o, err: er, envs: o.split('\n').filter(l => l.charAt(0) === '{').map(l => { try { return JSON.parse(l); } catch (x) { return { status: 'unparseable' }; } }) })); });
  const door = (e, l) => run(DOOR, e, ['--actor', 'human', l]).then(r => r.envs[r.envs.length - 1] || { status: 'none' });
  const lines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean); } catch (x) { return []; } };
  const sha = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16); } catch (x) { return 'absent'; } };
  const UU = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, TS = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g;
  const mask = (x) => JSON.stringify(typeof x === 'string' ? JSON.parse(x) : x, (key, v) => (key === 'request' || key === 'ms' || key === 't0' || key === 't' || key === 'raw' || key === 'line' ? undefined : v)).replace(UU, 'UU').replace(TS, 'TS');

  const st = await door(envOf('base'), 'ninja.exec file=Ninja_Practice.xlsx data=N');
  if (st.status !== 'ok') { k.incon('S1-S5', 'the practice tables were not made: ' + st.why); return k.end(); }
  const fresh = (n) => { fs.copyFileSync(logOf('base'), logOf(n)); return envOf(n); }, nBase = lines(logOf('base')).length;
  k.L('base ops=' + nBase + ' dir=' + dir);

  // S1 one line through red1 and through door.js, same log (a write first, so the read has a row)
  const e1 = fresh('S1'); await door(e1, 'mis.new kind=PR_Patient Name=Devi BloodGroup=O');
  const L = 'mis.list kind=PR_Patient';
  const viaRed1 = await run(RED1, e1, [L]), viaDoor = await run(DOOR, e1, ['--actor', 'human', L]);
  const a1 = viaRed1.envs.pop(), b1 = viaDoor.envs.pop();
  if (!a1 || !b1 || b1.status !== 'ok') k.incon('S1', 'door.js did not answer ok: ' + (b1 && b1.why));
  else k.chk('S1 `red1 \'' + L + '\'` prints the same envelope as `door.js \'' + L + '\'` (request, ms, times, UUs masked) and the same exit code', mask(a1) === mask(b1) && viaRed1.code === viaDoor.code,
    'red1=' + a1.status + '/' + viaRed1.code + ' door=' + b1.status + '/' + viaDoor.code + ' rows=' + JSON.stringify(b1.answer && (b1.answer.rows || []).length) + ' equal=' + (mask(a1) === mask(b1)));

  // S2 three lines typed in a session (piped stdin) vs the same three run one by one through door.js
  const L3 = ['mis.new kind=PR_Patient Name=Eve BloodGroup=O', 'mis.new kind=PR_Visit Name=Checkup PR_Patient_ID=1 Fee=50', 'mis.sum kind=PR_Visit column=Fee'];
  const eA = fresh('S2a'), eB = fresh('S2b');
  const sess = await run(RED1, eA, [], L3.join('\n') + '\n', BRK === 'twice' ? 'twice' : '');
  for (const l of L3) await door(eB, l);
  const opsA = lines(logOf('S2a')).slice(nBase), opsB = lines(logOf('S2b')).slice(nBase), jA = lines(jOf('S2a')), jB = lines(jOf('S2b'));
  const sessOk = (sess.err.match(/^§RED1 line verb=.*status=ok/mg) || []).length;
  if (!opsB.length) k.incon('S2', 'the one-by-one run wrote no op: nothing to compare');
  else k.chk('S2 a session of 3 lines writes the same ops and the same number of journal records as the 3 lines run one by one (each line once)',
    opsA.length === opsB.length && opsA.map(mask).join('\n') === opsB.map(mask).join('\n') && jA.length === jB.length && sessOk === 3,
    'ops ' + opsA.length + '/' + opsB.length + ' journal ' + jA.length + '/' + jB.length + ' session ok lines=' + sessOk + ' sum shown=' + /sum/.test(sess.out));

  // S3 a dry file leaves the real op-log as it was
  const eC = fresh('S3'); fs.writeFileSync(path.join(dir, 'dry.red1'), L3.join('\n') + '\n');
  const before = sha(logOf('S3')), dr = await run(RED1, eC, ['-f', 'dry.red1', '--dry']), after = sha(logOf('S3'));
  if (dr.envs.length !== 3) k.incon('S3', 'the dry file did not answer 3 lines: ' + dr.envs.map(x => x.status).join('/') + ' ' + dr.err.slice(-300));
  else k.chk('S3 `red1 -f FILE --dry` answers its 3 lines and the real op-log is byte-equal before and after', before === after && dr.envs.every(x => x.status === 'ok'),
    'sha ' + before + ' → ' + after + ' statuses=' + dr.envs.map(x => x.status).join('/'));

  // S4 help in a session = the door's help text; the journal does not move
  const eD = fresh('S4'), dh = await run(DOOR, eD, ['help']), jBefore = lines(jOf('S4')).length;
  const sh = await run(RED1, eD, [], 'help verbs\n'), sw = await run(RED1, eD, [], 'help\n'), WN = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/vocab/words.json'), 'utf8')).words), missing = WN.filter(w => !new RegExp('^  ' + w + ' ', 'm').test(sw.out));
  k.chk('S4 `help verbs` in a session prints exactly the door\'s `help` text, `help` lists every word of words.json, and neither journals anything', dh.out.length > 50 && sh.out === dh.out && !missing.length && WN.length > 10 && lines(jOf('S4')).length === jBefore,
    'door help bytes=' + dh.out.length + ' session bytes=' + sh.out.length + ' words listed=' + (WN.length - missing.length) + '/' + WN.length + ' journal ' + jBefore + '→' + lines(jOf('S4')).length);

  // S5 a refused line does not end the session
  const eE = fresh('S5'), s5 = await run(RED1, eE, [], 'mis.list kind=NoSuchKind\nmis.describe kind=PR_Patient\n');
  const st5 = (s5.err.match(/^§RED1 line verb=.*$/mg) || []);
  k.chk('S5 after a line that is not ok, the next line of the session still runs and answers ok', st5.length === 2 && !/status=ok/.test(st5[0]) && /status=ok/.test(st5[1]),
    st5.map(l => l.replace(/ request=.*/, '')).join(' | '));
  k.end();
})().catch(e => { console.log('§W-RED1-SHELL FAIL ' + (e && e.stack || e)); process.exit(1); });
