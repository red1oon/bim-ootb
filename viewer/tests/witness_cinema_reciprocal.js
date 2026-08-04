// WITNESS — §CINEMA_RECIPROCAL / §CINEMA_ANCHOR (PHOTOREAL_STILL_RENDER.md).
// ISSUE IT PROVES/DISPROVES: the old plan CLAMPED tilt+radius into a fixed band, so different
// authored start poses collapsed onto the same film. P2 of the doctrine says pose must chart a
// "myriad of paths not entirely the same". This drives materially different poses through the REAL
// _cinemaPathPlan and asserts the resulting films actually differ.
//   PASS = for each building: the 3 poses yield distinct (iota, targetTilt, endRadius, endY),
//          AND the Bird pose's attack angle is CARRIED (not clamped to the 45 deg band ceiling),
//          AND the Lobby pose produces a real in-place turnaround (turnExtra > 90 deg).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8479;
const BUILDINGS = (process.env.BLDS || 'Duplex,HHS_Office_Federated').split(',');

// The three archetypes from the spec's worked examples. Expressed RELATIVE to each building's own
// bbox so they mean the same thing on any building — no hardcoded coordinates (determinism rule).
const POSES = [
  { name: 'Establishing', radiusFactor: 2.2, tiltDeg: 5,  targetHFrac: 0.30 },
  { name: 'LobbyTurn',    radiusFactor: 0.10, tiltDeg: 0,  targetHFrac: 0.03 },
  { name: 'Bird',         radiusFactor: 1.2, tiltDeg: 55, targetHFrac: 0.50 },
  // a TRUE ground-level walk-up: low gamma, so the band-ease (not the carry) must be what acts.
  { name: 'GroundWalk',   radiusFactor: 2.2, tiltDeg: 3,  targetHFrac: 0.005 },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];

  for (const BLD of BUILDINGS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

    const url = `http://localhost:${PORT}/viewer/viewer.html?db=buildings/${BLD}_extracted.db`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls && window.APP.cinemaPathPlan,
      { timeout: 90000 });
    await new Promise(r => setTimeout(r, 9000));  // let streaming + bbox settle

    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const rows = [];
    for (const pose of POSES) {
      const before = logs.length;
      const placed = await page.evaluate((p) => {
        const A = window.APP;
        // derive the pose from the building's OWN bbox — nothing hardcoded per building
        const r = A.dbQuery('SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y),MIN(center_z),MAX(center_z) FROM element_transforms');
        if (!r || !r.length) return null;
        const [x0, x1, y0, y1, z0, z1] = r[0];
        const c = A.ifc2three((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        const env = Math.max(x1 - x0, y1 - y0);
        const top = A.ifc2three(0, 0, z1).y, bot = A.ifc2three(0, 0, z0).y;
        const h = Math.abs(top - bot);
        // place the TARGET at the intended height, then the camera by real spherical coords so
        // the pose actually HAS the tilt it claims (the first version of this witness did not).
        const yLow = Math.min(bot, top);
        const ty = yLow + h * p.targetHFrac;
        A.controls.target.set(c.x, ty, c.z);
        const rad = env * p.radiusFactor;
        const tilt = p.tiltDeg * Math.PI / 180, az = 0.6;
        A.camera.position.set(
          c.x + rad * Math.cos(tilt) * Math.cos(az),
          ty  + rad * Math.sin(tilt),
          c.z + rad * Math.cos(tilt) * Math.sin(az)
        );
        A.controls.update();
        const plan = A.cinemaPathPlan(24);
        return { ok: !!plan, radius: rad };
      }, pose);

      if (!placed || !placed.ok) { console.log(`  ${pose.name}: PLAN FAILED`); allPass = false; continue; }
      const tail = logs.slice(before);
      const grab = (tag, re) => { const l = tail.find(t => t.startsWith(tag)); const m = l && l.match(re); return m ? parseFloat(m[1]) : null; };
      const anchorLine = tail.find(t => t.startsWith('§CINEMA_ANCHOR')) || '';
      const row = {
        pose: pose.name,
        iota: grab('§CINEMA_POSE_AUTHORED', /iota=([\d.]+)/),
        alpha: grab('§CINEMA_POSE_AUTHORED', /alpha=(-?[\d.]+)/),
        gamma: grab('§CINEMA_POSE_AUTHORED', /gamma=([\d.]+)/),
        carry: grab('§CINEMA_POSE_AUTHORED', /carry=([\d.]+)/),
        tTilt: grab('§CINEMA_POSE_AUTHORED', /targetTilt=(-?[\d.]+)/),
        endR: grab('§CINEMA_RECIPROCAL', /endRadius=([\d.]+)/),
        endY: grab('§CINEMA_RECIPROCAL', /endY=(-?[\d.]+)/),
        endTilt: grab('§CINEMA_RECIPROCAL', /endTilt=(-?[\d.]+)/),
        turn: grab('§CINEMA_RECIPROCAL', /turnExtra=(-?[\d.]+)/),
        anchor: (anchorLine.match(/class=(\w+)/) || [])[1] || 'none',
        character: (anchorLine.match(/character=(\w+)/) || [])[1] || '?',
      };
      rows.push(row);
      console.log(`  ${pose.name.padEnd(13)} iota=${String(row.iota).padEnd(6)} alpha=${String(row.alpha).padEnd(6)}deg ` +
        `gamma=${String(row.gamma).padEnd(6)} carry=${String(row.carry).padEnd(5)} -> targetTilt=${String(row.tTilt).padEnd(6)}deg`);
      console.log(`  ${''.padEnd(13)} END: r=${String(row.endR).padEnd(8)} y=${String(row.endY).padEnd(8)} tilt=${String(row.endTilt).padEnd(6)}deg turn=${String(row.turn).padEnd(5)}deg  anchor=${row.anchor}/${row.character}`);
    }

    // ── assertions ──
    if (rows.length === 4) {
      const [est, lob, bird, walk] = rows;
      // NOTE: iota==0 for BOTH wide poses is correct by design (intimacy is clamped at 0 beyond
      // fill distance), so "all three differ" was a wrong expectation in the first draft.
      const checks = [
        ['Lobby is intimate (iota>0.5), both wide poses are not (iota==0)',
          lob.iota > 0.5 && est.iota === 0 && bird.iota === 0],
        ['Bird pose really is steep (>45deg) - witness built the pose it claims', bird.alpha > 45],
        ['Bird attack CARRIED, not clamped: targetTilt == alpha', Math.abs(bird.tTilt - bird.alpha) < 1.0],
        ['Bird attack exceeds the old 45deg band ceiling', bird.tTilt > 45.5],
        // P1: an authored angle is NEVER clamped away. The band-ease only acts to the extent that
        // gamma says you were standing ON a floor. So the real invariant is the lerp identity, not
        // "it must land inside the band" — that expectation was itself a normalization, i.e. the
        // very thing the doctrine forbids. Verified against the logged carry.
        ['targetTilt obeys the carry lerp on every pose',
          rows.every(r => {
            const band = Math.max(8, Math.min(45, r.alpha));
            return Math.abs((band + (r.alpha - band) * r.carry) - r.tTilt) < 0.6;
          })],
        ['GroundWalk has LOW lift (gamma<1) so the band-ease is what acts', walk.gamma < 1 && walk.carry < 0.5],
        ['GroundWalk shallow 3deg attack is EASED UP toward the band', walk.tTilt > walk.alpha + 1],
        ['Lobby produces a real in-place turnaround (>90deg)', lob.turn > 90],
        ['Lobby ends wider than Establishing (intimacy -> distance)', lob.endR > est.endR],
        ['Bird ends higher than Establishing (lift -> roof-offset)', bird.endY > est.endY],
        ['reciprocal endTilt == the opening attack, all 3 poses',
          rows.every(r => Math.abs(r.endTilt - r.alpha) < 0.2)],
      ];
      console.log('');
      checks.forEach(([label, ok]) => { console.log(`   [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });
      summary.push({ BLD, rows });
    } else { allPass = false; }

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('   PAGEERRORS: ' + errs.join(' | ')); allPass = false; }
    await page.close();
  }

  console.log(`\n${'='.repeat(78)}\nVERDICT: ${allPass ? 'PASS — one gesture, materially different films' : 'FAIL'}\n`);
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();
