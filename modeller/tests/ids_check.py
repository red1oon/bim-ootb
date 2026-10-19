#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — helper of W-IDS: validate an IDS file against its schema, then an IFC against it (ifctester). Prints ONE JSON line with each specification's applicable / passed / failed counts and the tool versions (the same IDS can give different results in different tools: record them). usage: python ids_check.py <file.ids> <file.ifc>
import sys, json
try:
    import ifcopenshell, ifctester
    from ifctester import ids
except Exception as e:
    print(json.dumps({'error': 'ifctester missing: ' + str(e)})); sys.exit(3)
S = ids.open(sys.argv[1], validate=True)   # raises if the IDS file is not valid IDS 1.0 XML
f = ifcopenshell.open(sys.argv[2]); S.validate(f)
specs = [{'name': s.name, 'applicable': len(s.applicable_entities), 'passed': len(s.passed_entities), 'failed': len(s.failed_entities), 'status': bool(s.status)} for s in S.specifications]
print(json.dumps({'tools': {'ifcopenshell': ifcopenshell.version, 'ifctester': getattr(ifctester, '__version__', '?')}, 'specs': specs}))
