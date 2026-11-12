#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-TWIN-CHAIN (spec prompts/CAPEX_DASHBOARD.md §5.60 build step e). READ THE LOG: verdict = §TWIN_CHAIN_VERDICT; 0 rows judged = INCONCLUSIVE.
// ISSUE it proves/disproves: "the single-kernel film shows a supply chain the twin's own operations never produced": the 12-project scenario is built by capex/tools/twin_mockchain.js through the model layer (no file is trusted),
// then read through the dashboard's own adapter (fromSqlite) + tiles.projectDetail().chain and compared with (a) an independent SQL recompute of the same store and (b) the stages the scenario DECLARES (td_scenario.js CHAIN, never read by
// the tile code). W1 every project's chain rows == the SQL recompute (order, receipts, invoiced, paid, stage) · W2 the portfolio strip over the 12 projects == the scenario's {ordered 1, received 1, invoiced 1, paid 2} · W3 ticked
// phases and issue counts per project == the scenario · W4 every completed document of the chain carries its project (no chain document without C_Project_ID) · W5 the exported store is a real file the page can load (sql.js opens it, 12 TD projects).
// TWINCHAIN_BREAK=1 deletes one completed receipt from the store before reading and must FAIL W1 and W2. Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_twin_chain.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), initSqlJs = require('sql.js'), ROOT = path.join(__dirname, '..', '..'), SC_ = require(path.join(ROOT, 'capex/tools/td_scenario.js')), A = require(path.join(ROOT, 'capex/adapters.js')), T = require(path.join(ROOT, 'capex/tiles.js'));
const BREAK = process.env.TWINCHAIN_BREAK === '1', log = console.log, TODAY = '2026-11-12';
let judged = 0, fails = 0, inc = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §TWIN_CHAIN ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
(async () => {
  const out = path.join(os.tmpdir(), 'twin_chain_' + process.pid + '.db'), { build } = require(path.join(ROOT, 'capex/tools/twin_mockchain.js'));
  const _l = console.log; const lines = []; console.log = (...a) => lines.push(a.join(' ')); let r; try { r = await build({ today: TODAY, out }); } finally { console.log = _l; }
  lines.filter(l => /TWIN_MOCK/.test(l)).slice(-1).forEach(l => log(l));
  if (r.errs.length || !fs.existsSync(out)) { ck('W5 the builder finished without errors and wrote the store', false, r.errs); return finish(); }
  const SQL = await initSqlJs(), db = new SQL.Database(fs.readFileSync(out)), q = (s, p) => { const x = db.exec(s, p || []); return x.length ? x[0].values.map(v => { const o = {}; x[0].columns.forEach((c, i) => { o[c] = v[i]; }); return o; }) : []; };
  if (BREAK) { const rc = q("select m_inout_id as i from m_inout r where r.docstatus='CO' and r.issotrx='N' and r.c_project_id is not null and not exists (select 1 from c_invoice v where v.c_order_id=r.c_order_id) order by 1 limit 1")[0]; if (rc) { db.run('DELETE FROM m_inout WHERE m_inout_id=?', [rc.i]); log('§TWIN_CHAIN_BREAK deleted receipt ' + rc.i); } }
  const td = q("select c_project_id as id, value as val from c_project where value like 'TD\\_%' escape '\\' order by c_project_id");
  ck('W5 the store opens and holds ' + td.length + ' TD projects (scenario ' + SC_.SC.length + ')', td.length === SC_.SC.length, td.length);
  const data = A.fromSqlite(db, {}); data.source = 'sqlite'; const strip = { ordered: 0, received: 0, invoiced: 0, paid: 0 }; let badRows = [], nRows = 0, badScen = [], badTick = [], badIssue = [];
  td.forEach(p => {
    const d = T.projectDetail(data, { today: TODAY }, p.id), sc = SC_.SC.find(s => s[0] === p.val); if (!sc) { badRows.push('no scenario row for ' + JSON.stringify(p)); return; }
    if (!d || !d.chain) { badRows.push(p.val + ': no chain'); return; }
    // (a) independent SQL recompute
    const pos = q("select c_order_id as id, docstatus as st from c_order where c_project_id=? and issotrx='N' order by c_order_id", [p.id]), want = [];
    pos.forEach(o => {
      const rc = q("select count(*) as n from m_inout where c_order_id=? and issotrx='N' and docstatus in ('CO','CL')", [o.id])[0].n, iv = q("select c_invoice_id as id, grandtotal as g from c_invoice where c_order_id=? and issotrx='N' and docstatus in ('CO','CL')", [o.id]),
        inv = iv.reduce((a, x) => a + Number(x.g), 0), ids = iv.map(x => x.id), pay = q("select payamt as a, c_invoice_id as i, c_order_id as o from c_payment where isreceipt='N' and docstatus in ('CO','CL') and c_project_id=?", [p.id]).filter(x => x.o === o.id || ids.indexOf(x.i) >= 0).reduce((a, x) => a + Number(x.a), 0);
      want.push({ order: o.id, received: rc, invoiced: inv, paid: pay, stage: ['CO', 'CL'].indexOf(o.st) < 0 ? 'unfinished' : inv > 0 ? (pay >= inv ? 'paid' : 'invoiced') : rc > 0 ? 'received' : 'ordered' });
    });
    const k = r => [r.order, r.received, +Number(r.invoiced).toFixed(2), +Number(r.paid).toFixed(2), r.stage].join('|'); nRows += want.length;
    if (d.chain.rows.map(k).sort().join(';') !== want.map(k).sort().join(';')) badRows.push(p.val + ' got ' + d.chain.rows.map(k).join(',') + ' want ' + want.map(k).join(','));
    d.chain.rows.forEach(x => { if (strip[x.stage] != null) strip[x.stage]++; });
    // (b) the scenario's own declaration
    const decl = SC_.CHAIN[p.val] || [], stages = d.chain.rows.filter(x => x.stage !== 'unfinished').map(x => x.stage), expect = decl.map(s => s === 'partpaid' ? 'invoiced' : s);
    if (stages.slice().sort().join() !== expect.slice().sort().join()) badScen.push(p.val + ' got ' + stages + ' want ' + expect);
    const ticked = (data.phases || []).filter(x => String(x.C_Project_ID) === String(p.id) && x.IsComplete === 'Y').length, nIss = q("select count(*) as n from c_projectissue where c_project_id=? and docstatus='CO'", [p.id])[0].n, wantIss = (sc[6] || '').split(',').filter(Boolean).length;
    if (ticked !== sc[4]) badTick.push(p.val + ' ' + ticked + '/' + sc[4]); if (nIss !== wantIss) badIssue.push(p.val + ' ' + nIss + '/' + wantIss);
  });
  ck('W1 chain rows == the independent SQL recompute for all ' + td.length + ' projects (' + nRows + ' purchase orders)', nRows > 0 && badRows.length === 0, badRows.slice(0, 3));
  ck('W2 the portfolio strip ' + JSON.stringify(strip) + ' == the scenario ' + JSON.stringify(SC_.STRIP) + ' and each project\'s completed stages == its declared CHAIN', JSON.stringify(strip) === JSON.stringify(SC_.STRIP) && badScen.length === 0, { strip, badScen });
  ck('W3 ticked phases and completed issues per project == the scenario', badTick.length === 0 && badIssue.length === 0, { badTick, badIssue });
  const TDO = "(select c_order_id from c_order where c_project_id in (select c_project_id from c_project where value like 'TD\\_%' escape '\\'))";   // the seed's own legacy documents are not ours: judge the orders OUR builder made
  const orphan = q("select (select count(*) from m_inout where c_order_id in " + TDO + " and c_project_id is null)+(select count(*) from c_invoice where c_order_id in " + TDO + " and c_project_id is null)+(select count(*) from c_payment where c_order_id in " + TDO + " and c_project_id is null) as n")[0].n;
  ck('W4 no chain document that names an order lacks its project (' + orphan + ')', orphan === 0);
  finish();
  function finish() { try { fs.unlinkSync(out); } catch (e) { } const v = fails ? 'FAIL' : (judged && !inc) ? 'PASS' : 'INCONCLUSIVE'; log('§TWIN_CHAIN_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1); }
})().catch(e => { console.error('§TWIN_CHAIN_ERROR ' + (e && e.stack || e)); process.exit(2); });
