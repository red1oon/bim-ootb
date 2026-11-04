// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — branch_admin.js: the Branch POS Admin page. READ THE LOG (§EODA_* lines of erp/tests/witness_eoda.js), exit codes are not evidence.
// Implementing bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §26.4: uniCenta's Manager / back office as a Team device of the branch Org. It never rings a sale. It reads the branch-local POS_TillHandoff rows the tills wrote at Close Cash,
// shows the EODA screen, and makes the ONE send to head office: the tickets' real I_Order / I_Payment rows (flows F3 / B4, authored HERE, the tills hold theirs) + the branch-day statement (POS_BranchDayStatement, flow E1) in one
// atomic group, then ONE Visit. "Send EODA" needs every till closed or a logged override reason; "Send status now" is the same send marked PARTIAL and exists only as a pressed button (D2): there is no timer that sends.
// Between sends the page PEEKS the branch box with ONE list request per poll period (kds_link.js, §19.5) and Visits only when another device wrote.
(function () {
  'use strict';
  var E = null, EC = window.EodaCore, SD = window.SodaCore, S = { cfg: null, set: { tills: [], deposited: {}, batchSeq: {}, overrides: [], pollMs: 30000, sodaFanned: 0, receipts: [] }, day: null, view: null, tills: {}, kid: null, link: null, draws: 0 };
  var $ = function (s) { return document.querySelector(s); };
  var q = function (s) { return "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'"; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var money = function (c) { return (Number(c) / 100).toFixed(2); };
  function log(s) { try { console.log(s); } catch (e) { /* never breaks the page */ } }
  var chain = Promise.resolve(); function serial(fn) { var p = chain.then(fn, fn); chain = p.catch(function () {}); return p; }
  function rows(sql) { return new Promise(function (res) { E.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(sql)); return { ok: true }; } }, function () {}); }); }
  function depositGroup(ops) { return new Promise(function (res) { var t = setTimeout(function () { res({ committed: false, reason: 'timeout' }); }, 60000); E.__crud.applyOpGroup(ops, function (r) { clearTimeout(t); res(r); }); }); }
  var create = function (table, f) { return { op_type: 'CRUD_CREATE', key: table, table: table, verb: 'create', fields: f }; };
  function skey() { return 'branchadmin.v1:' + S.cfg.key; }
  function loadSet() { try { var s = JSON.parse(localStorage.getItem(skey()) || 'null'); if (s) Object.assign(S.set, s); } catch (e) { /* private window */ } }
  function saveSet() { try { localStorage.setItem(skey(), JSON.stringify(S.set)); } catch (e) { /* kept in memory */ } }
  function msg(t) { var el = $('#a-msg'); el.hidden = !t; el.textContent = t || ''; if (t) log('§EODA_MSG ' + t); }

  async function read() { return EC.fold(await rows('SELECT * FROM pos_tillhandoff ORDER BY ABS(pos_tillhandoff_id)')); }
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
    var T = v.total; $('#t-state').textContent = T.closed + ' of ' + T.tills + ' closed'; $('#t-tickets').textContent = T.tickets; $('#t-gross').textContent = money(T.gross);
    $('#t-tender').textContent = Object.keys(T.tenders).sort().map(function (n) { return n + ' ' + money(T.tenders[n]); }).join(' '); $('#t-tax').textContent = Object.keys(T.taxes).map(function (id) { return 'base ' + money(T.taxes[id].base) + ' tax ' + money(T.taxes[id].amount); }).join(' ');
    var need = !v.allClosed, ov = $('#a-override').value.trim();
    $('#a-send').disabled = !(v.tills.length > 0 && (!need || ov)); $('#a-send').setAttribute('data-needs-override', need ? '1' : '0'); $('#a-status').disabled = !v.tills.some(function (t) { return t.closed; });
    $('#a-sendnote').textContent = need ? 'open till: Send EODA needs a reason' : 'every till closed';
    log('§EODA_SCREEN org=' + S.cfg.org + ' day=' + cur + ' tills=' + T.tills + ' closed=' + T.closed + ' tickets=' + T.tickets + ' gross=' + money(T.gross) + ' tenders=' + JSON.stringify(T.tenders) + ' allClosed=' + v.allClosed + ' rows=' + v.tills.map(function (t) { return t.tillKey + ':' + (t.closed ? 'closed' : 'open') + ':' + fmtSeries(t.series) + ':gaps=' + t.gaps.join('+'); }).join(';'));
    return v;
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }


  // ── SODA (POS_PLUGIN_LOCAL_FIRST §28): the batch head office wrote for THIS branch (pos_sodaref, hub lane, DOWN) ──
  // fan(): re-emit the batch rows not yet passed on to the tills on the branch lane (pos_tillref) and make ONE Visit; a till applies only what arrived (till.js applySoda).
  // receiveStock(): the branch clerk's receipt of the in-transit movements (Move Confirmation, window 333): Confirmed / Scrapped per line (default Confirmed = Target). It is KEPT as POS_MovementReceipt rows and leaves
  // inside the next EODA send (send() below) - never as a send of its own (§28.2).
  async function sodaRead() {
    var ref = []; try { ref = await rows('SELECT * FROM pos_sodaref WHERE ad_org_id=' + Number(S.cfg.org) + ' ORDER BY seq, ABS(pos_sodaref_id)'); } catch (e) { /* no SODA table yet */ }
    var cf = []; try { cf = await rows("SELECT c.m_movementconfirm_id AS id, c.documentno AS documentno, c.m_movement_id AS mid, m.documentno AS mdoc FROM m_movementconfirm c JOIN m_movement m ON m.m_movement_id=c.m_movement_id WHERE COALESCE(c.processed,'N')='N' AND COALESCE(c.isactive,'Y')='Y' ORDER BY c.m_movementconfirm_id"); } catch (e) { /* no confirms replicated */ }
    var pend = cf.filter(function (c) { return !S.set.receipts.some(function (r) { return r.confirm === c.documentno; }); });
    return { ref: ref, fresh: ref.filter(function (r) { return Number(r.seq) > S.set.sodaFanned; }), confirms: pend };
  }
  async function renderSoda() {
    if (!SD) return null; var s = await sodaRead(), counts = { P: 0, R: 0, T: 0 }; s.fresh.forEach(function (r) { if (counts[r.kind] != null) counts[r.kind]++; });
    var batches = {}; s.fresh.forEach(function (r) { batches[r.batchid] = 1; });
    $('#s-state').textContent = Object.keys(batches).length ? Object.keys(batches).length + ' batch(es): ' + counts.P + ' prices, ' + counts.R + ' products, ' + counts.T + ' taxes' : 'no new batch';
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
  // lines: optional { <confirm documentno>: [{ line, confirmed, scrapped }] }; no entry = a full receipt (Confirmed = Target, Scrapped = 0), as legacy's confirm is created (MMovementConfirm.create :62-90)
  function receiveStock(lines) {
    return serial(async function () {
      var s = await sodaRead(), n = 0; lines = lines || {};
      for (var i = 0; i < s.confirms.length; i++) {
        var c = s.confirms[i], cl = await rows('SELECT lc.targetqty AS t, ml.line AS line, ml.m_product_id AS p, ml.m_locator_id AS l, ml.m_locatorto_id AS lt FROM m_movementlineconfirm lc JOIN m_movementline ml ON ml.m_movementline_id=lc.m_movementline_id WHERE lc.m_movementconfirm_id=' + Number(c.id) + ' ORDER BY ml.line');
        var given = lines[c.documentno] || [], out = cl.map(function (x) { var g = given.filter(function (y) { return Number(y.line) === Number(x.line); })[0] || {}, conf = g.confirmed != null ? Number(g.confirmed) : Number(x.t), scr = g.scrapped != null ? Number(g.scrapped) : 0;
          return { line: x.line, m_product_id: x.p, m_locator_id: x.l, m_locatorto_id: x.lt, targetqty: Number(x.t), confirmedqty: conf, scrappedqty: scr, differenceqty: Number(x.t) - conf }; });   // DifferenceQty = Target - Confirmed (MMovementLineConfirm.beforeSave :169-172)
        var rr = SD.receiptRows({ client: S.cfg.client, org: S.cfg.org, batchId: S.cfg.orgValue + '-RECV-' + c.documentno, movement: { documentno: c.mdoc }, confirm: { documentno: c.documentno }, lines: out });
        S.set.receipts.push({ confirm: c.documentno, rows: rr, sent: false }); n++;
        log('§SODA_RECEIVE confirm=' + c.documentno + ' movement=' + c.mdoc + ' lines=' + rr.length + ' confirmed=' + rr.map(function (r) { return r.confirmedqty + '/' + r.targetqty; }).join(',') + ' scrapped=' + rr.map(function (r) { return r.scrappedqty; }).join(','));
      }
      saveSet(); msg(n + ' movement(s) received; the receipt goes with the next EODA'); await renderSoda(); return { received: n };
    });
  }

  // the ONE send (§26.4). partial = the pressed "Send status now"; otherwise "Send EODA" (every till closed, or a logged override reason)
  function send(partial, override) {
    return serial(async function () {
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
      var rcpt = S.set.receipts.filter(function (x) { return !x.sent; }), nR = 0; rcpt.forEach(function (x) { x.rows.forEach(function (r) { ops.push(create('pos_movementreceipt', r)); nR++; }); });   // §28.2: the confirmed result goes up INSIDE this batch, never as a send of its own
      var res = await depositGroup(ops);
      if (!res || res.committed !== true) { msg('Could not assemble the batch: ' + (res && res.reason)); log('§EODA_SEND FAIL ' + (res && res.reason)); return { failed: res && res.reason }; }
      marks.forEach(function (k) { S.set.deposited[k] = batchId; }); S.set.batchSeq[day] = seq; rcpt.forEach(function (x) { x.sent = true; });
      if (!partial && !v.allClosed) S.set.overrides.push({ day: day, batch: batchId, reason: ov, open: v.tills.filter(function (t) { return !t.closed; }).map(function (t) { return t.tillKey; }) });
      saveSet();
      if (!partial && !v.allClosed) log('§EODA_OVERRIDE batch=' + batchId + ' day=' + day + ' open=' + v.tills.filter(function (t) { return !t.closed; }).map(function (t) { return t.tillKey; }).join(',') + ' reason=' + JSON.stringify(ov));
      log('§EODA_SEND batch=' + batchId + ' day=' + day + ' partial=' + (partial ? 'Y' : 'N') + ' tills=' + closed.length + ' tickets=' + marks.length + ' i_order=' + nO + ' i_payment=' + nP + ' statement=' + st.length + ' receipts=' + nR + ' ops=' + ops.length + ' gid=' + res.gid);
      var vis = await E.TeamSync.visit();       // ONE Visit carries the whole batch to head office
      log('§EODA_SEND_VISIT batch=' + batchId + ' sent=' + (vis && vis.rep ? vis.rep.sent : 'none'));
      msg((partial ? 'Status ' : 'EODA ') + batchId + ' sent: ' + marks.length + ' tickets'); await render();
      return { batch: batchId, tickets: marks.length, ops: ops.length, partial: !!partial, sent: vis && vis.rep ? vis.rep.sent : null };
    });
  }

  function bind() {
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button'); if (!b || b.disabled) return;
      if (b.id === 'a-send') send(false); else if (b.id === 'a-status') send(true); else if (b.id === 'a-refresh') refresh(); else if (b.id === 'a-soda-fan') fan(); else if (b.id === 'a-soda-recv') receiveStock();
    });
    $('#a-day').addEventListener('change', function () { S.day = this.value; render(); });
    $('#a-override').addEventListener('input', function () { render(); });
    $('#a-tills').addEventListener('change', function () { S.set.tills = this.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean); saveSet(); render(); });
    window.addEventListener('online', netChip); window.addEventListener('offline', netChip);
  }
  function netChip() { $('#a-net').textContent = navigator.onLine === false ? 'offline' : 'online'; }
  async function refresh() { var v = await E.TeamSync.visit(); log('§EODA_REFRESH sent=' + (v && v.rep ? v.rep.sent : 'none') + ' replicaIn=' + (v && v.replicaIn)); var rv = await render(); await renderSoda(); return rv; }
  function startLink() {
    if (S.link) S.link.stop();
    S.link = window.KdsLink.create({ E: E, kid: async function () { if (!S.kid) S.kid = (await E.TeamSync.pairState()).device; return S.kid; }, pollMs: S.set.pollMs, log: log, onVisit: async function () { await render(); await renderSoda(); } });
    S.link.start(function () { return true; });     // a PEEK (one list request), never a send: nothing here is timed to send to head office
  }
  async function boot() {
    var t0 = performance.now(), qs = new URLSearchParams(location.search); if (!qs.has('team')) qs.set('team', '1'); if (!qs.has('login')) qs.set('login', '50001');
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
    bind(); netChip();
    var pair = null; try { pair = await E.TeamSync.pairState(); } catch (e) { /* not paired */ } $('#a-pair').textContent = pair && pair.enrolled ? 'paired' : 'not paired';
    await render(); await renderSoda(); startLink();
    window.BranchAdmin = { ready: true, rows: rows, state: function () { return S; }, engine: function () { return E; }, render: render, refresh: refresh, send: send, fan: fan, receiveStock: receiveStock, soda: sodaRead, tick: function () { return S.link.tick(); }, link: function () { return S.link; }, visit: function () { return E.TeamSync.visit(); } };
    var ms = Math.round(performance.now() - t0), heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
    log('§EODA_BOOT admin=' + S.cfg.key + ' org=' + S.cfg.org + ' engine_ready_ms=' + ms + ' heap_mb=' + heap + ' poll_ms=' + S.set.pollMs);
  }
  boot().catch(function (e) { log('🔴 §EODA_BOOT ' + (e && e.stack || e)); });
})();
