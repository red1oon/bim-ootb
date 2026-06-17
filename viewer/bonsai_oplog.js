// bonsai_oplog.js — Bonsai feature tree = an ordered op-log; geometry is a FOLD over it.
// prompts/BONSAI_KERNEL_RESEARCH.md Item 2 leg 3 (op-log-as-feature-tree + history replay). This is
// the in-viewer expression of the doctrine proven by W-KERNEL-SIGNED: the op-log is the truth, the
// rendered solids are a pure deterministic fold of the chain. A history scrubber replays ops[0..k].
// (Riding the SIGNED kernel_ops.commitGroup in-viewer is a leg-3b refinement; here the chain is the
//  same op-row shape, folded through the worker feature-tree pass.)
(function () {
  'use strict';
  const TAG = '§OPLOG';
  const OpLog = {
    rows: [], _seq: 0, _cursor: 0,

    clear() { this.rows = []; this._seq = 0; this._cursor = 0; },
    append(op) { if (op.id == null) op.id = ++this._seq; this.rows.push(op); this._cursor = this.rows.length; return op.id; },
    list() { return this.rows.slice(); },
    get length() { return this.rows.length; },
    get cursor() { return this._cursor; },

    // Commit a new feature: append to the log, then rebuild the scene from the WHOLE chain.
    async commit(op, opts) {
      const id = this.append(op);
      const r = await window.Bonsai.foldChainToScene(this.rows, opts);
      console.log(TAG + ' commit id=' + id + ' op=' + op.op_type + (op.parent != null ? ' parent=' + op.parent : '') +
        ' rows=' + this.rows.length + ' solids=' + r.solids + ' tris=' + r.triangleCount);
      return { id, ...r };
    },

    // History scrubber: rebuild from the first `upto` rows (0..length). Folding the same prefix is
    // byte-deterministic, so scrubbing back then forward returns identical geometry.
    async scrubTo(upto) {
      upto = Math.max(0, Math.min(upto, this.rows.length));
      this._cursor = upto;
      const r = await window.Bonsai.foldChainToScene(this.rows.slice(0, upto));
      console.log(TAG + ' scrub upto=' + upto + '/' + this.rows.length + ' solids=' + r.solids + ' tris=' + r.triangleCount);
      return r;
    }
  };

  window.Bonsai = window.Bonsai || {};
  window.Bonsai.oplog = OpLog;
  console.log(TAG + ' module loaded');
})();
