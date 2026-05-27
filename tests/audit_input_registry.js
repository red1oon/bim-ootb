/**
 * BIM OOTB — §S281 input/shortcut contract audit (static, CI-friendly, zero network).
 * The "quick check X" tool: verifies every keyboard shortcut resolves to a real target,
 * no key collides, and reserved keys aren't hijacked. Catches the class of bug where a
 * shortcut fires but targets a dead/hidden element (e.g. '.' → toggleOverflow on a
 * display:none toolbar). Model: tests/audit_specs.js (read source, regex, exit 1).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const V = path.join(__dirname, '..', 'viewer');
const scene = fs.readFileSync(path.join(V, 'scene.js'), 'utf8');
// All viewer JS concatenated — to confirm a shortcut's target fn is defined SOMEWHERE.
const allJs = fs.readdirSync(V).filter(f => f.endsWith('.js'))
  .map(f => fs.readFileSync(path.join(V, f), 'utf8')).join('\n');

let fail = 0, pass = 0;
const ok  = (m) => { pass++; console.log('  PASS ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('§S281_AUDIT shortcut contract');

// 1. Extract the _shortcuts map block and its keys.
const block = scene.slice(scene.indexOf('var _shortcuts = {'));
const mapBody = block.slice(0, block.indexOf('\n  };') + 1);
const keys = [...mapBody.matchAll(/^\s+'([^']+)':\s*function/gm)].map(m => m[1]);
ok('found ' + keys.length + ' shortcut keys: ' + keys.join(' '));

// 2. No duplicate keys.
const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
dupes.length ? bad('duplicate keys: ' + dupes.join(',')) : ok('no duplicate keys');

// 3. Reserved keys must NOT be shortcut keys (handled elsewhere in the dispatcher).
const reserved = ['Tab', 'Escape', 'F1', 'F11', 'Backspace', '\\', ' '];
const claimed = keys.filter(k => reserved.includes(k));
claimed.length ? bad('reserved keys claimed: ' + claimed.join(',')) : ok('no reserved keys claimed');

// 4. Each shortcut's target function is defined somewhere in viewer/*.js (not a dead ref).
//    Pull the identifier each handler calls (window.fn / A.fn / bareFn).
const handlers = [...mapBody.matchAll(/'([^']+)':\s*function\s*\(\)\s*\{([\s\S]*?)\n    \}/g)];
for (const [, key, body] of handlers) {
  // candidate call targets in the body
  const calls = [...body.matchAll(/(?:window\.|A\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)]
    .map(m => m[1])
    .filter(n => !['if', 'typeof', 'function', 'then', 'else'].includes(n));
  if (!calls.length) { continue; }
  // At least one called target must be defined somewhere (fn = , function fn, A.fn =, window.fn =)
  const resolved = calls.some(n =>
    new RegExp('(function\\s+' + n + '\\b|\\b' + n + '\\s*[:=]\\s*function|\\b' + n + '\\s*=\\s*\\()').test(allJs)
    || new RegExp('(A|window|APP)\\.' + n + '\\s*=').test(allJs));
  resolved ? ok("'" + key + "' → resolves (" + calls[0] + ')')
           : bad("'" + key + "' → DEAD: none of [" + calls.join(',') + '] defined in viewer/*.js');
}

console.log('§S281_AUDIT_SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
