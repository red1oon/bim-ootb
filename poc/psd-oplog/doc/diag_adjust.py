import json, os, numpy as np
from psd_tools import PSDImage
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.emit_adjust_diag'); W = 128; feats = json.load(open(d + '/feats.json'))
def levels(c, P, quant):
    if quant: c = np.round(c * 255) / 255
    x = np.clip((c - P['in_black'] / 255) / ((P['in_white'] - P['in_black']) / 255), 0, 1) ** (100.0 / P['gamma_x100'])
    return np.clip(P['out_black'] / 255 + x * (P['out_white'] - P['out_black']) / 255, 0, 1)
print(f"{'feature':26s} {'psd-tools vs ours (mean)':>26s} {'vs ours on 8-bit-quantised input':>34s}")
for name, (kind, P) in feats.items():
    psd = PSDImage.open(f'{d}/{name}.psd'); ours = np.fromfile(f'{d}/{name}.work.rgba8', np.uint8).reshape(W, W, 4).astype(float)[..., :3]; pre = np.fromfile(f'{d}/{name}.pre.rgba8', np.uint8).reshape(W, W, 4).astype(float)[..., :3] / 255
    comp = np.asarray(psd.composite(force=True, apply_icc=False).convert('RGB'), dtype=float)
    unq = np.abs(comp - ours).mean()
    q = (1 - pre if kind == 'invert' else levels(pre, P, True)) * 255; qd = np.abs(comp - (np.floor(q + 0.5))).mean()
    print(f'{name:26s} {unq:26.3f} {qd:34.3f}')
