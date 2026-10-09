"""Independent check (psd-tools) of 16-bit PSDs. H60a: layer samples and masks read back EXACTLY at depth 16. H60e: psd-tools' float compositor (no 8-bit truncation) vs our working-space float picture.
Thresholds pre-registered in witness_log/HYPOTHESES.md."""
import sys, json, numpy as np
from psd_tools import PSDImage
from psd_tools.composite import composite
d = sys.argv[1]; exp = json.load(open(d + '/expect.json')); checks = []
for name, e in exp.items():
    W = e['W']; psd = PSDImage.open(f'{d}/{name}.psd')
    checks.append({'id': 'H60a', 'name': f'{name}: psd-tools reads depth 16', 'value': psd.depth == 16, 'cmp': '==', 'limit': True})
    bad = 0; badm = 0; nl = 0; nm = 0
    for lid, path in e['layers'].items():
        want = np.fromfile(f'{d}/{path}', np.uint16).reshape(W, W, 4)
        L = [x for x in psd.descendants() if x.name == f'Layer {lid}']
        if not L: bad += W * W * 4; continue
        a = np.round(L[0].numpy() * 65535).astype(np.int64); 
        if a.shape[-1] == 3: a = np.concatenate([a, np.full(a.shape[:2] + (1,), 65535)], -1)
        vis = want[..., 3] > 0; bad += int((a[..., 3] != want[..., 3]).sum()) + int((np.abs(a[..., :3] - want[..., :3].astype(np.int64))[vis]).astype(bool).sum()); nl += 1
    for lid, path in e['masks'].items():
        want = np.fromfile(f'{d}/{path}', np.uint16).reshape(W, W, 4)[..., 0]
        L = [x for x in psd.descendants() if x.name in (f'Layer {lid}', f'Group {lid}', f'Adjustment {lid}')]
        m = np.round(L[0].numpy('mask') * 65535).astype(np.int64) if L and L[0].mask is not None else None
        badm += (W * W) if m is None else int((m.reshape(W, W) != want).sum()); nm += 1
    checks.append({'id': 'H60a', 'name': f'{name}: layer samples differing from what was written ({nl} layers, exact, visible pixels)', 'value': bad, 'cmp': '==', 'limit': 0})
    checks.append({'id': 'H60a', 'name': f'{name}: mask samples differing from what was written ({nm} masks, exact)', 'value': badm, 'cmp': '==', 'limit': 0})
    ours = np.fromfile(f'{d}/{name}.work.f32', np.float32).reshape(W, W, 3).astype(np.float64)
    color, shape, alpha = composite(psd, force=True); c = np.asarray(color, dtype=np.float64)[..., :3]
    diff = np.abs(c - ours) * 255
    checks.append({'id': 'H60e', 'name': f'{name}: psd-tools FLOAT composite vs our float picture, mean abs diff (8-bit levels)', 'value': round(float(diff.mean()), 5), 'cmp': '<=', 'limit': 0.1})
    checks.append({'id': 'H60e', 'name': f'{name}: max abs diff (8-bit levels)', 'value': round(float(diff.max()), 4), 'cmp': '<=', 'limit': 1.5})
print(json.dumps({'checks': checks}))
