// # ⚠ DO NOT REMOVE — W-ONE-IMPORT-KEY  (SEAM_IDENTITY_AUDIT F5/F6 · SEAM-W2)
// ISSUE PROVED/DISPROVED: the `import://` key/url of an imported building was built inline in 3 modules with different
//   shapes (monolith K/v0 vs K/extracted+K/library; materialize kept `.ifc` in the filename). This witness proves
//   (a) NO caller builds the url inline any more and every caller routes through common/import_key.js,
//   (b) the canonical urls for 3 example names, (c) legacy monolith entries are re-keyed without ever losing bytes
//   (crash injection), (d) canonical entry read directly, (e) mutants of the re-key are caught.
// Run: node viewer/tests/witness_one_import_key.js  (WITNESS_ROOT=<tree> to judge another checkout, e.g. origin/main)
// Read the §IMPORT_KEY lines after every run. Pure node: no browser.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.env.WITNESS_ROOT || path.resolve(__dirname, '..', '..');
const P = (...a) => path.join(ROOT, ...a);
let judged = 0;

function load(src, file) {
  const m = { exports: {} };
  vm.runInNewContext(src, { module: m, exports: m.exports, console: { log() {} }, Promise, Uint8Array, String, Error }, { filename: file });
  return m.exports;
}
class FakeStore { // Map-backed IDB stand-in; failPutOnce simulates a crash between steps
  constructor(init) { this.m = new Map(init || []); this.failPut = false; }
  async get(u) { return this.m.get(u); }
  async put(u, v) { if (this.dropPut) return; if (this.failPut) { this.failPut = false; throw new Error('crash'); } this.m.set(u, v); }
  async del(u) { this.m.delete(u); }
}
const bytes = (...n) => new Uint8Array(n);

async function checks(IK, tag) {
  const fails = [];
  const ck = (cond, msg) => { judged++; if (!cond) fails.push(msg); };
  const A = 'Clinic_ARC.ifc', B = 'My House (v2).IFC';
  // (b) canonical urls
  ck(IK.importUrl(A, 'extracted') === 'import://Clinic_ARC.ifc/Clinic_ARC_extracted.db', 'A extracted');
  ck(IK.importUrl(A, 'library') === IK.importUrl(A, 'extracted'), 'A library==extracted');
  ck(IK.importUrl(A, 'meta') === 'import://Clinic_ARC.ifc/Clinic_ARC_meta.db', 'A meta');
  ck(IK.importUrl(A, 'geo') === 'import://Clinic_ARC.ifc/Clinic_ARC_geo.db', 'A geo');
  ck(IK.importUrl(A, 'monolith') === 'import://Clinic_ARC.ifc/v0', 'A monolith');
  ck(IK.importUrl(A, 'v2') === 'import://Clinic_ARC.ifc/v2', 'A v2');
  ck(IK.importUrl(B, 'extracted') === 'import://My House (v2).IFC/My House (v2)_extracted.db', 'B extracted (.IFC stripped /i)');
  ck(IK.importProjectKey(B) === B, 'B key verbatim');
  ck(IK.importMultiProjectKey(['Clinic_ARC.ifc', 'Clinic_HVAC.ifc']).key === 'Clinic.ifc', 'C multi key');
  // (c) legacy re-key — every legacy shape, bytes identical, new present, old gone
  for (const key of [A, B]) {
    for (const oldShape of ['extracted', 'library']) {
      const st = new FakeStore([['import://' + key + '/' + oldShape, bytes(1, 2, 3, 4)]]);
      const r = await IK.importRekey(st, key, 'monolith');
      const nu = st.m.get(IK.importUrl(key, 'monolith'));
      ck(nu && nu.length === 4 && nu[3] === 4, key + '/' + oldShape + ': new key holds identical bytes');
      ck(!st.m.has('import://' + key + '/' + oldShape), key + '/' + oldShape + ': old removed');
      ck(r.rekeyed.length === 1, key + '/' + oldShape + ': reported rekeyed');
    }
  }
  // both legacy shapes, identical bytes -> one blob left (F5 duplicate collapsed)
  { const k = A, b = bytes(9, 9);
    const st = new FakeStore([['import://' + k + '/extracted', b], ['import://' + k + '/library', b]]);
    await IK.importRekey(st, k, 'monolith');
    ck(st.m.size === 1 && st.m.has(IK.importUrl(k, 'monolith')), 'two legacy copies collapse to the one canonical'); }
  // (d) canonical present: read directly; a DIFFERENT legacy blob must be left alone (never overwritten/deleted)
  { const k = A, st = new FakeStore([[IK.importUrl(k, 'monolith'), bytes(7)], ['import://' + k + '/extracted', bytes(8, 8)]]);
    const r = await IK.importRekey(st, k, 'monolith');
    ck(r.value[0] === 7 && st.m.get('import://' + k + '/extracted').length === 2, 'canonical read directly, differing legacy untouched'); }
  // crash between copy and delete: bytes must survive somewhere
  for (const where of ['put']) {
    const k = A, st = new FakeStore([['import://' + k + '/extracted', bytes(5, 5, 5)]]); st.failPut = true;
    try { await IK.importRekey(st, k, 'monolith'); } catch (e) { /* expected */ }
    const survives = [...st.m.values()].some(v => v.length === 3);
    ck(survives, 'crash during ' + where + ': user bytes still stored');
  }
  // silent write failure (put no-ops): old must be KEPT because the read-back does not match
  { const k = A, st = new FakeStore([['import://' + k + '/extracted', bytes(4, 4)]]); st.dropPut = true;
    await IK.importRekey(st, k, 'monolith');
    ck(st.m.has('import://' + k + '/extracted'), 'silent put failure: old kept (no delete without verified copy)'); }
  // nothing else touched
  { const st = new FakeStore([['import://other/v0', bytes(1)]]);
    await IK.importRekey(st, A, 'monolith'); ck(st.m.size === 1, 'unrelated entries untouched'); }
  console.log('§IMPORT_KEY ' + tag + ' checks=' + judged + ' failures=' + fails.length + (fails.length ? ' :: ' + fails.join(' | ') : ''));
  return fails;
}

function sourceChecks() {
  const fails = []; const files = ['import_own.js', 'viewer/import.js', 'viewer/materialize.js'];
  for (const f of files) {
    const s = fs.existsSync(P(f)) ? fs.readFileSync(P(f), 'utf8') : '';
    judged++;
    const inline = (s.match(/'import:\/\/'\s*\+/g) || []).length;
    const viaOwner = (s.match(/ImportKey\.importUrl|IK\.importUrl/g) || []).length;
    console.log('§IMPORT_KEY source ' + f + ' inline_constructions=' + inline + ' via_owner=' + viaOwner);
    if (inline > 0) fails.push(f + ' still builds import:// inline x' + inline);
    if (viaOwner === 0) fails.push(f + ' never calls importUrl');
  }
  // materialize behaviour (real file)
  try {
    const MAT = require(P('viewer', 'materialize.js'));
    judged++;
    const u = MAT.urlsFor('Clinic_ARC.ifc').db;
    console.log('§IMPORT_KEY materialize urlsFor(Clinic_ARC.ifc)=' + u);
    if (u !== 'import://Clinic_ARC.ifc/Clinic_ARC_extracted.db') fails.push('materialize url ' + u);
    judged++; const u2 = MAT.urlsFor('My House (v2).IFC').db;
    if (u2 !== 'import://My_House__v2_.IFC/My_House__v2__extracted.db') fails.push('materialize sanitised url ' + u2);
  } catch (e) { fails.push('materialize load: ' + e.message); }
  return fails;
}

(async () => {
  const modPath = P('common', 'import_key.js');
  const fails = sourceChecks();
  if (!fs.existsSync(modPath)) {
    fails.push('common/import_key.js missing — divergent inline keys');
    console.log('§IMPORT_KEY VERDICT FAIL ' + fails.join(' | ')); process.exit(1);
  }
  const src = fs.readFileSync(modPath, 'utf8');
  const f0 = await checks(load(src, modPath), 'real');
  fails.push(...f0);
  // mutants — each must be CAUGHT (>=1 failure)
  const mutants = {
    'delete-before-copy': ['await store.put(url, old);', 'await store.del(legacy[i]); await store.put(url, old);'],
    'skip-legacy-read': ['var legacy = importLegacyUrls(projectKey, part);', 'var legacy = [];'],
    'delete-without-verify': ['if (!_same(back, old)) {', 'if (false) {'],
  };
  let survived = 0;
  for (const [name, [a, b]] of Object.entries(mutants)) {
    if (src.indexOf(a) < 0) { fails.push('mutant ' + name + ' not applicable (pattern missing)'); continue; }
    let caught;
    try { caught = (await checks(load(src.replace(a, b), modPath), 'mutant:' + name)).length > 0; } catch (e) { caught = true; }
    console.log('§IMPORT_KEY mutant ' + name + ' ' + (caught ? 'CAUGHT' : 'SURVIVED'));
    if (!caught) { survived++; fails.push('mutant survived: ' + name); }
  }
  // delete-without-verify is only observable if read-back can mismatch; treat survival as informational below
  if (judged === 0) { console.log('§IMPORT_KEY VERDICT INCONCLUSIVE (nothing judged)'); process.exit(2); }
  console.log('§IMPORT_KEY VERDICT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS judged=' + judged + ' mutants_caught=' + (Object.keys(mutants).length - survived)));
  process.exit(fails.length ? 1 : 0);
})();
