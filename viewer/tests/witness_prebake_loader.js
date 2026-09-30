// Issue it proves: the §PREBAKE sidecar loader and recorder never break a page — missing (404), malformed JSON, wrong version and
// &prebake=0 all leave A._prebake null (compute path), a good file loads, and _prebakeRecord returns null when nothing was computed.
const fs = require('fs'), src = fs.readFileSync(require('path').join(__dirname, '..', 'scene.js'), 'utf8');
const a = src.indexOf('  A._prebakeFnv = function'), b = src.indexOf('  A._lightFieldByBuilding = async function');
const block = src.slice(a, b);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function run(resp, search) {
  const A = { DB_URL: '../buildings/Hospital_silent.db' }, logs = [];
  const ctx = { A, location: { search: search || '' }, performance: { now: () => 0 }, console: { log: s => logs.push(s), warn: s => logs.push(s) },
    fetch: async () => resp };
  new Function('A', 'location', 'performance', 'console', 'fetch', block).call(null, A, ctx.location, ctx.performance, ctx.console, ctx.fetch);
  await A._loadPrebake(); return { A, logs };
}
(async () => {
  let r = await run({ ok: false, status: 404 }); ok(r.A._prebake === null && /sidecar none/.test(r.logs.join()), '404 -> null, logged none');
  r = await run({ ok: true, json: async () => { throw new Error('bad json'); } }); ok(r.A._prebake === null && /failed/.test(r.logs.join()), 'malformed -> null, logged failed');
  r = await run({ ok: true, json: async () => ({ v: 2 }) }); ok(r.A._prebake === null && /bad format/.test(r.logs.join()), 'wrong version -> null');
  r = await run({ ok: true, json: async () => ({ v: 1, loadPath: { key: 'k' } }) }, '?prebake=0'); ok(r.A._prebake === null && /ignored/.test(r.logs.join()), '&prebake=0 -> ignored');
  r = await run({ ok: true, json: async () => ({ v: 1, created: 'x', loadPath: { key: 'k' } }) }); ok(r.A._prebake && r.A._prebake.loadPath.key === 'k' && /parts=\[loadPath\]/.test(r.logs.join()), 'good file loads, parts logged');
  ok(r.A._prebakeRecord() === null, 'nothing computed -> record null (no file written)');
  r.A._prebakeOut.portal = { key: 'p', inward: { a: [0, 1, 0] } }; const j = JSON.parse(r.A._prebakeRecord()); ok(j.v === 1 && j.portal.key === 'p', 'computed part -> record v1 with it');
  ok(r.A._prebakeFnv('abc') === r.A._prebakeFnv('abc') && r.A._prebakeFnv('abc') !== r.A._prebakeFnv('abd'), 'fnv stable + discriminates');
  console.log(fails ? 'VERDICT FAIL ' + fails : 'VERDICT PASS'); process.exit(fails ? 1 : 0);
})();
