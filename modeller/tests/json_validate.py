#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — helper of W-FORMAT (prompts/DXF2BIM_FOUNDATION_LANE.md §2): validate a JSON file against a JSON Schema (python `jsonschema`). Prints one JSON line {errors:[...]}. usage: python3 json_validate.py <schema> <file>
import sys, json
try: import jsonschema
except Exception as e: print(json.dumps({'error': 'jsonschema missing: ' + str(e)})); sys.exit(3)
sch = json.load(open(sys.argv[1])); doc = json.load(open(sys.argv[2]))
v = jsonschema.Draft7Validator(sch)
errs = sorted(v.iter_errors(doc), key=lambda e: list(e.path))
print(json.dumps({'errors': [{'path': '/'.join(str(p) for p in e.path), 'msg': e.message[:160]} for e in errs[:8]], 'n': len(errs)}))
