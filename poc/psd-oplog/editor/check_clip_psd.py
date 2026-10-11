"""Usage: python3 -I check_clip_psd.py in.psd meta.json   Independent psd-tools read of an editor PSD with clipping layers (spec Level 2b, CL6). meta = {"W","display": raw RGBA8 composite of the editor}. Prints names, clipping flags, merged max diff and psd-tools' OWN composite() max diff vs the editor composite."""
import sys, json, numpy as np
from psd_tools import PSDImage
meta = json.load(open(sys.argv[2])); W = meta['W']; p = PSDImage.open(sys.argv[1]); L = list(p)
disp = np.fromfile(meta['display'], np.uint8).reshape(W, W, 4).astype(int)
mg = np.asarray(p.topil(apply_icc=False).convert('RGBA'), dtype=int); own = np.asarray(p.composite(apply_icc=False).convert('RGBA'), dtype=int)
print(json.dumps({'names': [l.name for l in L], 'clipping': [bool(getattr(l, 'clipping_layer', False)) for l in L], 'merged_max_diff': int(np.abs(mg - disp).max()), 'psdtools_composite_max_diff': int(np.abs(own - disp).max()), 'psdtools_composite_mean_diff': float(np.abs(own - disp)[..., :3].mean())}))
