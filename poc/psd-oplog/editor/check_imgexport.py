# Independent decode / compare for image export (Level 1l, EX1-EX4). Usage: python3 -I editor/check_imgexport.py spec.json
# spec = [{"name", "got": path, "ref": path|null, "bg": [r,g,b] 0..255 | null, "probe": [[x,y],...]}]. Pillow decodes; JPEG / WebP are compared with the reference PNG after compositing BOTH on the same background.
import json, sys
import numpy as np
from PIL import Image
out = {}
def comp(rgba, bg):
    a = rgba[:, :, 3:4].astype(np.float64) / 255.0; return rgba[:, :, :3].astype(np.float64) * a + np.array(bg, dtype=np.float64) * (1 - a)
for c in json.load(open(sys.argv[1])):
    im = Image.open(c['got']); fmt = im.format; im = im.convert('RGBA'); got = np.asarray(im); r = {'format': fmt, 'w': im.width, 'h': im.height, 'probe': [list(map(int, got[y, x])) for x, y in c.get('probe', [])]}
    if c.get('ref'):
        ref = np.asarray(Image.open(c['ref']).convert('RGBA'))
        if ref.shape == got.shape:
            bg = c.get('bg') or [255, 255, 255]; d = np.abs(comp(ref, bg) - comp(got, bg)); r['mae'] = float(d.mean()); r['p99'] = float(np.percentile(d, 99)); r['max'] = float(d.max())
            r['rgba_max_diff'] = int(np.abs(ref.astype(int) - got.astype(int)).max())
        else: r['shape_mismatch'] = [list(ref.shape), list(got.shape)]
    out[c['name']] = r
print(json.dumps(out))
