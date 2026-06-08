/* period_close_ui.js — §INTEG-WIRE (prompts/ERP_SUBSTRATE_INTEGRATION.md Phase 2, slice A)
 *
 * Wires the FROZEN period-close substrate (erp_period_close.js → window.ErpPeriodClose) into the live
 * ERP app, on the REAL signed op-log (crud_overlay's `glassbowl_kernel_ops` sidecar). An accountant
 * closes a period → ONE signed checkpoint carrying the closing balances → the pre-checkpoint ops are
 * compacted out → next load BOOTSTRAPS from the checkpoint (opening = balance brought forward).
 *
 * Composition only — no engine logic here, no invented posting. Reuses:
 *   window.ErpPeriodClose  (closePeriod / bootstrapFromCheckpoint / foldBalances)
 *   window.KernelOps       (the canonical signed kernel — commitOp/commitGroup/sealChain/verifyChain)
 *   window.ErpSigner       (the APP edge signer — loadOrMint custody + makeSigner; NOT a demo key)
 *   window.__crud          (withSidecar → the live sidecar db; persist → re-persist after compaction)
 *
 * Whitebox witness: erp/tests/poc_period_close_wire.js (§INTEG-WIRE). Read the log.
 */
(function (global) {
  'use strict';
  var TAG = '§INTEG-WIRE';

  function _ready() { return !!(global.ErpPeriodClose && global.KernelOps && global.ErpSigner && global.__crud); }

  // ensure sql.js is loaded — glassbowl loads it LAZILY (withBundle), so initSqlJs may be absent at init.
  // crud_overlay.withSidecar needs window.initSqlJs to build the sidecar; load the same bundle on demand.
  function _ensureSql(cb) {
    if (typeof global.initSqlJs === 'function') { cb(true); return; }
    try {
      var sc = global.document.createElement('script');
      sc.src = 'sqljs/sql-wasm.js';
      sc.onload = function () { cb(typeof global.initSqlJs === 'function'); };
      sc.onerror = function () { cb(false); };
      (global.document.head || global.document.documentElement).appendChild(sc);
    } catch (e) { cb(false); }
  }

  // resolve the live sidecar kernel db (lazily hydrated by crud_overlay, which needs sql.js present).
  function _withDb(cb) {
    _ensureSql(function () {
      var c = global.__crud;
      if (c && typeof c.withSidecar === 'function') { c.withSidecar(cb); return; }
      cb(c && typeof c.kernelDb === 'function' ? c.kernelDb() : null);
    });
  }

  // signer onto closePeriod's {signTip, signed_by} contract, via the APP signer (edge custody, IDB-persisted).
  function _signer() {
    return global.ErpSigner.loadOrMint('bim_erp_signer').then(function (kp) {
      var s = global.ErpSigner.makeSigner(kp);
      return { signTip: function (tipHex) { return s.sign(tipHex); }, signed_by: 'edge',
               _verify: function (tipHex, sig) { return s.verify(tipHex, sig); } };
    });
  }

  // boot — on load, open the current balances from the latest checkpoint (the b/f) without re-folding genesis.
  function boot() {
    if (!_ready()) { setTimeout(boot, 250); return; }
    _withDb(function (db) {
      if (!db) { console.log(TAG + ' boot: no sidecar db yet'); return; }
      try {
        var bf = global.ErpPeriodClose.bootstrapFromCheckpoint(db, global.KernelOps);
        var cur = bf.balances || bf.current || bf.bal || {};
        console.log('§PCLOSE-BF-LIVE fromCheckpoint=' + (bf.fromCheckpoint ? 'Y' : 'N') +
                    ' period=' + (bf.period != null ? bf.period : '-') +
                    ' accounts=' + Object.keys(cur).length + ' balances=' + JSON.stringify(cur));
      } catch (e) { console.warn(TAG + ' boot bootstrap error', e && e.message); }
    });
  }

  // close — fold the live ops → signed checkpoint → compact → re-persist the sidecar. Returns a Promise.
  function close(opts) {
    opts = opts || {};
    if (!_ready()) return Promise.reject(new Error('period-close: engine/signer/crud not loaded'));
    return _signer().then(function (signer) {
      return new Promise(function (resolve, reject) {
        _withDb(function (db) {
          if (!db) { reject(new Error('period-close: no sidecar db')); return; }
          var period = (opts.period != null) ? opts.period : _nextPeriod(db);
          var ts = (opts.ts != null) ? opts.ts : _stamp();   // recorded close ts (deterministic INPUT)
          Promise.resolve(global.ErpPeriodClose.closePeriod(db, global.KernelOps, signer, { period: period, ts: ts }))
            .then(function (res) {
              if (global.__crud && typeof global.__crud.persist === 'function') global.__crud.persist();
              console.log(TAG + ' closed period=' + res.period + ' archived=' + res.archived + '→live=' + res.liveLen +
                          ' accounts=' + Object.keys(res.closing_balances).length +
                          ' closing=' + JSON.stringify(res.closing_balances) +
                          ' tip=' + (res.tip || '').slice(0, 12) + '… signed=' + (res.sig ? 'Y' : 'N') + ' by=' + res.signed_by);
              resolve(res);
            }).catch(reject);
        });
      });
    });
  }

  // the next period number = (latest checkpoint period) + 1, else 1. A recorded INPUT, never invented.
  function _nextPeriod(db) {
    try {
      var r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='" + global.ErpPeriodClose.CKPT_TYPE + "' ORDER BY id DESC LIMIT 1");
      if (r.length && r[0].values.length) return (JSON.parse(r[0].values[0][0]).period || 0) + 1;
    } catch (e) {}
    return 1;
  }
  // deterministic-enough close stamp: seconds epoch (recorded into the op, so the tip is stable on replay).
  function _stamp() { return (typeof Date !== 'undefined') ? Math.floor(Date.now() / 1000) : 0; }

  // renderInto — inject the accounting-gated "Close period" control + a live balance-b/f readout into a
  // container (the role-gated Accts Posted overlay). Read-only panels stay read-only; this is the action.
  function _injectCSS() {
    var d = global.document; if (!d || d.getElementById('pclose-css')) return;
    var s = d.createElement('style'); s.id = 'pclose-css';
    s.textContent = '.pclose-ctl{display:flex;flex-direction:column;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.12)}' +
      '.pclose-btn{align-self:flex-start;min-height:38px;padding:0 14px;border-radius:20px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:inherit;font:inherit;font-size:13px;cursor:pointer}' +
      '.pclose-btn:disabled{opacity:.6;cursor:default}.pclose-read{font-size:12px;opacity:.75}';
    (d.head || d.documentElement).appendChild(s);
  }
  function renderInto(container, opts) {
    if (!container) return null;
    opts = opts || {};
    _injectCSS();
    var wrap = global.document.createElement('div');
    wrap.className = 'pclose-ctl';
    var btn = global.document.createElement('button');
    btn.className = 'pclose-btn';
    btn.type = 'button';
    btn.textContent = '⛒ Close period';
    var read = global.document.createElement('div');
    read.className = 'pclose-read';
    function paint(balances, period) {
      var ks = Object.keys(balances || {});
      read.textContent = ks.length
        ? ('Period ' + period + ' carried forward — ' + ks.length + ' accounts (Σ=' + _fmtSum(balances) + ')')
        : 'No closed period yet — balances fold from genesis.';
    }
    // initial readout from the current checkpoint
    _withDb(function (db) {
      try {
        var bf = global.ErpPeriodClose.bootstrapFromCheckpoint(db, global.KernelOps);
        paint(bf.balances || bf.current || bf.bal || {}, bf.period != null ? bf.period : '-');
      } catch (e) { paint({}, '-'); }
    });
    btn.addEventListener('click', function () {
      btn.disabled = true; btn.textContent = '⛒ Closing…';
      close(opts).then(function (res) {
        paint(res.closing_balances, res.period);
        btn.textContent = '⛒ Closed P' + res.period + ' ✓'; btn.disabled = false;
        if (typeof opts.onClosed === 'function') opts.onClosed(res);
      }).catch(function (e) {
        btn.textContent = '⛒ Close period'; btn.disabled = false;
        console.warn(TAG + ' close failed', e && e.message);
      });
    });
    wrap.appendChild(btn); wrap.appendChild(read);
    container.appendChild(wrap);
    return wrap;
  }
  function _fmtSum(b) { var s = 0, a; for (a in b) s += b[a]; return (s / 100).toFixed(2); }

  global.PeriodClose = { boot: boot, close: close, renderInto: renderInto };
  if (global.document && global.document.readyState !== 'loading') setTimeout(boot, 300);
  else if (global.document) global.document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
  console.log('§PCLOSE-UI loaded (window.PeriodClose: boot/close/renderInto)');
})(typeof window !== 'undefined' ? window : this);
