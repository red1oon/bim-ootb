"""Usage: python3 -I check_psd_editor.py in.psd meta.json   Independent read (psd-tools) of a PSD exported from an editor log. meta.json = {"W", "layers":[{"mode","opacity","rgba": raw file}], "display": raw RGBA8 file of the editor's composite}.
Prints JSON: layer count, modes, opacity bytes, profile present, per-layer max pixel diff vs the editor's quantised layer, merged preview diff vs the editor display."""
import sys, json, numpy as np
from psd_tools import PSDImage
meta = json.load(open(sys.argv[2])); W = meta['W']; p = PSDImage.open(sys.argv[1]); L = list(p)
out = {'layers': len(L), 'modes': [l.blend_mode.name.lower() for l in L], 'opacity': [l.opacity for l in L], 'profile_resource': bool(p.image_resources.get_data(1039)), 'layer_max_diff': [], 'layer_mean_diff': []}
for l, m in zip(L, meta['layers']):
    exp = np.fromfile(m['rgba'], np.uint8).reshape(W, W, 4).astype(int); got = np.asarray(l.numpy() * 255 + 0.5, dtype=int)
    if got.shape[-1] == 3: got = np.concatenate([got, np.full((W, W, 1), 255)], -1)
    vis = (exp[..., 3] > 0) | (got[..., 3] > 0); d = np.abs(got - exp); d[..., :3][~vis] = 0
    out['layer_max_diff'].append(int(d.max())); out['layer_mean_diff'].append(float(d.mean()))
disp = np.fromfile(meta['display'], np.uint8).reshape(W, W, 4).astype(int); mg = np.asarray(p.topil(apply_icc=False).convert('RGBA'), dtype=int)
d = np.abs(mg - disp); out['merged_max_diff'] = int(d.max()); out['merged_mean_diff'] = float(d[..., :3].mean())
print(json.dumps(out))
