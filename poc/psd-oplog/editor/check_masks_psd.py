"""Usage: python3 -I check_masks_psd.py in.psd meta.json   Independent psd-tools read of an editor PSD with masks. meta = {"W","display": raw RGBA8 composite of the visible layers, "masks": {"<layer name>": raw uint8 W*W file}|null per name}. Prints names, which layers have a mask, mask max diff vs expected, merged max diff."""
import sys, json, numpy as np
from psd_tools import PSDImage
meta = json.load(open(sys.argv[2])); W = meta['W']; p = PSDImage.open(sys.argv[1]); L = list(p); out = {'names': [l.name for l in L], 'has_mask': [l.mask is not None for l in L], 'visible': [bool(l.visible) for l in L], 'mask_max_diff': {}}
for l in L:
    f = meta['masks'].get(l.name)
    if f and l.mask is not None:
        exp = np.fromfile(f, np.uint8).reshape(W, W).astype(int); got = np.asarray(l.mask.topil().convert('L'), dtype=int); full = np.zeros((W, W), int)
        if got.shape == (W, W): full = got
        out['mask_max_diff'][l.name] = int(np.abs(full - exp).max())
disp = np.fromfile(meta['display'], np.uint8).reshape(W, W, 4).astype(int); mg = np.asarray(p.topil(apply_icc=False).convert('RGBA'), dtype=int); out['merged_max_diff'] = int(np.abs(mg - disp).max())
if meta.get('display_float'):
    f = np.fromfile(meta['display_float'], np.uint8).reshape(W, W, 4).astype(int); out['merged_max_diff_float'] = int(np.abs(mg - f).max())
print(json.dumps(out))
