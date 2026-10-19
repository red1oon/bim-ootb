// ⚠ DO NOT REMOVE — which python the witnesses use: $DXF2BIM_PY, else the isolated dev environment ~/.venvs/dxf2bim-dev (ifcopenshell, ifctester, pytest, jsonschema: created because the system python is externally managed), else python3.
'use strict';
const fs = require('fs'), path = require('path'), v = path.join(process.env.HOME, '.venvs', 'dxf2bim-dev', 'bin', 'python');
module.exports = process.env.DXF2BIM_PY || (fs.existsSync(v) ? v : 'python3');
