"""Usage: python3 -I check_adjust_psd.py in.psd meta.json   Independent psd-tools read of an editor PSD with adjustment layers (spec Level 2d, AJ7). meta = {"W","display": raw RGBA8 editor composite}. Prints each top-level node (kind, name, visible, opacity) and the merged-image difference."""
import sys, json, numpy as np
from psd_tools import PSDImage
meta = json.load(open(sys.argv[2])); W = meta['W']; p = PSDImage.open(sys.argv[1])
nodes = [{'kind': getattr(l, 'kind', 'group' if l.is_group() else 'layer'), 'name': l.name, 'visible': bool(l.visible), 'opacity': l.opacity} for l in p]
disp = np.fromfile(meta['display'], np.uint8).reshape(W, W, 4).astype(int); mg = np.asarray(p.topil(apply_icc=False).convert('RGBA'), dtype=int)
d = np.abs(mg - disp).max(2); print(json.dumps({'nodes': nodes, 'merged_max_diff': int(d.max()), 'merged_over1': int((d > 1).sum())}))
