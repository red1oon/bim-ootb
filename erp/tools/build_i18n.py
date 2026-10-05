#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — Scope: build erp/i18n/<lang>.json, the per-locale UI translation files idempiere.html fetches
#   lazily on a language switch (bim-compiler prompts/ERP_UI_LOCALES.md §L2). EXTRACT ONLY: every translated string
#   is read from a published iDempiere / ADempiere language pack (XML, the format org.compiere.install.Translation
#   exports), pinned in SOURCES below by URL + commit/date. Nothing is machine-translated here; app-own chrome
#   strings live in erp/i18n/chrome.json with their own per-entry provenance. Read the §I18N-BUILD lines after a run.
# Inputs: packs fetched by erp/tools/fetch_i18n_packs.sh into $ERP_TRL_CACHE (default ~/.cache/erp_trl);
#   erp/ad_seed.db (base English + which IDs this dictionary carries); ad_message_base.csv (AD_Message ID→Value,
#   exported from the iDempiere 12 Postgres by fetch_i18n_packs.sh — the packs key AD_Message rows by ID).
# Acceptance rule per row = iDempiere's own import rule (TranslationHandler.endElement: UPDATE <T>_Trl … WHERE <T>_ID=<row id>
#   — matched by ID only, the `original` attribute is NOT consulted):
#   kept     — the ID exists in ad_seed.db AND the text differs from its `original` (a real translation)
#   drift    — subset of kept: today's English differs from the `original` the translator saw (e.g. 2008 '&Save changes'
#              → 'Save Changes'); kept, as iDempiere would, and COUNTED so the age of a pack is visible
#   unofficial — row id > 999999 (MTable.MAX_OFFICIAL_ID): a pack author's own customisation, outside the official
#              dictionary — iDempiere's own export skips them too (Translation.java: o.<key> <= MAX_OFFICIAL_ID). DROPPED.
#   repurposed — an AD_Menu drift row whose old and new English share NO word (after cleanAmp + CamelCase split): a menu
#              node re-used for something else after the pack was made (ar_TN 2008: AD_Menu 218 'Test' → 'System Admin').
#              DROPPED — the one deliberate deviation from TranslationHandler's ID-only rule, limited to AD_Menu (the
#              only table where such re-use was found in these packs; elements/messages keep iDempiere's rule). Counted.
#   same     — text == original or empty (row present but untranslated; English shows, honestly)
#   absent   — ID not in ad_seed.db
# Text is passed through Util.cleanAmp (org.compiere.util.Util:593 — drops the first '&' mnemonic marker not followed by a space).
import csv, re, glob, json, os, sqlite3, sys, xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ERP = os.path.dirname(HERE)
CACHE = os.environ.get('ERP_TRL_CACHE', os.path.expanduser('~/.cache/erp_trl'))
OUT = os.path.join(ERP, 'i18n')

SOURCES = {   # lang -> list of (dir under CACHE, provenance) — first wins on a conflict
  'fr_FR': [('nmicoud_fr_FR', 'github.com/nmicoud/fr_FR@17bbc28b (iDempiere 12 export, maintainer N. Micoud — wiki.idempiere.org/en/Translations)'),
            ('x_fr352/fr_FR', 'sourceforge.net/projects/adempiere/files/Language Packs/Francais/Latest Stable and Alpha/adempiere_fr_FR_352.tgz (ADempiere 3.5.2, 2008-10-01) — fills rows the work-in-progress iDempiere pack lacks')],
  'es_ES': [('gq/es_CO', 'github.com/globalqss/globalqss-idempiere-lco@31b1442b es_CO (GlobalQSS, Colombian Spanish; no es_ES pack is published — served for es_ES, labelled)')],
  'de_DE': [('bxservice_tbayen.translations/data/de_DE', 'github.com/bxservice/tbayen.translations@c88fe319 de_DE (T. Bayen / Team Germany)')],
  'ar':    [('djoudi_ar_DZ/ar_DZ', 'github.com/djoudi/ar_DZ@d1c2c3dc ar_DZ (A. Djoudi, work in progress, 2020)'),
            ('x_ar/arabic language By Najeh', 'sourceforge.net/projects/adempiere/files/Language Packs/Arabic/Beta Release by Najeh/arabic_language_By_Najeh.rar ar_TN (2008-02-05)')],
  'zh_CN': [('x_zh_CN/zh_CN', 'sourceforge.net/projects/adempiere/files/Language Packs/Chinese/Release 352 Packages/zh_CN.zip (ADempiere 3.5.2, 2008-08-20)')],
  'ja_JP': [('JPiere_japanese-translation', 'github.com/JPiere/japanese-translation@b5547855 ja_JP (H. Hagiwara / JPiere)')],
  'ms_MY': [('x_ms_MY/ms_MY', 'sourceforge.net/projects/adempiere/files/Language Packs/Bahasa Malaysia/First Bahasa Release - Beta/ms_MY.zip (2008-11-25)')],
  'th_TH': [('x_th_TH.350/th_TH.350', 'sourceforge.net/projects/adempiere/files/Language Packs/Thailand/ADempiere Thai Language/th_TH.350.zip (Saeree/Grandlinux, 2008-06-16)')],
}
META = {   # dir = writing direction; native = CLDR autonym (the language's own name for itself)
  'en_US': ('ltr', 'English'), 'fr_FR': ('ltr', 'Français'), 'es_ES': ('ltr', 'Español'), 'de_DE': ('ltr', 'Deutsch'),
  'ar': ('rtl', 'العربية'), 'zh_CN': ('ltr', '中文 (简体)'), 'ja_JP': ('ltr', '日本語'), 'ms_MY': ('ltr', 'Bahasa Melayu'),
  'th_TH': ('ltr', 'ไทย'),
}
# trl table -> (base table in ad_seed.db, id column, name column)
TABLES = {
  'AD_Menu':     ('AD_Menu', 'AD_Menu_ID', 'Name'),
  'AD_Window':   ('AD_Window', 'AD_Window_ID', 'Name'),
  'AD_Tab':      ('AD_Tab', 'AD_Tab_ID', 'Name'),
  'AD_Field':    ('AD_Field', 'AD_Field_ID', 'Name'),
  'AD_Element':  ('AD_Element', 'AD_Element_ID', 'Name'),
  'AD_Process':  ('ad_process', 'ad_process_id', 'name'),
  'AD_Form':     ('AD_Form', 'AD_Form_ID', 'Name'),
  'AD_Ref_List': ('AD_Ref_List', 'AD_Ref_List_ID', 'Name'),
  'AD_Message':  (None, None, None),
}

def clean_amp(s):   # org.compiere.util.Util.cleanAmp, verbatim semantics
    if not s: return s
    pos = s.find('&')
    if pos == -1: return s
    if pos + 1 < len(s) and s[pos + 1] != ' ': s = s[:pos] + s[pos + 1:]
    return s

def words(s):
    s = re.sub(r'([a-z])([A-Z])', r'\1 \2', clean_amp(s or ''))
    return set(w for w in re.findall(r'[a-z0-9]{3,}', s.lower()))

def norm(s): return ' '.join((s or '').split())

def load_base(db):
    base = {}
    for t, (bt, idc, nc) in TABLES.items():
        if not bt: continue
        rows = db.execute('SELECT %s, %s%s FROM %s' % (idc, nc, ', PO_Name' if t == 'AD_Element' else '', bt)).fetchall()
        base[t] = {str(int(r[0])): r[1:] for r in rows}
    msg = {}
    with open(os.path.join(CACHE, 'ad_message_base.csv'), newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f): msg[r['ad_message_id']] = (r['value'], r['msgtext'])
    base['AD_Message'] = msg
    return base

RECOVERED = []
def parse_pack(path):
    raw = open(path, 'rb').read().decode('utf-8', 'replace')
    try:
        root = ET.fromstring(raw.encode('utf-8'))
    except ET.ParseError:
        # 2008 packs carry raw control chars / invalid char refs; drop them (text otherwise unchanged) and retry
        raw = ''.join(c for c in raw if c in '\t\n\r' or ord(c) >= 32)
        raw = re.sub(r'&#(x0*[0-8bBcCeEfF]|x0*1[0-9a-fA-F]|0*[0-8]|0*1[1-2]|0*1[4-9]|0*2[0-9]|0*3[01]);', '', raw)
        try:
            root = ET.fromstring(raw.encode('utf-8'))
        except ET.ParseError as e:
            # hand-edited pack with a broken tag (e.g. ms_MY AD_Ref_List line 32: `original="…"Text</value>` — the
            # '>' is missing): read rows with a tolerant regex instead of dropping the whole file. Logged.
            RECOVERED.append('%s(%s)' % (os.path.basename(path), e))
            import html
            for m in re.finditer(r'<row id="([^"]*)"(?: trl="([YN])")?\s*>(.*?)</row>', raw, re.S):
                vals = {}
                for v in re.finditer(r'<value column="([^"]+)" original="([^"]*)"\s*(?:/>|>?(.*?)</value>)', m.group(3), re.S):
                    vals[v.group(1)] = (html.unescape(v.group(3) or ''), html.unescape(v.group(2)))
                yield m.group(1), m.group(2), vals
            return
    for row in root.iter('row'):
        vals = {v.get('column'): (v.text or '', v.get('original') or '') for v in row.iter('value')}
        yield row.get('id'), row.get('trl'), vals

def build(lang, srcs, base):
    out = {t + '_Trl': {} for t in TABLES}
    stats = {t: dict(rows=0, kept=0, stale=0, repurposed=0, unofficial=0, same=0, absent=0) for t in TABLES}
    for d, _prov in srcs:
        for t in TABLES:
            for path in sorted(glob.glob(os.path.join(CACHE, d, t + '_Trl_*.xml'))):
                for rid, _trl, vals in parse_pack(path):
                    st = stats[t]; st['rows'] += 1
                    col = 'MsgText' if t == 'AD_Message' else 'Name'
                    if col not in vals: continue
                    text, orig = vals[col]
                    b = base[t].get(rid)
                    if rid and rid.isdigit() and int(rid) > 999999: st['unofficial'] += 1; continue
                    if b is None: st['absent'] += 1; continue
                    cur = b[1] if t == 'AD_Message' else b[0]
                    if norm(text) == '' or norm(text) == norm(orig): st['same'] += 1; continue
                    if norm(orig) != norm(cur):
                        if t == 'AD_Menu' and not (words(orig) & words(cur)): st['repurposed'] += 1; continue
                        st['stale'] += 1
                    text = clean_amp(text)
                    key = b[0] if t == 'AD_Message' else rid       # AD_Message is looked up by Value (Msg.getMsg)
                    tgt = out[t + '_Trl']
                    if key in tgt: continue                          # first source wins
                    if t == 'AD_Element':
                        po = vals.get('PO_Name', ('', ''))
                        tgt[key] = [text.strip(), clean_amp(po[0].strip()) if po[0].strip() and norm(po[1]) == norm(b[1]) and norm(po[0]) != norm(po[1]) else None]
                    else:
                        tgt[key] = text.strip()
                    st['kept'] += 1
    return out, stats

def machine_fill(lang, out, db):
    """Labelled machine supplement (ERP_UI_LOCALES.md §L2b): i18n/machine/<lang>.json = {English: translation}, written
    for this app (NOT from any language pack) and applied ONLY to a menu / window / tab / field label that the packs
    left untranslated, resolved with the SAME rules the page uses (erp_i18n.js menuName/fieldName). Emitted into
    separate <T>_Trl_m maps so the page counts src=machine apart from src=pack."""
    fn = os.path.join(OUT, 'machine', lang + '.json')
    if not os.path.exists(fn): return {}
    M = json.load(open(fn, encoding='utf-8'))
    T = lambda t, i: out.get(t + '_Trl', {}).get(str(int(i))) if i is not None else None
    m = {'AD_Menu': {}, 'AD_Window': {}, 'AD_Tab': {}, 'AD_Field': {}}
    for wid, name in db.execute('SELECT AD_Window_ID, Name FROM AD_Window'):
        if not T('AD_Window', wid) and (name or '').strip() in M: m['AD_Window'][str(int(wid))] = M[name.strip()]
    for tid, name in db.execute('SELECT AD_Tab_ID, Name FROM AD_Tab'):
        if not T('AD_Tab', tid) and (name or '').strip() in M: m['AD_Tab'][str(int(tid))] = M[name.strip()]
    for mid, name, central, action, wid, pid, fid in db.execute('SELECT AD_Menu_ID, Name, IsCentrallyMaintained, Action, AD_Window_ID, AD_Process_ID, AD_Form_ID FROM AD_Menu'):
        v = None
        if central == 'Y':
            if action == 'W' and wid: v = T('AD_Window', wid) or m['AD_Window'].get(str(int(wid)))
            elif action in ('P', 'R') and pid: v = T('AD_Process', pid)
            elif action == 'X' and fid: v = T('AD_Form', fid)
        v = v or T('AD_Menu', mid)
        if not v and (name or '').strip() in M: m['AD_Menu'][str(int(mid))] = M[name.strip()]
    q = ('SELECT f.AD_Field_ID, f.Name, f.IsCentrallyMaintained, c.AD_Element_ID, c.AD_Process_ID, w.IsSOTrx FROM AD_Field f '
         'JOIN AD_Tab t ON t.AD_Tab_ID=f.AD_Tab_ID JOIN AD_Window w ON w.AD_Window_ID=t.AD_Window_ID '
         'LEFT JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID')
    for fid, name, central, el, proc, so in db.execute(q):
        v = None
        if central == 'Y':
            if proc: v = T('AD_Process', proc)
            elif el is not None:
                e = T('AD_Element', el); v = (e[1] if (so == 'N' and e and e[1]) else (e[0] if e else None))
        v = v or T('AD_Field', fid)
        if not v and (name or '').strip() in M: m['AD_Field'][str(int(fid))] = M[name.strip()]
    for t in m: out[t + '_Trl_m'] = m[t]
    return {t: len(v) for t, v in m.items()}

def main():
    db = sqlite3.connect(os.path.join(ERP, 'ad_seed.db'))
    base = load_base(db)
    os.makedirs(OUT, exist_ok=True)
    index = {'generatedBy': 'erp/tools/build_i18n.py', 'locales': []}
    index['locales'].append({'code': 'en_US', 'dir': 'ltr', 'native': 'English', 'file': None,
                             'sources': ['ad_seed.db base language (iDempiere en_US)'], 'counts': {}})
    for lang, srcs in SOURCES.items():
        missing = [d for d, _ in srcs if not os.path.isdir(os.path.join(CACHE, d))]
        if missing: sys.exit('§I18N-BUILD FAIL lang=%s missing pack dir(s) %s — run erp/tools/fetch_i18n_packs.sh' % (lang, missing))
        out, stats = build(lang, srcs, base)
        mstats = machine_fill(lang, out, db)
        dirn, native = META[lang]
        counts = {t: stats[t]['kept'] for t in TABLES}
        detail = {t: dict(stats[t]) for t in TABLES}
        doc = {'lang': lang, 'dir': dirn, 'native': native, 'sources': [p for _, p in srcs], 'counts': counts, 'detail': detail,
               'machineCounts': mstats, 'machineSource': 'i18n/machine/%s.json — translated for this app by Claude (Anthropic); NOT a language pack' % lang if mstats else None}
        doc.update(out)
        fn = os.path.join(OUT, lang + '.json')
        with open(fn, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        index['locales'].append({'code': lang, 'dir': dirn, 'native': native, 'file': 'i18n/' + lang + '.json',
                                 'sources': doc['sources'], 'counts': counts, 'machineCounts': mstats, 'bytes': os.path.getsize(fn)})
        print('§I18N-BUILD lang=%s bytes=%d machine=%s %s' % (lang, os.path.getsize(fn), json.dumps(mstats, separators=(',', ':')), ' '.join(
            '%s=%d/%d(drift=%d,repurposed=%d,unofficial=%d,same=%d,absent=%d)' % (t, s['kept'], s['rows'], s['stale'], s['repurposed'], s['unofficial'], s['same'], s['absent']) for t, s in stats.items())))
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as f: json.dump(index, f, ensure_ascii=False, indent=1)
    print('§I18N-BUILD recovered-by-regex files=%d %s' % (len(RECOVERED), ' '.join(RECOVERED)))
    print('§I18N-BUILD index locales=%d → %s' % (len(index['locales']), os.path.join(OUT, 'index.json')))

if __name__ == '__main__': main()
