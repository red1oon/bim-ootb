# Independent reference for the layer effects (Level 2l, FX1 / FX2). Usage: python3 -I editor/check_fx.py cases.json -> {"shadow": {...}, "stroke": {...}}
# Written from kit spec X.1 only. shadow: zero-fill shift of the alpha, tint (float32), scipy gaussian_filter(mode='constant', truncate=4) in float64, over-composite behind the layer (float32).
# stroke: scipy.ndimage.distance_transform_edt distance to the nearest alpha >= 0.5 pixel, ring coverage clip(w + 0.5 - d, 0, 1) * a, composite behind the layer (float32).
# Negative controls: shadow with reflect-edge blur (no padding); stroke with a Chebyshev (square) distance.
import json, sys
import numpy as np
from scipy.ndimage import gaussian_filter, distance_transform_edt
f32 = np.float32
d = json.load(open(sys.argv[1])); res = {'shadow': {'max': 0.0, 'mean': 0.0, 'neg': 0.0, 'n': 0}, 'stroke': {'max': 0.0, 'neg': 0.0, 'n': 0}}
def over(pix, add, sel):
    ia = f32(1) - pix[:, :, 3]; out = pix + add * ia[:, :, None]
    return np.where(sel[:, :, None], out, pix)
for c in d:
    o = c['op']; W = c['W']; pix = np.array(c['pix0'], dtype=f32).reshape(W, W, 4); got = np.array(c['out'], dtype=f32).reshape(W, W, 4)
    sel = np.array(c['sel'], dtype=bool).reshape(W, W) if c.get('sel') else np.ones((W, W), dtype=bool)
    if o['kind'] == 'shadow':
        dx, dy = o['dx'], o['dy']; al = np.zeros((W, W), dtype=f32)
        ys0, ys1 = max(0, dy), min(W, W + dy); xs0, xs1 = max(0, dx), min(W, W + dx)
        al[ys0:ys1, xs0:xs1] = pix[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx, 3]
        v = f32(o['a']) * al; s = np.stack([f32(o['c'][0]) * v, f32(o['c'][1]) * v, f32(o['c'][2]) * v, v], axis=2).astype(f32)
        def blur(mode):
            if o['blur_x10'] == 0: return s
            sg = o['blur_x10'] / 10.0; return gaussian_filter(s.astype(np.float64), sigma=(sg, sg, 0), mode=mode, truncate=4.0, cval=0.0).astype(f32)
        ref = over(pix, blur('constant'), sel); neg = over(pix, blur('reflect'), sel)
        r = res['shadow']; df = np.abs(ref - got); r['max'] = max(r['max'], float(df.max())); r['mean'] = max(r['mean'], float(df.mean())); r['neg'] = max(r['neg'], float(np.abs(neg - got).max())); r['n'] += 1
    else:
        inside = pix[:, :, 3] >= f32(0.5)
        def ring(dist):
            k = np.clip(f32(o['w']) + f32(0.5) - dist.astype(f32), f32(0), f32(1)) * f32(o['a']); k = np.where(inside, f32(0), k).astype(f32)
            add = np.stack([f32(o['c'][0]) * k, f32(o['c'][1]) * k, f32(o['c'][2]) * k, k], axis=2).astype(f32); return over(pix, add, sel)
        if inside.any():
            ref = ring(distance_transform_edt(~inside))
            # Chebyshev distance by brute force on the (small) case: max(|dx|,|dy|) to the nearest inside pixel
            ys, xs = np.nonzero(inside); yy, xx = np.mgrid[0:W, 0:W]; cheb = np.full((W, W), 1e9)
            for y0, x0 in zip(ys[::max(1, len(ys) // 400)], xs[::max(1, len(xs) // 400)]): cheb = np.minimum(cheb, np.maximum(np.abs(yy - y0), np.abs(xx - x0)))
            neg = ring(cheb)
        else: ref = pix; neg = pix
        r = res['stroke']; r['max'] = max(r['max'], float(np.abs(ref - got).max())); r['neg'] = max(r['neg'], float(np.abs(neg - got).max())); r['n'] += 1
print(json.dumps(res))
