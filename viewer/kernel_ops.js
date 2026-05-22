// kernel_ops.js — Implementing 2D_029 §2 — Witness: W-2D29
// First transactional write path for the BIM Modeller kernel-op log.
// See: docs/BIM_Modeller_OOTB.md §The Modelling Inversion
(function () {
  'use strict';

  var TABLE_SQL =
    'CREATE TABLE IF NOT EXISTS kernel_ops (' +
    '  id INTEGER PRIMARY KEY,' +
    '  timestamp INTEGER NOT NULL,' +
    '  op_type TEXT NOT NULL,' +
    '  parameters TEXT NOT NULL,' +
    '  input_guids TEXT,' +
    '  output_guid TEXT,' +
    '  undone INTEGER DEFAULT 0' +
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
  function commitOp(db, opType, params, inputGuids, outputGuid) {
    ensureTable(db);
    db.run(
      'INSERT INTO kernel_ops (timestamp, op_type, parameters, input_guids, output_guid) ' +
      'VALUES (?, ?, ?, ?, ?)',
      [Date.now(), opType, JSON.stringify(params),
       inputGuids ? JSON.stringify(inputGuids) : null,
       outputGuid || null]
    );
    var r = db.exec('SELECT last_insert_rowid()');
    var opId = r[0].values[0][0];
    console.log('§KERNEL_OP committed id=' + opId + ' type=' + opType +
                ' params=' + JSON.stringify(params));
    // S243 §3.7: persist modified DB back to IndexedDB so refresh survives
    _persistToIdb(db);
    return opId;
  }

  // Debounced IDB write — avoids hammering IndexedDB on rapid ops (e.g. drag)
  var _persistTimer = null;
  function _persistToIdb(db) {
    clearTimeout(_persistTimer);
    _persistTimer = setTimeout(function() {
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
    }, 2000);
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
    var sql = 'SELECT id, op_type, parameters FROM kernel_ops WHERE undone = 0';
    var args = [];
    if (opType) { sql += ' AND op_type = ?'; args.push(opType); }
    sql += ' ORDER BY id';
    var r = db.exec(sql, args);
    if (!r.length) return [];
    var ops = r[0].values.map(function (row) {
      return { id: row[0], op_type: row[1], parameters: JSON.parse(row[2]) };
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
    sessionStart: sessionStart
  };

  console.log('§KERNEL_OPS_LOADED v4');
})();
