#!/usr/bin/env python3
# ko_apply.py — shared by the dated Korean batch scripts (erp/tools/trl_batch_2026-11-18_ko_<table>.py), T5c of bim-compiler prompts/TRL_TRILOGY_STANDARD.md.
# A batch holds KO = {English: Korean} for the distinct English names of ONE table, written (AI, this session) by Claude; this tool expands it to the table's ROWS BY ID
# (every id whose English is a key) in erp/i18n/machine/<Table>_Trl_ko_KR.xml. Where the same English already has a Korean text it is REUSED, in this priority:
#   1. the Viewer's (viewer/i18n/machine/AD_Message_Trl_ko_KR.xml, trl=Y) so the two apps agree;  2. a Korean text already written for the same English in another ERP table;  3. the batch's own.
# Prints §TRL_KO lines: rows written, distinct English covered / reused from the Viewer / reused from another table / new, and the English left uncovered.
import csv, json, os, sqlite3, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trl_xml
ERP = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); ROOT = os.path.dirname(ERP); MACH = os.path.join(ERP, 'i18n', 'machine')
TABLES = {  # table -> (sql for (id, English), column used in the xml)
  'AD_Window': 'SELECT AD_Window_ID, Name FROM AD_Window', 'AD_Menu': 'SELECT AD_Menu_ID, Name FROM AD_Menu', 'AD_Tab': 'SELECT AD_Tab_ID, Name FROM AD_Tab',
  'AD_Field': 'SELECT AD_Field_ID, Name FROM AD_Field', 'AD_Element': 'SELECT AD_Element_ID, Name FROM AD_Element', 'AD_Process': 'SELECT ad_process_id, name FROM ad_process',
  'AD_Form': 'SELECT AD_Form_ID, Name FROM AD_Form', 'AD_Ref_List': 'SELECT AD_Ref_List_ID, Name FROM AD_Ref_List'}
PROV = ('ERP machine source (not a published language pack) — Korean screen names written for this app by Claude (Anthropic), 2026-11-18, %s (TRL_TRILOGY_STANDARD.md T5c); '
        'no human review. Where the BIM Viewer already had a Korean text for the same English it is reused (viewer/i18n/machine/AD_Message_Trl_ko_KR.xml).')

def viewer_ko():
    base = {int(r['ad_message_id']): r['msgtext'] for r in csv.DictReader(open(os.path.join(ROOT, 'viewer', 'i18n', 'ad_message_base.csv'), encoding='utf-8'))}
    rows = trl_xml.read(os.path.join(ROOT, 'viewer', 'i18n', 'machine', 'AD_Message_Trl_ko_KR.xml'))
    return {base[i]: t for i, (trl, o, t) in rows.items() if trl == 'Y' and i in base and t != base[i]}

def other_tables(skip):
    ko = {}
    for t in TABLES:
        if t == skip: continue
        for i, (trl, o, txt) in trl_xml.read(os.path.join(MACH, '%s_Trl_ko_KR.xml' % t)).items():
            if trl == 'Y': ko.setdefault(o, txt)
    return ko

def names(table):
    db = sqlite3.connect(os.path.join(ERP, 'ad_seed.db'))
    return [(int(i), n) for i, n in db.execute(TABLES[table]) if n is not None]

def apply(table, KO, label, dry=False):
    rows_by_id = names(table); V = viewer_ko(); O = other_tables(table)
    stat = {'viewer': set(), 'other': set(), 'new': set()}; text = {}
    for _, n in rows_by_id:
        k = n.strip()
        if k in text: continue
        if k in V: text[k] = V[k]; stat['viewer'].add(k)
        elif k in O: text[k] = O[k]; stat['other'].add(k)
        elif k in KO: text[k] = KO[k]; stat['new'].add(k)
    distinct = sorted(set(n.strip() for _, n in rows_by_id)); missing = [k for k in distinct if k not in text]
    extra = [k for k in KO if k not in set(distinct)]
    rows = [(i, 'Y', n, text[n.strip()]) for i, n in rows_by_id if n.strip() in text]
    if not dry and rows:
        trl_xml.write(os.path.join(MACH, '%s_Trl_ko_KR.xml' % table), 'ko_KR', table, 'ERP screen names (%s, by id). ' % table + PROV % label, rows)
    print('§TRL_KO table=%s ids=%d distinct English=%d: rows written=%d, covered=%d (reused from the Viewer %d, from another ERP table %d, new in this batch %d), uncovered=%d, unused batch keys=%d%s' % (
        table, len(rows_by_id), len(distinct), len(rows), len(text), len(stat['viewer']), len(stat['other']), len(stat['new']), len(missing), len(extra), ' [DRY]' if dry else ''))
    return missing
