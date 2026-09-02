// Is R14's 11.4% own-footprint walkability anomalous, or is the raster thin everywhere?
// Base rate: own-footprint walkable % for EVERY room, split by connected vs deg-0.
const fs = require('fs');
const WT = process.argv[2], DB = process.argv[3];
const initSqlJs = require(WT + '/viewer/lib/sql-wasm.js');
const RG = require(WT + '/common/room_graph.js');
(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(WT + '/viewer/lib/sql-wasm.wasm') });
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB)));
  const q = s => { try { const r = db.exec(s); return r.length ? r[0].values : []; } catch (e) { return []; } };
  const g = RG.buildGraph(q, { log: () => {} });
  const ctx = { rasters: g.rasters, roomRectsByStorey: g.roomRectsByStorey, corridorRectsByStorey: g.corridorRectsByStorey };
  const deg = {}; for (const e of g.edges) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; }

  // whole-storey walkable fraction, straight off the stored bitset
  console.log('storey'.padEnd(10) + 'cells'.padStart(9) + 'walkable'.padStart(10) + 'pct'.padStart(7));
  const storeyPct = {};
  for (const r of q('SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster')) {
    const [st, res, x0, y0, cols, rows, bits] = r;
    const buf = Buffer.from(bits);
    let on = 0; for (let i = 0; i < buf.length; i++) { let b = buf[i]; while (b) { on += b & 1; b >>= 1; } }
    const tot = cols * rows;
    storeyPct[st] = 100 * on / tot;
    console.log(st.padEnd(10) + String(tot).padStart(9) + String(on).padStart(10) + (100 * on / tot).toFixed(1).padStart(7));
  }

  const own = n => {
    let inside = 0, tot = 0;
    for (const rc of n.rects || []) {
      for (let x = rc.x0 + 0.125; x < rc.x1; x += 0.25) for (let y = rc.y0 + 0.125; y < rc.y1; y += 0.25) {
        tot++; if (RG.chordIllegalCount(ctx, n.storey, x, y, x, y) === 0) inside++;
      }
    }
    return tot ? 100 * inside / tot : NaN;
  };
  const rooms = g.nodes.filter(n => n.kind === 'room' && n.rects && n.rects.length);
  const con = [], d0 = [];
  for (const n of rooms) { const p = own(n); (deg[n.guid] ? con : d0).push({ n, p }); }
  const med = a => { const s = a.map(o => o.p).filter(v => v === v).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
  const mean = a => { const s = a.map(o => o.p).filter(v => v === v); return s.reduce((x, y) => x + y, 0) / Math.max(1, s.length); };
  console.log(`\n§RASTER_OWN connected n=${con.length} median=${med(con).toFixed(1)}% mean=${mean(con).toFixed(1)}%`);
  console.log(`§RASTER_OWN deg0      n=${d0.length} median=${med(d0).toFixed(1)}% mean=${mean(d0).toFixed(1)}%`);
  const below = con.filter(o => o.p < 30).length;
  console.log(`§RASTER_OWN connected_rooms_below_30pct=${below}/${con.length}`);
  d0.sort((a, b) => a.p - b.p);
  console.log('\ndeg-0 rooms by own-footprint walkability:');
  for (const o of d0) console.log('  ' + o.n.name.slice(0, 28).padEnd(29) + o.p.toFixed(1).padStart(7) + '%   storey=' + o.n.storey + ' (storey raster ' + (storeyPct[o.n.storey] || 0).toFixed(1) + '%)');
  // §PROVENANCE-INVARIANT, printed LAST so a log tail shows the verdict, not a room listing:
  // build_storey_walkable_raster.js unions every room rect into the bitset, so a raster built from
  // its own DB is 100% own-footprint walkable for EVERY room. Anything less proves foreign evidence.
  const worst = Math.min(...con.concat(d0).map(o => o.p).filter(v => v === v));
  const ok = worst >= 99.99;
  console.log(`\n§RASTER_PROVENANCE worst_room_own_footprint=${worst.toFixed(1)}% rooms=${con.length + d0.length} verdict=${ok ? 'PASS — raster belongs to this room set' : 'FAIL — FOREIGN raster, do not ship'}`);
  if (!ok) process.exitCode = 1;
})().catch(e => console.log('ERR ' + e.stack));
