"""Usage: python3 -I check_layers_psd.py in.psd meta.json   Independent read (psd-tools) of an editor PSD: names, visibility, stacking order (bottom to top), opacity bytes, merged image vs expected RGBA8 file.
meta.json = {"W", "display": raw RGBA8 file of the composite of the VISIBLE layers}. Prints JSON."""
import sys, json, numpy as np
from psd_tools import PSDImage
meta = json.load(open(sys.argv[2])); W = meta['W']; p = PSDImage.open(sys.argv[1]); L = list(p)
disp = np.fromfile(meta['display'], np.uint8).reshape(W, W, 4).astype(int); mg = np.asarray(p.topil(apply_icc=False).convert('RGBA'), dtype=int)
print(json.dumps({'names': [l.name for l in L], 'visible': [bool(l.visible) for l in L], 'opacity': [l.opacity for l in L], 'merged_max_diff': int(np.abs(mg - disp).max())}))
