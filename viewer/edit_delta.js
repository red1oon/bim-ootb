// edit_delta.js — §S8 EDIT → Δ ON THE THING (bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S8; decision change
// prompts/RATES_SOURCE_OF_TRUTH.md §5, 2026-09-30).
// ⚠ DO NOT REMOVE — ONE pure function, called by BOTH surfaces (Viewer S7 hover/#info-4d and the Modeller's hover/click).
// It carries NO rate table and NO duration formula: rates come from the caller's rates.js globals (env.RATES,
// env.LABOR_RATES, ...), durations from the §I owner ScheduleAuthor._installSecs, fragmentation / length weighting
// from the owners ScheduleAuthor._classFragmentation / _linearWeighting. Money goes through erp/bigdecimal.js only.
// Pure, DOM-free, node-testable. `env` is supplied by the caller (Viewer: window globals; Modeller: lazily <script>-loaded).
//
// TWO DECLARED TWINS (a twin without a parity gate is a drift — both are gated by viewer/tests/witness_s8_pure.js):
//   netEdits  mirrors modeller/bonsai_kernel.js:311-316 (the fold's own net GEOM_MOVE/GEOM_SCALE accumulation per parent)
//   qtyOf     mirrors analysis_sidecar.js compute5D / schedule_author.js _AREA_EXPR (length = longest bbox edge,
//             area = longest x second-longest, volume = product, EA = 1) — the SHIPPED 5D quantity basis (bbox, §E proxy,
//             labelled `basis=bbox`; consistent with the 5D report and the duration engine, not a claim about the B-rep).
// Log: §S8-DELTA guid= cls= unit= qty=<before>-><after> rate= costDelta= schedDelta=<secs>s(<days>d) basis= surface=
(function (global) {
  'use strict';

  var DAY_SECS = 28800;   // owner default (_productivity_basis_secs); env.LABOR_RATES._productivity_basis_secs overrides

  function _params(op) { var p = op && op.parameters; return typeof p === 'string' ? JSON.parse(p) : (p || {}); }

  // netEdits(ops) -> Map fid -> {dx,dy,dz,fx,fy,fz, ops:n, unsupported:[op_type,...]}
  function netEdits(ops) {
    var m = new Map();
    function get(fid) { var a = m.get(fid); if (!a) { a = { dx: 0, dy: 0, dz: 0, fx: 1, fy: 1, fz: 1, ops: 0, unsupported: [] }; m.set(fid, a); } return a; }
    (ops || []).forEach(function (op) {
      var t = op.op_type, P = _params(op);
      if (t === 'GEOM_MOVE') { var a = get(P.parent); a.dx += P.dx || 0; a.dy += P.dy || 0; a.dz += P.dz || 0; a.ops++; }
      else if (t === 'GEOM_SCALE') { var b = get(P.parent); b.fx *= P.fx != null ? P.fx : 1; b.fy *= P.fy != null ? P.fy : 1; b.fz *= P.fz != null ? P.fz : 1; b.ops++; }
      else if (t === 'GEOM_ROTATE') { var c = get(P.parent); c.ops++; }            // yaw: no quantity change
      else if (t === 'GEOM_GRID_MOVE') {                                             // §S8-QTY ⛔ BLOCKED — named, never guessed
        (P.commands || []).forEach(function (cmd) { if (cmd.featureId != null) { var d = get(cmd.featureId); d.ops++; if (d.unsupported.indexOf(t) < 0) d.unsupported.push(t); } });
      }
    });
    return m;
  }

  // qtyOf(unit, dims) — the compute5D quantity for ONE element from its bbox dims.
  function qtyOf(unit, dims) {
    var d = [dims[0], dims[1], dims[2]].sort(function (a, b) { return b - a; });
    if (unit === 'M') return d[0];
    if (unit === 'M2') return d[0] * d[1];
    if (unit === 'M3') return dims[0] * dims[1] * dims[2];
    return 1;   // EA / KG / unmapped → count (apply5DRates)
  }

  function _q(s) { return String(s).replace(/'/g, "''"); }

  // readRecord(db, guid) -> {guid, cls, name, dims:[bx,by,bz]} | null — the element's RECORD (element_transforms ⋈ elements_meta).
  function readRecord(db, guid) {
    var r;
    try {
      r = db.exec("SELECT m.ifc_class, m.element_name, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m " +
        "JOIN element_transforms t ON m.guid=t.guid WHERE m.guid='" + _q(guid) + "' AND t.bbox_x IS NOT NULL");
    } catch (e) { return null; }
    if (!r.length || !r[0].values.length) return null;
    var v = r[0].values[0];
    // record precision 0.1 mm: two surfaces hold the SAME element in different float widths (float32 mesh-side vs double) — differences ~1e-7 m must not become a cent
    var r4 = function (x) { return Math.round((x || 0) * 1e4) / 1e4; };
    return { guid: guid, cls: v[0], name: v[1], dims: [r4(v[2]), r4(v[3]), r4(v[4])] };
  }

  // classCtx(db, env) -> {frag, lin} from the OWNERS (they read the same DB the caller holds). Memoised per db object.
  var _ctxCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  function classCtx(db, env) {
    if (_ctxCache && _ctxCache.has(db)) return _ctxCache.get(db);
    var SA = env.ScheduleAuthor;
    var ctx = { frag: SA._classFragmentation(db, env.RATES), lin: SA._linearWeighting(db, env.RATES) };
    if (_ctxCache) _ctxCache.set(db, ctx);
    return ctx;
  }

  // labour seconds for one element at these dims — the §I owner, fed exactly as schedule_author.js:552-569 feeds it.
  function _labour(rec, dims, ctx, env) {
    var SA = env.ScheduleAuthor;
    var rule = SA.matchNameOverride(rec.cls, rec.name, env.SEQUENCE_NAME_OVERRIDES) || SA.matchRule(rec.cls, env.SEQUENCE_RULES, env.SEQUENCE_DEFAULT);
    var frag = ctx.frag.fragmented[rec.cls] ? true : false;
    var realQty = frag ? qtyOf('M2', dims) : null;
    var hasGeom = dims[0] > 0 || dims[1] > 0 || dims[2] > 0;
    var avgLen = ctx.lin.avgLength[rec.cls];
    var lengthRatio = (realQty == null && hasGeom && avgLen > 0) ? Math.max(dims[0], dims[1], dims[2]) / avgLen : null;
    var secs = SA._installSecs(rec.cls, rule, env.LABOR_RATES, realQty, lengthRatio);
    var basis = realQty != null ? 'area-weighted (fragmented class)' : (lengthRatio != null ? 'length-weighted (linear class)' : 'flat per element');
    return { secs: secs, basis: basis };
  }

  function _money(rateStr, qty) { return env_BD().of(rateStr).multiply(env_BD().of(qty.toFixed(6))); }
  var _BD = null;
  function env_BD() { return _BD; }

  // deltaFor(rec, net, ctx, env) — the ONE function. `net` = netEdits() entry (or null = no edit).
  function deltaFor(rec, net, ctx, env) {
    _BD = env.BigDecimal || global.BigDecimal;
    var n = net || { fx: 1, fy: 1, fz: 1, dx: 0, dy: 0, dz: 0, ops: 0, unsupported: [] };
    var before = rec.dims.slice();
    var after = [before[0] * n.fx, before[1] * n.fy, before[2] * n.fz];
    var rt = env.RATES && env.RATES[rec.cls];
    var unit = rt ? rt.unit : 'EA', rate = rt ? rt.rate : 0;
    var priced = !!rt;
    var qB = qtyOf(unit, before), qA = qtyOf(unit, after);
    var cB = _money(String(rate), qB), cA = _money(String(rate), qA);
    var HU = _BD.RoundingMode.HALF_UP;
    var costDelta = cA.subtract(cB).setScale(2, HU);
    var lb = _labour(rec, before, ctx, env), la = _labour(rec, after, ctx, env);
    var basisSecs = (env.LABOR_RATES && env.LABOR_RATES._productivity_basis_secs) || DAY_SECS;
    var secsDelta = la.secs - lb.secs;
    var labels = [];
    if (!n.ops) labels.push('no edit');
    if (n.ops && n.fx === 1 && n.fy === 1 && n.fz === 1) labels.push('a move changes no quantity');
    if (!priced) labels.push('unpriced class (rate 0, as the 5D report bills it)');
    if (unit === 'EA') labels.push('per-item rate: size does not change cost');
    if (n.unsupported.length) labels.push('quantity Δ not computed for ' + n.unsupported.join(','));
    labels.push('cost: projected — active rate pack (rates.js + the user\'s locale pack) × bbox quantity Δ, this element');
    labels.push('schedule: projected — labour time per shipped duration rule (' + la.basis + '); finish date not re-solved');
    return {
      guid: rec.guid, cls: rec.cls, unit: unit, basis: 'bbox',
      dimsBefore: before, dimsAfter: after,
      qtyBefore: qB, qtyAfter: qA, rate: rate, priced: priced,
      costBefore: cB.setScale(2, HU).toString(), costAfter: cA.setScale(2, HU).toString(), costDelta: costDelta.toString(),
      labourSecsBefore: lb.secs, labourSecsAfter: la.secs, labourSecsDelta: secsDelta,
      labourDaysDelta: +(secsDelta / basisSecs).toFixed(4), schedBasis: la.basis,
      finish: 'not re-solved', unsupported: n.unsupported.slice(), labels: labels
    };
  }

  // deltaForEdit(db, guid, net, env) — record read + class ctx + deltaFor. null when the guid has no record.
  function deltaForEdit(db, guid, net, env) {
    var rec = readRecord(db, guid);
    if (!rec) return null;
    return deltaFor(rec, net, classCtx(db, env), env);
  }

  // one-line text — the SAME string on both surfaces, so equality is checkable by eye and by the witness.
  function line(d) {
    if (!d) return '';
    var sign = function (s) { return (String(s)[0] === '-' ? '' : '+') + s; };
    var sd = d.labourSecsDelta;
    return 'Δ ' + d.cls + ' ' + d.unit + ' ' + d.qtyBefore.toFixed(3) + '→' + d.qtyAfter.toFixed(3) +
      ' · material ' + sign(d.costDelta) + ' (projected, active rate pack ' + d.rate + '/' + d.unit + ')' +
      ' · labour ' + (sd >= 0 ? '+' : '') + sd + 's (' + (d.labourDaysDelta >= 0 ? '+' : '') + d.labourDaysDelta + 'd, ' + d.schedBasis + ')' +
      ' · finish date not re-solved';
  }

  function logLine(d, surface) {
    console.log('§S8-DELTA guid=' + d.guid + ' cls=' + d.cls + ' unit=' + d.unit + ' qty=' + d.qtyBefore.toFixed(6) + '->' + d.qtyAfter.toFixed(6) +
      ' rate=' + d.rate + ' costDelta=' + d.costDelta + ' schedDelta=' + d.labourSecsDelta + 's(' + d.labourDaysDelta + 'd) basis=' + d.schedBasis +
      ' finish=' + d.finish + ' surface=' + surface);
  }

  // envFromGlobals() — the browser env: the rates.js globals + ScheduleAuthor + BigDecimal, all read at CALL time.
  function envFromGlobals() {
    var g = global;
    return { RATES: g.RATES, LABOR_RATES: g.LABOR_RATES, SEQUENCE_RULES: g.SEQUENCE_RULES, SEQUENCE_DEFAULT: g.SEQUENCE_DEFAULT,
      SEQUENCE_NAME_OVERRIDES: g.SEQUENCE_NAME_OVERRIDES, ScheduleAuthor: g.ScheduleAuthor, BigDecimal: g.BigDecimal };
  }

  var API = { netEdits: netEdits, qtyOf: qtyOf, readRecord: readRecord, classCtx: classCtx, deltaFor: deltaFor,
    deltaForEdit: deltaForEdit, line: line, logLine: logLine, envFromGlobals: envFromGlobals };
  if (typeof window !== 'undefined') window.EditDelta = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
