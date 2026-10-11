# Independent float64 reference for the hsl adjustment (Level 2f, HS1/HS2). Usage: python3 editor/check_hsl.py cases.json  -> prints JSON {max_diff, n}
import json, sys, colorsys
d = json.load(open(sys.argv[1])); mx = 0.0
def ref(c, P):
    r, g, b = c
    if P['hue'] == 0 and P['sat'] == 0 and P['light'] == 0: return [r, g, b]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if max(r, g, b) == min(r, g, b): h = 0.0   # grey: hue and sat leave it alone
    else: h = (h + P['hue'] / 360.0) % 1.0
    s2 = s + (1 - s) * P['sat'] / 100.0 if P['sat'] >= 0 else s * (1 + P['sat'] / 100.0)
    if max(r, g, b) == min(r, g, b): s2 = 0.0
    l2 = l + (1 - l) * P['light'] / 100.0 if P['light'] >= 0 else l * (1 + P['light'] / 100.0)
    return [min(1, max(0, v)) for v in colorsys.hls_to_rgb(h, l2, s2)]
for case in d:
    e = ref(case['in'], case['p']); mx = max(mx, max(abs(a - b) for a, b in zip(e, case['out'])))
print(json.dumps({'max_diff': mx, 'n': len(d)}))
