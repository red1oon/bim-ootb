# Independent reference for the gradient op (Level 2i, GD1 / GD3). Usage: python3 -I editor/check_grad.py cases.json -> {"max_diff":..,"neg_diff":..,"n":..}
# Written from spec A.1 only (numpy float32), not from grad_ops.js. neg_diff = the same reference with t rounded to 8 bits (negative control: must be LARGER than the threshold).
import json, sys
import numpy as np
f32 = np.float32
d = json.load(open(sys.argv[1])); mx = 0.0; neg = 0.0
def param(o, W, q):
    ys, xs = np.mgrid[0:W, 0:W]; px = (xs.astype(f32) + f32(0.5)); py = (ys.astype(f32) + f32(0.5))
    x0, y0, x1, y1 = f32(o['x0']), f32(o['y0']), f32(o['x1']), f32(o['y1']); dx = x1 - x0; dy = y1 - y0; den = dx * dx + dy * dy
    if o['kind'] == 'linear': t = ((px - x0) * dx + (py - y0) * dy) / den
    else: t = np.sqrt((px - x0) * (px - x0) + (py - y0) * (py - y0)) / np.sqrt(den)
    t = np.clip(t, f32(0), f32(1)).astype(f32)
    return (np.round(t * f32(255)) / f32(255)).astype(f32) if q else t
def run(c, q):
    o = c['op']; W = c['W']; t = param(o, W, q); a = f32(o['a0']) + t * (f32(o['a1']) - f32(o['a0']))
    sel = np.array(c['sel'], dtype=bool).reshape(W, W) if c.get('sel') else np.ones((W, W), dtype=bool)
    if o.get('target') == 'mask':
        base = np.array(c['mask0'], dtype=f32).reshape(W, W); return np.where(sel, a.astype(f32), base)
    pix = np.array(c['pix0'], dtype=f32).reshape(W, W, 4); out = pix.copy(); ia = f32(1) - a
    for k in range(3):
        col = f32(o['c0'][k]) + t * (f32(o['c1'][k]) - f32(o['c0'][k]))
        out[:, :, k] = col * a + pix[:, :, k] * ia
    out[:, :, 3] = a + pix[:, :, 3] * ia
    keep = (a > 0) & sel; return np.where(keep[:, :, None], out, pix)
for c in d:
    W = c['W']; got = np.array(c['out'], dtype=f32).reshape(run(c, False).shape)
    mx = max(mx, float(np.abs(run(c, False) - got).max())); neg = max(neg, float(np.abs(run(c, True) - got).max()))
print(json.dumps({'max_diff': mx, 'neg_diff': neg, 'n': len(d)}))
