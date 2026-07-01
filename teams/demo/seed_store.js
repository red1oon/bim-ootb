// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — seed the FACILITATOR STORE (DESIGN.md §7 demo topology). Dogfoods the HTTP
//   transport with an fs-backed get/put to PRODUCE the exact on-disk layout that GitHub-raw / OCI
//   then serve to a remote user. Pure: signs via the stub seam (node), NON-INVENT, deterministic.
//   Run: node teams/demo/seed_store.js 2>&1 | tee teams/logs/seed.log  → then commit teams/demo/store/.
'use strict';
var path = require('path'), fs = require('fs');
var T = require('../transport.js');
var App = require('../overlay/teams_app.js');
var Protocol = require('../protocol.js');

var ROOT = path.join(__dirname, 'store');
function fp(p) { return path.join(ROOT, p); }
function get(p) { return new Promise(function (res) { try { res(fs.readFileSync(fp(p), 'utf8')); } catch (e) { res(null); } }); }
function put(p, body) { return new Promise(function (res) { fs.mkdirSync(path.dirname(fp(p)), { recursive: true }); fs.writeFileSync(fp(p), body); res(); }); }

(async function () {
  fs.rmSync(ROOT, { recursive: true, force: true });           // clean rebuild
  var fac = T.makeHttpFacilitator({ get: get, put: put });
  var sc = App.buildScenario();

  // push the trunk + each walker branch (each a full signed chain from GENESIS)
  var pushes = [['trunk', await fac.pushOps('trunk', sc.trunkOps)]];
  for (var i = 0; i < sc.branches.length; i++) {
    var b = sc.branches[i];
    pushes.push([b.branch.id, await fac.pushOps(b.branch.id, b.ops)]);
  }

  // a SHARED datum (the seam): a datum_plane both disciplines reference by content
  var datum = { kind: 'datum_plane', axis: 'Z', at: 3.1, derived: 'face-cadence' };
  var key = await fac.putBlob(datum);

  // Tier-1 presence (awareness): latest heartbeat per walker (tip = branch's last op_hash)
  var mepTip = (sc.branches[0].ops.slice(-1)[0] || {}).op_hash;
  var strTip = (sc.branches[1].ops.slice(-1)[0] || {}).op_hash;
  await fac.announce(Protocol.makeHeartbeat({ branch: 'MEP', author: 'MEP', tipHash: mepTip, scope: 'MEP', ts: App.T + 30 }));
  await fac.announce(Protocol.makeHeartbeat({ branch: 'STR', author: 'STR', tipHash: strTip, scope: 'STR', ts: App.T + 60 }));

  var tips = await fac.tips();
  console.log('§SEED root      ', ROOT);
  console.log('§SEED pushes    ', JSON.stringify(pushes.map(function (p) { return p[0] + ':+' + p[1].accepted; })));
  console.log('§SEED casKey    ', key);
  console.log('§SEED tips      ', JSON.stringify(tips));
  console.log('§SEED files:');
  (function walk(d, pre) {
    fs.readdirSync(d).sort().forEach(function (f) {
      var q = path.join(d, f);
      if (fs.statSync(q).isDirectory()) walk(q, pre + f + '/');
      else console.log('   ' + pre + f + '  (' + fs.statSync(q).size + 'b)');
    });
  })(ROOT, '');
})().catch(function (e) { console.error('SEED FAILED', e); process.exit(1); });
