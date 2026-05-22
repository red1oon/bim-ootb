/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * dxf_export.js — Browser DXF serializer with BIMSRC xdata
 *
 * API: window.DxfExport.toDxf(entities, options) → string
 *      window.DxfExport.downloadDxf(entities, options, filename) → void
 *
 * Log tags: §DX_EXPORT, §DX_BIMSRC, §DX_SIZE, §DX_DOWNLOAD
 *
 * DXF format: AutoCAD R2000 (AC1015), INSUNITS=6 (meters)
 * BIMSRC xdata on entities with guid — matches Python writer format.
 */
(function () {
  'use strict';

  var EOL = '\r\n';

  /* ── Layer color map ─────────────────────────────────────────── */
  var LAYER_COLORS = {
    'A-WALL-FULL': 7,
    'A-WALL-PRTN': 8,
    'A-GLAZ':      5,
    'A-DOOR':      1,
    'A-GRID':      8,
    'A-ANNO-DIMS': 8,
    'A-ANNO-TEXT': 7,
    'A-ELEV-WALL': 7,
    'A-ROOF':      7,
    'A-FURN':      8
  };
  var DEFAULT_COLOR = 7;

  function layerColor(name) {
    return LAYER_COLORS[name] !== undefined ? LAYER_COLORS[name] : DEFAULT_COLOR;
  }

  /* ── Handle counter for unique entity handles ────────────────── */
  var _handle;

  function nextHandle() {
    _handle += 1;
    return _handle.toString(16).toUpperCase();
  }

  /* ── Low-level DXF helpers ───────────────────────────────────── */

  function gc(code, value) {
    return String(code) + EOL + String(value) + EOL;
  }

  /* ── BIMSRC xdata block ──────────────────────────────────────── */

  function bimsrcXdata(guid, ifcClass) {
    var s = '';
    s += gc(1001, 'BIMSRC');
    s += gc(1000, 'guid:' + guid);
    if (ifcClass) {
      s += gc(1000, 'ifc_class:' + ifcClass);
    }
    return s;
  }

  /* ── Section builders ────────────────────────────────────────── */

  function buildHeader(title) {
    var s = '';
    s += gc(0, 'SECTION');
    s += gc(2, 'HEADER');
    s += gc(9, '$ACADVER');
    s += gc(1, 'AC1015');
    s += gc(9, '$INSUNITS');
    s += gc(70, 6);
    s += gc(0, 'ENDSEC');
    return s;
  }

  function buildTables(layers) {
    var s = '';
    s += gc(0, 'SECTION');
    s += gc(2, 'TABLES');

    /* ── APPID table ── */
    s += gc(0, 'TABLE');
    s += gc(2, 'APPID');
    s += gc(5, nextHandle());
    s += gc(100, 'AcDbSymbolTable');
    s += gc(70, 2);
    /* ACAD entry */
    s += gc(0, 'APPID');
    s += gc(5, nextHandle());
    s += gc(100, 'AcDbSymbolTableRecord');
    s += gc(100, 'AcDbRegAppTableRecord');
    s += gc(2, 'ACAD');
    s += gc(70, 0);
    /* BIMSRC entry */
    s += gc(0, 'APPID');
    s += gc(5, nextHandle());
    s += gc(100, 'AcDbSymbolTableRecord');
    s += gc(100, 'AcDbRegAppTableRecord');
    s += gc(2, 'BIMSRC');
    s += gc(70, 0);
    s += gc(0, 'ENDTAB');

    /* ── LAYER table ── */
    s += gc(0, 'TABLE');
    s += gc(2, 'LAYER');
    s += gc(5, nextHandle());
    s += gc(100, 'AcDbSymbolTable');
    s += gc(70, layers.length);
    for (var i = 0; i < layers.length; i++) {
      var name = layers[i];
      s += gc(0, 'LAYER');
      s += gc(5, nextHandle());
      s += gc(100, 'AcDbSymbolTableRecord');
      s += gc(100, 'AcDbLayerTableRecord');
      s += gc(2, name);
      s += gc(70, 0);
      s += gc(62, layerColor(name));
      s += gc(6, 'CONTINUOUS');
    }
    s += gc(0, 'ENDTAB');

    s += gc(0, 'ENDSEC');
    return s;
  }

  /* ── Entity encoders ─────────────────────────────────────────── */

  function encodeLine(e) {
    var layer = e.layer || '0';
    var s = '';
    s += gc(0, 'LINE');
    s += gc(5, nextHandle());
    s += gc(100, 'AcDbEntity');
    s += gc(8, layer);
    s += gc(100, 'AcDbLine');
    s += gc(10, e.x0);
    s += gc(20, e.y0);
    s += gc(30, 0.0);
    s += gc(11, e.x1);
    s += gc(21, e.y1);
    s += gc(31, 0.0);
    if (e.guid) s += bimsrcXdata(e.guid, e.ifcClass);
    return s;
  }

  function encodePolyline(e) {
    var layer = e.layer || '0';
    var pts = e.points || [];
    var closed = e.closed ? 1 : 0;
    var s = '';
    s += gc(0, 'LWPOLYLINE');
    s += gc(5, nextHandle());
    s += gc(100, 'AcDbEntity');
    s += gc(8, layer);
    s += gc(100, 'AcDbPolyline');
    s += gc(90, pts.length);
    s += gc(70, closed);
    s += gc(43, 0.0);
    for (var i = 0; i < pts.length; i++) {
      s += gc(10, pts[i][0]);
      s += gc(20, pts[i][1]);
    }
    if (e.guid) s += bimsrcXdata(e.guid, e.ifcClass);
    return s;
  }

  function encodeCircle(e) {
    var layer = e.layer || '0';
    var s = '';
    s += gc(0, 'CIRCLE');
    s += gc(5, nextHandle());
    s += gc(100, 'AcDbEntity');
    s += gc(8, layer);
    s += gc(100, 'AcDbCircle');
    s += gc(10, e.cx);
    s += gc(20, e.cy);
    s += gc(30, 0.0);
    s += gc(40, e.r);
    if (e.guid) s += bimsrcXdata(e.guid, e.ifcClass);
    return s;
  }

  function encodeArc(e) {
    var layer = e.layer || '0';
    var s = '';
    s += gc(0, 'ARC');
    s += gc(5, nextHandle());
    s += gc(100, 'AcDbEntity');
    s += gc(8, layer);
    s += gc(100, 'AcDbCircle');
    s += gc(10, e.cx);
    s += gc(20, e.cy);
    s += gc(30, 0.0);
    s += gc(40, e.r);
    s += gc(100, 'AcDbArc');
    /* Angles: input is radians, DXF expects degrees */
    var startDeg = (e.startAngle != null) ? e.startAngle * (180 / Math.PI) : 0;
    var endDeg   = (e.endAngle   != null) ? e.endAngle   * (180 / Math.PI) : 360;
    s += gc(50, startDeg);
    s += gc(51, endDeg);
    if (e.guid) s += bimsrcXdata(e.guid, e.ifcClass);
    return s;
  }

  function encodeText(e) {
    var layer = e.layer || '0';
    var height = e.height || 1.0;
    var s = '';
    s += gc(0, 'TEXT');
    s += gc(5, nextHandle());
    s += gc(100, 'AcDbEntity');
    s += gc(8, layer);
    s += gc(100, 'AcDbText');
    s += gc(10, e.x);
    s += gc(20, e.y);
    s += gc(30, 0.0);
    s += gc(40, height);
    s += gc(1, e.text || '');
    s += gc(100, 'AcDbText');
    if (e.guid) s += bimsrcXdata(e.guid, e.ifcClass);
    return s;
  }

  var ENCODERS = {
    'line':     encodeLine,
    'polyline': encodePolyline,
    'circle':   encodeCircle,
    'arc':      encodeArc,
    'text':     encodeText
  };

  /* ── Public API ──────────────────────────────────────────────── */

  function toDxf(entities, options) {
    entities = entities || [];
    options  = options  || {};
    _handle  = 0x20; // start handles above reserved range

    /* Collect unique layers */
    var layerSet = {};
    for (var i = 0; i < entities.length; i++) {
      var lyr = entities[i].layer || '0';
      layerSet[lyr] = true;
    }
    var layers = Object.keys(layerSet).sort();

    console.log('§DX_EXPORT entities=' + entities.length + ' layers=' + layers.length);

    /* Build DXF string */
    var dxf = '';
    dxf += buildHeader(options.title || 'Sheet');
    dxf += buildTables(layers);

    /* ENTITIES section */
    dxf += gc(0, 'SECTION');
    dxf += gc(2, 'ENTITIES');

    var bimsrcCount = 0;
    for (var j = 0; j < entities.length; j++) {
      var ent = entities[j];
      var encoder = ENCODERS[ent.type];
      if (!encoder) {
        console.warn('§DX_EXPORT unknown entity type: ' + ent.type);
        continue;
      }
      dxf += encoder(ent);
      if (ent.guid) bimsrcCount++;
    }

    dxf += gc(0, 'ENDSEC');
    dxf += gc(0, 'EOF');

    console.log('§DX_BIMSRC tagged=' + bimsrcCount);
    console.log('§DX_SIZE bytes=' + dxf.length);

    return dxf;
  }

  function downloadDxf(entities, options, filename) {
    filename = filename || 'drawing.dxf';
    var content = toDxf(entities, options);
    var blob = new Blob([content], { type: 'application/dxf' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('§DX_DOWNLOAD filename=' + filename);
  }

  /* ── Attach to window ────────────────────────────────────────── */
  if (typeof window !== 'undefined' && !window.DxfExport) {
    window.DxfExport = {
      toDxf:       toDxf,
      downloadDxf: downloadDxf
    };
  }

})();
