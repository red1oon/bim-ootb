// dxf_table_fixture.js — a ruled block as DXF entities, for the table witnesses. xs left to right, ys top to bottom, cells { 'r,c': text }, noV { 'r,e': 1 } = no vertical at edge e in row r, noH { 'b,c': 1 } = no rule under row b in column c.
'use strict';
function block(xs, ys, cells, noV, noH, h) {
  const E = [], line = (a, b, c, d) => E.push({ type: 'LINE', vertices: [{ x: a, y: b }, { x: c, y: d }] }); noV = noV || {}; noH = noH || {}; h = h || 3;
  for (let r = 0; r < ys.length - 1; r++) for (let e = 0; e < xs.length; e++) if (!noV[r + ',' + e]) line(xs[e], ys[r], xs[e], ys[r + 1]);
  for (let b = 0; b < ys.length; b++) for (let c = 0; c < xs.length - 1; c++) if (!noH[(b - 1) + ',' + c]) line(xs[c], ys[b], xs[c + 1], ys[b]);
  Object.keys(cells).forEach(k => { const [r, c] = k.split(',').map(Number); E.push({ type: 'MTEXT', text: cells[k], height: h, attachmentPoint: 5, position: { x: (xs[c] + xs[c + 1]) / 2, y: (ys[r] + ys[r + 1]) / 2 }, handle: 'H' + k }); });
  return E;
}
const rowsAt = (top, n) => Array.from({ length: n + 1 }, (_, i) => top - i * 10);
module.exports = { block, rowsAt };
