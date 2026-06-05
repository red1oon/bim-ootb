#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
//
// agent.js — the SELF-CONTAINED, INSTALL-SIDE Odoo migration extractor (delegate-to-install). This is the
//   `odoo_agent.zip` bundle entry-point: it carries its own `erp_kernel.js` + `odoo_adapter.js` siblings and a
//   `package.json` declaring the only external dep (sql.js), so a fresh user runs `npm install && node agent.js`
//   with nothing from the repo. It runs on the machine that HAS Odoo (Node), re-pulls SO S00023's O2C chain LIVE
//   from the running Odoo (default odoodemo, Odoo 17, :8069) via JSON-RPC, folds it through the SAME pure adapter
//   (odoo_adapter.js) + the 6 kernel verbs, SELF-VERIFIES (every hop commits, newVerbs=[], invoice GL ΣDr==ΣCr),
//   then EMITS ./odoo_chain.json = { meta, wfmc, KNOWN_VERBS, events:[{name,d,ops}], totals, gl } into the CURRENT
//   directory. You then load that file back in the browser (Migrate ▸ Odoo) and it re-folds through
//   window.ERPKernel — the browser NEVER reaches Odoo; this agent is the recorded bridge (ERP.md
//   delegate-to-install doctrine). NON-INVENT: every value is a recorded Odoo row.  §-log first.
//   Run:  npm install && node agent.js          # → ./odoo_chain.json   (override creds via env, see README)
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var initSqlJs = require('sql.js');
var K = require('./erp_kernel');
var A = require('./odoo_adapter');

var HOST = process.env.ODOO_HOST || 'localhost', PORT = Number(process.env.ODOO_PORT || 8069);
var DB = process.env.ODOO_DB || 'odoodemo', LOGIN = process.env.ODOO_LOGIN || 'admin', PASSWORD = process.env.ODOO_PASSWORD || 'admin';
var SO = process.env.ODOO_SO || 'S00023';
var OUT = path.join(process.cwd(), 'odoo_chain.json');

function rpc(service, method, args) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service: service, method: method, args: args } });
    var req = http.request({ host: HOST, port: PORT, path: '/jsonrpc', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, function (res) {
      var d = ''; res.on('data', function (c) { d += c; }); res.on('end', function () {
        try { var j = JSON.parse(d); if (j.error) return reject(new Error(JSON.stringify(j.error.data && j.error.data.message || j.error))); resolve(j.result); }
        catch (e) { reject(e); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}
function n2(x) { return Number(x).toFixed(2); }

(async function () {
  var fails = 0; function ok(c, m, d) { if (!c) fails++; console.log('   ' + (c ? '🟢' : '🔴') + ' ' + m + (d ? ' — ' + d : '')); }
  console.log('\n══ ODOO-AGENT — extract+fold SO ' + SO + ' from the RUNNING odoo (' + DB + ' @ ' + HOST + ':' + PORT + ') ══\n');

  // ── connect ──
  var uid = await rpc('common', 'login', [DB, LOGIN, PASSWORD]);
  ok(!!uid, 'authenticated to live odoo', 'uid=' + uid);
  if (!uid) { console.log('\n§ODOO-AGENT FAIL auth\n'); process.exit(1); }
  var ex = function (model, method, args, kw) { return rpc('object', 'execute_kw', [DB, uid, PASSWORD, model, method, args, kw || {}]); };

  // ── extract the O2C chain LIVE (same shape as odoo_oracle.json; nothing fabricated) ──
  var so = (await ex('sale.order', 'search_read', [[['name', '=', SO]]], { fields: ['id', 'name', 'state', 'amount_untaxed', 'amount_tax', 'amount_total'] }))[0];
  ok(!!so, 'live SO found', so && (so.name + ' id=' + so.id + ' state=' + so.state));
  if (!so) { console.log('\n§ODOO-AGENT FAIL no-so\n'); process.exit(1); }
  var solines = await ex('sale.order.line', 'search_read', [[['order_id', '=', so.id], ['display_type', '=', false]]],
    { fields: ['product_id', 'product_uom_qty', 'qty_delivered', 'qty_invoiced', 'price_unit', 'price_subtotal', 'price_total'] });
  var inv = (await ex('account.move', 'search_read', [[['invoice_origin', '=', so.name], ['move_type', '=', 'out_invoice']]],
    { fields: ['id', 'name', 'state', 'move_type', 'amount_untaxed', 'amount_tax', 'amount_total', 'amount_residual', 'payment_state', 'invoice_origin'] }))[0];
  ok(!!inv, 'live invoice found', inv && (inv.name + ' ' + inv.payment_state));
  var gl = await ex('account.move.line', 'search_read', [[['move_id', '=', inv.id]]],
    { fields: ['name', 'account_id', 'debit', 'credit', 'balance', 'product_id', 'quantity', 'tax_line_id', 'display_type'] });
  var moves = await ex('stock.move', 'search_read', [[['sale_line_id', 'in', solines.map(function (l) { return l.id; })], ['state', '=', 'done']]],
    { fields: ['product_id', 'quantity', 'state'] });

  function pname(pid) { return pid ? pid[1] : ''; }
  var live = {
    meta: { so: so.name, so_id: so.id, invoice: inv.name, invoice_id: inv.id, payment: [], reconcile_amount: inv.amount_total, payment_state: inv.payment_state },
    sale_order: { name: so.name, state: so.state, amount_untaxed: so.amount_untaxed, amount_tax: so.amount_tax, amount_total: so.amount_total },
    sale_order_lines: solines.map(function (l) { return { product: pname(l.product_id), pid: l.product_id[0], qty: l.product_uom_qty, qty_delivered: l.qty_delivered, qty_invoiced: l.qty_invoiced, price_unit: l.price_unit, subtotal: l.price_subtotal, total: l.price_total }; }),
    delivery_moves: moves.map(function (m) { return { product: pname(m.product_id), pid: m.product_id[0], qty: m.quantity, state: m.state }; }),
    invoice: { name: inv.name, state: inv.state, move_type: inv.move_type, amount_untaxed: inv.amount_untaxed, amount_tax: inv.amount_tax, amount_total: inv.amount_total, amount_residual: inv.amount_residual, payment_state: inv.payment_state, invoice_origin: inv.invoice_origin },
    invoice_gl_lines: gl.filter(function (g) { return g.display_type !== 'line_section' && g.display_type !== 'line_note'; }).map(function (g) {
      return { name: g.name, account: g.account_id ? g.account_id[1] : '', debit: g.debit, credit: g.credit, balance: g.balance, product: pname(g.product_id), qty: g.quantity, is_tax: !!g.tax_line_id, display_type: g.display_type || 'product' }; }),
    payment: []
  };
  console.log('\n── live extract: SO ' + live.meta.so + ' lines=' + live.sale_order_lines.length + ' moves=' + live.delivery_moves.length +
    ' invoice=' + live.meta.invoice + ' gl=' + live.invoice_gl_lines.length + ' total=' + n2(live.meta.reconcile_amount) + ' (' + live.meta.payment_state + ')\n');

  // ── FOLD through the adapter + kernel verbs (self-verify the chain BEFORE writing it) ──
  var built = A.buildEvents(live);
  built.events.forEach(function (ev) { K.register(ev.d.docType, ev.d.action, function () { return ev.ops; }); });
  var SQL = await initSqlJs();
  var db = new SQL.Database(); K.initProjection(db);
  var qfn = function (s, p) { return K.query(db, s, p); };
  var usedVerbs = {}, mapped = 0;
  built.events.forEach(function (ev, i) {
    ev.ops.forEach(function (o) { usedVerbs[o.op_type] = 1; });
    var d = K.dispatch(db, { wfmc: built.wfmc, guards: [], query: qfn, actor: 'odoo:agent', baseTs: 1000 + i * 100 }, ev.d);
    if (d.ok) mapped++;
    ok(d.ok, 'event ' + (i + 1) + ' ' + ev.name + ' committed (' + ev.d.status + '→' + (d.to || '?') + ')', d.ok ? 'ops=' + d.applied : d.stage + ':' + d.reason);
  });
  var used = Object.keys(usedVerbs).sort();
  var newVerbs = used.filter(function (v) { return A.KNOWN_VERBS.indexOf(v) < 0; });
  var dr = live.invoice_gl_lines.reduce(function (a, g) { return a + Number(g.debit || 0); }, 0);
  var cr = live.invoice_gl_lines.reduce(function (a, g) { return a + Number(g.credit || 0); }, 0);
  ok(mapped === built.events.length, 'every hop migrated', mapped + '/' + built.events.length);
  ok(newVerbs.length === 0, 'newVerbs empty — Odoo folds with the existing 6 verbs', 'used=[' + used.join(',') + ']');
  ok(n2(dr) === n2(cr), 'invoice GL balances (ΣDr==ΣCr)', n2(dr) + '==' + n2(cr));

  // ── EMIT the chain file the browser loads (events carry their ops; wfmc is the odoo dictionary) ──
  var chain = {
    meta: { source: 'odoodemo (Odoo 17) live via odoo_agent.js', so: live.meta.so, so_id: live.meta.so_id,
      invoice: live.meta.invoice, invoice_id: live.meta.invoice_id, payment_state: live.meta.payment_state, host: HOST + ':' + PORT, db: DB },
    wfmc: built.wfmc,
    KNOWN_VERBS: A.KNOWN_VERBS,
    events: built.events.map(function (ev) { return { name: ev.name, d: ev.d, ops: ev.ops }; }),
    totals: { untaxed: live.sale_order.amount_untaxed, tax: live.sale_order.amount_tax, total: live.sale_order.amount_total, reconcile: live.meta.reconcile_amount },
    gl: { lines: live.invoice_gl_lines.map(function (g) { return { name: g.name, account: g.account, debit: g.debit, credit: g.credit, is_tax: g.is_tax }; }), dr: Number(n2(dr)), cr: Number(n2(cr)) }
  };
  fs.writeFileSync(OUT, JSON.stringify(chain, null, 2));
  console.log('\n§ODOO-AGENT events=' + chain.events.length + ' mapped=' + mapped + '/' + built.events.length +
    ' verbs=[' + used.join(',') + '] newVerbs=[' + newVerbs.join(',') + '] gl Dr==Cr=' + (n2(dr) === n2(cr)) +
    ' total=' + n2(chain.totals.total) + ' wrote ' + path.relative(process.cwd(), OUT) + ' bytes=' + fs.statSync(OUT).size);

  var pass = fails === 0;
  console.log('\n§ODOO-AGENT ' + (pass ? 'PASS' : 'FAIL') + ' (' + fails + ' fails)\n');
  process.exit(pass ? 0 : 1);
})().catch(function (e) { console.error('§ODOO-AGENT ERROR', e.message); process.exit(2); });
