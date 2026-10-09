// Content-addressed tile store for raster blobs (SQLite via sql.js). A blob (w*h*ch bytes) is split into tile x tile pieces, each stored once under the sha256 of its bytes;
// the blob id stays the sha256 of the WHOLE blob, so `raster` ops, hash chains and golden hashes are unaffected. Every read re-verifies tile hashes, tile sizes and the whole-blob hash.
(function (root) {
  const node = typeof require !== 'undefined';
  const DDL = 'CREATE TABLE IF NOT EXISTS tiles(id TEXT PRIMARY KEY, data BLOB NOT NULL); CREATE TABLE IF NOT EXISTS blobs(id TEXT PRIMARY KEY, w INTEGER, h INTEGER, ch INTEGER, tile INTEGER, manifest TEXT NOT NULL);';
  function open(SQL, opts = {}) {
    const T = opts.tile || 64, sha = opts.sha || (node ? require('../stack.js').sha256 : root.Stack.sha256), db = opts.bytes ? new SQL.Database(opts.bytes) : new SQL.Database(), cache = new Map();
    db.run(DDL);
    const one = (sql, p) => { const st = db.prepare(sql); st.bind(p); const r = st.step() ? st.getAsObject() : null; st.free(); return r; };
    const grid = (w, h, t) => ({ nx: Math.ceil(w / t), ny: Math.ceil(h / t) });
    const tileBytes = (bytes, w, h, ch, t, tx, ty) => { const x0 = tx * t, y0 = ty * t, tw = Math.min(t, w - x0), th = Math.min(t, h - y0), out = new Uint8Array(tw * th * ch);
      for (let r = 0; r < th; r++) out.set(bytes.subarray(((y0 + r) * w + x0) * ch, ((y0 + r) * w + x0 + tw) * ch), r * tw * ch); return out; };
    const api = {
      tile: T,
      putBlob(bytes, w, h, ch) {
        if (bytes.length !== w * h * ch) throw new Error('blob size ' + bytes.length + ' != ' + w + 'x' + h + 'x' + ch);
        const id = sha(bytes); if (one('SELECT id FROM blobs WHERE id=?', [id])) return { id, newTiles: 0, totalTiles: 0 };
        const { nx, ny } = grid(w, h, T), ids = []; let added = 0;
        for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) { const tb = tileBytes(bytes, w, h, ch, T, tx, ty), tid = sha(tb); ids.push(tid); db.run('INSERT OR IGNORE INTO tiles VALUES (?,?)', [tid, tb]); added += db.getRowsModified(); }
        db.run('INSERT INTO blobs VALUES (?,?,?,?,?,?)', [id, w, h, ch, T, JSON.stringify(ids)]); return { id, newTiles: added, totalTiles: ids.length };
      },
      has(id) { return !!one('SELECT id FROM blobs WHERE id=?', [id]); },
      readTile(tid, expectLen) { const r = one('SELECT data FROM tiles WHERE id=?', [tid]); if (!r) throw new Error('missing tile ' + tid.slice(0, 8)); const d = r.data;
        if (d.length !== expectLen) throw new Error('tile ' + tid.slice(0, 8) + ' has ' + d.length + ' bytes, expected ' + expectLen); if (sha(d) !== tid) throw new Error('tile ' + tid.slice(0, 8) + ' fails its hash (corrupt)'); return d; },
      meta(id) { const r = one('SELECT w,h,ch,tile,manifest FROM blobs WHERE id=?', [id]); if (!r) return null; const ids = JSON.parse(r.manifest), { nx, ny } = grid(r.w, r.h, r.tile);
        if (!Array.isArray(ids) || ids.length !== nx * ny) throw new Error('manifest of ' + id.slice(0, 8) + ' lists ' + (ids && ids.length) + ' tiles, expected ' + nx * ny); return { w: r.w, h: r.h, ch: r.ch, tile: r.tile, ids, nx, ny }; },
      getBlob(id) {
        if (cache.has(id)) return cache.get(id); const m = api.meta(id); if (!m) return undefined; const out = new Uint8Array(m.w * m.h * m.ch);
        for (let ty = 0; ty < m.ny; ty++) for (let tx = 0; tx < m.nx; tx++) { const x0 = tx * m.tile, y0 = ty * m.tile, tw = Math.min(m.tile, m.w - x0), th = Math.min(m.tile, m.h - y0), d = api.readTile(m.ids[ty * m.nx + tx], tw * th * m.ch);
          for (let r = 0; r < th; r++) out.set(d.subarray(r * tw * m.ch, (r + 1) * tw * m.ch), ((y0 + r) * m.w + x0) * m.ch); }
        if (sha(out) !== id) throw new Error('blob ' + id.slice(0, 8) + ' fails its whole-blob hash (tiles swapped or wrong)'); cache.set(id, out); return out;
      },
      get(id) { return api.getBlob(id); },   // Map-compatible for docfold / schema validation
      getRegion(id, x, y, rw, rh) {
        const m = api.meta(id); if (!m) throw new Error('unknown blob'); if (x < 0 || y < 0 || rw < 1 || rh < 1 || x + rw > m.w || y + rh > m.h) throw new Error('region outside blob');
        const out = new Uint8Array(rw * rh * m.ch); let tilesRead = 0;
        for (let ty = Math.floor(y / m.tile); ty <= Math.floor((y + rh - 1) / m.tile); ty++) for (let tx = Math.floor(x / m.tile); tx <= Math.floor((x + rw - 1) / m.tile); tx++) {
          const x0 = tx * m.tile, y0 = ty * m.tile, tw = Math.min(m.tile, m.w - x0), th = Math.min(m.tile, m.h - y0), d = api.readTile(m.ids[ty * m.nx + tx], tw * th * m.ch); tilesRead++;
          for (let r = Math.max(y, y0); r < Math.min(y + rh, y0 + th); r++) { const a = Math.max(x, x0), b = Math.min(x + rw, x0 + tw); out.set(d.subarray(((r - y0) * tw + (a - x0)) * m.ch, ((r - y0) * tw + (b - x0)) * m.ch), ((r - y) * rw + (a - x)) * m.ch); } }
        return { bytes: out, tilesRead };
      },
      stats() { const t = one('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(data)),0) AS b FROM tiles', []), b = one('SELECT COUNT(*) AS n FROM blobs', []); return { tiles: t.n, tileBytes: t.b, blobs: b.n }; },
      exportDb() { return db.export(); }, db,
    };
    return api;
  }
  const api = { open };
  if (node) module.exports = api; else root.TileStore = api;
})(this);
