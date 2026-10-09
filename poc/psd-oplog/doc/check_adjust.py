"""Independent check (psd-tools) of exported PSDs with adjustment layers. H48: kinds and parameters read as written. H44a: continuous kinds vs psd-tools' compositor like for like.
H44b: discontinuous kinds, tolerance-aware (a pixel disagrees only if the outputs differ AND our pre-adjustment value is not within 1.5 8-bit levels of a boundary).
Thresholds pre-registered in witness_log/HYPOTHESES.md."""
import sys, json, numpy as np
from psd_tools import PSDImage
d = sys.argv[1]; exp = json.load(open(d + '/expect.json')); checks = []
def adj_nodes(layers):
    out = []
    for L in layers:
        n = type(L).__name__
        if L.is_group(): out += adj_nodes(L)
        elif n in ('Levels', 'Invert', 'Threshold', 'Posterize'):
            if n == 'Levels':
                c = L.data[0]; out.append(('levels', dict(in_black=int(c.input_floor), in_white=int(c.input_ceiling), gamma_x100=int(round(c.gamma)), out_black=int(c.output_floor), out_white=int(c.output_ceiling)), L.opacity))
            elif n == 'Threshold': out.append(('threshold', dict(level=int(L.threshold)), L.opacity))
            elif n == 'Posterize': out.append(('posterize', dict(levels=int(L.posterize)), L.opacity))
            else: out.append(('invert', {}, L.opacity))
    return out
def want_nodes(t):
    out = []
    for n in t:
        if n['kind'] == 'group': out += want_nodes(n['children'])
        elif n['kind'] == 'adjust': out.append((n['akind'], n['params'], n['opacity']))
    return out
for name, e in exp.items():
    W = e['W']; psd = PSDImage.open(f'{d}/{name}.psd'); got = adj_nodes(psd); want = want_nodes(e['tree'])
    checks.append({'id': 'H48', 'name': f'{name}: psd-tools reads the same adjustment kinds, parameters and opacities ({len(want)} nodes)', 'value': json.dumps(got, sort_keys=True) == json.dumps([(k, p, o) for (k, p, o) in want], sort_keys=True), 'cmp': '==', 'limit': True})
    ours = np.fromfile(f'{d}/{name}.work.rgba8', np.uint8).reshape(W, W, 4).astype(int)
    comp = np.asarray(psd.composite(force=True, apply_icc=False).convert('RGBA'), dtype=int); dd = np.abs(comp[..., :3] - ours[..., :3]); worst = dd.max(axis=2)
    if not e['discontinuous']:
        f = np.fromfile(f'{d}/{name}.work.f32', np.float32).reshape(W, W, 3).astype(np.float64)
        d_trunc = np.abs(comp[..., :3] - np.floor(255 * f + 1e-9)); d_round = np.abs(comp[..., :3] - np.floor(255 * f + 0.5))
        checks.append({'id': 'H44d', 'name': f'{name}: psd-tools vs our FLOAT picture truncated like psd-tools does, mean levels', 'value': round(float(d_trunc.mean()), 4), 'cmp': '<=', 'limit': 0.7})
        checks.append({'id': 'H44d', 'name': f'{name}: truncation-aligned mean is lower than the rounded comparison (diff of means, positive = lower)', 'value': round(float(d_round.mean() - d_trunc.mean()), 4), 'cmp': '>=', 'limit': 0.0})
        checks.append({'id': 'H44dx', 'name': f'{name}: info: vs rounded float, mean levels', 'value': round(float(d_round.mean()), 4), 'cmp': '<=', 'limit': 255})
        checks.append({'id': 'H44a', 'name': f'{name}: percent of pixels over 8 levels', 'value': round(float((worst > 8).mean() * 100), 3), 'cmp': '<=', 'limit': 0.5})
        checks.append({'id': 'H44ax', 'name': f'{name}: max levels (info)', 'value': int(worst.max()), 'cmp': '<=', 'limit': 255})
    else:
        pre = np.fromfile(f'{d}/{name}.pre.rgba8', np.uint8).reshape(W, W, 4).astype(float)
        kind, P, _ = want_nodes(e['tree'])[-1]
        if kind == 'threshold':
            lum8 = 0.3 * pre[..., 0] + 0.59 * pre[..., 1] + 0.11 * pre[..., 2]; near = np.abs(lum8 - (P['level'] - 0.5)) <= 1.5
        else:
            n = P['levels']; bnd = np.zeros(pre.shape[:2], bool)
            for k in range(1, n): bnd |= (np.abs(pre[..., :3] - 256.0 * k / n) <= 1.5).any(axis=2)
            near = bnd
        disagree = worst > 8; outside = disagree & ~near
        checks.append({'id': 'H44b', 'name': f'{name}: pixels where psd-tools and ours differ (>8 levels) and the pre-adjustment value is NOT near a boundary, percent', 'value': round(float(outside.mean() * 100), 4), 'cmp': '<=', 'limit': 0.1})
        checks.append({'id': 'H44bx', 'name': f'{name}: info: percent of pixels differing >8 levels near a boundary (flips)', 'value': round(float((disagree & near).mean() * 100), 4), 'cmp': '<=', 'limit': 100})
        checks.append({'id': 'H44bn', 'name': f'{name}: non-vacuous: percent of pixels within the boundary band', 'value': round(float(near.mean() * 100), 3), 'cmp': '>=', 'limit': 0.1})
print(json.dumps({'checks': checks}))
