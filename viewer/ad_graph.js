// ad_graph.js — Data Globe for ERP OOTB
// Nodes on a rotating sphere. Active = front. Drag to orbit. Tap to drill.
// Lines connect related entities. Canvas 2D with perspective math.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  var _canvas, _ctx, _db;
  var _nodes = [];
  var _edges = [];        // [{from, to}] index pairs
  var _animId = null;
  var _W = 0, _H = 0;
  var _onDrill = null;
  var _onLongPress = null;
  var _currentView = 'home';
  var _viewStack = [];

  // Globe rotation (Euler angles, radians)
  var _rotX = -0.3;       // tilt
  var _rotY = 0;          // spin
  var _autoSpin = 0;       // no auto-spin — user is in control
  var _radius = 0;        // sphere radius in pixels
  var _cx = 0, _cy = 0;   // centre of globe on canvas

  // Drag state
  var _dragging = false;
  var _dragStartX = 0, _dragStartY = 0;
  var _dragStartRotX = 0, _dragStartRotY = 0;
  var _pointerDownTime = 0;
  var _lastClient = 'gardenworld';
  var _momentumY = 0;      // spin momentum after drag release
  var _momentumX = 0;
  var _lastDragX = 0, _lastDragY = 0;
  var _lastTapTime = 0;    // double-tap detection
  var _lastTapNode = null;
  var _focusedNode = null;  // search correlation highlight
  var _focusPulseT = 0;     // 0..1 pulse decay over 2s
  var _maxBubbles = 500;    // §3.4 memory limit
  var _lastEntityTable = null; // remember which TABLE we dived into (for back animation)
  var _onLongPressEmpty = null; // callback for long-press on empty space (mobile search)

  // Fly-to-front animation
  var _flyTarget = null;   // node being pulled to front
  var _flyRotYStart = 0, _flyRotXStart = 0;
  var _flyRotYEnd = 0, _flyRotXEnd = 0;
  var _flyT = 0;           // 0..1 progress
  var _flyCallback = null; // called when fly completes

  // ── Icons ──────────────────────────────────────────────────────────

  var ICONS = {
    person: function (ctx, x, y, s) {
      ctx.beginPath(); ctx.arc(x, y - s * 0.28, s * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y + s * 0.15, s * 0.32, Math.PI, 0); ctx.fill();
    },
    product: function (ctx, x, y, s) {
      var h = s * 0.32;
      ctx.fillRect(x - h, y - h, h * 2, h * 2);
      ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - h, y - h * 0.1); ctx.lineTo(x + h, y - h * 0.1); ctx.stroke();
      ctx.restore();
    },
    location: function (ctx, x, y, s) {
      ctx.beginPath(); ctx.arc(x, y - s * 0.12, s * 0.22, Math.PI, 0);
      ctx.lineTo(x, y + s * 0.35); ctx.closePath(); ctx.fill();
    },
    price: function (ctx, x, y, s) {
      ctx.beginPath(); ctx.arc(x, y, s * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.fillStyle = '#121218';
      ctx.font = 'bold ' + Math.round(s * 0.35) + 'px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', x, y + 1); ctx.restore();
    },
    category: function (ctx, x, y, s) {
      var h = s * 0.28;
      ctx.beginPath(); ctx.moveTo(x - h, y); ctx.lineTo(x - h * 0.3, y - h);
      ctx.lineTo(x + h, y - h); ctx.lineTo(x + h, y + h);
      ctx.lineTo(x - h * 0.3, y + h); ctx.closePath(); ctx.fill();
    },
    contact: function (ctx, x, y, s) {
      ctx.fillRect(x - s * 0.25, y - s * 0.1, s * 0.5, s * 0.35);
      ctx.beginPath(); ctx.arc(x, y - s * 0.22, s * 0.1, 0, Math.PI * 2); ctx.fill();
    },
    table: function (ctx, x, y, s) {
      var h = s * 0.25;
      ctx.fillRect(x - h, y - h, h * 2, h * 0.6);
      ctx.fillRect(x - h, y - h * 0.2, h * 2, h * 0.6);
      ctx.fillRect(x - h, y + h * 0.55, h * 2, h * 0.5);
    }
  };

  // ── Entity configs ─────────────────────────────────────────────────

  var ENTITY_CFG = {
    'C_BPartner':          { icon: 'person',   colour: '#6c9fff', label: 'Partners' },
    'M_Product':           { icon: 'product',  colour: '#54d9a8', label: 'Products' },
    'M_Product_Category':  { icon: 'category', colour: '#a78bfa', label: 'Categories' },
    'M_ProductPrice':      { icon: 'price',    colour: '#ffd93d', label: 'Prices' },
    'AD_User':             { icon: 'contact',  colour: '#38d9d9', label: 'Contacts' },
    'C_BPartner_Location': { icon: 'location', colour: '#ff85a2', label: 'Locations' },
    'C_Order':             { icon: 'table',    colour: '#ff9f43', label: 'Orders' },
    'C_Invoice':           { icon: 'table',    colour: '#ff7043', label: 'Invoices' },
    'C_Payment':           { icon: 'price',    colour: '#ffd93d', label: 'Payments' },
    'M_InOut':             { icon: 'product',  colour: '#7bed9f', label: 'Shipments' },
    'C_Project':           { icon: 'table',    colour: '#a78bfa', label: 'Projects' },
    'C_ElementValue':      { icon: 'table',    colour: '#38d9d9', label: 'Accounts' },
    'M_Warehouse':         { icon: 'location', colour: '#ff85a2', label: 'Warehouses' },
    'C_DocType':           { icon: 'table',    colour: '#888',    label: 'Doc Types' },
    'C_Country':           { icon: 'location', colour: '#6c9fff', label: 'Countries' }
  };
  var SYS_CFG = {
    'AD_Window':    { icon: 'table', colour: '#6c9fff', label: 'Windows' },
    'AD_Table':     { icon: 'table', colour: '#a78bfa', label: 'Tables' },
    'AD_Column':    { icon: 'table', colour: '#54d9a8', label: 'Columns' },
    'AD_Tab':       { icon: 'table', colour: '#ff9f43', label: 'Tabs' },
    'AD_Field':     { icon: 'table', colour: '#38d9d9', label: 'Fields' },
    'AD_Menu':      { icon: 'table', colour: '#ffd93d', label: 'Menus' },
    'AD_Reference': { icon: 'table', colour: '#ff85a2', label: 'References' },
    'AD_Element':   { icon: 'table', colour: '#888',    label: 'Elements' }
  };
  var WIN_MAP = {
    'C_BPartner': 123, 'M_Product': 140, 'C_Order': 143, 'C_Invoice': 167,
    'C_Payment': 195, 'M_InOut': 169, 'C_Project': 130, 'C_ElementValue': 158,
    'M_Product_Category': 401, 'M_Warehouse': 139,
    'AD_Window': 102, 'AD_Table': 100, 'AD_Menu': 105
  };

  // ── Sphere math ────────────────────────────────────────────────────

  /**
   * Place nodes on a sphere surface at (theta, phi) angles.
   * Active nodes get phi closer to 0 (front of globe).
   * Project 3D → 2D with perspective.
   */
  function _project(node) {
    // Rotate by globe orientation
    var cosX = Math.cos(_rotX), sinX = Math.sin(_rotX);
    var cosY = Math.cos(_rotY), sinY = Math.sin(_rotY);

    // Sphere coordinates → 3D
    var x3 = node.sx;
    var y3 = node.sy;
    var z3 = node.sz;

    // Rotate Y (spin)
    var rx = x3 * cosY - z3 * sinY;
    var rz = x3 * sinY + z3 * cosY;
    x3 = rx; z3 = rz;

    // Rotate X (tilt)
    var ry = y3 * cosX - z3 * sinX;
    rz = y3 * sinX + z3 * cosX;
    y3 = ry; z3 = rz;

    // Perspective projection — moderate focal for 3D depth without overshoot
    var perspective = 450;
    var scale = perspective / (perspective + z3);

    node.screenX = _cx + x3 * scale;
    node.screenY = _cy + y3 * scale;
    node.screenScale = scale;
    node.screenZ = z3;  // for sorting (painter's algo) and alpha
  }

  // ── Build home globe ──────────────────────────────────────────────

  function _buildHomeNodes(client) {
    _nodes = [];
    _edges = [];
    _activeExpandedNode = null;  // §1 — clear dim on any view rebuild
    var config = (client === 'system') ? SYS_CFG : ENTITY_CFG;
    var keys = Object.keys(config);

    // Count rows per entity
    var counts = [];
    for (var i = 0; i < keys.length; i++) {
      var tbl = keys[i];
      var cnt = 0;
      try {
        var r = _db.exec('SELECT COUNT(*) FROM [' + tbl + ']');
        cnt = (r.length && r[0].values.length) ? Number(r[0].values[0][0]) : 0;
      } catch (e) {}
      if (cnt > 0) counts.push({ table: tbl, count: cnt, cfg: config[tbl] });
    }

    // Normalise: largest count → front of globe, smallest → back
    counts.sort(function (a, b) { return b.count - a.count; });
    var maxCnt = counts.length ? counts[0].count : 1;

    for (var j = 0; j < counts.length; j++) {
      var c = counts[j];
      var ratio = c.count / maxCnt; // 0..1

      // Fibonacci sphere distribution — spread evenly
      var golden = (1 + Math.sqrt(5)) / 2;
      var theta = 2 * Math.PI * j / golden;
      // phi: active (high ratio) → front (phi near 0), inactive → back (phi near PI)
      var phi = Math.acos(1 - 2 * (j + 0.5) / counts.length);
      // Bias active nodes forward
      phi = phi * (1 - ratio * 0.4);

      var tSx = _radius * Math.sin(phi) * Math.cos(theta);
      var tSy = _radius * Math.cos(phi) * 0.85;
      var tSz = _radius * Math.sin(phi) * Math.sin(theta);
      _nodes.push({
        id: c.table,
        label: c.cfg.label,
        count: c.count,
        icon: c.cfg.icon,
        colour: c.cfg.colour,
        homeSx: tSx, homeSy: tSy, homeSz: tSz,
        sx: 0, sy: 0, sz: 0,               // start at centre
        _startSx: 0, _startSy: 0, _startSz: 0,
        _targetSx: tSx, _targetSy: tSy, _targetSz: tSz,
        _animT: 0,                          // grow-from-centre
        size: 18 + ratio * 36,
        activity: ratio,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.003 + ratio * 0.004,
        screenX: 0, screenY: 0, screenScale: 1, screenZ: 0,
        tableName: c.table,
        windowId: WIN_MAP[c.table] || null,
        type: 'TABLE',
        children: [],
        parent: null,
        expanded: false
      });
    }

    // Edges: connect all entities (small globe = full mesh looks good)
    for (var a = 0; a < _nodes.length; a++) {
      for (var b = a + 1; b < _nodes.length; b++) {
        _edges.push({ from: a, to: b });
      }
    }

    console.log('§BUILD_HOME nodes=' + _nodes.length + ' edges=' + _edges.length +
                ' client=' + client +
                ' tables=[' + _nodes.map(function(n){return n.tableName+'('+n.count+')';}).join(', ') + ']');
  }

  // ── Build entity records globe ────────────────────────────────────

  /**
   * Classify record by: explicit status > date freshness > field completeness.
   * Returns { activity: 0..1, colour, tier }.
   *
   * Colour spectrum:
   *   #4fc3f7 cyan   — complete / approved / closed
   *   #7bed9f green  — active, recently updated, well-filled
   *   #ffd93d amber  — partial, older
   *   #ff7043 red    — sparse / draft / stale
   *   #555    grey   — inactive / archived
   */
  function _classifyRecord(rec, allDates) {
    var isActive = rec.IsActive;
    if (isActive === 'N') return { activity: 0.05, colour: '#555', tier: 'archived' };

    // 1) Explicit status field
    var status = rec.DocStatus || rec.Status || '';
    var s = String(status).toUpperCase();
    if (s === 'CO' || s === 'CL' || s === 'AP')
      return { activity: 0.95, colour: '#4fc3f7', tier: 'complete' };
    if (s === 'VO' || s === 'RE')
      return { activity: 0.1, colour: '#666', tier: 'void' };
    if (s === 'DR')
      return { activity: 0.4, colour: '#ff7043', tier: 'draft' };
    if (s === 'IP' || s === 'WP')
      return { activity: 0.7, colour: '#ffd93d', tier: 'inprogress' };

    // 2) Date freshness — Updated or Created
    var dateStr = rec.Updated || rec.Created || '';
    var freshness = 0.5; // default middle
    if (dateStr && allDates && allDates.max > allDates.min) {
      var ts = new Date(dateStr).getTime();
      if (!isNaN(ts)) {
        freshness = (ts - allDates.min) / (allDates.max - allDates.min); // 0=oldest 1=newest
      }
    }

    // 3) Field completeness
    var filled = 0, total = 0;
    for (var k in rec) {
      if (k.indexOf('_ID') >= 0 && k !== 'AD_Client_ID') continue; // skip FK noise
      total++;
      if (rec[k] !== null && rec[k] !== undefined && rec[k] !== '') filled++;
    }
    var completeness = total > 0 ? filled / total : 0.5;

    // Blend: 40% freshness + 60% completeness
    var activity = freshness * 0.4 + completeness * 0.6;

    // Continuous colour from activity
    var colour;
    if (activity > 0.75) colour = '#4fc3f7';       // cyan — hot
    else if (activity > 0.55) colour = '#7bed9f';   // green — warm
    else if (activity > 0.35) colour = '#ffd93d';   // amber — lukewarm
    else colour = '#ff7043';                         // red — cool/sparse

    return { activity: activity, colour: colour, tier: activity > 0.6 ? 'active' : 'idle' };
  }

  /** Scan all records for min/max dates (for freshness normalisation) */
  function _scanDates(records) {
    var min = Infinity, max = -Infinity;
    for (var i = 0; i < records.length; i++) {
      var d = records[i].Updated || records[i].Created || '';
      if (!d) continue;
      var ts = new Date(d).getTime();
      if (isNaN(ts)) continue;
      if (ts < min) min = ts;
      if (ts > max) max = ts;
    }
    return { min: min, max: max };
  }

  function _buildEntityNodes(tableName) {
    _nodes = [];
    _edges = [];
    _activeExpandedNode = null;  // §1 — clear dim on view rebuild
    var cfg = ENTITY_CFG[tableName] || SYS_CFG[tableName] || { icon: 'table', colour: '#888', label: tableName };

    var records;
    try {
      // §BUG2 — no arbitrary LIMIT; cap at _maxBubbles for memory safety
      var r = _db.exec('SELECT * FROM [' + tableName + '] LIMIT ' + _maxBubbles);
      if (!r.length) return;
      var cols = r[0].columns;
      records = r[0].values.map(function (row) {
        var obj = {};
        for (var i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
        return obj;
      });
    } catch (e) { return; }

    var nameCol = _findNameCol(records[0]);
    var keyCol = tableName + '_ID';
    var golden = (1 + Math.sqrt(5)) / 2;
    var n = records.length;

    // First pass: classify all records with date range context
    var allDates = _scanDates(records);
    var classified = [];
    for (var i = 0; i < n; i++) {
      classified.push(_classifyRecord(records[i], allDates));
    }

    // Sort by activity desc — active records get low indices = front hemisphere
    var indices = [];
    for (var si = 0; si < n; si++) indices.push(si);
    indices.sort(function (a, b) { return classified[b].activity - classified[a].activity; });

    for (var j = 0; j < n; j++) {
      var origIdx = indices[j];
      var rec = records[origIdx];
      var cls = classified[origIdx];
      var name = rec[nameCol] || rec[keyCol] || ('Record ' + (origIdx + 1));

      // Fibonacci sphere — j=0 is front (phi small), j=n-1 is back (phi large)
      var theta = 2 * Math.PI * j / golden;
      var phi = Math.acos(1 - 2 * (j + 0.5) / n);

      // Active nodes get larger radius spread (less crowding in front)
      var rFactor = (j < n * 0.3) ? 1.0 : 0.95;  // front 30% slightly further out

      var eSx = _radius * rFactor * Math.sin(phi) * Math.cos(theta);
      var eSy = _radius * rFactor * Math.cos(phi) * 0.85;
      var eSz = _radius * rFactor * Math.sin(phi) * Math.sin(theta);
      _nodes.push({
        id: keyCol + ':' + rec[keyCol],
        label: String(name).substring(0, 16),
        count: null,
        icon: cfg.icon,
        colour: cls.colour,
        homeSx: eSx, homeSy: eSy, homeSz: eSz,
        sx: 0, sy: 0, sz: 0,               // start at centre
        _startSx: 0, _startSy: 0, _startSz: 0,
        _targetSx: eSx, _targetSy: eSy, _targetSz: eSz,
        _animT: 0,                          // grow-from-centre
        size: 10 + cls.activity * 20,     // active=30, archived=12
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.001 + cls.activity * 0.004,
        screenX: 0, screenY: 0, screenScale: 1, screenZ: 0,
        tableName: tableName,
        windowId: WIN_MAP[tableName] || null,
        record: rec,
        activity: cls.activity,
        tier: cls.tier,
        type: 'RECORD',
        children: [],
        parent: null,
        expanded: false,
        recordId: rec[keyCol]
      });
    }

    // Edges: connect similar-tier neighbours (not full mesh — too dense)
    for (var e = 0; e < _nodes.length; e++) {
      var next = (e + 1) % _nodes.length;
      _edges.push({ from: e, to: next });
    }

    // Orient globe so the most active node faces camera on initial load
    if (_nodes.length > 0) {
      var top = _nodes[0]; // index 0 = most active (sorted)
      _rotY = -Math.atan2(top.sx, -top.sz);
      _rotX = -Math.asin(Math.max(-1, Math.min(1, top.sy / _radius)));
      _rotX = Math.max(-1.2, Math.min(1.2, _rotX));
    }

    console.log('§BUILD_ENTITY table=' + tableName + ' records=' + _nodes.length +
                ' ids=[' + _nodes.slice(0,5).map(function(n){return n.recordId;}).join(',') +
                (_nodes.length > 5 ? '...' : '') + ']' +
                ' types=' + _nodes.map(function(n){return n.type;}).filter(function(v,i,a){return a.indexOf(v)===i;}).join('/'));
  }

  function _findNameCol(rec) {
    // §BUG4 — prefer human-readable Name over internal Value (SearchKey)
    // Case-insensitive: SQLite may return lowercase column names
    var keys = Object.keys(rec);
    var keyMap = {};  // lowercase → actual key
    for (var ki = 0; ki < keys.length; ki++) keyMap[keys[ki].toLowerCase()] = keys[ki];

    var nameKey = keyMap['name'];
    if (nameKey && rec[nameKey] !== null && rec[nameKey] !== undefined && rec[nameKey] !== '') return nameKey;
    var docKey = keyMap['documentno'];
    if (docKey && rec[docKey] !== null && rec[docKey] !== undefined) return docKey;
    var descKey = keyMap['description'];
    if (descKey && rec[descKey] !== null && rec[descKey] !== undefined && rec[descKey] !== '') return descKey;
    var valKey = keyMap['value'];
    if (valKey && rec[valKey] !== null && rec[valKey] !== undefined) return valKey;

    // Fallback: find a meaningful string column (skip booleans, dates, short values)
    for (var fi = 0; fi < keys.length; fi++) {
      var k = keys[fi];
      var kl = k.toLowerCase();
      if (kl.indexOf('_id') >= 0) continue;
      if (kl.indexOf('is') === 0) continue;  // isactive, ismandatory = booleans
      if (kl === 'created' || kl === 'updated' || kl.indexOf('date') >= 0) continue;
      if (kl === 'createdby' || kl === 'updatedby') continue;
      var v = rec[k];
      if (typeof v === 'string' && v.length > 1) return k;  // skip single-char "Y"/"N"
    }
    return null;
  }

  // ── Orbit positioning ─────────────────────────────────────────────

  function _orbitPosition(parent, index, total, orbitRadius) {
    var len = Math.sqrt(parent.sx * parent.sx + parent.sy * parent.sy + parent.sz * parent.sz);
    if (len < 1) len = 1;
    var nx = parent.sx / len, ny = parent.sy / len, nz = parent.sz / len;

    // Tangent vectors via cross product with up
    var upX = 0, upY = 1, upZ = 0;
    if (Math.abs(ny) > 0.9) { upX = 1; upY = 0; }
    var t1x = upY * nz - upZ * ny, t1y = upZ * nx - upX * nz, t1z = upX * ny - upY * nx;
    var t1len = Math.sqrt(t1x * t1x + t1y * t1y + t1z * t1z);
    if (t1len < 0.001) t1len = 1;
    t1x /= t1len; t1y /= t1len; t1z /= t1len;
    var t2x = ny * t1z - nz * t1y, t2y = nz * t1x - nx * t1z, t2z = nx * t1y - ny * t1x;

    var angle;
    if (total <= 12) {
      angle = 2 * Math.PI * index / Math.max(total, 1);
    } else {
      // §3.1 Spiral for >12
      angle = 2 * Math.PI * index / ((1 + Math.sqrt(5)) / 2);
      var t = index / total;
      orbitRadius = orbitRadius * (0.6 + t * 0.4);
    }
    return {
      x: parent.sx + orbitRadius * (Math.cos(angle) * t1x + Math.sin(angle) * t2x),
      y: parent.sy + orbitRadius * (Math.cos(angle) * t1y + Math.sin(angle) * t2y),
      z: parent.sz + orbitRadius * (Math.cos(angle) * t1z + Math.sin(angle) * t2z)
    };
  }

  // ── §3.1 TABLE → RECORD expansion ────────────────────────────────

  function _expandTable(node) {
    if (node.type !== 'TABLE' || node.expanded) return;
    if (_nodes.length >= _maxBubbles) return;

    var tableName = node.tableName;
    var records;
    try {
      var r = _db.exec("SELECT * FROM [" + tableName + "] WHERE IsActive = 'Y' LIMIT 30");
      if (!r.length) return;
      var cols = r[0].columns;
      records = r[0].values.map(function (row) {
        var obj = {};
        for (var i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
        return obj;
      });
    } catch (e) { return; }

    var nameCol = _findNameCol(records[0]);
    var keyCol = tableName + '_ID';
    var cfg = ENTITY_CFG[tableName] || SYS_CFG[tableName] || { icon: 'table', colour: '#888', label: tableName };
    var orbitR = _radius * 0.2;
    var allDates = _scanDates(records);

    // §3.1 TABLE shrinks slightly
    node._origSize = node.size;
    node.size *= 0.8;

    for (var j = 0; j < records.length; j++) {
      if (_nodes.length >= _maxBubbles) break;
      var rec = records[j];
      var cls = _classifyRecord(rec, allDates);
      var name = rec[nameCol] || rec[keyCol] || ('Record ' + (j + 1));
      var pos = _orbitPosition(node, j, records.length, orbitR);

      var child = {
        id: tableName + '_' + rec[keyCol],
        label: String(name).substring(0, 16),
        count: null,
        icon: cfg.icon,
        colour: cls.colour,
        homeSx: pos.x, homeSy: pos.y, homeSz: pos.z,
        sx: pos.x, sy: pos.y, sz: pos.z,
        _startSx: node.sx, _startSy: node.sy, _startSz: node.sz,
        _targetSx: pos.x, _targetSy: pos.y, _targetSz: pos.z,
        _animT: 0,
        size: 8 + cls.activity * 10,
        activity: cls.activity,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.002 + cls.activity * 0.003,
        screenX: 0, screenY: 0, screenScale: 1, screenZ: 0,
        tableName: tableName,
        windowId: WIN_MAP[tableName] || null,
        record: rec,
        recordId: rec[keyCol],
        docStatus: rec.DocStatus || '',
        tier: cls.tier,
        type: 'RECORD',
        children: [],
        parent: node,
        expanded: false
      };
      node.children.push(child);
      _nodes.push(child);
    }

    node.expanded = true;
    _activeExpandedNode = node;  // §2b dim siblings
    _rebuildEdges();
    console.log('§AD_GRAPH expandTable table=' + tableName + ' records=' +
                records.length + ' total=' + _nodes.length);
  }

  // ── §9 Gateway bubbles: Properties + Data ─────────────────────────
  // First tap on a RECORD spawns 2 meaningful gateway bubbles.
  // Properties = non-null fields (what's interesting about this record)
  // Data = FK relationships (standard sub-constellation)

  function _spawnGateways(node) {
    var orbitR = _radius * 0.18;
    var rec = node.record;

    // Count non-null properties for visual weight
    var nonNull = 0, total = 0;
    for (var k in rec) {
      if (k.indexOf('_ID') >= 0 || k === 'IsActive' || k === 'AD_Client_ID' || k === 'AD_Org_ID') continue;
      total++;
      if (rec[k] !== null && rec[k] !== undefined && rec[k] !== '') nonNull++;
    }
    var hasProperties = nonNull > 0;

    // Count FK children for Data bubble
    var fkRefs = _discoverChildren(node.tableName);
    var hasData = fkRefs.length > 0;

    // Position: Properties left, Data right of parent
    var pos1 = _orbitPosition(node, 0, 2, orbitR);
    var pos2 = _orbitPosition(node, 1, 2, orbitR);

    // Properties gateway — red outer / yellow blend when content exists, grey if empty
    var propColour = hasProperties ? '#ff6b35' : '#555';
    var propGateway = {
      id: node.id + '_PROP',
      label: 'Properties',
      count: nonNull,
      icon: 'category',
      colour: propColour,
      homeSx: pos1.x, homeSy: pos1.y, homeSz: pos1.z,
      sx: pos1.x, sy: pos1.y, sz: pos1.z,
      _startSx: node.sx, _startSy: node.sy, _startSz: node.sz,
      _targetSx: pos1.x, _targetSy: pos1.y, _targetSz: pos1.z,
      _animT: 0,
      size: hasProperties ? 16 : 10,
      activity: hasProperties ? 0.9 : 0.2,
      pulse: Math.random() * Math.PI * 2, pulseSpeed: 0.003,
      screenX: 0, screenY: 0, screenScale: 1, screenZ: 0,
      tableName: node.tableName, windowId: node.windowId,
      record: rec, recordId: node.recordId,
      tier: 'gateway', type: 'CHILD',
      children: [], parent: node, expanded: false,
      _isGateway: 'properties', _parentNode: node
    };

    // Data gateway — blue when FK children exist, grey if empty
    var dataColour = hasData ? '#4fc3f7' : '#555';
    var dataGateway = {
      id: node.id + '_DATA',
      label: 'Data (' + fkRefs.length + ')',
      count: fkRefs.length,
      icon: 'table',
      colour: dataColour,
      homeSx: pos2.x, homeSy: pos2.y, homeSz: pos2.z,
      sx: pos2.x, sy: pos2.y, sz: pos2.z,
      _startSx: node.sx, _startSy: node.sy, _startSz: node.sz,
      _targetSx: pos2.x, _targetSy: pos2.y, _targetSz: pos2.z,
      _animT: 0,
      size: hasData ? 16 : 10,
      activity: hasData ? 0.8 : 0.2,
      pulse: Math.random() * Math.PI * 2, pulseSpeed: 0.003,
      screenX: 0, screenY: 0, screenScale: 1, screenZ: 0,
      tableName: node.tableName, windowId: node.windowId,
      record: rec, recordId: node.recordId,
      tier: 'gateway', type: 'CHILD',
      children: [], parent: node, expanded: false,
      _isGateway: 'data', _parentNode: node,
      _gatewaysSpawned: true  // allow Data to expand FK children directly
    };

    node.children.push(propGateway);
    node.children.push(dataGateway);
    _nodes.push(propGateway);
    _nodes.push(dataGateway);
    node.expanded = true;
    node._gatewaysSpawned = true;
    _activeExpandedNode = node;
    _rebuildEdges();
    console.log('§GATEWAY spawned for ' + node.tableName + '_ID=' + node.recordId +
                ' properties=' + nonNull + '/' + total + ' fkTables=' + fkRefs.length);
  }

  // ── §9.1 Properties gateway → property-name bubbles ────────────────
  // Each non-null field becomes a bubble. Tapping one opens the panel
  // filtered by that column (IS NOT NULL, ORDER BY column).
  // This is a visual query builder — user picks the filter criterion.

  function _expandProperties(propGateway) {
    if (propGateway.expanded) return;
    var rec = propGateway.record;
    var orbitR = _radius * 0.15;

    // Collect non-null properties (skip system fields)
    var props = [];
    for (var k in rec) {
      if (k.indexOf('_ID') >= 0) continue;
      if (k === 'AD_Client_ID' || k === 'AD_Org_ID') continue;
      if (rec[k] === null || rec[k] === undefined || rec[k] === '') continue;
      props.push({ col: k, val: rec[k] });
    }

    // Colour coding by value type
    for (var pi = 0; pi < props.length; pi++) {
      var p = props[pi];
      var pos = _orbitPosition(propGateway, pi, props.length, orbitR);
      // Boolean props (IsActive, IsMandatory) = teal, dates = amber, strings = green
      var pColour = '#7bed9f';  // default green
      if (p.col.indexOf('Is') === 0) pColour = '#38d9d9';       // boolean → teal
      else if (p.col.indexOf('Date') >= 0 || p.col === 'Created' || p.col === 'Updated') pColour = '#ffd93d'; // date → amber

      var pLabel = p.col.replace(/([A-Z])/g, ' $1').trim();  // CamelCase → spaced
      if (pLabel.length > 14) pLabel = pLabel.substring(0, 12) + '..';

      var child = {
        id: propGateway.id + '_' + p.col,
        label: pLabel,
        count: null,
        icon: 'category',
        colour: pColour,
        homeSx: pos.x, homeSy: pos.y, homeSz: pos.z,
        sx: pos.x, sy: pos.y, sz: pos.z,
        _startSx: propGateway.sx, _startSy: propGateway.sy, _startSz: propGateway.sz,
        _targetSx: pos.x, _targetSy: pos.y, _targetSz: pos.z,
        _animT: 0,
        size: 12,
        activity: 0.7,
        pulse: Math.random() * Math.PI * 2, pulseSpeed: 0.003,
        screenX: 0, screenY: 0, screenScale: 1, screenZ: 0,
        tableName: propGateway.tableName, windowId: propGateway.windowId,
        record: rec, recordId: propGateway.recordId,
        tier: 'property', type: 'CHILD',
        children: [], parent: propGateway, expanded: false,
        _noExpand: true,
        _isPropertyBubble: true,
        _propertyColumn: p.col,
        _propertyValue: p.val
      };
      propGateway.children.push(child);
      _nodes.push(child);
    }

    propGateway.expanded = true;
    _activeExpandedNode = propGateway;
    _rebuildEdges();
    console.log('§PROP_EXPAND gateway=' + propGateway.id + ' props=' + props.length +
                ' columns=[' + props.slice(0, 8).map(function(p){return p.col;}).join(',') +
                (props.length > 8 ? '...' : '') + ']');
  }

  // ── §3.2 RECORD → CHILD expansion (FK traversal) ─────────────────

  function _expandRecord(node) {
    if ((node.type !== 'RECORD' && node.type !== 'CHILD') || node.expanded || !node.record) return;
    if (_nodes.length >= _maxBubbles) return;

    var tableName = node.tableName;
    var keyCol = tableName + '_ID';
    var keyVal = node.record[keyCol];
    if (keyVal === undefined || keyVal === null) return;

    // §9 Gateway bubbles — if this is a first-tap RECORD, spawn Properties + Data gateways
    // If this is a gateway node itself (_isGateway), do the actual expansion
    if (!node._isGateway && !node._gatewaysSpawned) {
      _spawnGateways(node);
      return;
    }

    // §3.3 Dynamic FK discovery from AD_Column — returns [{table, column}]
    var fkRefs = _discoverChildren(tableName);
    if (!fkRefs.length) {
      console.log('§AD_GRAPH expandRecord no FK for ' + tableName);
      return;
    }

    var orbitR = _radius * 0.25;
    var allChildren = [];
    var childLimit = 20;

    for (var fi = 0; fi < fkRefs.length; fi++) {
      var fkRef = fkRefs[fi];
      var fkTable = fkRef.table;
      var fkColumn = fkRef.column;  // §BUG3 — use actual FK column name from AD
      try {
        var r = _db.exec('SELECT * FROM [' + fkTable + '] WHERE [' + fkColumn +
                         '] = ? LIMIT ' + (childLimit + 1), [keyVal]);
        if (!r.length || !r[0].values.length) continue;
        var cols = r[0].columns;
        var rows = r[0].values;
        var hasMore = rows.length > childLimit;
        if (hasMore) rows = rows.slice(0, childLimit);

        var fkCfg = ENTITY_CFG[fkTable] || SYS_CFG[fkTable] || { icon: 'table', colour: '#888' };
        // §3.2 colour by table type
        var childColour = fkCfg.colour;
        if (fkTable.indexOf('C_') === 0) childColour = '#ffd93d';
        else if (fkTable.indexOf('M_') === 0) childColour = '#7bed9f';

        for (var ri = 0; ri < rows.length; ri++) {
          var rec = {};
          for (var ci = 0; ci < cols.length; ci++) rec[cols[ci]] = rows[ri][ci];
          var nameC = _findNameCol(rec);
          var fkKeyCol = fkTable + '_ID';
          // §BUG-LABEL: build meaningful label — never show bare Y/N or PK number
          var rawLabel = (nameC && rec[nameC]) ? String(rec[nameC]) : '';
          // If label is too short, a bare number, or single char → use table name + index
          if (rawLabel.length <= 1 || /^\d+$/.test(rawLabel)) {
            var shortTable = fkTable.replace(/^[A-Z]_/, '').replace(/_/g, ' ');
            rawLabel = shortTable + ' ' + (ri + 1);
          }
          allChildren.push({
            tableName: fkTable, record: rec, recordId: rec[fkKeyCol],
            label: String(rawLabel).substring(0, 14),
            colour: childColour, icon: fkCfg.icon || 'table',
            fkColumn: fkColumn  // track which FK linked this child
          });
        }
        if (hasMore) {
          allChildren.push({
            tableName: fkTable, record: null, recordId: null,
            label: '+more', colour: '#666', icon: 'table',
            fkColumn: fkColumn
          });
        }
      } catch (e) { /* table may not exist in this DB */ }
    }

    if (!allChildren.length) {
      console.log('§AD_GRAPH expandRecord no children for ' + tableName + '_ID=' + keyVal);
      return;
    }

    for (var j = 0; j < allChildren.length; j++) {
      if (_nodes.length >= _maxBubbles) break;
      var ch = allChildren[j];
      var pos = _orbitPosition(node, j, allChildren.length, orbitR);

      var child = {
        id: ch.tableName + '_' + ch.recordId,
        label: ch.label, count: null, icon: ch.icon, colour: ch.colour,
        homeSx: pos.x, homeSy: pos.y, homeSz: pos.z,
        sx: pos.x, sy: pos.y, sz: pos.z,
        _startSx: node.sx, _startSy: node.sy, _startSz: node.sz,
        _targetSx: pos.x, _targetSy: pos.y, _targetSz: pos.z,
        _animT: 0,
        size: 12, activity: 0.5,
        pulse: Math.random() * Math.PI * 2, pulseSpeed: 0.003,
        screenX: 0, screenY: 0, screenScale: 1, screenZ: 0,
        tableName: ch.tableName, windowId: WIN_MAP[ch.tableName] || null,
        record: ch.record, recordId: ch.recordId,
        tier: 'child', type: 'CHILD',
        children: [], parent: node, expanded: false,
        _noExpand: true  // §2b.2 — Data children don't drill further (avoid mess)
      };
      node.children.push(child);
      _nodes.push(child);
    }

    node.expanded = true;
    _activeExpandedNode = node;  // §2b dim siblings
    _rebuildEdges();
    console.log('§AD_GRAPH expandRecord table=' + tableName + ' id=' + keyVal +
                ' fkTables=' + fkRefs.length + ' children=' + allChildren.length +
                ' fkNames=' + fkRefs.map(function(r){return r.table;}).join(','));
  }

  // ── §3.3 FK Discovery from AD_Column — dynamic, long-tail ────────
  // §BUG3 — use AD_Reference_ID (19=TableDirect, 30=Table) for real FK semantics.
  // No hardcoded naming conventions. The AD IS the schema.

  var _fkCache = {};  // cache per table to avoid repeated queries

  function _discoverChildren(tableName) {
    if (_fkCache[tableName]) return _fkCache[tableName];
    try {
      // Find all columns in OTHER tables that reference this table via FK
      // AD_Reference_ID 19 = TableDirect (column named TableName_ID)
      // AD_Reference_ID 30 = Table (column references via AD_Ref_Table)
      var r = _db.exec(
        "SELECT DISTINCT t.TableName, c.ColumnName " +
        "FROM AD_Column c " +
        "JOIN AD_Table t ON c.AD_Table_ID = t.AD_Table_ID " +
        "WHERE c.AD_Reference_ID IN (19, 30) " +
        "AND c.ColumnName LIKE '%" + tableName + "_ID%' " +
        "AND t.TableName != '" + tableName + "' " +
        "AND t.IsActive = 'Y' " +
        "AND t.TableName NOT LIKE 'AD_%' " +  // skip AD system tables for data traversal
        "ORDER BY t.TableName"
      );
      if (!r.length) {
        // Fallback: try the simple name-match for tables not fully described in AD
        var r2 = _db.exec(
          "SELECT DISTINCT t.TableName, '" + tableName + "_ID' " +
          "FROM AD_Column c " +
          "JOIN AD_Table t ON c.AD_Table_ID = t.AD_Table_ID " +
          "WHERE c.ColumnName = '" + tableName + "_ID' " +
          "AND t.TableName != '" + tableName + "' " +
          "AND t.IsActive = 'Y'"
        );
        var result = r2.length ? r2[0].values.map(function (row) {
          return { table: row[0], column: row[1] };
        }) : [];
        _fkCache[tableName] = result;
        console.log('§FK_DISCOVER table=' + tableName + ' fallback children=' +
                    result.map(function(r){return r.table;}).join(','));
        return result;
      }
      var result = r[0].values.map(function (row) {
        return { table: row[0], column: row[1] };
      });
      // Filter: only keep tables that actually exist in DB with data
      var verified = [];
      for (var i = 0; i < result.length; i++) {
        try {
          var chk = _db.exec('SELECT 1 FROM [' + result[i].table + '] LIMIT 1');
          if (chk.length && chk[0].values.length) verified.push(result[i]);
        } catch (e) { /* table doesn't exist in this DB — skip */ }
      }
      _fkCache[tableName] = verified;
      console.log('§FK_DISCOVER table=' + tableName + ' adRef=19/30 children=' +
                  verified.map(function(r){return r.table+'('+r.column+')';}).join(','));
      return verified;
    } catch (e) {
      console.log('§FK_DISCOVER ERROR table=' + tableName + ' err=' + e.message);
      return [];
    }
  }

  // ── §3.5 Collapse ─────────────────────────────────────────────────

  function _collapseNode(node) {
    if (!node.expanded) return;
    // §2b.2 — animate children shrinking back to parent, then remove
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      _collapseNode(child);  // collapse grandchildren first (instant for nested)
      // Set up reverse animation: current position → parent centre
      child._collapsing = true;
      child._collapseT = 0;
      child._startSx = child.sx;
      child._startSy = child.sy;
      child._startSz = child.sz;
      child._targetSx = node.sx;
      child._targetSy = node.sy;
      child._targetSz = node.sz;
    }
    // Don't clear children array yet — _animate will remove them after animation
    node.expanded = false;
    node._collapsingChildren = true;
    _activeExpandedNode = null;  // §2b — always restore brightness on any collapse
    if (node._origSize) { node.size = node._origSize; node._origSize = null; }
    _rebuildEdges();
    console.log('§AD_GRAPH collapse node=' + node.id);
  }

  function _collapseAll() {
    for (var i = _nodes.length - 1; i >= 0; i--) {
      if (_nodes[i].type !== 'TABLE') _nodes.splice(i, 1);
    }
    for (var j = 0; j < _nodes.length; j++) {
      _nodes[j].children = [];
      _nodes[j].expanded = false;
      _nodes[j]._collapsingChildren = false;
      if (_nodes[j]._origSize) { _nodes[j].size = _nodes[j]._origSize; _nodes[j]._origSize = null; }
    }
    _activeExpandedNode = null;  // §2b restore full brightness
    _rebuildEdges();
    console.log('§AD_GRAPH collapseAll nodes=' + _nodes.length);
  }

  function _rebuildEdges() {
    _edges = [];
    // TABLE–TABLE mesh
    for (var a = 0; a < _nodes.length; a++) {
      if (_nodes[a].type !== 'TABLE') continue;
      for (var b = a + 1; b < _nodes.length; b++) {
        if (_nodes[b].type !== 'TABLE') continue;
        _edges.push({ from: a, to: b });
      }
    }
    // Parent–child edges
    for (var c = 0; c < _nodes.length; c++) {
      if (_nodes[c].parent) {
        var pi = _nodes.indexOf(_nodes[c].parent);
        if (pi >= 0) _edges.push({ from: pi, to: c });
      }
    }
  }

  // ── §4 Bubble weight formula ──────────────────────────────────────

  function _getBubbleWeight(node) {
    var w = 1;
    if (node.type === 'TABLE') {
      w = 3 + Math.min(Math.log10((node.count || 1) + 1) * 2, 7);
    } else if (node.type === 'RECORD') {
      w = 2;
      w += Math.min((node.children ? node.children.length : 0) / 5, 3);
      if (node.docStatus === 'CO') w += 1;
    } else {
      w = 1;
    }
    return w;
  }

  // ── §1.2 focusNode — search↔globe correlation ────────────────────

  function _findNode(tableName, recordId) {
    // §BUG1 — strict matching: coerce both to Number for reliable comparison
    var candidates = 0;
    var rid = (recordId !== undefined && recordId !== null) ? Number(recordId) : null;
    for (var i = 0; i < _nodes.length; i++) {
      var n = _nodes[i];
      if (n.tableName === tableName) {
        candidates++;
        if (rid === null) {
          if (n.type === 'TABLE') return n;
        } else {
          if (Number(n.recordId) === rid) return n;
        }
      }
    }
    console.log('§FIND_NODE miss table=' + tableName + ' rid=' + recordId +
                ' view=' + _currentView + ' candidates=' + candidates +
                ' totalNodes=' + _nodes.length +
                ' nodeTypes=' + _nodes.map(function(n){return n.type;}).filter(function(v,i,a){return a.indexOf(v)===i;}).join('/'));
    return null;
  }

  // Soft focus — highlight what's visible. If not found, return to home and find TABLE.
  function focusNode(tableName, recordId) {
    console.log('§FOCUS_NODE START table=' + tableName + ' rid=' + recordId +
                ' view=' + _currentView + ' nodeCount=' + _nodes.length +
                ' viewStack=[' + _viewStack.join(',') + ']');

    // Try exact match first (record on current entity globe)
    var node = _findNode(tableName, recordId);
    if (node) {
      console.log('§FOCUS_NODE exactMatch node=' + node.id + ' type=' + node.type);
    }

    // Fall back to TABLE bubble
    if (!node) {
      node = _findNode(tableName, null);
      if (node) {
        console.log('§FOCUS_NODE fallbackTABLE node=' + node.id);
      }
    }

    if (!node && _currentView !== 'home') {
      // In entity view for a different table — go home first, then find TABLE
      console.log('§FOCUS_NODE returnHome from=' + _currentView + ' rebuilding home');
      _currentView = 'home';
      _viewStack = [];
      _rotY = 0; _rotX = -0.3;
      _momentumY = 0; _momentumX = 0;
      _flyTarget = null;
      _buildHomeNodes(_lastClient);
      node = _findNode(tableName, null);
      if (node) {
        console.log('§FOCUS_NODE afterHome node=' + node.id);
      }
    }

    if (node) {
      _focusedNode = node;
      _focusPulseT = 1.0;
      _flyToFront(node);
      console.log('§FOCUS_NODE DONE table=' + tableName + ' rid=' + recordId +
                  ' → node=' + node.id + ' type=' + node.type +
                  ' view=' + _currentView +
                  ' pos=(' + node.sx.toFixed(0) + ',' + node.sy.toFixed(0) + ',' + node.sz.toFixed(0) + ')' +
                  ' radius=' + Math.round(_radius));
      return true;
    }
    console.log('§FOCUS_NODE FAIL table=' + tableName + ' rid=' + recordId +
                ' view=' + _currentView + ' nodes=' + _nodes.length);
    return false;
  }

  // Deep navigate — dive into entity globe to find a specific record. For Enter/click.
  function navigateToRecord(tableName, recordId) {
    console.log('§NAVIGATE START table=' + tableName + ' rid=' + recordId +
                ' view=' + _currentView);

    // Already visible? just focus
    var node = _findNode(tableName, recordId);
    if (node) {
      _focusedNode = node;
      _focusPulseT = 1.0;
      _flyToFront(node);
      console.log('§NAVIGATE inPlace node=' + node.id);
      return true;
    }

    // Navigate into entity globe
    _lastEntityTable = tableName;
    _viewStack.push(_currentView);
    _currentView = 'entity';
    if (typeof history !== 'undefined' && history.pushState) history.pushState({ globe: true }, '');
    _rotY = 0; _rotX = -0.3;
    _buildEntityNodes(tableName);
    console.log('§NAVIGATE builtEntity table=' + tableName + ' nodes=' + _nodes.length);

    var rec = _findNode(tableName, recordId);
    if (rec) {
      _focusedNode = rec;
      _focusPulseT = 1.0;
      // §BUG2 — auto-expand children after fly completes
      _flyToFront(rec, function () {
        if (rec.type === 'RECORD' && !rec.expanded) {
          _expandRecord(rec);
          console.log('§NAVIGATE autoExpand table=' + tableName + ' rid=' + recordId +
                      ' children=' + rec.children.length);
        }
      });
      console.log('§NAVIGATE DONE table=' + tableName + ' rid=' + recordId +
                  ' node=' + rec.id +
                  ' pos=(' + rec.sx.toFixed(0) + ',' + rec.sy.toFixed(0) + ',' + rec.sz.toFixed(0) + ')');
      return true;
    }
    console.log('§NAVIGATE FAIL table=' + tableName + ' rid=' + recordId +
                ' nodes=' + _nodes.length +
                ' ids=' + _nodes.slice(0,5).map(function(n){return n.recordId;}).join(','));
    return false;
  }

  // ── Animation loop ─────────────────────────────────────────────────

  function _animate() {
    if (!_ctx) return;

    // Fly-to-front animation (overrides all other motion)
    if (_flyTarget) {
      _flyT = Math.min(1, _flyT + 0.025); // ~40 frames = ~0.7s
      var ease = _flyT < 0.5
        ? 2 * _flyT * _flyT                      // ease in
        : 1 - Math.pow(-2 * _flyT + 2, 2) / 2;  // ease out
      _rotY = _flyRotYStart + (_flyRotYEnd - _flyRotYStart) * ease;
      _rotX = _flyRotXStart + (_flyRotXEnd - _flyRotXStart) * ease;
      if (_flyT >= 1) {
        var cb = _flyCallback;
        _flyTarget = null;
        _flyCallback = null;
        _momentumY = 0;
        _momentumX = 0;
        if (cb) cb();
      }
    }
    // Momentum decay + auto-spin when not dragging (and not flying)
    else if (!_dragging) {
      if (Math.abs(_momentumY) > 0.0001 || Math.abs(_momentumX) > 0.0001) {
        _rotY += _momentumY;
        _rotX = Math.max(-1.2, Math.min(1.2, _rotX + _momentumX));
        _momentumY *= 0.96;
        _momentumX *= 0.96;
      } else {
        _rotY += _autoSpin;
      }
    }

    _ctx.clearRect(0, 0, _W, _H);

    // Background
    var grad = _ctx.createRadialGradient(_cx, _cy, 0, _cx, _cy, _radius * 1.5);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#0a0a12');
    _ctx.fillStyle = grad;
    _ctx.fillRect(0, 0, _W, _H);

    // Globe wireframe ring (equator hint)
    _ctx.strokeStyle = 'rgba(108,159,255,0.06)';
    _ctx.lineWidth = 1;
    _ctx.beginPath();
    _ctx.ellipse(_cx, _cy, _radius, _radius * Math.abs(Math.cos(_rotX)), 0, 0, Math.PI * 2);
    _ctx.stroke();

    // Focus pulse decay (§1.1 — 2 second highlight)
    if (_focusPulseT > 0) _focusPulseT = Math.max(0, _focusPulseT - 0.008);

    // Project all nodes + animate child fly-out + collapse shrink
    var _removeList = [];
    for (var i = 0; i < _nodes.length; i++) {
      var an = _nodes[i];
      // §2b.2 Collapse animation — shrink back to parent
      if (an._collapsing) {
        an._collapseT = Math.min(1, an._collapseT + 0.04);  // ~25 frames = ~400ms
        var cEase = an._collapseT * an._collapseT;  // ease-in (accelerate into parent)
        an.sx = an._startSx + (an._targetSx - an._startSx) * cEase;
        an.sy = an._startSy + (an._targetSy - an._startSy) * cEase;
        an.sz = an._startSz + (an._targetSz - an._startSz) * cEase;
        an.size *= 0.97;  // shrink while collapsing
        if (an._collapseT >= 1) _removeList.push(i);
      }
      // Constellation grow animation (~800ms ease-out)
      else if (an._animT !== undefined && an._animT < 1) {
        an._animT = Math.min(1, an._animT + 0.02);
        var ease = 1 - Math.pow(1 - an._animT, 3);
        an.sx = an._startSx + (an._targetSx - an._startSx) * ease;
        an.sy = an._startSy + (an._targetSy - an._startSy) * ease;
        an.sz = an._startSz + (an._targetSz - an._startSz) * ease;
      }
      an.pulse += an.pulseSpeed;
      _project(an);
    }
    // Remove fully collapsed nodes (reverse order to preserve indices)
    if (_removeList.length) {
      for (var ri = _removeList.length - 1; ri >= 0; ri--) {
        var rn = _nodes[_removeList[ri]];
        if (rn.parent) {
          var ci = rn.parent.children.indexOf(rn);
          if (ci >= 0) rn.parent.children.splice(ci, 1);
          if (rn.parent.children.length === 0) {
            rn.parent._collapsingChildren = false;
            rn.parent._gatewaysSpawned = false;  // allow re-expand
          }
        }
        _nodes.splice(_removeList[ri], 1);
      }
      // §2b — clear dim when all children removed
      if (_activeExpandedNode && _activeExpandedNode.children.length === 0) {
        _activeExpandedNode = null;
      }
      _rebuildEdges();
    }

    // Sort by Z (far first = painter's algorithm)
    var sortedIdx = [];
    for (var si = 0; si < _nodes.length; si++) sortedIdx.push(si);
    sortedIdx.sort(function (a, b) { return _nodes[a].screenZ - _nodes[b].screenZ; });

    // Draw edges (behind globe = dimmer)
    _ctx.lineWidth = 1;
    for (var ei = 0; ei < _edges.length; ei++) {
      var nA = _nodes[_edges[ei].from];
      var nB = _nodes[_edges[ei].to];
      var avgZ = (nA.screenZ + nB.screenZ) / 2;
      var edgeAlpha = Math.max(0.02, Math.min(0.2, 0.15 - avgZ / (_radius * 4)));
      _ctx.strokeStyle = 'rgba(108,159,255,' + edgeAlpha.toFixed(3) + ')';
      _ctx.beginPath();
      _ctx.moveTo(nA.screenX, nA.screenY);
      _ctx.lineTo(nB.screenX, nB.screenY);
      _ctx.stroke();
    }

    // Draw nodes (sorted far→near)
    for (var ni = 0; ni < sortedIdx.length; ni++) {
      _drawNode(_nodes[sortedIdx[ni]]);
    }


    _animId = requestAnimationFrame(_animate);
  }

  // §2b — Track which node is actively expanded (for dimming siblings)
  var _activeExpandedNode = null;

  function _drawNode(node) {
    var sc = node.screenScale;
    var s = node.size * sc;
    var pulse = 1 + Math.sin(node.pulse) * 0.03;
    s *= pulse;

    // §1.1 Focus highlight — scale up 1.5x when search-correlated
    if (node === _focusedNode && _focusPulseT > 0) {
      s *= 1 + _focusPulseT * 0.5;
    }

    // §2b — Dim siblings when a sub-constellation is expanded
    // Active children + their parent stay bright (100%), others dim to 40%
    var dimFactor = 1.0;
    if (_activeExpandedNode && _activeExpandedNode !== node) {
      var isChild = node.parent === _activeExpandedNode;
      var isParent = node === _activeExpandedNode;
      if (!isChild && !isParent) {
        dimFactor = 0.4;  // dim non-related nodes
      } else if (isChild) {
        s *= 1.15;  // §2b — children slightly larger for readability
      }
    }

    // §1.3 Collapse fade: alpha 1→0 during collapse animation
    var collapseFade = 1.0;
    if (node._collapsing) {
      collapseFade = 1.0 - (node._collapseT || 0);
    }

    // Depth-based alpha: front = bright, back = very dim
    var depthRatio = (node.screenZ + _radius) / (_radius * 2); // 0=front, 1=back
    var alpha = Math.max(0.04, (1 - depthRatio * 0.92) * dimFactor * collapseFade);

    // Skip invisible
    if (s < 2) return;

    var act = node.activity || 0.5;
    var col = node.colour;

    // Outer glow — larger for active nodes (star effect)
    var glowSize = (act > 0.7) ? 2.2 : 1.3;
    var glowAlpha = (act > 0.7) ? alpha * 0.18 : alpha * 0.08;
    _ctx.globalAlpha = glowAlpha;
    _ctx.fillStyle = col;
    _ctx.beginPath();
    _ctx.arc(node.screenX, node.screenY, s * glowSize, 0, Math.PI * 2);
    _ctx.fill();

    // Second glow ring for "hot" records (complete/approved)
    if (act > 0.8 && alpha > 0.3) {
      _ctx.globalAlpha = alpha * 0.06;
      _ctx.beginPath();
      _ctx.arc(node.screenX, node.screenY, s * 3, 0, Math.PI * 2);
      _ctx.fill();
    }

    // Main disc
    _ctx.globalAlpha = alpha;
    _ctx.fillStyle = col;
    _ctx.beginPath();
    _ctx.arc(node.screenX, node.screenY, s * 0.55, 0, Math.PI * 2);
    _ctx.fill();

    // §1.1 Focus glow ring (search correlation)
    if (node === _focusedNode && _focusPulseT > 0) {
      _ctx.save();
      _ctx.globalAlpha = _focusPulseT * 0.5;
      _ctx.strokeStyle = '#fff';
      _ctx.lineWidth = 2 * sc;
      _ctx.beginPath();
      _ctx.arc(node.screenX, node.screenY, s * 0.7, 0, Math.PI * 2);
      _ctx.stroke();
      _ctx.restore();
    }

    // Bright core for active nodes
    if (act > 0.6 && alpha > 0.3) {
      _ctx.globalAlpha = alpha * 0.5;
      _ctx.fillStyle = '#fff';
      _ctx.beginPath();
      _ctx.arc(node.screenX, node.screenY, s * 0.18, 0, Math.PI * 2);
      _ctx.fill();
    }

    // Icon (only if large enough and front enough)
    if (s > 12 && alpha > 0.3) {
      _ctx.globalAlpha = alpha * 0.85;
      _ctx.fillStyle = '#fff';
      var iconFn = ICONS[node.icon];
      if (iconFn) iconFn(_ctx, node.screenX, node.screenY, s * 0.4);
    }

    // Label (front hemisphere only, no clutter)
    if (s > 14 && alpha > 0.45) {
      _ctx.globalAlpha = alpha * 0.9;
      _ctx.fillStyle = '#eee';
      _ctx.font = Math.max(8, Math.round(s * 0.2)) + 'px system-ui';
      _ctx.textAlign = 'center';
      _ctx.textBaseline = 'top';
      _ctx.fillText(node.label, node.screenX, node.screenY + s * 0.6);

      if (node.count !== null && s > 22) {
        _ctx.globalAlpha = alpha * 0.5;
        _ctx.font = Math.max(7, Math.round(s * 0.15)) + 'px system-ui';
        _ctx.fillText(node.count.toLocaleString(), node.screenX, node.screenY + s * 0.6 + 12);
      }
    }

    _ctx.globalAlpha = 1;
  }

  // ── Fly-to-front: rotate globe to bring node to dead centre ────────

  function _flyToFront(node, callback) {
    // Use target position (not animated position which may be 0,0,0 during grow)
    var fx = (node._targetSx !== undefined) ? node._targetSx : node.sx;
    var fy = (node._targetSy !== undefined) ? node._targetSy : node.sy;
    var fz = (node._targetSz !== undefined) ? node._targetSz : node.sz;
    var fLen = Math.sqrt(fx * fx + fy * fy + fz * fz);
    if (fLen < 1) { fLen = _radius; fx = 0; fy = 0; fz = -fLen; } // safety
    var targetRotY = -Math.atan2(fx, -fz);
    var targetRotX = -Math.asin(Math.max(-1, Math.min(1, fy / fLen)));

    // Normalise angles to avoid spinning the long way around
    while (targetRotY - _rotY > Math.PI) targetRotY -= Math.PI * 2;
    while (targetRotY - _rotY < -Math.PI) targetRotY += Math.PI * 2;

    _flyRotYStart = _rotY;
    _flyRotXStart = _rotX;
    _flyRotYEnd = targetRotY;
    _flyRotXEnd = Math.max(-1.2, Math.min(1.2, targetRotX));
    _flyT = 0;
    _flyTarget = node;
    _flyCallback = callback;
    _momentumY = 0;
    _momentumX = 0;

    console.log('§FLY node=' + node.id + ' type=' + node.type +
                ' from=(' + _rotY.toFixed(2) + ',' + _rotX.toFixed(2) + ')' +
                ' to=(' + targetRotY.toFixed(2) + ',' + targetRotX.toFixed(2) + ')' +
                ' spherePos=(' + node.sx.toFixed(0) + ',' + node.sy.toFixed(0) + ',' + node.sz.toFixed(0) + ')');
  }

  // ── Interaction ────────────────────────────────────────────────────

  function _hitTest(px, py) {
    // Check nearest node in screen space (front first)
    var best = null, bestDist = 9999;
    for (var i = 0; i < _nodes.length; i++) {
      var n = _nodes[i];
      if (n.screenScale < 0.3) continue; // skip far-back nodes
      var s = n.size * n.screenScale * 0.55;
      var dx = px - n.screenX, dy = py - n.screenY;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < s && d < bestDist) { best = n; bestDist = d; }
    }
    return best;
  }

  function _onPointerDown(e) {
    e.preventDefault();
    var rect = _canvas.getBoundingClientRect();
    _dragStartX = e.clientX;
    _dragStartY = e.clientY;
    _dragStartRotX = _rotX;
    _dragStartRotY = _rotY;
    _dragging = true;
    _pointerDownTime = Date.now();
    _lastDragX = e.clientX;
    _lastDragY = e.clientY;
    _momentumY = 0;
    _momentumX = 0;
  }

  function _onPointerMove(e) {
    if (!_dragging) return;
    var dx = e.clientX - _dragStartX;
    var dy = e.clientY - _dragStartY;
    // Finer control when zoomed in (large radius = slower rotation)
    var sens = 0.005 * Math.min(1, 200 / Math.max(_radius, 1));
    _rotY = _dragStartRotY + dx * sens;
    _rotX = Math.max(-1.2, Math.min(1.2, _dragStartRotX + dy * sens));
    _momentumY = (e.clientX - _lastDragX) * sens * 0.6;
    _momentumX = (e.clientY - _lastDragY) * sens * 0.6;
    _lastDragX = e.clientX;
    _lastDragY = e.clientY;
  }

  function _onPointerUp(e) {
    if (!_dragging) return;
    _dragging = false;
    var dx = e.clientX - _dragStartX;
    var dy = e.clientY - _dragStartY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var elapsed = Date.now() - _pointerDownTime;

    if (dist < 8) {
      // This was a tap, not a drag
      var rect = _canvas.getBoundingClientRect();
      var sx = (e.clientX - rect.left) * (_W / rect.width);
      var sy = (e.clientY - rect.top) * (_H / rect.height);

      var hit = _hitTest(sx, sy);

      console.log('§TAP hit=' + (hit ? hit.id : 'EMPTY') + ' type=' + (hit ? hit.type : '-') +
                  ' elapsed=' + elapsed + ' view=' + _currentView +
                  ' flying=' + !!_flyTarget + ' nodes=' + _nodes.length);

      if (hit && !_flyTarget) {
        if (elapsed > 500) {
          // Long press — TABLE bubble → all records; RECORD/CHILD → that record's accordion
          console.log('§TAP longPress table=' + hit.tableName + ' type=' + hit.type + ' hasRecord=' + !!hit.record);
          if (_onDrill) {
            if (hit.record) {
              _onDrill(hit.tableName, hit.windowId, hit.record, 'data');
            } else {
              _onDrill(hit.tableName, hit.windowId, null, 'table');
            }
          }
        } else {
          // Double-tap detection: RECORD only — skip gateways, open panel directly
          var now = Date.now();
          var isDoubleTap = (_lastTapNode === hit && now - _lastTapTime < 400);
          _lastTapTime = now;
          _lastTapNode = hit;

          if (isDoubleTap && _onDrill) {
            // Double-tap anything → open ALL records of that table
            console.log('§TAP DOUBLE type=' + hit.type + ' table=' + hit.tableName);
            _onDrill(hit.tableName, hit.windowId, null, 'table');
          } else if (hit.type === 'TABLE') {
            console.log('§TAP TABLE→dive table=' + hit.tableName + ' expanded=' + hit.expanded);
            _flyToFront(hit, function () {
              _lastEntityTable = hit.tableName;
              _viewStack.push(_currentView);
              _currentView = 'entity';
              if (typeof history !== 'undefined' && history.pushState) history.pushState({ globe: true }, '');
              _rotY = 0; _rotX = -0.3;
              _buildEntityNodes(hit.tableName);
              console.log('§TAP TABLE→entity DONE nodes=' + _nodes.length + ' view=' + _currentView);
            });
          } else if (hit.type === 'RECORD') {
            console.log('§TAP RECORD table=' + hit.tableName + ' id=' + hit.recordId +
                        ' expanded=' + hit.expanded + ' children=' + hit.children.length);
            _flyToFront(hit, function () {
              if (hit.expanded && _onDrill) {
                // §S259: tapping expanded record → open full data panel (all fields + child tabs)
                _onDrill(hit.tableName, hit.windowId, hit.record, 'data');
              } else {
                _expandRecord(hit);
              }
            });
          } else if (hit.type === 'CHILD') {
            console.log('§TAP CHILD table=' + hit.tableName + ' id=' + hit.recordId +
                        ' hasRecord=' + !!hit.record + ' expanded=' + hit.expanded +
                        ' gateway=' + (hit._isGateway || 'none'));
            _flyToFront(hit, function () {
              // §9 Gateway handling
              if (hit._isGateway === 'properties') {
                // Properties gateway → expand property-name bubbles (query picker)
                if (hit.expanded) _collapseNode(hit);
                else _expandProperties(hit);
              } else if (hit._isGateway === 'data' && _onDrill) {
                // Data gateway → straight to record panel (no sub-bubbles)
                _onDrill(hit.tableName, hit.windowId, hit.record, 'data');
              } else if (hit._isPropertyBubble && _onDrill) {
                // §9.1 Property bubble tap → open panel filtered+sorted by this column
                _onDrill(hit.tableName, hit.windowId, hit.record, hit._propertyColumn);
              } else if (hit._noExpand && _onDrill) {
                // §2b.2 — Data children: no further drilling, open card
                _onDrill(hit.tableName, hit.windowId, hit.record, 'data');
              } else if (hit.record && !hit.expanded) {
                // §2a — Regular CHILD: try expanding its own FK relationships
                _expandRecord(hit);
                if (hit.children.length === 0 && _onDrill) {
                  _onDrill(hit.tableName, hit.windowId, hit.record);
                }
              } else if (_onDrill) {
                _onDrill(hit.tableName, hit.windowId, hit.record);
              }
            });
          }
        }
      } else if (!hit) {
        if (elapsed > 500) {
          console.log('§TAP longPressEmpty → search');
          if (_onLongPressEmpty) _onLongPressEmpty();
        } else if (_activeExpandedNode) {
          // §3 step 6 — tap empty collapses entire expansion tree, restores brightness
          // Walk up to find top-level expanded parent
          var colTarget = _activeExpandedNode;
          while (colTarget.parent && colTarget.parent.expanded) colTarget = colTarget.parent;
          console.log('§TAP empty → collapseActive node=' + colTarget.id);
          _collapseNode(colTarget);
        } else if (_currentView !== 'home') {
          console.log('§TAP empty → goBack from=' + _currentView);
          _goBack();
        }
      }
    }
  }

  function _goBack() {
    var prev = _currentView;
    var returnTable = _lastEntityTable;
    _currentView = _viewStack.pop() || 'home';
    _rotY = 0; _rotX = -0.3;
    _momentumY = 0; _momentumX = 0;
    _flyTarget = null;
    _activeExpandedNode = null;  // §1 — clear dim immediately on back
    if (_currentView === 'home') {
      _buildHomeNodes(_lastClient);
      // Fly back to the TABLE we came from
      if (returnTable) {
        var origin = _findNode(returnTable, null);
        if (origin) {
          _flyToFront(origin);
          _focusedNode = origin;
          _focusPulseT = 1.0;
          console.log('§BACK flyTo=' + returnTable);
        }
      }
    }
    console.log('§BACK from=' + prev + ' to=' + _currentView +
                ' returnTable=' + returnTable +
                ' stack=[' + _viewStack.join(',') + '] nodes=' + _nodes.length);
  }

  var _exitWarned = false;
  var _exitTimer = null;

  function _onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (_currentView !== 'home') {
        _goBack();
      }
    }
  }

  // Browser back button → go back within globe, not exit page
  function _onPopState() {
    if (_currentView !== 'home') {
      // Push state again to keep trapping back
      if (typeof history !== 'undefined' && history.pushState) history.pushState({ globe: true }, '');
      _goBack();
    } else if (!_exitWarned) {
      // First back on home → warn
      _exitWarned = true;
      if (typeof history !== 'undefined' && history.pushState) history.pushState({ globe: true }, '');
      _showExitToast();
      _exitTimer = setTimeout(function () { _exitWarned = false; }, 3000);
      console.log('§BACK exitWarn');
    }
    // Second back within 3s → let browser handle (exit)
  }

  function _showExitToast() {
    if (typeof document === 'undefined') return;
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
      'z-index:90;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;' +
      'color:#fff;background:rgba(12,12,18,0.8);backdrop-filter:blur(12px);' +
      '-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);' +
      'pointer-events:none;animation:fadeInOut 2.5s ease forwards;';
    t.textContent = 'Back again to exit';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2500);
  }

  function _onWheel(e) {
    e.preventDefault();
    var delta = e.deltaY > 0 ? -8 : 8;
    _radius = Math.max(40, Math.min(Math.max(_W, _H) * 1.2, _radius + delta));
    _rebuildSpherePositions();
  }

  // ── Pinch-to-zoom (mobile) ────────────────────────────────────────

  var _pinchStartDist = 0;
  var _pinchStartRadius = 0;

  function _onTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      _pinchStartDist = Math.sqrt(dx * dx + dy * dy);
      _pinchStartRadius = _radius;
    }
  }

  function _onTouchMove(e) {
    if (e.touches.length === 2 && _pinchStartDist > 0) {
      e.preventDefault();
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var scale = dist / _pinchStartDist;
      _radius = Math.max(40, Math.min(Math.max(_W, _H) * 1.2,
        _pinchStartRadius * scale));
      _rebuildSpherePositions();
    }
  }

  function _onTouchEnd(e) {
    if (e.touches.length < 2) {
      // Kill momentum after pinch — prevent spin-out when fingers lift
      if (_pinchStartDist > 0) {
        _momentumY = 0;
        _momentumX = 0;
        _dragging = false;
        // Pinch-close → go back if zoomed below 60% of start
        if (_currentView !== 'home' && _radius < _pinchStartRadius * 0.6) {
          console.log('§PINCH_CLOSE → goBack radius=' + Math.round(_radius) +
                      ' start=' + Math.round(_pinchStartRadius));
          _goBack();
        }
      }
      _pinchStartDist = 0;
    }
  }

  function _rebuildSpherePositions() {
    // Rescale all node positions proportionally to new radius
    for (var i = 0; i < _nodes.length; i++) {
      var n = _nodes[i];
      var len = Math.sqrt(n.sx * n.sx + n.sy * n.sy + n.sz * n.sz);
      if (len > 0.1) {
        var scale = _radius / len;
        n.sx *= scale; n.sy *= scale; n.sz *= scale;
        n.homeSx = n.sx; n.homeSy = n.sy; n.homeSz = n.sz;
        if (n._targetSx !== undefined) {
          n._targetSx = n.sx; n._targetSy = n.sy; n._targetSz = n.sz;
        }
      }
    }
    console.log('§ZOOM radius=' + Math.round(_radius) + ' nodes=' + _nodes.length +
                ' view=' + _currentView);
  }

  // ── Public API ─────────────────────────────────────────────────────

  function init(canvas, db, client, onDrill, onLongPress, onLongPressEmpty) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
    _db = db;
    _W = canvas.width;
    _H = canvas.height;
    _cx = _W / 2;
    _cy = _H / 2;
    _radius = Math.min(_W, _H) * 0.38;
    _onDrill = onDrill;
    _onLongPress = onLongPress;
    _onLongPressEmpty = onLongPressEmpty;
    _lastClient = client;
    _currentView = 'home';
    _viewStack = [];
    _rotY = 0;
    _rotX = -0.3;

    _fkCache = {};  // clear FK cache on init
    _buildHomeNodes(client);

    canvas.addEventListener('pointerdown', _onPointerDown);
    canvas.addEventListener('pointermove', _onPointerMove);
    canvas.addEventListener('pointerup', _onPointerUp);
    canvas.addEventListener('wheel', _onWheel, { passive: false });
    canvas.addEventListener('touchstart', _onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', _onTouchMove, { passive: false });
    canvas.addEventListener('touchend', _onTouchEnd);
    if (typeof document !== 'undefined') document.addEventListener('keydown', _onKeyDown);
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('popstate', _onPopState);
      if (typeof history !== 'undefined' && history.pushState) history.pushState({ globe: true }, '');
    }

    if (_animId) cancelAnimationFrame(_animId);
    _animate();

    console.log('§AD_GRAPH init client=' + client + ' nodes=' + _nodes.length + ' radius=' + Math.round(_radius));

    // Defer FTS5 index build — don't block first paint
    if (typeof ERPSearch !== 'undefined' && ERPSearch.buildIndex && !ERPSearch.isIndexed()) {
      setTimeout(function () {
        var _tFts = typeof performance !== 'undefined' ? performance.now() : Date.now();
        ERPSearch.buildIndex(_db);
        console.log('§BENCH fts5_build=' + Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _tFts) + 'ms (deferred)');
      }, 100);
    }
  }

  function destroy() {
    if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
    if (_canvas) {
      _canvas.removeEventListener('pointerdown', _onPointerDown);
      _canvas.removeEventListener('pointermove', _onPointerMove);
      _canvas.removeEventListener('pointerup', _onPointerUp);
      _canvas.removeEventListener('touchstart', _onTouchStart);
      _canvas.removeEventListener('touchmove', _onTouchMove);
      _canvas.removeEventListener('touchend', _onTouchEnd);
    }
    if (typeof document !== 'undefined') document.removeEventListener('keydown', _onKeyDown);
    if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('popstate', _onPopState);
    _nodes = []; _edges = []; _ctx = null;
    console.log('§AD_GRAPH destroy');
  }

  function showEntity(tableName) {
    _viewStack.push(_currentView);
    _currentView = 'entity';
    _buildEntityNodes(tableName);
  }

  /**
   * §INSTANT — init globe from initbubble.json, no DB needed.
   * Renders immediately. Call hydrate(db) later for full interactivity.
   */
  function initFromBubbles(canvas, bubbles, client, onDrill, onLongPress, onLongPressEmpty) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
    _db = null;
    _W = canvas.width;
    _H = canvas.height;
    _cx = _W / 2;
    _cy = _H / 2;
    _radius = Math.min(_W, _H) * 0.38;
    _onDrill = onDrill || function(){};
    _onLongPress = onLongPress || function(){};
    _onLongPressEmpty = onLongPressEmpty || function(){};
    _lastClient = client || 'gardenworld';
    _currentView = 'home';
    _viewStack = [];
    _rotY = 0;
    _rotX = -0.3;
    _fkCache = {};

    // Build nodes from bubbles JSON (same layout as _buildHomeNodes)
    _nodes = [];
    _edges = [];
    _activeExpandedNode = null;
    var items = bubbles.nodes || [];
    items.sort(function(a,b) { return b.count - a.count; });
    var maxCnt = items.length ? items[0].count : 1;

    for (var j = 0; j < items.length; j++) {
      var c = items[j];
      var ratio = c.count / maxCnt;
      var golden = (1 + Math.sqrt(5)) / 2;
      var theta = 2 * Math.PI * j / golden;
      var phi = Math.acos(1 - 2 * (j + 0.5) / items.length);
      phi = phi * (1 - ratio * 0.4);

      var tSx = _radius * Math.sin(phi) * Math.cos(theta);
      var tSy = _radius * Math.cos(phi) * 0.85;
      var tSz = _radius * Math.sin(phi) * Math.sin(theta);
      var cfg = ENTITY_CFG[c.table] || SYS_CFG[c.table] || { icon: 'table', colour: c.color || '#888', label: c.label };
      _nodes.push({
        id: c.table, label: cfg.label, count: c.count,
        icon: cfg.icon, colour: c.color || cfg.colour,
        homeSx: tSx, homeSy: tSy, homeSz: tSz,
        sx: 0, sy: 0, sz: 0,
        _startSx: 0, _startSy: 0, _startSz: 0,
        _targetSx: tSx, _targetSy: tSy, _targetSz: tSz,
        _animT: 0,
        size: 18 + ratio * 36, activity: ratio,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.003 + ratio * 0.004,
        screenX: 0, screenY: 0, screenScale: 1, screenZ: 0,
        tableName: c.table, windowId: c.windowId || WIN_MAP[c.table] || null,
        type: 'TABLE', children: [], parent: null, expanded: false
      });
    }
    for (var a = 0; a < _nodes.length; a++) {
      for (var b = a + 1; b < _nodes.length; b++) {
        _edges.push({ from: a, to: b });
      }
    }

    // Attach input events
    canvas.addEventListener('pointerdown', _onPointerDown);
    canvas.addEventListener('pointermove', _onPointerMove);
    canvas.addEventListener('pointerup', _onPointerUp);
    canvas.addEventListener('wheel', _onWheel, { passive: false });
    canvas.addEventListener('touchstart', _onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', _onTouchMove, { passive: false });
    canvas.addEventListener('touchend', _onTouchEnd);

    if (_animId) cancelAnimationFrame(_animId);
    _animate();
    console.log('§AD_GRAPH initFromBubbles nodes=' + _nodes.length + ' radius=' + Math.round(_radius));
  }

  /**
   * §INSTANT — upgrade globe with real DB. Enables drill, entity view, FTS5.
   */
  function graphHydrate(db) {
    _db = db;
    console.log('§AD_GRAPH hydrated — drill enabled');
  }

  var ADGraph = {
    init: init,
    initFromBubbles: initFromBubbles,
    graphHydrate: graphHydrate,
    destroy: destroy,
    showEntity: showEntity,
    focusNode: focusNode,
    navigateToRecord: navigateToRecord,
    discoverChildren: _discoverChildren,
    collapseAll: _collapseAll,
    zoom: function (delta) { _radius = Math.max(40, _radius + delta); _rebuildSpherePositions(); },
    getRadius: function () { return _radius; },
    getFlyDelta: function () { return Math.abs(_flyRotYEnd - _flyRotYStart); },
    getScreenScale: function (idx) { return _nodes[idx] ? _nodes[idx].screenScale : 0; },
    getNodeCount: function () { return _nodes.length; },
    getCurrentView: function () { return _currentView; },
    getBubbleWeight: _getBubbleWeight,
    // §DEBUG — whitebox accessors for testing collapse/dim/gateway state
    _debug: {
      getActiveExpanded: function () { return _activeExpandedNode; },
      getNodes: function () { return _nodes; },
      findNode: _findNode,
      expandRecord: _expandRecord,
      collapseNode: _collapseNode,
      spawnGateways: _spawnGateways,
      expandProperties: _expandProperties
    }
  };

  if (typeof window !== 'undefined') window.ADGraph = ADGraph;
  if (typeof module !== 'undefined' && module.exports) module.exports = ADGraph;

  console.log('§AD_GRAPH_LOADED v7');
})();
