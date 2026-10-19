#!/usr/bin/env node
// ⚠ DO NOT REMOVE — foundation lane F5 step 1 (prompts/DXF2BIM_FOUNDATION_LANE.md §5). READ-ONLY. Measures how much geometry is stored more than once across the databases that all key meshes by `geometry_hash`: the compiler's component_library.db, the Modeller/Viewer per-building `_geo.db` files, the buildings' `_extracted.db` files (they embed `component_geometries` too) and the DXF2BIM library shards (index.json `geometry_shard`).
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tools/mesh_overlap.js <out.json> <db or dir>... [--shards <index.json>]      (a directory = every *.db inside it; a db without `component_geometries(geometry_hash, vertices, faces)` is reported and skipped)
// Output: per source {hashes, bytes (vertices+faces blobs)}, the union, the bytes if every distinct hash were stored once, the saving, the pairwise overlap (top pairs) and the hashes that sit in the most sources. Nothing is written except <out.json>.
'use strict';
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), out = args.shift(), srcs = []; let shards = null;
for (let i = 0; i < args.length; i++) { if (args[i] === '--shards') { shards = args[++i]; continue; } const p = args[i]; if (fs.statSync(p).isDirectory()) fs.readdirSync(p).filter(f => f.endsWith('.db')).sort().forEach(f => srcs.push(path.join(p, f))); else srcs.push(p); }
const D = require('better-sqlite3'), rows = [], per = {};   // per[source] = Map hash -> bytes
for (const f of srcs) {
  const name = path.basename(path.dirname(f)) + '/' + path.basename(f); let d;
  try { d = new D(f, { readonly: true }); } catch (e) { rows.push({ source: name, skipped: 'cannot open: ' + e.message.slice(0, 60) }); continue; }
  const has = d.prepare("select 1 from sqlite_master where type='table' and name='component_geometries'").get();
  if (!has) { rows.push({ source: name, skipped: 'no component_geometries table' }); d.close(); continue; }
  const m = new Map(); for (const r of d.prepare('select geometry_hash h, coalesce(length(vertices),0)+coalesce(length(faces),0) b from component_geometries').iterate()) if (r.h != null) m.set(String(r.h), (m.get(String(r.h)) || 0) + r.b);
  per[name] = m; rows.push({ source: name, file_bytes: fs.statSync(f).size, hashes: m.size, mesh_bytes: [...m.values()].reduce((a, b) => a + b, 0) }); d.close();
}
if (shards) { const ix = JSON.parse(require('zlib').gunzipSync ? (() => { const raw = fs.readFileSync(shards); try { return require('zlib').gunzipSync(raw).toString(); } catch (e) { return raw.toString(); } })() : fs.readFileSync(shards, 'utf8')); const m = new Map(); Object.keys(ix.geometry_shard || {}).forEach(h => m.set(h, 0)); per['dxf2bim/library shards (hashes only; bytes in 190 shard files)'] = m; rows.push({ source: 'dxf2bim/library shards', hashes: m.size, mesh_bytes: null }); }
const names = Object.keys(per), union = new Map(), where = new Map();
names.forEach(n => per[n].forEach((b, h) => { if (!union.has(h)) union.set(h, b); (where.get(h) || where.set(h, []).get(h)).push(n); }));
const asStored = names.reduce((a, n) => a + [...per[n].values()].reduce((x, y) => x + y, 0), 0), once = [...union.values()].reduce((a, b) => a + b, 0);
const pairs = []; for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { let c = 0; const [a, b] = per[names[i]].size < per[names[j]].size ? [per[names[i]], per[names[j]]] : [per[names[j]], per[names[i]]]; a.forEach((_, h) => { if (b.has(h)) c++; }); if (c) pairs.push({ a: names[i], b: names[j], shared: c, of_smaller: +(c / Math.min(per[names[i]].size, per[names[j]].size)).toFixed(3) }); }
pairs.sort((x, y) => y.shared - x.shared);
const multi = [...where.values()].filter(v => v.length > 1).length, dist = {}; where.forEach(v => { dist[v.length] = (dist[v.length] || 0) + 1; });
const res = { measured: new Date().toISOString().slice(0, 10), sources: rows, distinct_hashes: union.size, total_hash_rows: [...where.values()].reduce((a, v) => a + v.length, 0), hashes_in_more_than_one_source: multi, sources_per_hash: dist, mesh_bytes_as_stored: asStored, mesh_bytes_if_stored_once: once, saving_bytes: asStored - once, saving_pct: asStored ? +(100 * (asStored - once) / asStored).toFixed(1) : 0, top_pairs: pairs.slice(0, 15) };
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log('§MESH_OVERLAP sources=' + names.length + ' distinct=' + res.distinct_hashes + ' rows=' + res.total_hash_rows + ' multi=' + multi + ' as_stored=' + (asStored / 1e6).toFixed(1) + 'MB once=' + (once / 1e6).toFixed(1) + 'MB saving=' + res.saving_pct + '%');
