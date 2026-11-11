// ⚠ DO NOT REMOVE — W-MIS-LOAD (bim-compiler prompts/CLI_ERP_IVR.md §13: mis.load). READ THE LOG; an exit code is not evidence.
//   L1 ISSUE (a preview that miscounts, names the wrong lines, or loses the bad ones) · L2 ISSUE (a dry run that writes) · L3 ISSUE (a partial load: the loader is all or nothing)
//   L4 ISSUE (the good lines do not arrive whole, or 007 becomes 7) · L5 ISSUE (what mis.list writes cannot be loaded back) · L6 ISSUE (refusals that are silent, or an ai writing without the gate)
//   Falsifiers: LOAD_BREAK=skiprejects (must FAIL L1) · dryrunwrites (must FAIL L2). Each claim can say VACUOUS/INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path');
const { kit, tmp, run, ROOT, DOOR } = require('./_kit');
const k = kit('W-MIS-LOAD');
(async () => {
  const dir = path.dirname(tmp('ml_')), oplog = path.join(dir, 'ops.jsonl'), env0 = { BIM_OBJECT_OPLOG: oplog, BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl') };
  const nops = () => { try { return fs.readFileSync(oplog, 'utf8').split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  const benv = Object.assign({}, env0, process.env.LOAD_BREAK ? { LOAD_BREAK: process.env.LOAD_BREAK } : {});
  const door = (line, actor, flags) => run(DOOR, (flags || []).concat(['--actor', actor || 'human', line]), benv).then(r => { let j = null; try { j = JSON.parse(r.out); } catch (e) { /* null */ } return { j, raw: r.out }; });
  const total = async () => { const r = await door('mis.list kind=C_BPartner limit=1'); return r.j && r.j.answer ? Number(r.j.answer.total) : -1; };
  const f = path.join(dir, 'suppliers.csv'), G = 'Standard Customers';
  const lines = ['Value,Name,C_BP_Group_ID', '007,Alpha Trading,' + G, 'ZZ008,"Beta, Ltd",' + G, 'ZZ009,Gamma Co,NoSuchGroup', 'ZZ010,Delta Co,' + G, 'ZZ011,Epsilon Co,AlsoMissing'];
  fs.writeFileSync(f, lines.join('\n') + '\n');
  const BADN = [3, 5];   // data rows (1 = first line after the header) that name a group that does not exist: known by construction, not by the loader
  const t0 = await total(), n0 = nops();
  // L1 + L2
  const p = await door('mis.load kind=C_BPartner file=' + f), a = p.j && p.j.answer;
  const rj = fs.existsSync(f.replace(/\.csv$/, '.rejected.csv')) ? fs.readFileSync(f.replace(/\.csv$/, '.rejected.csv'), 'utf8') : '', okc = fs.existsSync(f.replace(/\.csv$/, '.ok.csv')) ? fs.readFileSync(f.replace(/\.csv$/, '.ok.csv'), 'utf8') : '';
  k.L('preview status=' + (p.j && p.j.status) + ' rows=' + (a && a.rows) + ' ok=' + (a && a.ok) + ' rejected=' + (a && a.rejected.map(x => x.row).join(',')));
  const rows = (a && a.rows) || 0, rejected = (a && a.rejected) || [];
  k.chk('L1 the preview is exact: rows = ok + rejected; the rejected lines are exactly those that name a missing group, each reason names the column and the value; .rejected.csv holds exactly them and .ok.csv exactly the others', !!a && rows === lines.length - 1 && a.ok + rejected.length === rows && JSON.stringify(rejected.map(x => x.row)) === JSON.stringify(BADN) && rejected.every(x => /C_BP_Group_ID/.test(x.why.join(' ')) && /NoSuchGroup|AlsoMissing/.test(x.why.join(' '))) && /ZZ009/.test(rj) && /ZZ011/.test(rj) && !/ZZ010/.test(rj) && /ZZ010/.test(okc) && /^007,/m.test(okc) && !/ZZ009|ZZ011/.test(okc), 'rows=' + rows + ' ok=' + (a && a.ok) + ' rejected=' + rejected.map(x => x.row) + ' rejected.csv=' + rj.split('\n').length + ' lines ok.csv=' + okc.split('\n').length + ' lines');
  const cleanF = f.replace(/\.csv$/, '.ok.csv'), dc = await door('mis.load kind=C_BPartner file=' + cleanF), dca = dc.j && dc.j.answer;   // a CLEAN file in dry mode: the case where a commit would succeed if the dry run did not stop it
  k.chk('L2 a dry run writes nothing, on a file with rejects and on a clean one: the op-log and the kind\'s row count are unchanged, and the clean file reports 0 rejected and loaded=false', nops() === n0 && (await total()) === t0 && a && a.loaded === false && !!dca && dca.rejected.length === 0 && dca.ok === 3 && dca.loaded === false, 'ops+' + (nops() - n0) + ' rows ' + t0 + ' -> ' + (await total()) + ' clean: ok=' + (dca && dca.ok) + ' loaded=' + (dca && dca.loaded));
  // L3
  const n3 = nops(), c = await door('mis.load kind=C_BPartner dry=N file=' + f);
  k.chk('L3 a commit with rejected lines is refused, nothing written (all or nothing), and it says how many', c.j && c.j.status === 'refused' && /2 of 4|2 of 5|rejected/.test(c.j.why) && nops() === n3 && (await total()) === t0, String(c.j && c.j.why).slice(0, 110) + ' ops+' + (nops() - n3));
  // L4
  const okf = f.replace(/\.csv$/, '.ok.csv'), n4 = nops(), l4 = await door('mis.load kind=C_BPartner dry=N file=' + okf), t4 = await total();
  const seven = await door('mis.list kind=C_BPartner value=007 columns=Value,Name'), sv = seven.j && seven.j.answer && seven.j.answer.rows;
  k.chk('L4 loading .ok.csv inserts exactly its 3 rows through the model layer (the tree node and accounts ride the group), and 007 arrives as 007', l4.j && l4.j.status === 'ok' && l4.j.answer.loaded === true && t4 === t0 + 3 && l4.j.answer.keys.length === 3 && (l4.j.answer.opSummary['create:ad_treenodebp'] || 0) === 3 && !!sv && sv.length === 1 && sv[0].Value === '007', 'rows ' + t0 + ' -> ' + t4 + ' keys=' + (l4.j && l4.j.answer && l4.j.answer.keys) + ' ops=' + JSON.stringify(l4.j && l4.j.answer && l4.j.answer.opSummary) + ' 007=' + JSON.stringify(sv));
  // L5: list --csv of the loaded rows, unique column renamed, loaded back
  const lc = await door('mis.list kind=C_BPartner columns=Value,Name,C_BP_Group_ID value=ZZ008 names=Y', 'human', ['--csv']);
  const csvText = lc.raw || '', rt = path.join(dir, 'roundtrip.csv');
  fs.writeFileSync(rt, csvText.replace(/ZZ008/g, 'YY008').replace(/\r\n/g, '\n'));
  const lr = await door('mis.load kind=C_BPartner dry=N file=' + rt), back = await door('mis.list kind=C_BPartner columns=Value,Name value=YY008'), br = back.j && back.j.answer && back.j.answer.rows;
  k.chk('L5 round trip: what mis.list --csv writes loads back by name (a name with a comma, a lookup written as its name), same Name, the renamed Value', /Beta, Ltd/.test(csvText) && lr.j && lr.j.status === 'ok' && !!br && br.length === 1 && br[0].Name === 'Beta, Ltd', 'csv_lines=' + csvText.trim().split('\n').length + ' load=' + (lr.j && lr.j.status) + (lr.j && lr.j.why ? ' why=' + String(lr.j.why).slice(0, 100) : '') + ' back=' + JSON.stringify(br));
  // L6
  const bad = path.join(dir, 'bad.csv'); fs.writeFileSync(bad, 'Value,NoSuchColumn\nQ1,x\n'); const emp = path.join(dir, 'empty.csv'); fs.writeFileSync(emp, 'Value,Name\n');
  const n6 = nops(), r1 = await door('mis.load kind=C_BPartner file=' + path.join(dir, 'x.txt')), r2 = await door('mis.load kind=C_BPartner file=' + path.join(dir, 'missing.csv')), r3 = await door('mis.load kind=C_BPartner dry=N file=' + bad), r4 = await door('mis.load kind=C_BPartner file=' + emp);
  const ai = await door('mis.load kind=C_BPartner dry=N file=' + okf, 'ai');
  k.chk('L6 refusals say why and write nothing: not a .csv, unreadable, a header that is not a column (the loader\'s text), no data lines; an ai\'s load is held as a claim', [r1, r2, r3, r4].every(r => r.j && r.j.status === 'refused') && /\.csv/.test(r1.j.why) && /cannot read/.test(r2.j.why) && /No such column/.test(r3.j.why) && /no rows/.test(r4.j.why) && ai.j && ai.j.status === 'claim' && nops() === n6, [r1, r2, r3, r4].map(r => String(r.j && r.j.why).slice(0, 40)).join(' | ') + ' ai=' + (ai.j && ai.j.status) + ' ops+' + (nops() - n6));
  return k.end();
})().catch(e => { console.log('§W-MIS-LOAD ERROR ' + e.stack); process.exit(2); });
