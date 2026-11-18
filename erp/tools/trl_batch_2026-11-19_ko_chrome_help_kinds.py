#!/usr/bin/env python3
# trl_batch_2026-11-19_ko_chrome_help_kinds.py — bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.14: the 4 help-box row labels added that day (help.form / .workflow / .info / .task)
# appended to erp/i18n/machine/AD_Message_Trl_ko_KR.xml, keeping every row already there. MACHINE translations by Claude (Anthropic), 2026-11-19, no human review.
# Where the BIM Viewer already has Korean for the SAME English it is used (the TRL_TRILOGY_STANDARD T5c reuse rule, W-ERP-KO-SCREEN K2).
import csv, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trl_xml, ko_apply
ERP = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); I18N = os.path.join(ERP, 'i18n'); F = os.path.join(I18N, 'machine', 'AD_Message_Trl_ko_KR.xml')
KO = {'help.form': '특수 양식', 'help.workflow': '워크플로', 'help.info': '정보 창', 'help.task': 'OS 작업'}
base = {}
with open(os.path.join(I18N, 'chrome_base.csv'), newline='', encoding='utf-8') as f:
    for r in csv.DictReader(f): base[r['value']] = (int(r['ad_message_id']), r['msgtext'])
assert set(KO) <= set(base), sorted(set(KO) - set(base))
have = trl_xml.read(F); V = ko_apply.viewer_ko(); added = reused = 0
rows = [(rid, t, o, x) for rid, (t, o, x) in have.items()]
for k, text in KO.items():
    rid, en = base[k]
    if rid in have: continue
    if en in V: text = V[en]; reused += 1
    rows.append((rid, 'Y', en, text)); added += 1
comment = open(F, encoding='utf-8').read().split('<!--', 1)[1].split('-->', 1)[0] + ' Rows 1000058-1000061 added 2026-11-19 by erp/tools/trl_batch_2026-11-19_ko_chrome_help_kinds.py (VOCAB_MESSAGE_CATALOG.md §19.14).'
trl_xml.write(F, 'ko_KR', 'AD_Message', comment, rows)
print('§TRL_BATCH lang=ko_KR chrome help kinds added=%d kept=%d reused from the Viewer=%d' % (added, len(have), reused))
