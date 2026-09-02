// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* crud_core.js — crud_overlay.js's PURE CORE, physically split out VERBATIM
 * (bim-compiler prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md §S60 item 1; extraction precedent:
 * viewer/gantt_model.js, PR #1446).
 *
 * WHY THIS FILE EXISTS. crud_overlay.js already implemented the gantt_model contract INTERNALLY
 * (`var CORE = {...}` + the node early-return `module.exports = CORE; return;`) — but ~230 pure
 * lines (changeLog/recordInfo/fieldLineage/draft-family/sessionActor) physically sat inside the DOM half,
 * reaching node only via function hoisting across that `return`. An edit there could silently
 * capture browser state. Now the physical layout matches the logical seam: this file is the pure
 * half; crud_overlay.js keeps the DOM overlay and re-exports CORE from here, so
 * `require('../crud_overlay.js')` keeps working unchanged for every existing caller.
 *
 * CONTRACT: no DOM. Environment reads are typeof-guarded INPUT seams only (globalThis.__idmpDb,
 * window.AdEvaluator, window.BlueFuture, APP identity, global.TipFold) — exactly the guards the
 * code carried before the split; none were added or removed.
 *
 * NOTHING HERE IS NEW. Every function and every comment moved verbatim from crud_overlay.js.
 *
 * FOOTER NOTE (deliberate deviation from gantt_model.js's globalThis fallback): the IIFE argument
 * stays `typeof window !== 'undefined' ? window : this` — crud_overlay.js's own footer — because
 * the moved code reads `global.TipFold` / `global.APP` off that binding; switching node's binding
 * to globalThis would CHANGE behaviour (e.g. a test-set globalThis.TipFold would suddenly memoize
 * readTip). Preservation beats pattern-matching here.
 */
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
        // §P2 (ERP_IDEMPIERE_UX_PARITY.md §IMPL P2.5, W-PARITY-REFLIST): an AD-folded List carries its own
        // AD_Ref_List option map (f.options); the curated store's __meta[f.ref] is the legacy source.
        var opts = f.options || ((f.ref && store && store.__meta && store.__meta[f.ref]) ? store.__meta[f.ref] : null);
        if (opts && !opts.hasOwnProperty(String(val))) return 'list:not-an-option';
        break;
      case 'yesno':
        // §P2: DisplayType 20 may only ever persist 'Y' or 'N' (iDempiere YesNo column semantics).
        if (String(val) !== 'Y' && String(val) !== 'N') return 'yesno:not-Y/N';
        break;
      case 'fk':
        if (!isFinite(Number(val))) return 'type:fk';
        // §P3 (ERP_IDEMPIERE_UX_PARITY.md §P3-SPEC P3.6 — W-PARITY-VALRULE): the save-side half of the
        // AD_Val_Rule. f.admitted is the id-set the interpreter's own where-clause returned when the picker
        // was built (crud_overlay.populateRefs), so the OFFERED set and the ACCEPTED set are the same set by
        // construction and cannot drift apart. Absent map (no rule on this column, or the arm degraded and
        // said so in the log) → unchanged behaviour, never a blanket reject.
        if (f.admitted && !Object.prototype.hasOwnProperty.call(f.admitted, String(val))) return 'valrule:not-admitted';
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
          // Task 1 — iDempiere setStandardDefaults parity: fill audit+tenant cols from the recorded stdDefaults.
          // §ADORGID-CASING (ERP_BUSINESS_CYCLE_E2E.md §Fix 2026-07-22) — these keys were previously written in
          // MIXED CASE ('AD_Org_ID', 'CreatedBy', etc.) while every OTHER key on `nr` (from `f`, op.fields) is
          // lowercase, matching this codebase's column convention throughout (m_warehouse_id, c_currency_id...).
          // Nothing anywhere reads the mixed-case form as a JS property (grep-confirmed, only SQL text —
          // case-insensitive — ever used it) — readers expecting `r.ad_org_id` (renderOrderPicker among them)
          // silently found nothing on a freshly-created row, surfacing as `AD_Org_ID=NaN` in Generate-Invoices.
          // Now lowercase, matching every other key this same block sits beside.
          if (p.stdDefaults) {
            var sd = p.stdDefaults, tcols = _getTableCols(want), fkeys = {};
            for (var _fk in f) if (Object.prototype.hasOwnProperty.call(f, _fk)) fkeys[String(_fk).toLowerCase()] = 1;
            if (sd.actor != null) {
              if (tcols['createdby']  && !fkeys['createdby'])  nr['createdby']  = sd.actor;
              if (tcols['updatedby']  && !fkeys['updatedby'])  nr['updatedby']  = sd.actor;
            }
            if (opTs != null) {
              // iDempiere convention: Created/Updated are `yyyy-MM-dd HH:mm:ss` strings (match the seed rows)
              if (tcols['created'] && !fkeys['created']) nr['created'] = _fmtKernelTs(opTs);
              if (tcols['updated'] && !fkeys['updated']) nr['updated'] = _fmtKernelTs(opTs);
            }
            if (sd.clientId != null && tcols['ad_client_id'] && !fkeys['ad_client_id']) nr['ad_client_id'] = sd.clientId;
            if (sd.orgId    != null && tcols['ad_org_id']    && !fkeys['ad_org_id'])    nr['ad_org_id']    = sd.orgId;
            if (tcols['isactive']   && !fkeys['isactive'])   nr['isactive']   = 'Y';
            if (tcols['processed']  && !fkeys['processed'])  nr['processed']  = 'N';
            if (tcols['processing'] && !fkeys['processing']) nr['processing'] = 'N';
            if (tcols['posted']     && !fkeys['posted'])     nr['posted']     = 'N';
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
            if (opTs != null && ucols['updated'] && !Object.prototype.hasOwnProperty.call(ch, 'Updated') && !Object.prototype.hasOwnProperty.call(ch, 'updated')) ex['updated'] = _fmtKernelTs(opTs);   // lowercase — same #968 convention as its `updatedby` sibling below; CREATE stamps `updated` lowercase (:431), so the mixed-case form left a created-then-updated row carrying BOTH keys
            if (p.actor != null && ucols['updatedby'] && !Object.prototype.hasOwnProperty.call(ch, 'UpdatedBy') && !Object.prototype.hasOwnProperty.call(ch, 'updatedby')) ex['updatedby'] = p.actor;   // lowercase — the #968 convention (was 'UpdatedBy': a created-then-updated row carried BOTH keys; W-AUDIT-CHANGELOG/W-RECINFO caught it)
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
  // §P2 (W-PARITY-REFLIST): `optsMap` may also be the ORDERED array [{value,name}] an AD_Ref_List fold produces —
  // a plain object would re-order numeric-like values (PriorityRule 3/5/7 → JS integer-key ordering), so the array
  // form is the order-preserving one. Same output shape either way.
  function listOptions(optsMap, cur) {
    var c = cur == null ? '' : String(cur), keys, labelOf;
    if (Array.isArray(optsMap)) {
      var names = {}; keys = [];
      optsMap.forEach(function (o) { if (!o) return; var v = String(o.value); keys.push(v); names[v] = o.name; });
      labelOf = function (k) { return names[k]; };
    } else {
      keys = Object.keys(optsMap || {});
      labelOf = function (k) { return optsMap && optsMap[k]; };
    }
    if (c !== '' && keys.indexOf(c) < 0) keys.unshift(c);
    return keys.map(function (k) {
      var n = labelOf(k);
      return { value: k, label: k + (n ? ' · ' + n : ''), selected: c !== '' && k === c };
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
  //   19 TableDir · 30 Search. id: 13 ID (hidden PK) · 28 Button (dropped by the caller). list: 17 List (AD_Ref_List
  //   options — §P2, LEG-1 retired 2026-09-02, ERP_IDEMPIERE_UX_PARITY.md §IMPL P2.3). yesno: 20 Yes-No (a Y/N
  //   control). else (10 String · 14 Text · …) → string.
  function mapRefDisplayType(rid) {
    switch (Number(rid)) {
      case 11: case 12: case 22: case 29: return 'number';
      case 15: case 16: case 24: return 'date';
      case 18: case 19: case 30: return 'fk';
      case 13: return 'id'; case 28: return 'button';
      case 17: return 'list'; case 20: return 'yesno';
      // string-rendered ids — MUST be enumerated so a known id never falls through to the coarse referenceType
      // fallback: 10 String · 14 Text · 21 Location · 23 Binary · 25 Account · 31 Locator · 32 Image · 33 Assignment
      // · 34 Memo · 35 PAttribute · 38 PrinterName.
      case 10: case 14: case 21: case 23: case 25: case 31: case 32: case 33: case 34: case 35: case 38: return 'string';
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
      case 'list': return 'list'; case 'yesno': return 'yesno';   // §P2 — LEG-1 retired
      default: return 'string';   // string · text · char · unknown
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
      // §P3 (ERP_IDEMPIERE_UX_PARITY.md §P3-SPEC P3.3 — Witness: W-PARITY-VALRULE): carry the lookup's
      // AD_Val_Rule id so the picker can filter to the rows the rule admits (MLookupFactory.java:122-125 —
      // the rule's Code IS the lookup's ValidationCode). The fold stays PURE: no db, no engine call here;
      // crud_overlay.populateRefs runs the interpreter (ad_valrule.js) when it has a real db handle.
      if (f.valRuleId != null && String(f.valRuleId) !== '') spec.valruleid = f.valRuleId;
      // §P2 (W-PARITY-REFLIST): a List column's option set is its AD_Reference_Value_ID's AD_Ref_List rows. The
      // fold stays PURE — the host supplies opts.refList(id) → [{value,name}] (ADParser.resolveReference, active
      // rows, ordered per AD_Reference.IsOrderByValue). optionList keeps that order for rendering; options is the
      // validator's membership map. Absent resolver → the editor still renders a select of the raw value.
      if (type === 'list') {
        if (f.referenceValueId != null) spec.refListId = f.referenceValueId;
        var rl = (typeof opts.refList === 'function' && f.referenceValueId != null) ? opts.refList(f.referenceValueId) : null;
        if (rl && rl.length) {
          spec.optionList = rl.map(function (o) { return { value: String(o.value), name: o.name == null ? '' : String(o.name) }; });
          spec.options = {}; spec.optionList.forEach(function (o) { spec.options[o.value] = o.name; });
        }
      }
      if (f.displayLogic != null && String(f.displayLogic).trim() !== '') spec.displaylogic = f.displayLogic;
      // §P1 (W-PARITY-FIELDSET): the other two AD logic strings, now selected by ad_parser.getFields (P2.1); the
      // evaluator (effectiveFlags) already understood these keys — they simply never arrived.
      if (f.readOnlyLogic != null && String(f.readOnlyLogic).trim() !== '') spec.readonlylogic = f.readOnlyLogic;
      if (f.mandatoryLogic != null && String(f.mandatoryLogic).trim() !== '') spec.mandatorylogic = f.mandatoryLogic;
      if (f.seqNo != null) spec.seq = f.seqNo;
      return spec;
    });
    return { key: opts.key, title: opts.title || opts.key, folded: true, isView: !!opts.isView,
             verbs: roTable ? [] : ['create', 'update', 'delete'], fields: fields };
  }

  // ── §P1 (ERP_IDEMPIERE_UX_PARITY.md §IMPL P1.1 — Witness: W-PARITY-FIELDSET) ─────────────────────────────
  // mergeCuratedWithFold — retire the curated-5 hand list as the FIELD SET without retiring what it alone can
  // express. PURE. The AD fold is the source of WHICH fields exist; the curated entry contributes verbs/docAction/
  // ownerGated/cas (the O2C contract nine merged PRs closed against) and the PIN ORDER of its own columns.
  //   fields = [curated fields, in curated order, each layered with the AD sibling's displaylogic/readonlylogic/
  //             mandatorylogic/seq when the curated carries none]
  //          ++ [every folded field whose col is not curated, in AD SeqNo (fold) order]
  // Curated type/required/readonly/default/validation/ref are NOT overridden: measured 2026-09-02, the AD marks
  // GrandTotal IsReadOnly on tabs 186/263 while docAction.requires needs it typed (totals are not engine-derived
  // yet) — an attribute override would make a Sales Order un-completable (§IMPL F3).
  function mergeCuratedWithFold(curated, folded) {
    if (!curated) return folded || null;
    if (!folded || !folded.fields) return curated;
    var out = {}, k;
    for (k in curated) if (Object.prototype.hasOwnProperty.call(curated, k) && k !== 'fields') out[k] = curated[k];
    var byCol = {};
    (folded.fields || []).forEach(function (f) { byCol[String(f.col).toLowerCase()] = f; });
    var pinned = (curated.fields || []).map(function (cf) {
      var o = {}; for (k in cf) if (Object.prototype.hasOwnProperty.call(cf, k)) o[k] = cf[k];
      var ad = byCol[String(cf.col).toLowerCase()];
      if (ad) {
        // §P3 (ERP_IDEMPIERE_UX_PARITY.md §P3-SPEC P3.3): `valruleid` joins the three AD logic strings as a
        // LAYERED key. It is additive — no curated field has ever carried one — and it does not touch the
        // attributes §IMPL F3 pinned deliberately (type/required/readonly/default/validation/ref). Without
        // this, a lookup that is BOTH curated and val-ruled kept the unfiltered picker: measured 2026-09-02,
        // c_order.C_BPartner_ID (curated, rule 230) offered all 113 partners instead of the 42 iDempiere
        // admits, while the same rule bit correctly on every non-curated column.
        ['displaylogic', 'readonlylogic', 'mandatorylogic', 'valruleid'].forEach(function (lk) {
          if ((o[lk] == null || String(o[lk]).trim() === '') && ad[lk] != null && String(ad[lk]).trim() !== '') o[lk] = ad[lk];
        });
        if (o.seq == null && ad.seq != null) o.seq = ad.seq;
      }
      return o;
    });
    var seen = {}; pinned.forEach(function (p) { seen[String(p.col).toLowerCase()] = 1; });
    var appended = (folded.fields || []).filter(function (f) { return !seen[String(f.col).toLowerCase()]; });
    out.fields = pinned.concat(appended);
    out.merged = true; out.pinned = pinned.length; out.appended = appended.length;
    out.adFields = (folded.fields || []).length; out.curatedFields = (curated.fields || []).length;
    return out;
  }

  // ═══ The formerly-STRANDED pure block (§S60) — these lived BELOW the DOM half’s node return in
  // crud_overlay.js and reached node only by hoisting; moved here verbatim, comments included. ═══
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

  // ── T-0 item 4 (prompts/RESUME_ERP_T0_TRUTH_MAINTENANCE.md) — record-level access gate on the LIVE write
  // path. ad_access.js's gateRecord (canView AccessLevel + org/client scope, W-ACCESS-HARDEN-proven headless)
  // was exposed via idmp_session.js's gateRecordFor but never reached commitCrud — a CRUD write only checked
  // owner+CAS, never whether the ACTING ROLE may touch this record's org/client at all. Same "the page may
  // set it" INPUT seam as sessionActor/sessionClientId/sessionOrgId: idempiere.html's applySession sets
  // window.APP.gateRecordFor (a closure over its db + logged-in role); absent (glassbowl.html and any other
  // no-login host) → PASS, never a hard dependency on idmp_session.js. NEVER invented — only read.
  var _tableAccessLevelCache = {};
  function _getTableAccessLevel(table) {
    var k = String(table || '').toLowerCase();
    if (_tableAccessLevelCache.hasOwnProperty(k)) return _tableAccessLevelCache[k];
    try {
      var mdb = (typeof globalThis !== 'undefined' && globalThis.__idmpDb) || null;
      if (!mdb) return null;
      var r = mdb.exec("SELECT AccessLevel FROM AD_Table WHERE UPPER(TableName)=UPPER('" + k.replace(/'/g, "''") + "') LIMIT 1");
      var lvl = (r.length && r[0].values.length) ? String(r[0].values[0][0]) : null;
      _tableAccessLevelCache[k] = lvl; return lvl;
    } catch (e) { return null; }
  }
  // recordAccessGate(table, record) — record is the fetched row (crud_overlay.js's getRecord shape: keys
  // exposed both original-case and lower-case, per §ADORGID-CASING). Reads ad_org_id/ad_client_id lower-case
  // (this codebase's established convention throughout, ERP_BUSINESS_CYCLE_E2E.md §Fix 2026-07-22).
  function recordAccessGate(table, record) {
    try {
      var fn = (global.APP && global.APP.gateRecordFor) ||
               (typeof globalThis !== 'undefined' && globalThis.APP && globalThis.APP.gateRecordFor);
      if (typeof fn !== 'function') return { allowed: true, reason: 'no-gate-available' };
      var lvl = _getTableAccessLevel(table);
      if (lvl == null) return { allowed: true, reason: 'no-accesslevel-data' };
      var rec = record || {};
      return fn(lvl, { AD_Org_ID: rec.ad_org_id != null ? rec.ad_org_id : rec.AD_Org_ID,
                        AD_Client_ID: rec.ad_client_id != null ? rec.ad_client_id : rec.AD_Client_ID });
    } catch (e) { return { allowed: true, reason: 'gate-error' }; }
  }

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

  var CORE = {
    entriesOf: entriesOf, verbEnabled: verbEnabled, defaultsFor: defaultsFor,
    foldCrudSpec: foldCrudSpec, mapRefType: mapRefType, mapRefDisplayType: mapRefDisplayType,   // S2B: AD-folded CRUD spec (general, not curated)
    mergeCuratedWithFold: mergeCuratedWithFold,                                  // §P1 (W-PARITY-FIELDSET): AD field set + curated pins/verbs
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

  // ── §S60 physical-split seam — internals the DOM half (crud_overlay.js) also calls bare. ───────
  // Additive underscore/named keys on the SAME object; the public CORE surface above is unchanged,
  // so node consumers of require('../crud_overlay.js') see the exact same API (plus these extras).
  CORE._getTableCols = _getTableCols;
  CORE.isMeta = isMeta;
  CORE._readBranch = _readBranch;       // Blue Future read seam (browser no-ops to null headless)
  CORE._commitMeta = _commitMeta;       // Blue Future write seam (browser no-ops to {} headless)
  CORE.sessionActor = sessionActor;     // §0.21 recorded-identity reads — buildOp/_gateCtxFor deps
  CORE.sessionClientId = sessionClientId;
  CORE.sessionOrgId = sessionOrgId;
  CORE.recordAccessGate = recordAccessGate;   // T-0 item 4 — record-level canView + org/client scope

  // dual-mode export (gantt_model.js pattern; footer binding preserved — see header note).
  global.CrudCore = CORE;
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
})(typeof window !== 'undefined' ? window : this);
