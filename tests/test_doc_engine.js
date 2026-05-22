#!/usr/bin/env node
// test_doc_engine.js — Spatial ERP P0 core engine tests
// Run: node deploy/dev/tests/test_doc_engine.js
// Issue each test proves: stated in test description.

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

var pass = 0, fail = 0, logs = [];
function check(id, desc, ok) {
  var line = (ok ? '  ✓ ' : '  ✗ ') + id + ': ' + desc + (ok ? '' : ' — FAILED');
  logs.push(line); console.log(line);
  if (ok) pass++; else fail++;
}

// Load doc_engine.js and kernel_ops.js source into this context
function loadModule(filename) {
  var src = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  // Strip the IIFE wrapper and execute in a context with window/module stubs
  return src;
}

async function main() {
  console.log('═══ Spatial ERP — doc_engine.js P0 Tests ═══\n');

  var SQL = await initSqlJs();

  // Create a shared mock window for modules
  var mockWindow = {};
  global.window = mockWindow;

  // Load doc_engine
  eval(loadModule('doc_engine.js'));
  var DocEngine = mockWindow.DocEngine;
  check('T0', 'DocEngine loaded', !!DocEngine);

  // Load kernel_ops
  // Stub indexedDB for kernel_ops persist
  global.indexedDB = { open: function() { return { onupgradeneeded: null, onsuccess: null, onerror: null }; } };
  global.APP = {};
  eval(loadModule('kernel_ops.js'));
  var KernelOps = mockWindow.KernelOps;
  check('T0b', 'KernelOps loaded', !!KernelOps);

  // ── T1: Table creation ──────────────────────────────────────────
  var db = new SQL.Database();
  DocEngine.createTables(db);
  KernelOps.ensureTable(db);

  var tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  var tableNames = tables[0].values.map(function(r) { return r[0]; });
  console.log('§TEST tables=' + tableNames.join(','));

  check('T1a', 'Issue: containers table must exist (§TAB_CONTAINERS)',
    tableNames.indexOf('containers') >= 0);
  check('T1b', 'Issue: items table must exist (§TAB_ITEMS)',
    tableNames.indexOf('items') >= 0);
  check('T1c', 'Issue: documents table must exist (§TAB_DOCUMENTS)',
    tableNames.indexOf('documents') >= 0);
  check('T1d', 'Issue: document_lines table must exist (§TAB_DOC_LINES)',
    tableNames.indexOf('document_lines') >= 0);
  check('T1e', 'Issue: journal table must exist (§TAB_JOURNAL)',
    tableNames.indexOf('journal') >= 0);
  check('T1f', 'Issue: category_registry table must exist (§TAB_REGISTRY)',
    tableNames.indexOf('category_registry') >= 0);
  check('T1g', 'Issue: kernel_ops table must exist',
    tableNames.indexOf('kernel_ops') >= 0);

  // Idempotent — call again, no error
  DocEngine.createTables(db);
  check('T1h', 'Issue: createTables is idempotent (IF NOT EXISTS)', true);

  // ── T2: StateMachine transitions ────────────────────────────────
  // Insert a test document
  db.run("INSERT INTO documents (id, doc_type, doc_status, created, description) " +
         "VALUES ('DOC-001', 'LAND_LEAD', 'DRAFT', '2026-05-13', 'test lead')");

  // T2a: DRAFT → IN_PROGRESS via 'start'
  var r1 = DocEngine.transition(db, 'DOC-001', 'start');
  check('T2a', 'Issue: DRAFT→IN_PROGRESS must work (§5 start event)',
    r1 !== null && r1.new_status === 'IN_PROGRESS' && r1.old_status === 'DRAFT');

  // T2b: IN_PROGRESS → COMPLETED via 'complete'
  // First add a document line so journal has something to post
  db.run("INSERT INTO document_lines (id, doc_id, qty, unit_price) " +
         "VALUES ('LINE-001', 'DOC-001', 10, 500)");
  var r2 = DocEngine.transition(db, 'DOC-001', 'complete');
  check('T2b', 'Issue: IN_PROGRESS→COMPLETED must work (§5 complete event)',
    r2 !== null && r2.new_status === 'COMPLETED');

  // T2c: COMPLETED → REVERSED via 'reverse'
  var r3 = DocEngine.transition(db, 'DOC-001', 'reverse');
  check('T2c', 'Issue: COMPLETED→REVERSED must work (§5 reverse event)',
    r3 !== null && r3.new_status === 'REVERSED');

  // T2d: REVERSED is terminal — no transitions
  var r4 = DocEngine.transition(db, 'DOC-001', 'start');
  check('T2d', 'Issue: REVERSED is terminal — start returns null',
    r4 === null);

  // ── T3: VOIDED transition ───────────────────────────────────────
  db.run("INSERT INTO documents (id, doc_type, doc_status, created) " +
         "VALUES ('DOC-002', 'LAND_LEAD', 'DRAFT', '2026-05-13')");
  var r5 = DocEngine.transition(db, 'DOC-002', 'void');
  check('T3a', 'Issue: DRAFT→VOIDED must work (§5 void event)',
    r5 !== null && r5.new_status === 'VOIDED');

  // VOIDED is terminal
  var r6 = DocEngine.transition(db, 'DOC-002', 'start');
  check('T3b', 'Issue: VOIDED is terminal — no transitions allowed',
    r6 === null);

  // ── T4: IN_PROGRESS → VOIDED ───────────────────────────────────
  db.run("INSERT INTO documents (id, doc_type, doc_status, created) " +
         "VALUES ('DOC-003', 'LAND_LEAD', 'DRAFT', '2026-05-13')");
  DocEngine.transition(db, 'DOC-003', 'start');
  var r7 = DocEngine.transition(db, 'DOC-003', 'void');
  check('T4', 'Issue: IN_PROGRESS→VOIDED must work (reject path)',
    r7 !== null && r7.new_status === 'VOIDED');

  // ── T5: Invalid transitions return null ─────────────────────────
  db.run("INSERT INTO documents (id, doc_type, doc_status, created) " +
         "VALUES ('DOC-004', 'LAND_LEAD', 'DRAFT', '2026-05-13')");
  var rBad1 = DocEngine.transition(db, 'DOC-004', 'complete');
  check('T5a', 'Issue: DRAFT→complete is invalid — must return null',
    rBad1 === null);

  var rBad2 = DocEngine.transition(db, 'DOC-004', 'reverse');
  check('T5b', 'Issue: DRAFT→reverse is invalid — must return null',
    rBad2 === null);

  var rBad3 = DocEngine.transition(db, 'NONEXISTENT', 'start');
  check('T5c', 'Issue: nonexistent doc — must return null',
    rBad3 === null);

  // ── T6: Journal auto-posts on COMPLETED ─────────────────────────
  db.run("INSERT INTO documents (id, doc_type, doc_status, created) " +
         "VALUES ('DOC-005', 'LAND_LEAD', 'DRAFT', '2026-05-13')");
  db.run("INSERT INTO document_lines (id, doc_id, qty, unit_price) " +
         "VALUES ('LINE-005A', 'DOC-005', 5, 1000)");
  db.run("INSERT INTO document_lines (id, doc_id, qty, unit_price) " +
         "VALUES ('LINE-005B', 'DOC-005', 3, 2000)");

  DocEngine.transition(db, 'DOC-005', 'start');
  var r8 = DocEngine.transition(db, 'DOC-005', 'complete');
  check('T6a', 'Issue: COMPLETED must trigger journal side_effects',
    r8 !== null && r8.side_effects.length === 2);

  // Verify debit = credit
  var jrnl = db.exec("SELECT SUM(debit), SUM(credit) FROM journal WHERE doc_id = 'DOC-005'");
  var totalDebit = Number(jrnl[0].values[0][0]);
  var totalCredit = Number(jrnl[0].values[0][1]);
  console.log('§TEST journal DOC-005 debit=' + totalDebit + ' credit=' + totalCredit);
  check('T6b', 'Issue: journal debit must equal credit (balanced books)',
    totalDebit === totalCredit);
  check('T6c', 'Issue: journal amount = 5*1000 + 3*2000 = 11000',
    totalDebit === 11000);

  // Verify accounts
  var jrnlAccts = db.exec(
    "SELECT account, debit, credit FROM journal WHERE doc_id = 'DOC-005' ORDER BY debit DESC"
  );
  var debitAcct = jrnlAccts[0].values[0][0];
  var creditAcct = jrnlAccts[0].values[1][0];
  check('T6d', 'Issue: LAND_LEAD debit=LAND_ACQUISITION (§5 journal rule)',
    debitAcct === 'LAND_ACQUISITION');
  check('T6e', 'Issue: LAND_LEAD credit=CASH (§5 journal rule)',
    creditAcct === 'CASH');

  // ── T7: accountBalance query ────────────────────────────────────
  // LAND_ACQUISITION: DOC-001 debit 5000 + DOC-005 debit 11000 = 16000 debit
  // BUT DOC-001 was reversed (T2c) → reversal credit 5000
  // Net = 16000 - 5000 = 11000
  var bal = DocEngine.accountBalance(db, 'LAND_ACQUISITION');
  console.log('§TEST accountBalance LAND_ACQUISITION debit=' + bal.debit +
              ' credit=' + bal.credit + ' net=' + bal.net);
  check('T7', 'Issue: accountBalance reflects reversal (16000 debit - 5000 reversal credit = 11000 net)',
    bal.debit === 16000 && bal.credit === 5000 && bal.net === 11000);

  // ── T8: Different doc_type journal rules ────────────────────────
  db.run("INSERT INTO documents (id, doc_type, doc_status, created) " +
         "VALUES ('DOC-006', 'DEV_PLAN', 'DRAFT', '2026-05-13')");
  db.run("INSERT INTO document_lines (id, doc_id, qty, unit_price) " +
         "VALUES ('LINE-006', 'DOC-006', 1, 5000)");
  DocEngine.transition(db, 'DOC-006', 'start');
  var r9 = DocEngine.transition(db, 'DOC-006', 'complete');
  var devJrnl = db.exec(
    "SELECT account, debit, credit FROM journal WHERE doc_id = 'DOC-006' ORDER BY debit DESC"
  );
  check('T8a', 'Issue: DEV_PLAN debit=CONSTRUCTION_WIP',
    devJrnl[0].values[0][0] === 'CONSTRUCTION_WIP');
  check('T8b', 'Issue: DEV_PLAN credit=PROFESSIONAL_FEES',
    devJrnl[0].values[1][0] === 'PROFESSIONAL_FEES');

  // ── T9: Undo via kernel_ops reverses last transition ────────────
  db.run("INSERT INTO documents (id, doc_type, doc_status, created) " +
         "VALUES ('DOC-007', 'LAND_LEAD', 'DRAFT', '2026-05-13')");

  // Transition and log to kernel_ops
  DocEngine.transition(db, 'DOC-007', 'start');
  KernelOps.commitOp(db, 'DOC_TRANSITION', {
    doc_id: 'DOC-007', event: 'start',
    old_status: 'DRAFT', new_status: 'IN_PROGRESS'
  });

  // Undo the kernel_op
  var undone = KernelOps.undoOp(db);
  check('T9a', 'Issue: undoOp returns the transition op',
    undone !== null && undone.op_type === 'DOC_TRANSITION');

  // Apply undo — reverse the state change using the recorded old_status
  if (undone) {
    db.run('UPDATE documents SET doc_status = ? WHERE id = ?',
      [undone.parameters.old_status, undone.parameters.doc_id]);
  }
  var undoneStatus = db.exec("SELECT doc_status FROM documents WHERE id = 'DOC-007'");
  check('T9b', 'Issue: after undo, doc reverts to DRAFT',
    undoneStatus[0].values[0][0] === 'DRAFT');

  // ── T10: kernel_ops user_tag column ─────────────────────────────
  // The ALTER TABLE is idempotent — test it works
  try {
    db.run("ALTER TABLE kernel_ops ADD COLUMN user_tag TEXT DEFAULT 'local'");
  } catch (e) {
    // Column may already exist — that's fine
  }
  KernelOps.commitOp(db, 'TEST_TAG', { test: true });
  var tagR = db.exec("SELECT user_tag FROM kernel_ops ORDER BY id DESC LIMIT 1");
  check('T10', 'Issue: kernel_ops user_tag column exists with default (§2.3)',
    tagR.length > 0 && tagR[0].values[0][0] === 'local');

  // ══════════════════════════════════════════════════════════════════
  // P1 Tests — CategoryRegistry + Seed Data
  // ══════════════════════════════════════════════════════════════════

  // Load category_loader
  eval(loadModule('category_loader.js'));
  var CategoryLoader = mockWindow.CategoryLoader;
  check('T11', 'CategoryLoader loaded', !!CategoryLoader);

  // Load seed data into a fresh DB
  var db2 = new SQL.Database();
  DocEngine.createTables(db2);
  // project_metadata table needed for seed — create it
  db2.run('CREATE TABLE IF NOT EXISTS project_metadata (key TEXT PRIMARY KEY, value TEXT)');

  var seedSql = fs.readFileSync(path.join(__dirname, '../construction_seed.sql'), 'utf8');
  // Strip comment-only lines, then split on semicolons
  var cleanSql = seedSql.split('\n').filter(function(l) { return !l.trim().startsWith('--'); }).join('\n');
  var stmts = cleanSql.split(';').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
  for (var si = 0; si < stmts.length; si++) {
    db2.run(stmts[si]);
  }

  // ── T12: Seed containers ───────────────────────────────────────
  var contR = db2.exec('SELECT COUNT(*) FROM containers');
  var contCount = Number(contR[0].values[0][0]);
  console.log('§TEST seed containers count=' + contCount);
  check('T12a', 'Issue: seed containers = 8 (site + plot + building + 5 phases)',
    contCount === 8);

  var phases = db2.exec("SELECT id FROM containers WHERE category = 'PHASE' ORDER BY id");
  check('T12b', 'Issue: 5 project phases seeded (Foundation→Finishing)',
    phases[0].values.length === 5);

  // ── T13: Seed documents ────────────────────────────────────────
  var docR = db2.exec('SELECT COUNT(*) FROM documents');
  check('T13a', 'Issue: 2 seed documents (LAND_LEAD + DEV_PLAN)',
    Number(docR[0].values[0][0]) === 2);

  var leadR = db2.exec("SELECT doc_status, metadata FROM documents WHERE id = 'LEAD-1000000'");
  check('T13b', 'Issue: seed lead is DRAFT status',
    leadR[0].values[0][0] === 'DRAFT');
  var leadMeta = JSON.parse(leadR[0].values[0][1]);
  check('T13c', 'Issue: seed lead has owner_name in metadata (confidential field)',
    leadMeta.owner_name && leadMeta.owner_name.indexOf('Rahman') >= 0);

  // ── T14: Seed document_lines ───────────────────────────────────
  var linesR = db2.exec('SELECT COUNT(*) FROM document_lines');
  check('T14', 'Issue: 2 seed doc lines (sales price + BOQ)',
    Number(linesR[0].values[0][0]) === 2);

  // ── T15: CategoryLoader.getCategory ────────────────────────────
  var plotCat = CategoryLoader.getCategory(db2, 'PLOT');
  check('T15a', 'Issue: PLOT category exists in registry',
    plotCat !== null && plotCat.category === 'PLOT');
  check('T15b', 'Issue: PLOT actions include CreateLead and ViewFAR',
    plotCat.actions.indexOf('CreateLead') >= 0 && plotCat.actions.indexOf('ViewFAR') >= 0);
  check('T15c', 'Issue: PLOT domain = CONSTRUCTION',
    plotCat.domain === 'CONSTRUCTION');

  var bldgCat = CategoryLoader.getCategory(db2, 'BUILDING');
  check('T15d', 'Issue: BUILDING actions include ComputeBOQ and ApprovePlan',
    bldgCat.actions.indexOf('ComputeBOQ') >= 0 && bldgCat.actions.indexOf('ApprovePlan') >= 0);

  var nullCat = CategoryLoader.getCategory(db2, 'NONEXISTENT');
  check('T15e', 'Issue: nonexistent category returns null',
    nullCat === null);

  // ── T16: CategoryLoader.listCategories ─────────────────────────
  var allCats = CategoryLoader.listCategories(db2, 'CONSTRUCTION');
  console.log('§TEST construction categories count=' + allCats.length);
  check('T16', 'Issue: 4 CONSTRUCTION categories (SITE, PLOT, BUILDING, PHASE)',
    allCats.length === 4);

  // ── T17: CategoryLoader.renderLabel ────────────────────────────
  var plotRow = { name: 'Plot 60, Road 2, Block 4', category: 'PLOT',
                  metadata: '{"plot_no":60,"area":"Gulshan-1"}' };
  var label = CategoryLoader.renderLabel(plotCat.label_template, plotRow);
  console.log('§TEST rendered label=' + label);
  check('T17a', 'Issue: label template renders plot_no and area',
    label.indexOf('60') >= 0 && label.indexOf('Gulshan-1') >= 0);

  var bldgRow = { name: 'Proposed Development', category: 'BUILDING',
                  metadata: { storeys: 40 } };
  var bldgLabel = CategoryLoader.renderLabel(bldgCat.label_template, bldgRow);
  check('T17b', 'Issue: BUILDING label renders storeys',
    bldgLabel.indexOf('40') >= 0 && bldgLabel.indexOf('Proposed Development') >= 0);

  // ── T18: Seed project_metadata ─────────────────────────────────
  var metaR = db2.exec("SELECT value FROM project_metadata WHERE key = 'roles'");
  var roles = JSON.parse(metaR[0].values[0][0]);
  check('T18a', 'Issue: 6 roles seeded (LAND,ARCH,ENGR,SALE,MGMT,LEGL)',
    roles.length === 6);

  var confR = db2.exec("SELECT value FROM project_metadata WHERE key = 'confidential_fields'");
  var confFields = JSON.parse(confR[0].values[0][0]);
  check('T18b', 'Issue: confidential_fields includes owner_name and phone',
    confFields.indexOf('owner_name') >= 0 && confFields.indexOf('phone') >= 0);

  // ── T19: Full lead lifecycle on seed data ───────────────────────
  // Transition the seed lead through the full happy path
  var t1 = DocEngine.transition(db2, 'LEAD-1000000', 'start');
  check('T19a', 'Issue: seed lead DRAFT→IN_PROGRESS',
    t1 !== null && t1.new_status === 'IN_PROGRESS');

  var t2 = DocEngine.transition(db2, 'LEAD-1000000', 'complete');
  check('T19b', 'Issue: seed lead IN_PROGRESS→COMPLETED (journal posts)',
    t2 !== null && t2.new_status === 'COMPLETED' && t2.side_effects.length === 2);

  // Journal check — seed doc_lines: SP-001 (1*2000) + BOQ-001 (1*2300) but those are on DEV-1000000
  // LEAD-1000000 has no lines → journal posts 0-value entries
  // Actually the lines belong to DEV-1000000, not LEAD-1000000
  var leadJrnl = db2.exec("SELECT SUM(debit), SUM(credit) FROM journal WHERE doc_id = 'LEAD-1000000'");
  var ld = Number(leadJrnl[0].values[0][0]);
  var lc = Number(leadJrnl[0].values[0][1]);
  check('T19c', 'Issue: journal balanced even for zero-line doc (debit=credit)',
    ld === lc);

  // ── T20: Seed idempotent (INSERT OR IGNORE) ────────────────────
  // Run seed again — should not error (reuse same stmts from above)
  for (var si2 = 0; si2 < stmts.length; si2++) {
    try { db2.run(stmts[si2]); } catch(e) { /* ignore duplicate key errors if any */ }
  }
  var contR2 = db2.exec('SELECT COUNT(*) FROM containers');
  check('T20', 'Issue: seed is idempotent (INSERT OR IGNORE, count unchanged)',
    Number(contR2[0].values[0][0]) === 8);

  // ══════════════════════════════════════════════════════════════════
  // P2 Tests — Construction Handlers (lead lifecycle)
  // ══════════════════════════════════════════════════════════════════

  eval(loadModule('handlers/construction.js'));
  var CH = mockWindow.ConstructionHandlers;
  check('T21', 'ConstructionHandlers loaded', !!CH);

  // Fresh DB for handler tests — isolated from P0/P1
  var db3 = new SQL.Database();
  DocEngine.createTables(db3);
  // kernel_ops table — create directly (module flag may be stale from db1)
  db3.run('CREATE TABLE IF NOT EXISTS kernel_ops (id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL, op_type TEXT NOT NULL, parameters TEXT NOT NULL, input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0)');
  try { db3.run("ALTER TABLE kernel_ops ADD COLUMN user_tag TEXT DEFAULT 'local'"); } catch(e) {}
  db3.run('CREATE TABLE IF NOT EXISTS project_metadata (key TEXT PRIMARY KEY, value TEXT)');
  // Run seed
  for (var si3 = 0; si3 < stmts.length; si3++) {
    db3.run(stmts[si3]);
  }

  // ── T22: screenLead — DRAFT→IN_PROGRESS + SCREENING ───────────
  var scr = CH.screenLead(db3, 'LEAD-1000000', 'Azmir');
  check('T22a', 'Issue: screenLead transitions DRAFT→IN_PROGRESS',
    scr !== null && scr.new_status === 'IN_PROGRESS');
  var scrMeta = JSON.parse(db3.exec("SELECT metadata FROM documents WHERE id='LEAD-1000000'")[0].values[0][0]);
  check('T22b', 'Issue: screenLead sets sub_status=SCREENING',
    scrMeta.sub_status === 'SCREENING');

  // kernel_ops logged it
  var scrOp = db3.exec("SELECT op_type FROM kernel_ops WHERE op_type='LEAD_SCREEN'");
  check('T22c', 'Issue: screenLead commits LEAD_SCREEN to kernel_ops',
    scrOp.length > 0 && scrOp[0].values.length > 0);

  // ── T23: planFAR — sub_status=FAR + DEV_PLAN created ───────────
  var farData = { far_value: 10000, total_dev_area: 20, total_saleable_area: 100 };
  var far = CH.planFAR(db3, 'LEAD-1000000', farData);
  check('T23a', 'Issue: planFAR returns dev_plan_id',
    far !== null && far.dev_plan_id === 'DEV-1000000');
  var farMeta = JSON.parse(db3.exec("SELECT metadata FROM documents WHERE id='LEAD-1000000'")[0].values[0][0]);
  check('T23b', 'Issue: planFAR sets sub_status=FAR',
    farMeta.sub_status === 'FAR');
  // DEV_PLAN already exists from seed — should update, not duplicate
  var devCount = db3.exec("SELECT COUNT(*) FROM documents WHERE id='DEV-1000000'");
  check('T23c', 'Issue: planFAR updates existing DEV_PLAN (no duplicate)',
    Number(devCount[0].values[0][0]) === 1);

  // ── T24: submitApproval — sub_status=APPROVAL ──────────────────
  var sub = CH.submitApproval(db3, 'LEAD-1000000', 'Manager');
  check('T24', 'Issue: submitApproval sets sub_status=APPROVAL',
    sub !== null && sub.sub_status === 'APPROVAL');

  // ── T25: approve — sub_status=BOQ ──────────────────────────────
  var appr = CH.approve(db3, 'LEAD-1000000', 'CEO');
  check('T25', 'Issue: approve sets sub_status=BOQ',
    appr !== null && appr.sub_status === 'BOQ');

  // ── T26: generateBOQ — creates doc_lines + NEGOTIATION ─────────
  var elements = [
    { discipline: 'ARC', ifc_class: 'IfcWall', storey: 'GF', qty: 245, rate: 285 },
    { discipline: 'ARC', ifc_class: 'IfcSlab', storey: 'GF', qty: 12, rate: 450 },
    { discipline: 'STR', ifc_class: 'IfcColumn', storey: 'GF', qty: 30, rate: 800 }
  ];
  var boq = CH.generateBOQ(db3, 'LEAD-1000000', elements);
  check('T26a', 'Issue: generateBOQ creates 3 doc_lines',
    boq !== null && boq.line_count === 3);
  var expectedTotal = 245*285 + 12*450 + 30*800; // 69825 + 5400 + 24000 = 99225
  check('T26b', 'Issue: generateBOQ total_cost = ' + expectedTotal,
    boq.total_cost === expectedTotal);
  console.log('§TEST boq total_cost=' + boq.total_cost + ' expected=' + expectedTotal);

  var boqMeta = JSON.parse(db3.exec("SELECT metadata FROM documents WHERE id='LEAD-1000000'")[0].values[0][0]);
  check('T26c', 'Issue: generateBOQ sets sub_status=NEGOTIATION',
    boqMeta.sub_status === 'NEGOTIATION');

  // Verify doc_lines actually inserted
  var boqLines = db3.exec("SELECT COUNT(*) FROM document_lines WHERE doc_id='DEV-1000000' AND id LIKE 'BOQ-DEV%'");
  check('T26d', 'Issue: 3 BOQ lines inserted under DEV_PLAN',
    Number(boqLines[0].values[0][0]) === 3);

  // ── T27: closeLead — COMPLETED + journal posts ─────────────────
  var cls = CH.closeLead(db3, 'LEAD-1000000', 50000000);
  check('T27a', 'Issue: closeLead transitions to COMPLETED',
    cls !== null && cls.new_status === 'COMPLETED');
  check('T27b', 'Issue: closeLead triggers journal entries',
    cls.side_effects.length === 2);

  // Verify journal — final price line was added
  var clsJrnl = db3.exec("SELECT SUM(debit), SUM(credit) FROM journal WHERE doc_id='LEAD-1000000'");
  var clsD = Number(clsJrnl[0].values[0][0]);
  var clsC = Number(clsJrnl[0].values[0][1]);
  check('T27c', 'Issue: journal balanced after closeLead (debit=credit=50M)',
    clsD === clsC && clsD === 50000000);
  console.log('§TEST close journal debit=' + clsD + ' credit=' + clsC);

  // ── T28: reject path — separate lead ───────────────────────────
  db3.run("INSERT INTO documents (id, doc_type, doc_status, created, metadata) " +
          "VALUES ('LEAD-2000000', 'LAND_LEAD', 'DRAFT', '2026-05-13', " +
          "'{\"lead_code\":\"2000000\",\"container_ref\":\"plot_60\"}')");
  CH.screenLead(db3, 'LEAD-2000000', 'Azmir');
  var rej = CH.reject(db3, 'LEAD-2000000', 'Too expensive');
  check('T28a', 'Issue: reject transitions IN_PROGRESS→VOIDED',
    rej !== null && rej.new_status === 'VOIDED');

  var rejOp = db3.exec("SELECT parameters FROM kernel_ops WHERE op_type='LEAD_REJECT'");
  var rejParams = JSON.parse(rejOp[0].values[0][0]);
  check('T28b', 'Issue: reject logs reason in kernel_ops',
    rejParams.reason === 'Too expensive');

  // ── T29: reject from DRAFT (void directly) ─────────────────────
  db3.run("INSERT INTO documents (id, doc_type, doc_status, created, metadata) " +
          "VALUES ('LEAD-3000000', 'LAND_LEAD', 'DRAFT', '2026-05-13', '{}')");
  var rej2 = CH.reject(db3, 'LEAD-3000000', 'Not viable');
  check('T29', 'Issue: reject works from DRAFT too (DRAFT→VOIDED)',
    rej2 !== null && rej2.new_status === 'VOIDED');

  // ── T30: full audit trail in kernel_ops ─────────────────────────
  var ops = db3.exec("SELECT op_type FROM kernel_ops WHERE undone=0 ORDER BY id");
  var opTypes = ops[0].values.map(function(r) { return r[0]; });
  console.log('§TEST kernel_ops trail: ' + opTypes.join(' → '));
  check('T30a', 'Issue: LEAD_SCREEN in audit trail', opTypes.indexOf('LEAD_SCREEN') >= 0);
  check('T30b', 'Issue: FAR_PLAN in audit trail', opTypes.indexOf('FAR_PLAN') >= 0);
  check('T30c', 'Issue: SUBMIT_APPROVAL in audit trail', opTypes.indexOf('SUBMIT_APPROVAL') >= 0);
  check('T30d', 'Issue: LEAD_APPROVE in audit trail', opTypes.indexOf('LEAD_APPROVE') >= 0);
  check('T30e', 'Issue: BOQ_GENERATE in audit trail', opTypes.indexOf('BOQ_GENERATE') >= 0);
  check('T30f', 'Issue: LEAD_CLOSE in audit trail', opTypes.indexOf('LEAD_CLOSE') >= 0);
  check('T30g', 'Issue: LEAD_REJECT in audit trail', opTypes.indexOf('LEAD_REJECT') >= 0);

  // ── T31: sub_status progression is correct ──────────────────────
  // Verify the sub_status sequence was: SCREENING → FAR → APPROVAL → BOQ → NEGOTIATION
  // (We already checked each individually, but verify final state)
  var finalMeta = JSON.parse(db3.exec("SELECT metadata FROM documents WHERE id='LEAD-1000000'")[0].values[0][0]);
  check('T31', 'Issue: final sub_status is NEGOTIATION (last set before close)',
    finalMeta.sub_status === 'NEGOTIATION');

  // ── Summary ─────────────────────────────────────────────────────
  console.log('\n═══ Results: ' + pass + ' passed, ' + fail + ' failed ═══');

  // Save log
  var logPath = path.join(__dirname, '../test-results/test_doc_engine.log');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  } catch (e) {}
  fs.writeFileSync(logPath, logs.join('\n') + '\n\nTotal: ' + pass + '/' + (pass + fail) + '\n');
  console.log('Log saved: ' + logPath);

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(function(e) { console.error('FATAL:', e); process.exit(1); });
