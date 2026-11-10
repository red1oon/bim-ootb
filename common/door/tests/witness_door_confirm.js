#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOOR-CONFIRM (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.14). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE it proves or disproves: a held claim (an AI's write) runs without a person, runs twice, or runs a different line than the one the AI proposed.
 * No browser, no GPU. Model: the PUBLIC Duplex through the object engine (object.update is harm `writes`; an AI's call is a claim). The op-log and journal are in a temp folder.
 * Falsifiers (each must make this witness FAIL): DOOR_BREAK=confirm_ai (any actor may confirm) · DOOR_BREAK=confirm_twice (a second confirm is not answered from the record).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { kit, run, stripMs, ROOT, DOOR } = require('./_kit');
const k = kit('W-DOOR-CONFIRM');
const DB = [process.env.FIXTURE_DB, path.join(os.homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db'), path.join(ROOT, 'buildings', 'Duplex_extracted.db')].filter(Boolean).filter(f => fs.existsSync(f))[0];
(async () => {
  if (!DB) { k.incon('FIXTURE', 'no Duplex_extracted.db found (set FIXTURE_DB)'); return k.end(); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'confirm_')), J = path.join(dir, 'journal.jsonl'), OPS = path.join(dir, 'ops.jsonl');
  fs.copyFileSync(DB, path.join(dir, 'Duplex_extracted.db'));
  const env = { VIEWER_BLD_DIR: dir, BIM_OBJECT_OPLOG: OPS };
  const door = async (args) => { const r = await run(DOOR, ['--journal', J].concat(args), env); let j = null; try { j = JSON.parse(r.out.split('\n').pop()); } catch (e) { /* judged below */ } return { r, j }; };
  const ops = () => { try { return fs.readFileSync(OPS, 'utf8').split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  const jr = () => fs.readFileSync(J, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  // a real element and a legal new value for it, read through the door
  const SQL = await require(path.join(ROOT, 'common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common/lib/sql-wasm.wasm')) });
  const M = new SQL.Database(fs.readFileSync(DB)), uu = M.exec("SELECT guid FROM elements_meta WHERE guid NOT LIKE '%\"%' AND guid NOT LIKE '% %' ORDER BY guid LIMIT 1")[0].values[0][0];
  const LINE = 'object.update building=Duplex kind=Element uu="' + uu + '" column=element_name value="confirmed by a person"';
  const cur = await door(['--request', 'r0', 'object.read building=Duplex kind=Element uu="' + uu + '"']);
  if (!cur.j || cur.j.status !== 'ok') { k.incon('READ', 'the element could not be read: ' + (cur.j ? cur.j.why : cur.r.err.slice(-200))); return k.end(); }
  const before = cur.j.answer.record.element_name;

  // ── 1 the AI's write is a claim; nothing is written; --claims lists it with its line ──
  const c1 = await door(['--actor', 'ai', '--request', 'claim-1', LINE]);
  k.chk('CLAIM an AI object.update is held as a claim and writes nothing', c1.j && c1.j.status === 'claim' && ops() === 0, c1.j && c1.j.status + ' ops=' + ops());
  const l1 = await door(['--claims']), mine = l1.j && l1.j.claims.filter(x => x.request === 'claim-1')[0];
  k.chk('CLAIMS --claims lists it: request, actor ai, the exact line, harm writes', !!mine && mine.actor === 'ai' && mine.line === LINE && mine.harm === 'writes', JSON.stringify(mine).slice(0, 200));
  // ── 2 only a person confirms ──
  const ca = await door(['--actor', 'ai', '--confirm', 'claim-1']);
  k.chk('PERSON --confirm by actor ai is refused; nothing is written; the claim stays held', ca.j && ca.j.status === 'refused' && /confirmed by a person/.test(ca.j.why) && ops() === 0 && (await door(['--claims'])).j.claims.some(x => x.request === 'claim-1'), ca.j && ca.j.status + ' ops=' + ops());
  // ── 3 the person confirms: the recorded line runs, once ──
  const ok = await door(['--confirm', 'claim-1']);
  k.chk('CONFIRM the person\'s --confirm runs it: ok, one op written, the envelope names what it confirms', ok.j && ok.j.status === 'ok' && ops() === 1 && ok.j.confirms === 'claim-1' && ok.j.actor === 'human', ok.j && ok.j.status + ' ' + (ok.j.why || '') + ' ops=' + ops());
  const after = await door(['--request', 'r1', 'object.read building=Duplex kind=Element uu="' + uu + '"']);
  k.chk('CONFIRM the value changed to the claimed one (it was ' + JSON.stringify(before) + ')', after.j && after.j.answer.record.element_name === 'confirmed by a person' && before !== 'confirmed by a person', after.j && JSON.stringify(after.j.answer.record.element_name));
  const ran = jr().filter(x => x.state === 'started' && x.actor === 'human' && x.verb === 'object.update');
  k.chk('SAME-LINE the line the door ran for the person is the claimed line byte for byte', ran.length === 1 && ran[0].line === LINE && /#confirmed$/.test(ran[0].request), 'ran=' + ran.length + ' ' + (ran[0] && ran[0].request));
  // ── 4 a second confirm runs nothing ──
  const again = await door(['--confirm', 'claim-1']), ran2 = jr().filter(x => x.state === 'started' && x.actor === 'human' && x.verb === 'object.update');
  const strip = (j) => { const o = JSON.parse(stripMs(j)); return JSON.stringify(o); };
  k.chk('ONCE a second --confirm answers from the record: the same envelope, still one run and one op', again.j && ok.j && strip(again.j) === strip(ok.j) && ran2.length === 1 && ops() === 1, 'runs=' + ran2.length + ' ops=' + ops());
  k.chk('ONCE a confirmed claim is gone from --claims', !(await door(['--claims'])).j.claims.some(x => x.request === 'claim-1'), '');
  // ── 5 wrong ids ──
  const un = await door(['--confirm', 'no-such-request']);
  k.chk('IDS an unknown request id is an error naming it', un.j && un.j.status === 'error' && /no request "no-such-request"/.test(un.j.why), un.j && un.j.why);
  const notc = await door(['--confirm', 'r0']);
  k.chk('IDS confirming a request that was ok (not a claim) is refused; nothing runs', notc.j && notc.j.status === 'refused' && /was ok/.test(notc.j.why) && ops() === 1, notc.j && notc.j.why);
  // ── 6 the engine still decides at confirm time ──
  const bad = 'object.update building=Duplex kind=Element uu="' + uu + '" column=discipline value=NOT_A_DISCIPLINE';
  const c2 = await door(['--actor', 'ai', '--request', 'claim-2', bad]), r2 = await door(['--confirm', 'claim-2']);
  k.chk('ENGINE a claim the engine refuses at confirm time is refused with the engine\'s reason; nothing is written', c2.j && c2.j.status === 'claim' && r2.j && r2.j.status === 'refused' && /must be one of/.test(r2.j.why) && ops() === 1, r2.j && r2.j.status + ' ' + String(r2.j.why).slice(0, 80));
  // ── 7 the connector did not grow a confirm tool ──
  const mcp = fs.readFileSync(path.join(ROOT, 'modeller', 'tools', 'bim_mcp.js'), 'utf8');
  k.chk('AI the AI connector has no confirm call (door.confirm is not referenced in bim_mcp.js)', !/\.confirm\(|--confirm/.test(mcp), '');
  k.L('element=' + uu + ' before=' + JSON.stringify(before) + ' ops=' + ops() + ' journal lines=' + jr().length);
  k.end();
})().catch(e => { console.error('§W-DOOR-CONFIRM HARNESS-ERROR ' + (e && e.stack || e)); process.exit(1); });
