// ⚠ DO NOT REMOVE — §15 POC-B (FLY_TOUR_DLOD_SCALE.md) shared line-of-sight classifier.
// REPORT-ONLY measurement tool, NOT the occlusion-culling mechanism. Used VERBATIM by both
// Stage 0 (Node synthetic sandbox, w_occl_stage0.mjs) and Stage 1 (browser, real LTU,
// w_occl_stage1.js) — same file, same function, per the Stage-0-proves-the-math gate.
// Read the log after every run.
//
// Definition (documented decisions, cited by the Stage 0 hand-check table):
//  - CENTER-RAY test: one ray camera→element center. Element is OCCLUDED iff the nearest
//    element-resolvable hit strictly before the center (dist < targetDist - eps) belongs to a
//    DIFFERENT element. Boundary rule: a partially exposed element whose CENTER sightline is
//    blocked classifies OCCLUDED (and vice versa) — verdict follows the center only.
//  - SELF-EXCLUSION (the §15 "known landmine"): a hit resolving to the target's own guid is
//    proof the ray REACHED the target → clear ('self-first'), mirroring picking.js's
//    hit→guid resolution rather than a mesh-identity test (BatchedMesh slots share one object).
//  - Hits with no resolvable element guid (ground/sky/outlines/etc.) are ignored — only real
//    element geometry counts as an occluder.
//  - Non-finite hit distances skipped (zero-scaled DLOD-hidden InstancedMesh slots produce
//    degenerate transforms; guard, don't assume away).
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.__occlClassify = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // raycaster: THREE.Raycaster (caller-owned; firstHitOnly is saved/restored around the cast)
  // occluders: array of Object3D candidates (caller pre-filters to visible element geometry)
  // camPos/targetCenter: {x,y,z}
  // resolveHitGuid(hit) -> guid string | null (null = not an element, ignore)
  // eps: metres tolerance (default 1e-4)
  // returns { verdict:'clear'|'occluded', via, blocker, blockerDist, targetDist }
  function classify(raycaster, occluders, camPos, targetGuid, targetCenter, resolveHitGuid, eps) {
    eps = (eps === undefined) ? 1e-4 : eps;
    var dx = targetCenter.x - camPos.x, dy = targetCenter.y - camPos.y, dz = targetCenter.z - camPos.z;
    var targetDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (targetDist <= eps) return { verdict: 'clear', via: 'at-camera', blocker: null, blockerDist: -1, targetDist: targetDist };
    raycaster.ray.origin.set(camPos.x, camPos.y, camPos.z);
    raycaster.ray.direction.set(dx / targetDist, dy / targetDist, dz / targetDist);
    raycaster.near = 0;
    raycaster.far = targetDist + eps;
    var prevFHO = raycaster.firstHitOnly;
    raycaster.firstHitOnly = true; // BVH fast path; per-OBJECT nearest is enough — each element's
                                   // own nearest hit is what the verdict needs (multi-element
                                   // BatchedMesh ignores this flag and returns per-instance hits)
    var hits = raycaster.intersectObjects(occluders, false); // three sorts ascending by distance
    raycaster.firstHitOnly = prevFHO;
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (!isFinite(h.distance)) continue;
      var g = resolveHitGuid(h);
      if (g === null || g === undefined) continue;
      if (g === targetGuid)
        return { verdict: 'clear', via: 'self-first', blocker: null, blockerDist: h.distance, targetDist: targetDist };
      if (h.distance < targetDist - eps)
        return { verdict: 'occluded', via: 'blocked', blocker: g, blockerDist: h.distance, targetDist: targetDist };
      break; // nearest element hit is at/past the center and isn't the target → center is clear
    }
    return { verdict: 'clear', via: 'no-hit', blocker: null, blockerDist: -1, targetDist: targetDist };
  }
  return classify;
});
