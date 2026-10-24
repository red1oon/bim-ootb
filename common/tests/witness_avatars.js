#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-AVATARS, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §15.15.2/§15.15.3. READ THE LOG after every run — the exit code is not evidence.
//   team_avatars.js on fixed inputs. Issues proved or disproved:
//   §AV-SET      the set is 24 well-formed, DISTINCT avatars (parsed; no script, no on*= handler, no external reference); VACUOUS if the set is empty
//   §AV-DEFAULT  the default is a pure function of person_uu (same in -> same out) and is NOT a constant: 200 random uuids spread over >= 20 of 24 ids
//   §AV-FALLBACK a forged / unknown / non-string id is never drawn: it resolves to the person's default (so a hostile id cannot inject markup)
//   §AV-STACK    "5 heads then +N": stack(list, 5) caps at five and counts the rest
// Run: node common/tests/witness_avatars.js 2>&1 | tee /tmp/witness_avatars.log
'use strict';
var A = require('../comm/team_avatars.js'), crypto = require('crypto');
var fails = 0, judged = 0, inconclusive = [];
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
(function main() {
  console.log('═══ W-AVATARS — the built-in avatar set (TEAMWORK_FRAMEWORK §15.15.2) ═══\n');
  var ids = A.ids();
  console.log('§AV-SET');
  if (!ids.length) { inconclusive.push('§AV-SET'); console.log('   ⚪ INCONCLUSIVE §AV-SET — the set is empty, nothing to judge'); }
  else {
    verdict(ids.length === 24 && new Set(ids).size === 24, 'the set holds 24 ids, all different', ids.length + ' ids, first ' + ids[0] + ' last ' + ids[ids.length - 1]);
    var svgs = ids.map(function (i) { return A.svg(i, 40).replace(/tav\d+/g, 'T'); });   // the clip-path id is per call; strip it before comparing
    verdict(new Set(svgs).size === 24, 'the 24 rendered SVGs are pairwise different (as markup)', 'distinct=' + new Set(svgs).size);
    var tuples = ids.map(function (i) { return JSON.stringify(A.params(i)); });
    verdict(new Set(tuples).size === 24, 'the 24 parameter tuples (background, skin, shirt, hair, eyes, mouth, accessory) are pairwise different', 'distinct=' + new Set(tuples).size);
    var bad = svgs.filter(function (x) { return !/^<svg [^>]*viewBox="0 0 64 64"/.test(x) || !/<\/svg>$/.test(x) || /<script|\son[a-z]+\s*=|javascript:|href=|xlink:|<image|<foreignObject/i.test(x) || (x.match(/</g) || []).length < 10; });
    verdict(bad.length === 0, 'every SVG is well-formed (viewBox, closed) and contains no script, no on*= handler, no href / image / foreignObject (nothing external or active)', 'bad=' + bad.length);
    var open = svgs.map(function (x) { return (x.match(/<(g|clipPath|defs|svg)[ >]/g) || []).length - (x.match(/<\/(g|clipPath|defs|svg)>/g) || []).length; });
    verdict(open.every(function (d) { return d === 0; }), 'container tags balance in every SVG (opened == closed)', JSON.stringify(open.filter(function (d) { return d !== 0; })));
    var sizes = ids.map(function (i) { return A.svg(i, 40).length; });
    verdict(Math.max.apply(null, sizes) < 4096, 'each avatar is under 4 KB of markup (the whole set ships with the page, nothing is fetched)', 'max=' + Math.max.apply(null, sizes) + ' B total=' + sizes.reduce(function (a, b) { return a + b; }, 0) + ' B');
  }
  console.log('\n§AV-DEFAULT');
  var u = crypto.randomUUID();
  verdict(A.defaultFor(u) === A.defaultFor(u) && A.valid(A.defaultFor(u)), 'the default is a pure function of person_uu (same uuid twice -> same valid id)', u.slice(0, 8) + ' -> ' + A.defaultFor(u));
  var N = 200, used = {}; for (var j = 0; j < N; j++) used[A.defaultFor(crypto.randomUUID())] = 1;
  verdict(Object.keys(used).length >= 20, 'DISPROVES "the default is a constant": ' + N + ' random uuids spread over >= 20 of the 24 ids', 'distinct ids used=' + Object.keys(used).length);
  verdict(A.defaultFor('') === A.defaultFor(null) && A.valid(A.defaultFor(undefined)), 'an empty / missing person_uu still yields a valid id (no throw)', A.defaultFor(''));
  console.log('\n§AV-FALLBACK');
  var pu = '5f3a9c10-1111-4222-8333-444455556666', dflt = A.defaultFor(pu);
  verdict(A.resolve('a07', pu) === 'a07', 'a valid chosen id is used as chosen', 'a07');
  var forged = ['a99', 'A07', '<script>alert(1)</script>', 'a07"onload="x', '__proto__', 'constructor', '', null, undefined, 7, {}, ['a07']];
  verdict(forged.every(function (f) { return A.resolve(f, pu) === dflt && !A.valid(f); }), 'DISPROVES "any string is drawn": ' + forged.length + ' forged / unknown / non-string ids all resolve to the person\'s default', 'default=' + dflt);
  verdict(A.svg('a99', 40).indexOf('data-avatar="a01"') > 0 && A.svg('<x>', 40).indexOf('<x>') < 0, 'svg() of an unknown id draws a set member, and never echoes the id into markup', '');
  console.log('\n§AV-STACK');
  var L = [1, 2, 3, 4, 5, 6, 7, 8], s5 = A.stack(L, 5), s3 = A.stack([1, 2, 3], 5), s0 = A.stack([], 5), sd = A.stack(L);
  verdict(s5.shown.length === 5 && s5.more === 3 && s3.shown.length === 3 && s3.more === 0 && s0.shown.length === 0 && s0.more === 0 && sd.shown.length === A.STACK_MAX && A.STACK_MAX === 5, '8 heads -> 5 shown + "+3"; 3 -> 3 + none; 0 -> none; the default cap is 5', JSON.stringify([s5.more, s3.more, sd.shown.length]));
  console.log('\n' + (fails ? '🔴' : inconclusive.length ? '⚪' : '🟢') + ' §W-AVATARS ' + (fails ? 'FAIL' : inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length);
  process.exit(fails ? 1 : 0);
})();
