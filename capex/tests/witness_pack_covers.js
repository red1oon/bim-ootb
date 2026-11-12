#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-PACK-COVERS (spec prompts/CAPEX_DASHBOARD.md §5.56 F-B). READ THE LOG: verdict = §PACK_COVERS_VERDICT.
// ISSUE it proves/disproves: "a migration applied to legacy never reaches the twin because no pack carries it" (the §5.44 Health rule sat in no pack, so a twin installed from the pack kept the old rule).
// P1 every migration script of capex/legacy/migration/iD13/postgresql is carried by some pack version (capex_2pack_source.mjs PACKS) or is on the named allowlist below, with its reason; P2 each pack version has its zip and the zip is the one the
// generator would write (its element count == the statements of its scripts); P3 capex_dashboard.mjs lists every pack version's zip, in order, and its own version is the newest. PACK_BREAK=1 drops one migration from the newest pack: P1 must FAIL.
// Usage: node capex/tests/witness_pack_covers.js
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), log = console.log, BREAK = process.env.PACK_BREAK === '1';
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(ROOT, 'capex/legacy/migration/iD13/postgresql'), MA = require(path.join(ROOT, 'capex/tools/migration_apply.js'));
const ALLOW = {};   // script -> reason it is deliberately NOT in a pack (none today: every script is dictionary data the twin must also hold)
let judged = 0, fails = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §PACK_COVERS ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
(async () => {
  const src = await import(path.join(ROOT, 'capex/plugin/capex_2pack_source.mjs')), PACKS = JSON.parse(JSON.stringify(src.PACKS)), vs = Object.keys(PACKS).sort(), newest = vs[vs.length - 1];
  if (BREAK) PACKS[newest] = PACKS[newest].slice(1);
  const carried = new Set([].concat.apply([], vs.map(v => PACKS[v]))), scripts = fs.readdirSync(DIR).filter(f => /\.sql$/.test(f)).sort(), missing = scripts.filter(f => !carried.has(f) && !(f in ALLOW));
  ck('P1 every migration script (' + scripts.length + ') is in a pack or on the allowlist; missing: ' + (missing.join(', ') || 'none'), missing.length === 0 && scripts.length > 0, missing);
  const zipBad = []; vs.forEach(v => { const z = path.join(ROOT, 'capex/plugin/capex_2pack/2Pack_' + v + '.zip'); if (!fs.existsSync(z)) { zipBad.push(v + ' no zip'); return; }
    const want = [].concat.apply([], PACKS[v].map(f => MA.split(fs.readFileSync(path.join(DIR, f), 'utf8')).filter(st => !/^SELECT\s+register_migration_script\s*\(/i.test(st)))).length;
    const x = cp.spawnSync('unzip', ['-p', z, 'org.bimootb.capex/' + 'x'], { encoding: 'utf8' }); const list = cp.spawnSync('unzip', ['-Z1', z], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean), xml = list.find(n => /\.xml$/.test(n) && !/Doc\.xml$/.test(n)), body = xml ? cp.spawnSync('unzip', ['-p', z, xml], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout : '';
    const got = (body.match(/<SQLStatement\b/g) || []).length || (body.match(/SQLStatement/g) || []).length / 2; if (!BREAK && got !== want) zipBad.push(v + ' zip has ' + got + ' statements, scripts have ' + want); });
  ck('P2 each of the ' + vs.length + ' pack versions has its zip, and the zip carries exactly its scripts\' statements', zipBad.length === 0, zipBad);
  const plug = fs.readFileSync(path.join(ROOT, 'capex/plugin/capex_dashboard.mjs'), 'utf8'), listed = (plug.match(/capex_2pack\/2Pack_(\d+\.\d+\.\d+)\.zip/g) || []).map(s => s.replace(/.*2Pack_|\.zip/g, '')), ver = (plug.match(/version: '([\d.]+)'/) || [])[1];
  ck('P3 the plugin lists every pack zip in order (' + listed.join(', ') + ') and is itself at the newest version (' + ver + ' vs ' + newest + ')', JSON.stringify(listed) === JSON.stringify(vs) && ver === newest, { listed, vs, ver });
  const v = fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE'; log('§PACK_COVERS_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1);
})();
