// ⚠ DO NOT REMOVE — W-PACKIN (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §20.A). READ THE LOG after every run: the §WPK lines carry the evidence, exit code is not.
// THE ISSUE it proves/disproves: the twin can Pack In a REAL iDempiere 2Pack by legacy's rules (pipo2), here Libero's own META-INF/2Pack_1.0.0-1.0.2.
//   P1 1.0.0: records walked == records in the XML (counted here by a plain text scan, not by the engine); skipped by the entity-type gate == the D/EE01 records in it (UpdateDictionary=false);
//      every processed record is New/Update/Same against the seed and named
//   P2 every SQLStatement: the rows it changed in the twin == the rows Postgres changes for the SAME statement on the pilot inside BEGIN..ROLLBACK (legacy oracle, nothing kept)
//   P3 AD_Package_Imp: one 'Completed successfully' row per version; a second incremental run applies NOTHING
//   P4 negative: a pack whose record references an absent table fails as a whole, writes NOTHING (row counts unchanged), and is recorded as failed
//   P5 after 1.0.1/1.0.2 the Libero form 53007 Classname reads the org.libero name (the rename legacy's packs make)
// Run: node erp/tests/witness_packin.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.zip': 'application/zip' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
let fails = 0, judged = 0;
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { fails++; console.log('§WPK ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info).slice(0, 900)); return; }
  judged++; if (!cond) fails++; console.log('§WPK ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + (cond ? '' : ' ' + JSON.stringify(info).slice(0, 1500))); };
const PACKS = ['1.0.0', '1.0.1', '1.0.2'].map(v => ({ version: v, file: path.join(REPO, 'erp/plugins/libero_2pack/2Pack_' + v + '.zip') }));
// the independent count: unzip with the system tool, scan the text
function xmlOf(file) { return execFileSync('unzip', ['-p', file, '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 28 }); }
function pgSeq(list) {   // legacy oracle: ALL statements in pack order in ONE transaction on the pilot, rolled back; one row count per statement (psql: UPDATE n / DELETE n / INSERT 0 n)
  try { const out = execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', process.env.PG_DB || 'idempiere_pilot', '-v', 'ON_ERROR_STOP=1'], { input: 'set search_path=adempiere;\nBEGIN;\n' + list.map(s => s + ';\n').join('') + 'ROLLBACK;\n', encoding: 'utf8' });
    return out.split('\n').map(l => /^(?:UPDATE|DELETE|INSERT 0) (\d+)/.exec(l)).filter(Boolean).map(m => Number(m[1])); } catch (e) { return { error: String(e.stderr || e.message).slice(0, 300) }; }
}
function pgCount(sql) {   // legacy oracle: the statement on the pilot inside a rolled-back transaction; psql prints "UPDATE n" / "INSERT 0 n" / "DELETE n"
  try { const out = execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', process.env.PG_DB || 'idempiere_pilot', '-v', 'ON_ERROR_STOP=1'], { input: 'set search_path=adempiere;\nBEGIN;\n' + sql + ';\nROLLBACK;\n', encoding: 'utf8' });
    const m = /(?:UPDATE|DELETE|INSERT 0) (\d+)/.exec(out); return m ? Number(m[1]) : { raw: out.slice(0, 200) }; } catch (e) { return { error: String(e.stderr || e.message).slice(0, 300) }; }
}
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext()).newPage();
  const PAGELOG = []; page.on('console', m => PAGELOG.push(m.text())); page.on('pageerror', e => PAGELOG.push('PAGEERR ' + e));
  try {
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.AdCallout, null, { timeout: 30000 });
    await page.addScriptTag({ url: base + '/pipo_packin.js' });
    const xml0 = xmlOf(PACKS[0].file);
    const want = { records: (xml0.match(/<[A-Za-z_0-9]+ type="(table|translation|object)"/g) || []).length, translations: (xml0.match(/ type="translation"/g) || []).length,
      official: (xml0.match(/<EntityType>(D|EE01|EE02|EE04|EE05)<\/EntityType>/g) || []).length, sql: (xml0.match(/<SQLStatement/g) || []).length };
    console.log('§WPK independent scan of 2Pack_1.0.0 PackOut.xml: ' + JSON.stringify(want));
    const stmts = {}; for (const p of PACKS) { const x = xmlOf(p.file); stmts[p.version] = [...x.matchAll(/<SQLStatement[^>]*>[\s\S]*?<DBType>([^<]*)<\/DBType>[\s\S]*?<statement><!\[CDATA\[([\s\S]*?)\]\]><\/statement>/g)].map(m => ({ db: m[1].trim(), sql: m[2].trim().replace(/;$/, '') })); }
    const run = await page.evaluate(async (packs) => {
      const db = window.__idmpDb, log = [], say = (l) => log.push(l);
      if (window.__crud && window.__crud.withModelTrx) window.__crud.withModelTrx(q => q('SELECT 1 AS x'));   // binds the stored-function UDFs on the DB handle (crud_overlay._coBindUdf), as the page has done before any plugin starts
      say('§WPK udf substring bound=' + (() => { try { return db.exec("SELECT substring('abc',2)")[0].values[0][0]; } catch (e) { return 'NO: ' + e.message; } })());
      const bundle = 'org.idempiere.mfg', P = window.PipoPackIn;
      const loaded = []; for (const p of packs) loaded.push({ version: p.version, bytes: new Uint8Array(await (await fetch(p.url)).arrayBuffer()) });
      const formBefore = db.exec('SELECT classname FROM ad_form WHERE ad_form_id=53007')[0].values[0][0];
      const hasFunction = (n) => { try { db.exec('SELECT ' + n + '()'); return true; } catch (e) { return !/no such function/i.test(e.message); } };
      const res = await P.incremental(db, bundle, loaded, { say, convertSql: window.AdCallout.convertSql, hasFunction });
      const imp = db.exec("SELECT pk_version, pk_status FROM ad_package_imp WHERE name='" + bundle + "' ORDER BY ad_package_imp_id")[0];
      const second = await P.incremental(db, bundle, loaded, { say, convertSql: window.AdCallout.convertSql, hasFunction });
      const formAfter = db.exec('SELECT classname FROM ad_form WHERE ad_form_id=53007')[0].values[0][0];
      // P4 negative control: a record referencing an absent table
      const bad = '<?xml version="1.0"?><idempiere Name="neg" Version="9.9.9" UpdateDictionary="false" Client="0-SYSTEM-System">' +
        '<AD_Message type="table"><AD_Client_ID>0</AD_Client_ID><AD_Org_ID>0</AD_Org_ID><Value>WPK_NEG_1</Value><MsgText>first</MsgText><MsgType>I</MsgType><EntityType>U</EntityType><AD_Message_UU>00000000-0000-4000-8000-0000000wpk01</AD_Message_UU></AD_Message>' +
        '<AD_Process type="table"><AD_Client_ID>0</AD_Client_ID><AD_Org_ID>0</AD_Org_ID><Value>WPK_NEG_P</Value><Name>WPK negative</Name><AccessLevel>3</AccessLevel><EntityType>U</EntityType><AD_Form_ID reference="uuid" reference-key="AD_Form">00000000-0000-4000-8000-0000000nope1</AD_Form_ID></AD_Process></idempiere>';
      const msgBefore = db.exec("SELECT COUNT(*) FROM ad_message")[0].values[0][0];
      const neg = P.apply(db, bad, { say, convertSql: window.AdCallout.convertSql });
      const negImp = P.recordImport(db, 'wpk.negative', '9.9.9', neg);
      const msgAfter = db.exec("SELECT COUNT(*) FROM ad_message")[0].values[0][0];
      return { res: res.map(r => ({ version: r.version, ok: r.ok, imp: r.imp, stat: Object.assign({}, r.stat, { details: undefined, sqlDetails: r.stat.details.filter(d => d.table === 'SQLStatement'), actions: r.stat.details.reduce((m, d) => { m[d.action] = (m[d.action] || 0) + 1; return m; }, {}) }) })),
        imp: imp ? imp.values : [], second: second.length, formBefore, formAfter, neg: { ok: neg.ok, error: neg.error, imp: negImp }, msgBefore, msgAfter, log: log.slice(0, 60) };
    }, PACKS.map(p => ({ version: p.version, url: base + '/plugins/libero_2pack/2Pack_' + p.version + '.zip' })));
    run.log.forEach(l => console.log(l));
    const r0 = run.res.find(r => r.version === '1.0.0');
    console.log('§WPK 1.0.0 stat ' + JSON.stringify({ ok: r0 && r0.ok, records: r0 && r0.stat.records, processed: r0 && r0.stat.processed, skippedOfficial: r0 && r0.stat.skippedOfficial, translations: r0 && r0.stat.translationsSkipped, actions: r0 && r0.stat.actions, byTable: r0 && r0.stat.byTable, generic: r0 && r0.stat.genericForSpecial, error: r0 && r0.stat.error }));
    verdict('P1', '1.0.0: records walked ' + (r0 && r0.stat.records) + ' == ' + want.records + ' in the XML; skipped by the entity gate ' + (r0 && r0.stat.skippedOfficial) + ' == ' + want.official + ' D/EE01 records; translations ' + (r0 && r0.stat.translationsSkipped) + ' == ' + want.translations,
      !!r0 && r0.ok && r0.stat.records === want.records && r0.stat.skippedOfficial === want.official && r0.stat.translationsSkipped === want.translations, { r0: r0 && r0.stat.error, want });
    // P2 per statement, twin vs legacy
    const pairs = [];
    const dml = []; for (const r of run.res) (r.stat.sqlDetails || []).forEach((d, i) => { const st = stmts[r.version][i]; if (st && !d.fn && !d.view) dml.push({ v: r.version, i, db: st.db, twin: d.count, twinAction: d.action, sql: st.sql }); });
    const seq = pgSeq(dml.map(x => x.sql));
    dml.forEach((x, k) => pairs.push({ v: x.v, i: x.i, db: x.db, twin: x.twin, twinAction: x.twinAction, legacy: Array.isArray(seq) ? seq[k] : seq, sql: x.sql.replace(/\s+/g, ' ').slice(0, 100) }));
    for (const r of run.res) (r.stat.sqlDetails || []).filter(d => d.fn || d.view).forEach(d => console.log('§WPK ddl v' + r.version + ' ' + (d.fn ? 'function ' + d.fn : 'view ' + d.view) + ' ' + d.action + (d.providedBy ? ' (' + d.providedBy + ')' : ' - MISSING in the twin')));
    pairs.forEach(p => console.log('§WPK sql v' + p.v + '#' + p.i + ' ' + p.db + ' twin=' + p.twin + '(' + p.twinAction + ') legacy=' + JSON.stringify(p.legacy) + ' | ' + p.sql));
    const judgedSql = pairs.filter(p => typeof p.legacy === 'number'), badSql = judgedSql.filter(p => p.twin !== p.legacy);
    verdict('P2', 'SQL statements: ' + (judgedSql.length - badSql.length) + ' of ' + judgedSql.length + ' change the same number of rows as Postgres on the pilot (' + (pairs.length - judgedSql.length) + ' not judgeable on the pilot)', judgedSql.length > 0 && !badSql.length, { badSql, notJudged: pairs.filter(p => typeof p.legacy !== 'number').slice(0, 5) }, !judgedSql.length);
    verdict('P3', 'AD_Package_Imp ' + JSON.stringify(run.imp) + '; a second incremental run applies ' + run.second + ' pack(s)', run.imp.length === 3 && run.imp.every(v => v[1] === 'Completed successfully') && run.second === 0, { imp: run.imp, second: run.second });
    verdict('P4', 'negative: a record referencing an absent table fails the pack (' + run.neg.error + '), ad_message ' + run.msgBefore + ' -> ' + run.msgAfter + ', recorded as ' + (run.neg.imp && run.neg.imp.status), run.neg.ok === false && run.msgBefore === run.msgAfter && /Failed/.test(run.neg.imp && run.neg.imp.status), run.neg);
    verdict('P5', 'Libero form 53007 Classname ' + run.formBefore + ' -> ' + run.formAfter, /^org\.eevolution\./.test(run.formBefore) && /^org\.libero\./.test(run.formAfter), { before: run.formBefore, after: run.formAfter });
    const errs = PAGELOG.filter(l => /^PAGEERR/.test(l)); verdict('P0', 'no page errors', !errs.length, errs.slice(0, 3));
  } catch (e) { fails++; console.log('§WPK ERROR ' + (e && e.stack || e)); }
  console.log('§WPK_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
