#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WALLTOP-DEFAULT (rule D54, prompts/DXF2BIM_FOUNDATION_LANE.md §D54). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: every wall no elevation shows (HHS 251 on the plans) was a blocking ask until a per-wall @WALLTOP or the per-storey tick, which was never offered; the owner
 * asked for fast best-effort defaults, editable in JSON.
 *   T1 DEFAULT  — the marked set with its @WALLTOP markings removed: each such wall under a known slab underside gets top = that underside (slab_above_default) and one GAP:wall_top_defaulted per plan.
 *   T2 MEASURE  — the defaulted tops against the model's own @WALLTOP (the removed markings), per storey: stated, not a pass bar.
 *   T3 YOURS    — @DEFAULT=wall.top_when_unseen,none: the verdict of the stripped set equals BASE's, code for code.
 *   T4 STATED   — the full marked set (its @WALLTOP kept) reads identical to BASE: a stated top always wins.
 * Usage: NODE_PATH=<dir with better-sqlite3> BASE=<old modeller dir> node modeller/tests/witness_dxf_walltop_default.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const BASE = process.env.BASE ? require(path.join(process.env.BASE, 'dxf2bim_import.js')) : null;
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2); if (!dbs.length) { say('MISSING input: a Node model .db (e.g. /tmp/db2/HHSM2.db)'); process.exit(2); }
const dropKey = (text, re) => { const L = text.split('\n'), out = []; for (let i = 0; i < L.length; i += 2) { if (L[i] === '0' && L[i + 1] === 'TEXT') { let j = i + 2, t = null; while (j < L.length && L[j] !== '0') { if (L[j] === '1') t = L[j + 1]; j += 2; }
  if (t && re.test(t)) { i = j - 2; continue; } } out.push(L[i], L[i + 1]); } return out.filter(x => x !== undefined).join('\n'); };
const codes = v => { const m = {}; v.blocking.concat(v.advisory).forEach(b => { m[b.code] = (m[b.code] || 0) + 1; }); return JSON.stringify(Object.keys(m).sort().map(k => [k, m[k]])); };
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all(), P = new DxfParser();
  const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' }), full = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }));
  const key = {}; full.forEach(f => MK.readMarks(P.parseSync(f.text).entities).forEach(m => { const r = /^@WALLTOP=handle:([0-9A-F]+),([-\d.]+)/.exec(m.raw); if (r) key[f.name + '|' + r[1]] = Number(r[2]); }));
  const strip = full.map(f => ({ name: f.name, text: dropKey(f.text, /^@WALLTOP=/) })), o = I.convert(I.readSheets(strip), {});
  if (!o.ST) { check('T0[' + name + ']', 'the stripped set converts', false, JSON.stringify(o.refused).slice(0, 200)); return; }
  let dflt = 0, wrongTop = 0; const per = {}, adv = o.verdict.advisory.filter(a => a.code === 'GAP:wall_top_defaulted');
  o.ST.forEach(st => { const U = o.slabZ && o.ST.indexOf(st) >= 0 ? null : null; void U;
    st.after.filter(x => x.op_type === 'DXF_WALL' && x.params.height_source === 'slab_above_default').forEach(w => { dflt++; const top = +(st.level + w.params.base + w.params.height).toFixed(3), k = key[st.sheet + '|' + w.params.handle];
      const p = per[st.name] = per[st.name] || { n: 0, keyed: 0, same: 0, diffs: {} }; p.n++; if (k !== undefined) { p.keyed++; if (Math.abs(k - top) <= 0.001) p.same++; else { const dd = (top - k).toFixed(3); p.diffs[dd] = (p.diffs[dd] || 0) + 1; } } }); });
  const plansWith = o.ST.filter(st => st.after.some(x => x.params && x.params.height_source === 'slab_above_default')).length;
  check('T1[' + name + ']', 'walls no elevation shows take the slab underside above as a default; one advisory per plan with the count', dflt > 0 && adv.length === plansWith && adv.every(a => (a.detail || {}).count > 0), `defaulted=${dflt} advisories=${adv.length} plans=${plansWith} no_elevation_height_left=${o.verdict.blocking.filter(b => b.code === 'GAP:no_elevation_height').length}`);
  say('INFO T2[' + name + '] | against the model\'s own wall tops: ' + Object.keys(per).map(s => `${s}: ${per[s].n} defaulted, ${per[s].keyed} with a model top, ${per[s].same} equal${Object.keys(per[s].diffs).length ? ', off by ' + JSON.stringify(per[s].diffs) + ' m' : ''}`).join('; '));
  if (BASE) {
    const off = strip.map(f => /_FLOOR_/.test(f.name) ? { name: f.name, text: MK.writeMarks(f.text, [{ text: '@DEFAULT=wall.top_when_unseen,none @BY=user', x: 0, y: 0 }]) } : f);
    const v0 = BASE.convert(BASE.readSheets(off), {}).verdict, v1 = I.convert(I.readSheets(off), {}).verdict;
    check('T3[' + name + ']', '@DEFAULT ...,none: the stripped set reads as BASE, code for code', codes(v0) === codes(v1), `blocking ${v0.blocking.length} = ${v1.blocking.length}`);
    const f0 = BASE.convert(BASE.readSheets(full), {}), f1 = I.convert(I.readSheets(full), {}), g = x => JSON.stringify(x.els.map(e => [e.guid, e.class, e.vertices]));
    check('T4[' + name + ']', 'the full marked set (its @WALLTOP stated) reads identical to BASE', g(f0) === g(f1) && codes(f0.verdict) === codes(f1.verdict), `els=${f1.els.length} blocking=${f1.verdict.blocking.length}`);
  } else say('INCONCLUSIVE T3/T4[' + name + '] | no BASE given');
});
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
