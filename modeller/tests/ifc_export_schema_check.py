#!/usr/bin/env python3
"""
ifc_export_schema_check.py — the INDEPENDENT validator half of witness_ifc_export_schema.js
(spec: bim-compiler prompts/IFC_COMPLIANCE_SELFCHECK.md §EXPORTER_FIX).

  check <file.ifc>            -> one JSON line: validator statements + structural facts
  dumpB <building_db> <out>   -> JSON input for viewer/ifc_export_worker.js (mirrors viewer/import.js L690-737, read-only)

Uses ifcopenshell.validate(express_rules=False). Express/WHERE rules are NOT run: the `_pytest` module is not installed and
nothing is pip-installed (stated in the witness log line). Never uploads anything anywhere.
"""
import sys, json, re, collections, base64, sqlite3

GUID_RE = re.compile(r'^[0-3][0-9A-Za-z_$]{21}$')


def check(path):
    import ifcopenshell, ifcopenshell.validate as v
    r = {'file': path, 'open_ok': False}
    try:
        m = ifcopenshell.open(path)
    except Exception as e:                      # unparsable -> a detectable failure, not a pass
        r['open_error'] = '%s: %s' % (type(e).__name__, str(e)[:160])
        return r
    r['open_ok'] = True
    r['schema'] = m.schema
    lg = v.json_logger()
    v.validate(m, lg, express_rules=False)
    st = lg.statements
    r['errors'] = len(st)
    cls = collections.Counter()
    for s in st:
        msg = s.get('message', '')
        head = ' '.join(msg.split())[:110]
        ent = s.get('instance')
        cls[(ent.is_a() if ent is not None and hasattr(ent, 'is_a') else '?', head)] += 1
    r['classes'] = [{'n': n, 'entity': k[0], 'msg': k[1]} for k, n in cls.most_common(12)]

    roots = m.by_type('IfcRoot')
    gids = [x.GlobalId for x in roots]
    r['guids'] = {'roots': len(gids), 'distinct': len(set(gids)), 'invalid': sum(1 for g in gids if not (g and GUID_RE.match(g)))}

    projs = m.by_type('IfcProject')
    r['spatial'] = {'project': len(projs), 'site': len(m.by_type('IfcSite')), 'building': len(m.by_type('IfcBuilding')),
                    'storey': len(m.by_type('IfcBuildingStorey')), 'rel_aggregates': len(m.by_type('IfcRelAggregates')),
                    'rel_contained': len(m.by_type('IfcRelContainedInSpatialStructure'))}
    elems = [e for e in m.by_type('IfcElement') if not e.is_a('IfcOpeningElement')]
    orph = [e for e in elems if len(getattr(e, 'ContainedInStructure', ()) or ()) != 1]
    r['elements'] = len(elems)
    r['orphans'] = len(orph)
    # aggregation chain reaches every spatial element from the project
    chain_ok = False
    if len(projs) == 1:
        seen, todo = set(), [projs[0]]
        while todo:
            o = todo.pop()
            for rel in (getattr(o, 'IsDecomposedBy', ()) or ()):
                for k in rel.RelatedObjects:
                    if k.id() not in seen:
                        seen.add(k.id()); todo.append(k)
        spat = set(x.id() for t in ('IfcSite', 'IfcBuilding', 'IfcBuildingStorey') for x in m.by_type(t))
        chain_ok = bool(spat) and spat <= seen
    r['aggregate_chain_ok'] = chain_ok

    units = {}
    if len(projs) == 1 and projs[0].UnitsInContext:
        for u in projs[0].UnitsInContext.Units or ():
            if u.is_a('IfcSIUnit'):
                units[u.UnitType] = {'name': u.Name, 'prefix': u.Prefix}
    r['units'] = units
    reps = m.by_type('IfcShapeRepresentation')
    bad = [x for x in reps if x.ContextOfItems is None or not x.ContextOfItems.is_a('IfcGeometricRepresentationContext')]
    r['shape_reps'] = {'n': len(reps), 'bad_context': len(bad),
                       'contexts': len(m.by_type('IfcGeometricRepresentationContext')),
                       'body_subcontexts': sum(1 for c in m.by_type('IfcGeometricRepresentationSubContext') if c.ContextIdentifier == 'Body')}
    r['emitted_extras'] = {t: len(m.by_type(t)) for t in ('IfcSpace', 'IfcMaterial', 'IfcPropertySet', 'IfcElementQuantity', 'IfcRelAssociatesMaterial')}
    return r


def judge(r):
    """The verdict the witness uses on EVERY file, controls included. INCONCLUSIVE when nothing was judged."""
    if not r.get('open_ok'):
        return 'FAIL', ['unopenable: ' + r.get('open_error', '?')]
    if not r.get('elements') and not r['guids']['roots']:
        return 'INCONCLUSIVE', ['no products judged']
    why = []
    if r['errors']: why.append('validate=%d' % r['errors'])
    g = r['guids']
    if g['distinct'] != g['roots']: why.append('dupGuid=%d' % (g['roots'] - g['distinct']))
    if g['invalid']: why.append('badGuid=%d' % g['invalid'])
    if r['orphans']: why.append('orphans=%d' % r['orphans'])
    if r['shape_reps']['bad_context']: why.append('nullContext=%d' % r['shape_reps']['bad_context'])
    if r['spatial']['project'] != 1: why.append('project=%d' % r['spatial']['project'])
    return ('FAIL' if why else 'PASS'), why


def dumpB(dbpath, out):
    c = sqlite3.connect('file:%s?mode=ro' % dbpath, uri=True)
    b = lambda x: base64.b64encode(x).decode() if x is not None else None
    meta = {'buildingName': 'Building'}
    for k, val in c.execute('select key,value from project_metadata'):          # same keys viewer/import.js reads
        if k == 'building_name': meta['buildingName'] = val
        if k == 'project_name': meta['projectName'] = val
        if k == 'import_date': meta['importDate'] = val
    els = [dict(guid=r[0], ifcClass=r[1], name=r[2], storey=r[3], discipline=r[4], material=r[5])
           for r in c.execute('select guid,ifc_class,element_name,storey,discipline,material_rgba from elements_meta')]
    tx = [dict(guid=r[0], cx=r[1], cy=r[2], cz=r[3]) for r in c.execute('select guid,center_x,center_y,center_z from element_transforms')]
    ge = [dict(guid=r[0], vertices=b(r[1]), faces=b(r[2])) for r in c.execute(
        'select ei.guid,cg.vertices,cg.faces from element_instances ei join component_geometries cg on ei.geometry_hash=cg.geometry_hash')]
    json.dump(dict(elements=els, transforms=tx, geometries=ge, meta=meta), open(out, 'w'))
    src = {'elements': len(els), 'material_name_rows': c.execute('select count(*) from elements_meta where material_name is not null and material_name<>""').fetchone()[0],
           'spaces': c.execute("select count(*) from spatial_structure where type='IfcSpace'").fetchone()[0],
           'storeys': c.execute("select count(*) from spatial_structure where type='IfcBuildingStorey'").fetchone()[0]}
    print(json.dumps(src))


if __name__ == '__main__':
    if sys.argv[1] == 'check':
        r = check(sys.argv[2]); r['verdict'], r['why'] = judge(r); print(json.dumps(r))
    elif sys.argv[1] == 'dumpB':
        dumpB(sys.argv[2], sys.argv[3])
