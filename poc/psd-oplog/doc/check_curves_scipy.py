"""Independent reference for the spline MATH: scipy CubicSpline(bc_type='natural'), evaluated exactly like psd-tools (clamp t to [x_first, x_last], clip to [0,1]).
Usage: check_curves_scipy.py IN.json OUT.bin   (IN: {curves:[[ [x,y],... ]], ts:[...]} ; OUT: float64 outputs, curves x ts)"""
import sys, json, numpy as np
from scipy import interpolate
d = json.load(open(sys.argv[1])); ts = np.array(d['ts'], dtype=np.float64); out = np.empty((len(d['curves']), len(ts)), dtype=np.float64)
for i, pts in enumerate(d['curves']):
    x = np.array([p[0] for p in pts], dtype=np.float64) / 255; y = np.array([p[1] for p in pts], dtype=np.float64) / 255
    cs = interpolate.CubicSpline(x, y, bc_type='natural'); out[i] = np.clip(cs(np.clip(ts, x[0], x[-1])), 0, 1)
out.tofile(sys.argv[2])
