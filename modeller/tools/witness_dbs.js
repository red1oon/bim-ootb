#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-WITNESS-DB (prompts/DXF2BIM_FOUNDATION_LANE.md §D79). Issue it proves or disproves: "the db-argument witnesses judge a model db built
// from the stated IFCs by the stated extractor" — not a db that vanished with /tmp at boot, nor one a branch switch of the compiler checkout silently changed.
// ONE recipe table; the extractor comes from a GIT REF of the compiler (written into the cache by content); each db carries a stamp (sha256 of its sources,
// the extractor files and the flags) and is rebuilt only when the stamp differs. The runner (modeller/tests/run_all_witnesses.js) reads the same table.
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tools/witness_dbs.js [--check] [--force] [--only NAME]
//   env: DXF_DB_DIR (default ~/.cache/dxf2bim/db) · BIMCOMPILER (default ~/bim-compiler) · WITNESS_DB_REF (default origin/master)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const BC = process.env.BIMCOMPILER || path.join(os.homedir(), 'bim-compiler');
const DIR = process.env.DXF_DB_DIR || path.join(os.homedir(), '.cache', 'dxf2bim', 'db');
const REF = process.env.WITNESS_DB_REF || 'origin/master';
const U = path.join(BC, 'internal', 'UNMERGED'), JKR = path.join(os.homedir(), 'Downloads', 'OPEN SOURCE BIM', 'IFC 4');
const JKR_AR = path.join(JKR, 'jkrAR25_5a_(BSktLLP_04K-4)_A1_w-02_(S)_250203a.ifc'), JKR_ST = path.join(JKR, 'jkrST25-5a_(BSktLLP_04K-4)_A1_w-02_(S)_251031.ifc');
// the recipes, as recorded in prompts/DXF2BIM_ARCHITECT_REVIEW.md (sessions 1-5): ifc = the ARC model, also = the STR model (its columns, + alsoClasses)
const TABLE = {
  DXARC: { ifc: path.join(BC, 'reference', 'residential', 'Ifc2x3_Duplex_Architecture.ifc') },
  HHSM2: { ifc: path.join(U, 'opensourceBIM_HHS_Office_architect.ifc'), also: path.join(U, 'opensourceBIM_HHS_Office_construction.ifc') },
  CLINIC2: { ifc: path.join(U, 'Clinic_Architectural_IFC2x3.ifc'), also: path.join(U, 'Clinic_Structural_IFC2x3.ifc') },
  JKR2: { ifc: JKR_AR, also: JKR_ST },
  JKR3: { ifc: JKR_AR, also: JKR_ST, alsoClasses: 'IfcColumn,IfcSlab,IfcBeam' },
  SCASTLE: { ifc: path.join(BC, 'internal', 'sources', 'Ifc2x3_SampleCastle.ifc') },
};
const EXTRACTOR = ['scripts/extractIFC2DB.js', 'scripts/ifc_extract_core.js'];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const _fileSha = {};
const fileSha = f => _fileSha[f] || (_fileSha[f] = sha(fs.readFileSync(f)));
let _ex = null;
function extractor() {   // the extractor files at REF, by content: { dir, files: {path: sha} }
  if (_ex) return _ex;
  const files = {}, body = {};
  EXTRACTOR.forEach(p => { body[p] = cp.execFileSync('git', ['-C', BC, 'show', REF + ':' + p]); files[p] = sha(body[p]); });
  const dir = path.join(path.dirname(DIR), 'extractor', sha(JSON.stringify(files)).slice(0, 12));
  if (!fs.existsSync(path.join(dir, 'extractIFC2DB.js'))) { fs.mkdirSync(dir, { recursive: true }); EXTRACTOR.forEach(p => fs.writeFileSync(path.join(dir, path.basename(p)), body[p])); }
  return (_ex = { dir, files });
}
function want(name) {   // the stamp this db must carry, or { missing: [paths] }
  const r = TABLE[name], src = [r.ifc].concat(r.also ? [r.also] : []), gone = src.filter(f => !fs.existsSync(f));
  if (gone.length) return { missing: gone };
  return { sources: src.map(f => ({ path: f, sha256: fileSha(f) })), extractor: { ref: REF, files: extractor().files }, flags: { alsoClasses: r.alsoClasses || null } };
}
const dbPath = name => path.join(DIR, name + '.db'), stampPath = name => path.join(DIR, name + '.stamp.json');
const _st = {};
function check(name) {   // 'fresh' | 'stale' | 'missing' | 'source missing <path>'
  if (_st[name]) return _st[name];
  const w = want(name);
  if (w.missing) return (_st[name] = 'source missing ' + w.missing.join(', '));
  if (!fs.existsSync(dbPath(name)) || !fs.existsSync(stampPath(name))) return (_st[name] = 'missing');
  let s; try { s = JSON.parse(fs.readFileSync(stampPath(name), 'utf8')); } catch (e) { return (_st[name] = 'stale'); }
  return (_st[name] = JSON.stringify({ sources: s.sources, extractor: s.extractor, flags: s.flags }) === JSON.stringify(w) ? 'fresh' : 'stale');
}
function build(name, force) {
  const st = check(name);
  if (st.startsWith('source missing')) { console.log('§WITNESS_DB ' + name + ' ' + st + ' (nothing built)'); return false; }
  if (st === 'fresh' && !force) { console.log('§WITNESS_DB ' + name + ' fresh ' + dbPath(name)); return false; }
  const r = TABLE[name], w = want(name), tmp = dbPath(name) + '.part', t0 = Date.now();
  fs.mkdirSync(DIR, { recursive: true }); if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const args = [path.join(extractor().dir, 'extractIFC2DB.js'), '--ifc', r.ifc].concat(r.also ? ['--also', r.also] : [], r.alsoClasses ? ['--also-classes', r.alsoClasses] : [], ['-o', tmp]);
  const env = Object.assign({}, process.env, { NODE_PATH: process.env.NODE_PATH || path.join(BC, 'node_modules') });
  const out = cp.spawnSync('node', args, { encoding: 'utf8', env, maxBuffer: 1 << 28 }), log = path.join(DIR, name + '.extract.log');
  fs.writeFileSync(log, (out.stdout || '') + (out.stderr || ''));
  if (out.status !== 0 || !fs.existsSync(tmp)) { console.log('§WITNESS_DB ' + name + ' FAIL rc=' + out.status + ' (log ' + log + ')'); return false; }
  fs.renameSync(tmp, dbPath(name));
  fs.writeFileSync(stampPath(name), JSON.stringify(Object.assign({}, w, { built: new Date().toISOString(), commit: cp.execFileSync('git', ['-C', BC, 'rev-parse', '--short', REF], { encoding: 'utf8' }).trim() }), null, 1) + '\n');
  delete _st[name];
  console.log('§WITNESS_DB ' + name + ' built ' + dbPath(name) + ' bytes=' + fs.statSync(dbPath(name)).size + ' s=' + ((Date.now() - t0) / 1000).toFixed(1) + ' (was ' + st + '; log ' + log + ')');
  return true;
}
module.exports = { TABLE, DIR, check, dbPath };
if (require.main === module) {
  const a = process.argv.slice(2), only = a.includes('--only') ? a[a.indexOf('--only') + 1] : null, names = Object.keys(TABLE).filter(n => !only || n === only);
  if (a.includes('--check')) {
    const st = names.map(n => [n, check(n)]); st.forEach(([n, s]) => console.log('§WITNESS_DB ' + n + ' ' + s + ' ' + dbPath(n)));
    const bad = st.filter(x => x[1] !== 'fresh').length; console.log('§WITNESS_DB_CHECK fresh=' + (st.length - bad) + ' not_fresh=' + bad + ' of ' + st.length + ' dir=' + DIR + ' ref=' + REF);
    process.exit(bad ? 1 : 0);
  }
  let built = 0, fail = 0; names.forEach(n => { if (build(n, a.includes('--force'))) built++; else if (check(n) !== 'fresh') fail++; });
  console.log('§WITNESS_DB_BUILD built=' + built + ' not_fresh=' + fail + ' of ' + names.length + ' dir=' + DIR + ' ref=' + REF);
  process.exit(fail ? 1 : 0);
}
