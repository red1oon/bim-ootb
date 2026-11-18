#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — python half of W-IFC-EXPORT-SEL step (d) (viewer/tests/witness_ifc_export_sel_d.js). Read the log after every run; the exit code is not evidence.
# Spec: prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md "(d) SPEC". Issue it proves or disproves: "an upgraded building exported from the Viewer is not the add-on file the Modeller writes: no materials, no property sets, no part relations".
# Usage: witness_ifc_export_sel_d_check.py <file.ifc>
#   Prints one line  §IFC_SEL_D_JSON {...} = for every product (not the project / site / building / storeys): GlobalId, class, Tag, Name, the material names associated with it, its property sets (type + value of every property),
#   the GlobalId of the spatial container it is contained in (none when it is aggregated), and every IfcRelAggregates whose whole is a product (not the spatial structure): whole GlobalId -> [part GlobalIds].
# Exit 77 = ifcopenshell not installed (the node witness reports INCONCLUSIVE, never PASS). Reads the file read-only.
import sys, json, collections
try:
    import ifcopenshell
except Exception as e:
    print('§IFC_SEL_D SKIP ifcopenshell not importable: %s' % e); sys.exit(77)
f = ifcopenshell.open(sys.argv[1])
SPATIAL = ('IfcSite', 'IfcBuilding', 'IfcBuildingStorey')
prods = {p.GlobalId: p for p in f.by_type('IfcProduct') if not any(p.is_a(s) for s in SPATIAL)}
out = {gid: {'cls': p.is_a(), 'tag': getattr(p, 'Tag', None), 'name': p.Name, 'mat': [], 'psets': {}, 'cont': None} for gid, p in prods.items()}
for r in f.by_type('IfcRelAssociatesMaterial'):
    m = r.RelatingMaterial
    for o in r.RelatedObjects:
        if o.GlobalId in out: out[o.GlobalId]['mat'].append(m.Name if m is not None and hasattr(m, 'Name') else None)
for r in f.by_type('IfcRelDefinesByProperties'):
    ps = r.RelatingPropertyDefinition
    if not ps.is_a('IfcPropertySet'): continue
    props = {}
    for q in ps.HasProperties:
        v = q.NominalValue
        props[q.Name] = [v.is_a() if v is not None else None, v.wrappedValue if v is not None else None]
    for o in r.RelatedObjects:
        if o.GlobalId in out: out[o.GlobalId]['psets'].setdefault(ps.Name, {}).update(props)
for r in f.by_type('IfcRelContainedInSpatialStructure'):
    for o in r.RelatedElements:
        if o.GlobalId in out: out[o.GlobalId]['cont'] = r.RelatingStructure.GlobalId
aggs = collections.defaultdict(list)
for r in f.by_type('IfcRelAggregates'):
    w = r.RelatingObject
    if w.GlobalId in out:
        aggs[w.GlobalId] += [o.GlobalId for o in r.RelatedObjects]
print('§IFC_SEL_D_JSON ' + json.dumps({'schema': f.schema, 'products': out, 'aggs': {k: sorted(v) for k, v in aggs.items()}}))
