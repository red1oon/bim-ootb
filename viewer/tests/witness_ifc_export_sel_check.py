#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — python half of W-IFC-EXPORT-SEL (viewer/tests/witness_ifc_export_sel.js). Read the log after every run; the exit code is not evidence.
# Spec: prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md "(b) SPEC". Issue it proves or disproves: "the Viewer's IFC is not valid IFC and cannot export a split (meta+geo) building."
# Usage: witness_ifc_export_sel_check.py <file.ifc>
#   Prints one line  §IFC_SEL_PY_JSON {...}  = schema, validate_errors (ifcopenshell.validate, 0 required), the first schema errors, the PRODUCTS actually in the file (not the spatial site / building / storeys),
#   their class counts, their ObjectType counts (where the source class of a generalised / proxied element is kept), duplicated GlobalIds, styled items.
# Exit 77 = ifcopenshell not installed (the node witness reports SKIP, never PASS). Reads the file read-only.
import sys, json, collections
try:
    import ifcopenshell, ifcopenshell.validate
except Exception as e:
    print('§IFC_SEL_PY SKIP ifcopenshell not importable: %s' % e); sys.exit(77)
f = ifcopenshell.open(sys.argv[1])
log = ifcopenshell.validate.json_logger(); ifcopenshell.validate.validate(f, log)
SPATIAL = ('IfcSite', 'IfcBuilding', 'IfcBuildingStorey')
prods = [p for p in f.by_type('IfcProduct') if not any(p.is_a(s) for s in SPATIAL)]
cls = collections.Counter(p.is_a() for p in prods)
objt = collections.Counter(p.ObjectType for p in prods if p.ObjectType)
gids = collections.Counter(r.GlobalId for r in f.by_type('IfcRoot'))
noshape = sum(1 for p in prods if not p.Representation)
out = {'schema': f.schema, 'validate_errors': len(log.statements), 'first_errors': [str(s)[:260] for s in log.statements[:5]], 'products': len(prods), 'classes': dict(cls), 'objectTypes': dict(objt),
       'dupGlobalIds': sum(1 for g, n in gids.items() if n > 1), 'styledItems': len(f.by_type('IfcStyledItem')), 'noRepresentation': noshape, 'storeys': len(f.by_type('IfcBuildingStorey'))}
print('§IFC_SEL_PY_JSON ' + json.dumps(out))
