// History for the editor log: amend (re-edit a past stroke), labels, share-as-link, fingerprint. Spec: witness_log/HYPOTHESES.md "Level 1b" (A1-A3, R1-R2, V1, L1-L2).
(function (root) {
  const node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, IO = node ? require('./img_ops.js') : root.ImgOps;
  const KEYS = { hard: ['c', 'a', 'r'], soft: ['c', 'a', 'r'], erase: ['c', 'a', 'r'], blur: ['s', 'r'], smudge: ['s', 'r'] };
  const inR = (v, lo, hi, loEx) => typeof v === 'number' && isFinite(v) && (loEx ? v > lo : v >= lo) && v <= hi;
  function checkSet(t, set) {
    const k = t.op === 'smudge' ? 'smudge' : t.kind; if (!KEYS[k]) throw new Error('amend: target kind ' + k + ' cannot be amended');
    if (!set || typeof set !== 'object' || !Object.keys(set).length) throw new Error('amend: empty set');
    for (const key of Object.keys(set)) { if (!KEYS[k].includes(key)) throw new Error('amend: key "' + key + '" not allowed for ' + k); const v = set[key];
      if (key === 'c' && !(Array.isArray(v) && v.length === 3 && v.every((x) => inR(x, 0, 1)))) throw new Error('amend: c must be 3 numbers in [0,1]');
      if (key === 'a' && !inR(v, 0, 1, true)) throw new Error('amend: a must be in (0,1]'); if (key === 's' && !inR(v, 0, 1, true)) throw new Error('amend: s must be in (0,1]'); if (key === 'r' && !inR(v, 1, 200)) throw new Error('amend: r must be in [1,200]'); }
  }
  // pure: returns the list with every amended target replaced by {...target, ...merged sets}; amend entries stay (they are no-ops when folded)
  function expand(list) {
    const patch = new Map();
    list.forEach((o, idx) => { if (o.op !== 'amend') return; if (!Number.isInteger(o.i) || o.i < 0 || o.i >= idx) throw new Error('amend: target index ' + o.i + ' must be an earlier entry'); const t = list[o.i]; if (!t || (t.op !== 'stroke' && t.op !== 'smudge')) throw new Error('amend: entry ' + o.i + ' is not a stroke or smudge'); checkSet(t, o.set); patch.set(o.i, { ...(patch.get(o.i) || {}), ...o.set }); });
    return patch.size ? list.map((o, i) => (patch.has(i) ? { ...o, ...patch.get(i) } : o)) : list;
  }
  const apply = (st, o) => o.op === 'amend';
  const pct = (v) => Math.round(v * 100) + '%', hex = (c) => '#' + c.map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  function label(o) {
    switch (o.op) {
      case 'layer': return o.id === 0 ? 'Background layer' : 'Add layer ' + o.id; case 'fill': return 'Fill layer ' + o.layer; case 'set': return 'Layer ' + o.layer + (o.opacity !== undefined ? ' opacity ' + pct(o.opacity) : '') + (o.mode ? ' mode ' + o.mode : '');
      case 'stroke': return ({ hard: 'Hard brush', soft: 'Soft brush', erase: 'Eraser', blur: 'Blur brush' })[o.kind] + ' on layer ' + o.layer + ', size ' + o.r + (o.c && o.kind !== 'blur' && o.kind !== 'erase' ? ', ' + hex(o.c) : '') + ', ' + o.pts.length + ' pts';
      case 'smudge': return 'Smudge on layer ' + o.layer + ', size ' + o.r + ', ' + o.pts.length + ' pts'; case 'blur': return 'Blur layer ' + o.layer;
      case 'del': return 'Delete layer ' + o.layer; case 'mv': return 'Move layer ' + o.layer + ' to ' + o.to; case 'vis': return (o.v ? 'Show' : 'Hide') + ' layer ' + o.layer; case 'name': return 'Rename layer ' + o.layer + ' to ' + o.name;
      case 'sel': return o.kind === 'rect' || o.kind === 'ellipse' ? 'Select ' + o.kind + ' ' + (o.x1 - o.x0) + 'x' + (o.y1 - o.y0) : o.kind === 'invert' ? 'Invert selection' : 'Clear selection';
      case 'img': return 'Add photo as layer ' + o.id; case 'amend': return 'Re-edit entry ' + (o.i + 1) + ' (' + Object.keys(o.set).join(', ') + ')'; default: return o.op; }
  }
  const head = (ops) => (ops.length ? S.chain(ops)[ops.length - 1].h : '0'.repeat(64));
  const b64u = { enc: (u8) => IO.b64.enc(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: (s) => IO.b64.dec(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)) };
  async function pipe(u8, T) { const s = new T('deflate-raw'), w = s.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(s.readable).arrayBuffer()); }
  async function makeLink(W, ops) { if (ops.some((o) => o.op === 'img')) throw new Error('photos make the link too large: use Save'); const raw = new TextEncoder().encode(JSON.stringify({ W, ops })); return '#v1=' + b64u.enc(await pipe(raw, CompressionStream)) + '&h=' + head(ops).slice(0, 16); }
  async function parseLink(hash) {
    const m = /^#v1=([A-Za-z0-9_-]+)&h=([0-9a-f]{16})$/.exec(hash || ''); if (!m) throw new Error('not a painting link');
    let j; try { j = JSON.parse(new TextDecoder().decode(await pipe(b64u.dec(m[1]), DecompressionStream))); } catch (e) { throw new Error('the link is damaged'); }
    if (!j || !Array.isArray(j.ops) || !Number.isInteger(j.W)) throw new Error('the link is damaged'); if (head(j.ops).slice(0, 16) !== m[2]) throw new Error('the link was altered (fingerprint mismatch)'); return j;
  }
  const api = { expand, apply, label, head, makeLink, parseLink, checkSet };
  if (node) module.exports = api; else root.HistoryOps = api;
})(this);
