"""Usage: python3 -I check_select_mask.py boxes.json   Independent numpy float64 implementation of the selection masks (spec Level 1c, S5). boxes = {"W", "boxes":[[kind,x0,y0,x1,y1],...]}. Prints JSON [{count, sha256}]."""
import sys, json, hashlib, numpy as np
d = json.load(open(sys.argv[1])); W = d['W']; out = []
for kind, x0, y0, x1, y1 in d['boxes']:
    m = np.zeros((W, W), np.uint8)
    if kind == 'rect': m[y0:y1, x0:x1] = 1
    else:
        cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
        xs = (np.arange(x0, x1, dtype=np.float64) + 0.5 - cx) / rx; ys = (np.arange(y0, y1, dtype=np.float64) + 0.5 - cy) / ry
        m[y0:y1, x0:x1] = ((xs[None, :] * xs[None, :]) + (ys[:, None] * ys[:, None]) <= 1).astype(np.uint8)
    out.append({'count': int(m.sum()), 'sha256': hashlib.sha256(m.tobytes()).hexdigest()})
print(json.dumps(out))
