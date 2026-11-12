#!/usr/bin/env python3
# capex/tools/film_dash_twin_plan.py — timing planner of the DASHBOARD-ONLY film (prompts/CAPEX_DASHBOARD.md §5.62). Cues are MEASURED from the voice, never typed:
#   measure <narration.tsv> <out>   -> <out>/pass1.tsv (each row given a roomy window so the fitter voices the DETAIL at base speed; §NARR_FIT dur= is the voice length)
#   plan <narration.tsv> <pass1_fit.log> <out> -> <out>/durations.txt (segment seconds in film order, for film_dash_twin_build.sh) and <out>/final.tsv (the fitter's input: id cue end source SHORT DETAIL with the real cues)
# A row spans one or more stills (ROWSEG); a still never shows for less than MINSEG seconds; the row's voice starts LEAD s after its first still appears and ends TAIL s before its last one leaves.
import sys, re, os
ROWSEG = {'chain': ['c_chain'], 'glance': ['b02_glance'], 'approved': ['b03_drill_approved'], 'spent': ['b04_drill_spent'], 'forecast': ['b05_forecast_basis'], 'amber': ['b06_drill_amber'], 'map': ['b07_map_hover', 'b07_map_open'], 'attention': ['b08_attention'],
          'projects': ['b09_m1_projects'], 'budget': ['b09_m2_budget'], 'procurement': ['b09_m3_procurement'], 'approvals': ['b09_m4_approvals'], 'handover': ['b09_m5_handover'], 'page': ['b10_page_schedule', 'b10_page_procurement'],
          'themes': ['b11_formula', 'b11_theme_classic_light', 'b11_theme_executive_light', 'b11_theme_executive_dark'], 'proof': ['p_proof']}
TITLE, END, LEAD, TAIL, MINSEG, SLACK = 3.6, 3.6, 0.6, 0.5, 4.0, 1.5   # SLACK: the fitter wants room beyond the measured length or it falls back to the SHORT line (found 2026-11-12: five rows did)
mode, tsv, a3 = sys.argv[1], sys.argv[2], sys.argv[3]
rows = [l.rstrip('\n').split('\t') for l in open(tsv) if l.strip()]
if mode == 'measure':
    os.makedirs(a3, exist_ok=True)
    with open(os.path.join(a3, 'pass1.tsv'), 'w') as f:
        for i, r in enumerate(rows):
            cue = 10 + i * 70; f.write('\t'.join([r[0], '%.2f' % cue, '%.2f' % (cue + 65)] + r[3:6]) + '\n')
    print('§PLAN measure rows=%d' % len(rows)); sys.exit(0)
fit = {}
for l in open(sys.argv[3]):
    m = re.match(r'§NARR_FIT (\S+) cue=\S+ room=\S+ dur=([\d.]+) -> (\S+)', l)
    if m: fit[m.group(1)] = (float(m.group(2)), m.group(3))
out = sys.argv[4]; segs = [('c0', TITLE)]; t = TITLE; final = []
for r in rows:
    d, pick = fit.get(r[0], (None, None))
    if d is None: sys.exit('§PLAN_ERROR no fit for row ' + r[0])
    if pick != 'DETAIL': print('§PLAN_NOTE row %s was voiced as %s at pass 1' % (r[0], pick))
    names = ROWSEG[r[0]]; total = LEAD + d + TAIL + SLACK; per = max(MINSEG, total / len(names)); span = per * len(names)
    final.append('\t'.join([r[0], '%.2f' % (t + LEAD), '%.2f' % (t + span - TAIL)] + r[3:6])); print('§PLAN row=%s voice=%.2fs stills=%d span=%.2fs cue=%.2f' % (r[0], d, len(names), span, t + LEAD))
    for n in names: segs.append((n, per))
    t += span
segs.append(('c9', END)); t += END
with open(os.path.join(out, 'durations.txt'), 'w') as f: f.write(''.join('%s %.2f\n' % s for s in segs))
open(os.path.join(out, 'final.tsv'), 'w').write('\n'.join(final) + '\n'); print('§PLAN total=%.1fs segments=%d' % (t, len(segs)))
