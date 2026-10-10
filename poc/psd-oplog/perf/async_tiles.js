// Async tile put/get over the SAME SQLite schema as tiles/tilestore.js (which is not edited), hashing with WebCrypto in batches. Spec: HYPOTHESES.md "Browser sha256 speed" (S4-S6).
// Blob id = sha256 of the whole blob; tile id = sha256 of the tile bytes; manifest = JSON array of tile ids in row-major order: identical to the sync store.
(function (root) {
  const hex = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i++) s += (u[i] < 16 ? '0' : '') + u[i].toString(16); return s; };
  const sha = async (subtle, bytes) => hex(await subtle.digest('SHA-256', bytes));
  const tileBytes = (bytes, w, h, ch, t, tx, ty) => { const x0 = tx * t, y0 = ty * t, tw = Math.min(t, w - x0), th = Math.min(t, h - y0), out = new Uint8Array(tw * th * ch); for (let r = 0; r < th; r++) out.set(bytes.subarray(((y0 + r) * w + x0) * ch, ((y0 + r) * w + x0 + tw) * ch), r * tw * ch); return out; };
  const one = (db, sql, p) => { const st = db.prepare(sql); st.bind(p); const r = st.step() ? st.getAsObject() : null; st.free(); return r; };
  async function batched(subtle, arrays, batch = 256) { const out = new Array(arrays.length); for (let i = 0; i < arrays.length; i += batch) { const part = await Promise.all(arrays.slice(i, i + batch).map((a) => sha(subtle, a))); for (let j = 0; j < part.length; j++) out[i + j] = part[j]; } return out; }
  async function putBlobAsync(ts, subtle, bytes, w, h, ch) {
    const T = ts.tile, db = ts.db; if (bytes.length !== w * h * ch) throw new Error('blob size');
    const id = await sha(subtle, bytes); if (one(db, 'SELECT id FROM blobs WHERE id=?', [id])) return { id, newTiles: 0, totalTiles: 0 };
    const nx = Math.ceil(w / T), ny = Math.ceil(h / T), tiles = []; for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) tiles.push(tileBytes(bytes, w, h, ch, T, tx, ty));
    const ids = await batched(subtle, tiles); let added = 0; for (let i = 0; i < tiles.length; i++) { db.run('INSERT OR IGNORE INTO tiles VALUES (?,?)', [ids[i], tiles[i]]); added += db.getRowsModified(); }
    db.run('INSERT INTO blobs VALUES (?,?,?,?,?,?)', [id, w, h, ch, T, JSON.stringify(ids)]); return { id, newTiles: added, totalTiles: ids.length };
  }
  async function getBlobAsync(ts, subtle, id) {
    const m = ts.meta(id); if (!m) return undefined; const raw = [], exp = [];
    for (let ty = 0; ty < m.ny; ty++) for (let tx = 0; tx < m.nx; tx++) { const tw = Math.min(m.tile, m.w - tx * m.tile), th = Math.min(m.tile, m.h - ty * m.tile), tid = m.ids[ty * m.nx + tx], r = one(ts.db, 'SELECT data FROM tiles WHERE id=?', [tid]);
      if (!r) throw new Error('missing tile ' + tid.slice(0, 8)); if (r.data.length !== tw * th * m.ch) throw new Error('tile ' + tid.slice(0, 8) + ' has the wrong size'); raw.push(r.data); exp.push(tid); }
    const got = await batched(subtle, raw); for (let i = 0; i < got.length; i++) if (got[i] !== exp[i]) throw new Error('tile ' + exp[i].slice(0, 8) + ' fails its hash (corrupt)');
    const out = new Uint8Array(m.w * m.h * m.ch); for (let ty = 0; ty < m.ny; ty++) for (let tx = 0; tx < m.nx; tx++) { const x0 = tx * m.tile, y0 = ty * m.tile, tw = Math.min(m.tile, m.w - x0), th = Math.min(m.tile, m.h - y0), d = raw[ty * m.nx + tx]; for (let r = 0; r < th; r++) out.set(d.subarray(r * tw * m.ch, (r + 1) * tw * m.ch), ((y0 + r) * m.w + x0) * m.ch); }
    if ((await sha(subtle, out)) !== id) throw new Error('blob ' + id.slice(0, 8) + ' fails its whole-blob hash'); return out;
  }
  const api = { putBlobAsync, getBlobAsync, sha, batched };
  if (typeof module !== 'undefined') module.exports = api; else root.AsyncTiles = api;
})(this);
