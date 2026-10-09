"""Independent check (psd-tools) of exported PSDs with curves. H55: points read as written. H52: psd-tools' compositor vs our float picture truncated like psd-tools; H52b diagnostic: our curve applied to
floor(255*c)/255 inputs (psd-tools floors its LUT input to 8 bits). Thresholds pre-registered in witness_log/HYPOTHESES.md."""
import sys, json, numpy as np
from psd_tools import PSDImage
d = sys.argv[1]; exp = json.load(open(d + '/expect.json')); checks = []
def curve_nodes(layers):
    out = []
    for L in layers:
        n = type(L).__name__
        if L.is_group(): out += curve_nodes(L)
        elif n == 'Curves':
            ex = L.extra; pts = None
            if ex is not None:
                for data in ex:
                    if data.channel_id == 0: pts = [[int(p[1]), int(p[0])] for p in data.points]
            out.append(('curves', pts, L.opacity))
    return out
def want_nodes(t):
    out = []
    for n in t:
        if n['kind'] == 'group': out += want_nodes(n['children'])
        elif n['kind'] == 'adjust' and n['akind'] == 'curves': out.append(('curves', n['params']['points'], n['opacity']))
    return out
for name, e in exp.items():
    W = e['W']; psd = PSDImage.open(f'{d}/{name}.psd'); got = curve_nodes(psd); want = want_nodes(e['tree'])
    checks.append({'id': 'H55', 'name': f'{name}: psd-tools reads the same curve points and opacities ({len(want)} curves)', 'value': json.dumps(got) == json.dumps(want), 'cmp': '==', 'limit': True})
    ours = np.fromfile(f'{d}/{name}.work.rgba8', np.uint8).reshape(W, W, 4).astype(int)
    f = np.fromfile(f'{d}/{name}.work.f32', np.float32).reshape(W, W, 3).astype(np.float64)
    comp = np.asarray(psd.composite(force=True, apply_icc=False).convert('RGBA'), dtype=int); dd = np.abs(comp[..., :3] - ours[..., :3]); worst = dd.max(axis=2)
    d_trunc = np.abs(comp[..., :3] - np.floor(255 * f + 1e-9))
    checks.append({'id': 'H52', 'name': f'{name}: psd-tools compositor vs our FLOAT picture truncated like psd-tools, mean levels', 'value': round(float(d_trunc.mean()), 4), 'cmp': '<=', 'limit': 0.8})
    checks.append({'id': 'H52', 'name': f'{name}: percent of pixels over 8 levels (vs our rounded picture)', 'value': round(float((worst > 8).mean() * 100), 3), 'cmp': '<=', 'limit': 0.5})
    checks.append({'id': 'H52x', 'name': f'{name}: info: max levels', 'value': int(worst.max()), 'cmp': '<=', 'limit': 255})
print(json.dumps({'checks': checks}))
