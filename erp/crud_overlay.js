// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// crud_overlay.js — CRUD "ring of fire" overlay (prompts/CRUD_OVERLAY.md — E2 dry-run).
// A SECOND peer overlay on the same keyed-hook mechanism as help_overlay.js (UI_OVERLAY_GOVERNANCE.md):
// it attaches to glassbowl's bubbles BY KEY, reads the keyed crud_ops.json store, renders the Edit-mode
// ring (＋ New · 👁 View · ✎ Edit · – Delete) and the kind-dispatched form, ENFORCES each element's own
// rules (type/readonly/required/default + validation — the AD_Column/AD_Val_Rule model) BEFORE apply,
// and never edits the renderer. E2 is DRY-RUN: it logs the op it WOULD apply; E3 swaps applyOp() for the
// signed kernel (commitOp/sealChain/verifyChain). Reuses page globals: N/idx/project/px/py/k/radius +
// withBundle/curChain/fname (best-effort, all typeof-guarded).
(function (global) {
  'use strict';

  // ── Task 1 / Task 4 helpers — table column cache (uses global.__idmpDb, the main app db) ──
  var _tableColsCache = {};
  function _getTableCols(table) {
    var k = String(table || '').toLowerCase();
    if (_tableColsCache[k]) return _tableColsCache[k];
    try {
      // `global` is the IIFE parameter (= window in browser, module.exports in node); use globalThis
      // to reach the actual global object in both environments without being shadowed.
      var mdb = (typeof globalThis !== 'undefined' && globalThis.__idmpDb) || null;
      if (!mdb) return {};
      var r = mdb.exec('PRAGMA table_info("' + k + '")'); if (!r.length) { _tableColsCache[k] = {}; return {}; }
      var ni = r[0].columns.indexOf('name'), cols = {};
      r[0].values.forEach(function (v) { cols[String(v[ni]).toLowerCase()] = 1; });
      _tableColsCache[k] = cols; return cols;
    } catch (e) { return {}; }
  }

  // _fmtKernelTs — render the kernel's epoch timestamp (a recorded input, Date.now() at commit) into
  // iDempiere's audit-column convention `yyyy-MM-dd HH:mm:ss` (UTC, locale-independent → deterministic).
  // The seed's migrated rows store Created/Updated in exactly this shape (e.g. "2003-01-22 17:55:36"), so a
  // user-created row must match it — not show a raw integer. PURE: derived from the stored input, replay-stable;
  // NOT part of any op hash (this is a display projection at materialise time). Tolerant of ms (13-digit, the
  // kernel default) and accidental seconds (10-digit) inputs. Non-numeric/absent → passed through unchanged.
  function _fmtKernelTs(ts) {
    if (ts == null) return ts;
    var n = Number(ts); if (!isFinite(n)) return ts;
    if (n > 0 && n < 1e12) n = n * 1000;                 // looks like epoch-seconds → ms
    var d = new Date(n); if (isNaN(d.getTime())) return ts;
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
           ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
  }

  // ════════════════════════════════════════════════════════════════════════
  // PURE CORE — no DOM. Exported for the headless §-witness harness (node).
  // ════════════════════════════════════════════════════════════════════════
  function isMeta(k) { return k === '__meta'; }

  // entriesOf — drift view: every keyed entry minus __meta, ordinal-sorted, key stamped on.
  function entriesOf(store) {
    return Object.keys(store).filter(function (k) { return !isMeta(k); })
      .map(function (k) { var e = store[k]; var o = {}; for (var p in e) o[p] = e[p]; o.key = k; return o; })
      .sort(function (a, b) { return (a.ordinal || 0) - (b.ordinal || 0); });
  }
  function verbEnabled(entry, verb) { return (entry.verbs || []).indexOf(verb) >= 0; }

  // defaultsFor — the New-form seed from each field's DefaultValue (AD_Column.DefaultValue).
  // expr vocab: 'today' -> ISO date (an INPUT, passed in — never Date.now here, replay-safe), 'auto' -> ''.
  function defaultsFor(entry, today) {
    var v = {};
    (entry.fields || []).forEach(function (f) {
      var d = f.hasOwnProperty('default') ? f.default : '';
      if (d === 'today') d = today || '';
      else if (d === 'auto') d = '';
      v[f.col] = (d == null ? '' : d);
    });
    return v;
  }

  // ── W-LOGIC-EVAL wiring (Implementing ERP_COVERAGE_MATRIX.md §DisplayLogic/§ReadOnlyLogic/§MandatoryLogic).
  // effectiveFlags — a field's LIVE {visible,readonly,required} from its AD logic strings, evaluated against
  // (record, context) by ad_evaluator.js (window.AdEvaluator / node global). When a field carries no logic
  // string for a given attr, fall back EXACTLY to the flat boolean (f.readonly / f.required; visible=true).
  // AD logic keys (lowercase, as in ad_full.db): displaylogic / readonlylogic / mandatorylogic.
  function adEval() { return (typeof window !== 'undefined' && window.AdEvaluator) ? window.AdEvaluator
                           : (typeof AdEvaluator !== 'undefined' ? AdEvaluator : null); }
  function effectiveFlags(f, record, context) {
    var E = adEval();
    var dl = f.displaylogic, rl = f.readonlylogic, ml = f.mandatorylogic;
    var visible = true, readonly = !!f.readonly, required = !!f.required, logicHit = [];
    if (E) {
      try {
        if (dl != null && String(dl).trim() !== '') { visible  = E.evaluate(dl, record || {}, context || {}); logicHit.push('display'); }
        if (rl != null && String(rl).trim() !== '') { readonly = E.evaluate(rl, record || {}, context || {}); logicHit.push('readonly'); }
        if (ml != null && String(ml).trim() !== '') { required = E.evaluate(ml, record || {}, context || {}); logicHit.push('mandatory'); }
      } catch (e) { /* parse error → keep flat fallback for that attr (non-invent: never guess a verdict) */ }
    }
    if (logicHit.length && typeof console !== 'undefined') {
      logicHit.forEach(function (a) {
        var expr = a === 'display' ? dl : a === 'readonly' ? rl : ml;
        var res = a === 'display' ? visible : a === 'readonly' ? readonly : required;
        console.log('§LOGIC_EVAL attr=' + a + ' col=' + (f.col || '?') + ' expr="' + expr + '" ctx=' + JSON.stringify(context || {}) + ' result=' + res);
      });
    }
    return { visible: visible, readonly: readonly, required: required };
  }

  // validateField — the per-field check (AD: IsUpdateable, IsMandatory, AD_Reference, AD_Val_Rule).
  // Returns a reason string on FAIL, else null. `orig` (current value) lets readonly detect a change.
  // record/context (optional, last) drive the AD logic-expression evaluator; absent → flat-bool behaviour (back-compat).
  function validateField(store, f, val, orig, record, context) {
    var eff = effectiveFlags(f, record, context);
    if (!eff.visible) return null;                        // hidden by DisplayLogic → not validated (GridField parity)
    // iDempiere validates only what the SAVE changes — an UNCHANGED field's value is already persisted (valid by
    //   definition) and won't be written, so it is not re-checked (this also spares an untouched fk/code field that
    //   the spec types imperfectly, e.g. AD_Language='en_US'). orig===undefined (create) → every field is checked.
    if (orig !== undefined && String(val == null ? '' : val) === String(orig == null ? '' : orig)) return null;
    if (eff.readonly) {
      if (orig !== undefined && orig !== null && String(val) !== String(orig)) return 'readonly';
      return null;
    }
    var empty = (val == null || String(val).trim() === '');
    if (eff.required && empty) return 'required';
    if (empty) return null;                              // optional + empty = fine
    var V = f.validation || {};
    switch (f.type) {
      case 'number':
        if (!isFinite(Number(val))) return 'type:number';
        if (V.min != null && Number(val) < V.min) return 'min:' + V.min;
        if (V.max != null && Number(val) > V.max) return 'max:' + V.max;
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}/.test(String(val))) return 'type:date';
        break;
      case 'list':
        var opts = (f.ref && store.__meta && store.__meta[f.ref]) ? store.__meta[f.ref] : null;
        if (opts && !opts.hasOwnProperty(String(val))) return 'list:not-an-option';
        break;
      case 'fk':
        if (!isFinite(Number(val))) return 'type:fk';
        break;
      case 'string':
        if (V.regex && !new RegExp(V.regex).test(String(val))) return 'regex:' + (V.valRule || V.regex);
        break;
    }
    return null;
  }

  // validate — run every field; collect {col, why}. The "checks before saving" layer, BEFORE apply().
  function validate(store, entry, values, originals, context) {
    var errors = [];
    // record = the row under edit (values merged over originals) — what the AD logic evaluates against.
    var record = {}; var k; if (originals) for (k in originals) record[k] = originals[k]; if (values) for (k in values) record[k] = values[k];
    (entry.fields || []).forEach(function (f) {
      var why = validateField(store, f, values[f.col], originals ? originals[f.col] : undefined, record, context || {});
      if (why) errors.push({ col: f.col, why: why });
    });
    return { ok: errors.length === 0, errors: errors };
  }

  // coerce a raw form value to its stored shape (number -> Number) for the op payload.
  function coerce(type, val) {
    if (val == null || val === '') return null;
    if (type === 'number' || type === 'fk') return Number(val);
    return String(val);
  }
  // ON CREATE ONLY: also carry any hook-derived, undeclared column already merged into `values` (saveForm's
  // fireBeforeSaveHooks callback, crud_overlay.js ~line 1242) — a beforeSave default with no form field (e.g.
  // M_Warehouse_ID) must still persist on the new row. gatherVals() only ever seeds `values` from entry.fields,
  // so any OTHER key present is provably hook-derived, never stray UI state. UPDATE keeps the tight declared-only
  // guard (unchanged) since that path never merges undeclared keys into `values` in the first place.
  function cleanVals(entry, values, verb) {
    var out = {};
    var declared = {};
    (entry.fields || []).forEach(function (f) { declared[f.col] = true; var c = coerce(f.type, values[f.col]); if (c != null) out[f.col] = c; });
    if (verb === 'create' && values) {
      Object.keys(values).forEach(function (k) {
        if (declared[k]) return;
        var v = values[k];
        if (v != null && v !== '') out[k] = v;
      });
    }
    return out;
  }

  // ── Item 2 (FRONTEND_LANE_MASTER §OUTSTANDING) — WIRE FULL DOCACTION SET PER AD. legalDocActions: the
  // CORE↔FSM seam the Process ▶ ring consults so it surfaces the legal action set for the record's CURRENT
  // status (from AD/FSM, `AdDocFsm.legalActions`), NOT the hardcoded `{action:"CO"}` in crud_ops.json. The FSM
  // is injected (window.AdDocFsm in-browser, required headless) so CORE stays decoupled + witnessable.
  // Returns {doctype, docBaseType, actions:[…]} or null when the FSM/db is absent. Witness: W-DOCACTION-FULL.
  function legalDocActions(fsm, fsmDb, doctypeId, fromStatus) {
    if (!fsm || !fsmDb || typeof fsm.legalActions !== 'function') return null;
    try { var la = fsm.legalActions(fsmDb, doctypeId, fromStatus); return (la && la.actions && la.actions.length) ? la : null; }
    catch (e) { return null; }
  }

  // docActionOutcome — derive the DocAction result DETERMINISTICALLY (E2 dry-run; E3 = real completeIt()).
  // No Date.now/Math.random — replay-safe, non-invent.
  // Item 2: when a CHOSEN action + the FSM are supplied (opts.{chosen,fsm,fsmDb,doctypeId}), the outcome is
  // routed through `AdDocFsm.dispatch` so the FULL set works — VO/CL/RC/RA/RE/PO, not just CO. The completeIt
  // (CO) precondition still gates on docAction.requires (an incomplete doc → IP, never a fake CO). RC/RA route
  // to a REVERSAL (status → RE: a reversing document, never a silent un-complete back to DR/IP on a posted doc).
  // An action illegal from the current status is reported (outcome 'illegal') with the legal set, never applied.
  // DEFAULT (no FSM/chosen) = the legacy hardcoded-CO requires-gate, UNCHANGED — the bridge is opt-in.
  function docActionOutcome(entry, values, opts) {
    var da = entry.docAction; if (!da) return null;
    opts = opts || {};
    var fromStatus = opts.from || da.from || 'DR';
    if (opts.chosen && opts.fsm && opts.fsmDb && opts.doctypeId != null && typeof opts.fsm.dispatch === 'function') {
      var disp;
      try { disp = opts.fsm.dispatch(opts.fsmDb, opts.doctypeId, fromStatus, opts.chosen); } catch (e) { disp = { ok: false, reason: 'fsm-error' }; }
      if (!disp.ok) return { action: opts.chosen, from: fromStatus, to: fromStatus, outcome: 'illegal', unmet: [], legalActions: disp.legalActions || [], reason: disp.reason };
      if (opts.chosen === 'CO') {                              // completeIt still honours the field preconditions
        var unmetC = (da.requires || []).filter(function (c) { var v = values ? values[c] : undefined; return v == null || String(v).trim() === ''; });
        if (unmetC.length) return { action: 'CO', from: fromStatus, to: 'IP', outcome: 'in-progress', unmet: unmetC, legalActions: disp.legalActions };
      }
      var isReversal = opts.chosen === 'RC' || opts.chosen === 'RA';   // reverse-correct / reverse-accrual → posts a reversal
      return { action: opts.chosen, from: fromStatus, to: disp.to, outcome: isReversal ? 'reversal' : 'success', unmet: [], reversal: isReversal, legalActions: disp.legalActions };
    }
    var reqs = da.requires || [];
    var unmet = reqs.filter(function (c) { var v = values ? values[c] : undefined; return v == null || String(v).trim() === ''; });
    var ok = unmet.length === 0;
    return { action: da.action || 'CO', from: fromStatus, to: ok ? (da.to || 'CO') : 'IP', outcome: ok ? 'success' : 'in-progress', unmet: unmet };
  }

  // buildOp — the op the kernel WOULD apply (E2 dry / E3 live). One op per CRUD action.
  // delete = a reversible tombstone op, never a destructive erase (CRUD_OVERLAY.md req 4).
  function buildOp(verb, entry, values, originals, ctx) {
    ctx = ctx || {};
    var base = { key: entry.key, table: entry.key, verb: verb, ownerGated: !!entry.ownerGated, op_uuid: ctx.opUuid || null };
    if (verb === 'create') {
      base.op_type = 'CRUD_CREATE'; base.fields = cleanVals(entry, values, verb); base.cas = entry.cas || null;
      // Task 1 — iDempiere setStandardDefaults parity: carry actor+tenant onto the op; listTip materialises them
      var _cActor = ctx.actor != null ? ctx.actor : sessionActor();
      var _cCid   = ctx.clientId != null ? ctx.clientId : sessionClientId();
      var _cOid   = ctx.orgId != null ? ctx.orgId : sessionOrgId();
      if (_cActor != null || _cCid != null) {
        base.stdDefaults = { actor: _cActor, clientId: _cCid, orgId: _cOid != null ? _cOid : 0 };
      }
      return base;
    }
    if (verb === 'update') {
      var changes = {};
      (entry.fields || []).forEach(function (f) {
        if (f.readonly) return;
        var nv = values[f.col], ov = originals ? originals[f.col] : undefined;
        if (String(nv == null ? '' : nv) !== String(ov == null ? '' : ov)) changes[f.col] = { old: ov == null ? null : ov, new: coerce(f.type, nv) };
      });
      base.op_type = 'CRUD_UPDATE'; base.id = ctx.id == null ? null : ctx.id; base.changes = changes;
      // Task 1 — carry actor for UpdatedBy materialise in listTip
      var _uActor = ctx.actor != null ? ctx.actor : sessionActor();
      if (_uActor != null) { base.actor = _uActor; }
      return base;
    }
    if (verb === 'delete') {
      base.op_type = 'CRUD_DELETE'; base.id = ctx.id == null ? null : ctx.id; base.tombstone = true; base.reversible = true;
      return base;
    }
    if (verb === 'process') {                              // DocAction — runs the doc state machine, not a row write
      // Item 2: pass a chosen action + FSM (ctx.{chosen,fsm,fsmDb,doctypeId}) → the full set; default = CO.
      var r = docActionOutcome(entry, values, { chosen: ctx.chosen, fsm: ctx.fsm, fsmDb: ctx.fsmDb, doctypeId: ctx.doctypeId, from: ctx.from })
              || { action: 'CO', from: 'DR', to: 'IP', outcome: 'in-progress', unmet: [] };
      base.op_type = 'DOC_ACTION'; base.id = ctx.id == null ? null : ctx.id;
      base.action = r.action; base.from = ctx.from || r.from; base.to = r.to; base.outcome = r.outcome; base.unmet = r.unmet;
      if (r.reversal) base.reversal = true;                 // RC/RA — post a reversal, never a silent un-complete
      base.oracle = (entry.docAction && entry.docAction.oracle) || null;
      return base;
    }
    throw new Error('buildOp: unknown verb ' + verb);
  }

  // ── GP3 signed-write seam (READSHOWME §… / GUIDE_SHOWME_PROCESS GP3 — DECIDED: sidecar log, read-the-tip).
  // kernelParamsFor — map an overlay DOC_ACTION op to the production kernel's SET_STATUS params. The
  // COMMITTED op is the REAL write (commitOp→sealChain→verifyChain); read-the-tip later returns `to`.
  function kernelParamsFor(op) {
    if (!op || op.op_type !== 'DOC_ACTION') return null;
    return { table: op.table, id: op.id, action: op.action, from: op.from, to: op.to, oracle: op.oracle || null };
  }

  // ── §I-K Phase 3 (UI/docValidate tier) — Implementing ENGINE_FULL_ERP_ISSUES.md §I-K — Witness: W-OPGROUP-UI
  // buildDocActionGroup — PURE (no DOM): turn ONE overlay DOC_ACTION op into the group of kernel ops the
  // live write path commits ATOMICALLY via KernelOps.commitGroup. Returns the commitGroup op-shape array
  // ({op_type, op_uuid, params}) so commitGroup folds them all-or-none, sealed ONCE from the tip (I-D win).
  //
  // Implementing SO_FULL_CRUD_GAP.md T1 (GAP 1) — Witness: W-SO-COMPLETE-UI.
  // `fanout` (optional) = { ops: <ENGINE consequence ops>, glGate?: <reason> } — the completeIt fan-out the
  // PROVEN engine extracts (ERPEngine.completeOrder, W-FOLD-COMPLETE oracle-equivalent: CREATE_DOCUMENT
  // M_InOut + CREATE_LINE per order line + CREATE_DOCUMENT C_Invoice + CREATE_LINE per line). NON-INVENT:
  // each engine op rides as the kernel op's params VERBATIM (the pos_lens.js group pattern) — this function
  // only ASSEMBLES; it never re-derives quantities/amounts/accounts. The engine's own SET_STATUS is dropped
  // (the FSM transition rides OUR statusOp exactly once); SET_STATUS goes LAST — consequences first, the
  // status seals the gesture. No fanout (absent engine / non-CO action / gated) → the honest [SET_STATUS].
  function buildDocActionGroup(op, fanout) {
    if (!op || op.op_type !== 'DOC_ACTION') return null;
    var statusOp = { op_type: 'SET_STATUS', op_uuid: op.op_uuid || null, params: kernelParamsFor(op) };
    var groupOps = [];
    if (fanout && fanout.ops && fanout.ops.length) {
      fanout.ops.forEach(function (eo) {
        if (!eo || eo.op_type === 'SET_STATUS') return;            // status rides OUR statusOp, exactly once
        groupOps.push({ op_type: eo.op_type, op_uuid: null, params: eo });   // engine op VERBATIM (non-invent)
      });
    }
    groupOps.push(statusOp);
    return groupOps;
  }

  // docPolicyFor — PURE. Implementing SO_FULL_CRUD_GAP.md T1 — Witness: W-SO-COMPLETE-UI.
  // The completeIt fan-out flags are DATA (iDempiere C_DocType decision table), EXTRACTED into
  // crud_ops.json __meta.docPolicy (← erp_rules.db DOCPOLICY:<id> ← the real c_doctype capture).
  // Unknown doctype → null (the caller GATES the fan-out — never a defaulted 'Y', non-invent).
  function docPolicyFor(store, doctypeId) {
    var m = store && store.__meta && store.__meta.docPolicy;
    return (m && doctypeId != null && m[String(doctypeId)]) || null;
  }

  // _branchClause — BLUE FUTURE (W-BLUE-FUTURE-LIVE / FRONTEND_LANE_MASTER §OUTSTANDING item 0 leg 4):
  // the read-the-tip sites below (tipDocs/listTip/readTip/tipValues) run their OWN raw SELECT against
  // kernel_ops rather than going through KernelOps.replayOps, so they do NOT inherit replayOps' official
  // default (branch_id IS NULL). Without this clause a speculative blue op would LEAK into the official
  // chrome (list rows, docstatus, field tip) — the safety bug leg 4 closes. Semantics mirror replayOps:
  //   branch == null/undefined → OFFICIAL only (branch_id IS NULL). Every pre-blue op has branch_id NULL,
  //                              so this is byte-identical to the prior behaviour — no existing caller moves.
  //   branch == '<id>'         → OFFICIAL + that branch (the blue VIEW sees official rows + its own blue).
  // Inline (these are db.exec string queries, no bound params); branch ids are controlled ('blue-…') but
  // we single-quote-escape anyway. NON-INVENT: the tag is the same branch_id the engine commits/folds.
  function _sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
  function _branchClause(branch) {
    return (branch == null) ? ' AND branch_id IS NULL'
                            : ' AND (branch_id IS NULL OR branch_id = ' + _sqlStr(branch) + ')';
  }
  // _readBranch — the live seam: when the Blue Future controller has entered blue mode it returns the active
  // branch id, so the chrome's INTERNAL read-the-tip callers (docstatus/CAS/getRecord overlay) automatically
  // fold the blue VIEW without every idempiere.html call site threading a branch. OFFICIAL chrome (no blue
  // mode) → null → official-only. Best-effort: the controller may not be loaded (older bundle / witness).
  function _readBranch() {
    try { return (typeof window !== 'undefined' && window.BlueFuture && typeof window.BlueFuture.readBranch === 'function')
      ? window.BlueFuture.readBranch() : null; } catch (e) { return null; }
  }
  // _commitMeta — the WRITE seam (leg 1 tail + leg 5): every signed commit (ordinary CRUD edit AND the full
  // CompleteIt DocAction fan-out) routes its groupMeta through here, so in blue mode it carries {branch_id}
  // and lands SPECULATIVE (invisible to official reads above). Official mode → {} → unchanged. The tag is
  // ∉ _canonical (kernel_ops.js), so ACCEPT later clears it without rehashing — the chain stays valid.
  function _commitMeta() {
    try { return (typeof window !== 'undefined' && window.BlueFuture && typeof window.BlueFuture.groupMeta === 'function')
      ? (window.BlueFuture.groupMeta() || {}) : {}; } catch (e) { return {}; }
  }

  // tipDocs — read-the-tip CREATED documents for a table from the signed op-log: every non-undone
  // CREATE_DOCUMENT op whose params.table matches (case-insensitive — the engine emits 'M_InOut',
  // overlay keys are 'm_inout'). The CREATE-side sibling of readTip (docstatus) / tipValues (fields).
  // BLUE FUTURE: `branch` (optional) opens the blue VIEW — leg 3 Zoom drills into blue children with it.
  function tipDocs(db, table, branch) {
    var out = [], want = String(table || '').toLowerCase();
    try {
      var r = db.exec("SELECT id, parameters FROM kernel_ops WHERE op_type='CREATE_DOCUMENT' AND undone=0" + _branchClause(branch) + " ORDER BY id ASC");
      if (!r.length) return out;
      r[0].values.forEach(function (row) {
        try {
          var p = JSON.parse(row[1]);
          if (p && String(p.table || '').toLowerCase() === want) out.push({ opId: row[0], doc: p });
        } catch (e) {}
      });
    } catch (e) {}
    return out;
  }

  // listTip — read-the-tip at the LIST level (SO_FULL_CRUD_GAP.md T2 / GAP 2 — Witness: W-CRUD-LIST).
  // PURE: the IMMUTABLE bundle rows for a table come in (baseRows, already read from glassbowl_data.db);
  // replay the signed op-log filtered to that table — CRUD_CREATE rows are UNIONed (surfacing newly raised
  // documents), CRUD_DELETE tombstones HIDE matching ids — latest-wins, in commit (id) order. The
  // CREATE/UPDATE/DELETE sibling of tipValues (field-level) lifted to the row set. glassbowl_data.db stays
  // the IMMUTABLE baseline — baseRows is NEVER mutated; created/hidden live only in the returned overlay.
  // Created rows get a SYNTHETIC negative pk (kernel op id, negated) so they are stable + collision-free
  // against real pks and survive a sidecar rehydrate (the op id is durable). A later CRUD_UPDATE/CRUD_DELETE
  // on a created row (keyed by that synthetic pk) folds latest-wins like any other. JS-side filter (no
  // json_extract dependency). Returns { rows, created:[pk…], hidden:[pk…] }.
  // BLUE FUTURE: `branch` (optional) — official-only by default; pass the active branch for the blue VIEW.
  function listTip(db, table, pkCol, baseRows, branch) {
    var rows = (baseRows || []).map(function (r) { var o = {}; for (var p in r) o[p] = r[p]; return o; });   // shallow copy — never mutate the baseline
    var byId = {}; rows.forEach(function (r) { byId[String(r[pkCol])] = r; });
    var created = [], hidden = [], updated = [], want = String(table || '').toLowerCase();
    if (!db) return { rows: rows, created: created, hidden: hidden, updated: updated };
    try {
      var r = db.exec("SELECT id, op_type, parameters, timestamp FROM kernel_ops WHERE op_type IN ('CRUD_CREATE','CRUD_UPDATE','CRUD_DELETE') AND undone=0" + _branchClause(branch) + " ORDER BY id ASC");
      if (!r.length || !r[0].values.length) return { rows: rows, created: created, hidden: hidden, updated: updated };
      r[0].values.forEach(function (row) {
        var opId = row[0], type = row[1], opTs = row[3], p;
        try { p = JSON.parse(row[2]); } catch (e) { return; }
        if (!p || String(p.table || '').toLowerCase() !== want) return;
        if (type === 'CRUD_CREATE') {
          var synth = -opId;                                  // synthetic, collision-free, durable pk for the new row
          var nr = {}; var f = p.fields || {}; for (var c in f) if (f.hasOwnProperty(c)) nr[c] = f[c];
          // Task 1 — iDempiere setStandardDefaults parity: fill audit+tenant cols from the recorded stdDefaults
          if (p.stdDefaults) {
            var sd = p.stdDefaults, tcols = _getTableCols(want), fkeys = {};
            for (var _fk in f) if (Object.prototype.hasOwnProperty.call(f, _fk)) fkeys[String(_fk).toLowerCase()] = 1;
            if (sd.actor != null) {
              if (tcols['createdby']  && !fkeys['createdby'])  nr['CreatedBy']  = sd.actor;
              if (tcols['updatedby']  && !fkeys['updatedby'])  nr['UpdatedBy']  = sd.actor;
            }
            if (opTs != null) {
              // iDempiere convention: Created/Updated are `yyyy-MM-dd HH:mm:ss` strings (match the seed rows)
              if (tcols['created'] && !fkeys['created']) nr['Created'] = _fmtKernelTs(opTs);
              if (tcols['updated'] && !fkeys['updated']) nr['Updated'] = _fmtKernelTs(opTs);
            }
            if (sd.clientId != null && tcols['ad_client_id'] && !fkeys['ad_client_id']) nr['AD_Client_ID'] = sd.clientId;
            if (sd.orgId    != null && tcols['ad_org_id']    && !fkeys['ad_org_id'])    nr['AD_Org_ID']    = sd.orgId;
            if (tcols['isactive']   && !fkeys['isactive'])   nr['IsActive']   = 'Y';
            if (tcols['processed']  && !fkeys['processed'])  nr['Processed']  = 'N';
            if (tcols['processing'] && !fkeys['processing']) nr['Processing'] = 'N';
            if (tcols['posted']     && !fkeys['posted'])     nr['Posted']     = 'N';
            console.log('§STD-DEFAULTS create table=' + want + ' client=' + sd.clientId + ' org=' + sd.orgId + ' by=' + sd.actor + ' active=Y');
          }
          nr[pkCol] = synth; byId[String(synth)] = nr; rows.push(nr);
          if (created.indexOf(synth) < 0) created.push(synth);
        } else if (type === 'CRUD_UPDATE') {
          var ex = (p.id != null) ? byId[String(p.id)] : null;   // a created row may be edited (keyed by its synthetic pk)
          if (ex) {
            if (updated.indexOf(p.id) < 0) updated.push(p.id);   // S2/J4 — report the touched row so the host overlay repaints on a pure edit
            // apply each change onto the EXISTING key case (the op keys lowercase via f.col, but a SELECT* bundle row
            //   carries original-case cols e.g. "Value"/"Name"; recVal returns the exact-case match first, so a
            //   lowercase parallel key would be invisible on the grid — P4 row-wise edit reflect). Match c-i, else add.
            var ch = p.changes || {};
            for (var cc in ch) if (ch.hasOwnProperty(cc)) {
              var nv = (ch[cc] && ch[cc].hasOwnProperty('new')) ? ch[cc].new : ch[cc];
              var tgt = Object.prototype.hasOwnProperty.call(ex, cc) ? cc : null;
              if (tgt == null) { for (var ek in ex) if (ex.hasOwnProperty(ek) && String(ek).toLowerCase() === String(cc).toLowerCase()) { tgt = ek; break; } }
              ex[tgt == null ? cc : tgt] = nv;
            }
            // Task 1 — stamp Updated/UpdatedBy for CRUD_UPDATE (iDempiere PO.save parity)
            var ucols = _getTableCols(want);
            if (opTs != null && ucols['updated'] && !Object.prototype.hasOwnProperty.call(ch, 'Updated') && !Object.prototype.hasOwnProperty.call(ch, 'updated')) ex['Updated'] = _fmtKernelTs(opTs);
            if (p.actor != null && ucols['updatedby'] && !Object.prototype.hasOwnProperty.call(ch, 'UpdatedBy') && !Object.prototype.hasOwnProperty.call(ch, 'updatedby')) ex['UpdatedBy'] = p.actor;
          }
        } else if (type === 'CRUD_DELETE') {
          if (p.id != null && hidden.indexOf(p.id) < 0) hidden.push(p.id);
        }
      });
    } catch (e) {}
    // apply tombstones last (a delete after a create on the same id still hides it).
    var hideSet = {}; hidden.forEach(function (h) { hideSet[String(h)] = 1; });
    rows = rows.filter(function (r) { return !hideSet[String(r[pkCol])]; });
    created = created.filter(function (c) { return !hideSet[String(c)]; });
    updated = updated.filter(function (u) { return !hideSet[String(u)]; });
    return { rows: rows, created: created, hidden: hidden, updated: updated };
  }

  // gateOp — the owner-gate + CAS pre-seal check (SO_FULL_CRUD_GAP.md T4 / GAP 4 — Witness: W-CRUD-GATE).
  // INVESTIGATED: kernel_ops.js commitGroup does NOT enforce owner/CAS (it gates only empty-group /
  // rate-as-input / expectedHash torn-group / tx-integrity), so an unauthorized edit would commit silently.
  // This lifts the EXISTING owner-gate / CAS policy from erp_replay.js (G-SINGLE-WRITER owner-gate +
  // set-if-unset CAS — W-OWNER, ERP.md §9-C/D/E) into a PURE pre-check the live commit funnel runs BEFORE
  // sealing. NON-INVENT: SAME rule, not a new policy — owner-gate = the editing actor MUST equal the
  // recorded owner; CAS = the op's expected baseline MUST match the record's current value. Identity is a
  // recorded INPUT (§0.21) — the gate READS owner/actor/cas, never recomputes them.
  //   ctx = { actor, owner, casCol?, casExpected?, casCurrent? }.
  // Only applies to an ownerGated op (op.ownerGated truthy); a non-gated op always passes (back-compat).
  // Missing actor/owner inputs → cannot prove ownership → REJECT reason=owner (fail-closed, never default-allow).
  // Returns { ok, reason? } where reason ∈ {owner, cas}.
  function gateOp(op, ctx) {
    if (!op || !op.ownerGated) return { ok: true };
    ctx = ctx || {};
    if (ctx.owner == null || ctx.actor == null || String(ctx.actor) !== String(ctx.owner))
      return { ok: false, reason: 'owner' };
    // CAS set-if-unset / set-if-match: when a cas column is declared and an expected baseline is supplied,
    // it must equal the record's current value (a stale read loses) — the erp_replay CLAIM CAS, generalized.
    if (op.cas != null || ctx.casCol != null) {
      if (ctx.casExpected !== undefined && ctx.casCurrent !== undefined && String(ctx.casExpected) !== String(ctx.casCurrent))
        return { ok: false, reason: 'cas' };
    }
    return { ok: true };
  }

  // ── group-aware Z fold (SO_FULL_CRUD_GAP.md T1 Part B) — Witness: W-SO-COMPLETE-UI ──────────────
  // A Complete now commits a GROUP (ship + invoice + status sharing one gid), so the history fold must
  // reverse/replay the WHOLE gesture — not one op. These are the REAL fold verbs (db + kernel in, no DOM);
  // the DOM foldBackDocOp/foldForwardDocOp delegate here, so deployed glassbowl.html's foldDocOps →
  // crudFoldBack(key,from,to) plumbing is REUSED UNCHANGED (no second history lane).
  function _foldLabel(opType, params) {
    if (opType === 'SET_STATUS') return 'status';
    if (opType === 'POST') return 'gl';
    var t = String((params && params.table) || '').toLowerCase();
    if (t.indexOf('m_inout') === 0) return 'ship';
    if (t.indexOf('c_invoice') === 0) return 'invoice';
    return t || String(opType || '').toLowerCase();
  }
  function _foldLabels(ops) {
    var seen = {}; ops.forEach(function (o) { seen[_foldLabel(o.op_type, o.parameters)] = 1; });
    var canon = ['ship', 'invoice', 'gl', 'status'];
    return canon.filter(function (l) { return seen[l]; })
      .concat(Object.keys(seen).filter(function (l) { return canon.indexOf(l) < 0; }));
  }
  // foldBackGroup — undo the TIP gesture WHOLE: if the most-recent non-undone op carries a gid, undo
  // EVERY non-undone op of that gid via the kernel verb (undoOp takes newest-first → REVERSE commit
  // order: status, then invoice, then ship); a gid-less op folds alone (back-compat). Group ops are
  // contiguous at the tip (one transaction), so the kernel verb never strays outside the gid — asserted.
  function foldBackGroup(db, K) {
    var out = { gid: null, undone: [], labels: [] };
    try {
      var r = db.exec('SELECT id, gid FROM kernel_ops WHERE undone=0 ORDER BY id DESC LIMIT 1');
      if (!r.length || !r[0].values.length) return out;
      out.gid = r[0].values[0][1] || null;
      var n = 1;
      if (out.gid) {
        var c = db.exec('SELECT COUNT(*) FROM kernel_ops WHERE undone=0 AND gid=' + JSON.stringify(out.gid));
        n = (c.length && c[0].values.length) ? Number(c[0].values[0][0]) : 1;
      }
      for (var i = 0; i < n; i++) { var u = K.undoOp(db); if (!u) break; out.undone.push(u); }
    } catch (e) {}
    out.labels = _foldLabels(out.undone);
    return out;
  }
  // foldForwardGroup — redo the EARLIEST undone gesture WHOLE (redoOp takes oldest-first → commit order).
  function foldForwardGroup(db, K) {
    var out = { gid: null, redone: [], labels: [] };
    try {
      var r = db.exec('SELECT id, gid FROM kernel_ops WHERE undone=1 ORDER BY id ASC LIMIT 1');
      if (!r.length || !r[0].values.length) return out;
      out.gid = r[0].values[0][1] || null;
      var n = 1;
      if (out.gid) {
        var c = db.exec('SELECT COUNT(*) FROM kernel_ops WHERE undone=1 AND gid=' + JSON.stringify(out.gid));
        n = (c.length && c[0].values.length) ? Number(c[0].values[0][0]) : 1;
      }
      for (var i = 0; i < n; i++) { var u = K.redoOp(db); if (!u) break; out.redone.push(u); }
    } catch (e) {}
    out.labels = _foldLabels(out.redone);
    return out;
  }

  // readTip — read-the-tip docstatus for (table,id) from the signed op-log: the latest NON-undone
  // SET_STATUS op's `to`, or null if none (caller treats null as the descriptor default, e.g. DR).
  // glassbowl_data.db stays the IMMUTABLE baseline; this sidecar log is the only mutable truth. Filters
  // in JS (no json_extract dependency) so it runs on any sql.js build.
  // BLUE FUTURE: `branch` (optional) — official docstatus by default; the blue VIEW folds blue SET_STATUS too.
  function readTip(db, table, id, branch) {
    // T7 fix 3 (W-T7-INC): memoized tip-fold (tip_fold.js) — O(new ops) per paint instead of a full
    // scan per (table,id). Verdict identical by construction (§T7-TIP); absent/erroring → legacy scan.
    if (global.TipFold) { try { return global.TipFold.readTip(db, table, id, branch); } catch (e) {} }
    try {
      var r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='SET_STATUS' AND undone=0" + _branchClause(branch) + " ORDER BY id DESC");
      if (!r.length || !r[0].values.length) return null;
      var rows = r[0].values;
      for (var i = 0; i < rows.length; i++) {
        var p = JSON.parse(rows[i][0]);
        if (p && p.table === table && String(p.id) === String(id)) return p.to || null;
      }
      return null;
    } catch (e) { return null; }
  }

  // normDateValue — seed an <input type=date>. HTML5 type=date accepts ONLY a strict yyyy-MM-dd value;
  // a stored TIMESTAMP ("2002-02-22 00:00:00" / "...21:09:00") is REJECTED → the widget renders BLANK →
  // the required check then sees an empty field and REJECTs (the user-reported bug). Slice the date
  // prefix so the widget seeds correctly. The AD model types every doc date column as `date` (date-only —
  // verified against crud_ops.json: c_order/m_inout/c_invoice/c_payment/c_allocationline all type=date),
  // so date-only is correct; the time component in the bundle is an incidental SQLite-TIMESTAMP artifact,
  // not a modeled time-of-day. PURE (no Date.now) — replay-safe. Non-date types pass through unchanged.
  function normDateValue(type, val) {
    if (type !== 'date') return val == null ? '' : val;
    var m = /^(\d{4}-\d{2}-\d{2})/.exec(String(val == null ? '' : val));
    return m ? m[1] : '';
  }

  // tipValues — read-the-tip FIELD VALUES for (table,id) from the signed op-log: replay every non-undone
  // CRUD_UPDATE op for that row in commit (id) order and return the merged {col: latest .new} overlay.
  // The DOC_ACTION peer is readTip (docstatus); this is its field-value sibling. glassbowl_data.db stays
  // the IMMUTABLE baseline — getRecord layers this overlay on the bundle row so the reopened form, the Z
  // fold-back, and every reader agree on the tip value. JS-side filter (no json_extract dependency).
  // BLUE FUTURE: `branch` (optional) — official field tip by default; the blue VIEW folds blue CRUD_UPDATE too.
  function tipValues(db, table, id, branch) {
    // T7 fix 3 (W-T7-INC): memoized (tip_fold.js), same fallback contract as readTip above.
    if (global.TipFold) { try { return global.TipFold.tipValues(db, table, id, branch); } catch (e) {} }
    var out = {};
    try {
      var r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='CRUD_UPDATE' AND undone=0" + _branchClause(branch) + " ORDER BY id ASC");
      if (!r.length || !r[0].values.length) return out;
      var rows = r[0].values;
      for (var i = 0; i < rows.length; i++) {
        var p = JSON.parse(rows[i][0]);
        if (!p || p.table !== table || String(p.id) !== String(id)) continue;
        var ch = p.changes || {};
        for (var c in ch) { if (ch.hasOwnProperty(c)) out[c] = (ch[c] && ch[c].hasOwnProperty('new')) ? ch[c].new : ch[c]; }
      }
    } catch (e) {}
    return out;
  }

  // listOptions — PURE. Implementing CRUD_EDIT_PERSIST.md residual (docstatus-select) — Witness: W-CRUD-DOCSTATUS.
  // Build the <option> list for a `list` field so the record's CURRENT value renders SELECTED. Pre-fix,
  // populateRefs read `data-cur` (which fieldInput never set) and never marked any option selected → the
  // select always landed on the FIRST __meta key (DR); gatherVals then read DR off a CO order and the save
  // diff emitted a docstatus flip the user never touched (the silent-corruption bug, UI_UNPARK_RESUME B-3).
  // A current value missing from the ref map is PREPENDED (kept), never silently swapped for the first option.
  function listOptions(optsMap, cur) {
    var keys = Object.keys(optsMap || {}), c = cur == null ? '' : String(cur);
    if (c !== '' && keys.indexOf(c) < 0) keys.unshift(c);
    return keys.map(function (k) {
      return { value: k, label: k + (optsMap && optsMap[k] ? ' · ' + optsMap[k] : ''), selected: c !== '' && k === c };
    });
  }

  // splitStatusChange — PURE. Implementing CRUD_EDIT_PERSIST.md residual (docstatus-select) — Witness: W-CRUD-DOCSTATUS.
  // docstatus is FSM state, not a field: an EXPLICIT status edit in the form must take the DOC_ACTION lane
  // (→ SET_STATUS, the op readTip folds), NEVER ride a CRUD_UPDATE column write — otherwise readTip (the
  // status truth doProcess derives `from` off) and tipValues (field truth) SPLIT-BRAIN on the same row:
  // the live-data corruption class. When the explicit target equals the descriptor's docAction.to, the
  // SAME requires-gating as the Process ▶ applies (docActionOutcome may demote to IP) — no bypass lane.
  // Returns {fieldOp, statusOp}: fieldOp = the CRUD_UPDATE minus docstatus (null if nothing else changed);
  // statusOp = a DOC_ACTION op for the explicit transition (null if docstatus untouched).
  function splitStatusChange(entry, op, values) {
    if (!op || op.op_type !== 'CRUD_UPDATE' || !op.changes || !Object.prototype.hasOwnProperty.call(op.changes, 'docstatus'))
      return { fieldOp: op, statusOp: null };
    var ch = op.changes.docstatus, rest = {}, n = 0, c;
    for (c in op.changes) if (c !== 'docstatus') { rest[c] = op.changes[c]; n++; }
    var fieldOp = null;
    if (n) { fieldOp = {}; for (c in op) fieldOp[c] = op[c]; fieldOp.changes = rest; }
    var to = ch['new'] == null ? null : String(ch['new']);
    var statusOp = { key: op.key, table: op.table, verb: 'process', op_type: 'DOC_ACTION', id: op.id,
      action: to,                                          // iDempiere DocAction codes mirror the target status (CO/CL/VO/RE)
      from: ch.old == null ? null : String(ch.old), to: to, outcome: 'success', unmet: [],
      ownerGated: !!op.ownerGated, op_uuid: op.op_uuid || null,
      oracle: (entry && entry.docAction && entry.docAction.oracle) || null };
    var da = entry && entry.docAction;
    if (da && to === String(da.to || 'CO')) {              // completing via the form → the SAME gate as Process ▶
      var r = docActionOutcome(entry, values || {});
      statusOp.action = r.action; statusOp.to = r.to; statusOp.outcome = r.outcome; statusOp.unmet = r.unmet;
    }
    return { fieldOp: fieldOp, statusOp: statusOp };
  }

  // §A1-DOC (HISTORY_SESSION_EVENTS.md) — Witness: W-DOC-DOTS. The Z-dot label for a COMMITTED op.
  // PURE: op in, label out — one label per commit gesture (Save/New/Delete/DocAction), never a keystroke.
  function docLabel(op, name) {
    var n = name || op.key;
    if (op.op_type === 'CRUD_CREATE') return 'New ' + n;
    if (op.op_type === 'CRUD_UPDATE') return 'Save ' + n;
    if (op.op_type === 'CRUD_DELETE') return 'Delete ' + n;
    if (op.op_type === 'DOC_ACTION') return op.action + ' ' + n + ' → ' + op.to;
    return null;
  }

  // ── S2B (AD-FOLDED CRUD GENERALITY) — derive a crud_ops-shaped entry FROM THE DICTIONARY so EVERY window is
  // editable per its OWN AD, not a curated 5-table allow-list (Janke/Compiere vision). PURE + headless-testable.
  // Input `adFields` = the renderer's already-folded field shape (ADParser.getFields): {columnName, name,
  // isMandatory, isReadOnly, isUpdateable, isKey, isDisplayed, referenceType, defaultValue, displayLogic}. We do
  // NOT re-derive types/refs — we MAP what the renderer already folded. opts: {key, title, isView, isReadOnly,
  // forVerb}. The signed write path (commitCrud→listTip overlay→reload-survival) is UNCHANGED; only the SPEC
  // SOURCE moves from the hand-list to the AD.
  // mapRefDisplayType — the AUTHORITATIVE map: iDempiere DisplayType id → the overlay form type vocab. Folded from
  //   the raw AD_Reference_ID (ADParser exposes `referenceId`) so it is correct even where the renderer's coarse
  //   REF_TYPES string is imperfect (e.g. 20=Yes-No, 18=Table). Returns null for an unknown id (→ string fallback).
  //   number: 11 Integer · 12 Amount · 22 Number · 29 Quantity. date: 15 Date · 16 DateTime · 24 Time. fk: 18 Table ·
  //   19 TableDir · 30 Search. id: 13 ID (hidden PK) · 28 Button (dropped by the caller). else (10 String · 14 Text ·
  //   17 List · 20 Yes-No · …) → string (LEG-1: list/yesno render as an editable text of the raw value; AD_Ref_List
  //   option-fold is a named follow-on).
  function mapRefDisplayType(rid) {
    switch (Number(rid)) {
      case 11: case 12: case 22: case 29: return 'number';
      case 15: case 16: case 24: return 'date';
      case 18: case 19: case 30: return 'fk';
      case 13: return 'id'; case 28: return 'button';
      // string-rendered ids — MUST be enumerated so a known id never falls through to the coarse referenceType
      // fallback (where 20=Yes-No is mislabelled 'table'→fk): 10 String · 14 Text · 17 List · 20 Yes-No · 21 Location
      // · 23 Binary · 25 Account · 31 Locator · 32 Image · 33 Assignment · 34 Memo · 35 PAttribute · 38 PrinterName.
      case 10: case 14: case 17: case 20: case 21: case 23: case 25: case 31: case 32: case 33: case 34: case 35: case 38: return 'string';
      default: return null;   // truly unknown id → caller falls back to the referenceType string
    }
  }
  // mapRefType — fallback by the renderer's coarse referenceType STRING (older callers / when no referenceId).
  function mapRefType(rt) {
    switch (rt) {
      case 'integer': case 'amount': case 'number': case 'quantity': return 'number';
      case 'date': case 'datetime': return 'date';
      case 'tableDirect': case 'table': case 'search': return 'fk';
      case 'id': return 'id'; case 'button': return 'button';
      default: return 'string';   // string · text · char · list · yesno · unknown
    }
  }
  function foldCrudSpec(adFields, opts) {
    opts = opts || {};
    var roTable = !!opts.isView || !!opts.isReadOnly;     // AD_Table.IsView or AD_Tab.IsReadOnly → the whole row is read-only
    var forVerb = opts.forVerb || 'update';
    var fields = (adFields || []).map(function (f) {
      // type from the AUTHORITATIVE AD_Reference_ID; fall back to the coarse referenceType string.
      var type = (f && f.referenceId != null ? mapRefDisplayType(f.referenceId) : null) || mapRefType(f && f.referenceType);
      return f && f.isDisplayed && !f.isKey && type !== 'button' && type !== 'id' ? { f: f, type: type } : null;
    }).filter(Boolean).map(function (ft) {
      var f = ft.f, type = ft.type;
      // IsUpdateable='N' is SETTABLE on New (iDempiere fills it once) but display-only on Edit; isReadOnly + a
      // read-only table/tab are always read-only.
      var readonly = !!f.isReadOnly || roTable || (forVerb === 'update' && f.isUpdateable === false);
      var spec = { col: String(f.columnName).toLowerCase(), label: f.name || f.columnName, type: type,
                   required: !!f.isMandatory, readonly: readonly };
      // DEFAULTS: resolve the well-known AD context variables iDempiere's Env fills on New (@#AD_Client_ID@,
      // @#AD_Org_ID@, @#Date@) from opts.ctx — so a mandatory system column (AD_Client_ID/AD_Org_ID) doesn't block a
      // folded create; keep PLAIN literals (0/N/Y/DR…); drop any OTHER unevaluated expression (@SQL=…, functions) —
      // we don't run the full AD default-expression language here (named follow-on), and never seed an un-evaluated
      // token (it would fail the field validator). Edit pre-fills the real row regardless.
      var d = f.defaultValue, ctx = opts.ctx || {};
      if (d != null && String(d) !== '') {
        var ds = String(d);
        if (ds === '@#AD_Client_ID@' && ctx.clientId != null) spec.default = ctx.clientId;
        else if (ds === '@#AD_Org_ID@' && ctx.orgId != null) spec.default = ctx.orgId;
        else if (ds === '@#Date@' && ctx.today) spec.default = ctx.today;
        else if (!/[@()]/.test(ds)) spec.default = d;
      }
      if (type === 'fk') spec.ref = String(f.columnName).toLowerCase().replace(/_id$/, '');
      if (f.displayLogic != null && String(f.displayLogic).trim() !== '') spec.displaylogic = f.displayLogic;
      return spec;
    });
    return { key: opts.key, title: opts.title || opts.key, folded: true, isView: !!opts.isView,
             verbs: roTable ? [] : ['create', 'update', 'delete'], fields: fields };
  }

  var CORE = {
    entriesOf: entriesOf, verbEnabled: verbEnabled, defaultsFor: defaultsFor,
    foldCrudSpec: foldCrudSpec, mapRefType: mapRefType,                          // S2B: AD-folded CRUD spec (general, not curated)
    validateField: validateField, validate: validate, effectiveFlags: effectiveFlags, cleanVals: cleanVals, buildOp: buildOp,
    docActionOutcome: docActionOutcome, legalDocActions: legalDocActions, kernelParamsFor: kernelParamsFor, readTip: readTip, tipValues: tipValues,
    normDateValue: normDateValue, buildDocActionGroup: buildDocActionGroup, docLabel: docLabel,
    listOptions: listOptions, splitStatusChange: splitStatusChange,
    docPolicyFor: docPolicyFor, tipDocs: tipDocs,                              // T1: fan-out policy + created-doc tip
    foldBackGroup: foldBackGroup, foldForwardGroup: foldForwardGroup,          // T1 Part B: group-aware Z fold
    listTip: listTip, gateOp: gateOp,                                           // T2: list read-the-tip · T4: owner-gate/CAS pre-check
    changeLog: changeLog, recordInfo: recordInfo, fmtKernelTs: _fmtKernelTs,     // Task 2: per-record AD-filtered change trail + iDempiere ts format · Item 3a (W-RECINFO): always-on record-level last-touch
    fieldLineage: fieldLineage,                                                  // Item 3b (W-FIELD-LINEAGE): always-on per-field value history (kills AD_ChangeLog)
    draftPut: draftPut, draftGet: draftGet, draftClear: draftClear, draftList: draftList,
    draftDirty: draftDirty, draftChangedCols: draftChangedCols, draftDrift: draftDrift   // Item 1 (W-DRAFT-RESTORE): private draft buffer — unsaved typing, never an official dot
  };

  // node (headless witness): export the core and stop — no DOM to attach.
  if (typeof module !== 'undefined' && module.exports) { module.exports = CORE; return; }
  if (typeof document === 'undefined') return;

  // ════════════════════════════════════════════════════════════════════════
  // DOM OVERLAY — Edit-mode toggle + animated semicircle ring + form (browser).
  // ════════════════════════════════════════════════════════════════════════
  injectCss();
  var STORE = null, on = false, raf = 0, hots = [], ring = null, ringKey = null, form = null;
  // INLINE CRUD (P2 — prompts/CRUD_INPLACE_EDIT_SESSION.md). fhost = the element that currently HOLDS the open
  // form's field rows. The shared helpers (fieldInput/populateRefs/applyAdLogic/gatherVals/saveForm/restoreDraft)
  // all query fhost, so the SAME engine serves two mounts: the modal #crudForm (Glass/Gravity ring) and the
  // iDempiere form view rendered INLINE (no modal, no ✎ Edit). _inlineHost!=null ⇒ the open form is the inline one.
  var fhost = null, _inlineHost = null, _inlineBaseline = null, _inlineOpts = null, _inlinePendingNew = false;
  // Item 1 (PRIVATE DRAFT RESTORE, W-DRAFT-RESTORE-LIVE) — the OPEN form's context, so closeForm/beforeunload can
  // buffer the unsaved typing for (table,id) WITHOUT committing an official op. Cleared by closeForm. _draftSeq is
  // a monotonic ts (no Date.now — the draft buffer is not the op-log but we keep determinism anyway).
  var _formCtx = null, _draftSeq = 0;
  function _draftStore() { try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; } }
  var ICONS = [
    { verb: 'create', glyph: '＋', cls: 'new',  title: 'New' },
    { verb: 'view',   glyph: '👁', cls: 'view', title: 'View data' },
    { verb: 'update', glyph: '✎',  cls: 'edit', title: 'Edit' },
    { verb: 'delete', glyph: '–',  cls: 'del',  title: 'Delete' },
    { verb: 'process', glyph: '▶', cls: 'proc', title: 'Process (DocAction)' },
    { verb: 'report',  glyph: '▤', cls: 'rpt',  title: 'Report (receipt)' }   // read face — always on (CRUD_P_R_REPORT.md R1)
  ];
  var RING_R = 50, FAB = 30, ARC0 = -68, ARC1 = 68;   // semicircle fan on the bubble's right

  // Edit-mode pill (peer to NeedHelp?, sits to its left). OFF by default — CRUD mutates.
  var wrap = document.createElement('label'); wrap.id = 'crudModeWrap';
  wrap.innerHTML = '<input type="checkbox" id="crudModeCk"><span>✎ Edit mode</span>';
  document.body.appendChild(wrap);
  ring = document.createElement('div'); ring.id = 'crudRing'; document.body.appendChild(ring);
  // STICKY ring (R, 2026-06-01): once revealed, the ring of fire STAYS — the small fabs must not vanish
  // while the user reaches for them (and the Guide's pulse-reveal must persist too). It is dismissed ONLY by
  // an EXPLICIT act: picking a verb (onVerb→closeRing), opening another bubble's ring (openRing replaces),
  // or a pointerdown OUTSIDE the ring + hotzones. No hover-leave auto-close.
  document.addEventListener('pointerdown', function (ev) {
    if (!ring.classList.contains('open')) return;
    if (ev.target && ev.target.closest && (ev.target.closest('#crudRing') || ev.target.closest('.crud-hot'))) return;
    closeRing();
  });
  form = document.createElement('div'); form.id = 'crudForm'; document.body.appendChild(form); fhost = form;
  // #docStatusBar — the statusbar element-kind TARGET the Help guide highlights ("note the status").
  // Reflects the lit / last-processed document's docstatus; hidden until a Process runs (CRUD_OVERLAY.md §Process).
  var statusBar = document.createElement('div'); statusBar.id = 'docStatusBar';
  statusBar.innerHTML = '<span class=dsbk>—</span><span class=dsbv>no document processed</span>';
  document.body.appendChild(statusBar);
  var ck = document.getElementById('crudModeCk');

  // setDocStatus — paint the bar from a DocAction outcome (DR/IP/CO/CL). IP shows amber (unsatisfied condition).
  function setDocStatus(key, status, outcome, unmet) {
    var label = (STORE && STORE.__meta && STORE.__meta.docStatus && STORE.__meta.docStatus[status]) || status;
    statusBar.className = 'show s-' + status + (outcome === 'in-progress' ? ' ip' : '');
    var note = (outcome === 'in-progress' && unmet && unmet.length) ? ' — needs: ' + unmet.join(', ') : '';
    statusBar.innerHTML = '<span class=dsbk>' + esc(fname(key)) + '</span><span class=dsbv>' + esc(status + ' · ' + label + note) + '</span>';
  }
  ck.addEventListener('change', function () { if (ck.checked) enable(); else disable(); });
  // Item 1 + Leg 4 (W-DIRTY-GATE) — leaving the PAGE with real unsaved content: iDempiere prompts on exit, so we
  //   trigger the browser's native "leave site?" prompt (preventDefault + returnValue) AND still buffer the typing
  //   as a private restore-point (the two coexist — the gate is the publish-honesty, the buffer is the safety net).
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', function (ev) {
    try {
      if (_inlineContentDirty()) { ev.preventDefault(); ev.returnValue = ''; }
      _bufferDraft();
    } catch (e) {}
  });

  function today() { try { return new Date().toISOString().slice(0, 10); } catch (e) { return ''; } }
  // S2B — FOLDED holds host-registered AD-folded specs (one per non-curated table). entryFor prefers the CURATED
  //   crud_ops entry (it carries docPolicy fan-out / ownerGate / docAction); else falls back to the folded spec so
  //   ANY window is editable per its own dictionary. Lower-cased key, mirrors crud_ops keys.
  var FOLDED = {};
  function registerFolded(key, entry) { if (key && entry) FOLDED[String(key).toLowerCase()] = entry; }
  function entryFor(key) {
    if (STORE && !isMeta(key) && STORE[key]) { var e = STORE[key]; e.key = key; return e; }
    var f = FOLDED[String(key).toLowerCase()];
    if (f) { f.key = String(key).toLowerCase(); return f; }
    return null;
  }
  function hasEntry(key) { return !!(STORE && !isMeta(key) && STORE[key]) || !!FOLDED[String(key).toLowerCase()]; }

  // _ensureStore — load the keyed crud_ops.json store once (idempotent). Shared by Edit-mode enable AND the
  // host DocAction lane (hostProcess), which fires WITHOUT enabling Edit mode and still needs the store's
  // entry config + __meta.docPolicy. cb runs once STORE is available (or on load-error, with STORE still null).
  function _ensureStore(cb) {
    if (STORE) { cb(); return; }
    fetch('crud_ops.json').then(function (r) { return r.json(); }).then(function (j) { STORE = j; cb(); })
      .catch(function (e) { console.warn('§CRUD store load-error', e && e.message); cb(); });
  }

  // ── enable/disable ────────────────────────────────────────────────────────
  function enable() {
    on = true;
    _ensureStore(function () {
      buildHots();
      if (!raf) raf = requestAnimationFrame(loop);
      console.log('§CRUD mode=on rings=' + hots.length);
    });
  }
  function disable() { on = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } clearHots(); closeRing(); closeForm(); statusBar.className = ''; console.log('§CRUD mode=off'); }

  // ── hover hotzones (one per qualifying, on-screen bubble) ──────────────────
  function buildHots() {
    clearHots();
    CORE.entriesOf(STORE).forEach(function (e) {
      if (typeof idx === 'undefined' || idx[e.key] == null) return;     // entry points at an absent bubble — skip (drift caught by witness)
      var h = document.createElement('div'); h.className = 'crud-hot'; h.setAttribute('data-key', e.key);
      h.addEventListener('pointerenter', function () { openRing(e.key); });   // reveal on hover…
      h.addEventListener('click', function () { openRing(e.key); });          // …or tap (mobile). Ring is STICKY — no leave-close.
      document.body.appendChild(h); hots.push({ el: h, key: e.key });
    });
  }
  function clearHots() { hots.forEach(function (h) { if (h.el.parentNode) h.el.parentNode.removeChild(h.el); }); hots = []; }

  // bubbleXY — where the ring/hotzone anchors for `key`. Glassbowl: the projected bubble center.
  // HOST-ANCHORED (SO_FULL_CRUD_GAP.md T3 / GAP 3): on a surface with no bubble model (e.g. the iDempiere
  // renderer — no N/idx/project), the host supplies the anchor via global.__crudHostAnchor(key) → {x,y,r}
  // (e.g. the focused record's row/edit-button rect). ONE overlay, two anchors — no fork. Returns null when
  // neither is available (ring/hot self-hides).
  function bubbleXY(key) {
    if (typeof idx !== 'undefined' && idx[key] != null && typeof N !== 'undefined') {
      var n = N[idx[key]]; if (n) { project(n);
        var r = (typeof radius === 'function' ? radius(n) : 14);
        return { x: px + n.sx * k, y: py + n.sy * k, r: Math.max(13, r * k) }; }
    }
    if (typeof global.__crudHostAnchor === 'function') {
      try { var a = global.__crudHostAnchor(key); if (a && a.x != null && a.y != null) return { x: a.x, y: a.y, r: a.r || 16 }; } catch (e) {}
    }
    return null;
  }
  function positionHots() {
    hots.forEach(function (h) {
      var p = bubbleXY(h.key);
      if (!p) { h.el.style.display = 'none'; return; }
      var d = Math.max(26, Math.min(120, p.r * 2));
      h.el.style.display = 'block'; h.el.style.width = d + 'px'; h.el.style.height = d + 'px';
      h.el.style.left = p.x + 'px'; h.el.style.top = p.y + 'px';
    });
  }

  // ── the animated ring of fire ──────────────────────────────────────────────
  function openRing(key) {
    var e = entryFor(key); if (!e) return;
    if (ringKey === key && ring.classList.contains('open')) return;
    ringKey = key; ring.innerHTML = '';
    var enabledVerbs = (e.verbs || []);
    ICONS.forEach(function (ic, i) {
      var enabled = (ic.verb === 'view' || ic.verb === 'report') || CORE.verbEnabled(e, ic.verb);  // read verbs are free
      var fab = document.createElement('button');
      fab.className = 'crud-fab ' + ic.cls + (enabled ? '' : ' dis');
      fab.textContent = ic.glyph;
      fab.title = enabled ? (ic.title + ' ' + fname(key)) : (ic.title + ' — not permitted on this document');
      fab.disabled = !enabled;
      var th = (ARC0 + i * (ARC1 - ARC0) / (ICONS.length - 1)) * Math.PI / 180;
      fab.setAttribute('data-x', Math.round(Math.cos(th) * RING_R));
      fab.setAttribute('data-y', Math.round(Math.sin(th) * RING_R));
      fab.style.transitionDelay = (i * 45) + 'ms';
      if (enabled) fab.addEventListener('click', function (ev) { ev.stopPropagation(); onVerb(ic.verb, key); });
      ring.appendChild(fab);
    });
    ring.classList.add('open');
    positionRing(); requestAnimationFrame(fanOut);
    console.log('§CRUD ring key=' + key + ' verbs=[' + enabledVerbs.join(',') + '] view=on');
  }
  function fanOut() {
    Array.prototype.forEach.call(ring.children, function (fab) {
      fab.style.transform = 'translate(-50%,-50%) translate(' + fab.getAttribute('data-x') + 'px,' + fab.getAttribute('data-y') + 'px) scale(1)';
      fab.style.opacity = fab.classList.contains('dis') ? '.4' : '1';
    });
  }
  function positionRing() {
    if (!ringKey) return; var p = bubbleXY(ringKey);
    if (!p) { closeRing(); return; }
    ring.style.left = (p.x + p.r * 0.55) + 'px'; ring.style.top = p.y + 'px';
  }
  function closeRing() { if (!ring.classList.contains('open')) { ringKey = null; return; } ring.classList.remove('open'); ringKey = null; ring.innerHTML = ''; }

  // ── key-addressed intent bus (governance: neither overlay imports the other) ──
  // Announce every verb gesture BY KEY so the Help guide can detect an off-path veer (§veer).
  function emitAction(verb, key) {
    try { global.dispatchEvent(new CustomEvent('overlay:action', { detail: { verb: verb, key: key } })); } catch (e) {}
  }

  // ── verb dispatch (kind-aware) ──────────────────────────────────────────────
  function onVerb(verb, key) {
    closeRing();
    emitAction(verb, key);
    var e = entryFor(key); if (!e) return;
    if (verb === 'view') { if (window.openDossier) window.openDossier(key); console.log('§CRUD view key=' + key + ' drove=[openDossier]'); return; }
    if (verb === 'report') {                               // read face — hand off to report_overlay via the bus (no import; CRUD_P_R_REPORT.md R1)
      try { global.dispatchEvent(new CustomEvent('overlay:report', { detail: { key: key } })); } catch (er) {}
      console.log('§CRUD report key=' + key + ' drove=[overlay:report]'); return;
    }
    if (verb === 'delete') { openDeleteConfirm(e); return; }
    if (verb === 'process') { doProcess(e); return; }
    openForm(verb, e);                     // create | update
  }

  // doProcess — DocAction (Process): runs the document state machine, NOT a row write. Reads the
  // lit/first row's values, READS-THE-TIP for the current docstatus (`from`, from the signed sidecar log,
  // else the descriptor default), derives the outcome (CO success | IP unsatisfied) via CORE, then commits
  // it as a REAL signed op (GP3). glassbowl_data.db is never mutated — the op-log is the only truth.
  function doProcess(e) {
    getRecord(e.key, function (rec) {
      var vals = assignVals(e, rec), id = recId(e.key, rec);
      withSidecar(function (db) {
        var from = (db ? CORE.readTip(db, e.key, id, _readBranch()) : null) || (e.docAction && e.docAction.from) || 'DR';
        applyOp(CORE.buildOp('process', e, vals, rec, { id: id, from: from }), e);
      });
    });
  }

  // ── hostProcess (S1/J5 — ERP_CRITIC_UX_LANE) — the host-callable parameterized doProcess. iDempiere's OWN
  // DocAction surfaces (form Process ▶ pill, DocAction bar, grid gear-batch) call this to EXECUTE + SIGN a
  // chosen action on the SHARED signed lane: applyOp → commitProcess → completeFanout → signed commitGroup →
  // persist. NO ring STORE entry is required and the ring NEVER opens — the op is built from explicit params.
  // The host FSM (AdDocFsm via _fsmCtx) decides WHICH action is legal + its transition; this lane signs EXACTLY
  // that one (no split-brain — `to`/`outcome` come from the caller). ownerGated/oracle reuse the SAME crud_ops
  // entry the ring path uses (entryFor), so behaviour is identical to the proven W-SO-COMPLETE-UI ring path.
  // opts = { from, to, outcome, doctypeId, ownerGated, oracle }. Returns the DOC_ACTION op (already fired).
  function hostProcess(table, id, action, opts) {
    opts = opts || {};
    // ensure the crud_ops store is loaded BEFORE building/committing: it carries the entry (ownerGated/oracle)
    // AND __meta.docPolicy (the fan-out decision table). It is otherwise loaded lazily only on Edit-mode enable —
    // the ring path toggled ✎ first; iDempiere's pill/bar/batch do NOT, so without this the fan-out would always
    // gate "no DOCPOLICY" and the owner-gate would be skipped. Idempotent; cached after the first call.
    _ensureStore(function () {
      var key = String(table || '').toLowerCase();
      var e = entryFor(key);
      var from = opts.from || 'DR';
      var to = opts.to != null ? opts.to : from;
      var outcome = opts.outcome || 'success';
      // ownerGated defaults FALSE for a host DocAction: iDempiere governs Complete/Void/Close by ROLE access +
      // FSM legality + period — NOT by "only the document's creator" (the createdby owner-gate is the glassbowl
      // field-edit lane's single-writer rule, and it would here read the lit/first row, not op.id). The signed
      // commit + chain verification still apply (integrity intact). A caller may opt INTO owner-gating via opts.
      var op = { key: key, table: key, verb: 'process', op_type: 'DOC_ACTION',
                 ownerGated: !!opts.ownerGated,
                 op_uuid: null, id: id == null ? null : id,
                 action: action, from: from, to: to, outcome: outcome, unmet: [],
                 oracle: opts.oracle || (e && e.docAction && e.docAction.oracle) || null };
      if (action === 'RC' || action === 'RA') op.reversal = true;
      console.log('§CRUD-HOSTPROCESS table=' + key + ' id=' + op.id + ' action=' + action + ' from=' + from + ' to=' + to + ' outcome=' + outcome + ' ownerGated=' + op.ownerGated);
      applyOp(op);
    });
  }

  // ── hostCreate (S2/J4 — ERP_CRITIC_UX_LANE) — the host-callable New. iDempiere's OWN New pill calls this to
  // open the SAME create form the ring's ＋ verb opens (openForm('create', …)) WITHOUT fanning the visual ring
  // (doctrine §0: the ring is Glass/Gravity-only; iDempiere keeps its own surface). _ensureStore first so the
  // crud_ops entry (fields + validation) is present even though Edit-mode was never toggled — same reason
  // hostProcess pre-loads it. Save = the form's #cfSave → saveForm → ONE signed CRUD_CREATE (commitCrud), the
  // proven write lane. Returns nothing; the form drives the rest.
  function hostCreate(table) {
    _ensureStore(function () {
      var key = String(table || '').toLowerCase();
      var e = entryFor(key);
      if (!e) { console.log('§CRUD-HOSTCREATE table=' + key + ' skipped (not in crud_ops)'); return; }
      if (!CORE.verbEnabled(e, 'create')) { console.log('§CRUD-HOSTCREATE table=' + key + ' skipped (create not permitted)'); return; }
      console.log('§CRUD-HOSTCREATE table=' + key + ' open=create-form (ring not fanned)');
      openForm('create', e);
    });
  }
  // ── hostUpdate / hostDelete (S2/J4 full-CRUD) — the host-callable Edit + Delete, the change-twin of hostCreate.
  // iDempiere's OWN Edit/Delete pills call these to open the edit form / delete-confirm DIRECTLY on a SPECIFIC
  // record id (the open record), WITHOUT fanning the visual ring (doctrine §0). Same proven write lane:
  // openForm('update') → #cfSave → saveForm → signed CRUD_UPDATE; openDeleteConfirm → signed CRUD_DELETE. The
  // _overlayListTip fold then overlays the edit / tombstones the row in the grid (survives reload). Change is the
  // most basic AD usage — re-pointed off the ring so it works on iDempiere's surface, not just the Glass ring.
  function hostUpdate(table, id) {
    _ensureStore(function () {
      var key = String(table || '').toLowerCase(), e = entryFor(key);
      if (!e) { console.log('§CRUD-HOSTUPDATE table=' + key + ' skipped (not in crud_ops)'); return; }
      if (!CORE.verbEnabled(e, 'update')) { console.log('§CRUD-HOSTUPDATE table=' + key + ' skipped (update not permitted)'); return; }
      console.log('§CRUD-HOSTUPDATE table=' + key + ' id=' + (id == null ? 'null' : id) + ' open=edit-form (ring not fanned)');
      openForm('update', e, id == null ? null : id);
    });
  }
  function hostDelete(table, id) {
    _ensureStore(function () {
      var key = String(table || '').toLowerCase(), e = entryFor(key);
      if (!e) { console.log('§CRUD-HOSTDELETE table=' + key + ' skipped (not in crud_ops)'); return; }
      if (!CORE.verbEnabled(e, 'delete')) { console.log('§CRUD-HOSTDELETE table=' + key + ' skipped (delete not permitted)'); return; }
      console.log('§CRUD-HOSTDELETE table=' + key + ' id=' + (id == null ? 'null' : id) + ' open=delete-confirm (ring not fanned)');
      openDeleteConfirm(e, id == null ? null : id);
    });
  }

  // ── §CRUD-CALLOUT (S2/J4) — fire the PROVEN AD callout engine (ad_callout.js, W-CALLOUT) on a create-form
  // field change so price/defaults FILL like iDempiere, instead of being hand-typed. The dispatch + the line
  // handlers (amt/qty/product) are the ENGINE's; the W-CALLOUT witness PINS installDefaultHandlers at 6, so the
  // header bPartner default is registered HERE as HOST GLUE (not in the engine) — a faithful CalloutOrder.bPartner
  // slice: bill-to defaults to the order BP, the price list from that BP. The accessors (bpDefaults/productPrice)
  // read the immutable bundle (the real join), never invent. NON-INVENT: the callout NAME + the field it fires on
  // are AD data (ad_column.callout); every derived value traces to a bundle row.
  var _calloutHostReady = false;
  function _ensureHostCallouts() {
    if (_calloutHostReady || !global.AdCallout) return;
    _calloutHostReady = true;
    if (!global.AdCallout.hasHandler('org.compiere.model.CalloutOrder.bPartner')) {
      global.AdCallout.registerHandler('org.compiere.model.CalloutOrder.bPartner', function (ctx, info) {
        var r = info.record || {};
        var bp = Number(r.C_BPartner_ID || r.c_bpartner_id || 0); if (!bp) return { derived: {} };
        var d = {};
        var billNow = Number(r.Bill_BPartner_ID || r.bill_bpartner_id || 0);
        if (!billNow) d.Bill_BPartner_ID = bp;                              // bill-to defaults to the order BP
        var pl = ctx.bpDefaults ? ctx.bpDefaults(bp) : null;               // price list from the BP (SO)
        if (pl && pl.priceListId != null && pl.priceListId !== '') d.M_PriceList_ID = pl.priceListId;
        return { derived: d, note: 'bill+pricelist defaulted from BP ' + bp };
      });
      console.log('§CRUD-CALLOUT host bPartner handler registered (CalloutOrder.bPartner — bill+pricelist default; engine handlers untouched)');
    }
  }
  function fireCreateCallout(e, changedCol) {
    if (!global.AdCallout || typeof withBundle !== 'function' || !e || !changedCol) return;
    _ensureHostCallouts();
    withBundle(function (bdb) {
      if (!bdb) return;
      var b3 = _mvB3(bdb), vals = gatherVals(e);
      var ctx = {
        bpDefaults: function (bpId) {
          try { var row = b3.prepare('SELECT m_pricelist_id FROM c_bpartner WHERE c_bpartner_id=?').get(Number(bpId));
            return row ? { priceListId: row.m_pricelist_id } : null; } catch (er) { return null; }
        },
        productPrice: function (pid) {   // forward-compat for a c_orderline create (next leg) — the real price-list join
          try { var row = b3.prepare('SELECT pp.pricestd, pp.pricelist FROM m_productprice pp JOIN m_pricelist_version v ON v.m_pricelist_version_id=pp.m_pricelist_version_id WHERE pp.m_product_id=? LIMIT 1').get(Number(pid));
            return row ? { priceStd: row.pricestd, priceList: row.pricelist } : null; } catch (er) { return null; }
        }
      };
      var res = global.AdCallout.dispatch(b3, { table: e.key, column: changedCol, record: vals }, ctx) || {};
      var derived = res.derived || {}, applied = [];
      Object.keys(derived).forEach(function (c) {
        var inEl = fhost.querySelector('[data-col="' + c + '"]') || fhost.querySelector('[data-col="' + String(c).toLowerCase() + '"]');
        if (inEl && !inEl.disabled) { inEl.value = derived[c] == null ? '' : derived[c]; applied.push(c); }
      });
      var short = function (n) { return String(n).split('.').slice(-2).join('.'); };
      console.log('§CRUD-CALLOUT table=' + e.key + ' col=' + changedCol + ' callouts=[' + (res.callouts || []).map(short).join(',') + '] fired=[' + (res.fired || []).map(short).join(',') + '] absent=[' + (res.absent || []).map(short).join(',') + '] derived=' + JSON.stringify(derived) + ' applied=[' + applied.join(',') + ']');
      if (applied.length && typeof applyAdLogic === 'function') try { applyAdLogic(e); } catch (er) {}
    });
  }

  // ── the form (bubble kind -> document form of its fields[]) ─────────────────
  function openForm(verb, e, wantId) {
    var isEdit = verb === 'update';
    getRecord(e.key, function (rec) {
      var orig = isEdit ? (rec || {}) : null;
      var vals = isEdit ? assignVals(e, rec) : CORE.defaultsFor(e, today());
      if (!isEdit) _seedDocNoPreview(e, vals);                 // pre-fill DocumentNo with the sequence preview (iDempiere New convention)
      renderForm(verb, e, vals, orig, isEdit ? recId(e.key, rec) : null);
    }, wantId);
  }
  // _seedDocNoPreview — fill an empty DocumentNo on a New form with the sequence preview (the real next number,
  //   so the numeric val rule passes); _allocDocNo finalises (consumes the sequence) on Save. NON-INVENT: the
  //   number comes from AD_Sequence, never fabricated; if the table has no documentno field or no sequence, no-op.
  function _seedDocNoPreview(e, vals) {
    if (!e || !(e.fields || []).some(function (f) { return String(f.col).toLowerCase() === 'documentno'; })) return;
    var cur = vals.documentno;
    if (cur != null && String(cur) !== '' && String(cur) !== 'auto') return;   // a real default already present → keep
    var pv = _previewDocNo(e.key, vals);                       // GAP (c): honour the doctype's controlled sequence when vals carry a C_DocType
    vals.documentno = pv != null ? pv : '';
    if (pv != null) console.log('§DOCNO-PREVIEW table=' + e.key + ' documentno=' + pv + ' (sequence preview, finalised on Save)');
  }
  function renderForm(verb, e, vals, orig, id) {
    var title = (verb === 'create' ? '＋ New ' : '✎ Edit ') + fname(e.key);
    var h = '<span class=cfx title=close>✕</span><div class=cfh>' + title + '</div><div class=cfbody>';
    (e.fields || []).forEach(function (f) {
      h += '<label class=cfrow data-row="' + f.col + '"><span class=cfl>' + esc(f.label || f.col) + ' <i class=req data-req="' + f.col + '" style="display:none">*</i></span>' + fieldInput(f, vals[f.col]) + '<span class="cfe" data-col="' + f.col + '"></span></label>';
    });
    h += '</div><div class=cfnav><span class=cfnote>dry-run — logs the op it would apply (E3 wires the signed kernel)</span><span class=cfgrow></span>' +
         '<button class=cfb id=cfCancel>Cancel</button><button class="cfb cfsave" id=cfSave>' + (verb === 'create' ? 'Create' : 'Save') + '</button></div>';
    fhost = form; _inlineHost = null;                           // modal mount (Glass/Gravity ring path)
    form.innerHTML = h; form.className = 'open';
    populateRefs(e);
    applyAdLogic(e);                                            // §AD-LOGIC-LIVE — initial show/hide/enable/require off the AD
    var body = form.querySelector('.cfbody');                   // …and re-apply on every edit so the form REACTS like iDempiere
    if (body) { body.addEventListener('input', function () { applyAdLogic(e); }); body.addEventListener('change', function () { applyAdLogic(e); }); }
    // §CRUD-CALLOUT (S2/J4) — on a create form, a field change fires the AD callout (price/defaults FILL like
    //   iDempiere: e.g. C_BPartner_ID → bill-to + price list). Fires AFTER applyAdLogic; derived siblings filled.
    if (verb === 'create' && body) body.addEventListener('change', function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('[data-col]') : null;
      var col = el ? el.getAttribute('data-col') : null;
      if (col) fireCreateCallout(e, col);
    });
    form.querySelector('.cfx').addEventListener('click', closeForm);
    form.querySelector('#cfCancel').addEventListener('click', closeForm);
    form.querySelector('#cfSave').addEventListener('click', function () { saveForm(verb, e, orig, id); });
    // Item 1 — track the open form so a leave (close/nav) buffers the unsaved typing; offer restore on reopen.
    _formCtx = { verb: verb, e: e, id: id, baseline: orig || {} };
    if (verb === 'update') _offerDraftRestore(e, id);
  }
  // ── Item 1 (PRIVATE DRAFT RESTORE) — Save is the publish boundary: an unsaved edit is PRIVATE/local and must
  // NEVER become an official dot or leak to other docs (they read the committed tip). On leave we refresh a private
  // buffer + an amber dirty-pip (distinct from committed dots); on return the form DEFAULTS to the saved tip and the
  // pip lets the user OPT IN to restore their typing. Witness: W-DRAFT-RESTORE-LIVE. Engine: W-DRAFT-RESTORE 14/14.
  function _bufferDraft() {
    if (!_formCtx || _formCtx.verb !== 'update') return null;
    var st = _draftStore(); if (!st) return null;
    var vals = gatherVals(_formCtx.e);
    // P5 (phantom-draft-pip fix): diff against the POST-RENDER baseline on an inline form — `_formCtx.baseline` is the
    //   RAW record, but populateRefs/fieldInput normalize on render (date→yyyy-MM-dd, an fk select landing on another
    //   option, number coercion), so an UNTOUCHED open would read those as "changed" → a spurious AMBER pip + a
    //   §DRAFT-PUT the user never typed. `_inlineBaseline` is the same as-rendered baseline _inlineDirty/validate use,
    //   so an untouched inline open now buffers NOTHING. The modal path keeps the raw baseline (unchanged).
    var baseDraft = (_formCtx.inline && _inlineBaseline) ? _inlineBaseline : _formCtx.baseline;
    var rec = draftPut(st, _formCtx.e.key, _formCtx.id, vals,
      { baseline: baseDraft, tipSnapshot: baseDraft, ts: ++_draftSeq });
    if (rec) _setDraftPip(_formCtx.e.key, _formCtx.id, rec.cols);
    else _clearDraftPip(_formCtx.e.key, _formCtx.id);   // clean leave → strand no stale pip
    return rec;
  }
  // offer the restore pip when reopening a form that has a buffered draft (default view stays the saved tip).
  function _offerDraftRestore(e, id) {
    var st = _draftStore(); if (!st) return;
    var d = draftGet(st, e.key, id);
    if (d && d.cols && d.cols.length) { _setDraftPip(e.key, id, d.cols); console.log('§DRAFT-OFFER key=' + e.key + ':' + id + ' cols=' + d.cols.join(',') + ' (default=saved tip; pip=opt-in restore)'); }
  }
  // restoreDraft — the opt-in: fill the OPEN form with the buffered typing, and WARN if the tip moved underneath
  // (draftDrift — the item-1 decision: single-user default keeps the draft, never silently clobbers; we flag it).
  function restoreDraft() {
    if (!_formCtx) return false;
    var st = _draftStore(); if (!st) return false;
    var d = draftGet(st, _formCtx.e.key, _formCtx.id); if (!d) return false;
    var drift = draftDrift(d, _formCtx.baseline);
    (_formCtx.e.fields || []).forEach(function (f) {
      if (!Object.prototype.hasOwnProperty.call(d.vals || {}, f.col)) return;
      var el = fhost.querySelector('[data-col="' + f.col + '"]'); if (el) el.value = d.vals[f.col] == null ? '' : d.vals[f.col];
    });
    try { applyAdLogic(_formCtx.e); } catch (er) {}
    if (drift.drifted) { toast('Restored your draft — note: ' + drift.cols.join(', ') + ' changed underneath since'); }
    console.log('§DRAFT-RESTORE key=' + _formCtx.e.key + ':' + _formCtx.id + ' cols=' + (d.cols || []).join(',') + ' drift=' + drift.drifted + (drift.drifted ? '(' + drift.cols.join(',') + ')' : ''));
    return true;
  }
  // pip plumbing — render on the shared history bar (idmp_history) when present; guarded for glassbowl (no bar).
  function _setDraftPip(table, id, cols) {
    try { if (window.IdmpHistory && typeof window.IdmpHistory.setDraftPip === 'function')
      window.IdmpHistory.setDraftPip({ table: table, id: id, cols: cols || [] }, function () { restoreDraft(); }); } catch (e) {}
  }
  function _clearDraftPip(table, id) {
    try { if (window.IdmpHistory && typeof window.IdmpHistory.clearDraftPip === 'function') window.IdmpHistory.clearDraftPip(table, id); } catch (e) {}
  }
  // applyAdLogic — drive the live DOM from each field's AD logic (DisplayLogic/ReadOnlyLogic/MandatoryLogic) via
  // CORE.effectiveFlags (→ window.AdEvaluator). The record AND context = the form's own current field values, so
  // same-record @Col@ references resolve. visible=false→hide the row · readonly=true→disable · required=true→mark.
  function applyAdLogic(e) {
    var rec = gatherVals(e), ctx = rec, flips = 0, withLogic = 0;
    (e.fields || []).forEach(function (f) {
      var hasLogic = [f.displaylogic, f.readonlylogic, f.mandatorylogic].some(function (s) { return s != null && String(s).trim() !== ''; });
      if (hasLogic) withLogic++;
      var eff = CORE.effectiveFlags(f, rec, ctx);
      var row = fhost.querySelector('.cfrow[data-row="' + f.col + '"]'); if (!row) return;
      var wasHidden = row.style.display === 'none';
      row.style.display = eff.visible ? '' : 'none';
      if (hasLogic && wasHidden !== !eff.visible) flips++;
      var input = row.querySelector('[data-col="' + f.col + '"]'); if (input) input.disabled = !!eff.readonly;
      var mark = row.querySelector('[data-req="' + f.col + '"]'); if (mark) mark.style.display = eff.required ? '' : 'none';
    });
    console.log('§AD-LOGIC-LIVE key=' + e.key + ' fields=' + (e.fields || []).length + ' withLogic=' + withLogic + ' visibilityFlips=' + flips + ' applied=DOM');
  }
  function fieldInput(f, val) {
    var v = (val == null ? '' : val), ro = f.readonly ? ' disabled' : '';
    if (f.type === 'list') return '<select class=cfi data-col="' + f.col + '" data-cur="' + esc(v) + '"' + ro + '></select>';   // W-CRUD-DOCSTATUS: carry the CURRENT value to populateRefs
    if (f.type === 'fk')   return '<select class=cfi data-col="' + f.col + '" data-fk="' + esc(f.ref || '') + '"' + ro + '><option value="' + esc(v) + '">' + esc(v) + '</option></select>';
    var t = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text');
    if (f.type === 'date') {                                  // §CRUD-DATE: strip any time component → strict yyyy-MM-dd, else type=date renders blank
      var raw = v; v = normDateValue('date', v);
      console.log('§CRUD-DATE col=' + f.col + ' raw="' + raw + '" normalized="' + v + '" widget=date');
    }
    return '<input class=cfi type="' + t + '" data-col="' + f.col + '" value="' + esc(v) + '"' + ro + (f.readonly ? ' title="derived — read-only"' : '') + '>';
  }
  // list options from __meta; fk options from the ref table via the page bundle (truth-bound).
  function populateRefs(e) {
    (e.fields || []).forEach(function (f) {
      var el = fhost.querySelector('[data-col="' + f.col + '"]'); if (!el || el.tagName !== 'SELECT') return;
      if (f.type === 'list') {
        // W-CRUD-DOCSTATUS render arm: the record's CURRENT value must render SELECTED (pre-fix the select
        // landed on the first __meta key → a CO order silently read back as DR).
        var opts = (STORE.__meta && STORE.__meta[f.ref]) || {}; var cur = el.getAttribute('data-cur') || '';
        var lo = CORE.listOptions(opts, cur);
        el.innerHTML = lo.map(function (o) { return '<option value="' + esc(o.value) + '"' + (o.selected ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('');
        var sel = lo.filter(function (o) { return o.selected; }).map(function (o) { return o.value; })[0];
        console.log('§CRUD-LIST col=' + f.col + ' cur="' + cur + '" options=' + lo.length + ' selected="' + (sel || '(first)') + '"');
      } else if (f.type === 'fk' && typeof withBundle === 'function') {
        var keep = el.value;
        // §ORDERLINE-PARENT-FK (ERP_BUSINESS_CYCLE_E2E.md §Fix 2026-07-22) — a readonly fk (a child tab's
        // locked parent-link column, e.g. C_OrderLine.C_Order_ID, or any other read-only fk) must KEEP its
        // seeded/current value verbatim. The full LIST query below is scoped to the raw base table and can
        // NEVER include a synthetic/overlay-only row (a freshly created parent, negative pk) — repopulating
        // from it silently replaced a correct-but-unmatched value with whichever row sorted first (the
        // actual root cause of the order-line-gets-a-stale-parent bug). Look up just THIS row's friendly
        // label instead of the full list; if the pk isn't a real base row (synthetic), fall back to showing
        // the raw value — correct, just not pretty, same degrade-gracefully convention used elsewhere.
        if (f.readonly) {
          if (keep === '' || keep == null) return;
          withBundle(function (db) {
            try {
              var t = f.ref, pk = t + '_id', nameCol = recHasCol(db, t, 'name') ? 'name' : (recHasCol(db, t, 'documentno') ? 'documentno' : pk);
              var res = db.exec('SELECT ' + pk + ',' + nameCol + ' FROM ' + t + ' WHERE ' + pk + '=' + Number(keep));
              var label = (res.length && res[0].values.length) ? (res[0].values[0][1] + ' (' + res[0].values[0][0] + ')') : keep;
              el.innerHTML = '<option value="' + esc(keep) + '" selected>' + esc(label) + '</option>';
            } catch (er) {}
          });
          return;
        }
        withBundle(function (db) {
          try {
            var t = f.ref, pk = t + '_id', nameCol = recHasCol(db, t, 'name') ? 'name' : (recHasCol(db, t, 'documentno') ? 'documentno' : pk);
            var res = db.exec('SELECT ' + pk + ',' + nameCol + ' FROM ' + t + ' ORDER BY ' + pk + ' LIMIT 200');
            if (!res.length) return;
            el.innerHTML = res[0].values.map(function (r) { return '<option value="' + esc(r[0]) + '"' + (String(r[0]) === String(keep) ? ' selected' : '') + '>' + esc(r[1] + ' (' + r[0] + ')') + '</option>'; }).join('');
          } catch (er) {}
        });
      }
    });
  }
  function recHasCol(db, t, c) { try { var pr = db.exec('PRAGMA table_info(' + t + ')'); return pr.length && pr[0].values.some(function (v) { return String(v[1]).toLowerCase() === c; }); } catch (e) { return false; } }

  function gatherVals(e) {
    var vals = {};
    (e.fields || []).forEach(function (f) { var el = fhost.querySelector('[data-col="' + f.col + '"]'); vals[f.col] = el ? el.value : ''; });
    return vals;
  }
  function saveForm(verb, e, orig, id) {
    var vals = gatherVals(e);
    Array.prototype.forEach.call(fhost.querySelectorAll('.cfe'), function (s) { s.textContent = ''; });
    var res = CORE.validate(STORE, e, vals, orig);
    if (!res.ok) {
      res.errors.forEach(function (er) { var s = fhost.querySelector('.cfe[data-col="' + er.col + '"]'); if (s) s.textContent = er.why; });
      console.log('§CRUD validate key=' + e.key + ' verb=' + verb + ' REJECT errors=' + JSON.stringify(res.errors));
      return;
    }
    console.log('§CRUD validate key=' + e.key + ' verb=' + verb + ' ok');
    // §AD-MODELVAL-LIVE (UI_UNPARK_RESUME.md B-3) — fire the PROVEN beforeSave hook engine (ad_modelval.js,
    // W-*-SAVE: faithful M*.beforeSave ports) AFTER the field-level checks: a hook REJECT blocks the save
    // with the hook's error string; hook-DERIVED values fill the form/op (the info.derived seam).
    fireBeforeSaveHooks(e, vals, orig, function (mv) {
      if (mv && !mv.ok) {
        var s0 = fhost.querySelector('.cfe'); if (s0) s0.textContent = mv.blocked + ': ' + mv.error;
        toast('Save rejected — ' + mv.error);
        console.log('§AD-MODELVAL-LIVE table=' + e.key + ' verb=' + verb + ' hook=' + mv.blocked + ' verdict=REJECT error="' + mv.error + '"');
        return;
      }
      if (mv && mv.derived && Object.keys(mv.derived).length) {
        Object.keys(mv.derived).forEach(function (c) {
          var inEl = fhost.querySelector('[data-col="' + c + '"]');
          if (inEl) inEl.value = mv.derived[c] == null ? '' : mv.derived[c];
          // a hook-derived value rides the op when it maps to a form field/val; on CREATE, a beforeSave-filled
          // MANDATORY default that has NO visible field (e.g. M_Warehouse_ID defaulted from session context) must
          // STILL persist on the new row — iDempiere saves what beforeSave derived. (UPDATE keeps the tight guard.)
          if (Object.prototype.hasOwnProperty.call(vals, c) || (e.fields || []).some(function (f) { return f.col === c; }) || verb === 'create') vals[c] = mv.derived[c];
        });
        console.log('§AD-MODELVAL-LIVE table=' + e.key + ' verb=' + verb + ' verdict=OK derived=' + JSON.stringify(mv.derived) + ' fired=' + mv.fired);
      } else if (mv) {
        console.log('§AD-MODELVAL-LIVE table=' + e.key + ' verb=' + verb + ' verdict=OK fired=' + mv.fired);
      }
      var op = CORE.buildOp(verb, e, vals, orig, { id: id });
      if (op.op_type === 'CRUD_UPDATE') {
        // W-CRUD-DOCSTATUS diff arm: docstatus rides the DOC_ACTION lane (SET_STATUS) — never a silent
        // column write; and a save with ZERO changed columns commits NOTHING (no-op suppression).
        var sp = CORE.splitStatusChange(e, op, vals);
        if (!sp.statusOp && (!sp.fieldOp || !Object.keys(sp.fieldOp.changes).length)) {
          console.log('§CRUD update key=' + e.key + ' no-op (0 changed columns) — nothing committed');
          toast('No changes — nothing to save');
          if (_inlineHost) { _refreshInlineDirty(); return; }   // inline: keep the editor alive, just reset dirty
          closeForm(); return;
        }
        if (sp.statusOp) {
          console.log('§CRUD-STATUS-SPLIT key=' + e.key + ' docstatus ' + (sp.statusOp.from || '?') + '→' + (sp.statusOp.to || '?') + ' lane=DOC_ACTION fieldCols=' + (sp.fieldOp ? Object.keys(sp.fieldOp.changes).join(',') : '(none)'));
          applyOp(sp.statusOp, e);
        }
        if (sp.fieldOp) applyOp(sp.fieldOp, e);
        closeForm({ saved: true }); return;        // Item 1: committed → draft cleared, no buffering
      }
      applyOp(op, e);
      closeForm({ saved: true });                  // Item 1: committed → draft cleared, no buffering
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // INLINE CRUD (P2 — prompts/CRUD_INPLACE_EDIT_SESSION.md §P2; ZK ADWindowToolbar/AbstractADWindowContent).
  // The iDempiere form view IS the editable surface (no #crudForm modal, no ✎ Edit button). renderInline mounts the
  // SAME field rows + engine (fieldInput/populateRefs/applyAdLogic/validate/buildOp/applyOp/commitCrud) into a host
  // element; the verb bar carries iDempiere's real set (Save/Ignore/Refresh in P2; New/Copy/Save&New/Delete in P3),
  // Save+Ignore DIRTY-GATED (dataStatusChanged parity), Ignore = dataIgnore() reverting the unsaved delta to the
  // saved tip. Save is the hard boundary before Process (T3 — dirty blocks DocAction). Witness W-INPLACE-EDIT-LIVE.
  function _inlineDirty() {
    if (!_inlineBaseline || !_formCtx) return false;
    if (_formCtx.verb === 'create') return true;   // a new record (New/Copy) is a pending insert — Save/Save&New/Ignore live from the start (iDempiere parity); validate gates mandatory on Save, nav auto-discards an untouched New
    var vals = gatherVals(_formCtx.e);
    return (_formCtx.e.fields || []).some(function (f) {
      return String(vals[f.col] == null ? '' : vals[f.col]) !== String(_inlineBaseline[f.col] == null ? '' : _inlineBaseline[f.col]);
    });
  }
  // Leg 4 (W-DIRTY-GATE) — CONTENT-aware dirty: unlike _inlineDirty (which reports a New dirty from the start so
  //   Save lights up), this compares the gathered values to the POST-RENDER baseline for BOTH verbs. So an UNTOUCHED
  //   New reads CLEAN (nav auto-discards it, iDempiere parity) while a TYPED New / changed Edit reads dirty → the
  //   host's dirty-exit gate prompts. The host/witness seam for "does leaving here lose real work?".
  function _inlineContentDirty() {
    if (!_inlineBaseline || !_formCtx) return false;
    var vals = gatherVals(_formCtx.e);
    return (_formCtx.e.fields || []).some(function (f) {
      return String(vals[f.col] == null ? '' : vals[f.col]) !== String(_inlineBaseline[f.col] == null ? '' : _inlineBaseline[f.col]);
    });
  }
  function _refreshInlineDirty() {
    if (!_inlineHost) return;
    var dirty = _inlineDirty();
    ['save', 'savenew', 'ignore'].forEach(function (v) { var b = _inlineHost.querySelector('.ic-vb[data-v="' + v + '"]'); if (b) b.disabled = !dirty; });
    var pip = _inlineHost.querySelector('.ic-dirty'); if (pip) pip.style.display = dirty ? '' : 'none';
    if (_inlineOpts && typeof _inlineOpts.onDirty === 'function') { try { _inlineOpts.onDirty(dirty); } catch (e) {} }   // T3 — host disables Process while dirty
  }
  // _inlineVerbBar — iDempiere's real toolbar set (ADWindowToolbar), folded per AD verbEnabled, verb-aware:
  //   New · Copy · Save · Save&New · Delete · Ignore · Refresh. NO Edit button (the form IS editable). On a
  //   create form Copy/Delete are absent (nothing saved yet to copy/delete); Save/Save&New/Ignore are dirty-gated.
  function _inlineVerbBar(verb, e) {
    var canU = CORE.verbEnabled(e, 'update'), canC = CORE.verbEnabled(e, 'create'), canD = CORE.verbEnabled(e, 'delete');
    var isCreate = verb === 'create', b = [];
    if (canC)               b.push('<button class="ic-vb" data-v="new" title="New (Alt+N)">New</button>');
    if (canC && !isCreate)  b.push('<button class="ic-vb" data-v="copy" title="Copy (Alt+C)">Copy</button>');
    b.push('<button class="ic-vb ic-save" data-v="save" disabled title="Save (Alt+S)">Save</button>');
    if (canC)               b.push('<button class="ic-vb" data-v="savenew" disabled title="Save &amp; New (Alt+A)">Save&amp;New</button>');
    if (canD && !isCreate)  b.push('<button class="ic-vb ic-del" data-v="delete" title="Delete (Alt+D)">Delete</button>');
    b.push('<button class="ic-vb" data-v="ignore" disabled title="Ignore — discard unsaved edits (Alt+Z)">Ignore</button>');
    b.push('<button class="ic-vb" data-v="refresh" title="Refresh (Alt+E)">Refresh</button>');
    return '<div class="ic-bar" role=toolbar>' + b.join('') + '<span class=ic-grow></span><span class=ic-dirty style="display:none">● unsaved</span></div>' +
      (canU || isCreate ? '' : '<div class=ic-ro>This record is read-only per its dictionary.</div>');
  }
  function renderInline(verb, e, vals, orig, id, host, opts) {
    fhost = host; _inlineHost = host; _inlineOpts = opts || {}; _inlinePendingNew = false;
    var h = _inlineVerbBar(verb, e);
    (e.fields || []).forEach(function (f) {
      // data-ad-table/data-ad-column keep the host contract (IdmpHost.locate / ShowMe / lens field-targeting,
      //   _adMatch is case-insensitive); data-col is the engine's own field handle.
      h += '<label class=cfrow data-row="' + f.col + '" data-ad-table="' + esc(e.key) + '" data-ad-column="' + esc(f.col) + '"><span class=cfl>' + esc(f.label || f.col) + ' <i class=req data-req="' + f.col + '" style="display:none">*</i></span>' + fieldInput(f, vals[f.col]) + '<span class="cfe" data-col="' + f.col + '"></span></label>';
    });
    host.innerHTML = h; host.classList.add('idmp-inline-crud');
    populateRefs(e);
    applyAdLogic(e);
    // baseline = the values AS RENDERED (populateRefs picks the selected option, fieldInput normalizes dates/numbers),
    //   so a freshly-mounted form reads CLEAN — dirty is a true user delta, not a render-normalization artifact.
    _inlineBaseline = gatherVals(e);
    host.addEventListener('input', function () { applyAdLogic(e); _refreshInlineDirty(); });
    host.addEventListener('change', function (ev) {
      applyAdLogic(e);
      if (verb === 'create') { var el = ev.target && ev.target.closest ? ev.target.closest('[data-col]') : null; var col = el ? el.getAttribute('data-col') : null; if (col) fireCreateCallout(e, col); }
      _refreshInlineDirty();
    });
    // Save validates + diffs against the POST-RENDER baseline (the true user delta) — so untouched fields that the
    //   spec/render handles imperfectly (a readonly fk select that fell to another option, a string-coded fk) never
    //   trip validation and are never written; only what the user actually changed is checked + committed.
    var save = function () { if (!_inlineDirty()) return; saveForm(verb, e, _inlineBaseline || orig, id); };
    var wire = function (v, fn) { var b = host.querySelector('.ic-vb[data-v="' + v + '"]'); if (b) b.addEventListener('click', fn); };
    wire('save', save);
    wire('savenew', function () { if (!_inlineDirty()) return; _inlinePendingNew = true; saveForm(verb, e, _inlineBaseline || orig, id); });
    wire('ignore', function () { ignoreInline(verb); });
    wire('refresh', function () { if (_inlineOpts && typeof _inlineOpts.refresh === 'function') _inlineOpts.refresh(); });
    wire('new', function () { if (_inlineOpts && typeof _inlineOpts.onNew === 'function') _inlineOpts.onNew(); });
    wire('copy', function () { if (_inlineOpts && typeof _inlineOpts.onCopy === 'function') _inlineOpts.onCopy(); });
    wire('delete', function () { _inlineConfirmDelete(e, id); });
    _formCtx = { verb: verb, e: e, id: id, baseline: orig || {}, inline: true };
    if (verb === 'update') _offerDraftRestore(e, id);
    _refreshInlineDirty();
    console.log('§INPLACE-' + (verb === 'create' ? 'NEW' : 'EDIT') + ' table=' + e.key + ' id=' + (id == null ? 'new' : id) + ' verb=' + verb + ' fields=' + (e.fields || []).length + ' mount=inline (no modal, no ✎ Edit)');
  }
  // ignoreInline — iDempiere dataIgnore(): discard the unsaved delta. On UPDATE revert inputs to the saved tip; on
  //   a CREATE (a not-yet-saved new record) the whole record is thrown away (auto-discard of an untouched/abandoned New).
  function ignoreInline(verb) {
    if (!_inlineHost || !_formCtx) return;
    var v = verb || _formCtx.verb;
    if (v === 'create') {
      console.log('§INPLACE-IGNORE table=' + _formCtx.e.key + ' verb=create discarded=new-record (nothing committed)');
      if (_inlineOpts && typeof _inlineOpts.afterDiscardNew === 'function') _inlineOpts.afterDiscardNew();
      return;
    }
    (_formCtx.e.fields || []).forEach(function (f) {
      var el = fhost.querySelector('[data-col="' + f.col + '"]'); if (el) el.value = _inlineBaseline[f.col] == null ? '' : _inlineBaseline[f.col];
    });
    try { applyAdLogic(_formCtx.e); } catch (e) {}
    var st = _draftStore(); if (st) draftClear(st, _formCtx.e.key, _formCtx.id); _clearDraftPip(_formCtx.e.key, _formCtx.id);   // unsaved → strand no private draft
    _refreshInlineDirty();
    console.log('§INPLACE-IGNORE table=' + _formCtx.e.key + ' id=' + (_formCtx.id == null ? 'new' : _formCtx.id) + ' reverted=tip (unsaved delta discarded)');
  }
  // _inlineConfirmDelete — iDempiere Delete with an INLINE confirm (no modal): the verb bar becomes a confirm strip.
  //   Delete commits the SAME signed reversible-tombstone op (CRUD_DELETE); Cancel restores the editor.
  function _inlineConfirmDelete(e, id) {
    if (!_inlineHost) return;
    var bar = _inlineHost.querySelector('.ic-bar'); if (!bar) return;
    bar.innerHTML = '<span class=ic-confirm>Delete this ' + esc(fname(e.key)) + '? <em>(a reversible tombstone — the History ↶ can reverse it)</em></span>' +
      '<span class=ic-grow></span><button class="ic-vb ic-del" data-c="del">Delete</button><button class="ic-vb" data-c="cancel">Cancel</button>';
    bar.querySelector('[data-c="del"]').addEventListener('click', function () {
      console.log('§INPLACE-DELETE table=' + e.key + ' id=' + (id == null ? 'new' : id) + ' tombstone (inline confirm, ring not fanned)');
      applyOp(CORE.buildOp('delete', e, {}, _inlineBaseline || {}, { id: id }), e);
      if (_inlineOpts && typeof _inlineOpts.afterDelete === 'function') _inlineOpts.afterDelete();
    });
    bar.querySelector('[data-c="cancel"]').addEventListener('click', function () { if (_inlineOpts && typeof _inlineOpts.refresh === 'function') _inlineOpts.refresh(); });
  }
  // editInline / createInline / copyInline — host-callable inline mounts (the form view calls these instead of the
  //   modal). opts: {onDirty(d) [T3 host blocks Process], refresh() [re-mount from tip], onNew()/onCopy() [host swaps
  //   to a fresh/cloned create], afterSaveCreate()/afterDelete()/afterDiscardNew() [host leaves new-mode], onUnsupported()}.
  function editInline(table, id, host, opts) {
    opts = opts || {};
    _ensureStore(function () {
      var key = String(table || '').toLowerCase(), e = entryFor(key);
      if (!e) { console.log('§INPLACE-EDIT table=' + key + ' skipped (no crud spec)'); if (typeof opts.onUnsupported === 'function') opts.onUnsupported(); return; }
      getRecord(key, function (rec) {
        var vals = assignVals(e, rec || {});
        renderInline('update', e, vals, rec || {}, id == null ? null : id, host, opts);
      }, id == null ? null : id);
    });
  }
  function createInline(table, host, opts) {
    opts = opts || {};
    _ensureStore(function () {
      var key = String(table || '').toLowerCase(), e = entryFor(key);
      if (!e || !CORE.verbEnabled(e, 'create')) { console.log('§INPLACE-NEW table=' + key + ' skipped (create not permitted)'); if (typeof opts.onUnsupported === 'function') opts.onUnsupported(); return; }
      var vals = CORE.defaultsFor(e, today());
      _seedDocNoPreview(e, vals);
      // §ORDERLINE-PARENT-FK (ERP_BUSINESS_CYCLE_E2E.md §Fix 2026-07-22) — opts.seedVals lets the host
      // (idempiere.html, for a child tab's locked parent-link column) inject a value defaultsFor() has no
      // way to know — AD_Column.DefaultValue is empty for a parent-link FK by convention (it's set
      // programmatically, never via a column default). Optional; every other caller is unaffected.
      if (opts.seedVals) { var _sk = Object.keys(opts.seedVals); for (var _si = 0; _si < _sk.length; _si++) vals[_sk[_si]] = opts.seedVals[_sk[_si]]; }
      renderInline('create', e, vals, null, null, host, opts);
    });
  }
  function copyInline(table, fromId, host, opts) {
    opts = opts || {};
    _ensureStore(function () {
      var key = String(table || '').toLowerCase(), e = entryFor(key);
      if (!e || !CORE.verbEnabled(e, 'create')) { console.log('§INPLACE-COPY table=' + key + ' skipped (create not permitted)'); if (typeof opts.onUnsupported === 'function') opts.onUnsupported(); return; }
      getRecord(key, function (rec) {
        var vals = assignVals(e, rec || {});                                   // clone the source values as a starting point
        (e.fields || []).forEach(function (f) { if (String(f.col).toLowerCase() === 'documentno') vals[f.col] = ''; });   // iDempiere Copy clears DocumentNo (new sequence)
        _seedDocNoPreview(e, vals);
        renderInline('create', e, vals, null, null, host, opts);
        console.log('§INPLACE-COPY table=' + key + ' from=' + (fromId == null ? 'null' : fromId) + ' (cloned into a new inline record)');
      }, fromId == null ? null : fromId);
    });
  }
  // editCell — P4 (T5) GRID INLINE EDIT, the SINGLE-COLUMN peer of editInline. iDempiere GridView/GridTabRowRenderer
  //   parity: a grid cell is a per-cell WEditor — click → an inline input → commit ONE signed CRUD_UPDATE for {that
  //   col} on that row's pk, the SAME signed write the form uses (buildOp('update')→applyOp→commitCrud→overlay:
  //   committed → host repaints). NO modal, ring NOT fanned, NO new verb. Read-only per AD (IsUpdateable=N / view
  //   table / not a field) → onUnsupported (host opens the form — a read-only cell is not a dead click). A docstatus
  //   cell rides the DOC_ACTION lane via splitStatusChange, never a column write. opts:{onCommit,onCancel,onUnsupported}.
  function editCell(table, id, col, hostTd, opts) {
    opts = opts || {};
    var unsup = function () { if (typeof opts.onUnsupported === 'function') opts.onUnsupported(); };
    _ensureStore(function () {
      var key = String(table || '').toLowerCase(), e = entryFor(key);
      if (!e || !CORE.verbEnabled(e, 'update')) { console.log('§INPLACE-CELL table=' + key + ' col=' + col + ' skipped (update not permitted)'); unsup(); return; }
      var lc = String(col).toLowerCase();
      var f = (e.fields || []).filter(function (ff) { return String(ff.col).toLowerCase() === lc; })[0];
      if (!f || f.readonly || f.type === 'id' || f.type === 'button') { console.log('§INPLACE-CELL table=' + key + ' col=' + col + ' skipped (read-only / not a field)'); unsup(); return; }
      getRecord(key, function (rec) {
        var orig = assignVals(e, rec || {});                 // full-row baseline → buildOp diffs to exactly {col}
        // render ONE inline editor into the cell, reusing the form's fieldInput + populateRefs (borrow fhost, restore)
        var prevFhost = fhost; fhost = hostTd;
        hostTd.innerHTML = '<div class="ic-cell">' + fieldInput(f, orig[f.col]) + '<span class="cfe" data-col="' + esc(f.col) + '"></span></div>';
        hostTd.classList.add('idmp-cell-edit');
        populateRefs(e);                                     // list/fk options (every col but ours → el null → skipped)
        var input = hostTd.querySelector('[data-col="' + f.col + '"]');
        var baseline = input ? input.value : (orig[f.col] == null ? '' : orig[f.col]);   // AS-RENDERED (selected option / normalized date)
        fhost = prevFhost;                                   // references captured — restore the module host immediately
        if (!input) { hostTd.classList.remove('idmp-cell-edit'); if (typeof opts.onCancel === 'function') opts.onCancel(); return; }
        try { input.focus(); if (input.select) input.select(); } catch (e0) {}
        var done = false;
        var cancel = function () { if (done) return; done = true; if (typeof opts.onCancel === 'function') opts.onCancel(); };
        var commit = function (viaBlur) {
          if (done) return;
          var nv = input.value;
          if (String(nv == null ? '' : nv) === String(baseline == null ? '' : baseline)) { cancel(); return; }   // unchanged → revert, commit nothing
          var why = CORE.validateField(STORE, f, nv, orig[f.col], rec || {}, {});
          if (why) {                                         // AD reject: Enter keeps the editor + shows it; blur reverts (focus is gone)
            if (viaBlur) { cancel(); return; }
            var errEl = hostTd.querySelector('.cfe'); if (errEl) errEl.textContent = why;
            console.log('§INPLACE-CELL table=' + key + ' col=' + f.col + ' REJECT why="' + why + '"');
            return;
          }
          done = true;
          var vals = {}; for (var c in orig) vals[c] = orig[c]; vals[f.col] = nv;   // full row, one col overridden
          var op = CORE.buildOp('update', e, vals, orig, { id: id });
          var sp = CORE.splitStatusChange(e, op, vals);      // docstatus cell → DOC_ACTION lane, never a column write
          if (!sp.statusOp && (!sp.fieldOp || !Object.keys(sp.fieldOp.changes).length)) { console.log('§INPLACE-CELL table=' + key + ' col=' + f.col + ' no-op'); done = false; cancel(); return; }
          console.log('§INPLACE-CELL table=' + key + ' id=' + (id == null ? 'null' : id) + ' col=' + f.col + ' "' + baseline + '"→"' + nv + '" commit=signed-CRUD_UPDATE (row-wise, no modal)');
          if (sp.statusOp) applyOp(sp.statusOp, e);
          if (sp.fieldOp) applyOp(sp.fieldOp, e);
          if (typeof opts.onCommit === 'function') opts.onCommit();   // overlay:committed already refolds the grid; this is a host hook
        };
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); commit(false); }
          else if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
        });
        input.addEventListener('blur', function () { setTimeout(function () { commit(true); }, 0); });   // focus-out = commit-or-revert (GridView leaves the editor)
        console.log('§INPLACE-CELL-OPEN table=' + key + ' id=' + (id == null ? 'null' : id) + ' col=' + f.col + ' type=' + f.type + ' editor=inline');
      }, id == null ? null : id);
    });
  }
  // ── §AD-MODELVAL-LIVE plumbing — lazy per-table installer over the page bundle (sql.js → b3 shim) ──
  // AUDIT GAP (d) — general not custom: DISCOVER the model-validator installers from the AdModelVal registry instead
  //   of a hardcoded 4-table map. Every `install<Model>SaveHooks` export is invoked once (idempotent); each registers
  //   its own BEFORE_SAVE hooks under its table (registerValidator). fireHooks then resolves coverage from REGISTRY —
  //   so ALL ~13 ported model validators apply (the old map wired only 4), and a table with no ported hook is a clean
  //   no-op. Install is pure registration (db is captured in hook closures, touched only when a hook fires) → safe.
  var _mvAllInstalled = false;
  function _installAllModelVal(b) {
    var MV = global.AdModelVal; if (!MV) return [];
    var installed = [];
    Object.keys(MV).forEach(function (m) {
      if (/^install[A-Z].*SaveHooks$/.test(m) && typeof MV[m] === 'function') {
        try { MV[m](b); installed.push(m); } catch (e) { console.log('§AD-MODELVAL-LIVE installer ' + m + ' skipped (' + (e && e.message) + ')'); }
      }
    });
    if (typeof MV.installDefaultHooks === 'function') { try { MV.installDefaultHooks(); installed.push('installDefaultHooks'); } catch (e) {} }
    return installed;
  }
  function _mvB3(dbh) {   // better-sqlite3-shaped shim over sql.js; lowercase keys (engines proven on ad_full.db);
    function lc(o) { if (!o) return o; var r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; return r; }
    function run(sql, args, all) {                              // absent table/column in this bundle slice → no-row
      var st;
      try { st = dbh.prepare(sql); }
      catch (er) {
        var es = String((er && er.message) || er);
        if (es.indexOf('no such column') >= 0 || es.indexOf('no such table') >= 0) {
          console.log('§AD-MODELVAL-LIVE bundle-gap (' + es + ') → no-row conservative default');
          return all ? [] : undefined;
        }
        throw er;
      }
      var out = all ? [] : undefined;
      try {
        if (args.length) st.bind(args);
        if (all) { while (st.step()) out.push(lc(st.getAsObject())); }
        else if (st.step()) out = lc(st.getAsObject());
      } finally { st.free(); }
      return out;
    }
    return { prepare: function (sql) { return {
      get: function () { return run(sql, Array.prototype.slice.call(arguments), false); },
      all: function () { return run(sql, Array.prototype.slice.call(arguments), true); }
    }; } };
  }
  // _docCtx — the session document context the beforeSave hooks consult (iDempiere Env). The default Warehouse.
  //   AUDIT GAP (b) — general not custom: iDempiere reads the org's DEFAULT warehouse from AD_OrgInfo.M_Warehouse_ID
  //   (MOrgInfo.getM_Warehouse_ID), NOT "the lowest active warehouse id". Read that FIRST; only if AD_OrgInfo carries
  //   none fall back to the org's first active warehouse, then the client's. Always a real m_warehouse, never invented.
  function _docCtx(b) {
    var ctx = {};
    try {
      var app = global.APP || {}, org = Number(app.orgId) || 0, cli = Number(app.clientId) || 0, wh = null;
      if (org) { try { var oi = b.prepare("SELECT m_warehouse_id FROM ad_orginfo WHERE ad_org_id=? LIMIT 1").get(org);
        if (oi && oi.m_warehouse_id != null) wh = { m_warehouse_id: oi.m_warehouse_id }; } catch (e0) {} }
      if ((!wh || wh.m_warehouse_id == null) && org) wh = b.prepare("SELECT m_warehouse_id FROM m_warehouse WHERE ad_org_id=? AND isactive='Y' ORDER BY m_warehouse_id LIMIT 1").get(org);
      if ((!wh || wh.m_warehouse_id == null) && cli) wh = b.prepare("SELECT m_warehouse_id FROM m_warehouse WHERE ad_client_id=? AND isactive='Y' ORDER BY m_warehouse_id LIMIT 1").get(cli);
      if (wh && wh.m_warehouse_id != null) ctx.m_warehouse_id = Number(wh.m_warehouse_id);
      // §DOCTYPE-PER-WINDOW (ERP_BUSINESS_CYCLE_E2E.md §Fix 2026-07-21) — window.APP._createIsSOTrx is set
      // by idempiere.html's buildForm() right before a CREATE, from the active AD_Tab's own WhereClause
      // (the real per-window Sales/Purchase signal). MOrder.docTypeTargetDefault reads ctx.issotrx to pick
      // the right-side default doctype instead of always the client's Standard Sales doctype. Only ever read
      // for the derivation-if-unset case (existing docTypeTarget on an UPDATE is left alone regardless).
      if (app._createIsSOTrx === 'Y' || app._createIsSOTrx === 'N') ctx.issotrx = app._createIsSOTrx;
    } catch (e) {}
    return ctx;
  }
  function fireBeforeSaveHooks(e, vals, orig, cb) {
    var MV = global.AdModelVal;
    if (!MV || typeof withBundle !== 'function') { cb(null); return; }
    withBundle(function (db) {
      var out = null;
      try {
        var b = _mvB3(db);
        if (!_mvAllInstalled) { _mvAllInstalled = true; var ins = _installAllModelVal(b); console.log('§AD-MODELVAL-LIVE installed-all registry=' + ins.length + ' [' + ins.join(',') + ']'); }
        // GAP (d): no ported hook for this table → fireHooks returns fired=0, ok=true (a clean no-op, not a gate).
        var rec = {}, k;
        if (orig) for (k in orig) rec[k.toLowerCase()] = orig[k];
        for (k in vals) rec[k.toLowerCase()] = vals[k];
        var info = { table: e.key, record: rec, recordOld: orig || null };
        // ctx = the session document defaults the beforeSave hooks read (iDempiere's Env #context): chiefly the
        //   default Warehouse, which MOrder.warehouseMandatory fills from ctx when the order carries none. NON-INVENT:
        //   the warehouse is the session org's own active warehouse (else the client's first), read from m_warehouse.
        var v = MV.fireHooks('BEFORE_SAVE', info, _docCtx(b));
        out = { ok: v.ok, fired: v.fired, blocked: v.blocked, error: v.error, derived: info.derived || null };
      } catch (er) { console.log('§AD-MODELVAL-LIVE error ' + (er && er.message) + ' → hooks skipped'); out = null; }
      cb(out);
    });
  }
  function openDeleteConfirm(e, wantId) {
    getRecord(e.key, function (rec) {
      var id = recId(e.key, rec);
      form.innerHTML = '<span class=cfx title=close>✕</span><div class=cfh>🗑 Delete ' + esc(fname(e.key)) + '</div>' +
        '<div class=cfbody><p class=cfwarn>This records a <b>reversible tombstone</b> op — the row is not erased; the History ↶ can reverse it.</p>' +
        '<p class=cfdim>target id: ' + esc(id == null ? '(new/none)' : id) + '</p></div>' +
        '<div class=cfnav><span class=cfnote>dry-run</span><span class=cfgrow></span><button class=cfb id=cfCancel>Cancel</button><button class="cfb cfdel" id=cfDel>Delete (tombstone)</button></div>';
      form.className = 'open';
      form.querySelector('.cfx').addEventListener('click', closeForm);
      form.querySelector('#cfCancel').addEventListener('click', closeForm);
      form.querySelector('#cfDel').addEventListener('click', function () { applyOp(CORE.buildOp('delete', e, {}, rec, { id: id }), e); closeForm(); });
    }, wantId);
  }
  // closeForm(opts) — opts.saved===true after a committed Save: clear the draft (it's now official), no buffering.
  // A plain close/cancel/nav (or an Event from an onclick listener — no .saved) BUFFERS the dirty typing first.
  function closeForm(opts) {
    var saved = opts && opts.saved === true;
    var inline = !!_inlineHost;
    var fverb = _formCtx ? _formCtx.verb : null;
    if (_formCtx && _formCtx.verb === 'update') {
      if (saved) { var st = _draftStore(); if (st) draftClear(st, _formCtx.e.key, _formCtx.id); _clearDraftPip(_formCtx.e.key, _formCtx.id); }
      else if (!inline) _bufferDraft();   // inline nav-buffer = beforeunload (P5 wires the explicit needSave flush)
    }
    _formCtx = null;
    if (inline) {
      var io = _inlineOpts, pend = _inlinePendingNew; _inlinePendingNew = false;
      // inline saved → clear dirty in place; the host's overlay:committed refold re-mounts the editor from the new tip.
      if (saved && _inlineHost) {
        ['save', 'savenew', 'ignore'].forEach(function (v) { var b = _inlineHost.querySelector('.ic-vb[data-v="' + v + '"]'); if (b) b.disabled = true; });
        var p2 = _inlineHost.querySelector('.ic-dirty'); if (p2) p2.style.display = 'none';
        if (io && typeof io.onDirty === 'function') { try { io.onDirty(false); } catch (e) {} }
      }
      _inlineHost = null; _inlineBaseline = null; _inlineOpts = null; fhost = form;
      // a saved CREATE leaves new-mode: Save&New → a fresh blank record (pend); plain Save → host shows the new row.
      if (saved && fverb === 'create' && io) {
        if (pend && typeof io.onNew === 'function') io.onNew();
        else if (typeof io.afterSaveCreate === 'function') io.afterSaveCreate();
      }
      return;
    }
    form.className = ''; form.innerHTML = '';
  }

  // ════════════════════════════════════════════════════════════════════════
  // GP3 SIGNED-WRITE SEAM — the deployed Process ▶ becomes a REAL signed write (W-CRUD-WRITELOOP-OVERLAY).
  // DECIDED (GUIDE_SHOWME_PROCESS GP3): sidecar log + read-the-tip. Ops commit to a SEPARATE in-memory
  // kernel_ops DB persisted under its OWN IndexedDB key; glassbowl_data.db stays the IMMUTABLE baseline.
  // The signed kernel is the production W-CHAIN one (kernel_ops.js → window.KernelOps), loaded as a peer
  // <script>. If it (or sql.js) is absent we fall back to the E2 dry-run — never a silent failure.
  // ════════════════════════════════════════════════════════════════════════
  var SIDE = null, SIDE_PENDING = false, SIDE_CBS = [], _SQL = null, _IDB = null, _warnedNoLock = false;
  var SIDE_DBNAME = 'glassbowl_kernel_ops', SIDE_STORE = 'log', SIDE_KEY = 'kernel_ops.db';
  // Implementing ERP_OPLOG_APPEND_ONLY_FIX.md F1/F3 — Witness: W-OPLOG-APPEND / W-COMMIT-LOCK.
  // OPS_STORE — the NEW per-op append-only object store (F1), a sibling of the legacy `log` store in the
  // SAME IndexedDB database (bumping SIDE_DBVERSION adds it without touching the legacy store/key — F10
  // keeps the old blob untouched). SIDE_LOCK_NAME — the cross-tab commit mutex (F3).
  var OPS_STORE = 'ops', SIDE_DBVERSION = 2, MIGRATE_MARKER_KEY = 'migrated-from-blob';
  var SIDE_LOCK_NAME = 'erp-sidecar-commit';
  function kernel() { return (typeof global.KernelOps !== 'undefined') ? global.KernelOps : null; }
  function _flushSideCbs(arg) { var cbs = SIDE_CBS; SIDE_CBS = []; SIDE_PENDING = false; cbs.forEach(function (f) { try { f(arg); } catch (e) {} }); }

  // _sideIdb — open the DEDICATED sidecar database (NEVER glassbowl_data.db's cache key). v1→v2 (F1):
  // adds the new `ops` append-only store alongside the legacy `log` store — existing `log`/kernel_ops.db
  // data is untouched by the upgrade (F10: the old blob is read by migration, never deleted here).
  function _sideIdb(cb) {
    try {
      var req = global.indexedDB.open(SIDE_DBNAME, SIDE_DBVERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(SIDE_STORE)) db.createObjectStore(SIDE_STORE);
        if (!db.objectStoreNames.contains(OPS_STORE)) db.createObjectStore(OPS_STORE, { autoIncrement: true });
      };
      req.onsuccess = function () { cb(req.result); };
      req.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  // _sidePersist — Implementing ERP_OPLOG_APPEND_ONLY_FIX.md F1 — Witness: W-OPLOG-APPEND.
  // Appends the given kernel_ops row ids from `db` as INDIVIDUAL new records in the `ops` IndexedDB store
  // (add(), never put()) — replaces the old whole-DB export()+put() single-blob overwrite entirely. Two
  // tabs' concurrent commits now physically add() DIFFERENT, non-colliding records; neither can overwrite
  // the other's bytes (this alone makes S3's disjoint-field total-op-loss structurally impossible).
  // Returns a Promise so callers can await the append BEFORE releasing the cross-tab lock (F3) — a second
  // tab's refresh must never observe "committed but not yet appended".
  function _sidePersist(K, db, ids) {
    if (!db || !_IDB || !K || !ids || !ids.length) return Promise.resolve();
    try {
      var rows = K.rowsByIds(db, ids);
      return K.appendOpsRecords(_IDB, OPS_STORE, rows).then(function (keys) {
        rows.forEach(function (r, i) { console.log('§OPLOG-APPEND key=' + keys[i] + ' id=' + r.id + ' op_uuid=' + (r.op_uuid || 'null')); });
        return _relayPush(rows);
      }).catch(function (e) { console.warn('§OPLOG-APPEND error', e && e.message); });
    } catch (e) { console.warn('§OPLOG-APPEND error', e && e.message); return Promise.resolve(); }
  }
  // _relayPush — Implementing ERP_MULTIUSER_CONCURRENCY_POC.md §Relay Wiring item 1 — Witness: W-N-CONVERGE.
  // Best-effort, fire-and-forget: register the just-appended row(s) with the relay (erp_sync_relay.js's
  // pushRows, dedup by op_uuid at the relay — W-RELAY). No-op (Promise.resolve) if erp_sync_relay.js isn't
  // loaded or no ?relay= was given — the whole append-only fix behaves exactly as before with no relay.
  // NEVER throws into the commit path: a relay-down/unreachable failure is logged, not fatal to the save.
  function _relayPush(rows) {
    var S = (typeof global.ErpSyncRelay !== 'undefined') ? global.ErpSyncRelay : null;
    if (!S || !S.isEnabled || !S.isEnabled()) return Promise.resolve();
    return S.pushRows(rows).catch(function (e) { console.warn('§SYNC_RELAY push error', e && e.message); });
  }
  // syncNow — Implementing ERP_MULTIUSER_CONCURRENCY_POC.md §Relay Wiring item 2 — Witness: W-N-CONVERGE.
  // The manual Sync trigger's ACTUAL orchestration (crud_overlay.js is the caller, per the spec's
  // separation of concern — erp_sync_relay.js is transport-only). Reuses, verbatim, the SAME cross-tab
  // commit lock (_withFreshSide) + fresh-hydrate a commit already uses, so a sync can never interleave
  // with a same-tab-group commit mid-flight; and reuses, verbatim, window.ErpSyncFSM.rebase() — the
  // PROVEN rewind→apply-canonical→replay-pending→re-seal loop (scripts/test_kernel_relay.js W-RELAY,
  // scripts/test_kernel_rebase.js W-REBASE) — no new merge/seal logic is written here. After rebase
  // rewrites+reseals the in-memory SIDE table, the merged canonical state is snapshotted
  // (K.allRowsPlain, the SAME primitive F10's legacy-blob migration already uses) and appended as NEW
  // records into the append-only `ops` IDB store (K.appendOpsRecords, add()-only — never a put()/blob
  // overwrite) so a reload or a sibling tab's next hydrate replays to the SAME merged tip too.
  function syncNow(cb) {
    var K = kernel();
    var S = (typeof global.ErpSyncRelay !== 'undefined') ? global.ErpSyncRelay : null;
    var FSM = (typeof global.ErpSyncFSM !== 'undefined') ? global.ErpSyncFSM : null;
    var RC = (typeof global.ErpRelayClient !== 'undefined') ? global.ErpRelayClient : null;
    var relayUrl = S && S.relayUrl();
    if (!relayUrl || !K || !FSM || !RC) {
      console.log('§SYNC_RELAY syncNow SKIP relay=' + !!relayUrl + ' kernel=' + !!K + ' fsm=' + !!FSM + ' client=' + !!RC);
      if (cb) cb({ ok: false, reason: 'relay not configured/loaded' });
      return;
    }
    withSidecar(function (db) {
      if (!db) { console.log('§SYNC_RELAY syncNow SKIP sidecar-absent'); if (cb) cb({ ok: false, reason: 'sidecar absent' }); return; }
      _withFreshSide(K, function (freshDb, done) {
        var relayClient = RC.createRelayClient(relayUrl);
        Promise.resolve(FSM.rebase(freshDb, K, relayClient)).then(function (r) {
          var allRows = K.allRowsPlain(freshDb);
          return K.appendOpsRecords(_IDB, OPS_STORE, allRows).then(function () {
            return Promise.resolve(K.verifyChain(freshDb)).then(function (v) {
              console.log('§SYNC_RELAY syncNow applied=' + r.applied + ' tip=' + (v && v.tip) + ' len=' + (v && v.len) + ' verifyChain=' + (v && v.ok ? 'ok' : 'FAIL'));
              done();
              if (cb) cb({ ok: true, applied: r.applied, tip: v && v.tip, len: v && v.len, verify: v });
            });
          });
        }).catch(function (e) {
          console.warn('§SYNC_RELAY syncNow error', e && e.message);
          done();
          if (cb) cb({ ok: false, error: e && e.message });
        });
      });
    });
  }
  global.crudSyncNow = syncNow;   // witness/host seam — a real button click (or a host affordance) calls this
  // _hydrateSide — Implementing ERP_OPLOG_APPEND_ONLY_FIX.md F2/F10 — Witness: W-OPLOG-APPEND / W-OPLOG-MIGRATE.
  // Builds a FRESH sql.js Database from the append-only `ops` IndexedDB store: read every record in key
  // order (cheap IDB cursor scan), replay each row back into a fresh kernel_ops table in that SAME order
  // (F2 — the rows already carry their sealed prev_hash/op_hash/sig; replay restores them verbatim, it
  // does not re-seal). On the FIRST hydrate of a pre-fix sidecar — no migration marker yet, AND the legacy
  // whole-blob still holds data under the old `log`/kernel_ops.db key — the legacy blob's rows are
  // exploded into individual `ops` records ONCE first (F10), so a pre-fix user's history carries forward
  // rather than starting empty. The legacy blob key is NEVER put()/deleted by this — read-only, always
  // (§Migration: "the old blob is never deleted by this migration"). Idempotent + best-effort: any
  // failure along the migration path falls back straight to the (possibly-still-empty) read-all hydrate —
  // it never blocks opening the sidecar.
  function _hydrateSide(idbDb, SQL, K, cb) {
    function readAllAndBuild() {
      K.readAllOpsRecords(idbDb, OPS_STORE).then(function (rows) {
        var db = new SQL.Database();
        K.ensureTable(db);
        K.replayRowsInto(db, rows);
        Promise.resolve(K.verifyChain(db)).then(function (v) {
          console.log('§OPLOG-HYDRATE ops=' + rows.length + ' tip=' + (v && v.tip ? v.tip : 'GENESIS') +
                      ' source=readAll' + (v && v.ok === false ? ' verifyChain=FAIL(' + v.why + ')' : ''));
          cb(db);
        }).catch(function () { cb(db); });
      }).catch(function (e) {
        console.warn('§OPLOG-HYDRATE readAll error', e && e.message);
        var db = new SQL.Database(); K.ensureTable(db); cb(db);
      });
    }
    var mtx;
    try { mtx = idbDb.transaction(SIDE_STORE, 'readonly'); } catch (e) { readAllAndBuild(); return; }
    var mreq = mtx.objectStore(SIDE_STORE).get(MIGRATE_MARKER_KEY);
    mreq.onsuccess = function () {
      if (mreq.result) { readAllAndBuild(); return; }   // already migrated → straight to read-all (F2)
      var greq;
      try { greq = idbDb.transaction(SIDE_STORE, 'readonly').objectStore(SIDE_STORE).get(SIDE_KEY); }
      catch (e) { readAllAndBuild(); return; }
      greq.onsuccess = function () {
        var legacyBuf = greq.result;
        if (!legacyBuf) {   // brand-new user, no legacy blob at all — mark migrated (nothing to migrate)
          try { idbDb.transaction(SIDE_STORE, 'readwrite').objectStore(SIDE_STORE).put(true, MIGRATE_MARKER_KEY); } catch (e) {}
          readAllAndBuild(); return;
        }
        var legacyDb;
        try { legacyDb = new SQL.Database(new Uint8Array(legacyBuf)); }
        catch (e) { console.warn('§OPLOG-MIGRATE legacy blob unreadable, skipping (blob preserved, never deleted)', e && e.message); readAllAndBuild(); return; }
        var legacyRows = K.allRowsPlain(legacyDb);
        K.appendOpsRecords(idbDb, OPS_STORE, legacyRows).then(function (keys) {
          try { idbDb.transaction(SIDE_STORE, 'readwrite').objectStore(SIDE_STORE).put(true, MIGRATE_MARKER_KEY); } catch (e) {}
          var n = keys ? keys.length : 0;   // appendOpsRecords resolves with the assigned autoKeys array, not a count
          Promise.resolve(K.verifyChain(legacyDb)).then(function (v) {
            console.log('§OPLOG-MIGRATE legacyOps=' + legacyRows.length + ' migratedOps=' + n + ' chainValid=' + !!(v && v.ok));
            console.log('§OPLOG-BLOB-PRESERVED unchanged=true');   // F10: old key was only READ, never put()/deleted
            readAllAndBuild();
          }).catch(function () {
            console.log('§OPLOG-MIGRATE legacyOps=' + legacyRows.length + ' migratedOps=' + n + ' chainValid=false');
            readAllAndBuild();
          });
        }).catch(function (e) {
          console.warn('§OPLOG-MIGRATE append error', e && e.message, '(legacy blob preserved, will retry next open)');
          readAllAndBuild();   // fail-open — never blocks opening
        });
      };
      greq.onerror = function () { readAllAndBuild(); };
    };
    mreq.onerror = function () { readAllAndBuild(); };
  }
  // _withFreshSide — Implementing ERP_OPLOG_APPEND_ONLY_FIX.md F3/F4 — Witness: W-COMMIT-LOCK.
  // Re-hydrates SIDE from the ops store's CURRENT contents (a full read-all + replay via _hydrateSide —
  // correctness over micro-perf for this CORE pass; §Cross-tab coordination: "either is correct, the
  // former is cheaper") and hands the FRESH db to `task`, while holding the navigator.locks cross-tab
  // mutex — so a second tab's commit can only begin gating/sealing AFTER the first tab's just-appended
  // rows are visible to it. This is what closes the S4 gap that per-op storage (F1) alone does not: two
  // tabs can no longer both seal against the SAME stale tip. `task(freshDb, done)` MUST call done() when
  // the whole critical section (gate→seal→append) has finished, so the lock isn't released early.
  // No navigator.locks support (older browser) → falls back to running unlocked (best-effort, same
  // residual cross-tab risk as pre-fix; logged ONCE so the degradation is visible, never silent).
  function _withFreshSide(K, task) {
    function run(done) {
      if (!_IDB || !_SQL) { task(SIDE, done); return; }
      _hydrateSide(_IDB, _SQL, K, function (freshDb) { SIDE = freshDb; task(SIDE, done); });
    }
    if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
      return navigator.locks.request(SIDE_LOCK_NAME, function () {
        return new Promise(function (resolve) { run(resolve); });
      });
    }
    if (!_warnedNoLock) { _warnedNoLock = true; console.warn('§COMMIT-LOCK unavailable (no navigator.locks) — cross-tab serialization NOT active this session'); }
    return new Promise(function (resolve) { run(resolve); });
  }
  // withSidecar — lazily build/hydrate the sidecar log DB (a separate sql.js Database), ensure the kernel
  // table, then run cb(SIDE). cb(null) if sql.js/kernel unavailable (caller falls back to dry-run).
  // Implementing ERP_OPLOG_APPEND_ONLY_FIX.md F2/F10 — Witness: W-OPLOG-APPEND / W-OPLOG-MIGRATE: hydration
  // is now read-all-and-replay from the `ops` store (via _hydrateSide), not a single fixed blob key.
  function withSidecar(cb) {
    if (SIDE) { cb(SIDE); return; }
    SIDE_CBS.push(cb);
    if (SIDE_PENDING) return;
    var K = kernel();
    if (typeof global.initSqlJs !== 'function' || !K) { _flushSideCbs(null); return; }
    SIDE_PENDING = true;
    global.initSqlJs({ locateFile: function (f) { return 'sqljs/' + f; } }).then(function (SQL) {
      _sideIdb(function (idbDb) {
        if (!idbDb) {
          try { SIDE = new SQL.Database(); K.ensureTable(SIDE); } catch (e) { SIDE = null; }
          _flushSideCbs(SIDE); return;
        }
        _SQL = SQL; _IDB = idbDb;   // remembered for the cross-tab refresh (F3) and future persists
        _hydrateSide(idbDb, SQL, K, function (db) { SIDE = db; _flushSideCbs(SIDE); });
      });
    }).catch(function () { _flushSideCbs(null); });
  }

  // dryProcess — the E2 fallback (kernel/sql.js absent): log the op, paint the bar, mark dry-run.
  function dryProcess(op) {
    console.log('§CRUD process key=' + op.key + ' action=' + op.action + ' from=' + op.from + ' to=' + op.to + ' (dry) op=DOC_ACTION outcome=' + op.outcome + (op.unmet && op.unmet.length ? ' unmet=' + op.unmet.join(',') : ''));
    setDocStatus(op.key, op.to, op.outcome, op.unmet);
    docDot(CORE.docLabel(op, fname(op.key)) + ' (dry)', op);
    toast('PROCESS ' + fname(op.key) + ' → ' + op.to + (op.outcome === 'in-progress' ? ' (In Progress — unmet condition)' : ' (Completed)') + ' — dry-run');
  }
  // Implementing SO_FULL_CRUD_GAP.md T1 (GAP 1) — Witness: W-SO-COMPLETE-UI.
  // completeFanout — EXTRACT the completeIt consequence set for a c_order Complete from the PROVEN engine
  // (window.ERPEngine.completeOrder — W-FOLD-COMPLETE, oracle-equivalent to the cent headless): order
  // header + lines read from the IMMUTABLE bundle, fan-out flags from the EXTRACTED DOCPOLICY decision
  // table (crud_ops.json __meta.docPolicy ← erp_rules.db ← real c_doctype). The overlay only ASSEMBLES —
  // the engine supplies every quantity; nothing is re-derived here (non-invent).
  // GL postings (fact_acct) are COVERAGE-GATED on this surface, honestly (the posting-preview data-gate
  // pattern): the bundle carries no c_ordertax (a fresh order's invoice tax legs are non-derivable) and
  // post_resolver is not mounted — the omission is LOGGED, never faked. Ship/Invoice creation still works.
  // cb(fanout|null): null → the honest status-only group (engine absent / non-CO / no policy / re-complete).
  function completeFanout(op, cb) {
    if (!(op.key === 'c_order' && op.action === 'CO' && op.to === 'CO' && op.outcome === 'success')) { cb(null); return; }
    if (op.from === 'CO') { console.log('§SO-COMPLETE fan-out skipped: already CO (no duplicate consequence docs)'); cb(null); return; }
    var E = (typeof global.ERPEngine !== 'undefined') ? global.ERPEngine : null;
    if (!E || typeof E.completeOrder !== 'function' || typeof withBundle !== 'function' || op.id == null) {
      console.log('§SO-COMPLETE fan-out gated: ' + (E ? 'bundle/id absent' : 'ERPEngine not mounted') + ' → status-only group (honest)');
      cb(null); return;
    }
    withBundle(function (db) {
      var fanout = null;
      try {
        var or = db.exec('SELECT * FROM c_order WHERE c_order_id=' + Number(op.id) + ' LIMIT 1');
        if (!or.length || !or[0].values.length) { console.log('§SO-COMPLETE fan-out gated: order ' + op.id + ' not in bundle → status-only'); cb(null); return; }
        // lower-case every column key: the engine (completeOrder/buildDoc) reads lower-case fields, and the host
        // bundle's SELECT * returns ORIGINAL-case columns (C_DocType_ID, IsSOTrx) — without this the doctype reads
        // undefined → the fan-out wrongly gates as "no DOCPOLICY". glassbowl_data.db was lower-case so it hid this.
        var order = {}; or[0].columns.forEach(function (c, i) { order[String(c).toLowerCase()] = or[0].values[0][i]; });
        var lr = db.exec('SELECT c_orderline_id, m_product_id, qtyordered FROM c_orderline WHERE c_order_id=' + Number(op.id));
        var lines = (lr.length ? lr[0].values : []).map(function (v) { return { c_orderline_id: v[0], m_product_id: v[1], qtyordered: v[2] }; });
        var policy = CORE.docPolicyFor(STORE, order.c_doctype_id);
        if (!policy) { console.log('§SO-COMPLETE fan-out gated: no DOCPOLICY for c_doctype_id=' + order.c_doctype_id + ' (extract gap — never defaulted to Y)'); cb(null); return; }
        var ops = E.completeOrder(order, lines, policy).filter(function (o) { return o.op_type !== 'SET_STATUS'; });
        console.log('§SO-FANOUT order=' + op.id + ' doctype=' + order.c_doctype_id + ' policy(io,inv)=' + policy.isautogenerateinout + ',' + policy.isautogenerateinvoice +
                    ' lines=' + lines.length + ' engineOps=' + ops.length + ' gl=gated(no c_ordertax in bundle + post_resolver not mounted — postings stay the proven headless lane, never faked)');
        fanout = ops.length ? { ops: ops, glGate: 'no-order-side-acct/tax-linkage' } : null;
      } catch (er) { console.log('§SO-COMPLETE fan-out error ' + (er && er.message) + ' → status-only group'); fanout = null; }
      cb(fanout);
    });
  }

  // _serializeCommit — run a signed commit EXCLUSIVELY. commitGroup is async (it awaits crypto.subtle.digest to
  // seal the hash chain), so two commits launched on the same sidecar db interleave at the await points and TEAR
  // the chain — the grid gear-batch fans N completes synchronously, the exact trigger (a later row's write was
  // silently lost). Chain every signed commit through ONE queue: each reads a stable tip, seals + persists, then
  // the next begins. task() must return a Promise; a rejected task must not wedge the queue. (S1/J5 hardening.)
  var _commitChain = Promise.resolve();
  function _serializeCommit(task) {
    var run = _commitChain.then(task, task);
    _commitChain = run.catch(function () {});
    return run;
  }

  // commitProcess — the REAL signed write loop (W-CHAIN), now via §I-K commitGroup (Phase 3, UI tier):
  // completeFanout → buildDocActionGroup → commitGroup(db, groupOps, {gid}) → verifyChain → persist
  // sidecar → paint #docStatusBar from the COMMITTED `to`. commitGroup folds the ops all-or-none and
  // SEALS ONCE from the tip (the I-D win — not a whole-log reseal). T1 (W-SO-COMPLETE-UI): a c_order
  // Complete now carries the engine's consequence ops (ship + invoice creates) ahead of SET_STATUS; the
  // committed op is stamped with the gid so the history MOMENT carries the WHOLE group (Part B).
  function commitProcess(op) {
    var K = kernel();
    withSidecar(function (db) {
      if (!db || !K || typeof K.commitGroup !== 'function') { console.log('§CRUD process key=' + op.key + ' kernel/sql.js/commitGroup absent → DRY fallback'); dryProcess(op); return; }
      // Implementing ERP_OPLOG_APPEND_ONLY_FIX.md F3/F4 — Witness: W-COMMIT-LOCK (see commitCrud /
      // _withFreshSide's own header for the full rationale — same cross-tab mutex, same DocAction path).
      _withFreshSide(K, function (freshDb, done) {
      // T4 (GAP 4): a DocAction (Complete/Close/Void) is an ownerGated mutation of an owned document —
      // gate owner+CAS BEFORE the seal; a non-owner / stale-CAS process is REJECTED (toast, no dot, no
      // fan-out), never silently sealed. Non-gated doctypes pass through unchanged.
      _gateForOwnedWrite(op.ownerGated ? op : { ownerGated: false }, freshDb, function (gate) {
        if (!gate.ok) { _gateReject(op, gate); done(); return; }
      completeFanout(op, function (fanout) {
      _serializeCommit(function () {                            // EXCLUSIVE: no interleaved async seal (batch-safe, same-tab)
        var groupOps = CORE.buildDocActionGroup(op, fanout);   // PURE assembly: engine consequences + SET_STATUS last
        return Promise.resolve(K.commitGroup(freshDb, groupOps, _commitMeta())).then(function (res) {
          if (!res || res.committed !== true) { console.warn('§CRUD process commitGroup not-committed reason=' + (res && res.reason || '?')); dryProcess(op); return; }
          // T7 fix 2 (W-T7-INC): hot-path verify is tip-cached incremental (first call of a session is full).
          return Promise.resolve((K.verifyChainIncremental || K.verifyChain)(freshDb)).then(function (v) {
            return _sidePersist(K, freshDb, res.ids).then(function () {
              var lastId = res.ids[res.ids.length - 1];
              var row = freshDb.exec('SELECT op_uuid FROM kernel_ops WHERE id=' + lastId);
              var uuid = (row.length && row[0].values.length) ? row[0].values[0][0] : null;
              // T1 Part B: stamp the group onto the op BEFORE docDot — recordDocMoment stores the op
              // verbatim (v.docOp), so the ONE history dot carries the whole consequence group.
              op.gid = res.gid; op.groupN = res.ids.length;
              if (fanout && fanout.ops) {
                var nShip = 0, nInv = 0;
                fanout.ops.forEach(function (o) { if (o.op_type === 'CREATE_DOCUMENT') { if (o.table === 'M_InOut') nShip++; else if (o.table === 'C_Invoice') nInv++; } });
                console.log('§SO-COMPLETE order=' + op.id + ' ship=' + nShip + ' invoice=' + nInv + ' gl=gated sealed=Y gid=' + res.gid);
              }
              console.log('§CRUD process committed key=' + op.key + ' viaGroup=Y gid=' + res.gid + ' ops=' + res.ids.length + ' sealed=' + res.sealed + ' op_uuid=' + (uuid || 'null') + ' to=' + op.to + ' verifyChain=' + (v && v.ok ? 'ok' : 'FAIL'));
              setDocStatus(op.key, op.to, op.outcome, op.unmet);
              docDot(CORE.docLabel(op, fname(op.key)), op);
              toast('PROCESS ' + fname(op.key) + ' → ' + op.to + (op.outcome === 'in-progress' ? ' (In Progress)' : ' (Completed)') + ' — signed' + (v && v.ok ? '' : ' (verify FAIL!)'));
              // S1/J5 — announce the committed DOCUMENT action so a host (iDempiere chrome) re-reads the now-signed
              // DocStatus through its readTip overlay: the persisted CO shows + survives reload (op-log is the truth).
              try { global.dispatchEvent(new CustomEvent('overlay:committed',
                { detail: { table: op.table, op_type: 'DOC_ACTION', id: op.id == null ? null : op.id, to: op.to, action: op.action } })); } catch (ev) {}
            });
          });
        }).catch(function (er) { console.warn('§CRUD process commitGroup/verify error', er && er.message); dryProcess(op); });
      }).catch(function (er) { console.warn('§CRUD process commit error', er && er.message); dryProcess(op); }).then(function () { done(); }, function () { done(); });
      });
      });
      });
    });
  }

  // Implementing HISTORY_SESSION_EVENTS.md §A1-DOC — Witness: W-DOC-DOTS. One Z dot per COMMITTED doc
  // change; called ONLY from the commit funnel (applyOp / commitProcess / dryProcess), never from a
  // field/keystroke path — typing between commits stays in the input's native undo.
  // op (optional) carries {op_type, key, from, to} for A-GRAIL fold-back (§A-GRAIL).
  function docDot(label, op) { try { if (typeof global.recordDocMoment === 'function') global.recordDocMoment(label, op || null); } catch (e) {} }

  // A-GRAIL (HISTORY_SESSION_EVENTS.md §A-GRAIL) — Witness: W-FOLD-BACK.
  // foldBackDocOp: called by glassbowl.html scrubTo when moving BACKWARD past a DOC_ACTION dot.
  // T1 Part B (SO_FULL_CRUD_GAP.md, W-SO-COMPLETE-UI): the dot's gesture may be a GROUP (Complete =
  // ship + invoice + status sharing one gid) — CORE.foldBackGroup undoes the WHOLE gid in REVERSE
  // commit order (un-status, un-invoice, un-ship); a gid-less single op folds exactly as before.
  // glassbowl.html's foldDocOps → crudFoldBack(key,from,to) plumbing is REUSED UNCHANGED.
  function foldBackDocOp(key, fromStatus, toStatus) {
    var K = kernel();
    withSidecar(function (db) {
      if (db && K && typeof K.undoOp === 'function') {
        var g = CORE.foldBackGroup(db, K);
        // F1 note: undo mutates existing row(s) (`undone` flag), it does not insert new ones — so the
        // append here re-appends a FRESH snapshot of each touched row id; replay's INSERT-OR-REPLACE
        // (kernel_ops.js replayRowsInto) makes the LATEST snapshot per id win on next hydration. This
        // path is outside F3's cross-tab lock scope (undo/redo isn't part of this CORE fix's commit
        // path) — same-tab correctness only, a known, named gap for a later session, not half-built.
        _sidePersist(K, db, g.undone.map(function (u) { return u.id; }));
        if (g.gid && g.undone.length > 1)
          console.log('§FOLD-BACK key=' + key + ' group=' + g.gid + ' reversed=' + g.labels.join(',') + ' ops=' + g.undone.length + ' status=' + (toStatus || '?') + '→' + fromStatus);
        else
          console.log('§FOLD-BACK key=' + key + ' status=' + (toStatus || '?') + '→' + fromStatus + ' undone_id=' + ((g.undone[0] && g.undone[0].id) || 'null'));
      } else {
        console.log('§FOLD-BACK key=' + key + ' status=→' + fromStatus + ' (dry — sidecar absent)');
      }
      setDocStatus(key, fromStatus, 'completed', []);
    });
  }
  // foldForwardDocOp: called when moving FORWARD through a DOC_ACTION dot (re-applies the gesture —
  // the WHOLE gid in commit order when it is a group; the single op otherwise).
  function foldForwardDocOp(key, toStatus) {
    var K = kernel();
    withSidecar(function (db) {
      if (db && K && typeof K.redoOp === 'function') {
        var g = CORE.foldForwardGroup(db, K);
        _sidePersist(K, db, g.redone.map(function (u) { return u.id; }));   // see foldBackDocOp note above
        if (g.gid && g.redone.length > 1)
          console.log('§FOLD-FORWARD key=' + key + ' group=' + g.gid + ' reapplied=' + g.labels.join(',') + ' ops=' + g.redone.length + ' status=→' + toStatus);
        else
          console.log('§FOLD-FORWARD key=' + key + ' status=→' + toStatus);
      } else {
        console.log('§FOLD-FORWARD key=' + key + ' status=→' + toStatus + ' (dry — sidecar absent)');
      }
      setDocStatus(key, toStatus, 'completed', []);
    });
  }
  global.crudFoldBack = foldBackDocOp;
  global.crudFoldForward = foldForwardDocOp;

  // dryCrud — the E2 fallback for a CRUD verb (kernel/sql.js absent): log the op, drop a Z dot. The
  // change is NOT persisted (honest dry-run) — getRecord then shows the stale bundle row.
  function dryCrud(op) {
    if (op.op_type === 'CRUD_CREATE')      console.log('§CRUD create key=' + op.key + ' (dry) op=CRUD_CREATE fields=' + JSON.stringify(op.fields) + ' ownerGated=' + (op.ownerGated ? 'Y' : 'N') + ' cas=' + (op.cas || '-'));
    else if (op.op_type === 'CRUD_UPDATE') console.log('§CRUD update key=' + op.key + ' field=' + Object.keys(op.changes).join(',') + ' (dry) op=CRUD_UPDATE changes=' + JSON.stringify(op.changes));
    else if (op.op_type === 'CRUD_DELETE') console.log('§CRUD delete key=' + op.key + ' tombstone=Y reversible=Y (dry) op=CRUD_DELETE id=' + op.id);
    docDot(CORE.docLabel(op, fname(op.key)), op);
    toast(op.verb.toUpperCase() + ' ' + fname(op.key) + ' — dry-run (kernel absent)');
  }

  // ── T4 (GAP 4) owner-gate / CAS enforcement on the LIVE write — Witness: W-CRUD-GATE ─────────────
  // sessionActor — the current writer's identity (a recorded INPUT, §0.21). The page may set it
  // (window.APP.actor / window.__actor); absent → null, and the gate falls back to allow-self (the
  // single-session demo: you own what you created). NEVER invented — only read.
  function sessionActor() {
    try { if (global.APP && global.APP.actor != null) return global.APP.actor; } catch (e) {}
    try { if (global.__actor != null) return global.__actor; } catch (e2) {}
    try { if (typeof globalThis !== 'undefined' && globalThis.APP && globalThis.APP.actor != null) return globalThis.APP.actor; } catch (e3) {}
    try { if (typeof globalThis !== 'undefined' && globalThis.__actor != null) return globalThis.__actor; } catch (e4) {}
    return null;
  }
  // Task 0 companions — read the logged-in tenant and org from window.APP (set by applySession in idempiere.html).
  function sessionClientId() { try { if (global.APP && global.APP.clientId != null) return global.APP.clientId; } catch (e) {} try { if (typeof globalThis !== 'undefined' && globalThis.APP && globalThis.APP.clientId != null) return globalThis.APP.clientId; } catch (e2) {} return null; }
  function sessionOrgId()    { try { if (global.APP && global.APP.orgId    != null) return global.APP.orgId;    } catch (e) {} try { if (typeof globalThis !== 'undefined' && globalThis.APP && globalThis.APP.orgId    != null) return globalThis.APP.orgId;    } catch (e2) {} return 0; }

  // ── Task 2 — changeLog: op-log CRUD trail for one record, AD-config-filtered (iDempiere AD_ChangeLog parity)
  // Returns [{opId,ts,actor,column,old,new}] for logged columns only; null if table not in IsChangeLog=Y.
  // NON-INVENT: the IsAllowLogging/IsChangeLog filter is READ from the main db (global.__idmpDb); we follow AD.
  function changeLog(sideDb, table, recordId) {
    var mdb = (typeof globalThis !== 'undefined' && globalThis.__idmpDb) || null;
    if (!mdb || !sideDb) return null;
    try {
      var tbl = String(table || '');
      // IsChangeLog check
      var tc = mdb.exec("SELECT IsChangeLog FROM AD_Table WHERE UPPER(TableName)=UPPER(?) LIMIT 1", [tbl]);
      if (!tc.length || !tc[0].values.length || String(tc[0].values[0][0]).toUpperCase() !== 'Y') return null;
      // loggable columns (IsAllowLogging=Y) for this table
      var lc = mdb.exec("SELECT c.ColumnName FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE UPPER(t.TableName)=UPPER(?) AND c.IsAllowLogging='Y'", [tbl]);
      var loggable = {};
      if (lc.length && lc[0].values.length) lc[0].values.forEach(function (v) { loggable[String(v[0]).toLowerCase()] = 1; });
      // walk op-log
      var r = sideDb.exec("SELECT id, op_type, parameters, timestamp FROM kernel_ops WHERE op_type IN ('CRUD_CREATE','CRUD_UPDATE') AND undone=0 ORDER BY id ASC");
      if (!r.length) return [];
      var want = tbl.toLowerCase(), rid = recordId != null ? String(recordId) : null, entries = [];
      r[0].values.forEach(function (row) {
        var opId = row[0], opType = row[1], ts = row[3], p;
        try { p = JSON.parse(row[2]); } catch (e) { return; }
        if (!p || String(p.table || '').toLowerCase() !== want) return;
        if (opType === 'CRUD_CREATE') {
          if (rid !== null && String(-opId) !== rid) return;
          var f = p.fields || {};
          Object.keys(f).forEach(function (col) {
            if (!loggable[col.toLowerCase()]) return;
            entries.push({ opId: opId, ts: ts, actor: p.stdDefaults && p.stdDefaults.actor, column: col, old: null, 'new': f[col] });
          });
        } else if (opType === 'CRUD_UPDATE') {
          if (rid !== null && String(p.id) !== rid) return;
          var ch = p.changes || {};
          Object.keys(ch).forEach(function (col) {
            if (!loggable[col.toLowerCase()]) return;
            var pair = ch[col]; entries.push({ opId: opId, ts: ts, actor: p.actor, column: col, old: pair && pair.old, 'new': pair && pair['new'] });
          });
        }
      });
      console.log('§CHANGELOG table=' + tbl + ' rec=' + rid + ' entries=' + entries.length + ' filtered(IsAllowLogging)=Y');
      return entries;
    } catch (e) { return null; }
  }

  // ── Item 3a (FRONTEND_LANE_MASTER §OUTSTANDING) — recordInfo: record-level last-touch (the iDempiere "(i)"
  // popup), reconstructed from the immutable op-log. UNLIKE changeLog this is ALWAYS-ON (no AD IsChangeLog gate)
  // and UNLIKE fieldLineage it is record-grain: {created:{actor,ts,opId}, updated:{actor,ts,opId}, count}. The
  // log already carries actor+ts+sig per op, so Created/CreatedBy/Updated/UpdatedBy (materialized into the tip
  // via listTip) are READ here straight from the source rather than re-derived — they MATCH by construction.
  // NON-INVENT: every value is a real op row; ts from the op-log (no Date.now). Read-only. Witness: W-RECINFO.
  function recordInfo(sideDb, table, recordId, branch) {
    if (!sideDb || !table) return null;
    try {
      var r = sideDb.exec("SELECT id, op_type, parameters, timestamp FROM kernel_ops WHERE op_type IN ('CRUD_CREATE','CRUD_UPDATE') AND undone=0" + _branchClause(branch) + " ORDER BY id ASC");
      if (!r.length) return null;
      var want = String(table).toLowerCase(), rid = recordId != null ? String(recordId) : null;
      var created = null, updated = null, count = 0;
      r[0].values.forEach(function (row) {
        var opId = row[0], opType = row[1], ts = row[3], p;
        try { p = JSON.parse(row[2]); } catch (e) { return; }
        if (!p || String(p.table || '').toLowerCase() !== want) return;
        if (opType === 'CRUD_CREATE') {
          if (rid !== null) {
            var f = p.fields || {}, pkCol = _ciKey(f, want + '_id');
            if (!(String(-opId) === rid || (pkCol != null && String(f[pkCol]) === rid))) return;
          }
          var cActor = (p.stdDefaults && p.stdDefaults.actor) || null;
          created = { actor: cActor, ts: ts, opId: opId };
          updated = updated || { actor: cActor, ts: ts, opId: opId };
          count++;
        } else if (opType === 'CRUD_UPDATE') {
          if (rid !== null && String(p.id) !== rid) return;
          updated = { actor: p.actor || null, ts: ts, opId: opId };   // last writer wins (ASC order → final = latest)
          count++;
        }
      });
      if (!count) return null;
      console.log('§RECINFO table=' + want + ' rec=' + rid + ' createdBy=' + (created && created.actor) + ' updatedBy=' + (updated && updated.actor) + ' ops=' + count + ' (always-on, from op-log)');
      return { created: created, updated: updated, count: count };
    } catch (e) { return null; }
  }

  // ── Item 3b (FRONTEND_LANE_MASTER §OUTSTANDING) — fieldLineage: the FULL value history of ONE column,
  // reconstructed as a filtered fold of the op-log. Witness: W-FIELD-LINEAGE. This is the always-on,
  // zero-setup replacement for iDempiere's AD_ChangeLog: NOT gated by IsAllowLogging/IsChangeLog (the log IS
  // the history, so every field is traceable for free). Returns newest-first [{opId,ts,actor,value,prev,action}]
  // for (table, recordId, column) — value = the value SET by that op; prev = the value before it. action ∈
  // {'CREATE','UPDATE'}. NON-INVENT: every entry is a real op row; column match is case-insensitive (AD cols
  // vary in case across CREATE.fields vs UPDATE.changes). Read-only; callers cap to last N for hot fields.
  // BLUE FUTURE: `branch` (optional) — official lineage by default; the blue VIEW shows blue edits too.
  function fieldLineage(sideDb, table, recordId, column, branch) {
    if (!sideDb || !table || !column) return [];
    try {
      var r = sideDb.exec("SELECT id, op_type, parameters, timestamp FROM kernel_ops WHERE op_type IN ('CRUD_CREATE','CRUD_UPDATE') AND undone=0" + _branchClause(branch) + " ORDER BY id ASC");
      if (!r.length) return [];
      var want = String(table).toLowerCase(), rid = recordId != null ? String(recordId) : null;
      var wantCol = String(column).toLowerCase(), out = [];
      r[0].values.forEach(function (row) {
        var opId = row[0], opType = row[1], ts = row[3], p;
        try { p = JSON.parse(row[2]); } catch (e) { return; }
        if (!p || String(p.table || '').toLowerCase() !== want) return;
        if (opType === 'CRUD_CREATE') {
          var f = p.fields || {};
          if (rid !== null) {
            // a created row is keyed by EITHER its real embedded pk (<table>_id in fields) OR, for an
            // overlay row with no real pk yet, the synthetic -opId. Match on either so CREATE joins its UPDATEs.
            var pkCol = _ciKey(f, want + '_id');
            var pkMatch = String(-opId) === rid || (pkCol != null && String(f[pkCol]) === rid);
            if (!pkMatch) return;
          }
          var ck = _ciKey(f, wantCol); if (ck == null) return;
          out.push({ opId: opId, ts: ts, actor: (p.stdDefaults && p.stdDefaults.actor) || null,
                     value: f[ck], prev: null, action: 'CREATE' });
        } else if (opType === 'CRUD_UPDATE') {
          if (rid !== null && String(p.id) !== rid) return;
          var ch = p.changes || {};
          var uk = _ciKey(ch, wantCol); if (uk == null) return;
          var pair = ch[uk];
          out.push({ opId: opId, ts: ts, actor: p.actor || null,
                     value: pair && pair['new'], prev: pair && pair.old, action: 'UPDATE' });
        }
      });
      out.reverse();   // newest-first for the hover blurb
      console.log('§FIELD-LINEAGE table=' + want + ' rec=' + rid + ' col=' + wantCol + ' entries=' + out.length + ' (always-on, no AD_ChangeLog)');
      return out;
    } catch (e) { return []; }
  }
  // ── Item 1 (FRONTEND_LANE_MASTER §OUTSTANDING) — PRIVATE DRAFT RESTORE-POINT. The engine half of the
  // "no official dot while typing" model. An unsaved edit is PRIVATE + local: it MUST NOT be committed to the
  // op-log (other docs read the committed tip via readTip/tipValues — never a half-typed buffer), so leaving
  // the form NEVER seals an official dot. Instead the typed values are refreshed into a per-(table,id) buffer
  // (in storage: localStorage in-browser, a Map-mock headless) carrying a dirty-pip. On RETURN the default is
  // the saved official tip; the buffer is an OPT-IN restore only. A validated Save folds draft→official dot and
  // clears the buffer; discard drops it. Two distinct marks: official committed dots vs the private "you-were-
  // here, unsaved" pip — never merged. Storage is injected so the whole contract is witnessable headless.
  // Witness: W-DRAFT-RESTORE.
  // NB: a hoisted function (not a `var`) so the prefix survives the headless early-return at the CORE export —
  // a `var DRAFT_PREFIX = …` would assign AFTER that return and read back `undefined` in node.
  function _draftPrefix() { return 'erpdraft:'; }
  function _draftKey(table, id) { return _draftPrefix() + String(table || '').toLowerCase() + ':' + (id == null ? 'new' : id); }

  // draftChangedCols — the unsaved-edit delta: typed cols whose value differs from the baseline (the official
  // tip for an edit, the create-defaults for a new row). String-compared (the form yields strings), case-
  // insensitive on the col name. PURE; the basis of both "is it dirty" and the pip's changed-col list.
  function draftChangedCols(vals, baseline) {
    var b = baseline || {}, out = [];
    Object.keys(vals || {}).forEach(function (c) {
      var nv = vals[c] == null ? '' : String(vals[c]);
      var bk = _ciKey(b, c.toLowerCase());
      var ov = bk == null ? '' : (b[bk] == null ? '' : String(b[bk]));
      if (nv !== ov) out.push(c);
    });
    return out;
  }
  function draftDirty(vals, baseline) { return draftChangedCols(vals, baseline).length > 0; }

  // draftPut — refresh the private buffer for (table,id) IFF the form is dirty; if it is CLEAN, clear any stale
  // buffer (leaving a clean form must not strand an old pip). Stores the typed vals + the tipSnapshot the draft
  // was edited over (→ drift detection) + ts/actor. Returns the stored record, or null when nothing was buffered.
  // NON-INVENT: writes ONLY to the injected storage — never to the op-log (no official dot). ts is caller-supplied
  // (no Date.now in the op path).
  function draftPut(storage, table, id, vals, opts) {
    if (!storage) return null;
    opts = opts || {};
    var cols = draftChangedCols(vals, opts.baseline);
    var key = _draftKey(table, id);
    if (!cols.length) { try { storage.removeItem(key); } catch (e) {} return null; }
    var rec = { table: String(table || '').toLowerCase(), id: id == null ? null : id, vals: vals, cols: cols,
                tipSnapshot: opts.tipSnapshot || opts.baseline || null, ts: opts.ts || 0, actor: opts.actor || null };
    try { storage.setItem(key, JSON.stringify(rec)); } catch (e) { return null; }
    console.log('§DRAFT-PUT key=' + key + ' cols=' + cols.join(',') + ' (private buffer, NO official dot)');
    return rec;
  }
  function draftGet(storage, table, id) {
    if (!storage) return null;
    try { var s = storage.getItem(_draftKey(table, id)); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function draftClear(storage, table, id) {
    if (!storage) return false;
    var key = _draftKey(table, id);
    try { storage.removeItem(key); console.log('§DRAFT-CLEAR key=' + key); return true; } catch (e) { return false; }
  }
  // draftList — every buffered draft (for the dirty-pip rail). PURE scan of the storage keys under our prefix.
  function draftList(storage) {
    if (!storage) return [];
    var out = [];
    try {
      var n = storage.length || 0;
      for (var i = 0; i < n; i++) {
        var k = storage.key(i);
        if (k && k.indexOf(_draftPrefix()) === 0) {
          try { var r = JSON.parse(storage.getItem(k)); out.push({ table: r.table, id: r.id, ts: r.ts, cols: r.cols || [] }); } catch (e) {}
        }
      }
    } catch (e) {}
    return out;
  }
  // draftDrift — "record changed underneath": did the official tip move since the draft snapshot was taken?
  // Compares the stored tipSnapshot against the CURRENT tip on the cols the draft touched. Returns
  // {drifted, cols} so the restore UI can WARN (the item-1 DECISION OWED) instead of silently clobbering.
  function draftDrift(draft, currentTip) {
    if (!draft || !draft.tipSnapshot || !currentTip) return { drifted: false, cols: [] };
    var snap = draft.tipSnapshot, cols = [];
    (draft.cols || []).forEach(function (c) {
      var sk = _ciKey(snap, c.toLowerCase()), tk = _ciKey(currentTip, c.toLowerCase());
      var sv = sk == null ? '' : String(snap[sk] == null ? '' : snap[sk]);
      var tv = tk == null ? '' : String(currentTip[tk] == null ? '' : currentTip[tk]);
      if (sv !== tv) cols.push(c);
    });
    return { drifted: cols.length > 0, cols: cols };
  }

  // case-insensitive key lookup in an object (CREATE.fields / UPDATE.changes use varied AD column casing).
  function _ciKey(obj, lowerCol) {
    if (!obj) return null;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) { if (keys[i].toLowerCase() === lowerCol) return keys[i]; }
    return null;
  }

  // ── Task 4 — allocDocNo: assign DocumentNo from AD_Sequence on CRUD_CREATE for document tables.
  // Approach (a-simplified): number embedded in the op fields (replay-stable); sequence CurrentNext
  // bumped directly in the main db (state not in op-log — acceptable for demo; name the trade-off).
  // Returns the formatted DocumentNo, or null when no matching active sequence (named, not faked).
  // _previewDocNo — the sequence's NEXT DocumentNo WITHOUT consuming it (iDempiere shows this preview on a New
  //   form; the field is filled so the numeric val rule passes + the user isn't asked to type a doc number).
  //   The real number is allocated (and the sequence consumed) at commit by _allocDocNo. Returns null if no seq.
  // AUDIT GAP (c) — honour the doctype's controlled sequence (general not custom): when the record carries a
  //   C_DocType(/Target) whose C_DocType.IsDocNoControlled='Y', iDempiere allocates DocumentNo from that doctype's
  //   DocNoSequence_ID, NOT the table-level DocumentNo_<table> sequence. Returns the AD_Sequence_ID to use, else
  //   null (→ fall back to the named table sequence). c_doctype is lower-cased in the bundle (data table).
  function _docTypeSeqId(mdb, fields) {
    try {
      if (!fields) return null;
      var dt = fields.c_doctype_id != null ? fields.c_doctype_id : (fields.C_DocType_ID != null ? fields.C_DocType_ID
             : (fields.c_doctypetarget_id != null ? fields.c_doctypetarget_id : fields.C_DocTypeTarget_ID));
      if (dt == null || String(dt) === '' || !isFinite(Number(dt))) return null;
      var r = mdb.exec("SELECT isdocnocontrolled, docnosequence_id FROM c_doctype WHERE c_doctype_id=" + Number(dt) + " LIMIT 1");
      if (!r.length || !r[0].values.length) return null;
      var controlled = String(r[0].values[0][0]).toUpperCase() === 'Y', seqId = r[0].values[0][1];
      return (controlled && seqId != null) ? Number(seqId) : null;
    } catch (e) { return null; }
  }
  function _previewDocNo(table, fields) {
    var mdb = (typeof globalThis !== 'undefined' && globalThis.__idmpDb) || null; if (!mdb) return null;
    var cols = _getTableCols(table); if (!cols['documentno']) return null;
    try {
      var dtSeq = _docTypeSeqId(mdb, fields);
      var r = dtSeq != null
        ? mdb.exec("SELECT CurrentNext, Prefix, Suffix FROM AD_Sequence WHERE AD_Sequence_ID=" + dtSeq + " AND IsActive='Y' LIMIT 1")
        : mdb.exec("SELECT CurrentNext, Prefix, Suffix FROM AD_Sequence WHERE UPPER(Name)=UPPER(?) AND IsActive='Y' LIMIT 1", ['DocumentNo_' + table]);
      if (!r.length || !r[0].values.length) return null;
      var v = r[0].values[0]; return (v[1] || '') + v[0] + (v[2] || '');
    } catch (e) { return null; }
  }
  function _allocDocNo(table, fields) {
    var mdb = (typeof globalThis !== 'undefined' && globalThis.__idmpDb) || null;
    if (!mdb) return null;
    var cols = _getTableCols(table);
    if (!cols['documentno']) return null;
    try {
      var dtSeq = _docTypeSeqId(mdb, fields), seqName = 'DocumentNo_' + table;
      var r = dtSeq != null
        ? mdb.exec("SELECT AD_Sequence_ID, CurrentNext, IncrementNo, Prefix, Suffix FROM AD_Sequence WHERE AD_Sequence_ID=" + dtSeq + " AND IsActive='Y' LIMIT 1")
        : mdb.exec("SELECT AD_Sequence_ID, CurrentNext, IncrementNo, Prefix, Suffix FROM AD_Sequence WHERE UPPER(Name)=UPPER(?) AND IsActive='Y' LIMIT 1", [seqName]);
      if (!r.length || !r[0].values.length) { console.log('§DOCNO no-sequence table=' + table + (dtSeq != null ? ' doctypeSeq=' + dtSeq : ' seq=' + seqName) + ' (named, not faked)'); return null; }
      var v = r[0].values[0], seqId = v[0], next = v[1], incr = v[2] || 1, prefix = v[3] || '', suffix = v[4] || '';
      var docNo = (prefix || '') + next + (suffix || '');
      // honor a MANUAL override (a value the user changed AWAY from the preview); otherwise allocate (consume)
      //   the sequence. The New form pre-fills the preview (= docNo), so an untouched field allocates this number.
      var provided = fields ? (fields['DocumentNo'] != null ? fields['DocumentNo'] : fields['documentno']) : null;
      if (provided != null && String(provided) !== '' && String(provided) !== String(docNo)) return null;
      mdb.run('UPDATE AD_Sequence SET CurrentNext=' + (next + incr) + ' WHERE AD_Sequence_ID=' + seqId);
      console.log('§DOCNO table=' + table + ' seq=' + (dtSeq != null ? ('doctype#' + dtSeq) : seqName) + ' next=' + next + ' docno=' + docNo + ' docNoControlled=' + (dtSeq != null) + ' replay-stable=Y');
      return docNo;
    } catch (e) { return null; }
  }
  // _gateCtxFor — resolve {actor, owner, casCol, casExpected, casCurrent} for an ownerGated op from the
  // REAL record (NON-INVENT): owner = the record's recorded owner column (createdby / owner / claimed_by);
  // casCurrent = the record's current cas-column value (read-the-tip first, else the bundle row); casExpected
  // = the op's read-time baseline (op.casExpected, stamped when the form opened) if the caller carries one.
  // In the single-session demo with no login, actor defaults to owner (self) → PASS; an explicit op.actor or
  // a stale op.casExpected exercises the REJECT path the witness proves headless.
  function _gateCtxFor(op, rec, db) {
    var entry = entryFor(op.key) || {};
    var casCol = entry.cas || (op.cas) || null;
    var ownerCol = entry.ownerCol || 'createdby';
    var owner = rec && (rec[ownerCol] != null ? rec[ownerCol] : (rec.owner != null ? rec.owner : (rec.claimed_by != null ? rec.claimed_by : null)));
    var actor = (op.actor != null) ? op.actor : (sessionActor() != null ? sessionActor() : owner);   // allow-self when no session actor
    var casCurrent;
    if (casCol) {
      casCurrent = rec && rec[casCol] != null ? rec[casCol] : null;
      try { var tv = db ? CORE.tipValues(db, op.table, op.id, _readBranch()) : null; if (tv && Object.prototype.hasOwnProperty.call(tv, casCol)) casCurrent = tv[casCol]; } catch (e) {}
    }
    return { actor: actor, owner: owner, casCol: casCol,
             casExpected: (op.casExpected !== undefined ? op.casExpected : casCurrent), casCurrent: casCurrent };
  }
  // _gateReject — surface a REJECT in the UI: a toast + NO history dot (the write never happened), and the
  // §-log line the witness asserts. Replaces the old silent dry fallback for an ownerGated denial.
  function _gateReject(op, gate) {
    console.log('§CRUD-GATE key=' + op.key + ' ownerGated=Y verdict=REJECT reason=' + gate.reason);
    toast((op.verb ? op.verb.toUpperCase() + ' ' : '') + fname(op.key) + ' — REJECTED (' +
          (gate.reason === 'owner' ? 'not the owner' : 'stale write — record changed') + ')');
  }
  // _gateForOwnedWrite — run the pre-seal owner/CAS check for an ownerGated mutating op; resolves the ctx
  // from the record (getRecord layers read-the-tip), then cb(gate). Non-gated ops short-circuit to PASS.
  function _gateForOwnedWrite(op, db, cb) {
    if (!op.ownerGated) { cb({ ok: true }); return; }
    getRecord(op.key, function (rec) {
      var ctx = _gateCtxFor(op, rec, db);
      var gate = CORE.gateOp(op, ctx);
      if (gate.ok) console.log('§CRUD-GATE key=' + op.key + ' ownerGated=Y verdict=PASS actor=' + ctx.actor + ' owner=' + ctx.owner + (ctx.casCol ? ' cas=' + ctx.casCol : ''));
      cb(gate);
    });
  }

  // commitCrud — the REAL signed write for a CRUD field verb (CREATE/UPDATE/DELETE), the field-value peer
  // of commitProcess. SAME sidecar path: build a kernel op carrying {table,id,changes|fields} →
  // commitGroup (all-or-none, sealed once from the tip) → verifyChain → persist. read-the-tip (tipValues)
  // later overlays these on the IMMUTABLE bundle row in getRecord — so a reopened form, the Z fold-back,
  // and a page reload (sidecar rehydrated from IndexedDB) all show the tip value. glassbowl_data.db is
  // NEVER mutated — the signed op-log is the only mutable truth (GP3 DECIDED). Kernel/sql.js absent →
  // dryCrud fallback (never a silent failure).
  function commitCrud(op) {
    var K = kernel();
    withSidecar(function (db) {
      if (!db || !K || typeof K.commitGroup !== 'function') { console.log('§CRUD ' + op.op_type + ' key=' + op.key + ' kernel/sql.js absent → DRY fallback'); dryCrud(op); return; }
      // Task 4 — DocumentNo: allocate from AD_Sequence for CRUD_CREATE on document tables (approach a-simplified)
      if (op.op_type === 'CRUD_CREATE') {
        var dn = _allocDocNo(op.table, op.fields);
        if (dn != null) { op.fields = op.fields || {}; op.fields.DocumentNo = dn; }
      }
      // Implementing ERP_OPLOG_APPEND_ONLY_FIX.md F3/F4 — Witness: W-COMMIT-LOCK. The whole
      // refresh-tip→gate→seal→append critical section now runs under the cross-tab commit lock, against
      // a FRESHLY re-hydrated SIDE (never the possibly-stale in-memory carryover) — this is what makes
      // the owner/CAS gate compare against the truly-current tip and stops two tabs sealing onto the
      // same stale prev_hash (the S3/S4 fork/loss shape _withFreshSide's header explains in full).
      _withFreshSide(K, function (freshDb, done) {
        // T4 (GAP 4): an ownerGated mutation of an EXISTING owned row (UPDATE/DELETE) is gated owner+CAS
        // BEFORE the seal — a non-owner / stale-CAS write is REJECTED (toast, NO dot), never silently sealed.
        // CREATE has no prior owner to gate (the creator becomes the owner) → passes through.
        var gatedVerb = op.ownerGated && (op.op_type === 'CRUD_UPDATE' || op.op_type === 'CRUD_DELETE');
        _gateForOwnedWrite(gatedVerb ? op : { ownerGated: false }, freshDb, function (gate) {
          if (!gate.ok) { _gateReject(op, gate); done(); return; }   // REJECT — no dry fallback, no dot
          _commitCrudSealed(op, K, freshDb, done);
        });
      });
    });
  }
  function _commitCrudSealed(op, K, db, done) {
    {
      try {
        var params = { table: op.table, id: op.id == null ? null : op.id };
        if (op.op_type === 'CRUD_UPDATE')      { params.changes = op.changes; if (op.actor != null) params.actor = op.actor; }
        else if (op.op_type === 'CRUD_CREATE') { params.fields = op.fields; params.cas = op.cas || null; if (op.stdDefaults) params.stdDefaults = op.stdDefaults; }
        else if (op.op_type === 'CRUD_DELETE') { params.tombstone = true; params.reversible = true; }
        var groupOps = [{ op_type: op.op_type, op_uuid: op.op_uuid || null, params: params }];
        Promise.resolve(K.commitGroup(db, groupOps, _commitMeta())).then(function (res) {
          if (!res || res.committed !== true) { console.warn('§CRUD ' + op.op_type + ' commitGroup not-committed reason=' + (res && res.reason || '?')); dryCrud(op); done(); return; }
          // T7 fix 2 (W-T7-INC): hot-path verify is tip-cached incremental (first call of a session is full).
          return Promise.resolve((K.verifyChainIncremental || K.verifyChain)(db)).then(function (v) {
            return _sidePersist(K, db, res.ids).then(function () {
              var cols = op.changes ? Object.keys(op.changes).join(',') : (op.fields ? Object.keys(op.fields).join(',') : '-');
              console.log('§CRUD-PERSIST key=' + op.key + ' id=' + (op.id == null ? 'null' : op.id) + ' op=' + op.op_type + ' cols=' + cols + ' source=sidecar gid=' + res.gid + ' ops=' + res.ids.length + ' sealed=' + res.sealed + ' verifyChain=' + (v && v.ok ? 'ok' : 'FAIL'));
              docDot(CORE.docLabel(op, fname(op.key)), op);
              toast(op.verb.toUpperCase() + ' ' + fname(op.key) + ' — saved (signed)' + (v && v.ok ? '' : ' (verify FAIL!)'));
              // W-AD-SELFEDIT-LIVE — announce the committed write so a host can refold on a dictionary edit
              // (AD_Field/AD_Window/AD_Tab → form/menu rebuilds = re-read the dictionary, not recompile).
              try { global.dispatchEvent(new CustomEvent('overlay:committed',
                { detail: { table: op.table, op_type: op.op_type, id: op.id == null ? null : op.id } })); } catch (ev) {}
              done();
            });
          });
        }).catch(function (er) { console.warn('§CRUD ' + op.op_type + ' commit error', er && er.message); dryCrud(op); done(); });
      } catch (er) { console.warn('§CRUD ' + op.op_type + ' commit error', er && er.message); dryCrud(op); done(); }
    }
  }

  // ── applyOp — the commit funnel. DOC_ACTION + CRUD verbs all take the GP3 signed-write seam (sidecar). ──
  function applyOp(op, e) {
    if (op.op_type === 'DOC_ACTION') { commitProcess(op); return; }                                    // GP3: signed status write
    if (op.op_type === 'CRUD_CREATE' || op.op_type === 'CRUD_UPDATE' || op.op_type === 'CRUD_DELETE') { commitCrud(op); return; }  // GP3: signed field write
    toast(op.verb.toUpperCase() + ' ' + fname(op.key) + ' — unknown op');
  }

  // applyOpGroup — commit a MULTI-op result (e.g. a Generate-Shipments/-Invoices/-Order-from-Project
  // KIND-2 CREATE_DOCUMENT + N×CREATE_LINE group, erp_engine.js's buildDoc/genShipmentLines/genInvoiceLines)
  // as ONE atomic signed op-group. Implementing ERP_BUSINESS_CYCLE_E2E.md §Fix 2026-07-22 "missing commit
  // wiring" — erp_engine.js's own header already documented the intent ("Verbs return ops[]; the kernel
  // applies + commitOps them") but no caller ever existed for the Generate-process UI path; a working
  // caller for the SAME shape already exists in pos_lens.js (buildSaleGroup/buildRegisterGroup →
  // KO.commitGroup(opDb, ops.map(o=>({op_type:o.op_type,params:o})), {})) — this reuses that exact
  // primitive+shape, wrapped in the SAME cross-tab-safe _withFreshSide hydration commitCrud already uses
  // (none of these ops are owner-gated — every op is a fresh CREATE, matching commitCrud's own "CREATE has
  // no prior owner to gate" note). K.commitGroup's own atomicity guarantee means every op in the group
  // commits together or none do. cb(result) — result = {committed, gid?, ids?, sealed?, verifyOk?, reason?}.
  function applyOpGroup(ops, cb) {
    cb = cb || function () {};
    if (!ops || !ops.length) { cb({ committed: false, reason: 'empty-group' }); return; }
    var K = kernel();
    withSidecar(function (db) {
      if (!db || !K || typeof K.commitGroup !== 'function') { console.log('§CRUD-GROUP kernel/sql.js absent — cannot commit'); cb({ committed: false, reason: 'kernel/sql.js absent' }); return; }
      _withFreshSide(K, function (freshDb, done) {
        var groupOps = ops.map(function (o) { return { op_type: o.op_type, params: o }; });
        Promise.resolve(K.commitGroup(freshDb, groupOps, _commitMeta())).then(function (res) {
          if (!res || res.committed !== true) {
            console.warn('§CRUD-GROUP commitGroup not-committed reason=' + (res && res.reason || '?'));
            cb({ committed: false, reason: (res && res.reason) || 'not-committed' }); done(); return;
          }
          return Promise.resolve((K.verifyChainIncremental || K.verifyChain)(freshDb)).then(function (v) {
            return _sidePersist(K, freshDb, res.ids).then(function () {
              console.log('§CRUD-GROUP-PERSIST ops=' + res.ids.length + ' source=sidecar gid=' + res.gid + ' sealed=' + res.sealed + ' verifyChain=' + (v && v.ok ? 'ok' : 'FAIL'));
              try { global.dispatchEvent(new CustomEvent('overlay:committed', { detail: { table: null, op_type: 'CREATE_GROUP', id: null, gid: res.gid } })); } catch (ev) {}
              cb({ committed: true, gid: res.gid, ids: res.ids, sealed: res.sealed, verifyOk: !!(v && v.ok) });
              done();
            });
          });
        }).catch(function (er) { console.warn('§CRUD-GROUP commit error', er && er.message); cb({ committed: false, reason: 'error: ' + (er && er.message) }); done(); });
      });
    });
  }

  // ── page-data helpers (truth-bound Edit pre-fill from the real bundle row) ──
  // recId — the record's pk value. key+'_id' is the convention; lookup is CASE-INSENSITIVE so it works on
  // glassbowl rows (lower-case cols) AND the iDempiere renderer's SELECT * rows (original-case cols, e.g.
  // C_Order_ID) — T3 host-mount (SO_FULL_CRUD_GAP.md GAP 3).
  function recId(key, rec) {
    if (!rec) return null;
    var pk = (key + '_id').toLowerCase();
    if (rec[pk] != null) return rec[pk];
    for (var c in rec) if (rec.hasOwnProperty(c) && String(c).toLowerCase() === pk && rec[c] != null) return rec[c];
    return null;
  }
  function assignVals(e, rec) { var v = {}; (e.fields || []).forEach(function (f) { v[f.col] = rec && rec[f.col] != null ? rec[f.col] : ''; }); return v; }
  // getRecord — prefer the row in the currently-traced O2C chain (the lit instance), else the first row.
  // The immutable bundle row is the BASELINE; _overlayTip then layers the signed sidecar's read-the-tip
  // field values on top, so the form (re)opens on the tip value, not the stale original.
  function getRecord(key, cb, explicitId) {
    if (typeof withBundle !== 'function') { cb({}); return; }
    var wantId = (explicitId != null) ? explicitId : null;   // S2/J4 host Edit/Delete target a SPECIFIC record id
    try { if (wantId == null && typeof curChain !== 'undefined' && curChain) { for (var i = 0; i < curChain.length; i++) if (String(curChain[i].table).toLowerCase() === String(key).toLowerCase() && curChain[i].id != null) wantId = curChain[i].id; } } catch (er) {}
    withBundle(function (db) {
      try {
        var pk = key + '_id', sql = wantId != null ? 'SELECT * FROM ' + key + ' WHERE ' + pk + '=' + wantId + ' LIMIT 1' : 'SELECT * FROM ' + key + ' ORDER BY ' + pk + ' LIMIT 1';
        var res = db.exec(sql);
        if (!res.length || !res[0].values.length) { _recordFromOplog(key, wantId, cb); return; }   // S2/J4: a created (synthetic-pk) row lives ONLY in the op-log, not the bundle — fold it from there
        // expose each column under BOTH its original name and its lower-cased alias — the form (f.col is
        // lower-case) + recId resolve regardless of the surface's column casing (glassbowl lower vs iDempiere
        // SELECT * original-case). T3 host-mount (SO_FULL_CRUD_GAP.md GAP 3).
        var o = {}; res[0].columns.forEach(function (c, i) { var val = res[0].values[0][i]; o[c] = val; var lc = String(c).toLowerCase(); if (lc !== c && o[lc] === undefined) o[lc] = val; }); _overlayTip(key, o, cb);
      } catch (er) { cb({}); }
    });
  }
  // _recordFromOplog — load a row that exists ONLY in the signed op-log (a created/synthetic-pk row), so the Edit
  //   form can pre-fill it and a CHANGE is possible the moment a draft is saved — the most basic AD flow. Folds
  //   listTip (CREATE + later UPDATE ops, latest-wins) and returns the matching row, lower-cased aliases exposed.
  //   No id / no sidecar / not found → empty object (the caller renders a blank form, never crashes).
  function _recordFromOplog(key, wantId, cb) {
    if (wantId == null || typeof withSidecar !== 'function') { cb({}); return; }
    withSidecar(function (sdb) {
      if (!sdb) { cb({}); return; }
      try {
        var pkc = key + '_id';
        var lt = CORE.listTip(sdb, key, pkc, [], _readBranch());
        var hit = (lt && lt.rows || []).filter(function (r) { return String(r[pkc]) === String(wantId); })[0];
        if (!hit) { console.log('§CRUD-OPLOG-ROW key=' + key + ' id=' + wantId + ' not-found (no create op)'); cb({}); return; }
        var o = {}; for (var c in hit) if (hit.hasOwnProperty(c)) { o[c] = hit[c]; var lc = String(c).toLowerCase(); if (lc !== c && o[lc] === undefined) o[lc] = hit[c]; }
        console.log('§CRUD-OPLOG-ROW key=' + key + ' id=' + wantId + ' loaded=' + Object.keys(hit).length + ' source=listTip');
        cb(o);
      } catch (e) { cb({}); }
    });
  }
  // _overlayTip — layer the signed sidecar's read-the-tip field values over the immutable bundle row.
  // Sidecar absent (kernel/sql.js not loaded) → pass the baseline row through unchanged. NON-MUTATING of
  // the bundle DB: the overlay lives only on the returned JS object.
  function _overlayTip(key, o, cb) {
    var id = recId(key, o);
    if (id == null || typeof withSidecar !== 'function') { cb(o); return; }
    withSidecar(function (db) {
      if (db) {
        try {
          var tip = CORE.tipValues(db, key, id, _readBranch()), cols = Object.keys(tip);
          if (cols.length) { cols.forEach(function (c) { o[c] = tip[c]; });
            console.log('§CRUD-TIP key=' + key + ' id=' + id + ' overlaid=' + cols.join(',') + ' source=sidecar'); }
          // W-CRUD-DOCSTATUS: docstatus truth = the SET_STATUS tip (the FSM lane), not a column write —
          // the edit form must render the CURRENT status selected, same source doProcess derives `from` off.
          var st = CORE.readTip(db, key, id, _readBranch());
          if (st != null && Object.prototype.hasOwnProperty.call(o, 'docstatus') && o.docstatus !== st) {
            o.docstatus = st;
            console.log('§CRUD-TIP key=' + key + ' id=' + id + ' docstatus=' + st + ' source=readTip(SET_STATUS)');
          }
        } catch (e) {}
      }
      cb(o);
    });
  }

  // ── the RAF loop (only while Edit-mode on) ──────────────────────────────────
  function loop() { if (!on) { raf = 0; return; } positionHots(); if (ring.classList.contains('open')) positionRing(); raf = requestAnimationFrame(loop); }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fname(k) { return (typeof window.fname === 'function') ? window.fname(k) : k; }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'crud-toast'; t.textContent = msg; document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 350); }, 2600);
  }

  function injectCss() {
    var css = document.createElement('style');
    css.textContent =
      '#crudModeWrap{display:none}' +   // hidden — Edit-mode now surfaces as a registry pill (pills_idmp.json)

      '#crudRing{position:fixed;z-index:72;width:0;height:0;pointer-events:none;display:none}#crudRing.open{display:block}' +
      '#crudRing .crud-fab{position:absolute;left:0;top:0;width:' + FAB + 'px;height:' + FAB + 'px;margin:0;border-radius:50%;border:1px solid #2f4654;' +
        'font:600 15px system-ui;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.55);opacity:0;transform:translate(-50%,-50%) translate(0,0) scale(.1);transition:transform .24s cubic-bezier(.34,1.56,.64,1),opacity .2s}' +
      '#crudRing .crud-fab:hover:not(.dis){filter:brightness(1.25);border-color:#fff}' +
      '#crudRing .crud-fab.dis{cursor:not-allowed;filter:grayscale(1);border-style:dashed}' +
      '#crudRing .crud-fab.new{background:#16493a;color:#bff0dd}#crudRing .crud-fab.view{background:#13202b;color:#9fdfe8}' +
      '#crudRing .crud-fab.edit{background:#3a3416;color:#f0e6bf}#crudRing .crud-fab.del{background:#4a1d1a;color:#f0c3bf}' +
      '#crudRing .crud-fab.proc{background:#16395a;color:#bfe0f0}#crudRing .crud-fab.rpt{background:#1a2b3a;color:#9fdfe8}' +
      '#crudRing .crud-fab.proc.pulse{animation:fabPulse 1.2s ease-in-out 2}' +
      '@keyframes fabPulse{0%,100%{box-shadow:0 2px 8px rgba(0,0,0,.55)}50%{box-shadow:0 0 0 4px #56d6e0,0 2px 8px rgba(0,0,0,.55)}}' +
      '.crud-hot{position:fixed;z-index:68;transform:translate(-50%,-50%);border-radius:50%;pointer-events:auto;cursor:pointer;display:none;border:2px solid transparent;transition:border-color .15s}' +
      '.crud-hot:hover{border-color:rgba(224,102,192,.55)}' +
      '#crudForm{position:fixed;z-index:74;left:50%;top:12%;transform:translateX(-50%);width:min(420px,94vw);background:#15101a;border:1px solid #4a2f44;border-radius:12px;padding:14px 16px;color:#ecdcea;font:13.5px/1.5 system-ui;box-shadow:0 10px 40px rgba(0,0,0,.65);display:none}' +
      '#crudForm.open{display:block}#crudForm .cfh{font-weight:600;font-size:17px;margin:0 0 10px;color:#fbeaf7}#crudForm .cfx{position:absolute;right:11px;top:9px;color:#a07f99;cursor:pointer}' +
      '#crudForm .cfrow{display:grid;grid-template-columns:128px 1fr;align-items:center;gap:8px;margin:0 0 9px}' +
      '#crudForm .cfl{font-size:12.5px;color:#c4a8c0}#crudForm .cfl .req{color:#e2574c;font-style:normal}' +
      '#crudForm .cfi{width:100%;background:#0f0b13;border:1px solid #3a2b38;border-radius:7px;padding:6px 8px;color:#ecdcea;font:13px system-ui}' +
      '#crudForm .cfi:disabled{opacity:.55;cursor:not-allowed}#crudForm .cfi:focus{border-color:#e066c0;outline:none}' +
      '#crudForm .cfe{grid-column:2;font-size:11px;color:#ff7a6e;min-height:0}' +
      '#crudForm .cfnav{display:flex;align-items:center;gap:8px;margin-top:12px}#crudForm .cfnote{font-size:11px;color:#8a6f86;font-style:italic}#crudForm .cfgrow{flex:1}' +
      '#crudForm .cfb{background:#1e1622;color:#ecdcea;border:1px solid #4a2f44;border-radius:8px;padding:6px 13px;font:13px system-ui;cursor:pointer}#crudForm .cfb:hover{border-color:#e066c0}' +
      '#crudForm .cfsave{background:#16493a;border-color:#2f6d5a;color:#bff0dd}#crudForm .cfdel{background:#4a1d1a;border-color:#7a2f2a;color:#f0c3bf}' +
      '#crudForm .cfwarn{margin:0 0 7px}#crudForm .cfdim{color:#8a6f86;font-size:12px}' +
      // INLINE CRUD (P2) — the iDempiere form view editable in place. Rows reuse .cfrow; verb bar = .ic-bar.
      '.idmp-inline-crud .cfrow{display:grid;grid-template-columns:170px 1fr;align-items:center;gap:10px;margin:0 0 8px}' +
      '.idmp-inline-crud .cfl{font-size:12.5px;color:#5a6270}.idmp-inline-crud .cfl .req{color:#c0392b;font-style:normal}' +
      '.idmp-inline-crud .cfi{width:100%;background:#fff;border:1px solid #c8cdd6;border-radius:6px;padding:6px 8px;color:#1a1f28;font:13px system-ui}' +
      '.idmp-inline-crud .cfi:disabled{background:#f1f2f5;color:#7a808c;cursor:not-allowed}.idmp-inline-crud .cfi:focus{border-color:#2f6fd6;outline:none}' +
      '.idmp-inline-crud .cfe{grid-column:2;font-size:11px;color:#c0392b;min-height:0}' +
      '.idmp-inline-crud .ic-bar{display:flex;align-items:center;gap:7px;margin:0 0 12px;padding:0 0 9px;border-bottom:1px solid #e2e5ea}' +
      '.idmp-inline-crud .ic-vb{background:#f5f6f8;color:#2a3140;border:1px solid #c8cdd6;border-radius:7px;padding:5px 13px;font:13px system-ui;cursor:pointer}' +
      '.idmp-inline-crud .ic-vb:hover:not(:disabled){border-color:#2f6fd6;color:#1f4fa6}.idmp-inline-crud .ic-vb:disabled{opacity:.45;cursor:default}' +
      '.idmp-inline-crud .ic-save:not(:disabled){background:#1f7a4d;border-color:#1f7a4d;color:#fff}.idmp-inline-crud .ic-grow{flex:1}' +
      '.idmp-inline-crud .ic-dirty{font-size:12px;color:#c77d12;font-weight:600}.idmp-inline-crud .ic-ro{font-size:12px;color:#7a808c;font-style:italic;margin:0 0 10px}' +
      // P3 — Delete verb + inline delete-confirm strip.
      '.idmp-inline-crud .ic-del{color:#b3261e}.idmp-inline-crud .ic-del:hover:not(:disabled){border-color:#b3261e;color:#911c16}' +
      '.idmp-inline-crud .ic-confirm{font-size:12.5px;color:#b3261e;font-weight:600}.idmp-inline-crud .ic-confirm em{color:#7a808c;font-weight:400;font-style:normal}' +
      // T3 — a dirty inline form blocks Process (Save is the boundary before ProcessIt): dim+disable the DocAction bar.
      '.idmp-form-dirty .idmp-docfsm button{opacity:.4;pointer-events:none}.idmp-form-dirty .idmp-docfsm::after{content:"— Save first";font-size:11px;color:#c77d12;margin-left:8px}' +
      '.crud-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(12px);z-index:80;background:#221826;border:1px solid #4a2f44;border-radius:10px;padding:9px 15px;color:#eecfe8;font:13px system-ui;box-shadow:0 6px 24px rgba(0,0,0,.6);opacity:0;transition:opacity .3s,transform .3s}' +
      '.crud-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}' +
      '#docStatusBar{position:fixed;left:14px;bottom:14px;z-index:73;display:none;align-items:center;gap:9px;background:#15101a;border:1px solid #4a2f44;border-radius:10px;padding:7px 13px;font:12.5px system-ui;color:#ecdcea;box-shadow:0 4px 18px rgba(0,0,0,.55)}' +
      '#docStatusBar.show{display:flex}#docStatusBar .dsbk{color:#c4a8c0;font-weight:600}#docStatusBar .dsbv{color:#bff0dd}' +
      '#docStatusBar.ip{border-color:#6d5a2f}#docStatusBar.ip .dsbv{color:#f0d9a0}' +
      '#docStatusBar.s-CO{border-color:#2f6d5a}#docStatusBar.pulse{animation:dsbPulse 1s ease-in-out 2}' +
      '@keyframes dsbPulse{0%,100%{box-shadow:0 4px 18px rgba(0,0,0,.55)}50%{box-shadow:0 0 0 3px #56d6e0,0 4px 18px rgba(0,0,0,.55)}}';
    document.head.appendChild(css);
  }

  // pulseProc — REVEAL+PULSE the Process ▶ for a keyed doc on the guide's request. Reveal only:
  // it opens the ring and pulses the ▶ fab so the user can SEE it; it NEVER fires Process (the user's
  // gesture does that — READSHOWME §guide-vocabulary "pulse … never auto-fire").
  function pulseProc(key) {
    if (!on) { console.log('§CRUD pulse key=' + key + ' skipped (edit-mode off)'); return; }
    if (typeof idx === 'undefined' || idx[key] == null) { console.log('§CRUD pulse key=' + key + ' skipped (no bubble)'); return; }
    openRing(key);
    var fab = ring.querySelector('.crud-fab.proc');
    if (fab && !fab.classList.contains('dis')) {
      fab.classList.add('pulse'); setTimeout(function () { fab.classList.remove('pulse'); }, 2400);
      console.log('§CRUD pulse key=' + key + ' proc revealed (no auto-fire)');
    } else {
      console.log('§CRUD pulse key=' + key + ' proc N/A (no process verb)');
    }
  }
  // react to the guide's key-addressed intents (no import — the bus is the seam).
  global.addEventListener('overlay:guide', function (ev) {
    var d = ev && ev.detail; if (!d) return;
    if (d.verb === 'pulse' && d.kind === 'process' && d.key) pulseProc(d.key);
  });

  // history — the signed op-log as the truth (GP3): every committed Process op, newest first. The op-log
  // is reversible (kernel undoOp); a full History view UI is the next increment. Returns [] until a write.
  function history() {
    if (!SIDE) return [];
    try {
      var r = SIDE.exec("SELECT id,op_uuid,timestamp,op_type,parameters,undone FROM kernel_ops WHERE op_type='SET_STATUS' ORDER BY id DESC");
      if (!r.length) return [];
      return r[0].values.map(function (v) { return { id: v[0], op_uuid: v[1], ts: v[2], op_type: v[3], params: JSON.parse(v[4]), undone: !!v[5] }; });
    } catch (e) { return []; }
  }
  // ── Item 3b (FRONTEND_LANE_MASTER §OUTSTANDING) — PER-FIELD LINEAGE hover-pause blurb ──────────────
  // Witness: W-FIELD-LINEAGE (engine) + §LINEAGE-HOVER (live DOM). Dwell ~900ms on any field carrying a
  // column id → reveal that column's full value history folded from the op-log (value · who · when), newest
  // -first. Always-on, read-only, zero setup — the inline replacement for iDempiere's AD_ChangeLog window.
  // Delegated ONE document listener (no per-field wiring): resolves (table,id,column) from the hovered
  // element's attributes + nearest data-ad-table/record ancestor. Empty history → no popup (only fields with
  // real logged edits reveal a blurb, so it's never noise). NON-INVENT: every line is a real op row.
  (function lineageHover() {
    if (typeof document === 'undefined') return;
    var DWELL = 900, MAX = 8, tip = null, timer = null, curEl = null;
    function ensureTip() {
      if (tip) return tip;
      var st = document.createElement('style');
      st.textContent =
        '.idmp-lineage{position:fixed;z-index:100000;max-width:320px;background:#1c2230;color:#e8edf6;' +
        'border:1px solid #3a455c;border-radius:8px;padding:8px 10px;font:12px/1.45 system-ui,sans-serif;' +
        'box-shadow:0 6px 22px rgba(0,0,0,.45);pointer-events:none;display:none}' +
        '.idmp-lineage b{color:#8fc8ff;font-weight:600}.idmp-lineage .ll-row{white-space:nowrap;overflow:hidden;' +
        'text-overflow:ellipsis}.idmp-lineage .ll-who{color:#9fb0c8}.idmp-lineage .ll-when{color:#6f7e96}' +
        '.idmp-lineage .ll-more{color:#6f7e96;margin-top:4px}';
      document.head.appendChild(st);
      tip = document.createElement('div'); tip.className = 'idmp-lineage'; document.body.appendChild(tip);
      return tip;
    }
    function resolve(target) {
      var el = target && target.closest && target.closest('[data-col],[data-ad-column],[data-ad-col]');
      if (!el) return null;
      var column = el.getAttribute('data-col') || el.getAttribute('data-ad-column') || el.getAttribute('data-ad-col');
      if (!column) return null;
      var tEl = el.closest('[data-ad-table]'), rEl = el.closest('[data-ad-record]');
      var table = tEl && tEl.getAttribute('data-ad-table');
      var id = rEl && rEl.getAttribute('data-ad-record');
      if (!table || id == null || id === '') return null;
      return { el: el, table: table, id: id, column: column };
    }
    function fmtVal(v) { return v == null || v === '' ? '∅' : esc(String(v)); }
    function show(ctx, x, y) {
      if (!SIDE) return;
      var lin = CORE.fieldLineage(SIDE, ctx.table, ctx.id, ctx.column);
      if (!lin || !lin.length) return;                 // nothing logged → no popup (never noise)
      var t = ensureTip(), rows = lin.slice(0, MAX).map(function (e) {
        var val = e.action === 'CREATE' ? ('set ' + fmtVal(e.value)) : (fmtVal(e.prev) + ' → ' + fmtVal(e.value));
        var who = e.actor ? ' <span class=ll-who>' + esc(e.actor) + '</span>' : '';
        var when = e.ts ? ' <span class=ll-when>' + esc(CORE.fmtKernelTs(e.ts)) + '</span>' : '';
        return '<div class=ll-row>' + val + who + when + '</div>';
      }).join('');
      var more = lin.length > MAX ? '<div class=ll-more>+' + (lin.length - MAX) + ' older…</div>' : '';
      t.innerHTML = '<b>' + esc(ctx.column) + '</b> · ' + lin.length + ' change' + (lin.length === 1 ? '' : 's') + rows + more;
      t.style.display = 'block';
      var w = t.offsetWidth, h = t.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      t.style.left = Math.min(x + 14, vw - w - 8) + 'px';
      t.style.top = (y + 18 + h > vh ? y - h - 10 : y + 18) + 'px';
      console.log('§LINEAGE-HOVER ' + ctx.table + '#' + ctx.id + '.' + ctx.column + ' entries=' + lin.length);
    }
    function hide() { if (timer) { clearTimeout(timer); timer = null; } if (tip) tip.style.display = 'none'; curEl = null; }
    document.addEventListener('pointermove', function (ev) {
      var ctx = resolve(ev.target);
      if (!ctx) { if (curEl) hide(); return; }
      if (ctx.el === curEl) return;                    // same field — keep pending/shown
      hide(); curEl = ctx.el;
      var x = ev.clientX, y = ev.clientY;
      timer = setTimeout(function () { timer = null; show(ctx, x, y); }, DWELL);
    }, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('scroll', hide, true);
    global.__lineageHover = { show: show, hide: hide, resolve: resolve };  // exposed for the live §-log probe
  })();

  global.__crud = { enable: enable, disable: disable, openRing: openRing, core: CORE, store: function () { return STORE; },
                    applyOp: applyOp,   // §A1-DOC: the commit funnel, exposed for in-browser smoke
                    applyOpGroup: applyOpGroup,   // §ORDERLINE-PARENT-FK follow-on (ERP_BUSINESS_CYCLE_E2E.md §Fix 2026-07-22): commit a multi-op KIND-2 Generate-process result (CREATE_DOCUMENT + N×CREATE_LINE) as one atomic signed group
                    process: hostProcess,   // S1/J5: host-callable signed DocAction (iDempiere pill/bar/grid-batch → shared lane)
                    create: hostCreate,     // S2/J4: host-callable New — opens the create form directly (ring not fanned) → signed CRUD_CREATE
                    update: hostUpdate, remove: hostDelete,   // S2/J4 full-CRUD: host-callable Edit/Delete on a specific id (ring not fanned) → signed CRUD_UPDATE/DELETE
                    editInline: editInline, createInline: createInline, copyInline: copyInline,   // P2/P3 (W-INPLACE-*): in-place editable form view (no modal, no ✎ Edit) — edit/new/copy
                    editCell: editCell,   // P4 (W-INPLACE-GRID-LIVE): row-wise grid cell edit → ONE signed CRUD_UPDATE (GridView parity)
                    ignoreInline: ignoreInline, inlineDirty: _inlineDirty, formNeedsSave: _inlineContentDirty,   // Leg 4 (W-DIRTY-GATE): content-aware "leaving loses real work?" seam
                    registerFolded: registerFolded, ensureStore: _ensureStore, hasEntry: hasEntry,   // S2B: AD-folded CRUD — host registers a dictionary-derived spec so ANY table is editable (entryFor fallback)
                    fireCreateCallout: fireCreateCallout,   // S2/J4: host glue — AD callout dispatch on a create-form field change (price/defaults)
                    foldBack: foldBackDocOp, foldForward: foldForwardDocOp,  // §A-GRAIL: fold via scrub
                    setStatus: setDocStatus, statusBar: function () { return statusBar; }, pulseProc: pulseProc,
                    kernelDb: function () { return SIDE; }, withSidecar: withSidecar,
                    readTip: function (table, id) { return SIDE ? CORE.readTip(SIDE, table, id, _readBranch()) : null; }, history: history,
                    changeLog: function (table, id) { return SIDE ? CORE.changeLog(SIDE, table, id) : null; },
                    fieldLineage: function (table, id, col) { return SIDE ? CORE.fieldLineage(SIDE, table, id, col, _readBranch()) : []; },  // Item 3b (W-FIELD-LINEAGE) + BLUE FUTURE view
                    restoreDraft: restoreDraft, bufferDraft: _bufferDraft,   // Item 1 (W-DRAFT-RESTORE-LIVE): opt-in restore + leave-buffer (host/witness seam)
                    recordInfo: function (table, id) { return SIDE ? CORE.recordInfo(SIDE, table, id, _readBranch()) : null; },  // Item 3a (W-RECINFO): record-level who/when from the op-log
                    fmtTs: CORE.fmtKernelTs,
                    editModeOn: function () { return on; },
                    toggleEditMode: function () { ck.checked = !ck.checked; ck.dispatchEvent(new Event('change')); },
                    syncNow: syncNow };   // §Relay Wiring (W-N-CONVERGE): manual push+pull+rebase against a configured relay
  console.log('§CRUD layer mounted (Edit-mode ready)');
})(typeof window !== 'undefined' ? window : this);
