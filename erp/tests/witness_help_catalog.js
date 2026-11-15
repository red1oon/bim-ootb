// ⚠ DO NOT REMOVE — W-HELP-CATALOG (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §2, P1: the Help read layer). READ THE LOG; an exit code is not evidence.
//   H1 ISSUE (removing the copied Help/Description loses text) · H2 ISSUE (a no-op that proves nothing) · H3 ISSUE (the levels answer from the wrong chain)
//   H4 ISSUE (a derived tip that states something the dictionary does not) · H5 ISSUE (a population that hides what is still empty, or text a field GAINS)
//   Falsifiers: HELP_BREAK=dropoverride FAILs H1 · swaplevel FAILs H3 · derivealways FAILs H4. Each claim can say VACUOUS / INCONCLUSIVE.
//   Runs on a THROWAWAY copy of the seed; the seed is never written. ERP_SEED_DB overrides the seed path.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib'), cp = require('child_process');
const { kit, ROOT } = require('../../common/door/tests/_kit');
const { makeResolver } = require('../help_catalog');
const k = kit('W-HELP-CATALOG');
const SEED = process.env.ERP_SEED_DB || path.join(ROOT, 'erp', 'ad_seed.db');
const BREAK = process.env.HELP_BREAK || '';
const mkq = (db) => (sql) => { const r = cp.spawnSync('sqlite3', ['-readonly', '-json', db, sql], { encoding: 'utf8', maxBuffer: 1 << 29 }); if (r.status !== 0) throw new Error('sqlite3: ' + r.stderr); return JSON.parse(r.stdout || '[]'); };
const blank = (s) => s == null || String(s).trim() === '';
(function main() {
  if (!fs.existsSync(SEED) || fs.statSync(SEED).size < 1e6) { k.incon('ALL', 'no usable seed at ' + SEED); return k.end(); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpcat_')), copy = path.join(dir, 'seed_dedup.db');
  fs.copyFileSync(SEED, copy);
  const run = (sql) => { const r = cp.spawnSync('sqlite3', [copy, sql], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); };
  // the throwaway copy: a copy equal to its parent's text becomes NULL (fields against the ORIGINAL columns first, then columns against elements)
  run(['help', 'description'].map((c) => 'UPDATE ad_field SET ' + c + '=NULL WHERE ' + c + ' IS NOT NULL AND EXISTS(SELECT 1 FROM ad_column c WHERE c.ad_column_id=ad_field.ad_column_id AND c.' + c + '=ad_field.' + c + ');').join('\n'));
  run(['help', 'description'].map((c) => 'UPDATE ad_column SET ' + c + '=NULL WHERE ' + c + ' IS NOT NULL AND EXISTS(SELECT 1 FROM ad_element e WHERE e.ad_element_id=ad_column.ad_element_id AND e.' + c + '=ad_column.' + c + ');').join('\n'));
  const orig = mkq(SEED);
  if (BREAK === 'dropoverride') { // falsifier: the copy also drops one REAL override (a field whose Help differs from its column's)
    const o = orig("SELECT f.ad_field_id id FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE length(trim(coalesce(f.help,''),char(32,9,10,11,12,13)))>20 AND trim(coalesce(c.help,''),char(32,9,10,11,12,13))<>'' AND f.help<>c.help LIMIT 1");
    if (o.length) run('UPDATE ad_field SET help=NULL WHERE ad_field_id=' + o[0].id + ';');
  }
  run('VACUUM;');
  const dd = mkq(copy), R = makeResolver(dd);
  // ---- H1 lossless, per kind: the resolver on the copy returns the ORIGINAL stored string
  const kinds = [
    ['column Help', 'SELECT ad_column_id id, help t FROM ad_column', (id) => R.help('student', { columnId: id }), (r) => r.source !== 'derived' && r.source !== 'none' ? r.text : null],
    ['field Help', 'SELECT ad_field_id id, help t FROM ad_field', (id) => R.help('student', { fieldId: id }), (r) => r.source !== 'derived' && r.source !== 'none' ? r.text : null],
    ['column Description', 'SELECT ad_column_id id, description t FROM ad_column', (id) => R.help('short', { columnId: id }), (r) => r.text],
    ['field Description', 'SELECT ad_field_id id, description t FROM ad_field', (id) => R.help('short', { fieldId: id }), (r) => r.text],
  ];
  let allOk = true, parts = [], bad = [];
  kinds.forEach(([name, sql, get, pick], i) => {
    const rows = orig(sql).filter((r) => !blank(r.t));
    let ok = 0; rows.forEach((r) => { const got = pick(get(r.id)); if (got === r.t) ok++; else if (bad.length < 3) bad.push(name + ' #' + r.id); });
    parts.push(name + ' ' + ok + ' of ' + rows.length); if (ok !== rows.length || !rows.length) allOk = false;
  });
  k.chk('H1 lossless: the resolver on the copy returns the original stored text for every written text (' + parts.join('; ') + ')', allOk, allOk ? '' : 'first misses: ' + bad.join(', '));
  // ---- H2 the copies really went
  const sum = (q, t, c) => q('SELECT coalesce(sum(length(' + c + ')),0) n FROM ' + t)[0].n;
  const b0 = sum(orig, 'ad_column', 'help') + sum(orig, 'ad_field', 'help'), b1 = sum(dd, 'ad_column', 'help') + sum(dd, 'ad_field', 'help');
  const raw0 = fs.statSync(SEED).size, raw1 = fs.statSync(copy).size, gz0 = zlib.gzipSync(fs.readFileSync(SEED), { level: 9 }).length, gz1 = zlib.gzipSync(fs.readFileSync(copy), { level: 9 }).length;
  k.L('H2 help chars stored in column+field: ' + b0 + ' -> ' + b1 + '; file raw ' + raw0 + ' -> ' + raw1 + ' (' + Math.round((raw0 - raw1) * 100 / raw0) + '% smaller); gzip ' + gz0 + ' -> ' + gz1 + ' (' + Math.round((gz0 - gz1) * 100 / gz0) + '% smaller)');
  if (b1 >= b0) k.incon('H2', 'VACUOUS: the copy stores no fewer help characters'); else k.chk('H2 the copies went: ' + b0 + ' -> ' + b1 + ' help characters stored (' + Math.round((b0 - b1) * 100 / b0) + '% fewer)', true);
  // ---- H3 levels vs an independent SQL (CASE chains), over every displayed active field
  const WS = 'char(32,9,10,11,12,13)', NB = (x) => 'trim(coalesce(' + x + ",'')," + WS + ")<>''"; // SQLite trim() strips only spaces by default; blank here = JS trim()'s whitespace (three fields store a lone newline as Help)
  const CH = (c) => 'CASE WHEN ' + NB('f.' + c) + ' THEN f.' + c + ' WHEN ' + NB('c.' + c) + ' THEN c.' + c + ' WHEN ' + NB('e.' + c) + ' THEN e.' + c + ' END';
  const F = orig('SELECT f.ad_field_id id, f.name fname, c.ad_column_id cid, ' + CH('help') + ' eh, ' + CH('description') + ' ed, trim(coalesce(f.help,\'\'),char(32,9,10,11,12,13)) fh FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id JOIN ad_element e ON e.ad_element_id=c.ad_element_id WHERE f.isdisplayed=\'Y\' AND f.isactive=\'Y\'');
  let h3 = 0, h3n = 0, h3bad = [];
  F.forEach((r) => {
    const s = R.help('student', { fieldId: r.id }), sh = R.help('short', { fieldId: r.id });
    const expS = r.eh != null ? r.eh : r.ed, expSh = r.ed;
    if (expS != null || expSh != null) { h3n++; const okS = expS == null || (s.text === expS && !s.derived), okSh = expSh == null ? sh.text === '' : sh.text === expSh; if (okS && okSh) h3++; else if (h3bad.length < 3) h3bad.push(r.id + ':' + r.fname); }
  });
  if (!h3n) k.incon('H3', 'VACUOUS: no displayed field has a written text'); else k.chk('H3 the levels: ' + h3 + ' of ' + h3n + ' displayed fields with written text answer as the independent CHAIN query says (student = Help chain, else Description chain; short = Description chain)', h3 === h3n, h3 === h3n ? '' : 'first misses: ' + h3bad.join(', '));
  // ---- H4 derived tips are facts (independent queries) and only where nothing is written
  const none = F.filter((r) => r.eh == null && r.ed == null);
  let d = 0, dOk = 0, dBad = [], leak = 0, gaps = 0;
  none.forEach((r) => {
    const s = R.help('student', { fieldId: r.id });
    if (!s.derived) return; d++;
    const c = orig('SELECT ad_reference_id rf, ad_reference_value_id rv, ismandatory m, defaultvalue df, columnname n FROM ad_column WHERE ad_column_id=' + r.cid)[0];
    let ok = s.source === 'derived' && (String(c.m) === 'Y') === /\bRequired\./.test(s.text);
    if (c.rf === 17) { const L = c.rv == null ? [] : orig("SELECT value v, name n FROM ad_ref_list WHERE isactive='Y' AND ad_reference_id=" + c.rv + ' ORDER BY value'); ok = ok && (L.length ? s.text.includes('One of: ' + L.map((x) => x.v + ' (' + x.n + ')').join(', ') + '.') : !/One of:/.test(s.text)); if (c.rv == null) gaps++; }
    if (c.rf === 19) ok = ok && s.text.includes('Refers to a ' + String(c.n).replace(/_ID$/, '') + ' record.');
    if (c.rf === 18 || c.rf === 30) { const T = c.rv == null ? [] : orig('SELECT t.tablename tn FROM ad_ref_table r JOIN ad_table t ON t.ad_table_id=r.ad_table_id WHERE r.ad_reference_id=' + c.rv); ok = ok && (T.length ? s.text.includes('Refers to a ' + T[0].tn + ' record.') : !/Refers to a/.test(s.text)); if (c.rv == null) gaps++; }
    if (!blank(c.df)) ok = ok && s.text.includes('Default: ' + c.df + '.');
    if (ok) dOk++; else if (dBad.length < 3) dBad.push(r.id + ':' + r.fname);
  });
  k.L('H4 dictionary gap seen: ' + gaps + ' of the derived-tip fields have a List or Search column that names no list or table (no values to state, so none are stated)');
  F.filter((r) => r.eh != null || r.ed != null).forEach((r) => { if (R.help('student', { fieldId: r.id }).derived) leak++; });
  if (!d) k.incon('H4', 'VACUOUS: no displayed field qualified for a derived tip'); else k.chk('H4 derived tips are facts: ' + dOk + ' of ' + d + ' tips match the independent queries (list values with names, lookup table, Required, default); derived for a field that HAS written text: ' + leak, dOk === d && leak === 0, dOk === d && !leak ? '' : 'first misses: ' + dBad.join(', '));
  // ---- H5 the population, nothing hidden; what a field GAINS
  const written = F.length - none.length, derived = d, empty = none.length - d, empt = none.filter((r) => !R.help('student', { fieldId: r.id }).derived);
  k.chk('H5 population of ' + F.length + ' displayed fields: written ' + written + ' + derived ' + derived + ' + still empty ' + empty + ' = ' + (written + derived + empty), written + derived + empty === F.length);
  k.L('H5 still empty (first 12 of ' + empt.length + '): ' + empt.slice(0, 12).map((r) => r.fname).join(' | '));
  const gain = F.filter((r) => r.fh === '' && r.eh != null);
  k.L('H5 GAIN: ' + gain.length + ' displayed fields have no Help of their own and resolve to their column\'s or element\'s written Help (first: ' + gain.slice(0, 5).map((r) => r.fname).join(' | ') + ')');
  k.L('H5 build: ' + JSON.stringify(R.size) + ' copy=' + copy);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* the temp copy */ }
  k.end();
})();
