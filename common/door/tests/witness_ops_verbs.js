#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-OPS-VERBS (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.V item 13, film "From AI to Human"). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: the verbs that replace the assistant's hand-run scripts (witness.run/last, legacy.status/query, erp.column, erp.compare, idempiere.where) answer something the hand-run did not:
 *   they report a number the legacy side or the source does not hold, hide a legacy that is down behind a plausible answer, cap rows without saying so, or lose source lines.
 * Every claim is checked against an INDEPENDENT read (docker psql / grep / curl run here, not by the verb).
 *   O1 legacy.status verdict = what docker + curl say here; a missing container is DOWN, never UP
 *   O2 legacy.query: total = an independent count(*); limit caps the rows and total stays whole; an unknown column is refused naming the real ones; legacy down = inconclusive
 *   O3 erp.column: C_Order.DocAction default is CO on both sides (SAME); C_ConversionType_ID: legacy login default id = an independent IsDefault='Y' read, and the twin's missing table is SAID (not hidden)
 *   O4 erp.compare: a twin order made here vs legacy order 50981 differs in exactly the cells recorded in scripts/bridge/out/erpnew_twin_2026-11-10.log (HEAD cells); a missing legacy number is refused (ambiguous numbers: not exercised); legacy down = inconclusive
 *   O5 idempiere.where: total = an independent grep count, including lines of files with Windows line endings; a bad symbol is refused; no match is INCONCLUSIVE, not zero
 *   O6 witness.run: a PASS stub, a FAIL stub and an INCONCLUSIVE stub keep their own verdicts; a stub with no verdict line is an ERROR; the log file holds the stub's output; witness.last returns the recorded run without re-running
 *   O7 an AI may call these read/trial verbs (they run, they are not held as claims)
 *   O8 erp.pack (wraps erp/tools/xlsx_pack.js): the sample workbook gives a zip whose sha256 and per-table row counts equal independent sha256sum / unzip reads; the same call again is `unchanged`; the same version with an edited workbook is refused (immutable); an absolute path, .., a non-.xlsx, a missing file and a bad version are refused and write nothing; an AI's call is a held claim that writes nothing
 * Falsifiers (each must make this witness FAIL): OPS_BREAK=nocap (O2) · OPS_BREAK=cr (O5) · OPS_BREAK=badsha (O8).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const { kit, run, DOOR, ROOT } = require('./_kit');
const k = kit('W-OPS-VERBS');
const SRC = process.env.IDEMPIERE_SRC || path.join(os.homedir(), 'idempiere-dev-setup', 'idempiere');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsverbs_')), J = path.join(dir, 'j.jsonl'), OPS = path.join(dir, 'ops.jsonl'), CACHE = path.join(dir, 'cache');
  const base = { BIM_DOOR_JOURNAL: J, BIM_OBJECT_OPLOG: OPS, OPS_CACHE: CACHE };
  let n = 0;
  const door = async (line, extra, actor) => { const r = await run(DOOR, ['--actor', actor || 'human', '--request', 'ov-' + (++n), '--journal', J, line], Object.assign({}, base, extra || {})); let j = null; try { j = JSON.parse(r.out.trim()); } catch (e) {} return { j, r }; };
  const psql = (sql) => spawnSync('docker', ['exec', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere_pilot', '-At', '-c', sql], { encoding: 'utf8' });
  const DOWN = { OPS_PG_CONTAINER: 'no_such_container_for_the_witness' };
  const st = await door('legacy.status');
  const ps = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout.split('\n'), pgRun = ps.indexOf('postgres') >= 0;
  const curl = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', 'http://localhost:8088/webui/'], { encoding: 'utf8' }).stdout.trim();
  const legacyUp = pgRun && psql('select 1').status === 0;
  if (!legacyUp) { k.incon('O1-O4', 'the legacy test Postgres is not up here, so nothing can be compared with it'); }
  // O1
  const stDown = await door('legacy.status', DOWN);
  const wantV = legacyUp && curl === '200' ? 'UP' : (legacyUp || curl === '200' ? 'PARTIAL' : 'DOWN');
  k.chk('O1 legacy.status = docker + curl read here; a missing container is not UP', !!st.j && st.j.answer && st.j.answer.verdict === wantV && !!stDown.j && stDown.j.answer.verdict !== 'UP' && /not running|not reachable/.test(stDown.j.answer.postgres.state), st.j ? 'verdict=' + st.j.answer.verdict + ' expected=' + wantV + ' http=' + curl + ' | no-container=' + (stDown.j && stDown.j.answer.verdict) : st.r.err.slice(-160));
  if (legacyUp) {
    // O2
    const want = +psql("select count(*) from c_order where ad_client_id=11").stdout.trim();
    const q = await door('legacy.query table=c_order ad_client_id=11 columns=documentno,docstatus limit=3'), a = q.j && q.j.answer;
    k.chk('O2a legacy.query total = an independent count(*); limit caps the rows, total stays whole', !!a && a.total === want && a.rows.length === 3 && a.shown === 3, a ? 'total=' + a.total + ' want=' + want + ' rows=' + a.rows.length : (q.j ? q.j.status + ' ' + q.j.why : q.r.err.slice(-160)));
    const bad = await door('legacy.query table=c_order nosuchcolumn=1');
    k.chk('O2b an unknown column is refused naming the real ones', !!bad.j && bad.j.status === 'refused' && bad.j.answer && bad.j.answer.columnsOfTable.indexOf('documentno') >= 0 && /nosuchcolumn/.test(bad.j.why), bad.j ? bad.j.status + ' ' + String(bad.j.why).slice(0, 90) : '');
    const dn = await door('legacy.query table=c_order', DOWN);
    k.chk('O2c legacy down = inconclusive, not an empty list', !!dn.j && dn.j.status === 'inconclusive', dn.j ? dn.j.status : dn.r.err.slice(-120));
    // O3
    const c1 = await door('erp.column kind=Order column=DocAction'), x1 = c1.j && c1.j.answer;
    k.chk('O3a C_Order.DocAction: default CO on both sides, verdict SAME', !!x1 && x1.twin.defaultValue === 'CO' && x1.legacy && x1.legacy.defaultValue === 'CO' && x1.verdict === 'SAME', x1 ? 'twin=' + x1.twin.defaultValue + ' legacy=' + (x1.legacy && x1.legacy.defaultValue) + ' ' + x1.verdict : (c1.j ? c1.j.status + ' ' + c1.j.why : c1.r.err.slice(-160)));
    const c2 = await door('erp.column kind=Order column=C_ConversionType_ID'), x2 = c2.j && c2.j.answer;
    const ind = psql("select c_conversiontype_id from c_conversiontype where isdefault='Y' and isactive='Y' order by ad_client_id desc, ad_org_id desc limit 1").stdout.trim();
    k.chk('O3b C_ConversionType_ID: legacy login default id = an independent IsDefault read; the twin side says what its slice lacks', !!x2 && x2.legacy && x2.legacy.loginDefault && String(x2.legacy.loginDefault.id) === ind && (x2.twin.loginDefault !== null || !!x2.twin.loginDefaultNote), x2 ? 'legacy=' + (x2.legacy && x2.legacy.loginDefault && x2.legacy.loginDefault.id) + ' independent=' + ind + ' twinNote=' + x2.twin.loginDefaultNote : (c2.j ? c2.j.status + ' ' + c2.j.why : ''));
    const c3 = await door('erp.column kind=Order column=C_ConversionType_ID', DOWN), x3 = c3.j && c3.j.answer;
    k.chk('O3c legacy down = twin side only, marked not checked (never SAME)', !!x3 && x3.verdict === 'TWIN-ONLY' && c3.j.notChecked.length > 0, x3 ? x3.verdict + ' notChecked=' + c3.j.notChecked.length : '');
    const c4 = await door('erp.column kind=Order column=NoSuchColumn');
    k.chk('O3d an unknown column is refused naming the table\'s columns', !!c4.j && c4.j.status === 'refused' && c4.j.answer && c4.j.answer.columnsOfTable.length > 5, c4.j ? c4.j.status : '');
    // O4
    const hasLeg = psql("select count(*) from c_order where documentno='50981' and ad_client_id=11").stdout.trim() === '1';
    if (!hasLeg) k.incon('O4', 'legacy order 50981 (made by the twin check of 2026-11-10) is not in this pilot; the comparison target is missing');
    else {
      const h = await door('erp.new kind=Order issotrx=Y c_doctypetarget_id=132 c_bpartner_id=112 salesrep_id=101'), no = h.j && h.j.answer && h.j.answer.number;
      await door('erp.new kind=C_OrderLine order=' + no + ' m_product_id=137 qtyentered=2');
      const cm = await door('erp.compare kind=Order number=' + no + ' legacy=50981'), y = cm.j && cm.j.answer;
      const gs = spawnSync('git', ['-C', path.join(os.homedir(), 'bim-compiler'), 'show', 'origin/master:scripts/bridge/out/erpnew_twin_2026-11-10.log'], { encoding: 'utf8', maxBuffer: 1 << 26 }), rec = gs.status === 0 ? gs.stdout : null;   // the log of the hand twin check, as merged (bim-compiler #546)
      const recorded = rec ? rec.split('\n').filter(l => /ERPNEW_TWIN HEAD (DIFF|ONLY)/.test(l)).map(l => l.split(' ')[3]).sort() : null;
      const got = y ? y.diffs.map(d => d.column).sort() : null;
      k.chk('O4a erp.compare: the differing cells equal those recorded by the 2026-11-10 hand twin check', !!y && !!recorded && JSON.stringify(got) === JSON.stringify(recorded), y ? 'got=' + got.length + ' recorded=' + (recorded && recorded.length) + ' match=' + y.cells.match : (cm.j ? cm.j.status + ' ' + cm.j.why : ''));
      const am = await door('erp.compare kind=Order number=' + no + ' legacy=99999999');
      k.chk('O4b a legacy number that does not exist is refused (nothing compared); the ambiguous-number path is NOT exercised here (no duplicate Document No known in this pilot)', !!am.j && am.j.status === 'refused', am.j ? am.j.status + ' ' + String(am.j.why).slice(0, 80) : '');
      const dn2 = await door('erp.compare kind=Order number=' + no + ' legacy=50981', DOWN);
      k.chk('O4c legacy down = inconclusive', !!dn2.j && dn2.j.status === 'inconclusive', dn2.j ? dn2.j.status : '');
    }
  }
  // O5
  if (!fs.existsSync(SRC)) k.incon('O5', 'the iDempiere source is not at ' + SRC);
  else {
    const g = spawnSync('grep', ['-rnF', '--include=*.java', '--', 'InvoiceRule', SRC], { encoding: 'utf8', maxBuffer: 1 << 28 }), want = g.stdout.split('\n').filter(l => /^.*?:\d+:/.test(l)).length;
    const w = await door('idempiere.where symbol=InvoiceRule limit=3'), a = w.j && w.j.answer;
    k.chk('O5a idempiere.where total = an independent grep count (files with CRLF line endings included)', !!a && a.total === want, a ? 'total=' + a.total + ' grep=' + want : (w.j ? w.j.status + ' ' + w.j.why : w.r.err.slice(-160)));
    const w2 = await door('idempiere.where symbol=InvoiceRule in=CalloutOrder limit=40'), a2 = w2.j && w2.j.answer;
    k.chk('O5b the CalloutOrder line that sets the Standard Order invoice rule is found, with its text', !!a2 && a2.hits.some(h => /CalloutOrder\.java$/.test(h.file) && /INVOICERULE_AfterDelivery/.test(h.text)), a2 ? 'hits=' + a2.total : '');
    const w3 = await door('idempiere.where symbol=ZzNoSuchSymbolZz'), w4 = await door('idempiere.where symbol="a b;rm"');
    k.chk('O5c no match is INCONCLUSIVE (not 0 hits); a symbol with shell characters is refused', !!w3.j && w3.j.status === 'inconclusive' && !!w4.j && w4.j.status === 'refused', (w3.j && w3.j.status) + ' / ' + (w4.j && w4.j.status));
  }
  // O6: stub witnesses in a temp root
  const sroot = path.join(dir, 'stubs'); fs.mkdirSync(sroot, { recursive: true });
  const stub = (name, body) => fs.writeFileSync(path.join(sroot, 'witness_' + name + '.js'), body);
  stub('stub_pass', "console.log('  ✅ A one');console.log('§WITNESS_STUB_PASS pass=2 fail=0 inconclusive=0 verdict=PASS');");
  stub('stub_fail', "console.log('  ❌ B broke  x=1');console.log('§WITNESS_STUB_FAIL pass=1 fail=1 inconclusive=0 verdict=FAIL');process.exit(1);");
  stub('stub_inc', "console.log('§WITNESS_STUB_INC pass=1 fail=0 inconclusive=1 verdict=INCONCLUSIVE');process.exit(3);");
  stub('stub_none', "console.log('all good');process.exit(0);");
  const E = { OPS_WITNESS_ROOT: sroot };
  const rp = await door('witness.run name=stub_pass', E), rf = await door('witness.run name=stub_fail', E), ri = await door('witness.run name=stub_inc', E), rn = await door('witness.run name=stub_none', E);
  const logTxt = rp.j && rp.j.answer && fs.existsSync(rp.j.answer.log) ? fs.readFileSync(rp.j.answer.log, 'utf8') : '';
  k.chk('O6a PASS keeps PASS with its counts; the log file holds the witness output', !!rp.j && rp.j.status === 'ok' && rp.j.answer.verdict === 'PASS' && rp.j.answer.pass === 2 && /A one/.test(logTxt), rp.j ? rp.j.status + ' ' + rp.j.answer.verdict : rp.r.err.slice(-120));
  k.chk('O6b FAIL keeps FAIL (an answer) and lists the failing line', !!rf.j && rf.j.status === 'ok' && rf.j.answer.verdict === 'FAIL' && rf.j.answer.fail === 1 && rf.j.answer.failed.length === 1, rf.j ? rf.j.status + ' ' + rf.j.answer.verdict : '');
  k.chk('O6c INCONCLUSIVE stays inconclusive', !!ri.j && ri.j.status === 'inconclusive', ri.j ? ri.j.status : '');
  k.chk('O6d no verdict line is an ERROR, whatever the exit code was', !!rn.j && rn.j.status === 'error' && /no verdict line/.test(rn.j.why), rn.j ? rn.j.status + ' ' + String(rn.j.why).slice(0, 90) : '');
  const before = fs.statSync(rp.j.answer.log).mtimeMs, last = await door('witness.last name=stub_pass', E), none = await door('witness.last name=stub_fail_never_run', E);
  k.chk('O6e witness.last returns the recorded run without re-running; a never-run witness is refused', !!last.j && last.j.status === 'ok' && last.j.answer.recorded === true && last.j.answer.log === rp.j.answer.log && fs.statSync(rp.j.answer.log).mtimeMs === before && !!none.j && none.j.status === 'refused', last.j ? last.j.status : '');
  // O7
  const ai = await door('witness.last name=stub_pass', E, 'ai'), ai2 = await door('idempiere.where symbol=InvoiceRule limit=1', {}, 'ai');
  k.chk('O7 an AI\'s call to a read verb runs (not held as a claim)', !!ai.j && ai.j.status === 'ok' && !!ai2.j && ai2.j.status === 'ok', (ai.j && ai.j.status) + ' / ' + (ai2.j && ai2.j.status));
  // O8: erp.pack (paths are relative to this tree by rule, so the scratch files live under it and are removed at the end)
  const SAMPLE = 'erp/plugins/models/BIM_Document.xlsx', stamp = 'opsverbs_' + process.pid, OUTD = 'build/' + stamp, EDIT = 'build/' + stamp + '.xlsx';
  const cleanup = () => { fs.rmSync(path.join(ROOT, OUTD), { recursive: true, force: true }); fs.rmSync(path.join(ROOT, EDIT), { force: true }); fs.rmSync(path.join(ROOT, 'build', stamp + '_ai'), { recursive: true, force: true }); };
  try {
    fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
    const p1 = await door('erp.pack book=' + SAMPLE + ' version=1.0.0 out=' + OUTD), pa = p1.j && p1.j.answer;
    const zf = pa && pa.path, shaInd = zf && fs.existsSync(zf) ? spawnSync('sha256sum', [zf], { encoding: 'utf8' }).stdout.split(' ')[0] : null;
    const xml = zf && fs.existsSync(zf) ? spawnSync('unzip', ['-p', zf, '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout : '';
    const cnt = (t) => (xml.match(new RegExp('<' + t + '(?=[\\s>/])', 'g')) || []).length;
    k.chk('O8a erp.pack: zip written; sha256 = an independent sha256sum; AD_Table / AD_Column / AD_Process counts = independent unzip counts', !!pa && pa.status === 'written' && pa.sha256 === shaInd && pa.rows.AD_Table === cnt('AD_Table') && pa.rows.AD_Column === cnt('AD_Column') && pa.rows.AD_Process === cnt('AD_Process') && pa.rows.AD_Table >= 1, pa ? pa.status + ' sha=' + String(pa.sha256).slice(0, 10) + ' ind=' + String(shaInd).slice(0, 10) + ' table/col/proc=' + pa.rows.AD_Table + '/' + pa.rows.AD_Column + '/' + pa.rows.AD_Process : (p1.j ? p1.j.status + ' ' + p1.j.why : p1.r.err.slice(-200)));
    const p2 = await door('erp.pack book=' + SAMPLE + ' version=1.0.0 out=' + OUTD);
    k.chk('O8b the same call again is `unchanged` with the same sha256', !!p2.j && p2.j.status === 'ok' && p2.j.answer.status === 'unchanged' && !!pa && p2.j.answer.sha256 === pa.sha256, p2.j ? p2.j.status + ' ' + (p2.j.answer && p2.j.answer.status) : '');
    // an edited workbook, same version: refused (a released pack is immutable)
    const XL = require(path.join(ROOT, 'erp', 'xlsx.mini.min.js')), wb = XL.read(fs.readFileSync(path.join(ROOT, SAMPLE)), { type: 'buffer', raw: true }), ws = wb.Sheets.AD_Window;
    let edited = false; if (ws) { const a = XL.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }), ci = a[0].map(x => String(x).toLowerCase()).indexOf('name'); if (ci > 0 && a[1]) { a[1][ci] = String(a[1][ci]) + ' (edited)'; wb.Sheets.AD_Window = XL.utils.aoa_to_sheet(a); edited = true; } }
    if (!edited) k.incon('O8c', 'the sample workbook has no AD_Window name cell to edit');
    else {
      fs.writeFileSync(path.join(ROOT, EDIT), Buffer.from(XL.write(wb, { type: 'buffer', bookType: 'xlsx' })));
      const p3 = await door('erp.pack book=' + EDIT + ' version=1.0.0 out=' + OUTD);
      k.chk('O8c the same version with an edited workbook is refused (released pack is immutable), the zip is untouched', !!p3.j && p3.j.status === 'refused' && /released pack|bump/.test(String(p3.j.why)) && spawnSync('sha256sum', [zf], { encoding: 'utf8' }).stdout.split(' ')[0] === shaInd, p3.j ? p3.j.status + ' ' + String(p3.j.why).slice(0, 90) : p3.r.err.slice(-160));
    }
    const before = fs.readdirSync(path.join(ROOT, OUTD)).length, bad = ['book=/etc/passwd.xlsx version=1.0.0', 'book=../x.xlsx version=1.0.0', 'book=erp/tools/xlsx_pack.js version=1.0.0', 'book=erp/plugins/models/NoSuch.xlsx version=1.0.0', 'book=' + SAMPLE + ' version=1.0'];
    const rs = []; for (const b of bad) rs.push((await door('erp.pack ' + b + ' out=' + OUTD)).j);
    k.chk('O8d an absolute path, .., a non-.xlsx, a missing file and a bad version are each refused and write nothing', rs.every(j => j && j.status === 'refused') && fs.readdirSync(path.join(ROOT, OUTD)).length === before, rs.map(j => j && j.status).join(','));
    const ai = await door('erp.pack book=' + SAMPLE + ' version=1.0.1 out=build/' + stamp + '_ai', {}, 'ai');
    k.chk('O8e an AI\'s erp.pack is a held claim and writes nothing', !!ai.j && ai.j.status === 'claim' && !fs.existsSync(path.join(ROOT, 'build', stamp + '_ai')), ai.j ? ai.j.status : ai.r.err.slice(-120));
  } finally { cleanup(); }
  k.end();
})();
