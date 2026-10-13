// Adjustment layers for the editor log: op 'adjust' (engine op, validated here) and 'adjset' (replace the parameters). Spec: witness_log/HYPOTHESES.md "Level 2d" (AJ1-AJ10).
// Parameter rules are the doc schema's (doc/schema.js); the engine (stack.js applyAdjust) does the maths.
(function (root) {
  const node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, LO = node ? require('./layer_ops.js') : root.LayerOps;
  const KINDS = ['invert', 'levels', 'threshold', 'posterize', 'curves', 'hsl', 'gradmap'];
  const DEFAULTS = { invert: () => ({}), levels: () => ({ in_black: 0, in_white: 255, gamma_x100: 100, out_black: 0, out_white: 255 }), threshold: () => ({ level: 128 }), posterize: () => ({ levels: 4 }), curves: () => ({ points: [[0, 0], [255, 255]] }), hsl: () => ({ hue: 0, sat: 0, light: 0 }), gradmap: () => ({ stops: [[0, 0, 0, 0], [255, 255, 255, 255]] }) };
  function validate(kind, P) {
    if (!KINDS.includes(kind)) throw new Error('adjust: unknown kind ' + kind); const ints = (keys) => P && typeof P === 'object' && !Array.isArray(P) && Object.keys(P).sort().join() === [...keys].sort().join() && keys.every((k) => Number.isInteger(P[k])), inr = (k, a, b) => P[k] >= a && P[k] <= b;
    if (kind === 'invert') { if (!ints([])) throw new Error('adjust: invert takes no parameters'); }
    else if (kind === 'levels') { if (!ints(['in_black', 'in_white', 'gamma_x100', 'out_black', 'out_white'])) throw new Error('adjust: levels needs exactly in_black, in_white, gamma_x100, out_black, out_white (integers)'); if (!(inr('in_black', 0, 254) && inr('in_white', 1, 255) && P.in_black < P.in_white && inr('gamma_x100', 1, 999) && inr('out_black', 0, 255) && inr('out_white', 0, 255))) throw new Error('adjust: levels parameter out of range'); }
    else if (kind === 'threshold') { if (!ints(['level']) || !inr('level', 1, 255)) throw new Error('adjust: threshold needs an integer level 1..255'); }
    else if (kind === 'hsl') { if (!ints(['hue', 'sat', 'light']) || !inr('hue', -180, 180) || !inr('sat', -100, 100) || !inr('light', -100, 100)) throw new Error('adjust: hsl needs integer hue -180..180, sat -100..100, light -100..100'); }
    else if (kind === 'posterize') { if (!ints(['levels']) || !inr('levels', 2, 255)) throw new Error('adjust: posterize needs an integer levels 2..255'); }
    else if (kind === 'gradmap') { const st = P && P.stops; if (!P || Object.keys(P).join() !== 'stops' || !Array.isArray(st) || st.length < 2 || st.length > 8) throw new Error('adjust: gradmap needs stops: 2..8 [pos,r,g,b] integer arrays');
      for (let k = 0; k < st.length; k++) { const q = st[k]; if (!Array.isArray(q) || q.length !== 4 || !q.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) throw new Error('adjust: gradmap stops are integer [pos,r,g,b] in 0..255'); if (k > 0 && q[0] <= st[k - 1][0]) throw new Error('adjust: gradmap stop positions must strictly increase'); }
      if (st[0][0] !== 0 || st[st.length - 1][0] !== 255) throw new Error('adjust: gradmap stops must start at 0 and end at 255'); }
    else { const pts = P && P.points; if (!P || Object.keys(P).join() !== 'points' || !Array.isArray(pts) || pts.length < 2 || pts.length > 16) throw new Error('adjust: curves needs points: 2..16 [x,y] pairs'); let px = -1;
      for (const p of pts) { if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || !Number.isInteger(p[1]) || p[0] < 0 || p[0] > 255 || p[1] < 0 || p[1] > 255) throw new Error('adjust: curve points are integer [x,y] in 0..255'); if (p[0] <= px) throw new Error('adjust: curve x must be strictly increasing'); px = p[0]; } }
  }
  const clone = (P) => JSON.parse(JSON.stringify(P));
  function apply(st, o) {
    if (o.op === 'adjust') { if (st.L[o.id] || st.G[o.id] || st.A[o.id]) throw new Error('adjust: id ' + o.id + ' already used'); validate(o.kind, o.params); if (!(typeof o.opacity === 'number' && o.opacity >= 0 && o.opacity <= 1) || o.mask !== false) throw new Error('adjust: opacity 0..1 and mask false'); S.apply(st, { ...o, params: clone(o.params) }); LO.reflow(st); LO.retree(st); return true; }
    if (o.op === 'adjset') { const a = st.A[o.id]; if (!a) throw new Error('adjset: unknown adjustment ' + o.id); validate(a.kind, o.params); a.params = clone(o.params); return true; }
    return false;
  }
  function label(o, kind) { const P = o.params; if (kind === 'curves') return 'Adjust curves ' + o.id + ': ' + P.points.length + ' points'; if (kind === 'levels') return 'Adjust levels ' + o.id + ': in ' + P.in_black + '-' + P.in_white + ', gamma ' + (P.gamma_x100 / 100) + ', out ' + P.out_black + '-' + P.out_white; if (kind === 'threshold') return 'Adjust threshold ' + o.id + ': ' + P.level; if (kind === 'hsl') return 'Adjust hue/saturation ' + o.id + ': hue ' + P.hue + ', sat ' + P.sat + ', light ' + P.light; if (kind === 'gradmap') return 'Adjust gradient map ' + o.id + ': ' + P.stops.length + ' stops'; if (kind === 'posterize') return 'Adjust posterize ' + o.id + ': ' + P.levels + ' levels'; return 'Adjust ' + o.id; }
  const api = { apply, validate, DEFAULTS, KINDS, label, clone };
  if (node) module.exports = api; else root.AdjustOps = api;
})(this);
