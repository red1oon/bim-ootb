// W-IFC-GUID: bonsai_ifc.js guid(n). Issue: the old LCG (x % 64 on its low bits) had period 64, so a 457-product export carried 64 duplicated
// IfcGloballyUniqueIds and the IFC->DB extractor collapsed products (212 of 457 survived). Read the log; exit code is not evidence.
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'bonsai_ifc.js'), 'utf8');
// RC 2026-11-02: §M3B-CARRY (#2531) renamed the generator to _guid0 and wrapped it in guid(n), which steps past reserved (carried) GlobalIds. The cut takes the generator,
// the _reserved slot and the wrapper together; G1-G4 judge the generator as before (via guid with nothing reserved), G5 judges the wrapper.
const m = src.match(/const GUID_AB[^\n]*\n  function _guid0[\s\S]*?\n  }\n[\s\S]*?let _reserved = null;\n  function guid\(n\)[^\n]*\n/)[0];
eval(m.replace('let _reserved = null;', 'global.__res = null; var _reserved = null;') + ';global.g=guid; global.setRes = r => { _reserved = r; };');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const S = new Set(); for (let n = 0; n < 300000; n++) S.add(g(n));
ok('G1 300000 consecutive ids are all distinct', S.size === 300000, String(S.size));
ok('G2 22 chars, first char 0-3 (IFC compressed GUID), alphabet only', [0, 1, 456, 299999].every(n => /^[0-3][A-Za-z0-9_$]{21}$/.test(g(n))), g(456));
ok('G3 deterministic', g(77) === g(77));
ok('G4 FALSIFIER: the old generator would have failed G1', (() => { const AB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$', o = n => { let s = '', x = (n + 1) * 2654435761 >>> 0; for (let i = 0; i < 22; i++) { s += AB[x % 64]; x = (x * 1103515245 + 12345) >>> 0; } return s; }; const T = new Set(); for (let n = 0; n < 457; n++) T.add(o(n)); return T.size < 457; })());
{ const taken = new Set([g(5), g(6)]); setRes(taken); const a = g(5), b = g(6), c = g(7); setRes(null);
  ok('G5 the wrapper never hands out a reserved (carried) GlobalId, and leaves unreserved ids as they were', !taken.has(a) && !taken.has(b) && a !== b && c === g(7) && /^[0-3][A-Za-z0-9_$]{21}$/.test(a), a + ' ' + b); }
console.log(fail ? 'W-IFC-GUID FAIL' : 'W-IFC-GUID PASS'); process.exit(fail ? 1 : 0);
