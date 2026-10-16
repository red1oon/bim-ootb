#!/usr/bin/env python3
# §MAXQ_FRAME_BUDGET scorer — called by witness_maxq_frame_budget.js so the witness states its OWN
# verdict (WITNESS_INTERFACE_FRAMEWORK rule 4: a witness that cannot report its own failure is not
# a witness). Verdict is a NUMBER, never a look at the picture.
#   RMS      — per-pixel luma error vs the full 16/24 reference.
#   floor    — RMS between the reference and a CONTROL run at IDENTICAL settings. Nothing below the
#              floor is distinguishable from the reference, by construction.
#   PAIRWISE — printed in full, because that is what exposed the real story: the cold-cache FIRST
#              load is an outlier against every warm load, including one at its own settings.
import numpy as np, json, sys, glob, os
from PIL import Image
S = sys.argv[1] if len(sys.argv) > 1 else '.'
runs = json.load(open(os.path.join(S, 'runs.json')))
def lum(p):
    a = np.asarray(Image.open(p).convert('RGB'), float)
    return 0.2126*a[:,:,0] + 0.7152*a[:,:,1] + 0.0722*a[:,:,2]
tags = [r['tag'] for r in runs if not r.get('inconclusive')]
L = {t: lum(f'{S}/f_{t}.png') for t in tags}
for r in runs:
    if r.get('aoMs') is not None and r['aoMs'] < 100:
        print(f"  INCONCLUSIVE — {r['tag']}: AO did no real work (avgRenderMs={r['aoMs']}); not scored.")
        tags = [t for t in tags if t != r['tag']]
if len(tags) < 3:
    print('  INCONCLUSIVE — fewer than 3 scorable runs; nothing was judged.'); sys.exit(1)
rms = lambda a, b: float(np.sqrt(((L[a]-L[b])**2).mean()))
print('\n  PAIRWISE RMS (0-255 luma)')
print('        ' + ''.join(f'{t:>12s}' for t in tags))
for a in tags:
    print(f'  {a:>6s}' + ''.join(f'{rms(a,b):12.2f}' for b in tags))
ctl = [t for t in tags if t.startswith('ctl_')]
ref = tags[0]
if not ctl:
    print('\n  INCONCLUSIVE — no control run; the noise floor is unknown, nothing is scored.'); sys.exit(1)
ctl = ctl[0]
# The floor is the SMALLEST difference the harness can still resolve, so it must be the CLOSEST
# warm pair involving the control — never the max, which lets a genuine outlier define the floor and
# then wave itself through (first cut of this scorer did exactly that and recommended taa=4/ao=8 at
# RMS 21.33). Anything within ~3x of that is indistinguishable; a real difference is orders above it.
warm = [t for t in tags if t != ref]
floor = min((rms(ctl, t) for t in warm if t != ctl), default=rms(ref, ctl))
print(f'\n  cold-vs-warm at IDENTICAL settings ({ref} vs {ctl}): RMS {rms(ref,ctl):.2f}')
print(f'  NOISE FLOOR (control vs the other warm loads): RMS {floor:.2f}')
TAA_MS, AO_MS, TAIL, BASE = 1200/16, 450/24, 1989-1650, 1989
print(f'\n  {"taa":>4} {"ao":>3} {"renders":>8} {"RMS vs ctl":>11} {"verdict":>16} {"proj ms/frame":>14} {"vs 1989":>8}')
best = None
for r in runs:
    t = r['tag']
    if t not in tags or t.startswith('ctl_') or t == ref: continue   # ref is cold-cache, see below
    d = rms(t, ctl)
    proj = TAA_MS*r['taa'] + AO_MS*r['ao'] + TAIL
    if d <= floor*3:      v, ok = 'AT THE FLOOR', True
    elif d <= floor*20:   v, ok = 'above floor',  False
    else:                 v, ok = 'DISTINGUISHABLE', False
    print(f'  {r["taa"]:>4} {r["ao"]:>3} {r["taa"]+r["ao"]:>8} {d:11.2f} {v:>16} {proj:14.0f} {100*proj/BASE:7.0f}%')
    if ok and r['taa']+r['ao'] < (best[0] if best else 99): best = (r['taa']+r['ao'], r['taa'], r['ao'], proj)
print()
if best: print(f'  LOWEST PAIR AT THE FLOOR: taa={best[1]} ao={best[2]} ({best[0]} renders, {100*best[3]/BASE:.0f}% of the frame budget)')
else:    print('  NO pair reached the floor — ship nothing.')
