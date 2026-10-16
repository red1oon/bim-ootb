// W-BUDGET-EQUIV (FLY_TOUR_DLOD_SCALE.md §20.4) — issue proved/disproved: with the boost
// mechanism off (budgetBoostEnabled=false, the §20 lever), is this branch's dlod_nav.js
// behavior IDENTICAL to origin/main's shipped (pre-§20) dlod_nav.js? Method mirrors the proven
// witness/w_equiv.js (§13/§16 precedent): a deterministic scripted pose sweep; at each pose wait
// for the partition to fully settle (mismatch=0, fades=0), then record real/boxed counts. Run
// once per code version — the harness swaps viewer/dlod_nav.js on disk between runs (server reads
// straight off disk, no build step; each run launches a FRESH headless browser so no service-
// worker cache carries stale JS across runs). Per-pose real/boxed counts must match exactly.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const H = require('./harness_budget');

const RUN = process.argv[2] || 'branch'; // 'branch' | 'main'
const LOG = [];
const sink = t => { LOG.push(t); };
const TARGET = path.join(__dirname, '..', 'viewer', 'dlod_nav.js');
const MAIN_REF = path.join(__dirname, '.dlod_nav_main_reference.js'); // regenerated each run, not committed
const BRANCH_BACKUP = path.join(__dirname, '.dlod_nav_branch_backup.js');

(async () => {
  let swapped = false;
  try {
    if (RUN === 'main') {
      // Regenerate the origin/main reference fresh each time (not a committed file — this repo's
      // witness/ convention commits scripts, not regenerable artifacts).
      const mainSrc = execSync('git show origin/main:viewer/dlod_nav.js', { cwd: path.join(__dirname, '..'), maxBuffer: 10 * 1024 * 1024 });
      fs.writeFileSync(MAIN_REF, mainSrc);
      fs.copyFileSync(TARGET, BRANCH_BACKUP); // save branch version
      fs.copyFileSync(MAIN_REF, TARGET);      // swap in shipped origin/main version
      swapped = true;
      sink('§EQUIV_SWAP installed origin/main dlod_nav.js on disk for this run');
    }
    const { browser, page } = await H.launch(sink);
    try {
      await H.loadLTU(page, sink);
      await H.engageDlod(page, LOG);
      if (RUN === 'branch') {
        // §20 lever OFF — this run's whole point is proving boost=0/disabled is byte-identical
        await page.evaluate(() => { window.__dlodNav.budgetBoostEnabled = false; });
      }
      // §20 scope note: AERIAL poses only (not interior "room" poses) — this feature only ever
      // touches the aerial/wide-orbit regime (§20's whole premise); interior convergence exercises
      // the separate, already-proven §13/§16 room-occlusion machinery (own witnesses:
      // W-ROOM-OCCL-*/W-PVS-*) which this diff does not touch and which showed pre-existing,
      // pose/timing-dependent partial-convergence noise identically on BOTH branch and the
      // origin/main reference when tried here — a confound unrelated to §20, out of this witness's
      // scope to chase down.
      const poses = await page.evaluate(() => {
        const A = window.APP || window.A;
        const env = A.dbQuery("SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MAX(center_z) FROM element_transforms")[0];
        const cx = (env[0] + env[1]) / 2, cy = (env[2] + env[3]) / 2;
        const ctr = A.ifc2three(cx, cy, env[4] / 2);
        const out = [];
        const factors = [0.25, 0.4, 0.9];
        for (let i = 0; i < factors.length; i++) {
          const rad = Math.max(env[1] - env[0], env[3] - env[2]) * factors[i];
          for (let j = 0; j < 2; j++) {
            const a = j * Math.PI + 0.7;
            const p = A.ifc2three(cx + rad * Math.cos(a), cy + rad * Math.sin(a), env[4] * 1.1);
            out.push({ name: 'aerial_f' + factors[i] + '_a' + j, pos: [p.x, p.y, p.z], look: [ctr.x, ctr.y, ctr.z] });
          }
        }
        return out;
      });
      sink('EQUIV poses=' + poses.length);
      const records = [];
      for (const po of poses) {
        await H.setPose(page, po.pos, po.look);
        const a = await H.settle(page, 30000);
        const rec = { pose: po.name, real: a.real, boxed: a.boxed, mismatch: a.mismatch };
        records.push(rec);
        sink('§BUDGET_EQUIV_POSE run=' + RUN + ' ' + JSON.stringify(rec));
      }
      const mutations = await page.evaluate(() => window.__dlodNav.mutations);
      sink('§BUDGET_EQUIV_MUTATIONS run=' + RUN + ' total=' + mutations);
      fs.writeFileSync(__dirname + '/w_budget_equiv_' + RUN + '.json', JSON.stringify({ records, mutations }, null, 1));
    } finally {
      await browser.close();
    }
  } finally {
    if (swapped) {
      fs.copyFileSync(BRANCH_BACKUP, TARGET); // restore branch version
      fs.unlinkSync(BRANCH_BACKUP);
      if (fs.existsSync(MAIN_REF)) fs.unlinkSync(MAIN_REF);
      sink('§EQUIV_SWAP restored branch dlod_nav.js on disk');
    }
    fs.writeFileSync(__dirname + '/w_budget_equiv_' + RUN + '.log', LOG.join('\n'));
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/w_budget_equiv_' + RUN + '.log', LOG.join('\n')); process.exit(1); });
