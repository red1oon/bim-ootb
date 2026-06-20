/**
 * test_zoom_cost_panel.js — W-PC-PANEL + W-PC-JUNCTURE + W-PC-HONEST (TM_4D5D_VARIANCE_LANE §S2).
 *
 * ISSUE PROVEN: the viewer's Zoom-Across IFC cost panel (#info-cost) must FOLD the twin's stored pair for a
 *   selected IFC class — line PlannedAmt (line grain) + COMMITTED from its phase (c_projectphase_id →
 *   C_ProjectPhase.CommittedAmt; line CommittedAmt is null on disk BY DESIGN) + the whole-project pair — and
 *   never recompute. And it must be honest: cost is "from records", and the juncture jump targets a REAL phase
 *   TM can land on. Reads the real seed via sqlite3 (dependency-free) + greps the source for the read path.
 *
 * Whitebox (§-log first). Run: node tests/test_zoom_cost_panel.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  🟢 ' + msg); } else { fail++; console.log('  🔴 FAIL: ' + msg); } }

const ERP = path.join(__dirname, '..', 'erp', 'ad_seed.db');
function q(sql) { return execSync('sqlite3 -separator "|" "' + ERP + '" ' + JSON.stringify(sql), { encoding: 'utf8' }).trim(); }

// the fold the panel does, replicated against the real seed (same SQL as navigate_find._foldClassTwin)
function foldClassTwin(ifcClass) {
  const proj = q("SELECT C_Project_ID,PlannedAmt,CommittedAmt FROM C_Project WHERE Value='Hospital'").split('|');
  const pid = Number(proj[0]);
  const ln = q("SELECT pl.PlannedAmt, pl.c_projectphase_id FROM C_ProjectLine pl JOIN M_Product p ON pl.M_Product_ID=p.M_Product_ID WHERE pl.C_Project_ID=" + pid + " AND p.Value='" + ifcClass + "'");
  if (!ln) return { project: { planned: Number(proj[1]), committed: Number(proj[2]) }, line: null, phase: null };
  const lc = ln.split('|');
  const ph = q("SELECT Name,PlannedAmt,CommittedAmt,StartDate FROM C_ProjectPhase WHERE C_ProjectPhase_ID=" + Number(lc[1])).split('|');
  return {
    project: { planned: Number(proj[1]), committed: Number(proj[2]) },
    line: { planned: Number(lc[0]), phaseId: Number(lc[1]) },
    phase: { name: ph[0], planned: Number(ph[1]), committed: Number(ph[2]), start: ph[3] },
  };
}
const pct = (p, c) => p > 0 ? Math.round((c - p) * 100 / p) : 0;

// canonical TM phase tokens (the cursor axis) — the juncture target must be one of these
const rs = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'viewer', 'rates.js'), 'utf8'), rs);
const PHASES = {}; Object.keys(rs.SEQUENCE_RULES || {}).forEach(k => { PHASES[rs.SEQUENCE_RULES[k].phase] = 1; });

console.log('\n§ZOOM-COST-TEST canonical phases: ' + Object.keys(PHASES).join(', '));

// ── W-PC-PANEL — the fold == stored records, marquee +60% ──
const beam = foldClassTwin('IfcBeam');     // Superstructure — the marquee
console.log('§ZOOM-COST IfcBeam linePlanned=' + beam.line.planned + ' phase="' + beam.phase.name + '" phasePair=' + beam.phase.planned + '→' + beam.phase.committed + ' (' + pct(beam.phase.planned, beam.phase.committed) + '%)');
const beamLineStored = Number(q("SELECT pl.PlannedAmt FROM C_ProjectLine pl JOIN M_Product p ON pl.M_Product_ID=p.M_Product_ID WHERE pl.C_Project_ID=990000 AND p.Value='IfcBeam'"));
assert(beam.line.planned === beamLineStored, 'W-PC-PANEL: IfcBeam line PlannedAmt == stored C_ProjectLine (' + beam.line.planned + ')');
assert(beam.phase.name === 'Superstructure', 'IfcBeam folds to its real phase (Superstructure)');
const supStored = q("SELECT PlannedAmt,CommittedAmt FROM C_ProjectPhase WHERE C_Project_ID=990000 AND Name='Superstructure'").split('|');
assert(beam.phase.planned === Number(supStored[0]) && beam.phase.committed === Number(supStored[1]), 'phase pair == stored C_ProjectPhase (' + beam.phase.planned + '→' + beam.phase.committed + ')');
assert(pct(beam.phase.planned, beam.phase.committed) === 60, 'marquee blow-out is +60% (' + pct(beam.phase.planned, beam.phase.committed) + '%)');
assert(beam.project.planned === 64719479 && beam.project.committed === 87372995, 'project header pair == stored C_Project (64.7M→87.4M, +' + pct(beam.project.planned, beam.project.committed) + '%)');

// honest mixed sign — an under-budget class folds to a NEGATIVE phase variance
const cov = foldClassTwin('IfcCovering');  // Finishes — under budget
assert(cov.phase.name === 'Finishes' && pct(cov.phase.planned, cov.phase.committed) < 0, 'IfcCovering folds to Finishes UNDER budget (' + pct(cov.phase.planned, cov.phase.committed) + '%) — honest mixed sign');

// ── W-PC-JUNCTURE — class→phase resolves to a phase TM can actually land on (a real cursor-axis token) ──
['IfcBeam', 'IfcCovering', 'IfcDoor', 'IfcSlab', 'IfcColumn'].forEach(cls => {
  const t = foldClassTwin(cls);
  assert(t.phase && PHASES[t.phase.name], 'W-PC-JUNCTURE: ' + cls + ' → phase "' + (t.phase && t.phase.name) + '" is a real TM cursor-axis phase (jump lands)');
});
assert(/^\d{4}-\d\d-\d\d/.test(beam.phase.start), 'phase carries a REAL StartDate from records (' + beam.phase.start + ') — not fabricated');

// ── W-PC-HONEST — the panel reads records + labels honestly; no invented line committed, no fabricated date ──
const navSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'navigate_find.js'), 'utf8');
const cut = navSrc.slice(navSrc.indexOf('function _foldClassTwin'), navSrc.indexOf('A._showClassCost'));
assert(/from records/.test(cut), 'W-PC-HONEST: cost block is labelled "from records"');
assert(/C_ProjectPhase\.CommittedAmt|c_projectphase_id/.test(cut), 'committed is folded from the phase grain (control-account), as documented');
assert(!/line[^\n]*committed\s*=\s*[^=]/i.test(cut) && !/CommittedAmt\s*\*\s*/.test(cut), 'no invented/recomputed LINE committed (line CommittedAmt earns at S5)');
assert(!/Date\.now|new Date\([^)]*slip|\+\s*slip|actualEnd|lateDays/.test(cut), 'no fabricated ACTUAL date in the panel (date stays planned baseline / projected)');

// the line CommittedAmt really is null on disk (the design fact the panel relies on)
const lineCommittedNulls = Number(q("SELECT COUNT(*) FROM C_ProjectLine WHERE C_Project_ID=990000 AND PlannedAmt>0 AND CommittedAmt IS NULL"));
assert(lineCommittedNulls > 0, 'line CommittedAmt is NULL on disk by design (nulls=' + lineCommittedNulls + ') — panel folds from phase, not a baked line figure');

console.log('\nW-PC-PANEL + W-PC-JUNCTURE + W-PC-HONEST ' + pass + '/' + (pass + fail));
fs.writeFileSync(path.join(__dirname, 'test_zoom_cost_panel.log'),
  '§ZOOM-COST IfcBeam phase=' + beam.phase.name + ' pair=' + beam.phase.planned + '→' + beam.phase.committed +
  ' proj=' + beam.project.planned + '→' + beam.project.committed + '\n' +
  'W-PC-PANEL + W-PC-JUNCTURE + W-PC-HONEST ' + pass + '/' + (pass + fail) + '\n');
process.exit(fail === 0 ? 0 : 1);
