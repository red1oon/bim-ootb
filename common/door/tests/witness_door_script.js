// ⚠ DO NOT REMOVE — W-DOOR-SCRIPT (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.14: a file of lines, and a dry run of the whole file). READ THE LOG; an exit code is not evidence.
//   S1 ISSUE (a file of lines answers or writes differently from the same lines typed one by one) · S2 ISSUE (the file goes on after a refused line, so later lines write)
//   S3 ISSUE (a dry run changes the real op-log, a file of the folder or the journal; or its answers are not the real run's, so a later line does not see an earlier write)
//   S4 ISSUE (a dry run lets through a write it cannot hold back: a program that does not keep its writes in the op-log) · S5 ISSUE (a dry run with no op-log named runs anyway)
//   Falsifiers: DOOR_BREAK=continue (must FAIL S2) · dry_real (must FAIL S3). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_door_script.js > common/door/tests/logs/door_script.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-DOOR-SCRIPT'), BRK = process.env.DOOR_BREAK || '';
(async () => {
  const dir = path.dirname(tmp('ds_'));
  const PW = path.join(ROOT, 'common/door/samples/Ninja_Practice.xlsx');
  if (!fs.existsSync(PW)) { k.incon('S1-S5', 'common/door/samples/Ninja_Practice.xlsx is not in this checkout'); return k.end(); }
  fs.copyFileSync(PW, path.join(dir, 'Ninja_Practice.xlsx'));
  const logOf = (n) => path.join(dir, n + '.ops.jsonl'), jOf = (n) => path.join(dir, n + '.j.jsonl');
  const envOf = (n) => ({ BIM_OBJECT_OPLOG: logOf(n), BIM_DOOR_JOURNAL: jOf(n) });
  // run the door: one line, or --script FILE [--dry]; every JSON envelope it prints, in order
  const run = (e, argv, brk) => new Promise((res) => { let o = '', er = ''; const env = Object.assign({}, process.env, e); delete env.DOOR_BREAK; if (brk) env.DOOR_BREAK = brk; if (e.BIM_OBJECT_OPLOG === null) delete env.BIM_OBJECT_OPLOG;
    const p = cp.spawn(process.execPath, [DOOR, '--actor', 'human'].concat(argv), { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { er += d; });
    p.on('close', (code) => { const envs = o.split('\n').filter(l => l.charAt(0) === '{').map(l => { try { return JSON.parse(l); } catch (x) { return { status: 'unparseable' }; } }); res({ code, envs, err: er }); }); });
  const line = (e, l) => run(e, [l]).then(r => r.envs[r.envs.length - 1] || { status: 'none' });
  const script = (e, name, lines, extra, brk) => { fs.writeFileSync(path.join(dir, name), lines.join('\n') + '\n'); return run(e, ['--script', name].concat(extra || []), brk); };
  const ops = (n) => { try { return fs.readFileSync(logOf(n), 'utf8').split('\n').filter(Boolean); } catch (x) { return []; } };
  const sha = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16); } catch (x) { return 'absent'; } };
  const folderSha = () => fs.readdirSync(dir).sort().map(n => n + ':' + sha(path.join(dir, n))).join(',');
  const UU = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, TS = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g;
  const mask = (x) => JSON.stringify(x, (key, v) => (key === 'request' || key === 'ms' || key === 't0' || key === 't' || key === 'raw' ? undefined : v)).replace(UU, 'UU').replace(TS, 'TS');
  const ok = (j) => j && j.status === 'ok';

  // the start: the practice workbook's five tables, empty (data=N), made once; every claim starts from a copy of this log
  const st = await line(envOf('base'), 'ninja.exec file=Ninja_Practice.xlsx data=N');
  if (!ok(st)) { k.incon('S1-S5', 'the practice tables were not made: ' + st.why); return k.end(); }
  const fresh = (n) => { fs.copyFileSync(logOf('base'), logOf(n)); return envOf(n); }, nBase = ops('base').length;

  // S1 the same 3 lines, as a file and one by one (line 2 needs line 1's record: Devi is patient 1)
  const L3 = ['mis.new kind=PR_Patient Name=Devi BloodGroup=O', 'mis.new kind=PR_Visit Name=Checkup PR_Patient_ID=1 Fee=50', 'mis.sum kind=PR_Visit column=Fee master=PR_Patient/Devi'];
  const FILE3 = ['-- a patient, a visit of that patient, and the fees under her', ''].concat(L3);
  const eA = fresh('A'), eB = fresh('B');
  const a = await script(eA, 'three.door', FILE3);
  const b = []; for (const l of L3) b.push(await line(eB, l));
  const opsA = ops('A').slice(nBase), opsB = ops('B').slice(nBase);
  if (a.envs.length !== 3 || !a.envs.every(ok)) k.incon('S1', 'the file did not answer 3 ok lines: ' + a.envs.map(x => x.status).join('/') + ' ' + a.err.split('\n').filter(l => /why=/.test(l)).join(' | ').slice(0, 300));
  else k.chk('S1 a file of 3 lines (a comment and a blank line skipped) gives the same 3 answers and appends the same ops as the 3 lines run one by one (request ids, times, ms and UUs masked); line 3 sums the visit line 2 made under the patient line 1 made',
    a.envs.map(mask).join('\n') === b.map(mask).join('\n') && opsA.length > 0 && opsA.map(mask).join('\n') === opsB.map(mask).join('\n') && String(a.envs[2].answer && a.envs[2].answer.sum) === '50',
    'answers ' + a.envs.length + '/' + b.length + ' equal=' + (a.envs.map(mask).join('\n') === b.map(mask).join('\n')) + ' · ops ' + opsA.length + '/' + opsB.length + ' equal=' + (opsA.map(mask).join('\n') === opsB.map(mask).join('\n')) + ' · sum=' + (a.envs[2] && a.envs[2].answer && a.envs[2].answer.sum));

  // S2 a refused line stops the file (Z is not a blood group of the list)
  const eC = fresh('C'), eD = fresh('D');
  const c = await script(eC, 'stop.door', ['mis.new kind=PR_Patient Name=Eve BloodGroup=O', 'mis.new kind=PR_Patient Name=Zed BloodGroup=Z', 'mis.new kind=PR_Patient Name=Fay BloodGroup=A'], [], BRK === 'continue' ? 'continue' : '');
  const d1 = await line(eD, 'mis.new kind=PR_Patient Name=Eve BloodGroup=O');
  const namesC = (((await line(eC, 'mis.list kind=PR_Patient columns=Name')).answer || {}).rows || []).map(r => r.Name).sort().join(',');
  if (!ok(d1)) k.incon('S2', 'the one line did not run: ' + d1.why);
  else k.chk('S2 the refused line 2 stops the file: 2 answers (ok, refused), line 3 is not run, the table holds Eve only, and the op-log grew by exactly what line 1 alone writes',
    c.envs.length === 2 && ok(c.envs[0]) && c.envs[1].status === 'refused' && namesC === 'Eve' && ops('C').length === ops('D').length && c.code === 3,
    'answers=' + c.envs.map(x => x.status).join('/') + ' · names=' + namesC + ' · ops file=' + (ops('C').length - nBase) + ' line1 alone=' + (ops('D').length - nBase) + ' · exit=' + c.code);

  // S3 the same 3-line file, dry: the real run's answers, and nothing real changes
  const eE = fresh('E'); fs.writeFileSync(jOf('E'), '');
  const before = { log: sha(logOf('E')), j: sha(jOf('E')) };
  const folder0 = folderSha().replace(/,?three_dry\.door:[0-9a-f]+/, '');
  const dr = await script(eE, 'three_dry.door', FILE3, ['--dry'], BRK === 'dry_real' ? 'dry_real' : '');
  const folder1 = folderSha().replace(/,?three_dry\.door:[0-9a-f]+/, '');
  const after = { log: sha(logOf('E')), j: sha(jOf('E')) }, copyLine = (dr.err.split('\n').filter(l => /§DOOR dry copy=/.test(l))[0] || '');
  const leftover = (/copy=(\S+)/.exec(copyLine) || [])[1];
  if (!dr.envs.length) k.incon('S3', 'the dry run answered nothing: ' + dr.err.slice(-300));
  else k.chk('S3 --dry: the 3 answers equal the real run\'s (line 3 sees line 2\'s visit: sum 50), and the real op-log, the journal and every file of the folder are byte for byte as before; the copy is deleted',
    dr.envs.map(mask).join('\n') === a.envs.map(mask).join('\n') && before.log === after.log && before.j === after.j && folder0 === folder1 && !!leftover && !fs.existsSync(leftover),
    'answers equal=' + (dr.envs.map(mask).join('\n') === a.envs.map(mask).join('\n')) + ' (' + dr.envs.map(x => x.status).join('/') + ') · log ' + before.log + '->' + after.log + ' · journal ' + before.j + '->' + after.j + ' · folder same=' + (folder0 === folder1) + ' · copy deleted=' + (!!leftover && !fs.existsSync(leftover)));

  // S4 in a dry run, a write of a program that keeps no op-log is refused and stops the file; a read of such a program runs
  const eF = fresh('F');
  const f1 = await script(eF, 'session_dry.door', ['mis.describe kind=PR_Patient', 'model.close', 'mis.new kind=PR_Patient Name=Gil'], ['--dry']);
  const f2 = await script(eF, 'read_dry.door', ['witness.last name=mis_diff'], ['--dry']);
  k.chk('S4 --dry: model.close (trial, a Modeller session: no op-log) is refused saying the dry run cannot hold it back, and the line after it is not run; witness.last (read, another program) is passed to its program, whose own answer comes back',
    f1.envs.length === 2 && ok(f1.envs[0]) && f1.envs[1].status === 'refused' && /cannot hold back/.test(f1.envs[1].why) && f2.envs.length === 1 && f2.envs[0].verb === 'witness.last' && !!f2.envs[0].answer && !/cannot hold back/.test(String(f2.envs[0].why)),
    'session file=' + f1.envs.map(x => x.status).join('/') + ' why=' + JSON.stringify(String(f1.envs[1] && f1.envs[1].why).slice(0, 90)) + ' · read file=' + f2.envs.map(x => x.verb + ':' + x.status + ' (' + String(x.why).slice(0, 60) + ')').join('/'));

  // S5 --dry with no op-log named: refused before any line
  const g = await script({ BIM_OBJECT_OPLOG: null, BIM_DOOR_JOURNAL: jOf('G') }, 'nolog_dry.door', L3, ['--dry']);
  k.chk('S5 --dry with BIM_OBJECT_OPLOG not set is refused before any line runs (one refusal naming the op-log, exit 3, no line journalled)',
    g.envs.length === 1 && g.envs[0].status === 'refused' && /BIM_OBJECT_OPLOG/.test(g.envs[0].why) && g.code === 3 && !/request=/.test(g.err) && !fs.existsSync(jOf('G')),
    'answers=' + g.envs.map(x => x.status).join('/') + ' exit=' + g.code + ' journal=' + (fs.existsSync(jOf('G')) ? 'written' : 'none'));
  k.end();
})().catch(e => { console.log('§W-DOOR-SCRIPT ERROR ' + e.stack); process.exit(2); });
