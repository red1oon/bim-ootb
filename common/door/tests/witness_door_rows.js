#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOOR-ROWS (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.V item 5). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: a list that silently truncates, a filter that is named but not applied, a sum that drifts as floating point, a column the dictionary does not hold that is accepted,
 *   or an empty kind answered as a plain 0. Every expected number is an independent SQL count/sum on the same bytes (sql.js here, not the engine under test).
 *   R1 erp.list Order docstatus=CO: total = independent count; shown = min(limit, total); every row has the filter value
 *   R2 default cap: object.list Duplex Element answers shown=50 with total = independent count (more than 50), never the whole table
 *   R3 paging: offset 0 + offset 5 (limit 5) = the first 10 rows of the independent sorted SQL, in order, no overlap
 *   R4 an unknown column in a filter, in columns, and in sort each fail naming the column; a value with a quote is bound (matches 0), not run
 *   R5 erp.sum Order GrandTotal = the independent scaled-integer sum; the exact adder gives 0.1+0.2+0.3 = 0.6 where floats give 0.6000000000000001
 *   R6 sum of a text column is refused naming why
 *   R7 erp.group Order by DocStatus: each group's count = independent count(*) per value; the groups' counts add to the kind's row count
 *   R8 an ERP kind with no rows answers inconclusive on list, sum and group (never 0 as a result)
 *   R9 an AI actor may run the read verbs (harm read)
 * Falsifiers (each must make this witness FAIL): ROWS_BREAK=nofilter (R1, R5, R7) · ROWS_BREAK=floatsum (R5) · ROWS_BREAK=capoff (R2).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { kit, run, DOOR, ROOT } = require('./_kit');
const k = kit('W-DOOR-ROWS');
const SJ = (p) => path.join(ROOT, p);
const DUP = [process.env.FIXTURE_DB, path.join(os.homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db'), SJ('buildings/Duplex_extracted.db')].filter(Boolean).filter(f => fs.existsSync(f))[0];
(async () => {
  const SQL = await require(SJ('common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(SJ('common/lib/sql-wasm.wasm')) });
  const E = new SQL.Database(fs.readFileSync(SJ('erp/ad_seed.db')));
  const one = (db, sql) => { const r = db.exec(sql); return r.length ? r[0].values[0][0] : null; };
  const all = (db, sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
  const tmpd = fs.mkdtempSync(path.join(os.tmpdir(), 'rows_')), J = path.join(tmpd, 'j.jsonl'); let seq = 0;
  const door = async (line, actor, env) => { const r = await run(DOOR, ['--actor', actor || 'human', '--request', 'rw-' + (++seq), '--journal', J, line], env); let j = null; try { j = JSON.parse(r.out.trim()); } catch (e) {} return { j, r }; };
  const ans = (d) => d.j && d.j.answer;

  // R1
  const coN = Number(one(E, "SELECT count(*) FROM c_order WHERE docstatus='CO'")), r1 = await door('erp.list kind=Order docstatus=CO limit=5');
  const a1 = ans(r1);
  k.chk('R1 erp.list docstatus=CO: total = independent count (' + coN + '), shown = min(5,total), every row CO', !!a1 && a1.total === coN && a1.shown === Math.min(5, coN) && a1.rows.every(r => r.DocStatus === 'CO'), a1 ? 'total=' + a1.total + ' shown=' + a1.shown : (r1.j ? r1.j.status + ' ' + r1.j.why : r1.r.err.slice(-120)));

  // R2 / R3 on Duplex (object.*): a building dir holding only the fixture
  if (!DUP) { k.incon('R2/R3', 'no Duplex_extracted.db found (set FIXTURE_DB)'); }
  else {
    const bdir = fs.mkdtempSync(path.join(os.tmpdir(), 'rowsb_')); fs.copyFileSync(DUP, path.join(bdir, 'Duplex_extracted.db'));
    const env = { VIEWER_BLD_DIR: bdir, BIM_OBJECT_OPLOG: path.join(bdir, 'ops.jsonl') };
    const r2 = await door('object.list building=Duplex kind=Element columns=element_name', 'human', env), a2 = ans(r2);
    const M = new SQL.Database(fs.readFileSync(DUP)); let elN = null;
    try { elN = Number(one(M, 'SELECT count(*) FROM elements_meta')); } catch (e) {}
    if (!a2) k.incon('R2', 'object.list answered ' + (r2.j ? r2.j.status + ' ' + r2.j.why : r2.r.err.slice(-160)));
    else {
      k.chk('R2 default cap: shown=50, total > 50 and equals the kind\'s own count (not the whole table read out)', a2.shown === 50 && a2.total > 50 && (elN == null || a2.total === elN), 'shown=' + a2.shown + ' total=' + a2.total + ' independent=' + elN);
      const p1 = ans(await door('object.list building=Duplex kind=Element columns=element_name sort=element_name limit=5 offset=0', 'human', env)), p2 = ans(await door('object.list building=Duplex kind=Element columns=element_name sort=element_name limit=5 offset=5', 'human', env));
      if (!p1 || !p2) k.incon('R3', 'a page did not answer');
      else { const got = p1.rows.concat(p2.rows).map(r => r.element_name === undefined ? r.Element_Name : r.element_name); let want = null; try { want = all(M, 'SELECT element_name FROM elements_meta ORDER BY element_name LIMIT 10').map(x => x[0]); } catch (e) {}
        k.chk('R3 two pages of 5 = the first 10 rows of the independent sort, in order, no overlap', want && JSON.stringify(got) === JSON.stringify(want) && p1.offset === 0 && p2.offset === 5, 'got=' + JSON.stringify(got.slice(0, 3)) + '…'); }
    }
  }
  // R4
  const bad = [await door('erp.list kind=Order nosuchcol=1'), await door('erp.list kind=Order columns=DocumentNo,nosuchcol'), await door('erp.list kind=Order sort=nosuchcol')];
  k.chk('R4a an unknown column in a filter, in columns and in sort each fail naming it, with no rows', bad.every(d => d.j && d.j.status !== 'ok' && /nosuchcol/.test(String(d.j.why)) && !(ans(d) && ans(d).rows)), bad.map(d => d.j ? d.j.status : 'nojson').join(','));
  const inj = ans(await door('erp.list kind=Order documentno="x\' OR \'1\'=\'1"'));
  k.chk('R4b a value with a quote is bound, not run (matches 0 rows)', !!inj && inj.total === 0, inj ? 'total=' + inj.total : 'no answer');

  // R5
  const scaled = all(E, "SELECT CAST(ROUND(grandtotal*10000) AS INTEGER) FROM c_order WHERE docstatus='CO' AND grandtotal IS NOT NULL").reduce((x, r) => x + BigInt(r[0]), 0n);
  const wantSum = (() => { const neg = scaled < 0n, d = (neg ? -scaled : scaled).toString().padStart(5, '0'); return (neg ? '-' : '') + (d.slice(0, -4) + '.' + d.slice(-4)).replace(/0+$/, '').replace(/\.$/, ''); })();
  const a5 = ans(await door('erp.sum kind=Order column=GrandTotal docstatus=CO'));
  k.chk('R5a erp.sum GrandTotal (CO) = independent scaled-integer sum ' + wantSum, !!a5 && a5.sum === wantSum, a5 ? 'sum=' + a5.sum + ' n=' + a5.n : 'no answer');
  const OC = require('../object_cli.js');
  k.chk('R5b the exact adder: 0.1+0.2+0.3 = 0.6 (floats: ' + (0.1 + 0.2 + 0.3) + ')', OC.decSum(['0.1', '0.2', '0.3']) === '0.6' && (0.1 + 0.2 + 0.3) !== 0.6, OC.decSum(['0.1', '0.2', '0.3']));
  // R6
  const d6 = await door('erp.sum kind=Order column=DocumentNo');
  k.chk('R6 summing a text column is refused, naming why', d6.j && d6.j.status === 'refused' && /not a number column/.test(String(d6.j.why)), d6.j ? d6.j.status + ' ' + String(d6.j.why).slice(0, 70) : 'no json');

  // R7
  const a7 = ans(await door('erp.group kind=Order by=DocStatus')), per = all(E, 'SELECT docstatus, count(*) FROM c_order GROUP BY docstatus'), totalRows = Number(one(E, 'SELECT count(*) FROM c_order'));
  k.chk('R7 erp.group by DocStatus: each count = independent count(*) per value; counts add to the kind (' + totalRows + ')', !!a7 && per.length === a7.rows.length && per.every(([v, n]) => a7.rows.some(r => r.DocStatus === v && r.count === Number(n))) && a7.records === totalRows, a7 ? 'groups=' + a7.rows.length + ' records=' + a7.records : 'no answer');
  const a7f = ans(await door('erp.group kind=Order by=DocStatus docstatus=CO'));
  k.chk('R7b a filter narrows the groups (only CO, ' + coN + ')', !!a7f && a7f.rows.length === 1 && a7f.rows[0].count === coN, a7f ? JSON.stringify(a7f.rows) : 'no answer');

  // R8: an ERP table in the dictionary with no rows
  const names = all(E, "SELECT name, lower(tablename) FROM ad_table WHERE isactive='Y' AND ad_table_uu IS NOT NULL ORDER BY ad_table_id"); let empty = null;
  for (const [nm, tb] of names) { try { if (Number(one(E, 'SELECT count(*) FROM ' + tb)) === 0) { empty = nm; break; } } catch (e) {} }
  if (!empty) k.incon('R8', 'no empty kind in the ERP seed to judge');
  else { const ds = [await door('erp.list kind="' + empty + '"'), await door('erp.group kind="' + empty + '" by=' + 'Created')];
    k.chk('R8 empty kind "' + empty + '": list and group answer inconclusive, not ok', ds.every(d => d.j && d.j.status === 'inconclusive'), ds.map(d => d.j ? d.j.status : 'nojson').join(',')); }
  // R9
  const d9 = await door('erp.list kind=Order limit=2', 'ai');
  k.chk('R9 an AI actor may run the read verbs', d9.j && d9.j.status === 'ok', d9.j ? d9.j.status : 'no json');
  k.end();
})().catch(e => { console.log('§WITNESS_DOOR_ROWS verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
