#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-BAND-NO-HOST, prompts/DISC_WALK_BAND_NO_HOST.md §6. Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: a walk reported floating devices as placed. Is a band device with no host now refused and counted, and is every bound device exactly where it was?
// Usage: node witness_band_no_host.js [--before before.json --after after.json]    (the fleet JSONs of fleet_band_table.js give B3 on every walk in the run).
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const H = require('./walk_node_harness.js');
let pass = 0, fail = 0; const chk = (id, ok, d) => { console.log('§W_BAND ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + (d || '')); ok ? pass++ : fail++; };
const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const DIR = path.join(process.env.HOME, 'bim-ootb', 'buildings'), DB = process.env.WALK_DB || path.join(DIR, 'Clinic_extracted.db'), NAME = process.env.WALK_NAME || 'Clinic';
const unbound = w => (w.placements || []).filter(p => /^placed:/.test(p.prov || ''));
const key = p => p.ifc_class + '|' + (+p.x).toFixed(3) + '|' + (+p.y).toFixed(3) + '|' + (+p.z).toFixed(3);
const sum = o => Object.keys(o).reduce((a, k) => a + o[k], 0);
function balance(w, input) {   // per class: input = placed + refused
  const bad = []; Object.keys(input).forEach(c => { const placed = (w.placements || []).filter(p => p.ifc_class === c).length, r = (w.refusedNoHost && w.refusedNoHost.byClass[c]) || {}, ref = (r['no-rule'] || 0) + (r['host-absent'] || 0) + (r['out-of-reach'] || 0); if (placed + ref !== input[c]) bad.push(c + ':' + input[c] + '!=' + placed + '+' + ref); }); return bad;
}
(async () => {
  if (!fs.existsSync(DB)) { console.log('§W_BAND VERDICT INCONCLUSIVE db absent'); process.exit(0); }
  const SQL = await initSqlJs(), stack = await H.loadStack(SQL), raw = fs.readFileSync(DB);
  H.openBuildingRules(SQL, stack, NAME);
  const log = console.log, walk = (disc, extra) => { console.log = () => {}; try { return H.walkLive(SQL, stack, disc, new Uint8Array(raw), NAME, [], extra); } finally { console.log = log; } };
  const DISC = 'ELEC', keep = walk(DISC, { keepUnhosted: true }), real = walk(DISC, {}), raw0 = walk(DISC, { noHostBind: true });
  if (!raw0.placed) { console.log('§W_BAND VERDICT INCONCLUSIVE the raw walk placed nothing on this building, nothing judged'); process.exit(0); }
  const input = {}; raw0.placements.filter(p => /^placed:/.test(p.prov || '')).forEach(p => input[p.ifc_class] = (input[p.ifc_class] || 0) + 1);
  console.log('§W_BAND run ' + NAME + '/' + DISC + ' mode=' + (real.mode || 'legacy') + ' rawInput=' + sum(input) + ' placed=' + real.placed + ' refused=' + real.refusedNoHost.total + ' byClass=' + JSON.stringify(real.refusedNoHost.byClass));
  // B2: each reason code fires, and those devices are gone from placements. Forced by the caller-shim seam, so the code path is the shipped one.
  const noRule = walk(DISC, { shims: [] }), absent = walk(DISC, { shims: [{ disc: DISC, fixture_ifc_class: null, host_ifc_class: 'IfcNoSuchClass', mount: 'BOTTOM', priority: 1, product_value: DISC + '_T' }] }), reach = walk(DISC, { shims: [{ disc: DISC, fixture_ifc_class: null, host_ifc_class: 'IfcWall', mount: 'SIDE', reach_m: 0.0001, priority: 1, product_value: DISC + '_T' }] });
  const reasonTotal = (w, why) => Object.keys((w.refusedNoHost || { byClass: {} }).byClass).reduce((a, c) => a + w.refusedNoHost.byClass[c][why], 0);
  chk('B2a no-rule: counted, none placed', reasonTotal(noRule, 'no-rule') > 0 && !unbound(noRule).length, 'refused=' + reasonTotal(noRule, 'no-rule') + ' floating=' + unbound(noRule).length + ' reason=' + (noRule.reason || '-'));
  chk('B2b host-absent: counted, none placed', reasonTotal(absent, 'host-absent') > 0 && !unbound(absent).length, 'refused=' + reasonTotal(absent, 'host-absent') + ' floating=' + unbound(absent).length);
  chk('B2c out-of-reach: counted, none placed', reasonTotal(reach, 'out-of-reach') > 0 && !unbound(reach).length, 'refused=' + reasonTotal(reach, 'out-of-reach') + ' floating=' + unbound(reach).length);
  // B1: hosts in reach: bound, none refused. A huge reach on the shipped shim source.
  const wide = walk(DISC, { shims: [{ disc: DISC, fixture_ifc_class: null, host_ifc_class: 'IfcWall', mount: 'SIDE', reach_m: 1e6, same_storey: 0, priority: 1, product_value: DISC + '_T' }] });
  chk('B1 hosts in reach: all bound, 0 refused', wide.refusedNoHost.total === 0 && wide.placed > 0 && !unbound(wide).length, 'placed=' + wide.placed + ' refused=' + wide.refusedNoHost.total);
  const bad = balance(real, input);
  chk('B3 input = placed + refused, per class', !bad.length, 'classes=' + Object.keys(input).length + ' input=' + sum(input) + ' ' + bad.join(' '));
  // Multisets, not sets: hostBind re-snaps ceiling devices to the host's centre, so several can stack on one spot. That stacking is today's behaviour, counted here, not changed here.
  const multi = w => { const m = {}; (w.placements || []).filter(p => !/^placed:/.test(p.prov || '')).forEach(p => { const k = key(p); m[k] = (m[k] || 0) + 1; }); return m; };
  const mr = multi(real), mk = multi(keep), diff = [...new Set(Object.keys(mr).concat(Object.keys(mk)))].filter(k => mr[k] !== mk[k]);
  chk('B4 bound and scheduled devices identical to keepUnhosted, class and position to 1e-3 m', !diff.length && sum(mr) > 0, 'real=' + sum(mr) + ' keep=' + sum(mk) + ' differing=' + diff.length);
  console.log('§W_BAND STACKED bound devices sharing a spot with another of their class: ' + (sum(mr) - Object.keys(mr).length) + ' of ' + sum(mr) + ' (hostBind re-snap, unchanged by this rule)');
  chk('B5 no output placement is a band device without a host', unbound(real).length === 0, 'unhosted=' + unbound(real).length);
  chk('B5 RED: keepUnhosted fails that check', unbound(keep).length > 0, 'unhosted=' + unbound(keep).length);
  // B6: a walk with no band devices says VACUOUS. A schedule walk on the public residential building.
  const dupF = path.join(DIR, 'Duplex_extracted.db');
  if (fs.existsSync(dupF)) {
    const dup = fs.readFileSync(dupF), lines = []; H.openBuildingRules(SQL, stack, 'Duplex'); console.log = s => lines.push(String(s));
    let dw; try { dw = H.walkLive(SQL, stack, 'ACMV', new Uint8Array(dup), 'Duplex', [], {}); } finally { console.log = log; }
    const line = lines.find(l => /§WALK-BAND-NOHOST/.test(l)) || '';
    chk('B6 a walk with no band devices prints VACUOUS', /input=0 VACUOUS/.test(line) && dw.mode !== 'measured-band', line.slice(0, 120));
  } else console.log('§W_BAND B6 INCONCLUSIVE no schedule building at hand');
  // B3 over every walk in the fleet run: from the raw before row to the after row.
  const bf = arg('--before'), af = arg('--after');
  if (bf && af) {
    const B = JSON.parse(fs.readFileSync(bf)), A = JSON.parse(fs.readFileSync(af)), idx = {}; B.forEach(r => idx[r.file + '|' + r.disc] = r);
    let judged = 0, off = []; A.forEach(r => { const b = idx[r.file + '|' + r.disc]; if (!b || !r.refusedNoHost || !b.floatBand && !b.bound) return; judged++; if (r.placed + r.refusedNoHost.total !== b.placed && !b.refused) off.push(r.file + '/' + r.disc + ' ' + b.placed + '!=' + r.placed + '+' + r.refusedNoHost.total); });
    chk('B3 fleet: before placed = after placed + refused, on every walk that had band devices', judged > 0 && !off.length, 'walks=' + judged + ' off=' + off.length + ' ' + off.slice(0, 6).join(' ; '));
  } else console.log('§W_BAND B3-fleet INCONCLUSIVE no fleet JSONs named');
  console.log('§W_BAND VERDICT pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§W_BAND ERROR ' + (e && e.stack || e)); process.exit(1); });
