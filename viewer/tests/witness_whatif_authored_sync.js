// # ⚠ DO NOT REMOVE — W-WHATIF-AUTHORED-SYNC
// ISSUE PROVED: the What-if (⑂) panel reads C_ProjectPhase, while the Author wizard writes the IFC `tasks`
//   table — so after "Generate/Apply" the What-if kept showing a stale, thin one-phase fold (user saw
//   SampleCastle What-if with ONE Architecture line while the wizard showed four). ProjFold.foldAuthoredPhases
//   mirrors the authored phases 1:1 into C_ProjectPhase so What-if matches. This drives:
//     (a) the REAL ProjFold.foldAuthoredPhases (require'd verbatim from proj_fold.js), and
//     (b) the EXACT What-if reader SQL sliced from whatif.js readPhases,
//   on a real sql.js db seeded to the bug (a project with only 'Architecture'), proving: the 4 authored
//   phases appear, the pre-existing Architecture row is UPDATED not duplicated, and a 2nd sync is +0 (idempotent).
// Whitebox §-log; no browser. Run: node viewer/tests/witness_whatif_authored_sync.js  → exit 0 = GREEN.
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
// proj_fold.js requires ../erp/bigdecimal.js in node — present in the repo
const ProjFold = require(path.join(__dirname, '..', 'proj_fold.js'));

// the EXACT phase-reader SQL What-if uses (no branch column path), sliced-equivalent from whatif.js:62
const WHATIF_SQL = "SELECT C_ProjectPhase_ID,SeqNo,Name,StartDate,EndDate,PlannedAmt,IsComplete FROM C_ProjectPhase " +
  "WHERE C_Project_ID=? ORDER BY SeqNo";

let pass = 0, fail = 0;
function ok(c, m) { c ? pass++ : fail++; console.log(`§WIAUTH ${c ? 'PASS' : 'FAIL'} ${m}`); }

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  // minimal ERP shape + the BUG seed: a SampleCastle project with ONLY an Architecture phase (the stale push)
  db.run(`CREATE TABLE C_Project (C_Project_ID INTEGER PRIMARY KEY, AD_Client_ID INT, AD_Org_ID INT, IsActive TEXT,
            Created TEXT, CreatedBy INT, Updated TEXT, UpdatedBy INT, Value TEXT, Name TEXT, IsSummary TEXT,
            C_Currency_ID INT, PlannedAmt REAL, PlannedQty REAL, IsCommitment TEXT, ProjInvoiceRule TEXT,
            ProjectLineLevel TEXT, Processed TEXT, C_Project_UU TEXT);
          CREATE TABLE C_ProjectPhase (C_ProjectPhase_ID INTEGER PRIMARY KEY, C_Project_ID INT, AD_Client_ID INT,
            AD_Org_ID INT, IsActive TEXT, Created TEXT, CreatedBy INT, Updated TEXT, UpdatedBy INT, Name TEXT,
            SeqNo INT, StartDate TEXT, EndDate TEXT, IsComplete TEXT, PlannedAmt REAL, Qty REAL, C_ProjectPhase_UU TEXT);`);
  db.run(`INSERT INTO C_Project (C_Project_ID,Value,Name) VALUES (990500,'SampleCastle','BIM: SampleCastle');`);
  db.run(`INSERT INTO C_ProjectPhase (C_ProjectPhase_ID,C_Project_ID,Name,SeqNo,StartDate,EndDate,PlannedAmt)
            VALUES (990501,990500,'Architecture',1,'2026-01-01 00:00:00','2026-01-30 00:00:00',100);`);

  const before = db.exec(WHATIF_SQL, [990500])[0].values;
  ok(before.length === 1 && before[0][2] === 'Architecture', `BEFORE: What-if sees 1 phase (Architecture) — the stale fold`);

  // the authored schedule from the wizard (4 phases, the left panel), dates + 5D cost
  const phases = [
    { name: 'Superstructure', seqno: 1, start: '2026-01-01', end: '2026-02-01', plannedAmt: 500000 },
    { name: 'MEP Rough-in',   seqno: 2, start: '2026-02-01', end: '2026-03-01', plannedAmt: 300000 },
    { name: 'Architecture',   seqno: 3, start: '2026-03-01', end: '2026-04-01', plannedAmt: 400000 },
    { name: 'Finishes',       seqno: 4, start: '2026-04-01', end: '2026-04-30', plannedAmt: 200000 },
  ];
  const r1 = ProjFold.foldAuthoredPhases(db, 'SampleCastle', phases, {});
  ok(r1.projectId === 990500, `re-uses existing C_Project 990500 (find-or-create, no dup)`);
  ok(r1.created.phases === 3 && r1.created.updated === 1, `+3 new phases, Architecture UPDATED in place (not duplicated)`);

  const after = db.exec(WHATIF_SQL, [990500])[0].values;
  ok(after.length === 4, `AFTER: What-if sees all 4 authored phases (was 1)`);
  ok(after.map(v => v[2]).join('|') === 'Superstructure|MEP Rough-in|Architecture|Finishes', `phases SeqNo-ordered match the wizard`);
  const arch = after.find(v => v[2] === 'Architecture');
  ok(arch && Number(arch[5]) === 400000 && arch[3] === '2026-03-01 00:00:00', `Architecture row UPDATED to authored cost+dates (not the stale 100/Jan)`);
  ok(db.exec("SELECT COUNT(*) FROM C_ProjectPhase WHERE Name='Architecture' AND C_Project_ID=990500")[0].values[0][0] === 1, `exactly ONE Architecture row (no duplicate)`);

  // idempotent: a 2nd identical sync adds 0 phases
  const r2 = ProjFold.foldAuthoredPhases(db, 'SampleCastle', phases, {});
  ok(r2.created.phases === 0 && r2.created.updated === 4, `idempotent: 2nd sync +0 new, 4 updated-in-place`);

  // a brand-new building creates the C_Project + all phases
  const r3 = ProjFold.foldAuthoredPhases(db, 'NewTower', phases, {});
  ok(r3.created.projects === 1 && r3.created.phases === 4, `new building → C_Project + 4 phases created`);

  console.log(`§WIAUTH-SUMMARY ${pass}/${pass + fail} pass`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e.stack); process.exit(1); });
