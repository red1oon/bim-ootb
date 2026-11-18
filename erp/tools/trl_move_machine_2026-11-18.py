#!/usr/bin/env python3
# trl_move_machine_2026-11-18.py — ONE-SHOT (bim-compiler prompts/TRL_TRILOGY_STANDARD.md T5a): move the ERP's two machine sources into the legacy XML shape.
#   (1) erp/i18n/chrome.json keys[*].machine[<lang>]  ->  erp/i18n/chrome_base.csv (id,value,msgtext,msgtype,ref,fmt,html: the catalogue; ids 1000000+, app-own,
#       as legacy numbers customer rows above MAX_OFFICIAL_ID) + erp/i18n/machine/AD_Message_Trl_<lang>.xml (the per-language text).
#   (2) erp/i18n/machine/<lang>.json {English: text}  ->  erp/i18n/machine/<T>_Trl_<lang>.xml for T in AD_Menu/AD_Window/AD_Tab/AD_Field, BY ID: exactly the rows
#       machine_fill applied (the <T>_Trl_m maps of the built erp/i18n/<lang>.json), so the built packs do not change.
# Applied once; then build_i18n.py reads the XML. Read the §TRL_MOVE lines.
import csv, json, os, sqlite3, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trl_xml
ERP = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); I18N = os.path.join(ERP, 'i18n'); MACH = os.path.join(I18N, 'machine')
LANGS = ['fr_FR', 'es_ES', 'de_DE', 'ar', 'zh_CN', 'ja_JP', 'ms_MY', 'th_TH']
PROV = 'ERP machine source (not a published language pack) — translated for this app by Claude (Anthropic), 2026-11, moved from %s by erp/tools/trl_move_machine_2026-11-18.py (TRL_TRILOGY_STANDARD.md T5a); no human review.'

if os.path.exists(os.path.join(I18N, 'chrome_base.csv')): print('§TRL_MOVE nothing to do: chrome_base.csv exists'); sys.exit(0)
chrome = json.load(open(os.path.join(I18N, 'chrome.json'), encoding='utf-8'))
keys = chrome['keys']; ids = {k: 1000000 + i for i, k in enumerate(keys)}
with open(os.path.join(I18N, 'chrome_base.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f, lineterminator='\n'); w.writerow(['ad_message_id', 'value', 'msgtext', 'msgtype', 'ref', 'fmt', 'html'])
    for k, e in keys.items(): w.writerow([ids[k], k, e['en'], 'I', e.get('ref', ''), e.get('fmt', ''), 'Y' if e.get('html') else ''])
nA = 0
for lang in LANGS:
    rows = [(ids[k], 'Y', e['en'], e['machine'][lang]) for k, e in keys.items() if lang in e.get('machine', {})]
    trl_xml.write(os.path.join(MACH, 'AD_Message_Trl_%s.xml' % lang), lang, 'AD_Message', 'ERP chrome (AD_Message, app-own ids %d-%d). ' % (1000000, 1000000 + len(keys) - 1) + PROV % 'erp/i18n/chrome.json keys[*].machine', rows); nA += len(rows)
print('§TRL_MOVE chrome keys=%d, AD_Message machine rows=%d over %d languages' % (len(keys), nA, len(LANGS)))
db = sqlite3.connect(os.path.join(ERP, 'ad_seed.db'))
BASE = {'AD_Menu': 'SELECT AD_Menu_ID, Name FROM AD_Menu', 'AD_Window': 'SELECT AD_Window_ID, Name FROM AD_Window', 'AD_Tab': 'SELECT AD_Tab_ID, Name FROM AD_Tab', 'AD_Field': 'SELECT AD_Field_ID, Name FROM AD_Field'}
eng = {t: {int(i): n for i, n in db.execute(q)} for t, q in BASE.items()}
tot = {t: 0 for t in BASE}
for lang in LANGS:
    pack = json.load(open(os.path.join(I18N, lang + '.json'), encoding='utf-8'))
    for t in BASE:
        m = pack.get(t + '_Trl_m', {})
        rows = [(int(i), 'Y', eng[t][int(i)], txt) for i, txt in m.items()]
        trl_xml.write(os.path.join(MACH, '%s_Trl_%s.xml' % (t, lang)), lang, t, 'ERP screen names (%s, by id). ' % t + PROV % ('erp/i18n/machine/%s.json {English: text}, applied by build_i18n.py machine_fill' % lang), rows); tot[t] += len(rows)
    if os.path.exists(os.path.join(MACH, lang + '.json')): os.remove(os.path.join(MACH, lang + '.json'))
print('§TRL_MOVE screen-name machine rows by table: ' + json.dumps(tot) + '; the 8 machine/<lang>.json removed')
