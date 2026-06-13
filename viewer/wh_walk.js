// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * wh_walk.js — SPATIAL PICKING §S-3/§S-4/§S-5: the warehouse pick WALK lens.
 *   Spec: docs/SPATIAL_PICKING_SPEC.md (bim-compiler) — Witnesses: W-WH-WALK / W-WH-SCAN / W-WH-COMPLETE.
 *
 * DUMB TERMINAL by construction (the pos_lens.js anti-fat-client rule): this file renders a strip,
 * flies the camera, and SENDS — the route is WHRoute.route (the §S-2 pure verb, wh_route.js == the
 * bim-compiler build/erp source of truth), the draft is ERPEngine.buildDoc from REAL seed rows, every
 * confirmed scan is ONE group through KernelOps.commitGroup, completion is AdDocFsm.dispatchFor, and
 * on-hand truth is the ERPEngine.qtyOnHand fold OF THE OP LOG. No inventory logic lives here.
 *
 * DATA-GATED (the pos-pill showWhen precedent): the pill lights ONLY when the loaded model carries
 * locator-GUID bins (m_bom_line BIN rows + IfcBuildingElementProxy bins whose guid == m_locator_id —
 * the §S-1 compile stamps both). Any other building → the pill stays off the bar; the code is inert.
 *
 * Depth model (FIND_LENS, navigate_find.js verbatim idiom): rest ghosted (x-ray dim 0.1) · current
 * RACK solid overlay · TARGET BIN bright (the _highlightGuids InstancedMesh material) + camera flown
 * to it (the §NAV_FIND_SELECT animFly easing).
 *
 * Scan (§S-4) reuses the W-QR-INPUT pattern (scripts/system_explorer.js:910-930): BarcodeDetector +
 * getUserMedia({facingMode:environment}) + rAF loop + HONEST typed-locator fallback. Wrong bin
 * REFUSES through ONE gate shared by camera and keyboard.
 */
'use strict';
(function () {
  var A = null;                 // window.APP, resolved at init poll
  var W = {                     // lens state
    gate: false, open: false, steps: [], idx: 0, doc: null, lines: [],
    erpDb: null, opDb: null, tree: null, names: {}, locVal: {}, done: [], flyAnim: null,
    binOverlay: null, rackOverlay: null, xrayWasOff: false, qr: { stream: null, raf: 0, scanning: false }
  };
  window.WHWalk = { _state: W };

  function log(s) { console.log('§WH ' + s); }

  // §C-6 audio feedback — affirmative warehouse actions only (bin confirm / qty confirm / skip). The ids
  // resolve from sfx.json ui_sounds (PRE-PINNED FACT 2: rows added there, NOT hardcoded synth here); an
  // absent id plays nothing (sfx.js _playRow guards !row). Real global is window.__sfx (sfx.js public API).
  var _SFX_ID = { confirm: 'wh_confirm', qty: 'wh_qty', skip: 'wh_skip' };
  function _sfx(event) {
    var id = _SFX_ID[event];
    var sfx = window.__sfx;
    var ok = !!(sfx && typeof sfx.play === 'function' && id);
    if (ok) { try { sfx.play(id); } catch (e) { ok = false; } }
    console.log('§WH_AUDIO event=' + event + ' sfx=' + (ok ? 'played' : 'absent'));
  }

  // ── data gate: locator-GUID bins present in the LOADED db (poll, the ghost-auto-trigger idiom) ──
  function gateNow() {
    if (!A || !A.db) return false;
    try {
      var b = A.dbQuery("SELECT COUNT(*) FROM m_bom_line WHERE role='BIN'");
      var e = A.dbQuery("SELECT COUNT(*) FROM elements_meta WHERE ifc_class='IfcBuildingElementProxy' AND guid GLOB '[0-9]*'");
      return b.length && Number(b[0][0]) > 0 && e.length && Number(e[0][0]) > 0;
    } catch (err) { return false; }
  }
  var _tries = 0, _poll = setInterval(function () {
    _tries++;
    A = window.APP || window.A;
    if (!A || !A.db) { if (_tries > 240) clearInterval(_poll); return; }
    clearInterval(_poll);
    W.gate = gateNow();
    var acts = window._mainPillActions || [];
    for (var i = 0; i < acts.length; i++) {
      if (acts[i].id === 'whwalk') acts[i].pill = W.gate ? undefined : false;
    }
    if (W.gate && A._buildPill) A._buildPill();
    log('PILL gate=' + (W.gate ? 'on' : 'off') + ' (locator-GUID bins ' + (W.gate ? 'present' : 'absent') + ')');
    if (W.gate) _autoEngage();
  }, 500);

  // §C-1 auto-engage: on a WH building load, start the walk without hunting for the pill. The pill stays
  // for manual close/reopen. Timing trap (PRE-PINNED FACT C-1): A.db exists before geometry streams, so the
  // first fly-to would be into an empty scene — DEFER until the bbox placeholders are cleared (A._bboxCleared,
  // the same render-gate signal poc_wh_walk_live waits on as §BBOX_CLEARED). When POS docs exist the auto-open
  // pops the source chooser — intended.
  function _autoEngage() {
    if (W._autoEngaged) return;
    var t = 0, p = setInterval(function () {
      t++;
      var ready = !!(A && (A._bboxCleared || (A.scene && A.scene.children && A.scene.children.length > 2)));
      if (!ready) { if (t > 120) { clearInterval(p); console.log('§WH_AUTOSTART gate=true open=skip (scene never readied in 60s)'); } return; }
      clearInterval(p);
      if (W.open || W._autoEngaged) return;
      W._autoEngaged = true;
      console.log('§WH_AUTOSTART gate=true open=auto');
      open();
    }, 500);
  }

  // ── lazy deps: engine UMDs + the ERP seed (never on the viewer's critical path) ──
  function loadScript(src) {
    return new Promise(function (ok, bad) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = function () { bad(new Error('load fail ' + src)); };
      document.head.appendChild(s);
    });
  }
  async function ensureDeps() {
    if (!window.ERPEngine) await loadScript('../erp/erp_engine.js?v=1');
    if (!window.AdDocFsm) await loadScript('../erp/ad_docfsm.js?v=1');
    // §S-2b POS-shipment route deps: BigDecimal BEFORE pos_core (its UMD factory reads root.BigDecimal)
    if (!window.BigDecimal) await loadScript('../erp/bigdecimal.js?v=1');
    if (!window.POSCore) await loadScript('../erp/pos_core.js?v=3');
    if (!window.InOutConfirm) await loadScript('../erp/inout_confirm.js?v=1');
    if (!W.erpDb) {
      var r = await fetch('../erp/ad_seed.db');
      if (!r.ok) throw new Error('ad_seed.db fetch ' + r.status);
      var buf = new Uint8Array(await r.arrayBuffer());
      W.erpDb = new A._SQL.Database(buf);
      log('SEED loaded bytes=' + buf.length);
    }
    if (!W.opDb) W.opDb = new A._SQL.Database();   // the walk's op log (kernel hash-chained)
  }
  // tiny b3-style shim over sql.js (lowercased keys — what AdDocFsm.dispatchFor expects)
  function b3(db) {
    function row(stmt, args) {
      var st = db.prepare(stmt); st.bind(args || []);
      var out = null;
      if (st.step()) { var o = st.getAsObject(), lo = {}; Object.keys(o).forEach(function (k) { lo[k.toLowerCase()] = o[k]; }); out = lo; }
      st.free(); return out;
    }
    function all(stmt, args) {
      var st = db.prepare(stmt); st.bind(args || []);
      var out = [];
      while (st.step()) { var o = st.getAsObject(), lo = {}; Object.keys(o).forEach(function (k) { lo[k.toLowerCase()] = o[k]; }); out.push(lo); }
      st.free(); return out;
    }
    return { prepare: function (sql) { return { get: function () { return row(sql, [].slice.call(arguments)); }, all: function () { return all(sql, [].slice.call(arguments)); } }; } };
  }

  // ── §S-2b: the POS-shipment route source (WH_POS_PICK_LANE W-2) ──
  // Implementing docs/SPATIAL_PICKING_SPEC.md §S-2b — Witness: W-WH-POS-PICK (headless) + live §-logs.
  // TWO honest sources, merged: (a) the static seed via the witnessed SQL; (b) the ERP page's
  // persisted op log — IDB bim_ootb_cache / store dbs / key idmp_kanban_proj (kanban_host.js
  // IDB/STORE + idempiere.html _KPROJ, EXTRACTED) — folded by the PURE WHRoute.openPosDocsFromOps.
  // A live sale exists ONLY as signed ops there; never faked into the seed. Cross-device = §P-5, out of scope.
  // open bim_ootb_cache at the CURRENT version. scene.js owns the schema at v2; a hardcoded
  // version 1 drifts BELOW it → VersionError → onerror → silent null (the exact bug
  // kernel_ops.js §KRN_PERSIST_FIX fixed for the persist path). Prefer the app's single opener.
  function _openCacheDB() {
    if (window.APP && APP.openCacheDB) return APP.openCacheDB();
    return new Promise(function (ok, bad) {
      var rq = indexedDB.open('bim_ootb_cache');   // no version → current
      rq.onsuccess = function () { ok(rq.result); };
      rq.onerror = function () { bad(rq.error); };
    });
  }

  function readPosSidecarDocs() {
    return _openCacheDB().then(function (idb) {
      if (!idb || !idb.objectStoreNames.contains('dbs')) { if (idb) idb.close(); return null; }
      return new Promise(function (ok) {
        var g = idb.transaction('dbs', 'readonly').objectStore('dbs').get('idmp_kanban_proj');
        g.onsuccess = function () { idb.close(); ok(g.result || null); };
        g.onerror = function () { idb.close(); ok(null); };
      });
    }).catch(function (e) { log('SIDECAR open fail: ' + (e && e.message)); return null; }).then(function (buf) {
      if (!buf || buf.byteLength < 100) return [];
      var sdb = null;
      try {
        sdb = new A._SQL.Database(new Uint8Array(buf));
        var r = sdb.exec('SELECT gid, parameters FROM kernel_ops ORDER BY id');
        var rows = (r[0] ? r[0].values : []).map(function (v) { return { gid: v[0], parameters: v[1] }; });
        return WHRoute.openPosDocsFromOps(rows);
      } catch (e) { log('SIDECAR read fail: ' + e.message); return []; }
      finally { try { if (sdb) sdb.close(); } catch (e) {} }
    });
  }
  function seedPosDocs() {   // the witnessed §S-2 selector SQL (poc_pos_deliverlater), static-seed source
    var q = b3(W.erpDb);
    return q.prepare("SELECT io.m_inout_id, io.docstatus, io.c_doctype_id, io.m_warehouse_id, io.ad_client_id, io.ad_org_id FROM m_inout io JOIN c_order o ON o.c_order_id=io.c_order_id WHERE io.docstatus IN ('DR','IP') AND o.c_pos_id IS NOT NULL").all()
      .map(function (d) {
        d.src = 'seed';
        d.lines = q.prepare('SELECT m_inoutline_id, m_product_id, movementqty FROM m_inoutline WHERE m_inout_id=' + Number(d.m_inout_id) + ' ORDER BY m_inoutline_id').all();
        return d;
      });
  }
  // minimal route-source chooser — shown ONLY when both sources are non-empty (the replenish draft
  // is always draftable + open POS docs exist); one source → walked directly, no decision trees.
  function chooseSource(posDocs) {
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.id = 'wh-src';
      ov.style.cssText = 'position:fixed;inset:0;z-index:1400;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(4,10,20,.93);color:#e3f2fd;font:14px system-ui;padding:16px;gap:10px';
      var title = document.createElement('div'); title.style.cssText = 'font-weight:600;margin-bottom:6px';
      title.textContent = 'Pick route source';
      ov.appendChild(title);
      function btn(label, val) {
        var b = document.createElement('button');
        b.style.cssText = 'background:#0b1c2c;color:#e3f2fd;border:1px solid #4fc3f7;border-radius:10px;padding:12px 16px;width:min(86vw,420px);font-size:14px;cursor:pointer';
        b.textContent = label;
        b.addEventListener('click', function () { document.body.removeChild(ov); resolve(val); });
        ov.appendChild(b);
      }
      posDocs.forEach(function (d) {
        btn('POS shipment ' + d.m_inout_id + ' — ' + d.lines.length + ' line(s) · ' +
            (d.src === 'oplog' ? 'live sale (op log)' : 'tenant seed') + ' · ' + d.docstatus, d);
      });
      btn('Replenish pick — draft from stock', null);
      document.body.appendChild(ov);
    });
  }
  // §S-2b bin resolution (EXTRACT rule): a shipment line carries NO locator — the pick bin is the
  // m_storageonhand row HOLDING the product (ORDER BY qtyonhand DESC, m_locator_id, deterministic).
  // No storage row → m_locator_id null → the route's explicit unroutable step (never invented).
  function draftFromPosDoc(d) {
    var q = b3(W.erpDb);
    W.lines = d.lines.map(function (l, i) {
      var s = q.prepare('SELECT m_locator_id AS loc FROM m_storageonhand WHERE m_product_id=? ORDER BY qtyonhand DESC, m_locator_id LIMIT 1').get(Number(l.m_product_id));
      return { line: (i + 1) * 10, m_inoutline_id: l.m_inoutline_id, m_product_id: l.m_product_id,
               qty: Number(l.movementqty), m_locator_id: s ? s.loc : null, m_locatorto_id: null };
    });
    W.doc = { kind: 'pos-inout', id: d.m_inout_id, docStatus: d.docstatus, doctypeId: d.c_doctype_id, src: d.src,
              adClientId: d.ad_client_id != null ? d.ad_client_id : null, adOrgId: d.ad_org_id != null ? d.ad_org_id : null };
    log('DRAFT pos-shipment m_inout=' + d.m_inout_id + ' (' + d.src + ') lines=' + W.lines.length +
      ' qty=[' + W.lines.map(function (l) { return l.qty; }).join(',') + '] bins=[' + W.lines.map(function (l) { return l.m_locator_id; }).join(',') + ']');
  }

  // ── §S-2 in the lens: drafted movement (seed first; else buildDoc from REAL rows) + route ──
  async function draftPick() {
    // §S-2b source merge first: open POS-generated shipments (seed SQL + sidecar op-log fold)
    var posDocs = seedPosDocs().concat(await readPosSidecarDocs());
    W._posDocs = posDocs;                                     // §C-5 remembered for the switch-source button data-gate
    if (ui.switchBtn) ui.switchBtn.style.display = posDocs.length ? '' : 'none';
    log('SRC pos-docs=' + posDocs.length +
      (posDocs.length ? ' [' + posDocs.map(function (d) { return d.m_inout_id + '(' + d.src + ')'; }).join(',') + ']' : ''));
    if (posDocs.length) {
      var pick = await chooseSource(posDocs);
      if (pick) { draftFromPosDoc(pick); return; }
    }
    var q = b3(W.erpDb);
    var dr = q.prepare("SELECT m_movement_id AS id FROM m_movement WHERE docstatus='DR' LIMIT 1").get();
    var seedLine = q.prepare('SELECT movementqty AS q FROM m_movementline WHERE m_movementline_id=100').get();
    var doctype = q.prepare("SELECT c_doctype_id AS id FROM c_doctype WHERE docbasetype='MMM'").get();
    var toLoc = q.prepare("SELECT m_locator_id AS id FROM m_locator WHERE value='HQ Transit'").get();
    if (dr) {
      // a drafted movement EXISTS in the tenant → walk it verbatim (no draft needed)
      W.lines = q.prepare('SELECT m_movementline_id, line, m_product_id, movementqty AS qty, m_locator_id, m_locatorto_id FROM m_movementline WHERE m_movement_id=' + dr.id + ' ORDER BY line').all();
      W.doc = { id: dr.id, docStatus: 'DR', doctypeId: doctype && doctype.id, drafted: false };
      log('DRAFT existing m_movement=' + dr.id + ' lines=' + W.lines.length);
      return Promise.resolve();
    }
    // §S-1 handoff: no drafted movement in GardenWorld → DRAFT via buildDoc from REAL rows.
    // qty rule (EXTRACTED): min(m_movementline 100 qty, qtyonhand) — never more than the bin holds.
    var rows = q.prepare(
      'SELECT m_product_id, m_locator_id, qtyonhand FROM m_storageonhand ' +
      'WHERE (m_locator_id=101 AND m_product_id IN (123,127)) OR (m_locator_id=102 AND m_product_id=123) ' +
      'ORDER BY m_locator_id, m_product_id').all();
    W.lines = rows.map(function (r, i) {
      return { line: (i + 1) * 10, m_product_id: r.m_product_id,
               qty: Math.min(seedLine.q, r.qtyonhand),
               m_locator_id: r.m_locator_id, m_locatorto_id: toLoc.id };
    });
    var parent = { m_warehouse_id: 103, c_doctype_id: doctype.id };
    var ops = WHRoute.decoratePickOps(ERPEngine.buildDoc(WHRoute.PICK_DOC_SPEC, parent, W.lines), W.lines)
      .map(function (o) { return { op_type: o.op_type, params: o }; });
    W.doc = { id: 'wh-pick-1', docStatus: 'DR', doctypeId: doctype.id, drafted: true };
    return KernelOps.commitGroup(W.opDb, ops, { gid: 'wh-pick-1-draft' }).then(function (g) {
      log('DRAFT doc=M_Movement DR doctype=' + doctype.id + ' lines=' + W.lines.length +
        ' qty=[' + W.lines.map(function (l) { return l.qty; }).join(',') + '] gid=' + g.gid + ' committed=' + g.committed);
    });
  }
  function buildRoute() {
    var rows = A.dbQuery('SELECT bom_id, child_product_id, role, ordinal, element_ref FROM m_bom_line');
    var bomLines = rows.map(function (r) { return { bom_id: r[0], child_product_id: r[1], role: r[2], ordinal: r[3], element_ref: r[4] }; });
    W.tree = WHRoute.treeFromBom(bomLines);
    W.steps = WHRoute.route(W.lines, W.tree);
    W.done = W.steps.map(function () { return null; });
    var q = b3(W.erpDb);
    W.steps.forEach(function (s) {
      if (!W.names[s.line.m_product_id]) {
        var p = q.prepare('SELECT name AS n FROM m_product WHERE m_product_id=' + Number(s.line.m_product_id)).get();
        W.names[s.line.m_product_id] = p ? p.n : ('#' + s.line.m_product_id);
      }
      if (!W.locVal[s.m_locator_id]) {
        var l = q.prepare('SELECT value AS v FROM m_locator WHERE m_locator_id=' + Number(s.m_locator_id)).get();
        W.locVal[s.m_locator_id] = l ? l.v : s.m_locator_id;
      }
    });
    log('ROUTE steps=' + W.steps.length + ' order=[' + W.steps.map(function (s) { return s.m_locator_id; }).join(',') + ']' +
      ' unroutable=' + W.steps.filter(function (s) { return s.unroutable; }).length);
  }

  // ── FIND-lens depth: ghost rest 0.1, rack solid overlay, bin bright + fly (navigate_find idiom) ──
  function _aabb(guid) {
    var r = A.dbQueryFirst('SELECT center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms WHERE guid=?', [String(guid)]);
    return r && { c: A.ifc2three(r[0], r[1], r[2]), sx: Math.max(r[3] || 0.05, 0.05), sy: Math.max(r[5] || 0.05, 0.05), sz: Math.max(r[4] || 0.05, 0.05), raw: r };
  }
  function _box(guid, color, opacity) {
    var b = _aabb(guid);
    if (!b || typeof THREE === 'undefined') return null;
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.set(b.c.x, b.c.y, b.c.z);
    mesh.scale.set(b.sx, b.sy, b.sz);             // IFC bbox → Three: X→X, Z→Y, Y→Z (picking.js parity)
    mesh.renderOrder = 999; mesh.userData._hlOverlay = true;
    A.scene.add(mesh);
    return mesh;
  }
  function _clearDepth() {
    [W.binOverlay, W.rackOverlay].forEach(function (m) {
      if (m) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }
    });
    W.binOverlay = W.rackOverlay = null;
  }
  function _dimAll(op) {       // navigate_find _dimXrayTo idiom (scene branch — warehouse is small)
    var n = 0;
    A.scene.traverse(function (o) {
      if (o.isMesh && o.material && !(o.userData && o.userData._hlOverlay)) {
        o.material.transparent = true; o.material.opacity = op; o.material.needsUpdate = true; n++;
      }
    });
    console.log('§WH_XRAY_DIM opacity=' + op + ' mats=scene:' + n);
    if (A.markDirty) A.markDirty();
  }
  function focusStep(s, onDone) {
    _clearDepth();
    if (!A.xrayOn && A.toggleXray) { A.toggleXray(); W.xrayWasOff = true; }
    _dimAll(0.1);                                            // rest = 0.1 ghost (depth model)
    if (s.rack) W.rackOverlay = _box(s.rack, 0x90a4ae, 0.25);   // current rack = solid-ish group
    W.binOverlay = _box(s.m_locator_id, 0x4fc3f7, 0.55);        // target bin = bright (the _highlightGuids material)
    var b = _aabb(s.m_locator_id);
    if (!b) { log('step=' + s.step + '/' + s.of + ' locator=' + s.m_locator_id + ' fly=skip lit=0 (no transform)'); if (onDone) onDone(); return; }
    // §C-fix-2: frame the UNION AABB of all route bins so the picker sees the whole layout
    var allBins = W.steps.map(function (st) { return _aabb(st.m_locator_id); }).filter(Boolean);
    var center, dist;
    if (allBins.length <= 1) {
      center = new THREE.Vector3(b.c.x, b.c.y, b.c.z);
      dist = Math.max(b.sx, b.sy, b.sz) * 4 + 0.5;
    } else {
      var minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      allBins.forEach(function (bb) {
        minX = Math.min(minX, bb.c.x - bb.sx / 2); maxX = Math.max(maxX, bb.c.x + bb.sx / 2);
        minY = Math.min(minY, bb.c.y - bb.sy / 2); maxY = Math.max(maxY, bb.c.y + bb.sy / 2);
        minZ = Math.min(minZ, bb.c.z - bb.sz / 2); maxZ = Math.max(maxZ, bb.c.z + bb.sz / 2);
      });
      var ux = maxX - minX, uy = maxY - minY, uz = maxZ - minZ;
      center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      var fovRad = ((A.camera && A.camera.fov) || 75) * Math.PI / 180;
      var halfDiag = Math.sqrt(ux * ux + uy * uy + uz * uz) / 2;
      dist = halfDiag / Math.tan(fovRad / 2) * 1.3;          // FOV-based fit, 1.3× margin
    }
    var camDir = A.camera.position.clone().sub(A.controls.target).normalize();
    var end = center.clone().add(camDir.multiplyScalar(Math.max(dist, 6)));
    console.log('§WH_ZOOM fit=whole bins=' + allBins.length + ' dist=' + Math.max(dist, 6).toFixed(1));
    var sp = A.camera.position.clone(), st = A.controls.target.clone(), t = 0;
    if (W.flyAnim) cancelAnimationFrame(W.flyAnim);
    (function fly() {
      t += 0.04; if (t > 1) t = 1;
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      A.camera.position.lerpVectors(sp, end, e);
      A.controls.target.lerpVectors(st, center, e);
      A.controls.update(); if (A.markDirty) A.markDirty();
      if (t < 1) { W.flyAnim = requestAnimationFrame(fly); }
      else {
        W.flyAnim = null;
        log('step=' + s.step + '/' + s.of + ' locator=' + s.m_locator_id + ' fly=done lit=' + (W.binOverlay ? 1 : 0));
        if (onDone) onDone();
      }
    })();
  }

  // ── strip UI (phone-first; minimal DOM, no framework) ──
  var ui = {};
  function ensureUI() {
    if (ui.strip) return;
    var st = document.createElement('div');
    st.id = 'wh-strip';
    st.style.cssText = 'position:fixed;left:8px;right:8px;bottom:64px;z-index:1200;display:flex;gap:8px;align-items:center;' +
      'background:rgba(16,24,40,.92);color:#e3f2fd;border:1px solid #4fc3f7;border-radius:12px;padding:10px 12px;' +
      'font:13px system-ui;backdrop-filter:blur(6px)';
    // §C-5 ↺ switch-source — Lucide rotateCcw from the panels.js ICONS map (verbatim), beside ⌂. Data-gated:
    // hidden until draftPick learns posDocs>0 (absent, not greyed). Tap re-chooses the POS source mid-walk.
    var rotIc = (window.ICONS && window.ICONS.rotateCcw) ? window.ICONS.rotateCcw.svg : '';
    st.innerHTML = '<button id="wh-home" title="Home" style="background:none;color:#90caf9;border:0;font-size:18px;line-height:1;cursor:pointer">⌂</button>' +
      '<button id="wh-switch" title="Switch source" style="display:none;background:none;color:#90caf9;border:0;cursor:pointer;padding:0;line-height:0">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + rotIc + '</svg></button>' +
      '<div id="wh-step" style="flex:1;min-width:0"></div>' +
      '<button id="wh-scan-btn" style="background:#4fc3f7;color:#06263a;border:0;border-radius:8px;padding:8px 12px;font-weight:600">Confirm bin</button>' +
      '<button id="wh-close" title="Exit walk (back to view)" style="background:none;color:#90a4ae;border:0;font-size:16px;cursor:pointer">✕</button>';
    document.body.appendChild(st);
    ui.strip = st; ui.step = st.querySelector('#wh-step');

    // §C-4 route-list drawer — sits ABOVE the strip; collapsed by default, auto-expands once at walk start.
    var rd = document.createElement('div');
    rd.id = 'wh-route-drawer';
    rd.style.cssText = 'position:fixed;left:8px;right:8px;bottom:120px;z-index:1200;display:none;flex-direction:column;' +
      'background:rgba(16,24,40,.92);color:#e3f2fd;border:1px solid #4fc3f7;border-radius:12px;padding:8px 10px;' +
      'font:13px system-ui;backdrop-filter:blur(6px);max-height:38vh;overflow:hidden';
    rd.innerHTML = '<div id="wh-route-hdr" style="cursor:pointer;font-weight:600;color:#90caf9;padding:2px 0;user-select:none"></div>' +
      '<div id="wh-route-list" style="display:none;overflow-y:auto;margin-top:6px"></div>';
    document.body.appendChild(rd);
    ui.routeDrawer = rd; ui.routeHdr = rd.querySelector('#wh-route-hdr'); ui.routeList = rd.querySelector('#wh-route-list');
    ui.routeOpen = false;
    ui.routeHdr.addEventListener('click', function () { toggleRouteDrawer(); });

    ui.switchBtn = st.querySelector('#wh-switch');
    ui.switchBtn.addEventListener('click', function () { window.WHWalk.switchSource(); });
    st.querySelector('#wh-close').addEventListener('click', close);
    st.querySelector('#wh-scan-btn').addEventListener('click', function () { openScan(false); });
    // ⌂ home — one tap back to the opener (?home=, e.g. iDempiere) or the bubbles landing.
    // Browser-back walks the whole nav stack down to the landing; this is the single-hop escape.
    st.querySelector('#wh-home').addEventListener('click', function () {
      var dest = (A && A.HOME_URL) || '../index.html';
      log('HOME nav=' + dest);
      location.href = dest;
    });
    // long-press on the strip = skip-with-reason (§S-3 exception trail)
    var hold = null;
    ui.step.addEventListener('pointerdown', function () { hold = setTimeout(function () { hold = null; skipPrompt(); }, 550); });
    ['pointerup', 'pointerleave'].forEach(function (ev) { ui.step.addEventListener(ev, function () { if (hold) { clearTimeout(hold); hold = null; } }); });
    // scan screen (camera + typed fallback), W-QR-INPUT layout
    var sc = document.createElement('div');
    sc.id = 'wh-scan';
    sc.style.cssText = 'position:fixed;inset:0;z-index:1300;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(4,10,20,.93);color:#e3f2fd;font:14px system-ui;padding:16px';
    sc.innerHTML = '<div id="wh-scan-title" style="margin-bottom:10px;font-weight:600;text-align:center"></div>' +
      // §S-4b manual confirm — the obvious DIY / desktop / no-camera act: you are standing at the
      // LIT target bin, so vouch for it. Feeds the EXPECTED locator through the SAME gate (via=manual);
      // wrong-bin protection still lives in the 3D tap path (onPick refuses a non-target bin).
      '<button id="wh-manual" style="background:#66bb6a;color:#06263a;border:0;border-radius:10px;padding:14px 18px;font-weight:700;font-size:15px;width:min(86vw,420px)">✓ I\'m at this bin — confirm</button>' +
      '<div style="margin:12px 0;color:#607d8b;font-size:12px">— or scan its QR / type the code —</div>' +
      '<video id="wh-vid" playsinline style="width:min(86vw,420px);border-radius:12px;background:#000"></video>' +
      '<div id="wh-scan-status" style="margin:10px 0;min-height:20px;text-align:center"></div>' +
      '<div style="display:flex;gap:8px;align-items:center"><input id="wh-typed" inputmode="numeric" placeholder="type locator code" ' +
      'style="background:#0b1c2c;color:#e3f2fd;border:1px solid #4fc3f7;border-radius:8px;padding:8px 10px;width:160px">' +
      '<button id="wh-typed-go" style="background:#4fc3f7;color:#06263a;border:0;border-radius:8px;padding:8px 12px;font-weight:600">Enter</button></div>' +
      '<div id="wh-qty" style="display:none;margin-top:14px;align-items:center;gap:10px">' +
      '<button id="wh-qty-minus" style="width:40px;height:40px;border-radius:8px;border:1px solid #4fc3f7;background:none;color:#4fc3f7;font-size:18px">−</button>' +
      '<span id="wh-qty-val" style="font-size:22px;font-weight:700;min-width:42px;text-align:center"></span>' +
      '<button id="wh-qty-plus" style="width:40px;height:40px;border-radius:8px;border:1px solid #4fc3f7;background:none;color:#4fc3f7;font-size:18px">+</button>' +
      '<button id="wh-qty-ok" style="background:#66bb6a;color:#06263a;border:0;border-radius:8px;padding:10px 16px;font-weight:700">Confirm pick</button></div>' +
      '<button id="wh-scan-close" style="margin-top:16px;background:none;color:#90a4ae;border:1px solid #455a64;border-radius:8px;padding:6px 14px">close</button>';
    document.body.appendChild(sc);
    ui.scan = sc; ui.vid = sc.querySelector('#wh-vid'); ui.scanStatus = sc.querySelector('#wh-scan-status');
    ui.qtyRow = sc.querySelector('#wh-qty'); ui.qtyVal = sc.querySelector('#wh-qty-val');
    sc.querySelector('#wh-scan-close').addEventListener('click', closeScan);
    sc.querySelector('#wh-manual').addEventListener('click', function () { window.WHWalk.confirmHere(); });
    sc.querySelector('#wh-typed-go').addEventListener('click', function () {
      var v = sc.querySelector('#wh-typed').value;
      window.WHWalk.scanInput(v, 'typed');
    });
    sc.querySelector('#wh-qty-minus').addEventListener('click', function () { stepQty(-1); });
    sc.querySelector('#wh-qty-plus').addEventListener('click', function () { stepQty(1); });
    sc.querySelector('#wh-qty-ok').addEventListener('click', function () { window.WHWalk.confirmQty(); });
  }
  function renderStrip() {
    var open = W.steps.filter(function (s, i) { return !W.done[i]; });
    if (!open.length) { ui.step.innerHTML = '<b>Walk complete</b> — completing document…'; renderRouteDrawer(); return; }
    var s = currentStep();
    ui.step.innerHTML = '<b>step ' + s.step + '/' + s.of + '</b> · ' + (W.names[s.line.m_product_id] || s.line.m_product_id) +
      ' · qty ' + s.line.qty + '<br><span style="color:#90caf9">' + (W.locVal[s.m_locator_id] || '') + ' (bin ' + s.m_locator_id + ')' +
      (s.unroutable ? ' · <span style="color:#ffb74d">UNROUTABLE — off-model bin</span>' : '') + '</span>' +
      '<span style="color:#607d8b"> · long-press = skip</span>';
    renderRouteDrawer();
  }
  function currentStep() { return W.steps[W.idx]; }

  // §C-4 route-list drawer — header (always) + rows (only when expanded). Current step '→' + green bg, done ✓ dimmed.
  function doneCount() { var n = 0; for (var i = 0; i < W.steps.length; i++) if (W.done[i]) n++; return n; }
  function renderRouteDrawer() {
    if (!ui.routeDrawer) return;
    if (!W.steps.length) { ui.routeDrawer.style.display = 'none'; return; }
    ui.routeDrawer.style.display = 'flex';
    var done = doneCount(), remaining = W.steps.length - done;
    ui.routeHdr.textContent = (ui.routeOpen ? '▾' : '▸') + ' Movement (' + W.steps.length + ' steps, ' + remaining + ' remaining)';
    if (!ui.routeOpen) { ui.routeList.style.display = 'none'; return; }
    ui.routeList.style.display = '';
    ui.routeList.innerHTML = W.steps.map(function (s, i) {
      var d = W.done[i];
      var isCur = (i === W.idx) && !d;
      var mark = d ? (d.skipped ? '⊘' : '✓') : (isCur ? '→' : '[ ]');
      var prod = W.names[s.line.m_product_id] || s.line.m_product_id;
      var binVal = W.locVal[s.m_locator_id] || ('bin ' + s.m_locator_id);
      var bg = isCur ? 'background:#1d4a2e;' : '';
      var col = d ? 'color:#607d8b;' : 'color:#e3f2fd;';
      return '<div style="display:flex;gap:8px;padding:4px 6px;border-radius:6px;' + bg + col + '">' +
        '<span style="width:16px;flex-shrink:0;color:' + (isCur ? '#4fc3f7' : 'inherit') + '">' + mark + '</span>' +
        '<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
          binVal + ' – ' + s.line.qty + '× ' + prod + '</span></div>';
    }).join('');
  }
  function toggleRouteDrawer() {
    ui.routeOpen = !ui.routeOpen;
    renderRouteDrawer();
    console.log('§WH_ROUTE_DRAWER open=' + ui.routeOpen + ' steps=' + W.steps.length + ' done=' + doneCount());
  }

  // ── walk advance / skip ──
  function advance() {
    while (W.idx < W.steps.length && W.done[W.idx]) W.idx++;
    if (W.idx >= W.steps.length) { complete(); return; }
    renderStrip();
    focusStep(currentStep());
  }
  function skipPrompt() {
    var reason = window.prompt('Skip step ' + currentStep().step + ' — reason?', '');
    if (reason == null || !String(reason).trim()) { log('SKIP aborted (no reason)'); return; }
    window.WHWalk.skip(String(reason).trim());
  }

  // tap-gate (§S-3 falsifier): picking.js forwards every resolved pick here.
  // Target bin tap → scan screen. NON-target tap → logged refusal, step does NOT advance.
  window.WHWalk.onPick = function (guid) {
    if (!W.open || !W.steps.length || W.idx >= W.steps.length) return;
    var s = currentStep();
    if (String(guid) === String(s.m_locator_id)) { log('TAP bin=' + guid + ' target=Y → scan'); openScan(true); }
    else log('TAP bin=' + guid + ' target=N step-held=' + s.step + '/' + s.of + ' (no advance)');
  };

  // §S-4b manual confirm — vouch you are at the LIT target bin (no camera/code needed). Routes the
  // EXPECTED locator through the SAME scanInput gate (always MATCH here by construction), logged
  // via=manual so the trail shows it was operator-vouched, not scanned. The signed op group, the
  // qty confirm, and the fold are byte-identical to the QR path — nothing about the engine changes.
  window.WHWalk.confirmHere = function () {
    if (!W.open || !W.steps.length || W.idx >= W.steps.length) return false;
    return window.WHWalk.scanInput(String(currentStep().m_locator_id), 'manual');
  };

  // ── §S-4 scan: ONE gate for camera QR and typed code ──
  function openScan(fromTap) {
    var s = currentStep();
    ui.scan.style.display = 'flex';
    ui.qtyRow.style.display = 'none';
    ui.scan.querySelector('#wh-scan-title').textContent =
      'Scan bin ' + (W.locVal[s.m_locator_id] || s.m_locator_id) + ' — ' + (W.names[s.line.m_product_id] || '') + ' × ' + s.line.qty;
    ui.scanStatus.textContent = '';
    startQr();
  }
  function qrSupported() { return ('BarcodeDetector' in window) && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  function startQr() {
    if (!qrSupported()) {
      ui.scanStatus.innerHTML = 'QR scan not supported on this browser — <b>type the locator code instead</b> (same gate, lower tech).';
      log('QR supported=N (honest fallback shown)');
      return;
    }
    var det; try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { det = null; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
      W.qr.stream = stream; ui.vid.srcObject = stream; ui.vid.play && ui.vid.play();
      W.qr.scanning = true;
      log('QR supported=Y scanning=Y');
      (function tick() {
        if (!W.qr.scanning || !det) return;
        det.detect(ui.vid).then(function (codes) {
          if (codes && codes.length) window.WHWalk.scanInput(codes[0].rawValue || '', 'qr');
          if (W.qr.scanning) W.qr.raf = requestAnimationFrame(tick);
        }).catch(function () { if (W.qr.scanning) W.qr.raf = requestAnimationFrame(tick); });
      })();
    }).catch(function (err) {
      ui.scanStatus.innerHTML = 'camera unavailable (' + (err && err.name || 'denied') + ') — type the locator code instead.';
      log('QR supported=Y camera=denied (typed fallback live)');
    });
  }
  function stopQr() {
    W.qr.scanning = false;
    if (W.qr.raf) { cancelAnimationFrame(W.qr.raf); W.qr.raf = 0; }
    try { if (W.qr.stream) W.qr.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    W.qr.stream = null; if (ui.vid) ui.vid.srcObject = null;
  }
  function closeScan() { stopQr(); ui.scan.style.display = 'none'; }

  var _pendingQty = 0;
  // THE gate (camera + typed land here — §FALSIFIER: same refuse/commit path). Payload = the bin's
  // printed m_locator_id (optionally 'WH:<id>'); anything else vs the expected locator REFUSES.
  window.WHWalk.scanInput = function (raw, via) {
    if (!W.open || W.idx >= W.steps.length) return false;
    var s = currentStep();
    var code = String(raw == null ? '' : raw).trim().replace(/^WH:/i, '');
    if (code !== String(s.m_locator_id)) {
      ui.scanStatus.innerHTML = '<span style="color:#ef9a9a">✗ wrong bin — scanned ' + code + ', expected ' +
        s.m_locator_id + ' (' + (W.locVal[s.m_locator_id] || '') + ')</span>';
      log('scan=' + code + ' expected=' + s.m_locator_id + ' via=' + via + ' REFUSED');
      return false;
    }
    stopQr();
    _pendingQty = Number(s.line.qty);
    ui.qtyVal.textContent = _pendingQty;
    ui.qtyRow.style.display = 'flex';
    ui.scanStatus.innerHTML = '<span style="color:#a5d6a7">✓ bin ' + code + ' confirmed (' + via + ') — confirm qty</span>';
    log('scan=' + code + ' expected=' + s.m_locator_id + ' via=' + via + ' MATCH qtyDefault=' + _pendingQty);
    _sfx('confirm');                                          // §C-6 bin-confirm earcon (MATCH path only)
    return true;
  };
  function stepQty(d) {
    var s = currentStep();
    _pendingQty = Math.min(Number(s.line.qty), Math.max(1, _pendingQty + d));   // short-pick allowed, never over-pick
    ui.qtyVal.textContent = _pendingQty;
  }

  // confirmed qty → ONE signed op group enacting the line on the qty spine (kernel commitGroup)
  window.WHWalk.confirmQty = async function () {
    var s = currentStep();
    var qty = _pendingQty;
    // §S-2b: on a POS-shipment route the per-step act is an ANNOTATE trail only — the oracle puts
    // the storage update AT completion (MInOut.completeIt below the gate; on-hand moves at the
    // pick-COMPLETE, W-POS-DELIVERLATER). M± per-step enact stays the M_Movement route's shape.
    var ops = (W.doc.kind === 'pos-inout')
      ? [{ op_type: 'ANNOTATE', params: { op_type: 'ANNOTATE', table: 'M_InOutLine', note: 'PICK_CONFIRM', m_inoutline_id: s.line.m_inoutline_id, m_product_id: s.line.m_product_id, m_locator_id: s.m_locator_id, qty: qty } }]
      : WHRoute.enactOps(s, qty).map(function (o) { return { op_type: o.op_type, params: o }; });
    var gidBase = (W.doc.kind === 'pos-inout') ? 'wh-pos-' + W.doc.id : 'wh-pick-1';
    var gid = gidBase + '-step' + s.step + '-loc' + s.m_locator_id;              // deterministic, idempotent
    var g = await KernelOps.commitGroup(W.opDb, ops, { gid: gid });
    var chain = await KernelOps.verifyChain(W.opDb);
    var short = qty < Number(s.line.qty);
    W.done[W.idx] = { qty: qty, gid: g.gid, short: short };
    log('PICK step=' + s.step + '/' + s.of + ' locator=' + s.m_locator_id + ' qty=' + qty +
      (short ? ' SHORT (remainder ' + (Number(s.line.qty) - qty) + ' stays open on the doc)' : '') +
      ' gid=' + g.gid + ' ops=' + g.ids.length + ' committed=' + g.committed + ' chainOk=' + (chain.ok ? 'Y' : 'N'));
    _sfx('qty');                                              // §C-6 qty confirm earcon (affirmative action)
    closeScan();
    W.idx++;
    advance();
  };

  // skip-with-reason = op ANNOTATION on the log (the exception trail), step closed as skipped
  window.WHWalk.skip = async function (reason) {
    var s = currentStep();
    var g = await KernelOps.commitGroup(W.opDb,
      [{ op_type: 'ANNOTATE', params: { op_type: 'ANNOTATE', table: 'M_MovementLine', note: 'SKIP', reason: reason, step: s.step, m_locator_id: s.m_locator_id, m_product_id: s.line.m_product_id } }],
      { gid: 'wh-pick-1-skip' + s.step });
    W.done[W.idx] = { qty: 0, gid: g.gid, skipped: true, reason: reason };
    log('SKIP step=' + s.step + '/' + s.of + ' locator=' + s.m_locator_id + ' reason="' + reason + '" gid=' + g.gid + ' (annotation op)');
    _sfx('skip');                                             // §C-6 skip earcon
    W.idx++;
    advance();
  };

  // §C-5 switch source mid-walk — re-choose the POS shipment to pick, rebuilding the route from step 0.
  // An in-progress walk's confirmed steps are SIGNED in the op log (never unwound by switching); the
  // REMAINDER of the current route is abandoned — logged honestly, never silently dropped.
  window.WHWalk.switchSource = async function () {
    if (!W.open) return;
    var posDocs = seedPosDocs().concat(await readPosSidecarDocs());
    if (!posDocs.length) { log('SOURCE_SWITCH posDocs=0 (none to switch to)'); return; }
    var abandoned = 0;
    for (var i = W.idx; i < W.steps.length; i++) if (!W.done[i]) abandoned++;
    var pick = await chooseSource(posDocs);
    if (!pick) { log('SOURCE_SWITCH cancelled (chooser dismissed)'); return; }
    log('SOURCE_SWITCH abandoned=' + abandoned + ' steps (signed picks stay on the log)');
    draftFromPosDoc(pick);
    buildRoute();
    W.idx = 0;
    if (ui.switchBtn) ui.switchBtn.style.display = posDocs.length ? '' : 'none';
    console.log('§WH_SOURCE_SWITCH posDocs=' + posDocs.length + ' selected=' + W.doc.id);
    advance();
  };

  // ── §S-2b W-3: POS-shipment completion — the ENGINE's act, not M_Movement-style CO ──
  // Implementing docs/SPATIAL_PICKING_SPEC.md §S-2b — proven headless in W-WH-POS-PICK.
  // Plain doctype (seed 120) → POSCore.completeShipmentOps (UPDATE_LINE short-picks + SET_STATUS CO,
  // ONE group). Confirm-demanding doctype (148/147) → the W-WH-CONFIRM sequence: spawn → confirm
  // (confirmedqty = the walked PICKED qty) → gate re-check → the bare SET_STATUS CO.
  async function completePos() {
    renderStrip();
    var q = b3(W.erpDb);
    var dt = q.prepare('SELECT * FROM c_doctype WHERE c_doctype_id=?').get(Number(W.doc.doctypeId)) || {};
    var pickedByLine = {};
    W.steps.forEach(function (s, i) {
      var d = W.done[i];
      pickedByLine[s.line.line] = (d && !d.skipped && d.qty) ? d.qty : 0;
    });
    var ioLines = W.lines.map(function (l) { return { m_inoutline_id: l.m_inoutline_id, m_product_id: l.m_product_id, movementqty: l.qty }; });
    function pickedQtyOf(i) { return pickedByLine[W.lines[i].line]; }
    var inout = { m_inout_id: W.doc.id, docstatus: W.doc.docStatus };
    var gidBase = 'wh-pos-' + W.doc.id;
    var written = [];   // [{gid, ops}] — every group also WRITES BACK to the shared ledger blob (§S-2b)
    var r = POSCore.completeShipmentOps(inout, ioLines, dt, { pickedQtyOf: pickedQtyOf });
    var movements, via;
    if (r.ok) {
      via = 'completeShipmentOps(' + W.doc.doctypeId + ')';
      movements = r.movements;
      var g1 = await KernelOps.commitGroup(W.opDb, r.ops.map(function (o) { return { op_type: o.op_type, params: o }; }), { gid: gidBase + '-complete' });
      written.push({ gid: gidBase + '-complete', ops: r.ops });
      log('PICK-COMPLETE group gid=' + g1.gid + ' ops=' + (g1.ids ? g1.ids.length : 0) + ' committed=' + g1.committed);
    } else if (r.reason === 'confirm-gated') {
      // the W-WH-CONFIRM fold, live: deterministic ids off the walk's own op log (nextIds discipline)
      via = 'confirm-gate(' + W.doc.doctypeId + ')';
      var nR = W.opDb.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='CREATE_DOCUMENT'");
      var cid = 970000 + (((nR[0] && Number(nR[0].values[0][0])) || 0) * 10) + 1;
      // client/org from the shipment row when the source carries it (seed); op-log docs inherit the
      // tenant context from the doctype row (same tenant — the ops themselves carry no client/org)
      var inoutFull = { m_inout_id: W.doc.id, c_doctype_id: W.doc.doctypeId, issotrx: 'Y', docstatus: W.doc.docStatus,
                        ref_inout_id: null,
                        ad_client_id: W.doc.adClientId != null ? W.doc.adClientId : dt.ad_client_id,
                        ad_org_id: W.doc.adOrgId != null ? W.doc.adOrgId : dt.ad_org_id };
      var spawn = InOutConfirm.createConfirmationOps(inoutFull, ioLines, dt, [], { confirmId: cid, lineIdOf: function (i) { return cid + 10 + i; } });
      await KernelOps.commitGroup(W.opDb, spawn.map(function (o) { return { op_type: o.op_type, params: o }; }), { gid: gidBase + '-confirm-spawn' });
      written.push({ gid: gidBase + '-confirm-spawn', ops: spawn });
      var clines = ioLines.map(function (l, i) {
        return { m_inoutlineconfirm_id: cid + 10 + i, m_inoutline_id: l.m_inoutline_id, m_product_id: l.m_product_id,
                 targetqty: l.movementqty, confirmedqty: pickedQtyOf(i), scrappedqty: 0 };
      });
      var doneOps = InOutConfirm.completeConfirmOps({ m_inoutconfirm_id: cid, confirmtype: spawn[0].confirmtype, processed: 'N' }, clines, inoutFull, dt, {});
      if (!doneOps.ok) { log('PICK-COMPLETE REFUSED confirm reason=' + doneOps.reason); return; }
      await KernelOps.commitGroup(W.opDb, doneOps.ops.map(function (o) { return { op_type: o.op_type, params: o }; }), { gid: gidBase + '-confirm-done' });
      written.push({ gid: gidBase + '-confirm-done', ops: doneOps.ops });
      var gate = InOutConfirm.completeInOutGate([{ m_inoutconfirm_id: cid, confirmtype: spawn[0].confirmtype, processed: 'Y' }]);
      if (!gate.ok) { log('PICK-COMPLETE GATE still open: ' + JSON.stringify(gate.open)); return; }
      var coOp = { op_type: 'SET_STATUS', table: 'M_InOut', id: W.doc.id, doc_status: 'CO', via: 'completeInOutGate→CO' };
      await KernelOps.commitGroup(W.opDb, [{ op_type: 'SET_STATUS', params: coOp }], { gid: gidBase + '-complete' });
      written.push({ gid: gidBase + '-complete', ops: [coOp] });
      movements = ioLines.map(function (l, i) { return { m_product_id: l.m_product_id, movementtype: 'C-', movementqty: pickedQtyOf(i) }; });
      log('PICK-COMPLETE confirm-fold cid=' + cid + ' type=' + spawn[0].confirmtype + ' confirmed=picked');
    } else {
      log('PICK-COMPLETE REFUSED reason=' + r.reason);
      ui.step.innerHTML = '<b>Cannot complete</b> — ' + r.reason;
      return;
    }
    W.doc.docStatus = 'CO';
    // the fold: on-hand moves by the PICKED qty (C- per product) — diff vs the walked confirmations
    var fold = ERPEngine.qtyOnHand(movements, {
      keyOf: function (e) { return e.m_product_id; },
      typeOf: function (e) { return e.movementtype; },
      absQtyOf: function (e) { return Math.abs(Number(e.movementqty)); }
    });
    var exp = {}, asked = 0, picked = 0;
    W.lines.forEach(function (l, i) { exp[l.m_product_id] = (exp[l.m_product_id] || 0) - pickedQtyOf(i); asked += l.qty; picked += pickedQtyOf(i); });
    var keys = Object.keys(exp).sort(), diffs = 0;
    keys.forEach(function (k) { if ((fold[k] || 0) !== exp[k]) { diffs++; log('FOLD MISMATCH ' + k + ' fold=' + fold[k] + ' expected=' + exp[k]); } });
    var chain = await KernelOps.verifyChain(W.opDb);
    log('PICK-COMPLETE inout=' + W.doc.id + ' CO via=' + via + ' picked=' + picked + '/' + asked +
      ' foldKeys=' + keys.length + ' diffs=' + diffs + ' chainOk=' + (chain.ok ? 'Y' : 'N'));
    await writebackToSidecar(written);
    ui.step.innerHTML = '<b>Walk complete ✓</b> — Shipment ' + W.doc.id + ' CO, on-hand moved by picked qty (' +
      keys.length + ' product(s), ' + (diffs === 0 ? 'all match' : diffs + ' MISMATCH') + ')';
  }

  // §S-2b completion WRITE-BACK — one ledger, not a private log: the completion (and confirm) groups
  // are RE-COMMITTED into the ERP page's persisted op-log blob under the SAME deterministic gids
  // (commitGroup gid-idempotency = replay-safe) and the blob is persisted back. Without this the
  // shipment stays DR in the shared ledger and the selector would re-offer a picked doc (double-pick
  // door). Seed-source docs carry no live blob → named skip. Races vs the ERP page = §P-5, out of scope.
  async function writebackToSidecar(written) {
    if (W.doc.src !== 'oplog') { log('SIDECAR-WRITEBACK skip src=' + W.doc.src + ' (no live ledger blob — walk-local completion)'); return; }
    try {
      var buf = await _openCacheDB().then(function (idb) {
        if (!idb || !idb.objectStoreNames.contains('dbs')) { if (idb) idb.close(); return null; }
        return new Promise(function (ok) {
          var g = idb.transaction('dbs', 'readonly').objectStore('dbs').get('idmp_kanban_proj');
          g.onsuccess = function () { idb.close(); ok(g.result || null); };
          g.onerror = function () { idb.close(); ok(null); };
        });
      }).catch(function () { return null; });
      if (!buf) { log('SIDECAR-WRITEBACK skip (blob gone)'); return; }
      var sdb = new A._SQL.Database(new Uint8Array(buf));
      var n = 0;
      for (var i = 0; i < written.length; i++) {
        var w = written[i];
        var res = await KernelOps.commitGroup(sdb, w.ops.map(function (o) { return { op_type: o.op_type, params: o.params || o }; }), { gid: w.gid });
        if (res.committed) n++;
      }
      var out = sdb.export().buffer;
      sdb.close();
      await _openCacheDB().then(function (idb) {
        return new Promise(function (ok, bad) {
          var tx = idb.transaction('dbs', 'readwrite');
          tx.objectStore('dbs').put(out, 'idmp_kanban_proj');
          tx.oncomplete = function () { idb.close(); ok(); };
          tx.onerror = function () { idb.close(); bad(tx.error); };
        });
      });
      log('SIDECAR-WRITEBACK groups=' + n + '/' + written.length + ' key=idmp_kanban_proj bytes=' + out.byteLength + ' (selector will not re-offer ' + W.doc.id + ')');
    } catch (e) { log('SIDECAR-WRITEBACK fail: ' + e.message); }
  }

  // ── §S-5 completion: ad_docfsm.dispatchFor CO + the qtyOnHand fold of the op log ──
  async function complete() {
    if (W.doc && W.doc.kind === 'pos-inout') return completePos();
    renderStrip();
    var fsm = AdDocFsm.dispatchFor(b3(W.erpDb), 323, { docStatus: W.doc.docStatus, processing: 'N', doctypeId: W.doc.doctypeId }, 'CO');
    if (!fsm.ok) { log('COMPLETE REFUSED reason=' + fsm.reason); return; }
    W.doc.docStatus = fsm.to;
    // commit the status transition as the closing op of the SAME log
    var g = await KernelOps.commitGroup(W.opDb,
      [{ op_type: 'SET_STATUS', params: { op_type: 'SET_STATUS', table: 'M_Movement', id: W.doc.id, doc_status: fsm.to, via: 'AdDocFsm.dispatchFor(323)' } }],
      { gid: 'wh-pick-1-complete' });
    // the fold: reconstruct per-(product,locator) deltas from the LOG (truth = the log, never lens memory)
    var ev = [];
    var r = W.opDb.exec("SELECT parameters FROM kernel_ops WHERE op_type='ENACT_MOVE' ORDER BY id");
    (r[0] ? r[0].values : []).forEach(function (row) {
      var p = JSON.parse(row[0]); p = p && p.params ? p.params : p;
      ev.push(p);
    });
    var fold = ERPEngine.qtyOnHand(ev, {
      keyOf: function (e) { return e.m_product_id + '@' + e.m_locator_id; },
      typeOf: function (e) { return e.movementtype; },
      absQtyOf: function (e) { return e.movementqty; }
    });
    // expected deltas from the CONFIRMED steps (qty actually picked, not the draft)
    var exp = {};
    W.steps.forEach(function (s, i) {
      var d = W.done[i];
      if (!d || d.skipped || !d.qty) return;
      var l = s.line;
      exp[l.m_product_id + '@' + l.m_locator_id] = (exp[l.m_product_id + '@' + l.m_locator_id] || 0) - d.qty;
      exp[l.m_product_id + '@' + l.m_locatorto_id] = (exp[l.m_product_id + '@' + l.m_locatorto_id] || 0) + d.qty;
    });
    var keys = Object.keys(exp).sort(), diffs = 0;
    keys.forEach(function (k) { if ((fold[k] || 0) !== exp[k]) { diffs++; log('FOLD MISMATCH ' + k + ' fold=' + fold[k] + ' expected=' + exp[k]); } });
    var chain = await KernelOps.verifyChain(W.opDb);
    log('COMPLETE doc=' + W.doc.id + ' status=' + W.doc.docStatus + ' via=dispatchFor(323) gid=' + g.gid +
      ' foldKeys=' + keys.length + ' diffs=' + diffs + ' chainOk=' + (chain.ok ? 'Y' : 'N'));
    log('FOLD ' + keys.map(function (k) { return k + ':' + fold[k]; }).join(' '));
    ui.step.innerHTML = '<b>Walk complete ✓</b> — M_Movement ' + W.doc.docStatus +
      ', on-hand folded (' + keys.length + ' bins, ' + (diffs === 0 ? 'all match' : diffs + ' MISMATCH') + ')';
  }

  // ── open/close/toggle ──
  async function open() {
    if (!W.gate) { if (A && A.status) A.status.textContent = 'No locator-GUID bins in this model'; return; }
    ensureUI();
    try { await ensureDeps(); } catch (e) { log('OPEN fail deps: ' + e.message); if (A.status) A.status.textContent = 'Walk: ' + e.message; return; }
    if (!window.WHRoute) { log('OPEN fail wh_route.js not loaded'); return; }
    W.open = true;
    ui.strip.style.display = 'flex';
    // §S-3 walk mode ENGAGES — clear the BIM construction chrome so the picker is in the WALK,
    // not BIM-with-a-strip. The pill bar is hidden (not destroyed) and restored verbatim on close.
    var bar = document.getElementById('mobile-pill');
    if (bar) { W._barDisplay = bar.style.display; bar.style.display = 'none'; }
    log('MODE walk-on (BIM pill bar hidden)');
    if (!W.steps.length) { await draftPick(); buildRoute(); W.idx = 0; }
    if (ui.routeDrawer) { ui.routeDrawer.style.display = 'flex'; ui.routeOpen = true; }  // §C-4 auto-expand once at walk start
    log('OPEN steps=' + W.steps.length + ' doc=' + W.doc.id + ' status=' + W.doc.docStatus);
    advance();
  }
  function close() {
    W.open = false;
    closeScan();
    if (ui.strip) ui.strip.style.display = 'none';
    if (ui.routeDrawer) ui.routeDrawer.style.display = 'none';
    // restore the BIM chrome exactly as it was (walk mode OFF → back to BIM view)
    var bar = document.getElementById('mobile-pill');
    if (bar) bar.style.display = (W._barDisplay != null ? W._barDisplay : '');
    log('MODE walk-off (BIM pill bar restored)');
    _clearDepth();
    if (W.xrayWasOff && A.xrayOn && A.toggleXray) { A.toggleXray(); W.xrayWasOff = false; }
    if (A.markDirty) A.markDirty();
    log('CLOSE');
  }
  window.WHWalk.toggle = function () { if (W.open) close(); else open(); };
  window.WHWalk.isOpen = function () { return !!W.open; };

  console.log('§WH-WALK loaded (data-gated pick-walk lens, SPATIAL_PICKING_SPEC §S-3..§S-5)');
})();
