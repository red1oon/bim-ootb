"""Independent check (psd-tools): modes read as written; psd-tools' own compositor vs our working-space picture. Thresholds pre-registered in witness_log/HYPOTHESES.md (H30d)."""
import sys, json, numpy as np
from psd_tools import PSDImage
d = sys.argv[1]; exp = json.load(open(d + '/expect.json')); checks = []
def walk(layers):
    out = []
    for L in layers:
        m = 'pass-through' if (L.is_group() and L.blend_mode.name == 'PASS_THROUGH') else L.blend_mode.name.lower().replace('_', '-')
        out.append({'kind': 'group' if L.is_group() else 'layer', 'mode': m, **({'children': walk(L)} if L.is_group() else {})})
    return out
def modes(t): return [(n['kind'], n['mode'], modes(n['children']) if 'children' in n else None) for n in t]
for name, e in exp.items():
    W = e['W']; psd = PSDImage.open(f'{d}/{name}.psd')
    want = [(n['kind'], n['mode'], None) for n in e['tree']]
    def strip(t): return [(k, m, strip_c(c)) for (k, m, c) in t]
    def strip_c(c): return None if c is None else strip(c)
    def tomodes(t): return [(n['kind'], n['mode'], tomodes(n['children']) if 'children' in n else None) for n in t]
    checks.append({'id': 'H30d', 'name': f'{name}: psd-tools reads the same modes and nesting', 'value': json.dumps(modes(walk(psd))) == json.dumps(tomodes(e['tree'])), 'cmp': '==', 'limit': True})
    ours = np.fromfile(f'{d}/{name}.work.rgba8', np.uint8).reshape(W, W, 4).astype(int)
    comp = np.asarray(psd.composite(force=True, apply_icc=False).convert('RGBA'), dtype=int); dd = np.abs(comp[..., :3] - ours[..., :3])
    checks.append({'id': 'H30d', 'name': f'{name}: psd-tools own compositor vs ours, mean levels', 'value': round(float(dd.mean()), 4), 'cmp': '<=', 'limit': 1.0})
    checks.append({'id': 'H30dp', 'name': f'{name}: percent of pixels over 8 levels', 'value': round(float((dd.max(axis=2) > 8).mean() * 100), 3), 'cmp': '<=', 'limit': 0.5})
    checks.append({'id': 'H30dx', 'name': f'{name}: max levels (info)', 'value': int(dd.max()), 'cmp': '<=', 'limit': 255})
print(json.dumps({'checks': checks}))
