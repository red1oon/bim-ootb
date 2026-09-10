// dagevu_engine.js — §DAGEVU (prompts/SPEC_DAGEVU_ENGINE.md — Witness: W-DAGEVU-ENGINE): the DAGeVu relationship-
// edge engine. ES6 class-based (the one deliberate departure from this codebase's closure style — the contract is
// meant to be subclassed). A RelationEdge is one REAL, recovered dependency between two elements; propagate() turns
// the driving element's edit into the dependent's induced edit, or refuses honestly (null) when no honest answer
// exists. Everything numeric comes from measured AABBs and the recovered edge rows; nothing is guessed.
//
// REUSES, never re-implements (SPEC §1): sdg_cascade.js stretchRide (the ride math), sdg_gate.js evaluate (the
// abuts-realign proposal + the door-crush fit rule the anchor refusal mirrors), bonsai_library.js foldInsert's
// grid-command mapping (foldBox below is its AABB image: TRANSLATE x+=d; SCALE about the world min edge
// x' = f·x + min·(1−f) + t).
//
// HostFillEdge mode 'anchor' (DEFAULT, SPEC §3): the opening's world position is invariant under a host LENGTH
// change — SCALE induces zero filling delta; TRANSLATE still carries it rigidly (a whole-body wall move cannot
// leave its door in the air). The grid dictates which end grows; the edge VERIFIES that end is free of the opening
// with the gate's own fit rule (fitBefore && !fitAfter, tol 0.05 on the changed axis) and REFUSES otherwise.
// mode 'ride' = today's proportional ride, now an explicit per-element opt-in.
// AbutsEdge: reports the gate's proposedDelta for a neighbour pulled away — REPORTS ONLY (accept-gated apply is a
// future op per SDG_BACKPROP_ABUTS_REALIGN.md). AngleEdge: ⛔ PAUSED, not built (no measured roof-slope data).
//
// Dual-export (window + node) like sdg_cascade.js / sdg_gate.js so the value witness runs pure-node.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DagevuEngine = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const AX = { x: 0, y: 1, z: 2 };
  const FIT_TOL = 0.05;                     // m — sdg_gate.js door-crush / withinXY tolerance (non-invent reuse)
  const MODES = ['anchor', 'ride'];

  class RelationEdge {
    constructor(kind, a, b) { this.kind = kind; this.a = a; this.b = b; this.refusal = null; }
    // propagate(drivingDelta, realGeometry) → { dependentDeltas:[{featureId,dx,dy,dz}], dimLabel } | null (refused)
    propagate() { throw new Error('RelationEdge.propagate is abstract — subclass it (' + this.kind + ')'); }
    // foldBox(aabb, commands) → aabb' — the AABB image of the fold's own grid-command mapping (bonsai_library.js
    // foldInsert gridCmds branch): TRANSLATE shifts; SCALE maps about the CURRENT world min on the command axis.
    // aabb layout = [minx,maxx,miny,maxy,minz,maxz] (the _gateBoxes shape). Pure; input untouched.
    static foldBox(box, commands) {
      const b = box.slice();
      for (const cmd of commands || []) {
        const k = AX[cmd.axis]; if (k == null) continue;                  // axis-less command (ROOF_LIFT) → no plan-axis image
        if (cmd.action === 'TRANSLATE') { const d = cmd.delta || 0; b[2 * k] += d; b[2 * k + 1] += d; }
        else {
          const f = cmd.newScale != null ? cmd.newScale : 1, tx = b[2 * k] * (1 - f) + (cmd.translateDelta || 0);
          const lo = f * b[2 * k] + tx, hi = f * b[2 * k + 1] + tx;
          b[2 * k] = Math.min(lo, hi); b[2 * k + 1] = Math.max(lo, hi);
        }
      }
      return b;
    }
    static fitsOnAxis(inner, outer, k, tol) {
      tol = tol == null ? FIT_TOL : tol;
      return inner[2 * k] >= outer[2 * k] - tol && inner[2 * k + 1] <= outer[2 * k + 1] + tol;
    }
  }

  class HostFillEdge extends RelationEdge {
    // row = one REAL rel_fills_host row {host_guid, filling_guid, provenance}; fids resolved through the §ARC-1 bridge
    constructor({ hostFid, fillingFid, hostGuid, fillingGuid, provenance, mode, cascade }) {
      super('fills', hostFid, fillingFid);
      this.hostFid = hostFid; this.fillingFid = fillingFid; this.hostGuid = hostGuid; this.fillingGuid = fillingGuid;
      this.provenance = provenance; this.cascade = cascade; this.setMode(mode || 'anchor');
    }
    setMode(mode) { if (MODES.indexOf(mode) < 0) throw new Error('HostFillEdge mode must be anchor|ride, got ' + mode); this.mode = mode; return this; }
    row() { return { host_guid: this.hostGuid, filling_guid: this.fillingGuid, provenance: this.provenance }; }
    // ride math lives in ONE place: sdg_cascade.stretchRide, fed this single row so it rides only this filling.
    _ride(cmds, geo) {
      const out = this.cascade.stretchRide(cmds, geo.guidByFid, geo.fidByGuid, [this.row()], geo.boxByFid);
      const r = out.riders.find(x => x.featureId === this.fillingFid);
      return r ? [r.dx, r.dy, r.dz] : [0, 0, 0];
    }
    // propagate(hostCommands, { boxByFid, guidByFid, fidByGuid }) — hostCommands = this host's commands IN ORDER.
    propagate(hostCommands, geo) {
      this.refusal = null;
      const hb = geo.boxByFid[this.hostFid], fb = geo.boxByFid[this.fillingFid];
      if (!hb || !fb || !Array.isArray(hostCommands) || !hostCommands.length) return null;   // no honest pre-state → no claim
      const hostAfter = RelationEdge.foldBox(hb, hostCommands);
      const scaleAxes = []; hostCommands.forEach(c => { if (c.action !== 'TRANSLATE' && AX[c.axis] != null && scaleAxes.indexOf(AX[c.axis]) < 0) scaleAxes.push(AX[c.axis]); });
      let d;
      if (this.mode === 'ride') d = this._ride(hostCommands, geo);
      else {
        d = this._ride(hostCommands.filter(c => c.action === 'TRANSLATE'), geo);   // anchor: only the rigid part carries
        const fAfter = [fb[0] + d[0], fb[1] + d[0], fb[2] + d[1], fb[3] + d[1], fb[4] + d[2], fb[5] + d[2]];
        for (const k of scaleAxes) {                                              // free-end check = the gate's door-crush rule
          if (RelationEdge.fitsOnAxis(fb, hb, k) && !RelationEdge.fitsOnAxis(fAfter, hostAfter, k)) {
            this.refusal = { kind: 'anchor-no-free-end', hostFid: this.hostFid, fillingFid: this.fillingFid, axis: 'xyz'[k],
              hostAfter: [hostAfter[2 * k], hostAfter[2 * k + 1]], filling: [fAfter[2 * k], fAfter[2 * k + 1]] };
            return null;
          }
        }
      }
      const k0 = scaleAxes.length ? scaleAxes[0] : null;
      const dimLabel = k0 != null
        ? '#' + this.hostFid + ' ' + (hb[2 * k0 + 1] - hb[2 * k0]).toFixed(2) + '→' + (hostAfter[2 * k0 + 1] - hostAfter[2 * k0]).toFixed(2) + 'm · #' + this.fillingFid + ' ' + (this.mode === 'ride' ? 'rides' : 'held')
        : '#' + this.fillingFid + ' rides #' + this.hostFid;
      return { dependentDeltas: [{ featureId: this.fillingFid, dx: d[0], dy: d[1], dz: d[2] }], dimLabel, hostAfter };
    }
  }

  class AbutsEdge extends RelationEdge {
    constructor({ a, b, gate }) { super('abuts', a, b); this.gate = gate; }
    // propagate({ before, after, moved }) — wraps sdg_gate.evaluate's abuts-realign for THIS pair only. Report-only.
    propagate(state) {
      this.refusal = null;
      if (!state || !state.before || !state.after || !Array.isArray(state.moved)) return null;
      const g = this.gate.evaluate(state.before, state.after, state.moved, { related: () => false, hostOf: {}, abuts: [{ a: this.a, b: this.b }] }, {});
      const hit = g.orange.find(o => o.kind === 'abuts-realign');
      if (!hit) return null;
      const p = hit.proposedDelta;
      return { dependentDeltas: [{ featureId: hit.a, dx: p[0], dy: p[1], dz: p[2], proposed: true, gap: hit.gap, axis: hit.axis }],
        dimLabel: '#' + hit.a + ' gap ' + hit.gap.toFixed(3) + 'm (' + hit.axis + ')' };
    }
  }

  class DagevuEngine {
    // fills/abuts = the REAL recovered rows (window.swXEdges); guidByFid/fidByGuid = the §ARC-1 bridge;
    // cascade = SdgCascade, gate = SdgGate (injected so node witnesses pass the required modules explicitly).
    constructor({ guidByFid, fidByGuid, fills, abuts, cascade, gate, rideFids }) {
      this.guidByFid = guidByFid || {}; this.fidByGuid = fidByGuid || {};
      this.cascade = cascade; this.gate = gate;
      this.edges = []; this.byFilling = {}; this.byHost = {};
      const ride = new Set(rideFids || []);
      for (const e of fills || []) {
        const h = this.fidByGuid[e.host_guid], f = this.fidByGuid[e.filling_guid];
        if (h == null || f == null || !cascade) continue;                 // unresolvable row → no edge (non-invent)
        const edge = new HostFillEdge({ hostFid: h, fillingFid: f, hostGuid: e.host_guid, fillingGuid: e.filling_guid,
          provenance: e.provenance, mode: ride.has(f) ? 'ride' : 'anchor', cascade });
        this.edges.push(edge); (this.byFilling[f] = this.byFilling[f] || []).push(edge); (this.byHost[h] = this.byHost[h] || []).push(edge);
      }
      for (const e of abuts || []) {
        const a = this.fidByGuid[e.a], b = this.fidByGuid[e.b];
        if (a == null || b == null || !gate) continue;
        this.edges.push(new AbutsEdge({ a, b, gate }));
      }
    }
    isFilling(fid) { return !!this.byFilling[fid]; }
    modeOf(fid) { const es = this.byFilling[fid]; return es ? es[0].mode : null; }
    setMode(fid, mode) { (this.byFilling[fid] || []).forEach(e => e.setMode(mode)); return this.modeOf(fid); }
    toggleMode(fid) { return this.setMode(fid, this.modeOf(fid) === 'ride' ? 'anchor' : 'ride'); }
    reset() { this.edges.forEach(e => { if (e instanceof HostFillEdge) e.setMode('anchor'); e.refusal = null; }); }

    // propagateCommands(commands, boxByFid) → { commands, riders, held, refusals, proposals, dimLabel }
    // The grid engine's per-feature commands (bonsai_gridmove.computeCommands) IN; the rider-stripped list plus the
    // induced rider moves OUT — the same {commands, riders} shape stretchRide returns, so gridmove's commit path
    // (gesture group of GEOM_GRID_MOVE + induced GEOM_MOVEs) is unchanged. A refused edge leaves its host's
    // commands AND its filling's commands untouched and is reported; the caller must not commit a refusal.
    propagateCommands(commands, boxByFid, opts) {
      opts = opts || {};
      const out = { commands, riders: [], held: [], refusals: [], proposals: [], dimLabel: '' };
      if (!Array.isArray(commands) || !commands.length) return out;
      const byFid = {};
      commands.forEach(c => { if (c && c.featureId != null) (byFid[c.featureId] = byFid[c.featureId] || []).push(c); });
      const geo = { boxByFid: boxByFid || {}, guidByFid: this.guidByFid, fidByGuid: this.fidByGuid };
      const strip = {}, labels = [], ridden = {};
      let firstScaleLabel = null;
      for (const edge of this.edges) {
        if (!(edge instanceof HostFillEdge) || !byFid[edge.hostFid] || ridden[edge.fillingFid]) continue;   // one ride per filling (first host wins)
        const hb = geo.boxByFid[edge.hostFid], fb = geo.boxByFid[edge.fillingFid];
        if (!hb || !fb) continue;                                        // no honest pre-state → leave the engine's view alone
        const r = edge.propagate(byFid[edge.hostFid], geo);
        if (r === null) { if (edge.refusal) out.refusals.push(edge.refusal); continue; }
        ridden[edge.fillingFid] = 1; strip[edge.fillingFid] = 1;
        const d = r.dependentDeltas[0];
        if (Math.abs(d.dx) > 1e-12 || Math.abs(d.dy) > 1e-12 || Math.abs(d.dz) > 1e-12) out.riders.push(d);
        else out.held.push(edge.fillingFid);
        if (!firstScaleLabel && /→/.test(r.dimLabel)) firstScaleLabel = r.dimLabel.split(' · ')[0];
      }
      if (Object.keys(strip).length) out.commands = commands.filter(c => !(c && c.featureId != null && strip[c.featureId]));
      // abuts proposals: image every commanded box + rider through the fold, ask each AbutsEdge (report-only)
      if (this.edges.some(e => e instanceof AbutsEdge)) {
        const after = Object.assign({}, geo.boxByFid), moved = [];
        Object.keys(byFid).forEach(f => { if (geo.boxByFid[f] && !strip[f]) { after[f] = RelationEdge.foldBox(geo.boxByFid[f], byFid[f]); moved.push(+f); } });
        out.riders.forEach(r => { const b = geo.boxByFid[r.featureId]; if (b) { after[r.featureId] = RelationEdge.foldBox(b, [{ action: 'TRANSLATE', axis: 'x', delta: r.dx }, { action: 'TRANSLATE', axis: 'y', delta: r.dy }, { action: 'TRANSLATE', axis: 'z', delta: r.dz }]); moved.push(r.featureId); } });
        for (const edge of this.edges) {
          if (!(edge instanceof AbutsEdge)) continue;
          const p = edge.propagate({ before: geo.boxByFid, after, moved });
          if (p) out.proposals.push(p.dependentDeltas[0]);
        }
      }
      if (firstScaleLabel) labels.push(firstScaleLabel);
      if (out.held.length) labels.push(out.held.length + ' held');
      if (out.riders.length) labels.push(out.riders.length + ' ride');
      if (out.refusals.length) labels.push('REFUSED #' + out.refusals.map(r => r.fillingFid).join(',#'));
      if (out.proposals.length) labels.push(out.proposals.length + ' abuts gap');
      out.dimLabel = labels.join(' · ');
      return out;
    }
  }

  return { RelationEdge, HostFillEdge, AbutsEdge, DagevuEngine, MODES, FIT_TOL };
});
