"""Usage: python3 -I check_wand.py dir   Independent numpy/scipy reference for the magic wand, modes and grow/shrink (spec Level 2e, W1-W3).
dir holds pix.f32 (W*W*4 premultiplied float32 layer) and cases.json {W, wands:[[sx,sy,tol,contig]], modes:[[iA,iB,'add'|'sub']], grows:[[iBase,n]]}; writes expected.bin = wand masks, then mode masks, then grow masks (uint8, W*W each)."""
import sys, json, os, numpy as np
from scipy import ndimage
d = sys.argv[1]; cs = json.load(open(os.path.join(d, 'cases.json'))); W = cs['W']
pix = np.fromfile(os.path.join(d, 'pix.f32'), np.float32).reshape(W * W, 4); a = pix[:, 3]
safe = np.where(a > 0, a, np.float32(1)).astype(np.float32)
rgb = np.where((a > 0)[:, None], (pix[:, :3] / safe[:, None]).astype(np.float32), np.float32(0)).astype(np.float32)
alpha = np.where(a > 0, a, np.float32(0)).astype(np.float32)
C = np.concatenate([rgb, alpha[:, None]], 1).astype(np.float64)
cross = ndimage.generate_binary_structure(2, 1)
def wand(sx, sy, tol, contig):
    c0 = C[sy * W + sx]; m = (np.abs(C - c0) <= (tol / 255.0)).all(1).reshape(W, W)
    if contig:
        lab, _ = ndimage.label(m, structure=cross); m = lab == lab[sy, sx]
    return m
W_ = [wand(*c) for c in cs['wands']]
out = [m.astype(np.uint8) for m in W_]
for ia, ib, mode in cs['modes']:
    out.append((W_[ia] | W_[ib] if mode == 'add' else W_[ia] & ~W_[ib]).astype(np.uint8))
for ib, n in cs['grows']:
    m = W_[ib]
    out.append((ndimage.binary_dilation(m, cross, iterations=n, border_value=0) if n > 0 else ndimage.binary_erosion(m, cross, iterations=-n, border_value=1)).astype(np.uint8))
np.concatenate([o.reshape(-1) for o in out]).tofile(os.path.join(d, 'expected.bin'))
print(json.dumps({'n': len(out), 'sizes': [int(o.sum()) for o in out]}))
