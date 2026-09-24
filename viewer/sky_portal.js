// ══ §SKY_PORTAL — window panes as sky light sources in Alt+S (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md
// "§SKY_PORTAL spec") ══ red1, 2026-09-24: "the outside sky must hit the windows and carry on indoors, stronger, as in
// real life. Now it's drab and false." The archviz "sky portal": a light at each pane, aimed inward.
// Panes come from §SURFACE_R10's split (aPane = 1 triangles); nothing is placed for an unsplit window (logged).
// SpotLights, not RectAreaLights: RectAreaLightUniformsLib is not in viewer/lib. The nearest few cast shadows (the pane
// itself casts nothing since R10, so frames throw mullion shadows); the rest are unshadowed and CAN leak through walls.
(function (global) {
  var PORTAL_RANGE = 40;          // m — candidate panes near the camera
  var PORTAL_EXPOSURE = 10;       // start value for red1's eye (see spec): the unoccluded hemi drowns a physical portal
  var PORTAL_ANGLE = 70 * Math.PI / 180, PORTAL_SHADOW_SIZE = 512, UPRAY_OFF = 0.5, UPRAY_MAX = 30;
  var placed = [];

  function dial(A, key, name, def, lo, hi) {
    var v = (typeof A[key] === 'number') ? A[key] : null;
    if (v == null) { var m = new RegExp('[?&]' + name + '=([0-9.]+)').exec(location.search); v = m ? parseFloat(m[1]) : def; }
    return Math.max(lo, Math.min(hi, isFinite(v) ? v : def));
  }

  // Every R10 window pane in the scene as { c: centre, n: unit normal, u, v: half-size axes (world), area, hue }.
  function collectPanes(A, THREE) {
    var out = [], box = new THREE.Box3(), inst = new THREE.Matrix4(), M = new THREE.Matrix4();
    A.scene.traverse(function (o) {
      if (!(o.isMesh || o.isInstancedMesh) || !o.geometry || !o.geometry.getAttribute('aPane')) return;
      if (!A._r10DepthMat || o.customDepthMaterial !== A._r10DepthMat) return;       // windows only (doors split too)
      var g = o.geometry, ap = g.getAttribute('aPane'), pos = g.getAttribute('position');
      box.makeEmpty(); var p = new THREE.Vector3();
      for (var i = 0; i < ap.count; i++) if (ap.getX(i) > 0.5) { p.fromBufferAttribute(pos, i); box.expandByPoint(p); }
      if (box.isEmpty()) return;
      var sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      var ax = ['x', 'y', 'z'].sort(function (a, b) { return sz[a] - sz[b]; });     // ax[0] = thin axis = normal
      var mats = Array.isArray(o.material) ? o.material : [o.material], pm = mats[1] || mats[0];
      var hue = pm && pm.color ? pm.color.clone() : new THREE.Color(1, 1, 1);
      var mx = Math.max(hue.r, hue.g, hue.b) || 1; hue.multiplyScalar(1 / mx);         // HUE only, no alpha dimming
      var n = o.isInstancedMesh ? o.count : 1;
      o.updateMatrixWorld();
      for (var k = 0; k < n; k++) {
        if (o.isInstancedMesh) { o.getMatrixAt(k, inst); M.multiplyMatrices(o.matrixWorld, inst); } else M.copy(o.matrixWorld);
        var e = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
        var nrm = e[ax[0]].clone().transformDirection(M);
        var u = e[ax[1]].clone().transformDirection(M).multiplyScalar(sz[ax[1]] / 2 * new THREE.Vector3().setFromMatrixColumn(M, 'xyz'.indexOf(ax[1])).length());
        var v = e[ax[2]].clone().transformDirection(M).multiplyScalar(sz[ax[2]] / 2 * new THREE.Vector3().setFromMatrixColumn(M, 'xyz'.indexOf(ax[2])).length());
        var c = ctr.clone().applyMatrix4(M);
        if (!(u.lengthSq() > 0 && v.lengthSq() > 0)) continue;
        out.push({ c: c, n: nrm, u: u, v: v, area: 4 * u.length() * v.length(), hue: hue });
      }
    });
    return out;
  }

  function stage(A) {
    var THREE = global.THREE; if (!THREE || !A || !A.scene || !A.hemi) return;
    unstage(A);
    var t0 = performance.now();
    var gain = dial(A, '_stillPortal', 'portal', 1, 0, 3), cap = Math.round(dial(A, '_stillPortalCap', 'portalcap', 32, 0, 128));
    var nShadow = Math.round(dial(A, '_stillPortalShadow', 'portalshadow', 8, 0, 32));
    if (gain <= 0 || cap <= 0) { console.log('§SKY_PORTAL off portal=' + gain + ' cap=' + cap); return; }
    var cam = A.camera.position, panes = collectPanes(A, THREE);
    var near = panes.filter(function (p) { return p.c.distanceTo(cam) <= PORTAL_RANGE; })
      .sort(function (a, b) { return a.c.distanceTo(cam) - b.c.distanceTo(cam); });
    var capped = Math.max(0, near.length - cap); near = near.slice(0, cap);
    // Inward side: the up-ray from 0.5 m off the pane hits building geometry (under a slab = inside).
    var targets = []; A.scene.traverse(function (o) { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && o !== A.ground && o !== A._sky && !(o.userData && o.userData.excludeFromShadow)) targets.push(o); });
    var rc = new THREE.Raycaster(); rc.far = UPRAY_MAX; var up = new THREE.Vector3(0, 1, 0);
    function covered(pt) { rc.set(pt, up); return rc.intersectObjects(targets, false).length > 0; }
    var skipped = 0, H = A.hemi.intensity, sky = A.hemi.color, shadowed = 0, unsh = 0, iSum = 0;
    near.forEach(function (p) {
      var a = covered(p.c.clone().addScaledVector(p.n, UPRAY_OFF)), b = covered(p.c.clone().addScaledVector(p.n, -UPRAY_OFF));
      if (a === b) { skipped++; return; }
      var inward = a ? p.n.clone() : p.n.clone().negate();
      var I = H * p.area / Math.PI * PORTAL_EXPOSURE * gain;
      var col = sky.clone().multiply(p.hue);
      var L = new THREE.SpotLight(col, I, 0, PORTAL_ANGLE, 1, 2);
      L.position.copy(p.c).addScaledVector(inward, -0.05);
      L.target.position.copy(p.c).addScaledVector(inward, 5);
      if (shadowed < nShadow) {
        L.castShadow = true; L.shadow.mapSize.set(PORTAL_SHADOW_SIZE, PORTAL_SHADOW_SIZE);
        L.shadow.camera.near = 0.1; L.shadow.camera.far = PORTAL_RANGE; L.shadow.bias = -0.0005; shadowed++;
      } else unsh++;
      L.userData.skyPortal = true;
      A.scene.add(L); A.scene.add(L.target); placed.push(L); iSum += I;
    });
    if (A.markDirty) A.markDirty();
    console.log('§SKY_PORTAL placed=' + placed.length + ' shadowed=' + shadowed + ' unshadowed=' + unsh + ' (unshadowed can leak through walls)' +
      ' capped=' + capped + ' skipped=' + skipped + ' (up-ray could not tell inside from outside) panesInScene=' + panes.length +
      ' portal=' + gain + ' exposure=' + PORTAL_EXPOSURE + ' hemi=' + H.toFixed(3) + ' intensitySum=' + iSum.toFixed(2) +
      ' meanI=' + (placed.length ? (iSum / placed.length).toFixed(3) : 0) + ' ms=' + (performance.now() - t0).toFixed(0));
  }

  function unstage(A) {
    if (!placed.length) return;
    var n = placed.length;
    placed.forEach(function (L) { A.scene.remove(L.target); A.scene.remove(L); if (L.shadow && L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } L.dispose(); });
    placed = [];
    if (A.markDirty) A.markDirty();
    console.log('§SKY_PORTAL removed=' + n);
  }

  global.SkyPortal = { stage: stage, unstage: unstage };
})(typeof window !== 'undefined' ? window : this);
