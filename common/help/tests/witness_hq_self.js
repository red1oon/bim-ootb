// ⚠ DO NOT REMOVE — W-HQ-SELF (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1, §5). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: a record the help box cannot find by its own name is a hole in the index. N = the records of each built pack, X = those the core returns at tier 0 for the record's own name.
// S0 first checks the pack is COMPLETE against the dictionary (a record count per kind taken from ad_seed.db), so a thin pack cannot pass this witness vacuously.
// Red control (must FAIL): HQ_BREAK=noname (the core never matches a name: no tier 0).   Run: node common/help/tests/witness_hq_self.js
'use strict';
const H = require('./_hq'), HQ = require(H.CORE);
const k = H.kit('W-HQ-SELF');
function erp() {
  if (!H.seedOk()) { k.incon('ERP', 'no usable ad_seed.db (an LFS stub?)'); return; }
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
  k.L('ALL ERP languages: ' + X + ' of ' + N + ' records found by their own name at tier 0');
}
// §19.4: the Viewer and Modeller packs, 18 locales each. S0 counts the SOURCE independently of the adapter (the dictionary's own pill rows, howto.json, modeller.html's lines), so a thin pack cannot pass vacuously.
function bim() {
  const T = require(require('path').join(H.ROOT, 'viewer', 'tools', 'trl_common')), fs = require('fs'), path = require('path'), BASE = T.readBase();
  // RETIRED rows: the dictionary is append-only, so pill_save / pillc_save_* stay after the pill 'save' took trlKey 'export' (panels.js, §VIEWER_EXPORT_MENU); no live pill reads them, so they are not source rows.
  const RETIRED = /^(pill_save|pillc_save_\d+)$/, n = (re) => BASE.filter((r) => re.test(r.value) && !RETIRED.test(r.value)).length;
  const howto = JSON.parse(fs.readFileSync(path.join(H.ROOT, 'viewer', 'help', 'howto.json'), 'utf8')).pills;
  const mod = fs.readFileSync(path.join(H.ROOT, 'modeller', 'modeller.html'), 'utf8');
  const block = (head, end) => { const a = mod.indexOf(head), b = mod.indexOf(end, a); return a < 0 || b < 0 ? '' : mod.slice(a, b); };
  const barLines = block('<div id="bar">', '</div>').split('\n').filter((l) => /<button id="/.test(l) && /class="ic"/.test(l) && (/<span>/.test(l) || /title="|aria-label="/.test(l))).length;   // a glyph-only pill (no <span>: b-lodup) counts when it carries a title / aria-label, the same rule as modeller/tools/help_records.js barButtons
  const keyLines = (block('const KEY_ROWS = [', '\n    ];').match(/^\s*\['<[^\n]*',\s*'[^']+',\s*'[^']+'\]/gm) || []).length;
  const secLines = (block('const SECTIONS = [', '\n  ];').match(/^\s*\['[^']+',/gm) || []).length;
  const want = { viewer: { pill: n(/^pill_/) - n(/^pill_sched4d_gen$/) + 5,   // the dictionary's pill rows, less the 4D pill's second TITLE row (panels.js _syncSched4dTitle), plus the 5 keyboard-only rows (ui_cmd_zoom_in / zoom_out / maxq / populate / hover_name)
      howto: Object.keys(howto).filter((id) => howto[id].guide).length, kids: n(/^pillc_/) }, modeller: { pill: barLines + keyLines, guide: secLines } };
  let X = 0, N = 0;
  H.BIM_APPS.forEach((app) => H.BIM_LOCALES.forEach((lang) => {
    const p = H.bimPack(app, lang), recs = p.index.records, h = HQ.create(p.index, { text: p.text }), by = {}, w = want[app];
    recs.forEach((r) => { by[r.k] = (by[r.k] || 0) + 1; });
    const miss = Object.keys(w).filter((kd) => kd !== 'kids' && by[kd] !== w[kd]);
    const kids = recs.reduce((a, r) => a + (r.d ? r.d.split('\n').length : 0), 0);
    if (app === 'viewer' && kids !== w.kids) miss.push('sub-rows ' + kids + '/' + w.kids);
    k.chk('S0 ' + app + ' ' + lang + ' the pack holds every source row: ' + Object.keys(w).map((kd) => kd + ' ' + (kd === 'kids' ? kids : by[kd] || 0) + '/' + w[kd]).join(' '), !miss.length, miss.length ? 'SHORT ' + miss.join(',') : '');
    if (!recs.length) { k.incon('S1 ' + app + ' ' + lang, 'no records'); return; }
    let ok = 0; const bad = [];
    recs.forEach((r) => { const hit = h.query(r.n).find((x) => x.id === r.id); if (hit && hit.tier === 0) ok++; else if (bad.length < 3) bad.push(r.id + ' "' + r.n + '" -> ' + (hit ? 'tier ' + hit.tier : 'not found')); });
    X += ok; N += recs.length;
    k.L('app=' + app + ' lang=' + lang + ' records=' + recs.length + ' found-at-tier-0=' + ok + ' bytes=' + fs.statSync(H.bimFile(app, lang)).size);
    k.chk('S1 ' + app + ' ' + lang + ' every record is found by its own name at tier 0: ' + ok + ' of ' + recs.length, ok === recs.length, bad.length ? 'e.g. ' + bad.join(' ; ') : '');
  }));
  k.L('ALL BIM packs (' + H.BIM_APPS.join(' + ') + ' x ' + H.BIM_LOCALES.length + ' locales): ' + X + ' of ' + N + ' records found by their own name at tier 0');
}
(function main() { erp(); bim(); k.end(); })();
