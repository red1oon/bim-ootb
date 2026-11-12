#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-PROJECT-ISSUE (spec prompts/CAPEX_DASHBOARD.md §5.60 build step b). READ THE LOG: verdict = §PROJECT_ISSUE_VERDICT; an arm that judged nothing is INCONCLUSIVE.
// ISSUE it proves/disproves: "the twin has the c_projectissue table but NO DocAction class for it ('no DocAction class registered for c_projectissue'), so a Project Issue never completes on the twin: no stock movement, no
// project balance, no actual cost for the dashboard's Spent tile, while legacy does all three". Expected values are INDEPENDENT: the unit cost is read from m_cost by plain SQL, the stock from m_storageonhand.
// P1 physical columns == dictionary columns (27) · P2 a stocked issue (product 139, locator 101, qty 3) completes: DocStatus CO, project balance += qty x unit cost, on-hand -3, one W+ transaction of -3 · P2b line numbers 10, 20 ·
// P3 a NON-stocked product completes with no transaction and no storage change · P4 Reverse Correct returns balance and on-hand, original RE, reversal row linked · P5 legacy: the same issue through the web services on the
// test instance moves project balance and on-hand by the SAME amounts (TWIN CARDINAL RULE; leaves its rows on the disposable test instance, a refresh from the base seed removes them).
// PI_BREAK=1 skips the model registration and must FAIL P2. Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_project_issue.js
'use strict';
const path = require('path'), { execFileSync } = require('child_process'), ROOT = path.join(__dirname, '..', '..'), DD = require(path.join(ROOT, 'erp/tests/dd_common.js')), BREAK = process.env.PI_BREAK === '1', log = console.log;
let judged = 0, fails = 0, inc = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §PROJECT_ISSUE ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;
(async () => {
  const H = await DD.boot({}); H.A.bind(H.q); if (!BREAK) require(path.join(ROOT, 'erp/model_projectissue.js'));
  const q = H.q, one = H.one, bal = () => Number(one('select projectbalanceamt as b from c_project where c_project_id=100').b || 0), oh = () => Number(one('select coalesce(sum(qtyonhand),0) as v from m_storageonhand where m_product_id=139 and m_locator_id=101').v);
  // P1
  const dict = q("select lower(columnname) as c from ad_column where ad_table_id=(select ad_table_id from ad_table where tablename='C_ProjectIssue') and coalesce(columnsql,'')='' order by 1").map(r => r.c), phys = q("select name from pragma_table_info('c_projectissue') order by 1").map(r => r.name.toLowerCase());
  const miss = dict.filter(c => phys.indexOf(c) < 0), extra = phys.filter(c => dict.indexOf(c) < 0);
  ck('P1 physical c_projectissue columns == the ' + dict.length + ' dictionary columns (missing ' + (miss.join(',') || 'none') + ', extra ' + (extra.join(',') || 'none') + ')', dict.length === 27 && !miss.length && !extra.length);
  // unit cost, independent: the material cost element's current cost price of product 139 for the client's schema
  const unit = Number((one("select c.currentcostprice as p from m_cost c join m_costelement e on e.m_costelement_id=c.m_costelement_id where c.m_product_id=139 and e.costelementtype='M' and c.ad_org_id=0 and c.c_acctschema_id=101") || {}).p);
  const b0 = bal(), o0 = oh(), mk = (qty, prod) => H.save('C_ProjectIssue', { ad_client_id: 11, ad_org_id: 11, c_project_id: 100, m_locator_id: 101, m_product_id: prod || 139, movementqty: qty, movementdate: H.DAY }), id1 = (mk(3), H.lastId('c_projectissue'));
  const r = H.docAction('C_ProjectIssue', id1, 'CO'), st = one('select docstatus,processed,line from c_projectissue where c_projectissue_id=?', [id1]), tx = q('select movementtype,movementqty from m_transaction where c_projectissue_id=?', [id1]);
  ck('P2 a stocked issue completes: DocStatus CO (' + (r.status || '') + '), processed Y, balance +' + (bal() - b0).toFixed(4) + ' == 3 x ' + unit, r.ok && st && st.docstatus === 'CO' && st.processed === 'Y' && near(bal() - b0, 3 * unit) && unit > 0, { ok: r.ok, msg: r.msg, st });
  ck('P2a on-hand ' + o0 + ' -> ' + oh() + ' (-3) and one W+ transaction of -3', near(o0 - oh(), 3) && tx.length === 1 && tx[0].movementtype === 'W+' && near(tx[0].movementqty, -3), tx);
  const id2 = (mk(2), H.lastId('c_projectissue')); H.docAction('C_ProjectIssue', id2, 'CO');
  ck('P2b line numbers are 10 then 20 (getNextLine)', one('select line as l from c_projectissue where c_projectissue_id=?', [id1]).l === 10 && one('select line as l from c_projectissue where c_projectissue_id=?', [id2]).l === 20);
  // P3 non-stocked product
  const ns = one("select m_product_id as id from m_product where ad_client_id=11 and isstocked='N' limit 1"), b3 = bal(), t3 = Number(one('select count(*) as n from m_transaction').n), id3 = ns ? (mk(1, ns.id), H.lastId('c_projectissue')) : null;
  if (!ns) { inc++; log('  §PROJECT_ISSUE INCONCLUSIVE P3 no non-stocked product in the seed'); } else { const r3 = H.docAction('C_ProjectIssue', id3, 'CO');
    ck('P3 a non-stocked product completes with no transaction (' + t3 + ' -> ' + Number(one('select count(*) as n from m_transaction').n) + ') and no storage row for it', r3.ok && Number(one('select count(*) as n from m_transaction').n) === t3 && Number(one('select count(*) as n from m_storageonhand where m_product_id=?', [ns.id]).n) === 0, { msg: r3.msg }); }
  // P4 reverse id1
  const b4 = bal(), o4 = oh(), rv = H.docAction('C_ProjectIssue', id1, 'RC'), orig = one('select docstatus,reversal_id from c_projectissue where c_projectissue_id=?', [id1]), rrow = orig && orig.reversal_id ? one('select docstatus,movementqty,reversal_id from c_projectissue where c_projectissue_id=?', [orig.reversal_id]) : null;
  ck('P4 Reverse Correct: balance ' + b4.toFixed(2) + ' -> ' + bal().toFixed(2) + ' (-' + (3 * unit).toFixed(2) + '), on-hand ' + o4 + ' -> ' + oh() + ' (+3), original RE, reversal row qty -3 linked', rv.ok !== false && near(b4 - bal(), 3 * unit) && near(oh() - o4, 3) && orig && orig.docstatus === 'RE' && rrow && near(rrow.movementqty, -3) && Number(rrow.reversal_id) === id1, { rv: rv.ok, orig, rrow });
  // P5 legacy
  const BASE = 'http://localhost:8108', DB = 'idempiere_bimdoc', pg = s => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', DB, '-qtA'], { input: 'SET search_path=adempiere;\n' + s }).toString().trim();
  let up = false; try { up = (await fetch(BASE + '/webui/')).status === 200; } catch (e) { }
  if (!up) { inc++; log('  §PROJECT_ISSUE INCONCLUSIVE P5 the test instance does not answer on ' + BASE); }
  else {
    const Push = require(path.join(ROOT, 'viewer/erp_rest_push.js')), REST = BASE + '/ADInterface/services/rest/model_adservice/', X = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 }, J = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 };
    const crud = async (m, spec) => { const rr = await fetch(REST + m, { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: Push.buildCrudXml(X, spec) }); const s = Push.parseStandardResponse(await rr.text()); if (s.isError) throw new Error(spec.serviceType + ' refused: ' + s.error); return s; };
    const fl = f => Object.keys(f).map(column => ({ column, val: String(f[column]) })), lb = () => Number(pg('select projectbalanceamt from c_project where c_project_id=100')), lo = () => Number(pg('select coalesce(sum(qtyonhand),0) from m_storageonhand where m_product_id=139 and m_locator_id=101'));
    try {
      const lb0 = lb(), lo0 = lo(), line = Number(pg('select coalesce(max(line),0)+10 from c_projectissue where c_project_id=100'));
      const s = await crud('create_data', { serviceType: 'BridgeCreateProjectIssue', tableName: 'C_ProjectIssue', action: 'Create', fields: fl({ AD_Org_ID: 11, C_Project_ID: 100, Line: line, M_Locator_ID: 101, MovementQty: 3, MovementDate: H.DAY, M_Product_ID: 139, Description: 'W-PROJECT-ISSUE' }) });
      const rr = await fetch(REST + 'set_docaction', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ModelSetDocActionRequest: { ModelSetDocAction: { serviceType: 'BridgeCompleteProjectIssue', tableName: 'C_ProjectIssue', recordID: s.recordId, docAction: 'CO' }, ADLoginRequest: J } }) }), j = JSON.parse(await rr.text());
      const dbal = lb() - lb0, doh = lo0 - lo(), ls = pg('select docstatus from c_projectissue where c_projectissue_id=' + s.recordId);
      ck('P5 legacy: the same issue completes (' + ls + '); project balance +' + dbal.toFixed(4) + ' and on-hand -' + doh + ' == the twin (+' + (3 * unit).toFixed(4) + ', -3)', ls === 'CO' && near(dbal, 3 * unit) && near(doh, 3), { j: (j.StandardResponse || j).Error || j.message || 'ok' });
    } catch (e) { ck('P5 legacy issue', false, String(e.message).slice(0, 200)); }
  }
  const v = fails ? 'FAIL' : (judged && !inc) ? 'PASS' : 'INCONCLUSIVE'; log('§PROJECT_ISSUE_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { console.error('§PROJECT_ISSUE_ERROR ' + (e && e.stack || e)); process.exit(2); });
