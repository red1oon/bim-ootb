// ⚠ DO NOT REMOVE — std2d JS port, slice S1 (plan geometry). Spec: bim-ootb prompts/DXF2BIM_MODELLER_LANE.md §L5.6.
// Port of 2D_Layout/python/section_cut.py slice_mesh / chain_segments / classify_contour / the per-element contour step of section_cut().
// Pure: no DOM, no DB. Same constants and the same matching order as the Python oracle so contours agree vertex for vertex.
// Read the witness log after every run (tests/dxf2bim/witness_std2d_s1.js).
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Std2dGeom = factory(); })(this, function () {
  'use strict';
  const TOLERANCE = 0.005, EPSILON = 1e-7;   // section_cut.py: 5 mm endpoint match, float guard

  // vertices: Float32Array/array len 3N (element-local), faces: Int32Array len 3M. Returns [[x0,y0,x1,y1],...]
  function sliceMesh(V, F, cutZ) {
    const segs = [];
    for (let t = 0; t + 2 < F.length; t += 3) {
      const i = [F[t] * 3, F[t + 1] * 3, F[t + 2] * 3];
      const d = [V[i[0] + 2] - cutZ, V[i[1] + 2] - cutZ, V[i[2] + 2] - cutZ];
      if (d[0] > EPSILON && d[1] > EPSILON && d[2] > EPSILON) continue;
      if (d[0] < -EPSILON && d[1] < -EPSILON && d[2] < -EPSILON) continue;
      if (Math.abs(d[0]) <= EPSILON && Math.abs(d[1]) <= EPSILON && Math.abs(d[2]) <= EPSILON) continue;
      const s = d.map(x => (x < 0 ? -1 : 1));          // on-plane counts as +1 (section_cut.py)
      const iso = (s[0] !== s[1] && s[0] !== s[2]) ? 0 : (s[1] !== s[0] && s[1] !== s[2]) ? 1 : 2;
      const a = iso, b = (iso === 0 ? 1 : iso === 1 ? 0 : 0), c = (iso === 0 ? 2 : iso === 1 ? 2 : 1);   // A:v0-v1,v0-v2  B:v1-v0,v1-v2  C:v2-v0,v2-v1
      const edge = (p, q) => {
        const den = d[p] - d[q], tt = Math.abs(den) > EPSILON ? d[p] / den : 0.5;
        return [V[i[p]] + tt * (V[i[q]] - V[i[p]]), V[i[p] + 1] + tt * (V[i[q] + 1] - V[i[p] + 1])];
      };
      const p0 = edge(a, b), p1 = edge(a, c);
      segs.push([p0[0], p0[1], p1[0], p1[1]]);
    }
    return segs;
  }

  function chainSegments(segs, tol) {
    tol = tol === undefined ? TOLERANCE : tol;
    const remaining = segs.map((_, k) => k), chains = [];
    while (remaining.length) {
      const seed = segs[remaining.shift()];
      const chain = [[seed[0], seed[1]], [seed[2], seed[3]]];
      let changed = true;
      while (changed) {
        changed = false;
        const tail = chain[chain.length - 1], head = chain[0];
        if (chain.length > 2 && Math.hypot(tail[0] - head[0], tail[1] - head[1]) < tol) break;
        let bi = -1, bd = tol, bEnd = 0, bWhich = 0;
        for (let k = 0; k < remaining.length; k++) {
          const sg = segs[remaining[k]], ss = [sg[0], sg[1]], se = [sg[2], sg[3]];
          let dd = Math.hypot(ss[0] - tail[0], ss[1] - tail[1]); if (dd < bd) { bd = dd; bi = k; bEnd = 0; bWhich = 0; }
          dd = Math.hypot(se[0] - tail[0], se[1] - tail[1]); if (dd < bd) { bd = dd; bi = k; bEnd = 1; bWhich = 0; }
          dd = Math.hypot(se[0] - head[0], se[1] - head[1]); if (dd < bd) { bd = dd; bi = k; bEnd = 1; bWhich = 1; }
          dd = Math.hypot(ss[0] - head[0], ss[1] - head[1]); if (dd < bd) { bd = dd; bi = k; bEnd = 0; bWhich = 1; }
        }
        if (bi >= 0) {
          const sg = segs[remaining.splice(bi, 1)[0]], ss = [sg[0], sg[1]], se = [sg[2], sg[3]];
          if (bWhich === 0) chain.push(bEnd === 0 ? se : ss); else chain.unshift(bEnd === 1 ? ss : se);
          changed = true;
        }
      }
      if (chain.length >= 3) chains.push(chain);
    }
    return chains;
  }

  function signedArea(p) {   // shoelace, closing edge last->first (np.roll)
    let a = 0; for (let k = 0; k < p.length; k++) { const q = p[(k + 1) % p.length]; a += p[k][0] * q[1] - q[0] * p[k][1]; }
    return 0.5 * a;
  }

  // One element: mesh in local space, centre (world offset), world cut z -> [{points:[[x,y]...] world m, isOuter}]
  function elementContours(V, F, center, cutZ) {
    const segs = sliceMesh(V, F, cutZ - center[2]), out = [];
    for (const ch of chainSegments(segs)) {
      const area = signedArea(ch);
      if (ch.length < 4 || Math.abs(area) < 1e-6) continue;
      out.push({ points: ch.map(p => [p[0] + center[0], p[1] + center[1]]), isOuter: area > 0 });
    }
    return out;
  }
  return { TOLERANCE, EPSILON, sliceMesh, chainSegments, signedArea, elementContours };
});
