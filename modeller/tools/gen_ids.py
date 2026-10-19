#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — generates standards/ids/dxf2bim-evidence-1.ids (buildingSMART IDS 1.0) from the code's own promises (prompts/DXF2BIM_FOUNDATION_LANE.md §4 (1)). Run with the dev environment python (ifctester). usage: python gen_ids.py <out.ids>
import sys
from ifctester import ids
CLASSES = ['IFCCOLUMN', 'IFCBEAM', 'IFCWALL', 'IFCFOOTING', 'IFCFAN', 'IFCCOVERING', 'IFCDOOR', 'IFCWINDOW', 'IFCMEMBER', 'IFCPLATE', 'IFCSLAB', 'IFCROOF', 'IFCBUILDINGELEMENTPROXY']   # the classes the writers emit (kinds table): ifctester matches the EXACT class, so an abstract name such as IFCELEMENT would select nothing and PASS vacuously
ELEMENTS = lambda: ids.Entity(name=ids.Restriction(options={'enumeration': CLASSES}))
S = ids.Ids(title='DXF2BIM evidence requirements', version='1', author='dxf2bim@invalid.example', description='What every IFC written by the DXF2BIM product promises: each element names the drawing sheet and entity it came from and the evidence tier of its geometry; the spatial structure exists; every element has a material; the reserved Pset_ name is not used for the evidence set.', purpose='validation of DXF2BIM output', milestone='each export')
def spec(name, app, reqs, desc, cardinality='required'):
    sp = ids.Specification(name=name, ifcVersion=['IFC4'], description=desc, minOccurs=1 if app == 'must' else 0)
    return sp
# 1. every element carries the evidence set with its tier, sheet, handle, layer and kind
sp = ids.Specification(name='Every element carries its evidence', ifcVersion=['IFC4'], minOccurs=1, description='Each element has Dxf2Bim_Evidence with Provenance (drawn | derived | assumed), SourceSheet, SourceHandle, SourceLayer and Kind.')
sp.applicability.append(ELEMENTS())
sp.requirements.append(ids.Property(propertySet='Dxf2Bim_Evidence', baseName='Provenance', value=ids.Restriction(options={'enumeration': ['drawn', 'derived', 'assumed']}), cardinality='required'))
for k in ('SourceSheet', 'SourceHandle', 'SourceLayer', 'Kind'): sp.requirements.append(ids.Property(propertySet='Dxf2Bim_Evidence', baseName=k, cardinality='required'))
S.specifications.append(sp)
# 2. spatial structure
for ent in ('IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY'):
    sp = ids.Specification(name=ent[3:].title() + ' exists and is named', ifcVersion=['IFC4'], description='The spatial structure is present.', minOccurs=1)
    sp.applicability.append(ids.Entity(name=ent)); sp.requirements.append(ids.Attribute(name='Name', cardinality='required')); S.specifications.append(sp)
# 3. material
sp = ids.Specification(name='Every element has a material', ifcVersion=['IFC4'], minOccurs=1, description='Every element is associated with a material.')
sp.applicability.append(ELEMENTS()); sp.requirements.append(ids.Material(cardinality='required')); S.specifications.append(sp)
# 4. the reserved prefix: the product's evidence set must not appear under the old reserved name
sp = ids.Specification(name='The evidence set does not use a reserved Pset_ name', ifcVersion=['IFC4'], description='Pset_Dxf2Bim (the name before 2026-10-19) must not appear: the Pset_ prefix is reserved for buildingSMART-defined sets.')
sp.applicability.append(ELEMENTS()); sp.requirements.append(ids.Property(propertySet='Pset_Dxf2Bim', baseName='Provenance', cardinality='prohibited')); S.specifications.append(sp)
S.to_xml(sys.argv[1]); print('wrote', sys.argv[1], 'specifications', len(S.specifications))
