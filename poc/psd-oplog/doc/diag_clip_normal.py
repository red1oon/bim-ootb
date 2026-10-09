"""Where does psd-tools differ from the W3C-general clip formula for a NORMAL-mode clipped layer at opacity 0.6? Bins the error by base alpha and clip alpha."""
import os, numpy as np
from psd_tools import PSDImage
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.emit_diag'); W = 128
psd = PSDImage.open(f'{d}/clip_normal_op06.psd'); L = list(psd)
def rgba(l):
    a = np.asarray(l.numpy(), dtype=np.float64)
    return a if a.shape[-1] == 4 else np.concatenate([a, np.ones(a.shape[:2] + (1,))], -1)
bg, base, clip = rgba(L[0]), rgba(L[1]), rgba(L[2]); op = L[2].opacity / 255.0; print('clip opacity', op, 'base opacity', L[1].opacity / 255.0)
comp = np.asarray(psd.composite(force=True, apply_icc=False).convert('RGB'), dtype=np.float64) / 255
ab = base[..., 3]; ac = clip[..., 3]; cb = base[..., :3]; cs = clip[..., :3]; bgc = bg[..., :3]
def finish(cu, au): return (1 - au[..., None]) * bgc + au[..., None] * cu    # unit over opaque bg
hyp = {}
asx = ac * op
hyp['A/B  unit=(1-as)Cb+as*Cs, alpha=ab'] = finish((1 - asx[..., None]) * cb + asx[..., None] * cs, ab)
hyp['E    clip opacity applied twice (as=ac*op*op)'] = finish((1 - (ac * op * op)[..., None]) * cb + (ac * op * op)[..., None] * cs, ab)
hyp['F    clip opacity ignored (as=ac)'] = finish((1 - ac[..., None]) * cb + ac[..., None] * cs, ab)
hyp['G    unit alpha grows: over, then final alpha=as+ab(1-as)'] = (lambda ar: finish(np.where(ar[..., None] > 0, ((1 - asx / np.where(ar > 0, ar, 1))[..., None] * cb + (asx / np.where(ar > 0, ar, 1))[..., None] * cs), 0), ar))(asx + ab * (1 - asx))
hyp['H    clip content over bg first (group OFF), shape=ab'] = (lambda c1: (1 - (asx * ab)[..., None]) * c1 + (asx * ab)[..., None] * cs)(finish(cb, ab))

ar = asx + ab * (1 - asx); w = np.where(ar > 0, asx / np.where(ar > 0, ar, 1), 0)[..., None]
hyp["G'   colour from alpha-grown over (as/ar weights), final alpha = ab"] = finish((1 - w) * cb + w * cs, ab)
ar2 = ac + ab * (1 - ac); w2 = np.where(ar2 > 0, ac / np.where(ar2 > 0, ar2, 1), 0)[..., None]
hyp["I    shape-weighted over, opacity applied after: (1-op)Cb+op*U"] = finish((1 - op) * cb + op * ((1 - w2) * cb + w2 * cs), ab)
hyp["J    I but unit alpha also scaled by op blend on bg only: lerp(bg, A/B-unit, ...)"] = finish((1 - asx[..., None]) * cb + asx[..., None] * cs, ab * (1 - 0) )
print(f"{'hypothesis':62s} {'mean abs err (levels)':>22s} {'max':>5s}")
for k, v in hyp.items(): e = np.abs(v - comp) * 255; print(f'{k:62s} {e.mean():22.3f} {e.max():5.1f}')
e = np.abs(hyp['A/B  unit=(1-as)Cb+as*Cs, alpha=ab'] - comp).max(axis=2) * 255
print('\nerror of A/B by pixel class (mean levels, count):')
for name, m in [('base alpha ~1, clip alpha 0', (ab > .99) & (ac == 0)), ('base alpha ~1, clip alpha>0', (ab > .99) & (ac > 0)), ('base alpha in (0,.99), clip alpha>0', (ab > 0) & (ab <= .99) & (ac > 0)), ('base alpha 0', ab == 0)]:
    print(f'  {name:42s} {e[m].mean() if m.any() else float("nan"):8.3f}  n={int(m.sum())}')
