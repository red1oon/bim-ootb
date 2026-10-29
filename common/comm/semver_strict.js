// ⚠ DO NOT REMOVE — Scope: ONE strict version + range parser for plugins, releases and (through major()) team op shapes. Spec: prompts/TEAMWORK_FRAMEWORK.md §46.6 S4 (review finding F4). READ THE LOG after every run.
// Witness: scripts/witness_semver_strict.js (bim-compiler) · erp/tests/witness_plugin_semver.js (bim-ootb).
//
// WHY: erp/plugin_registry.js's old parseVer returned [0,0,0] for garbage, so a range like "[1.2,2)" silently meant "= 0.0.0" and a typo in `requires` passed or failed for no stated reason.
// THIS LIBRARY THROWS on anything it cannot read. It never guesses, never returns a default.
//
//   Version : 1-3 dot-separated non-negative integers with no leading zeros ("1", "1.2", "1.2.3"; a missing part is 0), then an optional semver pre-release "-alpha.1" and ignored build "+meta".
//             A pre-release sorts BELOW the same version without one (semver precedence).  Anything else ("", "x", "1.x", "1.2.3.4", "v1", "01.2", "1..2") THROWS.
//   Range   : "*" (or empty) · "1.2.3" or "=1.2.3" (exact) · ">=a" ">a" "<=a" "<a" · the OSGi two-sided intervals "[a,b)" "(a,b]" "[a,b]" "(a,b)" (spaces allowed). An interval needs a < b, or a = b with both ends inclusive.
//             (Our existing grammar: a bare version is EXACT, unlike OSGi where a bare "1.2" means "at least". Kept, because every bundle already written relies on it.)
//   Op shapes keep their INTEGER `_sv` / `sv` (signed data, consecutive upcaster steps): it is the shape's semver MAJOR — major("2.1.0") === 2. Plugins and releases carry the full semver. ONE parser, TWO version fields.
//
//   VersionRange.parse(v) -> {major, minor, micro, pre:[...]|null}   (throws)       VersionRange.valid(v) -> bool (never throws)
//   VersionRange.compare(a, b) -> -1|0|1   (throws)                                   VersionRange.major(v) -> integer (throws)
//   VersionRange.parseRange(r) -> {kind, ...}   (throws)                              VersionRange.satisfies(v, r) -> bool   (throws on a bad v OR a bad r)
'use strict';
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VersionRange = api;
}(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  var NUM = '(?:0|[1-9][0-9]*)', PRE_ID = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
  var VER = new RegExp('^(' + NUM + ')(?:\\.(' + NUM + '))?(?:\\.(' + NUM + '))?(?:-(' + PRE_ID + '(?:\\.' + PRE_ID + ')*))?(?:\\+[0-9A-Za-z.-]+)?$');

  function parse(v) {
    if (typeof v !== 'string') throw new TypeError('version must be a string, got ' + (v === null ? 'null' : typeof v));
    var m = VER.exec(v.trim());
    if (!m) throw new TypeError('invalid version "' + v + '" (expected major[.minor[.micro]][-prerelease])');
    var out = { major: Number(m[1]), minor: Number(m[2] || 0), micro: Number(m[3] || 0), pre: m[4] ? m[4].split('.') : null };
    ['major', 'minor', 'micro'].forEach(function (k) { if (!isSafeInteger(out[k])) throw new TypeError('version part out of range in "' + v + '"'); });
    return out;
  }
  function isSafeInteger(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && Math.abs(n) <= 9007199254740991; }
  function valid(v) { try { parse(v); return true; } catch (e) { return false; } }

  function cmpPre(a, b) {                                            // semver 11.4: no pre-release > a pre-release; numeric ids < alphanumeric ids; shorter < longer when equal so far
    if (!a && !b) return 0; if (!a) return 1; if (!b) return -1;
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] === undefined) return -1; if (b[i] === undefined) return 1;
      var an = /^[0-9]+$/.test(a[i]), bn = /^[0-9]+$/.test(b[i]);
      if (an && bn) { var d = Number(a[i]) - Number(b[i]); if (d) return d < 0 ? -1 : 1; }
      else if (an) return -1; else if (bn) return 1;
      else if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    }
    return 0;
  }
  function cmpParsed(x, y) {
    var ks = ['major', 'minor', 'micro'];
    for (var i = 0; i < 3; i++) if (x[ks[i]] !== y[ks[i]]) return x[ks[i]] < y[ks[i]] ? -1 : 1;
    return cmpPre(x.pre, y.pre);
  }
  function compare(a, b) { return cmpParsed(parse(a), parse(b)); }
  function major(v) { return parse(v).major; }

  function parseRange(r) {
    if (r === undefined || r === null) throw new TypeError('invalid version range: ' + String(r));
    if (typeof r !== 'string') throw new TypeError('invalid version range: not a string (' + typeof r + ')');
    var t = r.trim();
    if (t === '' || t === '*') return { kind: 'any' };
    var iv = /^([\[(])\s*([^,\s]+)\s*,\s*([^,\s\])]+)\s*([\])])$/.exec(t);
    if (/^[\[(]/.test(t) || /[\])]$/.test(t)) {
      if (!iv) throw new TypeError('invalid version range "' + r + '" (an interval is [a,b) (a,b] [a,b] or (a,b))');
      var lo = parse(iv[2]), hi = parse(iv[3]), loInc = iv[1] === '[', hiInc = iv[4] === ']', c = cmpParsed(lo, hi);
      if (c > 0 || (c === 0 && !(loInc && hiInc))) throw new TypeError('empty version range "' + r + '" (the lower bound must be below the upper bound)');
      return { kind: 'interval', lo: lo, hi: hi, loInc: loInc, hiInc: hiInc };
    }
    var m = /^(>=|<=|>|<|=)?\s*(\S+)$/.exec(t);
    if (!m) throw new TypeError('invalid version range "' + r + '"');
    return { kind: 'cmp', op: m[1] || '=', v: parse(m[2]) };
  }

  function satisfies(version, range) {
    var v = parse(version), r = parseRange(range);
    if (r.kind === 'any') return true;
    if (r.kind === 'interval') { var cl = cmpParsed(v, r.lo), ch = cmpParsed(v, r.hi); return (r.loInc ? cl >= 0 : cl > 0) && (r.hiInc ? ch <= 0 : ch < 0); }
    var c = cmpParsed(v, r.v);
    switch (r.op) { case '>=': return c >= 0; case '>': return c > 0; case '<=': return c <= 0; case '<': return c < 0; default: return c === 0; }
  }

  return { parse: parse, valid: valid, compare: compare, major: major, parseRange: parseRange, satisfies: satisfies };
}));
