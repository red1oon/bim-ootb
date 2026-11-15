// ⚠ DO NOT REMOVE — W-NINJA-CSV (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.15: ninja.exec file=<Table>.csv, a CSV whose header is the model, as legacy Ninja's HandleCSVImport). READ THE LOG; an exit code is not evidence.
//   C1 ISSUE (a header cell gets another type than legacy's seven name rules give, or the rules are taken in another order)
//   C2 ISSUE (a token X>Alt or X=a makes a column with > or = in its name; legacy NewEmptyTable.addColumn L144-152 cuts them, for a workbook ColumnSet too)
//   C3 ISSUE (a lookup by name does not find the record, or a line that does not load leaves the table made: legacy is ONE transaction)
//   C4 ISSUE (a line that is there already, by its first two columns, is inserted again) · C5 ISSUE (a CSV on a table that exists remakes its model, or loads a header that is not a column)
//   C6 ISSUE (dry=Y writes)
//   Falsifiers: NINJACSV_BREAK=norules (must FAIL C1) · nofirsttwo (must FAIL C4) · keepmodel (must FAIL C3). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Run: node common/door/tests/witness_ninja_csv.js > common/door/tests/logs/ninja_csv.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { kit, tmp, ROOT, DOOR } = require('./_kit');
const k = kit('W-NINJA-CSV'), BRK = process.env.NINJACSV_BREAK || '';
(async () => {
  const dir = path.dirname(tmp('nc_'));
  const env = { BIM_OBJECT_OPLOG: path.join(dir, 'c.ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, 'c.j.jsonl') };
  const door = (line) => new Promise((res) => { let o = ''; const p = cp.spawn(process.execPath, [DOOR, '--actor', 'human', line], { cwd: dir, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { o += d; });
    p.on('close', () => { let j = null; try { j = JSON.parse(o.split('\n').filter(l => l.charAt(0) === '{').pop()); } catch (x) { /* null */ } res(j || { status: 'unparseable', why: o.slice(-300) }); }); });
  const nops = () => { try { return fs.readFileSync(env.BIM_OBJECT_OPLOG, 'utf8').split('\n').filter(Boolean).length; } catch (x) { return 0; } };
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }).stdout || '[]');
  const ok = (j) => j && j.status === 'ok', put = (n, lines) => fs.writeFileSync(path.join(dir, n), lines.join('\n') + '\n');
  const bp = sq("SELECT c_bpartner_id AS id, name AS nm FROM c_bpartner WHERE ad_client_id=11 AND isactive='Y' AND name NOT LIKE '%,%' ORDER BY c_bpartner_id LIMIT 2");
  if (bp.length < 2) { k.incon('C1-C6', 'the seed holds fewer than two business partners of client 11 to look up'); return k.end(); }
  // the oracle: legacy's seven rules (HandleCSVImport.java L132-147), one cell per rule, plus a quirk (Income: rule 4) and a precedence case (Amount Date: rule 1 before rule 3)
  const H = [['Name', 'string'], ['Join Date', 'date'], ['Order Qty', 'quantity'], ['Credit Amount', 'amount'], ['IsVip', 'yesno'], ['C_BPartner_ID', null], ['Tier=Gold/Silver', 'list'], ['Income', 'yesno'], ['Amount Date', 'date']];
  const COL = ['Name', 'JoinDate', 'OrderQty', 'CreditAmount', 'IsVip', 'C_BPartner_ID', 'Tier', 'Income', 'AmountDate'];
  const L1 = ['Alpha,2026-01-05,3,100.5,Y,' + bp[0].nm + ',Go,N,2026-02-01', 'Beta,2026-01-06,4,200,N,' + bp[1].nm + ',Si,Y,2026-02-02', 'Alpha,2026-01-05,9,1,N,' + bp[0].nm + ',Go,N,2026-02-03'];
  put('CL_Client.csv', [H.map(h => h[0]).join(',')].concat(L1));

  // C6 first: dry writes nothing
  const n0 = nops(), dr = await door('ninja.exec file=CL_Client.csv dry=Y'), n1 = nops(), descDry = await door('mis.describe kind=CL_Client');
  k.chk('C6 dry=Y names the table, each header cell with its token and the lines it would load (2) and skip (1), and writes nothing (no op; the table is unknown afterwards)',
    ok(dr) && dr.answer.dry === true && dr.answer.csv && dr.answer.csv.table === 'CL_Client' && dr.answer.csv.toLoad === 2 && dr.answer.csv.skipped.length === 1 && n1 === n0 && !ok(descDry),
    'status=' + dr.status + ' load=' + (dr.answer && dr.answer.csv && dr.answer.csv.toLoad) + ' skip=' + (dr.answer && dr.answer.csv && dr.answer.csv.skipped.length) + ' ops ' + n0 + '->' + n1 + ' describe after=' + descDry.status);

  const run1 = await door('ninja.exec file=CL_Client.csv'), desc = await door('mis.describe kind=CL_Client');
  if (!ok(run1) || !ok(desc)) { k.incon('C1-C5', 'the CSV was not staged: ' + (run1.why || desc.why)); return k.end(); }
  const props = {}; (desc.answer.properties || []).forEach(p => { props[p.name] = p; });
  const lookupType = (props.C_BPartner_ID || {}).type, got = COL.map((c, i) => c + '=' + ((props[c] || {}).type || 'absent')), want = COL.map((c, i) => c + '=' + (H[i][1] || lookupType));
  k.chk('C1 the nine header cells take legacy\'s types: Name text, Join Date a date, Order Qty a quantity, Credit Amount an amount, IsVip yes/no, C_BPartner_ID a lookup, Tier=Gold/Silver a list of Go/Si, Income yes/no (rule 4, as legacy), Amount Date a date (rule 1 wins over rule 3)',
    got.join() === want.join() && /^(table|tabledirect|search)$/.test(String(lookupType)) && JSON.stringify((props.Tier || {}).values) === '["Go","Si"]', got.join(' ') + ' · lookup type=' + lookupType + ' · Tier values=' + JSON.stringify((props.Tier || {}).values));

  // C2 the token's name stops at > and = (CSV and a workbook ColumnSet both)
  put('CL_Site.csv', ['Name,C_BPartner_ID>Value,Code=X', 'North,' + bp[0].nm + ',N1']);
  const s2 = await door('ninja.exec file=CL_Site.csv'), d2 = await door('mis.describe kind=CL_Site');
  const NM = require(path.join(ROOT, 'erp/ninja_model.js')), P = NM.parseSheet([['Name', 'ColumnSet'], ['WB_Thing', 'Name,S#Code>Value,Note=x']], { format: 'romo' }), wbCols = ((P.model || P).tables[0].columns || []).filter(c => !c.isStandard).map(c => c.name).join(',');
  const siteCols = ok(d2) ? d2.answer.properties.map(p => p.name).filter(n => !/^(CL_Site_ID|CL_Site_UU|AD_Client_ID|AD_Org_ID|IsActive|Created|CreatedBy|Updated|UpdatedBy)$/.test(n)).join(',') : 'none';
  k.chk('C2 C_BPartner_ID>Value and Code=X make the columns C_BPartner_ID and Code (CSV), and a workbook ColumnSet Name,S#Code>Value,Note=x gives Name,Code,Note',
    ok(s2) && siteCols === 'Name,C_BPartner_ID,Code' && wbCols === 'Name,Code,Note', 'csv: ' + s2.status + ' ' + siteCols + ' · workbook: ' + wbCols);

  // C3 a lookup by name finds the record; a line that does not load leaves nothing (one transaction)
  const rows1 = ((await door('mis.list kind=CL_Client columns=Name,C_BPartner_ID')).answer || {}).rows || [];
  const alpha = rows1.filter(r => r.Name === 'Alpha')[0] || {};
  put('CL_Bad.csv', ['Name,C_BPartner_ID', 'Gamma,' + bp[0].nm, 'Delta,No Such Partner 9']);
  const nb0 = nops(), bad = await door('ninja.exec file=CL_Bad.csv'), nb1 = nops(), dBad = await door('mis.describe kind=CL_Bad');
  k.chk('C3 the lookup by name stores the record\'s id (Alpha -> ' + bp[0].nm + ' = ' + bp[0].id + '); a CSV with a name that is no record is refused naming it, and NOTHING is written: no op, the table is not made',
    String(alpha.C_BPartner_ID) === String(bp[0].id) && bad.status === 'refused' && /No Such Partner 9/.test(bad.why) && nb1 === nb0 && !ok(dBad),
    'Alpha.C_BPartner_ID=' + alpha.C_BPartner_ID + ' · bad=' + bad.status + ' ' + String(bad.why).slice(0, 120) + ' · ops ' + nb0 + '->' + nb1 + ' · CL_Bad after=' + dBad.status);

  // C4 the first two columns: a repeated line loads once, a second run loads nothing, two more lines load those two
  const names = (r) => ((r.answer || {}).rows || []).map(x => x.Name).sort().join(',');
  const afterRun1 = names(await door('mis.list kind=CL_Client columns=Name'));
  const n4 = nops(), again = await door('ninja.exec file=CL_Client.csv'), n5 = nops();
  put('CL_Client.csv', [H.map(h => h[0]).join(',')].concat(L1, ['Gamma,2026-01-07,1,5,N,' + bp[1].nm + ',Si,N,2026-02-04', 'Delta,2026-01-08,2,6,N,' + bp[0].nm + ',Go,N,2026-02-05']));
  const more = await door('ninja.exec file=CL_Client.csv'), afterMore = names(await door('mis.list kind=CL_Client columns=Name'));
  k.chk('C4 the line repeating Alpha 2026-01-05 loads once (Alpha,Beta); the same CSV again writes nothing; with Gamma and Delta added, those two load and nothing else',
    afterRun1 === 'Alpha,Beta' && ok(again) && again.answer.ops === 0 && n5 === n4 && ok(more) && more.answer.loaded === 2 && afterMore === 'Alpha,Beta,Delta,Gamma',
    'run1=' + afterRun1 + ' · again ops=' + (again.answer && again.answer.ops) + ' (' + n4 + '->' + n5 + ') · more loaded=' + (more.answer && more.answer.loaded) + ' -> ' + afterMore);

  // C5 a table that exists keeps its columns; a header that is not a column is refused
  const colsBefore = (await door('mis.describe kind=CL_Client')).answer.properties.map(p => p.name).join(',');
  put('CL_Client.csv', ['Name,Join Date,Note', 'Echo,2026-01-09,x']);
  const nc0 = nops(), extra = await door('ninja.exec file=CL_Client.csv'), nc1 = nops();
  put('CL_Client.csv', ['Name,Join Date', 'Echo,2026-01-09']);
  const fit = await door('ninja.exec file=CL_Client.csv'), colsAfter = (await door('mis.describe kind=CL_Client')).answer.properties.map(p => p.name).join(',');
  k.chk('C5 on the table that exists: a header naming Note (not a column) is refused and writes nothing; Name,Join Date loads its line, and the table\'s columns are the same as before',
    extra.status === 'refused' && /Note/.test(extra.why) && nc1 === nc0 && ok(fit) && fit.answer.loaded === 1 && colsAfter === colsBefore,
    'extra=' + extra.status + ' ops ' + nc0 + '->' + nc1 + ' · fit loaded=' + (fit.answer && fit.answer.loaded) + ' · columns same=' + (colsAfter === colsBefore));
  k.end();
})().catch(e => { console.log('§W-NINJA-CSV ERROR ' + e.stack); process.exit(2); });
