// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — branch_admin.js: the Branch POS Admin page. READ THE LOG (§EODA_* lines of erp/tests/witness_eoda.js), exit codes are not evidence.
// Implementing bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §26.4: uniCenta's Manager / back office as a Team device of the branch Org. It never rings a sale. It reads the POS_TillHandoff rows (the row shape; no longer a table or an op) the tills put on the BRANCH RELAY at Close Cash and the main till collected (§38),
// shows the EODA screen, and makes the ONE send to head office: the tickets' real I_Order / I_Payment rows (flows F3 / B4, authored HERE, the tills hold theirs) + the branch-day statement (POS_BranchDayStatement, flow E1) in one
// atomic group, then ONE Visit. "Send EODA" needs every till closed or a logged override reason; "Send status now" is the same send marked PARTIAL and exists only as a pressed button (D2): there is no timer that sends.
// §37 Stock count (POS_PLUGIN_LOCAL_FIRST): an AD HOC, BLIND count of the branch's sales-floor locator keyed here; kept at the branch; only a count the supervisor ticked "Include this count in tonight's EODA" rides send() as I_Inventory rows.
// Between sends the page PEEKS the branch box with ONE list request per poll period (kds_link.js, §19.5) and Visits only when another device wrote.
(function () {
  'use strict';
  var E = null, EC = window.EodaCore, SD = window.SodaCore, S = { cfg: null, set: { tills: [], deposited: {}, batchSeq: {}, overrides: [], pollMs: 30000, sodaFanned: 0, receipts: [], counts: [], draft: [], countSeq: 0 }, day: null, view: null, tills: {}, kid: null, link: null, draws: 0 };
  var $ = function (s) { return document.querySelector(s); };
  var q = function (s) { return "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'"; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var money = function (c) { return (Number(c) / 100).toFixed(2); };
  function log(s) { try { console.log(s); if (window.PageStatus) window.PageStatus.fromLog(s); } catch (e) { /* never breaks the page */ } }
  if (window.PageStatus) window.PageStatus.start('admin');
  var chain = Promise.resolve(); function serial(fn) { var p = chain.then(fn, fn); chain = p.catch(function () {}); return p; }
  function rows(sql) { return new Promise(function (res) { E.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(sql)); return { ok: true }; } }, function () {}); }); }
  function depositGroup(ops) { return new Promise(function (res) { var t = setTimeout(function () { res({ committed: false, reason: 'timeout' }); }, 60000); E.__crud.applyOpGroup(ops, function (r) { clearTimeout(t); res(r); }); }); }
  var create = function (table, f) { return { op_type: 'CRUD_CREATE', key: table, table: table, verb: 'create', fields: f }; };
  function skey() { return 'branchadmin.v1:' + S.cfg.key; }
  function loadSet() { try { var s = JSON.parse(localStorage.getItem(skey()) || 'null'); if (s) Object.assign(S.set, s); } catch (e) { /* private window */ } }
  function saveSet() { try { localStorage.setItem(skey(), JSON.stringify(S.set)); } catch (e) { /* kept in memory */ } }
  function msg(t) { var el = $('#a-msg'); el.hidden = !t; el.textContent = t || ''; if (t) log('§EODA_MSG ' + t); }

  async function read() { return EC.fold(S.lan ? S.lan.handoffRows() : []); }   // §38: the shifts the tills put on the branch relay and the main till collected; the §26.3 POS_TillHandoff ops over the internet are gone
  // ── §38: the MAIN TILL's LAN ops. The flag is the till's own (set at the branch by its supervisor in Configuration, D13 / §40); this page runs the ops only where it is set, and TillLan refuses them elsewhere.
  function lanUrl() { var q = new URLSearchParams(location.search).get('relay'); try { return q || localStorage.getItem('branchrelay.url'); } catch (e) { return q; } }
  function lanSetup() {
    var tk = null, qk = new URLSearchParams(location.search).get('till'), lsk = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf('tilllan.v1:') === 0) lsk.push(k.slice(11)); } } catch (e) { /* none */ }
    lsk.forEach(function (k) { try { var st = JSON.parse(localStorage.getItem('tilllan.v1:' + k) || '{}'); if (st.main && st.main.on && (!qk || qk === k)) tk = k; } catch (e) { /* skip */ } });
    var url = lanUrl(), key = 'tilllan.main.v1:' + (tk || 'none'), st = {}; try { st = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { st = {}; }
    if (tk) { st.main = st.main || {}; st.main.on = true; }
    var lan = url ? window.CommPipe.httpPipe(url.replace(/\/+$/, '') + '/pipe', 'lan') : { put: async function () { throw new Error('no branch relay'); }, get: async function () { throw new Error('no branch relay'); }, list: async function () { throw new Error('no branch relay'); } };
    S.lan = window.TillLan.create({ tillKey: tk || 'none', isMain: true, lan: lan, state: st, expected: S.set.tills, now: Date.now, save: function () { try { localStorage.setItem(key, JSON.stringify(st)); } catch (e) { /* memory */ } }, log: log });
    S.netPipe = new URLSearchParams(location.search).get('pipe') ? window.CommPipe.httpPipe(new URLSearchParams(location.search).get('pipe'), 'net') : null;   // the internet relay: EODA up / SODA down + the shared-stream mirror, this page only
    S.lanPipe = lan; log('§LAN_ADMIN main=' + isMainTill() + ' till=' + (tk || '-') + ' relay=' + (url || 'none'));
  }
  async function lanCollect() {   // one pass: bridge the shared stream, collect the tills' lines, answer the dumb tills' stock questions; hands the per-till result to the §37 seam
    if (!isMainTill()) { var rf = S.lan ? S.lan.requireMain('collect') : { refused: 'not-main' }; msg(rf.message || 'Not the main till'); return rf; }
    if (S.netPipe) { try { await S.lan.mirror(S.netPipe, S.lanPipe); } catch (e) { log('§LAN_MIRROR skipped ' + (e && e.message)); } }
    var c = await S.lan.collect(); await S.lan.answerQueries();
    if (c.ok) collectTills({ reached: c.reached.map(function (t) { return { till: t, lines: Object.keys(S.lan.state.main.lines).filter(function (k) { return S.lan.state.main.lines[k].till === t; }).length }; }), notReached: c.notReached });
    await render(); return c;
  }
  var fmtSeries = function (s) { return Object.keys(s).sort().map(function (t) { return t + ' ' + s[t].first + '..' + s[t].last + ' x' + s[t].count; }).join(' | '); };
  async function render() {
    S.tills = await read(); var ds = EC.days(S.tills), cur = S.day;
    if (!cur || ds.indexOf(cur) < 0) cur = ds.length ? ds[ds.length - 1] : S.day || today();
    S.day = cur; var sel = $('#a-day'); sel.innerHTML = (ds.length ? ds : [cur]).map(function (d) { return '<option value="' + d + '"' + (d === cur ? ' selected' : '') + '>' + d + '</option>'; }).join('');
    var v = S.view = EC.screen(S.tills, S.set.tills, cur); S.draws++;
    $('#a-rows').innerHTML = v.tills.map(function (t) {
      return '<tr data-till="' + esc(t.tillKey) + '" data-closed="' + (t.closed ? 1 : 0) + '"><td>' + esc(t.tillKey) + '</td><td class="st">' + (t.closed ? 'closed' + (t.shifts > 1 ? ' (' + t.shifts + ' shifts)' : '') : 'open') + '</td><td>' + t.tickets + '</td><td>' + esc(fmtSeries(t.series)) + '</td>' +
        '<td class="gap">' + esc(t.gaps.join(' ')) + '</td><td>' + Object.keys(t.tenders).sort().map(function (n) { return '<span data-tender="' + n + '">' + n + ' ' + money(t.tenders[n]) + '</span>'; }).join(' ') + '</td>' +
        '<td>' + Object.keys(t.taxes).map(function (id) { return '<span data-tax="' + id + '">base ' + money(t.taxes[id].base) + ' tax ' + money(t.taxes[id].amount) + '</span>'; }).join(' ') + '</td><td>' + money(t.gross) + '</td></tr>';
    }).join('');
    { var ae = $('#a-empty'); if (ae) { var none = !v.tills.length || v.total.tickets === 0; ae.hidden = !none; ae.textContent = 'Nothing handed over yet for this day. Each till presses Close Cash; then press Refresh. Send EODA unlocks when every listed till has closed.'; } }
    var T = v.total; $('#t-state').textContent = T.closed + ' of ' + T.tills + ' closed'; $('#t-tickets').textContent = T.tickets; $('#t-gross').textContent = money(T.gross);
    $('#t-tender').textContent = Object.keys(T.tenders).sort().map(function (n) { return n + ' ' + money(T.tenders[n]); }).join(' '); $('#t-tax').textContent = Object.keys(T.taxes).map(function (id) { return 'base ' + money(T.taxes[id].base) + ' tax ' + money(T.taxes[id].amount); }).join(' ');
    var need = !v.allClosed, ov = $('#a-override').value.trim();
    $('#a-send').disabled = !(v.tills.length > 0 && (!need || ov)); $('#a-send').setAttribute('data-needs-override', need ? '1' : '0'); $('#a-status').disabled = !v.tills.some(function (t) { return t.closed; });
    $('#a-sendnote').textContent = need ? 'open till: Send EODA needs a reason' : 'every till closed';
    log('§EODA_SCREEN org=' + S.cfg.org + ' day=' + cur + ' tills=' + T.tills + ' closed=' + T.closed + ' tickets=' + T.tickets + ' gross=' + money(T.gross) + ' tenders=' + JSON.stringify(T.tenders) + ' allClosed=' + v.allClosed + ' rows=' + v.tills.map(function (t) { return t.tillKey + ':' + (t.closed ? 'closed' : 'open') + ':' + fmtSeries(t.series) + ':gaps=' + t.gaps.join('+'); }).join(';'));
    return v;
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }



  // ── Stock count (POS_PLUGIN_LOCAL_FIRST §37; uniCenta 5.0 StockManagement/JPanelInventory shape: pick a product, key the units). AD HOC and BLIND (owner D7/D10): this code NEVER reads m_storageonhand and never holds a book quantity.
  //   draft lines -> "Save count" keeps a count at the branch (S.set.counts, reviewable/printable); only a count saved with the supervisor tick "Include this count in tonight's EODA" (OFF by default) is authored as I_Inventory creates
  //   INSIDE the one send() group below, never a send of its own. Flow I1 (flows_pos.json) carries Value/UPC/LocatorValue/QtyCount/MovementDate/DocTypeName/Description only: no QtyBook.
  async function salesLocator() {   // the locator every till of this branch sells from: the default locator of the c_pos warehouse
    var r = (await rows("SELECT l.value AS value, l.m_warehouse_id AS wh FROM c_pos p JOIN m_locator l ON l.m_warehouse_id=p.m_warehouse_id WHERE p.ad_org_id=" + Number(S.cfg.org) + " AND COALESCE(l.isactive,'Y')='Y' ORDER BY (l.isdefault='Y') DESC, l.m_locator_id LIMIT 1"))[0];
    return r || null;
  }
  async function findProduct(text) {
    var t = String(text == null ? '' : text).trim(); if (!t) return null;
    var r = await rows('SELECT m_product_id AS id, value, upc, name FROM m_product WHERE (value=' + q(t) + ' OR upc=' + q(t) + ') AND COALESCE(isactive,\'Y\')=\'Y\' ORDER BY m_product_id LIMIT 1');
    if (!r.length) r = await rows('SELECT m_product_id AS id, value, upc, name FROM m_product WHERE lower(name)=lower(' + q(t) + ') AND COALESCE(isactive,\'Y\')=\'Y\' ORDER BY m_product_id LIMIT 1');
    return r[0] || null;
  }
  function countAdd(text, qty) {
    return serial(async function () {
      var p = await findProduct(text), n = Number(qty);
      if (!p) { msg('No product matches "' + text + '"'); log('§COUNT_ADD REFUSED unknown product "' + text + '"'); return { refused: 'no-product' }; }
      if (!(n >= 0) || String(qty).trim() === '' || !isFinite(n)) { msg('Key the counted quantity (0 or more)'); log('§COUNT_ADD REFUSED bad quantity "' + qty + '" for ' + p.value); return { refused: 'bad-qty' }; }
      var ex = S.set.draft.filter(function (d) { return d.value === p.value; })[0];
      if (ex) ex.qty = n; else S.set.draft.push({ value: p.value, upc: p.upc || '', name: p.name, qty: n });      // one counted figure per product
      saveSet(); renderCount(); log('§COUNT_ADD product=' + p.value + ' counted=' + n + ' draftLines=' + S.set.draft.length); return { added: p.value, qty: n };
    });
  }
  function countRemove(value) { S.set.draft = S.set.draft.filter(function (d) { return d.value !== value; }); saveSet(); renderCount(); }
  // SEAM (§37.4): per-till data is handed in, never fetched here. The §38 branch-relay agent gathers the tills' rows over the branch relay (LAN, never the internet) and calls BranchAdmin.collectTills({ reached: [per-till rows], notReached: [till keys] });
  //   this file has NO transport. A till that did not answer is "not reached" and was never waited on (D9). Today nothing calls it: reached=0 notReached=0.
  function collectTills(collected) { S.collected = { reached: (collected && collected.reached) || [], notReached: (collected && collected.notReached) || [] }; return S.collected; }
  async function gatherTills() { return S.collected || { reached: [], notReached: [] }; }
  // STUB (§37.4): "is this the flagged main till?" - ONE named function the §38 agent replaces with the real flag read (owner §35.3); true until then, so the screen shows on the branch POS admin.
  function isMainTill() { return !!(S.lan && S.lan.isMain()); }
  function countSave(include) {
    { var rfc = S.lan.requireMain('count'); if (rfc) { msg(rfc.message); return rfc; } }
    return serial(async function () {
      if (!S.set.draft.length) { msg('Nothing counted yet'); log('§COUNT_SAVE INCONCLUSIVE no draft line: nothing judged'); return { refused: 'empty' }; }
      var loc = await salesLocator(); if (!loc) { msg('This branch has no sales-floor locator'); log('§COUNT_SAVE REFUSED no c_pos warehouse locator'); return { refused: 'no-locator' }; }
      var g = await gatherTills(); log('§COUNT_GATHER reached=' + g.reached.length + ' notReached=' + g.notReached.length + ' (the per-till rows are handed in by the branch-relay agent via collectTills; none yet)');
      var n = ++S.set.countSeq, c = { id: S.cfg.orgValue + '-CNT' + n, day: S.day || today(), locator: loc.value, include: include === undefined ? !!$('#c-include').checked : !!include, sent: false, lines: S.set.draft.map(function (d) { return Object.assign({}, d); }) };
      S.set.counts.push(c); S.set.draft = []; saveSet(); renderCount();
      log('§COUNT_SAVE id=' + c.id + ' day=' + c.day + ' locator=' + c.locator + ' lines=' + c.lines.length + ' include=' + (c.include ? 'Y' : 'N') + ' (' + (c.include ? 'rides the next EODA' : 'kept at the branch') + ')');
      msg('Count ' + c.id + ' saved' + (c.include ? ' (goes with tonight\'s EODA)' : ' (kept at the branch)')); return { id: c.id, include: c.include, lines: c.lines.length };
    });
  }
  // the I_Inventory declarations of the counts the supervisor chose to include: only the columns flow I1 carries (no QtyBook, ever)
  function countRows(c) {
    return c.lines.map(function (l) { var f = { ad_client_id: S.cfg.client, ad_org_id: S.cfg.org, isactive: 'Y', i_isimported: 'N', value: l.value, locatorvalue: c.locator, qtycount: l.qty, movementdate: c.day + ' 00:00:00', doctypename: 'Material Physical Inventory', description: c.id };
      if (l.upc) f.upc = l.upc; return f; });
  }
  function renderCount() {
    var d = $('#c-draft'), sv = $('#c-saved'); if (!d || !sv) return; $('#a-count').hidden = !isMainTill();
    d.innerHTML = S.set.draft.map(function (x) { return '<tr data-cline="' + esc(x.value) + '"><td>' + esc(x.value) + '</td><td>' + esc(x.name) + '</td><td data-cq>' + x.qty + '</td><td><button data-c-del="' + esc(x.value) + '">Remove</button></td></tr>'; }).join('');
    sv.innerHTML = S.set.counts.map(function (c) { return '<tr data-count="' + esc(c.id) + '" data-include="' + (c.include ? 1 : 0) + '" data-sent="' + (c.sent ? 1 : 0) + '"><td>' + esc(c.id) + '</td><td>' + esc(c.day) + '</td><td>' + esc(c.locator) + '</td><td>' + c.lines.map(function (l) { return esc(l.value) + ' x ' + l.qty; }).join(', ') + '</td><td>' + (c.include ? (c.sent ? 'sent with EODA' : 'goes with the next EODA') : 'kept at the branch') + '</td></tr>'; }).join('');
    /*BOOK-ANCHOR*/
  }

  // ── SODA (POS_PLUGIN_LOCAL_FIRST §28): the batch head office wrote for THIS branch (pos_sodaref, hub lane, DOWN) ──
  // fan(): re-emit the batch rows not yet passed on to the tills on the branch lane (pos_tillref) and make ONE Visit; a till applies only what arrived (till.js applySoda).
  // receiveStock(): the branch clerk's receipt of the in-transit movements (Move Confirmation, window 333): Confirmed / Scrapped per line (default Confirmed = Target). It is KEPT here, authors NO op, and leaves as the executor's
  // outcome on the confirm's OWN rows (flows S6/S7: DocStatus/IsApproved/Processed and the line quantities) inside the next EODA send (send() below) - never as a send of its own (§28.2 P3).
  async function sodaRead() {
    var ref = []; try { ref = await rows('SELECT * FROM pos_sodaref WHERE ad_org_id=' + Number(S.cfg.org) + ' ORDER BY seq, ABS(pos_sodaref_id)'); } catch (e) { /* no SODA table yet */ }
    var cf = []; try { cf = await rows("SELECT c.m_movementconfirm_id AS id, c.m_movementconfirm_uu AS uu, c.documentno AS documentno, c.m_movement_id AS mid, m.documentno AS mdoc FROM m_movementconfirm c JOIN m_movement m ON m.m_movement_id=c.m_movement_id WHERE COALESCE(c.processed,'N')='N' AND COALESCE(c.isactive,'Y')='Y' ORDER BY c.m_movementconfirm_id"); } catch (e) { /* no confirms replicated */ }
    var pend = cf.filter(function (c) { return !S.set.receipts.some(function (r) { return r.confirm === c.documentno; }); });
    return { ref: ref, fresh: ref.filter(function (r) { return Number(r.seq) > S.set.sodaFanned; }), confirms: pend };
  }
  async function renderSoda() {
    if (!SD) return null; var s = await sodaRead(), counts = { P: 0, R: 0, T: 0, O: 0 }; s.fresh.forEach(function (r) { if (counts[r.kind] != null) counts[r.kind]++; });
    var batches = {}; s.fresh.forEach(function (r) { batches[r.batchid] = 1; });
    $('#s-state').textContent = Object.keys(batches).length ? Object.keys(batches).length + ' batch(es): ' + counts.P + ' prices, ' + counts.R + ' products, ' + counts.T + ' taxes' + (counts.O ? ', the company details' : '') : 'no new batch';
    $('#a-soda-fan').disabled = !s.fresh.length; $('#a-soda-recv').disabled = !s.confirms.length; $('#s-recv').textContent = s.confirms.length ? s.confirms.length + ' movement(s) to receive' : (S.set.receipts.length ? S.set.receipts.length + ' receipt(s) go with the next EODA' : '');
    log('§SODA_SCREEN org=' + S.cfg.org + ' freshRows=' + s.fresh.length + ' prices=' + counts.P + ' products=' + counts.R + ' taxes=' + counts.T + ' toReceive=' + s.confirms.length + ' receiptsQueued=' + S.set.receipts.length);
    return s;
  }
  function fan() {
    return serial(async function () {
      var s = await sodaRead(); if (!s.fresh.length) { log('§SODA_FAN INCONCLUSIVE no new batch row: nothing judged'); return { refused: 'empty' }; }
      var seqHi = s.fresh.reduce(function (m, r) { return Math.max(m, Number(r.seq)); }, 0), tr = SD.tillRows(s.fresh, { client: S.cfg.client, org: S.cfg.org });
      var res = await depositGroup(tr.map(function (r) { return create('pos_tillref', r); }));
      if (!res || res.committed !== true) { msg('Could not pass the batch to the tills: ' + (res && res.reason)); log('§SODA_FAN FAIL ' + (res && res.reason)); return { failed: res && res.reason }; }
      S.set.sodaFanned = seqHi; saveSet();
      var vis = await E.TeamSync.visit();            // ONE Visit, branch lane: the tills pick it up on their own Visit
      log('§SODA_FAN rows=' + tr.length + ' upToSeq=' + seqHi + ' ops=' + tr.length + ' gid=' + res.gid + ' sent=' + (vis && vis.rep ? vis.rep.sent : 'none'));
      msg('Passed ' + tr.length + ' reference rows to the tills'); await renderSoda(); return { rows: tr.length, sent: vis && vis.rep ? vis.rep.sent : null };
    });
  }
  // the executor's outcome (MMovementConfirm.completeIt :387-488 on the confirm's side): each line's ConfirmedQty / ScrappedQty / DifferenceQty (= Target - Confirmed, MMovementLineConfirm.beforeSave :169-172) / Processed, then the
  // confirm's DocStatus CO / IsApproved Y / Processed Y - only the columns that change, only the columns flows S6 / S7 carry. The documents the confirm CREATES (difference inventory, the movement's Complete) are made by head office.
  async function receiptOps(x) {
    var ops = [], upd = function (table, uu, ch) { return { op_type: 'CRUD_UPDATE', key: table, table: table, verb: 'update', id: uu, idCol: table + '_uu', changes: ch }; }, ch = function (o, n) { var m = {}; Object.keys(n).forEach(function (k) { if (String(o[k]) !== String(n[k])) m[k] = { old: o[k] === undefined ? null : o[k], new: n[k] }; }); return m; };
    for (var i = 0; i < x.lines.length; i++) { var l = x.lines[i], cur = (await rows('SELECT confirmedqty, scrappedqty, differenceqty, processed FROM m_movementlineconfirm WHERE m_movementlineconfirm_uu=' + q(l.lcuu)))[0];
      if (cur) { var c = ch(cur, { confirmedqty: l.confirmedqty, scrappedqty: l.scrappedqty, differenceqty: l.differenceqty, processed: 'Y' }); if (Object.keys(c).length) ops.push(upd('m_movementlineconfirm', l.lcuu, c)); } }
    var hd = (await rows('SELECT docstatus, isapproved, processed FROM m_movementconfirm WHERE m_movementconfirm_uu=' + q(x.uu)))[0];
    if (hd) { var h = ch(hd, { docstatus: 'CO', isapproved: 'Y', processed: 'Y' }); if (Object.keys(h).length) ops.push(upd('m_movementconfirm', x.uu, h)); }
    return ops;
  }
  // the lines of one pending Move Confirmation (window 333, tab Move Line Confirm): Move Line, Target Quantity (and the product, for the screen)
  async function readLines(c) {
    var cl = [], lcs = await rows('SELECT m_movementlineconfirm_uu AS lcuu, m_movementline_id AS mlid, targetqty AS t FROM m_movementlineconfirm WHERE m_movementconfirm_id=' + Number(c.id));   // one table per query: a join returned the movement line's key under the confirm line's alias
    for (var li = 0; li < lcs.length; li++) { var mlr = (await rows('SELECT line, m_product_id AS p, m_locator_id AS l, m_locatorto_id AS lt FROM m_movementline WHERE m_movementline_id=' + Number(lcs[li].mlid)))[0]; if (mlr) { var pr = (await rows('SELECT name FROM m_product WHERE m_product_id=' + Number(mlr.p)))[0]; cl.push({ lcuu: lcs[li].lcuu, t: lcs[li].t, line: mlr.line, p: mlr.p, pname: pr && pr.name || '', l: mlr.l, lt: mlr.lt }); } }
    cl.sort(function (a, b) { return Number(a.line) - Number(b.line); }); return cl;
  }
  // §33.4: the per-line entry of Move Confirmation (AD_Field order: Move Line, Target Quantity, Confirmed Quantity, Difference, Scrapped Quantity). Difference = Target - Confirmed, read-only (MMovementLineConfirm.beforeSave :169-172). Confirm receipt hands the typed values to receiveStock(lines).
  async function recvPanel() {
    var s = await sodaRead(), box = $('#a-recv'), h = '';
    for (var i = 0; i < s.confirms.length; i++) { var c = s.confirms[i], cl = await readLines(c);
      h += '<h4>Move Confirmation ' + esc(c.documentno) + ' <small>(movement ' + esc(c.mdoc) + ')</small></h4><table class="rc" data-doc="' + esc(c.documentno) + '"><thead><tr><th>Move Line</th><th>Product</th><th>Target Quantity</th><th>Confirmed Quantity</th><th>Difference</th><th>Scrapped Quantity</th></tr></thead><tbody>' +
        cl.map(function (x) { return '<tr data-line="' + esc(x.line) + '" data-target="' + Number(x.t) + '"><td>' + esc(x.line) + '</td><td>' + esc(x.pname) + '</td><td>' + Number(x.t) + '</td><td><input data-rc-conf size="5" value="' + Number(x.t) + '"></td><td data-rc-diff>0</td><td><input data-rc-scr size="5" value="0"></td></tr>'; }).join('') + '</tbody></table>'; }
    box.innerHTML = h + (s.confirms.length ? '<p><button id="rc-confirm" class="go">Confirm receipt</button> <button id="rc-cancel">Cancel</button></p>' : ''); box.hidden = !s.confirms.length;
    log('§SODA_RECV_PANEL confirms=' + s.confirms.length + ' lines=' + box.querySelectorAll('tbody tr').length); return s.confirms.length;
  }
  function recvCollect() { var out = {}; Array.prototype.forEach.call($('#a-recv').querySelectorAll('table.rc'), function (t) { out[t.getAttribute('data-doc')] = Array.prototype.map.call(t.querySelectorAll('tbody tr'), function (r) { return { line: Number(r.getAttribute('data-line')), confirmed: Number(r.querySelector('[data-rc-conf]').value), scrapped: Number(r.querySelector('[data-rc-scr]').value) }; }); }); return out; }
  function recvDiff(row) { var t = Number(row.getAttribute('data-target')), c = Number(row.querySelector('[data-rc-conf]').value); row.querySelector('[data-rc-diff]').textContent = String(t - c); }
  // lines: optional { <confirm documentno>: [{ line, confirmed, scrapped }] }; no entry = a full receipt (Confirmed = Target, Scrapped = 0), as legacy's confirm is created (MMovementConfirm.create :62-90)
  function receiveStock(lines) {
    return serial(async function () {
      var rfr = S.lan.requireMain('receive stock'); if (rfr) { msg(rfr.message); return rfr; }
      var s = await sodaRead(), n = 0; lines = lines || {};
      for (var i = 0; i < s.confirms.length; i++) {
        var c = s.confirms[i], cl = await readLines(c);
        var given = lines[c.documentno] || [], out = cl.map(function (x) { var g = given.filter(function (y) { return Number(y.line) === Number(x.line); })[0] || {}, conf = g.confirmed != null ? Number(g.confirmed) : Number(x.t), scr = g.scrapped != null ? Number(g.scrapped) : 0;
          return { lcuu: x.lcuu, line: x.line, m_product_id: x.p, m_locator_id: x.l, m_locatorto_id: x.lt, targetqty: Number(x.t), confirmedqty: conf, scrappedqty: scr, differenceqty: Number(x.t) - conf }; });   // DifferenceQty = Target - Confirmed (MMovementLineConfirm.beforeSave :169-172)
        var rr = out;
        rr.forEach(function (r) { S.lan.received(r.m_product_id, r.confirmedqty); });   // §38.2.5: the main till's running record = SODA on-hand - collected lines + received
        S.set.receipts.push({ confirm: c.documentno, uu: c.uu, lines: rr, sent: false }); n++;   // addressed by _uu: the local pk of a replicated row is renumbered by every projection
        log('§SODA_RECEIVE confirm=' + c.documentno + ' movement=' + c.mdoc + ' lines=' + rr.length + ' confirmed=' + rr.map(function (r) { return r.confirmedqty + '/' + r.targetqty; }).join(',') + ' scrapped=' + rr.map(function (r) { return r.scrappedqty; }).join(','));
      }
      saveSet(); msg(n + ' movement(s) received; the receipt goes with the next EODA'); await renderSoda(); return { received: n };
    });
  }

  // the ONE send (§26.4). partial = the pressed "Send status now"; otherwise "Send EODA" (every till closed, or a logged override reason)
  function send(partial, override) {
    return serial(async function () {
      var rf = S.lan.requireMain('EODA send'); if (rf) { msg(rf.message); return rf; }   // §38.2.3: every LAN op checks the main-till flag
      var v = await render(), day = S.day, ov = String(override == null ? $('#a-override').value : override).trim();
      var closed = v.tills.filter(function (t) { return t.closed; });
      if (!partial && !v.allClosed && !ov) { msg('Not every till is closed: give an override reason to send'); log('§EODA_SEND REFUSED day=' + day + ' open=' + v.tills.filter(function (t) { return !t.closed; }).map(function (t) { return t.tillKey; }).join(',') + ' (no override reason)'); return { refused: 'open-till' }; }
      if (!closed.length) { msg('No till has closed a shift for ' + day + ': nothing to send'); log('§EODA_SEND INCONCLUSIVE day=' + day + ' no closed till: nothing judged'); return { refused: 'empty' }; }
      var seq = (S.set.batchSeq[day] || 0) + 1, batchId = S.cfg.orgValue + '-' + day + '-' + seq, ops = [], marks = [], nO = 0, nP = 0;
      Object.keys(S.tills).forEach(function (tk) {     // the tickets of the day not yet deposited: the real legacy import rows, as the till wrote them
        var T = S.tills[tk]; Object.keys(T.keys).sort().forEach(function (k) { var K = T.keys[k]; if (K.day !== day || S.set.deposited[k]) return; marks.push(k);
          K.o.forEach(function (r) { ops.push(create('i_order', r)); nO++; }); K.p.forEach(function (r) { ops.push(create('i_payment', r)); nP++; }); });
      });
      var st = EC.statementRows({ batchId: batchId, seq: seq, day: day, partial: !!partial, override: partial ? '' : (v.allClosed ? '' : ov), client: S.cfg.client, org: S.cfg.org, view: v });
      st.forEach(function (r) { ops.push(create('pos_branchdaystatement', r)); });
      var rcpt = S.set.receipts.filter(function (x) { return !x.sent; }), nR = 0;     // §28.2 P3: the executor's outcome on the confirm's own rows goes up INSIDE this batch, never as a send of its own
      for (var ri = 0; ri < rcpt.length; ri++) { var ro = await receiptOps(rcpt[ri]); ro.forEach(function (o) { ops.push(o); nR++; }); log('§SODA_RECEIPT_OPS confirm=' + rcpt[ri].confirm + ' ops=' + ro.length + ' tables=' + ro.map(function (o) { return o.table + ':' + Object.keys(o.changes).join('+'); }).join(',')); }
      var cnts = S.set.counts.filter(function (c) { return c.include && !c.sent; }), nC = 0;     // §37: ONLY the counts the supervisor chose to include ride this ONE send (never an extra send); the others stay at the branch
      cnts.forEach(function (c) { countRows(c).forEach(function (r) { ops.push(create('i_inventory', r)); nC++; }); });
      if (S.set.counts.length) log('§COUNT_EODA included=' + cnts.length + ' rows=' + nC + ' keptAtBranch=' + S.set.counts.filter(function (c) { return !c.include && !c.sent; }).length);
      var res = await depositGroup(ops);
      if (!res || res.committed !== true) { msg('Could not assemble the batch: ' + (res && res.reason)); log('§EODA_SEND FAIL ' + (res && res.reason)); return { failed: res && res.reason }; }
      marks.forEach(function (k) { S.set.deposited[k] = batchId; }); S.set.batchSeq[day] = seq; rcpt.forEach(function (x) { x.sent = true; }); cnts.forEach(function (c) { c.sent = true; }); renderCount();
      if (!partial && !v.allClosed) S.set.overrides.push({ day: day, batch: batchId, reason: ov, open: v.tills.filter(function (t) { return !t.closed; }).map(function (t) { return t.tillKey; }) });
      saveSet();
      if (!partial && !v.allClosed) log('§EODA_OVERRIDE batch=' + batchId + ' day=' + day + ' open=' + v.tills.filter(function (t) { return !t.closed; }).map(function (t) { return t.tillKey; }).join(',') + ' reason=' + JSON.stringify(ov));
      log('§EODA_SEND batch=' + batchId + ' day=' + day + ' partial=' + (partial ? 'Y' : 'N') + ' tills=' + closed.length + ' tickets=' + marks.length + ' i_order=' + nO + ' i_payment=' + nP + ' statement=' + st.length + ' receipts=' + nR + ' counts=' + nC + ' ops=' + ops.length + ' gid=' + res.gid);
      var vis = await E.TeamSync.visit();       // ONE Visit carries the whole batch to head office
      log('§EODA_SEND_VISIT batch=' + batchId + ' sent=' + (vis && vis.rep ? vis.rep.sent : 'none'));
      msg((partial ? 'Status ' : 'EODA ') + batchId + ' sent: ' + marks.length + ' tickets'); await render();
      return { batch: batchId, tickets: marks.length, ops: ops.length, partial: !!partial, sent: vis && vis.rep ? vis.rep.sent : null };
    });
  }

  function bind() {
    document.addEventListener('input', function (ev) { var r = ev.target.closest && ev.target.closest('table.rc tbody tr'); if (r) recvDiff(r); });
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button'); if (!b || b.disabled) return;
      if (b.id === 'c-add') countAdd($('#c-find').value, $('#c-qty').value).then(function () { $('#c-find').value = ''; $('#c-qty').value = ''; $('#c-find').focus(); }); else if (b.id === 'c-save') countSave(); else if (b.id === 'c-print') window.print(); else if (b.hasAttribute('data-c-del')) countRemove(b.getAttribute('data-c-del')); else if (b.id === 'a-send') send(false); else if (b.id === 'a-status') send(true); else if (b.id === 'a-refresh') refresh(); else if (b.id === 'a-soda-fan') fan(); else if (b.id === 'a-soda-recv') recvPanel(); else if (b.id === 'rc-confirm') { var ln = recvCollect(); $('#a-recv').hidden = true; receiveStock(ln); } else if (b.id === 'rc-cancel') $('#a-recv').hidden = true;
    });
    $('#c-find').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); $('#c-qty').focus(); } }); $('#c-qty').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); $('#c-add').click(); } });   // a scanner types the code then Enter
    $('#a-day').addEventListener('change', function () { S.day = this.value; render(); });
    $('#a-override').addEventListener('input', function () { render(); });
    $('#a-tills').addEventListener('change', function () { S.set.tills = this.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean); saveSet(); render(); });
    window.addEventListener('online', netChip); window.addEventListener('offline', netChip);
  }
  function netChip() { $('#a-net').textContent = navigator.onLine === false ? 'offline' : 'online'; }
  async function refresh() { await lanCollect(); var v = await E.TeamSync.visit(); log('§EODA_REFRESH sent=' + (v && v.rep ? v.rep.sent : 'none') + ' replicaIn=' + (v && v.replicaIn)); var rv = await render(); await renderSoda(); return rv; }
  function startLink() {
    if (S.link) S.link.stop();
    S.link = window.KdsLink.create({ E: E, kid: async function () { if (!S.kid) S.kid = (await E.TeamSync.pairState()).device; return S.kid; }, pollMs: S.set.pollMs, log: log, onVisit: async function () { await render(); await renderSoda(); } });
    S.link.start(function () { return true; });     // a PEEK (one list request), never a send: nothing here is timed to send to head office
  }
  async function boot() {
    var t0 = performance.now(), qs = new URLSearchParams(location.search); if (!qs.has('team')) qs.set('team', '1'); if (!qs.has('login')) qs.set('login', '50001');
    qs.delete('relay');   // §40: `relay=` is the BRANCH relay for this page; the engine frame must not read it as the legacy ERP sync relay (erp_sync_relay.js posts /push to it)
    var f = $('#a-engine'); f.src = 'idempiere.html?' + qs.toString();
    await new Promise(function (r) { f.addEventListener('load', r, { once: true }); });
    E = f.contentWindow;
    for (var i = 0; i < 1200 && !(E.TeamSync && E.__crud && E.__idmpDb && E.APP && E.APP.actor); i++) await new Promise(function (r) { setTimeout(r, 150); });
    await E.TeamSync.ready; if (E.AdImportTables && E.AdImportTables.ensurePos) E.AdImportTables.ensurePos(E.__idmpDb);
    var pos = (await rows('SELECT * FROM c_pos ORDER BY c_pos_id LIMIT 1'))[0]; if (!pos) throw new Error('no c_pos station in this tenant');
    var org = (await rows('SELECT value FROM ad_org WHERE ad_org_id=' + Number(pos.ad_org_id)))[0] || {};
    S.cfg = { client: pos.ad_client_id, org: pos.ad_org_id, orgValue: org.value || String(pos.ad_org_id), key: (org.value || pos.ad_org_id) + '-admin' }; loadSet();
    if (qs.get('poll')) S.set.pollMs = Number(qs.get('poll')) * 1000;
    $('#a-org').textContent = 'Org ' + S.cfg.orgValue; $('#a-tills').value = S.set.tills.join(', ');
    lanSetup(); bind(); netChip();
    var pair = null; try { pair = await E.TeamSync.pairState(); } catch (e) { /* not paired */ } $('#a-pair').textContent = pair && pair.enrolled ? 'paired' : 'not paired';
    if (window.PageStatus) window.PageStatus.ready('First: open the main till and tick "This is the branch main till" (Configuration > System Options); then each till presses Close Cash; then Refresh and Send EODA here. ' + window.PageStatus.relayWords());
    await render(); await renderSoda(); renderCount(); startLink();
    window.BranchAdmin = { ready: true, lan: function () { return S.lan; }, lanCollect: lanCollect, rows: rows, state: function () { return S; }, engine: function () { return E; }, render: render, refresh: refresh, send: send, fan: fan, receiveStock: receiveStock, recvPanel: recvPanel, soda: sodaRead, countAdd: countAdd, countSave: countSave, countRemove: countRemove, gatherTills: gatherTills, collectTills: collectTills, isMainTill: isMainTill, salesLocator: salesLocator, tick: function () { return S.link.tick(); }, link: function () { return S.link; }, visit: function () { return E.TeamSync.visit(); } };
    var ms = Math.round(performance.now() - t0), heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
    if (isMainTill()) { setInterval(function () { lanCollect().catch(function (e) { log('§LAN_COLLECT_ERR ' + (e && e.message)); }); }, S.set.pollMs); }   // the main till polls the branch relay (LAN only); the internet is touched only by EODA send, the SODA Visit and the mirror
    log('§EODA_BOOT admin=' + S.cfg.key + ' org=' + S.cfg.org + ' engine_ready_ms=' + ms + ' heap_mb=' + heap + ' poll_ms=' + S.set.pollMs);
  }
  boot().catch(function (e) { log('🔴 §EODA_BOOT ' + (e && e.stack || e)); });
})();
