/**
 * audit_spec_paths.js — §S281 verify all readFileSync paths in specs resolve.
 * Bug class prevented: s254 crashed the entire @fast suite because
 * readFileSync(../../boq_charts.html) pointed to repo root, not viewer/.
 * This audit catches any spec that references a non-existent local file.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SPECS_DIR = path.join(__dirname, 'specs');
let pass = 0, fail = 0;

function ok(msg)  { pass++; console.log('  §SPEC_PATHS PASS ' + msg); }
function bad(msg) { fail++; console.log('  §SPEC_PATHS FAIL ' + msg); }

console.log('§SPEC_PATHS audit — checking readFileSync paths in specs/');

const specs = fs.readdirSync(SPECS_DIR).filter(f => f.endsWith('.spec.js'));

for (const spec of specs) {
  const src = fs.readFileSync(path.join(SPECS_DIR, spec), 'utf8');
  // Match: readFileSync(path.join(__dirname, '...'), ...)
  // and:   readFileSync(path.resolve(__dirname, '...'), ...)
  const re = /readFileSync\(\s*(?:path\.(?:join|resolve))\(\s*__dirname\s*,\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const rel = m[1];
    const abs = path.resolve(SPECS_DIR, rel);
    if (fs.existsSync(abs)) {
      ok(spec + ' → ' + rel);
    } else {
      bad(spec + ' → ' + rel + ' (file not found: ' + abs + ')');
    }
  }
}

console.log('§SPEC_PATHS_SUMMARY specs=' + specs.length + ' pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
