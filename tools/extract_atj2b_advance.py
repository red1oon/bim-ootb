#!/usr/bin/env python3
"""Extract the §SIGN_VS_SPEED rules from ATJ 2B/85 + ATJ 2A/85 (Pindaan 2019) into std_values.json `advance_placement`.
Usage: extract_atj2b_advance.py <ATJ_2B.txt> <ATJ_2A.txt> <std_values.json>
Nothing typed by hand: the two distances come from regex over clause 2.2.8 (Traffic Signal Ahead WD.22 / Roundabout Ahead WD.31);
the sign-code -> hazard-kind link is read from the clause heading words; every row carries .txt line + pdf page + printed page.
Also records (a) every other 'in advance' distance in 2B as NOT locatable in the model (listed, never judged) and
(b) the PHASE-1 finding for size-vs-speed: which speed-banded tables exist in 2A/2B and why none applies to a sign board in the model.
Cells the text cannot give cleanly -> `_unread`. Log: §ATJ2B_EXTRACT."""
import re, sys, json
b_txt, a_txt, out = sys.argv[1:4]
def load(p):
    t = open(p, encoding='utf-8', errors='replace').read(); return t, t.split('\f')
B, Bp = load(b_txt); A, Ap = load(a_txt)
def where(txt, pages, idx):
    line = txt[:idx].count('\n') + 1; pdf = txt[:idx].count('\f') + 1
    nums = [l.strip() for l in pages[pdf - 1].split('\n') if re.fullmatch(r'\s*\d{1,3}\s*', l)]
    return {'txt_line': line, 'pdf_page': pdf, 'page': int(nums[-1]) if len(nums) == 1 else None}
def clean(s):  # drop the watermark column ("LY","N","O"...) and collapse whitespace
    ls = [l for l in s.split('\n') if not re.fullmatch(r'\s*[A-Z]{1,3}\s*', l)]
    return re.sub(r'\s+', ' ', ' '.join(ls)).strip()
unread = []
# ---- clause 2.2.8 -------------------------------------------------------------------------------------------------
i = B.index('2.2.8   Traffic Signal Ahead Sign (WD.22) and Roundabout Ahead Sign')
j = B.index('2.2.9   Chevron Sign', i)
body = clean(B[i:j])
head = re.match(r'2\.2\.8 (.+?) A Traffic Signal Ahead', body).group(1)
pairs = re.findall(r'([A-Za-z ]+?) Sign \((WD\.\d+[a-z]?)\)', head)   # [('Traffic Signal Ahead','WD.22'), ('Roundabout Ahead','WD.31')]
m = re.search(r'at a distance (\d+) m or not less than (\d+) m in urban areas, and (\d+) m or not less than (\d+) m in rural areas or high speed roads in advance of the respective traffic signal or roundabout', body)
rules, clause = [], None
HAZ = {'signal': 'signal_junction', 'roundabout': 'roundabout'}      # heading keyword -> geometric.node_kinds key
if m and len(pairs) == 2:
    u_nom, u_min, r_nom, r_min = map(int, m.groups())
    ref = where(B, Bp, i)
    clause = {'clause': '2.2.8', 'ref': ref, 'urban': {'nominal_m': u_nom, 'min_m': u_min}, 'rural_or_high_speed': {'nominal_m': r_nom, 'min_m': r_min},
              'text': body[body.index('This sign, either'):][:330]}
    for name, code in pairs:
        k = [v for kw, v in HAZ.items() if kw in name.lower()]
        if len(k) != 1: unread.append({'code': code, 'why': 'heading words "%s" do not name exactly one hazard kind' % name}); continue
        rules.append({'code': code.replace('.', '').replace(' ', ''), 'sign_name': re.sub(r'^and ', '', name.strip()), 'hazard': k[0], 'clause': '2.2.8', 'ref': ref})
else:
    unread.append({'clause': '2.2.8', 'why': 'distance sentence or heading did not match the expected shape'})
# ---- every other "in advance" distance (not locatable in the model: listed, not judged) -------------------------
other = []
for k, line in enumerate(B.split('\n'), 1):
    if re.search(r'in advance|\bahead of\b', line) and re.search(r'\d+\s*(m|km)\b', line) and not (clause and clause['ref']['txt_line'] <= k <= clause['ref']['txt_line'] + 40):
        idx = sum(len(l) + 1 for l in B.split('\n')[:k - 1])
        w = where(B, Bp, idx); other.append({'txt_line': k, 'pdf_page': w['pdf_page'], 'page': w['page'], 'text': re.sub(r'\s+', ' ', line).strip()[:140]})
# ---- PHASE 1: size vs speed -----------------------------------------------------------------------------------------
tabs = []
for txt, pages, doc in ((B, Bp, 'ATJ 2B/85'), (A, Ap, 'ATJ 2A/85')):
    for mm in re.finditer(r'km/h\s*<\s*Speed [Ll]imit', txt):      # a speed-banded row ("60km/h < Speed Limit < 80km/h")
        w = where(txt, pages, mm.start()); w['doc'] = doc; w['what'] = 'letter-height table' if re.search(r'letter', pages[w['pdf_page'] - 1], re.I) and re.search(r'height', pages[w['pdf_page'] - 1], re.I) else 'unclassified'; tabs.append(w)
seen, tabs2 = set(), []
for t in tabs:
    key = (t['doc'], t['pdf_page'])
    if key in seen: continue
    seen.add(key); tabs2.append(t)
wd39 = A[A.index('WD. 39a & 39b CHEVRON DELINEATOR'):][:2400]
wd39_speed = bool(re.search(r'speed|km/h', wd39, re.I))
wd39_sizes = re.findall(r'(\d+)mm x (\d+)mm', wd39)
size = {'status': 'no_rule_for_model',
        'finding': 'No speed-banded SIGN-BOARD size table exists in ATJ 2A/2B. The only speed-banded size tables are LETTER HEIGHT for guide signs / gantries / camera boxes (needs lettering, which the model does not carry). WD.39a/39b chevron sizes are three options (' + ', '.join('%sx%s' % s for s in wd39_sizes) + ' mm) with NO speed mapping in the text (speed/km/h in the WD.39 block: %s). 2B p.56 shape sizes (min/normal width per shape) are not speed-banded.' % wd39_speed,
        'speed_banded_tables': tabs2, 'wd39_block_mentions_speed': wd39_speed, 'wd39_sizes_mm': ['%sx%s' % s for s in wd39_sizes]}
if wd39_speed: unread.append({'code': 'WD39a/39b', 'why': 'WD.39 block mentions speed - size mapping needs a manual read'})
doc = {'_source': {'doc': 'ATJ 2B/85 (Pindaan 2019) Sign Application + ATJ 2A/85 (Pindaan 2019) Standard Traffic Signs', 'extractor': 'tools/extract_atj2b_advance.py',
                   'page_rule': 'page = printed page number found on that pdf page (null when ambiguous); pdf_page and txt_line always given',
                   'status': 'primary'},
       'clause_2_2_8': clause, 'rules': rules,
       'area_input': 'geometric.inputs.area (RURAL -> rural_or_high_speed column, URBAN -> urban column; "high speed roads" has no numeric threshold in the text so the speed is shown, not used)',
       'verdict_rule': 'OK when along-route distance sign -> hazard >= min_m of the column; CHECK when below min_m (nominal_m shortfall is stated in the detail). No upper bound in the text.',
       'other_advance_distances_not_locatable': other, 'size_vs_speed': size, '_unread': unread}
sv = json.load(open(out, encoding='utf-8')); sv['advance_placement'] = doc
json.dump(sv, open(out, 'w'), indent=1, ensure_ascii=False)
print('§ATJ2B_EXTRACT rules=%d urban=%s rural=%s other=%d speedTables=%d unread=%d' % (len(rules), clause and clause['urban'], clause and clause['rural_or_high_speed'], len(other), len(tabs2), len(unread)))
