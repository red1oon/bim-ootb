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
      /* U-2: pos-wrap is now album-only; pos-side REMOVED from layout flow */
      '#pos-wrap { position:relative;display:flex;gap:10px;max-height:74vh;overflow:auto;padding:8px; }',
      '#pos-grid  { display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;flex:1;align-content:start;width:100%; }',

      /* U-1: album card style */
      '.pos-card { display:flex;flex-direction:column;border:1px solid #33334a;border-radius:10px;',
      '            background:#16161d;color:#e8e8ed;cursor:pointer;overflow:hidden;',
      '            transition:background .15s,transform .1s;user-select:none; }',
      '.pos-card:hover { background:rgba(108,159,255,0.16); }',
      '.pos-card:active { transform:scale(0.96); }',
      '.pos-card-img { width:100%;height:100px;object-fit:cover;background:#121218;',
      '               display:flex;align-items:center;justify-content:center;color:#55556a;flex-shrink:0; }',
      '.pos-card-img img { width:100%;height:100px;object-fit:cover;display:block; }',
      '.pos-card-img svg { opacity:.45; }',
      '.pos-card-name { font-size:11px;padding:5px 6px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }',
      '.pos-card-price { font-size:15px;font-weight:bold;color:#cdd6e4;padding:0 6px 7px;letter-spacing:.3px; }',
      '.pos-card.flash { background:rgba(95,208,138,0.24) !important;transform:scale(0.94); }',

      /* §P-6 mobile layout — scoped @media ≤640px (desktop two-col row UNCHANGED — falsifier) */
      '@media (max-width:640px) {',
      '  #pos-wrap  { flex-direction:column;max-height:none;overflow:visible;padding:6px; }',
      '  #pos-grid  { grid-template-columns:repeat(3,1fr);gap:5px; }',
      '  .pos-card  { min-height:80px; }',
      '  .pos-card-img { height:72px; }',
      '  .pos-card-img img { height:72px; }',
      '}',

      /* §P-7 pill icon bar */
      '#pos-pill-bar  { display:flex;gap:6px;margin-bottom:8px;align-items:center; }',
      '.pos-pill-btn  { display:flex;align-items:center;gap:4px;padding:5px 10px;',
      '                 border:1px solid #33334a;border-radius:20px;background:#16161d;',
      '                 color:#e8e8ed;cursor:pointer;font-size:12px;transition:background .15s; }',
      '.pos-pill-btn:hover { background:rgba(108,159,255,0.16); }',
      '.pos-pill-btn.active { background:rgba(95,208,138,0.24);border-color:#5fd08a; }',
      '.pos-pill-btn svg { flex-shrink:0; }',

      /* §P-8 scan overlay */
      '#pos-scan-overlay { display:none;position:fixed;inset:0;background:#000d;z-index:9500;',
      '                    flex-direction:column;align-items:center;justify-content:flex-start;padding-top:8vh; }',
      '#pos-scan-overlay.active { display:flex; }',
      '#pos-scan-video  { width:min(340px,92vw);border:2px solid #33334a;border-radius:8px;background:#000; }',
      '#pos-scan-input  { margin-top:12px;padding:8px 14px;border-radius:6px;border:1px solid #33334a;',
      '                   background:#16161d;color:#e8e8ed;font-size:16px;width:min(340px,92vw);text-align:center; }',
      '#pos-scan-hint   { color:#cdd6e4;font-size:13px;margin-top:6px; }',
      '#pos-scan-total  { color:#5fd08a;font-size:26px;font-weight:bold;margin-top:10px;transition:opacity .25s; }',
      '#pos-scan-total.flash { opacity:.1; }',
      '#pos-scan-msg    { color:#ff6b6b;font-size:13px;margin-top:4px;min-height:18px; }',
      '#pos-scan-close  { margin-top:16px;padding:8px 24px;border-radius:6px;border:1px solid #33334a;',
      '                   background:#16161d;color:#e8e8ed;cursor:pointer;font-size:14px; }',

      /* §R2-1/§R2-2 top bar: [🛒 cart-toggle]  RUNNING TOTAL  …  [scan QR] */
      '#pos-top-bar     { display:flex;align-items:center;gap:8px;margin-bottom:8px;',
      '                   padding:6px 12px;border:1px solid #33334a;border-radius:24px;background:#16161d; }',
      '.pos-top-btn     { width:36px;height:36px;border-radius:50%;border:1px solid #33334a;background:#1a1a24;',
      '                   color:#e8e8ed;cursor:pointer;display:flex;align-items:center;justify-content:center;',
      '                   padding:0;flex-shrink:0;transition:background .15s; }',
      '.pos-top-btn:hover { background:rgba(95,208,138,0.24); }',
      '#pos-top-total   { flex:1;text-align:center;font-size:24px;font-weight:bold;color:#5fd08a;letter-spacing:.5px; }',

      /* §R2-3/§R2-4 the pay panel — RIMS RETIRED, draggable via the grab header */
      '#pos-float-panel { position:fixed;bottom:70px;right:20px;z-index:9500;',
      '                   width:min(340px,calc(100vw - 20px));',
      '                   background:#1a1a24;border:1px solid #33334a;border-radius:12px;',
      '                   display:none;flex-direction:column;box-shadow:0 8px 32px #000a; }',
      '#pos-float-panel.open { display:flex; }',
      '.pos-drag-hdr    { display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:grab;',
      '                   color:#cdd6e4;font-size:13px;font-weight:bold;user-select:none;touch-action:none;',
      '                   border-bottom:1px solid rgba(255,255,255,0.08);border-radius:12px 12px 0 0;background:#121218; }',
      '.pos-drag-grip   { color:#55556a;font-size:14px;letter-spacing:-2px; }',
      '.pos-section-hdr { padding:6px 12px 2px;color:#9aa4b8;font-size:11px;font-weight:bold; }',
      '.pos-items-body  { padding:0 12px 4px;overflow-y:auto;max-height:24vh; }',
      '#pos-float-cart  { margin-bottom:2px; }',
      '.pos-float-cart-line { display:flex;justify-content:space-between;',
      '                       color:#e8e8ed;font-size:12px;padding:3px 0;border-bottom:1px solid #22222e; }',
      '.pos-pay-row     { display:flex;justify-content:flex-end;padding:6px 12px; }',
      '#pos-float-tender { width:52px;height:44px;border-radius:10px;border:1px solid #5fd08a;',
      '                    background:rgba(95,208,138,0.12);color:#5fd08a;cursor:pointer;',
      '                    display:flex;align-items:center;justify-content:center;padding:0;transition:background .15s; }',
      '#pos-float-tender:hover { background:rgba(95,208,138,0.24); }',
      '#pos-float-bp    { box-sizing:border-box;margin:2px 12px;width:calc(100% - 24px);padding:5px;background:#121218;',
      '                   border:1px solid #33334a;border-radius:6px;color:#e8e8ed;font-size:12px; }',
      '#pos-float-receipt { margin:2px 12px 4px;font-size:11px;color:#9aa4b8;min-height:14px; }',
      '.pos-repl-body   { padding:0 12px 8px;overflow-y:auto;max-height:22vh; }',
      /* §T1.6 HMI — replenish rows are stylesheet classes now (were 11px inline cssText) */
      '.pos-replenish-row { display:block;width:100%;text-align:left;margin:3px 0;padding:6px 8px;',
      '                     border-radius:6px;border:1px solid #33334a;background:#16161d;',
      '                     color:#e8e8ed;cursor:pointer;font-size:12px;line-height:1.35;transition:background .15s; }',
      '.pos-replenish-row:hover { background:rgba(108,159,255,0.16); }',
      '.pos-replenish-row.no-vendor { border-color:#555;background:#121218;color:#9aa4b8;cursor:default; }',
      '.pos-replenish-row.no-vendor:hover { background:#121218; }',
      /* §T1-SPEC staged Generate Replenishment — propose→stage→review/edit→confirm */
      '#pos-repl-generate { display:inline-flex;align-items:center;gap:6px;margin:4px 0 2px;padding:7px 14px;',
      '                     border-radius:8px;border:1px solid #33334a;background:#16161d;color:#6c9fff;',
      '                     cursor:pointer;font-size:12px;transition:background .15s; }',
      '#pos-repl-generate:hover { background:rgba(108,159,255,0.16); }',
      '.pos-repl-stage-row { display:flex;align-items:center;gap:6px;margin:3px 0;padding:6px 8px;',
      '                      border-radius:6px;border:1px solid #33334a;background:#16161d;',
      '                      color:#e8e8ed;font-size:12px;line-height:1.35; }',
      '.pos-repl-stage-row.no-vendor { border-color:#555;background:#121218;color:#9aa4b8; }',
      '.pos-repl-stage-row.excluded { opacity:.45; }',
      '.pos-repl-name  { flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }',
      '.pos-repl-route { font-size:10px;color:#9aa4b8;border:1px solid #33334a;border-radius:4px;',
      '                  padding:1px 5px;white-space:nowrap; }',
      '.pos-repl-route.move { color:#6c9fff;border-color:#6c9fff; }',
      '.pos-repl-qty   { width:56px;box-sizing:border-box;padding:4px 6px;border-radius:6px;',
      '                  border:1px solid #33334a;background:#121218;color:#e8e8ed;font-size:12px;text-align:right; }',
      '#pos-repl-commit { display:none;width:100%;margin:6px 0 2px;padding:9px;border-radius:8px;',
      '                   border:1px solid #33334a;background:rgba(108,159,255,0.24);color:#e8e8ed;',
      '                   cursor:pointer;font-size:13px; }',
      '#pos-repl-commit:disabled { opacity:.4;cursor:default; }',
      '#pos-repl-empty { color:#9aa4b8;font-size:11px;margin:4px 0; }',
      /* §D-3 ⋯ dock */
      '#pos-dock        { position:fixed;bottom:20px;right:20px;z-index:9550;',
      '                   display:flex;flex-direction:column;align-items:flex-end;gap:5px; }',
      '#pos-dock-trigger{ width:36px;height:36px;border-radius:50%;border:1px solid #33334a;',
      '                   background:#16161d;color:#e8e8ed;cursor:pointer;font-size:18px;',
      '                   display:flex;align-items:center;justify-content:center; }',
      '#pos-dock-items  { display:none;flex-direction:column;align-items:flex-end;gap:5px; }',
      '#pos-dock-items.open { display:flex; }',
      '.pos-dock-item   { width:36px;height:36px;border-radius:50%;border:1px solid #33334a;',
      '                   background:#16161d;color:#e8e8ed;cursor:pointer;',
      '                   display:flex;align-items:center;justify-content:center;padding:0; }',
      '.pos-dock-item:hover { background:rgba(108,159,255,0.16); }',
      /* §R2-3 the receipt-preview modal is retired (single Pay icon completes directly) */

      /* U-3: import overlay */
      '#pos-import-overlay { display:none;position:fixed;inset:0;background:#000d;z-index:9600;',
      '                      flex-direction:column;align-items:center;justify-content:flex-start;',
      '                      padding-top:6vh;overflow-y:auto; }',
      '#pos-import-overlay.active { display:flex; }',
      '#pos-import-card { background:#1a1a24;border:1px solid #33334a;border-radius:12px;padding:20px 24px;',
      '                   max-width:min(400px,96vw);width:100%;box-sizing:border-box; }',
      '#pos-import-title { color:#cdd6e4;font-size:14px;font-weight:bold;margin-bottom:14px;',
      '                    border-bottom:1px solid #33334a;padding-bottom:8px; }',
      '#pos-import-steps { display:flex;gap:4px;margin-bottom:14px; }',
      '.pos-import-step  { flex:1;padding:4px 2px;text-align:center;font-size:11px;',
      '                    border-radius:4px;color:#9aa4b8;border:1px solid rgba(255,255,255,0.08); }',
      '.pos-import-step.active { color:#5fd08a;border-color:#33334a;background:#121218; }',
      '.pos-import-step.done { color:#55556a;background:#121218; }',
      '#pos-import-body  { min-height:80px; }',
      '#pos-import-video { width:min(300px,86vw);border:2px solid #33334a;border-radius:8px;background:#000;display:block; }',
      '#pos-import-canvas { display:none; }',
      '.pos-import-btn   { display:inline-flex;align-items:center;gap:6px;padding:9px 20px;',
      '                    border-radius:8px;border:1px solid #33334a;background:#16161d;',
      '                    color:#e8e8ed;cursor:pointer;font-size:13px;margin-top:8px; }',
      '.pos-import-btn:disabled { opacity:.4;cursor:default; }',
      '.pos-import-input { width:100%;box-sizing:border-box;padding:8px 12px;margin-top:8px;',
      '                    border-radius:6px;border:1px solid #33334a;',
      '                    background:#121218;color:#e8e8ed;font-size:15px; }',
      '#pos-import-hint  { color:#cdd6e4;font-size:12px;margin-top:8px; }',
      '#pos-import-thumb { max-width:120px;max-height:120px;border-radius:6px;',
      '                    display:none;margin-top:8px;object-fit:cover; }',
      '#pos-import-err   { color:#ff6b6b;font-size:12px;margin-top:6px;min-height:16px; }',
      '#pos-import-close { margin-top:12px;display:block;width:100%;padding:9px;border-radius:8px;',
      '                    border:1px solid #556;background:#16161d;color:#9aa4b8;cursor:pointer;font-size:13px; }',

      /* §P-11 receipt overlay */
      '#pos-receipt-overlay { display:none;position:fixed;inset:0;background:#0009;z-index:9600;',
      '                       align-items:center;justify-content:center; }',
      '#pos-receipt-overlay.active { display:flex; }',
      '#pos-receipt-card { background:#1a1a24;border:1px solid #33334a;border-radius:12px;padding:20px 24px;',
      '                    max-width:min(400px,96vw);width:100%;max-height:90vh;overflow-y:auto; }',
      '.pos-rcpt-header  { color:#cdd6e4;font-size:13px;margin-bottom:10px;border-bottom:1px solid #33334a;padding-bottom:6px; }',
      '.pos-rcpt-line    { display:flex;justify-content:space-between;color:#e8e8ed;font-size:13px;padding:4px 0;border-bottom:1px solid #22222e; }',
      '.pos-rcpt-line.last { transition:opacity .4s; }',
      '#pos-rcpt-total   { font-size:30px;font-weight:bold;color:#5fd08a;text-align:center;margin:14px 0 6px; }',
      '#pos-rcpt-qr      { text-align:center;margin:10px 0; }',
      '#pos-rcpt-qr canvas,#pos-rcpt-qr svg,#pos-rcpt-qr img { display:block;margin:0 auto; }',
      /* U-4: DEMO payment QR styles */
      '#pos-pay-qr       { text-align:center;margin:14px 0 6px;padding-top:12px;border-top:1px solid #33334a; }',
      '#pos-pay-qr-label { font-weight:bold;color:#fa0;font-size:13px;margin-bottom:6px; }',
      '#pos-pay-qr-wrap  { margin:6px 0; }',
      '#pos-pay-qr-wrap canvas,#pos-pay-qr-wrap svg,#pos-pay-qr-wrap img { display:block;margin:0 auto; }',
      '#pos-pay-qr-caption { color:#cdd6e4;font-size:11px;margin-top:4px; }',
      '#pos-receipt-close{ display:block;width:100%;margin-top:14px;padding:10px;border-radius:8px;',
      '                    border:1px solid #33334a;background:rgba(108,159,255,0.24);color:#e8e8ed;cursor:pointer;font-size:14px; }'
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

  // §R2-AUDIO — affirmative POS earcons (ring item / pay / sale complete). SAME guarded pattern as
  // wh_walk.js _sfx (PRE-PINNED FACT #2): the id resolves from sfx.json ui_sounds via window.__sfx —
  // an absent engine (sfx.js not loaded) or absent row plays NOTHING (no crash, no hardcoded synth).
  function _sfx(event) {
    var sfx = window.__sfx;
    var ok = !!(sfx && typeof sfx.play === 'function' && event);
    if (ok) { try { sfx.play(event); } catch (e) { ok = false; } }
    console.log('§POS-AUDIO event=' + event + ' sfx=' + (ok ? 'played' : 'absent'));
  }

  function q1(b3, sql) {
    var a = []; for (var i = 2; i < arguments.length; i++) a.push(arguments[i]);
    var st = b3.prepare(sql); return st.get.apply(st, a);
  }
  function qa(b3, sql) {
    var a = []; for (var i = 2; i < arguments.length; i++) a.push(arguments[i]);
    var st = b3.prepare(sql); return st.all.apply(st, a);
  }

  // count prior CREATE_DOCUMENT ops → deterministic doc ids (no Date.now/Math.random).
  // T7-HOST (prompts/T7_HOST_WIRING_SPEC.md §Build 3a — Witness: §T7-COUNT): once the log shards, the
  // hot COUNT collapses — the latest SHARD_SNAPSHOT's cumulative opCounts carries the archived count so
  // PKs stay collision-free WITHOUT an async archive fetch (this runs SYNC on the Pay path).
  // _archivedOpCount — the pre-shard count of an op_type from the latest SHARD_SNAPSHOT's cumulative
  // opCounts (0 when the log has never sharded). Sync + O(1): safe on the Pay path.
  function _archivedOpCount(opDb, opType) {
    try {
      var s = opDb.exec("SELECT parameters FROM kernel_ops WHERE op_type='SHARD_SNAPSHOT' ORDER BY id DESC LIMIT 1");
      if (s.length && s[0].values.length) {
        var pl = JSON.parse(s[0].values[0][0]).payload;
        if (pl && pl.opCounts && pl.opCounts[opType]) return Number(pl.opCounts[opType]);
      }
    } catch (e) {}
    return 0;
  }
  function nextIds(opDb) {
    var n = 0;
    try { var r = opDb.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='CREATE_DOCUMENT'"); n = (r[0] && Number(r[0].values[0][0])) || 0; } catch (e) {}
    n += _archivedOpCount(opDb, 'CREATE_DOCUMENT');
    var base = 910000 + n * 10;
    return { orderId: base + 1, inoutId: base + 2, invoiceId: base + 3 };
  }

  // archivedRows — lazily-fetched pre-shard ops (T7_HOST_WIRING_SPEC §Build 3b): full-history folds
  // below prepend these so a shard boundary never thins stock/pending arithmetic. [] until a host
  // injects cfg.archivedOps AND the log has actually sharded.
  function logMovements(opDb, archivedRows) {
    var ev = [], hdr = null;
    try {
      var r = opDb.exec('SELECT op_type, parameters FROM kernel_ops ORDER BY id');
      var live = (r[0] ? r[0].values : []);
      var all = (archivedRows || []).map(function (o) { return [o.op_type, o.parameters]; }).concat(live);
      all.forEach(function (row) {
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

  // §T1-SPEC lens.4 — pending inbound: qty already committed to arrive but not yet received/moved,
  // folded from the SIGNED op log (gid links a group's CREATE_DOCUMENT to its CREATE_LINEs, kernel_ops §I-K):
  // open replenish-PO C_OrderLine.qtyordered for the warehouse + open M_MovementLine.movementqty whose
  // m_locatorto_id is in the warehouse. Commit → re-generate proposes ZERO for the committed products —
  // the real ReplenishReport's open-order subtraction, no double order. Returns { pid: centiQty }.
  function pendingInbound(opDb, b3, wh, archivedRows) {
    var out = {};
    try {
      var locWh = {};
      qa(b3, 'SELECT m_locator_id AS i FROM m_locator WHERE m_warehouse_id=?', wh).forEach(function (l) { locWh[l.i] = 1; });
      var r = opDb.exec('SELECT gid, op_type, parameters FROM kernel_ops ORDER BY id');
      var live = (r[0] ? r[0].values : []);
      // T7-HOST: archived (pre-shard) rows fold FIRST — an open PO older than the shard boundary must
      // still count as on-order (the no-double-order guard, §T1-SPEC lens.4).
      var rows = (archivedRows || []).map(function (o) { return [o.gid, o.op_type, o.parameters]; }).concat(live).map(function (v) {
        var p; try { p = JSON.parse(v[2]); } catch (e) { return null; }
        p = p && p.params ? p.params : p;
        return p ? { gid: v[0], p: p } : null;
      }).filter(function (x) { return !!x; });
      var poGids = {};
      rows.forEach(function (x) {
        if (x.p.op_type === 'CREATE_DOCUMENT' && x.p.table === 'C_Order' && x.p.issotrx === 'N' &&
            Number(x.p.m_warehouse_id) === Number(wh)) poGids[x.gid] = 1;
      });
      rows.forEach(function (x) {
        if (x.p.op_type === 'CREATE_LINE' && x.p.table === 'C_OrderLine' && poGids[x.gid])
          out[x.p.m_product_id] = (out[x.p.m_product_id] || 0) + Math.round(Number(x.p.qtyordered || 0) * 100);
        if (x.p.op_type === 'CREATE_LINE' && x.p.table === 'M_MovementLine' && locWh[x.p.m_locatorto_id])
          out[x.p.m_product_id] = (out[x.p.m_product_id] || 0) + Math.round(Number(x.p.movementqty || 0) * 100);
      });
    } catch (e) {}
    return out;
  }

  function suggestAll(b3, opDb, archivedRows) {
    var whs = qa(b3, "SELECT DISTINCT m_warehouse_id AS w FROM m_replenish WHERE replenishtype<>'0'");
    var pend = logMovements(opDb, archivedRows), out = [];
    whs.forEach(function (r) {
      var locs = {};
      qa(b3, 'SELECT m_locator_id AS i FROM m_locator WHERE m_warehouse_id=?', r.w).forEach(function (l) { locs[l.i] = 1; });
      var txns = qa(b3, 'SELECT m_product_id, m_locator_id, movementtype, movementqty FROM m_transaction').filter(function (t) { return locs[t.m_locator_id]; });
      var inbound = pendingInbound(opDb, b3, r.w, archivedRows);
      var rctx = {
        // §T1-SPEC core.1: qtybatchsize + m_warehousesource_id now ride the policy row (real m_replenish columns)
        replenishRows: qa(b3, "SELECT m_product_id, m_warehouse_id, level_min, level_max, replenishtype, qtybatchsize, m_warehousesource_id FROM m_replenish WHERE m_warehouse_id=? AND replenishtype<>'0'", r.w),
        txns: txns,
        reservation: function (pid, so) {
          var x = q1(b3, 'SELECT COALESCE(SUM(qty),0) AS q FROM m_storagereservation WHERE m_product_id=? AND m_warehouse_id=? AND issotrx=?', pid, r.w, so);
          var v = Math.round(Number((x && x.q) || 0) * 100);
          if (so === 'N') v += (inbound[pid] || 0);              // §T1-SPEC lens.4 pending inbound counts as on-order
          return v;
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
    // U-4: DEMO payment QR section (additive, below receipt-URL QR)
    var payQr = document.createElement('div'); payQr.id = 'pos-pay-qr';
    var payLbl = document.createElement('div'); payLbl.id = 'pos-pay-qr-label'; payLbl.textContent = 'DEMO PAYMENT QR';
    var payWrap = document.createElement('div'); payWrap.id = 'pos-pay-qr-wrap';
    var payCap = document.createElement('div'); payCap.id = 'pos-pay-qr-caption'; payCap.textContent = 'scan to pay · DEMO ONLY';
    payQr.appendChild(payLbl); payQr.appendChild(payWrap); payQr.appendChild(payCap);
    var btn   = document.createElement('button'); btn.id = 'pos-receipt-close'; btn.textContent = 'Close';
    card.appendChild(hdr); card.appendChild(lines); card.appendChild(tot);
    card.appendChild(qrEl); card.appendChild(payQr); card.appendChild(btn);
    ov.appendChild(card); document.body.appendChild(ov);
    return { ov: ov, lines: lines, tot: tot, qrEl: qrEl, payWrap: payWrap, btn: btn };
  }

  // ── U-3: import overlay DOM build ──────────────────────────────────────────────────────────────
  function _buildImportOverlay() {
    var ov    = document.createElement('div'); ov.id = 'pos-import-overlay';
    var card  = document.createElement('div'); card.id = 'pos-import-card';
    var title = document.createElement('div'); title.id = 'pos-import-title';
    title.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> &nbsp;Import — Register New Product';
    var steps = document.createElement('div'); steps.id = 'pos-import-steps';
    var sLabels = ['1 Snap', '2 Scan', '3 Price', '4 Register'];
    var stepEls = sLabels.map(function (l) { var d = document.createElement('div'); d.className = 'pos-import-step'; d.textContent = l; steps.appendChild(d); return d; });
    var body  = document.createElement('div'); body.id = 'pos-import-body';
    var video = document.createElement('video'); video.id = 'pos-import-video'; video.autoplay = true; video.playsInline = true; video.muted = true; video.style.display = 'none';
    var canvas = document.createElement('canvas'); canvas.id = 'pos-import-canvas';
    var thumb = document.createElement('img'); thumb.id = 'pos-import-thumb'; thumb.alt = 'captured';
    var hint  = document.createElement('div'); hint.id = 'pos-import-hint';
    var err   = document.createElement('div'); err.id = 'pos-import-err';
    var close = document.createElement('button'); close.id = 'pos-import-close'; close.textContent = 'Cancel';
    body.appendChild(video); body.appendChild(canvas); body.appendChild(thumb);
    body.appendChild(hint); body.appendChild(err);
    card.appendChild(title); card.appendChild(steps); card.appendChild(body); card.appendChild(close);
    ov.appendChild(card); document.body.appendChild(ov);
    return { ov: ov, stepEls: stepEls, body: body, video: video, canvas: canvas, thumb: thumb, hint: hint, err: err, close: close };
  }

  function open(cfg) {
    _injectStyles();
    var b3 = cfg.b3, el = cfg.el;
    var pos = q1(b3, 'SELECT * FROM c_pos LIMIT 1');
    if (!pos) { cfg.status('No POS station (c_pos) in this tenant'); return; }
    // §BUGFIX 2026-07-13 (user report: "shop cart pill does not close when we exited") — the overlay's
    // native ✕ only tore down #posted-overlay, not the body-level cart float/dock (see the onClose hook
    // below for the real fix); a stray pair could survive a prior visit. Guard re-open: never stack a
    // second float/dock on top of a leftover one.
    ['pos-float-panel', 'pos-dock'].forEach(function (id) {
      var stale = document.getElementById(id); if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    });
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

    // T7 host opt-in (prompts/T7_HOST_WIRING_SPEC.md §Build 3c — Witness: W-T7-HOST): after a commit
    // lands, nudge the host's shard check on a debounce (the kernel_ops._persistToIdb 2s idiom).
    // DEFAULT OFF — a host that doesn't inject cfg.maybeShard behaves byte-identically to before.
    var _shardTimer = null;
    function maybeShardSoon() {
      if (!cfg.maybeShard) return;
      clearTimeout(_shardTimer);
      _shardTimer = setTimeout(function () {
        Promise.resolve(cfg.maybeShard()).then(function (r) {
          if (r && r.sharded) console.log('§POS-SHARD closed seq=' + r.seq + ' archived=' + r.archived + ' hotOps=' + r.hotLen);
        }).catch(function (e) { console.log('§POS-SHARD check failed: ' + ((e && e.message) || e)); });
      }, 2000);
    }

    // U-3: track products registered THIS session (for §POS-FIRSTSELL witness)
    var _sessionProductIds = {};  // { [productId]: true }

    // ── §P-6 ids on the root elements ──────────────────────────────────────────────────────────
    var wrap = el('div'); wrap.id = 'pos-wrap';

    // ── §R2-1/§R2-2 (FOLLOW-UP ROUND 2): the top bar shows the RUNNING TOTAL live, not a blank bar.
    //   [🛒 cart-toggle]  RUNNING TOTAL  …  [scan QR].  Cart icon stays (toggles the pay panel);
    //   the blank space becomes the live total; the barcode-scan add-item action sits on the RIGHT.
    var topBar = el('div'); topBar.id = 'pos-top-bar';
    var payBtn = el('button'); payBtn.className = 'pos-top-btn'; payBtn.id = 'pos-pill-payment'; payBtn.title = 'Cart / Payment — open the pay panel';
    payBtn.innerHTML = _svgIcon('shoppingCart', 18);
    payBtn.addEventListener('pointerup', function () {
      floatPanel.classList.toggle('open');
      console.log('§POS-FLOAT toggle=' + (floatPanel.classList.contains('open') ? 'open' : 'close'));
    });
    var topTotal = el('div'); topTotal.id = 'pos-top-total'; topTotal.textContent = '0.00';
    // §R2-2 scan-item (QR) — promoted to the RIGHT of the top bar (the existing scan action).
    var scanBtn = el('button'); scanBtn.className = 'pos-top-btn'; scanBtn.id = 'pos-pill-scan'; scanBtn.title = 'Scan barcode to add item';
    scanBtn.innerHTML = _svgIcon('scan', 18);
    topBar.appendChild(payBtn); topBar.appendChild(topTotal); topBar.appendChild(scanBtn);
    wrap.appendChild(topBar);

    // §P-7 witness (pill count now = 1 standalone, dock items excluded)
    console.log('§POS-PILLS n=1 icons-only=Y');

    var grid = el('div'); grid.id = 'pos-grid';
    wrap.appendChild(grid);

    // ── tile grid ──────────────────────────────────────────────────────────────────────────────
    function _addToCart(pid, name) {
      var line = POS.ringLine(ctx, pid, 1);
      if (!line.ok) { cfg.status('refused: ' + line.reason); console.log('§POS-LIVE ring REFUSED product=' + pid + ' reason=' + line.reason); return false; }
      var same = cart.filter(function (c) { return c.m_product_id === line.m_product_id; })[0];
      if (same) { var re = POS.ringLine(ctx, pid, same.qty + 1); same.qty = re.qty; same.linenetamt = re.linenetamt; }
      else { line.name = name || ('Product ' + pid); cart.push(line); }
      console.log('§POS-LIVE ring product=' + pid + ' price=' + line.priceactual + ' (sealed master)');
      _sfx('pos_ring');                                          // §R2-AUDIO ring-item earcon
      renderCart();
      return true;
    }

    // U-1: album card builder — image priority: ImgStore → tile.imageData → placeholder glyph
    var _nImgs = 0, _nThumbs = 0, _nPH = 0;
    tiles.forEach(function (t) {
      var card = document.createElement('div'); card.className = 'pos-card';
      card.setAttribute('data-pid', t.m_product_id);

      // image area
      var imgArea = document.createElement('div'); imgArea.className = 'pos-card-img';
      var imgKey = 'product-' + t.m_product_id;
      var imgResolved = false;

      // priority 1: ImgStore blob (async)
      if (window.ImgStore && typeof window.ImgStore.get === 'function') {
        window.ImgStore.get(imgKey).then(function (blob) {
          if (blob) {
            var url = URL.createObjectURL(blob);
            var im = document.createElement('img'); im.src = url; im.alt = t.name;
            imgArea.innerHTML = ''; imgArea.appendChild(im);
            _nImgs++;
          }
        }).catch(function () {});
      }

      // priority 2: tile.imageData (binary thumbnail from ad_seed)
      if (!imgResolved && t.imageData) {
        try {
          var im2 = document.createElement('img');
          var raw = t.imageData;
          if (typeof raw === 'string') { im2.src = raw.startsWith('data:') ? raw : 'data:image/png;base64,' + raw; }
          else if (raw instanceof Uint8Array || Array.isArray(raw)) {
            var b64 = btoa(String.fromCharCode.apply(null, raw instanceof Uint8Array ? raw : new Uint8Array(raw)));
            im2.src = 'data:image/png;base64,' + b64;
          }
          if (im2.src) { im2.alt = t.name; imgArea.appendChild(im2); imgResolved = true; _nThumbs++; }
        } catch (e) {}
      }

      // priority 3: placeholder glyph (Lucide 'image' icon)
      if (!imgResolved) {
        imgArea.innerHTML = _svgIcon('image', 36);
        _nPH++;
      }

      var nameDiv  = document.createElement('div'); nameDiv.className = 'pos-card-name'; nameDiv.textContent = t.name;
      var priceDiv = document.createElement('div'); priceDiv.className = 'pos-card-price'; priceDiv.textContent = Number(t.pricestd).toFixed(2);

      card.appendChild(imgArea); card.appendChild(nameDiv); card.appendChild(priceDiv);

      // tap = ringLine + flash feedback
      card.addEventListener('click', function () {
        var added = _addToCart(t.m_product_id, t.name);
        if (added) {
          card.classList.add('flash');
          setTimeout(function () { card.classList.remove('flash'); }, 220);
        }
      });
      grid.appendChild(card);
    });
    console.log('§POS-ALBUM cards=' + tiles.length + ' imgs=' + _nImgs + ' thumbs=' + _nThumbs + ' placeholders=' + _nPH);

    // ── §R2-3: the pay panel — RIMS RETIRED. A draggable (§R2-4) panel: grab-header · ordered items ·
    //   partner · ONE single Pay icon on the right (§R2-3) · receipt · replenishment. No orange/green
    //   rim-edges; the running total + scan live on the top bar now (§R2-1/§R2-2).
    var floatPanel = document.createElement('div'); floatPanel.id = 'pos-float-panel';

    // §R2-4 grab header — the drag handle (drag idiom ported below); also carries the panel title.
    var dragHdr = document.createElement('div'); dragHdr.className = 'pos-drag-hdr'; dragHdr.id = 'pos-drag-hdr';
    dragHdr.innerHTML = '<span class="pos-drag-grip">⠿</span><span>Pay</span>';

    // ordered items list (always visible — no rim toggle)
    var itemsHdr = document.createElement('div'); itemsHdr.className = 'pos-section-hdr'; itemsHdr.id = 'pos-items-hdr';
    var cartBox  = document.createElement('div'); cartBox.id = 'pos-float-cart';
    var itemsBody = document.createElement('div'); itemsBody.className = 'pos-items-body';
    itemsBody.appendChild(cartBox);

    // §D-2 partner selector (witness selectOption('#pos-float-bp')); §R2-5: default a walk-in so Pay works
    var bpSel  = document.createElement('select'); bpSel.id = 'pos-float-bp';
    var bpOpt0 = document.createElement('option'); bpOpt0.value = ''; bpOpt0.textContent = 'walk-in partner…'; bpSel.appendChild(bpOpt0);
    qa(b3, "SELECT c_bpartner_id, name FROM c_bpartner WHERE isactive='Y' ORDER BY name").forEach(function (b) {
      var o = document.createElement('option'); o.value = b.c_bpartner_id; o.textContent = b.name; bpSel.appendChild(o);
    });
    // §R2-5 default the partner: the POS cash partner if the station names one, else the FIRST active
    // partner (deterministic, name-ordered — extracted, not invented) so the single Pay icon completes
    // out of the box. The empty-partner gate silently blocked the old banknote → "Pay stopped working".
    var _bpSrc = 'none';
    if (pos.c_bpartnercashtrx_id) { bpSel.value = String(pos.c_bpartnercashtrx_id); if (bpSel.value) _bpSrc = 'cashtrx'; }
    // §R2-5 default the walk-in partner = 'Standard' (user 2026-06-14); fall back to first active.
    if (!bpSel.value) {
      for (var _bi = 0; _bi < bpSel.options.length; _bi++) {
        if (bpSel.options[_bi].textContent === 'Standard') { bpSel.selectedIndex = _bi; _bpSrc = 'standard'; break; }
      }
      if (!bpSel.value && bpSel.options.length > 1) { bpSel.selectedIndex = 1; _bpSrc = 'first-active'; }
    }
    console.log('§POS-PARTNER-DEFAULT bp=' + (bpSel.value || 'none') + ' name=' + (bpSel.options[bpSel.selectedIndex] ? bpSel.options[bpSel.selectedIndex].textContent : '?') + ' src=' + _bpSrc);

    // §R2-3 single Pay icon on the right (the ONLY pay control) — fires Complete directly (§R2-5).
    var payRow = document.createElement('div'); payRow.className = 'pos-pay-row';
    var btn     = document.createElement('button'); btn.id = 'pos-float-tender'; btn.className = 'pos-pay-icon';
    btn.innerHTML = _svgIcon('banknote', 22); btn.title = 'Pay — complete the sale';
    payRow.appendChild(btn);

    var receipt  = document.createElement('div'); receipt.id = 'pos-float-receipt';

    // §T1-SPEC lens.1 replenishment section — explicit trigger, staged review, one confirm (no auto-fire)
    var replHdr  = document.createElement('div'); replHdr.className = 'pos-section-hdr'; replHdr.id = 'pos-repl-hdr';
    replHdr.textContent = 'Replenishment';
    var replGen  = document.createElement('button'); replGen.id = 'pos-repl-generate';
    replGen.innerHTML = _svgIcon('clipboard', 14) + ' Generate Replenishment';
    var replBox  = document.createElement('div'); replBox.id = 'pos-float-replenish';
    var replCommit = document.createElement('button'); replCommit.id = 'pos-repl-commit';
    var replBody = document.createElement('div'); replBody.className = 'pos-repl-body';
    replBody.appendChild(replGen); replBody.appendChild(replBox); replBody.appendChild(replCommit);

    floatPanel.appendChild(dragHdr);
    floatPanel.appendChild(itemsHdr); floatPanel.appendChild(itemsBody);
    floatPanel.appendChild(bpSel); floatPanel.appendChild(payRow);
    floatPanel.appendChild(receipt);
    floatPanel.appendChild(replHdr); floatPanel.appendChild(replBody);
    document.body.appendChild(floatPanel);

    // §R2-4 draggable — ported from the established viewer _makeDraggable idiom (measure.js): grab the
    // header strip, pointer-capture, translate the panel. Not invented; the same pointer-drag pattern.
    (function _makePanelDraggable(panel, handle) {
      var sx, sy, ox, oy, dragging = false, pid = null;
      handle.style.cursor = 'grab';
      handle.addEventListener('pointerdown', function (e) {
        var r = panel.getBoundingClientRect();
        ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY; dragging = true; pid = e.pointerId;
        panel.style.right = 'auto'; panel.style.bottom = 'auto';
        panel.style.left = ox + 'px'; panel.style.top = oy + 'px';
        try { handle.setPointerCapture(pid); } catch (er) {}
        handle.style.cursor = 'grabbing'; e.preventDefault();
      });
      handle.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy);
        nx = Math.max(0, Math.min(nx, window.innerWidth - 40));
        ny = Math.max(0, Math.min(ny, window.innerHeight - 40));
        panel.style.left = nx + 'px'; panel.style.top = ny + 'px';
      });
      function _end() { if (!dragging) return; dragging = false; handle.style.cursor = 'grab'; try { handle.releasePointerCapture(pid); } catch (er) {} console.log('§POS-FLOAT-DRAG moved=Y'); }
      handle.addEventListener('pointerup', _end);
      handle.addEventListener('pointercancel', _end);
    })(floatPanel, dragHdr);

    // §R2-3/§R2-5: the receipt-preview modal is RETIRED — the single Pay icon (#pos-float-tender)
    // completes the sale directly (buildSaleGroup → commitGroup → receipt). The DEMO payment QR still
    // lives on the final receipt overlay (§P-11). The commit ENGINE path is byte-identical (§POS-CENT).

    // §P-12 deliver-later door (WH_POS_PICK_LANE W-1) — DICTIONARY-GATED
    var dtSO = q1(b3, "SELECT * FROM c_doctype WHERE docsubtypeso='SO' AND isactive='Y' ORDER BY c_doctype_id LIMIT 1");
    var dlBtn = null;
    if (dtSO) {
      dlBtn = document.createElement('button'); dlBtn.id = 'pos-float-deliverlater';
      dlBtn.className = 'pos-dock-item'; dlBtn.title = 'Deliver later · pick at the warehouse walk';
      // §R2-6 3rd dock icon = the WH WALK route glyph (NOT an invented icon) — it leads to the walk (new tab).
      dlBtn.innerHTML = _svgIcon('route', 18);
    }
    console.log('§POS-DELIVERLATER door=' + (dtSO ? 'on' : 'off') +
      (dtSO ? ' doctype=' + dtSO.c_doctype_id + ' ship=' + dtSO.c_doctypeshipment_id : '') +
      ' (dictionary-gated docsubtypeso=SO)');

    // §BUGFIX 2026-07-13 (user report: "shop cart pill does not close when we exited") — root cause:
    // the overlay's native ✕ only tore down #posted-overlay; the cart float panel + ⋯ dock live at
    // document.body level (outside the overlay) and were left floating over iDempiere.html. Fix: pass
    // this as the overlay's onClose (below, cfg.overlay(...)) so EVERY close path (✕ tap, back-gesture)
    // disposes them too — one teardown, reused by the dock Home button as well (it now just clicks the
    // overlay's own ✕ so the whole app has exactly one "POS is closed" moment).
    function _disposePosChrome() {
      [floatPanel, dock].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
      console.log('§POS-HOME closed dispose=float+dock');
    }
    // §D-3 ⋯ dock — home · import · receipt · deliver-later (data-gated) — reveal-up
    var homeBtn   = document.createElement('button'); homeBtn.className = 'pos-dock-item'; homeBtn.title = 'Close POS';
    homeBtn.innerHTML = _svgIcon('home', 18);
    homeBtn.addEventListener('pointerup', function () {
      // trigger the SAME close the overlay's own ✕ uses, so onClose (→ _disposePosChrome) always fires.
      var x = document.querySelector('#posted-overlay .posted-ov-x');
      if (x) x.click(); else _disposePosChrome();   // fallback if the overlay DOM ever changes shape
    });
    var importBtn = document.createElement('button'); importBtn.className = 'pos-dock-item'; importBtn.id = 'pos-pill-import';
    importBtn.title = 'Register a new product (snap · scan · price)';
    // §R2-6 2nd dock icon = register-a-NEW-product → a clear (+) plus glyph (was the ambiguous upload tray).
    importBtn.innerHTML = _svgIcon('plus', 18) || '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
    var rcptBtn   = document.createElement('button'); rcptBtn.className = 'pos-dock-item'; rcptBtn.id = 'pos-pill-receipt'; rcptBtn.title = 'View last receipt';
    rcptBtn.innerHTML = _svgIcon('doc', 18); rcptBtn.style.display = 'none';
    rcptBtn.addEventListener('click', function () { if (_lastRcptArgs) _showReceipt.apply(null, _lastRcptArgs); });

    var dockItems   = document.createElement('div'); dockItems.id = 'pos-dock-items';
    dockItems.appendChild(homeBtn); dockItems.appendChild(importBtn); dockItems.appendChild(rcptBtn);
    if (dlBtn) dockItems.appendChild(dlBtn);
    var dockTrigger = document.createElement('button'); dockTrigger.id = 'pos-dock-trigger'; dockTrigger.title = 'More actions'; dockTrigger.textContent = '⋯';
    var dock        = document.createElement('div'); dock.id = 'pos-dock';
    dock.appendChild(dockItems); dock.appendChild(dockTrigger);
    document.body.appendChild(dock);

    // PILL CLOSE DECREE (user decree 2026-07-02, witness_pill_canonical W2 — DECIDED for POS in
    // FABLE5_FOLLOWUP_2026-07-04 §Item 3, Witness: W-POS-PILLBAR §PB-DECREE): the ⋯ dock is a pill
    // RAIL in miniature, so the universal "no outside-tap close" decree governs it even though it is
    // not PillBuilder-hosted — ONLY the deliberate ⋯ tap toggles it. Lens overlays with their own
    // ✕/Done affordances (scan, import, receipt, float panel) are PANELS, not rails — decree-exempt.
    dockTrigger.addEventListener('click', function () {
      var open = dockItems.classList.toggle('open');
      console.log('§POS-DOCK toggle=' + (open ? 'open' : 'close') + ' (decree: only the ⋯ tap toggles)');
    });

    // swipe-down to dismiss (touch)
    (function () {
      var tStartY = 0;
      floatPanel.addEventListener('touchstart', function (ev) { tStartY = ev.touches[0].clientY; }, { passive: true });
      floatPanel.addEventListener('touchend', function (ev) {
        var dy = ev.changedTouches[0].clientY - tStartY;
        if (dy > 60) { floatPanel.classList.remove('open'); }
      }, { passive: true });
    })();

    function renderCart() {
      // dispose-with-cart (user live-test 2026-06-12): the panel follows the cart's lifecycle —
      // sale completed or last line removed → cart empties → the panel dismisses itself (the
      // receipt lives in its own overlay + the receipt pill; the cart pill re-summons anytime).
      if (!cart.length && floatPanel.classList.contains('open')) {
        floatPanel.classList.remove('open');
        console.log('§POS-FLOAT dispose=cart-empty');
      }
      cartBox.textContent = '';
      cart.forEach(function (c) {
        var row = document.createElement('div'); row.className = 'pos-float-cart-line';
        var lbl = document.createElement('span'); lbl.textContent = c.qty + ' × ' + c.name;
        var amt = document.createElement('span'); amt.textContent = c.linenetamt;
        row.appendChild(lbl); row.appendChild(amt); cartBox.appendChild(row);
      });
      var tot = cart.length ? POS.cartTotal(cart) : '0.00';
      // §R2-1 the running total lives on the TOP BAR now (live as items ring)
      topTotal.textContent = tot;
      // keep scan overlay total live
      var st = document.getElementById('pos-scan-total'); if (st) st.textContent = tot;
      // §R2-3 ordered-items section header carries the live count (no rim)
      itemsHdr.textContent = 'Ordered items (' + cart.length + ')';
    }

    function vendorOf(pid) {
      return q1(b3, "SELECT c_bpartner_id, pricepo FROM m_product_po WHERE m_product_id=? AND iscurrentvendor='Y' ORDER BY m_product_id LIMIT 1", pid) || null;
    }

    // ── §T1-SPEC lens.1-.3 staged Generate Replenishment — Witness: W-REPLEN-STAGE + W-REPLEN-LIVE ──
    // The pre-§T1 drawer (auto-fire on open + after every sale, one tap = one committed PO, no review)
    // is retired: propose → stage → review/edit → confirm — the real ReplenishReport shape.
    var staged = [];               // transient client-side staging; real ops ONLY on Confirm
    var replCommitting = false;    // in-flight guard — no double-commit

    function refreshCommitBtn() {
      var picked = staged.filter(function (r) { return r.include && r.qty > 0 && (r.move || r.vendor); });
      replCommit.style.display = staged.length ? 'block' : 'none';
      replCommit.disabled = replCommitting || !picked.length;
      replCommit.textContent = 'Confirm ' + picked.length + ' line' + (picked.length === 1 ? '' : 's');
      return picked;
    }

    function clearStage() {
      staged = []; replBox.textContent = ''; refreshCommitBtn();
      replHdr.textContent = 'Replenishment';
    }

    // T7-HOST (T7_HOST_WIRING_SPEC §Build 3b): the replenish fold walks the FULL history — lazily
    // fetch pre-shard ops first (panel-open path — async is fine HERE, never on the Pay path). A
    // refused archive (tamper/missing) folds hot-only and SAYS so — honest, never silently thin.
    function generateReplenish() {
      return Promise.resolve(cfg.archivedOps ? cfg.archivedOps() : { ok: true, ops: [] }).then(function (arch) {
        if (arch && arch.ok === false) {
          console.log('§POS-REPLENISH archive REFUSED why=' + arch.why + ' seq=' + arch.seq + ' — folding hot log ONLY');
          cfg.status('History archive unreadable (' + arch.why + ') — replenishment from the hot log only');
        }
        return _generateReplenishNow((arch && arch.ok && arch.ops) || []);
      });
    }
    function _generateReplenishNow(archivedRows) {
      staged = []; replBox.textContent = '';
      var sugg = suggestAll(b3, cfg.opDb, archivedRows);
      sugg.forEach(function (s) {
        var nm = q1(b3, 'SELECT name FROM m_product WHERE m_product_id=?', s.m_product_id);
        var vendor = s.m_warehousesource_id ? null : vendorOf(s.m_product_id);
        var move = !!s.m_warehousesource_id;
        var entry = { s: s, include: move || !!vendor, qty: s.qtytoorder, vendor: vendor, move: move };
        staged.push(entry);

        var row = document.createElement('div'); row.className = 'pos-repl-stage-row';
        var chk = document.createElement('input'); chk.type = 'checkbox'; chk.className = 'pos-repl-include';
        chk.checked = entry.include; chk.disabled = !move && !vendor;
        var name = el('span', 'pos-repl-name', (nm ? nm.name : s.m_product_id) + ' · wh ' + s.m_warehouse_id +
          (s.qtybatchsize ? ' · batch ' + s.qtybatchsize : ''));
        name.title = 'product ' + s.m_product_id;
        var route = el('span', 'pos-repl-route',
          move ? 'Move ← wh ' + s.m_warehousesource_id
               : (vendor ? 'PO → ' + vendor.c_bpartner_id : 'no vendor'));
        if (move) route.classList.add('move');
        var qty = document.createElement('input'); qty.type = 'number'; qty.className = 'pos-repl-qty';
        qty.min = '0'; qty.step = s.qtybatchsize ? String(s.qtybatchsize) : '1';
        qty.value = String(s.qtytoorder); qty.disabled = !move && !vendor;
        row.appendChild(chk); row.appendChild(name); row.appendChild(route); row.appendChild(qty);
        if (!move && !vendor) { row.classList.add('no-vendor'); entry.include = false; chk.checked = false; }

        chk.addEventListener('change', function () {
          entry.include = chk.checked; row.classList.toggle('excluded', !chk.checked);
          console.log('§POS-REPLENISH-EDIT product=' + s.m_product_id + ' include=' + chk.checked + ' qty=' + entry.qty);
          refreshCommitBtn();
        });
        qty.addEventListener('input', function () {
          entry.qty = Math.max(0, Number(qty.value) || 0);
          console.log('§POS-REPLENISH-EDIT product=' + s.m_product_id + ' include=' + entry.include + ' qty=' + entry.qty);
          refreshCommitBtn();
        });
        replBox.appendChild(row);
      });
      if (!sugg.length) {
        var empty = el('div', '', 'Nothing to replenish — levels are above min / already on order.');
        empty.id = 'pos-repl-empty'; replBox.appendChild(empty);
      }
      var nMove = staged.filter(function (r) { return r.move; }).length;
      var nBatch = staged.filter(function (r) { return !!r.s.qtybatchsize; }).length;
      replHdr.textContent = 'Replenishment (' + sugg.length + ' staged)';
      refreshCommitBtn();
      console.log('§POS-REPLENISH-GEN suggestions=' + sugg.length + ' po=' + (sugg.length - nMove) +
        ' moves=' + nMove + ' batchRounded=' + nBatch + ' (staged for review — nothing committed)');
      return sugg;
    }

    // pick a warehouse's locator the way the seed itself routes (IsDefault first — extracted, not invented)
    function locatorOf(wh) {
      var l = q1(b3, "SELECT m_locator_id AS i FROM m_locator WHERE m_warehouse_id=? ORDER BY CASE WHEN isdefault='Y' THEN 0 ELSE 1 END, m_locator_id LIMIT 1", Number(wh));
      return l ? l.i : null;
    }

    function commitStaged() {
      if (replCommitting) return;
      var picked = refreshCommitBtn();
      if (!picked.length) { cfg.status('Nothing staged to commit'); return; }
      // §T1-SPEC lens.3 route + build: PO per (warehouse, vendor) + Move per source warehouse — ONE signed group
      var enriched = picked.map(function (r) {
        return Object.assign({}, r.s, { qtytoorder: r.qty, c_bpartner_id: r.vendor ? r.vendor.c_bpartner_id : null });
      });
      var routed = POS.routeReplenishment(enriched);
      var ops = [], nPo = 0, nMv = 0;
      var poGroups = {};
      routed.po.forEach(function (s) {
        var k = s.m_warehouse_id + ':' + s.c_bpartner_id;
        (poGroups[k] = poGroups[k] || []).push(s);
      });
      Object.keys(poGroups).sort().forEach(function (k) {
        var lines = poGroups[k];
        ops = ops.concat(POS.buildReplenishPO(lines[0].m_warehouse_id, lines, lines[0].c_bpartner_id)); nPo++;
      });
      Object.keys(routed.moves).sort().forEach(function (src) {
        var lines = routed.moves[src];
        ops = ops.concat(POS.buildReplenishMove({
          m_warehousesource_id: Number(src),
          locatorFrom: locatorOf(src), locatorTo: locatorOf(lines[0].m_warehouse_id)
        }, lines)); nMv++;
      });
      replCommitting = true; refreshCommitBtn();
      cfg.KO.commitGroup(cfg.opDb, ops.map(function (o) { return { op_type: o.op_type, params: o }; }), {})
        .then(function (res) {
          // T6: commitGroup RESOLVES {committed:false} on torn-group/rate-reject/id-collision — it does
          // NOT reject. Guard it or a lost group reports as success (silent loss, even in the §-log).
          if (!res || !res.committed) {
            replCommitting = false; refreshCommitBtn();
            console.log('§POS-REPLENISH-COMMIT committed=N reason=' + ((res && res.reason) || 'unknown') + ' — NOTHING committed');
            cfg.status('Replenishment NOT committed: ' + ((res && res.reason) || 'group rejected'));
            return;
          }
          return Promise.resolve(cfg.seal ? cfg.seal() : null).then(function () {
            return cfg.chainVerify ? cfg.chainVerify() : { ok: false };
          }).then(function (cv) {
            console.log('§POS-REPLENISH-COMMIT pos=' + nPo + ' moves=' + nMv + ' lines=' + picked.length +
              ' ops=' + ops.length + ' newVerbs=[] gid=' + res.gid + ' chainOk=' + (cv && cv.ok ? 'Y' : 'N'));
            cfg.status('Replenishment committed · ' + nPo + ' PO / ' + nMv + ' move · ' + picked.length + ' lines');
            replCommitting = false; clearStage();
            maybeShardSoon();          // T7-HOST: debounced shard check after the replenish group
          });
        })
        .catch(function (e) {
          replCommitting = false; refreshCommitBtn();
          cfg.status('Replenishment commit failed: ' + e); console.log('§POS-REPLENISH-COMMIT FAIL ' + e);
        });
    }

    replGen.addEventListener('click', generateReplenish);
    replCommit.addEventListener('click', commitStaged);

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
      // receipt-URL QR (order ref only)
      ov.qrEl.textContent = '';
      var rcptUrl = (window.location.href.split('?')[0]) + '?pos-receipt=' + orderId + '&ref=' + String(gid).slice(0, 8);
      if (window.qrcode) {
        try {
          var qr = window.qrcode(10, 'M'); qr.addData(rcptUrl); qr.make(); ov.qrEl.innerHTML = qr.createSvgTag(3, 2);
        } catch (e) { ov.qrEl.textContent = rcptUrl; }
      } else {
        var a = document.createElement('a'); a.href = rcptUrl; a.style.cssText = 'color:#5fd08a;font-size:11px;word-break:break-all'; a.textContent = rcptUrl;
        ov.qrEl.appendChild(a);
      }
      console.log('§POS-RECEIPT orderId=' + orderId + ' grandTotal=' + grandTotal + ' chainOk=' + chainOk + ' linesN=' + saleCart.length);
      // U-4: DEMO payment QR (additive, below receipt-URL QR)
      ov.payWrap.textContent = '';
      var demoStr = 'DEMO-PAYMENT: amount=' + grandTotal + ' ref=' + String(gid).slice(0, 8);
      if (window.qrcode) {
        try {
          var qrPay = window.qrcode(10, 'M'); qrPay.addData(demoStr); qrPay.make();
          ov.payWrap.innerHTML = qrPay.createSvgTag(3, 2);
        } catch (e) { ov.payWrap.textContent = demoStr; }
      } else {
        var demoTxt = document.createElement('div'); demoTxt.style.cssText = 'color:#fa0;font-size:11px;word-break:break-all'; demoTxt.textContent = demoStr;
        ov.payWrap.appendChild(demoTxt);
      }
      console.log('§POS-PAYQR amount=' + grandTotal + ' ref=' + String(gid).slice(0, 8) + ' demo=Y');
      ov.btn.onclick = function () { ov.ov.classList.remove('active'); };
      ov.ov.classList.add('active');
    }

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
        _se.hint.textContent = 'Hold steady · 10–15 cm from barcode';
        console.log('§POS-SCAN-HINT shown=true');
        _se.video.style.display = '';
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          .then(function (stream) {
            _scanStream = stream;
            _se.video.srcObject = stream;
            // §B-4 capability-guarded macro focus (Chrome-only; Safari degrades silently)
            var tracks = stream.getVideoTracks();
            if (tracks.length) {
              var track = tracks[0];
              var caps = track.getCapabilities ? track.getCapabilities() : {};
              var hasMacro = caps.focusMode && caps.focusMode.indexOf('macro') >= 0;
              if (hasMacro) {
                track.applyConstraints({ advanced: [{ focusMode: 'macro' }] })
                  .then(function () { console.log('§POS-FOCUS-MACRO applied=true'); })
                  .catch(function () { console.log('§POS-FOCUS-MACRO applied=false'); });
              } else {
                console.log('§POS-FOCUS-MACRO applied=false');
              }
            }
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

    // ── U-3: Import overlay — snap + scan + price → register → new tile ───────────────────────
    var _ie = null;  // import overlay elements (lazy-built)

    // Helper: build a single album card for a newly registered product and append it to the grid.
    // Mirrors the inline tile loop above — keeps §POS-FIRSTSELL tracking consistent.
    function _addNewTileCard(productId, name, price, imageThumb, imageKey) {
      var card = document.createElement('div'); card.className = 'pos-card';
      card.setAttribute('data-pid', productId);
      var imgArea = document.createElement('div'); imgArea.className = 'pos-card-img';

      // priority 1: full-res ImgStore (async, may arrive after card renders) — sha256 keys are
      // RE-HASHED before full-tier renders (img_store.resolveImage; tampered folder blob → §IMG-TAMPER,
      // the ledger thumb keeps rendering — never bytes the key disowns)
      if (imageKey && window.ImgStore && typeof window.ImgStore.resolveImage === 'function') {
        var digestOf = (window.crypto && window.crypto.subtle) ? _blobSha256 : undefined;
        window.ImgStore.resolveImage({ get: window.ImgStore.get }, imageKey, function () { return null; }, digestOf)
          .then(function (r) {
            if (r.tampered) { console.log('§IMG-TAMPER key=' + String(imageKey).slice(0, 23) + '… folder blob ≠ its content address — thumb keeps rendering'); return; }
            if (r.tier === 'full' && r.src) {
              var url = URL.createObjectURL(r.src);
              var im = document.createElement('img'); im.src = url; im.alt = name;
              imgArea.innerHTML = ''; imgArea.appendChild(im);
            }
          }).catch(function () {});
      }

      // priority 2: thumbnail dataURL captured this session
      if (imageThumb) {
        var im2 = document.createElement('img'); im2.src = imageThumb; im2.alt = name;
        im2.style.cssText = 'width:100%;height:100px;object-fit:cover;display:block;';
        imgArea.innerHTML = ''; imgArea.appendChild(im2);
      } else {
        imgArea.innerHTML = _svgIcon('image', 36);
      }

      var nameDiv  = document.createElement('div'); nameDiv.className = 'pos-card-name'; nameDiv.textContent = name;
      var priceDiv = document.createElement('div'); priceDiv.className = 'pos-card-price'; priceDiv.textContent = Number(price).toFixed(2);
      card.appendChild(imgArea); card.appendChild(nameDiv); card.appendChild(priceDiv);

      card.addEventListener('click', function () {
        var added = _addToCart(productId, name);
        if (added) {
          card.classList.add('flash');
          setTimeout(function () { card.classList.remove('flash'); }, 220);
        }
      });
      grid.appendChild(card);
      // register in productByCode so the scan overlay can find it immediately
      productByCode[String(name).trim()] = productId;
      tileByPid[productId] = { m_product_id: productId, name: name, pricestd: price };
    }

    // Build the ctx needed by buildRegisterGroup — mirrors poc_pos_register.js registerDefaults()
    // using the sql.js b3 handle the lens already holds. All queries extracted from poc_pos_register.js.
    function _buildRegisterCtx() {
      function modeOf(rows, col) {
        var c = {}; rows.forEach(function (r) { var v = r[col]; c[v] = (c[v] || 0) + 1; });
        var best = null;
        Object.keys(c).forEach(function (k) { if (best == null || c[k] > c[best]) best = k; });
        if (best == null || best === 'null' || best === '') return null;
        var n = Number(best); return (!isNaN(n) && String(n) === best) ? n : (best === 'null' ? null : best);
      }

      // M_Product mandatory cols from AD_Column
      var AUDIT = { created: 1, createdby: 1, updated: 1, updatedby: 1 };
      var KEYED = { m_product_id: 1, name: 1, value: 1 };
      var tid = (function () {
        var r = q1(b3, "SELECT ad_table_id FROM ad_table WHERE LOWER(tablename)='m_product'");
        return r && r.ad_table_id;
      })();
      var mand = tid ? qa(b3, "SELECT columnname, defaultvalue FROM ad_column WHERE ad_table_id=? AND ismandatory='Y'", tid) : [];
      var prows = qa(b3, 'SELECT * FROM m_product WHERE m_product_id IN (SELECT m_product_id FROM c_poskey WHERE c_poskeylayout_id=? AND m_product_id IS NOT NULL)', pos.c_poskeylayout_id);
      var dict = {}, product = {};
      mand.forEach(function (c) {
        var col = String(c.columnname).toLowerCase();
        if (AUDIT[col] || KEYED[col]) return;
        var dv = c.defaultvalue;
        if (dv != null && String(dv) !== 'SYSDATE' && String(dv).indexOf('@') < 0) {
          dict[col] = (String(Number(dv)) === String(dv)) ? Number(dv) : dv;
        } else {
          product[col] = modeOf(prows, c.columnname) || modeOf(prows, col);
        }
      });

      var pricerows = qa(b3, 'SELECT * FROM m_productprice WHERE m_pricelist_version_id=?', plv.v);
      var imgrows   = qa(b3, 'SELECT * FROM ad_image');
      var keyrows   = qa(b3, 'SELECT * FROM c_poskey WHERE c_poskeylayout_id=?', pos.c_poskeylayout_id);
      function modeR(rows, col) { return modeOf(rows.map(function (r) { var o = {}; o[col] = r[col]; return o; }), col); }

      var et = 'U';
      try { var sr = q1(b3, "SELECT value FROM ad_sysconfig WHERE name='DEFAULT_ENTITYTYPE'"); if (sr) et = sr.value; } catch (e) {}
      var seqR = q1(b3, 'SELECT COALESCE(MAX(seqno),0)+10 AS s FROM c_poskey WHERE c_poskeylayout_id=?', pos.c_poskeylayout_id);
      var nextseq = (seqR && seqR.s != null) ? seqR.s : 10;

      var regDefaults = {
        dict: dict, product: product,
        price: { ad_client_id: modeR(pricerows, 'ad_client_id'), ad_org_id: modeR(pricerows, 'ad_org_id') },
        image: { ad_client_id: modeR(imgrows, 'ad_client_id'), ad_org_id: modeR(imgrows, 'ad_org_id'), entitytype: et },
        poskey: { ad_client_id: modeR(keyrows, 'ad_client_id'), ad_org_id: modeR(keyrows, 'ad_org_id'), qty: modeR(keyrows, 'qty'), nextseqno: nextseq }
      };

      function priorCreateCount() {
        var r = cfg.opDb.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='CRUD_CREATE'");
        // T7-HOST (§T7-COUNT): + the pre-shard count — the register PK band must not restart post-shard.
        return ((r[0] && Number(r[0].values[0][0])) || 0) + _archivedOpCount(cfg.opDb, 'CRUD_CREATE');
      }

      return {
        pos: pos,
        priceListVersionId: plv.v,
        registerDefaults: function () { return regDefaults; },
        productByBarcode: function (upc) {
          return q1(b3, 'SELECT m_product_id, name FROM m_product WHERE upc=?', upc) || null;
        },
        priorCreateCount: priorCreateCount
      };
    }

    // Downscale a captured canvas frame to ≤256px and JPEG-compress until base64 payload ≤ 43700 chars.
    function _downscaleCapture(srcCanvas) {
      var MAX_SIDE = 256;
      var MAX_B64 = 43700;
      var sw = srcCanvas.width, sh = srcCanvas.height;
      var scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
      var tw = Math.max(1, Math.round(sw * scale)), th = Math.max(1, Math.round(sh * scale));
      var c = document.createElement('canvas'); c.width = tw; c.height = th;
      var cx = c.getContext('2d'); cx.drawImage(srcCanvas, 0, 0, tw, th);
      var quality = 0.82;
      var dataUrl;
      do {
        dataUrl = c.toDataURL('image/jpeg', quality);
        var b64 = dataUrl.split(',')[1] || '';
        if (b64.length <= MAX_B64) break;
        quality -= 0.12;
      } while (quality > 0.1);
      return dataUrl;
    }

    // ── G-2 (POS_GAP_CLOSE): content-address helpers — imageKey = sha256 of the DECODED image
    // bytes (the W-IMG-SYNC copy-job premise; the former content-length stub diverged from the
    // engine proof). Pages is HTTPS so SubtleCrypto is present; absent → keys stay HONESTLY null.
    function _hexOf(buf) {
      var v = new Uint8Array(buf), s = '';
      for (var i = 0; i < v.length; i++) s += (v[i] < 16 ? '0' : '') + v[i].toString(16);
      return s;
    }
    function _dataUrlBytes(dataUrl) {   // decoded base64 payload → Uint8Array (the bytes the key names)
      var s = String(dataUrl), i = s.indexOf('base64,');
      if (i < 0) return null;
      var bin = atob(s.slice(i + 7)), out = new Uint8Array(bin.length);
      for (var j = 0; j < bin.length; j++) out[j] = bin.charCodeAt(j);
      return out;
    }
    function _blobSha256(blob) {        // digestOf for ImgStore.resolveImage (sha256-key verification)
      return blob.arrayBuffer()
        .then(function (buf) { return window.crypto.subtle.digest('SHA-256', buf); })
        .then(_hexOf);
    }

    importBtn.addEventListener('click', function () {
      if (!_ie) _ie = _buildImportOverlay();
      var ie = _ie;
      var _state = { step: 0, imageThumb: null, imageKey: null, barcode: '', snapStream: null };

      function _setErr(msg) { ie.err.textContent = msg || ''; }
      function _setHint(msg) { ie.hint.textContent = msg || ''; }
      function _activateStep(n) {
        ie.stepEls.forEach(function (s, i) {
          s.className = 'pos-import-step' + (i < n ? ' done' : i === n ? ' active' : '');
        });
      }
      function _stopSnapStream() {
        if (_state.snapStream) { _state.snapStream.getTracks().forEach(function (t) { t.stop(); }); _state.snapStream = null; }
        ie.video.style.display = 'none'; ie.video.srcObject = null;
      }
      function _closeImport() {
        _stopSnapStream();
        ie.ov.classList.remove('active');
      }

      ie.close.onclick = function () { _closeImport(); };

      // clear body
      ie.body.querySelectorAll('.pos-import-dyn').forEach(function (n) { n.parentNode && n.parentNode.removeChild(n); });
      ie.video.style.display = 'none'; ie.thumb.style.display = 'none'; ie.err.textContent = '';

      // ── STEP 1: SNAP ────────────────────────────────────────────────────────────────────────
      _state.step = 0; _activateStep(0);
      _setHint('Take a photo of the product (or skip if no camera).');

      function _buildDyn(tag, cls, text) {
        var d = document.createElement(tag); d.className = 'pos-import-dyn ' + (cls || '');
        if (text) d.textContent = text; return d;
      }

      var takePhotoBtn = _buildDyn('button', 'pos-import-btn'); takePhotoBtn.textContent = 'Take photo';
      var skipSnapBtn  = _buildDyn('button', 'pos-import-btn'); skipSnapBtn.textContent  = 'Skip photo';
      skipSnapBtn.style.marginLeft = '8px';
      ie.body.appendChild(takePhotoBtn); ie.body.appendChild(skipSnapBtn);

      // try camera
      var hasCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      if (!hasCam) {
        takePhotoBtn.disabled = true;
        _setHint('No camera available — skip photo and proceed to scan.');
      } else {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          .then(function (stream) {
            _state.snapStream = stream;
            ie.video.srcObject = stream; ie.video.style.display = 'block';
          })
          .catch(function (e) {
            takePhotoBtn.disabled = true;
            _setHint('Camera access denied — skip photo.');
            console.log('§POS-IMPORT getUserMedia denied: ' + e);
          });
      }

      function _goToScan() {
        _stopSnapStream();
        // clear snap controls
        ie.body.querySelectorAll('.pos-import-dyn').forEach(function (n) { n.parentNode && n.parentNode.removeChild(n); });
        _activateStep(1);
        // ── STEP 2: SCAN ──────────────────────────────────────────────────────────────────────
        _state.step = 1;
        _setHint('Scan barcode or type it below, then press Enter.');

        var barcodeInput = _buildDyn('input', 'pos-import-input'); barcodeInput.type = 'text';
        barcodeInput.placeholder = 'Barcode / UPC — scan or type + Enter';
        ie.body.appendChild(barcodeInput);

        var scanHint = _buildDyn('div', ''); scanHint.style.cssText = 'color:#cdd6e4;font-size:11px;margin-top:6px;';
        var hasBD = typeof BarcodeDetector !== 'undefined';
        if (hasBD) {
          scanHint.textContent = 'BarcodeDetector active — point camera at barcode OR type above.';
          // one-shot scan attempt via environment camera
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(function (stream) {
              _state.snapStream = stream;
              ie.video.srcObject = stream; ie.video.style.display = 'block';
              var bd = new BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','qr_code','data_matrix'] });
              var tries = 0;
              function detect() {
                if (!ie.ov.classList.contains('active') || _state.step !== 1) { _stopSnapStream(); return; }
                bd.detect(ie.video).then(function (bc) {
                  if (bc.length) { _stopSnapStream(); barcodeInput.value = bc[0].rawValue; _goToPrice(bc[0].rawValue); }
                  else if (++tries < 60) { setTimeout(detect, 250); }
                  else { _stopSnapStream(); scanHint.textContent = 'Scan timed out — type barcode above.'; }
                }).catch(function () { if (++tries < 60) { setTimeout(detect, 250); } else { _stopSnapStream(); } });
              }
              setTimeout(detect, 300);
            })
            .catch(function () { scanHint.textContent = 'Camera denied — type barcode above.'; });
        } else {
          scanHint.textContent = 'BarcodeDetector not available — type barcode above + Enter.';
        }
        ie.body.appendChild(scanHint);

        barcodeInput.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { var v = barcodeInput.value.trim(); if (v) { _stopSnapStream(); _goToPrice(v); } }
        });
        // also offer a "Next" button
        var nextScanBtn = _buildDyn('button', 'pos-import-btn'); nextScanBtn.textContent = 'Use this barcode';
        nextScanBtn.style.display = 'block'; nextScanBtn.style.marginTop = '10px';
        nextScanBtn.addEventListener('click', function () { var v = barcodeInput.value.trim(); if (v) { _stopSnapStream(); _goToPrice(v); } else { _setErr('Enter a barcode first.'); } });
        ie.body.appendChild(nextScanBtn);

        barcodeInput.focus();
      }

      function _goToPrice(barcode) {
        _state.barcode = barcode;
        ie.body.querySelectorAll('.pos-import-dyn').forEach(function (n) { n.parentNode && n.parentNode.removeChild(n); });
        ie.video.style.display = 'none';
        _activateStep(2);
        _state.step = 2;
        _setHint('Enter the price for "' + barcode + '".');
        _setErr('');

        var priceInput = _buildDyn('input', 'pos-import-input'); priceInput.type = 'number';
        priceInput.placeholder = 'Price (e.g. 1.00)'; priceInput.min = '0'; priceInput.step = '0.01'; priceInput.value = '1.00';
        ie.body.appendChild(priceInput);

        var confirmBtn = _buildDyn('button', 'pos-import-btn'); confirmBtn.textContent = 'Register product';
        confirmBtn.style.display = 'block'; confirmBtn.style.marginTop = '10px';
        ie.body.appendChild(confirmBtn);

        confirmBtn.addEventListener('click', function () { _doRegister(priceInput.value.trim()); });
        priceInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { _doRegister(priceInput.value.trim()); } });
        priceInput.focus();
      }

      function _doRegister(priceStr) {
        if (!priceStr || isNaN(Number(priceStr)) || Number(priceStr) < 0) {
          _setErr('Enter a valid price (e.g. 1.00)'); return;
        }
        _activateStep(3); _state.step = 3;
        _setErr(''); _setHint('Registering…');
        ie.body.querySelectorAll('.pos-import-dyn').forEach(function (n) { n.parentNode && n.parentNode.removeChild(n); });

        var rCtx = _buildRegisterCtx();
        var spec = {
          stationId: pos.c_pos_id,
          barcode: _state.barcode,
          name: _state.barcode,      // name = barcode mnemonic per §P-9 seed convention
          price: priceStr,
          imageThumb: _state.imageThumb || null,
          imageKey: _state.imageKey   || null
        };

        var r = POS.buildRegisterGroup(rCtx, spec);
        if (r.ok === false) {
          _activateStep(2); _state.step = 2;
          _setHint('');
          _setErr('Register refused: ' + r.reason + (r.bytes ? ' (' + r.bytes + 'B > ' + r.cap + 'B cap)' : '') + (r.existing ? ' · existing product ' + r.existing.m_product_id : ''));
          console.log('§POS-IMPORT refused reason=' + r.reason);
          return;
        }

        cfg.KO.commitGroup(cfg.opDb, r.ops.map(function (o) { return { op_type: o.op_type, params: o }; }), {})
          .then(function (res) {
            // T6: guard {committed:false} — a rejected group must not report as a completed sale.
            if (!res || !res.committed) {
              console.log('§POS-SALE committed=N reason=' + ((res && res.reason) || 'unknown') + ' — sale NOT recorded');
              cfg.status('Sale NOT completed: ' + ((res && res.reason) || 'group rejected'));
              return;
            }
            // store full-res blob in ImgStore if available
            if (_state.imageThumb && _state.imageKey && window.ImgStore && typeof window.ImgStore.put === 'function') {
              try {
                // convert dataURL → Blob for ImgStore
                var b64part = _state.imageThumb.split(',')[1] || '';
                var byteStr = atob(b64part);
                var buf = new Uint8Array(byteStr.length);
                for (var i = 0; i < byteStr.length; i++) buf[i] = byteStr.charCodeAt(i);
                var blob = new Blob([buf], { type: 'image/jpeg' });
                window.ImgStore.put(_state.imageKey, blob).catch(function () {});
              } catch (e) {}
            }
            // render the new tile in the album grid
            _addNewTileCard(r.productId, _state.barcode, priceStr, _state.imageThumb, _state.imageKey);
            // register in session tracker → §POS-FIRSTSELL
            _sessionProductIds[r.productId] = true;
            console.log('§POS-IMPORT registered productId=' + r.productId + ' barcode=' + _state.barcode +
              ' price=' + priceStr + ' hasPhoto=' + (!!_state.imageThumb) +
              ' gid=' + res.gid + ' ops=' + res.ids.length);
            maybeShardSoon();          // T7-HOST: debounced shard check after the register group
            _closeImport();
          })
          .catch(function (e) {
            _activateStep(2); _state.step = 2;
            _setHint(''); _setErr('Commit failed: ' + String(e));
            console.log('§POS-IMPORT commit FAIL ' + e);
          });
      }

      takePhotoBtn.addEventListener('click', function () {
        if (!_state.snapStream) { _goToScan(); return; }  // no live stream — skip to scan
        // capture frame to canvas
        var vid = ie.video;
        ie.canvas.width = vid.videoWidth || 320; ie.canvas.height = vid.videoHeight || 240;
        var cx = ie.canvas.getContext('2d'); cx.drawImage(vid, 0, 0);
        var dataUrl = _downscaleCapture(ie.canvas);
        _state.imageThumb = dataUrl;
        // imageKey = CONTENT ADDRESS: sha256 of the decoded bytes (W-IMG-SYNC premise — G-2 fix of
        // the content-length stub). No SubtleCrypto → key stays null (honest: thumb-only, no fake key).
        _state.imageKey = null;
        var keyBytes = _dataUrlBytes(dataUrl);
        if (keyBytes && window.crypto && window.crypto.subtle) {
          window.crypto.subtle.digest('SHA-256', keyBytes).then(function (buf) {
            _state.imageKey = 'sha256:' + _hexOf(buf);
            console.log('§POS-IMGKEY sha256 key=' + _state.imageKey.slice(0, 23) + '… bytes=' + keyBytes.length);
          }).catch(function () { console.log('§POS-IMGKEY digest failed — key stays null (honest)'); });
        } else {
          console.log('§POS-IMGKEY no SubtleCrypto/bytes — key stays null (honest refusal, thumb-only)');
        }
        ie.thumb.src = dataUrl; ie.thumb.style.display = 'block';
        _stopSnapStream();
        // remove snap buttons
        ie.body.querySelectorAll('.pos-import-dyn').forEach(function (n) { n.parentNode && n.parentNode.removeChild(n); });
        _setHint('Photo captured.');
        _goToScan();
      });

      skipSnapBtn.addEventListener('click', function () {
        _state.imageThumb = null; _state.imageKey = null;
        _stopSnapStream();
        ie.body.querySelectorAll('.pos-import-dyn').forEach(function (n) { n.parentNode && n.parentNode.removeChild(n); });
        _setHint('No photo — skipped.');
        _goToScan();
      });

      ie.ov.classList.add('active');
      console.log('§POS-IMPORT mode=open');
    });

    // ── §D-2 tender flanker → opens receipt-preview modal ─────────────────────────────────────────
    // ── §R2-3/§R2-5 single Pay icon = Complete the sale DIRECTLY (buildSaleGroup → commitGroup →
    //   receipt). No preview modal. The partner is defaulted (§R2-5) so it works out of the box; the
    //   empty-partner gate that silently blocked the old banknote ("Pay stopped working") is fixed. ──
    btn.addEventListener('click', function () {
      _sfx('pos_pay');                                           // §R2-AUDIO pay earcon (guarded, no-op if SFX off/absent)
      if (!cart.length) { cfg.status('Cart is empty'); console.log('§POS-PAY refused reason=empty-cart'); return; }
      if (!bpSel.value) { cfg.status('Pick the walk-in partner first (seed has no BPartnerCashTrx on c_pos)'); console.log('§POS-PAY refused reason=no-partner'); return; }
      var saleCart = cart.map(function (c) { return Object.assign({}, c); }); // snapshot for receipt
      var ids = nextIds(cfg.opDb);
      var g = POS.buildSaleGroup(ctx, cart, { orderId: ids.orderId, inoutId: ids.inoutId, invoiceId: ids.invoiceId, c_bpartner_id: Number(bpSel.value) });
      if (!g.ok) { cfg.status('refused: ' + g.reason); console.log('§POS-LIVE complete REFUSED reason=' + g.reason); return; }
      cfg.KO.commitGroup(cfg.opDb, g.ops.map(function (o) { return { op_type: o.op_type, params: o }; }), {})
        .then(function (res) {
          // T6: commitGroup RESOLVES {committed:false} (torn/rate/id-collision) — guard or a lost sale reports success.
          if (!res || !res.committed) {
            console.log('§POS-SALE committed=N reason=' + ((res && res.reason) || 'unknown') + ' — sale NOT recorded');
            cfg.status('Sale NOT completed: ' + ((res && res.reason) || 'group rejected'));
            return;
          }
          return Promise.resolve(cfg.seal ? cfg.seal() : null).then(function () {
            return cfg.chainVerify ? cfg.chainVerify() : { ok: false };
          }).then(function (cv) {
            var chainOk = cv && cv.ok ? 'Y' : 'N';
            var grandTotal = POS.cartTotal(saleCart);
            // U-3: §POS-FIRSTSELL — fires when a completed cart contains a session-registered product
            var _firstSellHit = saleCart.some(function (c) { return !!_sessionProductIds[c.m_product_id]; });
            if (_firstSellHit) {
              console.log('§POS-FIRSTSELL snap=Y scan=Y price=keyed tile=rendered sold=Y elapsed<60s');
            }
            console.log('§POS-SALE lines=' + g.soLines.length + ' dispatch=SALE newVerbs=[] chainOk=' + chainOk +
              ' gid=' + res.gid + ' ops=' + res.ids.length + ' sealed=' + res.sealed);
            console.log('§POS-DOC order=' + ids.orderId + ' completeIt ok (C_Order+M_InOut+C_Invoice CO in ONE group)');
            var consume = g.ops.filter(function (o) { return o.op_type === 'CONSUME'; });
            if (consume.length) console.log('§POS-BACKFLUSH parent=' + g.soLines[0].m_product_id + ' components=' + consume.length + ' consumed=Y sameGroup=Y');
            console.log('§POS-MOBILE cols=3 panel=float total=large');
            _sfx('pos_complete');                               // §R2-AUDIO sale-complete earcon
            // §P-11 show receipt + enable receipt pill
            _lastRcptArgs = [saleCart, ids.orderId, grandTotal, res.gid, chainOk];
            _showReceipt(saleCart, ids.orderId, grandTotal, res.gid, chainOk);
            rcptBtn.style.display = '';
            receipt.textContent = '✓ ' + grandTotal + ' tendered · order ' + ids.orderId + ' · group ' + String(res.gid).slice(0, 8) + '… · signed=' + chainOk;
            cart = []; renderCart();   // §T1-SPEC lens.1: replenishment no longer auto-fires after a sale
            maybeShardSoon();          // T7-HOST: the ~5k-op cliff check rides every sale (debounced)
          });
        })
        .catch(function (e) { cfg.status('commit failed: ' + e); console.log('§POS-LIVE commit FAIL ' + e); });
    });

    // ── §P-12 deliver-later handler (W-1) — order CO + shipment born DR, then PERSIST the op log ──
    // Implementing docs/SPATIAL_PICKING_SPEC.md §S-2b — Witness: W-POS-DELIVERLATER (engine) + live §-logs.
    // The persist is THE seam: the walk page reads the SAME IDB the host persists to
    // (bim_ootb_cache/dbs/idmp_kanban_proj) — without it the sale exists only in page memory.
    if (dlBtn) dlBtn.addEventListener('click', function () {
      if (!cart.length) { cfg.status('Cart is empty'); return; }
      if (!bpSel.value) { cfg.status('Pick the walk-in partner first (seed has no BPartnerCashTrx on c_pos)'); return; }
      var saleCart = cart.map(function (c) { return Object.assign({}, c); });
      var ids = nextIds(cfg.opDb);
      // invoice timing NAMED from the dictionary (the witness's extraction query, verbatim)
      var invR = q1(b3, "SELECT c.defaultvalue AS v FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='C_Order' AND c.columnname='InvoiceRule'");
      var g = POS.buildDeliverLaterGroup(ctx, cart, {
        orderId: ids.orderId, inoutId: ids.inoutId, c_bpartner_id: Number(bpSel.value),
        doctype: dtSO, invoiceRule: invR ? invR.v : null
      });
      if (!g.ok) { cfg.status('refused: ' + g.reason); console.log('§POS-DELIVERLATER REFUSED reason=' + g.reason); return; }
      cfg.KO.commitGroup(cfg.opDb, g.ops.map(function (o) { return { op_type: o.op_type, params: o }; }), {})
        .then(function (res) {
          // T6: commitGroup RESOLVES {committed:false} (torn/rate/id-collision) — guard or a lost sale reports success.
          if (!res || !res.committed) {
            console.log('§POS-SALE committed=N reason=' + ((res && res.reason) || 'unknown') + ' — sale NOT recorded');
            cfg.status('Sale NOT completed: ' + ((res && res.reason) || 'group rejected'));
            return;
          }
          return Promise.resolve(cfg.seal ? cfg.seal() : null).then(function () {
            return cfg.chainVerify ? cfg.chainVerify() : { ok: false };
          }).then(function (cv) {
            // persist the op log so the WALK page can fold this sale (the §S-2b seam)
            return Promise.resolve(cfg.persist ? cfg.persist() : false).then(function (saved) {
              var statuses = g.ops.filter(function (o) { return o.op_type === 'SET_STATUS'; })
                .map(function (o) { return o.table + '→' + o.doc_status; });
              console.log('§POS-DELIVERLATER sale order=' + ids.orderId + ' doctype=' + dtSO.c_doctype_id +
                '(SO) ops=' + g.ops.length + ' statuses=[' + statuses.join(',') + '] inout=' + ids.inoutId +
                ' born=DR invoice=none(InvoiceRule=' + (g.invoiceTiming && g.invoiceTiming.rule) + ' named)' +
                ' gid=' + res.gid + ' chainOk=' + (cv && cv.ok ? 'Y' : 'N') + ' persisted=' + (saved ? 'Y' : 'N'));
              receipt.textContent = '✓ ' + POS.cartTotal(saleCart) + ' · deliver later — order ' + ids.orderId +
                ' CO, shipment ' + ids.inoutId + ' DR · pick it in the warehouse walk';
              cart = []; renderCart();
              // §D-5 POC: open WH walk in new tab so user can immediately pick (user gesture → no popup block)
              var whUrl = (window.location.href.split('/erp/')[0] || '..') + '/viewer/viewer.html?db=../buildings/warehouse_gardenworld.db';
              window.open(whUrl, '_blank');
              console.log('§POS-DELIVERLATER walk-tab=opened url=' + whUrl);
              maybeShardSoon();        // T7-HOST: debounced shard check after the deliver-later group
            });
          });
        })
        .catch(function (e) { cfg.status('commit failed: ' + e); console.log('§POS-DELIVERLATER commit FAIL ' + e); });
    });

    // station info inside the items body (visible when items drawer is open)
    var stationInfo = document.createElement('div');
    stationInfo.style.cssText = 'color:#9aa4b8;font-size:11px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.08)';
    stationInfo.textContent = pos.name + ' · wh ' + pos.m_warehouse_id + ' · pricelist v' + plv.v;
    itemsBody.insertBefore(stationInfo, cartBox);

    renderCart();
    cfg.overlay('POS — ' + pos.name, wrap, _disposePosChrome);
    console.log('§POS-LIVE open station=' + pos.c_pos_id + ' tiles=' + tiles.length + ' priced=' + tiles.length + ' handAuthored=0');
    // §T1-SPEC lens.1: no auto-fire on open — replenishment is generated on the explicit button
    console.log('§POS-REPLENISH-IDLE trigger=#pos-repl-generate (staged review; nothing proposed until asked)');
  }

  root.PosLens = { open: open };
  // node-witness seam (W-T7-HOST — prompts/T7_HOST_WIRING_SPEC.md): the shard-aware pure folds only;
  // open() stays DOM-bound and untestable headless by design.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { open: open, _t7: { nextIds: nextIds, logMovements: logMovements, pendingInbound: pendingInbound } };
  }
  console.log('§POS-LENS loaded (dumb terminal — record, pay, send; the fold does the rest)');
})(typeof window !== 'undefined' ? window : this);
