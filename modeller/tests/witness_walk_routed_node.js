#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — W-WALK-ROUTED-NODE. SCOPE: bim-compiler prompts/MODELLER_MASTER.md §G1 SPEC, G1(a).
// ISSUE IT EXPOSES: does a disc walk on an imported ARC+STR file route anything on the page's own path? A bare dwWalk in
// node without routewalker.js always reports 0 chains, which says nothing about the product.
// Usage: WALK_DB=<db> WALK_NAME=<name> node witness_walk_routed_node.js [DISC ...]   (default ACMV FP).
// Read the log after every run; the exit code is not the evidence. Verdicts: PASS / FAIL / NO-OP / INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const H = require('./walk_node_harness.js');
const DB = process.env.WALK_DB || path.join(__dirname, '..', '..', 'buildings', 'Duplex_extracted.db');
const NAME = process.env.WALK_NAME || path.basename(DB).replace(/(_extracted)?\.db$/, '');
const DISCS = process.argv.slice(2).length ? process.argv.slice(2) : ['ACMV', 'FP'];
let pass = 0, fail = 0;
function chk(id, ok, detail) { console.log('§WALK-ROUTED ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + detail); if (ok) pass++; else fail++; }
const sha = b => crypto.createHash('sha1').update(b).digest('hex').slice(0, 12);

(async () => {
  if (!fs.existsSync(DB)) { console.log('§WALK-ROUTED INCONCLUSIVE db absent: ' + NAME); process.exit(0); }
  const SQL = await initSqlJs();
  const raw = fs.readFileSync(DB), before = sha(raw);
  const stack = await H.loadStack(SQL);
  if (!stack.rwReady || !global._rwDb) { console.log('§WALK-ROUTED INCONCLUSIVE routing engine did not load, nothing judged'); process.exit(0); }
  const pat = global._rwDb.exec('SELECT discipline,count(*) FROM ad_mep_pattern GROUP BY 1')[0].values;
  chk('W1 engine loaded', pat.length > 0, 'patterns=' + JSON.stringify(pat));
  H.openBuildingRules(SQL, stack, NAME);

  const avoid = [];
  for (const disc of DISCS) {
    // RED CONTROL: the engine switched off must reproduce the baseline's refusal, or this witness cannot see the engine at all.
    global._rwReady = false;
    const red = H.walkLive(SQL, stack, disc, new Uint8Array(raw), NAME, avoid);
    global._rwReady = true;
    const w = H.walkLive(SQL, stack, disc, new Uint8Array(raw), NAME, avoid);
    const segs = w.chainSegs || [];
    console.log('§WALK-ROUTED ' + disc + ' mode=' + (w.mode || (w.schedule ? 'schedule' : 'legacy')) + ' placed=' + w.placed + ' chainSegs=' + segs.length +
      ' chainByRule=' + JSON.stringify(w.chainByRule || []));
    chk('W2 ' + disc + ' red control routes 0 with the engine off', !((red.chainSegs || []).length), 'engineOff chainSegs=' + (red.chainSegs || []).length);
    if (!w.placed) { console.log('§WALK-ROUTED ' + disc + ' INCONCLUSIVE 0 placed: ' + (w.reason || 'no reason')); continue; }
    chk('W3 ' + disc + ' routing leaves placements unchanged', red.placed === w.placed, 'engineOff=' + red.placed + ' engineOn=' + w.placed);
    if (!segs.length) { console.log('§WALK-ROUTED ' + disc + ' NO-OP 0 chains on this path, see the §WALK-PATTERN line above'); fail++; continue; }
    // Each pattern run must end where the walk put a fixture or a corridor waypoint, never at a free point.
    const key = a => a.map(v => (+v).toFixed(3)).join(',');
    const fixtures = new Set(w.placements.map(p => key([p.x, p.y])));
    const j = (w.patternBridge && w.patternBridge.anchorCounts) || {};
    const onFixture = segs.filter(s => fixtures.has(key([s.to[0], s.to[1]])) || fixtures.has(key([s.from[0], s.from[1]]))).length;
    console.log('§WALK-ROUTED ' + disc + ' anchors fixture=' + j.fixture + ' junction=' + j.junction + ' runsTouchingFixture=' + onFixture + ' of ' + segs.length +
      ' seed=' + (w.patternBridge && w.patternBridge.seed ? (w.patternBridge.seed.ifc_class || '') + '@' + w.patternBridge.seed.storey : '-'));
    const lens = segs.map(s => Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2]));
    console.log('§WALK-ROUTED ' + disc + ' totalRunM=' + lens.reduce((a, b) => a + b, 0).toFixed(1) + ' maxRunM=' + Math.max.apply(null, lens).toFixed(1));
    chk('W4 ' + disc + ' routes', true, 'chainSegs=' + segs.length);
    // W6: runs are not a network. Union-find on run ends: a connected service reaches its seed in one component.
    // Issue it names: `chains>0` passes on a pile of unconnected stubs; this line must be able to say so.
    const k3 = p => p.map(v => (+v).toFixed(3)).join(','), par = {};
    const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    segs.forEach(s => { const a = k3(s.from), b = k3(s.to); if (par[a] == null) par[a] = a; if (par[b] == null) par[b] = b; par[find(a)] = find(b); });
    const size = {}; Object.keys(par).forEach(x => { const r = find(x); size[r] = (size[r] || 0) + 1; });
    const comps = Object.values(size).sort((a, b) => b - a), nodes = Object.keys(par).length;
    const sd = w.patternBridge && w.patternBridge.seed, onSeed = sd ? Object.keys(par).some(x => { const c = x.split(',').map(Number); return Math.hypot(c[0] - sd.x, c[1] - sd.y) < 1e-3; }) : false;
    const connected = comps[0] >= nodes * 0.9;
    console.log('§WALK-ROUTED ' + disc + ' network nodes=' + nodes + ' components=' + comps.length + ' largest=' + comps[0] + ' seedOnNetwork=' + onSeed + ' verdict=' + (connected ? 'CONNECTED' : 'WRONG unconnected stubs'));
    chk('W6 ' + disc + ' runs form one connected network', connected, 'largest component ' + comps[0] + ' of ' + nodes + ' nodes');
    w.placements.forEach(p => avoid.push(p));
  }
  chk('W5 source DB not written', sha(fs.readFileSync(DB)) === before, 'sha=' + before);
  console.log('§WALK-ROUTED VERDICT ' + NAME + ' pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§WALK-ROUTED ERROR ' + (e && e.stack || e)); process.exit(1); });
