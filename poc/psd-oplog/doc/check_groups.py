"""Independent check (psd-tools) of exported PSDs with groups and clipping. Prints {"checks":[{id,name,value,cmp,limit}]} for run_groups.js to log.
H25: nesting, PASS_THROUGH, clipping flags, mask presence, opacity bytes read exactly. H24: psd-tools' own group/clipping compositor vs our working-space picture
(thresholds fixed in witness_log/HYPOTHESES.md before this was run: mean <= 1.0, max <= 8 levels)."""
import sys, json, numpy as np
from psd_tools import PSDImage
d = sys.argv[1]; exp = json.load(open(d + '/expect.json')); checks = []; HELD = len(sys.argv) > 2 and sys.argv[2] == 'heldout'
def walk(layers):
    out = []
    for L in layers:
        if L.is_group():
            out.append({'kind': 'group', 'mode': 'pass-through' if L.blend_mode.name == 'PASS_THROUGH' else L.blend_mode.name.lower().replace('_', '-'), 'opacity': L.opacity, 'mask': L.mask is not None, 'children': walk(L)})
        else:
            out.append({'kind': 'layer', 'mode': L.blend_mode.name.lower().replace('_', '-'), 'opacity': L.opacity, 'mask': L.mask is not None, 'clip': bool(L.clipping)})
    return out
def norm(t):
    for n in t:
        n['mode'] = {'soft-light': 'soft-light', 'hard-light': 'hard-light'}.get(n['mode'], n['mode'])
        if 'children' in n: norm(n['children'])
    return t
def flat(t):
    return json.dumps(t, sort_keys=True)
for name, e in exp.items():
    W = e['W']; psd = PSDImage.open(f'{d}/{name}.psd')
    got = norm(walk(psd)); want = norm(e['tree'])
    for n in want:   # expected layers do not carry 'clip' when false in groups: make both sides comparable
        pass
    def strip(t):
        for n in t:
            if n['kind'] == 'layer': n['clip'] = bool(n.get('clip', False))
            else: strip(n['children'])
        return t
    checks.append({'id': 'H25', 'name': f'{name}: psd-tools reads the exact tree (nesting, PASS_THROUGH, modes, opacity bytes, masks, clip flags)', 'value': flat(strip(got)) == flat(strip(want)), 'cmp': '==', 'limit': True})
    ngroups = sum(1 for _ in psd.descendants() if _.is_group()); nclip = sum(1 for _ in psd.descendants() if not _.is_group() and _.clipping)
    checks.append({'id': 'H25n', 'name': f'{name}: non-vacuous: clipped layers present in the file' + ('' if HELD else ' (and groups)'), 'value': (nclip >= 2) if HELD else (ngroups >= 3 and nclip >= 3), 'cmp': '==', 'limit': True})
    ours = np.fromfile(f'{d}/{name}.work.rgba8', np.uint8).reshape(W, W, 4).astype(int)
    comp = np.asarray(psd.composite(force=True, apply_icc=False).convert('RGBA'), dtype=int); dd = np.abs(comp[..., :3] - ours[..., :3])
    if HELD:   # H27 out-of-sample thresholds, fixed in witness_log/HYPOTHESES.md before the first run
        checks.append({'id': 'H27', 'name': f'{name}: HELD-OUT psd-tools group/clipping composite vs ours, mean levels', 'value': round(float(dd.mean()), 4), 'cmp': '<=', 'limit': 0.8})
        checks.append({'id': 'H27p', 'name': f'{name}: HELD-OUT pixels over 8 levels (percent)', 'value': round(float((dd.max(axis=2) > 8).mean() * 100), 3), 'cmp': '<=', 'limit': 0.5})
        checks.append({'id': 'H27x', 'name': f'{name}: HELD-OUT max levels (info)', 'value': int(dd.max()), 'cmp': '<=', 'limit': 255})
    else:
        checks.append({'id': 'H24', 'name': f'{name}: psd-tools own group/clipping composite vs ours, mean levels', 'value': round(float(dd.mean()), 4), 'cmp': '<=', 'limit': 1.0})
        checks.append({'id': 'H24x', 'name': f'{name}: psd-tools own group/clipping composite vs ours, max levels', 'value': int(dd.max()), 'cmp': '<=', 'limit': 8})
        checks.append({'id': 'H24p', 'name': f'{name}: pixels differing by more than 8 levels (info, limit is generous)', 'value': int((dd.max(axis=2) > 8).sum()), 'cmp': '<=', 'limit': 16384})
print(json.dumps({'checks': checks}))
