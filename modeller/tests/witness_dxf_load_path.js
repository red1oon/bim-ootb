#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LOAD-PATH: prompts/DXF2BIM_ARCHITECT_REVIEW.md §D100 BUILD SPEC. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES (owner 2026-10-31: the bay "does not add a column support along the extended wall"): over the shed's lines 36–41 the beams at 3.10 m sit on
 * columns that stop at 1.52 m, and no rule said so — floating_member accepts a beam framing into another beam (the frame holds itself up) and a truss part resting ON the beam.
 *   P1 CARRIED   — a frame of 4 beams on 4 full columns + a secondary beam framing into two of them: 5 carried, 0 findings (the chain from the columns is followed).
 *   P2 SELF-HELD — the same columns cut 1.5 m short, a gusset plate resting on each corner: floating_member reads all 4 beams supported (the scope-blind case); load_path flags all 4.
 *   P3 ONE PATH  — all four columns short but ONE: every beam of the frame reaches the ground through the chain from that column (0 findings); a frame with no full column: 4.
 *   P4 THE SHED  — the CLI-marked shed (--complete, column.top_under_beam=as_drawn: the columns as the drawing draws them) through the shipped extractor: findings = exactly the long-wall beams over the bays between lines 36 and 41 (both walls),
 *                  floating_member / span_depth_cantilever / column_continuity unchanged from main (0 / 1 / 0).
 *   P5 PARITY    — FALLBACK_RULES carries load_path and so does viewer/rates/structural_rules.json.
 * Input for P4: SHED_MARKED (default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> P4 skipped (printed, not judged).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..'), SS = require(path.join(ROOT, 'viewer', 'structural_sanity.js'));
let fail = 0, judged = 0; const ok = (n, c, i) => { judged++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const row = (g, cx, cy, cz, bx, by, bz) => [g, g, 'L1', cx, cy, cz, bx, by, bz];
const col = (g, x, y, top) => row(g, x, y, top / 2, 0.3, 0.3, top), plate = (g, x, y) => row(g, x, y, 3.5, 0.3, 0.3, 0.4);
const beams = [row('Bx0', 2, 0, 3.15, 4, 0.3, 0.3), row('Bx4', 2, 4, 3.15, 4, 0.3, 0.3), row('By0', 0, 2, 3.15, 0.3, 4, 0.3), row('By4', 4, 2, 3.15, 0.3, 4, 0.3)];
const corners = [[0, 0], [4, 0], [0, 4], [4, 4]];
const judge = (bs, sup) => { const s = SS._supportChecks(bs, sup, 0.15, 0.4, null, bs), L = SS._loadPath(bs, s); return { s, L, find: L.cand.filter(b => !L.carried[b[0]]).map(b => b[0]).sort(), floating: bs.filter(b => s[b[0]].supportedCount === 0).length }; };
// P1
const sec = row('S2', 2, 2, 3.15, 0.3, 4, 0.3), P1 = judge(beams.concat([sec]), corners.map((c, i) => col('C' + i, c[0], c[1], 3.0)));
ok('P1 CARRIED 4 full columns: the 4 frame beams + the secondary framing into two of them carried, 0 findings', Object.keys(P1.L.carried).length === 5 && P1.find.length === 0, 'carried=' + Object.keys(P1.L.carried).sort().join(','));
// P2
const P2 = judge(beams, corners.map((c, i) => col('C' + i, c[0], c[1], 1.5)).concat(corners.map((c, i) => plate('G' + i, c[0], c[1]))));
ok('P2 SELF-HELD columns 1.5 m short, a plate resting on each corner: floating_member flags ' + P2.floating + ' (scope-blind), load_path flags ' + P2.find.length + ' (' + P2.find.join(',') + ')', P2.floating === 0 && P2.find.length === 4,
  'ends ' + beams.map(b => b[0] + ':' + P2.s[b[0]].endsBy.join('/')).join(' '));
// P3
const P3 = judge(beams, corners.map((c, i) => col('C' + i, c[0], c[1], i === 0 ? 3.0 : 1.5)).concat(corners.map((c, i) => plate('G' + i, c[0], c[1]))));
ok('P3 ONE PATH one full column under a self-held frame: all 4 beams reach the ground through the chain (findings ' + P3.find.length + '); P2 without it: ' + P2.find.length, P3.find.length === 0 && Object.keys(P3.L.carried).length === 4 && P2.find.length === 4,
  'ends ' + beams.map(b => b[0] + ':' + P3.s[b[0]].endsBy.join('/')).join(' '));
// P4
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
(async () => {
  if (!fs.existsSync(MK)) console.log('§LOAD_PATH_SHED_SKIP no marked shed set at ' + MK + ' — P4 not judged');
  else {
    const C = require(path.join(ROOT, 'modeller', 'dxf2bim_cli.js')), out = path.join(os.tmpdir(), 'w_load_path_' + process.pid);
    const args = C.parseArgs(['--sheets', ...fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f)), '--out', out, '--pack', 'pwd2024_bd', '--complete', '--ifc', '--choice', 'column.top_under_beam=as_drawn']);   // the model AS DRAWN (§D100 (b) defaults those columns up to their beams: W-COL-TO-BEAM K1/K2)
    const res = C.run(args, () => {}); C.write(res, out); await C.writeIfc(res, out);
    let W; for (const m of ['web-ifc', path.join(os.homedir(), 'bim-compiler/node_modules/web-ifc')]) { try { W = require(m); break; } catch (e) { /* next */ } }
    let Q; for (const m of ['sql.js', path.join(os.homedir(), 'bim-compiler/node_modules/sql.js')]) { try { Q = require(m); break; } catch (e) { /* next */ } }
    const api = new W.IfcAPI(); await api.Init(); const SQL = await Q(), db = new SQL.Database(), Core = require(path.join(ROOT, 'modeller', 'dxf2bim', 'ifc_extract_core.js'));
    await Core.extractToDb({ WebIFC: W, ifcApi: api, ifcData: new Uint8Array(fs.readFileSync(path.join(out, 'model.ifc'))), db: Core.sqljsDb(db), Buf: Core.browserBuf, buildingName: 'M', sourceName: 'model.ifc', log: () => {} });
    const q = (s, p) => { const r = p ? db.exec(s, p) : db.exec(s); return r.length ? r[0].values : []; }, cov = {}, lines = [];
    const rows = SS.evaluate(q, JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'structural_rules.json'), 'utf8')), { log: l => lines.push(l), coverage: cov });
    lines.filter(l => /rule=(load_path|floating_member|span_depth_cantilever|column_continuity) /.test(l)).forEach(l => console.log('  ' + l));
    const xc = {}; q("SELECT em.guid, et.center_x, et.center_y, et.bbox_x FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid WHERE em.ifc_class = 'IfcBeam'").forEach(v => { xc[v[0]] = v; });
    // the column lines from the model's own columns (x of each column), and their tops: the block between the first and last line whose columns stop under the beams
    const cols = q("SELECT et.center_x, et.center_z + et.bbox_z / 2 FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid WHERE em.ifc_class = 'IfcColumn'");
    const tops = {}; cols.forEach(c => { const k = (+c[0]).toFixed(2); tops[k] = Math.max(tops[k] || -1e9, +c[1]); });
    const lx = Object.keys(tops).map(Number).sort((a, b) => a - b), shortL = lx.filter(x => tops[x.toFixed(2)] < 2.0), lo = Math.min(...shortL), hi = Math.max(...shortL);
    const lp = rows.filter(r => r.rule === 'load_path'), inBlock = lp.filter(r => { const v = xc[r.guid]; return v && (+v[1]) > lo && (+v[1]) < hi; });
    const want = Object.values(xc).filter(v => +v[3] > 1 && (+v[1]) > lo && (+v[1]) < hi).length;   // the long-wall beams (long in x) with their centre between the short lines' ends
    ok('P4 THE SHED load_path flags ' + lp.length + ' beams = the ' + want + ' long-wall beams between the short-column lines (x ' + lo.toFixed(2) + '..' + hi.toFixed(2) + ', columns to ' + Math.max(...shortL.map(x => tops[x.toFixed(2)])).toFixed(2) + ' m); floating / cantilever / continuity = 0 / 1 / 0 as on main',
      lp.length === want && inBlock.length === lp.length && want === 10 && cov.floating_member.findings === 0 && cov.span_depth_cantilever.findings === 1 && cov.column_continuity.findings === 0,
      'short lines ' + shortL.length + ' | in block ' + inBlock.length + ' | floating ' + cov.floating_member.findings + ' cantilever ' + cov.span_depth_cantilever.findings + ' continuity ' + cov.column_continuity.findings);
  }
  // P5
  const J = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'rates', 'structural_rules.json'), 'utf8')).structural_rules.map(r => r.name).sort(), F = SS.FALLBACK_RULES.structural_rules.map(r => r.name).sort();
  ok('P5 PARITY the fallback literal and structural_rules.json name the same rules, load_path in both', JSON.stringify(J) === JSON.stringify(F) && J.indexOf('load_path') >= 0, 'json=' + J.join(',') + ' | fallback=' + F.join(','));
  console.log(fail ? '§VERDICT FAIL W-LOAD-PATH judged=' + judged + ' fail=' + fail : '§VERDICT PASS W-LOAD-PATH judged=' + judged + ' fail=0'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.stack); process.exit(1); });
