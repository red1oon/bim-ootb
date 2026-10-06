// §SKY_GHOST toggle hook: ?skytoggle=ground_hidden|ground_env0|ground_opaque|transp_hidden|transp_env0|none  (url-query) — applied right before every
// renderer.render so per-frame code cannot undo it. Dev instrument only.
(function () {
  var mt = /[?&]skytoggle=([a-z_0-9]+)/.exec(location.search); var TG = mt ? mt[1] : 'none', hooked = false, prev = window.__maxqPoseTap, n = 0;
  window.__maxqPoseTap = function () {
    if (prev) try { prev.apply(null, arguments); } catch (e) {}
    var A = window.APP; if (hooked || !A || !A.renderer) return; hooked = true;
    var R = A.renderer, orig = R.render.bind(R);
    R.render = function (scene, cam) {
      if (scene === A.scene && TG !== 'none') {
        var g = A.ground;
        if (TG === 'ground_hidden' && g) g.visible = false;
        if (TG === 'ground_env0' && g && g.material) { if (g.material.envMap) { g.material._envKeep = g.material.envMap; } g.material.envMap = null; }
        if (TG === 'ground_opaque' && g && g.material) { g.material.transparent = false; g.material.opacity = 1; g.material.depthWrite = true; }
        if (TG === 'transp_hidden') scene.traverse(function (o) { if (o.material && !Array.isArray(o.material) && o.material.transparent && o.isMesh) { o.userData._sgv = o.userData._sgv === undefined ? o.visible : o.userData._sgv; o.visible = false; } });
        if (TG === 'transp_env0') scene.traverse(function (o) { if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.transparent && o.material.envMap) { o.material.envMap = null; o.material.envMapIntensity = 0; } });
        if (++n === 1) console.log('§SKY_GHOST_TOGGLE applied=' + TG + ' groundId=' + (g && g.id) + ' groundType=' + (g && g.geometry && g.geometry.type));
      }
      return orig(scene, cam);
    };
  };
})();
// ⚠ DO NOT REMOVE — §SKY_GHOST draw-list tap (installed by cli_silent_bake.js --tap). Scope: at the end of a bake dump every
// VISIBLE object in the scene with material transparency, world bbox Y vs the whole-model top, and mirrored scale
// (negative determinant). Read the §CLI_BAKE_TAP lines after every run.
window.__maxqTapReport = function () {
  var A = window.APP, THREE = window.THREE, L = [], rows = [];
  if (!A || !A.scene || !THREE) return { lines: ['§SKY_GHOST_DRAWLIST INCONCLUSIVE no APP/scene'] };
  A.scene.updateMatrixWorld(true);
  var box = new THREE.Box3(), items = [];
  A.scene.traverse(function (o) {
    if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite || o.isInstancedMesh || o.isBatchedMesh)) return;
    var vis = true, p = o; while (p) { if (p.visible === false) { vis = false; break; } p = p.parent; }
    if (!vis) return;
    var m = Array.isArray(o.material) ? o.material[0] : o.material;
    var b = null; try { box.makeEmpty(); if (o.isInstancedMesh || o.isBatchedMesh) { if (o.computeBoundingBox) o.computeBoundingBox(); var bb = o.boundingBox; if (bb) box.copy(bb).applyMatrix4(o.matrixWorld); } else box.setFromObject(o); if (!box.isEmpty()) b = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]; } catch (e) {}
    var det = o.matrixWorld.determinant();
    items.push({ type: o.type, name: (o.name || '') + '#' + o.id, mat: m ? (m.type + ' tr=' + !!m.transparent + ' op=' + (m.opacity == null ? '-' : (+m.opacity).toFixed(2)) + ' dw=' + m.depthWrite + ' dt=' + m.depthTest + ' side=' + m.side + ' wire=' + !!m.wireframe + ' env=' + !!m.envMap + ' ' + (m.name || '')) : 'none', b: b, det: det, layers: o.layers.mask, ro: o.renderOrder, count: o.count || (o.geometry && o.geometry.attributes && o.geometry.attributes.position ? o.geometry.attributes.position.count : 0), tr: m && m.transparent ? 1 : 0 });
  });
  var top = -1e9, roadTop = -1e9; items.forEach(function (i) { if (i.b && !i.tr && i.b[4] < 1e8) top = Math.max(top, i.b[4]); });
  L.push('§SKY_GHOST_DRAWLIST visibleObjects=' + items.length + ' opaqueTopY=' + top.toFixed(1) + ' camY=' + A.camera.position.y.toFixed(1));
  items.sort(function (a, b) { return (b.tr - a.tr) || ((b.b ? b.b[4] : 0) - (a.b ? a.b[4] : 0)); });
  items.forEach(function (i) {
    var above = i.b && i.b[3 + 1] > top + 0.5;
    L.push('§SKY_GHOST_OBJ ' + i.type + ' ' + i.name + ' | ' + i.mat + ' | bboxY=' + (i.b ? i.b[1].toFixed(1) + '..' + i.b[4].toFixed(1) : '-') + ' bboxXZ=' + (i.b ? i.b[0].toFixed(0) + ',' + i.b[2].toFixed(0) + '..' + i.b[3].toFixed(0) + ',' + i.b[5].toFixed(0) : '-') + ' det=' + i.det.toExponential(2) + (i.det < 0 ? ' MIRRORED' : '') + ' ro=' + i.ro + ' n=' + i.count + (above ? ' ABOVE_MODEL' : '') + (i.tr ? ' TRANSPARENT' : ''));
    rows.push(i);
  });
  return { lines: L, rows: rows };
};
