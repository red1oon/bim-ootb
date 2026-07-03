// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// kitchen_lens.js — the Kitchen Display lens (RESUME_POS_KITCHEN_EINVOICE_OPS_PANELS.md §T2-SPEC).
//
// DUMB TERMINAL by construction (the pos_lens.js discipline): this file renders tickets and SENDS —
// the queue is KitchenCore.foldTickets/queue over the page's published op log ∪ the §S-2 seed
// selector on b3 (open C- shipments, the SAME query the warehouse walk routes); serve is ONE signed
// group through kernel_ops.commitGroup riding pos_core's OWN completeShipmentOps (FSM + confirm gate
// intact — a confirm-demanding doctype renders GATED, never silently serveable). No document state,
// no qty math, no status logic live here. Witness: W-KDS-QUEUE (headless, bim-compiler) + live §-logs.
//
// HMI: the APP baseline palette (#121218/#e8e8ed/#6c9fff, success #5fd08a — idempiere.html's own
// .posted-balance.is-balanced green), NOT the POS lens's legacy green-on-black.
//
// Host contract (idempiere.html openKitchenFor — mirrors openPosFor):
//   KitchenLens.open({ b3, opDb, KO, seal, chainVerify, overlay, el, status })
'use strict';
(function (root) {

  var _stylesInjected = false;
  function _injectStyles() {
    if (_stylesInjected) return; _stylesInjected = true;
    var s = document.createElement('style');
    s.textContent = [
      '#kds-wrap { display:flex;flex-direction:column;gap:10px;max-height:74vh;overflow:auto;padding:8px;color:#e8e8ed; }',
      '#kds-bar  { display:flex;align-items:center;gap:10px;padding:6px 12px;border:1px solid #33334a;border-radius:24px;background:#16161d; }',
      '#kds-count{ flex:1;text-align:center;font-size:18px;font-weight:bold;color:#6c9fff;letter-spacing:.4px; }',
      '.kds-bar-btn { width:34px;height:34px;border-radius:50%;border:1px solid #33334a;background:#1a1a24;color:#e8e8ed;',
      '               cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:background .15s; }',
      '.kds-bar-btn:hover { background:rgba(108,159,255,0.16); }',
      '#kds-list { display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;align-content:start; }',
      '.kds-ticket { display:flex;flex-direction:column;border:1px solid #33334a;border-radius:10px;background:#16161d;overflow:hidden; }',
      '.kds-ticket-hdr { display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:8px 12px;',
      '                  background:#1a1a24;border-bottom:1px solid #33334a;font-size:13px;font-weight:bold;color:#6c9fff; }',
      '.kds-ticket-time { font-size:11px;font-weight:normal;color:#8b8b9e; }',
      '.kds-ticket-bp  { padding:4px 12px 0;font-size:12px;color:#a9a9b8; }',
      '.kds-lines      { padding:6px 12px;flex:1; }',
      '.kds-line       { display:flex;justify-content:space-between;font-size:13px;padding:3px 0;border-bottom:1px solid #22222e;color:#e8e8ed; }',
      '.kds-line-qty   { color:#6c9fff;font-weight:bold;margin-right:8px; }',
      '.kds-serve      { margin:8px 12px 12px;padding:9px;border-radius:8px;border:1px solid #33334a;',
      '                  background:rgba(95,208,138,0.12);color:#5fd08a;cursor:pointer;font-size:13px;font-weight:bold;',
      '                  transition:background .15s; }',
      '.kds-serve:hover { background:rgba(95,208,138,0.24); }',
      '.kds-serve.gated { background:#1a1a24;color:#8b8b9e;cursor:default;border-style:dashed; }',
      '#kds-empty { padding:32px;text-align:center;color:#8b8b9e;font-size:14px; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function _svgIcon(key, sz) {
    var ic = window.ICONS && window.ICONS[key];
    if (!ic) return '';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (sz || 16) + '" height="' + (sz || 16) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round">' + ic.svg + '</svg>';
  }

  function q1(b3, sql) {
    var a = []; for (var i = 2; i < arguments.length; i++) a.push(arguments[i]);
    var st = b3.prepare(sql); return st.get.apply(st, a);
  }
  function qa(b3, sql) {
    var a = []; for (var i = 2; i < arguments.length; i++) a.push(arguments[i]);
    var st = b3.prepare(sql); return st.all.apply(st, a);
  }

  // op rows in the shape KitchenCore.foldTickets consumes (id order — the W-KDS-QUEUE reader, verbatim)
  function _opRows(opDb) {
    try {
      var r = opDb.exec('SELECT id, timestamp, op_type, parameters FROM kernel_ops ORDER BY id');
      return (r[0] ? r[0].values : []).map(function (v) { return { id: v[0], timestamp: v[1], op_type: v[2], parameters: v[3] }; });
    } catch (e) { return []; }
  }

  // §S-2 seed selector on b3 (the walk's honest source) UNIONED under the op-log fold: ledger rows
  // that already sit in the physical db as open POS shipments. Dedup by m_inout_id — op-log wins
  // (it carries the newer status walk). JOIN precedent = pos_lens.js tiles (c_poskey→m_product→price).
  function _seedTickets(b3) {
    var hdrs = qa(b3,
      "SELECT io.m_inout_id, io.c_order_id, io.c_doctype_id, io.m_warehouse_id, io.movementtype, " +
      "io.docstatus, o.c_bpartner_id, o.c_pos_id FROM m_inout io JOIN c_order o ON o.c_order_id=io.c_order_id " +
      "WHERE io.docstatus IN ('DR','IP') AND io.movementtype='C-' AND o.c_pos_id IS NOT NULL");
    return hdrs.map(function (h, i) {
      h.seq = -1000 + i; h.timestamp = null;   // seed rows sort strictly BEFORE every log op (oldest-first)
      h.lines = qa(b3, 'SELECT c_orderline_id AS source_line_id, m_product_id, movementqty FROM m_inoutline WHERE m_inout_id=? ORDER BY m_inoutline_id', h.m_inout_id);
      return h;
    });
  }

  function open(cfg) {
    _injectStyles();
    var b3 = cfg.b3, el = cfg.el, KDS = root.KitchenCore, POS = root.POSCore;
    if (!KDS || !POS) { cfg.status('Kitchen core not loaded.'); return; }

    var wrap = el('div'); wrap.id = 'kds-wrap';
    var bar = el('div'); bar.id = 'kds-bar';
    var count = el('div'); count.id = 'kds-count';
    var refreshBtn = el('button'); refreshBtn.className = 'kds-bar-btn'; refreshBtn.title = 'Refresh queue';
    refreshBtn.innerHTML = _svgIcon('clock', 16) || '⟳';
    bar.appendChild(count); bar.appendChild(refreshBtn);
    var list = el('div'); list.id = 'kds-list';
    wrap.appendChild(bar); wrap.appendChild(list);

    function nameOf(pid) {
      var r = q1(b3, 'SELECT name FROM m_product WHERE m_product_id=?', pid);
      return r ? r.name : ('Product ' + pid);
    }
    function bpOf(bpid) {
      if (bpid == null) return '';
      var r = q1(b3, 'SELECT name FROM c_bpartner WHERE c_bpartner_id=?', bpid);
      return r ? r.name : ('BP ' + bpid);
    }
    function dtOf(dtid) {
      return dtid == null ? null : q1(b3, 'SELECT * FROM c_doctype WHERE c_doctype_id=?', dtid) || null;
    }

    function currentQueue() {
      var folded = KDS.foldTickets(_opRows(cfg.opDb));
      var seen = {};
      folded.forEach(function (t) { if (t.m_inout_id != null) seen[t.m_inout_id] = 1; });
      var seed = _seedTickets(b3).filter(function (t) { return !seen[t.m_inout_id]; });
      return KDS.queue(seed.concat(folded));
    }

    function serve(ticket, dt, btn) {
      var g = KDS.serveOps(POS, ticket, dt);
      if (!g.ok) { cfg.status('Serve refused: ' + g.reason); console.log('§KDS-SERVE REFUSED inout=' + ticket.m_inout_id + ' reason=' + g.reason); return; }
      btn.disabled = true;
      cfg.KO.commitGroup(cfg.opDb, g.ops.map(function (o) { return { op_type: o.op_type, params: o }; }), {})
        .then(function (res) {
          // T6: commitGroup RESOLVES {committed:false} — guard or a lost Serve reports success + strands the ticket.
          if (!res || !res.committed) {
            btn.disabled = false;
            console.log('§KDS-SERVE committed=N inout=' + ticket.m_inout_id + ' reason=' + ((res && res.reason) || 'unknown'));
            cfg.status('Serve NOT committed: ' + ((res && res.reason) || 'group rejected'));
            return;
          }
          return Promise.resolve(cfg.seal ? cfg.seal() : null).then(function () {
            return cfg.chainVerify ? cfg.chainVerify() : { ok: false };
          }).then(function (cv) {
            console.log('§KDS-SERVE inout=' + ticket.m_inout_id + ' order=' + ticket.c_order_id +
              ' M_InOut→CO gid=' + res.gid + ' chainOk=' + (cv && cv.ok ? 'Y' : 'N'));
            cfg.status('Served · order ' + ticket.c_order_id + ' · shipment ' + ticket.m_inout_id + ' CO');
            render();
          });
        })
        .catch(function (e) { btn.disabled = false; cfg.status('Serve commit failed: ' + e); console.log('§KDS-SERVE FAIL ' + e); });
    }

    function render() {
      list.textContent = '';
      var queue = currentQueue();
      count.textContent = queue.length + ' open ticket' + (queue.length === 1 ? '' : 's');
      if (!queue.length) {
        var empty = el('div'); empty.id = 'kds-empty';
        empty.textContent = 'No open kitchen tickets — deliver-later orders land here.';
        list.appendChild(empty);
        console.log('§KDS-EMPTY queue=0');
        return;
      }
      queue.forEach(function (t) {
        var card = document.createElement('div'); card.className = 'kds-ticket';
        card.setAttribute('data-inout', t.m_inout_id);
        var hdr = document.createElement('div'); hdr.className = 'kds-ticket-hdr';
        var ord = document.createElement('span'); ord.textContent = 'Order ' + t.c_order_id;
        var time = document.createElement('span'); time.className = 'kds-ticket-time';
        time.textContent = t.timestamp ? new Date(Number(t.timestamp)).toLocaleTimeString() : 'seed';
        hdr.appendChild(ord); hdr.appendChild(time);
        var bp = document.createElement('div'); bp.className = 'kds-ticket-bp'; bp.textContent = bpOf(t.c_bpartner_id);
        var lines = document.createElement('div'); lines.className = 'kds-lines';
        t.lines.forEach(function (l) {
          var row = document.createElement('div'); row.className = 'kds-line';
          var nm = document.createElement('span');
          var qty = document.createElement('span'); qty.className = 'kds-line-qty'; qty.textContent = Number(l.movementqty) + ' ×';
          nm.appendChild(qty); nm.appendChild(document.createTextNode(nameOf(l.m_product_id)));
          row.appendChild(nm); lines.appendChild(row);
        });
        var dt = dtOf(t.c_doctype_id);
        var gated = !!(dt && (dt.ispickqaconfirm === 'Y' || dt.isshipconfirm === 'Y'));
        var btn = document.createElement('button'); btn.className = 'kds-serve' + (gated ? ' gated' : '');
        if (gated) {
          btn.textContent = 'Confirm-gated — complete via Ship Confirmation';
          console.log('§KDS-GATED inout=' + t.m_inout_id + ' dt=' + t.c_doctype_id + ' (IsPickQAConfirm/IsShipConfirm — inout_confirm owns it)');
        } else {
          btn.innerHTML = _svgIcon('check', 14) + ' Serve';
          btn.addEventListener('click', function () { serve(t, dt, btn); });
        }
        card.appendChild(hdr); card.appendChild(bp); card.appendChild(lines); card.appendChild(btn);
        list.appendChild(card);
      });
    }

    refreshBtn.addEventListener('click', function () { render(); console.log('§KDS-REFRESH manual'); });

    render();
    cfg.overlay('Kitchen Display', wrap);
    console.log('§KDS-OPEN tickets=' + currentQueue().length + ' (fold(opDb) ∪ §S-2 seed selector, oldest-first)');
  }

  root.KitchenLens = { open: open };
  console.log('§KDS-LENS loaded (dumb terminal — the queue is a fold, serve is one signed group)');
})(typeof window !== 'undefined' ? window : this);
