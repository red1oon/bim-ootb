/**
 * BIM OOTB — ERP. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
 *
 * kanban_host.js — the reusable HOST boot for the Kanban lens: publishes window.ERP (the ENGINE_CONTRACT §1
 * seam) so a drag commits a REAL signed SET_STATUS, and gives durability (persist the op-LOG to IDB, restore
 * + read-the-tip on boot). Same proven path as spike_writepath.html — consume the seam, NEVER fork a verb.
 * Pages supply their own per-page fold (bundle tables vs the open window's records); the host owns the
 * engine + persistence so kanban_lens.html and idempiere.html share ONE write path. (window.KanbanHost)
 */
(function (global) {
  'use strict';
  function log(m) { console.log('§KANBAN_HOST ' + m); }

  function _rows(res) { if (!res.length) return []; return res[0].values.map(function (v) { var o = {}; res[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); }

  function idbGetBlob(dbName, store, key) {
    return new Promise(function (resolve) {
      try {
        var rq = indexedDB.open(dbName, 1);
        rq.onupgradeneeded = function () { try { rq.result.createObjectStore(store); } catch (e) {} };
        rq.onsuccess = function () {
          var db = rq.result;
          if (!db.objectStoreNames.contains(store)) { db.close(); return resolve(null); }
          var g = db.transaction(store, 'readonly').objectStore(store).get(key);
          g.onsuccess = function () { db.close(); resolve(g.result || null); };
          g.onerror = function () { db.close(); resolve(null); };
        };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }
  function idbPutBlob(dbName, store, key, buf) {
    return new Promise(function (resolve, reject) {
      try {
        var rq = indexedDB.open(dbName, 1);
        rq.onupgradeneeded = function () { try { rq.result.createObjectStore(store); } catch (e) {} };
        rq.onsuccess = function () {
          var db = rq.result;
          if (!db.objectStoreNames.contains(store)) { db.close(); return reject(new Error('no store')); }
          var tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(buf, key);
          tx.oncomplete = function () { db.close(); resolve(true); };
          tx.onerror = function () { db.close(); reject(tx.error || new Error('put failed')); };
        };
        rq.onerror = function () { reject(rq.error || new Error('open failed')); };
      } catch (e) { reject(e); }
    });
  }
  var IDB = 'bim_ootb_cache', STORE = 'dbs';

  // publish(cfg) → { projDb, ctx } and sets window.ERP={dispatch,read,verify}.
  // cfg: { SQL, adDb?, gbDb?, wfmc, tables:[AD names], roleId, allowOrgs, projKey }
  async function publish(cfg) {
    var K = global.ERPKernel, Seam = global.ERPSeam;
    if (!K || !Seam) { log('§SEAM-LIVE skip — engine modules absent'); return null; }
    var adQ = cfg.adDb ? function (s, p) { return _rows(cfg.adDb.exec(s, p || [])); } : function () { return []; };
    var gbQ = cfg.gbDb ? function (s, p) { return _rows(cfg.gbDb.exec(s, p || [])); } : function () { return []; };

    // gap #2 — restore the prior op-LOG blob (persist the log, replay on boot; never the edited projection).
    var prior = await idbGetBlob(IDB, STORE, cfg.projKey);
    var projDb;
    if (prior && prior.byteLength > 100) {
      try { projDb = new cfg.SQL.Database(new Uint8Array(prior)); log('§KANBAN-RESTORE ops from IDB bytes=' + prior.byteLength + ' key=' + cfg.projKey); }
      catch (e) { projDb = new cfg.SQL.Database(); K.initProjection(projDb); log('§KANBAN-RESTORE failed, fresh: ' + e.message); }
    } else { projDb = new cfg.SQL.Database(); K.initProjection(projDb); }

    try { await global.ErpSigner.installSigner(global.KernelOps, { dbName: 'bim_erp_signer' }); }
    catch (e) { log('§SIGN skip ' + e.message); }

    var actions = {}; (cfg.wfmc.transitions || []).forEach(function (t) { actions[t[1]] = 1; });
    var grants = [];
    (cfg.tables || []).forEach(function (T) {
      Object.keys(actions).forEach(function (a) {
        K.register(T, a, function (doc, c) { return [{ op_type: 'SET_STATUS', table: doc.table, id: doc.id, doc_status: c.to, uuid: doc.uuid }]; });
        grants.push(T + ':' + a);
      });
    });

    // admissionRules (gated lifecycle): the editable, signed L1 rule "an order may Complete iff GrandTotal ≤ T"
    // gates the C_Order CO transition engine-side. No rule set → ungated (existing completes unaffected).
    var admissionRules = { 'C_Order:CO': { ruleId: 'maycomplete', table: 'C_Order', key: 'C_Order_ID', col: 'GrandTotal', cmp: 'lte' } };
    var seam = Seam.makeSeam({ projDb: projDb, adQ: adQ, factQ: gbQ, wfmc: cfg.wfmc, admissionRules: admissionRules, newDb: function () { return new cfg.SQL.Database(); } });
    var ctx = { actor: 'device:' + (localStorage.kanbanActor || (localStorage.kanbanActor = 'k' + Math.floor(performance.now()))),
      pubKey: (global.ErpSigner && global.ErpSigner.pubKeyHex) || null, roleId: cfg.roleId || null,
      role: { id: cfg.roleId || null, actions: grants }, allowOrgs: (cfg.allowOrgs && cfg.allowOrgs.length) ? cfg.allowOrgs : '*' };
    // I-4 (prompts/I4_OPLOG_RECONCILE.md): the seam's op-LOG is the ONE genuinely-signed chain. Expose the
    // op-log db + seal/chainVerify so a write through dispatch becomes a SIGNED op (W-CHAIN+W-SIGN), and so
    // OTHER op producers on this page (the ⚖ rule edit) append to the SAME chain. seal() is async (ECDSA).
    global.ERP = {
      dispatch: seam.dispatch, ctx: ctx, read: seam.read, verify: seam.verify,
      opDb: projDb,
      // T7 (W-T7-INC): the HOT paths (POS SEND, kitchen, replenish — every sale) seal + verify
      // INCREMENTALLY — O(new ops), not O(whole history) with per-op ECDSA. First verify of a session
      // is still FULL (cold cache in verifyChainIncremental); boot/import paths keep full verifyChain.
      seal: function () { return global.KernelOps.sealFrom(projDb); },                    // sign the NEW ops
      chainVerify: function () { return (global.KernelOps.verifyChainIncremental || global.KernelOps.verifyChain)(projDb); }
    };
    log('§SEAM-LIVE window.ERP published: dispatch,verify,seal,chainVerify · actor=' + ctx.actor + ' grants=' + grants.length + ' pubKey=' + (ctx.pubKey ? 'Y' : 'none'));
    // T1 (W-T1-ATTRIB, FABLE5_WRAPUP §3): PIN → employee attribution as AUDIT METADATA. cfg.attribDirectory
    // is the ORG-supplied {sha256(pin) → {emp,name}} map (ErpAttrib.makeDirectory). Identity rides ctx.attrib
    // → rich op parameters (content-signed by the DEVICE key — no per-PIN keys, no new trust root). No
    // directory / unknown PIN → REFUSED, never guessed (non-invent). Default-off: nothing changes till used.
    ctx.attrib = null;
    global.ERP.identify = function (pin) {
      var A = global.ErpAttrib;
      if (!A) { log('§T1_ATTRIB REFUSED — erp_attrib.js not loaded'); return Promise.resolve({ ok: false, why: 'erp_attrib.js not loaded' }); }
      if (!cfg.attribDirectory) { log('§T1_ATTRIB REFUSED — no attribDirectory supplied'); return Promise.resolve({ ok: false, why: 'no attribDirectory' }); }
      return A.identify(pin, cfg.attribDirectory).then(function (id) {
        if (!id) { log('§T1_ATTRIB REFUSED — unknown PIN (identity never guessed)'); return { ok: false, why: 'unknown PIN' }; }
        ctx.attrib = A.attrib(id, ctx.actor);
        log('§T1_ATTRIB identified emp=' + id.emp + ' dev=' + ctx.actor + ' (metadata only — device key still signs)');
        return { ok: true, emp: id.emp, name: id.name };
      });
    };
    global.ERP.identifyClear = function () { ctx.attrib = null; log('§T1_ATTRIB cleared'); };
    return { projDb: projDb, ctx: ctx };
  }

  // tip(projDb) → { 'DOC:Table#id': status } — the read-the-tip overlay from the projection's documents table.
  function tip(projDb) {
    var t = {};
    try { var r = projDb && projDb.exec("SELECT id, doc_status FROM documents"); if (r && r.length) r[0].values.forEach(function (row) { t[row[0]] = row[1]; }); }
    catch (e) {}
    return t;
  }
  // persist(projDb, projKey) — store the op-LOG blob so the edit survives reload (the seam's erp_kernel path
  // writes directly, bypassing KernelOps._persistToIdb, so the host persists explicitly after each ok dispatch).
  function persist(projDb, projKey) {
    try { var buf = projDb.export().buffer; return idbPutBlob(IDB, STORE, projKey, buf).then(function () { log('§KANBAN-PERSIST saved bytes=' + buf.byteLength + ' key=' + projKey); return true; }); }
    catch (e) { log('§KANBAN-PERSIST err ' + e.message); return Promise.resolve(false); }
  }

  global.KanbanHost = { publish: publish, tip: tip, persist: persist, _rows: _rows };
})(typeof window !== 'undefined' ? window : this);
