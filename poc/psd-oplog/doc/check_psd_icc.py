"""Independent check (psd-tools, not our parser or ag-psd): the ICC resource we write is the exact profile, layers/modes/opacity survive,
and we did not corrupt the file. Usage: check_psd_icc.py EMIT_DIR (reads *.psd and expect.json written by run_doc.js)."""
import sys, json, hashlib
from psd_tools import PSDImage
from psd_tools.constants import Resource
d = sys.argv[1]; exp = json.load(open(d + '/expect.json')); res = {}; fails = []
for name, e in exp.items():
    psd = PSDImage.open(f'{d}/{name}.psd'); r = {}
    prof = psd.image_resources.get_data(Resource.ICC_PROFILE)
    got = hashlib.sha256(prof).hexdigest() if prof else None
    r['icc_sha_matches'] = got == e['icc_sha256']
    r['layer_count_ok'] = len(psd) == e['layers']
    modes = [L.blend_mode.name.lower().replace('_', ' ') for L in psd]
    r['modes_ok'] = all((m == w.replace('-', ' ')) or (w == 'soft light' and 'soft' in m) or (w == 'hard light' and 'hard' in m) for m, w in zip(modes, e['modes']))
    r['opacity_ok'] = [L.opacity for L in psd] == e['opacity']
    r['size'] = [psd.width, psd.height]
    res[name] = r
    for k in ('icc_sha_matches', 'layer_count_ok', 'modes_ok', 'opacity_ok'):
        if not r[k]: fails.append(f'{name}: {k}')
print(json.dumps({'results': res, 'fails': fails}))
