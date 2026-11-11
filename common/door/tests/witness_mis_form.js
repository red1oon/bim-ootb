// ⚠ DO NOT REMOVE — W-MIS-FORM (bim-compiler prompts/CLI_ERP_IVR.md §15: mis.new dry=Y, the New and Edit forms in mis_core.js). READ THE LOG; an exit code is not evidence. Keys in, door lines and screen text out.
//   F1 ISSUE (a dry run that writes, or asks for the wrong fields) · F2 ISSUE (the New form shows more or fewer fields than the engine needs) · F3 ISSUE (a write after Esc) · F4 ISSUE (the Edit form differs from the dictionary)
//   F5 ISSUE (an edit sends columns the person did not change) · F6 ISSUE (a refusal throws the typed values away) · F7 ISSUE (a core that grew a Node dependency).
//   Falsifiers: MIS_SCREEN_BREAK=extrafields (must FAIL F4) · sendall (must FAIL F5). Each claim can say VACUOUS/INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path');
const { kit, tmp, ROOT } = require('./_kit');
const k = kit('W-MIS-FORM');
(async () => {
  const dir = path.dirname(tmp('mf_')), oplog = path.join(dir, 'ops.jsonl'); process.env.BIM_OBJECT_OPLOG = oplog;
  const nops = () => { try { return fs.readFileSync(oplog, 'utf8').split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  const { createDoor } = require(path.join(ROOT, 'common/door/door.js')), MIS = require(path.join(ROOT, 'common/door/mis.js'));
  const body = fs.readFileSync(path.join(ROOT, 'common/door/mis_core.js'), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const bad = ['require(', 'process.', 'child_process', 'Buffer', '\\x1b', 'readFileSync', 'import('].filter(t => body.includes(t));
  k.chk('F7 the core is still pure after the forms (no require, process, fs, Buffer, escape code)', bad.length === 0, 'found=[' + bad.join(',') + '] bytes=' + body.length);
  let jn = 0;
  const drive = async (o, keys) => { process.env.BIM_DOOR_JOURNAL = path.join(dir, 'j' + (++jn) + '.jsonl'); const door = createDoor({}), outs = [], q = keys.slice(), r = await MIS.session(Object.assign({ filters: [], limit: 10 }, o), async () => q.length ? q.shift() : null, (s) => outs.push(s), door); return { lines: r.lines, outs, state: r.state }; };
  const doorRun = async (line) => { process.env.BIM_DOOR_JOURNAL = path.join(dir, 'jx' + (++jn) + '.jsonl'); return createDoor({}).runLine(line, { actor: 'human' }); };
  const sqj = (q) => { const o = require('child_process').spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout.trim(); return o ? JSON.parse(o) : []; };
  const screens = (r) => r.outs.filter(s => !/^-> /.test(s) && !/^key /.test(s));
  const formScreen = (r) => screens(r).filter(s => /^(New|Edit) /.test(s)).slice(-1)[0] || '';
  const fieldLines = (scr) => scr.split('\n').filter(l => /^( > |   )[* ] \S/.test(l));
  const POL = { kind: 'C_BPartner' };
  // F1
  const n0 = nops(), dry = await doorRun('mis.new kind=C_BPartner dry=Y'), real = await doorRun('mis.new kind=C_BPartner');
  const refusal = (/still empty after the defaults and callouts: ([^(]*)\(/.exec(real.why || '') || [0, ''])[1].split(',').map(x => x.trim()).filter(Boolean), dm = (dry.answer && dry.answer.mandatory) || [];
  if (!dm.length || !refusal.length) k.incon('F1', 'VACUOUS: dry=' + dm.length + ' refusal=' + refusal.length);
  else k.chk('F1 the dry run writes nothing and names exactly what the real save would refuse for (same set, op log unchanged)', dry.status === 'ok' && dry.answer.dry === true && JSON.stringify(dm.slice().sort()) === JSON.stringify(refusal.slice().sort()) && nops() === n0, 'dry=' + dm.join(',') + ' refusal=' + refusal.join(',') + ' ops+' + (nops() - n0));
  // F2: the New form
  const n2 = nops(), r2 = await drive(Object.assign({ filters: [{ col: 'value', value: 'ZZ400' }] }, POL), ['+', { text: 'ZZ400' }, 'Tab', { text: 'Form Four' }, 'Enter', 'y', 'Esc']);
  const fs2 = fieldLines(formScreen(r2)), mis = r2.lines.filter(l => /^mis\.new /.test(l)), made = await doorRun('mis.list kind=C_BPartner value=ZZ400 columns=C_BPartner_ID,Name');
  k.chk('F2 the New form asks for exactly the dry run\'s mandatory columns (each marked *), the confirmed line carries what was typed, the record exists, and the note counts what the engine filled', fs2.length === dm.length && fs2.every(l => /\* /.test(l)) && mis.length === 2 && mis[0] === 'mis.new kind=C_BPartner dry=Y' && mis[1] === 'mis.new kind=C_BPartner Value=ZZ400 Name="Form Four"' && made.answer.total === 1 && made.answer.rows[0].Name === 'Form Four' && /\d+ columns filled by the engine/.test(r2.outs.join('\n')), 'fields=' + fs2.length + ' lines=' + mis.join(' ; ').slice(0, 120) + ' ops+' + (nops() - n2));
  const id4 = String(made.answer.rows[0].C_BPartner_ID);
  // F3: Esc writes nothing, in the field phase, the confirm phase, and the edit form
  const n3 = nops(), seqs = [['+', 'Esc'], ['+', { text: 'ZZ401' }, 'Tab', { text: 'x' }, 'Enter', 'Esc'], ['Enter', 'Esc'], ['Enter', 'Tab', { text: 'Esc Test' }, 'Esc']], res3 = [];
  for (const s of seqs) res3.push(await drive(Object.assign({ filters: [{ col: 'value', value: 'ZZ400' }] }, POL), s));
  const writes = res3.map(r => r.lines.filter(l => /^mis\.(new|update|delete) /.test(l) && !/ dry=Y$/.test(l)).length);
  k.chk('F3 Esc writes nothing at every phase: in a field, at the Save? prompt, and in the Edit form (no new/update/delete line, op log unchanged)', writes.every(x => x === 0) && nops() === n3 && (await doorRun('mis.list kind=C_BPartner value=ZZ401')).answer.total === 0, 'write_lines=' + writes.join(',') + ' ops+' + (nops() - n3));
  // F4: the Edit form equals the dictionary
  const TAB = "(SELECT tb.ad_tab_id FROM ad_tab tb JOIN ad_table t ON t.ad_table_id=tb.ad_table_id WHERE t.tablename='C_BPartner' AND tb.isactive='Y' ORDER BY tb.tablevel, tb.seqno LIMIT 1)";
  const dict = sqj("SELECT c.name AS n, c.ismandatory AS m FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ad_tab_id=" + TAB + " AND f.isactive='Y' AND c.isactive='Y' AND f.isdisplayed='Y' AND c.iskey<>'Y' AND c.isparent<>'Y' AND COALESCE(f.isreadonly,'N')<>'Y' AND (c.isupdateable='Y' OR c.isalwaysupdateable='Y') AND COALESCE(NULLIF(c.readonlylogic,''), NULLIF(f.readonlylogic,'')) IS NULL AND c.ad_reference_id IN (10,14,11,22,12,29,17,20,15,16,19,18,30)");
  const re = await drive(Object.assign({ filters: [{ col: 'value', value: 'ZZ400' }] }, POL), ['Enter']), ef = re.state.form ? re.state.form.fields : [];
  const shownLabels = ef.map(f => f.label).sort(), dictLabels = dict.map(d => d.n).sort(), stars = ef.filter(f => f.mandatory).length, dstars = dict.filter(d => d.m === 'Y').length;
  const nf = ef.length, no = await drive(Object.assign({ filters: [{ col: 'value', value: 'ZZ400' }] }, POL), ['Enter'].concat(new Array(nf).fill('Enter')));
  if (!dict.length) k.incon('F4', 'VACUOUS: the dictionary read gave no editable fields');
  else k.chk('F4 the Edit form equals an independent read of the dictionary (the same columns, the same * marks), and Enter through every field sends nothing (NO-OP said)', JSON.stringify(shownLabels) === JSON.stringify(dictLabels) && stars === dstars && !no.lines.some(l => /^mis\.update/.test(l)) && /NO-OP/.test(no.outs.join('\n')), 'form=' + shownLabels.length + ' dictionary=' + dictLabels.length + ' stars ' + stars + '/' + dstars + (JSON.stringify(shownLabels) === JSON.stringify(dictLabels) ? '' : ' extra=' + shownLabels.filter(x => !dictLabels.includes(x)).join('|') + ' missing=' + dictLabels.filter(x => !shownLabels.includes(x)).join('|')));
  // F5: change one field; only it is sent
  const before = (await doorRun('mis.read kind=C_BPartner id=' + id4)).answer.record, n5 = nops();
  const r5 = await drive(Object.assign({ filters: [{ col: 'value', value: 'ZZ400' }] }, POL), ['Enter', 'Tab', { text: 'Renamed Four' }].concat(new Array(Math.max(0, nf - 1)).fill('Enter'), ['y', 'Esc'])), upd = r5.lines.filter(l => /^mis\.update/.test(l));
  const after = (await doorRun('mis.read kind=C_BPartner id=' + id4)).answer.record, diff = Object.keys(after).filter(c => String(after[c]) !== String(before[c]));
  k.chk('F5 an edit sends only what changed: one mis.update with exactly the changed column; the stored row differs only there (+ updated, updatedby)', upd.length === 1 && upd[0] === 'mis.update kind=C_BPartner id=' + id4 + ' Name="Renamed Four"' && diff.every(c => ['name', 'updated', 'updatedby'].includes(c)) && diff.includes('name'), 'update=' + (upd[0] || '').slice(0, 110) + ' diff=' + diff.join(',') + ' ops+' + (nops() - n5));
  // F6: a refusal keeps the form and its values
  const n6 = nops(), r6 = await drive(Object.assign({ filters: [{ col: 'value', value: 'ZZ400' }] }, POL), ['+', { text: 'ZZ400' }, 'Tab', { text: 'Dup Four' }, 'Enter', 'y']), last = screens(r6).slice(-1)[0] || '';
  k.chk('F6 a refusal keeps the form with the typed values and writes nothing (a duplicate Value)', /refused:/.test(last) && /\[ZZ400\]/.test(last) && /\[Dup Four/.test(last) && nops() === n6 && (await doorRun('mis.list kind=C_BPartner value=ZZ400')).answer.total === 1, String((last.match(/refused:[^\n]*/) || [''])[0]).slice(0, 110) + ' ops+' + (nops() - n6));
  return k.end();
})().catch(e => { console.log('§W-MIS-FORM ERROR ' + e.stack); process.exit(2); });
