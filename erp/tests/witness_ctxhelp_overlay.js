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
//   Reds C2: CTX_BREAK=nolink (the app file without its AD_Tab updates) -> K6 FAIL; CTX_BREAK=dropsec (one how-to dropped) -> K6 FAIL.
// Reds: CTX_BREAK=nomsg (the rows file without its ad_ctxhelpmsg row) -> K1 FAIL; CTX_BREAK=patch (one line appended to the hashed patch) -> K5 FAIL; CTX_BREAK=nooverlay (page without the overlay) -> K3 FAIL.
// Run: node erp/tests/witness_ctxhelp_overlay.js   Env: CTX_BREAK=nomsg|patch|nooverlay|nolink|noproc|dropsec|nomachine|pubtext  NOPAGE=1
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
  return A;
}
const APP_ID0 = 1000000;
const norm = (x) => String(x == null ? '' : x).replace(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d:\d\d).*$/, '$1 $2').replace(/\.0+$/, '');
const plain = (h) => String(h || '').replace(/<\/(p|li)>/g, ' ').replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e])).split(/\s+/).filter(Boolean).join(' ');
function guideSection(guide, name) {   // the guide's own paragraphs under '### <name>', proof asides (> ...) left out, markdown marks removed - read here, not from the builder
  const lines = guide.split('\n'), at = lines.indexOf('### ' + name); if (at < 0) return null;
  const body = []; for (let i = at + 1; i < lines.length && !/^#{1,3} /.test(lines[i]); i++) body.push(lines[i]);
  return body.join('\n').split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('>')).map((x) => x.replace(/^- /gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1')).join(' ').split(/\s+/).filter(Boolean).join(' ');
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
  // K6 legacy's own lookup finds each how-to on its window's first tab (fresh db, one ensure)
  const db6 = new SQL.Database(new Uint8Array(fs.readFileSync(H.SEED)));
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach((st) => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) { try { db6.run(st); } catch (e) {} } });
  console.log = () => {}; O.ensure(db6); console.log = lg;
  const CLIENT = 11, ORG = 0, full = require(path.join(ERP, 'ad_ctxhelp_app_rows.js')).links;   // the denominator = the generated file's how-tos, not the (maybe broken) applied set
  let guide = null; try { guide = cp.execSync('git -C ' + JSON.stringify(path.join(require('os').homedir(), 'bim-compiler')) + ' show origin/master:docs/ERPUserGuide.md', { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) {}
  if (!guide) incon('K6', 'the guide (bim-compiler origin/master docs/ERPUserGuide.md) not readable');
  else {
    let tN = 0, found = 0, same = 0, typeOk = 0; const bad = [];
    const lookup = (table, col, rid) =>   // MCtxHelpMsg.getCtxHelpID (MCtxHelpMsg.java:170-204): CTXTYPE_Tab -> AD_Tab, CTXTYPE_Process -> AD_Process; no CtxType filter
      (exec1(db6, 'SELECT t.AD_CtxHelp_ID FROM ' + table + " t, AD_CtxHelp h WHERE t.AD_CtxHelp_ID=h.AD_CtxHelp_ID AND t.IsActive='Y' AND h.IsActive='Y' AND h.AD_Client_ID IN (0, " + CLIENT + ") AND h.AD_Org_ID IN (0, " + ORG + ') AND t.' + col + '=' + rid + ' ORDER BY h.AD_Client_ID DESC, h.AD_Org_ID DESC, h.AD_CtxHelp_ID DESC')[0] || [])[0];
    full.forEach((x) => {
      const gs = guideSection(guide, x.name), want = gs == null ? null : x.name + ' ' + gs, wantType = x.tabs.length ? 'T' : 'P';   // §19.16 C3: the heading is MsgText's first paragraph; §19.17 F1: T when the section has a window
      const targets = x.tabs.map((y) => ({ what: 'window ' + y.window + ' tab ' + y.tab, hid: lookup('AD_Tab', 'AD_Tab_ID', y.tab) })).concat(x.processes.map((pid) => ({ what: 'process ' + pid, hid: lookup('AD_Process', 'AD_Process_ID', pid) })));
      targets.forEach((tg) => {
        tN++;
        // MCtxHelpMsg.get: the message (MCtxHelpMsg.java:96-100)
        const msg = tg.hid ? (exec1(db6, "SELECT msgtext FROM AD_CtxHelpMsg WHERE IsActive = 'Y' AND AD_Client_ID IN (0, " + CLIENT + ")  AND AD_Org_ID IN (0, " + ORG + ")  AND AD_CtxHelp_ID = " + tg.hid + ' ORDER BY AD_Client_ID DESC, AD_Org_ID DESC, AD_CtxHelpMsg_ID DESC')[0] || [])[0] : null;
        const ct = tg.hid ? (exec1(db6, 'SELECT ctxtype FROM ad_ctxhelp WHERE ad_ctxhelp_id=' + tg.hid)[0] || [])[0] : null, got = plain(msg);
        if (msg && Number(tg.hid) === x.help) found++; else bad.push(tg.what + ': ' + (msg ? 'another help ' + tg.hid : 'no message'));
        if (msg && want && got === want) same++; else if (msg) bad.push(tg.what + ' text differs from the guide (' + got.length + ' vs ' + (want || '').length + ' chars)');
        if (ct === wantType) typeOk++;
        L('K6 ' + tg.what + ' -> help ' + (tg.hid || 'none') + ' ctxtype=' + ct + ' text ' + (msg ? (got === want ? '== guide' : 'DIFFERS') : 'none') + ' "' + got.slice(0, 60) + '"');
      });
    });
    chk('K6 legacy\'s lookup finds its section\'s how-to on ' + found + ' of ' + tN + ' targets (' + full.length + ' sections), text == the guide ' + same + ' of ' + tN + ', CtxType right ' + typeOk + ' of ' + tN,
      tN > 0 && found === tN && same === tN && typeOk === tN, bad.join(' ; '));
  }
  // K7 the translations (C3), on db6
  {
    const SRC = require(path.join(ERP, 'tools', 'build_help_pack.js')), CACHE = SRC.CACHE, langs = Object.keys(SRC.SOURCES);
    if (BR === 'pubtext') db6.run("UPDATE ad_ctxhelpmsg_trl SET msgtext=(SELECT msgtext FROM ad_ctxhelpmsg WHERE ad_ctxhelpmsg_id=200000) WHERE ad_ctxhelpmsg_id=200000 AND ad_language='de_DE'");
    const readX = (f) => { const o = {}; if (!fs.existsSync(f)) return o; const x = fs.readFileSync(f, 'utf8'), re = /<row id="(\d+)"[^>]*>([\s\S]*?)<\/row>/g; let m;   // read HERE (not the builder's reader): CDATA or escaped text
      const de = (t) => t.replace(/&#10;/g, '\n').replace(/&#13;/g, '\r').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      while ((m = re.exec(x))) { const v = /<value column="MsgText"[^>]*?original="([^"]*)"[^>]*?(?:\/>|>([\s\S]*?)<\/value>)/.exec(m[2]); if (!v) continue; const b = v[2] || '', cd = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(b); o[m[1]] = { orig: de(v[1]), text: cd ? cd[1] : de(b) }; }
      return o; };
    const tw = (id, lang) => { const r = db6.exec('SELECT msgtext, istranslated FROM ad_ctxhelpmsg_trl WHERE ad_ctxhelpmsg_id=? AND ad_language=?', [Number(id), lang])[0]; return r ? { text: r.values[0][0], it: r.values[0][1] } : null; };
    const msgs = {}; exec1(db6, 'SELECT ad_ctxhelpmsg_id FROM ad_ctxhelpmsg').forEach((v) => { msgs[v[0]] = 1; });
    const sq = (t) => String(t || '').split(/\s+/).filter(Boolean).join(' ');
    let pN = 0, pOk = 0, mN = 0, mOk = 0, shadow = 0, hN = 0, hOk = 0; const bad = [], pubKey = {};
    langs.forEach((lang) => {
      SRC.SOURCES[lang].forEach((d) => { const dir = path.join(CACHE, d); if (!fs.existsSync(dir)) return; fs.readdirSync(dir).filter((f) => /^AD_CtxHelpMsg_Trl_.*\.xml$/.test(f)).sort().forEach((f) => {
        const X = readX(path.join(dir, f)); Object.keys(X).forEach((id) => { if (!msgs[id] || pubKey[id + '|' + lang] || sq(X[id].text) === '' || sq(X[id].text) === sq(X[id].orig)) return; pubKey[id + '|' + lang] = 1; pN++;
          const t = tw(id, lang); if (t && t.text === X[id].text) pOk++; else bad.push('published ' + id + ' ' + lang + (t ? ' text differs' : ' missing')); }); }); });
      const M = readX(path.join(ERP, 'i18n', 'machine', 'AD_CtxHelpMsg_Trl_' + lang + '.xml'));
      const winNames = Object.values((JSON.parse(fs.readFileSync(path.join(ERP, 'i18n', 'help', lang, 'help.json'), 'utf8')).names || {}).windows || {});
      Object.keys(M).forEach((id) => { mN++; if (pubKey[id + '|' + lang]) { shadow++; return; } const t = tw(id, lang), unl = t ? t.text.replace(/<a href="#" data-help-win="\d+">([^<]*)<\/a>/g, '$1') : null;
        if (t && unl === M[id].text && t.it === 'N' && /data-help-win=/.test(t.text) === winNames.some((n) => M[id].text.indexOf('<b>' + n.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</b>') >= 0)) mOk++; else bad.push('machine ' + id + ' ' + lang + (t ? ' differs: text=' + (unl === M[id].text) + ' it=' + t.it + ' link=' + /data-help-win=/.test(t.text) : ' missing')); });   // linked exactly when a bold term is one of the language's window names
      let mainJ = null; try { mainJ = JSON.parse(cp.execSync('git show origin/main:erp/i18n/help/' + lang + '/help.json', { cwd: ROOT, maxBuffer: 1 << 28, encoding: 'utf8' })); } catch (e) {}
      const cur = JSON.parse(fs.readFileSync(path.join(ERP, 'i18n', 'help', lang, 'help.json'), 'utf8'));
      ((mainJ && mainJ.howto) || []).forEach((h, k) => { hN++; const c = (cur.howto || [])[k]; if (c && c.name === h.name && c.html === h.html) hOk++; else bad.push('help.json ' + lang + ' how-to ' + k + ' changed'); });
      L('K7 ' + lang + ' published ' + Object.keys(pubKey).filter((k) => k.endsWith('|' + lang)).length + ', machine ' + Object.keys(M).length);
    });
    chk('K7 translations in legacy\'s table: published ' + pOk + ' of ' + pN + ', machine ' + mOk + ' of ' + mN + ' (linked, IsTranslated N), shadowed ' + shadow + ', help.json how-to unchanged ' + hOk + ' of ' + hN,
      pN > 0 && pOk === pN && mN > 0 && mOk === mN && shadow === 0 && hOk === hN, bad.join(' ; '));
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

(async function main() {
  if (!H.seedOk()) { incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); }
  else { await nodePart(); if (!process.env.NOPAGE) await pagePart(); }
  const v = K.fail ? 'FAIL' : (K.inc || !K.pass ? 'INCONCLUSIVE' : 'PASS');
  out('§WITNESS_CTXHELP_OVERLAY pass=' + K.pass + ' fail=' + K.fail + ' inconclusive=' + K.inc + ' verdict=' + v + (BR ? ' CTX_BREAK=' + BR : ''));
  process.exitCode = v === 'PASS' ? 0 : 1;
})().catch((e) => { out('ERROR ' + (e && e.stack || e)); process.exitCode = 2; });
