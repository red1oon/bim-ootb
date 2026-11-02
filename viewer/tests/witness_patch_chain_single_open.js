#!/usr/bin/env node
/* ⚠ WITNESS — W-PATCH-CHAIN-ONE-OPEN, §A1 (bim-compiler prompts/CODE_HYGIENE_REVIEW_2026-11.md). READ THE LOG after every run.
 *
 * ISSUE IT PROVES OR DISPROVES: A._applyPendingPatch used to open + export the building DB once per patch (main, light-field,
 * qto = 3x DB size at peak). It now opens ONCE, applies each patch in a SAVEPOINT, exports ONCE. This must not change the
 * patched content, the order, or the per-patch failure isolation.
 *
 * Oracle = fixtures/oracle_patch_chain_pre_A1.js (verbatim pre-change chain). Input = the real Hospital_meta.db + the real
 * buildings/patches/Hospital_meta.db.sql + .qto.sql (if the local DB is absent: synthetic base, stated in the verdict) + a
 * synthetic LFP1 light-field sidecar. Equality is CONTENT equality (every table, SELECT * ORDER BY rowid, sha256) AND raw byte
 * equality is reported separately.
 *
 * NO-OP/VACUOUS/WRONG: INCONCLUSIVE (exit 2) when no patch was applied; MUTANTS (drop qto / swap order / drop light-field /
 * no rollback) must each make at least one scenario FAIL, else the witness cannot say NO and the verdict is FAIL.
 * RUN: node viewer/tests/witness_patch_chain_single_open.js          (HOSPITAL_META_DB=... to point at another base DB)
 */
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var SQLJS = [process.env.SQLJS_DIR, '/home/red1/bim-compiler/node_modules/sql.js/dist', path.join(ROOT, 'node_modules/sql.js/dist')].filter(Boolean)
  .find(function (d) { return fs.existsSync(path.join(d, 'sql-wasm.js')); });
if (!SQLJS) { console.log('§A1_VERDICT INCONCLUSIVE — sql.js not found'); process.exit(2); }
var PDIR = [path.join(ROOT, 'buildings', 'patches'), path.join(ROOT, 'viewer', 'buildings', 'patches')]
  .find(function (d) { return fs.existsSync(path.join(d, 'Hospital_meta.db.qto.sql')); });
var DB_CAND = [process.env.HOSPITAL_META_DB, '/home/red1/bim-compiler/deploy/buildings/Hospital_meta.db', path.join(ROOT, 'buildings', 'Hospital_meta.db')].filter(Boolean);

var sceneSrc = fs.readFileSync(path.join(ROOT, 'viewer', 'scene.js'), 'utf8');
var oracleSrc = fs.readFileSync(path.join(__dirname, 'fixtures', 'oracle_patch_chain_pre_A1.js'), 'utf8');
function slice(src, startMark, endMark) { var i = src.indexOf(startMark); if (i < 0) throw new Error('mark missing: ' + startMark); var j = src.indexOf(endMark, i); return src.slice(i, j + endMark.length); }
var CHUNKER = slice(sceneSrc, 'A._runSqlChunked = function', '\n  };\n');
var NEWFN = slice(sceneSrc, 'A._applyPendingPatch = async function', '\n  };\n');

(async function () {
  var SQL = await require(path.join(SQLJS, 'sql-wasm.js'))({ locateFile: function (f) { return path.join(SQLJS, f); } });
  var baseFile = DB_CAND.find(function (f) { return fs.existsSync(f) && fs.statSync(f).size > 100000 && fs.readFileSync(f).slice(0, 15).toString() === 'SQLite format 3'; });
  var mainSql = fs.readFileSync(path.join(PDIR, 'Hospital_meta.db.sql'), 'utf8'), qtoSql = fs.readFileSync(path.join(PDIR, 'Hospital_meta.db.qto.sql'), 'utf8');
  var baseBuf, baseKind;
  if (baseFile) { baseBuf = new Uint8Array(fs.readFileSync(baseFile)); baseKind = 'REAL ' + baseFile + ' (' + baseBuf.length + ' bytes)'; }
  else {
    var sd = new SQL.Database();
    sd.run('CREATE TABLE elements_meta(guid TEXT PRIMARY KEY, material_name TEXT); CREATE TABLE project_metadata(key TEXT PRIMARY KEY, value TEXT); CREATE TABLE qto_cache(a TEXT);');
    sd.run("INSERT INTO elements_meta VALUES('g1','x')"); baseBuf = sd.export(); sd.close(); baseKind = 'SYNTHETIC (real Hospital_meta.db not available locally)';
  }
  console.log('§A1_INPUT base=' + baseKind + ' mainPatch=' + mainSql.length + 'B qtoPatch=' + qtoSql.length + 'B');

  function lfp1() { var blob = Buffer.from('lightfield-blob-bytes'), H = Buffer.from(JSON.stringify({ key: 'K1', bld: 'Hospital', fp: 'FP', bytes: blob.length, raw_bytes: 99, created: '2026-11-03' }));
    var b = Buffer.alloc(8 + H.length + blob.length); b.write('LFP1'); b.writeUInt32LE(H.length, 4); H.copy(b, 8); blob.copy(b, 8 + H.length); return b; }
  function snapshot(bytes) { var d = new SQL.Database(new Uint8Array(bytes)), out = {};
    d.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0].values.forEach(function (r) { var t = r[0], rows;
      try { rows = d.exec('SELECT * FROM "' + t + '" ORDER BY rowid'); } catch (e) { rows = d.exec('SELECT * FROM "' + t + '"'); }
      out[t] = crypto.createHash('sha256').update(JSON.stringify(rows.length ? rows[0].values : [])).digest('hex').slice(0, 16) + ':' + (rows.length ? rows[0].values.length : 0); });
    d.close(); return out; }
  function sameSnap(a, b) { var ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); if (ka.join() !== kb.join()) return 'tables differ: ' + ka + ' vs ' + kb;
    for (var i = 0; i < ka.length; i++) if (a[ka[i]] !== b[ka[i]]) return 'table ' + ka[i] + ' differs ' + a[ka[i]] + ' vs ' + b[ka[i]]; return null; }

  // build an env (A, fetch map, counting SQL) and return runner for a given patch function source
  function makeEnv(files) {
    var counts = { opens: 0, exports: 0 }, logs = [];
    var CSQL = { Database: function (data) { counts.opens++; var d = new SQL.Database(data); return { run: function (s, p) { return d.run(s, p); }, exec: function (s) { return d.exec(s); },
      prepare: function (s) { return d.prepare(s); }, close: function () { return d.close(); }, export: function () { counts.exports++; return d.export(); } }; } };
    var con = { log: function () { logs.push([].join.call(arguments, ' ')); }, warn: function () { logs.push('WARN ' + [].join.call(arguments, ' ')); } };
    var fetchMock = async function (u) { var k = u.slice(u.indexOf('patches/') + 8); if (!(k in files)) return { ok: false, status: 404 };
      var v = files[k]; return { ok: true, status: 200, text: async function () { return Buffer.isBuffer(v) ? v.toString() : v; }, arrayBuffer: async function () { var b = Buffer.from(v); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } }; };
    return { counts: counts, logs: logs, A: { _SQL: CSQL }, con: con, fetch: fetchMock };
  }
  function build(env, body) { new Function('A', 'window', 'fetch', 'console', 'performance', body)(env.A, {}, env.fetch, env.con, performance); }
  var BASEURL = 'http://x/buildings/Hospital_meta.db';
  async function run(newBody, files, base) {
    var eo = makeEnv(files), en = makeEnv(files);
    build(eo, CHUNKER + '\n' + oracleSrc); build(en, CHUNKER + '\n' + newBody);
    var inO = new Uint8Array(base), inN = new Uint8Array(base);
    var o = await eo.A._applyPendingPatch(inO, BASEURL), n = await en.A._applyPendingPatch(inN, BASEURL);
    return { eo: eo, en: en, o: new Uint8Array(o), n: new Uint8Array(n), nIsInput: n === inN, oIsInput: o === inO };
  }
  var LF = lfp1();
  var scen = [
    { id: 'S1 main+lightfield+qto (real patches)', files: { 'Hospital_meta.db.sql': mainSql, 'Hospital_meta.db.lightfield.bin': LF, 'Hospital_meta.db.qto.sql': qtoSql }, newOpens: 1, newExp: 1, oldOpens: 3, patches: 3, base: baseBuf },
    { id: 'S2 main+qto (no light-field)', files: { 'Hospital_meta.db.sql': mainSql, 'Hospital_meta.db.qto.sql': qtoSql }, newOpens: 1, newExp: 1, oldOpens: 2, patches: 2, base: baseBuf },
    { id: 'S3 no patches', files: {}, newOpens: 0, newExp: 0, oldOpens: 0, patches: 0, base: baseBuf, untouched: true },
    { id: 'S4 broken qto (valid rows then a bad statement) -> qto rolled back, main kept', files: { 'Hospital_meta.db.sql': mainSql, 'Hospital_meta.db.lightfield.bin': LF, 'Hospital_meta.db.qto.sql': qtoSql + '\nINSERT INTO no_such_table_a1 VALUES(1);\n' }, newOpens: 1, newExp: 1, oldOpens: 3, patches: 2, base: baseBuf, expectLog: ['§PATCH_QTO_FAIL', '§PATCH_APPLY ', '§LIGHT_FIELD_PATCH applied'], absentLog: ['§PATCH_QTO '] },
    { id: 'S5 broken main -> light-field skipped, qto applied', files: { 'Hospital_meta.db.sql': mainSql + '\nINSERT INTO no_such_table_a1 VALUES(1);\n', 'Hospital_meta.db.lightfield.bin': LF, 'Hospital_meta.db.qto.sql': qtoSql }, newOpens: 1, newExp: 1, oldOpens: 2, patches: 1, base: baseBuf, expectLog: ['§PATCH_APPLY_FAIL', '§PATCH_QTO '], absentLog: ['§LIGHT_FIELD_PATCH applied'] },
    { id: 'S6 order-sensitive synthetic (qto UPDATE reads main INSERT)', files: { 'Hospital_meta.db.sql': 'CREATE TABLE a1t(v INTEGER);\nINSERT INTO a1t VALUES(1);\n', 'Hospital_meta.db.qto.sql': 'UPDATE a1t SET v=v*10+2;\n' }, newOpens: 1, newExp: 1, oldOpens: 2, patches: 2,
      base: (function () { var d = new SQL.Database(); d.run('CREATE TABLE seed(x)'); var b = d.export(); d.close(); return b; })() }
  ];
  var VERDICT_FAIL = [];
  async function suite(newBody, label, quiet) {
    var fails = [], exercised = 0, rows = [];
    for (var i = 0; i < scen.length; i++) { var s = scen[i], r;
      try { r = await run(newBody, s.files, s.base); } catch (e) { fails.push(s.id + ' threw ' + e.message); continue; }
      var why = [];
      var diff = sameSnap(snapshot(r.o), snapshot(r.n)); if (diff) why.push('CONTENT ' + diff);
      var bytesEq = Buffer.compare(Buffer.from(r.o), Buffer.from(r.n)) === 0;
      if (r.en.counts.opens !== s.newOpens || r.en.counts.exports !== s.newExp) why.push('new opens/exports ' + r.en.counts.opens + '/' + r.en.counts.exports + ' != ' + s.newOpens + '/' + s.newExp);
      if (r.eo.counts.opens !== s.oldOpens) why.push('oracle opens ' + r.eo.counts.opens + ' != ' + s.oldOpens + ' (oracle drifted)');
      if (s.untouched && !(r.nIsInput)) why.push('no-patch path did not return the input buffer untouched');
      if (process.env.A1_DEBUG) console.log('DBG ' + s.id + '\n  NEWLOGS ' + r.en.logs.map(function (l) { return l.slice(0, 110); }).join('\n  '));
      var chain = r.en.logs.filter(function (l) { return l.indexOf('§PATCH_CHAIN') === 0; })[0];
      if (!chain || chain.indexOf('patches=' + s.patches) < 0) why.push('§PATCH_CHAIN missing/wrong: ' + chain);
      // same log lines (text up to first digits-free prefix) as the oracle, minus the new chain line
      var norm = function (a) { return a.filter(function (l) { return l.indexOf('§PATCH_CHAIN') !== 0; }).map(function (l) { return l.replace(/ms=\d+/g, '').replace(/\(\d+ bytes, /, '(').replace(/\d+ chunk\(s\)/, 'N chunk(s)'); }); };
      if (JSON.stringify(norm(r.eo.logs)) !== JSON.stringify(norm(r.en.logs))) why.push('log lines differ from oracle:\n  OLD ' + norm(r.eo.logs).map(function (l) { return l.slice(0, 70); }).join(' | ') + '\n  NEW ' + norm(r.en.logs).map(function (l) { return l.slice(0, 70); }).join(' | '));
      (s.expectLog || []).forEach(function (m) { if (!r.en.logs.some(function (l) { return l.indexOf(m) >= 0; })) why.push('expected log missing: ' + m); });
      (s.absentLog || []).forEach(function (m) { if (r.en.logs.some(function (l) { return l.indexOf(m) >= 0; })) why.push('unexpected log present: ' + m); });
      if (s.patches > 0) exercised++;
      if (s.id.indexOf('S6') === 0) { var d = new SQL.Database(r.n); var v = d.exec('SELECT v FROM a1t')[0].values[0][0]; d.close(); if (v !== 12) why.push('S6 value ' + v + ' != 12 (main then qto)'); }
      if (s.id.indexOf('S4') === 0) { var q = function (b) { var d2 = new SQL.Database(b); var c = d2.exec('SELECT count(*) FROM qto_cache')[0].values[0][0]; d2.close(); return c; }; rows.push('qto_cache rows after S4 = ' + q(r.n)); }
      rows.push((why.length ? 'FAIL ' : 'ok   ') + s.id + ' | opens old/new ' + r.eo.counts.opens + '/' + r.en.counts.opens + ' exports old/new ' + r.eo.counts.exports + '/' + r.en.counts.exports + ' | content ' + (diff ? 'DIFF' : 'identical') + ' | bytes ' + (bytesEq ? 'identical' : 'differ (page layout; content compared)') + ' | ' + chain);
      if (why.length) fails.push(s.id + ': ' + why.join('; '));
    }
    if (!quiet) rows.forEach(function (l) { console.log('§A1 ' + label + ' ' + l); });
    return { fails: fails, exercised: exercised };
  }

  var base = await suite(NEWFN, 'NEW', false);
  base.fails.forEach(function (f) { console.log('§A1_FAIL ' + f); });

  // mutants: each must make the suite FAIL
  function mut(name, from, to) { if (NEWFN.indexOf(from) < 0) throw new Error('mutation anchor missing: ' + name); return { name: name, body: NEWFN.replace(from, to) }; }
  var mutants = [
    mut('drop-qto (qto text ignored)', 'var qsql = P.qto.text', "var qsql = ''"),
    mut('swap-order (qto text applied as main, main text as qto)', 'var sql = P.main.text', 'var sql = P.qto.text'),
    mut('drop-lightfield (never applied)', 'var lr = step(function(d) {', 'var lr = (function(f){ return {}; })(function(d) {'),
    mut('no-rollback (failed patch leaves partial writes)', "db.run('ROLLBACK TO a1_patch'); db.run('RELEASE a1_patch');", "db.run('RELEASE a1_patch');")
  ];
  mutants[1].body = mutants[1].body.replace('var qsql = P.qto.text', 'var qsql = P.main.text');
  var survived = [];
  for (var m = 0; m < mutants.length; m++) { var mr = await suite(mutants[m].body, 'MUT', true); var killed = mr.fails.length > 0;
    console.log('§A1_MUTANT ' + mutants[m].name + ' -> ' + (killed ? 'KILLED (witness said NO: ' + mr.fails[0].slice(0, 90) + ')' : 'SURVIVED')); if (!killed) survived.push(mutants[m].name); }

  if (base.exercised === 0) { console.log('§A1_VERDICT INCONCLUSIVE — no patch exercised'); process.exit(2); }
  if (base.fails.length || survived.length) { console.log('§A1_VERDICT FAIL — scenario failures=' + base.fails.length + ' surviving mutants=' + survived.length); process.exit(1); }
  console.log('§A1_VERDICT PASS — ' + scen.length + ' scenarios identical to the pre-change chain, ' + mutants.length + '/' + mutants.length + ' mutants killed, base=' + baseKind);
})().catch(function (e) { console.log('§A1_VERDICT FAIL — exception ' + (e && e.stack)); process.exit(1); });
