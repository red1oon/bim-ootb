/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// bake_drop_bim_tab.js — remove the orphan 'BIM' AD_Tab left in the seed by the (now-stripped) BIM-in-window
// embed lane. The ADWindow renderer honours AD metadata, so an empty AD_Tab still shows as a folder tab on the
// Project window. We remove it THROUGH the AD chain — but the cascade check shows it's safe to remove ONLY the
// AD_Tab row: it has 0 AD_Fields, and its AD_Table (203 = C_Project) is SHARED by the 7 real Project tabs, so
// the table/columns MUST be kept. NON-INVENT, surgical: delete exactly one AD_Tab row, touch nothing else.
//
// Witness W-DROP-BIM-TAB (read the log): the 'BIM' tab (200500) is gone; the Project window keeps its 7 real
// tabs; C_Project (AD_Table 203) + its AD_Columns are untouched; total AD_Tab count drops by exactly 1; no
// other window/tab/field changed. SAFE: dry-run unless --write.
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/bake_drop_bim_tab.js [--write]

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const WRITE = process.argv.includes('--write');
const ERP = path.join(__dirname, '..', 'ad_seed.db');
const TAB = 200500;        // the orphan 'BIM' tab
const WIN = 130;           // Project window
const TBL = 203;           // C_Project (SHARED — must NOT be deleted)

const out = [];
const W = (ok, m) => { out.push((ok ? '🟢' : '🔴') + ' ' + m); return ok; };

(async function () {
  if (!fs.existsSync(ERP)) { console.log('§DROPBIMTAB SKIP — missing ' + ERP); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(ERP));
  const scalar = (s) => { const r = db.exec(s); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; };

  // ── pre-flight cascade verification (don't delete blind) ──
  const tabRow = db.exec("SELECT AD_Tab_ID, AD_Window_ID, AD_Table_ID, Name FROM AD_Tab WHERE AD_Tab_ID=" + TAB);
  if (!tabRow.length || !tabRow[0].values.length) { console.log('§DROPBIMTAB nothing to do — AD_Tab ' + TAB + ' absent'); process.exit(0); }
  const [tid, twin, ttbl, tname] = tabRow[0].values[0];
  W(twin === WIN && ttbl === TBL && /BIM/i.test(tname), 'target is the BIM tab on Project (win=' + twin + ' tbl=' + ttbl + ' name=' + tname + ')');
  const fieldsOnTab = scalar("SELECT COUNT(*) FROM AD_Field WHERE AD_Tab_ID=" + TAB);
  W(fieldsOnTab === 0, 'tab has 0 AD_Fields — nothing to cascade-delete there (' + fieldsOnTab + ')');
  const tabsUsingTbl = scalar("SELECT COUNT(*) FROM AD_Tab WHERE AD_Table_ID=" + TBL);
  W(tabsUsingTbl > 1, 'AD_Table ' + TBL + ' (C_Project) is SHARED by ' + tabsUsingTbl + ' tabs → KEEP table+columns');

  // snapshots to prove we touch nothing else
  const tabsBefore = scalar("SELECT COUNT(*) FROM AD_Tab");
  const winTabsBefore = scalar("SELECT COUNT(*) FROM AD_Tab WHERE AD_Window_ID=" + WIN);
  const colsBefore = scalar("SELECT COUNT(*) FROM AD_Column WHERE AD_Table_ID=" + TBL);
  const fieldsBefore = scalar("SELECT COUNT(*) FROM AD_Field");

  // ── the surgical removal: exactly one AD_Tab row ──
  db.run("DELETE FROM AD_Tab WHERE AD_Tab_ID=" + TAB);

  // ── post checks ──
  W(scalar("SELECT COUNT(*) FROM AD_Tab WHERE AD_Tab_ID=" + TAB) === 0, 'BIM tab ' + TAB + ' removed');
  W(scalar("SELECT COUNT(*) FROM AD_Tab") === tabsBefore - 1, 'exactly ONE AD_Tab row deleted (total ' + tabsBefore + '→' + (tabsBefore - 1) + ')');
  const winTabsAfter = scalar("SELECT COUNT(*) FROM AD_Tab WHERE AD_Window_ID=" + WIN);
  W(winTabsAfter === winTabsBefore - 1 && winTabsAfter === 7, 'Project window keeps its 7 real tabs (' + winTabsBefore + '→' + winTabsAfter + ')');
  W(scalar("SELECT COUNT(*) FROM AD_Table WHERE AD_Table_ID=" + TBL) === 1, 'C_Project AD_Table ' + TBL + ' intact');
  W(scalar("SELECT COUNT(*) FROM AD_Column WHERE AD_Table_ID=" + TBL) === colsBefore, 'C_Project AD_Columns untouched (' + colsBefore + ')');
  W(scalar("SELECT COUNT(*) FROM AD_Field") === fieldsBefore, 'no AD_Field rows changed (' + fieldsBefore + ')');
  // the Hospital data still there (sanity)
  W(scalar("SELECT COUNT(*) FROM C_Project WHERE Value='Hospital'") === 1, 'Hospital C_Project still present');

  const pass = out.filter(l => l.startsWith('🟢')).length, total = out.length;
  console.log('\n§DROPBIMTAB win130 tabs: ' + winTabsBefore + '→' + winTabsAfter + ' | AD_Tab total: ' + tabsBefore + '→' + scalar("SELECT COUNT(*) FROM AD_Tab"));
  console.log(out.join('\n'));
  console.log('\nW-DROP-BIM-TAB ' + pass + '/' + total + (WRITE ? ' [WRITE]' : ' [dry-run]'));
  if (WRITE && pass === total) { fs.writeFileSync(ERP, Buffer.from(db.export())); console.log('§DROPBIMTAB WROTE ' + ERP); }
  else if (WRITE) console.log('§DROPBIMTAB NOT WRITTEN — witness not green');
  fs.writeFileSync(path.join(__dirname, 'bake_drop_bim_tab.log'), out.join('\n') + '\n');
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
