// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf_export_ui.js — DXF2BIM lane L5 in the Modeller (prompts/DXF2BIM_MODELLER_LANE.md §L5.1): Export ▸ "2D drawings (DXF)".
// The user's IFC (the one just opened, or picked) is read by the SAME extractor core the Node tool runs (dxf2bim/ifc_extract_core.js, web-ifc wasm + sql.js),
// the standard 2D set is written by the JS port of std2d (dxf2bim/std2d.js), the markings are derived from the model (dxf2bim/std2d_marks.js, @BY=model), and a
// "drawable?" report shows what the model states and what could not be drawn, before anything is downloaded. The download is a .zip of the .dxf sheets and nothing else
// (markings live inside the DXF; no sidecar). Re-opening the sheets with Open ▸ 2D drawings (.dxf) is the round trip (witness_dxf_export_roundtrip.js).
// No unicode glyphs: Lucide line icons inline. Loads its scripts lazily on first use (none at boot). Logs §DXF-EXPORT.
(function () {
  'use strict';
  var TAG = '§DXF-EXPORT', V = '1';
  var SCRIPTS = ['lib/dxf-parser.js', 'dxf2bim/dxf2bim.js', 'dxf2bim/dxf2marks.js', 'dxf2bim/dxf2shell_config.js', 'dxf2bim_import.js', 'dxf2bim/polygon-clipping.js',
    'dxf2bim/std2d_geom.js', 'dxf2bim/std2d_dxf.js', 'dxf2bim/std2d.js', 'dxf2bim/std2d_marks.js', 'dxf2bim/ifc_extract_core.js'];
  var _base = (document.currentScript && document.currentScript.src) || location.href;
  var _loaded = null;
  function loadScripts() {
    if (_loaded) return _loaded;
    _loaded = SCRIPTS.reduce(function (p, src) {
      return p.then(function () {
        if (src === 'lib/dxf-parser.js' && window.DxfParser) return null;   // already there (the importer loaded it)
        return new Promise(function (res, rej) {
          var s = document.createElement('script'); s.src = new URL(src + '?v=' + V, _base).href;
          s.onload = res; s.onerror = function () { rej(new Error('load failed ' + src)); }; document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { console.log(TAG + ' modules loaded n=' + SCRIPTS.length); return true; })
      .catch(function (e) { _loaded = null; console.error(TAG + ' ' + e.message); throw e; });
    return _loaded;
  }

  // ---- minimal ZIP (STORE) writer: CRC32 0xEDB88320, the same standard bcf_export.js uses; no compression, no library ----
  var CRC_T = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {   // files: [{name, bytes:Uint8Array}] -> Uint8Array
    var enc = new TextEncoder(), parts = [], cd = [], off = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; } function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var nm = enc.encode(f.name), crc = crc32(f.bytes), sz = f.bytes.length;
      var lh = [0x50, 0x4b, 3, 4].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(sz), u32(sz), u16(nm.length), u16(0));
      parts.push(new Uint8Array(lh), nm, f.bytes);
      cd.push([0x50, 0x4b, 1, 2].concat(u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(sz), u32(sz), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off)), nm);
      off += lh.length + nm.length + sz;
    });
    var cdLen = 0; cd.forEach(function (p) { cdLen += p.length; });
    var end = [0x50, 0x4b, 5, 6].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(cdLen), u32(off), u16(0));
    var all = parts.concat(cd.map(function (p) { return new Uint8Array(p); }), [new Uint8Array(end)]), n = 0; all.forEach(function (p) { n += p.length; });
    var out = new Uint8Array(n), o = 0; all.forEach(function (p) { out.set(p, o); o += p.length; }); return out;
  }

  // ---- the pipeline: IFC bytes -> model DB (browser path) -> std set -> markings -> report ----
  async function build(file, step) {
    await loadScripts();
    var prefix = (file.name || 'MODEL').replace(/\.ifc$/i, '').split(/[_\s.-]/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '') || 'MODEL';
    step('Reading ' + file.name);
    var data = new Uint8Array(await file.arrayBuffer());
    var api = new window.WebIFC.IfcAPI(); await api.Init(function (p) { return new URL('lib/' + p, _base).href; });
    var Core = window.IfcExtractCore, sdb = new window.SQL.Database(), exLog = [];
    step('Extracting the model (web-ifc)');
    await Core.extractToDb({ WebIFC: window.WebIFC, ifcApi: api, ifcData: data, db: Core.sqljsDb(sdb), Buf: Core.browserBuf, buildingName: prefix, sourceName: file.name,
      log: function (m) { exLog.push(m); }, progress: function (m) { step(m); } });
    var q = function (sql) { var r = sdb.exec(sql); if (!r.length) return []; return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); };
    step('Drawing the standard set');
    var R = window.Std2d.writeStdSet(q, prefix), report = window.Std2d.drawableReport(R), D = null;
    if (report.drawable) {
      step('Deriving markings from the model');
      D = window.Std2dMarks.deriveMarks(R, { B: window.Dxf2Bim, DxfParser: window.DxfParser, hashHex: window.Dxf2BimImport.sha256Hex, MK: window.Dxf2Marks, SHC: window.Dxf2ShellConfig }, { set: prefix });
    }
    sdb.close();
    console.log(TAG + ' built file=' + file.name + ' sheets=' + Object.keys(R.files).length + ' drawable=' + report.drawable + ' gaps=' + R.gaps.length);
    return { prefix: prefix, R: R, report: report, marked: D ? D.files : null, markLog: D ? D.log : [], exLog: exLog };
  }

  // ---- panel (same small-panel idiom as the Export chooser) ----
  var COL = { ok: '#4ade80', gap: '#f59e0b', info: '#64748b' };
  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>';
  var panel = null;
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div'); panel.id = 'm-dxfexp-panel';
    panel.style.cssText = 'position:fixed;bottom:74px;right:70px;z-index:42;width:430px;max-height:70vh;overflow:auto;display:none;padding:12px;background:rgba(20,22,30,0.96);' +
      'border:1px solid #2c303a;border-radius:12px;color:#c7cdd8;font:12px system-ui,sans-serif;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 8px 30px rgba(0,0,0,0.5)';
    document.body.appendChild(panel); return panel;
  }
  function show(html) { var p = ensurePanel(); p.innerHTML = html; p.style.display = 'block'; return p; }
  function close() { if (panel) panel.style.display = 'none'; }
  var head = '<div style="display:flex;align-items:center;gap:8px;margin:0 2px 8px;color:#8b94a5;letter-spacing:.12em;font-size:10px">' + ICON + '<span>2D DRAWINGS (DXF)</span><span id="dxfexp-x" style="margin-left:auto;cursor:pointer;font-size:14px">&times;</span></div>';
  function bindX(p) { var x = p.querySelector('#dxfexp-x'); if (x) x.onclick = close; }
  function renderBusy(msg) { var p = show(head + '<div style="padding:6px 2px">' + esc(msg) + '...</div>'); bindX(p); }

  function renderReport(B, file) {
    var r = B.report, h = head + '<div style="margin:0 2px 8px;color:' + (r.drawable ? '#4ade80' : '#f59e0b') + '">' + (r.drawable ? 'Drawable: the standard set was written from the model.' : 'Not drawable as a standard set: ' + esc(r.reasons.join('; ')) + '.') + '</div>';
    h += '<div style="display:flex;gap:8px;margin:0 0 10px;justify-content:flex-end">';
    h += '<button id="dxfexp-log" style="background:#23262e;color:#c7cdd8;border:1px solid #2c303a;border-radius:8px;padding:6px 10px;cursor:pointer">Copy log</button>';
    if (B.marked) h += '<button id="dxfexp-dl" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer">Download .zip (' + Object.keys(B.marked).length + ' sheets)</button>';
    h += '</div>';
    h += '<table style="width:100%;border-collapse:collapse">';
    r.rows.forEach(function (x) {
      h += '<tr><td style="vertical-align:top;padding:3px 6px 3px 2px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + COL[x.status] + '"></span></td>' +
        '<td style="padding:3px 6px 3px 0;white-space:pre">' + esc(x.label) + '</td><td style="padding:3px 6px;text-align:right;color:#e5e7eb">' + esc(x.value) + '</td></tr>' +
        '<tr><td></td><td colspan="2" style="padding:0 6px 4px 0;color:#5b6473;font-size:10.5px">' + esc(x.source) + '</td></tr>';
    });
    h += '</table>';
    var p = show(h); bindX(p);
    p.querySelector('#dxfexp-log').onclick = function () { var t = B.R.log.concat(B.markLog).join('\n'); if (navigator.clipboard) navigator.clipboard.writeText(t); console.log(TAG + ' log lines=' + t.split('\n').length); };
    var dl = p.querySelector('#dxfexp-dl');
    if (dl) dl.onclick = function () {
      var enc = new TextEncoder(), names = Object.keys(B.marked).sort(), z = zip(names.map(function (n) { return { name: n, bytes: enc.encode(B.marked[n]) }; }));
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([z], { type: 'application/zip' })); a.download = B.prefix + '_2D_std.zip';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      console.log(TAG + ' downloaded ' + a.download + ' bytes=' + z.length + ' files=' + names.length);
    };
  }

  async function run(file) {
    if (!file) file = window.__lastIfcFile || null;
    if (!file) {   // no IFC opened in this session: pick one (no fallback download of anything else)
      file = await new Promise(function (res) {
        var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.ifc'; inp.onchange = function () { res(inp.files && inp.files[0] || null); }; inp.click();
      });
      if (!file) return null;
    }
    try { var B = await build(file, renderBusy); renderReport(B, file); return B; }
    catch (e) { console.error(TAG + ' ' + (e && e.stack || e)); var p = show(head + '<div style="color:#f59e0b">Could not read this IFC: ' + esc(e && e.message || e) + '</div>'); bindX(p); return null; }
  }
  window.DxfExportUI = { run: run, build: build, zip: zip, crc32: crc32, loadScripts: loadScripts, close: close };
})();
