// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// borrower.js — the borrower page (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §40, §40.1, §40.2 · Witness: W-MF-SEED, erp/tests/witness_mf_seed.js).
//
// A thin view over the device's OWN engine (idempiere.html?team=1 in a hidden frame). Nothing here is a business rule of its own:
//   * what the phone knows comes from the engine's local tables (C_Invoice / C_InvoicePaySchedule / C_AllocationLine delivered DOWN by the POS plan, B2/B3/B5; its own I_Payment rows);
//   * the open balance is DERIVED on every render (grand total minus the allocations head office posted, FL-2) - no balance is ever stored;
//   * a slip is checked by whichever adapter the device's C_PaymentProcessor row names (slipverify/slipverify.js): the page never names a provider;
//   * the result is written as ONE I_Payment row in legacy's processor-response columns (R_PnRef, R_AuthCode, R_Result, R_RespMsg, IsApproved); the Visit (TeamSync) carries it up (plan row B4);
//   * a ToDo is a DERIVED view: it exists while a row waits for the service's acknowledgement, and is gone the moment the row is acknowledged.
(function () {
  'use strict';
  var BANK_ACCOUNT = 100;                                    // the receiving bank account the processor row is bound to (GardenWorld C_BankAccount 100)
  var CLASS_PREFIX = 'org.kernel.slipverify.';
  var E = null;                                              // the engine window
  var $ = function (id) { return document.getElementById(id); };
  var q = function (s) { return "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'"; };
  var round2 = function (n) { return Math.round(Number(n) * 100) / 100; };
  var money = function (n) { return Number(n).toFixed(2); };
  var chain = Promise.resolve();                             // actions run one at a time
  function serial(fn) { var p = chain.then(fn, fn); chain = p.catch(function () {}); return p; }
  function log(s) { try { console.log(s); } catch (e) { /* logging never breaks the page */ } }

  // ── the engine (device-local reads and writes through the ERP's own path) ──
  function rows(sql) {
    return new Promise(function (res) { E.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(sql)); return { ok: true }; } }, function () {}); });
  }
  function commit(op, table) {                               // -> the created id (create) or true; null on timeout
    return new Promise(function (res) {
      var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === table) { E.removeEventListener('overlay:committed', once); res(e.detail.createdId != null ? e.detail.createdId : true); } };
      E.addEventListener('overlay:committed', once); E.__crud.applyOp(op);
      setTimeout(function () { E.removeEventListener('overlay:committed', once); res(null); }, 8000);
    });
  }
  function create(table, fields) { return commit({ op_type: 'CRUD_CREATE', key: table, table: table, verb: 'create', fields: fields }, table); }
  function update(table, id, changes) { return commit({ op_type: 'CRUD_UPDATE', key: table, table: table, verb: 'update', id: id, changes: changes }, table); }
  function remove(table, id) { return commit({ op_type: 'CRUD_DELETE', key: table, table: table, verb: 'delete', id: id }, table); }

  // ── refused slips are a phone-local record (they are not declared to head office: a refused slip never becomes a receipt) ──
  var memLog = {};
  function logKey(bp) { return 'mf.refused.v1:' + bp; }
  function refusedList(bp) { try { var s = localStorage.getItem(logKey(bp)); return s ? JSON.parse(s) : []; } catch (e) { return memLog[bp] || []; } }
  function saveRefused(bp, list) { memLog[bp] = list; try { localStorage.setItem(logKey(bp), JSON.stringify(list)); } catch (e) { /* private window: kept in memory */ } }

  var S = { waiting: 0, bp: null, bpName: null, binding: null, adapter: null, iso: 'USD', ctx: null };

  // C_PaymentProcessor (AD_Table 398) has a dictionary row but no physical table in the shipped seed. The phone's own slip-verify service is a row of it, so the page makes the table on THIS device
  // (idempotent, outside the team base hash, the way ad_import_tables.js makes I_Order / I_Payment). DDL verbatim from build/erp/ad_full.db (sqlite3 .schema c_paymentprocessor).
  var PP_DDL = "CREATE TABLE IF NOT EXISTS \"c_paymentprocessor\" (\"c_paymentprocessor_id\" NUMERIC, \"ad_client_id\" NUMERIC, \"ad_org_id\" NUMERIC, \"isactive\" TEXT, \"created\" TEXT, \"createdby\" NUMERIC, \"updated\" TEXT, \"updatedby\" NUMERIC, \"name\" TEXT, \"description\" TEXT, \"c_bankaccount_id\" NUMERIC, \"ad_sequence_id\" NUMERIC, \"payprocessorclass\" TEXT, \"hostaddress\" TEXT, \"hostport\" NUMERIC, \"proxyaddress\" TEXT, \"proxyport\" NUMERIC, \"proxylogon\" TEXT, \"proxypassword\" TEXT, \"acceptvisa\" TEXT, \"acceptmc\" TEXT, \"acceptamex\" TEXT, \"acceptdiners\" TEXT, \"acceptdiscover\" TEXT, \"acceptcorporate\" TEXT, \"acceptcheck\" TEXT, \"acceptatm\" TEXT, \"requirevv\" TEXT, \"c_currency_id\" NUMERIC, \"costpertrx\" NUMERIC, \"commission\" NUMERIC, \"minimumamt\" NUMERIC, \"acceptdirectdebit\" TEXT, \"acceptdirectdeposit\" TEXT, \"c_paymentprocessor_uu\" TEXT, \"trxtype\" TEXT)";
  function ensureProcessorTable() { try { E.__idmpDb.run(PP_DDL); } catch (e) { log('🔴 §MF_DDL ' + e.message); } }

  async function whoAmI() {
    var c = E.TeamSync._scopeCtx(); S.ctx = c;
    if (!c || !c.person) return null;
    var r = await rows('SELECT c_bpartner_id AS id, name FROM c_bpartner WHERE lower(c_bpartner_uu)=' + q(String(c.person).toLowerCase()));
    return r.length ? r[0] : null;
  }
  async function readBinding() {
    var r = await rows("SELECT pp.c_paymentprocessor_id AS ppid, pp.name AS name, pp.payprocessorclass AS payprocessorclass, pp.hostaddress AS host, pp.hostport AS port, bap.userid AS branch, bap.password AS key FROM c_bankaccount_processor bap JOIN c_paymentprocessor pp ON pp.c_paymentprocessor_id = bap.c_paymentprocessor_id WHERE bap.isactive='Y' AND pp.isactive='Y' AND pp.payprocessorclass LIKE '" + CLASS_PREFIX + "%' ORDER BY pp.c_paymentprocessor_id");  // synthetic ids of local rows fall (-1, -2, ...): ascending = newest first
    return r.length ? r[0] : null;
  }
  // The adapter is whatever the ROW names: a different provider is another row and another adapter file, nothing here.
  async function adapterFor(binding) {
    var cls = binding.payprocessorclass;
    return window.SlipVerify.create(cls, { name: binding.name, host: binding.host, port: binding.port, branch: binding.branch, key: binding.key });
  }

  async function snapshot() {
    var bp = await whoAmI();
    var snap = { bp: bp, loans: [], slips: [], todo: [], refused: [] };
    if (!bp) return snap;
    S.bp = bp.id; S.bpName = bp.name;
    var inv = await rows("SELECT c_invoice_id AS id, documentno, grandtotal, dateinvoiced FROM c_invoice WHERE c_bpartner_id=" + Number(bp.id) + " AND grandtotal>0 ORDER BY dateinvoiced, c_invoice_id");
    for (var i = 0; i < inv.length; i++) {
      var sched = await rows('SELECT dueamt, duedate FROM c_invoicepayschedule WHERE c_invoice_id=' + inv[i].id + ' ORDER BY duedate');
      var al = await rows('SELECT COALESCE(SUM(COALESCE(amount,0)+COALESCE(discountamt,0)+COALESCE(writeoffamt,0)),0) AS a FROM c_allocationline WHERE c_invoice_id=' + inv[i].id);
      var alloc = Number(al[0].a);
      var open = round2(Number(inv[i].grandtotal) - alloc);                      // DERIVED (FL-2): grand total minus what head office allocated; never stored
      snap.loans.push({ id: inv[i].id, documentno: inv[i].documentno, total: Number(inv[i].grandtotal), open: open, schedule: sched.map(function (s) { return { due: String(s.duedate || '').slice(0, 10), amt: Number(s.dueamt) }; }) });
    }
    var all = await rows('SELECT i_payment_id AS id, invoicedocumentno AS inv, payamt, isapproved, r_pnref, r_authcode, r_result, r_respmsg, description AS qr FROM i_payment');
    snap.slips = all.sort(function (a, b) { return Math.abs(a.id) - Math.abs(b.id); });
    snap.refused = refusedList(bp.id);
    snap.todo = []; S.waiting = snap.slips.filter(function (r) { return r.isapproved === 'N' && !r.r_result; }).length;
    function waiting(list) { return list.filter(function (r) { return r.isapproved === 'N' && !r.r_result; }); }
    waiting(snap.slips).forEach(function (r) { snap.todo.push({ kind: 'wait', id: r.id, text: (r.r_respmsg || 'The service has not acknowledged this slip') + ' (' + money(r.payamt) + ' for ' + r.inv + '). When this phone is online it checks the slip again by itself; then it goes to head office at your next Visit.' }); });
    snap.refused.filter(function (x) { return x.kind === 'recheck'; }).forEach(function (x, ix) { snap.todo.push({ kind: 'resend', id: ix, text: x.msg + ' (' + money(x.amount) + ' for ' + x.invoice + '). Please send a correct slip.' }); });
    return snap;
  }

  // ── render ──
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  async function render() {
    var sn = await snapshot(), pair = null;
    try { pair = await E.TeamSync.pairState(); } catch (e) { /* not paired yet */ }
    $('b-pair').textContent = sn.bp ? 'paired · ' + sn.bp.name : (pair && pair.enrolled ? 'paired · not bound to a customer' : 'not paired');
    $('b-who').textContent = sn.bp ? '· ' + sn.bp.name : '';
    $('b-code').textContent = pair && pair.device ? 'This phone: ' + String(pair.device).slice(0, 8) : '';
    $('b-net').textContent = navigator.onLine === false ? 'offline' : 'online'; $('b-net').className = 'chip ' + (navigator.onLine === false ? 'warn' : 'ok');
    $('b-loans').innerHTML = sn.loans.map(function (l) {
      return '<div class="card" data-loan="' + esc(l.documentno) + '"><div class="row"><b>Loan ' + esc(l.documentno) + '</b><span class="mut">total ' + money(l.total) + '</span></div>' +
        '<div class="row"><span class="mut">Open (per head office books)</span><span class="big" data-open>' + money(l.open) + '</span></div>' +
        '<ul>' + l.schedule.map(function (s) { return '<li class="row mut" data-due><span>' + esc(s.due) + '</span><span>' + money(s.amt) + '</span></li>'; }).join('') + '</ul></div>';
    }).join('') || '<div class="card mut">' + (sn.bp ? 'No loan yet.' : 'This phone is not bound to a customer yet.') + '</div>';
    var sel = $('b-invoice'), cur = sel.value;
    sel.innerHTML = sn.loans.map(function (l) { return '<option value="' + esc(l.documentno) + '">' + esc(l.documentno) + ' - open ' + money(l.open) + '</option>'; }).join('');
    if (cur) sel.value = cur;
    $('b-todo').innerHTML = sn.todo.map(function (t) { return '<li class="card" data-todo="' + t.kind + '">' + esc(t.text) + (t.kind === 'resend' ? ' <button data-dismiss="' + t.id + '">Done</button>' : '') + '</li>'; }).join('');
    var items = sn.slips.map(function (r) {
      var st = r.isapproved === 'Y' ? 'received' : (r.r_result ? 'refused' : 'waiting');
      var label = st === 'received' ? '<span class="ok">Payment received</span>' : '<span class="warn">Waiting: ' + esc(r.r_respmsg) + '</span>';
      return '<li class="card" data-slip-state="' + st + '"><div class="row"><span>' + money(r.payamt) + ' · ' + esc(r.inv) + '</span>' + label + '</div>' + (r.r_pnref ? '<div class="mut">ref ' + esc(r.r_pnref) + '</div>' : '') + '</li>';
    }).concat(sn.refused.map(function (x) { return '<li class="card" data-slip-state="refused"><div class="row"><span>' + money(x.amount) + ' · ' + esc(x.invoice) + '</span><span class="bad">Not accepted</span></div><div class="mut">' + esc(x.msg) + '</div></li>'; }));
    $('b-slips').innerHTML = items.join('');
    var b = await readBinding(); S.binding = b;
    $('cfg-state').textContent = b ? 'Using ' + b.name + ' (' + b.payprocessorclass + ')' : 'No slip-verify service is set up on this phone.';
    return sn;
  }
  function banner(kind, text) { var el = $('b-banner'); el.className = 'card ' + kind; el.setAttribute('data-banner', kind); el.textContent = text; }

  // ── a slip ──
  var iso = null;
  async function isoCode() {
    if (iso) return iso;
    var r = await rows("SELECT iso_code FROM c_currency WHERE c_currency_id = (SELECT c_currency_id FROM c_acctschema WHERE ad_client_id=11 ORDER BY c_acctschema_id LIMIT 1)");
    iso = r.length && r[0].iso_code ? r[0].iso_code : 'USD'; return iso;
  }
  function dateOf(at) { var d = at ? new Date(at) : new Date(); if (isNaN(d.getTime())) d = new Date(); return d.toISOString().slice(0, 10) + ' 00:00:00'; }
  async function rowFor(bind, slipQr, ref) {                  // local dedup (the bank's reference is the natural key of a slip; legacy Import Payment has none)
    var all = await rows('SELECT i_payment_id AS id, r_pnref, description AS qr FROM i_payment');
    return all.filter(function (r) { return (slipQr && r.qr === slipQr) || (ref && r.r_pnref === ref); })[0] || null;
  }
  function seenRefused(slipQr) { return refusedList(S.bp).some(function (x) { return x.qr === slipQr; }); }

  function submit() {
    return serial(async function () {
      var sn = await snapshot();
      if (!sn.bp) { banner('bad', 'This phone is not bound to a customer yet.'); return { ok: false, why: 'unbound' }; }
      var qr = $('b-qr').value.trim(), amount = round2($('b-amount').value), invoice = $('b-invoice').value;
      if (!qr || !(amount > 0) || !invoice) { banner('bad', 'Enter the slip QR code, the amount and choose the loan.'); return { ok: false, why: 'input' }; }
      var binding = await readBinding();
      if (!binding) { banner('bad', 'No slip-verify service is set up on this phone.'); return { ok: false, why: 'no-service' }; }
      if (await rowFor(binding, qr, null) || seenRefused(qr)) { banner('bad', 'This slip is already on this phone.'); log('§MF_DEDUP by=slip'); return { ok: false, why: 'duplicate' }; }
      var adapter = await adapterFor(binding), ans = await adapter.verify({ qr: qr, amount: amount, invoice: invoice });
      log('§MF_VERIFY service=' + ans.service + ' status=' + ans.status + ' ref=' + ans.ref);
      var base = { ad_client_id: 11, ad_org_id: 11, isactive: 'Y', i_isimported: 'N', isreceipt: 'Y', doctypename: 'AR Receipt', iso_code: await isoCode(), invoicedocumentno: invoice, description: qr };
      if (ans.status === 'approved') {
        if (await rowFor(binding, null, ans.ref)) { banner('bad', 'This bank reference is already on this phone (' + ans.ref + ').'); log('§MF_DEDUP by=ref ' + ans.ref); return { ok: false, why: 'duplicate' }; }
        var id = await create('i_payment', Object.assign(base, { payamt: ans.amount != null ? ans.amount : amount, datetrx: dateOf(ans.at), isapproved: 'Y', r_pnref: ans.ref, r_authcode: ans.authCode, r_result: 'approved', r_respmsg: String(ans.message || '').slice(0, 60) }));
        banner('ok', 'Payment received. ' + ans.service + ' confirmed ' + money(ans.amount != null ? ans.amount : amount) + ' (ref ' + ans.ref + ').'); await render(); return { ok: true, id: id, status: 'approved' };
      }
      if (ans.status === 'refused') {
        var rl = refusedList(sn.bp.id); rl.push({ qr: qr, msg: ans.message, service: ans.service, amount: amount, invoice: invoice, kind: 'refused' }); saveRefused(sn.bp.id, rl);
        banner('bad', ans.message); await render(); return { ok: true, status: 'refused' };
      }
      var msg = (ans.service + ' has not acknowledged this slip').slice(0, 60);
      var wid = await create('i_payment', Object.assign(base, { payamt: amount, datetrx: dateOf(null), isapproved: 'N', r_respmsg: msg }));
      banner('warn', msg + '. It is saved on this phone. When this phone is online it checks the slip again by itself, then it goes to head office at your next Visit.'); await render();
      return { ok: true, id: wid, status: 'unreached' };
    });
  }

  // the re-check: every row still waiting for the service is asked again (on coming online, on a timer, and before a Visit)
  function recheck() {
    return serial(async function () {
      var binding = await readBinding(); if (!binding || navigator.onLine === false) return { checked: 0 };
      var sn = await snapshot(), waiting = sn.slips.filter(function (r) { return r.isapproved === 'N' && !r.r_result; }), n = 0;
      if (!waiting.length) return { checked: 0 };
      var adapter = await adapterFor(binding);
      for (var i = 0; i < waiting.length; i++) {
        var w = waiting[i], ans = await adapter.verify({ qr: w.qr, amount: w.payamt, invoice: w.inv });
        log('§MF_RECHECK service=' + ans.service + ' status=' + ans.status + ' ref=' + ans.ref);
        if (ans.status === 'unreached') continue;
        n++;
        if (ans.status === 'approved') {
          var dup = (await rows('SELECT i_payment_id AS id FROM i_payment WHERE r_pnref=' + q(ans.ref))).filter(function (r) { return r.id !== w.id; });
          if (dup.length) { await remove('i_payment', w.id); var rl0 = refusedList(sn.bp.id); rl0.push({ qr: w.qr, msg: 'This bank reference is already on this phone (' + ans.ref + ').', service: ans.service, amount: w.payamt, invoice: w.inv, kind: 'recheck' }); saveRefused(sn.bp.id, rl0); continue; }
          await update('i_payment', w.id, { isapproved: 'Y', r_pnref: ans.ref, r_authcode: ans.authCode, r_result: 'approved', r_respmsg: String(ans.message || '').slice(0, 60), payamt: ans.amount != null ? ans.amount : w.payamt, datetrx: dateOf(ans.at) });
          banner('ok', 'Payment received. ' + ans.service + ' confirmed ' + money(ans.amount != null ? ans.amount : w.payamt) + ' (ref ' + ans.ref + ').');
        } else {
          await remove('i_payment', w.id);                                      // refused after the re-check: it never left this phone; the borrower is told to resend
          var rl = refusedList(sn.bp.id); rl.push({ qr: w.qr, msg: ans.message, service: ans.service, amount: w.payamt, invoice: w.inv, kind: 'recheck' }); saveRefused(sn.bp.id, rl);
          banner('bad', ans.message);
        }
      }
      await render(); return { checked: n };
    });
  }

  function visit() {
    return recheck().then(function () { return serial(async function () {
      var v = await E.TeamSync.visit(); await render();
      $('b-visitinfo').textContent = 'Last visit: ' + (v && v.replicaIn != null ? v.replicaIn + ' items received' : 'done');
      return v;
    }); });
  }

  // ── set-up of the slip-verify service: two local rows (legacy's C_PaymentProcessor + C_BankAccount_Processor) ──
  function saveService() {
    return serial(async function () {
      var name = $('cfg-name').value.trim(), cls = $('cfg-class').value.trim(), host = $('cfg-host').value.trim(), branch = $('cfg-branch').value.trim(), key = $('cfg-key').value;
      if (!name || cls.indexOf(CLASS_PREFIX) !== 0) { $('cfg-state').textContent = 'Name and an adapter class (' + CLASS_PREFIX + '...) are needed.'; return false; }
      // append-only: a new pair of rows is the new binding; the NEWEST pair wins (readBinding), older pairs stay as history (no row is edited)
      var ppid = await create('c_paymentprocessor', { ad_client_id: 11, ad_org_id: 11, isactive: 'Y', name: name, payprocessorclass: cls, hostaddress: host, hostport: 443, c_bankaccount_id: BANK_ACCOUNT });
      await create('c_bankaccount_processor', { ad_client_id: 11, ad_org_id: 11, isactive: 'Y', c_bankaccount_id: BANK_ACCOUNT, c_paymentprocessor_id: ppid, userid: branch, password: key });
      await render(); return true;
    });
  }

  async function boot() {
    var qs = new URLSearchParams(location.search); if (!qs.has('team')) qs.set('team', '1'); if (!qs.has('login')) qs.set('login', 'GardenAdmin');
    var f = $('b-engine'); f.src = 'idempiere.html?' + qs.toString();
    await new Promise(function (r) { f.addEventListener('load', r, { once: true }); });
    E = f.contentWindow;
    for (var i = 0; i < 1200 && !(E.TeamSync && E.__crud && E.__idmpDb); i++) await new Promise(function (r) { setTimeout(r, 150); });
    await E.TeamSync.ready; ensureProcessorTable();
    $('b-submit').addEventListener('click', function () { submit(); });
    $('b-visit').addEventListener('click', function () { visit(); });
    $('cfg-save').addEventListener('click', function () { saveService(); });
    $('b-join').addEventListener('click', function () { var s = $('b-space').value.trim(); if (s) E.TeamSync.join(s).then(function () { render(); }); });
    $('b-todo').addEventListener('click', function (e) { var d = e.target.getAttribute && e.target.getAttribute('data-dismiss'); if (d == null) return; serial(async function () { var sn = await snapshot(), rl = refusedList(sn.bp.id), k = -1; rl = rl.filter(function (x) { if (x.kind === 'recheck') { k++; return k !== Number(d); } return true; }); saveRefused(sn.bp.id, rl); await render(); }); });
    window.addEventListener('online', function () { recheck(); }); window.addEventListener('offline', function () { render(); });
    setInterval(function () { if (S.waiting > 0) recheck(); }, 3000);                // only while a slip waits for the service; nothing polls otherwise
    window.Borrower = { ready: true, submit: submit, recheck: recheck, visit: visit, render: render, snapshot: snapshot, engine: function () { return E; } };
    await render(); log('§MF_BOOT borrower page ready');
  }
  boot().catch(function (e) { log('🔴 §MF_BOOT ' + (e && e.stack || e)); });
})();
