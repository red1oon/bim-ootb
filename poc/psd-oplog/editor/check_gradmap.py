# Independent reference for the Gradient Map adjustment (Level 2i, GD5). Usage: python3 -I editor/check_gradmap.py cases.json -> {"max_diff":..,"n":..}
# Written from spec A.2 only: luminance = round-half-up(255 * (0.3 r + 0.59 g + 0.11 b)) in float32; output = piecewise-linear interpolation of the integer stops [pos,r,g,b] / 255 (float64).
import json, sys
import numpy as np
d = json.load(open(sys.argv[1])); mx = 0.0
for c in d:
    W = c['W']; px = np.array(c['in'], dtype=np.float32).reshape(-1, 4); out = np.array(c['out'], dtype=np.float32).reshape(-1, 4)
    lum = np.floor(np.float32(255) * (np.float32(0.3) * px[:, 0] + np.float32(0.59) * px[:, 1] + np.float32(0.11) * px[:, 2]) + np.float32(0.5)).astype(int)
    st = np.array(c['stops'], dtype=np.float64); pos = st[:, 0]
    ref = np.stack([np.interp(lum, pos, st[:, k] / 255.0) for k in (1, 2, 3)], axis=1)
    mx = max(mx, float(np.abs(ref - out[:, :3]).max()))
print(json.dumps({'max_diff': mx, 'n': len(d)}))
