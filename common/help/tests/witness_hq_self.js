// ⚠ DO NOT REMOVE — W-HQ-SELF (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1, §5). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: a record the help box cannot find by its own name is a hole in the index. N = the records of each built pack, X = those the core returns at tier 0 for the record's own name.
// S0 first checks the pack is COMPLETE against the dictionary (a record count per kind taken from ad_seed.db), so a thin pack cannot pass this witness vacuously.
// Red control (must FAIL): HQ_BREAK=noname (the core never matches a name: no tier 0).   Run: node common/help/tests/witness_hq_self.js
'use strict';
const H = require('./_hq'), HQ = require(H.CORE);
const k = H.kit('W-HQ-SELF');
(function main() {
  if (!H.seedOk()) { k.incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); return k.end(); }
  const want = { window: H.q("SELECT count(*) AS c FROM ad_window WHERE isactive='Y'")[0].c, process: H.q("SELECT count(*) AS c FROM ad_process WHERE isactive='Y'")[0].c, doctype: H.q("SELECT count(*) AS c FROM c_doctype WHERE isactive='Y'")[0].c,
    action: H.q("SELECT count(*) AS c FROM ad_ref_list WHERE ad_reference_id=135 AND isactive='Y' AND value<>'--'")[0].c, status: H.q("SELECT count(*) AS c FROM ad_ref_list WHERE ad_reference_id=131 AND isactive='Y' AND value<>'--'")[0].c };
  let X = 0, N = 0;
  H.LANGS.forEach((lang) => {
    const p = H.pack(lang), recs = p.index.records, h = HQ.create(p.index, { text: p.text }), by = {};
    recs.forEach((r) => { by[r.k] = (by[r.k] || 0) + 1; });
    const miss = Object.keys(want).filter((kd) => by[kd] !== want[kd]);
    k.chk('S0 ' + lang + ' the pack holds every dictionary record: ' + Object.keys(want).map((kd) => kd + ' ' + (by[kd] || 0) + '/' + want[kd]).join(' ') + ' howto ' + (by.howto || 0), !miss.length, miss.length ? 'SHORT ' + miss.join(',') : '');
    if (!recs.length) { k.incon('S1 ' + lang, 'no records'); return; }
    let ok = 0; const bad = [];
    recs.forEach((r) => { const hit = h.query(r.n).find((x) => x.id === r.id); if (hit && hit.tier === 0) ok++; else if (bad.length < 3) bad.push(r.id + ' "' + r.n + '" -> ' + (hit ? 'tier ' + hit.tier : 'not found')); });
    X += ok; N += recs.length;
    k.L('lang=' + lang + ' records=' + recs.length + ' found-at-tier-0=' + ok);
    k.chk('S1 ' + lang + ' every record is found by its own name at tier 0: ' + ok + ' of ' + recs.length, ok === recs.length, bad.length ? 'e.g. ' + bad.join(' ; ') : '');
  });
  k.L('ALL languages: ' + X + ' of ' + N + ' records found by their own name at tier 0');
  k.end();
})();
