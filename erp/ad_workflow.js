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
    return db.prepare(
      "SELECT ad_wf_nodenext_id AS id, ad_wf_next_id AS next, seqno, transitioncode, isstduserworkflow AS stduser " +
      "FROM ad_wf_nodenext WHERE ad_wf_node_id=? AND isactive='Y' ORDER BY seqno").all(nodeId);
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
    try { return db.prepare("SELECT COUNT(*) AS n FROM ad_wf_nextcondition WHERE ad_wf_nodenext_id=? AND isactive='Y'").get(nodenextId).n; }
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
    stdUserGateOpen: stdUserGateOpen, replay: replay
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // node witness
  if (typeof window !== 'undefined') window.AdWorkflow = API;                   // browser
  else if (global) global.AdWorkflow = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
