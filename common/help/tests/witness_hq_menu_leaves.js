// ⚠ DO NOT REMOVE — W-HQ-MENU-LEAVES (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.14 Step 11). READ THE LOG (common/help/tests/logs/w_hq_menu_leaves*.log); an exit code is not evidence.
// ISSUE it proves or disproves (CARDINAL RULE, twin of legacy): legacy's menu search lists every entry of the role's menu, forms (X), workflows (F), info windows (I) and tasks (T) included, and legacy's
// menu hides an entry the role cannot open (MTree.java:663-670). Before §19.14 the twin's help box listed none of the four kinds, and the twin's menu showed F / I entries the role has no access to.
//   M1 the menu matches legacy's rule: the page's menu().leaves == the witness's own SQL reading (X entries with ad_form_access, F with ad_workflow_access, I with ad_infowindow_access, T with legacy's own
//      ad_task_access read from Postgres, §19.16 C1), role 102. Red: the page served main's idmp_session.js (no F / I gate) FAILs M1.
//   M2 the names are the menu's: in each built language, each admitted entry's record name == the text of its row in the real page's menu. X of N per language. Red HQ_BREAK=nomenunames (the
//      witness drops names.menus from the packs it builds its records from) FAILs wherever a translation exists.
//   M3 the box lists them: each admitted entry x 2 probes (its first 2 characters; a 3-character slice from its middle) x the built languages: every entry legacy's filter shows (the witness's own
//      reading of MenuSearchController, as W-HQ-LEGACY-SUPERSET) is in the box's list. A probe legacy shows nothing for (a slice at a space: legacy trims it) is not judged, and counted. Red HS_BREAK=noleaf (the gate drops menu entries) FAILs.
//   M4 the card names it, and it opens as the menu opens: asking an entry's exact name gives card.leaf.menuId = it (unique names; X of N). In the page, for one entry of each kind, the box row's click
//      gives the same status text and the same §AD-FORM-LIVE lines as a click on the menu row itself. Red HS_BREAK=noleaf FAILs the Node half.
//   M5 the gate holds: an entry the role cannot open is never in an M3 list, and asking its name gives no row naming it (0 expected; INCONCLUSIVE when no entry is hidden).
// Run: node common/help/tests/witness_hq_menu_leaves.js   Env: HS_BREAK=noleaf | HQ_BREAK=nomenunames | MENU_OLD_SESSION=<a commit: its erp/idmp_session.js is served to the page, M1 red> | NOPAGE=1.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const H = require('./_hq'), k = H.kit('W-HQ-MENU-LEAVES'), HQ = require(H.CORE), HS = require(path.join(H.ERP, 'help_search.js'));
const ROLE = 102, KIND = { X: 'form', F: 'workflow', I: 'info', T: 'task' }, BR = process.env.HQ_BREAK || '';
const own = (labels, typed) => {   // the witness's own reading of MenuSearchController.java:586-607: accents deleted, lower case; under 3 characters startsWith, else contains
  const del = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''), c = del(String(typed).toLowerCase().trim());
  return labels.filter((l) => { const x = del(String(l).toLowerCase().replace(/\s+/g, ' ').trim()); return c.length < 3 ? x.startsWith(c) : x.includes(c); });
};
// the witness's own SQL reading of the role's X / F / I / T menu entries (the page's menu() is judged against it)
const allLeaves = H.q("SELECT ad_menu_id AS id, action AS a, name AS n, ad_form_id AS f, ad_workflow_id AS w, ad_infowindow_id AS i, ad_task_id AS t FROM ad_menu WHERE isactive='Y' AND issummary='N' AND action IN ('X','F','I','T') ORDER BY ad_menu_id");
const grant = (t, col) => new Set(H.q('SELECT ' + col + " AS id FROM " + t + ' WHERE ad_role_id=' + ROLE + " AND isactive='Y'").map((r) => Number(r.id)));
// §19.16 C1: task grants are read from LEGACY's own ad_task_access (the seed has none; the page gets them from the ad_ctxhelp_overlay.js boot overlay), so the oracle is not the overlay under test.
//   Legacy unreachable -> T is not judged (TASKS_JUDGED=false, an INCONCLUSIVE line), never assumed.
const legacyTasks = (() => { const r = cp.spawnSync('docker', ['exec', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere', '-At', '-c', "set search_path=adempiere; select ad_task_id from ad_task_access where ad_role_id=" + ROLE + " and isactive='Y'"], { encoding: 'utf8' });
  return r.status === 0 ? new Set(r.stdout.split('\n').filter((x) => /^\d+$/.test(x)).map(Number)) : null; })(), TASKS_JUDGED = !!legacyTasks;
const G = { X: grant('ad_form_access', 'ad_form_id'), F: grant('ad_workflow_access', 'ad_workflow_id'), I: grant('ad_infowindow_access', 'ad_infowindow_id'), T: legacyTasks };
const canOpen = (m) => m.a === 'X' ? G.X.has(Number(m.f)) : m.a === 'F' ? G.F.has(Number(m.w)) : m.a === 'I' ? G.I.has(Number(m.i)) : TASKS_JUDGED ? G.T.has(Number(m.t)) : true;
const admitted = allLeaves.filter(canOpen).map((m) => Number(m.id)), aset = new Set(admitted), hidden = allLeaves.filter((m) => !aset.has(Number(m.id)));
const ids = H.q('SELECT DISTINCT a.ad_window_id AS w FROM ad_window_access a JOIN ad_window w ON w.ad_window_id=a.ad_window_id WHERE a.ad_role_id=' + ROLE + " AND a.isactive='Y' AND w.isactive='Y'").map((r) => Number(r.w));
const en = JSON.parse(fs.readFileSync(path.join(H.ERP, 'i18n', 'help', 'en_US', 'help.json'), 'utf8'));
const packOf = (lang) => { if (lang === 'en_US') return null; const p = JSON.parse(fs.readFileSync(path.join(H.ERP, 'i18n', 'help', lang, 'help.json'), 'utf8')); if (BR === 'nomenunames') delete p.names.menus; return p; };
const recNames = {};   // lang -> {menuId: record name}, for M2

function nodePart() {
  const log = console.log; console.log = () => {}; const fsm = require(path.join(H.ERP, 'ad_docfsm.js')); console.log = log;
  const byKind = {}; allLeaves.forEach((m) => { const kd = KIND[m.a]; byKind[kd] = byKind[kd] || { all: 0, open: 0 }; byKind[kd].all++; if (aset.has(Number(m.id))) byKind[kd].open++; });
  k.L('role=' + ROLE + ' entries=' + allLeaves.length + ' admitted=' + admitted.length + ' hidden=' + hidden.length + ' ' + Object.keys(byKind).map((x) => x + '=' + byKind[x].open + '/' + byKind[x].all).join(' ') +
    ' hidden: ' + hidden.map((m) => m.a + ':' + m.id + ' ' + JSON.stringify(String(m.n).trim())).join(', ') + ' break=' + (process.env.HS_BREAK || BR || 'none'));
  let N = 0, X = 0, U = 0, lHits = 0, lIn = 0, cN = 0, cX = 0, cSame = 0, stray = 0, outN = 0, outRow = 0; const miss = [], cMiss = [], strayEx = [];
  H.LANGS.forEach((lang) => {
    const idx = HS.indexFrom({ q: H.q, howtoQ: H.hq, en, pack: packOf(lang), fsm, windowIds: ids, menuIds: admitted });
    const recs = idx.records.filter((r) => r.gate && r.gate[0] === 'menu'), mine = recs.filter((r) => aset.has(r.gate[1])).map((r) => ({ id: r.gate[1], name: r.n, k: r.k }));
    recNames[lang] = {}; mine.forEach((m) => { recNames[lang][m.id] = m.name; });
    const names = mine.map((m) => m.name), byName = {}; names.forEach((n) => { byName[n] = (byName[n] || 0) + 1; });
    let n = 0, x = 0;
    mine.forEach((m) => {
      const ch = Array.from(HQ.tidy(m.name)), probes = [];
      if (ch.length >= 2) probes.push(ch.slice(0, 2).join(''));
      if (ch.length >= 3) probes.push(ch.slice(Math.floor((ch.length - 3) / 2), Math.floor((ch.length - 3) / 2) + 3).join(''));
      probes.forEach((p) => {
        const legacy = mine.filter((o) => own([o.name], p).length > 0); if (!legacy.length) { U++; return; }   // a slice at a space is trimmed by legacy's filter and shows nothing: not judged, counted
        n++; const hits = idx.search(p), inL = new Set(hits.filter((h) => h.rec.gate && h.rec.gate[0] === 'menu').map((h) => h.rec.gate[1]));
        hits.forEach((h) => { if (h.rec.gate && h.rec.gate[0] === 'menu' && !aset.has(h.rec.gate[1])) { stray++; if (strayEx.length < 3) strayEx.push(lang + ' "' + p + '" lists entry ' + h.rec.gate[1]); } });
        let all = true; legacy.forEach((o) => { lHits++; if (inL.has(o.id)) lIn++; else { all = false; if (miss.length < 3) miss.push(lang + ' "' + p + '" misses ' + o.k + ' ' + o.id + ' ' + JSON.stringify(o.name)); } });
        if (all) x++;
      });
      if (byName[m.name] > 1) { cSame++; return; }
      cN++; const c = idx.ask(m.name); if (c.leaf && c.leaf.menuId === m.id && c.leaf.kind === m.k) cX++; else if (cMiss.length < 3) cMiss.push(lang + ' ' + JSON.stringify(m.name) + ' -> ' + JSON.stringify(c.leaf));
    });
    recs.filter((r) => !aset.has(r.gate[1])).forEach((r) => { outN++; const c = idx.ask(r.n); if (c.leaf && c.leaf.menuId === r.gate[1]) outRow++; });
    N += n; X += x;
    k.L('lang=' + lang + ' entries=' + mine.length + ' translated=' + mine.filter((m) => { const e = allLeaves.find((a) => Number(a.id) === m.id); return e && m.name !== String(e.n).trim(); }).length + ' probes=' + n + ' fully-inside=' + x);
  });
  if (!N) k.incon('M3', 'VACUOUS: no probe judged'); else k.chk('M3 every form / workflow / info / task entry legacy\'s filter shows is inside the box\'s list: ' + X + ' of ' + N + ' probes (' + lIn + ' of ' + lHits + ' legacy hits; ' + U + ' probes legacy shows nothing for, not judged)', X === N && lHits > 0, miss.join(' ; '));
  if (!cN) k.incon('M4', 'VACUOUS: no unique name'); else k.chk('M4 asking an entry\'s exact name gives card.leaf = it: ' + cX + ' of ' + cN + ' (' + cSame + ' shared names counted apart)', cX === cN, cMiss.join(' ; '));
  if (!hidden.length) k.incon('M5', 'VACUOUS: no entry is hidden from role ' + ROLE);
  else k.chk('M5 the gate holds: 0 hidden entries listed (' + stray + '), 0 rows for a hidden entry asked by name (' + outRow + ' of ' + outN + ')', stray === 0 && outRow === 0 && outN > 0, strayEx.join(' ; '));
}

async function pagePart() {
  let over = null, tmp = null;
  if (process.env.MENU_OLD_SESSION) { tmp = path.join(os.tmpdir(), 'hq_menu_old_session_' + process.pid + '.js'); fs.writeFileSync(tmp, cp.execSync('git show ' + process.env.MENU_OLD_SESSION + ':erp/idmp_session.js', { cwd: H.ROOT, maxBuffer: 1 << 26 })); over = { '/erp/idmp_session.js': tmp }; }
  const P = await H.erpPage(process.env.HS_BREAK ? { HS: process.env.HS_BREAK } : null, over);
  try {
    k.L('page chromium ' + P.version + ' old-session=' + (process.env.MENU_OLD_SESSION || 'no') + ' first index: ' + P.firstIndexLine);
    const got = (await P.pg.evaluate(() => window.__idmpFieldHelp.menu().leaves)).map(Number).sort((a, b) => a - b), want = admitted.slice().sort((a, b) => a - b);
    const extra = got.filter((i) => !aset.has(i)), lack = want.filter((i) => got.indexOf(i) < 0);
    k.chk('M1 the page\'s menu shows the form / workflow / info / task entries legacy\'s rule shows role ' + ROLE + ': ' + got.length + ' shown, ' + want.length + ' by the SQL reading, extra ' + extra.length + ', missing ' + lack.length,
      extra.length === 0 && lack.length === 0 && want.length > 0, (extra.length ? 'extra ' + extra.join(',') : '') + (lack.length ? ' missing ' + lack.join(',') : ''));
    const scopeLine = P.logs.filter((l) => l.indexOf('§IDMP-SESSION scopeMenu') === 0).pop(); k.L('page ' + (scopeLine || 'no scopeMenu line'));
    // M2: per language, the menu row text of each admitted entry == the record name
    let m2N = 0, m2X = 0, m2T = 0; const m2Miss = [];
    for (const lang of H.LANGS) {
      if (lang !== 'en_US') { const line = await P.setLang(lang); if (!line) { k.incon('M2 ' + lang, 'no §HELP_SEARCH index line after the language switch'); continue; } }
      else if (H.LANGS.indexOf(lang) > 0) await P.setLang(lang);
      const rows = await P.pg.evaluate(() => { const o = {}; document.querySelectorAll('#idmp-tree .idmp-row.leaf').forEach((r) => { o[r.dataset.menuId] = (r.querySelector('.nm') || {}).textContent; }); return o; });
      let n = 0, x = 0, t = 0;
      admitted.forEach((id) => { if (rows[id] == null) return; n++; const rn = (recNames[lang] || {})[id], e = allLeaves.find((a) => Number(a.id) === id); if (rows[id] !== String(e.n).trim()) t++; if (rn === rows[id]) x++; else if (m2Miss.length < 4) m2Miss.push(lang + ' ' + id + ' menu ' + JSON.stringify(rows[id]) + ' record ' + JSON.stringify(rn)); });
      m2N += n; m2X += x; m2T += t; k.L('M2 lang=' + lang + ' entries on the page=' + n + ' translated on the menu=' + t + ' record name == menu text: ' + x + ' of ' + n);
    }
    if (!m2N) k.incon('M2', 'VACUOUS: no menu entry read'); else k.chk('M2 each entry\'s record name is the text the menu shows, every built language: ' + m2X + ' of ' + m2N + ' (' + m2T + ' translated)', m2X === m2N && m2T > 0, m2Miss.join(' ; '));
    if (P.logs.length) await P.setLang('en_US');
    // M4 page half: for one entry of each kind, the box row's click == a click on the menu row (status text, §AD-FORM-LIVE lines)
    const one = {}; allLeaves.forEach((m) => { if (aset.has(Number(m.id)) && got.indexOf(Number(m.id)) >= 0 && !one[m.a]) one[m.a] = m; });
    let pN = 0, pX = 0; const pMiss = [];
    for (const a of Object.keys(one)) {
      const m = one[a], name = String(m.n).trim();
      const via = async (how) => {
        const n0 = P.logs.length; await P.pg.evaluate(() => { document.getElementById('idmp-status-main').textContent = ''; });
        if (how === 'menu') await P.pg.evaluate((id) => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]').click(), Number(m.id));
        else { const has = await P.pg.evaluate((q) => { const c = window.__idmpHowto.ask(q); return !!document.querySelector('#idmp-howto-card a[data-help-menu]') || !!(c && c.leaf); }, name);
          const link = await P.pg.$('#idmp-howto-card a[data-help-menu="' + m.id + '"]'); if (!has || !link) return null; await link.click(); }
        await P.pg.waitForTimeout(1200);
        const st = await P.pg.evaluate(() => document.getElementById('idmp-status-main').textContent);
        return { st, form: P.logs.slice(n0).filter((l) => l.indexOf('§AD-FORM-LIVE open') === 0).join(' | '), link: P.logs.slice(n0).filter((l) => l.indexOf('§HELP_LINK menu=') === 0).join(' | ') };
      };
      const a1 = await via('menu'), a2 = await via('box'); pN++;
      const same = a2 && a1.st === a2.st && a1.form === a2.form && /§HELP_LINK menu=\d+ onMenu=true/.test(a2.link);
      if (same) pX++; else pMiss.push(KIND[a] + ' ' + m.id + ' menu ' + JSON.stringify(a1) + ' box ' + JSON.stringify(a2));
      k.L('M4 page ' + KIND[a] + ' ' + m.id + ' ' + JSON.stringify(name) + ' menu: status=' + JSON.stringify(a1.st) + ' form=' + (a1.form || '-') + ' | box: ' + (a2 ? 'status=' + JSON.stringify(a2.st) + ' form=' + (a2.form || '-') + ' ' + a2.link : 'NO ROW'));
    }
    if (!pN) k.incon('M4 page', 'VACUOUS: no entry shown'); else k.chk('M4 page: the box row opens what the menu entry opens, one per kind: ' + pX + ' of ' + pN, pX === pN, pMiss.join(' ; '));
    if (P.errs.length) k.L('page errors: ' + P.errs.slice(0, 3).join(' | '));
  } finally { await P.close(); if (tmp) fs.unlinkSync(tmp); }
}

(async function main() {
  if (!H.seedOk()) { k.incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); return k.end(); }
  if (!TASKS_JUDGED) k.incon('M1 T', 'legacy Postgres unreachable: task entries not judged (shown as before)'); else k.L('legacy ad_task_access role=' + ROLE + ' tasks=' + legacyTasks.size);
  nodePart();
  if (!process.env.NOPAGE) await pagePart();
  k.end();
})().catch((e) => { k.out('ERROR ' + (e && e.stack || e)); process.exitCode = 2; });
