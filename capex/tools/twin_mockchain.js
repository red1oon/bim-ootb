#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — capex/tools/twin_mockchain.js (spec prompts/CAPEX_DASHBOARD.md §5.60 build step d). READ THE LOG: §TWIN_MOCK_* lines; the exit code alone is not evidence.
// The 12-project throw-away scenario (capex/tools/td_scenario.js, the SAME definition film_testdata.js builds on legacy) built INSIDE the Kernel ERP twin through its own model layer (erp/tests/dd_common.js boot: the seed + patches +
// ModelLayer + DocActions, no browser, no web service): projects, phases with dates, lines, ticked phases, completed Project Issues (erp/model_projectissue.js: stock + project balance), purchase orders (draft or completed) and, for each completed
// purchase order, the chain the scenario's CHAIN names: receipt -> vendor invoice -> payment. The store is EXPORTED to a file (the dashboard's Source A reads it with adapters.loadSqlite): that file is the persistence, the seed is untouched,
// teardown = delete the file. Product names/values are the scenario's neutral ones. Determinism: dates are relative to --today, ids from the model layer.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/twin_mockchain.js [--today=YYYY-MM-DD] [--out=<file>] [--only=TD_VALUE] [--keep-seed]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), ROOT = path.join(__dirname, '..', '..'), SC_ = require('./td_scenario.js'), DD = require(path.join(ROOT, 'erp/tests/dd_common.js')), log = console.log;
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').slice(k.length + 3);
async function build(o) {
  o = o || {}; const TODAY = o.today || arg('today') || new Date().toISOString().slice(0, 10), OUT = o.out || arg('out') || path.join(os.homedir(), '.cache/capex_film/twin_mock/erp_twin.db'), ONLY = o.only || arg('only');
  process.env.TODAY = TODAY; const day = off => new Date(Date.parse(TODAY + 'T00:00:00Z') + off * 864e5).toISOString().slice(0, 10) + ' 00:00:00';
  const H = await DD.boot({}); H.A.bind(H.q); ['model_project.js', 'model_projectissue.js'].forEach(m => require(path.join(ROOT, 'erp', m)));
  const q = H.q, one = H.one, errs = [];
  const must = (r, what) => { if (!r || r.ok === false) { const m = ((r && r.log) || []).filter(l => /SEVERE|ERR|WF/.test(l)).slice(0, 2).join(' | ').slice(0, 260); throw new Error(what + ' refused: ' + ((r && r.msg) || '') + ' ' + m); } return r; };
  const save = (t, f, what) => { must(H.save(t, f), what || t); return H.lastId(t); };
  const bp = one("select c_bpartner_id as b from c_bpartner where ad_client_id=11 and isvendor='Y' order by 1 limit 1").b, loc = one('select c_bpartner_location_id as l from c_bpartner_location where c_bpartner_id=?', [bp]).l;
  const dt = c => one("select c_doctype_id as d from c_doctype where ad_client_id=11 and docbasetype=? order by c_doctype_id limit 1", [c]).d, DTR = 122, DTO = dt('POO'), DTI = dt('API'), DTP = dt('APP');
  const term = one("select c_paymentterm_id as t from c_paymentterm where ad_client_id=11 and name='Immediate'").t, wh = 103, pl = 102;
  const cat = save('M_Product_Category', { ad_client_id: 11, ad_org_id: 0, value: 'TD Materials (test data)', name: 'TD Materials (test data)', plannedmargin: 0, isdefault: 'N' }, 'category');
  const prods = {}; SC_.PRODUCTS.forEach(([v, n, , p]) => { prods[v] = save('M_Product', { ad_client_id: 11, ad_org_id: 0, value: v, name: n, description: 'throw-away test data', c_uom_id: 100, c_taxcategory_id: 107, producttype: 'I', isstocked: 'N', ispurchased: 'Y', issold: 'N', m_product_category_id: cat }, 'product ' + v); });
  const BD = await import(path.join(ROOT, 'erp/plugins/bim_document.mjs')); BD.ensureTaskDateColumns({ run: (a, b) => H.db.run(a, b), query: (a, b) => q(a, b) });   // the plugin's own physical columns (§5.58)
  const made = [];
  for (const sc of SC_.SC) {
    const [v, n, off, durs, ticked, k, iss, po] = sc; if (ONLY && ONLY !== v) continue;
    try {
      const pid = save('C_Project', { ad_client_id: 11, ad_org_id: 11, value: v, name: n + ' (test data)', c_currency_id: 100, issummary: 'N' }, 'project ' + v); let t = off; const phs = [];
      durs.forEach((d, i) => { const s = t; t += d; const ph = save('C_ProjectPhase', { ad_client_id: 11, ad_org_id: 11, c_project_id: pid, name: SC_.PH[i], seqno: (i + 1) * 10, startdate: day(s), enddate: day(s + d), iscomplete: 'N' }, 'phase ' + SC_.PH[i]); phs.push(ph);
        SC_.PRODUCTS.forEach(([pv, pn, q0, p0]) => save('C_ProjectLine', { ad_client_id: 11, ad_org_id: 11, c_project_id: pid, c_projectphase_id: ph, m_product_id: prods[pv], plannedqty: +(q0 * k).toFixed(4), plannedprice: p0 }, 'line ' + pv)); });
      // §5.62: two dated tasks per phase (first half / second half of the phase window) so the project page's Schedule tab has task bars to show; written through the BIM Document plugin's own columns (§5.58)
      phs.forEach((ph, i) => { const ps = one('select startdate as s, enddate as e from c_projectphase where c_projectphase_id=?', [ph]), s0 = Date.parse(String(ps.s).slice(0, 10) + 'T00:00:00Z'), e0 = Date.parse(String(ps.e).slice(0, 10) + 'T00:00:00Z'), mid = s0 + Math.floor((e0 - s0) / 2 / 864e5) * 864e5, f = x => new Date(x).toISOString().slice(0, 10) + ' 00:00:00';
        [[SC_.PH[i] + ' \u2014 part 1', s0, mid], [SC_.PH[i] + ' \u2014 part 2', mid, e0]].forEach(([nm, a, b], k) => { const tid = save('C_ProjectTask', { ad_client_id: 11, ad_org_id: 11, c_projectphase_id: ph, name: nm, seqno: (k + 1) * 10 }, 'task'); H.db.run('UPDATE c_projecttask SET bim_startdate=?, bim_enddate=? WHERE c_projecttask_id=?', [f(a), f(b), tid]); }); });
      phs.slice(0, ticked).forEach(ph => must(H.update('C_ProjectPhase', ph, { iscomplete: 'Y' }), 'tick phase ' + ph));
      (iss || '').split(',').filter(Boolean).forEach(x => { const [pr, qty] = x.split('x').map(Number), id = save('C_ProjectIssue', { ad_client_id: 11, ad_org_id: 11, c_project_id: pid, m_locator_id: 101, m_product_id: pr, movementqty: qty, movementdate: H.DAY }, 'issue'); must(H.docAction('C_ProjectIssue', id, 'CO'), 'complete issue ' + id); });
      const stages = (SC_.CHAIN[v] || []).slice(); let nChain = 0;
      (po || '').split(',').filter(Boolean).forEach(one_ => {
        const draft = /^d:/.test(one_), [pl_, pr_] = one_.replace(/^d:/, '').split('@'), [prod, qty] = pl_.split('x').map(Number), price = Number(pr_);
        const oid = save('C_Order', { ad_client_id: 11, ad_org_id: 11, c_doctype_id: DTO, c_doctypetarget_id: DTO, issotrx: 'N', c_bpartner_id: bp, c_bpartner_location_id: loc, m_warehouse_id: wh, m_pricelist_id: pl, c_currency_id: 100, c_paymentterm_id: term, c_project_id: pid, dateordered: H.DAY, dateacct: H.DAY }, 'order');
        const olid = save('C_OrderLine', { ad_client_id: 11, ad_org_id: 11, c_order_id: oid, m_product_id: prod, qtyordered: qty, qtyentered: qty, priceentered: price, priceactual: price, pricelist: price, c_project_id: pid, c_projectphase_id: phs[0] }, 'order line');   // legacy film_progress passes PriceActual explicitly too (§5.60 retraction 2)
        if (draft) return; must(H.docAction('C_Order', oid, 'CO'), 'complete order ' + oid);
        const stage = stages.shift(); if (!stage || stage === 'ordered') { nChain++; return; }
        const rid = save('M_InOut', { ad_client_id: 11, ad_org_id: 11, c_doctype_id: DTR, issotrx: 'N', movementtype: 'V+', c_bpartner_id: bp, c_bpartner_location_id: loc, m_warehouse_id: wh, c_order_id: oid, c_project_id: pid, movementdate: H.DAY, dateacct: H.DAY }, 'receipt');
        save('M_InOutLine', { ad_client_id: 11, ad_org_id: 11, m_inout_id: rid, c_orderline_id: olid, m_product_id: prod, movementqty: qty, qtyentered: qty, c_uom_id: 100, m_locator_id: 101 }, 'receipt line'); must(H.docAction('M_InOut', rid, 'CO'), 'complete receipt ' + rid);
        if (stage !== 'received') {
          const iid = save('C_Invoice', { ad_client_id: 11, ad_org_id: 11, c_doctype_id: DTI, c_doctypetarget_id: DTI, issotrx: 'N', c_bpartner_id: bp, c_bpartner_location_id: loc, m_pricelist_id: pl, c_currency_id: 100, c_paymentterm_id: term, c_order_id: oid, c_project_id: pid, dateinvoiced: H.DAY, dateacct: H.DAY }, 'invoice');
          save('C_InvoiceLine', { ad_client_id: 11, ad_org_id: 11, c_invoice_id: iid, c_orderline_id: olid, m_product_id: prod, qtyinvoiced: qty, qtyentered: qty, priceentered: price, priceactual: price, pricelist: price, c_uom_id: 100, c_project_id: pid }, 'invoice line'); must(H.docAction('C_Invoice', iid, 'CO'), 'complete invoice ' + iid);
          const gt = Number(one('select grandtotal as g from c_invoice where c_invoice_id=?', [iid]).g), amt = stage === 'partpaid' ? +(gt / 2).toFixed(2) : gt;
          const ba = one('select c_bankaccount_id as b from c_bankaccount where ad_client_id=11 order by 1 limit 1');
          const payid = save('C_Payment', { ad_client_id: 11, ad_org_id: 11, c_doctype_id: DTP, isreceipt: 'N', c_bpartner_id: bp, c_invoice_id: iid, c_order_id: oid, c_project_id: pid, c_currency_id: 100, payamt: amt, datetrx: H.DAY, dateacct: H.DAY, c_bankaccount_id: ba && ba.b, tendertype: 'K', trxtype: 'S' }, 'payment'); must(H.docAction('C_Payment', payid, 'CO'), 'complete payment ' + payid);
        }
        nChain++;
      });
      made.push({ value: v, projectId: pid, phases: phs.length, ticked, issues: (iss || '').split(',').filter(Boolean).length, pos: (po || '').split(',').filter(Boolean).length, chain: nChain });
      log('§TWIN_MOCK ' + v + ' #' + pid + ' phases=' + phs.length + ' ticked=' + ticked + ' balance=' + one('select projectbalanceamt as b from c_project where c_project_id=?', [pid]).b + ' chain=' + nChain);
    } catch (e) { errs.push(v + ': ' + String(e.message).slice(0, 300)); log('§TWIN_MOCK_ERROR ' + v + ' ' + String(e.message).slice(0, 300)); }
  }
  // the seed carries three demo projects of its own (Landscape, Standard, Hospital, other currencies, with their own orders and issues): a film or a page that shows THIS store must not show them ("Total projects" counts inactive ones too).
  //   They are removed from the EXPORT with their documents (plain DELETE on the in-memory copy that is exported; the seed file is untouched), counted in the log, unless --keep-seed.
  if (!(o.keepSeed || arg('keep-seed'))) {
    const mine = SC_.SC.map(r => r[0]), ids = q('select c_project_id as id, value as v from c_project').filter(r => mine.indexOf(r.v) < 0).map(r => r.id), L = ids.join(',');
    if (ids.length) { const cnt = t => Number(q('select count(*) as n from ' + t + ' where c_project_id in (' + L + ')')[0].n), before = {};
      ['c_projectissue', 'c_projectline', 'c_projectphase', 'c_order', 'c_project'].forEach(t => { before[t] = cnt(t); });
      H.db.run('DELETE FROM c_orderline WHERE c_order_id IN (SELECT c_order_id FROM c_order WHERE c_project_id IN (' + L + '))'); H.db.run('DELETE FROM c_projecttask WHERE c_projectphase_id IN (SELECT c_projectphase_id FROM c_projectphase WHERE c_project_id IN (' + L + '))');
      ['c_projectissue', 'c_projectline', 'c_projectphase', 'c_order', 'c_project'].forEach(t => H.db.run('DELETE FROM ' + t + ' WHERE c_project_id IN (' + L + ')'));
      log('§TWIN_MOCK seed demo projects removed from the export ids=' + L + ' rows=' + JSON.stringify(before)); }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, Buffer.from(H.db.export()));
  log('§TWIN_MOCK_BUILT file=' + OUT + ' bytes=' + fs.statSync(OUT).size + ' projects=' + made.length + '/' + (ONLY ? 1 : SC_.SC.length) + ' errors=' + errs.length + ' today=' + TODAY);
  return { made, errs };
}
if (require.main === module) build().then(r => process.exit(r.errs.length ? 1 : 0)).catch(e => { console.error('§TWIN_MOCK_FATAL ' + (e.stack || e)); process.exit(2); });
module.exports = { build };
