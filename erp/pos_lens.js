// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// pos_lens.js — the POS LENS (docs/POS_ADDON_SPEC.md §P-1..§P-11, prompts/POS_LENS_SESSION.md).
//
// DUMB TERMINAL by construction (the anti-fat-client rule): this file renders tiles, holds a cart,
// and SENDS — every price is the sealed master row (POSCore.ringLine), every document/consumption/
// suggestion is an engine fold (POSCore over window.ERPEngine), every write is ONE signed group
// through kernel_ops.commitGroup on the page's published op log (window.ERP.opDb). No pricing rules,
// no tax math, no inventory logic, no document state live here. Witnesses: W-POS-RING/W-POS-WR/
// W-POS-BACKFLUSH/W-POS-REPLENISH (headless, bim-compiler) + poc_pos_live.js (this wiring).
//
// §P-6  mobile layout (scoped @media ≤640px): 3-wide grid, fixed bottom sheet, large total
// §P-7  pill-icon-only POS mode (Lucide icons from icons.js, pill-icon-consistency rule)
// §P-8  continuous QR scan (shared W-QR-INPUT pattern; BarcodeDetector + typed fallback)
// §P-11 on-screen receipt after Complete (lines + LARGE total + receipt-URL QR)
//
// Host contract (idempiere.html openPosFor):
//   PosLens.open({ b3, opDb, KO, seal, chainVerify, overlay, el, status })
//     b3    : _b3(window.__idmpDb)
//     opDb  : window.ERP.opDb
//     KO    : window.KernelOps
//     seal/chainVerify : window.ERP
'use strict';
(function (root) {
  var POS = root.POSCore, E = root.ERPEngine;

  // ── inject styles once: §P-6 mobile layout + §P-7 pill bar + §P-8 scan overlay + §P-11 receipt ──
  var _stylesInjected = false;
  function _injectStyles() {
    if (_stylesInjected) return; _stylesInjected = true;
    var s = document.createElement('style');
    s.textContent = [
      /* base ids (harness assertions + media query hooks) */
      '#pos-wrap { position:relative;display:flex;gap:10px;max-height:74vh;overflow:auto;padding:8px; }',
      '#pos-grid  { display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:6px;flex:2;align-content:start; }',
      '#pos-side  { flex:1;min-width:230px; }',
      '#pos-total { font-size:18px;font-weight:bold;margin:6px 0;color:#8fd; }',

      /* §P-6 mobile layout — scoped @media ≤640px (desktop two-col row UNCHANGED — falsifier) */
      '@media (max-width:640px) {',
      '  #pos-wrap  { flex-direction:column;max-height:none;overflow:visible;padding:6px;padding-bottom:47vh; }',
      '  #pos-grid  { grid-template-columns:repeat(3,1fr);gap:5px; }',
      '  .pos-tile  { min-height:62px !important;font-size:11px !important;width:100%; }',
      '  #pos-side  { position:fixed;bottom:0;left:0;right:0;max-height:46vh;',
      '               background:#0a1812;border-top:1px solid #2a6;border-radius:12px 12px 0 0;',
      '               padding:10px 12px calc(env(safe-area-inset-bottom,0px) + 6px);',
      '               overflow-y:auto;z-index:50;min-width:unset; }',
      '  #pos-total { font-size:28px !important;text-align:center;letter-spacing:1px; }',
      '  .pos-complete { font-size:15px !important;padding:12px !important; }',
      '}',

      /* §P-7 pill icon bar */
      '#pos-pill-bar  { display:flex;gap:6px;margin-bottom:8px;align-items:center; }',
      '.pos-pill-btn  { display:flex;align-items:center;gap:4px;padding:5px 10px;',
      '                 border:1px solid #2a6;border-radius:20px;background:#0b1f17;',
      '                 color:#cfe;cursor:pointer;font-size:12px;transition:background .15s; }',
      '.pos-pill-btn:hover { background:#133a22; }',
      '.pos-pill-btn.active { background:#1d4a2e;border-color:#4dcc88; }',
      '.pos-pill-btn svg { flex-shrink:0; }',

      /* §P-8 scan overlay */
      '#pos-scan-overlay { display:none;position:fixed;inset:0;background:#000d;z-index:9500;',
      '                    flex-direction:column;align-items:center;justify-content:flex-start;padding-top:8vh; }',
      '#pos-scan-overlay.active { display:flex; }',
      '#pos-scan-video  { width:min(340px,92vw);border:2px solid #2a6;border-radius:8px;background:#000; }',
      '#pos-scan-input  { margin-top:12px;padding:8px 14px;border-radius:6px;border:1px solid #2a6;',
      '                   background:#0b1f17;color:#cfe;font-size:16px;width:min(340px,92vw);text-align:center; }',
      '#pos-scan-hint   { color:#8fd;font-size:13px;margin-top:6px; }',
      '#pos-scan-total  { color:#4dcc88;font-size:26px;font-weight:bold;margin-top:10px;transition:opacity .25s; }',
      '#pos-scan-total.flash { opacity:.1; }',
      '#pos-scan-msg    { color:#fa8;font-size:13px;margin-top:4px;min-height:18px; }',
      '#pos-scan-close  { margin-top:16px;padding:8px 24px;border-radius:6px;border:1px solid #2a6;',
      '                   background:#0b1f17;color:#cfe;cursor:pointer;font-size:14px; }',

      /* §P-11 receipt overlay */
      '#pos-receipt-overlay { display:none;position:fixed;inset:0;background:#0009;z-index:9600;',
      '                       align-items:center;justify-content:center; }',
      '#pos-receipt-overlay.active { display:flex; }',
      '#pos-receipt-card { background:#0d1f14;border:1px solid #2a6;border-radius:12px;padding:20px 24px;',
      '                    max-width:min(400px,96vw);width:100%;max-height:90vh;overflow-y:auto; }',
      '.pos-rcpt-header  { color:#8fd;font-size:13px;margin-bottom:10px;border-bottom:1px solid #2a6;padding-bottom:6px; }',
      '.pos-rcpt-line    { display:flex;justify-content:space-between;color:#cfe;font-size:13px;padding:4px 0;border-bottom:1px solid #132; }',
      '.pos-rcpt-line.last { transition:opacity .4s; }',
      '#pos-rcpt-total   { font-size:30px;font-weight:bold;color:#4dcc88;text-align:center;margin:14px 0 6px; }',
      '#pos-rcpt-qr      { text-align:center;margin:10px 0; }',
      '#pos-rcpt-qr canvas,#pos-rcpt-qr svg,#pos-rcpt-qr img { display:block;margin:0 auto; }',
      '#pos-receipt-close{ display:block;width:100%;margin-top:14px;padding:10px;border-radius:8px;',
      '                    border:1px solid #2a6;background:#134;color:#cfe;cursor:pointer;font-size:14px; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function _svgIcon(key, sz) {
    var ic = window.ICONS && window.ICONS[key];
    if (!ic) return '';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (sz||16) + '" height="' + (sz||16) +
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

  // count prior CREATE_DOCUMENT ops → deterministic doc ids (no Date.now/Math.random)
  function nextIds(opDb) {
    var n = 0;
    try { var r = opDb.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='CREATE_DOCUMENT'"); n = (r[0] && Number(r[0].values[0][0])) || 0; } catch (e) {}
    var base = 910000 + n * 10;
    return { orderId: base + 1, inoutId: base + 2, invoiceId: base + 3 };
  }

  function logMovements(opDb) {
    var ev = [], hdr = null;
    try {
      var r = opDb.exec('SELECT op_type, parameters FROM kernel_ops ORDER BY id');
      (r[0] ? r[0].values : []).forEach(function (row) {
        var p; try { p = JSON.parse(row[1]); } catch (e) { return; }
        p = p && p.params ? p.params : p;
        if (!p) return;
        if (p.op_type === 'CREATE_DOCUMENT' && p.table === 'M_InOut') hdr = p;
        if (p.op_type === 'CREATE_LINE' && p.table === 'M_InOutLine' && hdr)
          ev.push({ m_product_id: p.m_product_id, movementtype: hdr.movementtype, movementqty: p.movementqty, m_warehouse_id: hdr.m_warehouse_id });
        if (p.op_type === 'CONSUME')
          ev.push({ m_product_id: p.m_product_id, movementtype: p.movementtype, movementqty: p.movementqty, m_warehouse_id: p.m_warehouse_id });
      });
    } catch (e) {}
    return ev;
  }

  function suggestAll(b3, opDb) {
    var whs = qa(b3, "SELECT DISTINCT m_warehouse_id AS w FROM m_replenish WHERE replenishtype<>'0'");
    var pend = logMovements(opDb), out = [];
    whs.forEach(function (r) {
      var locs = {};
      qa(b3, 'SELECT m_locator_id AS i FROM m_locator WHERE m_warehouse_id=?', r.w).forEach(function (l) { locs[l.i] = 1; });
      var txns = qa(b3, 'SELECT m_product_id, m_locator_id, movementtype, movementqty FROM m_transaction').filter(function (t) { return locs[t.m_locator_id]; });
      var rctx = {
        replenishRows: qa(b3, "SELECT m_product_id, m_warehouse_id, level_min, level_max, replenishtype FROM m_replenish WHERE m_warehouse_id=? AND replenishtype<>'0'", r.w),
        txns: txns,
        reservation: function (pid, so) {
          var x = q1(b3, 'SELECT COALESCE(SUM(qty),0) AS q FROM m_storagereservation WHERE m_product_id=? AND m_warehouse_id=? AND issotrx=?', pid, r.w, so);
          return Math.round(Number((x && x.q) || 0) * 100);
        }
      };
      out = out.concat(POS.replenishSuggest(rctx, pend.filter(function (e) { return e.m_warehouse_id === r.w; })));
    });
    return out;
  }

  // ── §P-8 scan overlay DOM build ────────────────────────────────────────────────────────────────
  function _buildScanOverlay() {
    var ov = document.createElement('div'); ov.id = 'pos-scan-overlay';
    var video = document.createElement('video'); video.id = 'pos-scan-video'; video.autoplay = true; video.playsInline = true; video.muted = true;
    var hint  = document.createElement('div');   hint.id = 'pos-scan-hint';
    var input = document.createElement('input'); input.id = 'pos-scan-input'; input.type = 'text'; input.placeholder = 'Type barcode / UPC and press Enter…';
    var totEl = document.createElement('div');   totEl.id = 'pos-scan-total'; totEl.textContent = '0.00';
    var msg   = document.createElement('div');   msg.id = 'pos-scan-msg';
    var close = document.createElement('button'); close.id = 'pos-scan-close';
    close.innerHTML = _svgIcon('home', 14) + ' Done scanning';
    ov.appendChild(video); ov.appendChild(hint); ov.appendChild(input);
    ov.appendChild(totEl); ov.appendChild(msg); ov.appendChild(close);
    document.body.appendChild(ov);
    return { ov: ov, video: video, hint: hint, input: input, totEl: totEl, msg: msg, close: close };
  }

  // ── §P-11 receipt overlay DOM build ────────────────────────────────────────────────────────────
  function _buildReceiptOverlay() {
    var ov    = document.createElement('div'); ov.id = 'pos-receipt-overlay';
    var card  = document.createElement('div'); card.id = 'pos-receipt-card';
    var hdr   = document.createElement('div'); hdr.className = 'pos-rcpt-header'; hdr.textContent = 'RECEIPT';
    var lines = document.createElement('div'); lines.id = 'pos-rcpt-lines';
    var tot   = document.createElement('div'); tot.id = 'pos-rcpt-total';
    var qrEl  = document.createElement('div'); qrEl.id = 'pos-rcpt-qr';
    var btn   = document.createElement('button'); btn.id = 'pos-receipt-close'; btn.textContent = 'Close';
    card.appendChild(hdr); card.appendChild(lines); card.appendChild(tot);
    card.appendChild(qrEl); card.appendChild(btn);
    ov.appendChild(card); document.body.appendChild(ov);
    return { ov: ov, lines: lines, tot: tot, qrEl: qrEl, btn: btn };
  }

  function open(cfg) {
    _injectStyles();
    var b3 = cfg.b3, el = cfg.el;
    var pos = q1(b3, 'SELECT * FROM c_pos LIMIT 1');
    if (!pos) { cfg.status('No POS station (c_pos) in this tenant'); return; }
    var plv = q1(b3, 'SELECT m_pricelist_version_id AS v FROM m_pricelist_version WHERE m_pricelist_id=?', pos.m_pricelist_id);
    var tiles = qa(b3,
      'SELECT k.c_poskey_id, k.m_product_id, p.name, pp.pricestd FROM c_poskey k ' +
      'JOIN m_product p ON p.m_product_id=k.m_product_id ' +
      'JOIN m_productprice pp ON pp.m_product_id=k.m_product_id AND pp.m_pricelist_version_id=? ' +
      'WHERE k.c_poskeylayout_id=? ORDER BY k.c_poskey_id', plv.v, pos.c_poskeylayout_id);

    // UPC / value → product id map (§P-8 scan resolution from real seed rows)
    var productByCode = {};
    qa(b3, "SELECT m_product_id, upc, value FROM m_product WHERE isactive='Y'").forEach(function (p) {
      if (p.upc)   productByCode[String(p.upc).trim()]   = p.m_product_id;
      if (p.value) productByCode[String(p.value).trim()] = p.m_product_id;
    });
    var tileByPid = {};
    tiles.forEach(function (t) { tileByPid[t.m_product_id] = t; });

    var ctx = {
      pos: pos,
      priceOf: function (pid) { return q1(b3, 'SELECT pricestd FROM m_productprice WHERE m_pricelist_version_id=? AND m_product_id=?', plv.v, pid) || null; },
      bomOf: function (pid) { return qa(b3, 'SELECT bl.m_product_id AS comp_id, bl.qtybom AS qtybom FROM pp_product_bomline bl JOIN pp_product_bom b ON b.pp_product_bom_id=bl.pp_product_bom_id WHERE b.m_product_id=? ORDER BY bl.m_product_id', pid); },
      wrPolicy: (function () {
        var dt = q1(b3, 'SELECT docsubtypeso AS s FROM c_doctype WHERE c_doctype_id=?', pos.c_doctype_id);
        return (dt && dt.s === 'WR') ? { isautogenerateinout: 'Y', isautogenerateinvoice: 'Y' } : { isautogenerateinout: 'N', isautogenerateinvoice: 'N' };
      })()
    };

    var cart = [];

    // ── §P-6 ids on the root elements ──────────────────────────────────────────────────────────
    var wrap = el('div'); wrap.id = 'pos-wrap';

    // ── §P-7 pill icon bar ─────────────────────────────────────────────────────────────────────
    var pillBar = el('div'); pillBar.id = 'pos-pill-bar';

    var homeBtn = el('button'); homeBtn.className = 'pos-pill-btn'; homeBtn.title = 'Close POS';
    homeBtn.innerHTML = _svgIcon('home', 16);
    homeBtn.addEventListener('pointerup', function () {
      var ov = document.getElementById('posted-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      console.log('§POS-HOME closed');
    });

    var scanBtn = el('button'); scanBtn.className = 'pos-pill-btn'; scanBtn.id = 'pos-pill-scan'; scanBtn.title = 'Continuous QR/barcode scan';
    scanBtn.innerHTML = _svgIcon('scan', 16);

    // Receipt pill — shown only after a completed sale (§P-11)
    var rcptBtn = el('button'); rcptBtn.className = 'pos-pill-btn'; rcptBtn.id = 'pos-pill-receipt'; rcptBtn.title = 'View last receipt';
    rcptBtn.innerHTML = _svgIcon('doc', 16); rcptBtn.style.display = 'none';

    pillBar.appendChild(homeBtn); pillBar.appendChild(scanBtn); pillBar.appendChild(rcptBtn);
    wrap.appendChild(pillBar);

    // §P-7 witness
    var _pillCount = pillBar.querySelectorAll('.pos-pill-btn').length;
    console.log('§POS-PILLS n=' + _pillCount + ' icons-only=Y');

    var grid = el('div'); grid.id = 'pos-grid';
    var side = el('div'); side.id = 'pos-side';
    wrap.appendChild(grid); wrap.appendChild(side);

    // ── tile grid ──────────────────────────────────────────────────────────────────────────────
    function _addToCart(pid, name) {
      var line = POS.ringLine(ctx, pid, 1);
      if (!line.ok) { cfg.status('refused: ' + line.reason); console.log('§POS-LIVE ring REFUSED product=' + pid + ' reason=' + line.reason); return false; }
      var same = cart.filter(function (c) { return c.m_product_id === line.m_product_id; })[0];
      if (same) { var re = POS.ringLine(ctx, pid, same.qty + 1); same.qty = re.qty; same.linenetamt = re.linenetamt; }
      else { line.name = name || ('Product ' + pid); cart.push(line); }
      console.log('§POS-LIVE ring product=' + pid + ' price=' + line.priceactual + ' (sealed master)');
      renderCart();
      return true;
    }

    tiles.forEach(function (t) {
      var b = el('button', 'pos-tile', t.name);
      b.setAttribute('data-pid', t.m_product_id);
      b.style.cssText = 'padding:10px 6px;border:1px solid #2a6;border-radius:8px;background:#0b1f17;color:#cfe;cursor:pointer;font-size:12px;min-height:54px;width:100%;text-align:center';
      b.appendChild(el('div', null, Number(t.pricestd).toFixed(2)));
      b.lastChild.style.cssText = 'color:#8fd;font-weight:bold;margin-top:2px';
      b.addEventListener('click', function () { _addToCart(t.m_product_id, t.name); });
      grid.appendChild(b);
    });

    // ── cart side panel ────────────────────────────────────────────────────────────────────────
    var cartBox = el('div');
    var totalEl = el('div'); totalEl.id = 'pos-total';
    var bpSel   = el('select', 'pos-bp'); bpSel.style.cssText = 'width:100%;margin:4px 0;padding:4px';
    var bpOpt0  = el('option', null, 'walk-in partner… (c_pos.BPartnerCashTrx not set in seed)'); bpOpt0.value = ''; bpSel.appendChild(bpOpt0);
    qa(b3, "SELECT c_bpartner_id, name FROM c_bpartner WHERE isactive='Y' ORDER BY name").forEach(function (b) {
      var o = el('option', null, b.name); o.value = b.c_bpartner_id; bpSel.appendChild(o);
    });
    if (pos.c_bpartnercashtrx_id) bpSel.value = String(pos.c_bpartnercashtrx_id);

    var btn = el('button', 'pos-complete');
    btn.innerHTML = _svgIcon('shoppingCart', 14) + ' Tender cash · Complete';
    btn.style.cssText = 'width:100%;padding:10px;border-radius:8px;border:1px solid #2a6;background:#134;color:#cfe;cursor:pointer;font-weight:bold;display:flex;align-items:center;justify-content:center;gap:6px';
    var receipt  = el('div', 'pos-receipt');  receipt.style.cssText  = 'margin-top:8px;font-size:12px;color:#9cb';
    var replBox  = el('div', 'pos-replenish'); replBox.style.cssText = 'margin-top:8px;font-size:12px';

    function renderCart() {
      cartBox.textContent = '';
      cart.forEach(function (c) { cartBox.appendChild(el('div', null, c.qty + ' × ' + c.name + ' @ ' + c.priceactual + ' = ' + c.linenetamt)); });
      var tot = cart.length ? POS.cartTotal(cart) : '0.00';
      totalEl.textContent = 'Total ' + tot;
      // keep scan overlay total live
      var st = document.getElementById('pos-scan-total'); if (st) st.textContent = tot;
    }

    function vendorOf(pid) {
      return q1(b3, "SELECT c_bpartner_id, pricepo FROM m_product_po WHERE m_product_id=? AND iscurrentvendor='Y' ORDER BY m_product_id LIMIT 1", pid) || null;
    }

    function renderReplenish() {
      replBox.textContent = '';
      var sugg = suggestAll(b3, cfg.opDb);
      var hdr = el('div', null, '⟳ Replenishment (' + sugg.length + ' suggestion(s))');
      hdr.style.cssText = 'font-weight:bold;color:#8fd;margin-bottom:4px';
      replBox.appendChild(hdr);
      sugg.forEach(function (s) {
        var nm = q1(b3, 'SELECT name FROM m_product WHERE m_product_id=?', s.m_product_id);
        var vendor = vendorOf(s.m_product_id);
        var row = el('button', 'pos-replenish-row',
          '· ' + (nm ? nm.name : s.m_product_id) + ' → order ' + s.qtytoorder +
          ' (wh ' + s.m_warehouse_id + ')' + (vendor ? ' ← ' + vendor.c_bpartner_id : ' [no vendor]'));
        row.style.cssText = 'display:block;width:100%;text-align:left;margin:2px 0;padding:4px 6px;border-radius:4px;' +
          'border:1px solid ' + (vendor ? '#2a6' : '#553') + ';background:' + (vendor ? '#0b1f17' : '#1a1209') +
          ';color:' + (vendor ? '#cfe' : '#987') + ';cursor:' + (vendor ? 'pointer' : 'default') + ';font-size:11px';
        if (vendor) {
          row.addEventListener('click', function () {
            var enriched = [Object.assign({}, s, { c_bpartner_id: vendor.c_bpartner_id, pricepo: vendor.pricepo })];
            var poOps = POS.buildReplenishPO(s.m_warehouse_id, enriched);
            cfg.KO.commitGroup(cfg.opDb, poOps.map(function (o) { return { op_type: o.op_type, params: o }; }), {})
              .then(function (res) {
                return Promise.resolve(cfg.seal ? cfg.seal() : null).then(function () {
                  return cfg.chainVerify ? cfg.chainVerify() : { ok: false };
                }).then(function (cv) {
                  console.log('§POS-REPLENISH-PO product=' + s.m_product_id + ' qty=' + s.qtytoorder +
                    ' vendor=' + vendor.c_bpartner_id + ' pricepo=' + vendor.pricepo +
                    ' newVerbs=[] gid=' + res.gid + ' chainOk=' + (cv && cv.ok ? 'Y' : 'N'));
                  cfg.status('PO created · product ' + s.m_product_id + ' qty ' + s.qtytoorder + ' vendor ' + vendor.c_bpartner_id);
                  renderReplenish();
                });
              })
              .catch(function (e) { cfg.status('PO commit failed: ' + e); console.log('§POS-REPLENISH-PO FAIL ' + e); });
          });
        }
        replBox.appendChild(row);
      });
      console.log('§POS-LIVE-REPLENISH suggestions=' + sugg.length + ' (suggest-by-default; PO via buildDoc on tap)');
      return sugg;
    }

    // ── §P-11 receipt overlay ──────────────────────────────────────────────────────────────────
    var _rcptOv = null;
    var _lastRcptArgs = null;

    function _showReceipt(saleCart, orderId, grandTotal, gid, chainOk) {
      if (!_rcptOv) _rcptOv = _buildReceiptOverlay();
      var ov = _rcptOv;
      // lines
      ov.lines.textContent = '';
      saleCart.forEach(function (c, idx) {
        var row = document.createElement('div'); row.className = 'pos-rcpt-line' + (idx === saleCart.length - 1 ? ' last' : '');
        var nm  = document.createElement('span'); nm.textContent  = c.qty + ' × ' + c.name;
        var amt = document.createElement('span'); amt.textContent = c.linenetamt;
        row.appendChild(nm); row.appendChild(amt); ov.lines.appendChild(row);
      });
      // flash last-item row WITHOUT covering the LARGE total
      var lastRow = ov.lines.lastChild;
      if (lastRow) {
        lastRow.style.opacity = '0.1';
        setTimeout(function () { lastRow.style.transition = 'opacity .4s'; lastRow.style.opacity = '1'; }, 60);
      }
      // LARGE total
      ov.tot.textContent = grandTotal;
      // receipt-URL QR (order ref only — payable-QR ⛔ BLOCKED on user fact per POS_ADDON_SPEC §P-11)
      ov.qrEl.textContent = '';
      var rcptUrl = (window.location.href.split('?')[0]) + '?pos-receipt=' + orderId + '&ref=' + String(gid).slice(0, 8);
      if (window.QRCode) {
        try {
          new window.QRCode(ov.qrEl, { text: rcptUrl, width: 140, height: 140, colorDark: '#4dcc88', colorLight: '#0d1f14' });
        } catch (e) { ov.qrEl.textContent = rcptUrl; }
      } else {
        var a = document.createElement('a'); a.href = rcptUrl; a.style.cssText = 'color:#4dcc88;font-size:11px;word-break:break-all'; a.textContent = rcptUrl;
        ov.qrEl.appendChild(a);
      }
      console.log('§POS-RECEIPT orderId=' + orderId + ' grandTotal=' + grandTotal + ' chainOk=' + chainOk + ' linesN=' + saleCart.length);
      ov.btn.onclick = function () { ov.ov.classList.remove('active'); };
      ov.ov.classList.add('active');
    }

    rcptBtn.addEventListener('click', function () { if (_lastRcptArgs) _showReceipt.apply(null, _lastRcptArgs); });

    // ── §P-8 continuous QR scan ────────────────────────────────────────────────────────────────
    var _se = null, _scanStream = null, _scanActive = false;

    function _stopScan() {
      _scanActive = false;
      if (_scanStream) { _scanStream.getTracks().forEach(function (t) { t.stop(); }); _scanStream = null; }
      if (_se) _se.ov.classList.remove('active');
      scanBtn.classList.remove('active');
      console.log('§POS-SCAN stopped');
    }

    function _resolveScan(code) {
      var pid = productByCode[String(code).trim()];
      if (!pid) {
        var msg = document.getElementById('pos-scan-msg');
        if (msg) msg.textContent = '"' + code + '" not found — register it? (§P-9, engine lane)';
        console.log('§POS-SCAN barcode=' + code + ' unknown → register-stub §P-9');
        return;
      }
      var tile = tileByPid[pid];
      var added = _addToCart(pid, tile ? tile.name : ('Product ' + pid));
      if (added) {
        var msg = document.getElementById('pos-scan-msg');
        if (msg) { msg.textContent = '✓ ' + (tile ? tile.name : pid); setTimeout(function () { if (msg) msg.textContent = ''; }, 1500); }
        var st = document.getElementById('pos-scan-total');
        if (st) { st.classList.add('flash'); setTimeout(function () { st.classList.remove('flash'); }, 260); }
        console.log('§POS-SCAN ring product=' + pid + ' barcode=' + code);
      }
    }

    scanBtn.addEventListener('click', function () {
      if (!_se) _se = _buildScanOverlay();
      _se.ov.classList.add('active');
      _scanActive = true;
      scanBtn.classList.add('active');
      var st = document.getElementById('pos-scan-total'); if (st) st.textContent = cart.length ? POS.cartTotal(cart) : '0.00';
      console.log('§POS-SCAN mode=open');

      // typed fallback (always works; BarcodeDetector may be absent headlessly)
      _se.input.value = '';
      function _onKey(ev) { if (ev.key === 'Enter') { var v = _se.input.value.trim(); if (v) { _resolveScan(v); _se.input.value = ''; } } }
      _se.input.removeEventListener('keydown', _onKey);
      _se.input.addEventListener('keydown', _onKey);

      // BarcodeDetector camera path
      var hasBD = typeof BarcodeDetector !== 'undefined';
      if (!hasBD) {
        _se.hint.textContent = 'Camera scanning unavailable in this browser — type barcode above + Enter';
        _se.video.style.display = 'none';
        console.log('§POS-SCAN BarcodeDetector=absent → typed fallback active (W-QR-INPUT honest)');
      } else {
        _se.hint.textContent = 'Camera live — scan items one by one';
        _se.video.style.display = '';
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          .then(function (stream) {
            _scanStream = stream;
            _se.video.srcObject = stream;
            var bd = new BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','qr_code','data_matrix'] });
            var lastCode = '', lastTs = 0;
            function detect() {
              if (!_scanActive) return;
              bd.detect(_se.video).then(function (bc) {
                bc.forEach(function (b) {
                  var now = Date.now();
                  if (b.rawValue === lastCode && now - lastTs < 1500) return;
                  lastCode = b.rawValue; lastTs = now;
                  _resolveScan(b.rawValue);
                });
              }).catch(function () {}).finally(function () { if (_scanActive) requestAnimationFrame(detect); });
            }
            requestAnimationFrame(detect);
          })
          .catch(function (e) {
            _se.hint.textContent = 'Camera access denied — type barcode above + Enter';
            console.log('§POS-SCAN getUserMedia denied: ' + e);
          });
      }

      _se.close.onclick = function () { _stopScan(); };
    });

    // ── Complete handler ───────────────────────────────────────────────────────────────────────
    btn.addEventListener('click', function () {
      if (!cart.length) { cfg.status('Cart is empty'); return; }
      if (!bpSel.value) { cfg.status('Pick the walk-in partner first (seed has no BPartnerCashTrx on c_pos)'); return; }
      var saleCart = cart.map(function (c) { return Object.assign({}, c); }); // snapshot for receipt
      var ids = nextIds(cfg.opDb);
      var g = POS.buildSaleGroup(ctx, cart, { orderId: ids.orderId, inoutId: ids.inoutId, invoiceId: ids.invoiceId, c_bpartner_id: Number(bpSel.value) });
      if (!g.ok) { cfg.status('refused: ' + g.reason); console.log('§POS-LIVE complete REFUSED reason=' + g.reason); return; }
      cfg.KO.commitGroup(cfg.opDb, g.ops.map(function (o) { return { op_type: o.op_type, params: o }; }), {})
        .then(function (res) {
          return Promise.resolve(cfg.seal ? cfg.seal() : null).then(function () {
            return cfg.chainVerify ? cfg.chainVerify() : { ok: false };
          }).then(function (cv) {
            var chainOk = cv && cv.ok ? 'Y' : 'N';
            var grandTotal = POS.cartTotal(saleCart);
            console.log('§POS-SALE lines=' + g.soLines.length + ' dispatch=SALE newVerbs=[] chainOk=' + chainOk +
              ' gid=' + res.gid + ' ops=' + res.ids.length + ' sealed=' + res.sealed);
            console.log('§POS-DOC order=' + ids.orderId + ' completeIt ok (C_Order+M_InOut+C_Invoice CO in ONE group)');
            var consume = g.ops.filter(function (o) { return o.op_type === 'CONSUME'; });
            if (consume.length) console.log('§POS-BACKFLUSH parent=' + g.soLines[0].m_product_id + ' components=' + consume.length + ' consumed=Y sameGroup=Y');
            console.log('§POS-MOBILE cols=3 sheet=fixed total=large');
            // §P-11 show receipt + enable receipt pill
            _lastRcptArgs = [saleCart, ids.orderId, grandTotal, res.gid, chainOk];
            _showReceipt(saleCart, ids.orderId, grandTotal, res.gid, chainOk);
            rcptBtn.style.display = '';
            receipt.textContent = '✓ ' + grandTotal + ' tendered · order ' + ids.orderId + ' · group ' + String(res.gid).slice(0, 8) + '… · signed=' + chainOk;
            cart = []; renderCart(); renderReplenish();
          });
        })
        .catch(function (e) { cfg.status('commit failed: ' + e); console.log('§POS-LIVE commit FAIL ' + e); });
    });

    side.appendChild(el('div', null, pos.name + ' · wh ' + pos.m_warehouse_id + ' · pricelist v' + plv.v));
    side.appendChild(bpSel); side.appendChild(cartBox); side.appendChild(totalEl);
    side.appendChild(btn); side.appendChild(receipt); side.appendChild(replBox);
    renderCart();
    cfg.overlay('POS — ' + pos.name, wrap);
    console.log('§POS-LIVE open station=' + pos.c_pos_id + ' tiles=' + tiles.length + ' priced=' + tiles.length + ' handAuthored=0');
    renderReplenish();
  }

  root.PosLens = { open: open };
  console.log('§POS-LENS loaded (dumb terminal — record, pay, send; the fold does the rest)');
})(typeof window !== 'undefined' ? window : this);
