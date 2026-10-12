# Independent reference for the xform resample (Level 1g, X2). Usage: python3 editor/check_xform.py cases.json -> {"max_diff":..,"n":..}
import json, sys
import numpy as np
from scipy.ndimage import map_coordinates
d = json.load(open(sys.argv[1])); mx = 0.0
for c in d:
    W, ch, s = c['W'], c['ch'], c['s']; k = s / 1000.0; src = np.array(c['src'], dtype=np.float64).reshape(W, W, ch); out = np.array(c['out'], dtype=np.float64).reshape(W, W, ch)
    ys, xs = np.mgrid[0:W, 0:W].astype(np.float64)
    u = (xs + 0.5 - c['dx'] - c['cx']) / k + c['cx'] - 0.5; v = (ys + 0.5 - c['dy'] - c['cy']) / k + c['cy'] - 0.5
    ref = np.stack([map_coordinates(src[..., i], [v, u], order=1, mode='grid-constant', cval=float(c['outside'])) for i in range(ch)], axis=-1)
    mx = max(mx, float(np.abs(ref - out).max()))
print(json.dumps({'max_diff': mx, 'n': len(d)}))
