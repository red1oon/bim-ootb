// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * op_upcaster.js — D2 REMEDY: schema_version per op + a read-time upcaster registry.
 *   Spec: prompts/D2_REMEDY_VERSIONING.md  ·  Register: docs/ProductionRisks.md D2  ·  Spike: spike_d2_versioning.js
 *   Prompted by Ludwikowski "Event Sourcing — what could possibly go wrong?" (events immutable + live forever).
 *
 * THE CONSTRAINT (measured by §SPIKE-D2): our op-log is SIGNED — op_hash = SHA-256(prev_hash | canonical(op))
 * and canonical INCLUDES JSON.stringify(parameters). So you can NEVER migrate by rewriting a stored op
 * (verifyChain → 'payload altered'). The ONLY legal migration is UPCAST-ON-READ: transform an old-shape op to
 * the current shape IN MEMORY, just before the reducer; the stored op is never touched, the chain stays valid.
 *
 * THE STRATEGY (forward-only, mirrors the append-only migration/*.sql sacred rule):
 *   - stamp every NEW op with `params._sv` = the current schema version for its op_type (a SIGNED fact —
 *     it's inside parameters, so it is hashed; an op's declared version is tamper-evident);
 *   - legacy ops with no `_sv` are version 1;
 *   - register upcasters version N → N+1 per op_type; upcast() chains them up to current at READ time;
 *   - an op from a FUTURE version this client doesn't know is REFUSED LOUDLY (throws), never silently misapplied.
 *
 *   ERP.OpUpcaster
 *     .SV_KEY                                  // '_sv'
 *     .setCurrent(opType, version)             // declare the current schema version for an op_type
 *     .currentOf(opType) -> version            // default 1
 *     .register(opType, fromVersion, fn)       // fn(params)->params : ONE step up (fromVersion → fromVersion+1)
 *     .stamp(opType, params) -> params'        // returns a COPY with _sv = currentOf(opType)
 *     .versionOf(params) -> version            // params._sv || 1 (legacy = 1)
 *     .supports(op) -> bool                    // can we upcast this op's version up to current?
 *     .upcast(op) -> op'                       // {op_type,parameters} → upcasted (THROWS D2_UNSUPPORTED if not)
 *     .upcastAll(ops) -> ops'                  // map upcast over a replayed op list (parameters → object)
 *     .commitVersioned(kernel, db, opType, params, …) -> opId   // stamp then kernel.commitOp (the write seam)
 *     .reset()                                 // clear registry (tests)
 *
 * §FALSIFIER: an upcasted fold whose result != the op's ORIGINAL effect = a reinterpretation of history (FAIL).
 *   A future-version op that folds SILENTLY instead of refusing = FAIL. Rewriting a stored op to migrate = FAIL
 *   (the chain breaks — that is the whole point; this module exists so you never need to).
 */
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ERP = root.ERP || {}; root.ERP.OpUpcaster = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {

  var SV_KEY = '_sv';
  var _current = {};                 // opType -> current schema version
  var _up = {};                      // opType -> { fromVersion -> fn }

  function currentOf(opType) { return _current[opType] || 1; }
  function setCurrent(opType, version) { _current[opType] = version; }
  function versionOf(params) { return (params && params[SV_KEY]) || 1; }

  function register(opType, fromVersion, fn) {
    if (typeof fn !== 'function') throw new Error('upcaster fn required');
    (_up[opType] = _up[opType] || {})[fromVersion] = fn;
    // a registered upcaster fromVersion→fromVersion+1 implies current is at least fromVersion+1
    if ((fromVersion + 1) > currentOf(opType)) _current[opType] = fromVersion + 1;
  }

  function stamp(opType, params) {
    var out = {}; for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) out[k] = params[k];
    out[SV_KEY] = currentOf(opType);
    return out;
  }

  // can we walk version → current via registered single-step upcasters? (and not from the future)
  function supports(op) {
    var p = _params(op);
    var v = versionOf(p), cur = currentOf(op.op_type);
    if (v > cur) return false;                                  // op from a newer schema than we know → refuse
    var steps = _up[op.op_type] || {};
    for (var n = v; n < cur; n++) if (typeof steps[n] !== 'function') return false;   // a missing rung → refuse
    return true;
  }

  function _params(op) {
    var p = op.parameters;
    return (typeof p === 'string') ? JSON.parse(p) : p;
  }

  function upcast(op) {
    if (!supports(op)) {
      var e = new Error('D2_UNSUPPORTED op_type=' + op.op_type + ' version=' + versionOf(_params(op)) +
        ' current=' + currentOf(op.op_type) + ' — refusing (client cannot frozen-replay this schema; update needed)');
      e.code = 'D2_UNSUPPORTED';
      console.log('§D2-REFUSE ' + e.message);
      throw e;
    }
    var p = _params(op), v = versionOf(p), cur = currentOf(op.op_type);
    var steps = _up[op.op_type] || {};
    for (var n = v; n < cur; n++) { p = steps[n](p); }           // chain N→N+1 up to current (in memory)
    p[SV_KEY] = cur;
    var out = {}; for (var k in op) out[k] = op[k]; out.parameters = p;   // stored op untouched; this is a COPY
    return out;
  }

  function upcastAll(ops) { return (ops || []).map(upcast); }

  // write seam — stamp the current version into params, then commit through the real kernel verb (no fork)
  function commitVersioned(kernel, db, opType, params, inputGuids, outputGuid, opUuid, ts) {
    return kernel.commitOp(db, opType, stamp(opType, params), inputGuids, outputGuid, opUuid, ts);
  }

  function reset() { _current = {}; _up = {}; }

  // install — make stamping the DEFAULT write seam: every kernel.commitOp/commitGroup now brands params._sv.
  // One line at app boot: ERP.OpUpcaster.install(window.KernelOps). Decoupled — the kernel only sees the fn.
  function install(kernel) {
    if (!kernel || typeof kernel.setVersionStamper !== 'function') {
      console.log('§OP_UPCASTER install SKIPPED — kernel has no setVersionStamper (update kernel_ops.js)');
      return false;
    }
    kernel.setVersionStamper(stamp);
    console.log('§OP_UPCASTER install OK — schema_version stamping is now the default write seam');
    return true;
  }

  console.log('§OP_UPCASTER_LOADED v1 (D2: schema_version stamp + read-time upcaster registry)');
  return { SV_KEY: SV_KEY, setCurrent: setCurrent, currentOf: currentOf, versionOf: versionOf,
    register: register, stamp: stamp, supports: supports, upcast: upcast, upcastAll: upcastAll,
    commitVersioned: commitVersioned, install: install, reset: reset };
}));
