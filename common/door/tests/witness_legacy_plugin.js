#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LEGACY-PLUGIN (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.V item 12, erp.legacy_plugin). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: erp.legacy_plugin says a plugin is on a real legacy iDempiere when it is not (the refresh did not rebuild from base, the rows are not there, the pack installed is not the one made from the workbook,
 *        the in-server witness result is invented), or it touches a database it must not.
 * Runs against the LOCAL legacy TEST instance (DB idempiere_bimdoc, ~/idempiere-bimdoc). A full run is about 3-4 minutes (one refresh). Every claim is checked by an INDEPENDENT read (psql / sha / the script's own log).
 *   P0 legacy.status UP (else INCONCLUSIVE: nothing can be judged)
 *   P1 an AI's erp.legacy_plugin is a held claim; a marker table made in idempiere_bimdoc beforehand is STILL there (nothing ran)
 *   P2a legacy.up: ALREADY-UP on a running Postgres (StartedAt unchanged), refused for a missing container; starting a stopped Postgres is NOT exercised (shared with the pilot)
 *   P2 refused: a workbook path outside the tree / not .xlsx; legacy down (OPS_PG_CONTAINER bad) = inconclusive, never "all found"
 *   P3 erp.legacy_plugin (a person): every line ok; the marker table is GONE (the database was rebuilt from base, not patched); the base seed's migration scripts are in (independent count)
 *   P4 legacy.check: each kind of workbook row found = an independent SQL count; the physical table has every non-virtual column of the workbook
 *   P5a the in-server witness verdict + counts = the §W-BIMDOC-LEGACY line in the log file the verb kept (independent read of that file); P5b the installed plugin is healthy: PASS 8/0
 *   P6 the pack comparison says what is true: same/different = an independent compare of the two PackOut.xml
 *   P7 the pilot is untouched: its DB row counts and http :8088 before = after
 * Falsifier: LP_BREAK=nosupersede (the refresh builds the bundle without the supersede rule) must make P5b FAIL (the in-server witness fails L2a and L3, 6/2). Run it, then run again without LP_BREAK to restore the instance.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const { kit, run, DOOR, ROOT } = require('./_kit');
const k = kit('W-LEGACY-PLUGIN');
const BOOK = 'erp/plugins/models/BIM_Document.xlsx', VER = '1.0.0', BREAK = process.env.LP_BREAK || '';
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacyplug_')), J = path.join(dir, 'j.jsonl'), base = { BIM_DOOR_JOURNAL: J, OPS_CACHE: path.join(dir, 'cache') };
  let n = 0;
  const door = async (line, extra, actor) => { const r = await run(DOOR, ['--actor', actor || 'human', '--request', 'lp-' + (++n), '--journal', J, line], Object.assign({}, base, extra || {})); let j = null; try { j = JSON.parse(r.out.trim()); } catch (e) {} return { j, r }; };
  const psql = (db, sql) => { const r = spawnSync('docker', ['exec', 'postgres', 'psql', '-U', 'adempiere', '-d', db, '-At', '-c', sql], { encoding: 'utf8' }); return { ok: r.status === 0, out: (r.stdout || '').trim() }; };
  const http = () => spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', 'http://localhost:8088/webui/'], { encoding: 'utf8' }).stdout.trim();
  // P0
  const st = await door('legacy.status');
  if (!st.j || st.j.status !== 'ok' || st.j.answer.verdict !== 'UP') { k.incon('P0', 'the legacy test stack is not UP (' + (st.j ? st.j.answer && st.j.answer.summary : st.r.err.slice(-120)) + '); nothing can be judged'); return k.end(); }
  k.chk('P0 legacy.status UP', true, st.j.answer.summary);
  if (psql('idempiere_bimdoc', 'select 1').out !== '1') { k.incon('P1-P7', 'the test database idempiere_bimdoc does not exist yet; run scripts/legacy_bimdoc_refresh.sh once'); return k.end(); }
  const pilotBefore = { ad_table: psql('idempiere_pilot', 'select count(*) from ad_table').out, c_order: psql('idempiere_pilot', 'select count(*) from c_order').out, http: http() };
  psql('idempiere_bimdoc', 'create table if not exists ops_refresh_marker(x int)');
  // P1
  const ai = await door('erp.legacy_plugin book=' + BOOK + ' version=' + VER, {}, 'ai');
  k.chk('P1 an AI\'s erp.legacy_plugin is a held claim and nothing ran (the marker table is still there)', !!ai.j && ai.j.status === 'claim' && psql('idempiere_bimdoc', "select count(*) from information_schema.tables where table_name='ops_refresh_marker'").out === '1', ai.j ? ai.j.status : ai.r.err.slice(-120));
  // P2a: legacy.up on a running Postgres starts nothing (the container's StartedAt is unchanged); a missing container is refused naming it. NOT exercised: starting a STOPPED Postgres (it is shared with the pilot, so the witness never stops it)
  const startedAt = () => spawnSync('docker', ['inspect', '-f', '{{.State.StartedAt}}', 'postgres'], { encoding: 'utf8' }).stdout.trim(), sa0 = startedAt();
  const u1 = await door('legacy.up'), u2 = await door('legacy.up', { OPS_PG_CONTAINER: 'no_such_container_for_the_witness' });
  k.chk('P2a legacy.up on a running Postgres is ALREADY-UP and starts nothing (StartedAt unchanged); a missing container is refused naming it (starting a stopped one is not exercised)', !!u1.j && u1.j.status === 'ok' && u1.j.answer.verdict === 'ALREADY-UP' && startedAt() === sa0 && !!u2.j && u2.j.status === 'refused' && /no_such_container/.test(String(u2.j.why)), (u1.j && u1.j.answer && u1.j.answer.verdict) + ' / ' + (u2.j && u2.j.status));
  // P2
  const bad1 = await door('legacy.check book=/etc/passwd.xlsx'), bad2 = await door('legacy.check book=erp/tools/xlsx_pack.js'), dn = await door('legacy.check book=' + BOOK, { OPS_PG_CONTAINER: 'no_such_container_for_the_witness' });
  k.chk('P2 an absolute path and a non-.xlsx are refused; legacy down is inconclusive (never "all found")', !!bad1.j && bad1.j.status === 'refused' && !!bad2.j && bad2.j.status === 'refused' && !!dn.j && dn.j.status === 'inconclusive', [bad1.j && bad1.j.status, bad2.j && bad2.j.status, dn.j && dn.j.status].join(','));
  // P3: the whole route, as a person
  const t0 = Date.now(), full = await door('erp.legacy_plugin book=' + BOOK + ' version=' + VER, BREAK ? { BREAK } : {}), lines = full.j && full.j.answer && full.j.answer.lines;
  const markerGone = psql('idempiere_bimdoc', "select count(*) from information_schema.tables where table_name='ops_refresh_marker'").out === '0';
  const mig = +psql('idempiere_bimdoc', 'select count(*) from ad_migrationscript').out;
  k.L('erp.legacy_plugin ' + (full.j ? full.j.status : 'no JSON') + ' in ' + Math.round((Date.now() - t0) / 1000) + ' s lines=' + (lines ? lines.map(l => l.line.split(' ')[0] + ':' + l.envelope.status).join(' ') : '-') + (BREAK ? ' (BREAK=' + BREAK + ')' : ''));
  k.chk('P3 every line of the route is ok, the marker table is GONE (rebuilt from base) and the seed\'s migration scripts are in (independent count)', !!lines && lines.length === 5 && lines[0].line === 'legacy.up' && lines.every(l => l.envelope.status === 'ok') && markerGone && mig > 1000, lines ? lines.map(l => l.envelope.status).join(',') + ' markerGone=' + markerGone + ' migrationscripts=' + mig : (full.j ? full.j.status + ' ' + String(full.j.why).slice(0, 160) : full.r.err.slice(-200)));
  const byVerb = (v) => lines && lines.find(l => l.line.indexOf(v) === 0);
  // P4
  const ck = byVerb('legacy.check') && byVerb('legacy.check').envelope.answer;
  const XP = require(path.join(ROOT, 'erp', 'tools', 'xlsx_pack.js')), W = XP.readWorkbook(path.join(ROOT, BOOK)).sheets;
  const indep = { 'AD_Window rows': +psql('idempiere_bimdoc', "select count(*) from ad_window where name='BIM Document'").out, 'AD_Table rows': +psql('idempiere_bimdoc', "select count(*) from ad_table where tablename='BIM_Document'").out, 'physical tables': +psql('idempiere_bimdoc', "select count(*) from information_schema.tables where table_name='bim_document'").out, 'AD_Process rows with the same class name': +psql('idempiere_bimdoc', "select count(*) from ad_process where classname in ('org.kernel.bim.process.BIMDocumentOpen','org.kernel.bim.process.BIMDocumentRegisterExport')").out };
  const same = ck && Object.keys(indep).every(w => { const c = ck.checks.find(x => x.what === w); return c && c.found === indep[w]; });
  const physical = +psql('idempiere_bimdoc', "select count(*) from information_schema.columns where table_name='bim_document'").out, wantPhys = W.ad_column.filter(r => /BIM_Document$|^ref:BIM_Document$/.test(String(r.values.ad_table_id)) && !r.values.columnsql).length;
  k.chk('P4 legacy.check: window / table / physical table / process counts equal independent SQL counts; the physical table has every non-virtual workbook column', !!ck && same && physical >= wantPhys && wantPhys > 0, ck ? 'verdict=' + ck.verdict + ' indep=' + JSON.stringify(indep) + ' physicalCols=' + physical + ' workbookNonVirtual=' + wantPhys : 'no check answer');
  // P5
  const wv = byVerb('legacy.witness') && byVerb('legacy.witness').envelope.answer, logTxt = wv && wv.log && fs.existsSync(wv.log) ? fs.readFileSync(wv.log, 'utf8') : '', lm = /§W-BIMDOC-LEGACY (PASS|FAIL|INCONCLUSIVE|ERROR) pass=(\d+) fail=(\d+)/.exec(logTxt);
  k.chk('P5a the in-server witness verdict and counts = the §W-BIMDOC-LEGACY line in the log the verb kept (the verb reports what the script said)', !!wv && !!lm && wv.verdict === lm[1] && wv.pass === +lm[2] && wv.fail === +lm[3], wv ? 'verb=' + wv.verdict + ' ' + wv.pass + '/' + wv.fail + ' log=' + (lm ? lm[1] + ' ' + lm[2] + '/' + lm[3] : 'none') : 'no witness answer');
  k.chk('P5b the plugin installed is HEALTHY: the in-server witness is PASS with 8 pass, 0 fail (LP_BREAK=nosupersede must turn this red)', !!wv && wv.verdict === 'PASS' && wv.pass === 8 && wv.fail === 0, wv ? wv.verdict + ' ' + wv.pass + '/' + wv.fail + (wv.failed && wv.failed.length ? ' failing: ' + wv.failed.map(x => x.slice(0, 40)).join(' | ') : '') : 'no witness answer');
  // P6
  const fresh = path.join(ROOT, 'build', 'legacy_plugin', '2Pack_' + VER + '.zip'), pd = path.join(os.homedir(), 'idempiere-bimdoc', 'server', 'plugins'), inst = fs.existsSync(pd) ? fs.readdirSync(pd).filter(x => /^org\.idempiere\.bimdocument_/.test(x)).map(x => path.join(pd, x, 'META-INF', '2Pack_' + VER + '.zip')).find(f => fs.existsSync(f)) : null;
  const xml = (f) => spawnSync('unzip', ['-p', f, '*dict/PackOut.xml'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout, trueSame = !!inst && fs.existsSync(fresh) && xml(fresh) === xml(inst);
  k.chk('P6 the pack comparison says what is true (same / not the same) as an independent compare of the two PackOut.xml', !!ck && ck.pack.compared === true && ck.pack.same === trueSame, ck ? 'verb same=' + ck.pack.same + ' independent same=' + trueSame + ' | ' + ck.pack.note : '');
  fs.rmSync(path.join(ROOT, 'build', 'legacy_plugin'), { recursive: true, force: true });
  // P7
  const pilotAfter = { ad_table: psql('idempiere_pilot', 'select count(*) from ad_table').out, c_order: psql('idempiere_pilot', 'select count(*) from c_order').out, http: http() };
  k.chk('P7 the pilot is untouched: its row counts and http :8088 before = after', JSON.stringify(pilotBefore) === JSON.stringify(pilotAfter), JSON.stringify(pilotBefore) + ' -> ' + JSON.stringify(pilotAfter));
  k.end();
})();
