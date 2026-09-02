// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET AVATAR-LOD RENDERER (§AVATAR-LOD — P6, 2026-07-01). The browser half of the
//   "wow" ladder: it turns the pure plan from hr_bim_asset/avatars.js into little human sprites standing in the
//   rooms where real signed check-ins put real people. LOD ladder over camera distance — FAR: a dot; MID: a
//   minified avatar; NEAR: a full avatar + an on-approach name tip. Hover → the person's card (AD_User /
//   C_BPartner.image). ADDITIVE + host-injected: it owns a single scene Group, touches no other panel, and
//   unmount() removes everything (zero residue). Rides the SAME presence data the density lens uses. Read the log.
(function () {
  'use strict';
  var G = (typeof self !== 'undefined' ? self : this);
  function AV() { return G.HbaAvatars; }                 // the pure engine (plan + LOD + tip)
  function ATT() { return G.HbaAttendance; }
  function BIND() { return G.HbaBinding; }
  function ready() { return !!(AV() && ATT() && BIND() && typeof THREE !== 'undefined'); }

  var _group = null, _sprites = [], _active = false, _A = null;
  var _onChange = null, _onMove = null, _tip = null, _texAvatar = null, _texDot = null;
  var _profiles = {};                                    // employee → { name, image } (AD_User / C_BPartner) — optional
  var TIERS = { full: 12, mini: 30 };                    // metres (matches avatars.avatarLOD default)

  // ---- textures (built once, reused) ----------------------------------------------------------------
  function texPerson() {
    if (_texAvatar) return _texAvatar;
    var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.fillStyle = '#1976d2'; x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2;
    x.beginPath(); x.arc(32, 20, 10, 0, Math.PI * 2); x.fill(); x.stroke();              // head
    x.beginPath(); x.moveTo(14, 60); x.quadraticCurveTo(32, 30, 50, 60); x.closePath(); x.fill(); x.stroke(); // body
    _texAvatar = new THREE.CanvasTexture(c); return _texAvatar;
  }
  function texDot() {
    if (_texDot) return _texDot;
    var c = document.createElement('canvas'); c.width = c.height = 32; var x = c.getContext('2d');
    x.beginPath(); x.arc(16, 16, 11, 0, Math.PI * 2); x.fillStyle = '#1976d2'; x.fill();
    x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,.85)'; x.stroke();
    _texDot = new THREE.CanvasTexture(c); return _texDot;
  }

  // ---- zone centroid from the zone's RENDERED members (reuses the §REAL-BIND / guidTargets join) ------
  function meshById(A) {
    var m = {}; A.collectMeshes(function (o) { return o.isMesh || o.isInstancedMesh || o.isBatchedMesh; })
      .forEach(function (o) { m[o.id] = o; }); return m;
  }
  function makeCentroidFn(A) {
    var B = BIND(), byId = meshById(A), tmp = new THREE.Vector3(), m4 = new THREE.Matrix4();
    return function (zone) {
      var want = B.zoneMeshGuids(zone, A.guidMap, A._hbaRoomMembers || null);
      if (!want.length) return null;
      var sum = new THREE.Vector3(), n = 0;
      B.guidTargets(want, A.guidMap).forEach(function (t) {
        var mesh = byId[t.meshId]; if (!mesh) return;
        if (t.slot == null) { mesh.getWorldPosition(tmp); sum.add(tmp); n++; }
        else { try { mesh.getMatrixAt(t.slot, m4); tmp.setFromMatrixPosition(m4); mesh.localToWorld(tmp); sum.add(tmp); n++; } catch (e) {} }
      });
      if (!n) return null;
      sum.multiplyScalar(1 / n);
      return { x: sum.x, y: sum.y, z: sum.z };
    };
  }

  function period(A) {
    if (A._hbaPeriod) return A._hbaPeriod;
    var log = A._hbaAttendanceLog || []; return (log[0] && log[0].period) || '2026-07';
  }

  // ---- the tip (DOM) — hover card / on-approach label -----------------------------------------------
  function ensureTip() {
    if (_tip) return _tip;
    _tip = document.createElement('div'); _tip.id = 'hba-avatar-tip';
    _tip.style.cssText = 'position:fixed;z-index:10001;pointer-events:none;display:none;background:#0e1b2a;color:#fff;'
      + 'border-radius:8px;padding:8px 10px;font:12px/1.35 system-ui,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.5);max-width:230px;';
    document.body.appendChild(_tip); return _tip;
  }
  function showTip(av, cx, cy) {
    var t = ensureTip(); var card = AV().avatarTip(av, _profiles[av.employee] || null, 'en');
    var img = card.imageRef ? '<img src="' + card.imageRef + '" style="width:34px;height:34px;border-radius:50%;float:left;margin-right:8px;object-fit:cover" onerror="this.style.display=\'none\'"/>' : '';
    t.innerHTML = img + '<b>' + card.name + '</b><br><span style="opacity:.8">' + card.zone + '</span><br>'
      + '<span style="opacity:.8">' + card.status + (card.since ? ' · since ' + String(card.since).replace('T', ' ').slice(0, 16) : '') + '</span>'
      + '<div style="clear:both;margin-top:5px;font-size:10px;opacity:.65">' + card._watermark + '</div>';
    t.style.left = (cx + 14) + 'px'; t.style.top = (cy + 14) + 'px'; t.style.display = 'block';
  }
  function hideTip() { if (_tip) _tip.style.display = 'none'; }

  // ---- LOD update: dot / mini / full by camera distance; nearest full auto-shows its tip -------------
  function updateLOD() {
    if (!_active || !_A || !_A.camera) return;
    var cam = _A.camera, near = null, nearD = Infinity;
    for (var i = 0; i < _sprites.length; i++) {
      var s = _sprites[i], d = cam.position.distanceTo(s.sprite.position);
      var tier = AV().avatarLOD(d, TIERS);
      if (tier !== s.tier) {
        s.tier = tier;
        s.sprite.material.map = (tier === 'dot') ? texDot() : texPerson();
        s.sprite.material.needsUpdate = true;
      }
      var scale = (tier === 'dot') ? 0.7 : (tier === 'mini') ? 1.4 : 2.4;   // world units
      s.sprite.scale.set(scale, scale, 1);
      if (tier === 'full' && d < nearD) { nearD = d; near = s; }
    }
    // proximity tip — the nearest full-tier avatar labels itself as you draw near (no hover needed)
    if (near && !_hoverActive) {
      var v = near.sprite.position.clone().project(_A.camera);
      var r = _A.renderer.domElement.getBoundingClientRect();
      showTip(near.avatar, r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height);
      _proximityTip = true;
    } else if (_proximityTip && !_hoverActive) { hideTip(); _proximityTip = false; }
    if (_A.markDirty) _A.markDirty();
  }
  var _hoverActive = false, _proximityTip = false;

  // ---- hover raycast → the person's card ------------------------------------------------------------
  function onMove(e) {
    if (!_active || !_A) return;
    var dom = _A.renderer.domElement, r = dom.getBoundingClientRect();
    var mx = ((e.clientX - r.left) / r.width) * 2 - 1, my = -((e.clientY - r.top) / r.height) * 2 + 1;
    var ray = _A.raycaster || new THREE.Raycaster(); ray.setFromCamera({ x: mx, y: my }, _A.camera);
    var hits = ray.intersectObjects(_sprites.map(function (s) { return s.sprite; }), false);
    if (hits.length) { _hoverActive = true; showTip(hits[0].object.userData.hbaAvatar, e.clientX, e.clientY); dom.style.cursor = 'pointer'; }
    else if (_hoverActive) { _hoverActive = false; dom.style.cursor = ''; if (!_proximityTip) hideTip(); }
  }

  // ---- mount / unmount ------------------------------------------------------------------------------
  function mount(A) {
    if (!ready() || !A || !A.scene) return false;
    if (_active) unmount(_A);
    _A = A;
    var sessions = ATT().sessions(A._hbaAttendanceLog || [], period(A));
    var plan = AV().avatarPlan(sessions, { resolveZone: function (z) { return BIND().augmentKnown(A.guidMap, A._hbaRoomMembers || null).has(z); },
      zoneCentroid: makeCentroidFn(A), ringRadius: 0.6 });
    if (!plan.length) { console.log('§HBA_AVATARS mount — 0 avatars (no located check-ins) — honest no-op'); return false; }
    _group = new THREE.Group(); _group.name = '__hbaAvatars';
    plan.forEach(function (av) {
      var mat = new THREE.SpriteMaterial({ map: texDot(), depthTest: false, transparent: true });
      var sp = new THREE.Sprite(mat); sp.position.set(av.pos.x, av.pos.y + 1.2, av.pos.z);   // stand ~head height
      sp.renderOrder = 999; sp.userData.hbaAvatar = av;
      _group.add(sp); _sprites.push({ sprite: sp, avatar: av, tier: null });
    });
    A.scene.add(_group); _active = true;
    _onChange = function () { updateLOD(); }; if (A.controls && A.controls.addEventListener) A.controls.addEventListener('change', _onChange);
    _onMove = onMove; if (A.renderer && A.renderer.domElement) A.renderer.domElement.addEventListener('mousemove', _onMove);
    updateLOD();
    console.log('§HBA_AVATARS mounted ' + _sprites.length + ' avatars over ' + new Set(plan.map(function (a) { return a.zone; })).size + ' zones (LOD dot/mini/full)');
    if (A.markDirty) A.markDirty();
    return true;
  }
  function unmount(A) {
    A = A || _A; if (!_active) return;
    if (A) {
      if (A.controls && _onChange && A.controls.removeEventListener) A.controls.removeEventListener('change', _onChange);
      if (A.renderer && _onMove && A.renderer.domElement) A.renderer.domElement.removeEventListener('mousemove', _onMove);
      if (_group && A.scene) A.scene.remove(_group);
      if (A.renderer && A.renderer.domElement) A.renderer.domElement.style.cursor = '';
    }
    _sprites.forEach(function (s) { if (s.sprite.material) s.sprite.material.dispose(); });
    _sprites = []; _group = null; _active = false; _onChange = _onMove = null;
    _hoverActive = _proximityTip = false; hideTip();
    console.log('§HBA_AVATARS unmounted — zero residue');
    if (A && A.markDirty) A.markDirty();
  }
  function isActive() { return _active; }
  function count() { return _sprites.length; }

  G.HBAAvatars = { mount: mount, unmount: unmount, isActive: isActive, count: count, setProfiles: function (p) { _profiles = p || {}; } };
  if (typeof module === 'object' && module.exports) module.exports = G.HBAAvatars;
})();
