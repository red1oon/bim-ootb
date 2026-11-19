// ⚠ DO NOT REMOVE — W-HQ-LEGACY-SUPERSET (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.3 Step 3; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D3 D7, §5). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves (CARDINAL RULE, twin of legacy): everything legacy's menu search would show for what a person types must also be in the ERP help box's list, so wiring the box to the
// core takes nothing away. Legacy = MenuSearchController.java:586-607 (startsWith when the typed text is under 3 characters, else contains; accents deleted; lower case), sorted by label (:187-190).
// N comes from the dictionary: the windows of a role's menu (AD_Window_Access of GardenWorld Admin) x 2 probes made from each window's own name IN THE SCREEN LANGUAGE (its first 2 characters; a 3-character slice
// from its middle), in every built language. The list under test is the REAL box path: HelpSearch.indexFrom(...).search(probe), the role gate applied after ranking.
//   L1 HelpQuery.legacyFilter == this witness's own plain reading of the Java (set and order) for every probe.  L2 every window legacy shows is inside the box's list (X of N probes; each legacy hit counted).
//   L0 VACUOUS guard: probes judged and legacy hits judged are > 0, else INCONCLUSIVE.
//   L3 (§19.7) inside tier 1 and inside tier 2, the box's windows that legacy also shows AND whose own label puts them in that tier come in legacy's order (raw label, String.compareTo). Judged = a tier holding 2+ of them; none = INCONCLUSIVE.
//   L4 (§19.7) every probe legacy filters by 'starts with' (accent-deleted length < 3 UTF-16 units): the box's first window is legacy's first window (X of N, a tier-0 exact name excepted and counted).
//   L6/L7/L8 (§19.9) the role's menu processes and reports: inside the list (L6), named by the card (L7), and none off the menu (L8). Red HS_BREAK=winonly FAILS L6/L7.
//   L5 (§19.7, printed, not pass/fail) first-window agreement with legacy, this order vs HQ_BREAK=scoretier (the order before §19.7), split by legacy's starts/contains rule; plus en_US "Table" both ways.
// Red controls (must FAIL): HQ_BREAK=nolegacytier (core tiers 1 and 2 off) -> a 2-character probe is found by score alone, i.e. not (L2).  HQ_BREAK=scoretier (score order back inside tiers 1 and 2) -> L3, L4.   Run: node common/help/tests/witness_hq_legacy_superset.js
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./_hq'), k = H.kit('W-HQ-LEGACY-SUPERSET'), HQ = require(H.CORE), HS = require(path.join(H.ERP, 'help_search.js'));
const ROLE = 102;   // GardenWorld Admin: the role the page witnesses log in as
const labTier = (label, typed) => {   // the witness's own reading: tier 1 = the label starts with the typed text, 2 = contains it (3+ characters), else 3 (accents deleted, lower case)
  const del = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''), c = del(String(typed).toLowerCase().trim()), l = del(String(label).toLowerCase().replace(/\s+/g, ' ').trim());
  return l.startsWith(c) ? 1 : (c.length >= 3 && l.includes(c)) ? 2 : 3;
};
const own = (names, typed) => {   // the witness's OWN reading of MenuSearchController.java:593 + :586-607 + :187-190 (no call into the core)
  const del = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''), cmp = del(String(typed).toLowerCase().trim());
  return names.filter((n) => { const l = del(String(n).toLowerCase()); return cmp.length < 3 ? l.startsWith(cmp) : l.includes(cmp); }).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};
(function main() {
  if (!H.seedOk()) { k.incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); return k.end(); }
  const log = console.log; console.log = () => {}; const fsm = require(path.join(H.ERP, 'ad_docfsm.js')); console.log = log;
  const ids = H.q('SELECT DISTINCT a.ad_window_id AS w FROM ad_window_access a JOIN ad_window w ON w.ad_window_id=a.ad_window_id WHERE a.ad_role_id=' + ROLE + " AND a.isactive='Y' AND w.isactive='Y' ORDER BY 1").map((r) => Number(r.w));
  // §19.9 the role's menu processes and reports, the witness's own reading: active P/R menu leaves whose active process the role can access (the page's menu().processes is checked against it in W-HELP-SHOWCASE)
  const pids = H.q("SELECT DISTINCT m.ad_process_id AS p FROM ad_menu m JOIN ad_process pr ON pr.ad_process_id=m.ad_process_id JOIN ad_process_access a ON a.ad_process_id=m.ad_process_id WHERE m.action IN ('P','R') AND m.isactive='Y' AND m.issummary='N' AND pr.isactive='Y' AND a.ad_role_id=" + ROLE + " AND a.isactive='Y' ORDER BY 1").map((r) => Number(r.p));
  const pset = new Set(pids); let pN = 0, pX = 0, pLegacy = 0, pIn = 0, cN = 0, cX = 0, cSame = 0, stray = 0, outN = 0, outRow = 0; const pMiss = [], cMiss = [], strayEx = [];
  const en = JSON.parse(fs.readFileSync(path.join(H.ERP, 'i18n', 'help', 'en_US', 'help.json'), 'utf8'));
  let N = 0, X = 0, legacyHits = 0, legacyIn = 0, l1ok = 0, skipped = 0, oJ = 0, oOk = 0; const missed = [], badOrder = [], badFirst = [];
  const F = { starts: { n: 0, now: 0, before: 0, exact: 0 }, contains: { n: 0, now: 0, before: 0 } }, tbl = {};
  const firstWin = (idx, p, br) => { const keep = process.env.HQ_BREAK; if (br !== undefined) process.env.HQ_BREAK = br; try { return idx.search(p).find((h) => h.k === 'window'); } finally { if (keep === undefined) delete process.env.HQ_BREAK; else process.env.HQ_BREAK = keep; } };
  k.L('role=' + ROLE + ' menu windows=' + ids.length + ' break=' + (process.env.HQ_BREAK || 'none'));
  H.LANGS.forEach((lang) => {
    const pk = lang === 'en_US' ? null : JSON.parse(fs.readFileSync(path.join(H.ERP, 'i18n', 'help', lang, 'help.json'), 'utf8'));
    const idx = HS.indexFrom({ q: H.q, howtoQ: H.hq, en, pack: pk, fsm, windowIds: ids, processIds: pids });
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
        const ranked = idx.search(p).filter((h) => h.k === 'window');
        const inList = new Set(ranked.map((h) => h.rec.gate[1]));
        const legacy = menu.filter((m) => own([m.name], p).length > 0);   // the windows legacy shows for this probe
        // L4 / L5: the first window, against legacy's first (legacy's own length rule decides starts or contains)
        const legFirst = own(names, p)[0];
        if (legFirst !== undefined) {
          const cmpLen = String(p).toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').length, kind = cmpLen < 3 ? 'starts' : 'contains', f = F[kind];
          const now = ranked[0], before = firstWin(idx, p, 'scoretier');
          f.n++; if (now && now.rec.n === legFirst) f.now++; if (before && before.rec.n === legFirst) f.before++;
          if (kind === 'starts' && !(now && now.rec.n === legFirst)) { if (now && now.tier === 0) f.exact++; else if (badFirst.length < 3) badFirst.push(lang + ' "' + p + '" first ' + JSON.stringify(now && now.rec.n) + ' tier ' + (now && now.tier) + ' legacy ' + JSON.stringify(legFirst)); }
        }
        // L3: per tier, the legacy-shown windows in the box's order == legacy's own order of the same windows
        const legIds = new Set(legacy.map((m) => m.id)), byId = {}; menu.forEach((m) => { byId[m.id] = m.name; });
        [1, 2].forEach((t) => {
          const seen = new Set(), seq = [];
          ranked.forEach((h) => { const id = h.rec.gate[1]; if (h.tier === t && legIds.has(id) && labTier(byId[id], p) === t && !seen.has(id)) { seen.add(id); seq.push(id); } });   // judged: the windows whose OWN label puts them in this tier (an alias may lift a row a tier; that row is ordered after, by design)
          if (seq.length < 2) return;
          oJ++;
          const exp = legacy.map((m) => m.id).filter((id) => seen.has(id)).sort((a, b) => { const x = byId[a], y = byId[b]; return x < y ? -1 : x > y ? 1 : a - b; });
          if (JSON.stringify(seq) === JSON.stringify(exp)) oOk++;
          else if (badOrder.length < 3) badOrder.push(lang + ' "' + p + '" tier ' + t + ' got ' + JSON.stringify(seq.slice(0, 4).map((id) => byId[id])) + ' legacy ' + JSON.stringify(exp.slice(0, 4).map((id) => byId[id])));
        });
        let all = true; legacy.forEach((m) => { lh++; if (inList.has(m.id)) li++; else { all = false; if (missed.length < 3) missed.push(lang + ' "' + p + '" misses window ' + m.id + ' ' + JSON.stringify(m.name)); } });
        if (all) x++;
      });
    });
    if (lang === 'en_US') { const t = firstWin(idx, 'Table'), b = firstWin(idx, 'Table', 'scoretier'); tbl.now = t && t.rec.n; tbl.before = b && b.rec.n; tbl.legacy = own(names, 'Table')[0]; }
    // §19.9 L6/L7/L8: the role's menu processes, the same probes as the windows
    const procs = idx.records.filter((r) => r.k === 'process' && pset.has(r.gate[1])).map((r) => ({ id: r.gate[1], name: r.n })), pnames = procs.map((m) => m.name);
    const byName = {}; procs.forEach((m) => { byName[m.name] = (byName[m.name] || 0) + 1; });
    procs.forEach((w) => {
      const chars = Array.from(HQ.tidy(w.name)), probes = [];
      if (chars.length >= 2) probes.push(chars.slice(0, 2).join(''));
      if (chars.length >= 3) probes.push(chars.slice(Math.floor((chars.length - 3) / 2), Math.floor((chars.length - 3) / 2) + 3).join(''));
      probes.forEach((p) => {
        pN++; const hits = idx.search(p), inP = new Set(hits.filter((h) => h.k === 'process').map((h) => h.rec.gate[1]));
        hits.forEach((h) => { if (h.k === 'process' && !pset.has(h.rec.gate[1])) { stray++; if (strayEx.length < 3) strayEx.push(lang + ' "' + p + '" lists process ' + h.rec.gate[1]); } });
        const legacy = procs.filter((m) => own([m.name], p).length > 0); let all = true;
        legacy.forEach((m) => { pLegacy++; if (inP.has(m.id)) pIn++; else { all = false; if (pMiss.length < 3) pMiss.push(lang + ' "' + p + '" misses process ' + m.id + ' ' + JSON.stringify(m.name)); } });
        if (all) pX++;
      });
      if (byName[w.name] > 1) { cSame++; return; }   // two menu processes share this name: the card names one of them (counted apart)
      cN++; const c = idx.ask(w.name); if (c.process && c.process.id === w.id) cX++; else if (cMiss.length < 3) cMiss.push(lang + ' ' + JSON.stringify(w.name) + ' -> ' + JSON.stringify(c.process));
    });
    // L8: a process NOT on the role's menu, asked by its own name, gives no Process row naming it
    idx.records.filter((r) => r.k === 'process' && !pset.has(r.gate[1])).slice(0, 60).forEach((r) => { outN++; const c = idx.ask(r.n); if (c.process && c.process.id === r.gate[1]) outRow++; });
    N += n; X += x; legacyHits += lh; legacyIn += li;
    k.L('lang=' + lang + ' menu=' + menu.length + ' probes=' + n + ' probes-fully-inside=' + x + ' legacy-hits=' + lh + ' inside=' + li);
  });
  k.L('ALL probes=' + N + ' fully inside=' + X + ' legacy hits=' + legacyHits + ' inside=' + legacyIn + ' (names too short for a probe: ' + skipped + ') legacyFilter==witness reading: ' + l1ok + ' of ' + N);
  if (!N || !legacyHits) { k.incon('L0', 'VACUOUS: probes=' + N + ' legacy hits=' + legacyHits); return k.end(); }
  k.chk('L1 HelpQuery.legacyFilter gives the same set and order as the witness\'s own reading of MenuSearchController: ' + l1ok + ' of ' + N + ' probes', l1ok === N);
  k.chk('L2 every window legacy\'s menu filter shows is inside the box\'s list: ' + X + ' of ' + N + ' probes fully inside (' + legacyIn + ' of ' + legacyHits + ' legacy hits)', X === N, missed.join(' ; '));
  k.L('§HQ_LABEL_ORDER judged tiers=' + oJ + ' in legacy order=' + oOk + (badOrder.length ? ' first=' + badOrder.join(' ; ') : ''));
  if (!oJ) k.incon('L3', 'VACUOUS: no tier held 2+ legacy-shown windows');
  else k.chk('L3 inside tiers 1 and 2 the box keeps legacy\'s label order: ' + oOk + ' of ' + oJ + ' judged tiers', oOk === oJ, badOrder.join(' ; '));
  const S = F.starts, C = F.contains;
  if (!S.n) k.incon('L4', 'VACUOUS: no starts-with probe'); else k.chk('L4 starts-with probes: the box\'s first window is legacy\'s first: ' + (S.now + S.exact) + ' of ' + S.n + ' (' + S.exact + ' of them a tier-0 exact name)', S.now + S.exact === S.n, badFirst.join(' ; '));
  k.L('§HQ_FIRST_VS_LEGACY starts: now=' + S.now + ' before=' + S.before + ' of ' + S.n + ' · contains: now=' + C.now + ' before=' + C.before + ' of ' + C.n + ' (contains differs by design: tier 1 starts-with is kept before tier 2 contains; legacy mixes them)');
  k.L('§HQ_TABLE en_US role ' + ROLE + ' "Table" first window now=' + JSON.stringify(tbl.now) + ' before=' + JSON.stringify(tbl.before) + ' legacy=' + JSON.stringify(tbl.legacy));
  k.L('§HQ_MENU_PROCESSES role=' + ROLE + ' menu processes/reports=' + pids.length + ' probes=' + pN + ' fully inside=' + pX + ' legacy hits=' + pLegacy + ' inside=' + pIn + ' · card by exact name=' + cX + ' of ' + cN + ' (same-name pairs apart: ' + cSame + ') · stray (not on the menu) listed=' + stray + ' · off-menu asked=' + outN + ' got a row=' + outRow + ' · not indexed at all (no record kind): forms, workflows, info windows, tasks');
  if (!pN) k.incon('L6', 'VACUOUS: no menu process judged');
  else k.chk('L6 every menu process or report legacy\'s filter shows is inside the box\'s list: ' + pX + ' of ' + pN + ' probes (' + pIn + ' of ' + pLegacy + ' legacy hits)', pX === pN, pMiss.join(' ; '));
  if (!cN) k.incon('L7', 'VACUOUS: no process asked'); else k.chk('L7 asking a menu process by its name gives a Process row naming it: ' + cX + ' of ' + cN, cX === cN, cMiss.join(' ; '));
  if (!outN) k.incon('L8', 'VACUOUS: every process is on the menu');
  else k.chk('L8 the gate holds: 0 off-menu processes listed (' + stray + '), 0 Process rows for an off-menu process asked by name (' + outRow + ' of ' + outN + ')', stray === 0 && outRow === 0, strayEx.join(' ; '));
  k.end();
})();
