"""Usage: python3 -I check_brush_ref.py spec.json
Independent float64 reference for filters/brush.js: re-implements the DEFINITIONS in HYPOTHESES.md (hard dab, polyline positions, smudge) in numpy, and draws exact circle coverage with cairocffi (the one external reference).
spec.json = {"jobs":[{"name","W","input" (raw float32 RGBA premult file or null for empty),"ops":[...],"out" (raw float64 file)}], "cairo":[{"name","W","x","y","r","out"}]}"""
import sys, json, math, numpy as np
spec = json.load(open(sys.argv[1]))
def positions(pts, r, spacing):
    step = max(spacing * r, 1.0); out = [(pts[0][0], pts[0][1])]; carry = 0.0
    for s in range(len(pts) - 1):
        px, py = pts[s]; qx, qy = pts[s + 1]; dx, dy = qx - px, qy - py; L = math.sqrt(dx * dx + dy * dy)
        if L == 0: continue
        t = step - carry
        while t <= L: out.append((px + dx * (t / L), py + dy * (t / L))); t += step
        carry = L - (t - step)
    return out
def hdab(a, o):
    W = a.shape[0]; x0 = max(0, math.floor(o['x'] - o['r'] - 1)); x1 = min(W - 1, math.ceil(o['x'] + o['r'] + 1)); y0 = max(0, math.floor(o['y'] - o['r'] - 1)); y1 = min(W - 1, math.ceil(o['y'] + o['r'] + 1))
    ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1]; d = np.sqrt((xs + 0.5 - o['x']) ** 2 + (ys + 0.5 - o['y']) ** 2); cov = np.clip(o['r'] - d + 0.5, 0, 1) * o['a']
    sub = a[y0:y1 + 1, x0:x1 + 1]; c = np.array(o['c'])
    sub[..., :3] = c * cov[..., None] + sub[..., :3] * (1 - cov[..., None]); sub[..., 3] = cov + sub[..., 3] * (1 - cov)
def smudge(a, o):
    W = a.shape[0]; s = o['s']
    if not s > 0: return
    R = math.ceil(o['r']); n = 2 * R + 1; jj, ii = np.mgrid[-R:R + 1, -R:R + 1]; t = 1 - (ii * ii + jj * jj) / (o['r'] * o['r']); f = np.where(t > 0, t * t, 0.0)
    pos = positions(o['pts'], o['r'], 0.1)
    pad = np.zeros((W + 2 * R, W + 2 * R, 4)); pad[R:R + W, R:R + W] = a   # off-canvas = 0, never written back
    cx, cy = math.floor(pos[0][0]), math.floor(pos[0][1]); P = pad[cy:cy + n, cx:cx + n].copy()   # offsets -R..R around the anchor, in padded coords
    for q in range(1, len(pos)):
        cx, cy = math.floor(pos[q][0]), math.floor(pos[q][1]); B = pad[cy:cy + n, cx:cx + n].copy()
        ys, xs = cy + jj, cx + ii; inside = (xs >= 0) & (ys >= 0) & (xs < W) & (ys < W); live = (f > 0)
        w = (s * f)[..., None]; new = B * (1 - w) + P * w; m = (live & inside)[..., None]
        pad[cy:cy + n, cx:cx + n] = np.where(m, new, B)
        P = np.where((live)[..., None], s * P + (1 - s) * B, P)
    a[:] = pad[R:R + W, R:R + W]
def f32(v):
    if isinstance(v, list): return [f32(x) for x in v]
    if isinstance(v, dict): return {k: (f32(x) if k in ('x', 'y', 'r', 'a', 'c', 's', 'pts') else x) for k, x in v.items()}
    return float(np.float32(v)) if isinstance(v, (int, float)) else v
for j in spec['jobs']:
    if j.get('f32in'): j['ops'] = [f32(o) for o in j['ops']]
    W = j['W']; a = np.fromfile(j['input'], np.float32).reshape(W, W, 4).astype(np.float64) if j.get('input') else np.zeros((W, W, 4))
    for o in j['ops']:
        if o['op'] == 'hdab': hdab(a, o)
        elif o['op'] == 'smudge': smudge(a, o)
        elif o['op'] == 'stroke':
            for (x, y) in positions(o['pts'], o['r'], o.get('spacing', 0.25)): hdab(a, {'x': x, 'y': y, 'r': o['r'], 'c': o['c'], 'a': o['a']})
    a.tofile(j['out'])
if spec.get('cairo'):
    import cairocffi as cairo
    for c in spec['cairo']:
        W = c['W']; surf = cairo.ImageSurface(cairo.FORMAT_A8, W, W); ctx = cairo.Context(surf); ctx.set_antialias(cairo.ANTIALIAS_BEST); ctx.arc(c['x'], c['y'], c['r'], 0, 2 * math.pi); ctx.fill(); surf.flush()
        buf = np.frombuffer(surf.get_data(), np.uint8).reshape(W, surf.get_stride())[:, :W].astype(np.float64) / 255.0; buf.tofile(c['out'])
print(json.dumps({'numpy': np.__version__, 'cairocffi': getattr(__import__('cairocffi'), 'version', '?') if spec.get('cairo') else None}))
