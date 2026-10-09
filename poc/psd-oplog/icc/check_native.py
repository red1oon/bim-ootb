"""Native LittleCMS (via Pillow ImageCms) vs the lcms-wasm outputs dumped by run_icc.js. Usage: check_native.py EMIT_DIR
Same engine, different build (wasm 2.16 vs native). Prints JSON; differences are in 8-bit levels per channel."""
import sys, json, numpy as np
from PIL import Image, ImageCms
d = sys.argv[1]; cases = json.load(open(d + '/cases.json')); out = []; fails = []
prof = {'srgb': ImageCms.createProfile('sRGB'), 'p3': ImageCms.getOpenProfile(d + '/p3.icc'), 'cmyk': ImageCms.getOpenProfile(d + '/../profiles/default_cmyk.icc')}
mode = {'srgb': 'RGB', 'p3': 'RGB', 'cmyk': 'CMYK'}; ch = {'RGB': 3, 'CMYK': 4}
for c in cases:
    ia = np.fromfile(f"{d}/{c['name']}.in", np.uint8); wa = np.fromfile(f"{d}/{c['name']}.wasm", np.uint8)
    mi, mo = mode[c['from']], mode[c['to']]
    img = Image.frombytes(mi, (c['n'], 1), ia.tobytes())
    flags = (ImageCms.Flags.BLACKPOINTCOMPENSATION if c['bpc'] else 0) | (ImageCms.Flags.NOOPTIMIZE if c.get('nooptimize') else 0)
    t = ImageCms.buildTransform(prof[c['from']], prof[c['to']], mi, mo, renderingIntent=(ImageCms.Intent.RELATIVE_COLORIMETRIC if c['intent'] == 'relcol' else ImageCms.Intent.PERCEPTUAL), flags=flags)
    na = np.frombuffer(ImageCms.applyTransform(img, t).tobytes(), np.uint8)
    dd = np.abs(na.astype(int) - wa.astype(int)); r = {'case': c['name'], 'samples': int(dd.size), 'max_levels': int(dd.max()), 'mean_levels': round(float(dd.mean()), 4), 'pct_over_1': round(float((dd > 1).mean() * 100), 3), 'pct_identical': round(float((dd == 0).mean() * 100), 2)}
    out.append(r)
    lim = 1 if c['to'] != 'cmyk' else 3   # CMYK LUT builds may differ a little between lcms versions
    if r['max_levels'] > lim: fails.append(f"{c['name']}: max {r['max_levels']} levels (limit {lim})")
print(json.dumps({'pillow_littlecms_version': ImageCms.core.littlecms_version, 'cases': out, 'fails': fails}))
