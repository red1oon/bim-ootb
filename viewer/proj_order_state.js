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
  // GENERIC (red1 2026-09-30, Q3): any user IFC ARC that is opened gets a key derived from the loaded model itself, in this order:
  //   1. a MEASURED alias (the table above — the Duplex resident keeps working, unchanged);
  //   2. the model's own IfcBuilding / IfcProject NAME when the opened DB carries one (spatial_structure);
  //   3. the model's own name as loaded (`__dwName` = the IFC file's base name for a directly-opened .ifc; measured: SampleHouse_ARC.ifc -> 'SampleHouse_ARC').
  // The log says which. (A DB opened straight from an .ifc carries no spatial_structure at all — measured — so 3 is what a user IFC gets today.)
  function projectKey(residentKey, db) {
    var L = (typeof window !== 'undefined' && window.__S9_BUILDING_LABELS) || API.BUILDING_LABELS || BUILDING_LABELS, k = L[residentKey], src = 'measured-viewer-label';
    if (!k && db) {
      try { var r = db.exec("SELECT name FROM spatial_structure WHERE type IN ('IfcBuilding','IfcProject') AND name IS NOT NULL AND TRIM(name)<>'' ORDER BY (type='IfcBuilding') DESC LIMIT 1");
        if (r.length && r[0].values.length) { k = String(r[0].values[0][0]); src = 'model-ifc-name'; } } catch (e) { /* no spatial_structure */ }
    }
    if (!k) { k = residentKey; src = 'model-name'; }
    console.log('§S9-BUILDING resident=' + residentKey + ' key=' + k + ' source=' + src);
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
  // §STORE_STAMP (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §BIM-CRUD; user 2026-10-07 stale-tab fix): the store's identity on disk
  //   = lastModified:size, or 'gone'. A writer that cached the store reuses its copy ONLY while the stamp is unchanged — a seed reset
  //   (removes the file), another tab's push or an ERP-side change makes it reload, so an open tab can no longer write old orders back.
  async function storeStamp() {
    try {
      var root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle(STORE_DIR), fh = await dir.getFileHandle(STORE_FILE);
      var f = await fh.getFile(); return f.lastModified + ':' + f.size;
    } catch (e) { return 'gone'; }
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
  function pricedRowsFor(db, guids, env, edits, fallback) {
    var ED = env.EditDelta || global.EditDelta, R = env.RATES || {}, agg = {}, n = 0, seen = {};
    function add(guid, disc, cls, storey, d0) {
      var net = edits && edits[guid], d = d0; if (net) d = [d[0] * net.fx, d[1] * net.fy, d[2] * net.fz];
      var k = (disc || '_') + '|' + (cls || '_') + '|' + (storey || '_');
      var a = agg[k] || (agg[k] = { disc: disc || '_', cls: cls || '_', storey: storey || '_', cnt: 0, len: 0, area: 0, vol: 0 });
      a.cnt++; a.len += ED.qtyOf('M', d); a.area += ED.qtyOf('M2', d); a.vol += ED.qtyOf('M3', d); n++; seen[guid] = 1;
    }
    for (var i = 0; i < guids.length; i += 900) {
      var chunk = guids.slice(i, i + 900), ph = chunk.map(function () { return '?'; }).join(',');
      var got = []; try { got = _all(db, "SELECT m.guid, m.discipline, m.ifc_class, m.storey, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
        "WHERE m.guid IN (" + ph + ") AND t.bbox_x IS NOT NULL AND t.bbox_x>0", chunk); } catch (e) { got = []; }   // no element_transforms -> the op-log fallback
      got.forEach(function (r) {
        add(r[0], r[1], r[2], r[3], [r[4], r[5], r[6]]);
      });
    }
    if (fallback) guids.forEach(function (g) { if (seen[g]) return; var fb = fallback(g); if (fb) add(g, fb.disc, fb.cls, fb.storey, fb.dims); });   // a DB without element_transforms: the op-log record
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
  // B) Variation Order — ONE PRICING BASIS (red1 2026-09-30, Q1). A VO is the priced DIFFERENCE of the order line it amends, on the SAME basis as the Project Order line
  // (proj_fold: per class row, round(rate x qty) to 0 dp HALF_UP). For each class of the selection: delta = amount(edited rows) - amount(unedited rows). vo_fold is used
  // UNCHANGED with a neutral voConfig (factors 1, no loading) and one CHANGED row per class (count 1, rate = delta): unitPrice = delta exactly, GrandTotal = sum(delta).
  // INVARIANT (witnessed): PlannedAmt(original order of the parts) + VO == a fresh fold of the edited parts, to the cent. The old per-element x1.3 x loading model is not used here.
  var NEUTRAL_VO = { addFactor: 1, removeFactor: 1, changeFactor: 1, overheadPct: 0, markupPct: 0, disruptionPct: 0 };
  function rowsAmount(rows, env) {   // per class: sum of round0(rate x qty) — exactly proj_fold's line amount — as BigDecimal
    var BD = env.BigDecimal || global.BigDecimal, out = {};
    rows.forEach(function (r) { var a = BD.of(String(r.rate)).multiply(BD.of(String(r.qty))).setScale(0, BD.RoundingMode.HALF_UP); out[r.cls] = (out[r.cls] || BD.ZERO).add(a); });
    return out;
  }
  // `existing` = {cls: amount} the order LINES currently hold (readState().lines): the line being amended is the base, literally "the priced difference of the order line it amends"
  // (a class already issued at the edited quantity yields no VO). Without `existing` the base is the same parts unedited. NOTE: select ALL parts of the order for a whole-line VO.
  function voRowsFromEdit(db, guids, env, edits, fallback, existing) {
    var BD = env.BigDecimal || global.BigDecimal;
    var before = pricedRowsFor(db, guids, env, null, fallback), after = pricedRowsFor(db, guids, env, edits, fallback);
    var b = rowsAmount(before.rows, env), a = rowsAmount(after.rows, env), out = [], disc = {};
    if (existing) Object.keys(existing).forEach(function (c) { if (a[c] != null) b[c] = BD.of(String(existing[c])); });
    after.rows.concat(before.rows).forEach(function (r) { disc[r.cls] = disc[r.cls] || r.disc; });
    Object.keys(a).concat(Object.keys(b)).filter(function (c, i, arr) { return arr.indexOf(c) === i; }).forEach(function (c) {
      var d = (a[c] || BD.ZERO).subtract(b[c] || BD.ZERO); if (d.signum() === 0) return;
      out.push({ status: 'CHANGED', cls: c, disc: disc[c] || '_', count: 1, rate: d.toString(), unit: 'EA' });
    });
    return out;
  }
  function issueVO(db, building, voRows, env, now, cur) {
    var r = env.VoFold.foldVariationOrder(db, building, voRows, { packCurrencyISO: cur || 'USD', now: now, voConfig: NEUTRAL_VO });
    console.log('§S9-VO building=' + building + ' doc=' + r.docNo + ' order=' + r.orderId + ' lines=+' + r.created.lines + ' grandTotal=' + r.grandTotal + ' project=' + r.projectId + ' basis=order-line');
    return r;
  }
  function voStatusLabel(s) { return s === 'DR' ? 'Drafted' : s === 'CO' ? 'Approved' : s === 'IP' ? 'In progress' : s === 'RE' ? 'Reversed' : String(s); }

  var API = { BUILDING_LABELS: BUILDING_LABELS, projectKey: projectKey, openStore: openStore, persist: persist, storeStamp: storeStamp, pricedRowsFor: pricedRowsFor, readState: readState, decide: decide, generate: generate,
    deleteReissue: deleteReissue, voRowsFromEdit: voRowsFromEdit, rowsAmount: rowsAmount, voStatusLabel: voStatusLabel, issueVO: issueVO, launchUrl: launchUrl, countProjects: countProjects, STORE_FILE: STORE_FILE };
  if (typeof window !== 'undefined') window.ProjOrderState = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
