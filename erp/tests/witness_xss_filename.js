// witness_xss_filename.js — W-XSS-FILENAME (bim-compiler prompts/CODEBASE_QUALITY_AUDIT_2026-07-02.md §5)
//
// ISSUE PROVED: a maliciously-named local file (e.g. `<img src=x onerror=alert(1)>.xlsx`)
// dropped on the Ninja-pill or Migrate-ShowMe file input used to render as LIVE HTML —
// `out.innerHTML = 'reading ' + f.name` (self-XSS-shaped; audit finding, 3 sinks + the
// download-link sink the audit missed). Proves the fix: the shipped _escHtml neutralizes
// tag characters (computed-value check, not a source-string check), benign names survive
// readable, and — secondary wiring check — every filename innerHTML sink in both files
// goes through _escHtml.
//
// Non-invent: loads the REAL erp/ninja_pill.js + erp/migrate_showme.js in a vm sandbox
// (production code verbatim, not re-typed) and calls the exact _escHtml each exposes.

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ERP = path.resolve(__dirname, '..');

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-XSS-FILENAME PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-XSS-FILENAME FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

function loadModule(file) {
  var sandbox = { console: console, setTimeout: setTimeout, URL: {}, Blob: function () {},
    OverlayKit: { el: function () { return {}; }, ico: function () { return ''; }, ensureSql: function () {} } };
  sandbox.self = sandbox; sandbox.window = sandbox; sandbox.global = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ERP, file), 'utf8'), sandbox, { filename: file });
  return sandbox;
}

var np = loadModule('ninja_pill.js').NinjaPill;
var ms = loadModule('migrate_showme.js').MigrateShowMe;

var EVIL = '<img src=x onerror=alert(1)>.xlsx';
var BENIGN = 'Q3 report & summary.xlsx';

[['NinjaPill', np], ['MigrateShowMe', ms]].forEach(function (m) {
  var name = m[0], mod = m[1];
  check(name + ' exposes _escHtml', mod && typeof mod._escHtml === 'function');
  if (!mod || !mod._escHtml) return;
  var out = mod._escHtml(EVIL);
  check(name + ' evil name has NO raw tag chars', out.indexOf('<') < 0 && out.indexOf('>') < 0, out);
  check(name + ' evil name escaped, not dropped', out.indexOf('&lt;img') === 0, out);
  check(name + ' benign name survives readable', mod._escHtml(BENIGN) === 'Q3 report &amp; summary.xlsx');
});

// Wiring (secondary): every innerHTML line that concatenates a filename is escaped.
['ninja_pill.js', 'migrate_showme.js'].forEach(function (file) {
  var offenders = fs.readFileSync(path.join(ERP, file), 'utf8').split('\n').filter(function (l) {
    return l.indexOf('.innerHTML') >= 0 && (/\bf\.name\b|\bfname\b/.test(l)) && l.indexOf('_escHtml(') < 0;
  });
  check(file + ' has no unescaped filename innerHTML sink', offenders.length === 0, offenders.join(' | '));
});

console.log('§W-XSS-FILENAME ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
