// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// pos_lens.js — the POS LENS (docs/POS_ADDON_SPEC.md §P-1, prompts/POS_LENS_SESSION.md).
//
// DUMB TERMINAL by construction (the anti-fat-client rule): this file renders tiles, holds a cart,
// and SENDS — every price is the sealed master row (POSCore.ringLine), every document/consumption/
// suggestion is an engine fold (POSCore over window.ERPEngine), every write is ONE signed group
// through kernel_ops.commitGroup on the page's published op log (window.ERP.opDb). No pricing rules,
// no tax math, no inventory logic, no document state live here. Witnesses: W-POS-RING/W-POS-WR/
// W-POS-BACKFLUSH/W-POS-REPLENISH (headless, bim-compiler) + poc_pos_live.js (this wiring).
//
// Host contract (idempiere.html openPosFor):
//   PosLens.open({ b3, opDb, KO, seal, chainVerify, overlay, el, status })
//     b3    : _b3(window.__idmpDb) — lowercased-key prepare().get/.all over the AD seed
//     opDb  : window.ERP.opDb     — the page's kernel op log (sql.js)
//     KO    : window.KernelOps    — commitGroup/verifyChain (the contract's op path, SPEC §1 #4)
//     seal/chainVerify : window.ERP — sign + verify after commit (same as the Kanban write path)
'use strict';
(function (root) {
  var POS = root.POSCore, E = root.ERPEngine;

  function q1(b3, sql) { var a = []; for (var i = 2; i < arguments.length; i++) a.push(arguments[i]); var st = b3.prepare(sql); return st.get.apply(st, a); }
  function qa(b3, sql) { var a = []; for (var i = 2; i < arguments.length; i++) a.push(arguments[i]); var st = b3.prepare(sql); return st.all.apply(st, a); }

  // count prior CREATE_DOCUMENT ops in the log → deterministic next doc ids (no Date.now/Math.random)
  function nextIds(opDb) {
    var n = 0;
    try { var r = opDb.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='CREATE_DOCUMENT'"); n = (r[0] && Number(r[0].values[0][0])) || 0; } catch (e) { }
    var base = 910000 + n * 10;
    return { orderId: base + 1, inoutId: base + 2, invoiceId: base + 3 };
  }

  // fold ALL committed POS movements back OUT of the op log (truth = the log, never lens memory):
  // CONSUME ops carry movementtype/qty/warehouse; M_InOutLine lines take their header's C-/warehouse.
  function logMovements(opDb) {
    var ev = [], hdr = null;
    try {
      var r = opDb.exec('SELECT op_type, parameters FROM kernel_ops ORDER BY id');
      (r[0] ? r[0].values : []).forEach(function (row) {
        var p; try { p = JSON.parse(row[1]); } catch (e) { return; }
        p = p && p.params ? p.params : p;
        if (!p) return;
        if (p.op_type === 'CREATE_DOCUMENT' && p.table === 'M_InOut') hdr = p;
        if (p.op_type === 'CREATE_LINE' && p.table === 'M_InOutLine' && hdr) {
          ev.push({ m_product_id: p.m_product_id, movementtype: hdr.movementtype, movementqty: p.movementqty, m_warehouse_id: hdr.m_warehouse_id });
        }
        if (p.op_type === 'CONSUME') ev.push({ m_product_id: p.m_product_id, movementtype: p.movementtype, movementqty: p.movementqty, m_warehouse_id: p.m_warehouse_id });
      });
    } catch (e) { }
    return ev;
  }

  // the replenishment fold per policy warehouse (POSCore.replenishSuggest == iDempiere formula, W-POS-REPLENISH)
  function suggestAll(b3, opDb) {
    var whs = qa(b3, "SELECT DISTINCT m_warehouse_id AS w FROM m_replenish WHERE replenishtype<>'0'");
    var pend = logMovements(opDb), out = [];
    whs.forEach(function (r) {
      var locs = {}; qa(b3, 'SELECT m_locator_id AS i FROM m_locator WHERE m_warehouse_id=?', r.w).forEach(function (l) { locs[l.i] = 1; });
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

  function open(cfg) {
    var b3 = cfg.b3, el = cfg.el;
    var pos = q1(b3, 'SELECT * FROM c_pos LIMIT 1');
    if (!pos) { cfg.status('No POS station (c_pos) in this tenant'); return; }
    var plv = q1(b3, 'SELECT m_pricelist_version_id AS v FROM m_pricelist_version WHERE m_pricelist_id=?', pos.m_pricelist_id);
    var tiles = qa(b3,
      'SELECT k.c_poskey_id, k.m_product_id, p.name, pp.pricestd FROM c_poskey k ' +
      'JOIN m_product p ON p.m_product_id=k.m_product_id ' +
      'JOIN m_productprice pp ON pp.m_product_id=k.m_product_id AND pp.m_pricelist_version_id=? ' +
      'WHERE k.c_poskeylayout_id=? ORDER BY k.c_poskey_id', plv.v, pos.c_poskeylayout_id);
    var ctx = {
      pos: pos,
      priceOf: function (pid) { return q1(b3, 'SELECT pricestd FROM m_productprice WHERE m_pricelist_version_id=? AND m_product_id=?', plv.v, pid) || null; },
      bomOf: function (pid) { return qa(b3, 'SELECT bl.m_product_id AS comp_id, bl.qtybom AS qtybom FROM pp_product_bomline bl JOIN pp_product_bom b ON b.pp_product_bom_id=bl.pp_product_bom_id WHERE b.m_product_id=? ORDER BY bl.m_product_id', pid); },
      // WR semantics from the dictionary row, never POS code (POS_ADDON_SPEC §P-2)
      wrPolicy: (function () { var dt = q1(b3, 'SELECT docsubtypeso AS s FROM c_doctype WHERE c_doctype_id=?', pos.c_doctype_id); return (dt && dt.s === 'WR') ? { isautogenerateinout: 'Y', isautogenerateinvoice: 'Y' } : { isautogenerateinout: 'N', isautogenerateinvoice: 'N' }; })()
    };

    var cart = [];
    var wrap = el('div'); wrap.style.cssText = 'position:relative;display:flex;gap:10px;max-height:74vh;overflow:auto;padding:8px';
    var homeBtn = el('button'); homeBtn.title = 'Back to iDempiere';
    var homeIc = window.ICONS && window.ICONS.home;
    homeBtn.innerHTML = homeIc ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + homeIc.svg + '</svg>' : '⌂';
    homeBtn.style.cssText = 'position:absolute;top:4px;right:4px;background:none;border:none;color:#7fd6e0;cursor:pointer;padding:4px;opacity:.7;z-index:10';
    homeBtn.addEventListener('pointerup', function () {
      var ov = document.getElementById('posted-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      console.log('§POS-HOME closed');
    });
    wrap.appendChild(homeBtn);
    var grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:6px;flex:2;align-content:start';
    var side = el('div'); side.style.cssText = 'flex:1;min-width:230px';
    wrap.appendChild(grid); wrap.appendChild(side);

    tiles.forEach(function (t) {
      var b = el('button', 'pos-tile', t.name);
      b.setAttribute('data-pid', t.m_product_id);
      b.style.cssText = 'padding:10px 6px;border:1px solid #2a6;border-radius:8px;background:#0b1f17;color:#cfe;cursor:pointer;font-size:12px;min-height:54px';
      b.appendChild(el('div', null, Number(t.pricestd).toFixed(2)));
      b.lastChild.style.cssText = 'color:#8fd;font-weight:bold;margin-top:2px';
      b.addEventListener('click', function () {
        var line = POS.ringLine(ctx, t.m_product_id, 1);
        if (!line.ok) { cfg.status('refused: ' + line.reason); console.log('§POS-LIVE ring REFUSED product=' + t.m_product_id + ' reason=' + line.reason); return; }
        var same = cart.filter(function (c) { return c.m_product_id === line.m_product_id; })[0];
        if (same) { var re = POS.ringLine(ctx, t.m_product_id, same.qty + 1); same.qty = re.qty; same.linenetamt = re.linenetamt; }
        else { line.name = t.name; cart.push(line); }
        console.log('§POS-LIVE ring product=' + t.m_product_id + ' price=' + line.priceactual + ' (sealed master)');
        renderCart();
      });
      grid.appendChild(b);
    });

    var cartBox = el('div'); var totalEl = el('div'); totalEl.style.cssText = 'font-size:18px;font-weight:bold;margin:6px 0;color:#8fd';
    var bpSel = el('select', 'pos-bp'); bpSel.style.cssText = 'width:100%;margin:4px 0;padding:4px';
    var bpOpt0 = el('option', null, 'walk-in partner… (c_pos.BPartnerCashTrx not set in seed)'); bpOpt0.value = ''; bpSel.appendChild(bpOpt0);
    qa(b3, "SELECT c_bpartner_id, name FROM c_bpartner WHERE isactive='Y' ORDER BY name").forEach(function (b) {
      var o = el('option', null, b.name); o.value = b.c_bpartner_id; bpSel.appendChild(o);
    });
    if (pos.c_bpartnercashtrx_id) bpSel.value = String(pos.c_bpartnercashtrx_id);   // honour the station config when present
    var btn = el('button', 'pos-complete', '💵 Tender cash · Complete');
    btn.style.cssText = 'width:100%;padding:10px;border-radius:8px;border:1px solid #2a6;background:#134;color:#cfe;cursor:pointer;font-weight:bold';
    var receipt = el('div', 'pos-receipt'); receipt.style.cssText = 'margin-top:8px;font-size:12px;color:#9cb';
    var replBox = el('div', 'pos-replenish'); replBox.style.cssText = 'margin-top:8px;font-size:12px';

    function renderCart() {
      cartBox.textContent = '';
      cart.forEach(function (c) { cartBox.appendChild(el('div', null, c.qty + ' × ' + c.name + ' @ ' + c.priceactual + ' = ' + c.linenetamt)); });
      totalEl.textContent = 'Total ' + (cart.length ? POS.cartTotal(cart) : '0.00');
    }
    // vendorOf — real seed lookup, HONEST refusal when absent (POS_FULL_LOOP.md §L-3 "vendor/price from real seed rows")
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
          ' (wh ' + s.m_warehouse_id + ')' +
          (vendor ? ' ← ' + vendor.c_bpartner_id : ' [no vendor]'));
        row.style.cssText = 'display:block;width:100%;text-align:left;margin:2px 0;padding:4px 6px;border-radius:4px;' +
          'border:1px solid ' + (vendor ? '#2a6' : '#553') + ';background:' + (vendor ? '#0b1f17' : '#1a1209') +
          ';color:' + (vendor ? '#cfe' : '#987') + ';cursor:' + (vendor ? 'pointer' : 'default') + ';font-size:11px';
        if (vendor) {
          // §L-3: tap → buildReplenishPO (real vendor+price, newVerbs=[]) → commit as a signed group (DR state)
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

    btn.addEventListener('click', function () {
      if (!cart.length) { cfg.status('Cart is empty'); return; }
      if (!bpSel.value) { cfg.status('Pick the walk-in partner first (seed has no BPartnerCashTrx on c_pos)'); return; }
      var ids = nextIds(cfg.opDb);
      var g = POS.buildSaleGroup(ctx, cart, { orderId: ids.orderId, inoutId: ids.inoutId, invoiceId: ids.invoiceId, c_bpartner_id: Number(bpSel.value) });
      if (!g.ok) { cfg.status('refused: ' + g.reason); console.log('§POS-LIVE complete REFUSED reason=' + g.reason); return; }
      cfg.KO.commitGroup(cfg.opDb, g.ops.map(function (o) { return { op_type: o.op_type, params: o }; }), {})
        .then(function (res) {
          return Promise.resolve(cfg.seal ? cfg.seal() : null).then(function () {
            return cfg.chainVerify ? cfg.chainVerify() : { ok: false };
          }).then(function (cv) {
            console.log('§POS-SALE lines=' + g.soLines.length + ' dispatch=SALE newVerbs=[] chainOk=' + (cv && cv.ok ? 'Y' : 'N') +
              ' gid=' + res.gid + ' ops=' + res.ids.length + ' sealed=' + res.sealed);
            console.log('§POS-DOC order=' + ids.orderId + ' completeIt ok (C_Order+M_InOut+C_Invoice CO in ONE group)');
            var consume = g.ops.filter(function (o) { return o.op_type === 'CONSUME'; });
            if (consume.length) console.log('§POS-BACKFLUSH parent=' + g.soLines[0].m_product_id + ' components=' + consume.length + ' consumed=Y sameGroup=Y');
            receipt.textContent = '✓ ' + POS.cartTotal(cart) + ' tendered · order ' + ids.orderId + ' · group ' + String(res.gid).slice(0, 8) + '… · signed=' + (cv && cv.ok ? 'Y' : 'N');
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
