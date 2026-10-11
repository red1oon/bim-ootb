# Independent reference for the feather blur (Level 2h, F1). Usage: python3 editor/check_feather.py cases.json -> {"max_diff":..,"n":..}
import json, sys
import numpy as np
from scipy.ndimage import uniform_filter1d
d = json.load(open(sys.argv[1])); mx = 0.0
for c in d:
    W = c['W']; m = np.array(c['sel'], dtype=np.float64).reshape(W, W); r = c['r']; out = np.array(c['out'], dtype=np.float64).reshape(W, W)
    a = m
    for _ in range(2):
        a = uniform_filter1d(a, size=2 * r + 1, axis=1, mode='nearest'); a = uniform_filter1d(a, size=2 * r + 1, axis=0, mode='nearest')
    mx = max(mx, float(np.abs(a - out).max()))
print(json.dumps({'max_diff': mx, 'n': len(d)}))
