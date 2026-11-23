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
//   D6 fresh: the scenario code the run was made from (sha256 in the facts) == bim-compiler origin/master's; else STALE (INCONCLUSIVE).
// Run: node erp/tests/witness_ctxhelp_derived.js [--log <run.log>] [--src <idempiere>/org.adempiere.base/src]   Env: DV_BREAK=facts|srcline|quote|nogate|label|long
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
  const secs = B.DV_PILOT.map((w) => { const key = 'DV' + w, link = rows.links.find((x) => x.sections.indexOf(key) >= 0), H = B.headTab(w);
    const msg = link ? msgOf(link.help) : null, title = (q('SELECT name n FROM ad_window WHERE ad_window_id=' + w)[0] || {}).n;
    // the derived section = from its <p><strong>title</strong></p> to the next section's title (or the end / the guide link)
    let html = null; if (msg) { const a = msg.indexOf('<p><strong>' + title + '</strong></p>'); if (a >= 0) { const rest = msg.slice(a + ('<p><strong>' + title + '</strong></p>').length), b = rest.search(/<p><strong>|<p><a href="https?:/); html = b >= 0 ? rest.slice(0, b) : rest; } }
    return { w, key, title, help: link ? link.help : null, onHead: !!(link && H && link.tabs.some((t) => t.tab === Number(H.tab))), doc: H ? B.isDoc(H.tb) : null, table: H ? H.tn : null, msg, html }; });
  if (BR === 'quote') secs[0].html += '<p>“The order is fine, really”</p>';
  if (BR === 'label') secs[0].html += '<p>' + facts.scenarios[0].id + '</p>';
  if (BR === 'long') secs[0].msg = secs[0].msg + secs[0].msg;
  secs.forEach((s) => L('section ' + s.key + ' window=' + s.w + ' "' + s.title + '" help=' + s.help + ' on_head_tab=' + s.onHead + ' doc=' + s.doc + ' table=' + s.table + ' chars=' + (s.html || '').length + ' message=' + (s.msg || '').length));

  // ---- D1 coverage
  const need = (s) => s.doc ? ['Before you start.', 'Do it.', 'What Complete does.', 'When it refuses'] : ['Do it.'];
  const d1 = secs.filter((s) => s.onHead && s.html && need(s).every((h) => s.html.indexOf('<b>' + h) >= 0) && (s.doc || /<b>(Before you start|Needed by)\.<\/b>/.test(s.html)));
  L('D1 derived ' + secs.length + ' of ' + core.length + ' core menu windows (pilot); judged ' + secs.length + ', complete ' + d1.length);
  if (!secs.length) incon('D1', 'VACUOUS: no pilot window'); else chk('D1 every pilot window has its derived section on its head tab with its parts: ' + d1.length + ' of ' + secs.length + ' (core denominator ' + core.length + ')', d1.length === secs.length, secs.filter((s) => d1.indexOf(s) < 0).map((s) => s.key).join(','));

  // ---- D2a run facts == a fresh extraction of the recorded log
  const logFile = arg('--log', path.join(os.homedir(), '.cache', 'bim_bridge', facts.log));
  if (!fs.existsSync(logFile)) incon('D2a', 'the recorded log ' + facts.log + ' is not on this machine');
  else {
    let text = fs.readFileSync(logFile, 'utf8');
    if (BR === 'facts') text = text.replace(/^(§SCN_DETAIL S1-pos-sale legacy=\{[^\n]*?"shipments_completed":)1/m, '$10');
    const P = RF.parseLog(text); let same = 0; const bad = [];
    facts.scenarios.forEach((s) => { const lg = P.legacy[s.id]; if (lg && JSON.stringify(lg) === JSON.stringify(s.legacy) && P.verdict[s.id] === s.verdict && JSON.stringify(P.meta[s.id]) === JSON.stringify({ table: s.table, doctype: s.doctype })) same++; else bad.push(s.id); });
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
  const allowed = new Set([].concat(...Object.values(rules.classes).map((c) => (c.refusals || []).map((r) => r.text)), facts.scenarios.filter((s) => s.refusal).map((s) => s.refusal.text)));
  const winName = {}; q("SELECT ad_window_id id, name n FROM ad_window").forEach((r) => { winName[r.id] = r.n; });
  const ids = facts.scenarios.map((s) => s.id), MSGLEN = Number((q("SELECT c.fieldlength n FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)='ad_ctxhelpmsg' AND lower(c.columnname)='msgtext'")[0] || {}).n);
  // the builder's fresh derived html is the WHOLE section: the shipped message must hold all of it (a cut one would end at the guide link instead)
  const FRESH = {}; { const lg0 = console.log; console.log = () => {}; try { B.derivedSections(B.DV_PILOT).forEach((x) => { FRESH[x.key] = x.html; }); } finally { console.log = lg0; } }
  const judge = (s) => {
    const quotes = (s.html.match(/“([^”]*)”/g) || []).map((x) => plain(x.slice(1, -1)));
    const links = (s.html.match(/<a href="#" data-help-win="(\d+)">([^<]*)<\/a>/g) || []).map((x) => { const m = /data-help-win="(\d+)">([^<]*)</.exec(x); return [Number(m[1]), plain(m[2])]; });
    return { quotesOk: quotes.filter((x) => !allowed.has(x)), linksBad: links.filter((l) => plain(winName[l[0]]) !== l[1]), ids: ids.filter((i) => s.html.indexOf(i) >= 0), fits: s.msg.length <= MSGLEN, whole: !!FRESH[s.key] && plain(s.msg).indexOf(plain(FRESH[s.key])) >= 0, quotes: quotes.length, links: links.length };
  };
  const J = secs.filter((s) => s.html && s.msg).map((s) => Object.assign({ key: s.key }, judge(s)));
  J.forEach((j) => L('D2c/D4/D5 ' + j.key + ': quotes ' + j.quotes + ' (not legacy\'s: ' + j.quotesOk.length + '), window links ' + j.links + ' (name differs: ' + j.linksBad.length + '), scenario ids in text ' + j.ids.length + ', message ' + (j.fits ? '<=' : '>') + ' ' + MSGLEN + ', section whole ' + j.whole));
  if (!J.length) incon('D2c/D4/D5', 'VACUOUS: no derived section in the rows file');
  else {
    chk('D2c every quoted message is legacy\'s and every window link names its window: ' + J.filter((j) => !j.quotesOk.length && !j.linksBad.length).length + ' of ' + J.length, J.every((j) => !j.quotesOk.length && !j.linksBad.length), J.map((j) => j.quotesOk.concat(j.linksBad.map((l) => l.join('='))).join('|')).join(' ; '));
    chk('D4 no scenario name in a derived text: ' + J.filter((j) => !j.ids.length).length + ' of ' + J.length, J.every((j) => !j.ids.length), J.map((j) => j.ids.join(',')).join(' '));
    chk('D5 every message with a derived section fits ' + MSGLEN + ' and keeps the section whole: ' + J.filter((j) => j.fits && j.whole).length + ' of ' + J.length, J.every((j) => j.fits && j.whole));
  }
  // ---- D3 MATCH only
  const flipped = JSON.parse(JSON.stringify(facts)); if (BR !== 'nogate') flipped.scenarios.forEach((s) => { s.verdict = 'SQLITE-GAP'; });
  const lg = console.log; let real, gap; console.log = () => {}; try { real = B.derivedSections(B.DV_PILOT); gap = B.derivedSections(B.DV_PILOT, { facts: flipped }); } finally { console.log = lg; }
  const ticks = (a) => a.reduce((n, s) => n + (s.html.match(/✓/g) || []).length - (s.html.match(/✓ = seen/g) || []).length, 0);
  L('D3 marks ✓ with the real facts ' + ticks(real) + ', with every verdict flipped to SQLITE-GAP ' + ticks(gap));
  if (ticks(real) === 0) incon('D3', 'VACUOUS: no ✓ even with the real facts'); else chk('D3 a SQLITE-GAP scenario proves nothing: ' + ticks(gap) + ' ✓ left of ' + ticks(real), ticks(gap) === 0);
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
