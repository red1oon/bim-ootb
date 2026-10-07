#!/usr/bin/env python3
"""Extract the ATJ 2A/85 (Pindaan 2019) sign catalogue (Appendix 4, printed pp.105-119)
from the pdftotext -layout .txt into std_values.json `signs`. Reproducible; nothing typed by hand.
Usage: extract_atj2a_signs.py <ATJ_2A txt> <out.json>
Code rows = lines made only of sign codes; the name = uppercase words under that code's column
until the next code row. Rows with no readable name keep the code (name:null) and are listed in _unread."""
import re, sys, json
CODE = re.compile(r'\b(RP|RM|WD)\s?(\d+[a-z]?)(\s?\((?:i{1,3}|iv|v|vi)\))?')
src, out = sys.argv[1], sys.argv[2]
pages = open(src, encoding='utf-8', errors='replace').read().split('\f')
signs, unread = [], []
GROUP = {'RP': 'Regulatory Prohibitive', 'RM': 'Regulatory Mandatory', 'WD': 'Warning Danger'}
for pi, txt in enumerate(pages, 1):
    lines = txt.split('\n')
    m = [re.search(r'Scale : Not to scale\s+(\d+)', l) for l in lines]
    printed = next((int(x.group(1)) for x in m if x), None)
    rows = []
    for i, l in enumerate(lines):
        if l.strip() and not CODE.sub('', l).strip() and CODE.search(l):
            rows.append(i)
    if not rows or printed is None:
        continue
    rows.append(len(lines))
    for a, b in zip(rows, rows[1:]):
        cols = [(mm.start(), re.sub(r'\s', '', mm.group(0))) for mm in CODE.finditer(lines[a])]
        bounds = [c[0] - 12 for c in cols] + [10**6]
        for k, (x, code) in enumerate(cols):
            lo, hi = bounds[k], bounds[k + 1]
            words = []
            for l in lines[a + 1:b]:
                if 'Scale' in l or re.search(r'(PROHIBITIVE|MANDATORY|DANGER|WARNING)\s+SIGNS', l): continue
                seg = l[max(lo, 0):hi]
                for w in seg.split():
                    if re.fullmatch(r"[A-Z][A-Z/\-',()&]+|[A-Z]", w) and len(w) > 2 or w in ('OF', 'TO', 'NO', 'ON', 'AT', 'OR', 'U-TURN', 'IN', 'BY'):
                        words.append(w)
            if words and words[0] == 'IN': words = words[1:]  # pdf watermark column artefact
            name = ' '.join(words) or None
            code_n = code.upper().replace('(', ' (') if False else code
            entry = {'code': code, 'name': name, 'group': GROUP[code[:2]],
                     'table': 'Appendix 4 Standard Traffic Signs (Colours)', 'page': printed, 'pdf_page': pi}
            signs.append(entry)
            if not name: unread.append(code)
seen, uniq = set(), []
for s in signs:
    if s['code'] in seen: continue
    seen.add(s['code']); uniq.append(s)
doc = {'_source': {'doc': 'ATJ 2A/85 (Pindaan 2019) Manual on Traffic Control Devices: Standard Traffic Signs, JKR 20401-0053-15',
                   'url': 'http://epsmg.jkr.gov.my/images/8/81/ATJ_2A.85_P_2019-WM.pdf (Wayback 20250614112213)',
                   'status': 'primary', 'extractor': 'tools/extract_atj2a_signs.py',
                   'note': 'Names are best-effort from pdftotext column layout; the code is the checked key.'},
       '_model_map': {'discipline': 'SIGNAGE', 'code_prop': '17_Code',
                      'note': 'where the sign code lives in the model (measured in JELAPANG element_psets, CIVIL_HIGHWAY_JELAPANG.md §K-6.1)'},
       'signs': uniq, '_unread': unread}
json.dump(doc, open(out, 'w'), indent=1, ensure_ascii=False)
print('codes', len(uniq), 'unread-name', len(unread))
