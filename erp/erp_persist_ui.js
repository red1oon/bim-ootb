/* erp_persist_ui.js — §INTEG-WIRE-B (prompts/ERP_SUBSTRATE_INTEGRATION.md Phase 2, slice B)
 *
 * Disposable-host persistence as a GESTURE on the live ERP surface. Backs the books up to a SIGNED
 * snapshot the user owns (a file / any host), and restores them on a FRESH device — to the cent.
 * Composition only — no engine logic, no invented op. Reuses, exactly as slice A does:
 *   window.KernelOps        (canonical signed kernel — commitOp/sealChain/verifyChain/replayOps)
 *   window.ErpSigner        (the APP edge signer — loadOrMint custody + makeSigner; NOT a demo key)
 *   window.ErpReplicaClient (FROZEN read side — replayAndVerify: replay snapshot → recompute tip)
 *   window.__crud           (withSidecar → the live sidecar db; persist → re-persist after adopt)
 *   window.ErpPeriodClose   (foldBalances — to SHOW the recovered books; optional)
 *
 * Trust model (non-invent, mirrors the W-PERSIST-SLICE witness): the backup carries the exporting
 * device's PUBLIC key (JWK, exportable) + a short fingerprint. Restore verifies the signature is
 * self-consistent under that embedded pubkey and recomputes tip == signed tip; it DISPLAYS the key
 * fingerprint so the owner recognises their own backup (TOFU). A tamperer with no private key cannot
 * produce a file that both recomputes a matching tip AND verifies — restore rejects it.
 *
 * Whitebox witness: erp/tests/poc_persist_wire.js (§INTEG-WIRE-B). Read the log.
 */
(function (global) {
  'use strict';
  var TAG = '§INTEG-WIRE-B';
  var _sqlP = null;

  function _ready() { return !!(global.KernelOps && global.ErpSigner && global.ErpReplicaClient && global.__crud); }

  // ensure sql.js (glassbowl loads it lazily) — same on-demand bundle load as period_close_ui.
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
  function _withDb(cb) {
    _ensureSql(function () {
      var c = global.__crud;
      if (c && typeof c.withSidecar === 'function') { c.withSidecar(cb); return; }
      cb(c && typeof c.kernelDb === 'function' ? c.kernelDb() : null);
    });
  }
  // a throwaway db (for SAFE validate-before-adopt) from the same sql.js bundle.
  function _freshDb() {
    if (!_sqlP) _sqlP = global.initSqlJs({ locateFile: function (f) { return 'sqljs/' + f; } });
    return _sqlP.then(function (SQL) { return new SQL.Database(); });
  }

  function _hex(buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function _fp(jwk) { // 8-hex fingerprint of the public key (x|y) — what the owner recognises.
    return global.crypto.subtle.digest('SHA-256', new TextEncoder().encode((jwk.x || '') + '|' + (jwk.y || '')))
      .then(function (d) { return _hex(d).slice(0, 8); });
  }
  function _selectRows(db) {
    var r = db.exec('SELECT id, op_uuid, timestamp, op_type, parameters, input_guids, output_guid FROM kernel_ops ORDER BY id');
    if (!r.length) return [];
    return r[0].values.map(function (x) { return { seq: x[0], op_uuid: x[1], timestamp: x[2], op_type: x[3], parameters: x[4], input_guids: x[5], output_guid: x[6] }; });
  }

  // ── BACKUP — seal the live op-log, sign the tip with the user's edge key, build the signed snapshot.
  //    Returns the snapshot object; renderInto wraps it in a file download. ────────────────────────────
  function backup() {
    if (!_ready()) return Promise.reject(new Error('persist: kernel/signer/replica/crud not loaded'));
    return global.ErpSigner.loadOrMint('bim_erp_signer').then(function (kp) {
      var signer = global.ErpSigner.makeSigner(kp);
      return global.crypto.subtle.exportKey('jwk', kp.publicKey).then(function (pubJwk) {
        return _fp(pubJwk).then(function (fp) {
          return new Promise(function (resolve, reject) {
            _withDb(function (db) {
              if (!db) { reject(new Error('persist: no sidecar db')); return; }
              Promise.resolve(global.KernelOps.sealChain(db))
                .then(function () { return global.KernelOps.verifyChain(db); })
                .then(function (v) {
                  var rows = _selectRows(db);
                  return signer.sign(v.tip).then(function (sig) {
                    var snap = { schema: 'erp-replica/v1', len: v.len, tip: v.tip, sig: sig, alg: 'ES256',
                                 signed_by: 'edge', pub_jwk: pubJwk, fp: fp, ops: rows };
                    console.log(TAG + ' backup ops=' + rows.length + ' tip=' + (v.tip || '').slice(0, 12) +
                                '… signed=Y fp=' + fp);
                    resolve(snap);
                  });
                }).catch(reject);
            });
          });
        });
      });
    });
  }

  // ── RESTORE — validate on a THROWAWAY db (replay → recompute tip == signed tip + sig verifies under
  //    the embedded pubkey), and ONLY if valid adopt into the live sidecar + persist. Safe on tamper. ──
  function restore(snapOrText) {
    if (!_ready()) return Promise.reject(new Error('persist: kernel/signer/replica/crud not loaded'));
    var snap;
    try { snap = (typeof snapOrText === 'string') ? JSON.parse(snapOrText) : snapOrText; }
    catch (e) { return Promise.reject(new Error('restore: not valid JSON')); }
    if (!snap || !Array.isArray(snap.ops) || !snap.tip) return Promise.reject(new Error('restore: not an erp backup'));

    var rc = global.ErpReplicaClient.createReplicaClient([{ name: 'file', base: '' }]); // replayAndVerify uses no host
    // verify the embedded pubkey signs the advertised tip (ownership + tamper-proof).
    function verifySig() {
      return global.crypto.subtle.importKey('jwk', snap.pub_jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
        .then(function (pub) { return global.ErpSigner.makeSigner({ publicKey: pub }).verify(snap.tip, snap.sig); })
        .catch(function () { return false; });
    }
    return Promise.all([_freshDb(), verifySig(), _fp(snap.pub_jwk || {})]).then(function (out) {
      var tmp = out[0], sigOk = out[1], fp = out[2];
      return rc.replayAndVerify(tmp, global.KernelOps, snap).then(function (rec) {
        var tipOk = rec.matchesAdvertised && rec.computedTip === snap.tip;
        console.log(TAG + ' restore validate tipMatch=' + tipOk + ' sigValid=' + sigOk + ' fp=' + fp + ' ops=' + snap.ops.length);
        if (!tipOk || !sigOk) {
          return { ok: false, tipOk: tipOk, sigOk: sigOk, fp: fp,
                   reason: !tipOk ? 'chain does not match the signed tip (corrupt/tampered)' : 'signature invalid (not signed by this key)' };
        }
        // ADOPT — replay into the live sidecar (replaces the current op-log) + persist.
        return new Promise(function (resolve, reject) {
          _withDb(function (db) {
            if (!db) { reject(new Error('restore: no sidecar db')); return; }
            rc.replayAndVerify(db, global.KernelOps, snap).then(function () {
              if (global.__crud && typeof global.__crud.persist === 'function') global.__crud.persist();
              var books = {};
              try { books = global.ErpPeriodClose ? (global.ErpPeriodClose.foldBalances(global.KernelOps.replayOps(db), null).bal || {}) : {}; } catch (e) {}
              console.log(TAG + ' restored len=' + snap.len + ' tip=' + (snap.tip || '').slice(0, 12) + '… fp=' + fp +
                          ' accounts=' + Object.keys(books).length + ' books=' + JSON.stringify(books));
              resolve({ ok: true, tipOk: true, sigOk: true, fp: fp, len: snap.len, books: books });
            }).catch(reject);
          });
        });
      });
    });
  }

  // ── renderInto — Backup (download) + Restore (file picker) controls, styled like the period-close one.
  function _injectCSS() {
    var d = global.document; if (!d || d.getElementById('persist-css')) return;
    var s = d.createElement('style'); s.id = 'persist-css';
    s.textContent = '.persist-ctl{display:flex;flex-direction:column;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.12)}' +
      '.persist-row{display:flex;gap:8px;flex-wrap:wrap}' +
      '.persist-btn{min-height:38px;padding:0 14px;border-radius:20px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:inherit;font:inherit;font-size:13px;cursor:pointer}' +
      '.persist-btn:disabled{opacity:.6;cursor:default}.persist-read{font-size:12px;opacity:.75}';
    (d.head || d.documentElement).appendChild(s);
  }
  function _download(d, snap) {
    var blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    var a = d.createElement('a');
    a.href = global.URL.createObjectURL(blob);
    a.download = 'erp-backup-' + (snap.tip || '0').slice(0, 8) + '.json';
    d.body.appendChild(a); a.click(); d.body.removeChild(a);
    setTimeout(function () { global.URL.revokeObjectURL(a.href); }, 1000);
  }
  function renderInto(container, opts) {
    if (!container) return null;
    opts = opts || {};
    _injectCSS();
    var d = global.document;
    var wrap = d.createElement('div'); wrap.className = 'persist-ctl';
    var row = d.createElement('div'); row.className = 'persist-row';
    var bBtn = d.createElement('button'); bBtn.type = 'button'; bBtn.className = 'persist-btn'; bBtn.textContent = '⤓ Backup (signed)';
    var rLbl = d.createElement('label'); rLbl.className = 'persist-btn'; rLbl.textContent = '⤒ Restore…';
    var rIn = d.createElement('input'); rIn.type = 'file'; rIn.accept = 'application/json,.json'; rIn.style.display = 'none';
    rLbl.appendChild(rIn);
    var read = d.createElement('div'); read.className = 'persist-read'; read.textContent = 'Your books are a signed file you own — back up, restore on any device.';

    bBtn.addEventListener('click', function () {
      bBtn.disabled = true; bBtn.textContent = '⤓ Backing up…';
      backup().then(function (snap) {
        _download(d, snap);
        read.textContent = 'Backed up ' + snap.ops.length + ' ops · tip ' + (snap.tip || '').slice(0, 8) + ' · key ' + snap.fp;
        bBtn.textContent = '⤓ Backup (signed) ✓'; bBtn.disabled = false;
      }).catch(function (e) { bBtn.textContent = '⤓ Backup (signed)'; bBtn.disabled = false; console.warn(TAG + ' backup failed', e && e.message); });
    });
    rIn.addEventListener('change', function () {
      var f = rIn.files && rIn.files[0]; if (!f) return;
      if (!global.confirm('Restore replaces the current op-log with this backup. Continue?')) { rIn.value = ''; return; }
      var fr = new FileReader();
      fr.onload = function () {
        rLbl.textContent = '⤒ Restoring…';
        restore(fr.result).then(function (res) {
          if (res.ok) { read.textContent = 'Restored ' + res.len + ' ops · key ' + res.fp + ' · ' + Object.keys(res.books).length + ' accounts'; rLbl.textContent = '⤒ Restored ✓';
            if (typeof opts.onRestored === 'function') opts.onRestored(res); }
          else { read.textContent = 'Restore REJECTED — ' + res.reason; rLbl.textContent = '⤒ Restore…'; }
        }).catch(function (e) { rLbl.textContent = '⤒ Restore…'; read.textContent = 'Restore error — ' + (e && e.message); console.warn(TAG + ' restore failed', e && e.message); });
        rIn.value = '';
      };
      fr.readAsText(f);
    });
    row.appendChild(bBtn); row.appendChild(rLbl);
    wrap.appendChild(row); wrap.appendChild(read);
    container.appendChild(wrap);
    return wrap;
  }

  global.ErpPersist = { backup: backup, restore: restore, renderInto: renderInto };
  console.log('§PERSIST-UI loaded (window.ErpPersist: backup/restore/renderInto)');
})(typeof window !== 'undefined' ? window : this);
