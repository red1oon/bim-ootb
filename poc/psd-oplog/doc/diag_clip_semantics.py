"""Which clipping formula does an independent compositor (psd-tools) implement? Candidates are computed in float64 from the SAME layer pixels read back from the PSD and
compared with (a) psd-tools' composite and (b) our canonical result. Usage: python3 -I doc/diag_clip_semantics.py (after node doc/diag_groups.js)."""
import json, os, sys, numpy as np
from psd_tools import PSDImage
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.emit_diag'); W = 128
def blend(mode, cb, cs):
    if mode == 'normal': return cs
    if mode == 'multiply': return cb * cs
    raise SystemExit('mode ' + mode)
def layer(L):
    a = np.asarray(L.numpy(), dtype=np.float64)  # straight RGBA 0..1
    if a.shape[-1] == 3: a = np.concatenate([a, np.ones(a.shape[:2] + (1,))], -1)
    return a[..., :3], a[..., 3] * (L.opacity / 255.0), L.blend_mode.name.lower()
def over(cb, ab, cs, as_, mode):   # W3C general source-over
    ar = as_ + ab * (1 - as_); B = blend(mode, cb, cs)
    cr = np.where(ar[..., None] > 0, ((1 - as_ / np.where(ar > 0, ar, 1))[..., None] * cb) + (as_ / np.where(ar > 0, ar, 1))[..., None] * ((1 - ab)[..., None] * cs + ab[..., None] * B), 0)
    return cr, ar
def run(name, base_op_is_unit_op=True):
    psd = PSDImage.open(f'{d}/{name}.psd'); L = list(psd)
    cbg, abg, _ = layer(L[0]); cbs, abase0, mbase = layer(L[1]); ccl, acl, mcl = layer(L[2])
    ab_shape = np.asarray(L[1].numpy(), dtype=np.float64)[..., 3] if np.asarray(L[1].numpy()).shape[-1] == 4 else np.ones((W, W)); base_op = L[1].opacity / 255.0; ab = ab_shape   # unit works at the base's own alpha; base opacity applied when the unit meets the backdrop
    out = {}
    def finish(cu, au, label):
        c, a = over(cbg, abg, cu, au * base_op, mbase); out[label] = c * 255
    B = blend(mcl, cbs, ccl)
    # A (ours): source-atop, clip layer fully weighted
    cA = acl[..., None] * B + (1 - acl[..., None]) * cbs; finish(cA, ab, 'A source-atop (ours)')
    # B: W3C general formula for the colour, alpha kept at the base's
    cB = (1 - acl[..., None]) * cbs + acl[..., None] * ((1 - ab[..., None]) * ccl + ab[..., None] * B); finish(cB, ab, 'B W3C-general colour, base alpha kept')
    # C: clip coverage multiplied by the base alpha before blending
    a2 = (acl * ab)[..., None]; cC = (1 - a2) * cbs + a2 * B; finish(cC, ab, 'C clip alpha x base alpha, then blend')
    # K: ordinary W3C source-over of the clip layer onto the unit (alpha grows), keep the resulting straight colour, restore the base alpha
    ar = acl + ab * (1 - acl); wK = np.where(ar > 0, acl / np.where(ar > 0, ar, 1), 0)[..., None]; cK = (1 - wK) * cbs + wK * ((1 - ab[..., None]) * ccl + ab[..., None] * B); finish(cK, ab, 'K W3C over, keep colour, restore base alpha')
    # D: clipped layers blend against the BACKDROP (blend clipped elements as group OFF), shape = base alpha
    c1, a1 = over(cbg, abg, cbs, ab * base_op, mbase); cD, aD = over(c1, a1, ccl, acl * ab, mcl); out['D blend against backdrop (group OFF)'] = cD * 255
    comp = np.asarray(psd.composite(force=True, apply_icc=False).convert('RGB'), dtype=np.float64)
    ours = np.fromfile(f'{d}/{name}.work.rgba8', np.uint8).reshape(W, W, 4)[..., :3].astype(np.float64)
    res = {k: (round(float(np.abs(v - comp).mean()), 3), round(float(np.abs(v - ours).mean()), 3)) for k, v in out.items()}
    res['our canonical vs psd-tools composite'] = (round(float(np.abs(ours - comp).mean()), 3), 0)
    return res
print(f"{'document / candidate':58s} {'mean |cand - psd-tools|':>24s} {'mean |cand - ours|':>20s}")
for name in ['clip_multiply', 'clip_normal_op06', 'clip_base_op05', 'clip_base_multiply']:
    print(name)
    for k, (a, b) in run(name).items(): print(f'   {k:55s} {a:24.3f} {b:20.3f}')
