#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-CTXHELP-OVERLAY (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.16 C1). READ THE LOG after every run: every verdict is a § line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: the twin had legacy's Context Help window (200034) and its dictionary, but no AD_CtxHelp / AD_CtxHelpMsg / AD_CtxHelpMsg_Trl / AD_CtxHelpSuggestion
//   table. (AD_Task / AD_Task_Access and the AD_CtxHelp_ID link columns come with seed + hashed patch; K1 still judges them, the twin DB is what must equal legacy.)
//   K1 after ad_ctxhelp_overlay.js ensure(): each of the 6 tables' columns == legacy's information_schema list and its row count == legacy's count; each legacy table with
//      AD_CtxHelp_ID that the seed has carries the column. ORACLE = legacy Postgres read HERE (docker exec postgres psql), never the rows file; unreachable -> INCONCLUSIVE.
//   K2 idempotent: a second ensure() adds 0 rows, 0 tables, 0 columns, and no key repeats.
//   K3 end of the chain, the REAL page (idempiere.html, GardenAdmin): the menu entry "Context Help" opens window 200034 and its first tab shows legacy's row (its name).
//   K5 the Team BASE does not move: the seed + its two hashed patches hash (team_sync.js hashBase manifest, rebuilt here) the same on this tree as on origin/main.
//   §19.16 C2 (amended K1/K2/K3, new K6): the app's own how-to rows (ad_ctxhelp_app_rows.js, from the user guide) are ADDED to legacy's, never in place of them:
//   K1 each legacy row is in the twin with equal values, the twin's other rows are exactly the app file's (id >= 1000000, client 0); K2 an edited app message survives a second
//   ensure; K6 LEGACY's lookup (MCtxHelpMsg.getCtxHelpID for CTXTYPE_Tab + get's message query, ported as SQL) finds each how-to on its window's first tab, and its text == the
//   guide section's own paragraphs, read HERE from the guide; K3 the page's Find window counts legacy's + the app's rows and shows every name.
//   §19.16 C3 (new K7): the translations in legacy's own table: every TRANSLATED published AD_CtxHelpMsg_Trl row of the packs (i18n_sources.json, read HERE) is a twin row with the
//   pack's text; every machine row (erp/i18n/machine/AD_CtxHelpMsg_Trl_<lang>.xml) is a twin row, linked, IsTranslated N; none shadows a published row; each language's help.json
//   how-to (name + html) is unchanged against origin/main (the JSON -> XML move lost nothing). Reds C3: CTX_BREAK=nomachine -> K7 FAIL; CTX_BREAK=pubtext -> K7 FAIL.
//   §19.17 F5 (K6 / K7 / K8 widened): the SECOND guide, docs/ERP_FirstSetup.md, at TAB level. Legacy shows ONE message per tab / process, so a target named by several sections
//   holds them in ONE message, in source order, each under its own heading. K6's denominator = every tab / process the spec's mapping (build_help_pack.js SECTIONS) names;
//   K7: a machine row translates one SECTION, the twin row is built section by section (English where no translation: nothing vanishes on a translated screen);
//   K8: the reader returns every help, also one that sits only on a SUB tab. Red F5: CTX_BREAK=nosetup (the rows file before the setup guide) -> K6 FAIL on its targets.
//   §19.16 C5 (K9): a tenant admin types their own message in the Context Help window; with no reload, and after one, the help box shows it (their row first, legacy's client order).
//   Reds C2: CTX_BREAK=nolink (the app file without its AD_Tab updates) -> K6 FAIL; CTX_BREAK=dropsec (one how-to dropped) -> K6 FAIL.
// Reds: CTX_BREAK=nomsg (the rows file without its ad_ctxhelpmsg row) -> K1 FAIL; CTX_BREAK=patch (one line appended to the hashed patch) -> K5 FAIL; CTX_BREAK=nooverlay (page without the overlay) -> K3 FAIL.
// Run: node erp/tests/witness_ctxhelp_overlay.js   Env: CTX_BREAK=nomsg|patch|nooverlay|nolink|noproc|dropsec|nosetup|nomachine|pubtext|rawseed|nolisten|nowait|noclientorder  NOPAGE=1  ONLYEDIT=1 (K9 alone)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ERP = path.join(__dirname, '..'), ROOT = path.join(ERP, '..'), BR = process.env.CTX_BREAK || '';
const H = require(path.join(ROOT, 'common', 'help', 'tests', '_hq.js'));
let initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
const LOGD = path.join(__dirname, 'logs'); fs.mkdirSync(LOGD, { recursive: true });
const LOGF = path.join(LOGD, 'w_ctxhelp_overlay' + (BR ? '_break_' + BR : '') + '.log'); fs.writeFileSync(LOGF, '');
const out = (m) => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
const K = { pass: 0, fail: 0, inc: 0 };
const chk = (n, ok, info) => { ok ? K.pass++ : K.fail++; out('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + n + (info ? '  ' + info : '')); };
const incon = (id, why) => { K.inc++; out('§CTXHELP_OVERLAY INCONCLUSIVE ' + id + ' — ' + why); };
const L = (m) => out('§CTXHELP_OVERLAY ' + m);
const PG = (sql) => { const r = cp.spawnSync('docker', ['exec', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere', '-At', '-F', '|', '-c', 'set search_path=adempiere; ' + sql], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) return null; return r.stdout.split('\n').filter((x) => x && x !== 'SET'); };
const TABLES = ['ad_ctxhelp', 'ad_ctxhelpmsg', 'ad_ctxhelpmsg_trl', 'ad_ctxhelpsuggestion', 'ad_task', 'ad_task_access'];
const exec1 = (db, sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
const colsOf = (db, t) => exec1(db, 'PRAGMA table_info("' + t + '")').map((v) => String(v[1]).toLowerCase());

function rowsData() {   // the overlay's data; CTX_BREAK=nomsg drops the ad_ctxhelpmsg row (the red)
  const D = JSON.parse(JSON.stringify(require(path.join(ERP, 'ad_ctxhelp_rows.js'))));
  if (BR === 'nomsg') D.rows = D.rows.filter((s) => !/^INSERT OR IGNORE INTO ad_ctxhelpmsg /.test(s));
  return D;
}
function appData() {   // the app's how-to rows; CTX_BREAK=nolink drops the AD_Tab links, dropsec drops the last how-to (its 2 rows + its link)
  const A = JSON.parse(JSON.stringify(require(path.join(ERP, 'ad_ctxhelp_app_rows.js'))));
  if (BR === 'nolink') A.rows = A.rows.filter((s) => !/^UPDATE ad_tab /.test(s));
  if (BR === 'noproc') A.rows = A.rows.filter((s) => !/^UPDATE ad_process /.test(s));   // §19.17 F1: the process targets (CtxType P) lose their link
  if (BR === 'nomachine') A.rows = A.rows.filter((s) => !/^INSERT OR IGNORE INTO ad_ctxhelpmsg_trl \(ad_client_id, ad_ctxhelpmsg_id, [^)]*\) VALUES \(0, 1\d{6},/.test(s));
  if (BR === 'dropsec') { const last = A.links.pop(); A.rows = A.rows.filter((s) => s.indexOf(String(last.help)) < 0); }
  if (BR === 'nosetup') {   // §19.17 F5: the rows file as it was before the setup guide (main at C4, 56f54c87): the setup guide's tabs / processes lose their sections
    const f = path.join(require('os').tmpdir(), 'ctx_nosetup_' + process.pid + '.js'); fs.writeFileSync(f, cp.execSync('git show ' + (process.env.NOSETUP_REF || '56f54c87') + ':erp/ad_ctxhelp_app_rows.js', { cwd: ROOT, maxBuffer: 1 << 26, encoding: 'utf8' }));
    try { return JSON.parse(JSON.stringify(require(f))); } finally { fs.unlinkSync(f); }
  }
  return A;
}
const APP_ID0 = 1000000;
const norm = (x) => String(x == null ? '' : x).replace(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d:\d\d).*$/, '$1 $2').replace(/\.0+$/, '');
const plain = (h) => String(h || '').replace(/<\/(p|li)>|<(ul|ol)>/g, ' ').replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e])).split(/\s+/).filter(Boolean).join(' ');
const headingText = (h) => h.replace(/^#+\s*/, '').replace(/\*([^*]+)\*/g, '$1');
function guideSection(guide, heading, doc) {   // a guide's own text under its heading, read here, not from the builder. Left out: proof asides (the user guide's `> ...`, the setup guide's *(Verified ...)*), pictures, rules; list and sub-heading marks and markdown marks removed
  const lines = guide.split('\n'), at = lines.indexOf(heading); if (at < 0) return null;
  const body = []; for (let i = at + 1; i < lines.length && !/^#{1,3} /.test(lines[i]); i++) body.push(lines[i]);
  let t = body.join('\n'); if (doc === 'FS') t = t.replace(/\*\(Verified[\s\S]*?\)\*/g, '').split('\n').filter((l) => !/^\s*!\[/.test(l) && !/^---\s*$/.test(l)).join('\n');
  return t.split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('>')).map((x) => x.replace(/^\s*(- |\d+\. |#### )/gm, '')
    .replace(/`([^`]+)`/g, (m, c) => c.replace(/\*/g, '\u0001')).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/\u0001/g, '*')).join(' ').split(/\s+/).filter(Boolean).join(' ');
}
function baseHash(seedBuf, patchTexts) {   // team_sync.js:173-176 hashBase, rebuilt in node: seed sha256 + size, then each patch by position
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  let man = 'seed ' + sha(seedBuf) + ' ' + seedBuf.length + '\n'; patchTexts.forEach((t, i) => { man += '--patch ' + i + (t == null ? ' MISSING' : '\n' + t) + '\n'; });
  return sha(Buffer.from(man, 'utf8'));
}

async function nodePart() {
  const SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(H.SEED)));
  let ok = 0, bad = 0;
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach((st) => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); ok++; } catch (e) { bad++; } });
  L('seed + patches/ad_seed.db.sql statements ok=' + ok + ' failed=' + bad + ' break=' + (BR || 'none'));
  const before = TABLES.filter((t) => colsOf(db, t).length);
  L('before the overlay: tables present ' + before.length + ' of ' + TABLES.length + ' (' + (before.join(',') || 'none') + ')');
  const O = require(path.join(ERP, 'ad_ctxhelp_overlay.js')), D = rowsData();
  global.AD_CTXHELP_ROWS = D; const A = appData(); global.AD_CTXHELP_APP_ROWS = A;
  const appCount = (t) => A.rows.filter((s) => s.indexOf('INSERT OR IGNORE INTO ' + t + ' (') === 0).length;
  const lg = console.log; let line = ''; console.log = (m) => { line = String(m); }; const r1 = O.ensure(db); console.log = lg; L('first ' + line);
  // K1 against legacy, read here
  const legacyCols = PG("select table_name, string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='adempiere' and table_name in ('" + TABLES.join("','") + "') group by 1");
  if (!legacyCols) incon('K1', 'legacy Postgres unreachable (docker exec postgres)');
  else {
    const lc = {}; legacyCols.forEach((x) => { const p = x.split('|'); lc[p[0]] = p[1]; });
    let colOk = 0, cntOk = 0; const miss = [];
    TABLES.forEach((t) => {
      const mine = colsOf(db, t).join(','), want = lc[t] || '';
      if (mine === want && want) colOk++; else miss.push(t + ' columns differ');
      const lcnt = Number((PG('select count(*) from ' + t) || ['-1'])[0]), tcnt = Number(exec1(db, 'SELECT count(*) FROM ' + t)[0][0]);
      L('K1 ' + t + ' columns=' + colsOf(db, t).length + ' legacy=' + want.split(',').length + ' rows twin=' + tcnt + ' legacy=' + lcnt);
      if (lcnt >= 0 && tcnt === lcnt + appCount(t)) cntOk++; else miss.push(t + ' rows ' + tcnt + ' != legacy ' + lcnt + ' + app ' + appCount(t));
    });
    // each legacy row of the 4 context-help tables is in the twin with equal values (by key); the twin's other rows are the app's (id >= 1000000, client 0)
    let rowN = 0, rowEq = 0, extra = 0, extraOk = 0;
    D.tables.forEach((T) => {
      const lj = PG('select coalesce(json_agg(x), \'[]\') from ' + T.t + ' x'), lrows = lj ? JSON.parse(lj[0]) : [], key = (o) => T.pk.map((k) => String(o[k])).join('|'), lkeys = {};
      lrows.forEach((o) => { rowN++; lkeys[key(o)] = 1; const r = db.exec('SELECT * FROM ' + T.t + ' WHERE ' + T.pk.map((k) => k + '=?').join(' AND '), T.pk.map((k) => o[k]))[0];
        const tw = r ? Object.fromEntries(r.columns.map((c, i) => [c.toLowerCase(), r.values[0][i]])) : null;
        const diff = tw ? T.cols.filter((c) => norm(tw[c]) !== norm(o[c])) : ['missing'];
        if (!diff.length) rowEq++; else miss.push(T.t + ' ' + key(o) + ' differs: ' + diff.join(',')); });
      const tr = db.exec('SELECT ' + T.pk.join(',') + ', ad_client_id FROM ' + T.t)[0];
      (tr ? tr.values : []).forEach((v) => { const k = v.slice(0, T.pk.length).map(String).join('|'); if (lkeys[k]) return; extra++; if (Number(v[v.length - 1]) === 0) extraOk++; else miss.push(T.t + ' extra row ' + k + ' not client 0'); });   // which rows: the count check (twin == legacy + app) already says they are the app file's
    });
    L('K1 legacy rows equal ' + rowEq + ' of ' + rowN + '; twin-only rows ' + extra + ', client 0 ' + extraOk);
    const linkT = PG("select table_name from information_schema.columns where table_schema='adempiere' and column_name='ad_ctxhelp_id' and table_name not in ('" + TABLES.join("','") + "') order by 1") || [];
    const seedHas = linkT.filter((t) => colsOf(db, t).length), linkOk = seedHas.filter((t) => colsOf(db, t).indexOf('ad_ctxhelp_id') >= 0);
    L('K1 link column ad_ctxhelp_id: legacy tables ' + linkT.length + ', in the seed ' + seedHas.length + ', carry it ' + linkOk.length + ' (' + seedHas.filter((t) => linkOk.indexOf(t) < 0).join(',') + ' missing)');
    chk('K1 the overlay is legacy\'s + the app\'s: columns ' + colOk + ' of 6, row counts (legacy + app) ' + cntOk + ' of 6, legacy rows equal ' + rowEq + ' of ' + rowN + ', twin-only rows client 0 ' + extraOk + ' of ' + extra + ', link column ' + linkOk.length + ' of ' + seedHas.length,
      colOk === 6 && cntOk === 6 && rowN > 0 && rowEq === rowN && extraOk === extra && seedHas.length > 0 && linkOk.length === seedHas.length, miss.join(' ; '));
  }
  // K2 idempotent
  const EDIT = 'edited by a tenant admin (W-CTXHELP-OVERLAY K2)'; db.run('UPDATE ad_ctxhelpmsg SET msgtext=? WHERE ad_ctxhelpmsg_id=?', [EDIT, APP_ID0]);
  console.log = (m) => { line = String(m); }; const r2 = O.ensure(db); console.log = lg; L('second ' + line);
  const kept = (exec1(db, 'SELECT msgtext FROM ad_ctxhelpmsg WHERE ad_ctxhelpmsg_id=' + APP_ID0)[0] || [])[0] === EDIT; L('K2 edited app message ' + APP_ID0 + ' kept after the second ensure: ' + kept);
  const keys = D.tables.map((T) => { const n = Number(exec1(db, 'SELECT count(*) FROM ' + T.t)[0][0]), d = Number(exec1(db, 'SELECT count(*) FROM (SELECT DISTINCT ' + T.pk.join(',') + ' FROM ' + T.t + ')')[0][0]); return { t: T.t, n, d }; });
  const dup = keys.filter((x) => x.n !== x.d);
  chk('K2 a second ensure adds nothing: rows=' + r2.rows + ' tables=' + r2.tables + ', key repeats in ' + dup.length + ' of ' + keys.length + ' tables (first run added rows=' + r1.rows + ' app=' + r1.app + ')',
    r2.rows === 0 && r2.app === 0 && r2.tables === 0 && dup.length === 0 && r1.rows > 0 && r1.app > 0 && kept, dup.map((x) => x.t).join(',') + (kept ? '' : ' edit overwritten'));
  // K6 legacy's own lookup finds, on every tab / process the two guides' sections name, ONE message holding those sections in source order (fresh db, one ensure)
  const db6 = new SQL.Database(new Uint8Array(fs.readFileSync(H.SEED)));
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach((st) => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) { try { db6.run(st); } catch (e) {} } });
  console.log = () => {}; O.ensure(db6); console.log = lg;
  const CLIENT = 11, ORG = 0, full = require(path.join(ERP, 'ad_ctxhelp_app_rows.js')).links;   // the generated file's helps, not the (maybe broken) applied set
  const SRC = require(path.join(ERP, 'tools', 'build_help_pack.js')), docs = {};
  Object.keys(SRC.DOCS).forEach((d) => { try { docs[d] = cp.execSync('git -C ' + JSON.stringify(path.join(require('os').homedir(), 'bim-compiler')) + ' show origin/master:' + SRC.DOCS[d].file, { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) {} });
  const helpOf = (kind, id) => (full.find((x) => kind === 'T' ? x.tabs.some((y) => y.tab === id) : x.processes.indexOf(id) >= 0) || {});
  if (Object.keys(SRC.DOCS).some((d) => !docs[d])) incon('K6', 'a source guide (bim-compiler origin/master ' + Object.keys(SRC.DOCS).filter((d) => !docs[d]).map((d) => SRC.DOCS[d].file).join(', ') + ') not readable');
  else {
    // the DENOMINATOR is the spec's mapping (build_help_pack.js SECTIONS: section -> windows / tabs / processes), resolved HERE against the page DB; the text is read HERE from the guides
    const firstTab = (w) => Number((exec1(db6, 'SELECT ad_tab_id FROM ad_tab WHERE ad_window_id=' + Number(w) + " AND tablevel=0 AND isactive='Y' ORDER BY seqno, ad_tab_id LIMIT 1")[0] || [])[0]);
    const byTarget = {}, order = [], secN = {}, secOk = {};
    SRC.SECTIONS.forEach((s) => {
      const tabs = (s.doc === 'UG' ? [s.window].concat(s.also || []) : [s.window]).filter((w) => w != null).map(firstTab).concat(s.tabs || []);
      tabs.map((t) => 'T' + t).concat((s.process || []).map((p) => 'P' + p)).forEach((k) => { if (!byTarget[k]) { byTarget[k] = []; order.push(k); } byTarget[k].push(s); });
      secN[s.key] = 0; secOk[s.key] = 0;
    });
    let tN = 0, found = 0, same = 0, typeOk = 0; const bad = [];
    const lookup = (table, col, rid) =>   // MCtxHelpMsg.getCtxHelpID (MCtxHelpMsg.java:170-204): CTXTYPE_Tab -> AD_Tab, CTXTYPE_Process -> AD_Process; no CtxType filter
      (exec1(db6, 'SELECT t.AD_CtxHelp_ID FROM ' + table + " t, AD_CtxHelp h WHERE t.AD_CtxHelp_ID=h.AD_CtxHelp_ID AND t.IsActive='Y' AND h.IsActive='Y' AND h.AD_Client_ID IN (0, " + CLIENT + ") AND h.AD_Org_ID IN (0, " + ORG + ') AND t.' + col + '=' + rid + ' ORDER BY h.AD_Client_ID DESC, h.AD_Org_ID DESC, h.AD_CtxHelp_ID DESC')[0] || [])[0];
    order.forEach((k) => {
      const kind = k[0], rid = Number(k.slice(1)), secs = byTarget[k], what = (kind === 'T' ? 'tab ' : 'process ') + rid + ' [' + secs.map((s) => s.key).join('+') + ']';
      const hid = kind === 'T' ? lookup('AD_Tab', 'AD_Tab_ID', rid) : lookup('AD_Process', 'AD_Process_ID', rid), exp = helpOf(kind, rid);
      // each section = its heading then its own paragraphs (C3: the heading is a <p><strong> paragraph), in source order: the standard flow first, then the setup guide
      const parts = secs.map((s) => { const t = guideSection(docs[s.doc], s.heading, s.doc); return t == null ? null : (headingText(s.heading) + ' ' + t).trim(); }), want = parts.indexOf(null) >= 0 ? null : parts.join(' ');
      tN++; secs.forEach((s) => { secN[s.key]++; });
      // MCtxHelpMsg.get: the message (MCtxHelpMsg.java:96-100)
      const msg = hid ? (exec1(db6, "SELECT msgtext FROM AD_CtxHelpMsg WHERE IsActive = 'Y' AND AD_Client_ID IN (0, " + CLIENT + ")  AND AD_Org_ID IN (0, " + ORG + ")  AND AD_CtxHelp_ID = " + hid + ' ORDER BY AD_Client_ID DESC, AD_Org_ID DESC, AD_CtxHelpMsg_ID DESC')[0] || [])[0] : null;
      const ct = hid ? (exec1(db6, 'SELECT ctxtype FROM ad_ctxhelp WHERE ad_ctxhelp_id=' + hid)[0] || [])[0] : null, got = plain(msg);
      if (msg && Number(hid) === exp.help) found++; else bad.push(what + ': ' + (msg ? 'another help ' + hid : 'no message'));
      if (msg && want && got === want) { same++; secs.forEach((s) => { secOk[s.key]++; }); } else if (msg) bad.push(what + ' text differs from the guides (' + got.length + ' vs ' + (want || '').length + ' chars)');
      if (exp.help != null && ct === (exp.tabs.length ? 'T' : 'P')) typeOk++;
      L('K6 ' + what + ' -> help ' + (hid || 'none') + ' ctxtype=' + ct + ' text ' + (msg ? (got === want ? '== guides' : 'DIFFERS') : 'none') + ' ' + got.length + ' chars "' + got.slice(0, 50) + '"');
    });
    const sK = Object.keys(secN), sOk = sK.filter((x) => secN[x] > 0 && secOk[x] === secN[x]), byDoc = (d) => SRC.SECTIONS.filter((s) => s.doc === d);
    L('K6 sections on every one of their targets: ' + Object.keys(SRC.DOCS).map((d) => SRC.DOCS[d].file + ' ' + byDoc(d).filter((s) => sOk.indexOf(s.key) >= 0).length + ' of ' + byDoc(d).length).join(', '));
    chk('K6 legacy\'s lookup finds the help of ' + found + ' of ' + tN + ' targets (tabs + processes named by ' + sK.length + ' sections of the two guides), its text == those sections\' own text in source order ' + same + ' of ' + tN + ', CtxType right ' + typeOk + ' of ' + tN + '; sections whole on all their targets ' + sOk.length + ' of ' + sK.length,
      tN > 0 && found === tN && same === tN && typeOk === tN && sOk.length === sK.length, bad.join(' ; '));
  }
  // K7 the translations (C3), on db6
  {
    const CACHE = SRC.CACHE, langs = Object.keys(SRC.SOURCES);
    if (BR === 'pubtext') db6.run("UPDATE ad_ctxhelpmsg_trl SET msgtext=(SELECT msgtext FROM ad_ctxhelpmsg WHERE ad_ctxhelpmsg_id=200000) WHERE ad_ctxhelpmsg_id=200000 AND ad_language='de_DE'");
    const readX = (f) => { const o = {}; if (!fs.existsSync(f)) return o; const x = fs.readFileSync(f, 'utf8'), re = /<row id="(\d+)"[^>]*>([\s\S]*?)<\/row>/g; let m;   // read HERE (not the builder's reader): CDATA or escaped text
      const de = (t) => t.replace(/&#10;/g, '\n').replace(/&#13;/g, '\r').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      while ((m = re.exec(x))) { const v = /<value column="MsgText"[^>]*?original="([^"]*)"[^>]*?(?:\/>|>([\s\S]*?)<\/value>)/.exec(m[2]); if (!v) continue; const b = v[2] || '', cd = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(b); o[m[1]] = { orig: de(v[1]), text: cd ? cd[1] : de(b) }; }
      return o; };
    const tw = (id, lang) => { const r = db6.exec('SELECT msgtext, istranslated FROM ad_ctxhelpmsg_trl WHERE ad_ctxhelpmsg_id=? AND ad_language=?', [Number(id), lang])[0]; return r ? { text: r.values[0][0], it: r.values[0][1] } : null; };
    const msgs = {}; exec1(db6, 'SELECT ad_ctxhelpmsg_id, msgtext FROM ad_ctxhelpmsg').forEach((v) => { msgs[v[0]] = String(v[1]); });
    const sq = (t) => String(t || '').split(/\s+/).filter(Boolean).join(' '), unl = (t) => String(t || '').replace(/<a href="#" data-help-win="\d+">([^<]*)<\/a>/g, '$1');
    const cut = (t) => String(t || '').split(/(?=<p><strong>)/), secOf = {}; SRC.SECTIONS.forEach((s) => { secOf[s.key] = s; });   // a message's sections: each starts at its <p><strong>heading</strong></p>
    let pN = 0, pOk = 0, mN = 0, mOk = 0, uN = 0, uOk = 0, shadow = 0, hN = 0, hOk = 0; const bad = [], pubKey = {};
    const CH = require(path.join(ERP, 'ctx_help.js')), q6 = (sql) => { const r = db6.exec(sql)[0]; return r ? r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c.toLowerCase(), v[i]]))) : []; };
    if (BR === 'rawseed') { const raw = new SQL.Database(new Uint8Array(fs.readFileSync(H.SEED))); CH.howto = ((f) => (q, l) => f((sql) => { const r = raw.exec(sql)[0]; return r ? r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c.toLowerCase(), v[i]]))) : []; }, l))(CH.howto); }   // the red: the reader over the RAW seed
    const set = (a) => a.map(Number).filter((v, i, x) => x.indexOf(v) === i).sort((a1, b1) => a1 - b1).join(',');
    langs.forEach((lang) => {
      SRC.SOURCES[lang].forEach((d) => { const dir = path.join(CACHE, d); if (!fs.existsSync(dir)) return; fs.readdirSync(dir).filter((f) => /^AD_CtxHelpMsg_Trl_.*\.xml$/.test(f)).sort().forEach((f) => {
        const X = readX(path.join(dir, f)); Object.keys(X).forEach((id) => { if (msgs[id] == null || pubKey[id + '|' + lang] || sq(X[id].text) === '' || sq(X[id].text) === sq(X[id].orig)) return; pubKey[id + '|' + lang] = 1; pN++;
          const t = tw(id, lang); if (t && t.text === X[id].text) pOk++; else bad.push('published ' + id + ' ' + lang + (t ? ' text differs' : ' missing')); }); }); });
      const M = readX(path.join(ERP, 'i18n', 'machine', 'AD_CtxHelpMsg_Trl_' + lang + '.xml')), trM = (id) => id != null && M[id] && sq(M[id].text) !== '' && sq(M[id].text) !== sq(M[id].orig);
      const winNames = Object.values((JSON.parse(fs.readFileSync(path.join(ERP, 'i18n', 'help', lang, 'help.json'), 'utf8')).names || {}).windows || {});
      const bold = (text) => winNames.some((n) => text.indexOf('<b>' + n.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</b>') >= 0);
      // §19.17 F5: a machine row translates ONE section (its trlId). A help with a machine section has ONE twin row = its sections in order, the machine text where there is one
      //   (linked exactly when a bold term is one of the language's window names), the English section where there is none; IsTranslated N; never over a published row.
      Object.keys(M).forEach((id) => { uN++; if (full.some((x) => x.sections.some((k) => String(secOf[k].trlId) === id))) uOk++; else bad.push('machine row ' + id + ' ' + lang + ' translates no section in use'); });
      full.forEach((x) => {
        if (!x.sections.some((k) => trM(secOf[k].trlId))) return;
        if (pubKey[x.help + '|' + lang]) { shadow++; return; }
        mN++; const t = tw(x.help, lang), en = cut(msgs[x.help]), parts = t ? cut(t.text) : [];
        const want = x.sections.map((k, i) => trM(secOf[k].trlId) ? M[secOf[k].trlId].text : unl(en[i])).join('');
        const linkOk = parts.length === x.sections.length && x.sections.every((k, i) => !trM(secOf[k].trlId) || /data-help-win=/.test(parts[i]) === bold(M[secOf[k].trlId].text));
        if (t && unl(t.text) === want && t.it === 'N' && linkOk) mOk++; else bad.push('machine help ' + x.help + ' ' + lang + (t ? ' differs: text=' + (unl(t.text) === want) + ' it=' + t.it + ' link=' + linkOk : ' missing'));
      });
      // K8 (§19.16 C4, re-based in §19.17 F5): THE reader (erp/ctx_help.js) over this page DB returns every help of the generated file: its title = the first heading, its html = the
      //   rest (the language's row when it has one, else the English one, marked), and the places it serves = every linked tab's window (SUB tabs too) and every linked process.
      const R = CH.howto(q6, lang);
      full.forEach((x) => { hN++; const got = R.find((r) => r.id === x.help), t = tw(x.help, lang), m = /^<p><strong>([\s\S]*?)<\/strong><\/p>([\s\S]*)$/.exec(t ? t.text : (msgs[x.help] || ''));
        const url = (exec1(db6, 'SELECT description FROM ad_ctxhelp WHERE ad_ctxhelp_id=' + x.help)[0] || [])[0];
        const c = got && m ? { name: sq(got.name) === plain(m[1]), html: got.html === m[2], english: !!got.english === !t, windows: set(got.windows) === set(x.tabs.map((y) => y.window)), tabs: set(got.tabs) === set(x.tabs.map((y) => y.tab)), processes: set(got.processes) === set(x.processes), url: got.source.url === url } : null;
        if (c && Object.keys(c).every((k) => c[k])) hOk++; else bad.push('reader ' + lang + ' help ' + x.help + (c ? ' differs: ' + Object.keys(c).filter((k) => !c[k]).join(',') : ' missing')); });
      L('K7 ' + lang + ' published ' + Object.keys(pubKey).filter((k) => k.endsWith('|' + lang)).length + ', machine rows ' + Object.keys(M).length + ', reader rows ' + R.length);
    });
    chk('K7 translations in legacy\'s table: published ' + pOk + ' of ' + pN + ', helps with a machine section ' + mOk + ' of ' + mN + ' (section by section, linked, IsTranslated N), machine rows in use ' + uOk + ' of ' + uN + ', shadowed ' + shadow + ' | K8 the reader == the page DB\'s helps (title, html, language, windows incl. sub tabs, processes, guide URL) ' + hOk + ' of ' + hN,
      pN > 0 && pOk === pN && mN > 0 && mOk === mN && uOk === uN && shadow === 0 && hN > 0 && hOk === hN, bad.slice(0, 12).join(' ; ') + (bad.length > 12 ? ' ; +' + (bad.length - 12) + ' more' : ''));
  }
  // K5 the team base
  const seedBuf = fs.readFileSync(H.SEED), pt = (rel) => fs.readFileSync(path.join(ERP, 'patches', rel), 'utf8');
  const mainT = (rel) => { try { return cp.execSync('git show origin/main:erp/patches/' + rel, { cwd: ROOT, maxBuffer: 1 << 26, encoding: 'utf8' }); } catch (e) { return null; } };
  const mineP = [pt('ad_seed.db.sql') + (BR === 'patch' ? '\n-- one appended line\n' : ''), pt('mfg.sql')], mainP = [mainT('ad_seed.db.sql'), mainT('mfg.sql')];
  if (mainP[0] == null) incon('K5', 'origin/main not readable');
  else { const a = baseHash(seedBuf, mineP), b = baseHash(seedBuf, mainP); L('K5 team base this tree=' + a.slice(0, 12) + ' origin/main=' + b.slice(0, 12)); chk('K5 the Team BASE hash does not move (seed + hashed patches == origin/main\'s)', a === b); }
}

async function pagePart() {
  const over = BR === 'nooverlay' ? { '/erp/ad_ctxhelp_rows.js': path.join(require('os').tmpdir(), 'ctx_empty_' + process.pid + '.js') } : null;
  if (over) fs.writeFileSync(over['/erp/ad_ctxhelp_rows.js'], '');
  const lw = PG("select name from ad_ctxhelp order by ad_ctxhelp_id"), want = lw && lw.length ? lw.concat(require(path.join(ERP, 'ad_ctxhelp_app_rows.js')).links.map((x) => x.name)) : lw;   // §19.16 C2: legacy's + the app's
  const P = await H.erpPage(null, over);
  try {
    L('page chromium ' + P.version + ' ' + (P.logs.filter((l) => l.indexOf('§CTXHELP_OVERLAY') === 0).pop() || 'no §CTXHELP_OVERLAY line'));
    const scope = P.logs.filter((l) => l.indexOf('§IDMP-SESSION scopeMenu') === 0).pop(); L('page ' + (scope || 'no scopeMenu line'));
    const n0 = P.logs.length, row = await P.pg.evaluate(() => { const r = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="200038"]'); if (r) r.click(); return !!r; });   // the menu's own handler (W-HQ-MENU-LEAVES M4 way)
    if (!row) { incon('K3', 'menu entry 200038 "Context Help" not on the role\'s menu'); return; }
    // a high-volume table opens legacy's Find window first (§UDP4-INITIAL findFirst=true); it says "Records = N", then OK shows the rows, as a user does
    let findTxt = ''; for (let i = 0; i < 20 && !findTxt; i++) { await P.pg.waitForTimeout(250); findTxt = await P.pg.evaluate(() => { const o = document.querySelector('#idmp-find-ov'); return o ? o.innerText : ''; }); }
    const recs = (/Records = (\d+)/.exec(findTxt) || [])[1]; L('K3 find window ' + (findTxt ? 'open, Records = ' + recs : 'not shown'));
    if (findTxt) await P.pg.evaluate(() => document.querySelector('#idmp-find-ov [data-find-ok]').click());
    // §19.16 C2: with several rows the tab opens on the FIRST record as a form (AD_Tab single row, as legacy); the user's Grid Toggle shows them all (poc_toggle_save_live.js way)
    for (let i = 0; i < 20; i++) { await P.pg.waitForTimeout(250); if (await P.pg.evaluate(() => !!document.querySelector('#idmp-content #idmp-form, #idmp-content .idmp-form, .idmp-grid'))) break; }
    if (await P.pg.evaluate(() => !!document.querySelector('#idmp-content #idmp-form, #idmp-content .idmp-form'))) { await P.pg.click('#idmp-toolbar [data-tb="toggle"]'); await P.pg.waitForTimeout(900); }
    L('K3 grid rows on screen ' + await P.pg.$$eval('.idmp-grid tbody tr[data-ad-record]', (e) => e.length));
    // a single-row tab shows the name in an input box (innerText has no values), so the values are read too
    let txt = ''; for (let i = 0; i < 40; i++) { await P.pg.waitForTimeout(250); txt = await P.pg.evaluate(() => document.body.innerText + '\n' + Array.from(document.querySelectorAll('input,textarea')).map((e) => e.value).join('\n')); if (want && want.every((w) => txt.indexOf(w) >= 0)) break; }
    const opened = P.logs.slice(n0).filter((l) => l.indexOf('§IDEMPIERE window=') === 0).join(' | ');
    L('K3 ' + (opened || 'no §IDEMPIERE window line') + ' legacy names=' + JSON.stringify(want));
    if (!want || !want.length) incon('K3', 'legacy Postgres unreachable or no ad_ctxhelp row');
    else chk('K3 the Context Help window opens on the twin, Find says Records = ' + recs + ' (want ' + want.length + '), and shows legacy\'s + the app\'s ' + want.length + ' row(s): ' + want.filter((w) => txt.indexOf(w) >= 0).length + ' of ' + want.length + ' names on screen', /\(200034\)/.test(opened) && Number(recs) === want.length && want.every((w) => txt.indexOf(w) >= 0));
    if (P.errs.length) L('page errors: ' + P.errs.slice(0, 3).join(' | '));
  } finally { await P.close(); if (over) fs.unlinkSync(over['/erp/ad_ctxhelp_rows.js']); }
}

// K9 (§19.16 C5) the end of the chain, in the REAL page as a tenant admin (GardenAdmin, client 11): Context Help -> the Sales Order help -> Message tab -> New -> MsgText ->
//   Save. ISSUE: the help index was built once at login, so a saved message was not shown until a reload. Claims: (a) the save is the tenant's OWN row (client 11) and System's
//   row is untouched; (b) with NO reload the reader's row, the How To panel on Sales Order and the question box's answer show the new text; (c) after a reload they still do.
//   Reds: CTX_BREAK=nolisten (the page without the rebuild on save) -> (b) FAIL; CTX_BREAK=noclientorder (a reader that ignores legacy's client order) -> (b) and (c) FAIL; CTX_BREAK=nowait (the index built without waiting for the saved changes) -> (c) FAIL.
async function editPart() {
  const HELP = 1000000, TITLE = 'Our own Sales Order rule', BODY = 'Ask the credit desk before you complete (W-CTXHELP-OVERLAY K9).', TEXT = '<p><strong>' + TITLE + '</strong></p><p>' + BODY + '</p>';
  const tmp = (n, src, a, b) => { const f = path.join(require('os').tmpdir(), 'ctx_' + n + '_' + process.pid), s = fs.readFileSync(path.join(ERP, src), 'utf8'); if (s.indexOf(a) < 0) throw new Error('red ' + n + ': its text is not in ' + src); fs.writeFileSync(f, s.split(a).join(b)); return f; };
  let over = null;
  if (BR === 'nolisten') over = { '/erp/idempiere.html': tmp('nolisten.html', 'idempiere.html', "t.indexOf('ad_ctxhelp') === 0", 'false') };
  if (BR === 'nowait') over = { '/erp/idempiere.html': tmp('nowait.html', 'idempiere.html', "ErpI18n.loadHelpIndex(lang), side])", "ErpI18n.loadHelpIndex(lang)])") };
  if (BR === 'noclientorder') over = { '/erp/ctx_help.js': tmp('noclientorder.js', 'ctx_help.js', "' ORDER BY ad_client_id DESC, ad_org_id DESC, ad_ctxhelpmsg_id DESC'", "' ORDER BY ad_client_id, ad_org_id, ad_ctxhelpmsg_id DESC'") };
  const P = await H.erpPage(null, over), pg = P.pg;
  const shown = async (tag) => {   // what a person sees: the reader's row, the panel on Sales Order (window 143), the answer card
    await pg.evaluate(() => { const r = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="129"]'); if (r) r.click(); });
    for (let i = 0; i < 40; i++) { await pg.waitForTimeout(250); if (await pg.evaluate(() => /\(143\)/.test(document.title) || !!document.querySelector('#idmp-howto-ctx') && document.querySelector('#idmp-howto-ctx').innerText.length > 0)) break; }
    await pg.waitForTimeout(600);
    const o = await pg.evaluate((id) => { const I = window.__idmpHowto.index(), r = (I.howtoRows || []).find((x) => x.id === id), c = window.__idmpHowto.ask('how do I complete a sales order');
      return { row: r ? r.name + ' | ' + r.html : null, panel: (document.querySelector('#idmp-howto-ctx') || {}).innerText || '', card: (document.querySelector('#idmp-howto-card') || {}).innerText || '', cardRow: c && c.howto ? c.howto.id : null }; }, HELP);
    L('K9 ' + tag + ' reader row "' + String(o.row).slice(0, 70) + '" panel "' + o.panel.replace(/\s+/g, ' ').slice(0, 70) + '" card how-to=' + o.cardRow + ' "' + o.card.replace(/\s+/g, ' ').slice(-70) + '"');
    return { row: o.row === TITLE + ' | <p>' + BODY + '</p>', panel: o.panel.indexOf(TITLE) >= 0 && o.panel.indexOf(BODY) >= 0, card: o.cardRow === HELP && o.card.indexOf(BODY) >= 0 };
  };
  const rowsOf = () => pg.evaluate((id) => window.__tipRead.rows('SELECT ad_client_id AS c, msgtext AS t FROM ad_ctxhelpmsg WHERE ad_ctxhelp_id=' + id + ' ORDER BY ad_client_id'), HELP);
  try {
    const sys0 = (await rowsOf()).filter((r) => Number(r.c) === 0).map((r) => r.t).join('');
    if (!sys0) { incon('K9', 'the Sales Order help ' + HELP + ' has no System message on the page'); return; }
    const before = await shown('before the edit');
    if (before.row || before.panel) { incon('K9', 'the tenant text is already there before the edit (a dirty browser profile?)'); return; }
    // the user's path: menu -> Find OK -> grid -> the help's row -> Message tab -> New -> type -> Save
    await pg.evaluate(() => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="200038"]').click());
    await pg.waitForSelector('#idmp-find-ov [data-find-ok]', { timeout: 10000 }); await pg.click('#idmp-find-ov [data-find-ok]'); await pg.waitForTimeout(1500);
    if (await pg.evaluate(() => !!document.querySelector('#idmp-content #idmp-form, #idmp-content .idmp-form'))) { await pg.click('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(900); }
    const picked = await pg.evaluate((id) => { const tr = [...document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]')].find((x) => x.getAttribute('data-ad-record') === String(id)); if (tr) tr.click(); return !!tr; }, HELP);
    if (!picked) { incon('K9', 'help ' + HELP + ' is not a row of the Context Help grid'); return; }
    await pg.waitForTimeout(800); await pg.click('#idmp-tabstrip >> text=Message'); await pg.waitForTimeout(1500);
    await pg.click('#idmp-toolbar [data-tb="new"]'); await pg.waitForSelector('#idmp-inline-mount [data-col="msgtext"]', { timeout: 10000 }); await pg.waitForTimeout(700);
    const ta = pg.locator('#idmp-inline-mount [data-col="msgtext"]').first(); await ta.fill(TEXT); await ta.blur().catch(() => {});
    const n0 = P.logs.length; await pg.click('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(2500);
    const val = P.logs.slice(n0).filter((l) => /^§CRUD validate key=ad_ctxhelpmsg /.test(l)).pop() || '', per = P.logs.slice(n0).filter((l) => /^§CRUD-PERSIST key=ad_ctxhelpmsg /.test(l)).pop() || '';
    L('K9 save: ' + (val || 'no §CRUD validate line') + ' | ' + (per || 'no §CRUD-PERSIST line').slice(0, 200));
    const rows = await rowsOf(), mine = rows.filter((r) => Number(r.c) === 11), sys1 = rows.filter((r) => Number(r.c) === 0).map((r) => r.t).join('');
    L('K9 rows of help ' + HELP + ' after the save: ' + rows.map((r) => 'client ' + r.c + ' ' + String(r.t).length + ' chars').join(', ') + '; System row unchanged=' + (sys1 === sys0));
    const a = /verb=create ok/.test(val) && /verifyChain=ok/.test(per) && mine.length === 1 && mine[0].t === TEXT && sys1 === sys0;
    const b = await shown('after the save, no reload');
    await pg.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await pg.waitForFunction(() => window.__idmpHowto && window.__idmpHowto.index() && window.__idmpFieldHelp && window.__idmpFieldHelp.menu().windows.length > 0, null, { timeout: 60000 });
    const c = await shown('after a reload'), rows2 = await rowsOf();
    L('K9 rows after the reload: ' + rows2.map((r) => 'client ' + r.c + ' ' + String(r.t).length + ' chars').join(', '));
    const all = (o) => o.row && o.panel && o.card;
    chk('K9 a tenant\'s own message, typed in the Context Help window: (a) saved as client 11, signed, System\'s row untouched: ' + a + '; (b) shown with no reload: reader ' + b.row + ', panel ' + b.panel + ', answer card ' + b.card + '; (c) after a reload: reader ' + c.row + ', panel ' + c.panel + ', answer card ' + c.card,
      a && all(b) && all(c) && rows2.filter((r) => Number(r.c) === 11).length === 1);
    if (P.errs.length) L('K9 page errors: ' + P.errs.slice(0, 3).join(' | '));
  } finally { await P.close(); if (over) Object.keys(over).forEach((k) => { try { fs.unlinkSync(over[k]); } catch (e) {} }); }
}

(async function main() {
  if (!H.seedOk()) { incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); }
  else { if (!process.env.ONLYEDIT) await nodePart(); if (!process.env.NOPAGE) { if (!process.env.ONLYEDIT) await pagePart(); await editPart(); } }
  const v = K.fail ? 'FAIL' : (K.inc || !K.pass ? 'INCONCLUSIVE' : 'PASS');
  out('§WITNESS_CTXHELP_OVERLAY pass=' + K.pass + ' fail=' + K.fail + ' inconclusive=' + K.inc + ' verdict=' + v + (BR ? ' CTX_BREAK=' + BR : ''));
  process.exitCode = v === 'PASS' ? 0 : 1;
})().catch((e) => { out('ERROR ' + (e && e.stack || e)); process.exitCode = 2; });
