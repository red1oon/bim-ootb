# Independent reference for the shape op (Level 2k, SP1). Usage: python3 -I editor/check_shape.py cases.json -> {"max_diff":..,"neg_diff":..,"n":..}
# Written from kit spec S.1 only (numpy float32): signed distance -> coverage clamp(0.5 - d); fill then stroke, premultiplied source-over. neg_diff = the same reference with coverage clamp(1 - d) (negative control: must be LARGER than the threshold).
import json, sys
import numpy as np
f32 = np.float32
d = json.load(open(sys.argv[1])); mx = 0.0; neg = 0.0
def dist(o, W):
    ys, xs = np.mgrid[0:W, 0:W]; px = xs.astype(f32) + f32(0.5); py = ys.astype(f32) + f32(0.5)
    x0, y0, x1, y1 = (f32(o[k]) for k in ('x0', 'y0', 'x1', 'y1'))
    if o['kind'] == 'line':
        ax = px - x0; ay = py - y0; lx = x1 - x0; ly = y1 - y0; ll = lx * lx + ly * ly
        h = np.clip((ax * lx + ay * ly) / ll, f32(0), f32(1)) if ll > 0 else np.zeros_like(px)
        return np.sqrt((ax - lx * h) ** 2 + (ay - ly * h) ** 2).astype(f32) - f32(o['stroke']['w']) / f32(2)
    cx = (x0 + x1) / f32(2); cy = (y0 + y1) / f32(2); hw = (x1 - x0) / f32(2); hh = (y1 - y0) / f32(2)
    if o['kind'] == 'rect':
        r = f32(o.get('r', 0)); qx = np.abs(px - cx) - (hw - r); qy = np.abs(py - cy) - (hh - r)
        return (np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - r).astype(f32)
    u = (px - cx) / hw; v = (py - cy) / hh; f = np.sqrt(u * u + v * v); g = np.sqrt((u / hw) ** 2 + (v / hh) ** 2)
    with np.errstate(divide='ignore', invalid='ignore'): dd = (f - f32(1)) * f / g
    return np.where(f == 0, -np.minimum(hw, hh), dd).astype(f32)
def run(c, wide):
    o = c['op']; W = c['W']; pix = np.array(c['pix0'], dtype=f32).reshape(W, W, 4); out = pix.copy(); dd = dist(o, W)
    sel = np.array(c['sel'], dtype=bool).reshape(W, W) if c.get('sel') else np.ones((W, W), dtype=bool)
    cov = (lambda x: np.clip(f32(1) - x, f32(0), f32(1))) if wide else (lambda x: np.clip(f32(0.5) - x, f32(0), f32(1)))
    def over(a, col):
        nonlocal out; ia = f32(1) - a
        for k in range(3): out[:, :, k] = np.where(sel & (a > 0), f32(col[k]) * a + out[:, :, k] * ia, out[:, :, k])
        out[:, :, 3] = np.where(sel & (a > 0), a + out[:, :, 3] * ia, out[:, :, 3])
    if o['kind'] == 'line': over(cov(dd) * f32(o['stroke']['a']), o['stroke']['c']); return out
    if o.get('fill', True): over(cov(dd) * f32(o['a']), o['c'])
    if 'stroke' in o: over(cov(np.abs(dd) - f32(o['stroke']['w']) / f32(2)) * f32(o['stroke']['a']), o['stroke']['c'])
    return out
for c in d:
    got = np.array(c['out'], dtype=f32).reshape(c['W'], c['W'], 4)
    mx = max(mx, float(np.abs(run(c, False) - got).max())); neg = max(neg, float(np.abs(run(c, True) - got).max()))
print(json.dumps({'max_diff': mx, 'neg_diff': neg, 'n': len(d)}))
