"""Clip CHAIN semantics vs psd-tools. K1 = restore the unit alpha to the base's after every clipped layer (current canonical). K2 = let the alpha grow through the chain, restore at the end."""
import os, numpy as np
from psd_tools import PSDImage
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.emit_diag'); W = 128
def rgba(l):
    a = np.asarray(l.numpy(), dtype=np.float64)
    return a if a.shape[-1] == 4 else np.concatenate([a, np.ones(a.shape[:2] + (1,))], -1)
def B(mode, cb, cs):
    if mode == 'normal': return cs
    if mode == 'multiply': return cb * cs
    if mode == 'screen': return cb + cs - cb * cs
    if mode == 'overlay':
        hl = lambda b, s: np.where(s <= .5, b * 2 * s, b + (2 * s - 1) - b * (2 * s - 1)); return hl(cs, cb)
    raise SystemExit(mode)
def over(cb, ab, cs, as_, mode):
    ar = as_ + ab * (1 - as_); w = np.where(ar > 0, as_ / np.where(ar > 0, ar, 1), 0)[..., None]
    return (1 - w) * cb + w * ((1 - ab[..., None]) * cs + ab[..., None] * B(mode, cb, cs)), ar
for name in ['clip_chain2', 'clip_chain2_screen_overlay']:
    psd = PSDImage.open(f'{d}/{name}.psd'); L = list(psd); bg, base = rgba(L[0]), rgba(L[1]); clips = [(rgba(l), l.opacity / 255.0, l.blend_mode.name.lower()) for l in list(L)[2:]]
    comp = np.asarray(psd.composite(force=True, apply_icc=False).convert('RGB'), dtype=np.float64)
    ours = np.fromfile(f'{d}/{name}.work.rgba8', np.uint8).reshape(W, W, 4)[..., :3].astype(np.float64)
    ab0 = base[..., 3]; cb = base[..., :3]
    def finish(cu, au): return ((1 - au[..., None]) * bg[..., :3] + au[..., None] * cu) * 255
    c1, a = cb.copy(), ab0.copy()
    for (c, op, m) in clips: c1, _ = over(c1, ab0, c[..., :3], c[..., 3] * op, m)          # K1: alpha restored every step
    k1 = finish(c1, ab0)
    c2, a2 = cb.copy(), ab0.copy()
    for (c, op, m) in clips: c2, a2 = over(c2, a2, c[..., :3], c[..., 3] * op, m)           # K2: alpha carried through the chain
    k2 = finish(c2, ab0)
    f = lambda x, y: round(float(np.abs(x - y).mean()), 3)
    print(f"{name}: mean |K1 - psd-tools| = {f(k1, comp)}   mean |K2 - psd-tools| = {f(k2, comp)}   mean |our canonical - psd-tools| = {f(ours, comp)}   mean |our canonical - K1| = {f(ours, k1)}")
