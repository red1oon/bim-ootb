// ⚠ DO NOT REMOVE — Scope guard. W-INFOPROD-PARITY (bim-compiler prompts/ERP_DEPTH_FILM.md §7). READ tests/witness_infoprod_parity.log, exit code is not evidence.
// ISSUE it proves/disproves: "the SQL the twin's Info Product runs (ad_infowin.js rewriteFns of the dictionary SelectClause) is the SAME RULE as the
//   PL/pgSQL bomQtyOnHand/Available/Reserved/Ordered + bomPriceList/Std/Limit the legacy InfoProductWindow calls" — judged on the SAME rows: the pilot
//   (docker postgres, db idempiere_pilot, READ-ONLY) tables are copied into a scratch SQLite, the twin's generated SQL runs there, the pilot runs its own functions.
// VACUOUS when either side returns 0 comparable (product, warehouse) cells. Run: node tests/witness_infoprod_parity.js 2>&1 | tee tests/witness_infoprod_parity.log
'use strict';
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
global.window = global; global.document = {};
require('../ad_infowin.js');
const PG = (sql) => cp.execFileSync('docker', ['exec', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere_pilot', '-At', '-F', '|', '-c', sql], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(l => l.split('|'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'infoprod-parity-')), db = path.join(tmp, 'pilot.db');
const SQ = (sql) => cp.execFileSync('sqlite3', [db, sql], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(l => l.split('|'));
const TABLES = { m_product: 'm_product_id,isbom,producttype,isstocked,ad_client_id', m_locator: 'm_locator_id,m_warehouse_id', m_warehouse: 'm_warehouse_id,m_reservelocator_id',
  m_storageonhand: 'm_product_id,m_locator_id,qtyonhand', m_storagereservation: 'm_product_id,m_warehouse_id,issotrx,qty,isactive', m_productprice: 'm_product_id,m_pricelist_version_id,isactive,pricelist,pricestd,pricelimit' };
for (const [t, cs] of Object.entries(TABLES)) {   // copy the pilot's rows (client 11 + system) into the scratch SQLite
  const cols = cs.split(','); cp.execFileSync('sqlite3', [db, 'CREATE TABLE ' + t + ' (' + cols.map(c => c + ' TEXT').join(',') + ');']);
  const where = t === 'm_product' || t === 'm_storageonhand' || t === 'm_storagereservation' || t === 'm_productprice' ? ' WHERE m_product_id IN (SELECT m_product_id FROM m_product WHERE ad_client_id IN (0,11))' : '';
  const rows = PG('SELECT ' + cs + ' FROM ' + t + where);
  const ins = rows.map(r => 'INSERT INTO ' + t + ' VALUES (' + r.map(v => v === '' ? 'NULL' : "'" + v.replace(/'/g, "''") + "'").join(',') + ');').join('\n');
  cp.execFileSync('sqlite3', [db], { input: 'BEGIN;\n' + ins + '\nCOMMIT;' });
}
const prods = PG("SELECT m_product_id FROM m_product WHERE ad_client_id=11 AND isstocked='Y' AND isbom='N' AND producttype='I' AND m_product_id IN (SELECT m_product_id FROM m_storageonhand UNION SELECT m_product_id FROM m_storagereservation) ORDER BY 1").map(r => r[0]);
const whs = ['103', '104'], PLV = '105';   // HQ + Store Central; Export 2003
let cells = 0, bad = 0, nonzeroRes = 0;
const FN = [['bomQtyOnHand', 'bomQtyOnHand(P,W,0)'], ['bomQtyReserved', 'bomQtyReserved(P,W,0)'], ['bomQtyOrdered', 'bomQtyOrdered(P,W,0)'], ['bomQtyAvailable', 'bomQtyAvailable(P,W,0)']];
const num = (x) => Number(x);
for (const p of prods) for (const w of whs) {
  for (const [name, tpl] of FN) {
    const call = tpl.replace('P', p).replace('W', w);
    const leg = num(PG('SELECT ' + call)[0][0]);
    const twin = num(SQ('SELECT ' + window.AdInfoWindow.rewriteFns(tpl.replace('P', p).replace('W', w)))[0][0]);   // the SAME rewrite the window applies to the dictionary SelectClause
    cells++; if (name === 'bomQtyReserved' && leg !== 0) nonzeroRes++;
    if (leg !== twin) { bad++; console.log('  ❌ ' + call + ' legacy=' + leg + ' twin=' + twin); }
  }
}
for (const p of prods) for (const [name] of [['bomPriceList'], ['bomPriceStd'], ['bomPriceLimit']]) {
  const call = name + '(' + p + ',' + PLV + ')', leg = num(PG('SELECT ' + call)[0][0]), twin = num(SQ('SELECT ' + window.AdInfoWindow.rewriteFns(call))[0][0]);
  cells++; if (Math.abs(leg - twin) > 1e-9) { bad++; console.log('  ❌ ' + call + ' legacy=' + leg + ' twin=' + twin); }
}
console.log('§INFOPROD-PARITY products=' + prods.length + ' warehouses=' + whs.join(',') + ' cells=' + cells + ' mismatches=' + bad + ' nonzeroReservedCells=' + nonzeroRes);
const v = cells === 0 ? 'VACUOUS' : (nonzeroRes === 0 ? 'INCONCLUSIVE (no reserved qty in the population — Reserved rule not exercised)' : (bad ? 'FAIL' : 'PASS'));
console.log('§INFOPROD-PARITY ' + v); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(v === 'PASS' ? 0 : 1);
