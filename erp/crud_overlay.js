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
  function cleanVals(entry, values) {
    var out = {};
    (entry.fields || []).forEach(function (f) { var c = coerce(f.type, values[f.col]); if (c != null) out[f.col] = c; });
    return out;
  }

  // docActionOutcome — derive the DocAction result DETERMINISTICALLY (E2 dry-run; E3 = real completeIt()).
  // CO iff every docAction.requires col is non-empty in `values`; else IP (unsatisfied condition — a
  // legitimate business non-completion, NOT an error). No Date.now/Math.random — replay-safe, non-invent.
  function docActionOutcome(entry, values) {
    var da = entry.docAction; if (!da) return null;
    var reqs = da.requires || [];
    var unmet = reqs.filter(function (c) { var v = values ? values[c] : undefined; return v == null || String(v).trim() === ''; });
    var ok = unmet.length === 0;
    return { action: da.action || 'CO', from: da.from || 'DR', to: ok ? (da.to || 'CO') : 'IP', outcome: ok ? 'success' : 'in-progress', unmet: unmet };
  }

  // buildOp — the op the kernel WOULD apply (E2 dry / E3 live). One op per CRUD action.
  // delete = a reversible tombstone op, never a destructive erase (CRUD_OVERLAY.md req 4).
  function buildOp(verb, entry, values, originals, ctx) {
    ctx = ctx || {};
    var base = { key: entry.key, table: entry.key, verb: verb, ownerGated: !!entry.ownerGated, op_uuid: ctx.opUuid || null };
    if (verb === 'create') {
      base.op_type = 'CRUD_CREATE'; base.fields = cleanVals(entry, values); base.cas = entry.cas || null;
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
      var r = docActionOutcome(entry, values) || { action: 'CO', from: 'DR', to: 'IP', outcome: 'in-progress', unmet: [] };
      base.op_type = 'DOC_ACTION'; base.id = ctx.id == null ? null : ctx.id;
      base.action = r.action; base.from = ctx.from || r.from; base.to = r.to; base.outcome = r.outcome; base.unmet = r.unmet;
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

  // tipDocs — read-the-tip CREATED documents for a table from the signed op-log: every non-undone
  // CREATE_DOCUMENT op whose params.table matches (case-insensitive — the engine emits 'M_InOut',
  // overlay keys are 'm_inout'). The CREATE-side sibling of readTip (docstatus) / tipValues (fields).
  function tipDocs(db, table) {
    var out = [], want = String(table || '').toLowerCase();
    try {
      var r = db.exec("SELECT id, parameters FROM kernel_ops WHERE op_type='CREATE_DOCUMENT' AND undone=0 ORDER BY id ASC");
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
  function listTip(db, table, pkCol, baseRows) {
    var rows = (baseRows || []).map(function (r) { var o = {}; for (var p in r) o[p] = r[p]; return o; });   // shallow copy — never mutate the baseline
    var byId = {}; rows.forEach(function (r) { byId[String(r[pkCol])] = r; });
    var created = [], hidden = [], want = String(table || '').toLowerCase();
    if (!db) return { rows: rows, created: created, hidden: hidden };
    try {
      var r = db.exec("SELECT id, op_type, parameters, timestamp FROM kernel_ops WHERE op_type IN ('CRUD_CREATE','CRUD_UPDATE','CRUD_DELETE') AND undone=0 ORDER BY id ASC");
      if (!r.length || !r[0].values.length) return { rows: rows, created: created, hidden: hidden };
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
              if (tcols['created'] && !fkeys['created']) nr['Created'] = opTs;
              if (tcols['updated'] && !fkeys['updated']) nr['Updated'] = opTs;
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
            var ch = p.changes || {}; for (var cc in ch) if (ch.hasOwnProperty(cc)) ex[cc] = (ch[cc] && ch[cc].hasOwnProperty('new')) ? ch[cc].new : ch[cc];
            // Task 1 — stamp Updated/UpdatedBy for CRUD_UPDATE (iDempiere PO.save parity)
            var ucols = _getTableCols(want);
            if (opTs != null && ucols['updated'] && !Object.prototype.hasOwnProperty.call(ch, 'Updated') && !Object.prototype.hasOwnProperty.call(ch, 'updated')) ex['Updated'] = opTs;
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
    return { rows: rows, created: created, hidden: hidden };
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
  function readTip(db, table, id) {
    try {
      var r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='SET_STATUS' AND undone=0 ORDER BY id DESC");
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
  function tipValues(db, table, id) {
    var out = {};
    try {
      var r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='CRUD_UPDATE' AND undone=0 ORDER BY id ASC");
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

  var CORE = {
    entriesOf: entriesOf, verbEnabled: verbEnabled, defaultsFor: defaultsFor,
    validateField: validateField, validate: validate, effectiveFlags: effectiveFlags, cleanVals: cleanVals, buildOp: buildOp,
    docActionOutcome: docActionOutcome, kernelParamsFor: kernelParamsFor, readTip: readTip, tipValues: tipValues,
    normDateValue: normDateValue, buildDocActionGroup: buildDocActionGroup, docLabel: docLabel,
    listOptions: listOptions, splitStatusChange: splitStatusChange,
    docPolicyFor: docPolicyFor, tipDocs: tipDocs,                              // T1: fan-out policy + created-doc tip
    foldBackGroup: foldBackGroup, foldForwardGroup: foldForwardGroup,          // T1 Part B: group-aware Z fold
    listTip: listTip, gateOp: gateOp,                                           // T2: list read-the-tip · T4: owner-gate/CAS pre-check
    changeLog: changeLog                                                         // Task 2: per-record AD-filtered change trail
  };

  // node (headless witness): export the core and stop — no DOM to attach.
  if (typeof module !== 'undefined' && module.exports) { module.exports = CORE; return; }
  if (typeof document === 'undefined') return;

  // ════════════════════════════════════════════════════════════════════════
  // DOM OVERLAY — Edit-mode toggle + animated semicircle ring + form (browser).
  // ════════════════════════════════════════════════════════════════════════
  injectCss();
  var STORE = null, on = false, raf = 0, hots = [], ring = null, ringKey = null, form = null;
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
  form = document.createElement('div'); form.id = 'crudForm'; document.body.appendChild(form);
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

  function today() { try { return new Date().toISOString().slice(0, 10); } catch (e) { return ''; } }
  function entryFor(key) { return STORE && !isMeta(key) && STORE[key] ? (function () { var e = STORE[key]; e.key = key; return e; })() : null; }

  // ── enable/disable ────────────────────────────────────────────────────────
  function enable() {
    on = true;
    function go() {
      buildHots();
      if (!raf) raf = requestAnimationFrame(loop);
      console.log('§CRUD mode=on rings=' + hots.length);
    }
    if (STORE) { go(); return; }
    fetch('crud_ops.json').then(function (r) { return r.json(); }).then(function (j) { STORE = j; go(); })
      .catch(function (e) { console.warn('§CRUD load-error', e && e.message); });
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
        var from = (db ? CORE.readTip(db, e.key, id) : null) || (e.docAction && e.docAction.from) || 'DR';
        applyOp(CORE.buildOp('process', e, vals, rec, { id: id, from: from }), e);
      });
    });
  }

  // ── the form (bubble kind -> document form of its fields[]) ─────────────────
  function openForm(verb, e) {
    var isEdit = verb === 'update';
    getRecord(e.key, function (rec) {
      var orig = isEdit ? (rec || {}) : null;
      var vals = isEdit ? assignVals(e, rec) : CORE.defaultsFor(e, today());
      renderForm(verb, e, vals, orig, isEdit ? recId(e.key, rec) : null);
    });
  }
  function renderForm(verb, e, vals, orig, id) {
    var title = (verb === 'create' ? '＋ New ' : '✎ Edit ') + fname(e.key);
    var h = '<span class=cfx title=close>✕</span><div class=cfh>' + title + '</div><div class=cfbody>';
    (e.fields || []).forEach(function (f) {
      h += '<label class=cfrow data-row="' + f.col + '"><span class=cfl>' + esc(f.label || f.col) + ' <i class=req data-req="' + f.col + '" style="display:none">*</i></span>' + fieldInput(f, vals[f.col]) + '<span class="cfe" data-col="' + f.col + '"></span></label>';
    });
    h += '</div><div class=cfnav><span class=cfnote>dry-run — logs the op it would apply (E3 wires the signed kernel)</span><span class=cfgrow></span>' +
         '<button class=cfb id=cfCancel>Cancel</button><button class="cfb cfsave" id=cfSave>' + (verb === 'create' ? 'Create' : 'Save') + '</button></div>';
    form.innerHTML = h; form.className = 'open';
    populateRefs(e);
    applyAdLogic(e);                                            // §AD-LOGIC-LIVE — initial show/hide/enable/require off the AD
    var body = form.querySelector('.cfbody');                   // …and re-apply on every edit so the form REACTS like iDempiere
    if (body) { body.addEventListener('input', function () { applyAdLogic(e); }); body.addEventListener('change', function () { applyAdLogic(e); }); }
    form.querySelector('.cfx').addEventListener('click', closeForm);
    form.querySelector('#cfCancel').addEventListener('click', closeForm);
    form.querySelector('#cfSave').addEventListener('click', function () { saveForm(verb, e, orig, id); });
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
      var row = form.querySelector('.cfrow[data-row="' + f.col + '"]'); if (!row) return;
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
      var el = form.querySelector('[data-col="' + f.col + '"]'); if (!el || el.tagName !== 'SELECT') return;
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
    (e.fields || []).forEach(function (f) { var el = form.querySelector('[data-col="' + f.col + '"]'); vals[f.col] = el ? el.value : ''; });
    return vals;
  }
  function saveForm(verb, e, orig, id) {
    var vals = gatherVals(e);
    Array.prototype.forEach.call(form.querySelectorAll('.cfe'), function (s) { s.textContent = ''; });
    var res = CORE.validate(STORE, e, vals, orig);
    if (!res.ok) {
      res.errors.forEach(function (er) { var s = form.querySelector('.cfe[data-col="' + er.col + '"]'); if (s) s.textContent = er.why; });
      console.log('§CRUD validate key=' + e.key + ' verb=' + verb + ' REJECT errors=' + JSON.stringify(res.errors));
      return;
    }
    console.log('§CRUD validate key=' + e.key + ' verb=' + verb + ' ok');
    // §AD-MODELVAL-LIVE (UI_UNPARK_RESUME.md B-3) — fire the PROVEN beforeSave hook engine (ad_modelval.js,
    // W-*-SAVE: faithful M*.beforeSave ports) AFTER the field-level checks: a hook REJECT blocks the save
    // with the hook's error string; hook-DERIVED values fill the form/op (the info.derived seam).
    fireBeforeSaveHooks(e, vals, orig, function (mv) {
      if (mv && !mv.ok) {
        var s0 = form.querySelector('.cfe'); if (s0) s0.textContent = mv.blocked + ': ' + mv.error;
        toast('Save rejected — ' + mv.error);
        console.log('§AD-MODELVAL-LIVE table=' + e.key + ' verb=' + verb + ' hook=' + mv.blocked + ' verdict=REJECT error="' + mv.error + '"');
        return;
      }
      if (mv && mv.derived && Object.keys(mv.derived).length) {
        Object.keys(mv.derived).forEach(function (c) {
          var inEl = form.querySelector('[data-col="' + c + '"]');
          if (inEl) inEl.value = mv.derived[c] == null ? '' : mv.derived[c];
          if (Object.prototype.hasOwnProperty.call(vals, c) || (e.fields || []).some(function (f) { return f.col === c; })) vals[c] = mv.derived[c];
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
          toast('No changes — nothing to save'); closeForm(); return;
        }
        if (sp.statusOp) {
          console.log('§CRUD-STATUS-SPLIT key=' + e.key + ' docstatus ' + (sp.statusOp.from || '?') + '→' + (sp.statusOp.to || '?') + ' lane=DOC_ACTION fieldCols=' + (sp.fieldOp ? Object.keys(sp.fieldOp.changes).join(',') : '(none)'));
          applyOp(sp.statusOp, e);
        }
        if (sp.fieldOp) applyOp(sp.fieldOp, e);
        closeForm(); return;
      }
      applyOp(op, e);
      closeForm();
    });
  }
  // ── §AD-MODELVAL-LIVE plumbing — lazy per-table installer over the page bundle (sql.js → b3 shim) ──
  var MV_INSTALLER = { c_order: 'installMOrderSaveHooks', m_inout: 'installMInOutSaveHooks',
    c_invoice: 'installMInvoiceSaveHooks', c_payment: 'installMPaymentSaveHooks' };
  var _mvInstalled = {};
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
  function fireBeforeSaveHooks(e, vals, orig, cb) {
    var MV = global.AdModelVal;
    if (!MV || !MV_INSTALLER[e.key] || typeof withBundle !== 'function') { cb(null); return; }
    withBundle(function (db) {
      var out = null;
      try {
        var b = _mvB3(db);
        if (!_mvInstalled[e.key]) { _mvInstalled[e.key] = true; var n = MV[MV_INSTALLER[e.key]](b); console.log('§AD-MODELVAL-LIVE installed ' + MV_INSTALLER[e.key] + ' hooks=' + n); }
        var rec = {}, k;
        if (orig) for (k in orig) rec[k.toLowerCase()] = orig[k];
        for (k in vals) rec[k.toLowerCase()] = vals[k];
        var info = { table: e.key, record: rec, recordOld: orig || null };
        var v = MV.fireHooks('BEFORE_SAVE', info, {});
        out = { ok: v.ok, fired: v.fired, blocked: v.blocked, error: v.error, derived: info.derived || null };
      } catch (er) { console.log('§AD-MODELVAL-LIVE error ' + (er && er.message) + ' → hooks skipped'); out = null; }
      cb(out);
    });
  }
  function openDeleteConfirm(e) {
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
    });
  }
  function closeForm() { form.className = ''; form.innerHTML = ''; }

  // ════════════════════════════════════════════════════════════════════════
  // GP3 SIGNED-WRITE SEAM — the deployed Process ▶ becomes a REAL signed write (W-CRUD-WRITELOOP-OVERLAY).
  // DECIDED (GUIDE_SHOWME_PROCESS GP3): sidecar log + read-the-tip. Ops commit to a SEPARATE in-memory
  // kernel_ops DB persisted under its OWN IndexedDB key; glassbowl_data.db stays the IMMUTABLE baseline.
  // The signed kernel is the production W-CHAIN one (kernel_ops.js → window.KernelOps), loaded as a peer
  // <script>. If it (or sql.js) is absent we fall back to the E2 dry-run — never a silent failure.
  // ════════════════════════════════════════════════════════════════════════
  var SIDE = null, SIDE_PENDING = false, SIDE_CBS = [];
  var SIDE_DBNAME = 'glassbowl_kernel_ops', SIDE_STORE = 'log', SIDE_KEY = 'kernel_ops.db';
  function kernel() { return (typeof global.KernelOps !== 'undefined') ? global.KernelOps : null; }
  function _flushSideCbs(arg) { var cbs = SIDE_CBS; SIDE_CBS = []; SIDE_PENDING = false; cbs.forEach(function (f) { try { f(arg); } catch (e) {} }); }

  // _sideIdb — open the DEDICATED sidecar object store (NEVER glassbowl_data.db's cache key).
  function _sideIdb(cb) {
    try {
      var req = global.indexedDB.open(SIDE_DBNAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(SIDE_STORE); };
      req.onsuccess = function () { cb(req.result); };
      req.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function _sidePersist() {
    if (!SIDE) return;
    try {
      var buf = SIDE.export().buffer;   // the sidecar is TINY (the log only) — whole-export is cheap + 1GB-safe
      _sideIdb(function (db) {
        if (!db) return;
        try {
          db.transaction(SIDE_STORE, 'readwrite').objectStore(SIDE_STORE).put(buf, SIDE_KEY);
          console.log('§CRUD sidecar persisted size=' + (buf.byteLength / 1024).toFixed(1) + 'KB key=' + SIDE_KEY);
        } catch (e) {}
      });
    } catch (e) {}
  }
  // withSidecar — lazily build/hydrate the sidecar log DB (a separate sql.js Database), ensure the kernel
  // table, then run cb(SIDE). cb(null) if sql.js/kernel unavailable (caller falls back to dry-run).
  function withSidecar(cb) {
    if (SIDE) { cb(SIDE); return; }
    SIDE_CBS.push(cb);
    if (SIDE_PENDING) return;
    var K = kernel();
    if (typeof global.initSqlJs !== 'function' || !K) { _flushSideCbs(null); return; }
    SIDE_PENDING = true;
    global.initSqlJs({ locateFile: function (f) { return 'sqljs/' + f; } }).then(function (SQL) {
      _sideIdb(function (db) {
        function build(buf) {
          try { SIDE = buf ? new SQL.Database(new Uint8Array(buf)) : new SQL.Database(); }
          catch (e) { SIDE = new SQL.Database(); }
          K.ensureTable(SIDE);
          _flushSideCbs(SIDE);
        }
        if (!db) { build(null); return; }
        try {
          var g = db.transaction(SIDE_STORE, 'readonly').objectStore(SIDE_STORE).get(SIDE_KEY);
          g.onsuccess = function () { build(g.result || null); };
          g.onerror = function () { build(null); };
        } catch (e) { build(null); }
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
        var order = {}; or[0].columns.forEach(function (c, i) { order[c] = or[0].values[0][i]; });
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
      // T4 (GAP 4): a DocAction (Complete/Close/Void) is an ownerGated mutation of an owned document —
      // gate owner+CAS BEFORE the seal; a non-owner / stale-CAS process is REJECTED (toast, no dot, no
      // fan-out), never silently sealed. Non-gated doctypes pass through unchanged.
      _gateForOwnedWrite(op.ownerGated ? op : { ownerGated: false }, db, function (gate) {
        if (!gate.ok) { _gateReject(op, gate); return; }
      completeFanout(op, function (fanout) {
      try {
        var groupOps = CORE.buildDocActionGroup(op, fanout);   // PURE assembly: engine consequences + SET_STATUS last
        Promise.resolve(K.commitGroup(db, groupOps, {})).then(function (res) {
          if (!res || res.committed !== true) { console.warn('§CRUD process commitGroup not-committed reason=' + (res && res.reason || '?')); dryProcess(op); return; }
          return Promise.resolve(K.verifyChain(db)).then(function (v) {
            _sidePersist();
            var lastId = res.ids[res.ids.length - 1];
            var row = db.exec('SELECT op_uuid FROM kernel_ops WHERE id=' + lastId);
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
          });
        }).catch(function (er) { console.warn('§CRUD process commitGroup/verify error', er && er.message); dryProcess(op); });
      } catch (er) { console.warn('§CRUD process commit error', er && er.message); dryProcess(op); }
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
        _sidePersist();
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
        _sidePersist();
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

  // ── Task 4 — allocDocNo: assign DocumentNo from AD_Sequence on CRUD_CREATE for document tables.
  // Approach (a-simplified): number embedded in the op fields (replay-stable); sequence CurrentNext
  // bumped directly in the main db (state not in op-log — acceptable for demo; name the trade-off).
  // Returns the formatted DocumentNo, or null when no matching active sequence (named, not faked).
  function _allocDocNo(table, fields) {
    var mdb = (typeof globalThis !== 'undefined' && globalThis.__idmpDb) || null;
    if (!mdb) return null;
    var cols = _getTableCols(table);
    if (!cols['documentno']) return null;
    if (fields && (fields['DocumentNo'] != null || fields['documentno'] != null)) return null; // user provided
    try {
      var seqName = 'DocumentNo_' + table;
      var r = mdb.exec("SELECT AD_Sequence_ID, CurrentNext, IncrementNo, Prefix, Suffix FROM AD_Sequence WHERE UPPER(Name)=UPPER(?) AND IsActive='Y' LIMIT 1", [seqName]);
      if (!r.length || !r[0].values.length) { console.log('§DOCNO no-sequence table=' + table + ' (named, not faked)'); return null; }
      var v = r[0].values[0], seqId = v[0], next = v[1], incr = v[2] || 1, prefix = v[3] || '', suffix = v[4] || '';
      var docNo = (prefix || '') + next + (suffix || '');
      mdb.run('UPDATE AD_Sequence SET CurrentNext=' + (next + incr) + ' WHERE AD_Sequence_ID=' + seqId);
      console.log('§DOCNO table=' + table + ' seq=' + seqName + ' next=' + next + ' docno=' + docNo + ' replay-stable=Y');
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
      try { var tv = db ? CORE.tipValues(db, op.table, op.id) : null; if (tv && Object.prototype.hasOwnProperty.call(tv, casCol)) casCurrent = tv[casCol]; } catch (e) {}
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
      // T4 (GAP 4): an ownerGated mutation of an EXISTING owned row (UPDATE/DELETE) is gated owner+CAS
      // BEFORE the seal — a non-owner / stale-CAS write is REJECTED (toast, NO dot), never silently sealed.
      // CREATE has no prior owner to gate (the creator becomes the owner) → passes through.
      var gatedVerb = op.ownerGated && (op.op_type === 'CRUD_UPDATE' || op.op_type === 'CRUD_DELETE');
      _gateForOwnedWrite(gatedVerb ? op : { ownerGated: false }, db, function (gate) {
        if (!gate.ok) { _gateReject(op, gate); return; }   // REJECT — no dry fallback, no dot
        _commitCrudSealed(op, K, db);
      });
    });
  }
  function _commitCrudSealed(op, K, db) {
    {
      try {
        var params = { table: op.table, id: op.id == null ? null : op.id };
        if (op.op_type === 'CRUD_UPDATE')      { params.changes = op.changes; if (op.actor != null) params.actor = op.actor; }
        else if (op.op_type === 'CRUD_CREATE') { params.fields = op.fields; params.cas = op.cas || null; if (op.stdDefaults) params.stdDefaults = op.stdDefaults; }
        else if (op.op_type === 'CRUD_DELETE') { params.tombstone = true; params.reversible = true; }
        var groupOps = [{ op_type: op.op_type, op_uuid: op.op_uuid || null, params: params }];
        Promise.resolve(K.commitGroup(db, groupOps, {})).then(function (res) {
          if (!res || res.committed !== true) { console.warn('§CRUD ' + op.op_type + ' commitGroup not-committed reason=' + (res && res.reason || '?')); dryCrud(op); return; }
          return Promise.resolve(K.verifyChain(db)).then(function (v) {
            _sidePersist();
            var cols = op.changes ? Object.keys(op.changes).join(',') : (op.fields ? Object.keys(op.fields).join(',') : '-');
            console.log('§CRUD-PERSIST key=' + op.key + ' id=' + (op.id == null ? 'null' : op.id) + ' op=' + op.op_type + ' cols=' + cols + ' source=sidecar gid=' + res.gid + ' ops=' + res.ids.length + ' sealed=' + res.sealed + ' verifyChain=' + (v && v.ok ? 'ok' : 'FAIL'));
            docDot(CORE.docLabel(op, fname(op.key)), op);
            toast(op.verb.toUpperCase() + ' ' + fname(op.key) + ' — saved (signed)' + (v && v.ok ? '' : ' (verify FAIL!)'));
          });
        }).catch(function (er) { console.warn('§CRUD ' + op.op_type + ' commit error', er && er.message); dryCrud(op); });
      } catch (er) { console.warn('§CRUD ' + op.op_type + ' commit error', er && er.message); dryCrud(op); }
    }
  }

  // ── applyOp — the commit funnel. DOC_ACTION + CRUD verbs all take the GP3 signed-write seam (sidecar). ──
  function applyOp(op, e) {
    if (op.op_type === 'DOC_ACTION') { commitProcess(op); return; }                                    // GP3: signed status write
    if (op.op_type === 'CRUD_CREATE' || op.op_type === 'CRUD_UPDATE' || op.op_type === 'CRUD_DELETE') { commitCrud(op); return; }  // GP3: signed field write
    toast(op.verb.toUpperCase() + ' ' + fname(op.key) + ' — unknown op');
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
  function getRecord(key, cb) {
    if (typeof withBundle !== 'function') { cb({}); return; }
    var wantId = null;
    try { if (typeof curChain !== 'undefined' && curChain) { for (var i = 0; i < curChain.length; i++) if (String(curChain[i].table).toLowerCase() === String(key).toLowerCase() && curChain[i].id != null) wantId = curChain[i].id; } } catch (er) {}
    withBundle(function (db) {
      try {
        var pk = key + '_id', sql = wantId != null ? 'SELECT * FROM ' + key + ' WHERE ' + pk + '=' + wantId + ' LIMIT 1' : 'SELECT * FROM ' + key + ' ORDER BY ' + pk + ' LIMIT 1';
        var res = db.exec(sql); if (!res.length || !res[0].values.length) { cb({}); return; }
        // expose each column under BOTH its original name and its lower-cased alias — the form (f.col is
        // lower-case) + recId resolve regardless of the surface's column casing (glassbowl lower vs iDempiere
        // SELECT * original-case). T3 host-mount (SO_FULL_CRUD_GAP.md GAP 3).
        var o = {}; res[0].columns.forEach(function (c, i) { var val = res[0].values[0][i]; o[c] = val; var lc = String(c).toLowerCase(); if (lc !== c && o[lc] === undefined) o[lc] = val; }); _overlayTip(key, o, cb);
      } catch (er) { cb({}); }
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
          var tip = CORE.tipValues(db, key, id), cols = Object.keys(tip);
          if (cols.length) { cols.forEach(function (c) { o[c] = tip[c]; });
            console.log('§CRUD-TIP key=' + key + ' id=' + id + ' overlaid=' + cols.join(',') + ' source=sidecar'); }
          // W-CRUD-DOCSTATUS: docstatus truth = the SET_STATUS tip (the FSM lane), not a column write —
          // the edit form must render the CURRENT status selected, same source doProcess derives `from` off.
          var st = CORE.readTip(db, key, id);
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
  global.__crud = { enable: enable, disable: disable, openRing: openRing, core: CORE, store: function () { return STORE; },
                    applyOp: applyOp,   // §A1-DOC: the commit funnel, exposed for in-browser smoke
                    foldBack: foldBackDocOp, foldForward: foldForwardDocOp,  // §A-GRAIL: fold via scrub
                    setStatus: setDocStatus, statusBar: function () { return statusBar; }, pulseProc: pulseProc,
                    kernelDb: function () { return SIDE; }, withSidecar: withSidecar,
                    readTip: function (table, id) { return SIDE ? CORE.readTip(SIDE, table, id) : null; }, history: history,
                    changeLog: function (table, id) { return SIDE ? CORE.changeLog(SIDE, table, id) : null; },
                    editModeOn: function () { return on; },
                    toggleEditMode: function () { ck.checked = !ck.checked; ck.dispatchEvent(new Event('change')); } };
  console.log('§CRUD layer mounted (Edit-mode ready)');
})(typeof window !== 'undefined' ? window : this);
