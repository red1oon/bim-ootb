#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — helper of W-IFC-VALID (prompts/DXF2BIM_FOUNDATION_LANE.md §1): independent IFC check with IfcOpenShell. Prints ONE JSON line: schema, schema-level validation statements, header problems, custom property-set names that use the reserved `Pset_` prefix.
# usage: python3 ifc_validate.py <file.ifc>      (run it WITHOUT -I: ifcopenshell lives in the user site)
import sys, json
try:
    import ifcopenshell, ifcopenshell.validate
except Exception as e:
    print(json.dumps({'error': 'ifcopenshell missing: ' + str(e)})); sys.exit(3)
f = ifcopenshell.open(sys.argv[1])
log = ifcopenshell.validate.json_logger(); ifcopenshell.validate.validate(f, log, express_rules=False)
fn = f.header.file_name
hdr = [] if (fn.author and fn.organization and fn.authorization is not None) else ['FILE_NAME author/organisation/authorisation missing ($)']   # a list holding one empty string is valid; `($)` or `$` is not
STD = {'Pset_ColumnCommon', 'Pset_BeamCommon', 'Pset_WallCommon', 'Pset_SlabCommon', 'Pset_DoorCommon', 'Pset_WindowCommon', 'Pset_MaterialConcrete', 'Pset_MaterialSteel', 'Pset_ConcreteElementGeneral'}   # a Pset_ name must be a standard one; this list is only what the product could legitimately emit
bad = sorted({p.Name for p in f.by_type('IfcPropertySet') if p.Name and p.Name.startswith('Pset_') and p.Name not in STD})
ev = sum(1 for p in f.by_type('IfcPropertySet') if p.Name == 'Dxf2Bim_Evidence')
print(json.dumps({'schema': f.schema, 'entities': len(list(f)), 'statements': len(log.statements), 'first': [str(s.get('message'))[:140].replace('\n', ' ') for s in log.statements[:3]], 'header_problems': hdr, 'reserved_pset_names': bad, 'evidence_sets': ev}))
