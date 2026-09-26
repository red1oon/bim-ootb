// ══ §FAULT — the viewer reports its own glaring faults on every Alt+S press (red1, 2026-09-26: "Beef up WITNESS logging
// that fails to report faults as we go along"; watchdog red1-c6 spec) ══
// One line per press, from state staging already computed, no new renders, target <= 50 ms:
//   unlit        visible sample points (16x9, marched through the LIGHT ZONE grid from the staged camera — scene raycasts
//                cost ~10 ms each on Hospital, the voxel march ~0.05 ms) that get NOTHING from any source: no kept lamp
//                reaches them (zone binding, N.L > 0, inside the lamp's range), no sky-view field F / sky bit, no sun
//                (N.L > 0 and either outside the fitted sun box — the renderer lights it — or a clear voxel march to the sky)
//   capDropNear  distinct fixtures of those points' zones, in range and facing them, that the lamp cap left out
//   extLightsDay lamps (only when &lampsout=0) / spots / additive sprites on while the camera is OUTSIDE and the sun is up
//   glassLow     visible glazing materials with T_eff < 0.7 at normal incidence (stock: 1 - opacity; §GLASS_FRESNEL clone:
//                1 - its 0.08 body)
//   glassOpaque  visible IfcWindow meshes (not R10-split) whose materials are ALL opaque: the pane hides the room. IfcPlate is
//                NOT counted here (2026-09-26): an opaque plate is what the IFC says — Hospital's 1,276 "Glazed Spandrel" panels are
//                IfcMaterial "Spandrel Glass" Transparency 0.0, Terminal's plates "Metal Deck" (Hospital_IFC4_ARC.ifc /
//                TerminalMerged.ifc, read with ifcopenshell); it made every §FAULT line FAULT (glassOpaque 90 / 46).
//   glassPlateLost  IfcPlate elements the DB says are see-through (material_rgba alpha < 1) minus the plate instances drawn
//                with a glass material — a see-through plate drawn opaque (the plate half of the old glassOpaque, now source-checked)
//                (red1's Clinic windows seen from outside, 2026-09-26)
//   glassStock   visible glazing meshes with a glass material that §GLASS_FRESNEL did not swap (batched / shared)
//   unlitCeil    the unlit samples on down-facing surfaces (ceilings / soffits: red1's black ceilings)
//   fieldBad     samples whose sky-view F is outside [0, 1] (the field is Uint16 x 10000, so NaN / negative cannot be stored).
//                Taps spanning zones are NOT a fault: the shader keeps only own-zone + open taps by design (probe 2026-09-26)
//   portalsRetired, expStep (stops vs the previous press; logged only), guard (Shader Error / context lost seen so far)
// FAULT (console.warn) when any counter > 0, else OK. Printed at §STILL_REFINE done (the finished still), not in films.
// The picture-level counters (blown, dark, hueNoise) need the finished pixels: gi_still.js prints them as §FAULT_GI.
(function (global) {
  var guard = { shaderError: 0, contextLost: 0 }, hooked = false, prevExp = null;
  function hook() {
    if (hooked) return; hooked = true;
    var ce = console.error;
    console.error = function () { try { var s = Array.prototype.join.call(arguments, ' '); if (/Shader Error/.test(s)) guard.shaderError++; if (/CONTEXT_LOST|Context Lost/i.test(s)) guard.contextLost++; } catch (e) {} return ce.apply(this, arguments); };
    try { var cv = global.APP && global.APP.renderer && global.APP.renderer.domElement; if (cv) cv.addEventListener('webglcontextlost', function () { guard.contextLost++; }); } catch (e) {}
  }
  function report(A) {
    var t0 = performance.now(), THREE = global.THREE, LZ = global.LightZones, Z = LZ && LZ.get ? LZ.get() : null;
    hook();
    if (!THREE || !A || !A.camera || !A.scene) return null;
    var cam = A.camera, cp = cam.position, out = { unlit: 0, unlitCeil: 0, glassOpaque: 0, glassStock: 0, fieldBad: 0, samples: 0, capDropNear: 0, extLightsDay: 0, glassLow: 0, portalsRetired: 0, expStep: 0, guard: guard.shaderError + guard.contextLost };
    var sd = A.sun ? A.sun.position.clone().sub(A.sun.target.position).normalize() : new THREE.Vector3(0, 1, 0), sunUp = sd.y > 0 && A.sun && A.sun.intensity > 0;
    // camera side
    var camZ = Z ? LZ.at(cp) : -1, camOutside = !Z || camZ === 0 || camZ === -1;
    if (Z && camZ === LZ.SOLID) camOutside = !(A._stillCamInsideNow === true);
    // lights on
    var lamps = [], nLamp = 0, nLampAll = 0, nSpot = 0, nSprite = 0;
    A.scene.traverse(function (o) {
      if (!o.visible) return;
      if (o.isPointLight && o !== A._camLight) nLampAll++;   // §FAULT lamps: loaded (the shader cost), lit below
      if ((o.isPointLight || o.isSpotLight) && o.intensity > 0 && o !== A._camLight) { if (o.isPointLight) { nLamp++; lamps.push(o); } else nSpot++; }   // the camera fill travels with the eye: not a lamp
      if ((o.isSprite || o.isPoints) && o.material && o.material.blending === THREE.AdditiveBlending) nSprite++;
    });
    // §LAMP_UNCAPPED: on the data path the still has no lamp point lights; its lamps are A._lampData (every placed fixture)
    var dataOn = !!(A._lampDataOn && A._lampData && global.SourcedLight && global.SourcedLight.lampStats && global.SourcedLight.lampStats());
    if (dataOn) { nLamp = 0; nLampAll = 0; lamps = [];
      A._lampData.lamps.forEach(function (q) { nLampAll++; if (!(q.I > 0)) return; nLamp++; var v = LZ.atLamp({ x: q.x, y: q.y, z: q.z });
        lamps.push({ position: new THREE.Vector3(q.x, q.y, q.z), distance: q.range, intensity: q.I, userData: { sourcedZone: (v > 0 && v !== LZ.SOLID) ? v : ((v === 0 || v === -1) ? 65534 : 0) } }); }); }
    // indoor lamps stay on outside by day since red1 2026-09-26 (&lampsout default 1): they count here only when that switch says off
    if (camOutside && sunUp) out.extLightsDay = (A._stillLampsOff ? nLamp : 0) + nSpot + nSprite;
    out.lampsLoaded = nLampAll; out.lampsLit = nLamp; out.lampCap = dataOn ? 'none (lamp data)' : (typeof A._stillLampCap === 'number') ? A._stillLampCap : null;
    // glass
    var seenMat = new Set();
    A.scene.traverse(function (o) {
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible || !o.material) return;
      var ms = Array.isArray(o.material) ? o.material : [o.material];
      if (!ms.every(function (m) { return m && m.transparent && m.opacity < 0.95 && !m.map && m.type !== 'MeshBasicMaterial'; })) return;
      ms.forEach(function (m) { if (seenMat.has(m)) return; seenMat.add(m); var T = (m.userData && m.userData.gfOf) ? 0.92 : 1 - m.opacity; if (T < 0.7) out.glassLow++; });
    });
    // element level (A.guidMap: "<object id>[_<instance>]" -> guid): which DB-see-through plates are drawn with a glass material
    var plateGlassDb = null, glassGuids = null, byObj = new Map(), drawnGlass = new Set(), drawnOpaque = new Set(), plateGlassMeshes = 0, plateOpaqueMeshes = 0;
    try { var pr = A.dbQuery ? A.dbQuery("SELECT guid FROM elements_meta WHERE ifc_class = 'IfcPlate' AND CAST(substr(material_rgba, length(material_rgba) - 4) AS REAL) < 1") : null;
      if (pr) { glassGuids = new Set(pr.map(function (r) { return r[0]; })); plateGlassDb = glassGuids.size; } } catch (eP) {}
    if (glassGuids && glassGuids.size) for (var gk in A.guidMap) { var oid = parseInt(String(gk).split('_')[0], 10), gg = A.guidMap[gk]; if (!glassGuids.has(gg)) continue; var lst = byObj.get(oid); if (!lst) byObj.set(oid, lst = []); lst.push(gg); }
    A.scene.traverse(function (o) {
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible || !o.material) return;
      var cls = o.userData && o.userData.ifcClass, r10 = !!o.material.isR10MaterialArray; if (!(cls === 'IfcWindow' || cls === 'IfcPlate' || r10)) return;
      var ms = Array.isArray(o.material) ? o.material : [o.material];
      var glassy = ms.filter(function (m) { return m && m.transparent && m.opacity < 0.95; });
      if (cls === 'IfcPlate' && !r10) { var gl2 = byObj.get(o.id) || []; if (glassy.length) { plateGlassMeshes++; gl2.forEach(function (g) { drawnGlass.add(g); }); } else { plateOpaqueMeshes++; gl2.forEach(function (g) { drawnOpaque.add(g); }); } }
      if (!glassy.length) { if (!r10 && cls !== 'IfcPlate') out.glassOpaque++; return; }
      if (!glassy.some(function (m) { return m.userData && m.userData.gfOf; })) out.glassStock++;
    });
    // §GLASS_BATCHED: untagged (batched) meshes whose members are ALL glazing (GlassFresnel.classOfMembers) count too — the Clinic's
    // 40-of-80 stock glass hits sat in such buckets and this counter read 0
    out.glassStockUntagged = 0;
    if (global.GlassFresnel && global.GlassFresnel.classOfMembers) A.scene.traverse(function (o) {
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible || !o.material || (o.userData && o.userData.ifcClass)) return;
      var ms = Array.isArray(o.material) ? o.material : [o.material], glassy = ms.filter(function (m) { return m && m.transparent && m.opacity < 0.95; }); if (!glassy.length) return;
      var mc = global.GlassFresnel.classOfMembers(A, o); if (mc !== 'IfcWindow' && mc !== 'IfcPlate') return;
      if (!glassy.some(function (m) { return m.userData && m.userData.gfOf; })) { out.glassStock++; out.glassStockUntagged++; } });
    // plates drawn by meshes WITHOUT an ifcClass tag (merged / batched buckets): follow the guid, whatever the tag
    A.scene.traverse(function (o) { if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible || !o.material) return; if (o.userData && o.userData.ifcClass === 'IfcPlate') return;
      var gl4 = byObj.get(o.id); if (!gl4) return; var ms4 = Array.isArray(o.material) ? o.material : [o.material], g4 = !!o.material.isR10MaterialArray || ms4.some(function (m) { return m && m.transparent && m.opacity < 0.95; });
      gl4.forEach(function (g) { (g4 ? drawnGlass : drawnOpaque).add(g); }); });
    // lost = a see-through plate drawn by an OPAQUE mesh (exact, per guid); plates the viewer does not draw right now (4D / DLOD /
    // hidden) are neither, and counted as notDrawn
    drawnOpaque.forEach(function (g) { if (drawnGlass.has(g)) drawnOpaque.delete(g); });
    out.glassPlateLost = drawnOpaque.size;
    out.plates = { glassDb: plateGlassDb, glassDrawn: drawnGlass.size, lost: drawnOpaque.size, notDrawn: plateGlassDb == null ? null : plateGlassDb - drawnGlass.size - drawnOpaque.size, glassMeshes: plateGlassMeshes, opaqueMeshes: plateOpaqueMeshes };
    if (drawnOpaque.size) out.plates.lostSample = Array.from(drawnOpaque).slice(0, 3);
    // §GLASS_SPEC_GATE — glassReflDark: camera OUTSIDE, glass hit first on a 32x18 ray grid, reflection gate (CPU mirror of the
    // shader's slSpecKeep) < 0.3 = the pane's sky reflection is suppressed: the "black glass from outside" red1 found (Clinic)
    out.glassReflDark = 0; out.glassReflSamples = 0; out.glassReflDarkOldGate = 0;
    if (camOutside && LZ && LZ.specVis && Z && Z.field) { try {
      var rcg = new THREE.Raycaster(), tgg = []; A.scene.traverse(function (o) { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && o !== A._sky) tgg.push(o); });
      for (var gy = 0; gy < 18; gy++) for (var gx = 0; gx < 32; gx++) { rcg.setFromCamera(new THREE.Vector2((gx + 0.5) / 32 * 2 - 1, 1 - (gy + 0.5) / 18 * 2), cam);
        var hh = rcg.intersectObjects(tgg, false)[0]; if (!hh) continue; var ob = hh.object, mm = Array.isArray(ob.material) ? (hh.face && ob.material[hh.face.materialIndex]) || ob.material[0] : ob.material;
        if (!(mm && mm.transparent && mm.opacity < 0.95 && !mm.map && mm.type !== 'MeshBasicMaterial')) continue;
        var nn = hh.face ? hh.face.normal.clone().transformDirection(ob.matrixWorld) : new THREE.Vector3(0, 1, 0), sv = LZ.specVis(hh.point, nn, cp); if (!sv) continue;
        out.glassReflSamples++; if (sv.spec < 0.3) out.glassReflDark++; if (sv.base < 0.3) out.glassReflDarkOldGate++; } } catch (eG) { console.warn('§FAULT glassReflDark failed: ' + eG.message); } }
    // portals
    out.portalsRetired = (global.SkyPortal && global.SkyPortal.placedCount && global.SkyPortal.placedCount() === 0) ? 1 : 0;
    // exposure step
    var ex = A.renderer ? A.renderer.toneMappingExposure : null;
    if (ex && prevExp) out.expStep = +(Math.log2(ex / prevExp)).toFixed(2); prevExp = ex;
    // unlit samples: voxel march through the zone grid
    if (Z) {
      var org = Z.org, cs = Z.cell, nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny, zone = Z.zone, gT = Z.glassT, G = Z.field && Z.field.G;
      var SOLID = LZ.SOLID, SKY_BIT = LZ.SKY_BIT || 0x4000, ZM = LZ.ZONE_MASK || 0x3FFF;
      var cellOf = function (x, y, z) { var i = Math.floor((x - org.x) / cs), j = Math.floor((y - org.y) / cs), k = Math.floor((z - org.z) / cs); return (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) ? -1 : i + j * nx + k * nxy; };
      var sc = A.sun && A.sun.shadow ? A.sun.shadow.camera : null; if (sc) { A.sun.updateMatrixWorld(); A.sun.shadow.updateMatrices(A.sun); }
      var kept = new Set(); lamps.forEach(function (l) { kept.add(Math.round(l.position.x * 20) + ',' + Math.round(l.position.y * 20) + ',' + Math.round(l.position.z * 20)); });
      var fx = A._nightFixtureWorldPositions ? A._nightFixtureWorldPositions() : [], range = lamps.length ? (lamps[0].distance || 25) : 25, dropped = new Set();
      var STEP = cs * 0.4, MAXD = Math.min(cam.far || 1000, 400), v = new THREE.Vector3(), dir = new THREE.Vector3(), P = new THREE.Vector3(), N = new THREE.Vector3(), q = new THREE.Vector3();
      var sunVox = function (x, y, z) {   // march toward the sun: open-sky cell (0) or off-grid = lit; an opaque solid = shadow
        for (var d = STEP * 2; d < 300; d += STEP * 2) { var c = cellOf(x + sd.x * d, y + sd.y * d, z + sd.z * d); if (c < 0) return true; var zz = zone[c]; if (zz === 0) return true; if (zz === SOLID && !(gT && gT[c])) return false; } return true; };
      for (var gy = 0; gy < 9; gy++) for (var gx = 0; gx < 16; gx++) {
        v.set((gx + 0.5) / 16 * 2 - 1, 1 - (gy + 0.5) / 9 * 2, 0.5).unproject(cam); dir.copy(v).sub(cp).normalize();
        var lastEmpty = -1, prevC = cellOf(cp.x, cp.y, cp.z), hit = false;
        for (var t = STEP; t < MAXD; t += STEP) {
          var x = cp.x + dir.x * t, y = cp.y + dir.y * t, z = cp.z + dir.z * t, c = cellOf(x, y, z);
          if (c < 0) { if (lastEmpty >= 0) break; continue; }
          var zv = zone[c];
          if (zv === SOLID) { if (gT && gT[c]) { prevC = c; continue; }
            // hit: normal from the axis the ray crossed into this cell
            var dc = c - prevC, ax = Math.abs(dc) === 1 ? 0 : (Math.abs(dc) === nx ? 1 : 2);
            N.set(ax === 0 ? -Math.sign(dir.x) : 0, ax === 1 ? -Math.sign(dir.y) : 0, ax === 2 ? -Math.sign(dir.z) : 0);
            P.set(x, y, z).addScaledVector(dir, -STEP * 0.5); hit = true; break; }
          lastEmpty = c; prevC = c;
        }
        if (!hit || lastEmpty < 0) continue;
        var zr = zone[lastEmpty]; if (zr === 0) continue;   // outside surfaces are the sky's: not counted
        var zid = zr & ZM; out.samples++;
        var lit = false;
        var F = G ? G[lastEmpty] / 10000 : ((zr & SKY_BIT) ? 1 : 0); if (F > 1e-4) lit = true;
        if (F > 1 || F < 0 || F !== F) out.fieldBad++;
        if (!lit && sunUp && N.dot(sd) > 0) { var inBox = true; if (sc) { q.copy(P).applyMatrix4(sc.matrixWorldInverse); inBox = q.x >= sc.left && q.x <= sc.right && q.y >= sc.bottom && q.y <= sc.top; } if (!inBox || sunVox(P.x + N.x * 0.3, P.y + N.y * 0.3, P.z + N.z * 0.3)) lit = true; }
        if (!lit) for (var li = 0; li < lamps.length && !lit; li++) { var l = lamps[li], lz = (l.userData && l.userData.sourcedZone) || 0; if (lz && lz < 65534 && lz !== zid) continue;
          q.copy(l.position).sub(P); var d2 = q.length(); if (l.distance > 0 && d2 >= l.distance) continue; q.divideScalar(d2 || 1); if (N.dot(q) > 0) lit = true; }
        if (lit) continue;
        out.unlit++;
        if (N.y < -0.5) out.unlitCeil++;
        fx.forEach(function (f) { if (f.__slz !== undefined && f.__slz !== zid) return; var dx = f.x - P.x, dy = f.y - P.y, dz = f.z - P.z, dd = Math.sqrt(dx * dx + dy * dy + dz * dz); if (dd >= range || (dx * N.x + dy * N.y + dz * N.z) <= 0) return;
          var key = Math.round(f.x * 20) + ',' + Math.round(f.y * 20) + ',' + Math.round(f.z * 20); if (!kept.has(key)) dropped.add(key); });
      }
      out.capDropNear = dropped.size;
    }
    // expStep is LOGGED, not a fault: every press moves the exposure some amount, and no cited limit exists for a step
    // §LAMP_UNCAPPED_COST: the lamps the shader loops per fragment at this pose (information, not a fault)
    if (dataOn) { try { var lc = global.SourcedLight.lampCost(A); if (lc) { out.lampListMean = lc.meanList; out.lampListMax = lc.maxList; out.lampPassMean = lc.meanLit; } } catch (eLC) { console.warn('§LAMP_UNCAPPED_COST failed: ' + eLC.message); } }
    var fault = out.unlit > 0 || out.fieldBad > 0 || out.glassOpaque > 0 || out.glassPlateLost > 0 || out.glassReflDark > 0 || out.glassStock > 0 || out.capDropNear > 0 || out.extLightsDay > 0 || out.glassLow > 0 || out.guard > 0;
    var line = '§FAULT ' + (fault ? 'FAULT' : 'OK') + ' unlit=' + out.unlit + '/' + out.samples + ' unlitCeil=' + out.unlitCeil + ' fieldBad=' + out.fieldBad + ' lamps=' + out.lampsLit + '/' + out.lampsLoaded + ' (lit/loaded, cap ' + out.lampCap + ')' + ' capDropNear=' + out.capDropNear + ' extLightsDay=' + out.extLightsDay +
      (camOutside ? ' (camOutside' + (sunUp ? ', day)' : ', night)') : ' (camInside)') + ' glassLow=' + out.glassLow + ' glassOpaque=' + out.glassOpaque + ' glassPlateLost=' + out.glassPlateLost + ' (see-through plates db=' + out.plates.glassDb + ' drawnGlass=' + out.plates.glassDrawn + ' drawnOpaque=' + out.plates.lost + ' notDrawn=' + out.plates.notDrawn + (out.plates.lostSample ? ' e.g. ' + out.plates.lostSample.join(',') : '') + ')' + ' glassReflDark=' + out.glassReflDark + '/' + out.glassReflSamples + ' (old sky-view gate: ' + out.glassReflDarkOldGate + ')' + ' glassStock=' + out.glassStock + ' (untagged ' + out.glassStockUntagged + ')' + ' portalsRetired=' + out.portalsRetired +
      ' expStep=' + out.expStep + ' guard=' + out.guard + (out.lampListMean != null ? ' lampList mean/max=' + out.lampListMean + '/' + out.lampListMax + ' zonePass=' + out.lampPassMean : '') + ' ms=' + (performance.now() - t0).toFixed(1);
    if (fault) console.warn(line); else console.log(line);
    out.fault = fault; A._stillFaultLast = out;   // §STILL_POSE_PNG copies it into the saved still
    return out;
  }
  global.StillFault = { report: report, hook: hook, guard: function () { return guard; } };
  try { hook(); } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
