"""Independent check of exported PSDs with psd-tools: embedded profile, layers/masks, stored merged image, and psd-tools' own composite
of our layers vs the working-space picture we computed. Usage: check_export.py EMIT_DIR"""
import sys, json, hashlib, numpy as np
from psd_tools import PSDImage
from psd_tools.constants import Resource
d = sys.argv[1]; exp = json.load(open(d + '/expect.json')); res = {}; fails = []
for name, e in exp.items():
    psd = PSDImage.open(f'{d}/{name}.psd'); W = e['W']; r = {}
    prof = psd.image_resources.get_data(Resource.ICC_PROFILE)
    r['icc_sha_matches'] = bool(prof) and hashlib.sha256(prof).hexdigest() == e['icc_sha256']
    r['layer_count_ok'] = len(psd) == e['layers']
    r['masks_ok'] = sum(1 for L in psd if L.mask is not None) == e['masks']
    want = np.fromfile(f'{d}/{name}.work.rgba8', np.uint8).reshape(W, W, 4).astype(int)
    srgb = np.fromfile(f'{d}/{name}.srgb.rgba8', np.uint8).reshape(W, W, 4).astype(int)
    # raw (no colour management): the stored merged image must be exactly our working-space picture
    merged = np.asarray(psd.topil(apply_icc=False).convert('RGBA'), dtype=int); dm = np.abs(merged[..., :3] - want[..., :3])
    r['stored_merged_image_raw_vs_ours'] = {'max': int(dm.max()), 'mean': round(float(dm.mean()), 4)}
    comp = np.asarray(psd.composite(force=True, apply_icc=False).convert('RGBA'), dtype=int); dc = np.abs(comp[..., :3] - want[..., :3])
    r['psd_tools_own_layer_composite_raw_vs_ours'] = {'max': int(dc.max()), 'mean': round(float(dc.mean()), 4)}
    # colour-managed: psd-tools (Pillow/LittleCMS, default flags) applies OUR embedded profile to reach sRGB. Ground truth = float64 oracle on the same stored picture.
    orc = np.fromfile(f'{d}/{name}.oracle_srgb.rgba8', np.uint8).reshape(W, W, 4).astype(int)
    cm = np.asarray(psd.topil(apply_icc=True).convert('RGBA'), dtype=int); dcm = np.abs(cm[..., :3] - orc[..., :3])
    r['stored_picture_converted_by_psd_tools_vs_float64_oracle'] = {'max': int(dcm.max()), 'mean': round(float(dcm.mean()), 4), 'pct_samples_over_2': round(float((dcm > 2).mean() * 100), 3)}
    cc = np.asarray(psd.composite(force=True, apply_icc=True).convert('RGBA'), dtype=int); dcc = np.abs(cc[..., :3] - srgb[..., :3])
    r['psd_tools_layer_composite_converted_vs_our_srgb'] = {'max': int(dcc.max()), 'mean': round(float(dcc.mean()), 4)}
    if r['stored_merged_image_raw_vs_ours']['max'] > 1: fails.append(f"{name}: stored merged image differs from ours: {r['stored_merged_image_raw_vs_ours']}")
    if r['psd_tools_own_layer_composite_raw_vs_ours']['max'] > 4 or r['psd_tools_own_layer_composite_raw_vs_ours']['mean'] > 1.0: fails.append(f"{name}: psd-tools layer composite (raw) differs: {r['psd_tools_own_layer_composite_raw_vs_ours']}")
    x = r['stored_picture_converted_by_psd_tools_vs_float64_oracle']
    if x['max'] > 10 or x['mean'] > 0.6 or x['pct_samples_over_2'] > 0.5: fails.append(f"{name}: embedded profile as applied by psd-tools is far from the float64 oracle: {x}")
    if r['psd_tools_layer_composite_converted_vs_our_srgb']['max'] > 10 or r['psd_tools_layer_composite_converted_vs_our_srgb']['mean'] > 1.2: fails.append(f"{name}: psd-tools colour-managed layer composite differs: {r['psd_tools_layer_composite_converted_vs_our_srgb']}")
    res[name] = r
    for k in ('icc_sha_matches', 'layer_count_ok', 'masks_ok'):
        if not r[k]: fails.append(f'{name}: {k}')
print(json.dumps({'results': res, 'fails': fails}))
