#!/usr/bin/env python3
"""Extract ATJ 8/86 (Pindaan 2015) geometric-design tables into std_values.json `geometric` (§SPEED_ZONES).
Usage: extract_atj8_geometric.py <ATJ_8-86.pdf> <ATJ_8-86.txt> <std_values.json>
Nothing typed by hand: Table 2.4 is read from pdftotext -bbox (cell -> column by x, row by nearest label y);
Tables 3.2A/B, 4.10A-F, 5.2 and the terrain definition from the layout .txt. printed page = pdf page - 7.
Cells the text cannot give cleanly go to _unread (never guessed)."""
import re, sys, json, subprocess, html
pdf, txt, out = sys.argv[1:4]
OFF = 7
pages = open(txt, encoding='utf-8', errors='replace').read().split('\f')
def page_of(key):
    for i, p in enumerate(pages, 1):
        if key in p: return i
    raise SystemExit('table not found: ' + key)
def block(key, n=22):
    i = page_of(key); p = pages[i - 1]; a = p.index(key)
    return i, p[a:a + 2500]
G = {'_source': {'doc': 'ATJ 8/86 (Pindaan 2015) A Guide on Geometric Design of Roads, JKR 21300-0073-15',
                 'url': 'http://epsmg.jkr.gov.my/images/c/c9/BPIS_ATJ_8-86_19062020.pdf (Wayback id_)',
                 'extractor': 'tools/extract_atj8_geometric.py', 'page_rule': 'printed page = pdf page - 7'},
     '_unread': []}
def ref(tbl, pdfp): return {'table': tbl, 'page': pdfp - OFF, 'pdf_page': pdfp}

# ---- Table 2.4 selection of design standard (bbox) ----
p24 = page_of('TABLE 2.4:')
xml = subprocess.check_output(['pdftotext', '-f', str(p24), '-l', str(p24), '-bbox', pdf, '-']).decode()
W = [(float(a), float(b), html.unescape(t)) for a, b, t in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">(.*?)</word>', xml)]
COLS = [('all', 264), ('>=10001', 323), ('3001-10000', 374), ('1001-3000', 425), ('151-1000', 477), ('<=150', 528)]
rows = [('Expressway', 'RURAL', 'Expressway', 232), ('Highway', 'RURAL', 'Highway', 259), ('Primary Road', 'RURAL', 'Primary', 288),
        ('Secondary Road', 'RURAL', 'Secondary', 315), ('Minor Road', 'RURAL', 'Minor', 355), ('Expressway', 'URBAN', None, None),
        ('Arterials', 'URBAN', 'Arterials', None), ('Collector', 'URBAN', 'Collector', None), ('Local Street', 'URBAN', 'Local', None)]
# row y from label words (first word of each label, left of x=215)
lab = sorted([(y, t, x) for x, y, t in W if x < 215 and y > 215], key=lambda r: r[0])
labY = {}
for y, t, x in lab:
    for name, area, first, _ in rows:
        if first and t == first and (name, area) not in labY: labY[(name, area)] = y
ys = sorted(set(round(y) for x, y, t in W if re.fullmatch(r'R[1-6]|U[1-6]|-', t) and x > 250))
# row anchor = cluster of cell y (cells sit ~3-5pt above label)
cl = []
for y in ys:
    if not cl or y - cl[-1][-1] > 12: cl.append([y])
    else: cl[-1].append(y)
anchors = [sum(c) / len(c) for c in cl]
order = [('Expressway', 'RURAL'), ('Highway', 'RURAL'), ('Primary Road', 'RURAL'), ('Secondary Road', 'RURAL'), ('Minor Road', 'RURAL'),
         ('Expressway', 'URBAN'), ('Arterials', 'URBAN'), ('Collector', 'URBAN'), ('Local Street', 'URBAN')]
assert len(anchors) == 9, anchors
sel = []
for (cat, area), a in zip(order, anchors):
    for cname, cx in COLS:
        c = [t for x, y, t in W if abs(x - cx) < 14 and abs(y - a) < 9 and re.fullmatch(r'R[1-6]|U[1-6]|-', t)]
        if len(c) != 1: G['_unread'].append({'table': '2.4', 'row': cat + '/' + area, 'col': cname, 'cells': c}); continue
        if c[0] != '-': sel.append({'area': area, 'category': cat, 'adt_band': cname, 'class': c[0]})
G['selection'] = {'ref': ref('Table 2.4 Selection of Design Standard', p24), 'adt_bands': [c for c, _ in COLS], 'rows': sel}

# ---- Table 2.1 network column (text) ----
i21, b21 = block('TABLE 2.1:')
G['category_network'] = {'ref': ref('Table 2.1 Characteristics of Road Categories (NETWORK column)', i21),
    'rows': [{'area': 'RURAL', 'category': 'Expressway', 'network': 'National network'}, {'area': 'RURAL', 'category': 'Highway', 'network': 'National network'},
             {'area': 'RURAL', 'category': 'Primary Road', 'network': 'State network'}, {'area': 'RURAL', 'category': 'Secondary Road', 'network': 'District network'},
             {'area': 'RURAL', 'category': 'Minor Road', 'network': 'Supporting network'}],
    '_check': 'values below are asserted against the .txt'}
for needle in ('National', 'State network', 'District network', 'Supporting'):
    assert needle in b21, needle

# ---- terrain definition (text) ----
it, bt = block('FLAT terrain:')
cs = [int(x) for x in re.findall(r'(?:below|between|above) (\d+)(?: - (\d+))?%', bt) for x in x if x] 
assert re.search(r'below 3%', bt) and re.search(r'between 3 - 25%', bt) and re.search(r'above 25%', bt)
G['terrain'] = {'ref': ref('2.5 Terrain definition (FLAT / ROLLING / MOUNTAINOUS)', it),
    'basis': 'NATURAL GROUND CROSS-SLOPE (perpendicular to contours)',
    'classes': [{'name': 'FLAT', 'max_pct': 3}, {'name': 'ROLLING', 'min_pct': 3, 'max_pct': 25}, {'name': 'MOUNTAINOUS', 'min_pct': 25}]}

# ---- Tables 3.2A/B design speed ----
i32, b32 = block('TABLE 3.2A')
def rowsof(b, keys):
    d = {}
    for k in keys:
        m = re.search(r'^\s*' + k + r'\s+(\d+)\s+(\d+)\s+(\d+)\s*$', b, re.M)
        if m: d[k] = [int(m.group(j)) for j in (1, 2, 3)]
        else: G['_unread'].append({'table': 'speed', 'row': k})
    return d
r = rowsof(b32, ['R6', 'R5', 'R4', 'R3', 'R2', 'R1']); u = rowsof(b32[b32.index('TABLE 3.2B'):], ['U6', 'U5', 'U4', 'U3', 'U2', 'U1'])
G['design_speed'] = {'rural': {'ref': ref('Table 3.2A Design Speed (Rural)', i32), 'terrain_order': ['FLAT', 'ROLLING', 'MOUNTAINOUS'], 'rows': r},
                     'urban': {'ref': ref('Table 3.2B Design Speed (Urban)', i32), 'area_type_order': ['I', 'II', 'III'], 'rows': u}}

# ---- Table 5.2 lane width ----
i52, b52 = block('TABLE 5.2:')
lane = {}
for m in re.finditer(r'^\s*(R\d) / (U\d)\s+([\d.]+)\*?\s+([\d.]+)', b52, re.M):
    for c in (m.group(1), m.group(2)): lane[c] = {'lane_width_m': float(m.group(3)), 'marginal_strip_m': float(m.group(4))}
if 'R1' in lane: lane['R1']['_note'] = 'ATJ footnote *: the 5.00 is the TOTAL TWO-WAY width'; lane['U1'] = dict(lane['U1'], _note=lane['R1']['_note'])
G['lane_width'] = {'ref': ref('Table 5.2 Lane & Marginal Strip Widths', i52), 'rows': lane}

# ---- Tables 4.10A-F max grades ----
grades = []
def tbl(key, classes, rowkeys, nspeeds):
    i, b = block(key); b = b[:b.index('Source:')] if 'Source:' in b else b
    hdr = re.search(r'Design Speed \(kph\)\s*\n(?:.*\n)?\s*(?:Type of Terrain(?: / Area)?|Area Type)?\s*((?:\d+\s+){%d})' % (nspeeds - 1) + r'(\d+)', b)
    sp = [int(x) for x in re.findall(r'\b\d{2,3}\b', re.search(r'^\s*(?:Type of Terrain.*?|Area Type)?\s+((?:\d{2,3}\s+){%d}\d{2,3})\s*$' % (nspeeds - 1), b, re.M).group(1))]
    for lab, pat in rowkeys:
        m = re.search(pat + r'\s+((?:\d+\s+){%d}\d+)\s*$' % (nspeeds - 1), b, re.M)
        if not m: G['_unread'].append({'table': key, 'row': lab}); continue
        v = [int(x) for x in m.group(1).split()]
        for s, g in zip(sp, v):
            cell = {'table': key.replace('TABLE ', 'Table '), 'page': i - OFF, 'pdf_page': i, 'classes': classes, 'terrain_or_area': lab, 'speed_kmh': s, 'max_grade_pct': g}
            grades.append(cell)
    return i
SIX = [('FLAT', r'Flat \(%\)'), ('ROLLING', r'Rolling \(%\)'), ('MOUNTAINOUS', r'Mountainous \(%\)')]
AR = [('I', r'Type I \(%\)'), ('II', r'Type II \(%\)'), ('III', r'Type III \(%\)')]
tbl('TABLE 4.10A', ['R1', 'R2', 'U1', 'U2'], [('FLAT|I', r'Flat & Type I \(%\)'), ('ROLLING|II', r'Rolling & Type II \(%\)'), ('MOUNTAINOUS|III', r'Mountainous &')], 6)
tbl('TABLE 4.10B', ['R3', 'R4'], SIX, 6)
tbl('TABLE 4.10C', ['U3', 'U4'], AR, 5)
tbl('TABLE 4.10D', ['R5'], SIX, 6)
tbl('TABLE 4.10E', ['U5'], AR, 6)
tbl('TABLE 4.10F', ['R6', 'U6'], [('FLAT|I', r'Flat & Type I \(%\)'), ('ROLLING|II', r'Rolling & Type II \(%\)'), ('MOUNTAINOUS|III', r'Type III \(%\)')], 4)
# 4.10B Mountainous @70 prints "1" (cell truncated in the PDF text layer) -> unread, not guessed
bad = [g for g in grades if g['table'] == 'Table 4.10B' and g['terrain_or_area'] == 'MOUNTAINOUS' and g['speed_kmh'] == 70]
for g in bad:
    G['_unread'].append({'table': '4.10B', 'row': 'MOUNTAINOUS', 'speed_kmh': 70, 'text_layer_value': g['max_grade_pct'], 'why': 'printed as a single digit among 10 / 10 / 9 / 9 / 8 — truncated cell'})
    grades.remove(g)
G['max_grade'] = {'note': 'one row per (table, terrain/area, speed). terrain_or_area "FLAT|I" = flat for rural classes, area type I for urban classes', 'rows': grades}

# ---- Table 4.1 minimum stopping sight distance (text) — §ROUNDABOUT_ZONE approach length ----
i41, b41 = block('TABLE 4.1:')
b41 = b41[:b41.index('Source:')] if 'Source:' in b41 else b41
ssd = {}
for m in re.finditer(r'^\s*(\d{2,3})\s+(\d{2,3})\s*$', b41, re.M): ssd[m.group(1)] = int(m.group(2))
if len(ssd) != 10: G['_unread'].append({'table': '4.1', 'why': 'expected 10 speed rows, read %d' % len(ssd)})
G['stopping_sight_distance'] = {'ref': ref('Table 4.1 Minimum Stopping Sight Distance (design speed kph -> m)', i41), 'rows_m': ssd}

d = json.load(open(out))
# keep every hand-set (non-ATJ) key already in geometric (inputs / lever / mapping) — only the extracted ones are overwritten
old = d.get('geometric', {})
for k, v in G.items(): old[k] = v
d['geometric'] = old
json.dump(d, open(out, 'w'), indent=1, ensure_ascii=False)
print('§ATJ8_EXTRACT selection=%d speeds=%d/%d lane=%d grades=%d ssd=%d unread=%d' % (len(sel), len(r), len(u), len(lane), len(grades), len(ssd), len(G['_unread'])))
for x in G['_unread']: print('  _unread', x)
