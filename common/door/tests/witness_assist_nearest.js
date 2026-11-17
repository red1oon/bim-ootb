// ⚠ DO NOT REMOVE — W-ASSIST-NEAREST (bim-compiler prompts/CLI_ERP_IVR.md §42 S3 BUILD SPEC). READ THE LOG; an exit code is not evidence.
//   The ISSUE: assist_core.nearest allowed max(2, floor(len/3)) edits, so a typed name of 2 characters was "near" EVERY 2-character name (2 edits rewrite any 2 characters): the help lane measured
//   ~51 'nearest' hits on zh, ~15 on ja for one changed character. The fix: lim = min(max(2, floor(len/3)), len - 1). Pure: no door run.
//   Pools: each zh_CN / ja_JP help pack's names (help_dym.names(records, {alt: true})) and the shell's own names (verbs.json verbs + words.json words).
//   N1 the defect: every 2-character pool name with its 2nd character replaced by 〇 (in no pool name, checked) gets NO 'nearest' hit at edit distance 2 (this witness's own distance)
//   N2 the meant name is still found: X of N probes have it first, not fewer than the old limit gives
//   N3 no regression from 3 characters on: every pool name of 3+ characters, itself and with its middle character deleted, gets the same answer name for name from the new and the old function
//   N4 the shell's real short names (2 characters or fewer) get the same case/prefix answers from both
//   Falsifier: the old line as a source MUTANT (line 29 rewritten back, the rewrite proven applied): N1 must FAIL (printed as M1). An empty pool is INCONCLUSIVE.
//   Run: node common/door/tests/witness_assist_nearest.js > common/door/tests/logs/assist_nearest.log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { kit, ROOT } = require('./_kit');
const k = kit('W-ASSIST-NEAREST');
const SRC = path.join(ROOT, 'common/door/assist_core.js'), src = fs.readFileSync(SRC, 'utf8');
const NEW_LINE = /var lim = Math\.min\(Math\.max\(2, Math\.floor\(name\.length \/ 3\)\), name\.length - 1\);/, OLD = 'var lim = Math.max(2, Math.floor(name.length / 3));';
const load = (code) => { const ctx = { module: undefined }; vm.runInNewContext(code, ctx); return ctx.AssistCore; };   // the IIFE binds to `this` = the context
const AC = require(SRC);
const mutSrc = src.replace(NEW_LINE, OLD), applied = mutSrc !== src && mutSrc.indexOf(OLD) >= 0;
const OLDAC = applied ? load(mutSrc) : null;
k.L('mutant (the old limit) applied=' + applied + ' exports=' + (OLDAC ? Object.keys(OLDAC).join(',') : '-'));
const dist = (a, b) => { a = Array.from(a.toLowerCase()); b = Array.from(b.toLowerCase()); let p = []; for (let j = 0; j <= b.length; j++) p[j] = j;
  for (let i = 1; i <= a.length; i++) { const c = [i]; for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[b.length]; };   // this witness's own
const chars = (s) => Array.from(s).length, ALL = 1e9, MARK = '〇';
const D = require(path.join(ROOT, 'common/help/help_dym.js')), H = require(path.join(ROOT, 'common/help/tests/_hq.js'));
const pools = ['zh_CN', 'ja_JP'].map(lang => ({ id: lang, names: D.names(H.pack(lang).index.records, { alt: true }) }));
const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs.map(v => v.verb), W = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/vocab/words.json'), 'utf8'));
const wordNames = Object.keys(W.words || {}).concat(['cd', 'ls', 'pwd', 'role', 'login', 'help', 'history', 'menu', 'report', 'exit', 'quit']);
pools.push({ id: 'shell', names: Array.from(new Set(V.concat(wordNames))) });

function judge(A, label) {   // N1 + N2 over the 2-character names of every pool, with suggester A
  const r = { probes: 0, far: 0, hits: 0, top: 0, ex: [] };
  pools.forEach(p => p.names.filter(n => chars(n) === 2 && Array.from(n)[1] !== MARK).forEach(n => {
    const probe = Array.from(n)[0] + MARK, res = A.nearest(probe, p.names, ALL), near = res.filter(x => x.how === 'nearest');
    r.probes++; r.hits += near.length; const f = near.filter(x => dist(probe, x.name) >= 2); r.far += f.length; if (f.length && r.ex.length < 3) r.ex.push(probe + '→' + f.slice(0, 3).map(x => x.name).join('/'));
    if (res[0] && res[0].name === n) r.top++;
  }));
  k.L(label + ' probes=' + r.probes + ' nearest-hits=' + r.hits + ' at-distance-2=' + r.far + ' meant-first=' + r.top + (r.ex.length ? ' e.g. ' + r.ex.join(' ; ') : ''));
  return r;
}
const inPool = pools.some(p => p.names.some(n => n.indexOf(MARK) >= 0));
pools.forEach(p => k.L('pool ' + p.id + ' names=' + p.names.length + ' two-char=' + p.names.filter(n => chars(n) === 2).length));
if (inPool) k.incon('N1-N2', MARK + ' is in a pool name: the probe could be a real name');
else if (!applied) k.incon('N1-N4', 'the mutant could not be made: assist_core.js line 29 is not the S3 line');
else {
  const nw = judge(AC, 'NEW'), od = judge(OLDAC, 'OLD');
  if (!nw.probes) k.incon('N1-N2', 'VACUOUS: no 2-character name in any pool');
  else {
    k.chk('N1 no 2-character probe gets a nearest hit at edit distance 2: ' + nw.far + ' (the old limit: ' + od.far + ' over ' + od.probes + ' probes, ' + od.hits + ' hits)', nw.far === 0, 'new hits=' + nw.hits);
    k.chk('N2 the meant name is still first: ' + nw.top + ' of ' + nw.probes + ' (the old limit: ' + od.top + ')', nw.top >= od.top, '');
    k.chk('M1 falsifier: the OLD limit fails N1 (distance-2 hits > 0)', od.far > 0, 'old far=' + od.far);
  }
  let n3 = 0, d3 = [];
  pools.forEach(p => p.names.filter(n => chars(n) >= 3).forEach(n => { const c = Array.from(n), i = Math.floor(c.length / 2), t = c.slice(0, i).concat(c.slice(i + 1)).join('');
    [n, t].forEach(q => { if (chars(q) < 3) return; n3++; const a = JSON.stringify(AC.nearest(q, p.names, ALL)), b = JSON.stringify(OLDAC.nearest(q, p.names, ALL)); if (a !== b && d3.length < 3) d3.push(p.id + ' ' + q); if (a !== b) d3.n = (d3.n || 0) + 1; }); }));
  if (!n3) k.incon('N3', 'VACUOUS: no 3+ character probe'); else k.chk('N3 from 3 characters on nothing changes: ' + (n3 - (d3.n || 0)) + ' of ' + n3 + ' probes answer the same, name for name', !d3.n, d3.join(' ; '));
  const shortShell = pools[2].names.filter(n => chars(n) <= 2), tiers = (r) => JSON.stringify(r.filter(x => x.how !== 'nearest'));
  const bad4 = shortShell.filter(n => tiers(AC.nearest(n, pools[2].names, ALL)) !== tiers(OLDAC.nearest(n, pools[2].names, ALL)) || AC.nearest(n, pools[2].names, 1)[0].name !== n);
  if (!shortShell.length) k.incon('N4', 'VACUOUS: no short shell name'); else k.chk('N4 the shell\'s ' + shortShell.length + ' short names (' + shortShell.join(', ') + ') keep their case/prefix answers and answer themselves first', !bad4.length, bad4.join(', '));
}
k.end();
