#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SEEDPATCH-IDEMPOTENT. READ THE LOG after every run: the verdict is a §SEEDP line, the exit code is not evidence.
// SPEC. Issue (MIGRATE_INSTALL_TENANT §REVIEW-R1R2 F1): the page applies patches/ad_seed.db.sql on EVERY load, also to a persisted db; INSERT OR IGNORE dedups only against a key,
//   so key-less System tables (c_conversiontype, ad_message ...) doubled per reload. Claim: SeedPatch.apply (erp/seed_patch.js, what idempiere.html calls) applied N times leaves every
//   table's row count equal to one application, AND heals a db that is already doubled. No table list: the sweep covers every table in the db.
//   Mutant: the same patch applied WITHOUT the dedup (opts.noDedup = the old applier) must double rows - proves the witness can see the defect (else VACUOUS).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const E = path.join(__dirname, '..');
const SeedPatch = require(path.join(E, 'seed_patch.js'));
const patch = fs.readFileSync(path.join(E, 'patches/ad_seed.db.sql'), 'utf8');
function counts(db) { const o = {}; db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.forEach(r => { try { o[r[0]] = db.exec('SELECT COUNT(*) FROM ' + r[0])[0].values[0][0]; } catch (e) {} }); return o; }
function diff(a, b) { return Object.keys(b).filter(t => a[t] !== b[t]).map(t => t + ' ' + a[t] + '->' + b[t]); }
(async () => {
  const init = require(process.env.SQLJS || (os.homedir() + '/bim-ootb/tests/node_modules/sql.js'));
  const SQL = await init(), seed = fs.readFileSync(path.join(E, 'ad_seed.db'));
  const fresh = () => new SQL.Database(new Uint8Array(seed));
  let judged = 0, failed = 0;
  const check = (name, ok, why, ev) => { judged++; if (!ok) failed++; console.log('§SEEDP ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + ' - ' + why + (ev ? ' :: ' + JSON.stringify(ev).slice(0, 300) : '')); };
  const d1 = fresh(); const r1 = SeedPatch.apply(d1, patch); const c1 = counts(d1);
  const keyless = ['c_conversiontype', 'ad_message'].filter(t => c1[t] > 0);
  check('population', Object.keys(r1.tables).length > 20 && keyless.length === 2, 'the patch seeds many tables incl. the key-less c_conversiontype/ad_message (else VACUOUS)', { tables: Object.keys(r1.tables).length, c_conversiontype: c1.c_conversiontype, ad_message: c1.ad_message });
  for (let n = 2; n <= 3; n++) { SeedPatch.apply(d1, patch); const dd = diff(c1, counts(d1)); check('reload-x' + n, dd.length === 0, 'after ' + n + ' applications every table has the row count of one (all ' + Object.keys(c1).length + ' tables)', dd); }
  const ov = require(path.join(E, 'ad_docvalue_overlay.js')); const dO = fresh(); SeedPatch.apply(dO, patch); ov.ensure(dO); const cO = counts(dO); ov.ensure(dO); ov.ensure(dO);
  const ddo = diff(cO, counts(dO)); check('overlay-reload', ddo.length === 0 && cO.ad_wf_node > c1.ad_wf_node, 'the boot overlay ad_docvalue_overlay (INSERT OR IGNORE into key-less ad_workflow/ad_wf_node) is idempotent over reloads (the 2 tables the live journey still showed after the patch fix)', { diff: ddo, ad_wf_node: cO.ad_wf_node });
  const dm = fresh(); SeedPatch.apply(dm, patch, { noDedup: true }); SeedPatch.apply(dm, patch, { noDedup: true });
  const dmut = diff(counts(dm), c1).length; // tables whose count differs from the single application
  check('MUTANT-old-applier-doubles', dmut >= 10 && counts(dm).c_conversiontype === 2 * c1.c_conversiontype, 'the mutant (no dedup, applied twice) doubles key-less tables - the witness can see F1', { tablesDoubled: dmut, c_conversiontype: counts(dm).c_conversiontype + '/' + c1.c_conversiontype });
  const rh = SeedPatch.apply(dm, patch); const dh = diff(c1, counts(dm));
  check('heal-already-doubled', dh.length === 0 && rh.dup > 0, 'a db already doubled by the old applier is healed to the single-application counts on next load', { removed: rh.dup, left: dh.slice(0, 5) });
  console.log('§SEEDP-VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + failed);
  process.exit(failed ? 1 : 0);
})();
