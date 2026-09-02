// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* find_erp_push.js — the Find panel's 5D-cost/ERP-PUSH block, extracted verbatim from
 * navigate_find.js (bim-compiler prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md §S59 candidate 2).
 *
 * WHY THIS FILE EXISTS. navigate_find.js is 5,452 lines — one giant init() closure holding a
 * dozen domains. This block (ERP db load/persist, class-twin cost fold, existing-order +
 * construction deep-links, class-cost panel, the › ERP Project-Order push) is a self-contained
 * ERP-side domain locked end-to-end by two live-browser witnesses (poc_find_erp_link_live.js,
 * poc_construction_link_live.js) — the survey's "provably safe to move" bar.
 *
 * WHAT DID NOT MOVE — deliberate scope narrowing vs the survey's first draft:
 * _selectionPriced/_selectionCost/_updateSelCost (the pure-math pricing half) STAY in
 * navigate_find.js: no witness locks them, and per the survey's own rule low witness coverage
 * DISQUALIFIES a candidate. _pushToErp consumes _selectionPriced through the injected deps.
 *
 * CONTRACT (the gantt_model.js dual-mode convention, adapted for a stateful block): everything
 * here was closure-scoped inside navigate_find's init(A,...), so the caller passes each
 * dependency EXPLICITLY to create(deps) — that plumbing is the survey's stated cost of this move:
 *   A                     — the viewer APP handle (activeBuilding, status, _SQL, cachedFetch,
 *                           _hbaTenancySpec, buildingName). A === window.APP in the real viewer
 *                           (navigate.js hands init the same object), so A.cachedFetch IS the
 *                           APP.cachedFetch the pre-extraction code called.
 *   elErpOpen             — #find-erp-open ("open ↗" deep-link, may be null)
 *   elConstructionOpen    — #find-construction-open (may be null)
 *   getLastSelSet()       — reads navigate_find's live _lastSelSet (written by _updateSelCost,
 *                           which stayed behind; a getter because the var is reassigned per tap)
 *   getLastSelLabel()     — reads _lastSelLabel, same ownership
 *   selectionPriced(set)  — navigate_find's _selectionPriced (stays inline, see above)
 *   cur()                 — navigate_find's _cur (currency code; also used by the inline half)
 * The module holds the ONE piece of state the block always owned: the lazily-loaded writable
 * ERP db (_bimErpDb). window.* engine globals (ProjFold, ProjControl, BlueFuture/BlueFold,
 * __sfx, SEQUENCE_RULES, LABOR_RATES, tmJumpTo*) are read at call time exactly as before —
 * browser-only call paths, honest no-ops when absent.
 *
 * NOTHING HERE IS NEW. Every rule and every comment moved verbatim from navigate_find.js
 * (§FIND_COST / §PROJ_PUSH / §S2 / §GOVERNANCE-GATE blocks); the WHY stays attached to the rule
 * it explains, because in this lane the comments ARE the provenance.
 */

(function (global) {
  'use strict';

  function create(D) {
    var A = D.A;
    var elErpOpen = D.elErpOpen || null;
    var elConstructionOpen = D.elConstructionOpen || null;

    // ── §PROJ_PUSH (BIM→Project TASK C, docs/BIMtoProject.md §C): > to ERP — fold the selection into
    // an iDempiere C_Project via the proven engine proj_fold.js (window.ProjFold). The fold is the
    // witnessed part (W-PROJ-PUSH/FOLD/SEQ, tests/poc_proj_push.js); here we wire the UI call path.
    // The writable ERP db is loaded lazily (fetch erp/ad_seed.db → sql.js) and the folded result is
    // persisted to OPFS (bim_project_orders.db) — a viewer-owned project-orders store. NOTE: the
    // cross-page hand-off so the ERP app reads it is the BIMtoERP §B write-path (follow-on).
    var _bimErpDb = null;
    function _ensureErpDb() {
      if (_bimErpDb) return Promise.resolve(_bimErpDb);
      var SQL = A._SQL || (typeof window !== 'undefined' && (window.SQL || window._SQL_CACHED));   // viewer caches the sql.js factory as A._SQL (streaming.js:1343); window.SQL is only set on the ERP page
      if (!SQL || !global.ProjFold) return Promise.resolve(null);
      return A.cachedFetch('../erp/ad_seed.db')
        .then(function (buf) { _bimErpDb = new SQL.Database(new Uint8Array(buf)); return _bimErpDb; })
        .catch(function (e) { console.log('[RP-C] §PROJ_PUSH_DBERR ' + e.message); return null; });
    }
    function _persistErpDb(db) {
      try {
        if (!navigator.storage || !navigator.storage.getDirectory) return Promise.resolve(false);
        var bytes = db.export();
        return navigator.storage.getDirectory()
          .then(function (root) { return root.getDirectoryHandle('bim_analysis', { create: true }); })
          .then(function (dir) { return dir.getFileHandle('bim_project_orders.db', { create: true }); })
          .then(function (fh) { return fh.createWritable(); })
          .then(function (w) { return w.write(bytes).then(function () { return w.close(); }); })
          .then(function () { return true; }).catch(function () { return false; });
      } catch (e) { return Promise.resolve(false); }
    }
    // ── §S2 (TM_4D5D_VARIANCE_LANE) — Zoom-Across cost fold ─────────────────────────────────────────────────
    // When the ERP "Zoom Across" pill lands the viewer on an IFC class, fold that class's STORED twin cost into
    // the #info-panel: the line's PlannedAmt (line grain) + the COMMITTED from its phase (c_projectphase_id →
    // C_ProjectPhase.CommittedAmt — line CommittedAmt is null on disk BY DESIGN, it earns at S5) + the whole
    // project pair (header scope). READ-only off the same ../erp/ad_seed.db the push path loaded. NO recompute.
    function _money(n) { n = Math.round(Number(n) || 0); var a = Math.abs(n), s = n < 0 ? '-' : '';
      if (a >= 1e6) return s + 'RM' + (a / 1e6).toFixed(1) + 'M'; if (a >= 1e3) return s + 'RM' + Math.round(a / 1e3) + 'K'; return s + 'RM' + a; }
    function _foldClassTwin(ifcClass) {
      return _ensureErpDb().then(function (db) {
        if (!db) return null;
        var building = A.activeBuilding;
        function ex(sql, p) { try { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values : null; } catch (e) { return null; } }
        var pr = ex("SELECT C_Project_ID,PlannedAmt,CommittedAmt FROM C_Project WHERE Value=?", [building]);
        if (!pr) return null;   // this building isn't a folded project → no cost fold
        var pid = pr[0][0], proj = { planned: Number(pr[0][1] || 0), committed: Number(pr[0][2] || 0) };
        var line = null, phase = null;
        var ln = ex("SELECT pl.PlannedAmt, pl.c_projectphase_id FROM C_ProjectLine pl JOIN M_Product p ON pl.M_Product_ID=p.M_Product_ID WHERE pl.C_Project_ID=? AND p.Value=?", [pid, ifcClass]);
        if (ln) {
          line = { planned: Number(ln[0][0] || 0), phaseId: ln[0][1] };
          var ph = ex("SELECT Name,PlannedAmt,CommittedAmt,StartDate FROM C_ProjectPhase WHERE C_ProjectPhase_ID=?", [ln[0][1]]);
          if (ph) phase = { name: ph[0][0], planned: Number(ph[0][1] || 0), committed: Number(ph[0][2] || 0), start: ph[0][3] };
        }
        return { building: building, projectId: pid, ifcClass: ifcClass, project: proj, line: line, phase: phase };
      }).catch(function (e) { console.log('§ZOOM-COST err=' + e.message); return null; });
    }
    // BIM→Project (find-erp-deeplink): when the active building ALREADY has a folded C_Project, surface
    // the existing "open ↗" deep-link on selection — so the user opens that Project Order rather than
    // re-creating it. PURELY ADDITIVE: reuses the proven _ensureErpDb + the same record URL _pushToErp
    // builds; only sets the elErpOpen link + tooltips; wrapped so it can NEVER affect cost/push/navigate.
    // (Slice-1 grain = project-level: the link opens the building's C_Project, window 130. Per-line/guid
    //  precision + the OPFS cross-session store are noted follow-ups in FIND_OPENLINK_EXISTING_ORDERLINE.md.)
    function _surfaceExistingOrder(set) {
      if (!elErpOpen || !set || !set.size) return;
      var mySet = set;                                   // race guard — selection may change before resolve
      _ensureErpDb().then(function (db) {
        if (!db || mySet !== D.getLastSelSet()) return;  // db not available, or selection moved on
        var pid = null;
        try {
          var r = db.exec("SELECT C_Project_ID FROM C_Project WHERE Value=?", [A.activeBuilding]);
          pid = (r.length && r[0].values.length) ? r[0].values[0][0] : null;
        } catch (e) { return; }
        if (pid == null) return;                          // building not folded yet → keep create-push as-is
        var url = '../erp/idempiere.html?client=garden&window=130&record=' + encodeURIComponent(pid);
        elErpOpen.setAttribute('href', url);
        elErpOpen.style.display = 'inline-block';
        elErpOpen.title = 'Already in a Project Order — open it (no need to push again)';
        var btn = document.getElementById('find-erp-btn');
        if (btn) btn.title = 'Already a Project Order — use the “open ↗” link, or push to add more';
        console.log('[RP-C] §PROJ_LINK_EXISTING building="' + A.activeBuilding + '" project=' + pid + ' url=' + url);
      }).catch(function () { /* additive — never impact Find */ });
    }
    // §2026-07-04 thread A ("zoom to iDempiere" from Room/storey) — a Building already compiles onto a real
    // M_Warehouse row (HBA's ad_tenancy.js compileBuilding, threaded onto A._hbaTenancySpec.warehouse by
    // hba_lens.js's bindStoreysFromModel) and a SECOND AD_Window "Construction" now exists over that same
    // row (scripts/seed_hba_construction.js) alongside window 139. Room-tap/storey-tap surfaces an "iDempiere
    // ↗" link to it — building-grain (the same warehouse record for every room in this building, honestly;
    // there is no per-room AD_Window, only per-room M_Locator/M_Product, which is a different, deeper link
    // not in scope here). PURELY ADDITIVE: only touches #find-construction-open; HBA absent/inactive →
    // honest no-op (never fabricates a warehouse id), same discipline as _surfaceExistingOrder above.
    //
    // §GOVERNANCE-GATE (design review, 2026-07-04): compileBuilding's `warehouse.m_warehouse_id` is a REAL
    // persisted id only once ERP governance has resolved (`_hbaTenancySpec._governed===true` — a DB hit via
    // erpQuery, ad_tenancy.js); before that it's a throwaway session-local mint (always the literal `1`) that
    // matches nothing in the real dictionary. A link built off the ungoverned id would SOMETIMES 404/point at
    // the wrong record depending on load timing — that's a correctness bug, not a feature gap. Gate on it.
    function _surfaceConstructionLink(guid, label) {
      if (!elConstructionOpen) return;
      elConstructionOpen.style.display = 'none';
      elConstructionOpen.removeAttribute('href');
      try {
        var HL = (typeof HBALens !== 'undefined') ? HBALens : (typeof window !== 'undefined' ? window.HBALens : null);
        var spec = A._hbaTenancySpec;
        var whId = spec && spec.warehouse ? spec.warehouse.m_warehouse_id : null;
        if (!HL || !HL.erpLink || !HL.AD_WINDOWS || whId == null || !spec._governed) {
          console.log('[RP-TA] §CONSTRUCTION_LINK skip guid=' + guid + ' (HBA inactive, no compiled warehouse, or not yet governed — honest no-op)');
          return;
        }
        var url = HL.erpLink(HL.AD_WINDOWS.CONSTRUCTION, whId);
        elConstructionOpen.setAttribute('href', url);
        elConstructionOpen.style.display = 'inline-block';
        elConstructionOpen.title = 'Open ' + (A.buildingName || 'this building') + ' in iDempiere (Construction) — via ' + (label || guid);
        console.log('[RP-TA] §CONSTRUCTION_LINK guid=' + guid + ' warehouse=' + whId + ' url=' + url);
      } catch (e) { console.log('[RP-TA] §CONSTRUCTION_LINK err=' + e.message); }
    }
    function _pct(planned, committed) { return planned > 0 ? Math.round((committed - planned) * 100 / planned) : 0; }
    function _showClassCost(ifcClass, matchCount, guid) {
      var box = document.getElementById('info-cost'); if (!box) return;
      box.style.display = 'none';
      _foldClassTwin(ifcClass).then(function (t) {
        if (!t) { console.log('§ZOOM-COST skip — no twin for class="' + ifcClass + '"'); return; }
        var pj = t.project, pjPct = _pct(pj.planned, pj.committed);
        var html = '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:3px">Cost variance <span style="font-size:9px;color:#888;font-weight:normal">· from records</span></div>';
        if (t.phase) {   // the committed actual lives at phase/control-account grain
          var phPct = _pct(t.phase.planned, t.phase.committed), over = t.phase.committed >= t.phase.planned;
          html += '<div><span class="label">' + ifcClass + '</span>: <span class="value">' + _money(t.line ? t.line.planned : 0) + ' planned</span></div>';
          html += '<div><span class="label">Phase ' + t.phase.name + '</span>: <span class="value">' + _money(t.phase.planned) + ' → ' + _money(t.phase.committed) +
            ' <b style="color:' + (over ? '#ff6b6b' : '#26a69a') + '">(' + (phPct >= 0 ? '+' : '') + phPct + '%)</b></span></div>';
        }
        html += '<div><span class="label">Project ' + t.building + '</span>: <span class="value">' + _money(pj.planned) + ' → ' + _money(pj.committed) +
          ' <b style="color:' + (pj.committed >= pj.planned ? '#ff6b6b' : '#26a69a') + '">(' + (pjPct >= 0 ? '+' : '') + pjPct + '%)</b></span></div>';
        // "View at this moment" — freeze TM on the moment this thing is built. With a guid (a specific picked
        // element) → §360-IDENTITY tmJumpToElement (the EXACT item); else fall back to the class's phase window.
        var canElem = guid && typeof window.tmJumpToElement === 'function';
        var canPhase = t.phase && typeof window.tmJumpToPhase === 'function';
        if (canElem || canPhase) {
          html += '<div style="margin-top:6px"><button id="info-cost-tm" style="background:#1565c0;color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer">⏱ View at this moment</button></div>';
        }
        box.innerHTML = html;
        box.style.display = 'block';
        var ipnl = document.getElementById('info-panel'); if (ipnl) ipnl.style.display = 'block';
        var jb = document.getElementById('info-cost-tm');
        if (jb) jb.addEventListener('click', function (e) {
          e.stopPropagation();
          if (canElem) { console.log('§ZOOM-COST_JUMP_ELEM class="' + ifcClass + '" guid="' + guid + '"'); window.tmJumpToElement(guid); }
          else { console.log('§ZOOM-COST_JUMP class="' + ifcClass + '" phase="' + t.phase.name + '"'); window.tmJumpToPhase(t.phase.name); }
        });
        console.log('§ZOOM-COST class="' + ifcClass + '" matches=' + (matchCount || 0) + ' linePlanned=' + (t.line ? t.line.planned : 'n/a') +
          ' phase="' + (t.phase ? t.phase.name : '-') + '" phasePlanned=' + (t.phase ? t.phase.planned : '-') + ' phaseCommitted=' + (t.phase ? t.phase.committed : '-') +
          ' projPlanned=' + pj.planned + ' projCommitted=' + pj.committed + ' projPct=' + pjPct + '%');
      });
    }

    // BIM→Project: every › ERP push outcome gets audio + a clear status (user: "good practice — a status
    // message, with audio feedback; happy audio when it succeeds"). Reuses the SFX engine (window.__sfx,
    // rows in sfx.json — NOT hardcoded synth, the wh_walk/PRE-PINNED-FACT idiom). Silent if audio is off.
    function _pushSfx(id) {
      var sfx = window.__sfx, ok = !!(sfx && typeof sfx.play === 'function' && id);
      if (ok) { try { sfx.play(id); } catch (e) { ok = false; } }
      console.log('[RP-C] §PROJ_PUSH_AUDIO id=' + id + ' sfx=' + (ok ? 'played' : 'absent'));
    }
    function _pushReject(msg) { if (A.status) A.status.textContent = msg; _pushSfx('erp_reject'); }
    function _pushToErp() {
      var set = D.getLastSelSet();
      if (!set || !set.size) { _pushReject('Select something to push to ERP'); return; }
      if (!window.ProjFold) { _pushReject('ERP push engine not loaded'); console.log('[RP-C] §PROJ_PUSH_DEFER ProjFold absent'); return; }
      var building = A.activeBuilding;
      var priced = D.selectionPriced(set);
      // no priced rows = nothing costable (e.g. a single element, or an old-schema model whose transforms
      // carry no bbox sizes). Say so + a low cue, instead of looking like the push silently did nothing.
      if (!priced || !priced.rows.length) { _pushReject('Nothing costable in selection — pick a type/storey group (this model may lack element sizes)'); console.log('[RP-C] §PROJ_PUSH_DEFER no priced rows (elements=' + (priced ? priced.elements : 0) + ')'); return; }
      if (A.status) A.status.textContent = 'Folding Project Order…';
      _ensureErpDb().then(function (db) {
        if (!db) { _pushReject('ERP db unavailable for push'); console.log('[RP-C] §PROJ_PUSH_DEFER no ERP db'); return; }
        var opts = {
          seqRules: window.SEQUENCE_RULES || {}, laborRates: window.LABOR_RATES || {},
          packCurrencyISO: D.cur(), now: (function () { try { return new Date().toISOString().replace('T', ' ').slice(0, 19); } catch (e) { return '2026-01-01 00:00:00'; } })()
        };
        var r = window.ProjFold.foldProjectOrder(db, building, priced.rows, opts);
        console.log('[RP-C] §PROJ_PUSH project="' + building + '" scope="' + D.getLastSelLabel() + '" phases=+' + r.created.phases +
          ' tasks=+' + r.created.tasks + ' lines=+' + r.created.lines + ' products=+' + r.created.products +
          ' order=' + (r.orderId || '-') + ' plannedAmt=' + r.plannedAmt);
        // §F9 — when BlueFuture is engaged, route the pushed Project Order onto the active blue branch
        // (op-log + projection tag) so it's a speculative UNOFFICIAL draft, invisible to official chrome
        // until accepted on the timeline. No-op in the plain viewer (BlueFuture/BlueFold absent → white push).
        try {
          var _bf = window.BlueFuture, _bfold = window.BlueFold;
          if (_bf && _bfold && _bf.isBlue && _bf.isBlue() && r.created.projects) {
            var _br = _bf.branchId ? _bf.branchId() : (_bf.readBranch && _bf.readBranch());
            var _tags = [{ table: 'C_Project', idCol: 'C_Project_ID', id: r.projectId }];
            if (r.orderId) _tags.push({ table: 'C_Order', idCol: 'C_Order_ID', id: r.orderId });
            _bfold.commitBlue(db, _br, [{ op_type: 'PROJECT_FOLD', output_guid: String(r.projectId), params: { building: building, plannedAmt: String(r.plannedAmt) } }], _tags)
              .then(function (b) { console.log('[RP-C] §PROJ_PUSH_BLUE branch=' + _br + ' ok=' + (b && b.ok) + ' ops=' + JSON.stringify(b && b.opIds) + ' (speculative — invisible to official chrome)'); });
          }
        } catch (e) { console.log('[RP-C] §PROJ_PUSH_BLUE_ERR ' + e.message); }
        // §F4 — the PM control readout (contract sum + EVM) on the freshly folded project.
        var ctrl = null;
        if (window.ProjControl && r.projectId) {
          try {
            ctrl = window.ProjControl.projectControl(db, r.projectId);
            console.log('[RP-C] §PROJ_CONTROL project="' + building + '" original=' + ctrl.contract.original +
              ' approvedVOs=' + ctrl.contract.approvedVOs + ' revised=' + ctrl.contract.revised +
              ' bac=' + ctrl.evm.bac + ' pv=' + ctrl.evm.pv + ' ev=' + ctrl.evm.ev + ' ac=' + ctrl.evm.ac +
              ' cv=' + ctrl.evm.cv + ' sv=' + ctrl.evm.sv + ' cpi=' + ctrl.evm.cpi + ' spi=' + ctrl.evm.spi +
              ' %complete=' + ctrl.evm.percentComplete + (ctrl.note ? ' note="' + ctrl.note + '"' : ''));
          } catch (e) { console.log('[RP-C] §PROJ_CONTROL_ERR ' + e.message); }
        }
        _persistErpDb(db).then(function (ok) {
          console.log('[RP-C] §PROJ_PUSH_PERSIST opfs=' + ok + ' store=bim_project_orders.db');
          var revised = ctrl ? Number(ctrl.contract.revised) : Number(r.plannedAmt);
          if (A.status) A.status.textContent = 'Project Order: ' + r.created.lines + ' lines · contract ' + D.cur() + ' ' +
            revised.toLocaleString(undefined, { maximumFractionDigits: 0 }) + (ok ? ' (saved)' : '');
          // BIM→Project (find-erp-deeplink): surface the created record's deep-link at the ERP spot. The OPFS
          // store above is overlaid onto GardenWorld at iDempiere boot (bim_orders_overlay.js), so this URL
          // lands on the real C_Project (window 130) AFTER the standard GW login (role/access kept by design).
          if (elErpOpen && r && r.projectId != null) {
            var url = '../erp/idempiere.html?client=garden&window=130&record=' + encodeURIComponent(r.projectId);
            elErpOpen.setAttribute('href', url);
            elErpOpen.style.display = 'inline-block';
            _pushSfx('erp_pushed');   // happy chime — Project Order folded + deep-link ready
            console.log('[RP-C] §PROJ_PUSH_LINK project=' + r.projectId + ' order=' + (r.orderId || '-') + ' url=' + url);
          }
        });
      });
    }

    return { ensureErpDb: _ensureErpDb, persistErpDb: _persistErpDb, money: _money,
             foldClassTwin: _foldClassTwin, surfaceExistingOrder: _surfaceExistingOrder,
             surfaceConstructionLink: _surfaceConstructionLink, showClassCost: _showClassCost,
             pushToErp: _pushToErp };
  }

  var API = { create: create };
  global.FindErpPush = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
