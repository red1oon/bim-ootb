"""Independent PSD reader check (psd-tools, not ag-psd). Usage: python3 check_psd_independent.py EMIT_DIR
Reads PSDs written by `EMIT_DIR=... node psd_roundtrip.js`; compares layer modes, opacity, pixels, masks and the
reader's own composite against our float composite. Layer data must match exactly; the composite is informational
(psd-tools documents its blend implementation as approximate)."""
import sys, json, numpy as np
from psd_tools import PSDImage
d = sys.argv[1]; fails = []; out = []
for seed in (1, 2, 3):
    meta = json.load(open(f'{d}/seed{seed}.json')); W = meta['W']
    psd = PSDImage.open(f'{d}/seed{seed}.psd')
    layers = np.fromfile(f'{d}/seed{seed}.layers.bin', np.uint8).reshape(-1, W, W, 4)
    masks = np.fromfile(f'{d}/seed{seed}.masks.bin', np.uint8).reshape(-1, W, W)
    orig = np.fromfile(f'{d}/seed{seed}.rgba8', np.uint8).reshape(W, W, 4).astype(int)
    r = {'seed': seed, 'layers': len(psd), 'mode_mismatch': 0, 'opacity_mismatch': 0, 'pixel_mismatch': 0, 'mask_mismatch': 0}
    for i, L in enumerate(psd):   # psd-tools lists bottom-to-top like the file
        want = meta['layers'][i]
        if L.blend_mode.name.lower().replace('_', ' ') != want['mode'].replace('-', ' ') and not (want['mode'] == 'soft light' and 'soft' in L.blend_mode.name.lower()): r['mode_mismatch'] += 1
        if L.opacity != want['opacity']: r['opacity_mismatch'] += 1
        a = np.asarray(L.numpy() * 255 + 0.5, dtype=np.int32)       # straight RGBA from the reader
        if a.shape[-1] == 3: a = np.concatenate([a, np.full(a.shape[:2] + (1,), 255, np.int32)], -1)
        ref = layers[i].astype(int); vis = ref[..., 3] > 0
        pm = np.abs(a[..., 3] - ref[..., 3]).max(); cm = np.abs(a[..., :3] - ref[..., :3])[vis].max() if vis.any() else 0
        if max(pm, cm) > 1: r['pixel_mismatch'] += 1   # reader rounding allowance 1
        if want['has_mask']:
            m = L.mask
            mm = None if m is None or m.topil() is None else np.asarray(m.topil().convert('L'), dtype=np.int32)
            if mm is None: r['mask_mismatch'] += 1
            else:
                full = np.full((W, W), 255, np.int32); l, t, rr, b = m.bbox; full[t:b, l:rr] = mm
                if np.abs(full - masks[i]).max() > 1: r['mask_mismatch'] += 1
    comp = np.asarray(psd.composite(force=True).convert('RGBA'), dtype=np.int32)
    dd = np.abs(comp - orig); r['reader_composite_vs_ours'] = {'max': int(dd.max()), 'mean': round(float(dd.mean()), 3), 'pct_over_2': round(float((dd > 2).mean() * 100), 3)}
    if any(r[k] for k in ('mode_mismatch', 'opacity_mismatch', 'pixel_mismatch', 'mask_mismatch')): fails.append(r)
    out.append(r)
print(json.dumps({'results': out, 'gate': 'FAIL' if fails else 'PASS'}, indent=1)); sys.exit(1 if fails else 0)
