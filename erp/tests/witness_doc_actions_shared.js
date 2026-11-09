// ⚠ DO NOT REMOVE — W-DOC-ACTIONS-SHARED (NEURO lane B follow-up 1; bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.12 "seam hook not wired", §R.N item 4). READ THE LOG after every run: the §DOCACT_* lines are the product, exit code is not.
// ISSUE it proves or disproves: the join "DocumentEngine.getValidActions then MRole.checkActionAccess" (WDocActionPanel.java:185-205) existed TWICE (erp/doc_actions.js for the door, erp/idempiere.html _fsmCtx for the page).
//   Two implementations of one responsibility drift (AD-LAYER LAW rule 5). After the fold there must be ONE: the page calls DocActions.legal, the seam's verbs(ctx.doc) calls it, the door's erp.actions calls it.
//   S1a EQUIVALENCE  over EVERY record (rows with a DocStatus) of every walked DocAction table in the shipped seed, for no role and for roles 102 and 50004: the shared module's `offered` list equals
//        the OLD page path (the retired _fsmCtx/_periodOpen/_docActionAccess body, kept below verbatim as the ORACLE of this witness only) -- and the seam's verbs(ctx.doc) equals both.
//   S1b DELETION     the page no longer carries the join: idempiere.html _fsmCtx/_periodOpen hold no legalActionsOrder/legalActionsFor/c_periodcontrol SQL, and loads doc_actions.js before first use.
//   S1c SEAM         verbs(ctx) without ctx.doc answers exactly as before (handler registry) -- no regression of the five-call surface.
// Population N = number of (table, record, role) triples judged, printed; 0 judged prints INCONCLUSIVE (never PASS).
// FALSIFIERS: DA_BREAK=skiprole (the shared call is made without the role, i.e. the role step is skipped) must FAIL S1a; DA_BREAK=oldpage (S1b is run against `git show origin/main:erp/idempiere.html`, which still has the inline copy) must FAIL S1b.
// Run: [DA_BREAK=skiprole|oldpage] node erp/tests/witness_doc_actions_shared.js > <log>      (NODE_PATH needs sql.js via common/door/erp_cli.js's own loader; no pilot, no browser)
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.DA_BREAK || '';
const { kit, tmp } = require(path.join(ROOT, 'common/door/tests/_kit.js'));
const k = kit('W-DOC-ACTIONS-SHARED');
(async () => {
  const EC = require(path.join(ROOT, 'common/door/erp_cli.js'));
  const log = console.log; console.log = () => {};
  let O; try { O = await EC.boot({ oplog: path.join(path.dirname(tmp('da_')), 'o.jsonl') }); } finally { console.log = log; }
  const FSM = require(path.join(ROOT, 'erp/ad_docfsm.js')), ACC = require(path.join(ROOT, 'erp/ad_access.js')), DA = require(path.join(ROOT, 'erp/doc_actions.js'));
  const { makeSeam } = require(path.join(ROOT, 'erp/erp_seam.js'));
  const b = O.b3, seam = makeSeam({});

  // ── the ORACLE: the page's retired code (idempiere.html _periodOpen :3379-3391, _fsmCtx :3423-3441, _docActionAccess :3405-3416 at origin/main bf7cfe6d), line for line, host calls replaced by arguments ──
  const rv = (rec, c) => { for (const kk in rec) if (kk.toLowerCase() === c.toLowerCase()) return rec[kk]; };
  function oldPeriodOpen(dateacct, doctypeId) {
    try {
      const d = String(dateacct || '').slice(0, 10);
      if (!d) return { open: true, why: 'no-dateacct→assume-open' };
      const p = b.prepare("SELECT c_period_id FROM c_period WHERE periodtype='S' AND date(?)>=date(startdate) AND date(?)<=date(enddate) ORDER BY c_period_id").get(d, d);
      if (!p) return { open: false, why: 'no-period(' + d + ')' };
      const dbt = doctypeId ? b.prepare('SELECT docbasetype FROM c_doctype WHERE c_doctype_id=?').get(Number(doctypeId)) : null;
      if (!dbt) return { open: true, why: 'no-doctype→assume-open' };
      const pc = b.prepare('SELECT periodstatus FROM c_periodcontrol WHERE c_period_id=? AND docbasetype=?').get(Number(p.c_period_id), dbt.docbasetype);
      return { open: !!(pc && pc.periodstatus === 'O'), why: 'period=' + p.c_period_id + ' ' + dbt.docbasetype + '=' + (pc ? pc.periodstatus : 'absent') };
    } catch (e) { return { open: true, why: 'probe-error(' + e.message + ')→assume-open' }; }
  }
  function oldPage(tid, rec, roleId) {
    if (tid !== 259 && !FSM.DOC_FAMILY[tid]) return null;
    const ds = rv(rec, 'DocStatus'); if (ds == null || ds === '') return null;
    const doctypeId = Number(rv(rec, 'C_DocType_ID')) || Number(rv(rec, 'C_DocTypeTarget_ID')) || null, po = oldPeriodOpen(rv(rec, 'DateAcct'), doctypeId);
    const fsmRec = { docStatus: ds, doctypeId, processing: rv(rec, 'Processing') === 'Y' ? 'Y' : 'N', periodOpen: po.open, isBackDateTrxAllowed: true, isSOTrx: rv(rec, 'IsSOTrx') || 'N' };
    let legal = tid === 259 ? FSM.legalActionsOrder(b, fsmRec) : FSM.legalActionsFor(b, tid, fsmRec);
    const accDt = Number(rv(rec, 'C_DocTypeTarget_ID')) || Number(rv(rec, 'C_DocType_ID')) || null;
    if (legal.length && accDt && roleId != null) { const rc = ACC.buildRole(b, roleId); if (rc && rc.checkActionAccess) legal = rc.checkActionAccess(Number(rv(rec, 'AD_Client_ID')), accDt, legal); }
    return { legal, ds, po };
  }

  // ── S1a ──
  const tables = O.rows("SELECT t.ad_table_id AS id, lower(t.tablename) AS tn FROM ad_table t WHERE t.isactive='Y' AND t.isview<>'Y'").filter(t => t.id === 259 || FSM.DOC_FAMILY[t.id]);
  let N = 0, diffs = 0, seamDiffs = 0, tabsJudged = 0, nonEmptyOffer = 0, roleNarrowed = 0; const perTable = [];
  for (const t of tables) {
    let rows = []; try { rows = O.rows('SELECT * FROM ' + t.tn + " WHERE docstatus IS NOT NULL AND docstatus<>''"); } catch (e) { continue; }
    if (!rows.length) continue; tabsJudged++; let tn = 0, td = 0;
    for (const rec of rows) for (const roleId of [null, 102, 50004]) {
      const want = oldPage(t.id, rec, roleId), got = DA.legal(b, t.id, rec, { roleId: BREAK === 'skiprole' ? null : roleId, clientId: rec.ad_client_id });
      const sv = seam.verbs({ doc: { b, adTableId: t.id, rec, roleId, clientId: rec.ad_client_id } }).map(v => v.action);
      N++; tn++;
      const w = want ? want.legal : null, g = got.walked ? got.offered : null;
      if (JSON.stringify(w) !== JSON.stringify(g)) { diffs++; td++; if (diffs <= 5) k.L('DIFF table=' + t.tn + ' id=' + rec[Object.keys(rec)[0]] + ' role=' + roleId + ' old=' + JSON.stringify(w) + ' shared=' + JSON.stringify(g)); }
      if (JSON.stringify(g || []) !== JSON.stringify(sv)) seamDiffs++;
      if (w && w.length) nonEmptyOffer++;
      if (roleId != null && got.walked && got.legal.length !== got.offered.length) roleNarrowed++;
    }
    perTable.push(t.tn + ':' + tn + (td ? '(' + td + 'diff)' : ''));
  }
  console.log('§DOCACT_POP tables_with_rows=' + tabsJudged + ' of ' + tables.length + ' walked; triples(table,record,role)=' + N + ' nonEmptyOffer=' + nonEmptyOffer + ' roleNarrowed=' + roleNarrowed + ' [' + perTable.join(' ') + ']');
  if (N === 0) k.incon('S1a', 'no record with a DocStatus in any walked table: nothing was judged'); else {
    k.chk('S1a shared module == the old page path, every record x {no role, 102, 50004}', diffs === 0, 'judged=' + N + ' diffs=' + diffs);
    k.chk('S1a2 the seam verbs(ctx.doc) == the shared module on the same population', seamDiffs === 0, 'seamDiffs=' + seamDiffs);
    k.chk('S1a3 the population is not vacuous: some record has an offered action, and some role narrowed a list (so the role step was exercised)', nonEmptyOffer > 0 && roleNarrowed > 0, 'nonEmptyOffer=' + nonEmptyOffer + ' roleNarrowed=' + roleNarrowed);
  }
  // ── S1b ──
  const html = BREAK === 'oldpage' ? execFileSync('git', ['-C', ROOT, 'show', 'origin/main:erp/idempiere.html'], { encoding: 'utf8', maxBuffer: 1 << 28 }) : fs.readFileSync(path.join(ROOT, 'erp/idempiere.html'), 'utf8');
  const fn = (name) => { const i = html.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = html.indexOf('{', i); const st = j; for (; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}') { d--; if (!d) break; } } return html.slice(st, j + 1); };
  const fsmCtx = fn('_fsmCtx'), per = fn('_periodOpen');
  k.chk('S1b _fsmCtx/_periodOpen exist and are non-trivial (the instrument finds them)', fsmCtx.length > 200 && per.length > 20, 'fsmCtx=' + fsmCtx.length + ' periodOpen=' + per.length);
  const own = /legalActionsOrder|legalActionsFor|c_periodcontrol|c_period\b/i.test(fsmCtx + per);
  k.chk('S1b the page holds no copy of the join or the period probe (no legalActionsOrder / legalActionsFor / c_period SQL in _fsmCtx or _periodOpen)', !own, 'offences=' + ((fsmCtx + per).match(/legalActionsOrder|legalActionsFor|c_periodcontrol|c_period\b/gi) || []).length);
  const iDA = html.indexOf('src="doc_actions.js'), iUse = html.indexOf('DocActions.legal');
  k.chk('S1b the page loads doc_actions.js and calls DocActions.legal after it', iDA > 0 && iUse > iDA, 'script@' + iDA + ' use@' + iUse);
  // ── S1c ──
  const K = require(path.join(ROOT, 'erp/erp_kernel.js')), all = seam.verbs({}), some = K.handlers().length;
  k.chk('S1c verbs(ctx) with no ctx.doc is still the kernel handler registry, role-filtered (unchanged)', all.length === some && JSON.stringify(seam.verbs({ role: { actions: [] } })) === '[]', 'handlers=' + some);
  k.end();
})().catch(e => { console.log('§WITNESS_DOC_ACTIONS_SHARED verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
