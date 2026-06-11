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
  }, 500);

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

  // ── §S-2 in the lens: drafted movement (seed first; else buildDoc from REAL rows) + route ──
  function draftPick() {
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
    var center = new THREE.Vector3(b.c.x, b.c.y, b.c.z);
    var dist = Math.max(b.sx, b.sy, b.sz) * 1.5 + 0.5;       // §S277d tight-zoom rule, verbatim
    var camDir = A.camera.position.clone().sub(A.controls.target).normalize();
    var end = center.clone().add(camDir.multiplyScalar(Math.max(dist, 2.5)));
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
    st.innerHTML = '<div id="wh-step" style="flex:1;min-width:0"></div>' +
      '<button id="wh-scan-btn" style="background:#4fc3f7;color:#06263a;border:0;border-radius:8px;padding:8px 12px;font-weight:600">Scan bin</button>' +
      '<button id="wh-close" style="background:none;color:#90a4ae;border:0;font-size:16px">✕</button>';
    document.body.appendChild(st);
    ui.strip = st; ui.step = st.querySelector('#wh-step');
    st.querySelector('#wh-close').addEventListener('click', close);
    st.querySelector('#wh-scan-btn').addEventListener('click', function () { openScan(false); });
    // long-press on the strip = skip-with-reason (§S-3 exception trail)
    var hold = null;
    ui.step.addEventListener('pointerdown', function () { hold = setTimeout(function () { hold = null; skipPrompt(); }, 550); });
    ['pointerup', 'pointerleave'].forEach(function (ev) { ui.step.addEventListener(ev, function () { if (hold) { clearTimeout(hold); hold = null; } }); });
    // scan screen (camera + typed fallback), W-QR-INPUT layout
    var sc = document.createElement('div');
    sc.id = 'wh-scan';
    sc.style.cssText = 'position:fixed;inset:0;z-index:1300;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(4,10,20,.93);color:#e3f2fd;font:14px system-ui;padding:16px';
    sc.innerHTML = '<div id="wh-scan-title" style="margin-bottom:10px;font-weight:600"></div>' +
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
    if (!open.length) { ui.step.innerHTML = '<b>Walk complete</b> — completing document…'; return; }
    var s = currentStep();
    ui.step.innerHTML = '<b>step ' + s.step + '/' + s.of + '</b> · ' + (W.names[s.line.m_product_id] || s.line.m_product_id) +
      ' · qty ' + s.line.qty + '<br><span style="color:#90caf9">' + (W.locVal[s.m_locator_id] || '') + ' (bin ' + s.m_locator_id + ')' +
      (s.unroutable ? ' · <span style="color:#ffb74d">UNROUTABLE — off-model bin</span>' : '') + '</span>' +
      '<span style="color:#607d8b"> · long-press = skip</span>';
  }
  function currentStep() { return W.steps[W.idx]; }

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
    var ops = WHRoute.enactOps(s, qty).map(function (o) { return { op_type: o.op_type, params: o }; });
    var gid = 'wh-pick-1-step' + s.step + '-loc' + s.m_locator_id;               // deterministic, idempotent
    var g = await KernelOps.commitGroup(W.opDb, ops, { gid: gid });
    var chain = await KernelOps.verifyChain(W.opDb);
    var short = qty < Number(s.line.qty);
    W.done[W.idx] = { qty: qty, gid: g.gid, short: short };
    log('PICK step=' + s.step + '/' + s.of + ' locator=' + s.m_locator_id + ' qty=' + qty +
      (short ? ' SHORT (remainder ' + (Number(s.line.qty) - qty) + ' stays open on the doc)' : '') +
      ' gid=' + g.gid + ' ops=' + g.ids.length + ' committed=' + g.committed + ' chainOk=' + (chain.ok ? 'Y' : 'N'));
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
    W.idx++;
    advance();
  };

  // ── §S-5 completion: ad_docfsm.dispatchFor CO + the qtyOnHand fold of the op log ──
  async function complete() {
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
    if (!W.steps.length) { await draftPick(); buildRoute(); W.idx = 0; }
    log('OPEN steps=' + W.steps.length + ' doc=' + W.doc.id + ' status=' + W.doc.docStatus);
    advance();
  }
  function close() {
    W.open = false;
    closeScan();
    if (ui.strip) ui.strip.style.display = 'none';
    _clearDepth();
    if (W.xrayWasOff && A.xrayOn && A.toggleXray) { A.toggleXray(); W.xrayWasOff = false; }
    if (A.markDirty) A.markDirty();
    log('CLOSE');
  }
  window.WHWalk.toggle = function () { if (W.open) close(); else open(); };
  window.WHWalk.isOpen = function () { return !!W.open; };

  console.log('§WH-WALK loaded (data-gated pick-walk lens, SPATIAL_PICKING_SPEC §S-3..§S-5)');
})();
