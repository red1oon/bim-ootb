// ⚠ DO NOT REMOVE — W-HQ-LEGACY-SUPERSET (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.3 Step 3; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D3 D7, §5). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves (CARDINAL RULE, twin of legacy): everything legacy's menu search would show for what a person types must also be in the ERP help box's list, so wiring the box to the
// core takes nothing away. Legacy = MenuSearchController.java:586-607 (startsWith when the typed text is under 3 characters, else contains; accents deleted; lower case), sorted by label (:187-190).
// N comes from the dictionary: the windows of a role's menu (AD_Window_Access of GardenWorld Admin) x 2 probes made from each window's own name IN THE SCREEN LANGUAGE (its first 2 characters; a 3-character slice
// from its middle), in every built language. The list under test is the REAL box path: HelpSearch.indexFrom(...).search(probe), the role gate applied after ranking.
//   L1 HelpQuery.legacyFilter == this witness's own plain reading of the Java (set and order) for every probe.  L2 every window legacy shows is inside the box's list (X of N probes; each legacy hit counted).
//   L0 VACUOUS guard: probes judged and legacy hits judged are > 0, else INCONCLUSIVE.
// Red control (must FAIL): HQ_BREAK=nolegacytier (core tiers 1 and 2 off) -> a 2-character probe is found by score alone, i.e. not.   Run: node common/help/tests/witness_hq_legacy_superset.js
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./_hq'), k = H.kit('W-HQ-LEGACY-SUPERSET'), HQ = require(H.CORE), HS = require(path.join(H.ERP, 'help_search.js'));
const ROLE = 102;   // GardenWorld Admin: the role the page witnesses log in as
const own = (names, typed) => {   // the witness's OWN reading of MenuSearchController.java:593 + :586-607 + :187-190 (no call into the core)
  const del = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''), cmp = del(String(typed).toLowerCase().trim());
  return names.filter((n) => { const l = del(String(n).toLowerCase()); return cmp.length < 3 ? l.startsWith(cmp) : l.includes(cmp); }).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};
(function main() {
  if (!H.seedOk()) { k.incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); return k.end(); }
  const log = console.log; console.log = () => {}; const fsm = require(path.join(H.ERP, 'ad_docfsm.js')); console.log = log;
  const ids = H.q('SELECT DISTINCT a.ad_window_id AS w FROM ad_window_access a JOIN ad_window w ON w.ad_window_id=a.ad_window_id WHERE a.ad_role_id=' + ROLE + " AND a.isactive='Y' AND w.isactive='Y' ORDER BY 1").map((r) => Number(r.w));
  const en = JSON.parse(fs.readFileSync(path.join(H.ERP, 'i18n', 'help', 'en_US', 'help.json'), 'utf8'));
  let N = 0, X = 0, legacyHits = 0, legacyIn = 0, l1ok = 0, skipped = 0; const missed = [];
  k.L('role=' + ROLE + ' menu windows=' + ids.length + ' break=' + (process.env.HQ_BREAK || 'none'));
  H.LANGS.forEach((lang) => {
    const pk = lang === 'en_US' ? null : JSON.parse(fs.readFileSync(path.join(H.ERP, 'i18n', 'help', lang, 'help.json'), 'utf8'));
    const idx = HS.indexFrom({ q: H.q, en, pack: pk, fsm, windowIds: ids });
    const menu = idx.records.filter((r) => r.k === 'window' && ids.indexOf(r.gate[1]) >= 0).map((r) => ({ id: r.gate[1], name: r.n }));   // the role's menu, labelled in this language
    const names = menu.map((m) => m.name);
    let n = 0, x = 0, lh = 0, li = 0;
    menu.forEach((w) => {
      const chars = Array.from(HQ.tidy(w.name)), probes = [];
      if (chars.length >= 2) probes.push(chars.slice(0, 2).join('')); else skipped++;
      if (chars.length >= 3) probes.push(chars.slice(Math.floor((chars.length - 3) / 2), Math.floor((chars.length - 3) / 2) + 3).join('')); else skipped++;
      probes.forEach((p) => {
        n++;
        const want = own(names, p), got = HQ.legacyFilter(names, p);
        if (JSON.stringify(want) === JSON.stringify(got)) l1ok++;
        const inList = new Set(idx.search(p).filter((h) => h.k === 'window').map((h) => h.rec.gate[1]));
        const legacy = menu.filter((m) => own([m.name], p).length > 0);   // the windows legacy shows for this probe
        let all = true; legacy.forEach((m) => { lh++; if (inList.has(m.id)) li++; else { all = false; if (missed.length < 3) missed.push(lang + ' "' + p + '" misses window ' + m.id + ' ' + JSON.stringify(m.name)); } });
        if (all) x++;
      });
    });
    N += n; X += x; legacyHits += lh; legacyIn += li;
    k.L('lang=' + lang + ' menu=' + menu.length + ' probes=' + n + ' probes-fully-inside=' + x + ' legacy-hits=' + lh + ' inside=' + li);
  });
  k.L('ALL probes=' + N + ' fully inside=' + X + ' legacy hits=' + legacyHits + ' inside=' + legacyIn + ' (names too short for a probe: ' + skipped + ') legacyFilter==witness reading: ' + l1ok + ' of ' + N);
  if (!N || !legacyHits) { k.incon('L0', 'VACUOUS: probes=' + N + ' legacy hits=' + legacyHits); return k.end(); }
  k.chk('L1 HelpQuery.legacyFilter gives the same set and order as the witness\'s own reading of MenuSearchController: ' + l1ok + ' of ' + N + ' probes', l1ok === N);
  k.chk('L2 every window legacy\'s menu filter shows is inside the box\'s list: ' + X + ' of ' + N + ' probes fully inside (' + legacyIn + ' of ' + legacyHits + ' legacy hits)', X === N, missed.join(' ; '));
  k.end();
})();
