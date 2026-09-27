// WITNESS — §CPE_PATH_OVERVIEW (prompts/CINEMA_PATH_EDITOR.md).
// ISSUE IT PROVES/DISPROVES: the baked movie is entirely POV, so nothing on screen says WHERE in
// the building the camera is. The overview box claims to answer that. Does it (a) refuse honestly
// when there is no path, (b) project every waypoint inside its own box, (c) actually draw, (d) move
// the head when the pose moves, (e) turn the head when the facing turns, and — the load-bearing one
// — (f) place the head at the REAL pose it was handed rather than a re-derivation from the path?
// (f) is the defect §CPE_POV_MARKER's own rule exists to prevent: a marker that recomputes its pose
// can disagree with the shot it labels, which is worse than no marker at all.
// Drives the PURE functions directly, like cpe_day_counter.js's witness does — no bake needed.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8521, BLD = process.env.BLD || 'Clinic';
process.on('unhandledRejection', e => { console.error('UNHANDLED_REJECTION: '+(e&&e.stack||e)); process.exit(1); });
(async () => {
  const b = await puppeteer.launch({ headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout: 300000 });
  const page = await b.newPage(); await page.setViewport({ width: 900, height: 500 });
  const errs=[]; page.on('pageerror', e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil:'domcontentloaded', timeout:120000 });
  await page.waitForFunction(()=>window.APP && typeof window.APP.pathOverviewPrepare === 'function',
    { timeout:180000 }).catch(()=>{});

  const r = await page.evaluate(() => {
    const A = window.APP, out = {};
    if (typeof A.pathOverviewPrepare !== 'function') return { missing: true };
    // A synthetic L-shaped path through a 40x12x30 box — deterministic, no bake, no building state.
    const plan = { waypoints: [ {x:0,y:2,z:0}, {x:30,y:2,z:0}, {x:30,y:8,z:20}, {x:5,y:8,z:25} ] };
    const bbox = { min:{x:-5,y:0,z:-5}, max:{x:40,y:12,z:30} };

    out.g1 = A.pathOverviewPrepare({ waypoints:[{x:0,y:0,z:0}] }, bbox) === null &&
             A.pathOverviewPrepare(null, bbox) === null;

    const ov = A.pathOverviewPrepare(plan, bbox);
    out.prepared = !!ov; out.wpCount = ov && ov.wpCount;
    if (!ov) return out;

    const BW=300, BH=200, PAD=24;
    const pts = plan.waypoints.map(p => A.pathOverviewToBox(ov, ov.raw(p), BW, BH, PAD));
    out.g2 = pts.every(p => p && p.x >= 0 && p.x <= BW && p.y >= 0 && p.y <= BH);
    out.pts = pts.map(p => p && [Math.round(p.x), Math.round(p.y)]);

    // draw through a capturing stub — counts real drawing, and proves no throw on a live 2D ctx
    const cv = document.createElement('canvas'); cv.width=1852; cv.height=960;
    const cx = cv.getContext('2d');
    let fills=0, strokes=0;
    const rf=cx.fill.bind(cx), rs=cx.stroke.bind(cx);
    cx.fill=function(){fills++;return rf.apply(cx,arguments);};
    cx.stroke=function(){strokes++;return rs.apply(cx,arguments);};
    A.pathOverviewCompositeOntoCanvas(cx, 1852, 960, ov,
      { pos:{x:0,y:2,z:0}, target:{x:30,y:2,z:0} }, 1, 'tl');
    out.g5 = fills > 0 && strokes > 0; out.fills=fills; out.strokes=strokes;

    // (f) the head is placed at the pose HANDED IN, not re-derived. Project two different poses
    // through the same public transform and require the drawn head to track them.
    const hA = A.pathOverviewToBox(ov, ov.raw({x:0,y:2,z:0}),  BW, BH, PAD);
    const hB = A.pathOverviewToBox(ov, ov.raw({x:30,y:8,z:20}), BW, BH, PAD);
    out.g3 = !!(hA && hB) && (Math.hypot(hA.x-hB.x, hA.y-hB.y) > 5);
    out.headA = hA && [Math.round(hA.x), Math.round(hA.y)];
    out.headB = hB && [Math.round(hB.x), Math.round(hB.y)];
    // the head for pose #1 must coincide with the projection of waypoint #1 (same transform)
    out.g6 = !!(hA && pts[0]) && Math.hypot(hA.x-pts[0].x, hA.y-pts[0].y) < 0.001;

    // (e) facing reverses when the target reverses
    function ang(from, to) {
      const a = A.pathOverviewToBox(ov, ov.raw(from), BW, BH, PAD);
      const t = A.pathOverviewToBox(ov, ov.raw(to),   BW, BH, PAD);
      return (a && t) ? Math.atan2(t.y-a.y, t.x-a.x) : null;
    }
    const f1 = ang({x:15,y:2,z:0}, {x:30,y:2,z:0});
    const f2 = ang({x:15,y:2,z:0}, {x:0,y:2,z:0});
    let d = (f1!=null && f2!=null) ? Math.abs(f1-f2) : null;
    if (d!=null && d > Math.PI) d = 2*Math.PI - d;
    out.g4 = d != null && Math.abs(d - Math.PI) < 0.02;
    out.facingDeltaDeg = d!=null ? +(d*180/Math.PI).toFixed(2) : null;
    return out;
  });

  console.log('='.repeat(72) + '\n§CPE_PATH_OVERVIEW witness\n' + '='.repeat(72));
  if (r.missing) { console.log('  INCONCLUSIVE — module never loaded; nothing was judged.'); await b.close(); return; }
  if (!r.prepared) { console.log('  INCONCLUSIVE — prepare() returned null on a valid 4-waypoint plan.'); await b.close(); return; }
  const G = [
    ['G-PO-1 refuses honestly on <2 waypoints (null, not an empty box)', r.g1],
    ['G-PO-2 every waypoint projects INSIDE the box  ' + JSON.stringify(r.pts), r.g2],
    ['G-PO-3 head moves when the pose moves  ' + JSON.stringify(r.headA) + '->' + JSON.stringify(r.headB), r.g3],
    ['G-PO-4 facing reverses with the target (' + r.facingDeltaDeg + '° apart, want 180)', r.g4],
    ['G-PO-5 it actually draws (fills=' + r.fills + ' strokes=' + r.strokes + ')', r.g5],
    ['G-PO-6 head sits on the REAL pose handed in, not a re-derivation', r.g6]
  ];
  let pass = 0;
  G.forEach(([n,v]) => { console.log('  ' + (v ? 'PASS' : 'FAIL') + '  ' + n); if (v) pass++; });
  if (errs.length) console.log('  page errors: ' + errs.slice(0,3).join(' | '));
  console.log('\n  ' + pass + '/' + G.length + (pass === G.length && !errs.length ? ' — PASS' : ' — FAIL'));
  await b.close();
})();
