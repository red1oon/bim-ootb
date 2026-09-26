# ⚠ DO NOT REMOVE — scope: carry each LAMP's room USE (IfcSpace LongName, else Name) from a building's SOURCE IFC into a viewer
# sidecar buildings/space_uses/<Building>.json, by GUID through IfcRelContainedInSpatialStructure (element -> IfcSpace). No
# coordinates, no values invented: a lamp not contained in a space is simply absent. Lamps = the viewer's own selector
# (tools.js _nightFixtureWorldPositions: IfcLightFixture OR a luminaire word in element_name). Read the printed match count.
# RUN: python3 extract_space_uses.py <Building_extracted.db> <out.json> <source.ifc> [<source2.ifc> ...]
import sys, json, sqlite3, collections, ifcopenshell
dbp, outp, ifcs = sys.argv[1], sys.argv[2], sys.argv[3:]
m, src = {}, []
for p in ifcs:
    f = ifcopenshell.open(p); n = 0
    for r in f.by_type('IfcRelContainedInSpatialStructure'):
        s = r.RelatingStructure
        if s.is_a('IfcSpace'):
            for e in r.RelatedElements: m[e.GlobalId] = (s.LongName or s.Name or '').strip(); n += 1
    src.append({ 'ifc': p.split('/')[-1], 'containedInSpaces': n })
db = sqlite3.connect(dbp)
rows = db.execute("SELECT m.guid FROM elements_meta m WHERE (m.ifc_class='IfcLightFixture' OR LOWER(m.element_name) LIKE '%light%' OR LOWER(m.element_name) LIKE '%troffer%' OR LOWER(m.element_name) LIKE '%downlight%' OR LOWER(m.element_name) LIKE '%luminaire%' OR LOWER(m.element_name) LIKE '%lamp%' OR LOWER(m.element_name) LIKE '%sconce%')").fetchall()
lamps = { g: m[g] for (g,) in rows if g in m and m[g] }
json.dump({ 'db': dbp.split('/')[-1], 'sources': src, 'lampCandidates': len(rows), 'matched': len(lamps), 'lamps': lamps }, open(outp, 'w'), indent=0, sort_keys=True)
print('lamp candidates', len(rows), 'matched to a room use', len(lamps), '->', outp)
print('uses', collections.Counter(lamps.values()).most_common(12))
