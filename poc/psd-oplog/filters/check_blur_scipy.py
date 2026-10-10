"""Usage: python3 -I check_blur_scipy.py spec.json   Reference for the blur op: scipy.ndimage.gaussian_filter on a float64 copy of each premultiplied RGBA float32 layer,
mode='reflect', truncate=4.0, sigma on the two spatial axes only. spec.json = [{"name","W","input" (raw float32 file),"sigma","out" (raw float64 file)}]. Prints the scipy version."""
import sys, json, numpy as np, scipy
from scipy.ndimage import gaussian_filter
for c in json.load(open(sys.argv[1])):
    a = np.fromfile(c['input'], np.float32).reshape(c['W'], c['W'], 4).astype(np.float64)
    gaussian_filter(a, sigma=(c['sigma'], c['sigma'], 0), mode='reflect', truncate=4.0).tofile(c['out'])
print(json.dumps({'scipy': scipy.__version__, 'numpy': np.__version__}))
