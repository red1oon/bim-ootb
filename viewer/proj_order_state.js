// proj_order_state.js — §S9 the Project-Order READ + the two actions on an edited part (bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S9).
// ⚠ DO NOT REMOVE. ONE owner, called by BOTH surfaces (Viewer › ERP path and the Modeller's ERP panel). It carries NO fold logic of its own:
//   generate      -> ProjFold.foldProjectOrder   (viewer/proj_fold.js, idempotent by natural key, money via BigDecimal)
//   issueVO       -> VoFold.foldVariationOrder   (viewer/vo_fold.js, the SHIPPED diff->VO mapping: an edited element is a CHANGED row)
//   contract read -> ProjControl.contractSum     (viewer/proj_control.js)
// red1's flow (2026-09-30): a part with NO Project Order -> Generate one. A part that HAS one and is EDITED is a VARIANT item inside that SAME
// Project Order, and the user has two options: A) delete & re-issue (only while NOT committed) or B) a Variation Order (required once committed).
// "Committed" is READ FROM RECORDS, never guessed: a purchase C_Order (IsSOTrx='N') on that project (Ref: 'BIM PO: <building>' or C_Project_ID) whose
// DocStatus is CO/CL, or C_Project.IsCommitment='Y' / CommittedAmt>0 (what vo_approve.js moves when a VO is approved).
// Pure + DOM-free apart from the OPFS helpers; node-testable. `env` = {ProjFold, VoFold, ProjControl, BigDecimal, RATES, SEQUENCE_RULES, LABOR_RATES}.
(function (global) {
  'use strict';
  var STORE_DIR = 'bim_analysis', STORE_FILE = 'bim_project_orders.db';   // the SAME file find_erp_push.js / diff.js persist and the ERP overlays

  function _one(db, sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0] : null; }
  function _all(db, sql, p) { var r = db.exec(sql, p || []); return r.length ? r[0].values : []; }
  function _q(s) { return String(s).replace(/'/g, "''"); }
  // The ERP C_Project.Value is the Viewer's building LABEL (find_erp_push.js: Value=A.activeBuilding; the seed's own twin is Value='Hospital'). The Modeller knows a
  // resident by its KEY ('Duplex'), which is not always that label: MEASURED 2026-09-30 on the live Viewer, the Duplex resident's activeBuilding is
  // 'Ifc2x3_Duplex_Federated' (the OCI extracted DB's building column) — W-S9-MODELLER-PROJECT P4 first FAILED on exactly this (two surfaces, two Project Orders).
  // Only labels MEASURED on the live Viewer are listed; anything else falls back to the resident key and SAYS so (§S9-BUILDING source=resident-key).
  // ⛔ red1: is a resident->label table the right home, or should the Modeller's manifest carry it? (§S9-BLOCKED 4)
  var BUILDING_LABELS = { Duplex: 'Ifc2x3_Duplex_Federated' };
  function projectKey(residentKey) {
    var L = (typeof window !== 'undefined' && window.__S9_BUILDING_LABELS) || API.BUILDING_LABELS || BUILDING_LABELS, k = L[residentKey] || residentKey;
    console.log('§S9-BUILDING resident=' + residentKey + ' key=' + k + ' source=' + (L[residentKey] ? 'measured-viewer-label' : 'resident-key'));
    return k;
  }
  function launchUrl(projectId) { return '../erp/idempiere.html?client=garden&window=130&record=' + encodeURIComponent(projectId); }   // == find_erp_push.js's link

  // ── store: OPFS-first (what the > ERP / > VO pushes wrote), else the seed — the diff.js _loadVoErpDb precedent ──
  async function openStore(SQL, fetchSeed) {
    try {
      if (navigator.storage && navigator.storage.getDirectory) {
        var root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle(STORE_DIR), fh = await dir.getFileHandle(STORE_FILE);
        var f = await fh.getFile(), buf = await f.arrayBuffer();
        console.log('§S9-STORE src=opfs bytes=' + buf.byteLength);
        return { db: new SQL.Database(new Uint8Array(buf)), src: 'opfs' };
      }
    } catch (e) { /* no OPFS store yet */ }
    var b = await fetchSeed();
    console.log('§S9-STORE src=seed bytes=' + (b && b.byteLength));
    return { db: new SQL.Database(new Uint8Array(b)), src: 'seed' };
  }
  async function persist(db) {
    try {
      var bytes = db.export(), root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle(STORE_DIR, { create: true });
      var fh = await dir.getFileHandle(STORE_FILE, { create: true }), w = await fh.createWritable(); await w.write(bytes); await w.close();
      console.log('§S9-STORE persisted bytes=' + bytes.length); return true;
    } catch (e) { console.log('§S9-STORE persist FAILED ' + e.message); return false; }
  }

  // ── priced rows for a set of guids — the SAME shape as navigate_find.js _selectionPriced (disc,cls,storey,count,unit,qty,rate,cost), from the
  // SHIPPED 5D quantity basis (EditDelta.qtyOf == compute5D). `edits` = {guid: net} (EditDelta.netEdits entry) applies the post-edit dims (the VARIANT). ──
  function pricedRowsFor(db, guids, env, edits) {
    var ED = env.EditDelta || global.EditDelta, R = env.RATES || {}, agg = {}, n = 0;
    for (var i = 0; i < guids.length; i += 900) {
      var chunk = guids.slice(i, i + 900), ph = chunk.map(function () { return '?'; }).join(',');
      _all(db, "SELECT m.guid, m.discipline, m.ifc_class, m.storey, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
        "WHERE m.guid IN (" + ph + ") AND t.bbox_x IS NOT NULL AND t.bbox_x>0", chunk).forEach(function (r) {
        var net = edits && edits[r[0]], d = [r[4], r[5], r[6]];
        if (net) d = [d[0] * net.fx, d[1] * net.fy, d[2] * net.fz];
        var k = (r[1] || '_') + '|' + (r[2] || '_') + '|' + (r[3] || '_');
        var a = agg[k] || (agg[k] = { disc: r[1] || '_', cls: r[2] || '_', storey: r[3] || '_', cnt: 0, len: 0, area: 0, vol: 0 });
        a.cnt++; a.len += ED.qtyOf('M', d); a.area += ED.qtyOf('M2', d); a.vol += ED.qtyOf('M3', d); n++;
      });
    }
    var rows = [];
    Object.keys(agg).forEach(function (k) {
      var a = agg[k], rt = R[a.cls], unit = rt ? rt.unit : 'EA', rate = rt ? rt.rate : 0, qty;
      if (unit === 'M') qty = a.len; else if (unit === 'M2') qty = a.area; else if (unit === 'M3') qty = a.vol; else { unit = rt ? unit : 'EA'; qty = a.cnt; }
      rows.push({ disc: a.disc, cls: a.cls, storey: a.storey, count: a.cnt, unit: unit, qty: qty, rate: rate, cost: Math.round(rate * qty) });
    });
    return { elements: n, rows: rows };
  }

  // ── the READ: what does the ERP hold for this building / these classes? ──
  function readState(db, building, classes, env) {
    var pr = _one(db, "SELECT C_Project_ID, Value, PlannedAmt, CommittedAmt, IsCommitment FROM C_Project WHERE Value=?", [building]);
    if (!pr) return { generated: false, building: building, reason: 'no C_Project with Value=' + building };
    var pid = pr[0], st = { generated: true, building: building, projectId: pid, value: pr[1], plannedAmt: String(pr[2]), committedAmt: String(pr[3] || 0), isCommitment: pr[4] };
    st.lines = _all(db, "SELECT p.Value, pl.plannedqty, pl.plannedamt FROM C_ProjectLine pl JOIN M_Product p ON pl.m_product_id=p.M_Product_ID WHERE pl.c_project_id=? ORDER BY pl.line", [pid])
      .map(function (r) { return { cls: r[0], qty: String(r[1]), amt: String(r[2]) }; });
    st.inPO = (classes || []).filter(function (c) { return st.lines.some(function (l) { return l.cls === c; }); });
    var po = _one(db, "SELECT C_Order_ID, DocStatus, GrandTotal FROM C_Order WHERE Description=?", ['BIM PO: ' + building]);
    st.po = po ? { orderId: po[0], status: po[1], total: String(po[2]) } : null;
    st.vos = _all(db, "SELECT C_Order_ID, DocumentNo, DocStatus, GrandTotal FROM C_Order WHERE C_Project_ID=? AND Description LIKE 'BIM VO:%' ORDER BY C_Order_ID", [pid])
      .map(function (r) { return { orderId: r[0], docNo: r[1], status: r[2], total: String(r[3]) }; });
    // committed, from records
    var subPO = _one(db, "SELECT C_Order_ID, DocStatus FROM C_Order WHERE IsSOTrx='N' AND DocStatus IN ('CO','CL') AND (C_Project_ID=? OR Description=?) AND Description NOT LIKE 'BIM VO:%' ORDER BY C_Order_ID LIMIT 1", [pid, 'BIM PO: ' + building]);
    var why = [];
    if (subPO) why.push('purchase order #' + subPO[0] + ' is ' + subPO[1]);
    if (pr[4] === 'Y') why.push('project IsCommitment=Y');
    if (Number(pr[3] || 0) > 0) why.push('CommittedAmt=' + pr[3]);
    st.committed = { is: why.length > 0, why: why };
    var ctl = null; try { if (env && env.ProjControl) ctl = env.ProjControl.contractSum(db, pid); } catch (e) { /* honest: no control picture */ }
    st.contract = ctl ? { original: ctl.original, approvedVOs: ctl.approvedVOs, pendingVOs: ctl.pendingVOs, revised: ctl.revised } : null;
    st.url = launchUrl(pid);
    return st;
  }

  // the state machine red1 described. edited = the selection carries a quantity-changing edit.
  function decide(state, edited) {
    if (!state.generated || !state.inPO.length) return { kind: 'not-generated', actions: ['generate'] };
    if (!edited) return { kind: 'in-po', actions: [] };
    var acts = ['issueVO'];
    var refuse = null;
    if (state.committed.is) refuse = 'committed to a vendor (' + state.committed.why.join('; ') + ') - issue a Variation Order instead';
    else if (state.vos.length) refuse = 'a Variation Order already exists on this project - void it first';
    if (!refuse) acts.unshift('deleteReissue');
    return { kind: 'variant', actions: acts, refuseDeleteReissue: refuse };
  }

  // ── actions ──
  function _foldOpts(env, now, cur) { return { seqRules: env.SEQUENCE_RULES || {}, laborRates: env.LABOR_RATES || {}, packCurrencyISO: cur || 'USD', now: now }; }
  function generate(db, building, rows, env, now, cur) {
    var r = env.ProjFold.foldProjectOrder(db, building, rows, _foldOpts(env, now, cur));
    console.log('§S9-GENERATE building=' + building + ' project=' + r.projectId + ' lines=+' + r.created.lines + ' phases=+' + r.created.phases + ' plannedAmt=' + r.plannedAmt);
    return r;
  }
  function countProjects(db, building) { return Number(_one(db, "SELECT COUNT(*) FROM C_Project WHERE Value=?", [building])[0]); }
  // A) delete & re-issue — REFUSED (with the reason named) unless the state allows it. Deletes exactly the rows foldProjectOrder wrote for this project.
  function deleteReissue(db, building, rows, env, now, cur, state) {
    var d = decide(state, true);
    if (d.refuseDeleteReissue) { console.log('§S9-DELETE-REISSUE REFUSED building=' + building + ' reason=' + d.refuseDeleteReissue); return { ok: false, reason: d.refuseDeleteReissue }; }
    var pid = state.projectId;
    var before = { projects: countProjects(db, building) };
    var po = state.po;
    db.run("DELETE FROM C_ProjectLine WHERE c_project_id=?", [pid]);
    db.run("DELETE FROM C_ProjectTask WHERE C_ProjectPhase_ID IN (SELECT C_ProjectPhase_ID FROM C_ProjectPhase WHERE C_Project_ID=?)", [pid]);
    db.run("DELETE FROM C_ProjectPhase WHERE C_Project_ID=?", [pid]);
    if (po) { db.run("DELETE FROM C_OrderLine WHERE C_Order_ID=?", [po.orderId]); db.run("DELETE FROM C_Order WHERE C_Order_ID=?", [po.orderId]); }
    db.run("DELETE FROM C_Project WHERE C_Project_ID=?", [pid]);
    var r = generate(db, building, rows, env, now, cur);
    var after = { projects: countProjects(db, building) };
    console.log('§S9-DELETE-REISSUE ok building=' + building + ' oldProject=' + pid + ' newProject=' + r.projectId + ' projectRows ' + before.projects + '->' + after.projects);
    return { ok: true, result: r, projectRowsBefore: before.projects, projectRowsAfter: after.projects };
  }
  // B) Variation Order — the SHIPPED diff->VO mapping (diff.js A._diffToVoRows): one row per (status x class), status CHANGED for an edited element,
  // count = elements, rate = the class rate (rates.js getRate), unit EA. The FIDIC/AACE loading lives in vo_fold. NOT the S8 quantity delta (see §S9).
  function voRowsForEdited(db, guids, env) {
    var agg = {}; var R = env.RATES || {};
    for (var i = 0; i < guids.length; i += 900) {
      var chunk = guids.slice(i, i + 900), ph = chunk.map(function () { return '?'; }).join(',');
      _all(db, "SELECT ifc_class, discipline, COUNT(*) FROM elements_meta WHERE guid IN (" + ph + ") GROUP BY ifc_class, discipline", chunk).forEach(function (r) {
        var cls = r[0] || 'Unknown', k = 'CHANGED|' + cls;
        var a = agg[k] || (agg[k] = { status: 'CHANGED', cls: cls, disc: r[1] || '_', count: 0, rate: (R[cls] ? R[cls].rate : (env.RATES_DEFAULT ? env.RATES_DEFAULT.rate : 500)), unit: 'EA' });
        a.count += r[2] || 0;
      });
    }
    return Object.keys(agg).map(function (k) { return agg[k]; });
  }
  function issueVO(db, building, voRows, env, now, cur) {
    var r = env.VoFold.foldVariationOrder(db, building, voRows, { packCurrencyISO: cur || 'USD', now: now });
    console.log('§S9-VO building=' + building + ' doc=' + r.docNo + ' order=' + r.orderId + ' lines=+' + r.created.lines + ' grandTotal=' + r.grandTotal + ' project=' + r.projectId);
    return r;
  }

  var API = { BUILDING_LABELS: BUILDING_LABELS, projectKey: projectKey, openStore: openStore, persist: persist, pricedRowsFor: pricedRowsFor, readState: readState, decide: decide, generate: generate,
    deleteReissue: deleteReissue, voRowsForEdited: voRowsForEdited, issueVO: issueVO, launchUrl: launchUrl, countProjects: countProjects, STORE_FILE: STORE_FILE };
  if (typeof window !== 'undefined') window.ProjOrderState = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
