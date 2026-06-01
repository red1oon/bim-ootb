// kernel_ops.js — Implementing 2D_029 §2 — Witness: W-2D29
// First transactional write path for the BIM Modeller kernel-op log.
// See: docs/BIM_Modeller_OOTB.md §The Modelling Inversion
(function () {
  'use strict';

  var TABLE_SQL =
    'CREATE TABLE IF NOT EXISTS kernel_ops (' +
    '  id INTEGER PRIMARY KEY,' +       // local total-order — W-CHAIN seals/verifies in id order
    '  op_uuid TEXT,' +                 // G-IDENTITY (§0.21): edge-minted cross-device id; NOT the PK
    '  timestamp INTEGER NOT NULL,' +
    '  op_type TEXT NOT NULL,' +
    '  parameters TEXT NOT NULL,' +
    '  input_guids TEXT,' +
    '  output_guid TEXT,' +
    '  undone INTEGER DEFAULT 0,' +
    '  prev_hash TEXT,' +   // W-CHAIN: tip this op chains onto (NULL until sealed)
    '  op_hash TEXT,' +     // W-CHAIN: SHA-256(prev_hash | canonical(op))
    '  sig TEXT' +          // W-SIGN: edge signature over op_hash (NULL unless a signer is set)
    ')';
  var IDX_TYPE_SQL =
    'CREATE INDEX IF NOT EXISTS idx_kernel_ops_type ON kernel_ops(op_type)';
  var IDX_UNDONE_SQL =
    'CREATE INDEX IF NOT EXISTS idx_kernel_ops_undone ON kernel_ops(undone, id)';

  var _tableCreated = false;  // simple flag — one DB per session

  function ensureTable(db) {
    if (_tableCreated) return;
    try {
      db.run(TABLE_SQL);
      db.run(IDX_TYPE_SQL);
      db.run(IDX_UNDONE_SQL);
      // §2.3: add user_tag column (idempotent — ALTER fails silently if exists)
      try { db.run("ALTER TABLE kernel_ops ADD COLUMN user_tag TEXT DEFAULT 'local'"); }
      catch (ignore) { /* column already exists */ }
      // G-IDENTITY (§0.21): op_uuid identity column on pre-existing DBs (idempotent)
      try { db.run("ALTER TABLE kernel_ops ADD COLUMN op_uuid TEXT"); } catch (ignore) {}
      // W-CHAIN/W-SIGN: chain + signature columns on pre-existing DBs (idempotent)
      try { db.run("ALTER TABLE kernel_ops ADD COLUMN prev_hash TEXT"); } catch (ignore) {}
      try { db.run("ALTER TABLE kernel_ops ADD COLUMN op_hash TEXT"); }  catch (ignore) {}
      try { db.run("ALTER TABLE kernel_ops ADD COLUMN sig TEXT"); }      catch (ignore) {}
      _tableCreated = true;
    } catch (e) {
      console.log('§KERNEL_OP ensureTable ERROR: ' + e.message);
    }
  }

  /**
   * Commit an operation to the kernel_ops log.
   * @param {Object} db       sql.js database
   * @param {string} opType   GRID_MOVE | VIEW_FILTER | GRID_DETECT
   * @param {Object} params   operation parameters (serialised as JSON)
   * @param {Array}  [inputGuids] affected element GUIDs
   * @param {string} [outputGuid] created/modified entity ID
   * @returns {number} op id
   */
  function commitOp(db, opType, params, inputGuids, outputGuid, opUuid) {
    ensureTable(db);
    // G-IDENTITY (§0.21 D1/D4): identity is an edge-minted INPUT, recorded — never recomputed on
    // replay (replayOps re-reads it). Honour a caller-supplied op_uuid verbatim (the New-doc seam);
    // otherwise mint one here at COMMIT time. op_uuid is cross-device clash-free, unlike the local
    // `id` rowid which collides 1,2,3… across devices. It is NOT part of _canonical, so W-CHAIN's
    // hash stays byte-identical (the chain still totals over `id`).
    var uuid = opUuid ||
               ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null);
    db.run(
      'INSERT INTO kernel_ops (op_uuid, timestamp, op_type, parameters, input_guids, output_guid) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
      [uuid, Date.now(), opType, JSON.stringify(params),
       inputGuids ? JSON.stringify(inputGuids) : null,
       outputGuid || null]
    );
    var r = db.exec('SELECT last_insert_rowid()');
    var opId = r[0].values[0][0];
    console.log('§KERNEL_OP committed id=' + opId + ' uuid=' + (uuid ? uuid.slice(0, 8) : 'null') +
                ' type=' + opType + ' params=' + JSON.stringify(params));
    // S243 §3.7: persist modified DB back to IndexedDB so refresh survives
    _persistToIdb(db);
    return opId;
  }

  // Debounced IDB write — avoids hammering IndexedDB on rapid ops (e.g. drag).
  // The at-rest copy is hash-chain SEALED first (W-CHAIN) so a persisted log is tamper-evident.
  // Sealing happens HERE (the persistence seam, business-time) — never on the hot commit path,
  // so the 0ms UI is untouched. See docs/DistributedERP.md §0 (the two-domain split).
  var _persistTimer = null;
  function _persistToIdb(db) {
    clearTimeout(_persistTimer);
    _persistTimer = setTimeout(function() {
      sealChain(db).then(function() {
        try {
          var dbUrl = window.APP && APP.DB_URL;
          if (!dbUrl) return;
          var buf = db.export().buffer;
          var req = indexedDB.open('bim_ootb_cache', 1);
          req.onupgradeneeded = function() { req.result.createObjectStore('dbs'); };
          req.onsuccess = function() {
            var tx = req.result.transaction('dbs', 'readwrite');
            tx.objectStore('dbs').put(buf, dbUrl);
            console.log('§KRN_PERSIST url=' + dbUrl + ' size=' + (buf.byteLength/1024).toFixed(0) + 'KB');
          };
        } catch(e) { console.warn('§KRN_PERSIST_ERR', e); }
      }).catch(function(e) { console.warn('§KRN_SEAL_ERR', e); });
    }, 2000);
  }

  // ── W-CHAIN / W-SIGN — tamper-evident, optionally-signed op-log ──────────────
  // Proven in scripts/poc_chain.js (W-CHAIN) + scripts/poc_sign.js (W-SIGN). The hash chain
  // is DETERMINISTIC (integrity + order); the signature attests OVER op_hash (authenticity) and
  // is NOT part of the hash, so the chain stays byte-identical across devices while sigs vary.
  var GENESIS = '0'.repeat(64);
  var _signer = null;   // optional { sign: async(hashHex)->sigHex, verify: async(hashHex,sigHex)->bool }

  // Set an edge signer to turn on W-SIGN. Key custody lives at the edge (the device/merchant),
  // never in this module. Leave unset for W-CHAIN-only (tamper-evidence without signatures).
  function setSigner(signer) { _signer = signer; }

  function _canonical(op) {   // stable serialisation — every mutating field, fixed order
    return op.id + '|' + op.timestamp + '|' + op.op_type + '|' +
           (op.parameters || '') + '|' + (op.input_guids || '') + '|' + (op.output_guid || '');
  }

  async function _sha256(str) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    throw new Error('crypto.subtle unavailable — cannot seal chain');
  }

  // sealChain — (re)compute prev_hash/op_hash for the WHOLE log in id order, idempotently.
  // Full recompute (not incremental) because compact() may delete/collapse ops; re-sealing after
  // compaction keeps the chain correct over the current log. Signs ops lacking a sig if a signer is set.
  async function sealChain(db) {
    ensureTable(db);
    var r = db.exec('SELECT id,timestamp,op_type,parameters,input_guids,output_guid,sig FROM kernel_ops ORDER BY id');
    if (!r.length) return { sealed: 0, tip: GENESIS };
    var rows = r[0].values, prev = GENESIS, sealed = 0;
    for (var i = 0; i < rows.length; i++) {
      var op = { id: rows[i][0], timestamp: rows[i][1], op_type: rows[i][2],
                 parameters: rows[i][3], input_guids: rows[i][4], output_guid: rows[i][5] };
      var sig = rows[i][6];
      var h = await _sha256(prev + '|' + _canonical(op));
      if (_signer && !sig) { try { sig = await _signer.sign(h); } catch (e) { sig = null; } }
      db.run('UPDATE kernel_ops SET prev_hash=?, op_hash=?, sig=? WHERE id=?', [prev, h, sig || null, op.id]);
      prev = h; sealed++;
    }
    console.log('§KRN_CHAIN sealed=' + sealed + ' tip=' + prev.slice(0, 12) + '…' + (_signer ? ' signed' : ''));
    return { sealed: sealed, tip: prev };
  }

  // verifyChain — walk the ordered log, recompute each op_hash, check the prev_hash link, and (if a
  // signer is set) the signature. Returns {ok, len, tip} or {ok:false, brokeAt, why} — proving
  // "tamper at op N" exactly as scripts/poc_chain.js does.
  async function verifyChain(db) {
    ensureTable(db);
    var r = db.exec('SELECT id,timestamp,op_type,parameters,input_guids,output_guid,prev_hash,op_hash,sig FROM kernel_ops ORDER BY id');
    if (!r.length) return { ok: true, len: 0, tip: GENESIS };
    var rows = r[0].values, prev = GENESIS;
    for (var i = 0; i < rows.length; i++) {
      var op = { id: rows[i][0], timestamp: rows[i][1], op_type: rows[i][2],
                 parameters: rows[i][3], input_guids: rows[i][4], output_guid: rows[i][5] };
      var storedPrev = rows[i][6], storedHash = rows[i][7], sig = rows[i][8];
      if (storedHash == null) { console.log('§KRN_CHAIN verify unsealed at id=' + op.id); return { ok: false, brokeAt: op.id, why: 'unsealed' }; }
      if (storedPrev !== prev) return { ok: false, brokeAt: op.id, why: 'prev_hash link' };
      var h = await _sha256(prev + '|' + _canonical(op));
      if (h !== storedHash) { console.log('§KRN_CHAIN tamper at id=' + op.id); return { ok: false, brokeAt: op.id, why: 'payload altered' }; }
      if (_signer && !(await _signer.verify(storedHash, sig))) return { ok: false, brokeAt: op.id, why: 'signature' };
      prev = h;
    }
    console.log('§KRN_CHAIN verify OK len=' + rows.length + ' tip=' + prev.slice(0, 12) + '…');
    return { ok: true, len: rows.length, tip: prev };
  }

  /**
   * Undo: mark the most recent non-undone op as undone.
   * @returns {Object|null} the undone op's parameters, or null
   */
  function undoOp(db) {
    ensureTable(db);
    var r = db.exec(
      'SELECT id, op_type, parameters FROM kernel_ops ' +
      'WHERE undone = 0 ORDER BY id DESC LIMIT 1'
    );
    if (!r.length || !r[0].values.length) return null;
    var row = r[0].values[0];
    db.run('UPDATE kernel_ops SET undone = 1 WHERE id = ?', [row[0]]);
    console.log('§KERNEL_OP undo id=' + row[0] + ' type=' + row[1]);
    return { id: row[0], op_type: row[1], parameters: JSON.parse(row[2]) };
  }

  /**
   * Redo: clear undone flag on the earliest undone op.
   * @returns {Object|null} the redone op's parameters, or null
   */
  function redoOp(db) {
    ensureTable(db);
    var r = db.exec(
      'SELECT id, op_type, parameters FROM kernel_ops ' +
      'WHERE undone = 1 ORDER BY id ASC LIMIT 1'
    );
    if (!r.length || !r[0].values.length) return null;
    var row = r[0].values[0];
    db.run('UPDATE kernel_ops SET undone = 0 WHERE id = ?', [row[0]]);
    console.log('§KERNEL_OP redo id=' + row[0] + ' type=' + row[1]);
    return { id: row[0], op_type: row[1], parameters: JSON.parse(row[2]) };
  }

  /**
   * Replay all non-undone ops, optionally filtered by type.
   * Used on page reload to restore state from the log.
   * @returns {Array} array of { id, op_type, parameters }
   */
  function replayOps(db, opType) {
    ensureTable(db);
    // G-IDENTITY (§0.21 D2/D3): replay RE-READS the recorded op_uuid — identity is never recomputed.
    var sql = 'SELECT id, op_uuid, op_type, parameters FROM kernel_ops WHERE undone = 0';
    var args = [];
    if (opType) { sql += ' AND op_type = ?'; args.push(opType); }
    sql += ' ORDER BY id';
    var r = db.exec(sql, args);
    if (!r.length) return [];
    var ops = r[0].values.map(function (row) {
      return { id: row[0], op_uuid: row[1], op_type: row[2], parameters: JSON.parse(row[3]) };
    });
    console.log('§KERNEL_OP replay type=' + (opType || 'ALL') + ' count=' + ops.length);
    return ops;
  }

  /**
   * Compact the kernel_ops log:
   *  1. Collapse consecutive GRID_MOVE ops on the same label → keep last position only.
   *  2. Delete all undone ops (undone=1) — they'll never be redone after page reload.
   *  3. Keep only ops from the two most recent SESSION_START boundaries.
   *
   * Safe to call on every page load or before download/export.
   * @param {Object} db — sql.js database
   * @returns {{ collapsed: number, pruned: number, total: number }}
   */
  function compact(db) {
    ensureTable(db);
    var collapsed = 0, pruned = 0;

    // 1. Prune undone ops
    try {
      var undoneRes = db.exec('SELECT COUNT(*) FROM kernel_ops WHERE undone = 1');
      pruned = (undoneRes.length && undoneRes[0].values.length) ? Number(undoneRes[0].values[0][0]) : 0;
      if (pruned > 0) db.run('DELETE FROM kernel_ops WHERE undone = 1');
    } catch (e) { console.log('§KERNEL_OP compact prune error: ' + e.message); }

    // 2. Collapse consecutive GRID_MOVE on same label — keep the latest only.
    //    "Consecutive" = same label with no other op type between them.
    try {
      var moves = db.exec(
        "SELECT id, parameters FROM kernel_ops WHERE op_type = 'GRID_MOVE' ORDER BY id"
      );
      if (moves.length && moves[0].values.length > 1) {
        var rows = moves[0].values;
        var deleteIds = [];
        for (var i = 0; i < rows.length - 1; i++) {
          var pCurr = JSON.parse(rows[i][1]);
          var pNext = JSON.parse(rows[i + 1][1]);
          // Same label + same axis → intermediate drag, drop it
          if (pCurr.label === pNext.label && pCurr.axis === pNext.axis) {
            deleteIds.push(rows[i][0]);
          }
        }
        for (var di = 0; di < deleteIds.length; di++) {
          db.run('DELETE FROM kernel_ops WHERE id = ?', [deleteIds[di]]);
        }
        collapsed = deleteIds.length;
      }
    } catch (e) { console.log('§KERNEL_OP compact collapse error: ' + e.message); }

    // 3. Keep only ops after the second-to-last SESSION_START (two sessions of history).
    try {
      var sessions = db.exec(
        "SELECT id FROM kernel_ops WHERE op_type = 'SESSION_START' ORDER BY id DESC LIMIT 2"
      );
      if (sessions.length && sessions[0].values.length >= 2) {
        var cutoffId = Number(sessions[0].values[1][0]);
        var oldRes = db.exec('SELECT COUNT(*) FROM kernel_ops WHERE id < ' + cutoffId);
        var oldCount = (oldRes.length && oldRes[0].values.length) ? Number(oldRes[0].values[0][0]) : 0;
        if (oldCount > 0) {
          db.run('DELETE FROM kernel_ops WHERE id < ' + cutoffId);
          pruned += oldCount;
        }
      }
    } catch (e) { console.log('§KERNEL_OP compact session error: ' + e.message); }

    var totalRes = db.exec('SELECT COUNT(*) FROM kernel_ops');
    var total = (totalRes.length && totalRes[0].values.length) ? Number(totalRes[0].values[0][0]) : 0;

    console.log('§KERNEL_OP compact collapsed=' + collapsed + ' pruned=' + pruned + ' remaining=' + total);
    return { collapsed: collapsed, pruned: pruned, total: total };
  }

  /**
   * Mark a session boundary. Call on page load before any other ops.
   * compact() uses these markers to prune old sessions.
   */
  function sessionStart(db) {
    return commitOp(db, 'SESSION_START', { ts: new Date().toISOString() });
  }

  window.KernelOps = {
    ensureTable:  ensureTable,
    commitOp:     commitOp,
    undoOp:       undoOp,
    redoOp:       redoOp,
    replayOps:    replayOps,
    compact:      compact,
    sessionStart: sessionStart,
    sealChain:    sealChain,     // W-CHAIN: (re)seal the log's hash chain (async)
    verifyChain:  verifyChain,   // W-CHAIN/W-SIGN: prove tamper-evidence (async)
    setSigner:    setSigner      // W-SIGN: install an edge signer (opt-in)
  };

  console.log('§KERNEL_OPS_LOADED v6 (W-CHAIN/W-SIGN/G-IDENTITY)');
})();
