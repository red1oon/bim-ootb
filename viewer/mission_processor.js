// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/MOBILE_PERF.md WO-25 "The desktop processor: a Project Order's new Requests become a mission file" + REVIEW LOG "SHAPE REVIEW" / "OWNER'S MODEL NOTES".
//   Witness: viewer/tests/witness_mission_processor.js (W-MISSION-PREPARE). READ THE LOG after every run: §MISSION_PREPARE  §MISSION_PREPARE_TASK  §MISSION_PREPARE_SKIP  §REQ_CHANGED.
// ISSUE: HQ computes, the phone receives. On the DESKTOP one action takes the Requests of a Project Order that are still New (Request Type "Site Task"), works out for each which element(s) it is for,
//        where they are, in what order to visit them and by which walking path, writes ONE mission file in the WO-24 format (viewer/task_mission.js loads it) and moves exactly those Requests to
//        Prepared. Desktop only: this file is flagged "phone": false (phoneGroup hq) and is loaded on demand by the `missionproc` row of APP.lazy; nothing of it is requested at boot.
// APP.prepareMission(projectId, opts) -> { mission, prepared:[R_Request_ID], skipped:[{request, why}], counts, error? }   opts = { start:{x,y,storey}? }
//   a. the Requests of C_Project projectId whose Status is the DEFAULT OPEN status of the "Site Task" Status Category (New) and whose Request Type is on that category,
//      ordered by DateStartPlan (empty last), then DocumentNo (legacy's order of a series).
//   b. elements: R_Request.M_Product_ID -> M_Product.Value. A GUID that is in the open model's elements_meta = that ONE element. Otherwise Value is an IFC class = every element of that class in the
//      model, narrowed to the project's pushed set (C_Project.Note) when one is stored — read through FindErpPush.linkBackSet, the one reader rule. A Request that resolves to no positioned element is NOT
//      prepared: it stays New and is listed in `skipped` with its reason.
//   c. one task per element { id, documentno, type, summary, guid, storey, x, y, seq, path, path_kind }: id = R_Request_UU, or R_Request_UU#guid when the Request has several elements; x,y = element_transforms
//      centre (IFC plane — the frame viewer/task_arrival.js and walk.js _walkTaskArrive use), storey = elements_meta.storey.
//   d. order inside a Request: nearest-next from the previous task's spot (ties: smallest guid); across Requests: the order of (a). DISTANCE = sqrt(dx^2 + dy^2 + dz^2) with dz = the difference of the two
//      storeys' floor heights (A.walkStoreyLevels) — a floor apart costs its height, so the walk does not zigzag between floors. With no previous spot (no opts.start) the first task of the mission is the
//      Request's smallest guid.
//   e. path of each task = the room graph's route from the previous task's room to this task's room (RoomGraph.shortestPath, its `polyline` as [x,y,"storey"]), with the previous spot in front and the element
//      at the end. The element's room = viewer/location_axis.js (LocationAxis.derive locOf), kept only when that room is a node of the room graph. The FIRST task starts at opts.start (its room = the graph
//      room whose rectangles hold the point on that storey); without it the first task gets the two-point line room-centre -> element and the result says start=none. Where there is no route (no rooms
//      compiled, the element or the start is in no room, no door route) the path is the two-point straight line and the task says path_kind:"straight" — counted in the log, never silent.
//      A route inside ONE room (both spots in the same room) is routed with 0 hops: [previous spot, element].
//   f. types: per Request Type { name, radius_m:null, form:null } (the radius and a richer form are a later order; the phone then uses "I'm here"/QR and its built-in form).
// STATUS MOVE (only for prepared Requests, only after the file validates through TaskMission.validate with refused=0): R_Status_ID -> the status after New (Next_Status_ID, else the next SeqNo of the
//      category), in ONE SAVEPOINT, each through RequestChanged.requestChanged (erp/request_changed.js): the History row (R_RequestAction, the previous status) as legacy writes it on a status change.
//      A file that does not validate moves NOTHING.
// THE STORE: the Kernel ERP database is the page's shared Project-Order store (ProjOrderState.shared — the same instance the › ERP push writes), persisted to OPFS after the move.
(function (root) {
  'use strict';
  var CAT_UU = 'bdf15a57-436f-44d1-89f6-3925563cf296';    // R_StatusCategory "Site Task"   (erp/ad_site_task_overlay.js, same UU on the legacy pilot)
  var TYPE_UU = 'be7c0c0c-4b1e-4fbb-ac29-3ad08c1d13a9';   // R_RequestType "Site Task"
  var VPFX = 'BIM model version ';                         // viewer/proj_fold.js: C_Project.Description = VPFX + the model version tag

  function log(s) { console.log(s); }
  function num(v) { return typeof v === 'number' && isFinite(v); }

  function setupMissionProcessor(A) {
    if (A.prepareMission) return;

    function rows(db, sql, p) { var r = db.exec(sql, p || []); if (!r.length) return []; var c = r[0].columns; return r[0].values.map(function (v) { var o = {}; c.forEach(function (n, i) { o[n.toLowerCase()] = v[i]; }); return o; }); }
    function kernelDb() {
      var SQL = A._SQL || window.SQL || window._SQL_CACHED, PS = window.ProjOrderState;
      if (!SQL || !PS || !PS.shared) return Promise.reject(new Error('the ERP store is not available on this page'));
      return PS.shared(SQL, function () { return A.cachedFetch('../erp/ad_seed.db'); }, 'mission_processor').then(function (st) { return st.db; });
    }

    // the Site Task rows: the ERP's boot overlay (erp/ad_site_task_overlay.js, the ONE owner of the rows, outside the Team base hash) is ensured on this store; a no-op when the rows are there
    async function siteTask(db) {
      var O = window.AdSiteTaskOverlay; if (!O || !O.ensure) throw new Error('erp/ad_site_task_overlay.js is not loaded');
      var r0 = O.ensure(db), how = r0.added ? 'ensured ' + r0.added + ' rows' : 'present', cat = rows(db, 'SELECT r_statuscategory_id AS id FROM r_statuscategory WHERE r_statuscategory_uu=?', [CAT_UU])[0];
      if (!cat) throw new Error('no Site Task status category');
      var sts = rows(db, "SELECT * FROM r_status WHERE r_statuscategory_id=? AND isactive='Y' ORDER BY seqno", [cat.id]);
      var nw = sts.filter(function (s) { return s.isdefault === 'Y' && s.isopen === 'Y'; })[0];   // MStatus.getDefault: the default status of the category, ORDER BY SeqNo
      if (!nw) throw new Error('the Site Task category has no default open status');
      var next = null;   // legacy keeps Next_Status_ID only with a timeout (MStatus.java:278): when it is cleared, the next SeqNo is the order of the category
      if (nw.next_status_id != null) next = sts.filter(function (s) { return Number(s.r_status_id) === Number(nw.next_status_id); })[0] || null;
      if (!next) next = sts.filter(function (s) { return Number(s.seqno) > Number(nw.seqno) && s.isopen === 'Y'; })[0] || null;
      if (!next) throw new Error('the Site Task category has no status after ' + nw.name);
      log('§MISSION_PREPARE_ROWS category=' + cat.id + ' rows=' + how + ' new=' + nw.r_status_id + '(' + nw.name + ') prepared=' + next.r_status_id + '(' + next.name + ') statuses=' + sts.map(function (s) { return s.name; }).join('>'));
      return { cat: cat.id, nw: nw, next: next };
    }

    // the open model's elements
    var ELSQL = 'SELECT m.guid, m.ifc_class, m.element_name, m.storey, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m LEFT JOIN element_transforms t ON t.guid = m.guid ';
    function elObj(r) { return { guid: r[0], cls: r[1], name: r[2], storey: r[3], x: r[4], y: r[5], z: r[6], bx: r[7], by: r[8], bz: r[9] }; }
    function positioned(e) { return e.storey != null && String(e.storey) !== '' && num(e.x) && num(e.y); }
    function elementsOf(value, pushed) {
      var one = A.dbQuery(ELSQL + 'WHERE m.guid = ?', [value]).map(elObj);
      if (one.length) return { kind: 'guid', all: one, els: one.filter(positioned), narrowed: false };
      var all = A.dbQuery(ELSQL + 'WHERE m.ifc_class = ? ORDER BY m.guid', [value]).map(elObj);
      if (!all.length) return { kind: 'none', all: [], els: [], narrowed: false };
      var narrowed = !!(pushed && pushed.n), kept = narrowed ? all.filter(function (e) { return pushed.has[e.guid]; }) : all;
      return { kind: 'class', all: all, els: kept.filter(positioned), narrowed: narrowed, inClass: all.length, inSet: kept.length };
    }

    function levelZ(storey) { var lv = A.walkStoreyLevels || []; for (var i = 0; i < lv.length; i++) if (String(lv[i].storey) === String(storey)) return lv[i].floorZ; return 0; }
    function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = levelZ(a.storey) - levelZ(b.storey); return Math.sqrt(dx * dx + dy * dy + dz * dz); }

    // the rooms: a node of the room graph, or null. The graph is the Find panel's own (A.getRoomGraph); A.ensureRooms compiles rooms into the open model when it has none (the Find room tree does the same)
    async function roomsReady() {
      var out = { graph: null, RG: window.RoomGraph || null, note: '' };
      try {
        await A.loadNavigate();
        out.RG = window.RoomGraph || null;
        if (A.ensureRooms) { var er = await A.ensureRooms({}); out.note = 'ensureRooms=' + (er && er.status) + (er && er.rooms != null ? ' rooms=' + er.rooms : ''); }
        out.graph = A.getRoomGraph ? A.getRoomGraph() : null;
      } catch (e) { out.note = 'rooms unavailable: ' + (e && e.message); }
      if (!out.graph || !out.RG || !out.RG.shortestPath) { out.graph = null; if (!out.note) out.note = 'no room graph'; }
      return out;
    }
    function levelName(name, z) {   // a graph storey name, mapped onto a name of A.walkStoreyLevels (the validator's names)
      var lv = A.walkStoreyLevels || []; if (!lv.length) return name;
      for (var i = 0; i < lv.length; i++) if (String(lv[i].storey) === String(name)) return lv[i].storey;
      var best = null, bd = Infinity; for (var k = 0; k < lv.length; k++) { var d = Math.abs(lv[k].floorZ - z); if (d < bd) { bd = d; best = lv[k]; } }
      return best ? best.storey : name;
    }
    function roomAt(R, x, y, storey) {   // the graph room whose rectangles hold the point on that storey
      if (!R.graph) return null;
      var ns = R.graph.nodesByGuid, g;
      for (g in ns) {
        var n = ns[g]; if (n.kind !== 'room' || String(n.storey) !== String(storey)) continue;
        for (var i = 0; i < (n.rects || []).length; i++) { var r = n.rects[i]; if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return n.guid; }
      }
      return null;
    }

    // ── the mission ──────────────────────────────────────────────────────────────────────────────────────────────────
    A.prepareMission = async function (projectId, opts) {
      opts = opts || {};
      var skipped = [], prepared = [], tasks = [], types = {}, counts = { routed: 0, straight: 0, hops: 0 };
      var fail = function (msg) { log('§MISSION_PREPARE project=' + projectId + ' ERROR ' + msg); return { mission: null, prepared: [], skipped: skipped, counts: counts, error: msg }; };
      if (!A.db || !A.dbQuery) return fail('no model is open');
      if (!window.TaskMission || !window.TaskMission.validate) await A.lazy('tasks');   // the mission file's own validator (viewer/task_mission.js) — one owner
      if (!(A.walkStoreyLevels && A.walkStoreyLevels.length) && typeof A.cacheStoreyLevels === 'function') A.cacheStoreyLevels();
      var db = await kernelDb(), ST = await siteTask(db);
      var proj = rows(db, 'SELECT * FROM c_project WHERE c_project_id=?', [projectId])[0];
      if (!proj) return fail('no Project Order ' + projectId);
      var reqs = rows(db, 'SELECT r.*, t.r_requesttype_uu AS type_uu, t.name AS type_name FROM r_request r JOIN r_requesttype t ON t.r_requesttype_id = r.r_requesttype_id ' +
        "WHERE r.c_project_id = ? AND r.isactive = 'Y' AND t.r_statuscategory_id = ? AND r.r_status_id = ? ORDER BY (r.datestartplan IS NULL), r.datestartplan, r.documentno", [projectId, ST.cat, ST.nw.r_status_id]);
      var R = await roomsReady();   // loads the Find stack too (FindErpPush, RoomGraph), so it comes before the pushed-set read
      var FEP = window.FindErpPush, setGuids = FEP && FEP.linkBackSet ? FEP.linkBackSet(proj.note) : [], pushed = { n: setGuids.length, has: {} };
      setGuids.forEach(function (g) { pushed.has[g] = 1; });
      log('§MISSION_PREPARE_SCOPE project=' + projectId + ' value=' + proj.value + ' new_requests=' + reqs.length + ' pushed_set=' + pushed.n + ' rooms=' + (R.graph ? 'graph(' + Object.keys(R.graph.nodesByGuid).length + ' nodes)' : 'none') + (R.note ? ' (' + R.note + ')' : ''));

      // (b) resolve every Request to elements first (a Request that resolves to none is skipped, listed with its reason)
      var work = [];
      reqs.forEach(function (r) {
        var prod = r.m_product_id == null ? null : rows(db, 'SELECT value FROM m_product WHERE m_product_id=?', [r.m_product_id])[0];
        var why = null, res = null;
        if (!prod || prod.value == null || prod.value === '') why = 'the Request has no product, so it names no element';
        else {
          res = elementsOf(String(prod.value), pushed);   // R2 marker: the resolve guard below
          if (res.kind === 'none') why = 'product "' + prod.value + '" is neither an element of this model nor a class in it';
          else if (!res.els.length) why = res.all.length && res.kind === 'class' && res.narrowed && !res.inSet ? 'no element of class ' + prod.value + ' is in the project\'s pushed set' : 'the element(s) have no storey or position in this model';
        }
        if (why) { skipped.push({ request: r.r_request_id, documentno: r.documentno, why: why }); log('§MISSION_PREPARE_SKIP request=' + r.r_request_id + ' documentno=' + r.documentno + ' why=' + why); return; }
        work.push({ r: r, res: res, value: String(prod.value) });
      });

      // the rooms of every element, in one LocationAxis pass (the same pass the 4D programme files by)
      var roomOf = {}, axisN = 0, inGraph = 0;
      if (R.graph && window.LocationAxis && work.length) {
        var flat = []; work.forEach(function (w) { w.res.els.forEach(function (e) { flat.push({ guid: e.guid, cls: e.cls, base_z: e.z - (e.bz || 0) / 2, top_z: e.z + (e.bz || 0) / 2, x0: e.x - (e.bx || 0) / 2, x1: e.x + (e.bx || 0) / 2, y0: e.y - (e.by || 0) / 2, y1: e.y + (e.by || 0) / 2 }); }); });
        var ax = window.LocationAxis.derive(A.db, flat, { label: 'mission' });
        flat.forEach(function (e) { axisN++; var g = ax.locOf[e.guid], n = g && R.graph.nodesByGuid[g]; if (n && n.kind === 'room') { roomOf[e.guid] = g; inGraph++; } });
      }
      log('§MISSION_PREPARE_ROOMS elements=' + axisN + ' in_a_graph_room=' + inGraph + ' (the rest have no room of the graph: their path is the straight line)');

      // (c)+(d) tasks in order
      var cursor = opts.start && num(opts.start.x) && num(opts.start.y) && opts.start.storey != null
        ? { x: opts.start.x, y: opts.start.y, storey: String(opts.start.storey), room: roomAt(R, opts.start.x, opts.start.y, opts.start.storey) } : null;
      var startTxt = cursor ? cursor.x + ',' + cursor.y + ',' + cursor.storey + (cursor.room ? ' room=' + cursor.room : ' room=none') : 'none';
      var zKey = {};   // graph z -> storey name (every room node pins ONE walking height per storey, room_graph.js §WALK-Z)
      if (R.graph) Object.keys(R.graph.nodesByGuid).forEach(function (g) { var n = R.graph.nodesByGuid[g], z = isFinite(n.walkZ) ? n.walkZ : n.cz; if (n.storey && isFinite(z)) zKey[z.toFixed(3)] = n.storey; });
      function storeyAtZ(z) { var k = z.toFixed(3); if (zKey[k] != null) return levelName(zKey[k], z); var best = null, bd = Infinity; Object.keys(zKey).forEach(function (kk) { var d = Math.abs(Number(kk) - z); if (d < bd) { bd = d; best = zKey[kk]; } }); return levelName(best, z); }
      var seq = 0;
      work.forEach(function (w) {
        var r = w.r, left = w.res.els.slice(), many = left.length > 1, uu = r.r_request_uu || ('R' + r.r_request_id);
        types[r.type_uu] = types[r.type_uu] || { name: r.type_name, radius_m: null, form: null };
        while (left.length) {
          var pick = 0;
          if (!cursor) { left.forEach(function (e, i) { if (e.guid < left[pick].guid) pick = i; }); }
          else { var bd = Infinity; left.forEach(function (e, i) { var d = dist(cursor, e); if (d < bd || (d === bd && e.guid < left[pick].guid)) { bd = d; pick = i; } }); }
          var el = left.splice(pick, 1)[0], toRoom = roomOf[el.guid] || null, pts = null, kind = 'straight', hops = 0, from = cursor ? 'previous-spot' : 'none';
          if (cursor && cursor.room && toRoom) {
            var sp = null; try { sp = R.RG.shortestPath(R.graph, cursor.room, toRoom); } catch (e2) { sp = null; }
            if (sp) {
              var poly = sp.polyline || [];
              pts = [[cursor.x, cursor.y, cursor.storey]];
              poly.forEach(function (p) { pts.push([p.x, p.y, storeyAtZ(p.z)]); });
              pts.push([el.x, el.y, String(el.storey)]); kind = 'routed'; hops = sp.doors ? sp.doors.length : 0;
            }
          }
          if (!pts) {
            if (cursor) pts = [[cursor.x, cursor.y, cursor.storey], [el.x, el.y, String(el.storey)]];
            else { var rn = toRoom ? R.graph.nodesByGuid[toRoom] : null; from = rn ? 'room-centre' : 'element';
              pts = [rn ? [rn.cx, rn.cy, levelName(rn.storey, isFinite(rn.walkZ) ? rn.walkZ : rn.cz)] : [el.x, el.y, String(el.storey)], [el.x, el.y, String(el.storey)]]; }
          }
          seq++;
          tasks.push({ id: many ? uu + '#' + el.guid : uu, documentno: r.documentno, type: r.type_uu, summary: r.summary, guid: el.guid, storey: String(el.storey), x: el.x, y: el.y, seq: seq, path: pts, path_kind: kind });
          if (kind === 'routed') { counts.routed++; counts.hops += hops; } else counts.straight++;
          log('§MISSION_PREPARE_TASK seq=' + seq + ' request=' + r.r_request_id + ' guid=' + el.guid + ' storey=' + el.storey + ' path_kind=' + kind + ' hops=' + hops + ' path_pts=' + pts.length + ' from=' + from +
            ' room=' + (toRoom || 'none') + (cursor ? ' d_m=' + dist(cursor, el).toFixed(3) : ''));
          if (!w.prepared) { w.prepared = true; prepared.push(r.r_request_id); }
          cursor = { x: el.x, y: el.y, storey: String(el.storey), room: toRoom };
        }
      });

      // the file
      var dbPath = String(A.DB_URL || '').split('?')[0].split('/').pop(), vTag = String(proj.description || '').indexOf(VPFX) === 0 ? String(proj.description).slice(VPFX.length) : null;
      var mission = { v: 1, mission: { id: 'M-' + (proj.c_project_uu || ('P' + proj.c_project_id)), name: 'Site mission — ' + (proj.value || proj.name || proj.c_project_id), project: String(proj.value || proj.c_project_id), model: { db: dbPath, version: vTag } },
        types: types, tasks: tasks };
      var result = { mission: mission, prepared: prepared, skipped: skipped, counts: counts, project: proj.value, documentno: proj.value, start: startTxt };
      var line = function (extra) { log('§MISSION_PREPARE project=' + projectId + ' requests=' + reqs.length + ' prepared=' + result.prepared.length + ' skipped=' + skipped.length + ' tasks=' + tasks.length + ' routed=' + counts.routed + ' straight=' + counts.straight + ' start=' + startTxt + (extra || '')); };

      // validate BEFORE any status moves: the file must load on the phone with refused=0 (TaskMission.validate is what loadMission calls)
      var V = window.TaskMission.validate(mission, A.walkStoreyLevels);   // R1 marker
      var invalid = !V.ok || V.refused.length > 0;                        // R3 marker
      if (invalid) {
        var why = !V.ok ? 'the file is not valid (' + V.why + ')' : 'the file has ' + V.refused.length + ' refused task(s): ' + V.refused.map(function (x) { return x.id + ':' + x.why; }).join(',');
        result.prepared.forEach(function (id) { skipped.push({ request: id, why: 'not prepared — ' + why }); });
        result.prepared = []; result.error = why; result.mission = mission; result.invalid = true;
        line(' invalid=' + JSON.stringify(why)); return result;
      }
      if (!result.prepared.length) { line(' (nothing to prepare: no status moves)'); return result; }

      // the status move: ONE savepoint, every prepared Request, the History row of each by the legacy rule
      var RC = window.RequestChanged; if (!RC) return fail('erp/request_changed.js is not loaded');
      var alloc = window.ProjFold && window.ProjFold._allocator ? window.ProjFold._allocator(db) : null, moved = [];
      db.run('SAVEPOINT mission_prepare');
      try {
        for (var i = 0; i < result.prepared.length; i++) {
          var m = RC.requestChanged(db, result.prepared[i], { r_status_id: ST.next.r_status_id }, { alloc: alloc });
          if (!m.ok) throw new Error('request ' + result.prepared[i] + ': ' + m.error);
          moved.push(m.action_id);
        }
        db.run('RELEASE mission_prepare');
      } catch (e) {
        try { db.run('ROLLBACK TO mission_prepare'); db.run('RELEASE mission_prepare'); } catch (e2) { /* nothing open */ }
        result.prepared.forEach(function (id) { skipped.push({ request: id, why: 'not prepared — the status move failed: ' + e.message }); });
        result.error = 'status move failed: ' + e.message; result.prepared = []; line(' status_move=ROLLED_BACK ' + JSON.stringify(e.message)); return result;
      }
      var saved = false; try { saved = await window.ProjOrderState.persistShared(db, 'mission_processor'); } catch (e3) { saved = false; }
      result.saved = saved; result.history = moved;
      line(' status_move=' + ST.nw.name + '->' + ST.next.name + ' history_rows=' + moved.length + ' saved=' + saved);
      return result;
    };

    // the Find panel's control: prepare the pushed project of this model, offer the file, show the counts
    A.prepareMissionUi = async function () {
      var out = document.getElementById('find-mission-result'), say = function (t) { if (A.status) A.status.textContent = t; if (out) { out.style.display = ''; out.textContent = t; } };
      say('Preparing the site mission…');
      var db = await kernelDb(), p = rows(db, 'SELECT c_project_id AS id FROM c_project WHERE value = ?', [A.activeBuilding])[0];
      if (!p) { say('No Project Order for this model yet — push one with › ERP first.'); log('§MISSION_PREPARE_UI building="' + A.activeBuilding + '" project=none'); return null; }
      var res = await A.prepareMission(p.id, {});
      var head = res.error ? 'Site mission not made: ' + res.error : 'Site mission: ' + res.prepared.length + ' request(s) prepared, ' + res.skipped.length + ' skipped, ' + res.mission.tasks.length + ' task(s)';
      var detail = res.skipped.map(function (s) { return '• ' + (s.documentno || s.request) + ' — ' + s.why; }).join('\n');
      say(head + (detail ? '\n' + detail : ''));
      if (out) out.style.whiteSpace = 'pre-line';
      if (res.mission && res.mission.tasks.length && !res.invalid) {
        var name = 'mission_' + String(res.documentno).replace(/[^A-Za-z0-9_-]+/g, '_') + '_' + res.mission.tasks.length + '.json';
        var a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(res.mission, null, 1)], { type: 'application/json' }));
        a.href = url; a.download = name; a.id = 'find-mission-download'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        log('§MISSION_PREPARE_DOWNLOAD file=' + name + ' tasks=' + res.mission.tasks.length);
      }
      return res;
    };
    log('§MISSION_PROCESSOR_READY');
  }

  if (root) root.setupMissionProcessor = setupMissionProcessor;
})(typeof window !== 'undefined' ? window : null);
