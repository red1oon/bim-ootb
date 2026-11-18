// ⚠ DO NOT REMOVE — W-HQ-PROC-NAMES (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.10 Step 10). READ THE LOG (common/help/tests/logs/w_hq_proc_names.log); an exit code is not evidence.
// ISSUE it proves or disproves (CARDINAL RULE, twin of legacy): a person working in French, German, Japanese or Chinese who types a process's name IN THAT LANGUAGE finds it, as legacy's
// translated menu shows it. Before §19.10 every process record carried the English AD_Process.Name in every language.
// N comes from the translation files themselves: the witness's OWN reading of AD_Process_Trl_<lang>.xml in each source of build_help_pack.js SOURCES (first source wins; a name counts as
// translated when present and not equal to its English original), over the active processes of ad_seed.db.
//   P1 the pack holds them: help.json names.processes == the witness's own reading, X of N (missing, wrong and extra counted apart).
//   P2 the record shows them: in HelpSearch.indexFrom (the page's path), each such process's record has n = the translated name and the English dictionary name among its other names a, X of N.
//   P2b a menu process asked by its translated name gives the card's Process row for it (role 102's menu; X of M, a name shared by two menu processes counted apart).
//   P0 VACUOUS guard: N > 0 in each language, else INCONCLUSIVE.
// Red control (must FAIL): HS_BREAK=noprocnames (the witness drops names.processes from the pack in memory before indexFrom) -> P2, P2b FAIL.   Run: node common/help/tests/witness_hq_proc_names.js
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./_hq'), k = H.kit('W-HQ-PROC-NAMES'), HS = require(path.join(H.ERP, 'help_search.js')), BP = require(path.join(H.ERP, 'tools', 'build_help_pack.js'));
const ROLE = 102, BR = process.env.HS_BREAK || '';
const unent = (s) => s.replace(/&#(x?)([0-9a-f]+);/gi, (m, x, n) => String.fromCodePoint(parseInt(n, x ? 16 : 10))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const sp = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
// the witness's own reading of one AD_Process_Trl file: { id: [name, original] }, the Name value only
function ownRead(file) {
  const out = {}; if (!fs.existsSync(file)) return null;
  const x = fs.readFileSync(file, 'utf8');
  x.split('<row ').slice(1).forEach((row) => {
    const id = (row.match(/^id="(\d+)"/) || [])[1]; if (!id) return;
    const v = row.match(/<value column="Name" original="([^"]*)"\s*(?:\/>|>([\s\S]*?)<\/value>)/); if (!v) return;
    out[id] = [unent(v[2] || ''), unent(v[1] || '')];
  });
  return out;
}
(function main() {
  if (!H.seedOk()) { k.incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); return k.end(); }
  const log = console.log; console.log = () => {}; const fsm = require(path.join(H.ERP, 'ad_docfsm.js')); console.log = log;
  const procs = H.q("SELECT ad_process_id AS id, name AS n FROM ad_process WHERE isactive='Y' ORDER BY 1"), eng = {}; procs.forEach((p) => { eng[p.id] = String(p.n); });
  const ids = H.q('SELECT DISTINCT a.ad_window_id AS w FROM ad_window_access a JOIN ad_window w ON w.ad_window_id=a.ad_window_id WHERE a.ad_role_id=' + ROLE + " AND a.isactive='Y' AND w.isactive='Y' ORDER BY 1").map((r) => Number(r.w));
  const pids = H.q("SELECT DISTINCT m.ad_process_id AS p FROM ad_menu m JOIN ad_process pr ON pr.ad_process_id=m.ad_process_id JOIN ad_process_access a ON a.ad_process_id=m.ad_process_id WHERE m.action IN ('P','R') AND m.isactive='Y' AND m.issummary='N' AND pr.isactive='Y' AND a.ad_role_id=" + ROLE + " AND a.isactive='Y' ORDER BY 1").map((r) => Number(r.p));
  const en = JSON.parse(fs.readFileSync(path.join(H.ERP, 'i18n', 'help', 'en_US', 'help.json'), 'utf8'));
  k.L('active processes=' + procs.length + ' role=' + ROLE + ' menu processes/reports=' + pids.length + ' break=' + (BR || 'none') + ' cache=' + BP.CACHE);
  Object.keys(BP.SOURCES).forEach((lang) => {
    const files = BP.SOURCES[lang].map((d) => ownRead(path.join(BP.CACHE, d, 'AD_Process_Trl_' + lang + '.xml')));
    if (files.every((f) => f === null)) { k.incon('P1 ' + lang, 'no AD_Process_Trl file in the cache for this language'); return; }
    const want = {};
    procs.forEach((p) => { for (const f of files) { const r = f && f[String(p.id)]; if (r && sp(r[0]) !== '' && sp(r[0]) !== sp(r[1])) { want[p.id] = r[0].trim(); break; } } });
    const N = Object.keys(want).length;
    if (!N) { k.incon('P0 ' + lang, 'VACUOUS: no translated process name in the sources'); return; }
    const pk = JSON.parse(fs.readFileSync(path.join(H.ERP, 'i18n', 'help', lang, 'help.json'), 'utf8')), got = (pk.names && pk.names.processes) || {};
    let ok1 = 0, wrong = 0, missing = 0; const bad1 = [];
    Object.keys(want).forEach((id) => { if (got[id] === want[id]) ok1++; else { if (got[id] == null) missing++; else wrong++; if (bad1.length < 3) bad1.push(id + ' want ' + JSON.stringify(want[id]) + ' got ' + JSON.stringify(got[id])); } });
    const extra = Object.keys(got).filter((id) => !(id in want)).length;
    k.chk('P1 ' + lang + ' the pack holds the translated process names: ' + ok1 + ' of ' + N + ' (missing ' + missing + ', wrong ' + wrong + ', extra ' + extra + ')', ok1 === N && extra === 0, bad1.join(' ; '));
    if (BR === 'noprocnames' && pk.names) delete pk.names.processes;   // the red control, in memory only
    const idx = HS.indexFrom({ q: H.q, en, pack: pk, fsm, windowIds: ids, processIds: pids }), rec = {};
    idx.records.forEach((r) => { if (r.k === 'process') rec[r.gate[1]] = r; });
    let ok2 = 0; const bad2 = [];
    Object.keys(want).forEach((id) => { const r = rec[id], a = (r && r.a) || []; if (r && r.n === want[id] && (sp(want[id]).toLowerCase() === sp(eng[id]).toLowerCase() || a.indexOf(sp(eng[id])) >= 0)) ok2++; else if (bad2.length < 3) bad2.push(id + ' n=' + JSON.stringify(r && r.n) + ' a=' + JSON.stringify(a)); });
    k.chk('P2 ' + lang + ' each record shows the translated name, the English one among its other names: ' + ok2 + ' of ' + N, ok2 === N, bad2.join(' ; '));
    const menuT = pids.filter((p) => want[p] != null), byName = {}; menuT.forEach((p) => { (byName[want[p]] = byName[want[p]] || []).push(p); });
    let M = 0, ok3 = 0, shared = 0; const bad3 = [];
    menuT.forEach((p) => { if (byName[want[p]].length > 1) { shared++; return; } M++; const c = idx.ask(want[p]); if (c.process && c.process.id === p && c.process.name === want[p]) ok3++; else if (bad3.length < 3) bad3.push(JSON.stringify(want[p]) + ' -> ' + JSON.stringify(c.process)); });
    k.L('§HQ_PROC_NAMES lang=' + lang + ' translated=' + N + ' of ' + procs.length + ' pack=' + Object.keys(got).length + ' menu translated=' + menuT.length + ' asked=' + M + ' shared-name apart=' + shared);
    if (!M) k.incon('P2b ' + lang, 'VACUOUS: no translated menu process to ask');
    else k.chk('P2b ' + lang + ' a menu process asked by its translated name gives its Process row: ' + ok3 + ' of ' + M, ok3 === M, bad3.join(' ; '));
  });
  k.end();
})();
