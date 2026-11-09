// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — shared STOCK case of the three migration witnesses (W-BC-MIGRATE, W-SAP-MIGRATE, W-ODOO-FORM). READ THE LOG: the §E1 lines; the exit code is not the evidence.
// THE ISSUE it proves/disproves (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §ENGINE-SPEC §0 DEFECT, §5 E1): the opening stock a source converter emits is only a DRAFTED physical
//   inventory unless it is completed. After a load the tenant must hold: every opening m_inventory at DocStatus CO; m_storageonhand per product+locator == the sheet's QtyCount (summed per
//   key); m_transaction rows (one per line); Fact_Acct rows ONLY IF a cost was carried (none of the three sources carries one: reported, never asserted, never invented).
// Returns { judged, failed } and prints one §E1-STOCK-CHECK line per rule. judged==0 -> the caller prints INCONCLUSIVE (PRIMAL LAW #4).
'use strict';
module.exports = function openingStock(q, CID, header, rows, say, tag) {
  var h = function (n) { return header.indexOf(n); }, iP = Math.max(h('Value'), h('M_Product_ID>Value')), iL = Math.max(h('LocatorValue'), h('M_Locator_ID>Value')), iQ = h('QtyCount');
  var want = {}, n = 0;
  (rows || []).forEach(function (r) { if (!r[iP]) return; var k = r[iP] + '|' + r[iL]; want[k] = Math.round(((want[k] || 0) + Number(r[iQ])) * 1e6) / 1e6; n++; });
  var res = { judged: 0, failed: 0 };
  function chk(key, rule, ok, info) { res.judged++; if (!ok) res.failed++; say('  §E1-STOCK-CHECK ' + tag + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info).slice(0, 700))); }
  if (!n) { say('§E1-STOCK ' + tag + ' sheet has no opening-stock rows: nothing judged'); return res; }
  var inv = q('SELECT docstatus AS s, count(*) AS n FROM m_inventory WHERE ad_client_id=? GROUP BY docstatus', [CID]), tot = inv.reduce(function (a, r) { return a + r.n; }, 0);
  chk('doc-CO', 'every opening m_inventory of the tenant (' + tot + ') is DocStatus CO, none Drafted', tot > 0 && inv.length === 1 && inv[0].s === 'CO', inv);
  var got = {}; q('SELECT p.value AS p, l.value AS l, SUM(s.qtyonhand) AS q FROM m_storageonhand s JOIN m_product p ON p.m_product_id=s.m_product_id JOIN m_locator l ON l.m_locator_id=s.m_locator_id WHERE s.ad_client_id=? GROUP BY p.value, l.value', [CID])
    .forEach(function (r) { got[r.p + '|' + r.l] = Math.round(Number(r.q) * 1e6) / 1e6; });
  var diff = Object.keys(want).filter(function (k) { return got[k] !== want[k]; }), extra = Object.keys(got).filter(function (k) { return !(k in want) && got[k] !== 0; });
  chk('onhand', 'm_storageonhand per product+locator == the sheet QtyCount for all ' + Object.keys(want).length + ' keys (' + n + ' sheet rows), nothing else on hand',
    diff.length === 0 && extra.length === 0, { differ: diff.slice(0, 5).map(function (k) { return k + ' want ' + want[k] + ' got ' + got[k]; }), extra: extra.slice(0, 5), keys: Object.keys(got).length });
  var tx = q('SELECT count(*) AS n FROM m_transaction WHERE ad_client_id=?', [CID])[0].n;
  chk('transaction', 'm_transaction has one row per sheet key (' + Object.keys(want).length + ')', tx === Object.keys(want).length, { m_transaction: tx });
  var fa = q('SELECT count(*) AS n FROM fact_acct WHERE ad_client_id=?', [CID])[0].n;
  say('§E1-COST ' + tag + ' no source sheet carries a unit cost: Fact_Acct not asserted, no cost adjustment made, no cost invented (fact_acct rows now=' + fa + ')');
  return res;
};
