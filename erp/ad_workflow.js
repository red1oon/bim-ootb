// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_workflow.js — Workflow node-walk + activity + routing engine (W-WF). The "AD_Workflow" leg of the
// coverage matrix: read AD_Workflow / AD_WF_Node / AD_WF_NodeNext, walk the node graph from the start node,
// create a WF_Activity per visited node, and route to the next node (std-user-next by seqno, or an explicit
// approval decision). Faithful shape of iDempiere's MWFProcess/MWFActivity/MWFNode.transitions. Self-contained,
// no kernel dep (mirrors ad_process.js / ad_docfsm.js shape). Mechanism + a 1–2 workflow sample; the 58-wf /
// 262-node corpus stays named-deferred.
//
// SEAM (docs/ERP_BACKEND_SEPARATION.md §3 ❶): triggered BY a doc-action, but the GL fold (A-1) stays ignorant
// of workflow — completing a doc may route here for approval, yet the posting derivation never reads a node,
// activity, or approval state. This module walks nodes + routes; it does NOT post or derive accounts.
//
// EXTRACT, DON'T INVENT: every node, next, seqno, action and the start-node come from ad_full.db
// (ad_workflow.ad_wf_node_id, ad_wf_node, ad_wf_nodenext — lowercase). The walk/route LOGIC is the documented
// MWF* engine, ported. An unconditioned split routes by seqno (std-user-next); an explicit approval decision
// (ctx.route) overrides. A walk with no next terminates (no invented loop). Determinism: read-only graph walk,
// step-capped, no Date/random. Implementing ERP_COVERAGE_MATRIX.md §AD_Workflow (ranked GAP #4) — Witness: W-WF
(function (global) {
  'use strict';

  function readWorkflow(db, wfId) {
    var w = db.prepare('SELECT ad_workflow_id,name,ad_wf_node_id,ad_table_id FROM ad_workflow WHERE ad_workflow_id=?').get(wfId);
    if (!w) throw new Error('no ad_workflow ' + wfId);
    return { id: w.ad_workflow_id, name: w.name, startNode: w.ad_wf_node_id, ad_table_id: w.ad_table_id };
  }
  function readNode(db, nodeId) {
    return db.prepare('SELECT ad_wf_node_id,name,action,docaction FROM ad_wf_node WHERE ad_wf_node_id=?').get(nodeId);
  }
  // ordered transitions out of a node (lowest seqno = the std-user-next).
  // Ordering + active filter = MWFNode.loadNext (MWFNode.java:264-271: ORDER BY SeqNo, active rows only).
  function nodeNexts(db, nodeId) {
    return qrows(db,
      "SELECT ad_wf_nodenext_id AS id, ad_wf_next_id AS next, seqno, transitioncode, isstduserworkflow AS stduser " +
      "FROM ad_wf_nodenext WHERE ad_wf_node_id=? AND isactive='Y' ORDER BY seqno", [nodeId]);
  }

  // nextNode(db, nodeId, ctx) — routing. An explicit approval decision (ctx.route[nodeId]) wins; otherwise the
  // std-user-next (lowest seqno). Returns the next node id, or null at a leaf.
  function nextNode(db, nodeId, ctx) {
    var nexts = nodeNexts(db, nodeId);
    if (!nexts.length) return null;
    if (ctx && ctx.route && ctx.route[nodeId] != null) {
      var pick = nexts.filter(function (n) { return n.next === ctx.route[nodeId]; })[0];
      if (pick) return pick.next;                          // routed by the approval decision
    }
    return nexts[0].next;                                  // std-user-next
  }

  // walk(db, wfId, opts) — from the start node, create an activity per node, route to next, until a leaf or
  // the step cap. Returns { workflow, path:[nodeId], activities:[{node,action,status}], steps, completed }.
  function walk(db, wfId, opts) {
    opts = opts || {}; var ctx = opts.ctx || {}; var cap = opts.maxSteps || 100;
    var wf = readWorkflow(db, wfId);
    var path = [], activities = [], seen = {};
    var cur = wf.startNode, steps = 0;
    while (cur != null && steps < cap) {
      if (seen[cur]) break;                                // loop-guard (no invented infinite walk)
      seen[cur] = 1;
      var node = readNode(db, cur);
      var nxt = nextNode(db, cur, ctx);
      path.push(cur);
      activities.push({ node: cur, name: node ? node.name : null, action: node ? node.action : null, next: nxt, status: 'created' });
      cur = nxt; steps++;
    }
    return { workflow: wf.id, name: wf.name, startNode: wf.startNode, path: path, activities: activities, steps: steps, completed: cur == null };
  }

  // ════ W-WF-HARDEN replay arm (ERP_EXECUTION_ROADMAP.md §PHASE B B-2 — Witness: W-WF-HARDEN) ════
  // Faithful state-walk, EXTRACTED from org.compiere.wf + org.compiere.process.StateEngine:
  //   MWFNodeNext.isValidFor:213-260 (std-user doc gate + empty-conditions rule) ·
  //   MWFProcess.startNext:402-445 (ordered transitions, first valid, XOR split) ·
  //   MWFProcess.checkCloseActivities:332-389 (process state aggregation) ·
  //   MWFActivity.run:938-973 (ON→OR→ done?CC:OS) + performWork:1072-1398 (Z/D done, W/X/C wait) +
  //   updateEventAudit:354-376 (closed→'PX' else 'SC') · MWFActivity.run:948-952 (missing node → CA).
  // Node actions NOT exercised by any captured trace (P/R/F/X/C…) and conditioned transitions throw
  // LOUDLY — named skips in the witness, never a silent walk-past.

  // MWFNodeNext.isValidFor:224-230 — doc statuses that close the std-user transition.
  var STDUSER_CLOSED_STATUS = { CO: 1, WC: 1, WP: 1, VO: 1, CL: 1, RE: 1 };
  // std-user gate: docaction must be Complete ('CO') and docstatus not closed (isValidFor:215-243).
  function stdUserGateOpen(doc) {
    if (!doc || doc.DocAction !== 'CO') return false;
    return !STDUSER_CLOSED_STATUS[doc.DocStatus];
  }
  function transitionConditionCount(db, nodenextId) {
    try { return q1(db, "SELECT COUNT(*) AS n FROM ad_wf_nextcondition WHERE ad_wf_nodenext_id=? AND isactive='Y'", [nodenextId]).n; }
    catch (e) { return 0; }                                // seed without the table = no conditions
  }

  // replay(db, wfId, docCtx, opts) — the oracle-diffable walk. docCtx = { DocStatus, DocAction } of the
  // document AT WORKFLOW START (or null for non-DocAction tables); opts.fsm = ad_docfsm.transition for
  // threading docstatus through DocumentAction nodes (DocumentEngine semantics, W-DOCFSM).
  // Returns { path, activities:[{node,name,action,state,eventType}], transitions, gates, stateHops,
  //           processState, doc, abort }.
  function replay(db, wfId, docCtx, opts) {
    opts = opts || {}; var cap = opts.maxSteps || 100;
    var wf = readWorkflow(db, wfId);
    var doc = docCtx ? { DocStatus: docCtx.DocStatus, DocAction: docCtx.DocAction } : null;
    var path = [], activities = [], transitions = [], gates = [], stateHops = [];
    var cur = wf.startNode, steps = 0, suspended = false, abort = null;
    function hop(act, to) { stateHops.push({ from: act.state, to: to }); act.state = to; }
    while (cur != null && steps < cap) {
      steps++;
      var node = readNode(db, cur);
      var act = { node: cur, state: 'ON' };                // StateEngine.STATE_NotStarted
      hop(act, 'OR');                                      // MWFActivity.run:946 setWFState(Running)
      path.push(cur); activities.push(act);
      if (!node) {                                         // run:948-952 Node not found → Aborted, LOUD
        hop(act, 'CA'); act.eventType = 'PX';
        abort = 'node-missing:' + cur;
        break;
      }
      act.name = node.name; act.action = node.action;
      // ── performWork (only the actions the captured corpus exercises are modeled; rest THROW) ──
      var done;
      if (node.action === 'Z') done = true;                // WaitSleep, waittime 0 (:1081-1091)
      else if (node.action === 'D') {                      // DocumentAction (:1095-1153)
        if (opts.fsm && doc && doc.DocStatus != null && node.docaction && node.docaction !== '--') {
          var to = opts.fsm(node.docaction, doc.DocStatus);
          if (to == null) { hop(act, 'CA'); act.eventType = 'PX'; abort = 'docaction-illegal:' + node.docaction + '@' + doc.DocStatus; break; }
          doc.DocStatus = to;                              // thread the doc through the walk
        }
        done = true;
      }
      else if (node.action === 'W' || node.action === 'X' || node.action === 'C') done = false; // user wait (:1302-1398)
      else throw new Error('replay: node action "' + node.action + '" not exercised by any captured trace — named skip, refusing to invent semantics');
      hop(act, done ? 'CC' : 'OS');                        // run:973
      act.eventType = (act.state === 'CC') ? 'PX' : 'SC';  // updateEventAudit:361-368
      if (!done) { suspended = true; break; }              // process waits on the user activity
      // ── startNext:402-445 — ordered transitions, FIRST valid (all corpus nodes split=XOR) ──
      var nexts = nodeNexts(db, cur), chosen = null;
      for (var i = 0; i < nexts.length; i++) {
        var nn = nexts[i];
        if (transitionConditionCount(db, nn.id) > 0)
          throw new Error('replay: conditioned transition nodenext=' + nn.id + ' — MWFNextCondition evaluator not modeled (named skip)');
        var valid = (nn.stduser === 'Y') ? stdUserGateOpen(doc) : true;  // isValidFor: no conditions → true
        if (nn.stduser === 'Y') gates.push({ nodenext: nn.id, from: cur, to: nn.next, DocStatus: doc ? doc.DocStatus : null, DocAction: doc ? doc.DocAction : null, verdict: valid ? 'T' : 'F' });
        if (valid) { chosen = nn; break; }                 // XOR: only the first valid (startNext:436-437)
      }
      transitions.push({ from: cur, to: chosen ? chosen.next : null });
      cur = chosen ? chosen.next : null;
    }
    // ── process terminal state — checkCloseActivities:332-389 ──
    var processState = abort ? 'CA' : (suspended ? 'OS' : 'CC');
    return { workflow: wf.id, name: wf.name, path: path, activities: activities, transitions: transitions,
             gates: gates, stateHops: stateHops, processState: processState, doc: doc, abort: abort };
  }

  // ════ W-TASKER-CONTRACT run arm (bim-compiler prompts/MOBILE_PERF.md WO-12; witness erp/tests/witness_tasker_contract.js) ════
  // The PERSISTED run: start a process on a record, one activity per node, wait on user nodes, close them by a user
  // confirmation. Ported from org.compiere.wf (paths relative to org.adempiere.base/src/org/compiere/):
  //   MWorkflow.start:761-815 (new process, startWork, checkCloseActivities; ANY exception -> rollback, no row, null) ·
  //   MWFProcess ctor:106-151, startWork:586-640, checkActivities:271-327, startNext:402-445, checkCloseActivities:335-392,
  //   setWFState:222-258, setAD_WF_Responsible_ID:487-496, setUser_ID:505-545 ·
  //   MWFActivity ctor:189-228, setWFState:292-340, setResponsible:664-687, run:904-973, performWork:1072-1398
  //   (X User Form :1382-1387 returns false = wait), setUserConfirmation:1619-1627 · StateEngine states :59-69, next states :352-358 ·
  //   MWFNodeNext.isValidFor:213-260. The UI calls setUserConfirmation then checkCloseActivities (WWFActivity.java:693-697).
  // NOT ported (named, never silent): Workflow validFrom/validTo (no clock here), AD_WF_EventAudit rows, activity limit/EndWaitTime,
  // node actions other than X (wait for user) and Z (waittime 0), conditioned transitions, JoinElement AND — each THROWS.
  var S_ON = 'ON', S_OR = 'OR', S_OS = 'OS', S_CC = 'CC', S_CA = 'CA', S_CT = 'CT';
  function stClosed(s) { return s === S_CC || s === S_CA || s === S_CT; }                    // StateEngine.isClosed:161-163
  var NEW_STATES = { ON: [S_OR, S_CA, S_CT], OR: [S_OS, S_CC, S_CA, S_CT], OS: [S_OR, S_CA, S_CT, S_CC] };   // :352-358
  function validNew(from, to) { return (NEW_STATES[from] || []).indexOf(to) >= 0; }

  // tiny adapter so the run arm works on better-sqlite3 (poc_* witnesses) AND sql.js (erp/tests witnesses)
  function qrows(db, sql, p) {
    var st = db.prepare(sql);
    if (typeof st.all === 'function') return st.all.apply(st, p || []);                      // better-sqlite3
    var out = [];
    try { if (p && p.length) st.bind(p.map(function (v) { return v === undefined ? null : v; })); while (st.step()) out.push(st.getAsObject()); }
    finally { st.free(); }
    return out;
  }
  function q1(db, sql, p) { return qrows(db, sql, p)[0] || null; }
  function exec(db, sql, p) {
    if (typeof db.run === 'function') { db.run(sql, p || []); return; }                      // sql.js (better-sqlite3 has no Database.run)
    var st = db.prepare(sql); st.run.apply(st, p || []);
  }
  function nextId(db, table) { return (q1(db, 'SELECT COALESCE(MAX(' + table + '_id),0)+1 AS n FROM ' + table).n); }
  function hasCol(db, table, col) { return qrows(db, "SELECT name FROM pragma_table_info('" + table + "')").some(function (r) { return r.name === col; }); }

  function actRow(db, id) { return q1(db, 'SELECT * FROM ad_wf_activity WHERE ad_wf_activity_id=?', [id]); }
  function procRow(db, id) { return q1(db, 'SELECT * FROM ad_wf_process WHERE ad_wf_process_id=?', [id]); }
  function respRow(db, id) { return q1(db, 'SELECT * FROM ad_wf_responsible WHERE ad_wf_responsible_id=?', [id]) || { ad_user_id: 0, ad_role_id: 0, responsibletype: null }; }
  // MWFResponsible.isInvoker:195-198 (no user, no role, not Manual) · isRole:204-208 (type R and a role set)
  function respInvoker(r) { return !(r.ad_user_id) && !(r.ad_role_id) && r.responsibletype !== 'M'; }

  // MWFProcess.setWFState:222-258 — invalid/same/closed -> ignored; closing marks the process processed and force-closes its open activities.
  function setProcState(db, pid, to) {
    var p = procRow(db, pid);
    if (stClosed(p.wfstate) || p.wfstate === to || !validNew(p.wfstate, to)) return;
    exec(db, 'UPDATE ad_wf_process SET wfstate=?, processed=? WHERE ad_wf_process_id=?', [to, stClosed(to) ? 'Y' : 'N', pid]);
    if (!stClosed(to)) return;
    qrows(db, "SELECT * FROM ad_wf_activity WHERE ad_wf_process_id=? AND processed='N' ORDER BY ad_wf_activity_id", [pid]).forEach(function (a) {
      if (!stClosed(a.wfstate)) exec(db, 'UPDATE ad_wf_activity SET wfstate=?, textmsg=? WHERE ad_wf_activity_id=?', [to, 'Process:' + to, a.ad_wf_activity_id]);
      exec(db, "UPDATE ad_wf_activity SET processed='Y' WHERE ad_wf_activity_id=?", [a.ad_wf_activity_id]);
    });
  }

  // MWFActivity.setWFState:292-340 — invalid/same/closed ignored; a valid change informs the process (checkActivities).
  function setActState(db, aid, to) {
    var a = actRow(db, aid);
    if (stClosed(a.wfstate) || a.wfstate === to || !validNew(a.wfstate, to)) return;
    exec(db, 'UPDATE ad_wf_activity SET wfstate=? WHERE ad_wf_activity_id=?', [to, aid]);
    checkActivities(db, a.ad_wf_process_id);
  }

  // MWFNodeNext.isValidFor:213-260 — the std-user gate bites only when the record is a document (has DocStatus/DocAction columns);
  // no conditions -> valid; conditions are not modeled (named skip).
  function transitionValid(db, nn, act) {
    var tn = tableNameOf(db, act.ad_table_id);
    if (nn.stduser === 'Y' && tn && hasCol(db, tn, 'docstatus') && hasCol(db, tn, 'docaction')) {
      var d = q1(db, 'SELECT docstatus AS DocStatus, docaction AS DocAction FROM ' + tn + ' WHERE ' + tn + '_id=?', [act.record_id]);
      if (!stdUserGateOpen(d)) return false;
    }
    if (transitionConditionCount(db, nn.id) > 0) throw new Error('run arm: conditioned transition nodenext=' + nn.id + ' — MWFNextCondition not modeled (named skip)');
    return true;
  }
  function tableNameOf(db, tableId) {
    if (!tableId) return null;
    var t = q1(db, 'SELECT tablename FROM ad_table WHERE ad_table_id=?', [tableId]);
    return t ? String(t.tablename).toLowerCase() : null;
  }

  // MWFProcess.checkActivities:271-327 — every OPEN activity: a completed one starts its next (startNext), a closed one is marked processed.
  // (Java's closedState here is only used to call getPO() — no state is written — so it is not recomputed.)
  function checkActivities(db, pid) {
    var p = procRow(db, pid);
    if (stClosed(p.wfstate)) return;
    qrows(db, "SELECT * FROM ad_wf_activity WHERE ad_wf_process_id=? AND processed='N' ORDER BY ad_wf_activity_id", [pid]).forEach(function (a) {
      var cur = actRow(db, a.ad_wf_activity_id);
      if (cur.wfstate === S_CC && startNext(db, cur)) return;
      if (stClosed(actRow(db, a.ad_wf_activity_id).wfstate)) exec(db, "UPDATE ad_wf_activity SET processed='Y' WHERE ad_wf_activity_id=?", [a.ad_wf_activity_id]);
    });
  }

  // MWFProcess.startNext:402-445 — transitions of the last node in SeqNo order; first valid only when the node's split is XOR ('X').
  function startNext(db, last) {
    var nexts = nodeNexts(db, last.ad_wf_node_id);
    if (!nexts.length) return false;                                                         // :408-409 done
    exec(db, "UPDATE ad_wf_activity SET processed='Y' WHERE ad_wf_activity_id=?", [last.ad_wf_activity_id]);   // :411-412
    var node = q1(db, 'SELECT splitelement FROM ad_wf_node WHERE ad_wf_node_id=?', [last.ad_wf_node_id]);
    var split = (node && node.splitelement) || 'X';
    for (var i = 0; i < nexts.length; i++) {
      if (!transitionValid(db, nexts[i], last)) continue;
      var jn = q1(db, 'SELECT joinelement FROM ad_wf_node WHERE ad_wf_node_id=?', [nexts[i].next]);
      if (jn && jn.joinelement === 'A') throw new Error('run arm: JoinElement AND at node ' + nexts[i].next + ' not modeled (named skip)');   // :425-432
      runActivity(db, newActivity(db, last.ad_wf_process_id, nexts[i].next));
      if (split === 'X') return true;                                                        // :438-439
    }
    return true;
  }

  // MWFActivity ctor:189-228 + setResponsible:664-687: node responsible, else the process's; user = the responsible's user, else (Invoker)
  // the process user. A Role responsible has no user -> the activity's user stays 0 and whoever holds the role takes it.
  function newActivity(db, pid, nodeId) {
    var p = procRow(db, pid), node = q1(db, 'SELECT ad_wf_responsible_id FROM ad_wf_node WHERE ad_wf_node_id=?', [nodeId]);
    var rid = (node && node.ad_wf_responsible_id) || 0;
    if (!rid) rid = p.ad_wf_responsible_id;                                                  // :672-673
    var resp = respRow(db, rid), uid = resp.ad_user_id || 0;
    if (!uid && respInvoker(resp)) uid = p.ad_user_id || 0;                                  // :683-684
    var id = nextId(db, 'ad_wf_activity');
    exec(db, 'INSERT INTO ad_wf_activity (ad_wf_activity_id, ad_client_id, ad_org_id, isactive, ad_wf_process_id, ad_workflow_id, ad_wf_node_id, ad_wf_responsible_id, ad_user_id, wfstate, processed, ad_table_id, record_id, priority) ' +
      "VALUES (?,?,?,'Y',?,?,?,?,?,?,'N',?,?,?)", [id, p.ad_client_id, p.ad_org_id, pid, p.ad_workflow_id, nodeId, rid, uid, S_ON, p.ad_table_id, p.record_id, p.priority]);
    return id;
  }

  // MWFActivity.run:904-973 — ON -> OR, performWork (X waits, Z with waittime 0 is done), then CC or OS.
  function runActivity(db, aid) {
    var a = actRow(db, aid);
    setActState(db, aid, S_OR);                                                              // :946
    var node = q1(db, 'SELECT action, waittime FROM ad_wf_node WHERE ad_wf_node_id=?', [a.ad_wf_node_id]);
    if (!node) { setActState(db, aid, S_CA); return; }                                       // :948-952 node not found -> Aborted
    var done;
    if (node.action === 'X') done = false;                                                   // performWork:1382-1387 User Form: wait for the user
    else if (node.action === 'Z' && !node.waittime) done = true;                             // :1081-1085
    else throw new Error('run arm: node action "' + node.action + '" not modeled (named skip — refusing to invent semantics)');
    setActState(db, aid, done ? S_CC : S_OS);                                                // :973
  }

  // MWFProcess.checkCloseActivities:335-392 — aggregate over ALL activities of the process.
  function checkCloseActivities(db, pid) {
    var p = procRow(db, pid);
    if (stClosed(p.wfstate)) return;
    var closed = null, suspended = false, running = false;
    var acts = qrows(db, 'SELECT wfstate FROM ad_wf_activity WHERE ad_wf_process_id=? ORDER BY ad_wf_activity_id', [pid]);
    acts.forEach(function (a) {
      if (stClosed(a.wfstate)) {
        if (closed == null) closed = a.wfstate;
        else if (closed !== a.wfstate) {
          if (a.wfstate === S_CT) closed = a.wfstate;                                        // Terminated wins
          else if (a.wfstate === S_CA && closed !== S_CT) closed = a.wfstate;                // Aborted beats the rest unless Terminated
        }
      } else { closed = null; if (a.wfstate === S_OS) suspended = true; if (a.wfstate === S_OR) running = true; }
    });
    if (!acts.length) closed = S_CT;                                                         // :378-382
    if (closed != null) setProcState(db, pid, closed);
    else if (suspended) setProcState(db, pid, S_OS);
    else if (running) setProcState(db, pid, S_OR);
  }

  // startProcess(db, wfId, recordId, ctx{userId}) — MWorkflow.start. A workflow with no table, a record id 0 or a record that is not
  // there has no PO (MWFProcess.getPO:645-655): the ctor sets Terminated (:130-134) and then dereferences the null PO at :150
  // (NullPointerException), start() catches it (MWorkflow.java:777-796): NOTHING is persisted and the caller gets null.
  // Returned here as {ok:false, state:'CT', persisted:false}: Terminated, no process row, no activity row.
  function startProcess(db, wfId, recordId, ctx) {
    ctx = ctx || {};
    var wf = q1(db, 'SELECT ad_workflow_id, ad_wf_node_id, ad_table_id, ad_wf_responsible_id, priority FROM ad_workflow WHERE ad_workflow_id=?', [wfId]);
    if (!wf) throw new Error('no ad_workflow ' + wfId);
    var tn = tableNameOf(db, wf.ad_table_id), po = null;
    if (tn && recordId) po = q1(db, 'SELECT * FROM ' + tn + ' WHERE ' + tn + '_id=?', [recordId]);
    if (!po) return { ok: false, state: S_CT, persisted: false, process: null, activities: [], reason: !wf.ad_table_id ? 'workflow has no AD_Table' : !recordId ? 'Record_ID 0' : 'record not found' };
    var rid = wf.ad_wf_responsible_id;                                                       // :139-142
    if (!rid) { var inv = q1(db, "SELECT ad_wf_responsible_id AS id FROM ad_wf_responsible WHERE responsibletype='H' AND COALESCE(ad_user_id,0)=0 ORDER BY ad_client_id DESC"); rid = inv ? inv.id : 0; }   // :487-496
    var resp = respRow(db, rid), uid = resp.ad_user_id || 0;                                 // setUser_ID:505-545
    if (!uid && respInvoker(resp)) {
      if (po.salesrep_id) uid = po.salesrep_id;                                              // (2) Sales Rep (non-DocAction record)
      if (!uid && po.updatedby) uid = po.updatedby;                                          // (3) UpdatedBy
    }
    if (!uid) uid = ctx.userId || 0;                                                         // (4) process owner
    var pid = nextId(db, 'ad_wf_process');
    exec(db, 'INSERT INTO ad_wf_process (ad_wf_process_id, ad_client_id, ad_org_id, isactive, ad_workflow_id, ad_wf_responsible_id, ad_user_id, wfstate, processed, ad_table_id, record_id, priority) ' +
      "VALUES (?,?,?,'Y',?,?,?,?,'N',?,?,?)", [pid, po.ad_client_id || 0, po.ad_org_id || 0, wfId, rid, uid, S_ON, wf.ad_table_id, recordId, wf.priority || null]);
    setProcState(db, pid, S_OR);                                                             // startWork:  setWFState(Running)
    runActivity(db, newActivity(db, pid, wf.ad_wf_node_id));                                 //             first activity on the start node
    checkCloseActivities(db, pid);                                                           // MWorkflow.start:778
    return { ok: true, state: procRow(db, pid).wfstate, persisted: true, process: pid };
  }

  // confirmActivity(db, activityId, userId, textMsg) — MWFActivity.setUserConfirmation:1619-1627 (-> Running, user, text, -> Completed), then the
  // caller's checkCloseActivities (WWFActivity.java:693-697). Refuses (engine guard, not Java) an unknown or already closed activity.
  function confirmActivity(db, aid, userId, textMsg) {
    var a = actRow(db, aid);
    if (!a) return { ok: false, reason: 'no activity ' + aid };
    if (stClosed(a.wfstate)) return { ok: false, reason: 'activity closed (' + a.wfstate + ')' };
    setActState(db, aid, S_OR);                                                              // :1622
    var cur = actRow(db, aid), msg = cur.textmsg;
    if (textMsg != null && textMsg !== '') msg = msg ? textMsg + '\n - ' + msg : textMsg;    // setTextMsgBefore:590-599
    exec(db, 'UPDATE ad_wf_activity SET ad_user_id=?, textmsg=? WHERE ad_wf_activity_id=?', [userId, msg == null ? null : String(msg).slice(0, 1000), aid]);   // :1623-1625
    setActState(db, aid, S_CC);                                                              // :1626 (starts the next activity)
    checkCloseActivities(db, a.ad_wf_process_id);
    return { ok: true, process: procRow(db, a.ad_wf_process_id).wfstate };
  }

  function coverageScan(db) {
    return {
      workflows: db.prepare('SELECT COUNT(*) AS n FROM ad_workflow').get().n,
      nodes: db.prepare('SELECT COUNT(*) AS n FROM ad_wf_node').get().n,
      nexts: db.prepare('SELECT COUNT(*) AS n FROM ad_wf_nodenext').get().n
    };
  }

  var API = {
    readWorkflow: readWorkflow, readNode: readNode, nodeNexts: nodeNexts,
    nextNode: nextNode, walk: walk, coverageScan: coverageScan,
    stdUserGateOpen: stdUserGateOpen, replay: replay,
    startProcess: startProcess, confirmActivity: confirmActivity, checkCloseActivities: checkCloseActivities
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // node witness
  if (typeof window !== 'undefined') window.AdWorkflow = API;                   // browser
  else if (global) global.AdWorkflow = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
