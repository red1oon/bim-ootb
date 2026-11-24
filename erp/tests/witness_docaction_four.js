// ⚠ DO NOT REMOVE — W-DOCACTION-4 (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.21 PORT SPEC; READ THE LOG after every run: every verdict is a §DA4 line, an exit code is not evidence).
// What it judges: the four DocAction classes the help peek sweep could not reach (MRequisition, MBankTransfer, MDepositBatch, MInOutConfirm) behave as REAL iDempiere does. TWO sides run the SAME scenarios:
//   twin    = the SQLite model layer (ws_kernel.js on ad_seed.db), always;
//   legacy  = the shared pilot, through its own WebServices (scripts/bridge/docaction_four_legacy.js, config rows scripts/bridge/pilot/ws_port_four.sql), only with DA4_LEGACY=1.
// A scenario's FACTS (the header and lines after every step, the answer of every step with legacy's java class prefix stripped and the @Key@ words translated) must be EQUAL on the two sides: a difference is a SQLite-side
//   defect (TWIN CARDINAL RULE), never a quirk. Without DA4_LEGACY the verdict says so: the twin's own claims are judged, the parity claims are INCONCLUSIVE, never PASS.
// The WebService channel rolls a refused action back (ModelADService.setDocAction throws, the Trx is not committed), so the twin side does the same: a step whose answer is not ok leaves the database as it was.
// Every check names the issue it proves (the claim id R1.. of the spec); a falsifier per claim is in DA4_MUTANT (a mirror dir where ONE ported rule is broken; the claim must then FAIL).
// Command: node erp/tests/witness_docaction_four.js 2>&1 | tee erp/tests/logs/witness_docaction_four.log      (DA4_LEGACY=1 adds the pilot; DA4_BRIDGE=<dir of docaction_four_legacy.js>; DA4_CLASS=req|banktransfer|deposit|confirm narrows)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.DA4_ERP || path.join(__dirname, '..'), SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js', LEGACY = process.env.DA4_LEGACY === '1', ONLY = process.env.DA4_CLASS || '';
var BRIDGE = process.env.DA4_BRIDGE || path.join(os.homedir(), 'bim-compiler', 'scripts', 'bridge');
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
var initSqlJs = require(SQLJS_DIR), _log = console.log, SEEN = [];
console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 }, J = JSON.stringify;
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; } say('  §DA4-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' info=' + J(info).slice(0, 700))); }
function verdict(cs, partial) { var c = CASES[cs] || { judged: 0, failed: 0 }; say('§DA4-' + cs + ' verdict=' + (!c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : partial ? 'INCONCLUSIVE' : 'PASS') + ' judged=' + c.judged + ' failed=' + c.failed + (partial ? ' partial=' + partial : '')); }

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { /* patch statement */ } });
  var AR = require(path.join(ERP, 'ad_rule.js')); AR.ensure(db); require(path.join(ERP, 'ad_import_tables.js')).ensure(db);   // the boot overlays (ws_kernel.js boot does the same): c_banktransfer is one of them
  var K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML;
  require(path.join(ERP, 'ad_callout.js')).bind(function (sql, p) { return k.q(sql, p); }, { now: function () { return Date.now(); } });   // the page's own binding (crud_overlay.js:428): the line's price comes from MProductPricing, which reads through the callout runtime
  var TODAY = (function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();   // the legacy server's calendar day (local time)
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:docaction4' };
  say('§DA4-LOAD erp=' + ERP + ' legacy=' + (LEGACY ? 'pilot' : 'OFF') + ' today=' + TODAY);
  var LG = LEGACY ? require(path.join(BRIDGE, 'docaction_four_legacy.js')) : null;
  function dayAdd(n) { var d = new Date(Date.now() + n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ── the twin side ──
  function commit(fn, meta) { var trx = new ML.Trx(k.q, Object.assign(k.env(S), { date: TODAY + ' 00:00:00' })), r; try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: ex && ex.message }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); } var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta); return Object.assign({}, r, { ok: ok, ops: ops, log: trx.log }); }
  var colName = {};   // lowercase -> the dictionary's column name, per table (the legacy WebService wants the exact name)
  function colsOf(table) { if (!colName[table]) { colName[table] = {}; k.q('SELECT c.columnname FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=?', [table]).forEach(function (c) { colName[table][c.columnname.toLowerCase()] = c.columnname; }); } return colName[table]; }
  function twinMake(table, row) {
    var out = null, r = commit(function (trx) { var sv = ML.save(trx, table, null, ML.newPO(trx, table, Object.assign({ ad_client_id: 11, ad_org_id: 11 }, row))); out = sv; return { ok: sv.ok, error: sv.error }; }, { ws: 'da4_make', tag: table });
    if (!r.ok) { (r.log || []).filter(function (l) { return /MODEL-ERR/.test(l); }).forEach(function (l) { say('  §DA4-DEBUG ' + String(l).split('\n').slice(0, 7).join(' / ')); }); return { ok: false, error: r.error }; }
    var cr = (r.ops || []).filter(function (o) { return o.op_type === 'CRUD_CREATE' && o.table === table; })[0];   // the real key: the applied CREATE op carries it
    return { ok: true, id: cr ? cr.fields[table + '_id'] : null };
  }
  function twinAct(table, id, action) {   // the WebService: DocAction := action, then processIt; not ok => rolled back
    var rr = null, r = commit(function (trx) {
      trx.update(table, trx.get(table, id), { docaction: action });
      try { rr = ML.processIt(trx, table, id, action); } catch (ex) { return { ok: false, error: ex.message }; }
      return { ok: !!rr.ok, error: rr.ok ? null : (rr.msg == null ? 'Failed when processing document: null' : rr.msg) };
    }, { ws: 'da4_act', tag: table + id + action });
    return { ok: r.ok, error: r.ok ? null : r.error };
  }
  var tq = function (sql) { return k.q(sql, []); };
  // ── the legacy side ──
  async function legacyMake(table, row) { var o = {}, cn = null; Object.keys(row).forEach(function (c) { o[(cn || (cn = LG_cols(table)))[c] || c] = row[c]; }); return LG.create(tableName(table), o); }
  var LGC = {}; function LG_cols(table) { return colsOf(table); }
  var TN = { c_payment: 'C_Payment', m_requisition: 'M_Requisition', m_requisitionline: 'M_RequisitionLine', c_banktransfer: 'C_BankTransfer', c_depositbatch: 'C_DepositBatch', c_depositbatchline: 'C_DepositBatchLine', m_inoutconfirm: 'M_InOutConfirm', m_inoutlineconfirm: 'M_InOutLineConfirm' };
  var ACT = { m_requisition: 'BridgeDocActionRequisition', c_banktransfer: 'BridgeDocActionBankTransfer', c_depositbatch: 'BridgeDocActionDepositBatch', m_inoutconfirm: 'BridgeDocActionInOutConfirm' };
  function tableName(t) { return TN[t] || t; }
  // ── words: the legacy text vs the twin's @Key@ text, one normal form ──
  function words(trx, s) { if (s == null) return s; return String(s).replace(/@(\w+)@/g, function (m, key) { var r = k.q('SELECT msgtext FROM ad_message WHERE value=?', [key])[0] || null; if (r && r.msgtext) return r.msgtext; var e = k.q('SELECT name FROM ad_element WHERE lower(columnname)=?', [key.toLowerCase()])[0]; return e && e.name ? e.name : m; }); }
  function norm(s) { if (s == null) return ''; return words(null, String(s)).replace(/^([a-z]+\.)+[A-Za-z]*(Exception|Error): /, '').replace(/^Cannot save record in \w+: /, '').replace(/\s+/g, ' ').trim(); }
  var num = function (v) { return v == null || v === '' ? '' : (isNaN(Number(v)) ? String(v) : String(Number(v))); };
  function fmt(rows) { return rows.map(function (r) { return Object.keys(r).map(function (c) { return num(r[c]); }).join(':'); }).join(' ; '); }
  // facts of a document: header columns + child rows, read by the SAME sql on both sides
  var SHAPE = {
    c_banktransfer: { head: 'docstatus, docaction, processed, from_amt, to_amt, rate, from_c_currency_id, to_c_currency_id, from_c_bpartner_id, to_c_bpartner_id, from_ad_org_id, to_ad_org_id', child: 'c_payment', key: 'c_banktransfer_id',
      cols: "docstatus, isreceipt, payamt, c_bankaccount_id, c_charge_id, c_bpartner_id, processed, CASE WHEN documentno LIKE '%^' THEN 'rev' ELSE 'doc' END", order: 'c_payment_id' },
    m_requisition: { head: 'docstatus, docaction, processed, isapproved, totallines', child: 'm_requisitionline', key: 'm_requisition_id', cols: 'line, qty, priceactual, linenetamt, description', order: 'line' }
  };
  function sqlFacts(table, id) { var sh = SHAPE[table]; return { head: 'SELECT ' + sh.head + ' FROM ' + table + ' WHERE ' + table + '_id=' + id, child: sh.child ? 'SELECT ' + sh.cols + ' FROM ' + sh.child + ' WHERE ' + sh.key + '=' + id + ' ORDER BY ' + sh.order : null }; }
  function twinFacts(table, id) { var q = sqlFacts(table, id); return { head: fmt(tq(q.head)), child: q.child ? fmt(tq(q.child)) : '' }; }
  function legacyFacts(table, id) { var q = sqlFacts(table, id), h = LG.rows(q.head)[0] || '', c = q.child ? LG.rows(q.child).map(function (x) { return x.split('|').map(num).join(':'); }).join(' ; ') : ''; return { head: String(h).split('|').map(num).join(':'), child: c }; }
  function headNum(s) { return s; }

  // ── scenario runner: build a document (+ lines), run the steps, record the facts and the answer after each step, on BOTH sides ──
  async function run(side, sc) {
    var out = { steps: [] }, mk = side === 'twin' ? twinMake : legacyMake, act = side === 'twin' ? twinAct : function (t, i, a) { return LG.act(ACT[t], tableName(t), i, a); }, facts = side === 'twin' ? twinFacts : legacyFacts;
    var h = await mk(sc.table, sc.head); if (!h.ok) { out.made = 'REJECTED: ' + norm(h.error); return out; }
    for (var i = 0; i < (sc.lines || []).length; i++) { var l = Object.assign({}, sc.lines[i]); l[sc.table + '_id'] = h.id; if (sc.lineNo !== false) l.line = (i + 1) * 10; var lr = await mk(sc.child, l); if (!lr.ok) { out.made = 'LINE-REJECTED: ' + norm(lr.error); return out; } }
    out.id = h.id; out.made = 'ok'; out.start = facts(sc.table, h.id);
    for (var s = 0; s < sc.steps.length; s++) { var a = sc.steps[s], r = await act(sc.table, h.id, a); out.steps.push({ a: a, ok: !!r.ok, err: r.ok ? '' : norm(r.error), facts: facts(sc.table, h.id) }); }
    return out;
  }
  function stepsStr(o) { return o.steps.map(function (x) { return x.a + ':' + (x.ok ? 'ok' : 'REFUSED(' + x.err + ')') + ' → ' + x.facts.head + ' | ' + x.facts.child; }).join('\n      '); }
  async function judge(cs, sc, expect) {
    var tw = await run('twin', sc);
    say('  §DA4 scenario=' + sc.id + ' side=twin made=' + tw.made + '\n      start ' + (tw.start ? tw.start.head + ' | ' + tw.start.child : '-') + '\n      ' + stepsStr(tw));
    if (expect) expect(tw);
    if (!LEGACY) return;
    var lg = await run('legacy', sc);
    say('  §DA4 scenario=' + sc.id + ' side=legacy made=' + lg.made + '\n      start ' + (lg.start ? lg.start.head + ' | ' + lg.start.child : '-') + '\n      ' + stepsStr(lg));
    var a = J({ m: tw.made, st: tw.start, s: tw.steps }), b = J({ m: lg.made, st: lg.start, s: lg.steps });
    check(cs, 'parity-' + sc.id, sc.issue + ' [parity with legacy]', a === b, { twin: tw, legacy: lg });
  }

  // ═══ MUTANTS (DA4_MUTANTS=1 runs every one in its own process): ONE ported rule broken in memory; the named claims must then FAIL, a survivor is listed ═══
  var MUT = process.env.DA4_MUTANT || '';
  var MUTANTS = {
    'bt-unregistered':    { cls: 'c_banktransfer', kills: ['P0:bt'], patch: function () { delete ML.DOCS['c_banktransfer']; } },
    'bt-one-payment':     { cls: 'c_banktransfer', kills: ['BT:B2'], patch: function (i) { var o = i.completeIt; i.completeIt = function (trx, t) { var s = o(trx, t); var ps = trx.find('c_payment', { c_banktransfer_id: t.c_banktransfer_id }, ['c_payment_id']); if (ps.length > 1) ML.remove(trx, 'c_payment', ps[1]); return s; }; } },
    'bt-close-reopens':   { cls: 'c_banktransfer', kills: ['BT:B4'], patch: function (i) { var o = i.closeIt; i.closeIt = function (trx, t) { o(trx, t); trx.update('c_banktransfer', trx.get('c_banktransfer', t.c_banktransfer_id), { docstatus: 'CO' }); return true; }; } },
    'bt-draft-void-keeps':{ cls: 'c_banktransfer', kills: ['BT:B5'], patch: function (i) { var o = i.voidIt; i.voidIt = function (trx, t) { var r = o(trx, t); trx.update('c_banktransfer', trx.get('c_banktransfer', t.c_banktransfer_id), { processed: 'N' }); return r; }; } },
    'bt-reactivate-ok':   { cls: 'c_banktransfer', kills: ['BT:B7RE'], patch: function (i) { i.reActivateIt = function () { return true; }; } },
    'req-unregistered':   { cls: 'm_requisition', kills: ['P0:req'], patch: function () { delete ML.DOCS['m_requisition']; } },
    'req-no-approve':     { cls: 'm_requisition', kills: ['REQ:R6'], patch: function (i) { i.approveIt = function () { return true; }; } },
    'req-close-noop':     { cls: 'm_requisition', kills: ['REQ:R7a', 'REQ:R7e'], patch: function (i) { var o = i.closeIt; i.closeIt = function (trx, r) { trx.update('m_requisition', trx.get('m_requisition', r.m_requisition_id), { docstatus: 'CL' }); return true; }; } },
    'req-no-lines-ok':    { cls: 'm_requisition', kills: ['REQ:R3'], patch: function (i) { var o = i.prepareIt; i.prepareIt = function (trx, r) { return trx.find('m_requisitionline', { m_requisition_id: r.m_requisition_id }).length ? o(trx, r) : 'IP'; }; } },
    'req-period-ignored': { cls: 'm_requisition', kills: ['REQ:R4'], patch: function (i) { var o = i.prepareIt; i.prepareIt = function (trx, r) { try { return o(trx, r); } catch (e) { if (/PeriodClosed/.test(e.message)) return 'IP'; throw e; } }; } },
    'req-no-requester-ok':{ cls: 'm_requisition', kills: ['REQ:R2'], patch: function (i) { var o = i.prepareIt; i.prepareIt = function (trx, r) { return o(trx, Object.assign({}, r, { ad_user_id: 101 })); }; } },
    'req-void-false':     { cls: 'm_requisition', kills: ['REQ:R7b', 'REQ:R7c'], patch: function (i) { i.voidIt = function () { return false; }; } },
    'req-reactivate-ok':  { cls: 'm_requisition', kills: ['REQ:R8RE'], patch: function (i) { i.reActivateIt = function () { return true; }; } }
  };
  if (process.env.DA4_MUTANTS === '1') {
    var cp = require('child_process'), surv = [], names = Object.keys(MUTANTS).filter(function (n) { return !ONLY || MUTANTS[n].cls === ONLY || n.indexOf(ONLY) === 0; });
    names.forEach(function (n) {
      var o = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { DA4_MUTANTS: '', DA4_MUTANT: n, DA4_LEGACY: '' }), encoding: 'utf8' }).stdout || '';
      var failed = MUTANTS[n].kills.filter(function (kk) { var p = kk.split(':'); return new RegExp('case=' + p[0] + ' key=' + p[1] + ' FAIL').test(o); });
      var ok = failed.length === MUTANTS[n].kills.length; if (!ok) surv.push(n);
      say('§DA4-MUTANT ' + n + ' ' + (ok ? 'KILLED' : 'SURVIVED') + ' expected=' + J(MUTANTS[n].kills) + ' failed=' + J(failed));
    });
    say('§DA4-MUTANTS ' + (names.length ? (surv.length ? 'FAIL survivors=' + J(surv) : 'PASS') : 'INCONCLUSIVE') + ' killed=' + (names.length - surv.length) + ' of ' + names.length);
    process.exit(surv.length ? 1 : 0);
  }
  if (MUT) { var mu = MUTANTS[MUT]; if (!mu) { say('§DA4-ERROR unknown mutant ' + MUT); process.exit(2); } mu.patch(ML.docActionFor(mu.cls)); say('§DA4-MUTANT-ON ' + MUT); }

  // ═══ P0: the classes are registered (the sweep's measured gap) ═══
  var P0 = [['m_requisition', 'req'], ['c_banktransfer', 'bt']];
  P0.forEach(function (p) { if (ONLY && ONLY !== p[1]) return; check('P0', p[1], 'a DocAction class is registered for ' + p[0] + ' (before: "no DocAction class registered", measured by W-HELP-PEEK)', !!ML.docActionFor(p[0]), {}); });
  verdict('P0');

  // ═══ REQ: MRequisition ═══
  if (!ONLY || ONLY === 'req') {
    var P139 = { m_product_id: 139, qty: 3 }, P137 = { m_product_id: 137, qty: 2 };
    var rq = function (over, lines, steps, id, issue) { return { id: id, issue: issue, table: 'm_requisition', child: 'm_requisitionline', head: Object.assign({ c_doctype_id: 127, ad_user_id: 101, m_pricelist_id: 102, m_warehouse_id: 103, datedoc: TODAY + ' 00:00:00', daterequired: TODAY + ' 00:00:00', priorityrule: '5' }, over || {}), lines: lines, steps: steps }; };
    await judge('REQ', rq(null, [P139, P137], ['PR', 'CO', 'CL'], 'REQ1-normal', 'R5/R6/R7 prepare totals, Complete approves + processes, Close zeroes the unordered lines'), function (tw) {
      check('REQ', 'R5', 'prepare totals the lines: TotalLines = 22.95 + 5.40 = 28.35 and the status is In Progress (MRequisition.prepareIt :281-303)', tw.steps[0] && tw.steps[0].ok && /^IP:/.test(tw.steps[0].facts.head) && Number(tw.steps[0].facts.head.split(':')[4]) === 28.35, tw.steps[0]);
      check('REQ', 'R6', 'Complete: status CO, DocAction CL, Processed Y, approved (MRequisition.completeIt :342-378)', tw.steps[1] && tw.steps[1].ok && /^CO:CL:Y:Y:28.35/.test(tw.steps[1].facts.head), tw.steps[1]);
      check('REQ', 'R7a', 'Close: status CL, every unordered line goes to Qty 0 with the old Qty in the description, TotalLines 0 (MRequisition.closeIt :426-470)', tw.steps[2] && tw.steps[2].ok && /^CL:CL:Y:Y:0/.test(tw.steps[2].facts.head) && /10:0:7.65:0: \[3\]/.test(tw.steps[2].facts.child), tw.steps[2]);
    });
    await judge('REQ', rq(null, [P139], ['CO', 'VO'], 'REQ2-complete-then-void', 'R7 Void on a Completed requisition = close + status VO'), function (tw) { check('REQ', 'R7b', 'Void of a Completed requisition: status VO, lines zeroed (MRequisition.voidIt :401-424)', tw.steps[1] && tw.steps[1].ok && /^VO:/.test(tw.steps[1].facts.head) && /0:7.65:0: \[3\]/.test(tw.steps[1].facts.child), tw.steps[1]); });
    await judge('REQ', rq(null, [P139], ['VO'], 'REQ3-draft-void', 'R7 Void on a Drafted requisition goes through (the engine allows it)'), function (tw) { check('REQ', 'R7c', 'Void of a Drafted requisition: status VO, Processed stays N', tw.steps[0] && tw.steps[0].ok && /^VO:VO:N:N:0/.test(tw.steps[0].facts.head), tw.steps[0]); });
    await judge('REQ', rq(null, [P139], ['CL'], 'REQ4-draft-close', 'the engine refuses Close on a Drafted document'), function (tw) { check('REQ', 'R7d', 'Close of a Drafted requisition is refused by the engine and nothing changes', tw.steps[0] && !tw.steps[0].ok && /Invalid Actions/.test(tw.steps[0].err) && /^DR:CO:N:N/.test(tw.steps[0].facts.head), tw.steps[0]); });
    for (var act of ['RE', 'RC', 'RA']) await judge('REQ', rq(null, [P139], ['CO', act], 'REQ5-' + act, 'R8 ' + act + ' answers false and changes nothing'), function (tw) { check('REQ', 'R8' + act, 'reverse/reactivate on a Completed requisition answers false, nothing changes (MRequisition :480-542)', tw.steps[1] && !tw.steps[1].ok && /^CO:CL:Y:Y:22.95/.test(tw.steps[1].facts.head), tw.steps[1]); });
    await judge('REQ', rq({ ad_user_id: 0 }, [P139], ['CO'], 'REQ6-no-requester', 'R2 no requester: Invalid, refused, nothing kept'), function (tw) { check('REQ', 'R2', 'No requester (AD_User_ID 0): Complete is refused (prepareIt answers Invalid, :269-273) and the document stays Drafted', tw.steps[0] && !tw.steps[0].ok && /^DR:CO:N:N/.test(tw.steps[0].facts.head), tw.steps[0]); });
    await judge('REQ', rq(null, [], ['CO'], 'REQ7-no-lines', 'R3 no lines: "No Document Lines found"'), function (tw) { check('REQ', 'R3', 'A requisition without lines: Complete throws No Document Lines found (:274-277)', tw.steps[0] && !tw.steps[0].ok && /No Document Lines found/.test(tw.steps[0].err), tw.steps[0]); });
    await judge('REQ', rq({ datedoc: dayAdd(400) + ' 00:00:00', daterequired: dayAdd(400) + ' 00:00:00' }, [P139], ['CO'], 'REQ8-closed-period', 'R4 a date outside the open periods: Period Closed'), function (tw) { check('REQ', 'R4', 'A date no open period covers: Complete throws Period Closed with the date and Purchase Requisition (:279)', tw.steps[0] && !tw.steps[0].ok && /Period Closed Date=\d{4}-\d\d-\d\d 00:00:00.0, Document Base Type=Purchase Requisition/.test(tw.steps[0].err), tw.steps[0]); });
    await judge('REQ', rq(null, [{ m_product_id: 130, qty: 5, c_orderline_id: 101 }, P139], ['CO', 'CL'], 'REQ9-ordered-line', 'R7 a line already ordered keeps the order line quantity on Close'), function (tw) { check('REQ', 'R7e', 'Close: a line with an order line takes that order line QtyOrdered (2), an unordered one goes to 0 (:438-459)', tw.steps[1] && tw.steps[1].ok && /10:2:/.test(tw.steps[1].facts.child) && /20:0:7.65:0: \[3\]/.test(tw.steps[1].facts.child), tw.steps[1]); });
    verdict('REQ', LEGACY ? null : 'parity claims not run (DA4_LEGACY=1 runs them on the pilot)');
  }

  // ═══ BT: MBankTransfer (window 200105) ═══
  if (!ONLY || ONLY === 'bt') {
    var btHead = function (over) { return Object.assign({ ad_org_id: 11, from_c_bankaccount_id: 100, from_ad_org_id: 11, to_c_bankaccount_id: 101, to_ad_org_id: 11, from_amt: 10, to_amt: 10, from_c_bpartner_id: 117, to_c_bpartner_id: 117,
      paydate: TODAY + ' 00:00:00', dateacct: TODAY + ' 00:00:00', from_tendertype: 'A', to_tendertype: 'A', from_c_charge_id: 100, to_c_charge_id: 100, description: 'PORT bt' }, over || {}); };
    var bt = function (id, issue, over, steps) { return { id: id, issue: issue, table: 'c_banktransfer', child: null, head: btHead(over), lines: [], steps: steps }; };
    await judge('BT', bt('BT1-normal', 'B2/B3 Complete makes TWO completed payments (out of From, into To), Processed, DocAction Close; Close keeps them', null, ['CO', 'CL']), function (tw) {
      check('BT', 'B2', 'Complete: status CO, Processed Y, DocAction CL and two payments, a payment out of account 100 and a receipt into 101, both Completed (MBankTransfer.completeIt :230-313)', tw.steps[0] && tw.steps[0].ok && /^CO:CL:Y:10:10/.test(tw.steps[0].facts.head) && /CO:N:10:100:100:117:Y:doc ; CO:Y:10:101:100:117:Y:doc/.test(tw.steps[0].facts.child), tw.steps[0]);
      check('BT', 'B4', 'Close: status CL, the payments stay Completed (MBankTransfer.closeIt :341-354)', tw.steps[1] && tw.steps[1].ok && /^CL:CL:Y/.test(tw.steps[1].facts.head) && /CO:N:10:100.*CO:Y:10:101/.test(tw.steps[1].facts.child), tw.steps[1]);
    });
    await judge('BT', bt('BT2-rate', 'B1 the rate drives To_Amt (beforeSave :144-152): Rate 1.5 x From_Amt 10 = 15.00', { rate: 1.5, to_amt: 0 }, ['CO']), function (tw) { check('BT', 'B1', 'Rate 1.5 and From_Amt 10 give To_Amt 15 (rounded to the currency precision) and the To payment is for 15', tw.steps[0] && tw.steps[0].ok && /:10:15:1.5:/.test(tw.steps[0].facts.head) && /CO:Y:15:101/.test(tw.steps[0].facts.child), tw.steps[0]); });
    await judge('BT', bt('BT3-rate-from-amounts', 'B1 no rate: Rate = To_Amt / From_Amt to 12 decimals', { from_amt: 8, to_amt: 10, rate: 0 }, ['PR']), function (tw) { check('BT', 'B1b', 'Rate 0 with From 8 and To 10: Rate becomes 1.25', tw.steps[0] && tw.steps[0].ok && /:8:10:1.25:/.test(tw.steps[0].facts.head), tw.steps[0]); });
    await judge('BT', bt('BT4-draft-void', 'B5 Void of a Drafted transfer: status VO, Processed Y, DocAction --, no payments', null, ['VO']), function (tw) { check('BT', 'B5', 'Void of a Drafted transfer goes through: VO:--:Y with no payments (MBankTransfer.voidIt :315-339)', tw.steps[0] && tw.steps[0].ok && /^VO:--:Y/.test(tw.steps[0].facts.head) && tw.steps[0].facts.child === '', tw.steps[0]); });
    await judge('BT', bt('BT5-same-account', 'B6 From and To account must differ', { to_c_bankaccount_id: 100 }, ['CO']), function (tw) { check('BT', 'B6', 'The same bank account on both sides is refused at save with the legacy message (MBankTransfer.beforeSave :93-96)', /From Bank Account and To Bank Account must be different MBankTransfer\[0-null/.test(tw.made || ''), { made: tw.made }); });
    for (var bact of ['RE']) await judge('BT', bt('BT6-' + bact, 'B7 ' + bact + ' answers false and changes nothing', null, ['CO', bact]), function (tw) { check('BT', 'B7' + bact, bact + ' on a Completed transfer answers false, nothing changes (MBankTransfer :402-414)', tw.steps[1] && !tw.steps[1].ok && /^CO:CL:Y/.test(tw.steps[1].facts.head), tw.steps[1]); });
    verdict('BT', LEGACY ? null : 'parity claims not run (DA4_LEGACY=1 runs them on the pilot)');
  }

  say('§DA4-VERDICT ' + (!ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : (LEGACY ? 'PASS' : 'INCONCLUSIVE')) + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' legacy=' + (LEGACY ? 'pilot' : 'OFF (twin claims only; parity not judged)'));
  process.exit(ALL.failed ? 1 : 0);
})().catch(function (e) { _log('§DA4-ERROR ' + (e && e.stack || e)); process.exit(2); });
