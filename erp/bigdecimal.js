// ⚠ DO NOT REMOVE — BigDecimal: exact decimal arithmetic for ALL money/quantity math (mirrors java.math.BigDecimal)
// SCOPE / CONTRACT:
//   JavaScript Number is IEEE-754 binary double — WRONG for money (0.1+0.2 != 0.3). SQLite has no DECIMAL type.
//   So every monetary / quantity value on the local (JS + SQLite-WASM) path MUST go through this class — never
//   raw Number arithmetic. This is the JS counterpart of iDempiere's BigDecimal and Postgres NUMERIC.
// WHY IT IS FAITHFUL TO JAVA:
//   Java BigDecimal = (BigInteger unscaledValue, int scale); value = unscaledValue * 10^-scale.
//   This class is (BigInt u, int s) with the SAME identity. Rounding modes + setScale + scaled-divide follow
//   java.math.RoundingMode / BigDecimal exactly. Conformance is PROVEN, not asserted:
//   scripts/test_bigdecimal_conformance.js diffs this against golden vectors emitted by REAL java.math.BigDecimal
//   (scripts/GenGolden.java). Witness: §BD-CONFORM pass=N/N. Re-run after ANY edit here.
// ENFORCEMENT: of(Number) THROWS on a non-integer Number — decimals must be passed as STRINGS (or BigInt),
//   so a float can never silently enter the money path.
// RULE FOR ALL DEV: never +,-,*,/ on money Numbers; construct BigDecimal.of("12.34") and use .add/.subtract/
//   .multiply/.divide(scale, RM)/.setScale(scale, RM). See docs/DepreciationPerf.md (the no-decimal risk).
// DETERMINISM: identical inputs + explicit RoundingMode -> identical output on every device/replay (load-bearing
//   for the signed op-log: float rounding can flip a half-cent and diverge replay-hash). Default RM = HALF_UP.

(function (global) {
  'use strict';
  var TEN = 10n;
  function pow10(n) { var r = 1n; for (var i = 0; i < n; i++) r *= TEN; return r; }

  // java.math.RoundingMode
  var RM = { UP: 'UP', DOWN: 'DOWN', CEILING: 'CEILING', FLOOR: 'FLOOR',
             HALF_UP: 'HALF_UP', HALF_DOWN: 'HALF_DOWN', HALF_EVEN: 'HALF_EVEN', UNNECESSARY: 'UNNECESSARY' };

  // Divide |num|/|den| (sign tracked separately), apply RoundingMode to the discarded fraction. Matches Java.
  function divRound(num, den, rm) {
    rm = rm || RM.HALF_UP;
    if (den === 0n) throw new RangeError('BigDecimal: division by zero');
    var sign = 1n;
    if (num < 0n) { sign = -sign; num = -num; }
    if (den < 0n) { sign = -sign; den = -den; }
    var q = num / den, r = num % den;
    if (r === 0n) return sign * q;
    var twice = r * 2n, incr;
    switch (rm) {
      case RM.DOWN:    incr = false; break;
      case RM.UP:      incr = true;  break;
      case RM.CEILING: incr = (sign > 0n); break;   // toward +inf
      case RM.FLOOR:   incr = (sign < 0n); break;   // toward -inf
      case RM.HALF_UP:   incr = (twice >= den); break;
      case RM.HALF_DOWN: incr = (twice >  den); break;
      case RM.HALF_EVEN: incr = (twice > den) ? true : (twice < den) ? false : (q % 2n === 1n); break;
      case RM.UNNECESSARY: throw new RangeError('BigDecimal: rounding necessary (UNNECESSARY)');
      default: throw new RangeError('BigDecimal: unknown RoundingMode ' + rm);
    }
    if (incr) q += 1n;
    return sign * q;
  }

  function BigDecimal(unscaled, scale) {  // u: BigInt, s: int (decimal places; Java permits negative)
    if (!(this instanceof BigDecimal)) return new BigDecimal(unscaled, scale);
    this.u = unscaled; this.s = scale | 0;
  }

  // ── construction ───────────────────────────────────────────────────────────
  BigDecimal.of = function (v) {
    if (v instanceof BigDecimal) return v;
    if (typeof v === 'bigint') return new BigDecimal(v, 0);
    if (typeof v === 'number') {
      if (!Number.isInteger(v)) throw new TypeError(
        'BigDecimal.of(Number ' + v + '): non-integer Number forbidden — pass a STRING ("' + v + '") to avoid float error');
      return new BigDecimal(BigInt(v), 0);
    }
    return BigDecimal.fromString(String(v));
  };
  BigDecimal.fromString = function (str) {
    str = String(str).trim();
    var neg = false;
    if (str[0] === '+') str = str.slice(1);
    else if (str[0] === '-') { neg = true; str = str.slice(1); }
    if (!/^\d*(\.\d*)?$/.test(str)) throw new TypeError('BigDecimal: bad number "' + str + '"');
    var scale = 0, digits = str, dot = str.indexOf('.');
    if (dot >= 0) { scale = str.length - dot - 1; digits = str.slice(0, dot) + str.slice(dot + 1); }
    if (digits === '') digits = '0';
    var u = BigInt(digits);
    return new BigDecimal(neg ? -u : u, scale);
  };

  var P = BigDecimal.prototype;

  // ── exact ops (no rounding needed) ───────────────────────────────────────────
  P.add = function (o) { o = BigDecimal.of(o); var cs = Math.max(this.s, o.s);
    return new BigDecimal(this.u * pow10(cs - this.s) + o.u * pow10(cs - o.s), cs); };
  P.subtract = function (o) { o = BigDecimal.of(o); var cs = Math.max(this.s, o.s);
    return new BigDecimal(this.u * pow10(cs - this.s) - o.u * pow10(cs - o.s), cs); };
  P.multiply = function (o) { o = BigDecimal.of(o); return new BigDecimal(this.u * o.u, this.s + o.s); };
  P.negate = function () { return new BigDecimal(-this.u, this.s); };
  P.abs = function () { return this.u < 0n ? this.negate() : this; };
  P.signum = function () { return this.u < 0n ? -1 : this.u > 0n ? 1 : 0; };

  // ── divide to a target scale with rounding (Java BigDecimal.divide(divisor, scale, RM)) ──
  P.divide = function (o, scale, rm) {
    o = BigDecimal.of(o); scale = scale | 0;
    var p = scale + o.s - this.s, num = this.u, den = o.u;
    if (p >= 0) num = num * pow10(p); else den = den * pow10(-p);
    return new BigDecimal(divRound(num, den, rm), scale);
  };

  // ── setScale(newScale, RM) (Java BigDecimal.setScale) ───────────────────────
  P.setScale = function (newScale, rm) {
    newScale = newScale | 0;
    if (newScale >= this.s) return new BigDecimal(this.u * pow10(newScale - this.s), newScale);
    return new BigDecimal(divRound(this.u, pow10(this.s - newScale), rm), newScale);
  };

  // ── comparison (compareTo ignores scale: 2.0 ~ 2.00; equals() honors it like Java) ──
  P.compareTo = function (o) { o = BigDecimal.of(o); var cs = Math.max(this.s, o.s);
    var a = this.u * pow10(cs - this.s), b = o.u * pow10(cs - o.s); return a < b ? -1 : a > b ? 1 : 0; };
  P.eq  = function (o) { return this.compareTo(o) === 0; };
  P.lt  = function (o) { return this.compareTo(o) < 0; };
  P.gt  = function (o) { return this.compareTo(o) > 0; };
  P.isZero = function () { return this.u === 0n; };
  P.equals = function (o) { o = BigDecimal.of(o); return this.u === o.u && this.s === o.s; };  // Java equals (scale-sensitive)

  // ── output (toPlainString-style; toNumber is DISPLAY-ONLY and lossy) ─────────
  P.toString = function () {
    var neg = this.u < 0n, d = (neg ? -this.u : this.u).toString(), s = this.s;
    if (s <= 0) return (neg ? '-' : '') + d + (s < 0 ? '0'.repeat(-s) : '');
    if (d.length <= s) d = '0'.repeat(s - d.length + 1) + d;
    var pt = d.length - s;
    return (neg ? '-' : '') + d.slice(0, pt) + '.' + d.slice(pt);
  };
  P.toJSON = function () { return this.toString(); };
  P.toNumber = function () { return Number(this.toString()); };  // ⚠ display only — re-enters float
  P.scale = function () { return this.s; };
  P.unscaledValue = function () { return this.u; };

  BigDecimal.RoundingMode = RM;
  BigDecimal.ZERO = new BigDecimal(0n, 0);
  BigDecimal.ONE  = new BigDecimal(1n, 0);

  if (typeof module !== 'undefined' && module.exports) module.exports = BigDecimal;
  else global.BigDecimal = BigDecimal;
})(typeof self !== 'undefined' ? self : this);
