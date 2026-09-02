// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// doc_cycle_validator.js — Production-grade iDempiere Document Processing Cycle validator.
// Implements: (1) strict DocStatus FSM for M_InOut (Purchase Receipt), (2) atomic dual-schema
// SQLite sync (ERP fact_acct + BIM spatial tracking) under a single SAVEPOINT, (3) rollback
// that reverts both schemas on any mid-transaction failure.
//
// EXTRACT, DON'T INVENT: FSM action/status vocabulary from ad_docfsm.js (AD_Ref 131/135);
// ledger shape from report_overlay.js fact_acct; SAVEPOINT pattern from kernel_ops.js:319-338.
// Designed for sql.js (browser WASM) via normalized DB adapter; also runs in Node (better-sqlite3).
// Witness: W-DOC-CYCLE-VALIDATOR.
(function (root) {
  'use strict';

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // §1 — DB ADAPTER: normalises better-sqlite3 (Node) ↔ sql.js (browser WASM)
  //   better-sqlite3: synchronous .prepare(sql).get(args) / .run(args) / .all(args)
  //   sql.js: .prepare(sql).bind(args).step() / .getAsObject() / .run(sql, args)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function mkAdapter(raw) {
    // Detect sql.js: it exposes .exec() returning [{columns,values}] but .prepare() returns an
    // object with .bind()/.step()/.getAsObject() rather than better-sqlite3's Statement shape.
    var isSqlJs = typeof raw.exec === 'function' &&
      !(raw.prepare('SELECT 1').run);   // better-sqlite3 Statement has .run; sql.js Statement lacks it

    if (!isSqlJs) {
      // better-sqlite3 — just delegate
      return {
        run:  function (sql, p) { return raw.prepare(sql).run(p || []); },
        get:  function (sql, p) { return raw.prepare(sql).get(p || []); },
        all:  function (sql, p) { return raw.prepare(sql).all(p || []); },
        exec: function (sql)    { raw.exec(sql); },
        close: function ()      { raw.close && raw.close(); }
      };
    }

    // sql.js — adapt to the synchronous-style interface callers expect
    function sqlJsRun(sql, params) {
      raw.run(sql, params || []);
    }
    function sqlJsGet(sql, params) {
      var stmt = raw.prepare(sql);
      stmt.bind(params || []);
      if (!stmt.step()) { stmt.free(); return undefined; }
      var row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    function sqlJsAll(sql, params) {
      var stmt = raw.prepare(sql), rows = [];
      stmt.bind(params || []);
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    }
    return { run: sqlJsRun, get: sqlJsGet, all: sqlJsAll, exec: sqlJsRun, close: function () {} };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // §2 — SCHEMA BOOTSTRAP: minimal ERP + BIM tables for in-memory validation runs
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  var BOOTSTRAP_SQL = [
    // ERP — document header (M_InOut shape)
    'CREATE TABLE IF NOT EXISTS m_inout (' +
      'm_inout_id INTEGER PRIMARY KEY,' +
      'docstatus TEXT NOT NULL DEFAULT "DR",' +
      'movementtype TEXT NOT NULL,' +        // V+ = vendor receipt, V- = vendor return
      'c_bpartner_id INTEGER,' +
      'description TEXT,' +
      'movementdate TEXT' +
    ')',
    // ERP — document lines
    'CREATE TABLE IF NOT EXISTS m_inoutline (' +
      'm_inoutline_id INTEGER PRIMARY KEY,' +
      'm_inout_id INTEGER NOT NULL,' +
      'm_product_id INTEGER NOT NULL,' +
      'movementqty REAL NOT NULL,' +
      'm_locator_id INTEGER' +
    ')',
    // ERP — GL journal (fact_acct shape from report_overlay.js)
    'CREATE TABLE IF NOT EXISTS fact_acct (' +
      'fact_acct_id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      'ad_table_id INTEGER NOT NULL,' +      // 319 = M_InOut
      'record_id INTEGER NOT NULL,' +
      'account_id INTEGER NOT NULL,' +
      'amtacctdr REAL NOT NULL DEFAULT 0,' +
      'amtacctcr REAL NOT NULL DEFAULT 0,' +
      'postingtype TEXT NOT NULL DEFAULT "A",' +
      'c_period_id INTEGER,' +
      'c_acctschema_id INTEGER' +
    ')',
    // BIM — spatial element-to-receipt linkage (custom schema)
    'CREATE TABLE IF NOT EXISTS bim_element_status (' +
      'element_guid TEXT NOT NULL,' +
      'erp_doc_id INTEGER NOT NULL,' +        // FK → m_inout.m_inout_id
      'delivery_status TEXT NOT NULL DEFAULT "PENDING",' +  // PENDING | RECEIVED | VOIDED
      'received_qty REAL,' +
      'updated_at TEXT,' +                    // ISO timestamp (caller-supplied; no Date.now in engine)
      'PRIMARY KEY (element_guid, erp_doc_id)' +
    ')',
    // BIM — rollback audit (records any SAVEPOINT failure for offline diagnostics)
    'CREATE TABLE IF NOT EXISTS bim_tx_audit (' +
      'audit_id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      'erp_doc_id INTEGER,' +
      'action TEXT,' +
      'outcome TEXT,' +                       // COMMITTED | ROLLED_BACK
      'reason TEXT,' +
      'at TEXT' +
    ')'
  ];

  function bootstrapSchema(db) {
    BOOTSTRAP_SQL.forEach(function (ddl) { db.exec(ddl); });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // §3 — STATE MACHINE ENGINE
  //   Source: ad_docfsm.js STATUS_ACTIONS + TRANSITION (AD_Ref 131/135 iDempiere port).
  //   Scoped to M_InOut Purchase Receipt: linear forward progression DR→IP→CO, then terminal
  //   branch to VO (void) or RE (reversed). Any other attempt throws DocStateError.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // The forward sequence index. Lower index = earlier stage. VO/RE are terminal branches, not
  // on the sequence — they are reachable only from CO and carry sequence index Infinity.
  var STATUS_ORDER = { DR: 0, IP: 1, CO: 2, VO: Infinity, RE: Infinity, CL: Infinity };

  // Legal actions per status (M_InOut subset of ad_docfsm.js STATUS_ACTIONS).
  var LEGAL = {
    DR: ['CO', 'PR', 'VO'],          // DR: Prepare (→IP) or Complete directly (→CO) or Void
    IP: ['CO', 'VO'],                // IP: Complete (→CO) or Void (→VO)
    CO: ['CL', 'RC', 'RA', 'VO'],   // CO: Close / Reverse-Correct / Reverse-Accrual / Void
    VO: [],                          // terminal
    RE: [],                          // terminal
    CL: []                           // terminal
  };

  // Resulting status per (action, fromStatus). Extracted from ad_docfsm.js TRANSITION table.
  var TRANSITION = {
    PR: { DR: 'IP' },
    CO: { DR: 'CO', IP: 'CO' },
    VO: { DR: 'VO', IP: 'VO', CO: 'VO' },
    CL: { CO: 'CL' },
    RC: { CO: 'RE' },
    RA: { CO: 'RE' }
  };

  function DocStateError(msg, detail) {
    var e = new Error(msg);
    e.name = 'DocStateError';
    e.detail = detail || {};
    return e;
  }

  // getValidActions(docStatus) → string[] of legal actions from this status.
  function getValidActions(docStatus) {
    return (LEGAL[docStatus] || []).slice();
  }

  // resolveTransition(action, fromStatus) → toStatus string or throws DocStateError.
  function resolveTransition(action, fromStatus) {
    var legalSet = LEGAL[fromStatus];
    if (!legalSet) throw DocStateError(
      'Unknown docStatus "' + fromStatus + '"',
      { action: action, fromStatus: fromStatus }
    );
    if (legalSet.indexOf(action) < 0) throw DocStateError(
      'Action "' + action + '" is illegal from status "' + fromStatus + '" — valid: [' + legalSet.join(',') + ']',
      { action: action, fromStatus: fromStatus, legalActions: legalSet }
    );
    var toMap = TRANSITION[action];
    var toStatus = toMap && toMap[fromStatus];
    if (!toStatus) throw DocStateError(
      'No transition defined for action "' + action + '" from "' + fromStatus + '"',
      { action: action, fromStatus: fromStatus }
    );
    // Strict linearity: reject any forward action that skips a required intermediate stage
    // beyond what iDempiere permits. CO skips PR (DR→CO): that IS permitted. Anything that
    // would lower STATUS_ORDER (go backwards) is always rejected.
    if (STATUS_ORDER[toStatus] !== undefined && STATUS_ORDER[fromStatus] !== undefined &&
        STATUS_ORDER[toStatus] < STATUS_ORDER[fromStatus] &&
        toStatus !== 'VO' && toStatus !== 'RE') {
      throw DocStateError(
        'Backward transition "' + fromStatus + '" → "' + toStatus + '" is forbidden (strict linearity)',
        { action: action, fromStatus: fromStatus, toStatus: toStatus }
      );
    }
    return toStatus;
  }

  // advanceState(db, docId, action, opts) — loads the live docstatus from the DB, validates
  // the transition, writes the new status, and returns {from, action, to}.
  // opts.ts: ISO timestamp string for audit records (caller-supplied — no Date.now in engine).
  // Throws DocStateError on any illegal attempt; does NOT catch or suppress.
  function advanceState(db, docId, action, opts) {
    var ts = (opts && opts.ts) || '0000-00-00T00:00:00Z';
    var doc = db.get('SELECT m_inout_id, docstatus FROM m_inout WHERE m_inout_id=?', [docId]);
    if (!doc) throw DocStateError('Document not found: m_inout_id=' + docId, { docId: docId });
    var from = doc.docstatus;
    var to = resolveTransition(action, from);  // throws on illegal
    db.run('UPDATE m_inout SET docstatus=? WHERE m_inout_id=?', [to, docId]);
    return { docId: docId, from: from, action: action, to: to, ts: ts };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // §4 — ATOMIC SYNC: completeReceipt(db, docId, bimLinks, opts)
  //   bimLinks: [{elementGuid, qty}] — BIM elements delivered by this receipt
  //   opts.ts:  ISO timestamp (caller-supplied)
  //   opts.acctSchema: c_acctschema_id (default 101)
  //   opts.period:     c_period_id     (default 1)
  //
  //   Pattern source: kernel_ops.js §3 "ATOMIC COMMIT" (lines 319-338) — BEGIN / COMMIT /
  //   ROLLBACK pattern extended to SAVEPOINT for composability inside a caller transaction.
  //
  //   Writes atomically:
  //     ERP → fact_acct: AP Liability (cr) + Inventory Asset (dr) per line
  //     BIM → bim_element_status: PENDING → RECEIVED for each linked element
  //   On any failure: ROLLBACK TO sp, writes bim_tx_audit row, re-throws.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  var AD_TABLE_M_INOUT = 319;  // M_InOut.AD_Table_ID in iDempiere
  var ACCT_INVENTORY   = 501;  // P_Asset account_id (Inventory)
  var ACCT_AP_TRADE    = 211;  // V_Liability account_id (AP Trade)

  function postERPLedger(db, docId, lines, opts) {
    var schema  = (opts && opts.acctSchema) || 101;
    var period  = (opts && opts.period) || 1;
    lines.forEach(function (ln) {
      var amt = Math.abs(ln.movementqty) * (ln.unitprice || 0);
      // DR Inventory Asset
      db.run(
        'INSERT INTO fact_acct (ad_table_id,record_id,account_id,amtacctdr,amtacctcr,postingtype,c_period_id,c_acctschema_id) VALUES (?,?,?,?,?,?,?,?)',
        [AD_TABLE_M_INOUT, docId, ACCT_INVENTORY, amt, 0, 'A', period, schema]
      );
      // CR AP Liability
      db.run(
        'INSERT INTO fact_acct (ad_table_id,record_id,account_id,amtacctdr,amtacctcr,postingtype,c_period_id,c_acctschema_id) VALUES (?,?,?,?,?,?,?,?)',
        [AD_TABLE_M_INOUT, docId, ACCT_AP_TRADE, 0, amt, 'A', period, schema]
      );
    });
  }

  function postBIMSpatial(db, docId, bimLinks, ts) {
    bimLinks.forEach(function (lnk) {
      db.run(
        'INSERT OR REPLACE INTO bim_element_status (element_guid,erp_doc_id,delivery_status,received_qty,updated_at) VALUES (?,?,?,?,?)',
        [lnk.elementGuid, docId, 'RECEIVED', lnk.qty, ts]
      );
    });
  }

  // completeReceipt — the atomic gate.
  // Returns {ok, from, to, erpRows, bimRows} on success.
  // On failure: rolls back to the savepoint, returns {ok:false, reason, rolledBack:true}.
  function completeReceipt(db, docId, bimLinks, opts) {
    var ts     = (opts && opts.ts) || '0000-00-00T00:00:00Z';
    var SP     = 'sp_doc_cycle_' + docId;
    var result;

    db.exec('SAVEPOINT ' + SP);

    try {
      // ── 1. FSM gate: throws DocStateError if CO is illegal from current status ──────────────
      var transition = advanceState(db, docId, 'CO', { ts: ts });

      // ── 2. Load lines (must have at least one — MOrder.hasLines analogue) ─────────────────
      var lines = db.all(
        'SELECT m_inoutline_id, m_product_id, movementqty, m_locator_id FROM m_inoutline WHERE m_inout_id=?',
        [docId]
      );
      if (!lines || lines.length === 0) throw DocStateError(
        'Cannot complete M_InOut ' + docId + ': document has no lines',
        { docId: docId }
      );

      // ── 3. Enrich lines with unit price (default 0 if not in seed) ────────────────────────
      var enriched = lines.map(function (ln) {
        return Object.assign({ unitprice: 0 }, ln);
      });

      // ── 4. ERP ledger write ───────────────────────────────────────────────────────────────
      postERPLedger(db, docId, enriched, opts);
      var erpRows = db.get('SELECT COUNT(*) AS n FROM fact_acct WHERE record_id=?', [docId]).n;

      // ── 5. BIM spatial write ──────────────────────────────────────────────────────────────
      postBIMSpatial(db, docId, bimLinks || [], ts);
      var bimRows = db.get('SELECT COUNT(*) AS n FROM bim_element_status WHERE erp_doc_id=?', [docId]).n;

      // ── 6. COMMIT: release the savepoint (makes everything visible) ───────────────────────
      db.exec('RELEASE ' + SP);

      result = { ok: true, docId: docId, from: transition.from, to: transition.to,
                 erpRows: erpRows, bimRows: bimRows, ts: ts };

    } catch (e) {
      // ── 7. ROLLBACK: undo BOTH ERP and BIM writes atomically ─────────────────────────────
      try { db.exec('ROLLBACK TO ' + SP); } catch (ignore) {}
      try { db.exec('RELEASE ' + SP); } catch (ignore) {}

      // ── 8. Persist audit record (outside the rolled-back savepoint) ───────────────────────
      try {
        db.run(
          'INSERT INTO bim_tx_audit (erp_doc_id,action,outcome,reason,at) VALUES (?,?,?,?,?)',
          [docId, 'CO', 'ROLLED_BACK', e.message, ts]
        );
      } catch (auditErr) { /* audit must not mask the real error */ }

      result = { ok: false, docId: docId, rolledBack: true, reason: e.message,
                 isStateError: e.name === 'DocStateError', detail: e.detail };
    }

    return result;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // §5 — PUBLIC API
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  var API = {
    // Adapter + schema
    mkAdapter:       mkAdapter,
    bootstrapSchema: bootstrapSchema,
    // FSM
    getValidActions:    getValidActions,
    resolveTransition:  resolveTransition,
    advanceState:       advanceState,
    DocStateError:      DocStateError,
    // Atomic sync
    completeReceipt:    completeReceipt,
    // Internals exposed for witness assertions
    LEGAL:      LEGAL,
    TRANSITION: TRANSITION,
    STATUS_ORDER: STATUS_ORDER
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // Node / witness
  if (typeof window !== 'undefined') window.DocCycleValidator = API;           // browser / WASM
  else if (root) root.DocCycleValidator = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §6 — SELF-CONTAINED WITNESS (Node.js only)
// Run: node build/erp/doc_cycle_validator.js
// ══════════════════════════════════════════════════════════════════════════════════════════════
if (typeof require !== 'undefined' && require.main === module) {
  var Database = require('better-sqlite3');
  var V = module.exports;

  var fails = 0;
  function verdict(ok, label, detail) {
    if (!ok) fails++;
    console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : ''));
  }

  console.log('═══ W-DOC-CYCLE-VALIDATOR — strict FSM · atomic ERP+BIM sync · SAVEPOINT rollback ═══\n');

  var raw = new Database(':memory:');
  var db  = V.mkAdapter(raw);
  V.bootstrapSchema(db);

  // ── Seed: two M_InOut docs, one with lines, one without ───────────────────────────────────
  var TS = '2026-06-13T00:00:00Z';
  db.run('INSERT INTO m_inout (m_inout_id,docstatus,movementtype,description) VALUES (?,?,?,?)',
    [1001, 'DR', 'V+', 'Purchase Receipt — valid']);
  db.run('INSERT INTO m_inoutline (m_inoutline_id,m_inout_id,m_product_id,movementqty,m_locator_id) VALUES (?,?,?,?,?)',
    [1, 1001, 100, 10, 10]);

  db.run('INSERT INTO m_inout (m_inout_id,docstatus,movementtype,description) VALUES (?,?,?,?)',
    [1002, 'DR', 'V+', 'Purchase Receipt — no lines (should fail BEFORE_COMPLETE)']);

  db.run('INSERT INTO m_inout (m_inout_id,docstatus,movementtype,description) VALUES (?,?,?,?)',
    [1003, 'CO', 'V+', 'Already Completed — CO action should be illegal']);

  // ── §FSM_LEGAL: valid actions per status ──────────────────────────────────────────────────
  console.log('── §FSM_LEGAL valid-action sets ──');
  [['DR', ['CO','PR','VO']], ['IP', ['CO','VO']], ['CO', ['CL','RC','RA','VO']], ['VO', []]].forEach(function (tc) {
    var got = V.getValidActions(tc[0]).join(',');
    var exp = tc[1].join(',');
    console.log('§FSM_LEGAL status=' + tc[0] + ' actions=[' + got + ']');
    verdict(got === exp, 'status ' + tc[0] + ' → [' + exp + ']', 'got=[' + got + ']');
  });

  // ── §FSM_STRICT: illegal transition throws DocStateError ──────────────────────────────────
  console.log('\n── §FSM_STRICT illegal transitions throw ──');
  var ILLEGAL = [
    ['CO', 'CL', 'Complete from Closed (terminal)'],
    ['PR', 'CO', 'Prepare from Completed (backward)'],
    ['CO', 'VO', 'Complete from Voided (terminal)'],
    ['PR', 'VO', 'Prepare from Voided (terminal)']
  ];
  ILLEGAL.forEach(function (tc) {
    var threw = false, errName = '';
    try { V.resolveTransition(tc[0], tc[1]); } catch (e) { threw = true; errName = e.name; }
    console.log('§FSM_STRICT action=' + tc[0] + ' from=' + tc[1] + ' threw=' + threw + ' errName=' + errName);
    verdict(threw && errName === 'DocStateError', tc[2] + ' throws DocStateError', 'threw=' + threw + ' errName=' + errName);
  });

  // ── §FSM_FORWARD: valid linear progression DR→IP→CO ──────────────────────────────────────
  console.log('\n── §FSM_FORWARD progression ──');
  db.run('INSERT INTO m_inout (m_inout_id,docstatus,movementtype,description) VALUES (?,?,?,?)',
    [1004, 'DR', 'V+', 'Progression test']);
  db.run('INSERT INTO m_inoutline (m_inoutline_id,m_inout_id,m_product_id,movementqty) VALUES (?,?,?,?)',
    [10, 1004, 200, 5]);

  var t1 = V.advanceState(db, 1004, 'PR', { ts: TS });
  console.log('§FSM_FORWARD DR→PR→IP: from=' + t1.from + ' to=' + t1.to);
  verdict(t1.from === 'DR' && t1.to === 'IP', 'PR advances DR→IP', 'from=' + t1.from + ' to=' + t1.to);

  var r1 = V.completeReceipt(db, 1004, [{ elementGuid: 'BIM-ELEM-A', qty: 5 }], { ts: TS });
  console.log('§FSM_FORWARD IP→CO: from=' + r1.from + ' to=' + r1.to + ' ok=' + r1.ok + ' erpRows=' + r1.erpRows + ' bimRows=' + r1.bimRows);
  verdict(r1.ok && r1.from === 'IP' && r1.to === 'CO', 'CO advances IP→CO', 'from=' + r1.from + ' to=' + r1.to);

  // ── §ATOMIC_SYNC: ERP ledger + BIM spatial written under one SAVEPOINT ────────────────────
  console.log('\n── §ATOMIC_SYNC ERP+BIM written atomically ──');
  var bimLinks = [
    { elementGuid: 'GUID-WALL-001', qty: 3 },
    { elementGuid: 'GUID-BEAM-002', qty: 7 }
  ];
  var r2 = V.completeReceipt(db, 1001, bimLinks, { ts: TS, acctSchema: 101, period: 1 });
  var factRowsAfter = db.get('SELECT COUNT(*) AS n FROM fact_acct WHERE record_id=1001').n;
  var bimRowsAfter  = db.get('SELECT COUNT(*) AS n FROM bim_element_status WHERE erp_doc_id=1001').n;
  var drCheck       = db.get('SELECT SUM(amtacctdr) AS d FROM fact_acct WHERE record_id=1001 AND account_id=501').d || 0;
  var crCheck       = db.get('SELECT SUM(amtacctcr) AS c FROM fact_acct WHERE record_id=1001 AND account_id=211').c || 0;

  console.log('§ATOMIC_SYNC ok=' + r2.ok + ' erpRows=' + factRowsAfter + ' bimRows=' + bimRowsAfter +
    ' DR_Inventory=' + drCheck + ' CR_AP=' + crCheck);
  verdict(r2.ok, 'completeReceipt returns ok=true', 'ok=' + r2.ok + ' reason=' + (r2.reason || 'none'));
  verdict(factRowsAfter === 2, 'ERP: 2 fact_acct rows (1 DR Inventory + 1 CR AP)', 'n=' + factRowsAfter);
  verdict(bimRowsAfter === 2, 'BIM: 2 bim_element_status rows (one per element)', 'n=' + bimRowsAfter);
  verdict(drCheck === crCheck, 'ERP ledger balances: ΣDR == ΣCR (trial balance check)', 'dr=' + drCheck + ' cr=' + crCheck);

  var bimStatus = db.get('SELECT delivery_status FROM bim_element_status WHERE element_guid=? AND erp_doc_id=1001',
    ['GUID-WALL-001']);
  verdict(bimStatus && bimStatus.delivery_status === 'RECEIVED',
    'BIM element delivery_status = RECEIVED after CO', 'got=' + (bimStatus && bimStatus.delivery_status));

  // ── §ROLLBACK: no-lines doc → mid-transaction failure → zero rows committed ───────────────
  console.log('\n── §ROLLBACK mid-transaction failure reverts both schemas ──');
  var factBefore = db.get('SELECT COUNT(*) AS n FROM fact_acct WHERE record_id=1002').n;
  var bimBefore  = db.get('SELECT COUNT(*) AS n FROM bim_element_status WHERE erp_doc_id=1002').n;

  var r3 = V.completeReceipt(db, 1002, [{ elementGuid: 'GUID-NO-LINE', qty: 1 }], { ts: TS });
  var factAfter  = db.get('SELECT COUNT(*) AS n FROM fact_acct WHERE record_id=1002').n;
  var bimAfter   = db.get('SELECT COUNT(*) AS n FROM bim_element_status WHERE erp_doc_id=1002').n;
  var auditRow   = db.get('SELECT outcome,reason FROM bim_tx_audit WHERE erp_doc_id=1002');
  var docStatus  = db.get('SELECT docstatus FROM m_inout WHERE m_inout_id=1002').docstatus;

  console.log('§ROLLBACK ok=' + r3.ok + ' rolledBack=' + r3.rolledBack + ' factDelta=' + (factAfter - factBefore) +
    ' bimDelta=' + (bimAfter - bimBefore) + ' docstatus=' + docStatus + ' auditOutcome=' + (auditRow && auditRow.outcome));
  verdict(!r3.ok && r3.rolledBack, 'completeReceipt reports ok=false + rolledBack=true', 'ok=' + r3.ok + ' rb=' + r3.rolledBack);
  verdict(factAfter - factBefore === 0, 'ERP: zero fact_acct rows committed (rollback effective)', 'delta=' + (factAfter - factBefore));
  verdict(bimAfter - bimBefore === 0,  'BIM: zero bim_element_status rows committed (rollback effective)', 'delta=' + (bimAfter - bimBefore));
  verdict(docStatus === 'DR', 'docstatus reverted to DR (FSM write rolled back)', 'got=' + docStatus);
  verdict(auditRow && auditRow.outcome === 'ROLLED_BACK', 'bim_tx_audit records ROLLED_BACK outcome', 'outcome=' + (auditRow && auditRow.outcome));

  // ── §FALSIFIER: double-complete is rejected by FSM, not by rollback ───────────────────────
  console.log('\n── §FALSIFIER already-CO doc cannot be Completed again ──');
  var r4 = V.completeReceipt(db, 1003, [], { ts: TS });
  console.log('§FALSIFIER ok=' + r4.ok + ' isStateError=' + r4.isStateError + ' reason=' + r4.reason);
  verdict(!r4.ok && r4.isStateError, 'CO→CO is rejected as DocStateError (not a DB error)', 'isStateError=' + r4.isStateError);

  // ── Summary ───────────────────────────────────────────────────────────────────────────────
  db.close();
  console.log('\n' + (fails === 0 ? '🟢 W-DOC-CYCLE-VALIDATOR PASS' : '🔴 W-DOC-CYCLE-VALIDATOR FAIL (' + fails + ')') +
    ' — strict FSM · atomic ERP+BIM SAVEPOINT · rollback reverts zero rows · DocStateError on illegal action.');
  process.exit(fails === 0 ? 0 : 1);
}
