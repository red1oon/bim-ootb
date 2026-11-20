// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — shim_bonds_pack.js. SCOPE: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.37 S2. No dependency on the cache (it is used BY it).
// The bond table's persisted form: computed once in scripts/cache_4d_run.js, written into run.json `bonds`, read by every later judge.
//   aggFromDb(db)                 the declared aggregates of an OPEN (already patched) db -> { has, parentOf, parentCls, why }
//   tableSha(SB)                  short hash of the need/offer table, so a persisted table from another table is never read as current
//   pack(res, items, agg, SB)     compute()'s result -> plain JSON (indices are positions in the played-element list, in run.els order)
//   unpack(p, SB)                 the same shape compute() returns (+ agg), or null when p is not this table's
//   line(bld, p)                  the one §SHIM_BONDS summary line for witness.log
'use strict';
const crypto = require('crypto');
function aggFromDb(db) {
  const out = { has: false, parentOf: {}, parentCls: {}, why: '' };
  let r;
  try { r = db.exec('SELECT a.child_guid, a.parent_guid, p.ifc_class FROM rel_aggregates a LEFT JOIN elements_meta p ON p.guid = a.parent_guid'); }
  catch (e) { out.why = 'no rel_aggregates table'; return out; }
  out.has = true;
  if (r.length) r[0].values.forEach(v => { out.parentOf[v[0]] = v[1]; if (v[2]) out.parentCls[v[0]] = v[2]; });
  return out;
}
function tableSha(SB) { return crypto.createHash('sha1').update(JSON.stringify(SB.TABLE)).update(SB.kindOf.toString()).digest('hex').slice(0, 12); }
function pack(res, items, agg, SB) {
  const codes = Object.keys(SB.OUT).map(k => SB.OUT[k]), kinds = [], kIdx = {}, more = {}, parentOf = {};
  const kind = res.kind.map(k => { const s = k || ''; if (!(s in kIdx)) { kIdx[s] = kinds.length; kinds.push(s); } return kIdx[s]; });
  for (let i = 0; i < res.n; i++) {
    if (res.hosts[i] && res.hosts[i].length > 1) more[i] = res.hosts[i];
    const p = agg.parentOf[items[i].guid]; if (p) parentOf[items[i].guid] = p;
  }
  return { v: 1, table: tableSha(SB), n: res.n, codes: codes, outcome: res.outcome.map(o => codes.indexOf(o)), kinds: kinds, kind: kind,
    need: Array.from(res.need), host: Array.from(res.host), wave: Array.from(res.wave), more: more, seeds: res.seeds, waves: res.waves,
    counts: res.counts, agg: { has: agg.has, why: agg.why, pairs: Object.keys(agg.parentOf).length, parentOf: parentOf } };
}
function unpack(p, SB) {
  if (!p || p.v !== 1 || p.table !== tableSha(SB)) return null;
  const hosts = new Array(p.n);
  for (let i = 0; i < p.n; i++) hosts[i] = p.more[i] || (p.host[i] >= 0 ? [p.host[i]] : undefined);
  return { n: p.n, kind: p.kind.map(k => p.kinds[k] || null), outcome: p.outcome.map(o => p.codes[o]), need: Int16Array.from(p.need),
    host: Int32Array.from(p.host), hosts: hosts, wave: Int32Array.from(p.wave), seeds: p.seeds, waves: p.waves, counts: p.counts, table: SB.TABLE,
    agg: { has: p.agg.has, why: p.agg.why, pairs: p.agg.pairs, parentOf: p.agg.parentOf, parentCls: {} } };
}
function line(bld, p) {
  const c = p.counts, g = k => c[k] || 0;
  return '§SHIM_BONDS ' + bld + ' layer=played n=' + p.n + ' bonded=' + g('bonded') + ' lostUntabled=' + g('lost(untabled)') + ' lostNoContact=' + g('lost(no-contact)') +
    ' lostNoHost=' + g('lost(no-host)') + ' lostUnanchored=' + g('lost(unanchored)') + ' misplaced=' + g('misplaced') + ' seeds=' + p.seeds + ' waves=' + p.waves +
    ' aggregates=' + (p.agg.has ? p.agg.pairs : 'NONE(' + p.agg.why + ')') + ' table=' + p.table + ' — REPORT ONLY (no schedule reads the bonds, §Q.37 S2); angle unverified (boxes)';
}
module.exports = { aggFromDb, tableSha, pack, unpack, line };
