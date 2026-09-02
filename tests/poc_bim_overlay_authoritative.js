/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_bim_overlay_authoritative.js — round-trip REGRESSION fix witness (W-BIM-OVERLAY-AUTHORITATIVE).
// The bug: the idb seed cache (ad_seed_v16) can be persisted AFTER the BIM overlay has run (a demo-tenant
// install / seed reset / genesis / tenant delete does idbPut(db.export())), freezing a STALE BIM band into
// the cache. The old overlay used INSERT OR IGNORE → a fresh push (same band PK) was SILENTLY SKIPPED, so the
// Find › ERP deep-link opened the ERP but the project wasn't there. The fix: overlayTable does a PER-PK
// authoritative replace (delete the dst rows whose PK the OPFS push provides, then insert) → the OPFS push wins,
// WITHOUT wiping seed-baked band rows (the Hospital twin C_Project 990000 lives in the seed, not OPFS). Proves:
//   A — STALE pushed row in dst (polluted cache) + FRESH push in src (OPFS, same PK) → after overlay, dst carries
//       the FRESH values (the OLD INSERT-OR-IGNORE would have KEPT the stale row — the regression).
//   CRIT — the seed-baked Hospital band project (990000, NOT in OPFS) SURVIVES (not a band-wide wipe).
//   B — base rows (PK < BIM_BASE) untouched.
//   C — idempotent: a 2nd overlay leaves the fresh values + no dup.
//   D — empty src → dst pushed band row left as-is (no accidental wipe; revert-safe).
// Run: NODE_PATH=$HOME/bim-ootb/tests/node_modules:$HOME/bim-ootb/node_modules node tests/poc_bim_overlay_authoritative.js
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require('sql.js');
const ProjFold = require('../viewer/proj_fold.js');
const Overlay = require('../erp/bim_orders_overlay.js');

const ERP = [path.join(__dirname, '..', 'erp', 'ad_seed.db'),
  path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db')].find(fs.existsSync);
const RATES_DIR = path.join(__dirname, '..', 'viewer', 'rates');
const BIM_BASE = Overlay.BIM_BASE;

const log = []; let pass = 0, fail = 0;
const S = (m) => { log.push(m); console.log(m); };
const ok = (c, label, d) => { if (c) pass++; else fail++; S('  ' + (c ? 'PASS' : 'FAIL') + ' ' + label + (d ? ' — ' + d : '')); };
const scalar = (db, sql) => { const r = db.exec(sql); return r.length && r[0].values.length ? r[0].values[0][0] : null; };
const proj = (db, value) => { const r = db.exec("SELECT C_Project_ID, PlannedAmt FROM C_Project WHERE Value='" + value + "'"); return r.length && r[0].values.length ? { pk: Number(r[0].values[0][0]), planned: Number(r[0].values[0][1]) } : null; };
const bandCount = (db, value) => scalar(db, "SELECT COUNT(*) FROM C_Project WHERE Value='" + value + "'");

(async function () {
  if (!ERP) { S('§BIM_OVERLAY_AUTH SKIP — missing erp db'); process.exit(1); }
  const SQL = await initSqlJs();
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const seed = fs.readFileSync(ERP);
  const opts = (now) => ({ seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'USD', now, bpartnerId: 119 });
  const HOSP = proj(new SQL.Database(new Uint8Array(seed)), 'Hospital');   // seed-baked band project
  S('§W-BIM-OVERLAY-AUTHORITATIVE — fresh OPFS push wins over stale cache, seed band survives (round-trip fix)');
  S('  · seed-baked Hospital band: PK=' + (HOSP && HOSP.pk) + ' PlannedAmt=' + (HOSP && HOSP.planned));

  // FRESH push (OPFS) — building 'RoundTrip', a BIG project
  const src = new SQL.Database(new Uint8Array(seed));
  ProjFold.foldProjectOrder(src, 'RoundTrip', [{ disc: 'ARC', cls: 'IfcWall', storey: 'L1', count: 50, unit: 'EA', qty: 50, rate: 100, cost: 5000 }], opts('2026-06-21 00:00:00'));
  const fresh = proj(src, 'RoundTrip');

  // POLLUTED cache (dst) — same band PK baked with STALE/different values (a prior, smaller push)
  const dst = new SQL.Database(new Uint8Array(seed));
  ProjFold.foldProjectOrder(dst, 'RoundTrip', [{ disc: 'ARC', cls: 'IfcWall', storey: 'L1', count: 3, unit: 'EA', qty: 3, rate: 100, cost: 300 }], opts('2026-06-10 00:00:00'));
  const stale = proj(dst, 'RoundTrip');
  const baseBefore = scalar(dst, 'SELECT COUNT(*) FROM C_Project WHERE C_Project_ID < ' + BIM_BASE);
  S('  · stale dst push PK=' + stale.pk + ' planned=' + stale.planned + '  |  fresh src push PK=' + fresh.pk + ' planned=' + fresh.planned);
  ok(fresh.pk === stale.pk && fresh.planned !== stale.planned, 'arrange: same band PK, different PlannedAmt', 'PK=' + stale.pk);

  // ACT
  Overlay.overlayRows(src, dst, Overlay.TABLES);

  const after = proj(dst, 'RoundTrip');
  ok(after.planned === fresh.planned && after.planned !== stale.planned,
     'A — stale pushed row REPLACED by the fresh push (old INSERT-OR-IGNORE kept stale)',
     'after=' + after.planned + ' (fresh=' + fresh.planned + ', stale=' + stale.planned + ')');
  ok(bandCount(dst, 'RoundTrip') === 1, 'A2 — exactly one RoundTrip row (no duplicate)', 'rows=' + bandCount(dst, 'RoundTrip'));

  const hospAfter = proj(dst, 'Hospital');
  ok(!!hospAfter && hospAfter.pk === HOSP.pk && hospAfter.planned === HOSP.planned,
     'CRIT — seed-baked Hospital band (not in OPFS) SURVIVES (per-PK replace, not a band wipe)',
     'Hospital after: ' + (hospAfter ? hospAfter.pk + '/' + hospAfter.planned : 'GONE'));

  ok(scalar(dst, 'SELECT COUNT(*) FROM C_Project WHERE C_Project_ID < ' + BIM_BASE) === baseBefore, 'B — base rows untouched', 'base=' + baseBefore);

  Overlay.overlayRows(src, dst, Overlay.TABLES);
  ok(bandCount(dst, 'RoundTrip') === 1 && proj(dst, 'RoundTrip').planned === fresh.planned, 'C — 2nd overlay idempotent (still fresh, no dup)');

  // D — empty src leaves dst push intact
  const dstD = new SQL.Database(new Uint8Array(seed));
  ProjFold.foldProjectOrder(dstD, 'KeepMe', [{ disc: 'ARC', cls: 'IfcWall', storey: 'L1', count: 2, unit: 'EA', qty: 2, rate: 100, cost: 200 }], opts('2026-06-09 00:00:00'));
  const keepBefore = bandCount(dstD, 'KeepMe');
  Overlay.overlayRows(new SQL.Database(new Uint8Array(seed)), dstD, Overlay.TABLES);   // empty src (no fold)
  ok(bandCount(dstD, 'KeepMe') === keepBefore && keepBefore > 0, 'D — empty src leaves dst push intact (no wipe; revert-safe)', 'rows=' + bandCount(dstD, 'KeepMe'));

  src.close(); dst.close(); dstD.close();
  const verdict = `§RESULT W-BIM-OVERLAY-AUTHORITATIVE  ${pass}/${pass + fail}  ${fail ? 'FAIL' : 'PASS'}`;
  S(''); S(verdict);
  fs.writeFileSync(path.join(__dirname, 'poc_bim_overlay_authoritative.log'), log.join('\n') + '\n');
  process.exit(fail ? 1 : 0);
})();
