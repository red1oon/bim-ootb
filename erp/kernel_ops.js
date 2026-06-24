// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
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
    '  op_type TEXT NOT NULL,' +       // GRID_MOVE | VIEW_FILTER | … | PLUGIN_INSTALL | PLUGIN_UNINSTALL | PLUGIN_START | PLUGIN_STOP
    //   PLUGIN_* (W-PLUGIN, prompts/PLUGIN_SYSTEM_LANE.md §Phase B): Fold-Engine bundle lifecycle audit ops.
    //   parameters = JSON { id, version, manifestUrl }. ADDITIVE — no schema change, op_type is free TEXT.
    '  parameters TEXT NOT NULL,' +
    '  input_guids TEXT,' +
    '  output_guid TEXT,' +
    '  undone INTEGER DEFAULT 0,' +
    '  prev_hash TEXT,' +   // W-CHAIN: tip this op chains onto (NULL until sealed)
    '  op_hash TEXT,' +     // W-CHAIN: SHA-256(prev_hash | canonical(op))
    '  sig TEXT,' +         // W-SIGN: edge signature over op_hash (NULL unless a signer is set)
    '  gid TEXT,' +         // §I-K (W-OPGROUP): group id — every op of an op-group shares one gid (NULL for single ops)
    '  branch_id TEXT' +    // BLUE FUTURE (W-BLUE-FUTURE): speculative-branch tag. NULL = official. NOT in _canonical
    ')';                    //   → op_hash is branch-independent, so ACCEPT clears branch_id without rehashing.
  var IDX_TYPE_SQL =
    'CREATE INDEX IF NOT EXISTS idx_kernel_ops_type ON kernel_ops(op_type)';
  var IDX_UNDONE_SQL =
    'CREATE INDEX IF NOT EXISTS idx_kernel_ops_undone ON kernel_ops(undone, id)';

  // §I-K (W-OPGROUP): memoize per-db, not module-global. The browser uses ONE db (unchanged: created
  // once), but commitGroup's witness + any multi-db caller must each get their own table — a module-wide
  // flag would skip table creation on a second db. Additive robustness; single-db behaviour identical.
  function ensureTable(db) {
    if (db.__kernelOpsTableCreated) return;
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
      // §I-K (W-OPGROUP): group-id column on pre-existing DBs (idempotent, additive)
      try { db.run("ALTER TABLE kernel_ops ADD COLUMN gid TEXT"); }      catch (ignore) {}
      // BLUE FUTURE (W-BLUE-FUTURE): speculative-branch column on pre-existing DBs (idempotent, additive)
      try { db.run("ALTER TABLE kernel_ops ADD COLUMN branch_id TEXT"); } catch (ignore) {}
      try { db.run("CREATE INDEX IF NOT EXISTS idx_kernel_ops_branch ON kernel_ops(branch_id, id)"); } catch (ignore) {}
      db.__kernelOpsTableCreated = true;
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
  function commitOp(db, opType, params, inputGuids, outputGuid, opUuid, ts) {
    ensureTable(db);
    // G-IDENTITY (§0.21 D1/D4): identity is an edge-minted INPUT, recorded — never recomputed on
    // replay (replayOps re-reads it). Honour a caller-supplied op_uuid verbatim (the New-doc seam);
    // otherwise mint one here at COMMIT time. op_uuid is cross-device clash-free, unlike the local
    // `id` rowid which collides 1,2,3… across devices. It is NOT part of _canonical, so W-CHAIN's
    // hash stays byte-identical (the chain still totals over `id`).
    var uuid = opUuid ||
               ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null);
    // DETERMINISM (ERP.md §0.16): timestamp IS part of _canonical, so an op path that must replay
    // byte-stable supplies its own deterministic `ts` (no Date.now). Default keeps existing callers
    // (the BIM grid log) unchanged. Passed-in ts → reproducible op_hash across a rebuild.
    // Forward-reconciled from the app's erp/ copy on the §INTEG-COLLAPSE (2026-06-08); the substrate's
    // byte-stable period-close replay depends on it. See prompts/ERP_SUBSTRATE_INTEGRATION.md §ARCHIVE.
    var stamp = (ts != null) ? ts : Date.now();
    var vParams = _stamp(opType, params);                  // D2: brand schema version into params (signed) if wired
    db.run(
      'INSERT INTO kernel_ops (op_uuid, timestamp, op_type, parameters, input_guids, output_guid) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
      [uuid, stamp, opType, JSON.stringify(vParams),
       inputGuids ? JSON.stringify(inputGuids) : null,
       outputGuid || null]
    );
    var r = db.exec('SELECT last_insert_rowid()');
    var opId = r[0].values[0][0];
    console.log('§KERNEL_OP committed id=' + opId + ' uuid=' + (uuid ? uuid.slice(0, 8) : 'null') +
                ' type=' + opType + ' params=' + JSON.stringify(vParams));
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

  // D2 (prompts/D2_REMEDY_VERSIONING.md): an optional version-stamper that brands every NEW op's params with
  // its schema version BEFORE hashing — so the version is a signed fact. fn(opType, params) -> params'. Wired
  // by ERP.OpUpcaster.install(KernelOps) at app boot; UNSET = legacy behaviour (ops carry no _sv = version 1).
  // The kernel stays decoupled — it never imports the upcaster, just calls this hook if installed.
  var _versionStamp = null;
  function setVersionStamper(fn) { _versionStamp = fn; }
  function _stamp(opType, params) {
    return (_versionStamp && params && typeof params === 'object') ? _versionStamp(opType, params) : params;
  }

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

  // Implementing ENGINE_FULL_ERP_ISSUES.md §I-K — Witness: W-OPGROUP
  // sealFrom — incremental seal: seal ONLY the rows from the last sealed tip forward, never the whole
  // log. Already-sealed rows (carrying op_hash) are immutable by the chain's own guarantee (§I-K SPEC
  // "Sealed ONCE per group"), so they are not re-read or re-hashed. This is the I-D flattening win:
  // per-group seal cost becomes O(N-in-group) instead of O(log-length). sealChain (full re-seal) stays
  // for post-compaction correctness (compact() may delete/collapse rows).
  // _lastSealedTip(db) → { id, hash } of the highest already-sealed row, or { id:0, hash:GENESIS }.
  function _lastSealedTip(db) {
    var r = db.exec('SELECT id, op_hash FROM kernel_ops WHERE op_hash IS NOT NULL ORDER BY id DESC LIMIT 1');
    if (!r.length || !r[0].values.length) return { id: 0, hash: GENESIS };
    return { id: r[0].values[0][0], hash: r[0].values[0][1] };
  }
  async function sealFrom(db, fromTip) {
    ensureTable(db);
    var tip = fromTip || _lastSealedTip(db);
    var r = db.exec('SELECT id,timestamp,op_type,parameters,input_guids,output_guid,sig FROM kernel_ops WHERE id > ' + tip.id + ' ORDER BY id');
    if (!r.length) { return { sealed: 0, tip: tip.hash, fromId: tip.id }; }
    var rows = r[0].values, prev = tip.hash, sealed = 0;
    for (var i = 0; i < rows.length; i++) {
      var op = { id: rows[i][0], timestamp: rows[i][1], op_type: rows[i][2],
                 parameters: rows[i][3], input_guids: rows[i][4], output_guid: rows[i][5] };
      var sig = rows[i][6];
      var h = await _sha256(prev + '|' + _canonical(op));
      if (_signer && !sig) { try { sig = await _signer.sign(h); } catch (e) { sig = null; } }
      db.run('UPDATE kernel_ops SET prev_hash=?, op_hash=?, sig=? WHERE id=?', [prev, h, sig || null, op.id]);
      prev = h; sealed++;
    }
    console.log('§KRN_SEAL_FROM fromId=' + tip.id + ' sealed=' + sealed + ' tip=' + prev.slice(0, 12) + '…' + (_signer ? ' signed' : ''));
    return { sealed: sealed, tip: prev, fromId: tip.id };
  }

  // Implementing ENGINE_FULL_ERP_ISSUES.md §I-J — Witness: W-RATE-INPUT
  // assertRateAsInput — the currency-determinism guard (DistributedERP.md §7 / §9-E).
  //
  // SPEC (§I-J): a conversion rate read at REPLAY time is THE canonical nondeterminism breaker — two
  // replays diverge → replay-hash != live-hash → merge breaks. RULE (non-invent + §7): the rate in force
  // at the edge MUST be captured as an op INPUT (frozen into the op), never looked up later — same
  // discipline as UUID/timestamp/scan. Until that is wired, multi-currency writes stay DISABLED.
  //
  // CONVENTION — an op is "conversion-bearing" iff its params declare a converted amount via EITHER:
  //   (a) params.convertedAmt is present (not null/undefined), OR
  //   (b) params.fx is an object (an explicit FX block).
  // A conversion-bearing op MUST carry the recorded conversion INPUTS that make it replayable:
  //   rate, rateDate, rateSource — sourced from params.fx.{rate,rateDate,rateSource} when params.fx is an
  //   object, else params.{rate,rateDate,rateSource}. Missing any → REJECT (the multi-currency-disabled
  //   rule, enforced). Single-currency ops (no conversion-bearing field) PASS untouched — zero behaviour
  //   change today (the POC is single-currency; nothing is conversion-bearing).
  //
  // NON-INVENT: this guard NEVER fabricates a rate and NEVER looks one up. It only enforces that a
  // conversion the caller already declared carries its own inputs. Returns { ok, conversionBearing, reason? }.
  // PURE: no Date.now / Math.random / db / network — deterministic, safe in the hashed write path.
  function assertRateAsInput(params) {
    var p = params;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = null; } }
    if (!p || typeof p !== 'object') return { ok: true, conversionBearing: false };
    var hasFxBlock = p.fx != null && typeof p.fx === 'object';
    var hasConvertedAmt = p.convertedAmt != null;
    var conversionBearing = hasFxBlock || hasConvertedAmt;
    if (!conversionBearing) return { ok: true, conversionBearing: false };
    // read the recorded inputs from the fx block if present, else top-level params.
    var src = hasFxBlock ? p.fx : p;
    var missing = [];
    if (src.rate == null)       missing.push('rate');
    if (src.rateDate == null)   missing.push('rateDate');
    if (src.rateSource == null) missing.push('rateSource');
    if (missing.length) {
      return { ok: false, conversionBearing: true,
               reason: 'conversion-bearing op missing recorded rate input(s): ' + missing.join(',') +
                       ' — multi-currency stays DISABLED until rate-as-input is provided (§I-J)' };
    }
    return { ok: true, conversionBearing: true, rate: src.rate, rateDate: src.rateDate, rateSource: src.rateSource };
  }

  // Implementing ENGINE_FULL_ERP_ISSUES.md §I-K — Witness: W-OPGROUP
  // commitGroup — the op-group atomic unit (ERP.md §18.8). N ops fold WHOLE or NONE:
  //   1. STAGE off the last sealed tip — compute each op's prev_hash/op_hash, derive ONE group hash
  //      groupHash = sha256(tip | op_hash[0] | … | op_hash[N-1]) binding the whole group to the tip.
  //   2. ALL-OR-NONE GATE — if groupMeta.expectedHash is supplied and groupHash != expectedHash, commit
  //      NOTHING (return committed:false). This is the torn-group rejection (poc_showstopper groupHash=FAIL).
  //   3. ATOMIC COMMIT — wrap the N INSERTs in ONE SQL transaction (BEGIN…COMMIT / ROLLBACK on any
  //      error) → zero rows on failure = no half-group (the storage-tier mirror of S2's fold-tier rule).
  //   4. SEAL ONCE — seal only the N new rows via sealFrom (the I-D win; not N whole-log re-seals).
  //   Every committed op carries the shared `gid` so the fold can re-segment groups (poc_showstopper groupsOf).
  // Idempotent: re-invoking with a gid already present is a no-op (returns the existing group).
  // NON-INVENT: a caller-supplied gid is honoured verbatim (G-IDENTITY input); minted only when absent.
  // Signature: commitGroup(db, opsArray, groupMeta) -> { gid, ids, op_hashes, tip, sealed, committed, reason? }
  async function commitGroup(db, opsArray, groupMeta) {
    ensureTable(db);
    groupMeta = groupMeta || {};
    if (!Array.isArray(opsArray) || opsArray.length === 0) {
      return { committed: false, reason: 'empty op-group', ids: [], op_hashes: [] };
    }
    // gid is an edge-minted INPUT (same discipline as op_uuid) — honour caller's, else mint at commit.
    var gid = groupMeta.gid ||
              ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'g-' + Date.now());
    // BLUE FUTURE (W-BLUE-FUTURE): a speculative-branch tag carried on every op of the group. NULL = official.
    // NOT part of _canonical (the chain hashes the same with or without it) → ACCEPT later clears it in place.
    var branchId = (groupMeta.branch_id != null) ? groupMeta.branch_id : null;

    // ── Idempotency: a gid already present is a no-op (replay-safe, retry-safe). ──
    var existing = db.exec('SELECT id, op_hash FROM kernel_ops WHERE gid = ' + JSON.stringify(gid) + ' ORDER BY id');
    if (existing.length && existing[0].values.length) {
      var exIds = existing[0].values.map(function (v) { return v[0]; });
      var exHashes = existing[0].values.map(function (v) { return v[1]; });
      console.log('§KRN_GROUP idempotent gid=' + gid + ' alreadyCommitted=' + exIds.length + ' ops');
      return { gid: gid, ids: exIds, op_hashes: exHashes, tip: exHashes[exHashes.length - 1],
               sealed: 0, committed: true, idempotent: true };
    }

    // ── 1. STAGE off the last sealed tip — derive per-op hashes WITHOUT writing. ──
    // The staged ops will receive ids = max(id)+1..+N on insert; _canonical hashes `id`, so we must
    // predict those ids to stage the exact hashes the seal will reproduce. They are contiguous because
    // INTEGER PRIMARY KEY auto-increments monotonically and this group is a single transaction.
    var tipRow = _lastSealedTip(db);
    var maxR = db.exec('SELECT COALESCE(MAX(id),0) FROM kernel_ops');
    var nextId = (maxR.length ? Number(maxR[0].values[0][0]) : 0) + 1;
    var baseTs = (typeof groupMeta.baseTs === 'number') ? groupMeta.baseTs : Date.now();
    var staged = [], prev = tipRow.hash, opHashes = [];
    for (var i = 0; i < opsArray.length; i++) {
      var src = opsArray[i];
      var params = src.params != null ? src.params : src.parameters;
      params = _stamp(src.op_type, params);                  // D2: brand schema version (signed) if wired
      // §I-J (W-RATE-INPUT) — currency-determinism precondition: a conversion-bearing op MUST carry its
      // recorded rate inputs (rate/rateDate/rateSource), else the WHOLE group is rejected (all-or-none,
      // commits NOTHING). Today nothing is conversion-bearing → inert but enforced. NEVER looks up a rate.
      var rateCheck = assertRateAsInput(params);
      if (!rateCheck.ok) {
        console.log('§RATE REJECT gid=' + gid + ' op[' + i + ']=' + (src.op_type || '?') +
                    ' reason=' + rateCheck.reason + ' committedRows=0 (multi-currency disabled until rate-as-input)');
        return { gid: gid, ids: [], op_hashes: [], tip: tipRow.hash, sealed: 0,
                 committed: false, reason: rateCheck.reason };
      }
      var paramStr = (typeof params === 'string') ? params : JSON.stringify(params || null);
      var inG = src.inputGuids != null ? src.inputGuids : (src.input_guids != null ? src.input_guids : null);
      var inStr = inG ? (typeof inG === 'string' ? inG : JSON.stringify(inG)) : null;
      var outG = src.outputGuid != null ? src.outputGuid : (src.output_guid != null ? src.output_guid : null);
      var uuid = src.op_uuid || src.opUuid ||
                 ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null);
      var row = { id: nextId + i, timestamp: baseTs, op_type: src.op_type, parameters: paramStr,
                  input_guids: inStr, output_guid: outG || null, op_uuid: uuid };
      var h = await _sha256(prev + '|' + _canonical(row));
      row.op_hash = h; row.prev_hash = prev;
      var sig = null;
      if (_signer) { try { sig = await _signer.sign(h); } catch (e) { sig = null; } }
      row.sig = sig;
      staged.push(row); opHashes.push(h); prev = h;
    }
    // derive ONE group hash binding the whole group to the tip (§I-K SPEC step 1).
    var groupHash = await _sha256([tipRow.hash].concat(opHashes).join('|'));

    // ── 2. ALL-OR-NONE GATE — expectedHash mismatch ⇒ reject the WHOLE group, commit nothing. ──
    if (groupMeta.expectedHash && groupMeta.expectedHash !== groupHash) {
      console.log('§KRN_GROUP REJECT gid=' + gid + ' groupHash=FAIL expected=' + String(groupMeta.expectedHash).slice(0, 12) +
                  '… got=' + groupHash.slice(0, 12) + '… committedRows=0 (torn group → all-or-NONE)');
      return { gid: gid, ids: [], op_hashes: [], tip: tipRow.hash, sealed: 0,
               committed: false, reason: 'group hash mismatch' };
    }

    // ── 3. ATOMIC COMMIT — N INSERTs in ONE transaction; ROLLBACK on any error = zero rows. ──
    var ids = [];
    try {
      db.run('BEGIN');
      for (var j = 0; j < staged.length; j++) {
        var s = staged[j];
        db.run(
          'INSERT INTO kernel_ops (id, op_uuid, timestamp, op_type, parameters, input_guids, output_guid, prev_hash, op_hash, sig, gid, branch_id) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [s.id, s.op_uuid, s.timestamp, s.op_type, s.parameters, s.input_guids, s.output_guid,
           s.prev_hash, s.op_hash, s.sig, gid, branchId]
        );
        ids.push(s.id);
      }
      db.run('COMMIT');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (ignore) {}
      console.log('§KRN_GROUP ROLLBACK gid=' + gid + ' err=' + e.message + ' committedRows=0 (all-or-NONE)');
      return { gid: gid, ids: [], op_hashes: [], tip: tipRow.hash, sealed: 0,
               committed: false, reason: 'transaction failed: ' + e.message };
    }

    // ── 4. SEAL ONCE from the tip forward (the I-D win — not N whole-log re-seals). ──
    // Rows were inserted ALREADY-sealed (prev_hash/op_hash/sig staged); sealFrom is idempotent over them
    // and confirms the tip. This keeps per-group seal cost O(N-in-group).
    var sealRes = await sealFrom(db, tipRow);
    console.log('§KRN_GROUP committed gid=' + gid + ' ops=' + ids.length + ' groupHash=' + groupHash.slice(0, 12) +
                '… tip=' + sealRes.tip.slice(0, 12) + '… sealed=' + sealRes.sealed + ' (WHOLE — all-or-none)');
    _persistToIdb(db);
    return { gid: gid, ids: ids, op_hashes: opHashes, tip: sealRes.tip,
             sealed: sealRes.sealed, committed: true, group_hash: groupHash };
  }

  // verifyChain — walk the ordered log, recompute each op_hash, check the prev_hash link, and (if a
  // signer is set) the signature. Returns {ok, len, tip} or {ok:false, brokeAt, why} — proving
  // "tamper at op N" exactly as scripts/poc_chain.js does.
  async function verifyChain(db) {
    ensureTable(db);
    var r = db.exec('SELECT id,timestamp,op_type,parameters,input_guids,output_guid,prev_hash,op_hash,sig,gid FROM kernel_ops ORDER BY id');
    if (!r.length) return { ok: true, len: 0, tip: GENESIS };
    var rows = r[0].values, prev = GENESIS;
    for (var i = 0; i < rows.length; i++) {
      var op = { id: rows[i][0], timestamp: rows[i][1], op_type: rows[i][2],
                 parameters: rows[i][3], input_guids: rows[i][4], output_guid: rows[i][5] };
      var storedPrev = rows[i][6], storedHash = rows[i][7], sig = rows[i][8], gid = rows[i][9];
      var fail = null;
      if (storedHash == null) { fail = 'unsealed'; }
      else if (storedPrev !== prev) { fail = 'prev_hash link'; }
      else {
        var h = await _sha256(prev + '|' + _canonical(op));
        if (h !== storedHash) { fail = 'payload altered'; }
        else if (_signer && !(await _signer.verify(storedHash, sig))) { fail = 'signature'; }
      }
      if (fail) {
        // Implementing ENGINE_FULL_ERP_ISSUES.md §I-K — Witness: W-OPGROUP
        // Group-torn rule (mirrors poc_showstopper groupIntact): if a failing op belongs to a gid, the
        // WHOLE group is broken — report brokeAt = the FIRST op of that gid, why='group torn'. A
        // group-aware fold MUST skip every op of a torn gid (never apply a surviving sibling — that is
        // the half-state naiveFold UNBALANCES). For an op with no gid, keep the per-op verdict.
        if (gid != null) {
          var gFirst = db.exec('SELECT MIN(id) FROM kernel_ops WHERE gid = ' + JSON.stringify(gid));
          var brokeAt = (gFirst.length && gFirst[0].values.length) ? gFirst[0].values[0][0] : op.id;
          console.log('§KRN_CHAIN group-torn gid=' + gid + ' failAt id=' + op.id + ' why=' + fail + ' brokeAt(group)=' + brokeAt);
          return { ok: false, brokeAt: brokeAt, why: 'group torn', gid: gid, opFail: fail, failAt: op.id };
        }
        console.log('§KRN_CHAIN verify ' + fail + ' at id=' + op.id);
        return { ok: false, brokeAt: op.id, why: fail };
      }
      prev = storedHash;
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
  // BLUE FUTURE (W-BLUE-FUTURE): `branch` selects which timeline to replay —
  //   undefined / null  → OFFICIAL only (branch_id IS NULL). Existing callers pass nothing and are unchanged:
  //                       every pre-existing op has branch_id NULL, so the official projection is identical;
  //                       only NEW speculative (blue) ops are excluded — exactly the invisibility invariant.
  //   '<branch-id>'      → that speculative branch's ops only (the blue view).
  //   '*'                → every op regardless of branch (debug/export).
  function replayOps(db, opType, branch) {
    ensureTable(db);
    // G-IDENTITY (§0.21 D2/D3): replay RE-READS the recorded op_uuid — identity is never recomputed.
    var sql = 'SELECT id, op_uuid, op_type, parameters FROM kernel_ops WHERE undone = 0';
    var args = [];
    if (branch === '*') { /* no branch filter */ }
    else if (branch == null) { sql += ' AND branch_id IS NULL'; }
    else { sql += ' AND branch_id = ?'; args.push(branch); }
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

  // ── BLUE FUTURE (W-BLUE-FUTURE) — speculative-branch lifecycle ────────────────────────────────────
  // The blue branch is just ops tagged with branch_id. Because the tag is NOT in _canonical, the chain is
  // valid with the tag present (blue) or cleared (accepted) — so ACCEPT is an in-place re-parent, not a
  // re-hash. Blue ops are always the LATEST in id order (a private fork off the tip), so in the single-actor
  // case accept needs no rebase: clearing branch_id makes them official and the chain still verifies. The
  // multi-actor case (an official op interleaved after a blue op) needs conflict detection — NOT done here
  // (honestly flagged; the §0.20 rebase + a conflict check is the upgrade path).

  // branchOps — the ops of a branch, id order. {id, gid, op_type} rows. Empty if none.
  function branchOps(db, branchId) {
    ensureTable(db);
    var r = db.exec('SELECT id, gid, op_type FROM kernel_ops WHERE branch_id = ' + JSON.stringify(String(branchId)) + ' AND undone = 0 ORDER BY id');
    if (!r.length) return [];
    return r[0].values.map(function (v) { return { id: v[0], gid: v[1], op_type: v[2] }; });
  }

  // discardBranch — "shirk the blues": fold the WHOLE branch away atomically (undone=1 for every branch op).
  // The official tip never saw these ops (official reads filter branch_id IS NULL), so nothing official moves;
  // the blue children just vanish. Idempotent. Returns { discarded }.
  function discardBranch(db, branchId) {
    ensureTable(db);
    var before = branchOps(db, branchId).length;
    db.run('UPDATE kernel_ops SET undone = 1 WHERE branch_id = ? AND undone = 0', [String(branchId)]);
    console.log('§BLUE-DISCARD branch=' + branchId + ' folded=' + before + ' (official tip untouched)');
    _persistToIdb(db);
    return { discarded: before };
  }

  // acceptBranchUpTo — long-click a blue dot: turn every blue op of this branch with id <= uptoId WHITE +
  // PERMANENT (clear branch_id → official). Ops after uptoId stay blue. Because branch_id ∉ _canonical, the
  // op_hash is unchanged and the existing seal stays valid — accept is a metadata flip, not a re-seal (single
  // -actor). Returns { accepted, remaining, chain } where chain is the verifyChain verdict proving integrity.
  async function acceptBranchUpTo(db, branchId, uptoId) {
    ensureTable(db);
    var ops = branchOps(db, branchId);
    var toAccept = ops.filter(function (o) { return o.id <= uptoId; });
    db.run('UPDATE kernel_ops SET branch_id = NULL WHERE branch_id = ? AND id <= ? AND undone = 0',
           [String(branchId), uptoId]);
    var remaining = branchOps(db, branchId).length;
    var chain = await verifyChain(db);   // chain must STILL verify — accept did not touch any hashed field
    console.log('§BLUE-ACCEPT branch=' + branchId + ' uptoId=' + uptoId + ' accepted=' + toAccept.length +
                ' remainingBlue=' + remaining + ' chainOk=' + chain.ok);
    _persistToIdb(db);
    return { accepted: toAccept.length, remaining: remaining, chain: chain };
  }

  window.KernelOps = {
    ensureTable:  ensureTable,
    commitOp:     commitOp,
    undoOp:       undoOp,
    redoOp:       redoOp,
    replayOps:    replayOps,
    compact:      compact,
    sessionStart: sessionStart,
    sealChain:    sealChain,     // W-CHAIN: (re)seal the WHOLE log's hash chain (async, post-compaction)
    sealFrom:     sealFrom,      // §I-K (W-OPGROUP): incremental seal-from-tip (the I-D flattening)
    commitGroup:  commitGroup,   // §I-K (W-OPGROUP): N ops, ONE group hash, all-or-none, sealed once (async)
    verifyChain:  verifyChain,   // W-CHAIN/W-SIGN: prove tamper-evidence (async)
    setSigner:    setSigner,     // W-SIGN: install an edge signer (opt-in)
    setVersionStamper: setVersionStamper, // D2: install a schema-version stamper (opt-in; ERP.OpUpcaster.install)
    assertRateAsInput: assertRateAsInput, // §I-J (W-RATE-INPUT): currency-determinism guard (pure, rate-as-op-input)
    branchOps:    branchOps,     // BLUE FUTURE (W-BLUE-FUTURE): the ops of a speculative branch (id order)
    discardBranch: discardBranch, // BLUE FUTURE: shirk the blues — fold the whole branch away atomically
    acceptBranchUpTo: acceptBranchUpTo // BLUE FUTURE: long-click a blue dot → accept-up-to-here (chain stays valid)
  };

  console.log('§KERNEL_OPS_LOADED v9 (W-CHAIN/W-SIGN/G-IDENTITY/W-OPGROUP/W-RATE-INPUT/W-BLUE-FUTURE)');
})();
