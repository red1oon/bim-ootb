// erp_panel.js — Implementing SpatialERP_POC.md §12b File 3 — Witness: W-SERP-P3
// Orchestrator: renders document cards, connects role filtering, dispatches actions.
// Depends on: doc_engine.js, category_loader.js, role_band.js, swipe.js, handlers/construction.js
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  var _db = null;
  var _confidentialFields = [];

  var STATUS_COLOURS = {
    DRAFT:       '#888',
    IN_PROGRESS: '#ff9800',
    COMPLETED:   '#4caf50',
    VOIDED:      '#f44336',
    REVERSED:    '#9c27b0'
  };

  // ── Action map: action string → handler function ──────────────────

  var ACTION_MAP = {
    Screen:     function (db, docId) { return ConstructionHandlers.screenLead(db, docId, _currentUser()); },
    Approve:    function (db, docId) { return ConstructionHandlers.approve(db, docId, _currentUser()); },
    Reject:     function (db, docId) { return ConstructionHandlers.reject(db, docId, 'Rejected by ' + _currentUser()); },
    Submit:     function (db, docId) { return ConstructionHandlers.submitApproval(db, docId, _currentUser()); },
    Close:      function (db, docId) { return ConstructionHandlers.closeLead(db, docId, 0); },
    PlanFAR:    function (db, docId) { return ConstructionHandlers.planFAR(db, docId, {}); },
    GenerateBOQ: function (db, docId) { return ConstructionHandlers.generateBOQ(db, docId, []); }
  };

  function _currentUser() {
    if (typeof RoleBand !== 'undefined') {
      var r = RoleBand.currentRole();
      return r.label || r.role || 'user';
    }
    return 'user';
  }

  // ── Init ───────────────────────────────────────────────────────────

  /**
   * Init ERP panel. Wires everything together.
   * @param {Object} db  sql.js database
   */
  function init(db) {
    console.log('§ERP_PANEL init enter');
    _db = db;

    // 1. Ensure tables exist
    if (typeof DocEngine !== 'undefined') {
      DocEngine.ensureTables(db);
    }

    // 2. Load confidential fields
    var cfR = db.exec("SELECT value FROM project_metadata WHERE key = 'confidential_fields'");
    if (cfR.length && cfR[0].values.length) {
      _confidentialFields = JSON.parse(cfR[0].values[0][0] || '[]');
    }

    // 3. Init role band
    var bandEl = document.getElementById('role-band');
    if (bandEl && typeof RoleBand !== 'undefined') {
      RoleBand.init(db, bandEl);
    }

    // 4. Load and render
    _loadAndRender();

    // 5. Listen for role changes
    document.addEventListener('role-changed', function () {
      console.log('§ERP_PANEL role-changed, reloading cards');
      _loadAndRender();
    });

    console.log('§ERP_PANEL init done');
  }

  function _loadAndRender() {
    var role = (typeof RoleBand !== 'undefined') ? RoleBand.currentRole() : { role: 'LAND', scope: '*', mode: 'full' };
    var docs = _loadDocuments(role);
    var cards = [];
    for (var i = 0; i < docs.length; i++) {
      cards.push({
        id:   docs[i].id,
        html: renderCard(docs[i], role),
        actions: docs[i]._actions
      });
    }

    var swipeEl = document.getElementById('swipe-container');
    if (swipeEl && typeof SwipeStack !== 'undefined') {
      SwipeStack.init(swipeEl, cards, handleAction);
      // Wire UP = drill into sub-cards for current doc
      SwipeStack.onSwipe('UP', function (card) {
        if (!card) return;
        var subCards = _buildSubCards(card.id, role);
        if (subCards.length) SwipeStack.drillIn(subCards);
      });
    }

    // Update status bar
    var statusEl = document.getElementById('status-bar');
    if (statusEl) {
      statusEl.textContent = docs.length + ' document' + (docs.length !== 1 ? 's' : '') +
        ' \u00b7 ' + role.label + ' (' + role.mode + ')';
    }

    console.log('§ERP_PANEL loaded docs=' + docs.length + ' role=' + role.role);
  }

  // ── Load documents with role filtering ─────────────────────────────

  function _loadDocuments(role) {
    var sql = 'SELECT id, doc_type, doc_status, created, completed, description, metadata FROM documents';
    var where = [];

    // approved_only scope: only show COMPLETED docs
    if (role.scope === 'approved_only') {
      where.push("doc_status = 'COMPLETED'");
    }

    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created DESC';

    var r = _db.exec(sql);
    if (!r.length) return [];

    var cols = r[0].columns;
    return r[0].values.map(function (row) {
      var doc = {};
      for (var i = 0; i < cols.length; i++) doc[cols[i]] = row[i];
      doc.metadata = doc.metadata ? JSON.parse(doc.metadata) : {};

      // Determine available actions based on status + role
      doc._actions = _actionsForDoc(doc, role);
      return doc;
    });
  }

  function _actionsForDoc(doc, role) {
    // readonly = no actions
    if (role.mode === 'readonly') return [];

    var actions = [];
    var status = doc.doc_status;
    var sub = doc.metadata.sub_status || '';

    if (status === 'DRAFT') {
      actions.push('Screen');
    }
    if (status === 'IN_PROGRESS') {
      if (!sub || sub === 'SCREENING') actions.push('PlanFAR');
      if (sub === 'FAR') actions.push('Submit');
      if (sub === 'APPROVAL') {
        // Only MGMT can approve
        if (role.mode === 'full') {
          actions.push('Approve');
          actions.push('Reject');
        }
      }
      if (sub === 'BOQ') actions.push('GenerateBOQ');
      if (sub === 'NEGOTIATION') actions.push('Close');
    }

    // Share is always available
    actions.push('Share');

    return actions;
  }

  // ── Render a single card ───────────────────────────────────────────

  /**
   * Render one document card HTML.
   * @param {Object} doc   document row with parsed metadata
   * @param {Object} role  { role, scope, mode, colour, label }
   * @returns {string} HTML
   */
  function renderCard(doc, role) {
    console.log('§ERP_PANEL renderCard doc=' + doc.id + ' role=' + role.role);
    var meta = doc.metadata || {};
    var statusColour = STATUS_COLOURS[doc.doc_status] || '#888';
    var subLabel = meta.sub_status ? ' \u00b7 ' + meta.sub_status : '';

    // Location line
    var location = '';
    if (meta.area) location += meta.area;
    if (meta.plot_no) location += (location ? ', ' : '') + 'Plot ' + meta.plot_no;
    if (meta.road_no) location += ', Road ' + meta.road_no;
    if (meta.block_no) location += ', Block ' + meta.block_no;

    // Land summary
    var landSummary = '';
    if (meta.land_size_katha) landSummary += meta.land_size_katha + ' Katha';
    if (meta.land_type) landSummary += (landSummary ? ' \u00b7 ' : '') + meta.land_type;
    if (meta.facing) landSummary += (landSummary ? ' \u00b7 ' : '') + meta.facing + ' facing';

    // Confidential fields — only show if scope = * (LAND, MGMT)
    // Per §6: ARCH, ENGR, SALE, LEGL do NOT see owner info
    var ownerHtml = '';
    if (role.scope === '*' && meta.owner_name) {
      ownerHtml = '<div style="margin-top:8px;padding:8px;background:#333;border-radius:6px;' +
        'border-left:3px solid #f44336;font-size:12px;color:#f88;">' +
        '<div style="font-size:10px;color:#888;margin-bottom:2px;">CONFIDENTIAL</div>' +
        (meta.owner_name ? '<div>' + _esc(meta.owner_name) + '</div>' : '') +
        (meta.phone ? '<div>' + _esc(meta.phone) + '</div>' : '') +
        (meta.contact_person ? '<div>' + _esc(meta.contact_person) + '</div>' : '') +
        '</div>';
    }

    // Key metrics (from DEV_PLAN if linked)
    var metricsHtml = _renderMetrics(doc);

    // BOQ summary
    var boqHtml = _renderBOQSummary(doc);

    // Action buttons
    var actionsHtml = _renderActions(doc._actions || [], role);

    // Footer
    var footerHtml = '<div style="margin-top:12px;font-size:11px;color:#888;">' +
      (meta.user_contact || '') + ' \u00b7 ' + (doc.created || '').substring(0, 10) +
      '</div>';

    return '<div style="font-size:14px;">' +
      // Header: status dot + doc ID
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<span style="display:flex;align-items:center;gap:6px;">' +
          '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;' +
            'background:' + statusColour + ';"></span>' +
          '<span style="color:' + statusColour + ';font-weight:bold;font-size:13px;">' +
            doc.doc_status + subLabel + '</span>' +
        '</span>' +
        '<span style="color:#888;font-size:12px;">' + _esc(doc.id) + '</span>' +
      '</div>' +
      // Location
      (location ? '<div style="color:#eee;font-size:15px;margin-bottom:4px;">' + _esc(location) + '</div>' : '') +
      (landSummary ? '<div style="color:#ccc;font-size:13px;margin-bottom:8px;">' + _esc(landSummary) + '</div>' : '') +
      // Owner (confidential)
      ownerHtml +
      // Metrics
      metricsHtml +
      // BOQ
      boqHtml +
      // Actions
      actionsHtml +
      // Footer
      footerHtml +
    '</div>';
  }

  function _renderMetrics(doc) {
    // Try to find linked DEV_PLAN
    var devId = 'DEV-' + doc.id.replace('LEAD-', '');
    var r = _db.exec('SELECT metadata FROM documents WHERE id = ?', [devId]);
    if (!r.length || !r[0].values.length) return '';

    var devMeta = JSON.parse(r[0].values[0][0] || '{}');
    var pairs = [];
    if (devMeta.far_value) pairs.push('FAR: ' + devMeta.far_value);
    if (devMeta.num_storeys) pairs.push('Storeys: ' + devMeta.num_storeys);
    if (devMeta.total_units) pairs.push('Units: ' + devMeta.total_units);
    if (devMeta.total_parking) pairs.push('Parking: ' + devMeta.total_parking);

    if (!pairs.length) return '';

    return '<div style="margin-top:10px;padding:8px;background:#333;border-radius:6px;' +
      'display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;color:#ccc;">' +
      pairs.map(function (p) { return '<div>' + _esc(p) + '</div>'; }).join('') +
    '</div>';
  }

  function _renderBOQSummary(doc) {
    var devId = 'DEV-' + doc.id.replace('LEAD-', '');
    var r = _db.exec(
      'SELECT COALESCE(SUM(qty * unit_price), 0), COUNT(*) FROM document_lines WHERE doc_id = ?',
      [devId]
    );
    if (!r.length || !r[0].values.length) return '';
    var total = Number(r[0].values[0][0]);
    var count = Number(r[0].values[0][1]);
    if (count === 0) return '';

    return '<div style="margin-top:8px;color:#4fc3f7;font-size:13px;">' +
      'BOQ: ' + count + ' line' + (count !== 1 ? 's' : '') +
      ' \u00b7 Total: RM ' + total.toLocaleString() +
    '</div>';
  }

  function _renderActions(actions, role) {
    if (!actions.length) return '';
    var html = '<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;">';
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (a === 'Share') {
        html += '<button data-action="Share" style="min-height:44px;padding:8px 16px;' +
          'background:transparent;border:1px solid #555;border-radius:6px;' +
          'color:#ccc;font-size:13px;cursor:pointer;">Share</button>';
      } else {
        var isDestructive = (a === 'Reject');
        var borderCol = isDestructive ? '#f44336' : (role.colour || '#4fc3f7');
        html += '<button data-action="' + _esc(a) + '" style="min-height:44px;padding:8px 16px;' +
          'background:transparent;border:1px solid ' + borderCol + ';border-radius:6px;' +
          'color:' + borderCol + ';font-size:13px;font-weight:bold;cursor:pointer;">' +
          _esc(a) + '</button>';
      }
    }
    html += '</div>';
    return html;
  }

  // ── Handle action dispatch ─────────────────────────────────────────

  /**
   * Dispatch an action for a document.
   * @param {string} docId   document ID
   * @param {string} action  action name
   */
  function handleAction(docId, action) {
    console.log('§ERP_PANEL action doc=' + docId + ' action=' + action);

    if (action === 'Share') {
      // Fire share event
      document.dispatchEvent(new CustomEvent('erp-share', {
        detail: { docId: docId, role: RoleBand.currentRole().role }
      }));
      return;
    }

    var handler = ACTION_MAP[action];
    if (!handler) {
      console.log('§ERP_PANEL unknown action=' + action);
      return;
    }

    var result = handler(_db, docId);
    console.log('§ERP_PANEL action result doc=' + docId + ' action=' + action +
                ' result=' + JSON.stringify(result));

    // Refresh cards after action
    _loadAndRender();
  }

  // ── Sub-cards for drill-in ─────────────────────────────────────────

  function _buildSubCards(docId, role) {
    var tabs = [];

    // FAR tab
    var devId = 'DEV-' + docId.replace('LEAD-', '');
    var devR = _db.exec('SELECT metadata FROM documents WHERE id = ?', [devId]);
    if (devR.length && devR[0].values.length) {
      var devMeta = JSON.parse(devR[0].values[0][0] || '{}');
      var farHtml = '<div style="font-size:14px;">' +
        '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:8px;">FAR &amp; Development</div>';
      var fields = ['far_value', 'total_dev_area', 'total_saleable_area', 'num_storeys',
                    'total_units', 'units_per_floor', 'total_parking', 'total_basement_area'];
      for (var i = 0; i < fields.length; i++) {
        if (devMeta[fields[i]] !== undefined) {
          farHtml += '<div style="display:flex;justify-content:space-between;padding:4px 0;' +
            'border-bottom:1px solid #333;"><span style="color:#888;">' +
            fields[i].replace(/_/g, ' ') + '</span><span style="color:#eee;">' +
            devMeta[fields[i]] + '</span></div>';
        }
      }
      farHtml += '</div>';
      tabs.push({ id: docId + '/far', html: farHtml, actions: [] });
    }

    // BOQ tab
    var boqR = _db.exec(
      'SELECT id, qty, unit_price, metadata FROM document_lines WHERE doc_id = ?', [devId]);
    if (boqR.length && boqR[0].values.length) {
      var boqHtml = '<div style="font-size:14px;">' +
        '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:8px;">BOQ Lines</div>';
      var total = 0;
      for (var j = 0; j < boqR[0].values.length; j++) {
        var line = boqR[0].values[j];
        var lMeta = JSON.parse(line[3] || '{}');
        var lineTotal = (Number(line[1]) || 0) * (Number(line[2]) || 0);
        total += lineTotal;
        boqHtml += '<div style="display:flex;justify-content:space-between;padding:4px 0;' +
          'border-bottom:1px solid #333;font-size:12px;">' +
          '<span style="color:#ccc;">' + (lMeta.type || lMeta.discipline || line[0]) + '</span>' +
          '<span style="color:#eee;">RM ' + lineTotal.toLocaleString() + '</span></div>';
      }
      boqHtml += '<div style="margin-top:8px;font-weight:bold;color:#4caf50;">Total: RM ' +
        total.toLocaleString() + '</div></div>';
      tabs.push({ id: docId + '/boq', html: boqHtml, actions: [] });
    }

    // Phases tab
    var phaseR = _db.exec(
      "SELECT id, name, metadata FROM containers WHERE category = 'PHASE' ORDER BY metadata");
    if (phaseR.length && phaseR[0].values.length) {
      var phaseHtml = '<div style="font-size:14px;">' +
        '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:8px;">Project Phases</div>';
      for (var k = 0; k < phaseR[0].values.length; k++) {
        var ph = phaseR[0].values[k];
        var phMeta = JSON.parse(ph[2] || '{}');
        var pct = phMeta.pct_complete || 0;
        var barCol = pct >= 80 ? '#4caf50' : (pct >= 20 ? '#ff9800' : '#f44336');
        phaseHtml += '<div style="margin-bottom:8px;">' +
          '<div style="display:flex;justify-content:space-between;color:#ccc;font-size:13px;">' +
          '<span>' + _esc(ph[1]) + '</span><span>' + pct + '%</span></div>' +
          '<div style="height:6px;background:#333;border-radius:3px;margin-top:2px;">' +
          '<div style="height:100%;width:' + pct + '%;background:' + barCol + ';border-radius:3px;"></div>' +
          '</div></div>';
      }
      phaseHtml += '</div>';
      tabs.push({ id: docId + '/phases', html: phaseHtml, actions: [] });
    }

    // Journal tab
    var jrnR = _db.exec(
      'SELECT account, debit, credit, timestamp FROM journal WHERE doc_id = ? ORDER BY timestamp',
      [docId]);
    if (jrnR.length && jrnR[0].values.length) {
      var jrnHtml = '<div style="font-size:14px;">' +
        '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:8px;">Journal Entries</div>';
      for (var m = 0; m < jrnR[0].values.length; m++) {
        var je = jrnR[0].values[m];
        var amt = Number(je[1]) > 0 ? 'DR ' + Number(je[1]).toLocaleString()
                                    : 'CR ' + Number(je[2]).toLocaleString();
        jrnHtml += '<div style="display:flex;justify-content:space-between;padding:4px 0;' +
          'border-bottom:1px solid #333;font-size:12px;">' +
          '<span style="color:#ccc;">' + _esc(je[0]) + '</span>' +
          '<span style="color:#eee;">' + amt + '</span></div>';
      }
      jrnHtml += '</div>';
      tabs.push({ id: docId + '/journal', html: jrnHtml, actions: [] });
    }

    // Activity tab (kernel_ops for this doc)
    var opsR = _db.exec(
      "SELECT op_type, parameters, timestamp FROM kernel_ops WHERE parameters LIKE ? ORDER BY timestamp DESC LIMIT 20",
      ['%' + docId + '%']);
    if (opsR.length && opsR[0].values.length) {
      var opsHtml = '<div style="font-size:14px;">' +
        '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:8px;">Activity Log</div>';
      for (var n = 0; n < opsR[0].values.length; n++) {
        var op = opsR[0].values[n];
        var ts = op[2] ? new Date(Number(op[2])).toLocaleString() : '';
        opsHtml += '<div style="padding:4px 0;border-bottom:1px solid #333;font-size:12px;">' +
          '<div style="color:#ff9800;">' + _esc(op[0]) + '</div>' +
          '<div style="color:#888;">' + ts + '</div></div>';
      }
      opsHtml += '</div>';
      tabs.push({ id: docId + '/activity', html: opsHtml, actions: [] });
    }

    console.log('§ERP_PANEL subCards doc=' + docId + ' tabs=' + tabs.length);
    return tabs;
  }

  // ── Utility ────────────────────────────────────────────────────────

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                     .replace(/"/g, '&quot;');
  }

  // ── Public API ─────────────────────────────────────────────────────

  var ERPPanel = {
    init:         init,
    renderCard:   renderCard,
    handleAction: handleAction
  };

  if (typeof window !== 'undefined') window.ERPPanel = ERPPanel;
  if (typeof module !== 'undefined' && module.exports) module.exports = ERPPanel;

  console.log('§ERP_PANEL_LOADED v1');
})();
