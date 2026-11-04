/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// proj_fold.js — BIM → Project Order fold engine (docs/BIMtoProject.md §C, prompts/BIM_TO_PROJECT.md TASK C)
// Folds a priced selection (the apply5DRates rows) into an iDempiere C_Project tree:
//   C_Project (find-or-create by Value=building) → C_ProjectPhase (per 4D phase, seqno+dates) →
//   C_ProjectTask (per resource) → C_ProjectLine (per IFC type, find-or-create M_Product/Category).
// EXTRACT/COMPILE ONLY: phase/seqno/resource from sequence_rules.json, price from the rate pack, qty
//   from QTO. Money via BigDecimal (erp/bigdecimal.js) — never raw Number arithmetic on amounts.
// IDEMPOTENT: every row is find-or-create on a natural key → a second fold adds 0 rows (W-PROJ-PUSH +0).
// Dual export: node (require → witness tests/poc_proj_push.js) + browser (window.ProjFold → the > to ERP button).
(function (global) {
  'use strict';
  var BD = (typeof module !== 'undefined' && module.exports)
    ? require('../erp/bigdecimal.js')
    : (global.BigDecimal);
  var HALF_UP = BD.RoundingMode.HALF_UP;
  // §EXACT_LOOKUP_BLINDSPOT P2 — resolved LAZILY (called only inside foldProjectOrder, never at
  // module-load time): viewer.html loads proj_fold.js (:868) BEFORE schedule_author.js (:932), so
  // capturing global.ScheduleAuthor at top-level `var` time would freeze it at undefined forever.
  var SA_NODE = (typeof module !== 'undefined' && module.exports) ? require('./schedule_author.js') : null;
  function _SA() { return SA_NODE || global.ScheduleAuthor; }

  // BIM-folded rows live in a high PK band so they never collide with seed / real iDempiere IDs.
  var BIM_BASE = 990000;

  function _scalar(db, sql, params) {
    var r = db.exec(sql, params || []);
    return (r.length && r[0].values.length) ? r[0].values[0][0] : null;
  }
  // per-table monotonic id allocator, seeded above max(existing, BIM_BASE-1)
  function _allocator(db) {
    var next = {};
    return function (table, idCol) {
      if (next[table] == null) {
        var mx = Number(_scalar(db, 'SELECT COALESCE(MAX("' + idCol + '"),0) FROM "' + table + '"') || 0);
        next[table] = Math.max(mx, BIM_BASE - 1) + 1;
      }
      return next[table]++;
    };
  }
  // ── legacy project-line rules (prompts/CAPEX_DASHBOARD.md §12.1 D2, measured by capex/tools/shed_twin.js against the pilot) ──
  // MProjectLine.beforeSave :206-230 — PlannedAmt = PlannedQty × PlannedPrice (exact, unrounded); PlannedMarginAmt = (PlannedPrice − LimitPrice) × PlannedQty where LimitPrice = the
  //   PlannedPrice unless the project's price list prices the product (getLimitPrice :170-183) ⇒ 0 for a project with no price list. MProjectLine.updateHeader :280-325 — rolls the active lines
  //   up into C_Project (PlannedAmt, PlannedQty, PlannedMarginAmt, CommittedAmt, CommittedQty, InvoicedAmt, InvoicedQty), C_ProjectPhase and C_ProjectTask (PlannedAmt, CommittedAmt).
  //   PO.saveNew leaves omitted columns to the physical DEFAULT (ad_ddl_default, extracted). Decimal arithmetic is exact (BigInt), as Postgres numeric is.
  function _dec(v) { var t = String(v == null || v === '' ? '0' : v).trim(), neg = t[0] === '-'; if (neg) t = t.slice(1); var p = t.split('.'), f = p[1] || ''; return { i: BigInt((neg ? '-' : '') + (p[0] || '0') + f), sc: f.length }; }
  function _decAlign(a, b) { var sc = Math.max(a.sc, b.sc); return [a.i * BigInt(10) ** BigInt(sc - a.sc), b.i * BigInt(10) ** BigInt(sc - b.sc), sc]; }
  function _decAdd(a, b) { var x = _decAlign(a, b); return { i: x[0] + x[1], sc: x[2] }; }
  function _decMul(a, b) { return { i: a.i * b.i, sc: a.sc + b.sc }; }
  function _decStr(d) { var neg = d.i < 0, s = (neg ? -d.i : d.i).toString(); if (d.sc > 0) { while (s.length <= d.sc) s = '0' + s; s = s.slice(0, s.length - d.sc) + '.' + s.slice(s.length - d.sc); } return (neg ? '-' : '') + s; }
  function _ddlFill(db, table, keyCol, id, notes) {      // PO.saveNew: an omitted (NULL) column takes the physical DEFAULT
    var dd; try { dd = db.exec("SELECT columnname, defaultvalue FROM ad_ddl_default WHERE tablename=?", [table.toLowerCase()]); } catch (e) { dd = []; }
    if (!dd.length) { if (notes && notes.indexOf('NO_DDL_DEFAULTS') < 0) notes.push('NO_DDL_DEFAULTS'); return; }
    var have = {}; (db.exec('PRAGMA table_info(' + table + ')')[0] || { values: [] }).values.forEach(function (r) { have[String(r[1]).toLowerCase()] = 1; });
    dd[0].values.forEach(function (r) { var c = String(r[0]).toLowerCase(); if (!have[c]) return; db.run('UPDATE ' + table + ' SET ' + c + '=? WHERE ' + keyCol + '=? AND ' + c + ' IS NULL', [r[1], id]); });
  }
  function _legacyProjectRules(db, projId, notes) {
    var q = function (sql, p) { var r = db.exec(sql, p || []); return r.length ? r[0].values : []; };
    var pl = q('SELECT M_PriceList_Version_ID FROM C_Project WHERE C_Project_ID=?', [projId])[0];
    if (pl && pl[0] != null) notes.push('MARGIN_PRICELIST_UNPORTED project=' + projId + ' (getLimitPrice via IProductPricing not ported; margin left as computed without it)');
    q('SELECT c_projectline_id FROM C_ProjectLine WHERE c_project_id=?', [projId]).forEach(function (r) { _ddlFill(db, 'C_ProjectLine', 'c_projectline_id', r[0], notes); });
    q('SELECT C_ProjectPhase_ID FROM C_ProjectPhase WHERE C_Project_ID=?', [projId]).forEach(function (r) { _ddlFill(db, 'C_ProjectPhase', 'C_ProjectPhase_ID', r[0], notes);
      q('SELECT C_ProjectTask_ID FROM C_ProjectTask WHERE C_ProjectPhase_ID=?', [r[0]]).forEach(function (t) { _ddlFill(db, 'C_ProjectTask', 'C_ProjectTask_ID', t[0], notes); }); });
    _ddlFill(db, 'C_Project', 'C_Project_ID', projId, notes);
    var Z = function () { return { i: BigInt(0), sc: 0 }; }, P = { pa: Z(), pq: Z(), pm: Z(), ca: Z(), cq: Z(), ia: Z(), iq: Z() }, PH = {}, TK = {};
    q('SELECT c_projectline_id, plannedqty, plannedprice, committedamt, committedqty, invoicedamt, invoicedqty, c_projectphase_id, c_projecttask_id, isactive FROM C_ProjectLine WHERE c_project_id=?', [projId]).forEach(function (r) {
      var amt = _decMul(_dec(r[1]), _dec(r[2])), margin = { i: BigInt(0), sc: 0 };
      db.run('UPDATE C_ProjectLine SET plannedamt=?, plannedmarginamt=? WHERE c_projectline_id=?', [_decStr(amt), _decStr(margin), r[0]]);
      if (r[9] !== 'Y') return;
      P.pa = _decAdd(P.pa, amt); P.pq = _decAdd(P.pq, _dec(r[1])); P.pm = _decAdd(P.pm, margin); P.ca = _decAdd(P.ca, _dec(r[3])); P.cq = _decAdd(P.cq, _dec(r[4])); P.ia = _decAdd(P.ia, _dec(r[5])); P.iq = _decAdd(P.iq, _dec(r[6]));
      if (r[7] != null) { var h = PH[r[7]] = PH[r[7]] || { a: Z(), c: Z() }; h.a = _decAdd(h.a, amt); h.c = _decAdd(h.c, _dec(r[3])); }
      if (r[8] != null) { var k = TK[r[8]] = TK[r[8]] || { a: Z(), c: Z() }; k.a = _decAdd(k.a, amt); k.c = _decAdd(k.c, _dec(r[3])); }
    });
    db.run('UPDATE C_Project SET PlannedAmt=?, PlannedQty=?, PlannedMarginAmt=?, CommittedAmt=?, CommittedQty=?, InvoicedAmt=?, InvoicedQty=? WHERE C_Project_ID=?',
      [_decStr(P.pa), _decStr(P.pq), _decStr(P.pm), _decStr(P.ca), _decStr(P.cq), _decStr(P.ia), _decStr(P.iq), projId]);
    q('SELECT C_ProjectPhase_ID FROM C_ProjectPhase WHERE C_Project_ID=?', [projId]).forEach(function (r) { var h = PH[r[0]] || { a: Z(), c: Z() };   // a phase whose lines carry no phase: legacy updates only phases that HAVE lines
      if (PH[r[0]]) db.run('UPDATE C_ProjectPhase SET PlannedAmt=?, CommittedAmt=? WHERE C_ProjectPhase_ID=?', [_decStr(h.a), _decStr(h.c), r[0]]);
      q('SELECT C_ProjectTask_ID FROM C_ProjectTask WHERE C_ProjectPhase_ID=?', [r[0]]).forEach(function (t) { var k = TK[t[0]]; if (k) db.run('UPDATE C_ProjectTask SET PlannedAmt=?, CommittedAmt=? WHERE C_ProjectTask_ID=?', [_decStr(k.a), _decStr(k.c), t[0]]); });
    });
    return { plannedAmt: _decStr(P.pa), plannedQty: _decStr(P.pq) };
  }
  // legacy stamps Created/Updated in the SERVER'S local time (timestamp without time zone); the old default here was UTC (§12.1 D7)
  function _localNow() { try { var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()); } catch (e) { return '2026-01-01 00:00:00'; } }
  function _uu() {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    // a v4 UUID either way: legacy's *_UU columns are Postgres `uuid` — the old 'bim-<hex>' fallback was refused on push ("invalid input syntax for type uuid", prompts/CAPEX_DASHBOARD.md §12.1 D4)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  // §F1 W-FIN-CURRENCY — resolve a currency by ISO_Code first, then CurSymbol. The rate packs carry the
  // display symbol ('RM' in cidb2024_my), NOT the ISO ('MYR'); the seed's C_Currency.CurSymbol bridges
  // them (MYR.CurSymbol='RM'). ISO-exact wins so 'USD' never matches a stray symbol. EXTRACT-only.
  function _resolveCurrency(db, code) {
    if (code == null) return null;
    return _scalar(db, "SELECT C_Currency_ID FROM C_Currency WHERE ISO_Code=? OR CurSymbol=? " +
      "ORDER BY (ISO_Code=?) DESC, C_Currency_ID LIMIT 1", [code, code, code]);
  }
  // §F3 W-FIN-GLMAP — the p_*_acct columns a product category carries; both M_Product_Category_Acct and
  // C_AcctSchema_Default expose this set, so a new BIM category copies the schema defaults verbatim (exactly
  // as iDempiere's MProductCategory.insertAccounting does). EXTRACT-only: every value is a real
  // C_ValidCombination from the seed's chart of accounts — never a fabricated account number.
  var _CAT_ACCT_COLS = ['p_revenue_acct', 'p_expense_acct', 'p_asset_acct', 'p_cogs_acct',
    'p_purchasepricevariance_acct', 'p_invoicepricevariance_acct', 'p_tradediscountrec_acct',
    'p_tradediscountgrant_acct', 'p_inventoryclearing_acct', 'p_costadjustment_acct', 'p_floorstock_acct',
    'p_wip_acct', 'p_methodchangevariance_acct', 'p_usagevariance_acct', 'p_ratevariance_acct',
    'p_mixvariance_acct', 'p_costofproduction_acct', 'p_labor_acct', 'p_burden_acct',
    'p_outsideprocessing_acct', 'p_overhead_acct', 'p_scrap_acct', 'p_averagecostvariance_acct',
    'p_landedcostclearing_acct'];
  // create M_Product_Category_Acct (per acct schema) for a BIM category, copying C_AcctSchema_Default.
  function _seedCategoryAcct(db, catId, CL, OG, U, now) {
    var schemas = db.exec("SELECT C_AcctSchema_ID FROM C_AcctSchema");
    if (!schemas.length) return 0;
    var n = 0, cols = _CAT_ACCT_COLS, qs = cols.map(function () { return '?'; }).join(',');
    schemas[0].values.forEach(function (row) {
      var asId = row[0];
      if (_scalar(db, "SELECT 1 FROM M_Product_Category_Acct WHERE M_Product_Category_ID=? AND C_AcctSchema_ID=?", [catId, asId]) != null) return;
      var def = db.exec("SELECT " + cols.join(',') + " FROM C_AcctSchema_Default WHERE C_AcctSchema_ID=?", [asId]);
      if (!def.length) return;
      db.run("INSERT INTO M_Product_Category_Acct (m_product_category_id,c_acctschema_id,ad_client_id,ad_org_id," +
        "isactive,created,createdby,updated,updatedby," + cols.join(',') + ",m_product_category_acct_uu) " +
        "VALUES (?,?,?,?,'Y',?,?,?,?," + qs + ",?)",
        [catId, asId, CL, OG, now, U, now, U].concat(def[0].values[0]).concat([_uu()]));
      n++;
    });
    return n;
  }
  // §F3 — the postable account pair for this fold against the primary schema: Dr = WIP/Expense (the cost
  // side, from the schema defaults), Cr = AP (the supplier's BP-group liability, else the schema default).
  function _glMap(db, bpartnerId) {
    var as = Number(_scalar(db, "SELECT C_AcctSchema_ID FROM C_AcctSchema ORDER BY C_AcctSchema_ID LIMIT 1") || 101);
    var wip = _scalar(db, "SELECT p_wip_acct FROM C_AcctSchema_Default WHERE C_AcctSchema_ID=?", [as]);
    var exp = _scalar(db, "SELECT p_expense_acct FROM C_AcctSchema_Default WHERE C_AcctSchema_ID=?", [as]);
    var ap = null;
    if (bpartnerId != null) {
      var grp = _scalar(db, "SELECT C_BP_Group_ID FROM C_BPartner WHERE C_BPartner_ID=?", [bpartnerId]);
      if (grp != null) ap = _scalar(db, "SELECT v_liability_acct FROM C_BP_Group_Acct WHERE C_BP_Group_ID=? AND C_AcctSchema_ID=?", [grp, as]);
    }
    if (ap == null) ap = _scalar(db, "SELECT v_liability_acct FROM C_AcctSchema_Default WHERE C_AcctSchema_ID=?", [as]);
    return { acctSchemaId: as, drWip: wip, drExpense: exp, ap: ap };
  }
  // the primary accounting-schema currency + the conversion (multiply) rate from curId to it.
  // rate '1' when already the acct currency; null when a rate is genuinely absent (→ honest gap note).
  function _convRateToAcct(db, curId) {
    var acct = Number(_scalar(db, "SELECT C_Currency_ID FROM C_AcctSchema ORDER BY C_AcctSchema_ID LIMIT 1") || 100);
    if (curId === acct) return { acctCurId: acct, rate: '1' };
    var r = _scalar(db, "SELECT multiplyrate FROM C_Conversion_Rate WHERE c_currency_id=? AND c_currency_id_to=? " +
      "ORDER BY validfrom DESC LIMIT 1", [curId, acct]);
    return { acctCurId: acct, rate: r != null ? String(r) : null };
  }

  // ── the fold ──────────────────────────────────────────────────────────────────────────────────
  // priced: [{disc,cls,storey,count,unit,qty,rate,cost}]  (apply5DRates output, already scoped)
  // opts: { seqRules, packCurrencyISO, now, clientId=11, orgId=11, user=100, bpartnerId=null, schedule=null }
  // opts.schedule = the 4D OWNER's programme (prompts/CAPEX_DASHBOARD.md §5.1 R1): { start:'YYYY-MM-DD',
  //   tasks:[{id, phase, storey, sDays, eDays, guids}] (= schedule_author.js materializeZones(...).tasks), phaseSeq:{phase→template sequence} }.
  //   The fold computes NO schedule: phases, their dates, the task grid and each line's phase all come from it; priced rows carry `guids`.
  //   Absent → phases grouped by classify() with NO dates + note NO_4D_SCHEDULE (never a fallback estimate).
  function foldProjectOrder(db, building, priced, opts) {
    opts = opts || {};
    var SR = opts.seqRules || {};
    var SCH = (opts.schedule && opts.schedule.tasks && opts.schedule.tasks.length) ? opts.schedule : null;
    var g2t = {};   // guid → 4D task (the owner's)
    if (SCH) SCH.tasks.forEach(function (t) { (t.guids || []).forEach(function (g) { g2t[g] = t; }); });
    // a row's 4D task: the ONE task all its guids sit in; otherwise null (→ 'Unsequenced', named in notes, never guessed)
    var taskById = {};
    if (SCH) SCH.tasks.forEach(function (t) { taskById[t.id] = t; });
    function rowTask(r) {
      if (r.taskId != null) return taskById[r.taskId] || null;      // a producer that split its rows per 4D task (pricedPerTask) names the task directly
      if (!r.guids || !r.guids.length) return null;
      var t = g2t[r.guids[0]];
      if (!t) return null;
      for (var i = 1; i < r.guids.length; i++) if (g2t[r.guids[i]] !== t) return null;
      return t;
    }
    // day offset → date, the owner's rule (schedule_author.js _addDays: UTC days from the start)
    function dayDate(d) { return new Date(Date.parse(SCH.start + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10) + ' 00:00:00'; }
    var HIER = opts.hierarchy || (typeof window !== 'undefined' ? window.IFC_SCHEMA_HIERARCHY : null) || {};
    // §EXACT_LOOKUP_BLINDSPOT P2 — was a raw SR[cls] dict lookup, missing tier 2 (schema-hierarchy
    // inheritance) and tier 3's §CLASS_UNMATCHED visibility. classify() always returns a rule object
    // (tier 1/2/3), never undefined, so callers below no longer need `|| {}`.
    // Tier 3 (genuinely unclassified — no own-name match, no classified ancestor) is remapped back
    // to phase='Unsequenced' here, NOT classify()'s own 'Architecture' default: time_machine.js:4376
    // and poc_dashboard_variance.js:31 both filter `WHERE Name<>'Unsequenced'` on this exact table to
    // keep un-grounded costs out of the phase dashboard total — collapsing tier 3 into 'Architecture'
    // would silently fold those costs into a real phase's committed amount. Tier 1/2 (the actual P2
    // fix) pass through unchanged; only the pre-existing "truly unclassified" bucket is preserved.
    function classifyCls(c) {
      var warned = null, orig = console.warn;
      console.warn = function (m) { warned = m; orig(m); };
      var rule = _SA().classify(c, HIER, SR);
      console.warn = orig;
      if (warned && warned.indexOf('§CLASS_UNMATCHED_INHERITED') !== 0 && warned.indexOf('§CLASS_UNMATCHED') === 0) {
        return { phase: 'Unsequenced', sequence: rule.sequence, resource: rule.resource };
      }
      return rule;
    }
    var CL = opts.clientId != null ? opts.clientId : 11;
    var OG = opts.orgId != null ? opts.orgId : 11;
    var U = opts.user != null ? opts.user : 100;
    var now = opts.now || _localNow();
    var id = _allocator(db);
    var created = { projects: 0, phases: 0, tasks: 0, lines: 0, products: 0, categories: 0, order: 0 };
    var notes = [];
    if (!SCH) notes.push('NO_4D_SCHEDULE phases carry no dates — the programme is the 4D owner\'s (pass opts.schedule)');

    // currency (§F1): resolve the pack currency by ISO_Code OR CurSymbol; carry it onto C_Project/C_Order.
    // Fall back to seed default only if TRULY unresolvable (EXTRACT-only — never invent a currency).
    var curCode = opts.packCurrencyISO || 'USD';
    var curId = _resolveCurrency(db, curCode);
    if (curId == null) { curId = 100; notes.push('CUR_FALLBACK pack=' + curCode + '→USD(100) (seed lacks ' + curCode + ')'); }
    // conversion rate to the accounting currency (so the amounts can post). Honest gap if absent.
    var conv = _convRateToAcct(db, curId);
    if (conv.rate == null) notes.push('NO_CONV_RATE cur=' + curCode + '(' + curId + ')→acct(' + conv.acctCurId + ') — run scripts/seed_fin_currency.js');

    // ── C_Project (find-or-create by Value) ──
    var projId = _scalar(db, "SELECT C_Project_ID FROM C_Project WHERE Value=?", [building]);
    if (projId == null) {
      projId = id('C_Project', 'C_Project_ID');
      db.run("INSERT INTO C_Project (C_Project_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
        "Value,Name,IsSummary,C_Currency_ID,PlannedAmt,PlannedQty,IsCommitment,ProjInvoiceRule,ProjectLineLevel,Processed,Processing,C_Project_UU) " +
        "VALUES (?,?,?,'Y',?,?,?,?,?,?,'N',?,0,0,'N','-','P','N','N',?)",
        [projId, CL, OG, now, U, now, U, building, 'BIM: ' + building, curId, _uu()]);
      created.projects = 1;
    }

    // canonical phase→seqno from the FULL sequence_rules (min sequence over ALL classes of a phase) —
    // stable across buildings, NOT dependent on which classes a given selection happens to contain.
    var phaseSeq = {};
    Object.keys(SR).forEach(function (c) {
      var p = SR[c].phase, s = SR[c].sequence;
      if (p == null || s == null) return;
      if (phaseSeq[p] == null || s < phaseSeq[p]) phaseSeq[p] = s;
    });

    // group priced rows by phase. WITH a programme: the 4D phase of the row's task (and the task is the line's WBS slot);
    // WITHOUT: classify() as before (sequence_rules), and no dates. seqno = template sequence (schedule) / canonical phase sequence.
    var phases = {};   // phaseName → { seqno, resources:{res:[rows]}, tasks:{taskId:{t,rows}}, rows:[] }
    var unplaced = 0, taskOfRow = new Map();   // row → its 4D task (kept off the caller's row objects)
    priced.forEach(function (r) {
      var sr = classifyCls(r.cls), ph, t = null;
      if (SCH) { t = rowTask(r); ph = t ? t.phase : 'Unsequenced'; if (!t) unplaced += (r.count || 0); }
      else ph = sr.phase || 'Unsequenced';
      var res = sr.resource || 'GENERAL';
      var seq = SCH ? (SCH.phaseSeq && SCH.phaseSeq[ph] != null ? SCH.phaseSeq[ph] : 99)
                    : (phaseSeq[ph] != null ? phaseSeq[ph] : (sr.sequence != null ? sr.sequence : 99));
      var p = phases[ph] || (phases[ph] = { seqno: seq, resources: {}, tasks: {}, rows: [] });
      if (SCH) { if (t) (p.tasks[t.id] || (p.tasks[t.id] = { t: t, rows: [] })).rows.push(r); }
      else (p.resources[res] || (p.resources[res] = [])).push(r);
      taskOfRow.set(r, t);
      p.rows.push(r);
    });
    if (unplaced) notes.push('ROW_NOT_IN_ONE_4D_TASK elements=' + unplaced + ' → phase Unsequenced (rows without guids, or guids outside / across 4D tasks)');
    var phaseNames = Object.keys(phases).sort(function (a, b) { return phases[a].seqno - phases[b].seqno; });
    // a phase's window = min start / max end over ALL the owner's tasks of that phase (not only the ones this selection touches)
    var phWin = {};
    if (SCH) SCH.tasks.forEach(function (t) {
      var w = phWin[t.phase] || (phWin[t.phase] = { s: Infinity, e: -Infinity });
      if (t.sDays < w.s) w.s = t.sDays; if (t.eDays > w.e) w.e = t.eDays;
    });

    var projAmt = BD.ZERO, projQty = 0;
    var seqLog = [];

    phaseNames.forEach(function (ph) {
      var P = phases[ph];
      // dates: the owner's programme, or none (the fold computes no duration)
      var w = SCH ? phWin[ph] : null;
      var sDate = w ? dayDate(w.s) : null, eDate = w ? dayDate(w.e) : null;

      // find-or-create C_ProjectPhase (Project + Name)
      var phId = _scalar(db, "SELECT C_ProjectPhase_ID FROM C_ProjectPhase WHERE C_Project_ID=? AND Name=?", [projId, ph]);
      if (phId == null) {
        phId = id('C_ProjectPhase', 'C_ProjectPhase_ID');
        db.run("INSERT INTO C_ProjectPhase (C_ProjectPhase_ID,C_Project_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
          "Name,SeqNo,StartDate,EndDate,IsComplete,PlannedAmt,Qty,C_ProjectPhase_UU) VALUES (?,?,?,?,'Y',?,?,?,?,?,?,?,?,'N',0,0,?)",
          [phId, projId, CL, OG, now, U, now, U, ph, P.seqno, sDate, eDate, _uu()]);
        created.phases++;
      } else {
        db.run("UPDATE C_ProjectPhase SET SeqNo=?,StartDate=?,EndDate=? WHERE C_ProjectPhase_ID=?", [P.seqno, sDate, eDate, phId]);
      }
      seqLog.push({ phase: ph, seqno: P.seqno, start: sDate ? sDate.slice(0, 10) : null, end: eDate ? eDate.slice(0, 10) : null });

      // tasks: WITH a programme one per 4D task (= one Gantt bar, named as the owner names it in tasks.name); WITHOUT, per resource as before
      var taskByRes = {}, taskBy4D = {};
      function _task(name) {
        var tId = _scalar(db, "SELECT C_ProjectTask_ID FROM C_ProjectTask WHERE C_ProjectPhase_ID=? AND Name=?", [phId, name]);
        if (tId == null) {
          tId = id('C_ProjectTask', 'C_ProjectTask_ID');
          db.run("INSERT INTO C_ProjectTask (C_ProjectTask_ID,C_ProjectPhase_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
            "Name,SeqNo,PlannedAmt,Qty,C_ProjectTask_UU) VALUES (?,?,?,?,'Y',?,?,?,?,?,?,0,0,?)",
            [tId, phId, CL, OG, now, U, now, U, name, P.seqno, _uu()]);
          created.tasks++;
        }
        return tId;
      }
      if (SCH) Object.keys(P.tasks).sort(function (a, b) { return P.tasks[a].t.sDays - P.tasks[b].t.sDays || (a < b ? -1 : 1); })
        .forEach(function (k) { var t = P.tasks[k].t; taskBy4D[k] = _task(t.phase + ' \u2014 ' + t.storey); });
      else Object.keys(P.resources).forEach(function (res) { taskByRes[res] = _task(res); });

      // lines per IFC class (the BoQ line); roll the cls's per-group rounded costs (BigDecimal)
      var phAmt = BD.ZERO;
      var byCls = {};
      // §PROXY_BY_DISC: the generic IfcBuildingElementProxy says nothing about WHAT it is (every civil element is one) —
      // its identity is the DISCIPLINE, so a proxy with a discipline gets one line per discipline. Other classes unchanged.
      function _lineKey(r) { return (r.cls === 'IfcBuildingElementProxy' && r.disc && r.disc.charAt(0) !== '_') ? r.cls + ':' + r.disc : r.cls; }
      // with a programme a line is (product, 4D task): every line sits in exactly one Gantt bar
      P.rows.forEach(function (r) { var k = _lineKey(r) + (SCH ? '#' + (taskOfRow.get(r) ? taskOfRow.get(r).id : '') : ''); (byCls[k] || (byCls[k] = [])).push(r); });
      var lineNo = 10;
      Object.keys(byCls).forEach(function (key) {
        var rows = byCls[key];
        var t4 = SCH ? taskOfRow.get(rows[0]) : null;
        key = _lineKey(rows[0]);
        var cls = rows[0].cls, byDisc = key !== cls;
        var pName = byDisc ? rows[0].disc.charAt(0) + rows[0].disc.slice(1).toLowerCase() : cls;
        var unpriced = rows.some(function (r) { return r.unpriced; });
        var unit = rows[0].unit, rate = rows[0].rate, disc = rows[0].disc, res = classifyCls(cls).resource || 'GENERAL';
        var qty = 0, amt = BD.ZERO, cnt = 0;
        rows.forEach(function (r) {
          qty += r.qty; cnt += r.count;
          // money via BigDecimal: round(rate × qty) per group, HALF_UP to 0dp (== apply5DRates basis)
          amt = amt.add(BD.of(String(rate)).multiply(BD.of(String(r.qty))).setScale(0, HALF_UP));
        });
        phAmt = phAmt.add(amt);

        // find-or-create M_Product_Category (by discipline) + M_Product (by Value=cls)
        var catId = _scalar(db, "SELECT M_Product_Category_ID FROM M_Product_Category WHERE Value=?", ['BIM-' + disc]);
        if (catId == null) {
          catId = id('M_Product_Category', 'M_Product_Category_ID');
          db.run("INSERT INTO M_Product_Category (M_Product_Category_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
            "Value,Name,IsDefault,M_Product_Category_UU) VALUES (?,?,?,'Y',?,?,?,?,?,?,'N',?)",
            [catId, CL, OG, now, U, now, U, 'BIM-' + disc, 'BIM ' + disc, _uu()]);
          created.categories++;
          _seedCategoryAcct(db, catId, CL, OG, U, now); // §F3 — GL accounts from schema defaults
        }
        var uomId = _scalar(db, "SELECT C_UOM_ID FROM C_UOM WHERE X12DE355=?", [unit]) || 100; // seed lacks M/M2/M3 → EA
        if (uomId === 100 && unit !== 'EA') notes.push('UOM_FALLBACK ' + key + ' ' + unit + '→EA (seed lacks ' + unit + ')');
        var prodId = _scalar(db, "SELECT M_Product_ID FROM M_Product WHERE Value=?", [key]);
        if (prodId == null) {
          prodId = id('M_Product', 'M_Product_ID');
          // C_TaxCategory_ID is MANDATORY on legacy M_Product (NOT NULL); the window defaults it from #C_TaxCategory_ID = the IsDefault='Y' tax category, most specific first
          //   (Login.loadDefault :701-734 + GridField system preference). Without it legacy refuses the product on push (prompts/CAPEX_DASHBOARD.md §12.1 D5).
          var taxCat = null; try { taxCat = _scalar(db, "SELECT C_TaxCategory_ID FROM C_TaxCategory WHERE IsDefault='Y' AND IsActive='Y' AND AD_Client_ID IN (0,?) ORDER BY AD_Client_ID DESC, AD_Org_ID DESC", [CL]); } catch (e) { taxCat = null; }
          if (taxCat == null) notes.push('NO_DEFAULT_TAXCATEGORY ' + key + ' — legacy will refuse this product (C_TaxCategory_ID mandatory)');
          db.run("INSERT INTO M_Product (M_Product_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
            "Value,Name,Description,M_Product_Category_ID,C_UOM_ID,ProductType,IsSummary,IsStocked,IsSold,IsPurchased,M_Product_UU,C_TaxCategory_ID) " +
            "VALUES (?,?,?,'Y',?,?,?,?,?,?,?,?,?,'I','N','Y','Y','Y',?,?)",
            [prodId, CL, OG, now, U, now, U, key, pName + ' (BIM)', 'BIM type · billed per ' + unit, catId, uomId, _uu(), taxCat]);
          created.products++;
        }

        // find-or-create C_ProjectLine: (Project + Product) — with a programme (Project + Product + Phase + 4D task)
        var lnTask = SCH ? (t4 ? taskBy4D[t4.id] : null) : taskByRes[res];
        var lnId = SCH
          ? _scalar(db, "SELECT c_projectline_id FROM C_ProjectLine WHERE c_project_id=? AND m_product_id=? AND c_projectphase_id=? AND COALESCE(c_projecttask_id,-1)=?", [projId, prodId, phId, lnTask == null ? -1 : lnTask])
          : _scalar(db, "SELECT c_projectline_id FROM C_ProjectLine WHERE c_project_id=? AND m_product_id=?", [projId, prodId]);
        var amtStr = amt.toString(), qtyStr = String(Math.round(qty * 1000) / 1000), rateStr = String(rate);
        if (lnId == null) {
          lnId = id('C_ProjectLine', 'c_projectline_id');
          db.run("INSERT INTO C_ProjectLine (c_projectline_id,c_project_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby," +
            "line,description,plannedqty,plannedprice,plannedamt,m_product_id,m_product_category_id,c_projectphase_id,c_projecttask_id," +
            "isprinted,processed,dopricing,c_projectline_uu) VALUES (?,?,?,?,'Y',?,?,?,?,?,?,?,?,?,?,?,?,?,'Y','N','Y',?)",
            [lnId, projId, CL, OG, now, U, now, U, lineNo,
             byDisc ? cnt + ' ea · discipline ' + disc + (unpriced ? ' · rate not set' : '') : cls + ' · ' + cnt + ' ea · per ' + unit,
             qtyStr, rateStr, amtStr, prodId, catId, phId, lnTask, _uu()]);
          created.lines++;
        } else {
          db.run("UPDATE C_ProjectLine SET plannedqty=?,plannedprice=?,plannedamt=?,c_projectphase_id=?,c_projecttask_id=? WHERE c_projectline_id=?",
            [qtyStr, rateStr, amtStr, phId, lnTask, lnId]);
        }
        lineNo += 10;
        projQty += cnt;
      });

      // roll up phase amount
      db.run("UPDATE C_ProjectPhase SET PlannedAmt=? WHERE C_ProjectPhase_ID=?", [phAmt.toString(), phId]);
      projAmt = projAmt.add(phAmt);
    });

    // roll up project — legacy's own rule set (line amount, margin, defaults, updateHeader) replaces the fold's rounded per-phase sums (§12.1 D2)
    var LR = _legacyProjectRules(db, projId, notes);
    if (projAmt.toString() !== LR.plannedAmt) notes.push('LEGACY_LINE_RULE plannedAmt fold=' + projAmt.toString() + ' legacy=' + LR.plannedAmt + ' (PlannedQty x PlannedPrice, unrounded); plannedQty elements=' + projQty + ' legacy=' + LR.plannedQty);
    projAmt = { toString: function () { return LR.plannedAmt; } }; projQty = LR.plannedQty;

    // PO gate (§C step 5): only with a supplier — else plan-only (non-invent)
    var orderId = null;
    if (opts.bpartnerId) {
      orderId = _scalar(db, "SELECT C_Order_ID FROM C_Order WHERE Description=?", ['BIM PO: ' + building]);
      if (orderId == null) {
        orderId = id('C_Order', 'C_Order_ID');
        db.run("INSERT INTO C_Order (C_Order_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
          "C_BPartner_ID,Description,IsSOTrx,DocStatus,GrandTotal,C_Currency_ID,DateOrdered,C_Order_UU) " +
          "VALUES (?,?,?,'Y',?,?,?,?,?,?,'N','DR',?,?,?,?)",
          [orderId, CL, OG, now, U, now, U, opts.bpartnerId, 'BIM PO: ' + building, projAmt.toString(), curId, now, _uu()]);
        created.order = 1;
      }
    } else { notes.push('PLAN_ONLY no supplier → no C_Order PO'); }

    return {
      projectId: projId, created: created, plannedAmt: projAmt.toString(), plannedQty: projQty,
      orderId: orderId, seqLog: seqLog, notes: notes, currencyId: curId,
      acctCurrencyId: conv.acctCurId, convRateToAcct: conv.rate, glMap: _glMap(db, opts.bpartnerId)
    };
  }

  // foldAuthoredPhases(db, building, phases, opts) — sync the AUTHORED 4D schedule (the wizard's phases,
  // straight from the IFC `tasks` table) into the ERP C_ProjectPhase rows the What-if panel reads. Unlike
  // foldProjectOrder (which RE-DERIVES phases from element IFC-class via sequence_rules + needs priced rows),
  // this writes the user's OWN phase set 1:1 — name/seqno/dates/plannedAmt — so What-if matches the wizard.
  // find-or-create C_Project by Value; find-or-create C_ProjectPhase by (Project, Name) → UPDATE seqno/dates/
  // plannedAmt; INSERT if absent. IDEMPOTENT (a 2nd identical sync = +0 phases). Writes ONLY C_ProjectPhase
  // (all What-if needs); the C_ProjectTask/Line tree is foldProjectOrder's job. Blue branch rows are untouched.
  //   phases: [{ name, seqno, start, end, plannedAmt }]  (start/end 'YYYY-MM-DD' or full ts; plannedAmt num|str)
  function foldAuthoredPhases(db, building, phases, opts) {
    opts = opts || {};
    var CL = opts.clientId != null ? opts.clientId : 11;
    var OG = opts.orgId != null ? opts.orgId : 11;
    var U = opts.user != null ? opts.user : 100;
    var now = opts.now || _localNow();
    var id = _allocator(db);
    var created = { projects: 0, phases: 0, updated: 0 };
    function _ts(d) { if (!d) return null; d = String(d); return d.length <= 10 ? d + ' 00:00:00' : d.slice(0, 19); }

    var projId = _scalar(db, "SELECT C_Project_ID FROM C_Project WHERE Value=?", [building]);
    if (projId == null) {
      projId = id('C_Project', 'C_Project_ID');
      var curId = opts.currencyId != null ? opts.currencyId : 100;
      db.run("INSERT INTO C_Project (C_Project_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
        "Value,Name,IsSummary,C_Currency_ID,PlannedAmt,PlannedQty,IsCommitment,ProjInvoiceRule,ProjectLineLevel,Processed,Processing,C_Project_UU) " +
        "VALUES (?,?,?,'Y',?,?,?,?,?,?,'N',?,0,0,'N','-','P','N','N',?)",
        [projId, CL, OG, now, U, now, U, building, 'BIM: ' + building, curId, _uu()]);
      created.projects = 1;
    }

    (phases || []).forEach(function (p, i) {
      var nm = String(p.name || ('Phase ' + (i + 1)));
      var seq = (p.seqno != null) ? p.seqno : (i + 1);
      var s = _ts(p.start), e = _ts(p.end);
      var amt = (p.plannedAmt != null) ? String(p.plannedAmt) : '0';
      var phId = _scalar(db, "SELECT C_ProjectPhase_ID FROM C_ProjectPhase WHERE C_Project_ID=? AND Name=?", [projId, nm]);
      if (phId == null) {
        phId = id('C_ProjectPhase', 'C_ProjectPhase_ID');
        db.run("INSERT INTO C_ProjectPhase (C_ProjectPhase_ID,C_Project_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
          "Name,SeqNo,StartDate,EndDate,IsComplete,PlannedAmt,Qty,C_ProjectPhase_UU) VALUES (?,?,?,?,'Y',?,?,?,?,?,?,?,?,'N',?,0,?)",
          [phId, projId, CL, OG, now, U, now, U, nm, seq, s, e, amt, _uu()]);
        created.phases++;
      } else {
        db.run("UPDATE C_ProjectPhase SET SeqNo=?,StartDate=?,EndDate=?,PlannedAmt=? WHERE C_ProjectPhase_ID=?", [seq, s, e, amt, phId]);
        created.updated++;
      }
    });
    console.log('§PROJ_FOLD_AUTHORED project="' + building + '" phases=+' + created.phases + ' updated=' + created.updated + ' projId=' + projId);
    return { projectId: projId, created: created };
  }

  // ── scheduleFromDb(bdb, template, SA) — the programme the viewer already holds, as foldProjectOrder's opts.schedule (prompts/CAPEX_DASHBOARD.md §5.5 R1-f).
  // Which schedule: the owner's ScheduleAuthor.activeSchedule(db) (authored first, else imported). Rows: what materializeZones / the import wrote (tasks + task_elements).
  // phase = the template phase prefixing the task name as "<phase> — <storey>" (the name _writeTemplateSchedule writes), else the WBS parent summary's name (not the root),
  // else none (its rows go to Unsequenced). phaseSeq = template sequence, else rank by earliest start (noted). Returns null when there is no dated schedule. Reads only.
  function scheduleFromDb(bdb, template, SA) {
    SA = SA || _SA();
    var act = null; try { act = SA && SA.activeSchedule ? SA.activeSchedule(bdb) : null; } catch (e) { act = null; }
    if (!act) { console.log('§PROJ_FOLD_SCHEDULE none — no active dated schedule in the building db'); return null; }
    function rows(sql, p) { var r = bdb.exec(sql, p || []); return r.length ? r[0].values : []; }
    var all = rows("SELECT task_id, name, schedule_start, schedule_finish, wbs_parent, is_summary FROM tasks WHERE schedule_id=?", [act.id]);
    var byId = {}; all.forEach(function (v) { byId[v[0]] = { id: v[0], name: v[1], s: v[2], f: v[3], parent: v[4], summary: v[5] === 1 || v[5] === '1' }; });
    var names = ((template && template.phases) || []).map(function (p) { return p.name; }).sort(function (a, b) { return b.length - a.length; });
    var leaf = all.filter(function (v) { return !(v[5] === 1 || v[5] === '1') && v[2] != null; }).map(function (v) { return byId[v[0]]; });
    if (!leaf.length) { console.log('§PROJ_FOLD_SCHEDULE none — schedule ' + act.id + ' has no dated task'); return null; }
    var gOf = {};
    rows("SELECT te.task_id, te.guid FROM task_elements te JOIN tasks t ON t.task_id=te.task_id WHERE t.schedule_id=?", [act.id])
      .forEach(function (v) { (gOf[v[0]] || (gOf[v[0]] = [])).push(v[1]); });
    function dnum(x) { var d = String(x).slice(0, 10).split('-'); return Date.UTC(+d[0], d[1] - 1, +d[2]) / 86400000; }
    var start = leaf.reduce(function (m, t) { var d = String(t.s).slice(0, 10); return m == null || d < m ? d : m; }, null), s0 = dnum(start);
    var unknown = 0;
    var tasks = leaf.map(function (t) {
      var phase = null, storey = null;
      for (var i = 0; i < names.length; i++) if (String(t.name).indexOf(names[i] + ' \u2014 ') === 0) { phase = names[i]; storey = String(t.name).slice(names[i].length + 3); break; }
      if (!phase) { var par = byId[t.parent]; if (par && par.parent != null && byId[par.parent]) phase = par.name; }
      if (!phase) unknown++;
      return { id: t.id, phase: phase || 'Unsequenced', storey: storey, sDays: dnum(t.s) - s0, eDays: dnum(t.f != null ? t.f : t.s) - s0, guids: gOf[t.id] || [] };
    }).filter(function (t) { return t.phase !== 'Unsequenced'; });
    var phaseSeq = {}, fromStart = false;
    ((template && template.phases) || []).forEach(function (p) { phaseSeq[p.name] = p.sequence; });
    var missing = tasks.some(function (t) { return phaseSeq[t.phase] == null; });
    if (missing) {
      fromStart = true;
      var first = {}; tasks.forEach(function (t) { if (first[t.phase] == null || t.sDays < first[t.phase]) first[t.phase] = t.sDays; });
      Object.keys(first).sort(function (a, b) { return first[a] - first[b] || (a < b ? -1 : 1); }).forEach(function (ph, i) { if (phaseSeq[ph] == null) phaseSeq[ph] = 100 + i; });
    }
    console.log('§PROJ_FOLD_SCHEDULE schedule=' + act.id + ' name="' + (act.name || act.id) + '" tasks=' + tasks.length + ' start=' + start +
      ' lastDay=' + Math.max.apply(null, tasks.map(function (t) { return t.eDays; })) + (unknown ? ' TASK_PHASE_UNKNOWN=' + unknown : '') + (fromStart ? ' PHASE_SEQ_FROM_START' : ''));
    return { start: start, tasks: tasks, phaseSeq: phaseSeq, source: 'building db ' + act.id };
  }

  // ── pricedPerTask(guids, schedule, priceFn) — split a selection by its elements' 4D task and price each part with the CALLER's own producer
  // (priceFn(guidArray) → {rows, elements}), tagging rows with taskId, so no row spans two Gantt bars. Elements in no task are priced once, untagged.
  function pricedPerTask(guids, schedule, priceFn) {
    var g2t = {}, parts = {}, order = [];
    (schedule && schedule.tasks || []).forEach(function (t) { t.guids.forEach(function (g) { g2t[g] = t.id; }); });
    guids.forEach(function (g) { var k = g2t[g] != null ? g2t[g] : ''; if (!parts[k]) { parts[k] = []; order.push(k); } parts[k].push(g); });
    var out = [], elements = 0;
    order.forEach(function (k) {
      var p = priceFn(parts[k]); if (!p || !p.rows) return;
      elements += p.elements || 0;
      p.rows.forEach(function (r) { if (k !== '') r.taskId = k; out.push(r); });
    });
    return { rows: out, elements: elements, parts: order.length };
  }

  var API = { foldProjectOrder: foldProjectOrder, foldAuthoredPhases: foldAuthoredPhases, scheduleFromDb: scheduleFromDb, pricedPerTask: pricedPerTask, BIM_BASE: BIM_BASE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ProjFold = API;
})(typeof self !== 'undefined' ? self : this);
