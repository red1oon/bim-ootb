import sys, json, os, numpy as np
from psd_tools import PSDImage
d = os.path.join(os.path.dirname(__file__), '.emit_diag'); W = 128
rows = []
for f in json.load(open(d + '/features.json')):
    ours = np.fromfile(f'{d}/{f}.work.rgba8', np.uint8).reshape(W, W, 4).astype(int)
    psd = PSDImage.open(f'{d}/{f}.psd')
    comp = np.asarray(psd.composite(force=True, apply_icc=False).convert('RGBA'), dtype=int); dd = np.abs(comp[..., :3] - ours[..., :3])
    merged = np.asarray(psd.topil(apply_icc=False).convert('RGBA'), dtype=int); dm = np.abs(merged[..., :3] - ours[..., :3])
    rows.append((f, round(float(dd.mean()), 3), int(dd.max()), round(float((dd.max(axis=2) > 8).mean() * 100), 1), int(dm.max())))
print(f"{'feature':24s} {'psd-tools composite vs ours: mean':>34s} {'max':>5s} {'%px>8':>6s}   stored-merged-vs-ours max")
for r in rows: print(f"{r[0]:24s} {r[1]:34.3f} {r[2]:5d} {r[3]:6.1f}   {r[4]}")
