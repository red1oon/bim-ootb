"""Usage: python3 -I check_mask_ops.py dir   Independent numpy float32 reference for the mask ops (spec Level 2a, M1). dir holds pix_in.f32 (W*W*4), mask_in.f32 (W*W) and the node results pix_apply.f32, mask_inv.f32, sel_rect_inv.u8, sel_ell.u8 plus meta.json {W, rect:[x0,y0,x1,y1], ell:[..]}. Prints JSON of max/bitwise differences."""
import sys, json, os, numpy as np
d = sys.argv[1]; m = json.load(open(os.path.join(d, 'meta.json'))); W = m['W']
pix = np.fromfile(os.path.join(d, 'pix_in.f32'), np.float32).reshape(W * W, 4); mask = np.fromfile(os.path.join(d, 'mask_in.f32'), np.float32)
out = {}
exp = (pix * mask[:, None]).astype(np.float32); got = np.fromfile(os.path.join(d, 'pix_apply.f32'), np.float32).reshape(W * W, 4); out['apply_bit_diff'] = int((exp.view(np.uint32) != got.view(np.uint32)).sum())
exp = (np.float32(1) - mask).astype(np.float32); got = np.fromfile(os.path.join(d, 'mask_inv.f32'), np.float32); out['invert_bit_diff'] = int((exp.view(np.uint32) != got.view(np.uint32)).sum())
def ell(box):
    x0, y0, x1, y1 = box; M = np.zeros((W, W), np.uint8); cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    xs = (np.arange(x0, x1, dtype=np.float64) + 0.5 - cx) / rx; ys = (np.arange(y0, y1, dtype=np.float64) + 0.5 - cy) / ry
    M[y0:y1, x0:x1] = ((xs[None, :] * xs[None, :]) + (ys[:, None] * ys[:, None]) <= 1).astype(np.uint8); return M
x0, y0, x1, y1 = m['rect']; R = np.zeros((W, W), np.uint8); R[y0:y1, x0:x1] = 1
out['sel_rect_inv_diff'] = int((np.fromfile(os.path.join(d, 'sel_rect_inv.u8'), np.uint8).reshape(W, W) != (1 - R)).sum())
out['sel_ell_diff'] = int((np.fromfile(os.path.join(d, 'sel_ell.u8'), np.uint8).reshape(W, W) != ell(m['ell'])).sum())
print(json.dumps(out))
