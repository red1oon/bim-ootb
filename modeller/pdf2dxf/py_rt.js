// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 (rules seam, W-PD1) — the Python semantics the byte-identical port needs, in one place. No node-only APIs.
// CONVENTION (whole port): a plain JS number is a Python FLOAT; a PyInt (made by I(n)) is a Python INT. An int that is printed or written must be an I(); arithmetic on a PyInt yields a plain number, so
// int-preserving results (int+int, round(x), len()) are re-wrapped with I() where Python keeps an int. Dicts whose order matters are Maps (JS objects move integer-like keys such as grid labels '5','4' first).
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Pdf2DxfRt = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  class PyInt extends Number {}
  const I = n => (n instanceof PyInt ? n : new PyInt(n));
  const isInt = x => x instanceof PyInt;
  class Tup extends Array {}
  const T = (...a) => { const t = new Tup(); for (const v of a) t.push(v); return t; };
  // ---- float repr like Python's repr(float)
  function fr(x) {
    x = +x;
    if (Number.isNaN(x)) return 'nan';
    if (x === Infinity) return 'inf';
    if (x === -Infinity) return '-inf';
    if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
    const neg = x < 0; const e = Math.abs(x).toExponential(); // shortest round-trip digits
    const m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(e); const digits = m[1] + (m[2] || ''); const exp = parseInt(m[3], 10);
    let s;
    if (exp >= -4 && exp < 16) {
      if (exp >= 0) { if (digits.length <= exp + 1) s = digits + '0'.repeat(exp + 1 - digits.length) + '.0'; else s = digits.slice(0, exp + 1) + '.' + digits.slice(exp + 1); }
      else s = '0.' + '0'.repeat(-exp - 1) + digits;
    } else {
      const mant = digits.length > 1 ? digits[0] + '.' + digits.slice(1) : digits; const ae = Math.abs(exp);
      s = mant + 'e' + (exp < 0 ? '-' : '+') + (ae < 10 ? '0' + ae : String(ae));
    }
    return (neg ? '-' : '') + s;
  }
  const strq = s => (s.indexOf("'") >= 0 && s.indexOf('"') < 0) ? '"' + s + '"' : "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  function repr(v) {
    if (v === null || v === undefined) return 'None';
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (typeof v === 'string') return strq(v);
    if (v instanceof PyInt) return String(+v);
    if (typeof v === 'number') return fr(v);
    if (v instanceof Tup) return v.length === 1 ? '(' + repr(v[0]) + ',)' : '(' + v.map(repr).join(', ') + ')';
    if (Array.isArray(v)) return '[' + v.map(repr).join(', ') + ']';
    if (v instanceof Map) return '{' + [...v].map(([k, w]) => repr(k) + ': ' + repr(w)).join(', ') + '}';
    if (typeof v === 'object') return '{' + Object.keys(v).map(k => repr(k) + ': ' + repr(v[k])).join(', ') + '}';
    return String(v);
  }
  const str = v => (typeof v === 'string' ? v : repr(v));
  // ---- exact decimal rounding (CPython round(x, n) and '%.nf': correctly rounded from the exact binary value, ties to even)
  const f64 = new Float64Array(1), u64 = new BigUint64Array(f64.buffer);
  function decomp(x) { f64[0] = x; const b = u64[0]; const ex = Number((b >> 52n) & 0x7ffn); let m = b & 0xfffffffffffffn; let e; if (ex === 0) e = -1074; else { m |= 0x10000000000000n; e = ex - 1075; } return { m, e }; }
  function scaledHalfEven(ax, n) { // ax >= 0 finite; integer round(ax * 10^n) as BigInt
    const { m, e } = decomp(ax); const N = m * (10n ** BigInt(n));
    if (e >= 0) return N << BigInt(e);
    const sh = BigInt(-e); let q = N >> sh; const rem = N - (q << sh); const half = 1n << (sh - 1n);
    if (rem > half || (rem === half && (q & 1n) === 1n)) q += 1n;
    return q;
  }
  function pyRound(x, n) {
    x = +x; if (!Number.isFinite(x)) return x;
    const p = Math.pow(10, n); const ax = Math.abs(x); const y = ax * p;
    if (y < 1e9) { const fl = Math.floor(y), fr_ = y - fl; if (Math.abs(fr_ - 0.5) > 1e-6) { const k = fr_ > 0.5 ? fl + 1 : fl; const r = k / p; return x < 0 || Object.is(x, -0) ? -r : r; } }
    const q = scaledHalfEven(ax, n); const r = Number(q.toString() + 'e-' + n);
    return x < 0 || Object.is(x, -0) ? -r : r;
  }
  function pyRoundInt(x) { x = +x; const f = Math.floor(x), d = x - f; let r; if (d < 0.5) r = f; else if (d > 0.5) r = f + 1; else r = (f % 2 === 0) ? f : f + 1; return r === 0 ? 0 : r; }
  const rnd = (x, n) => (n === undefined ? I(pyRoundInt(x)) : (x instanceof PyInt ? x : pyRound(x, n))); // round(x) -> int ; round(x,n) -> float (an int stays an int)
  function fixed(x, n) { // '%.nf'
    x = +x; if (Number.isNaN(x)) return 'nan'; if (!Number.isFinite(x)) return x < 0 ? '-inf' : 'inf';
    const neg = x < 0 || Object.is(x, -0); const q = scaledHalfEven(Math.abs(x), n).toString();
    let s = n === 0 ? q : (q.padStart(n + 1, '0').slice(0, -n) + '.' + q.padStart(n + 1, '0').slice(-n));
    return (neg ? '-' : '') + s;
  }
  const dfmt = x => String(Math.trunc(+x)); // '%d'
  function floordiv(a, b) { // float //, as CPython float_floor_div
    a = +a; b = +b; const mod = a % b; let div = (a - mod) / b;
    if (mod && ((b < 0) !== (mod < 0))) div -= 1;
    if (div) { let fd = Math.floor(div); if (div - fd > 0.5) fd += 1; return fd; }
    return (a / b < 0 || Object.is(a / b, -0)) ? -0 : 0;
  }
  function pymod(a, b) { a = +a; b = +b; let m = a % b; if (m !== 0) { if ((m < 0) !== (b < 0)) m += b; } else m = b < 0 ? -0 : 0; return m; }
  function twoProd(a, b) { const p = a * b; const C = 134217729; let t = C * a; const ah = t - (t - a), al = a - ah; t = C * b; const bh = t - (t - b), bl = b - bh; return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl]; }
  function hypot(a, b) { // math.hypot, correctly rounded in all but pathological cases (CPython 3.10+ vector_norm); V8's Math.hypot can be an ulp off
    a = Math.abs(a); b = Math.abs(b); if (a === 0) return b; if (b === 0) return a; if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
    const h0 = Math.sqrt(a * a + b * b); const [pa, ea] = twoProd(a, a), [pb, eb] = twoProd(b, b), [ph, eh] = twoProd(h0, h0);
    return h0 + (((pa - ph) + pb) + ((ea + eb) - eh)) / (2 * h0);
  }
  const dist = (p, q) => hypot(p[0] - q[0], p[1] - q[1]);
  function pySum(a) { // CPython 3.12 sum() of floats: Neumaier compensated
    let f = 0, c = 0; for (const v of a) { const x = +v; const t = f + x; if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x; else c += (x - t) + f; f = t; }
    if (c && Number.isFinite(c)) f += c; return f;
  }
  function cube(u) { const [p, e] = twoProd(u, u); const [p2, e2] = twoProd(p, u); return p2 + (e2 + e * u); } // u**3 as libm pow would give it, to the last bit in all but pathological cases
  const radians = d => d * (Math.PI / 180), degrees = r => r * (180 / Math.PI);
  // ---- statistics
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  function median(a) { const d = a.slice().sort((x, y) => +x - +y); const n = d.length; if (n === 0) throw new Error('median of empty'); const i = n >> 1; return n % 2 ? d[i] : (+d[i - 1] + +d[i]) / 2; }
  function pstdev(a) { const n = a.length; let m = 0; for (const v of a) m += v; m /= n; let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / n); }
  // tuple/list lexicographic compare (Python sorted() on tuples)
  function cmpT(a, b) { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { const x = a[i], y = b[i]; const c = (typeof x === 'string' || typeof y === 'string') ? cmp(String(x), String(y)) : cmp(+x, +y); if (c) return c; } return cmp(a.length, b.length); }
  const sortedT = a => a.slice().sort(cmpT);
  // Counter helpers over a Map (insertion ordered): most_common = stable sort by count desc
  function mostCommon(m, n) { const it = [...m].sort((a, b) => b[1] - a[1]); return n === undefined ? it : it.slice(0, n); }
  const inc = (m, k, v) => m.set(k, (m.has(k) ? m.get(k) : 0) + v);
  // ---- JSON that keeps Python's int/float split: an integer literal becomes a PyInt, anything with '.', 'e' a float
  function parseJSON(text, mapPaths) { // mapPaths: dotted paths whose objects become Maps (insertion order kept even for keys like '5','4')
    let i = 0; const s = text; const MP = new Set(mapPaths || []); const path = [];
    const ws = () => { while (i < s.length && ' \t\r\n'.indexOf(s[i]) >= 0) i++; };
    function val() {
      ws(); const c = s[i];
      if (c === '{') { i++; const isMap = MP.has(path.join('.')); const o = isMap ? new Map() : {}; ws(); if (s[i] === '}') { i++; return o; } for (;;) { ws(); const k = str_(); ws(); i++; path.push(k); const v = val(); path.pop(); if (isMap) o.set(k, v); else o[k] = v; ws(); if (s[i] === ',') { i++; continue; } i++; return o; } }
      if (c === '[') { i++; const a = []; ws(); if (s[i] === ']') { i++; return a; } for (;;) { a.push(val()); ws(); if (s[i] === ',') { i++; continue; } i++; return a; } }
      if (c === '"') return str_();
      if (s.startsWith('true', i)) { i += 4; return true; } if (s.startsWith('false', i)) { i += 5; return false; } if (s.startsWith('null', i)) { i += 4; return null; }
      const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i, i + 40)); i += m[0].length; return (m[1] === undefined && m[2] === undefined) ? I(parseInt(m[0], 10)) : parseFloat(m[0]);
    }
    function str_() { const st = i; i++; while (s[i] !== '"') { if (s[i] === '\\') i++; i++; } i++; return JSON.parse(s.slice(st, i)); }
    return val();
  }
  function typed(o) { // an already-parsed object: integral numbers are ints (the types JSONs hold no integral float that reaches an output)
    if (typeof o === 'number') return Number.isInteger(o) ? I(o) : o;
    if (Array.isArray(o)) return o.map(typed);
    if (o && typeof o === 'object' && !(o instanceof PyInt) && !(o instanceof Map)) { const r = {}; for (const k of Object.keys(o)) r[k] = typed(o[k]); return r; }
    return o;
  }
  function deepcopy(o) {
    if (o instanceof PyInt || o === null || typeof o !== 'object') return o;
    if (o instanceof Map) { const m = new Map(); for (const [k, v] of o) m.set(k, deepcopy(v)); return m; }
    if (o instanceof Tup) return T(...o.map(deepcopy));
    if (Array.isArray(o)) return o.map(deepcopy);
    const r = {}; for (const k of Object.keys(o)) r[k] = deepcopy(o[k]); return r;
  }
  function plain(o) { // Maps -> objects, PyInt -> number: for JSON and deep-equal
    if (o instanceof PyInt) return +o;
    if (o === null || typeof o !== 'object') return o;
    if (o instanceof Map) { const r = {}; for (const [k, v] of o) r[k] = plain(v); return r; }
    if (Array.isArray(o)) return Array.from(o, plain);
    const r = {}; for (const k of Object.keys(o)) r[k] = plain(o[k]); return r;
  }
  const mkLog = sink => (...a) => { sink.push(a.map(str).join(' ')); };
  const toMap = o => { const m = new Map(); for (const k of Object.keys(o)) m.set(k, o[k]); return m; };
  return { PyInt, I, isInt, Tup, T, fr, repr, str, pyRound, pyRoundInt, rnd, fixed, dfmt, floordiv, pymod, hypot, dist, pySum, cube, radians, degrees, cmp, cmpT, sortedT, median, pstdev, mostCommon, inc, parseJSON, typed, deepcopy, plain, mkLog, toMap, scaledHalfEven };
});
