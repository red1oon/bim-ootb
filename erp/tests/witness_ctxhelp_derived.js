#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-CTXHELP-DERIVED: bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.19 (derived how-to content, amended 2026-11-23). READ THE LOG after every run.
// Issue it proves or disproves: a how-to topic made from the dictionary, legacy's DocAction source and a recorded legacy run says ONLY what those sources say.
//   D1 coverage, X of N: every pilot window has its derived section on its head tab (the generated rows), with the parts its kind needs; N = the core menu's windows.
//   D2a the run facts are legacy's: a fresh extraction of the recorded log == erp/tools/legacy_run_facts.json.          red DV_BREAK=facts  (one legacy value changed in a copy of the log)
//   D2b the source rules are legacy's: a fresh read of the iDempiere source == erp/tools/legacy_rules.json, and every
//       cited effect line still holds its token, read here from the source file.                                      red DV_BREAK=srcline (a cited line moved by one)
//   D2c the text is traced: every quoted message is a legacy refusal (source or run), every window link names that
//       window as the dictionary does.                                                                                   red DV_BREAK=quote (a made-up message in the text)
//   D3 MATCH only: built from the facts with every verdict flipped to SQLITE-GAP, the text has no ✓ (with the real
//       facts it has some).                                                                                              red DV_BREAK=nogate (the facts not flipped)
//   D4 legacy's reason, not the scenario's name: no scenario id is in any derived text.                                   red DV_BREAK=label
//   D5 fit: every message holding a derived section is <= AD_CtxHelpMsg.MsgText's length, with the derived section WHOLE. red DV_BREAK=long
//   D7 a ✓ only from a run on the window's own side (sales / purchase).                                                red DV_BREAK=side (a sales run cited on Purchase Order)
//   D8 no fixed stop-reason list (§19.21 deletion budget, 2026-11-25): no derived section lists "What can stop Complete", and the builder prints no part=4 fact; the live blockers are the Help panel's peek (W-HELP-PEEK).
//      Vacuous guard: judged = the sections of document windows; 0 of them -> INCONCLUSIVE.                       red DV_BREAK=refuse (a stop-reason paragraph put back in the longest section)
//   D6 fresh: the scenario code the run was made from (sha256 in the facts) == bim-compiler origin/master's; else STALE (INCONCLUSIVE).
// Run: node erp/tests/witness_ctxhelp_derived.js [--log <run.log>] [--src <idempiere>/org.adempiere.base/src]   Env: DV_BREAK=facts|srcline|quote|nogate|label|long|side|refuse
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ERP = path.join(__dirname, '..'), TOOLS = path.join(ERP, 'tools'), BR = process.env.DV_BREAK || '';
const LOG = path.join(ERP, 'tests', 'out', 'witness_ctxhelp_derived.log'); fs.mkdirSync(path.dirname(LOG), { recursive: true }); const lines = [];
const L = (s) => { const l = '§CTXHELP_DERIVED_W ' + s; lines.push(l); console.log(l); };
let fails = 0, incons = 0; const verdicts = [];
const chk = (name, ok, why) => { const v = (ok ? 'PASS ' : 'FAIL ') + name + (ok || !why ? '' : ' :: ' + why); verdicts.push(v); if (!ok) fails++; };
const incon = (name, why) => { verdicts.push('INCONCLUSIVE ' + name + ' :: ' + why); incons++; };
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = process.env.ERP_SEED_DB || path.join(ERP, 'ad_seed.db');
const q = (sql) => { const r = cp.spawnSync('sqlite3', ['-readonly', '-json', SEED, sql], { encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stdout || '[]'); };
const plain = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').split(/\s+/).filter(Boolean).join(' ');

function main() {
  const B = require(path.join(TOOLS, 'build_help_pack.js')), RF = require(path.join(TOOLS, 'run_facts.js')), LR = require(path.join(TOOLS, 'legacy_rules.js'));
  const facts = JSON.parse(fs.readFileSync(path.join(TOOLS, 'legacy_run_facts.json'), 'utf8')), rules = JSON.parse(fs.readFileSync(path.join(TOOLS, 'legacy_rules.json'), 'utf8'));
  const rows = require(path.join(ERP, 'ad_ctxhelp_app_rows.js')), core = B.coreWindows();
  const msgOf = (id) => { const r = rows.rows.find((x) => x.startsWith('INSERT OR IGNORE INTO ad_ctxhelpmsg (') && x.indexOf('VALUES (0, ' + id + ', ' + id + ',') > 0); if (!r) return null; const m = /, '((?:[^']|'')*)', '[^']*', 100\)$/.exec(r); return m ? m[1].replace(/''/g, "'") : null; };
  // ---- the population: every pilot window's derived section as the rows file holds it
  const secs = B.dvWindows().map((w) => { const key = 'DV' + w, link = rows.links.find((x) => x.sections.indexOf(key) >= 0), H = B.headTab(w);
    const msg = link ? msgOf(link.help) : null, title = (q('SELECT name n FROM ad_window WHERE ad_window_id=' + w)[0] || {}).n;
    // the derived section = from its <p><strong>title</strong></p> to the next section's title (or the end / the guide link)
    let html = null; if (msg) { const a = msg.indexOf('<p><strong>' + title + '</strong></p>'); if (a >= 0) { const rest = msg.slice(a + ('<p><strong>' + title + '</strong></p>').length), b = rest.search(/<p><strong>|<p><a href="https?:/); html = b >= 0 ? rest.slice(0, b) : rest; } }
    return { w, key, title, help: link ? link.help : null, onHead: !!(link && H && link.tabs.some((t) => t.tab === Number(H.tab))), doc: H ? !!(rules.classes[H.tn] && (rules.classes[H.tn].docaction || []).length) : null, table: H ? H.tn : null, msg, html }; });
  // the reds break the LONGEST message (a short setup window doubled still fits, so 'long' would not bite there)
  const tgt = secs.filter((x) => x.msg && x.html).reduce((a, b) => (b.msg.length > a.msg.length ? b : a));
  if (BR === 'refuse') tgt.html += '<p><b>What can stop Complete:</b> “Period Closed”.</p>';
  if (BR === 'quote') tgt.html += '<p>“The order is fine, really”</p>';
  if (BR === 'label') tgt.html += '<p>' + facts.scenarios[0].id + '</p>';
  if (BR === 'long') tgt.msg = tgt.msg + tgt.msg;
  secs.filter((s) => !s.onHead || !s.html).forEach((s) => L('section ' + s.key + ' window=' + s.w + ' "' + s.title + '" help=' + s.help + ' on_head_tab=' + s.onHead + ' doc=' + s.doc + ' table=' + s.table + ' chars=' + (s.html || '').length + ' message=' + (s.msg || '').length));

  // ---- D1 coverage
  // the parts a window's SOURCES allow: Do it always; a document's 'What Complete does' when legacy_rules has an effect for its table (the refusal list was removed 2026-11-25, D8)
  const hasEff = (t) => rules.effects.some((e) => e.table === t);
  const need = (s) => ['Do it.'].concat(s.doc && hasEff(s.table) ? ['What Complete does.'] : []);   // §19.21 item 6 wording; the stop-reason list is gone (D8: the peek shows the live blockers)
  const d1 = secs.filter((s) => s.onHead && s.html && need(s).every((h) => s.html.indexOf('<b>' + h) >= 0));
  secs.filter((s) => d1.indexOf(s) < 0).forEach((s) => L('D1 MISSING ' + s.key + ' on_head=' + s.onHead + ' need=' + JSON.stringify(need(s))));
  secs.filter((s) => s.doc && !hasEff(s.table)).forEach((s) => L('D1 VACUOUS ' + s.key + ' part3: no cited effect for ' + s.table));
  L('D1 derived ' + secs.length + ' of ' + core.length + ' core menu windows; documents ' + secs.filter((x) => x.doc).length + '; complete ' + d1.length);
  if (!secs.length) incon('D1', 'VACUOUS: no pilot window'); else chk('D1 every core window has its derived section on its head tab with its parts: ' + d1.length + ' of ' + secs.length + ' (core denominator ' + core.length + ')', d1.length === secs.length, secs.filter((s) => d1.indexOf(s) < 0).map((s) => s.key).join(','));

  // ---- D2a run facts == a fresh extraction of the recorded log
  const logFile = arg('--log', path.join(os.homedir(), '.cache', 'bim_bridge', facts.log));
  if (!fs.existsSync(logFile)) incon('D2a', 'the recorded log ' + facts.log + ' is not on this machine');
  else {
    let text = fs.readFileSync(logFile, 'utf8');
    if (BR === 'facts') text = text.replace(/^(§SCN_DETAIL S1-pos-sale legacy=\{[^\n]*?"shipments_completed":)1/m, '$10');
    const P = RF.parseLog(text); let same = 0; const bad = [];
    facts.scenarios.forEach((s) => { const lg = P.legacy[s.id]; if (lg && JSON.stringify(lg) === JSON.stringify(s.legacy) && P.verdict[s.id] === s.verdict && P.meta[s.id] && P.meta[s.id].table === s.table && P.meta[s.id].doctype === s.doctype) same++; else bad.push(s.id); });
    L('D2a ' + facts.log + ': ' + same + ' of ' + facts.scenarios.length + ' scenarios equal the log (verdict, table/doctype, legacy values)');
    chk('D2a the run facts are the log\'s: ' + same + ' of ' + facts.scenarios.length, facts.scenarios.length > 0 && same === facts.scenarios.length, bad.join(','));
  }
  // ---- D2b source rules == a fresh read of the source; each cited line holds its token (read here)
  const srcDir = arg('--src', path.join(os.homedir(), 'idempiere-dev-setup', 'idempiere', 'org.adempiere.base', 'src'));
  if (!fs.existsSync(srcDir)) incon('D2b', 'the iDempiere source is not at ' + srcDir);
  else {
    const effects = JSON.parse(fs.readFileSync(path.join(TOOLS, 'legacy_effects.json'), 'utf8')).effects, cites = [];
    effects.forEach((e) => { cites.push([e.id, e.file, e.line, e.token]); if (e.rule) cites.push([e.id + '.rule', e.rule.file, e.rule.line, e.rule.token]); if (e.flag) cites.push([e.id + '.flag', e.file, e.flag.line, e.flag.token]); });
    if (BR === 'srcline') cites[0][2]++;
    const badC = cites.filter((c) => (fs.readFileSync(path.join(srcDir, c[1]), 'utf8').split('\n')[c[2] - 1] || '').indexOf(c[3]) < 0).map((c) => c[0] + '@' + c[1].split('/').pop() + ':' + c[2]);
    const tables = Object.keys(rules.classes); let fresh = null, why = '';
    try { const R2 = LR.build(srcDir, rules.legacyDb, tables); fresh = JSON.stringify(R2.classes) === JSON.stringify(rules.classes) && R2.source.head === rules.source.head; if (!fresh) why = 'the committed rules differ from a fresh read'; } catch (e) { why = String(e.message).slice(0, 160); }
    L('D2b cited lines ' + (cites.length - badC.length) + ' of ' + cites.length + ' hold their token; refusals re-read from ' + tables.join(',') + ': ' + (fresh === null ? 'not readable (' + why + ')' : fresh ? 'equal' : 'DIFFER'));
    if (fresh === null && /legacy DB/.test(why)) incon('D2b', why);
    else chk('D2b the source rules are legacy\'s: cited lines ' + (cites.length - badC.length) + ' of ' + cites.length + ', fresh read ' + (fresh ? 'equal' : 'differs'), badC.length === 0 && fresh === true, badC.join(',') + ' ' + why);
  }
  // ---- D2c + D4 + D5 per section, through the witness contract (population, schema, invariants, a red control that must fail)
  const allowed = new Set([].concat(...Object.values(rules.classes).map((c) => (c.refusals || []).map((r) => plain(r.text))), facts.scenarios.filter((s) => s.refusal).map((s) => plain(s.refusal.text))));   // both sides whitespace-normalised (legacy's ' Not found  Invoice')
  const winName = {}; q("SELECT ad_window_id id, name n FROM ad_window").forEach((r) => { winName[r.id] = r.n; });
  const ids = facts.scenarios.map((s) => s.id), MSGLEN = Number((q("SELECT c.fieldlength n FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)='ad_ctxhelpmsg' AND lower(c.columnname)='msgtext'")[0] || {}).n);
  // the builder's fresh derived html is the WHOLE section: the shipped message must hold all of it (a cut one would end at the guide link instead)
  const FRESH = {}; { const lg0 = console.log; console.log = () => {}; try { B.derivedSections(B.dvWindows()).forEach((x) => { FRESH[x.key] = x.html; }); } finally { console.log = lg0; } }
  const judge = (s) => {
    const quotes = (s.html.match(/“([^”]*)”/g) || []).map((x) => plain(x.slice(1, -1)));
    const links = (s.html.match(/<a href="#" data-help-win="(\d+)">([^<]*)<\/a>/g) || []).map((x) => { const m = /data-help-win="(\d+)">([^<]*)</.exec(x); return [Number(m[1]), plain(m[2])]; });
    return { quotesOk: quotes.filter((x) => !allowed.has(x)), linksBad: links.filter((l) => plain(winName[l[0]]) !== l[1]), ids: ids.filter((i) => s.html.indexOf(i) >= 0), fits: s.msg.length <= MSGLEN, whole: !!FRESH[s.key] && plain(s.msg).indexOf(plain(FRESH[s.key])) >= 0, quotes: quotes.length, links: links.length };
  };
  const J = secs.filter((s) => s.html && s.msg).map((s) => Object.assign({ key: s.key }, judge(s)));
  L('D2c/D4/D5 judged ' + J.length + ' sections: quotes ' + J.reduce((a, j) => a + j.quotes, 0) + ', window links ' + J.reduce((a, j) => a + j.links, 0));
  J.filter((j) => j.quotesOk.length || j.linksBad.length || j.ids.length || !j.fits || !j.whole).forEach((j) => L('D2c/D4/D5 ' + j.key + ': quotes ' + j.quotes + ' (not legacy\'s: ' + j.quotesOk.length + '), window links ' + j.links + ' (name differs: ' + j.linksBad.length + '), scenario ids in text ' + j.ids.length + ', message ' + (j.fits ? '<=' : '>') + ' ' + MSGLEN + ', section whole ' + j.whole));
  if (!J.length) incon('D2c/D4/D5', 'VACUOUS: no derived section in the rows file');
  else {
    chk('D2c every quoted message is legacy\'s and every window link names its window: ' + J.filter((j) => !j.quotesOk.length && !j.linksBad.length).length + ' of ' + J.length, J.every((j) => !j.quotesOk.length && !j.linksBad.length), J.map((j) => j.quotesOk.concat(j.linksBad.map((l) => l.join('='))).join('|')).join(' ; '));
    chk('D4 no scenario name in a derived text: ' + J.filter((j) => !j.ids.length).length + ' of ' + J.length, J.every((j) => !j.ids.length), J.map((j) => j.ids.join(',')).join(' '));
    chk('D5 every message with a derived section fits ' + MSGLEN + ' and keeps the section whole: ' + J.filter((j) => j.fits && j.whole).length + ' of ' + J.length, J.every((j) => j.fits && j.whole));
  }
  // ---- D8 no fixed stop-reason list: neither the shipped rows nor the builder's facts carry one
  const listed = secs.filter((s) => s.html && /What can stop Complete|When it refuses/.test(s.html)), docSecs = secs.filter((s) => s.doc && s.html), p4 = (() => { const out = []; const lg2 = console.log; console.log = (m) => { if (/^§CTXHELP_DERIVED_FACT .* part=4 /.test(String(m))) out.push(String(m)); }; try { B.derivedSections(B.dvWindows()); } finally { console.log = lg2; } return out; })();
  L('D8 document sections ' + docSecs.length + ', with a stop-reason list ' + listed.length + ', builder part=4 facts ' + p4.length);
  if (!docSecs.length) incon('D8', 'VACUOUS: no document section judged'); else chk('D8 no fixed stop-reason list in ' + docSecs.length + ' document sections (the peek lists the live blockers): ' + listed.length + ' carry one, ' + p4.length + ' part=4 facts', listed.length === 0 && p4.length === 0, listed.map((s) => s.key).join(','));
  // ---- D3 MATCH only
  const flipped = JSON.parse(JSON.stringify(facts)); if (BR !== 'nogate') flipped.scenarios.forEach((s) => { s.verdict = 'SQLITE-GAP'; });
  // §19.21 item 6: "seen in a legacy run" is no longer a mark in the reader's text (owner: ticks are internal testing); it lives in the builder's own § lines,
  //   §CTXHELP_DERIVED_FACT … runs=<scenario ids>, so D3 counts the facts that cite a run, captured from each build
  const lg = console.log; let real, gap; const capt = (fn) => { const out = []; console.log = (x) => { if (/^§CTXHELP_DERIVED_FACT /.test(String(x))) out.push(String(x)); }; try { fn(); } finally { console.log = lg; } return out; };
  const realF = capt(() => { real = B.derivedSections(B.dvWindows()); }), gapF = capt(() => { gap = B.derivedSections(B.dvWindows(), { facts: flipped }); });
  const proved = { real: realF.filter((l) => !/ runs=-$/.test(l)).length, gap: gapF.filter((l) => !/ runs=-$/.test(l)).length }, ticks = (a) => (a === real ? proved.real : proved.gap);
  L('D3 marks ✓ with the real facts ' + ticks(real) + ', with every verdict flipped to SQLITE-GAP ' + ticks(gap));
  if (ticks(real) === 0) incon('D3', 'VACUOUS: no ✓ even with the real facts'); else chk('D3 a SQLITE-GAP scenario proves nothing: ' + ticks(gap) + ' ✓ left of ' + ticks(real), ticks(gap) === 0);
  // ---- D7 a ✓ comes from a run on the window's OWN side: every run the builder cites for a window (its §CTXHELP_DERIVED_FACT runs=) has a doc type with the window's IsSOTrx
  const facLines = []; { const lg1 = console.log; console.log = (m) => { if (/^§CTXHELP_DERIVED_FACT /.test(String(m))) facLines.push(String(m)); }; try { B.derivedSections(B.dvWindows()); } finally { console.log = lg1; } }
  if (BR === 'side') facLines.push('§CTXHELP_DERIVED_FACT window=181 part=4 "Period Closed" src=run runs=S8c-pos-sale-beyond-open-future');   // red: a sales run ticking Purchase Order
  const soOf = {}; q('SELECT ad_window_id w, issotrx s FROM ad_window').forEach((r) => { soOf[r.w] = r.s; }); const dtSo = {}; q('SELECT c_doctype_id d, issotrx s FROM c_doctype').forEach((r) => { dtSo[r.d] = r.s; });
  const scDt = {}; facts.scenarios.forEach((x) => { scDt[x.id] = x.doctype; });
  let cites = 0; const wrong = [];
  facLines.forEach((l) => { const m = /window=(\d+) .* runs=(\S+)$/.exec(l); if (!m || m[2] === '-') return; m[2].split(',').forEach((id) => { cites++; const d = scDt[id]; if (d != null && dtSo[d] != null && dtSo[d] !== soOf[m[1]]) wrong.push(m[1] + ':' + id); }); });
  L('D7 run citations ' + cites + ', from the other side ' + wrong.length + (wrong.length ? ' (' + wrong.slice(0, 5).join(' ') + ')' : ''));
  if (!cites) incon('D7', 'VACUOUS: no run cited'); else chk('D7 every ✓ comes from a run on the window\'s own side: ' + (cites - wrong.length) + ' of ' + cites, !wrong.length, wrong.slice(0, 5).join(' '));

  // ---- D6 fresh: the scenario code of the run == bim-compiler origin/master's
  const bc = path.join(os.homedir(), 'bim-compiler'), d6 = Object.keys(facts.sources).map((f) => { const r = cp.spawnSync('git', ['-C', bc, 'show', 'origin/master:scripts/bridge/' + f], { maxBuffer: 1 << 26 });
    return [f, r.status === 0 ? require('crypto').createHash('sha256').update(r.stdout).digest('hex') === facts.sources[f] : null]; });
  L('D6 run sources vs bim-compiler origin/master: ' + d6.map((x) => x[0] + '=' + (x[1] === null ? 'unreadable' : x[1] ? 'same' : 'CHANGED')).join(' '));
  if (d6.some((x) => x[1] !== true)) incon('D6', 'STALE or unreadable: the scenario code differs from the run\'s (' + d6.filter((x) => x[1] !== true).map((x) => x[0]).join(',') + '); re-run the parallel run and run_facts.js');
  else chk('D6 the run was made from today\'s scenario code (' + d6.length + ' of ' + d6.length + ' files)', true);

  verdicts.forEach((v) => L(v));
  const verdict = fails ? 'FAIL' : incons ? 'INCONCLUSIVE' : 'PASS';
  L('§WITNESS_CTXHELP_DERIVED ' + verdict + ' pass=' + (verdicts.length - fails - incons) + ' fail=' + fails + ' inconclusive=' + incons + (BR ? ' DV_BREAK=' + BR : ''));
  fs.writeFileSync(LOG, lines.join('\n') + '\n');
  process.exit(fails ? 1 : 0);
}
main();
