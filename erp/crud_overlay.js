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
  // Today the honest set is exactly ONE op: the SET_STATUS status transition we actually have extracted.
  function buildDocActionGroup(op) {
    if (!op || op.op_type !== 'DOC_ACTION') return null;
    var statusOp = { op_type: 'SET_STATUS', op_uuid: op.op_uuid || null, params: kernelParamsFor(op) };

    // §I-K consequence set — DELEGATED (install-side: I-C procedural callouts + I-G §13.6 postings).
    // NON-INVENT: do not synthesize SHIP/INVOICE/Dr-AR/Cr-Rev here. When the install/re-extract provides
    // the extracted ops for this docAction, push them into `groupOps` below; commitGroup already folds them all-or-none.
    var groupOps = [ statusOp ];   // today: the status transition only (honest); extensible to N.
    return groupOps;
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
    docActionOutcome: docActionOutcome, kernelParamsFor: kernelParamsFor, readTip: readTip,
    buildDocActionGroup: buildDocActionGroup, docLabel: docLabel
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

  function bubbleXY(key) {
    if (typeof idx === 'undefined' || idx[key] == null || typeof N === 'undefined') return null;
    var n = N[idx[key]]; if (!n) return null; project(n);
    var r = (typeof radius === 'function' ? radius(n) : 14);
    return { x: px + n.sx * k, y: py + n.sy * k, r: Math.max(13, r * k) };
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
    if (f.type === 'list') return '<select class=cfi data-col="' + f.col + '"' + ro + '></select>';
    if (f.type === 'fk')   return '<select class=cfi data-col="' + f.col + '" data-fk="' + esc(f.ref || '') + '"' + ro + '><option value="' + esc(v) + '">' + esc(v) + '</option></select>';
    var t = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text');
    return '<input class=cfi type="' + t + '" data-col="' + f.col + '" value="' + esc(v) + '"' + ro + (f.readonly ? ' title="derived — read-only"' : '') + '>';
  }
  // list options from __meta; fk options from the ref table via the page bundle (truth-bound).
  function populateRefs(e) {
    (e.fields || []).forEach(function (f) {
      var el = form.querySelector('[data-col="' + f.col + '"]'); if (!el || el.tagName !== 'SELECT') return;
      if (f.type === 'list') {
        var opts = (STORE.__meta && STORE.__meta[f.ref]) || {}; var cur = el.getAttribute('data-cur') || '';
        el.innerHTML = Object.keys(opts).map(function (k) { return '<option value="' + esc(k) + '">' + esc(k + ' · ' + opts[k]) + '</option>'; }).join('');
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
    var op = CORE.buildOp(verb, e, vals, orig, { id: id });
    applyOp(op, e);
    closeForm();
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
  // commitProcess — the REAL signed write loop (W-CHAIN), now via §I-K commitGroup (Phase 3, UI tier):
  // buildDocActionGroup → commitGroup(db, groupOps, {gid}) → verifyChain → persist sidecar → paint
  // #docStatusBar from the COMMITTED `to`. commitGroup folds the ops all-or-none and SEALS ONCE from the
  // tip (the I-D win — not a whole-log reseal). Today the group is just [statusOp]; it is atomic-READY for
  // the future consequence ops (delegated — see buildDocActionGroup). The op-log is the truth; reversible.
  function commitProcess(op) {
    var K = kernel();
    withSidecar(function (db) {
      if (!db || !K || typeof K.commitGroup !== 'function') { console.log('§CRUD process key=' + op.key + ' kernel/sql.js/commitGroup absent → DRY fallback'); dryProcess(op); return; }
      try {
        var groupOps = CORE.buildDocActionGroup(op);   // PURE: today [statusOp]; extensible to N (all-or-none)
        Promise.resolve(K.commitGroup(db, groupOps, {})).then(function (res) {
          if (!res || res.committed !== true) { console.warn('§CRUD process commitGroup not-committed reason=' + (res && res.reason || '?')); dryProcess(op); return; }
          return Promise.resolve(K.verifyChain(db)).then(function (v) {
            _sidePersist();
            var lastId = res.ids[res.ids.length - 1];
            var row = db.exec('SELECT op_uuid FROM kernel_ops WHERE id=' + lastId);
            var uuid = (row.length && row[0].values.length) ? row[0].values[0][0] : null;
            console.log('§CRUD process committed key=' + op.key + ' viaGroup=Y gid=' + res.gid + ' ops=' + res.ids.length + ' sealed=' + res.sealed + ' op_uuid=' + (uuid || 'null') + ' to=' + op.to + ' verifyChain=' + (v && v.ok ? 'ok' : 'FAIL'));
            setDocStatus(op.key, op.to, op.outcome, op.unmet);
            docDot(CORE.docLabel(op, fname(op.key)), op);
            toast('PROCESS ' + fname(op.key) + ' → ' + op.to + (op.outcome === 'in-progress' ? ' (In Progress)' : ' (Completed)') + ' — signed' + (v && v.ok ? '' : ' (verify FAIL!)'));
          });
        }).catch(function (er) { console.warn('§CRUD process commitGroup/verify error', er && er.message); dryProcess(op); });
      } catch (er) { console.warn('§CRUD process commit error', er && er.message); dryProcess(op); }
    });
  }

  // Implementing HISTORY_SESSION_EVENTS.md §A1-DOC — Witness: W-DOC-DOTS. One Z dot per COMMITTED doc
  // change; called ONLY from the commit funnel (applyOp / commitProcess / dryProcess), never from a
  // field/keystroke path — typing between commits stays in the input's native undo.
  // op (optional) carries {op_type, key, from, to} for A-GRAIL fold-back (§A-GRAIL).
  function docDot(label, op) { try { if (typeof global.recordDocMoment === 'function') global.recordDocMoment(label, op || null); } catch (e) {} }

  // A-GRAIL (HISTORY_SESSION_EVENTS.md §A-GRAIL) — Witness: W-FOLD-BACK.
  // foldBackDocOp: called by glassbowl.html scrubTo when moving BACKWARD past a DOC_ACTION dot.
  // Marks the most-recent non-undone kernel op as undone + paints the status bar at fromStatus.
  function foldBackDocOp(key, fromStatus, toStatus) {
    var K = kernel();
    withSidecar(function (db) {
      if (db && K && typeof K.undoOp === 'function') {
        var undone = K.undoOp(db);
        _sidePersist();
        console.log('§FOLD-BACK key=' + key + ' status=' + (toStatus || '?') + '→' + fromStatus + ' undone_id=' + (undone && undone.id || 'null'));
      } else {
        console.log('§FOLD-BACK key=' + key + ' status=→' + fromStatus + ' (dry — sidecar absent)');
      }
      setDocStatus(key, fromStatus, 'completed', []);
    });
  }
  // foldForwardDocOp: called when moving FORWARD through a DOC_ACTION dot (re-applies the op).
  function foldForwardDocOp(key, toStatus) {
    var K = kernel();
    withSidecar(function (db) {
      if (db && K && typeof K.redoOp === 'function') {
        K.redoOp(db);
        _sidePersist();
        console.log('§FOLD-FORWARD key=' + key + ' status=→' + toStatus);
      } else {
        console.log('§FOLD-FORWARD key=' + key + ' status=→' + toStatus + ' (dry — sidecar absent)');
      }
      setDocStatus(key, toStatus, 'completed', []);
    });
  }
  global.crudFoldBack = foldBackDocOp;
  global.crudFoldForward = foldForwardDocOp;

  // ── applyOp — E2 dry path for CRUD verbs; DOC_ACTION now takes the GP3 signed-write seam. ──
  function applyOp(op, e) {
    if (op.op_type === 'CRUD_CREATE') {
      console.log('§CRUD create key=' + op.key + ' (dry) op=CRUD_CREATE fields=' + JSON.stringify(op.fields) + ' ownerGated=' + (op.ownerGated ? 'Y' : 'N') + ' cas=' + (op.cas || '-'));
      docDot(CORE.docLabel(op, fname(op.key)), op);
    } else if (op.op_type === 'CRUD_UPDATE') {
      console.log('§CRUD update key=' + op.key + ' field=' + Object.keys(op.changes).join(',') + ' (dry) op=CRUD_UPDATE changes=' + JSON.stringify(op.changes));
      docDot(CORE.docLabel(op, fname(op.key)), op);
    } else if (op.op_type === 'CRUD_DELETE') {
      console.log('§CRUD delete key=' + op.key + ' tombstone=Y reversible=Y (dry) op=CRUD_DELETE id=' + op.id);
      docDot(CORE.docLabel(op, fname(op.key)), op);
    } else if (op.op_type === 'DOC_ACTION') { commitProcess(op); return; }   // GP3: real signed write (sidecar)
    toast(op.verb.toUpperCase() + ' ' + fname(op.key) + ' — dry-run logged (E3 will sign + apply)');
  }

  // ── page-data helpers (truth-bound Edit pre-fill from the real bundle row) ──
  function recId(key, rec) { var pk = key + '_id'; return rec && rec[pk] != null ? rec[pk] : null; }
  function assignVals(e, rec) { var v = {}; (e.fields || []).forEach(function (f) { v[f.col] = rec && rec[f.col] != null ? rec[f.col] : ''; }); return v; }
  // getRecord — prefer the row in the currently-traced O2C chain (the lit instance), else the first row.
  function getRecord(key, cb) {
    if (typeof withBundle !== 'function') { cb({}); return; }
    var wantId = null;
    try { if (typeof curChain !== 'undefined' && curChain) { for (var i = 0; i < curChain.length; i++) if (curChain[i].table === key && curChain[i].id != null) wantId = curChain[i].id; } } catch (er) {}
    withBundle(function (db) {
      try {
        var pk = key + '_id', sql = wantId != null ? 'SELECT * FROM ' + key + ' WHERE ' + pk + '=' + wantId + ' LIMIT 1' : 'SELECT * FROM ' + key + ' ORDER BY ' + pk + ' LIMIT 1';
        var res = db.exec(sql); if (!res.length || !res[0].values.length) { cb({}); return; }
        var o = {}; res[0].columns.forEach(function (c, i) { o[c] = res[0].values[0][i]; }); cb(o);
      } catch (er) { cb({}); }
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
      '#crudModeWrap{position:fixed;top:10px;right:150px;z-index:70;display:flex;align-items:center;gap:6px;background:#221826;border:1px solid #4a2f44;border-radius:16px;padding:5px 11px;font:13px system-ui;color:#eecfe8;cursor:pointer;user-select:none}' +
      '#crudModeWrap:hover{border-color:#e066c0}#crudModeWrap input{accent-color:#e066c0;cursor:pointer}' +
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
                    readTip: function (table, id) { return SIDE ? CORE.readTip(SIDE, table, id) : null; }, history: history };
  console.log('§CRUD layer mounted (Edit-mode ready)');
})(typeof window !== 'undefined' ? window : this);
