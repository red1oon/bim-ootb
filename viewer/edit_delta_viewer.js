// edit_delta_viewer.js — §S8 Viewer half (P3 of CONNECT_SCENE_SPEC: the 'identity' subscriber) — bim-compiler
// prompts/TM_4D5D_VARIANCE_LANE.md §S8-SURFACES. ⚠ DO NOT REMOVE.
// A Modeller commit publishes Connect 'identity' {tip,length,edits:[{fid,guid}]}. This file (1) logs §CONNECT-ID-IN viewer,
// (2) re-reads the SHARED signed log (localStorage 'bonsai_model_v1' = a sql.js export of kernel_ops, the store
// Bonsai.oplog.reload() reads; `undone=0` rows only), (3) net-folds the edit ops (EditDelta.netEdits), (4) computes the Δ per edited
// guid with the ONE pure function (EditDelta.deltaForEdit over THIS page's building DB), and (5) exposes the one-line text to S7's
// hover label (hover_name.js) and a sibling #info-s8 block on the info panel. No rates here — everything is EditDelta + the owners.
(function (global) {
  'use strict';
  var STORE_KEY = 'bonsai_model_v1';   // default only — the Modeller names the real key (per building, e.g. 'mo_Duplex') in its identity payload
  var edits = {};          // guid -> {delta, line, tip}
  var lastTip = null;

  function _unb64(b64) { var bin = atob(b64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }

  async function _readSharedOps(key) {
    key = key || STORE_KEY;
    var s = null; try { s = localStorage.getItem(key); } catch (e) { }
    if (!s) { console.log('§S8-VIEWER store key=' + key + ' MISSING (IDB-only overflow store is not readable here)'); return { ops: [], reason: 'no-shared-store' }; }
    var SQL = global.APP && global.APP._SQL || await global.initSqlJs({ locateFile: function (f) { return 'lib/' + f; } });
    if (global.APP) global.APP._SQL = SQL;
    var db = new SQL.Database(_unb64(s));
    try {
      var tot = 0; try { tot = db.exec("SELECT COUNT(*) FROM kernel_ops")[0].values[0][0]; } catch (e) { tot = 'ERR ' + e.message; }
      console.log('§S8-VIEWER store key=' + key + ' b64len=' + s.length + ' kernelOpsRows=' + tot);
      var r = db.exec("SELECT id, op_type, parameters, op_hash FROM kernel_ops WHERE undone=0 AND op_type LIKE 'GEOM%' ORDER BY id");
      var ops = !r.length ? [] : r[0].values.map(function (v) { var p = JSON.parse(v[2]); return { id: v[0], op_type: v[1], parameters: p, parent: p.parent, op_hash: v[3] }; });
      return { ops: ops, tip: ops.length ? ops[ops.length - 1].op_hash : null };
    } finally { try { db.close(); } catch (e) { } }
  }

  async function onIdentity(id) {
    id = id || {};
    console.log('§CONNECT-ID-IN viewer tip=' + String(id.tip || '').slice(0, 12) + ' length=' + id.length + ' from=' + (id.surface || '?') + ' edits=' + ((id.edits || []).length));
    var A = global.A || global.APP, ED = global.EditDelta;
    if (!ED || !A || !A.db) { console.log('§S8-VIEWER skip reason=' + (!ED ? 'no-EditDelta' : 'no-db')); return; }
    var shared = await _readSharedOps(id.store);
    var net = ED.netEdits(shared.ops);
    var fidGuid = {}; (id.edits || []).forEach(function (e) { fidGuid[e.fid] = e.guid; });
    var env = ED.envFromGlobals(), seen = {};
    net.forEach(function (n, fid) {
      var guid = fidGuid[fid]; if (!guid) return;
      var d = ED.deltaForEdit(A.db, guid, n, env);
      if (!d) { console.log('§S8-VIEWER guid=' + guid + ' skip reason=no-record'); return; }
      seen[guid] = 1; edits[guid] = { delta: d, line: ED.line(d), tip: shared.tip };
      ED.logLine(d, 'viewer');
    });
    // a guid edited earlier but with no live net edit now (undone) -> Δ back to zero, said out loud
    Object.keys(edits).forEach(function (guid) {
      if (seen[guid]) return;
      var d = ED.deltaForEdit(A.db, guid, null, env); if (!d) return;
      edits[guid] = { delta: d, line: '', tip: shared.tip, undone: true }; ED.logLine(d, 'viewer');
    });
    lastTip = shared.tip;
    console.log('§S8-VIEWER applied tip=' + String(shared.tip || '').slice(0, 12) + ' sharedOps=' + shared.ops.length + ' editedGuids=' + Object.keys(seen).length);
    if (A.markDirty) A.markDirty();
  }

  function labelFor(guid) { var e = edits[guid]; return e && e.line ? e.line : null; }

  function renderInfo(A, guid) {
    var box = document.getElementById('info-s8');
    if (!box) { var anchor = document.getElementById('info-4d'); if (!anchor || !anchor.parentNode) return false;
      box = document.createElement('div'); box.id = 'info-s8'; box.style.cssText = 'display:none;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.12);font-size:11px';
      anchor.parentNode.insertBefore(box, anchor.nextSibling); }
    var e = edits[guid];
    if (!e || !e.line) { box.style.display = 'none'; return false; }
    box.innerHTML = '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:3px">Edit impact (from the Modeller)</div><div id="s8-line">' +
      String(e.line).replace(/</g, '&lt;') + '</div><div style="color:#888;font-size:10px;margin-top:2px">' + e.delta.labels.slice(-2).join(' · ').replace(/</g, '&lt;') + '</div>';
    box.style.display = 'block';
    var ip = document.getElementById('info-panel'); if (ip) ip.style.display = 'block';
    console.log('§S8-INFO guid=' + guid + ' shown=1');
    return true;
  }

  global.EditDeltaViewer = { onIdentity: onIdentity, labelFor: labelFor, renderInfo: renderInfo, _edits: edits };
  if (global.Connect && global.Connect.subscribe) global.Connect.subscribe('identity', onIdentity);
  else console.log('§S8-VIEWER not subscribed (window.Connect missing at load)');
})(typeof window !== 'undefined' ? window : globalThis);
