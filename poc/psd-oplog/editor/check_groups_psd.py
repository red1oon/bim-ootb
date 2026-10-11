"""Usage: python3 -I check_groups_psd.py in.psd meta.json   Independent psd-tools read of an editor PSD with groups (spec Level 2c, G6). meta = {"W","display": raw RGBA8 editor composite}. Prints the layer tree (kind, name, visible, blend mode, clipping, children) and merged / own-composite diffs."""
import sys, json, numpy as np
from psd_tools import PSDImage
meta = json.load(open(sys.argv[2])); W = meta['W']; p = PSDImage.open(sys.argv[1])
def walk(node):
    out = []
    for l in node:
        d = {'kind': 'group' if l.is_group() else 'layer', 'name': l.name, 'visible': bool(l.visible), 'blend': l.blend_mode.name.lower(), 'clipping': bool(getattr(l, 'clipping_layer', False)), 'opacity': l.opacity}
        if l.is_group(): d['children'] = walk(l)
        out.append(d)
    return out
disp = np.fromfile(meta['display'], np.uint8).reshape(W, W, 4).astype(int)
mg = np.asarray(p.topil(apply_icc=False).convert('RGBA'), dtype=int); own = np.asarray(p.composite(apply_icc=False).convert('RGBA'), dtype=int)
print(json.dumps({'tree': walk(p), 'merged_max_diff': int(np.abs(mg - disp).max()), 'psdtools_composite_max_diff': int(np.abs(own - disp).max()), 'psdtools_composite_mean_diff': float(np.abs(own - disp)[..., :3].mean())}))
