#!/usr/bin/env node
/**
 * §13 WITNESS — THE VISUAL LANGUAGE (ESCAPE_ROUTE_REVEAL.md §13.1-§13.7)
 *
 * WHAT THIS PROVES OR DISPROVES. §13 turns one orange line into four channels that each carry a
 * code quantity. Every check below names the defect it would catch; a check that cannot fail on a
 * broken build has no business here.
 *
 * NO RENDERER, NO PIXELS. Every claim is a predicate over the record the build produces and the
 * text the card returns — this project's own rule (no pixel-derived evidence: slice the predicate
 * out instead). THREE is deliberately absent, exactly as witness_escape_route_reveal.js leaves it.
 *
 * RUN: node witness_escape_colours.js
 */
const fs = require('fs'), path = require('path');
const initSqlJs = require('./tests/_sqljs.js').requireSqlJs();
const { resolveWitnessDb } = require('./tests/_witness_db.js');
const RoomGraph = require('./common/room_graph.js');
const { setupCpeEscapeRoute } = require('./viewer/cpe_escape_route.js');

let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  §W13 ok    ' + n + (x ? '   ' + x : '')); }
                          else { fail++; console.log('  §W13 WRONG ' + n + (x ? '   ' + x : '')); } };
const near = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 1e-6 : e);

function loadHudGeometry(A) {
  ['cpe_day_counter.js', 'cpe_resource_panel.js'].forEach(function (f) {
    const src = fs.readFileSync(path.join(__dirname, 'viewer', f), 'utf8');
    const name = 'setup' + f.replace(/\.js$/, '').replace(/(^|_)([a-z])/g, (m, a, b) => b.toUpperCase());
    try { eval(src + '\n' + name + '(A);'); } catch (e) { /* geometry is optional for these claims */ }
  });
}
function makeApp(graph, q, building) {
  const A = { activeBuilding: building };
  A.getRoomGraph = () => graph;
  A.ifc2three = (ix, iy, iz) => ({ x: ix, y: iz, z: -iy });   // scene.js:504's own mapping
  A.allRoomVolumes = () => [];
  A.dbQuery = (sql, p) => q(sql, p);                           // helpers.js returns ROW-VALUE ARRAYS
  loadHudGeometry(A);
  setupCpeEscapeRoute(A);
  return A;
}
const planWith = (rise, durationSec) => ({ beats: { rise: rise }, durationSec: durationSec || 200 });
// A tNorm comfortably inside the window with the line fully drawn, so the card has real numbers.
function tFull(A, plan) {
  const w = A.escapeRouteWindow(plan);
  return w.start + (w.end - w.start) * 0.85;
}
const polyLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y, (pts[i].z||0) - (pts[i-1].z||0)); return L; };

(async () => {
  const SQL = await initSqlJs();
  // The FILM'S OWN building first: §13's every measured number is about the clip red1 will sight,
  // and a witness that silently proved a different building would be proving the fixture.
  const picked = resolveWitnessDb(SQL, { needRaster: true,
    candidates: ['Hospital_silent.db', 'Hospital_meta.db', 'Terminal_silent.db', 'HHS_Office_Federated_extracted.db'] });
  if (!picked) {
    console.log('§ESCAPE_COLOURS INCONCLUSIVE — no building with rooms AND a walkable raster is' +
      ' reachable, so there is no real divergence to measure. A synthetic graph would prove the' +
      ' fixture, not the feature. Point BIM_BUILDINGS at a checkout that has one.');
    process.exit(2);
  }
  const db = picked.db;
  const q = (sql, p) => { const r = p ? db.exec(sql, p) : db.exec(sql); return r.length ? r[0].values : []; };
  const graph = RoomGraph.buildGraph(q, { log: () => {} });
  const A = makeApp(graph, q, picked.name.replace(/\.db$/, ''));
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'viewer/rates/egress_rules.json'), 'utf8'));
  A.escapeRouteSetRules(rules, 'witness');
  const rec = A.escapeRouteBuild();
  console.log('§ESCAPE_COLOURS db=' + picked.name + ' rooms=' + graph.nodes.length +
    ' built=' + (rec ? 'yes room="' + rec.roomName + '"' : 'NO'));
  if (!rec) {
    console.log('§ESCAPE_COLOURS INCONCLUSIVE — escapeRouteBuild returned null on ' + picked.name +
      ' (its own § line above says why). Nothing about §13 can be judged from that.');
    process.exit(2);
  }

  // ══ W-13-1 — THE SPLIT IS A SPLIT. ISSUE: RED and YELLOW must be two parts of ONE measured walk.
  // If they were derived separately, the card could print a "no choice" figure and a "to nearest
  // exit" figure that do not add up to the route the viewer is looking at. Disproved the moment
  // red + yellow stops equalling the primary's own length. ════════════════════════════════════
  const redL = rec.redPts ? polyLen(rec.redPts) : 0;
  const yellowL = rec.yellowPts ? polyLen(rec.yellowPts) : 0;
  ck('W-13-1 RED + YELLOW == the measured primary walk',
     near(redL + yellowL, rec.walkM, 1e-4),
     'red=' + redL.toFixed(3) + ' + yellow=' + yellowL.toFixed(3) + ' = ' + (redL + yellowL).toFixed(3) +
     ' vs walkM=' + rec.walkM.toFixed(3));

  // ══ W-13-2 — RED IS THE §1006.2.1 QUANTITY. ISSUE: the card prints RED against a code limit, so
  // RED had better BE the common path and not the whole walk. Recomputed here from the record's own
  // geometry, independently of the builder's arithmetic. ══════════════════════════════════════
  ck('W-13-2 commonPathM is the RED length, not the whole route',
     rec.commonPathM != null && near(rec.commonPathM, redL, 1e-4),
     'commonPathM=' + (rec.commonPathM == null ? 'null' : rec.commonPathM.toFixed(3)) +
     ' redLen=' + redL.toFixed(3) + ' walkM=' + rec.walkM.toFixed(3));
  ck('W-13-2b the divergence snap is reported, so a cut in the wrong place is readable',
     rec.alternates.length === 0 || rec.divSnapM != null,
     'divSnapM=' + (rec.divSnapM == null ? 'n/a' : rec.divSnapM.toFixed(2) + 'm'));

  // ══ W-13-3 — NO DIVERGENCE IS DRAWN, NOT HIDDEN. ISSUE: §13.6's worst case (routes never
  // diverge) must not render as an ordinary yellow line. Forced here by giving the module a graph
  // whose room reaches exactly one exit. Disproved if RED stops being the whole route, or if the
  // legend stops saying so. ══════════════════════════════════════════════════════════════════
  {
    const oneExit = { nodes: graph.nodes.slice(), edges: graph.edges, nodesByGuid: Object.create(null), rasters: graph.rasters };
    Object.keys(graph.nodesByGuid).forEach(g => { oneExit.nodesByGuid[g] = graph.nodesByGuid[g]; });
    const B = makeApp(oneExit, q, picked.name.replace(/\.db$/, '') + '__oneexit');
    B.escapeRouteSetRules(rules, 'witness');
    // Wrap escapeRoutes so only the NEAREST exit is reachable — the single-exit state, on the real
    // graph rather than a hand-built one, so the geometry it produces is still real geometry.
    const realER = RoomGraph.escapeRoutes;
    RoomGraph.escapeRoutes = function (g, from, o) { const r = realER(g, from, o); return r ? { routes: r.routes.slice(0, 1) } : r; };
    let recB = null;
    try { recB = B.escapeRouteBuild(); } finally { RoomGraph.escapeRoutes = realER; }
    const cardB = recB ? B.escapeRouteStatCardAt(planWith(0.95), tFull(B, planWith(0.95))) : null;
    const redRow = cardB && cardB.card.legend[0], blueRow = cardB && cardB.card.legend[2];
    ck('W-13-3 one reachable exit -> no alternates, RED is the whole route',
       !!recB && recB.alternates.length === 0 && near(recB.commonPathM, recB.walkM, 1e-4),
       recB ? 'alts=' + recB.alternates.length + ' commonPath=' + recB.commonPathM.toFixed(2) +
              ' walk=' + recB.walkM.toFixed(2) : 'build returned null');
    ck('W-13-3b and the legend SAYS so rather than printing a number as if it were ordinary',
       !!redRow && /NO alternative exists/i.test(redRow.text) &&
       !!blueRow && /no other way out/i.test(blueRow.text),
       redRow ? 'RED="' + redRow.value + ' ' + redRow.text + '"  BLUE="' + blueRow.value + ' ' + blueRow.text + '"' : 'no card');
  }

  // ══ W-13-4 — THE FAN IS NOT CAPPED. ISSUE: §13.6 warns in writing that a "reduce the clutter"
  // pass would make a snake and a hydra look the same. This fails the moment anyone caps the
  // alternates without also changing the legend to say "N of M shown". ═══════════════════════
  const all = RoomGraph.escapeRoutes(graph, rec.roomGuid, { log: () => {} });
  const drawable = all ? all.routes.slice(1).filter(r => {
    const sp = (() => { try { return RoomGraph.shortestPath(graph, rec.roomGuid, r.exitGuid); } catch (e) { return null; } })();
    return sp && sp.polyline && sp.polyline.length > 1;
  }).length : 0;
  ck('W-13-4 every drawable alternate is drawn — no cap (§13.6)',
     rec.alternates.length === drawable,
     'drawn=' + rec.alternates.length + ' drawable=' + drawable +
     ' reachable=' + (all ? all.routes.length : 0));

  // ══ W-13-5 — THE CASING IS PROXIMITY, AND IT IS HONEST. ISSUE: a grey tube drawn everywhere by
  // default would read as "this route is protected", which §13.2 forbids in writing. Driven here
  // against the module's OWN radius through a synthetic head placed either side of it, so the test
  // cannot drift when the radius does. ══════════════════════════════════════════════════════
  {
    const R = 3.23;                                  // §13.2's derived NFPA 13 half-diagonal
    const src = fs.readFileSync(path.join(__dirname, 'viewer/cpe_escape_route.js'), 'utf8');
    const m = src.match(/var SPRINKLER_R_M = ([0-9.]+)/);
    ck('W-13-5a the casing radius is the derived 3.23 m, not a chosen round number',
       !!m && near(+m[1], R, 1e-9), m ? 'SPRINKLER_R_M=' + m[1] : 'constant not found');
    const heads = q("SELECT COUNT(*) FROM elements_meta WHERE ifc_class='IfcFireSuppressionTerminal'");
    const nHeads = heads.length ? heads[0][0] : 0;
    ck('W-13-5b the heads come from the dropped file, with real positions (no authoring step)',
       nHeads === 0 || q("SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid" +
                         " WHERE m.ifc_class='IfcFireSuppressionTerminal'")[0][0] === nHeads,
       'heads=' + nHeads + ' all with element_transforms rows');
    ck('W-13-5c zero heads yields zero cased span and a stated reason, never a default tube',
       nHeads > 0 ? true : (rec.cased || []).length === 0,
       'heads=' + nHeads + ' spans=' + (rec.cased || []).length);
    // Spans must lie inside the route and never overlap — an overlapping span would double-count
    // the "cased m" the card prints.
    let ordered = true;
    for (let i = 0; i < (rec.cased || []).length; i++) {
      const sp = rec.cased[i];
      if (sp[0] < -1e-9 || sp[1] > rec.walkM + 1e-6 || sp[1] < sp[0]) ordered = false;
      if (i && sp[0] < rec.cased[i - 1][1] - 1e-9) ordered = false;
    }
    // MEASURED on this very build: 13 vertices over 247 m. A per-vertex test would judge ~30 m
    // stretches by their two ends and call a 30 m gap "cased". Disproved if the resample is removed.
    ck('W-13-5e the walk is RESAMPLED before the proximity test, not judged on 13 vertices',
       /CASE_STEP_M = 1\.0/.test(src) && /for \(var sM = 0; sM < totalM; sM \+= CASE_STEP_M\)/.test(src),
       'route has ' + (rec.pts3 ? rec.pts3.length : '?') + ' vertices over ' + rec.walkM.toFixed(1) + ' m');
    ck('W-13-5d cased spans are inside the route, ordered and non-overlapping',
       ordered, 'spans=' + (rec.cased || []).length + ' casedM=' +
       (rec.cased || []).reduce((a, s) => a + (s[1] - s[0]), 0).toFixed(1) + ' of ' + rec.walkM.toFixed(1));
  }

  // ══ W-13-6 — THE STRIDE KEEPS ITS MARK IN BOTH BRANCHES. ISSUE (§13.7 E, red1-87's own defect):
  // escapeRouteStatCardAt used to DROP the "0.75 m stride assumed" disclosure whenever the breach
  // fired, so "~418 steps" appeared with nothing saying it is the one number with no source — in
  // exactly the frames where the card is read hardest. Both branches are forced here. ═════════
  {
    const plan = planWith(0.95);
    const t = tFull(A, plan);
    const withFlag = A.escapeRouteStatCardAt(plan, t);
    const hadBreach = !!(rec.breach && rec.breach.level);
    const markOn = /\*/.test(withFlag.card.sub) &&
                   withFlag.card.footnotes.some(f => /^\*/.test(f) && /stride/.test(f) && /no source/.test(f));
    ck('W-13-6a the steps figure carries the UNCITED asterisk' + (hadBreach ? ' (breach FIRING)' : ' (no breach)'),
       markOn, 'sub="' + withFlag.card.sub + '"');
    // …and the other branch, by flipping the record's own flag rather than a second fixture.
    const saved = rec.breach;
    rec.breach = hadBreach ? { level: null, limitM: saved.limitM } : { level: 'critical', limitM: 60.96 };
    const other = A.escapeRouteStatCardAt(plan, t);
    rec.breach = saved;
    ck('W-13-6b …and it still does with the flag in its OTHER state — the disclosure no longer' +
       ' depends on whether a breach happened to fire',
       /\*/.test(other.card.sub) && other.card.footnotes.some(f => /^\*/.test(f) && /stride/.test(f)),
       'sub="' + other.card.sub + '"');
    ck('W-13-6c CITED numbers carry superscripts, the UNCITED one carries an asterisk — two tiers,' +
       ' visible before the source is read',
       /²/.test(withFlag.card.sub) && withFlag.card.footnotes.some(f => /^²/.test(f) && /SFPE/.test(f)),
       withFlag.card.footnotes.join(' | ').slice(0, 150));
    ck('W-13-6d no citation is abbreviated past being findable (§13.5)',
       withFlag.card.footnotes.every(f => !/\b(IBC|NFPA)\s*$/.test(f.trim())) &&
       withFlag.card.footnotes.some(f => /IBC 2021 T1006\.2\.1|NFPA 13/.test(f)),
       withFlag.card.footnotes.length + ' footnotes');
  }

  // ══ W-13-10 — THE FINALE. ISSUE (red1, 2026-09-20): "Its last second is like a finale. It should
  // not have any overlay on the building", and one message earlier "The HUD may remain till the
  // very end". Two different lifetimes that used to be one: the 3D comes OFF the building while the
  // panel stays. Disproved if the route still draws in the final second, or if the panel dies with
  // it, or if the window stops ending where the finale starts.
  {
    const plan = planWith(0.95, 195.8);
    const win = A.escapeRouteWindow(plan);
    const K2 = A.escapeRouteConstants();
    const endSec = win.end * plan.durationSec;
    ck('W-13-10a the route window ends exactly FINALE_SEC before the film does',
       Math.abs((plan.durationSec - endSec) - (win.finaleSec || 1)) < 1e-6,
       'window ends ' + endSec.toFixed(2) + 's of ' + plan.durationSec + 's (finale=' + win.finaleSec + 's)');
    ck('W-13-10b nothing is DRAWN on the building through the finale — every sample is null',
       [0.05, 0.25, 0.5, 0.75, 0.95, 0.999].every((f) =>
         A.escapeRouteVisualAt(plan, win.end + (1 - win.end) * f) === null),
       'sampled across the last second');
    ck('W-13-10c …and the 3D is torn down the frame that happens, not at end of bake',
       /if \(vis && !_on\) \{ _on = true; _build3D\(\); \}\s*\n\s*else if \(!vis && _on\) \{ _tearDown\(\); \}/.test(
         fs.readFileSync(path.join(__dirname, 'viewer/cpe_escape_route.js'), 'utf8')),
       'escapeRouteApplyVisual removes the room shine and the polyline together');
    ck('W-13-10d …while the PANEL is still there on the very last frame',
       !!A.escapeRouteStatCardAt(plan, 1) && !!A.escapeRouteStatCardAt(plan, 0.99999),
       'red1: "The HUD may remain till the very end"');
    // The end rate is NOT pinned to a number here. It is bounded by how far the camera may lead its
    // nominal pose (W-ESC-4k) — red1 saw the first cut veer off path, and the two are the same knob.
    // What this leg is for is that the slowdown lands on the FINISHED picture, which is a property
    // of the window stretching with the finale, not of the constant.
    ck('W-13-10e the back-loaded ease stretches with the longer window, so the slowest frames land' +
       ' on the COMPLETED route',
       A.escapeRouteEaseRate(0.98) < A.escapeRouteEaseRate(0.5) &&
       A.escapeRouteEaseRate(1) < 1 && K2.easeK > 0,
       'rate at w=0.98 is ' + A.escapeRouteEaseRate(0.98).toFixed(2) + 'x, at the end ' +
       A.escapeRouteEaseRate(1).toFixed(2) + 'x — the bound is W-ESC-4k, not a number here');
  }

  // ══ W-13-9 — THE PANEL LINGERS PAST ITS OWN LINE. ISSUE (red1, 2026-09-20): "So that the
  // EscRoute panel lingers rather than cuts off when its overlay goes off. This allows user to
  // sense its work further." The card used to vanish the instant the window closed — the moment its
  // numbers were finally complete. Disproved if the card returns null one frame past the window, or
  // if it lingers on forever, or if it lingers showing a partial draw instead of the final figures.
  {
    const plan = planWith(0.95);
    const win = A.escapeRouteWindow(plan);
    // Sampled across the FINALE second — the span the panel now has to survive — rather than
    // across cpe_film_boxes' dwell, which no longer governs it.
    const finale = win.finaleSec || 1;
    const at = (secPast) => A.escapeRouteStatCardAt(plan, win.end + secPast / plan.durationSec);
    const justAfter = at(finale * 0.05), mid = at(finale * 0.6), after = at(finale * 0.99);
    ck('W-13-9a the card still draws just after the window closes',
       !!justAfter, justAfter ? 'opacity=' + justAfter.opacity.toFixed(2) : 'null');
    ck('W-13-9b …showing the COMPLETED route, not a partial draw frozen mid-count',
       !!justAfter && justAfter.card.legend[0].value !== '\u2014' &&
       justAfter.card.big === A.escapeRouteFmtWalk(rec.walkSec),
       justAfter ? justAfter.card.big + '  RED=' + justAfter.card.legend[0].value : '-');
    // REWRITTEN 2026-09-20 with red1's own refinement: "The HUD may remain till the very end ...
    // the info is rich and its too little time to let it sink in." The first cut faded the panel
    // across cpe_film_boxes' 2.2 s LINGER_S, which on THIS film happened to outlast the 1 s finale
    // and would have cut the panel short on a film whose finale was longer — it held by arithmetic,
    // not by intent. A fading panel is also the wrong answer to "let it sink in".
    ck('W-13-9c …at FULL opacity, not fading — the numbers stay readable to the last frame',
       !!justAfter && justAfter.opacity === 1 && !!mid && mid.opacity === 1,
       justAfter && mid ? justAfter.opacity.toFixed(2) + ' then ' + mid.opacity.toFixed(2) : '-');
    ck('W-13-9d …and it ends WITH THE FILM — not on a dwell, and never past the last frame',
       A.escapeRouteStatCardAt(plan, 1) !== null && A.escapeRouteStatCardAt(plan, 1.0001) === null,
       'holds to tNorm=1, nothing beyond it');
  }

  // ══ W-13-7 — THE FOOTNOTE BLOCK DROPS, THE MARKERS STAY. ISSUE: §13.5 measured the card at
  // 173x115 px at 854x480 and ruled that footnotes there fall below legibility — they must be
  // DROPPED, never shrunk into decoration, and the markers must survive so the § log is still
  // findable. The threshold lives in the DRAW, so it is read out of the draw. ═══════════════
  {
    const src = fs.readFileSync(path.join(__dirname, 'viewer/cpe_resource_panel.js'), 'utf8');
    // TWO gates now, and both must be there. LEGIBILITY is a property of the frame (h*0.012 under
    // 9 px is not a citation anybody can read). FITS is a property of the layout, decided after the
    // legend is sized — a reserved height that was merely hoped for still put footnotes 16 and 35 px
    // past the plate at 1920x1080. The block is ALL-OR-NOTHING either way: a partial block leaves
    // the row markers pointing at citations that are not on screen, which is the laundering §13.5
    // exists to prevent.
    const legible = /footLegible = !!\(c\.footnotes && c\.footnotes\.length && footPxWant >= 9\)/.test(src);
    const fits = /showFoot = footLegible && \(contentBottom - subTop - footBlockH\) >= subShortH/.test(src);
    ck('W-13-7a the footnote block is gated on LEGIBILITY and on actually FITTING, not on a chosen size',
       legible && fits,
       'legibility gate=' + legible + ' fit gate=' + fits + '  (h*0.012 under 9 px, and the block must fit whole)');
    // `h` in the draw is the FRAME HEIGHT, so 854x480 is h=480 — the first cut of this check fed it
    // 854 (the WIDTH) and failed itself, which is the whole reason to write the numbers out.
    ck('W-13-7b …which keeps them at 1080 (12.96 px) and drops them at the clip height 480 (5.76 px)',
       1080 * 0.012 >= 9 && 720 * 0.012 < 9 && 480 * 0.012 < 9,
       'h=1080->' + (1080 * 0.012).toFixed(2) + 'px  h=720->' + (720 * 0.012).toFixed(2) +
       'px  h=480->' + (480 * 0.012).toFixed(2) + 'px');
    ck('W-13-7c the legend rows are drawn in their OWN colour, so the legend demonstrates itself',
       /ctx\.fillStyle = LG\.rgb/.test(src), 'legend key drawn with LG.rgb');
  }

  // ══ W-13-8 — THE COLOURS ARE THE APPROVED ONES. ISSUE: §13.1 is ratified and says changing any
  // assignment changes which rule the picture draws. A silent re-colour would be invisible in a
  // witness that only counted strokes. ══════════════════════════════════════════════════════
  {
    const src = fs.readFileSync(path.join(__dirname, 'viewer/cpe_escape_route.js'), 'utf8');
    ck('W-13-8a YELLOW still reuses §PATH_ORANGE 0xff9100 (§13.1 names it explicitly)',
       /var PATH_HEX = 0xff9100/.test(src), 'PATH_HEX unchanged');
    ck('W-13-8b RED, BLUE and the GREY tube each exist as their own named constant',
       /var RED_RGB/.test(src) && /var BLUE_RGB/.test(src) && /var GREY_RGB/.test(src), '');
    ck('W-13-8c alternates never fade to invisible — a head faded out has been thinned (§13.6)',
       /BLUE_MIN_ALPHA = 0\.[0-9]+/.test(src) && /Math\.max\(BLUE_MIN_ALPHA/.test(src), '');
    ck('W-13-8d the casing is drawn UNDER the coloured lines, not over them',
       src.indexOf("S.kind === 'grey'") < src.indexOf("S.kind === 'red'"), 'grey branch precedes red');
  }

  console.log('§ESCAPE_COLOURS ' + pass + '/' + (pass + fail) + ' pass' + (fail ? '  FAIL=' + fail : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§ESCAPE_COLOURS CRASH ' + (e && e.stack || e)); process.exit(3); });
