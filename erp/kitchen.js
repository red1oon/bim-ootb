// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — kitchen.js: the standalone kitchen screen. READ THE LOG (§KDS_* lines of erp/tests/witness_kds.js), exit codes are not evidence.
// Implementing bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §19.4 - every element cites §14A / §14A.P there. A Team device of the branch Org (hidden engine frame, like till.js / borrower.js). It reads the till's branch-local
// POS_KitchenOrder generations (newest = the current queue, uniCenta replace-all), marks lines changed against the previous generation (URY), and writes POS_KitchenStatus rows: done / void / recall, per ticket and per item
// (Floreant, Chromis). After a write it runs ONE Visit (the batch); between writes it PEEKS the branch box with ONE list request per poll period and Visits only when another device wrote (kds_link.js, §19.5).
(function () {
  'use strict';
  var E = null, K = window.KdsCore, S = { cfg: null, set: { amber: null, red: null, pollMs: 10000, station: '' }, cards: [], lastBumped: null, kid: null, link: null, draws: 0 };
  var $ = function (s) { return document.querySelector(s); };
  var q = function (s) { return "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'"; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function log(s) { try { console.log(s); if (window.PageStatus) window.PageStatus.fromLog(s); } catch (e) { /* never breaks the page */ } }
  if (window.PageStatus) window.PageStatus.start('kitchen');
  var chain = Promise.resolve(); function serial(fn) { var p = chain.then(fn, fn); chain = p.catch(function () {}); return p; }
  function rows(sql) { return new Promise(function (res) { E.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(sql)); return { ok: true }; } }, function () {}); }); }
  function depositGroup(ops) { return new Promise(function (res) { var t = setTimeout(function () { res({ committed: false, reason: 'timeout' }); }, 15000); E.__crud.applyOpGroup(ops, function (r) { clearTimeout(t); res(r); }); }); }
  var stamp = function () { return new Date().toISOString().replace('T', ' ').slice(0, 23); };   // UTC with ms: status rows order the recall stack
  function skey() { return 'kitchen.v1:' + S.cfg.key; }
  function loadSet() { try { var s = JSON.parse(localStorage.getItem(skey()) || 'null'); if (s) Object.assign(S.set, s); } catch (e) { /* private window */ } }
  function saveSet() { try { localStorage.setItem(skey(), JSON.stringify(S.set)); } catch (e) { /* kept in memory */ } }
  function msg(t) { var el = $('#k-msg'); el.hidden = !t; el.textContent = t || ''; if (t) log('§KDS_MSG ' + t); }

  async function read() { K.ensure(E.__idmpDb); return { o: await rows('SELECT * FROM pos_kitchenorder ORDER BY ABS(pos_kitchenorder_id)'), s: await rows('SELECT * FROM pos_kitchenstatus ORDER BY ABS(pos_kitchenstatus_id)') }; }
  async function render() {
    var d = await read(), now = Date.now();
    var all = K.fold(d.o, d.s, { now: now, amber: S.set.amber, red: S.set.red, station: S.set.station === '' ? null : Number(S.set.station) });
    S.cards = all; S.raw = d; S.draws++;
    var open = all.filter(function (c) { return c.state === 'W'; });
    $('#k-cards').innerHTML = open.map(function (c) {
      return '<div class="kcard" data-ref="' + esc(c.ref) + '" data-till="' + esc(c.till) + '" data-seq="' + c.seq + '" data-age="' + c.age + '" data-state="W" data-modified="' + (c.modified ? 1 : 0) + '" data-cancelled="' + (c.cancelled ? 1 : 0) + '">' +
        '<div class="khead"><span class="kref">' + esc(c.ref) + '</span><span class="kclock">' + c.clock + '</span></div>' +
        (c.cancelled ? '<div class="kflag cancel">Cancelled by the till</div>' : c.modified ? '<div class="kflag">Modified (send ' + c.seq + ')</div>' : '') +
        '<div class="kbody">' + c.lines.map(function (l) { return '<div class="kline" data-line="' + l.line + '" data-state="' + l.state + '" data-mark="' + (l.mark ? l.mark.m : '') + '">' + (l.qty > 1 ? l.qty + ' x ' : '') + esc(l.details) + (l.mark && l.mark.m === 'changed' ? ' (was ' + l.mark.was + ')' : '') + '</div>'; }).join('') +
        c.removed.map(function (r) { return '<div class="kline removed" data-mark="removed">' + (r.qty > 1 ? r.qty + ' x ' : '') + esc(r.details) + ' (removed)</div>'; }).join('') + '</div>' +
        '<div class="kact"><button class="go" data-act="D">Bump</button><button data-act="V">Void</button></div></div>';
    }).join('');
    $('#k-count').textContent = open.length + ' open';
    { var ke = $('#k-empty'); if (ke) { ke.hidden = open.length > 0; ke.textContent = 'No orders yet. Orders appear here when a till presses Send Order.'; } }
    var bumped = all.filter(function (c) { return c.state === 'D' || c.state === 'V'; }).sort(function (a, b) { return a.bumpedAt < b.bumpedAt ? 1 : -1; });
    S.lastBumped = bumped[0] || null; $('#k-recall').disabled = !S.lastBumped;
    var st = {}; d.o.forEach(function (r) { st[r.displayid] = 1; }); st[1] = 1;
    var sel = $('#k-station'), want = Object.keys(st).sort(function (a, b) { return a - b; });
    if (sel.options.length !== want.length + 1) sel.innerHTML = '<option value="">All</option>' + want.map(function (w) { return '<option value="' + w + '">' + w + '</option>'; }).join(''); sel.value = S.set.station;
    return open;
  }
  function cardOf(ref, till) { return S.cards.filter(function (c) { return c.ref === ref && c.till === till; })[0]; }
  // one status write (bump / void / recall / item): one new status row, ONE atomic group, then ONE Visit (the batch, §19.5)
  function writeStatus(card, line, state) {
    return serial(async function () {
      var row = K.statusRow({ tillKey: card.till, orderRef: card.ref, seq: card.seq, line: line, state: state, statusSeq: card.maxStatusSeq + 1, now: stamp(), client: S.cfg.client, org: S.cfg.org });
      var res = await depositGroup([{ op_type: 'CRUD_CREATE', key: 'pos_kitchenstatus', table: 'pos_kitchenstatus', verb: 'create', fields: row }]);
      if (!res || res.committed !== true) { msg('Could not write the status: ' + (res && res.reason)); log('§KDS_BUMP FAIL ' + (res && res.reason)); return null; }
      log('§KDS_BUMP till=' + card.till + ' order=' + card.ref + ' seq=' + card.seq + ' line=' + line + ' state=' + state + ' statusSeq=' + row.statusseq + ' gid=' + res.gid);
      var v = await E.TeamSync.visit(); log('§KDS_BUMP_VISIT order=' + card.ref + ' state=' + state + ' sent=' + (v && v.rep ? v.rep.sent : 'none'));
      await render(); return row;
    });
  }
  async function act(ref, till, a) { var c = cardOf(ref, till); if (c) return writeStatus(c, 0, a); }
  async function itemTap(ref, till, line) {
    var c = cardOf(ref, till); if (!c) return null; var l = c.lines.filter(function (x) { return x.line === line; })[0]; if (!l) return null;
    return writeStatus(c, line, l.state === 'D' ? 'W' : 'D');      // Floreant per-item status; a second tap undoes it
  }
  async function recall() { var c = S.lastBumped; if (!c) return null; log('§KDS_RECALL order=' + c.ref + ' was=' + c.state); return writeStatus(c, 0, 'W'); }   // Chromis closedOrders.push/pop (:273-276): the newest bump comes back

  function bind() {
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button'), ln = ev.target.closest && ev.target.closest('.kline[data-line]'), card = ev.target.closest && ev.target.closest('.kcard');
      if (b && b.hasAttribute('data-act') && card) act(card.getAttribute('data-ref'), card.getAttribute('data-till'), b.getAttribute('data-act'));
      else if (b && b.id === 'k-recall' && !b.disabled) recall();
      else if (ln && card) itemTap(card.getAttribute('data-ref'), card.getAttribute('data-till'), Number(ln.getAttribute('data-line')));
    });
    $('#k-station').addEventListener('change', function () { S.set.station = this.value; saveSet(); render(); });
    ['amber', 'red'].forEach(function (k) { $('#k-' + k).addEventListener('change', function () { var v = Number(this.value); S.set[k] = v > 0 ? v : null; saveSet(); render(); }); });      // blank = unset = colour off
    $('#k-poll').addEventListener('change', function () { var v = Number(this.value); if (v >= 1) { S.set.pollMs = v * 1000; saveSet(); startLink(); } });
    window.addEventListener('online', netChip); window.addEventListener('offline', netChip);
  }
  function netChip() { $('#k-net').textContent = navigator.onLine === false ? 'offline' : 'online'; }
  function startLink() {
    if (S.link) S.link.stop();
    S.link = window.KdsLink.create({ E: E, kid: async function () { if (!S.kid) S.kid = (await E.TeamSync.pairState()).device; return S.kid; }, pollMs: S.set.pollMs, log: log, onVisit: render });
    S.link.start(function () { return true; });
  }
  async function boot() {
    var t0 = performance.now(), qs = new URLSearchParams(location.search); if (!qs.has('team')) qs.set('team', '1'); if (!qs.has('login')) qs.set('login', '50001');
    qs.delete('relay');   // §40: `relay=` is the BRANCH relay for this page; the engine frame must not read it as the legacy ERP sync relay (erp_sync_relay.js posts /push to it)
    var f = $('#k-engine'); f.src = 'idempiere.html?' + qs.toString();
    await new Promise(function (r) { f.addEventListener('load', r, { once: true }); });
    E = f.contentWindow;
    for (var i = 0; i < 1200 && !(E.TeamSync && E.__crud && E.__idmpDb && E.APP && E.APP.actor); i++) await new Promise(function (r) { setTimeout(r, 150); });
    await E.TeamSync.ready; K.ensure(E.__idmpDb);
    var pos = (await rows('SELECT * FROM c_pos ORDER BY c_pos_id LIMIT 1'))[0]; if (!pos) throw new Error('no c_pos station in this tenant');
    var org = (await rows('SELECT value FROM ad_org WHERE ad_org_id=' + Number(pos.ad_org_id)))[0] || {};
    S.cfg = { client: pos.ad_client_id, org: pos.ad_org_id, key: (org.value || pos.ad_org_id) + '-kitchen' }; loadSet();
    if (qs.get('poll')) S.set.pollMs = Number(qs.get('poll')) * 1000;   // ?poll=<seconds>: the peek period of this page (a device setting, §19.5)
    $('#k-amber').value = S.set.amber == null ? '' : S.set.amber; $('#k-red').value = S.set.red == null ? '' : S.set.red; $('#k-poll').value = Math.round(S.set.pollMs / 1000);
    bind(); netChip();
    var pair = null; try { pair = await E.TeamSync.pairState(); } catch (e) { /* not paired */ } $('#k-pair').textContent = pair && pair.enrolled ? 'paired' : 'not paired';
    if (window.PageStatus) window.PageStatus.ready((pair && pair.enrolled ? 'Joined to the branch team. ' : 'Not joined to the branch team yet: join it from the Team panel of the ERP page. ') + window.PageStatus.relayWords());
    await render(); startLink();
    setInterval(function () { if (S.cards.length) render(); }, 1000);      // the elapsed clock and colour: a local redraw, no network
    window.Kitchen = { ready: true, rows: rows, state: function () { return S; }, engine: function () { return E; }, render: render, act: act, itemTap: itemTap, recall: recall, tick: function () { return S.link.tick(); }, link: function () { return S.link; }, visit: function () { return E.TeamSync.visit(); } };
    var ms = Math.round(performance.now() - t0), heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
    log('§KDS_BOOT kitchen=' + S.cfg.key + ' org=' + S.cfg.org + ' engine_ready_ms=' + ms + ' heap_mb=' + heap + ' poll_ms=' + S.set.pollMs);
  }
  boot().catch(function (e) { log('🔴 §KDS_BOOT ' + (e && e.stack || e)); });
})();
