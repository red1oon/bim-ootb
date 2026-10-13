# Independent reference for the Sharpen filter step (Level 2j, FL5). Usage: python3 -I editor/check_sharpen.py cases.json -> {"max_diff":..,"nc_diff":..,"n":..}
# Written from spec B.1 only (numpy float32): d = p - pb; keep p where f32(|d|*255) < threshold, else o = clip(p + f32(amount/100)*d, 0, alpha); alpha unchanged.
# pb (the blurred backdrop) is given: the blur itself is verified separately (FL1 vs scipy). nc_diff = the same reference WITHOUT the clamp (negative control).
import json, sys
import numpy as np
f32 = np.float32
d = json.load(open(sys.argv[1])); mx = 0.0; nc = 0.0
for c in d:
    W = c['W']; p = np.array(c['p'], dtype=f32).reshape(W, W, 4); pb = np.array(c['pb'], dtype=f32).reshape(W, W, 4); out = np.array(c['out'], dtype=f32).reshape(W, W, 4)
    amt = f32(c['amount']) / f32(100); thr = f32(c['threshold']); al = p[:, :, 3]
    diff = p[:, :, :3] - pb[:, :, :3]; keep = (np.abs(diff) * f32(255)) < thr
    raw = p[:, :, :3] + amt * diff
    clip = np.clip(raw, f32(0), al[:, :, None])
    ref = np.where(keep, p[:, :, :3], clip); refnc = np.where(keep, p[:, :, :3], raw)
    mx = max(mx, float(np.abs(ref - out[:, :, :3]).max()), float(np.abs(p[:, :, 3] - out[:, :, 3]).max()))
    nc = max(nc, float(np.abs(refnc - out[:, :, :3]).max()))
print(json.dumps({'max_diff': mx, 'nc_diff': nc, 'n': len(d)}))
