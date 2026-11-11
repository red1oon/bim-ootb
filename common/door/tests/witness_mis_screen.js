// ⚠ DO NOT REMOVE — W-MIS-SCREEN (bim-compiler prompts/CLI_ERP_IVR.md §14: mis_core.js + mis.js). READ THE LOG; an exit code is not evidence. No human looks at a screen: keys in, door lines and screen text out.
//   P1 ISSUE (a core that cannot run in the page) · I2 ISSUE (the pointer's row is not the record the list shows: off by one) · T1 ISSUE (a chip runs something other than what it shows)
//   T2 ISSUE (chips that are not the engine's legal actions: a Delete on a completed document) · T3 ISSUE (a write without the confirming word) · I1 ISSUE (the screen does work it did not show) · I9 ISSUE (a pipe behaves differently)
//   Falsifiers: MIS_SCREEN_BREAK=offbyone (must FAIL I2) · skipconfirm (must FAIL T3). Each claim can say VACUOUS/INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { kit, tmp, ROOT } = require('./_kit');
const k = kit('W-MIS-SCREEN');
(async () => {
  const dir = path.dirname(tmp('ms_')), oplog = path.join(dir, 'ops.jsonl');
  process.env.BIM_OBJECT_OPLOG = oplog; const BRK = process.env.MIS_SCREEN_BREAK || '';
  const nops = () => { try { return fs.readFileSync(oplog, 'utf8').split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  // P1
  const src = fs.readFileSync(path.join(ROOT, 'common/door/mis_core.js'), 'utf8'), body = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const bad = ['require(', 'process.', 'child_process', 'Buffer', '\\x1b', '\\u001b', 'readFileSync', 'import('].filter(t => body.includes(t));
  k.chk('P1 the core is pure: no require, process, fs, child_process, Buffer, import or terminal escape in mis_core.js (it must run in the page)', bad.length === 0, 'found=[' + bad.join(',') + '] bytes=' + src.length);
  const { createDoor } = require(path.join(ROOT, 'common/door/door.js')), MIS = require(path.join(ROOT, 'common/door/mis.js')), EC = require(path.join(ROOT, 'common/door/erp_cli.js')), DR = require('./erp_draft.js');
  const journalLines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(x => x.state === 'started').map(x => x.line); } catch (e) { return []; } };
  let jn = 0;
  const drive = async (o, keys) => {   // in-process: the driver's own session(), keys fed from the array
    const jf = path.join(dir, 'j' + (++jn) + '.jsonl'); process.env.BIM_DOOR_JOURNAL = jf;
    const door = createDoor({}), outs = [], q = keys.slice(), r = await MIS.session(Object.assign({ filters: [], limit: 10 }, o), async () => q.length ? q.shift() : null, (s) => outs.push(s), door);
    return { lines: r.lines, outs, state: r.state, journal: journalLines(jf), j: jf };
  };
  const lastScreen = (r) => { const blocks = r.outs.filter(s => !/^-> /.test(s) && !/^key /.test(s)); return blocks[blocks.length - 1] || ''; };
  const chipsOf = (scr) => { const row = scr.split('\n').find(l => /^ > /.test(l)) || '', m = []; row.replace(/\[([A-Z]) ([A-Za-z]+)\]|>\[([A-Z]) ([A-Za-z]+)\]</g, (x, a, b, c, d) => { m.push((a || c) + ' ' + (b || d)); return x; }); return m; };
  const willRun = (scr) => ((scr.split('\n').find(l => /^the line it will run: /.test(l)) || '').replace('the line it will run: ', ''));
  const doorRun = async (line) => { process.env.BIM_DOOR_JOURNAL = path.join(dir, 'jx' + (++jn) + '.jsonl'); return createDoor({}).runLine(line, { actor: 'human' }); };
  // fixtures: three partners to delete/keep (a CSV through mis.load), a draft and a completed order
  const csv = path.join(dir, 'zz.csv'); fs.writeFileSync(csv, 'Value,Name,C_BP_Group_ID\nZZ101,Screen One,Standard Customers\nZZ102,Screen Two,Standard Customers\nZZ103,Screen Three,Standard Customers\n');
  const ld = await doorRun('mis.load kind=C_BPartner dry=N file=' + csv);
  const D1 = await DR.draftOrder({ oplog }, {}), D2 = await DR.draftOrder({ oplog }, {}), cp = await doorRun('erp.complete kind=Order id=' + D2.id);
  if (!ld || ld.status !== 'ok' || !cp || cp.status !== 'ok') { k.incon('setup', 'fixtures failed: load=' + (ld && ld.status) + ' complete=' + (cp && cp.status)); return k.end(); }
  k.L('fixtures partners=3 loaded, order ' + D1.number + ' draft, order ' + D2.number + ' completed, ops=' + nops());
  // I2: two rows with the SAME name; the pointer on row n yields row n's key
  const ind = await doorRun('mis.list kind=C_BPartner name=Agri-Tech columns=C_BPartner_ID sort=C_BPartner_ID'), ids = ind.answer.rows.map(r => String(r.C_BPartner_ID));
  const seen = [];
  for (const n of [1, 2]) { const r = await drive({ kind: 'C_BPartner', filters: [{ col: 'name', value: 'Agri-Tech' }] }, [String(n), 'Right', 'Esc']); const m = /id=(\d+)/.exec(willRun(r.outs.filter(s => /the line it will run/.test(s)).pop() || '')); seen.push(m && m[1]); }
  if (ids.length < 2) k.incon('I2', 'VACUOUS: the seed has no two partners with one name (' + ids.length + ')');
  else k.chk('I2 the pointer on row n yields the key of row n of an independent list, on two rows with the same Name (a pick off by one would show)', JSON.stringify(seen) === JSON.stringify(ids.slice(0, 2)), 'screen=' + seen.join(',') + ' independent=' + ids.join(','));
  // T1: Right, Enter, y on ZZ101 -> exactly describe, list, delete (its id), list
  const idOf = async (v) => String((await doorRun('mis.list kind=C_BPartner value=' + v + ' columns=C_BPartner_ID')).answer.rows[0].C_BPartner_ID);
  const id1 = await idOf('ZZ101'), t1 = await drive({ kind: 'C_BPartner', filters: [{ col: 'value', value: 'ZZ101' }] }, ['Right', 'Enter', 'y', 'Esc']);
  const dl = t1.lines.filter(l => /^mis\.delete/.test(l));
  k.chk('T1 chips run what they show: Right Enter y on the row yields exactly one delete line, for that row\'s key, between the list lines and nothing else', t1.lines.length === 4 && dl.length === 1 && dl[0] === 'mis.delete kind=C_BPartner id=' + id1 && /^mis\.list/.test(t1.lines[3]) && JSON.stringify(t1.journal) === JSON.stringify(t1.lines), t1.lines.map(l => l.split(' ').slice(0, 3).join(' ')).join(' | '));
  // T3: nothing is written without y
  const id2 = await idOf('ZZ102'), n0 = nops(), seqs = [['Right', 'Enter', 'n', 'Esc'], ['Right', 'Enter', 'Esc', 'Esc'], ['Right', 'Enter', 'x', 'Esc']], res = [];
  for (const s of seqs) res.push(await drive({ kind: 'C_BPartner', filters: [{ col: 'value', value: 'ZZ102' }] }, s));
  k.chk('T3 nothing is written without the word: at the Delete popup n, Esc and any other key send no delete and the op log is unchanged; the partner is still there', res.every(r => !r.lines.some(l => /^mis\.delete/.test(l))) && nops() === n0 && (await idOf('ZZ102')) === id2, 'delete_lines=' + res.map(r => r.lines.filter(l => /^mis\.delete/.test(l)).length).join(',') + ' ops+' + (nops() - n0));
  // T2: chips = the engine's legal actions
  const act = async (id) => (await doorRun('erp.actions kind=Order id=' + id)).answer.actions, verbs = MIS.actionVerbs();
  const exp = (codes, withDelete) => codes.filter(c => verbs[c]).map(c => verbs[c].split('.')[1][0].toUpperCase() + verbs[c].split('.')[1].slice(1)).concat(withDelete ? ['Delete'] : []);
  const a1 = await act(D1.id), a2 = await act(D2.id), r1 = await drive({ kind: 'Order', filters: [{ col: 'documentno', value: D1.number }] }, ['Esc']), r2 = await drive({ kind: 'Order', filters: [{ col: 'documentno', value: D2.number }] }, ['Esc']);
  const w = (scr) => chipsOf(scr).map(c => c.split(' ')[1]).filter(x => x !== 'Edit');
  const g1 = w(lastScreen(r1)), g2 = w(lastScreen(r2));
  k.chk('T2 chips are the engine\'s legal actions: a Draft shows its erp.actions verbs and Delete; a Completed order shows its own and no Delete', JSON.stringify(g1.slice().sort()) === JSON.stringify(exp(a1, true).sort()) && JSON.stringify(g2.slice().sort()) === JSON.stringify(exp(a2, false).sort()) && g1.includes('Delete') && !g2.includes('Delete') && g1.length > 1, 'draft shows ' + g1.join('/') + ' (engine ' + a1.join(',') + ') completed shows ' + g2.join('/') + ' (engine ' + a2.join(',') + ')');
  // I1 + I9: a spawned mis.js with stdin; the printed lines vs the journal; and the same keys through the core directly
  const id3 = await idOf('ZZ103'), jp = path.join(dir, 'jpipe.jsonl');
  const piped = (keys, args, jf) => new Promise((res2) => { const p = spawn(process.execPath, [path.join(ROOT, 'common/door/mis.js')].concat(args, ['--plain']), { env: Object.assign({}, process.env, { BIM_DOOR_JOURNAL: jf }), stdio: ['pipe', 'pipe', 'pipe'] }); let o = ''; p.stdout.on('data', d => { o += d; }); p.on('close', () => res2(o)); p.stdin.end(keys.join('\n') + '\n'); });
  const out1 = await piped(['Right', 'Enter', 'y', 'Esc'], ['kind=C_BPartner', 'value=ZZ103'], jp), printed = out1.split('\n').filter(l => /^-> /.test(l)).map(l => l.slice(3));
  k.chk('I1 one line per key, nothing else runs: the door journal of a piped session equals the -> lines it printed, in order (describe, list, delete, list)', printed.length === 4 && JSON.stringify(journalLines(jp)) === JSON.stringify(printed) && printed[2] === 'mis.delete kind=C_BPartner id=' + id3, 'printed=' + printed.length + ' journal=' + journalLines(jp).length);
  const keys = ['Down', 'Down', 'Up', 'Right', 'Esc'], jp2 = path.join(dir, 'jpipe2.jsonl'), outP = await piped(keys, ['kind=Order', 'limit=3'], jp2), pl = outP.split('\n').filter(l => /^-> /.test(l)).map(l => l.slice(3));
  const direct = await drive({ kind: 'Order', limit: 3 }, keys);
  k.chk('I9 a pipe works: the same keys on stdin to mis.js --plain and through the core directly give the same door lines (a document list: every pointer move asks the engine for that row\'s legal actions)', pl.length >= 5 && pl.filter(l => /^erp\.actions/.test(l)).length >= 3 && JSON.stringify(pl) === JSON.stringify(direct.lines), 'piped=' + pl.length + ' direct=' + direct.lines.length + ' actions_lines=' + pl.filter(l => /^erp\.actions/.test(l)).length);
  // T4: one real pseudo-terminal smoke of the ANSI renderer (raw keys: Down arrow, Esc)
  const py = "import pty,os,sys,time,select\nm,s=pty.openpty()\npid=os.fork()\nif pid==0:\n os.setsid(); os.dup2(s,0); os.dup2(s,1); os.dup2(s,2); os.execv(sys.argv[1],[sys.argv[1],sys.argv[2],'kind=C_BPartner','limit=3'])\nos.close(s); buf=b''\ndef rd(t):\n global buf\n e=time.time()+t\n while time.time()<e:\n  r,_,_=select.select([m],[],[],0.3)\n  if r:\n   try: buf+=os.read(m,65536)\n   except OSError: return\nrd(9); os.write(m,b'\\x1b[B'); rd(3); os.write(m,b'\\x1b'); rd(3)\ntry: os.waitpid(pid,os.WNOHANG)\nexcept Exception: pass\nsys.stdout.write(repr(buf))\n";
  const pr = require('child_process').spawnSync('python3', ['-c', py, process.execPath, path.join(ROOT, 'common/door/mis.js')], { encoding: 'utf8', env: Object.assign({}, process.env, { BIM_DOOR_JOURNAL: path.join(dir, 'jpty.jsonl') }), timeout: 60000 }), pty = pr.stdout || '';
  k.chk('T4 a real terminal: the raw-key path draws with ANSI clear+home, shows the list and chips, and a Down arrow then Esc moves the pointer and quits (one pty smoke)', /\\x1b\[2J/.test(pty) && /C_BPartner/.test(pty) && /\[U Edit\]/.test(pty) && (pty.match(/\\x1b\[2J/g) || []).length >= 3, 'pty_bytes=' + pty.length + ' clears=' + (pty.match(/\\x1b\[2J/g) || []).length + (pr.stderr ? ' err=' + pr.stderr.slice(0, 100) : ''));
  return k.end();
})().catch(e => { console.log('§W-MIS-SCREEN ERROR ' + e.stack); process.exit(2); });
