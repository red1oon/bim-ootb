// Fixed 12-op log for S3 (selection-free behaviour must not change). Pure data + a node-side fold with the pre-selection engine path.
const r = (x) => Math.round(x * 100) / 100;
const pts = (a, b, n = 6) => Array.from({ length: n }, (_, i) => [r(a[0] + (b[0] - a[0]) * i / (n - 1) + (i % 2) * 7), r(a[1] + (b[1] - a[1]) * i / (n - 1) - (i % 3) * 5)]);
module.exports = [
  { op: 'layer', id: 0, mode: 'normal', opacity: 1, mask: false }, { op: 'fill', layer: 0, c: [1, 1, 1], a: 1 }, { op: 'layer', id: 1, mode: 'normal', opacity: 1, mask: false },
  { op: 'stroke', layer: 1, kind: 'hard', pts: pts([20, 30], [200, 150]), r: 14, c: [0.9, 0.2, 0.1], a: 1 },
  { op: 'stroke', layer: 1, kind: 'soft', pts: pts([30, 200], [220, 40]), r: 22, c: [0.1, 0.3, 0.9], a: 0.8 },
  { op: 'layer', id: 2, mode: 'normal', opacity: 1, mask: false }, { op: 'set', layer: 2, mode: 'multiply' },
  { op: 'stroke', layer: 2, kind: 'hard', pts: pts([100, 20], [120, 230]), r: 30, c: [0.2, 0.8, 0.3], a: 1 },
  { op: 'smudge', layer: 1, pts: pts([40, 60], [180, 140]), r: 18, s: 0.6 },
  { op: 'stroke', layer: 1, kind: 'blur', pts: pts([60, 100], [200, 120]), r: 20, s: 0.7 },
  { op: 'stroke', layer: 1, kind: 'erase', pts: pts([90, 90], [130, 160]), r: 10, c: [0, 0, 0], a: 1 },
  { op: 'set', layer: 1, opacity: 0.85 },
];
