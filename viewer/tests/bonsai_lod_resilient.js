// W-BONSAI-LOD-RESILIENT — proves the intermittent-furniture-boxes bug and its fix (no visual needed).
// CLAIM under test: bonsai_library.ensureMesh must NOT permanently poison itself when the one-time geometries
// fetch hiccups. The shipped code's `.catch(){ this._geom = {} }` (+ no r.ok check, + never clearing _geomP)
// turns ANY transient failure into a whole-session of LOD-200 boxes — the user's "sometimes LOD300 perfect,
// then not" on furniture (an assembly = many leaves all riding one _geom load).
// ISSUE PROVEN: a fetch that FAILS once then SUCCEEDS must end with the real mesh available (retry recovers),
// not stuck false. Also: a fetch resolving with ok:false (404/empty SW) must be treated as failure, not poison.
// Runs in pure node (no browser) by shimming window/document/location/fetch/atob and loading the real module.
'use strict';
const fs = require('fs'), path = require('path');

const VIEWER = path.dirname(__dirname);
let fetchMode = 'fail';                  // flip per phase
let geomHits = 0, catalogHits = 0;
function makeRes(ok, body) { return Promise.resolve({ ok, status: ok ? 200 : 503, json: () => ok ? Promise.resolve(body) : Promise.reject(new Error('bad json')) }); }
global.window = {};
global.document = { currentScript: { src: 'http://x/viewer/bonsai_library.js' } };
global.location = { href: 'http://x/viewer/' };
global.atob = global.atob || function (s) { return s; };   // never invoked here (witness folds no meshes); stub avoids the node-only Buffer global the browser-eslint gate rejects
global.fetch = (url) => {
  url = String(url);
  if (url.indexOf('dagevu_catalog') !== -1) {       // catalog: one product carrying a gh (the geometries key)
    catalogHits++;
    return makeRes(true, { groups: [], cheatsheet: [], assemblies: [],
      products: [{ id: 'P1', name: 'Chair', ifc_class: 'IfcFurnishingElement', cat: 'FURN', gh: 'GH1', w: 1, d: 1, h: 1 }] });
  }
  if (url.indexOf('dagevu_geometries') !== -1) {     // geometries: FAIL while fetchMode==='fail'
    geomHits++;
    if (fetchMode === 'fail') return Promise.reject(new Error('simulated network drop'));
    if (fetchMode === 'notok') return makeRes(false, null);
    return makeRes(true, { GH1: { v: 'AAAA', f: 'AAAA' } });   // success → mesh present for GH1
  }
  return makeRes(false, null);
};

// Load the REAL module into this scope (IIFE sets global.window.Bonsai.library).
eval(fs.readFileSync(path.join(VIEWER, 'bonsai_library.js'), 'utf8'));
const L = global.window.Bonsai.library;

const T = '§W-BONSAI-LOD-RESILIENT';
let fails = 0;
function check(name, cond) { console.log(`${T} ${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails++; }

(async () => {
  await L.ready();                                   // catalog loaded (P1 with gh=GH1)
  check('catalog has gh product', !!L.get('P1') && L.get('P1').gh === 'GH1');

  // PHASE 1 — transient REJECT: first ensureMesh fails (expected), but must NOT poison the store.
  fetchMode = 'fail';
  const a1 = await L.ensureMesh('P1');
  check('attempt1 reports no-mesh on failure', a1 === false);

  // PHASE 2 — fetch now SUCCEEDS: a retry MUST recover the real mesh (the core fix; buggy code stays false forever).
  fetchMode = 'ok';
  const a2 = await L.ensureMesh('P1');
  check('attempt2 RECOVERS the mesh after a transient failure', a2 === true);
  check('hasMesh true post-recovery', L.hasMesh('P1') === true);
  check('geometries fetch was retried (>1 hit)', geomHits >= 2);

  // PHASE 3 — ok:false response must be handled like a failure (no poison), and still recover on a clean retry.
  // Fresh store state to isolate: drop the loaded geom + promise so we exercise the ok:false path from scratch.
  L._geom = null; L._geomP = null; geomHits = 0;
  fetchMode = 'notok';
  const b1 = await L.ensureMesh('P1');
  check('ok:false treated as failure (no mesh)', b1 === false);
  fetchMode = 'ok';
  const b2 = await L.ensureMesh('P1');
  check('recovers after an ok:false response', b2 === true);

  console.log(`${T} VERDICT: ${fails === 0 ? 'PASS — ensureMesh is resilient (retries, no poison)' : 'FAIL (' + fails + ') — poison bug present'}`);
  process.exit(fails === 0 ? 0 : 1);
})();
