#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — ops_cli.js: the door's program for the verbs that replace the assistant's hand-run scripts.
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.V item 13 ("From AI to Human"). Witness: common/door/tests/witness_ops_verbs.js (W-OPS-VERBS). READ THE §OPS LOG after every run.
//   node ops_cli.js witness-run  --name erp_new            run common/**/witness_<name>.js, keep the log, answer its §WITNESS verdict
//   node ops_cli.js witness-last --name erp_new            the last recorded run, nothing re-run
//   node ops_cli.js legacy-status                           is the legacy test stack up (docker Postgres, pilot web UI)
//   node ops_cli.js legacy-query --table c_order [--columns a,b] [--sort c] [--limit n] [--where col=val]...
//   node ops_cli.js column       --kind Order --column C_ConversionType_ID     who fills a column, twin vs legacy dictionary
//   node ops_cli.js compare      --kind Order --number 50000 [--legacy 50981]   one record on both sides, cell for cell
//   node ops_cli.js where        --symbol InvoiceRule [--in callout]            file:line in the legacy iDempiere source
//   node ops_cli.js pack         --book model.xlsx --version 1.0.0 [--out dir] [--java dir --package p]   the metadata-only 2Pack zip (wraps erp/tools/xlsx_pack.js)
// Exit: 0 answered · 3 refused (answer.refused) or INCONCLUSIVE (answer.verdict) · 1 failed · 2 usage. JSON answer on stdout, §OPS lines on stderr.
// Nothing here takes SQL, a shell string or a path from the caller: names are checked against the dictionaries / the repo, values are quoted literals, programs run by argv.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { execFileSync, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const PG = { container: process.env.OPS_PG_CONTAINER || 'postgres', db: process.env.OPS_PG_DB || 'idempiere_pilot', user: process.env.OPS_PG_USER || 'adempiere' };
const PILOT = process.env.OPS_PILOT_URL || 'http://localhost:8088/webui/';
const WROOT = process.env.OPS_WITNESS_ROOT || ROOT, BREAK = process.env.OPS_BREAK || '';   // OPS_WITNESS_ROOT: where witnesses are searched (the witness points it at stubs); OPS_BREAK: falsifier switches, test only
const SRC = process.env.IDEMPIERE_SRC || path.join(os.homedir(), 'idempiere-dev-setup', 'idempiere');
const CACHE = process.env.OPS_CACHE || path.join(os.homedir(), '.cache', 'bim_ops');
const say = (l) => console.error('§OPS ' + l);
const out = (o) => console.log(JSON.stringify(o));
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";

// ---- legacy Postgres (docker exec, argv only) ----
function pg(sql) {
  const r = spawnSync('docker', ['exec', PG.container, 'psql', '-U', PG.user, '-d', PG.db, '-At', '-F', '\x1f', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 60000 });
  if (r.error || r.status !== 0) throw Object.assign(new Error(((r.stderr || '') + (r.error ? r.error.message : '')).trim().split('\n')[0] || 'psql failed'), { down: true });
  return r.stdout.split('\n').filter(l => l.length).map(l => l.split('\x1f'));
}
const pgUp = () => { const r = spawnSync('docker', ['exec', PG.container, 'pg_isready', '-U', PG.user], { encoding: 'utf8', timeout: 8000 }); return !r.error && r.status === 0; };
const pgCols = (table) => pg("SELECT column_name FROM information_schema.columns WHERE table_schema='adempiere' AND table_name=" + lit(table.toLowerCase()) + ' ORDER BY ordinal_position').map(r => r[0]);
const inconclusive = (summary) => { out({ verdict: 'INCONCLUSIVE', summary }); return 3; };
const refused = (reason, more) => { out(Object.assign({ refused: true, reason }, more || {})); return 3; };

// ---- witness.run / witness.last ----
function findWitness(name) {
  const hits = [], walk = (d, depth) => { if (depth > 5) return; let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    es.forEach(e => { if (e.name === 'node_modules' || e.name === '.git') return; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (e.name === 'witness_' + name + '.js') hits.push(path.relative(WROOT, p)); }); };
  walk(WROOT, 0); return hits;
}
function parseVerdict(text) {
  const lines = text.split('\n'), v = lines.filter(l => /^§(WITNESS_\S+|W-\S+)\s.*verdict=/.test(l)).pop() || lines.filter(l => /^§W\S* .*verdict=/.test(l)).pop();
  if (!v) return null;
  const g = (k) => { const m = new RegExp(k + '=(\\w+)').exec(v); return m ? m[1] : null; };
  return { line: v, verdict: g('verdict'), pass: g('pass') === null ? null : +g('pass'), fail: g('fail') === null ? null : +g('fail'), inconclusive: g('inconclusive') === null ? null : +g('inconclusive') };
}
function witnessRun(a) {
  if (!/^[a-z0-9_]{1,60}$/.test(a.name || '')) return refused('a witness name is letters, digits and _ (witness_<name>.js)');
  const hits = findWitness(a.name);
  if (!hits.length) return refused('no witness_' + a.name + '.js in this tree');
  if (hits.length > 1) return refused('more than one witness_' + a.name + '.js: ' + hits.join(', '));
  const dir = path.join(CACHE, 'witness'); fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'), log = path.join(dir, a.name + '.' + stamp + '.log'), t0 = Date.now();
  const env = Object.assign({}, process.env); const np = ['/home/red1/bim-compiler/node_modules', path.join(os.homedir(), 'bim-ootb', 'tests', 'node_modules')].filter(fs.existsSync);
  env.NODE_PATH = [env.NODE_PATH].concat(np).filter(Boolean).join(':'); env.NODE_OPTIONS = ((env.NODE_OPTIONS || '') + ' --dns-result-order=ipv4first').trim();
  const r = spawnSync(process.execPath, [path.join(WROOT, hits[0])], { env, cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, timeout: (+a.timeout || 600) * 1000 });
  const text = (r.stdout || '') + (r.stderr ? '\n' + r.stderr : ''); fs.writeFileSync(log, text);
  const pv = parseVerdict(text), failed = text.split('\n').filter(l => /❌/.test(l)).slice(0, 20).map(l => l.trim());
  say('witness-run name=' + a.name + ' exit=' + r.status + ' bytes=' + text.length + ' verdict=' + (pv && pv.verdict) + ' log=' + log);
  if (!pv) { say('FAIL ' + a.name + ' printed no verdict line (exit ' + r.status + ' is not evidence); log ' + log); return 1; }
  const ans = { name: a.name, file: hits[0], log, exit: r.status, verdict: pv.verdict, pass: pv.pass, fail: pv.fail, inconclusive: pv.inconclusive, verdictLine: pv.line, failed, ms: Date.now() - t0 };
  fs.writeFileSync(path.join(dir, a.name + '.latest.json'), JSON.stringify(ans));
  if (pv.verdict === 'INCONCLUSIVE') { ans.summary = 'the witness judged nothing it could answer (INCONCLUSIVE)'; out(ans); return 3; }
  out(ans); return 0;
}
function witnessLast(a) {
  if (!/^[a-z0-9_]{1,60}$/.test(a.name || '')) return refused('a witness name is letters, digits and _');
  const f = path.join(CACHE, 'witness', a.name + '.latest.json');
  if (!fs.existsSync(f)) return refused('no recorded run of witness_' + a.name + '; run witness.run first');
  const ans = JSON.parse(fs.readFileSync(f, 'utf8')); ans.recorded = true; out(ans); return 0;
}

// ---- legacy.status ----
function pilotHttp() { return new Promise((res) => { const q = http.get(PILOT, { timeout: 4000 }, (r) => { r.resume(); res(r.statusCode); }); q.on('error', () => res(null)); q.on('timeout', () => { q.destroy(); res(null); }); }); }
async function legacyStatus() {
  const ps = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8', timeout: 8000 });
  const dockerOk = !ps.error && ps.status === 0, running = dockerOk ? ps.stdout.split('\n').filter(Boolean) : [];
  const postgres = dockerOk && running.indexOf(PG.container) >= 0 ? (pgUp() ? 'ready' : 'container up, not accepting connections') : (dockerOk ? 'container not running' : 'docker not reachable');
  const code = await pilotHttp(), pilot = code === 200 ? 'up' : (code ? 'answers ' + code : 'not reachable');
  const verdict = postgres === 'ready' && code === 200 ? 'UP' : (postgres === 'ready' || code === 200 ? 'PARTIAL' : 'DOWN');
  say('legacy-status postgres=' + postgres + ' pilot=' + pilot + ' verdict=' + verdict);
  out({ verdict, postgres: { container: PG.container, database: PG.db, state: postgres }, pilot: { url: PILOT, http: code, state: pilot }, summary: 'legacy ' + verdict + ': postgres ' + postgres + ', pilot ' + pilot, next: verdict === 'UP' ? [] : ['start it: ~/idempiere-dev-setup/docker-postgres.sh, then ~/idempiere-pilot/start.sh'] });
  return 0;
}

// ---- legacy.query ----
function legacyQuery(a, where) {
  if (!IDENT.test(a.table || '')) return refused('table is a table name (letters, digits, _)');
  let cols; try { cols = pgCols(a.table); } catch (e) { return inconclusive('the legacy database is not reachable (' + e.message + '); ask legacy.status'); }
  if (!cols.length) return refused('legacy has no table ' + a.table);
  const pick = a.columns ? String(a.columns).split(',').map(s => s.trim()) : cols.filter(c => /^(documentno|value|name|docstatus|grandtotal|isactive)$/.test(c)).concat(cols.filter(c => /_id$/.test(c)).slice(0, 1));
  const use = (pick.length ? pick : cols.slice(0, 6)).filter((c, i, arr) => arr.indexOf(c) === i);
  const bad = use.filter(c => cols.indexOf(c.toLowerCase()) < 0); if (bad.length) return refused('table ' + a.table + ' has no column ' + bad.join(', '), { columnsOfTable: cols });
  const conds = []; for (const w of where) { const i = w.indexOf('='), c = w.slice(0, i).toLowerCase(); if (i < 1 || cols.indexOf(c) < 0) return refused('table ' + a.table + ' has no column "' + w.slice(0, Math.max(i, 0)) + '"', { columnsOfTable: cols }); conds.push(c + '=' + lit(w.slice(i + 1))); }
  const sortCol = a.sort ? String(a.sort).replace(/^-/, '').toLowerCase() : null; if (sortCol && cols.indexOf(sortCol) < 0) return refused('table ' + a.table + ' has no sort column ' + sortCol, { columnsOfTable: cols });
  const limit = BREAK === 'nocap' ? 100000 : Math.min(Math.max(+a.limit || 50, 1), 1000), w = conds.length ? ' WHERE ' + conds.join(' AND ') : '', t = a.table.toLowerCase();
  const total = +pg('SELECT count(*) FROM ' + t + w)[0][0], population = +pg('SELECT count(*) FROM ' + t)[0][0];
  const rows = pg('SELECT ' + use.map(c => c.toLowerCase()).join(',') + ' FROM ' + t + w + (sortCol ? ' ORDER BY ' + sortCol + (String(a.sort).charAt(0) === '-' ? ' DESC' : '') : '') + ' LIMIT ' + limit).map(r => { const o = {}; use.forEach((c, i) => { o[c] = r[i]; }); return o; });
  say('legacy-query table=' + t + ' shown=' + rows.length + ' total=' + total);
  if (!population) { out({ verdict: 'INCONCLUSIVE', summary: 'legacy table ' + t + ' has no rows, so nothing was judged' }); return 3; }
  out({ table: a.table, columns: use, rows, shown: rows.length, total, population, verdict: 'OK', summary: 'shown ' + rows.length + ' of ' + total + ' ' + t + ' (legacy)' }); return 0;
}

// ---- twin dictionary (sql.js on the shipped seed) ----
async function seedDb() {
  const init = require(path.join(ROOT, 'common', 'lib', 'sql-wasm.js')), SQL = await init({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common', 'lib', 'sql-wasm.wasm')) });
  return new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db')));
}
const lower = (o) => { const r = {}; Object.keys(o).forEach(k => { r[k.toLowerCase()] = o[k]; }); return r; };   // sql.js keeps the case a column was created with
const q1 = (db, sql, p) => { const s = db.prepare(sql); s.bind(p || []); const r = s.step() ? lower(s.getAsObject()) : null; s.free(); return r; };
const qa = (db, sql, p) => { const s = db.prepare(sql); s.bind(p || []); const r = []; while (s.step()) r.push(lower(s.getAsObject())); s.free(); return r; };

// one function builds the dictionary facts for either side; `X` = { one(sql), all(sql), lit }
function columnFacts(X, kind, column) {
  const t = X.one("SELECT ad_table_id, tablename FROM ad_table WHERE lower(tablename)=" + lit(kind.toLowerCase()) + " OR lower(name)=" + lit(kind.toLowerCase()) + ' ORDER BY (lower(tablename)=' + lit(kind.toLowerCase()) + ') DESC LIMIT 1');
  if (!t) return { found: false, why: 'no table or window-kind named ' + kind };
  const c = X.one('SELECT ad_column_id, columnname, defaultvalue, ad_val_rule_id, ad_reference_id, ad_reference_value_id, ismandatory, isupdateable FROM ad_column WHERE ad_table_id=' + t.ad_table_id + ' AND lower(columnname)=' + lit(column.toLowerCase()));
  if (!c) return { found: false, table: t.tablename, why: 'table ' + t.tablename + ' has no column ' + column, columns: X.all('SELECT columnname FROM ad_column WHERE ad_table_id=' + t.ad_table_id + ' ORDER BY columnname').map(r => r.columnname) };
  const f = { found: true, table: t.tablename, column: c.columnname, reference: +c.ad_reference_id, mandatory: c.ismandatory, updateable: c.isupdateable, defaultValue: c.defaultvalue || null, validationRule: null, fieldDefaults: [], loginDefault: null };
  if (c.ad_val_rule_id) { const v = X.one('SELECT name, code FROM ad_val_rule WHERE ad_val_rule_id=' + c.ad_val_rule_id); f.validationRule = v ? { name: v.name, code: v.code } : null; }
  try { f.fieldDefaults = X.all('SELECT defaultvalue FROM ad_field WHERE ad_column_id=' + c.ad_column_id + " AND defaultvalue IS NOT NULL AND defaultvalue<>''").map(r => r.defaultvalue); } catch (e) { /* ad_field absent in a slim dictionary */ }
  // Login.loadDefault (Login.java L697-730): a key column whose table has an IsDefault row is filled from that row as the context default #Column
  if (/_ID$/i.test(c.columnname) && !f.defaultValue) {
    const tn = c.columnname.replace(/_ID$/i, '').toLowerCase(), tt = X.one('SELECT ad_table_id, tablename FROM ad_table WHERE lower(tablename)=' + lit(tn));
    if (tt && X.one('SELECT 1 AS x FROM ad_column WHERE ad_table_id=' + tt.ad_table_id + " AND lower(columnname)='isdefault'")) {
      let r = null; try { r = X.one('SELECT ' + c.columnname + ' AS id FROM ' + tt.tablename + " WHERE isdefault='Y' AND isactive='Y' ORDER BY ad_client_id DESC, ad_org_id DESC LIMIT 1"); } catch (e) { f.loginDefaultNote = 'table ' + tt.tablename + ' is not in this dictionary slice'; }
      if (r) f.loginDefault = { table: tt.tablename, id: r.id, via: 'Login.loadDefault #' + c.columnname };
    }
  }
  f.filledBy = f.defaultValue ? 'the column default ' + f.defaultValue : f.loginDefault ? 'the login default: the ' + f.loginDefault.table + ' row with IsDefault=Y (id ' + f.loginDefault.id + ')' : (f.fieldDefaults.length ? 'the field default ' + f.fieldDefaults[0] : 'a callout, a model rule, or nothing (no dictionary default)');
  return f;
}
async function column(a) {
  if (!a.kind || !a.column || !IDENT.test(a.column)) return refused('give kind=<table or window kind> and column=<column name>');
  const db = await seedDb(), twin = columnFacts({ one: (s) => q1(db, s), all: (s) => qa(db, s) }, a.kind, a.column);
  if (!twin.found) return refused(twin.why, twin.columns ? { columnsOfTable: twin.columns } : {});
  let legacy = null, notChecked = [];
  try {
    const X = { one: (s) => rowObj(s), all: (s) => allObj(s) };
    legacy = columnFacts(X, a.kind, a.column); if (!legacy.found) { notChecked.push('legacy: ' + legacy.why); legacy = null; } } catch (e) { notChecked.push('legacy: not reachable (' + e.message + ')'); }
  const fields = ['defaultValue', 'reference', 'mandatory', 'updateable'], diffs = legacy ? fields.filter(k => String(twin[k]) !== String(legacy[k])).concat((twin.validationRule && twin.validationRule.code) !== (legacy.validationRule && legacy.validationRule.code) ? ['validationRule'] : []).concat(JSON.stringify(twin.loginDefault && twin.loginDefault.id) !== JSON.stringify(legacy.loginDefault && legacy.loginDefault.id) ? ['loginDefault'] : []) : [];
  const verdict = !legacy ? 'TWIN-ONLY' : diffs.length ? 'DIFFERENT' : 'SAME';
  say('column ' + twin.table + '.' + twin.column + ' twin=' + twin.filledBy + ' legacy=' + (legacy ? legacy.filledBy : 'not checked') + ' verdict=' + verdict);
  out({ kind: a.kind, table: twin.table, column: twin.column, twin, legacy, differs: diffs, verdict, notChecked, summary: twin.table + '.' + twin.column + ': ' + verdict + (legacy ? '' : ' (legacy not checked)') + '; twin fills it by ' + twin.filledBy + (twin.loginDefaultNote ? ' (' + twin.loginDefaultNote + ')' : '') + (legacy ? '; legacy by ' + legacy.filledBy : '') });
  return 0;
}
// psql-backed row helpers for columnFacts (selects here always name their columns)
function parseSelect(sql) { const m = /^SELECT\s+(.*?)\s+FROM\s/is.exec(sql); return m ? m[1].split(',').map(s => { const p = s.trim().split(/\s+as\s+/i); return (p[1] || p[0]).trim().replace(/^.*\./, ''); }) : []; }
function allObj(sql) { const cols = parseSelect(sql); return pg(sql.replace(/^SELECT\s+.*?\s+FROM\s/is, (x) => x)).map(r => { const o = {}; cols.forEach((c, i) => { o[c] = r[i] === '' ? null : r[i]; }); return o; }); }
function rowObj(sql) { return allObj(sql)[0] || null; }

// ---- erp.compare ----
function erpRead(kind, number) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'erp_cli.js'), 'read', '--kind', kind, '--number', String(number)], { encoding: 'utf8', maxBuffer: 1 << 26, env: process.env });
  let j; try { j = JSON.parse(r.stdout.trim()); } catch (e) { j = null; } return { code: r.status, j, err: r.stderr };
}
async function compare(a) {
  if (!a.kind || !a.number) return refused('give kind=<kind> number=<Document No on the twin>');
  const t = erpRead(a.kind, a.number);
  if (!t.j || t.code !== 0) return refused('the twin has no ' + a.kind + ' numbered ' + a.number + (t.j && t.j.reason ? ': ' + t.j.reason : ''));
  const rec = t.j.record, legNo = a.legacy || a.number, tdb = await seedDb(), tr = q1(tdb, 'SELECT tablename FROM ad_table WHERE lower(tablename)=' + lit(String(a.kind).toLowerCase()) + ' OR lower(name)=' + lit(String(a.kind).toLowerCase()) + ' LIMIT 1');
  if (!tr) return refused('no table or window-kind named ' + a.kind);
  const table = tr.tablename.toLowerCase();
  let rows; try { rows = pg('SELECT row_to_json(t) FROM (SELECT * FROM ' + table + ' WHERE documentno=' + lit(legNo) + ' AND ad_client_id=' + (+rec.ad_client_id || 0) + ' ORDER BY ' + table + '_id) t').map(r => JSON.parse(r[0])); }
  catch (e) { return inconclusive('the legacy database is not reachable (' + e.message + '); ask legacy.status'); }
  if (!rows.length) return refused('legacy has no ' + table + ' with Document No ' + legNo + ' in client ' + rec.ad_client_id);
  if (rows.length > 1) return refused(rows.length + ' legacy ' + table + ' rows carry Document No ' + legNo + '; give legacy=<number> (ids ' + rows.map(r => r[table + '_id']).join(', ') + ')');
  const L = rows[0], SKIP = /^(.*_id|.*_uu|created|updated|createdby|updatedby|date\w*|processing|processed|documentno)$/i, KEY = new RegExp('^' + table + '_(id|uu)$', 'i');
  const keys = [...new Set(Object.keys(rec).concat(Object.keys(L)))].sort(), diffs = []; let match = 0, nvd = 0, skipped = 0, onlyT = 0, onlyL = 0;
  const norm = (v) => (v === null || v === undefined ? '' : v === true ? 'Y' : v === false ? 'N' : String(v)), num = (v) => (v !== '' && !isNaN(Number(v)) ? String(Number(v)) : v);
  keys.forEach((k) => {
    const inT = k in rec, inL = k in L; if (KEY.test(k) || /^(created|updated|createdby|updatedby|processing|processed|documentno)$/i.test(k) || (SKIP.test(k) && !/^(c_|m_|ad_org|bill_|salesrep)/i.test(k) && /^date/i.test(k))) { skipped++; return; }
    if (inT && inL) { const x = num(norm(rec[k])), y = num(norm(L[k]));
      if (x === y) match++; else if (y === '' && /^(0|N|)$/.test(x)) { nvd++; diffs.push({ column: k, twin: x, legacy: y, class: 'NULL-VS-DEFAULT' }); } else diffs.push({ column: k, twin: x, legacy: y, class: 'DIFF' }); }
    else if (norm(inT ? rec[k] : L[k]) !== '') { if (inT) onlyT++; else onlyL++; diffs.push({ column: k, twin: inT ? norm(rec[k]) : null, legacy: inL ? norm(L[k]) : null, class: inT ? 'ONLY-TWIN' : 'ONLY-LEGACY' }); }
  });
  const real = diffs.filter(d => d.class !== 'NULL-VS-DEFAULT').length, verdict = real === 0 && nvd === 0 ? 'IDENTICAL' : 'DIFFERENT';
  say('compare ' + table + ' twin=' + a.number + ' legacy=' + legNo + ' match=' + match + ' diff=' + real + ' null-vs-default=' + nvd + ' skipped=' + skipped);
  out({ kind: a.kind, table, twin: { number: String(a.number), id: rec[table + '_id'] }, legacy: { number: String(legNo), id: L[table + '_id'] }, cells: { match, diff: real, nullVsDefault: nvd, onlyTwin: onlyT, onlyLegacy: onlyL, skipped }, diffs, verdict, summary: table + ' ' + a.number + ' vs legacy ' + legNo + ': ' + match + ' cells match, ' + real + ' differ, ' + nvd + ' legacy NULL vs a twin default' });
  return 0;
}

// ---- idempiere.where ----
function where(a) {
  const sym = a.symbol || ''; if (!/^[A-Za-z_][A-Za-z0-9_.]{1,63}$/.test(sym)) return refused('symbol is a name such as InvoiceRule or CalloutOrder.docType (letters, digits, _ and .)');
  if (!fs.existsSync(SRC)) return inconclusive('the iDempiere source is not at ' + SRC + ' (set IDEMPIERE_SRC)');
  const r = spawnSync('grep', ['-rnF', '--include=*.java', '--', sym, SRC], { encoding: 'utf8', maxBuffer: 1 << 28 });
  let hits = (r.stdout || '').split('\n').filter(Boolean).map(l => { const m = BREAK === 'cr' ? /^(.*?):(\d+):(.*)$/.exec(l) : /^(.*?):(\d+):([\s\S]*)$/.exec(l.replace(/\r$/, '')); return m ? { file: path.relative(SRC, m[1]), line: +m[2], text: m[3].trim().slice(0, 200) } : null; }).filter(Boolean);
  if (a.in) hits = hits.filter(h => h.file.toLowerCase().indexOf(String(a.in).toLowerCase()) >= 0);
  const total = hits.length, files = new Set(hits.map(h => h.file)).size, cap = Math.min(Math.max(+a.limit || 25, 1), 200);
  say('where symbol=' + sym + ' hits=' + total + ' files=' + files);
  if (!total) { out({ verdict: 'INCONCLUSIVE', summary: 'no line of the iDempiere source contains ' + sym + (a.in ? ' under "' + a.in + '"' : '') }); return 3; }
  out({ symbol: sym, hits: hits.slice(0, cap), shown: Math.min(total, cap), total, files, verdict: 'OK', summary: sym + ': ' + total + ' lines in ' + files + ' files (showing ' + Math.min(total, cap) + ')' }); return 0;
}

// ---- erp.pack: a Ninja workbook -> the metadata-only 2Pack zip (the one engine, erp/tools/xlsx_pack.js; this wraps it, never re-implements it) ----
function safeRel(p, what) {   // a path the caller names must stay inside the working folder or this tree; no absolute path, no ..
  if (!p || /[\u0000-\u001f]/.test(p) || path.isAbsolute(p) || p.split(/[\\/]/).indexOf('..') >= 0) return { err: what + ' must be a relative path without ..' };
  const cwdP = path.resolve(process.cwd(), p), rootP = path.resolve(ROOT, p); return { cwd: cwdP, root: rootP };
}
function packVerb(a) {
  const b = safeRel(a.book, 'book'); if (b.err) return refused(b.err);
  if (!/\.xlsx$/i.test(a.book)) return refused('book is a .xlsx workbook (the Ninja data model)');
  const book = [b.cwd, b.root].find(f => fs.existsSync(f)); if (!book) return refused('no workbook ' + a.book + ' here or in this tree');
  if (!/^\d+\.\d+\.\d+$/.test(a.version || '')) return refused('version is x.y.z (Incremental2PackActivator applies a version once)');
  const outRel = a.out || null; let outDir = path.join(CACHE, 'pack');
  if (outRel) { const o = safeRel(outRel, 'out'); if (o.err) return refused(o.err); outDir = o.cwd; }
  const argv = [path.join(ROOT, 'erp', 'tools', 'xlsx_pack.js'), book, '--version', a.version, '--out', outDir];
  if (a.java) { const j = safeRel(a.java, 'java'); if (j.err) return refused(j.err); argv.push('--java', j.cwd); if (a.package) { if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(a.package)) return refused('package is a Java package name such as org.kernel.bim.model'); argv.push('--package', a.package); } }
  const t0 = Date.now(), r = spawnSync(process.execPath, argv, { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000, env: process.env, cwd: ROOT });
  const text = (r.stdout || '') + (r.stderr || '');
  const failed = /§XLSX-PACK FAILED (.*)/.exec(text);
  if (failed) { say('pack FAILED ' + failed[1]); const rel = (t) => t.split(ROOT + path.sep).join('').split(os.homedir()).join('~');   // no machine path in a public answer
    return /refused: .*released pack/.test(failed[1]) ? refused(rel(failed[1].replace(/^Error: /, ''))) : (/^(sheet |unknown|.*not allowed|.*unknown column|.*must be)/i.test(failed[1]) ? refused(failed[1]) : (say('FAIL ' + failed[1]), 1)); }
  const z = /§XLSX-PACK zip (\S+) (written|unchanged) elements=(\d+) records=(\d+)/.exec(text);
  if (!z) { say('FAIL xlsx_pack printed no zip line (exit ' + r.status + '): ' + text.slice(-300)); return 1; }
  const zip = path.resolve(ROOT, z[1]), zipFile = fs.existsSync(zip) ? zip : path.resolve(process.cwd(), z[1]);
  const xml = spawnSync('unzip', ['-p', zipFile, '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || '', kinds = {};
  (xml.match(/<AD_[A-Za-z_]+(?=[\s>\/])/g) || []).forEach(t => { const k = t.slice(1); if (!/_(ID|UU)$/.test(k)) kinds[k] = (kinds[k] || 0) + 1; });   // element tags only, not column attributes
  const cl = /§XLSX-PACK classes (\[.*\])/.exec(text), classes = (cl ? JSON.parse(cl[1]) : []).filter(c => /\.[A-Z]\w*$/.test(c)), java = text.split('\n').filter(l => /§XLSX-PACK java /.test(l)).length;
  const sha = require('crypto').createHash('sha256').update(BREAK === 'badsha' ? xml : fs.readFileSync(zipFile)).digest('hex');
  say('pack zip=' + path.basename(zipFile) + ' ' + z[2] + ' elements=' + z[3] + ' records=' + z[4] + ' sha256=' + sha.slice(0, 12));
  out({ book: a.book, version: a.version, zip: path.basename(zipFile), path: zipFile, status: z[2], elements: +z[3], records: +z[4], rows: kinds, classes: classes, javaFiles: java, sha256: sha, verdict: 'OK', ms: Date.now() - t0, summary: 'pack ' + a.version + ' ' + z[2] + ': ' + z[3] + ' elements, ' + z[4] + ' records, ' + classes.length + ' process classes named' });
  return 0;
}

async function main(argv) {
  const cmd = argv[0], a = {}, whereList = [];
  for (let i = 1; i < argv.length; i++) { const m = /^--(\w+)$/.exec(argv[i]); if (!m || i + 1 >= argv.length) { say('FAIL usage: ' + argv[i]); return 2; } if (m[1] === 'where') whereList.push(argv[++i]); else a[m[1]] = argv[++i]; }
  try {
    switch (cmd) {
      case 'witness-run': return witnessRun(a); case 'witness-last': return witnessLast(a); case 'legacy-status': return await legacyStatus();
      case 'legacy-query': return legacyQuery(a, whereList); case 'column': return await column(a); case 'compare': return await compare(a); case 'where': return where(a); case 'pack': return packVerb(a);
      default: say('FAIL usage: ops_cli.js witness-run|witness-last|legacy-status|legacy-query|column|compare|where|pack'); return 2;
    }
  } catch (e) { say('FAIL ' + (e && e.message)); return 1; }
}
if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c));
module.exports = { main, parseVerdict, columnFacts };
