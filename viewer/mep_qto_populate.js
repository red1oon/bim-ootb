#!/usr/bin/env node
/**
 * mep_qto_populate.js — Compute unit-aware MEP QTO and write qto_cache to extracted DBs
 * Implementing MEP_5D_QTO.md §2.1–2.3, §6.3 — Witness: W-QTO_CACHE_WRITE
 *
 * Usage: node mep_qto_populate.js [db_path ...] [--template=cidb2024_my]
 * Default: processes all MEP-rich reference buildings
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const BUILDINGS_DIR = path.join(__dirname, '..', 'buildings');

// Default reference buildings (MEP-rich for validation)
const DEFAULT_DBS = [
  'HHS_Office_Federated_extracted.db',
  'Hospital_extracted.db',
  'Terminal_extracted.db',
  'Ifc4_Revit_extracted.db',
  // Tier 1 zero-MEP (for smoke test — should produce 0 MEP rows)
  'SampleHouse_extracted.db',
  'Duplex_extracted.db',
];

// Parse args
const args = process.argv.slice(2);
let templateName = 'cidb2024_my';
const dbPaths = [];
for (const a of args) {
  if (a.startsWith('--template=')) templateName = a.split('=')[1];
  else dbPaths.push(a);
}

// Load rate template
const tplPath = path.join(__dirname, 'rates', templateName + '.json');
if (!fs.existsSync(tplPath)) {
  console.error('§QTO_ERROR template not found: ' + tplPath);
  process.exit(1);
}
const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8'));
const RATES = tpl.materials || {};
const RATES_DEFAULT = { rate: 500, unit: 'EA', desc: 'Misc Element' };

// Build unit sets
const LINEAR_CLASSES = new Set();
const AREA_CLASSES = new Set();
for (const cls in RATES) {
  if (RATES[cls].unit === 'M') LINEAR_CLASSES.add(cls);
  if (RATES[cls].unit === 'M2') AREA_CLASSES.add(cls);
}

// Labor calc (simplified from rates.js)
const LABOR = tpl.labor || {};
function calcLabor(cls, qty) {
  for (const key in LABOR) {
    const lr = LABOR[key];
    if (lr.productivity && lr.productivity[cls] !== undefined) {
      const prod = lr.productivity[cls];
      const days = qty / prod;
      const cost = days * lr.crew_size * lr.rate_per_day;
      return { cost: Math.round(cost), days, crew: lr.crew_size, trade: lr.trade, tradeKey: key, prod };
    }
  }
  return { cost: 0, days: 0, crew: 0, trade: '', tradeKey: null, prod: 10 };
}

// Equipment calc
const EQUIP_RATES = tpl.equipment || {};
const EQUIP_ALLOC = tpl.equipment_allocation || {};
function calcEquipment(cls, laborDays) {
  const alloc = EQUIP_ALLOC[cls];
  if (!alloc) return { cost: 0, desc: '', days: 0 };
  const er = EQUIP_RATES[alloc.equipment];
  if (!er) return { cost: 0, desc: '', days: 0 };
  const days = laborDays * alloc.duration_factor;
  return { cost: Math.round(days * er.rate_per_day), desc: er.desc, days };
}

// Resolve DB list
const targets = dbPaths.length > 0
  ? dbPaths
  : DEFAULT_DBS.map(f => path.join(BUILDINGS_DIR, f));

let grandTotal = 0;

for (const dbPath of targets) {
  if (!fs.existsSync(dbPath)) {
    console.warn('§QTO_SKIP file not found: ' + dbPath);
    continue;
  }

  const dbName = path.basename(dbPath, '_extracted.db');
  const db = new Database(dbPath);

  // Get building name
  const bldRow = db.prepare("SELECT building, COUNT(*) c FROM elements_meta GROUP BY building ORDER BY c DESC LIMIT 1").get();
  const bldName = bldRow ? bldRow.building : dbName;
  const bldSafe = bldName.replace(/'/g, "''");

  // Create qto_cache table
  db.exec(`CREATE TABLE IF NOT EXISTS qto_cache (
    ifc_class TEXT NOT NULL, storey TEXT NOT NULL, discipline TEXT NOT NULL,
    qty REAL NOT NULL, uom TEXT NOT NULL, element_count INTEGER NOT NULL,
    material_cost REAL, labour_cost REAL, equipment_cost REAL,
    rate_template TEXT, computed_at TEXT,
    PRIMARY KEY (ifc_class, storey, discipline, rate_template)
  )`);

  // Clear old cache for this template
  db.prepare("DELETE FROM qto_cache WHERE rate_template = ?").run(templateName);

  // Count query
  const countRows = db.prepare(`
    SELECT m.discipline, m.ifc_class, m.storey, COUNT(*) as cnt
    FROM elements_meta m
    WHERE m.building = ?
    GROUP BY m.discipline, m.ifc_class, m.storey
    ORDER BY m.discipline, m.storey, cnt DESC
  `).all(bldName);

  // Linear query (M)
  const linearMap = {};
  const linRows = db.prepare(`
    SELECT m.discipline, m.ifc_class, m.storey,
           SUM(MAX(t.bbox_x, t.bbox_y, t.bbox_z)) as total_length
    FROM elements_meta m
    JOIN element_transforms t ON m.guid = t.guid
    WHERE m.building = ?
      AND t.bbox_x IS NOT NULL AND t.bbox_x > 0
    GROUP BY m.discipline, m.ifc_class, m.storey
  `).all(bldName);
  for (const r of linRows) {
    linearMap[r.discipline + '|' + r.ifc_class + '|' + r.storey] = r.total_length;
  }

  // Area query (M2)
  const areaMap = {};
  const areaRows = db.prepare(`
    SELECT m.discipline, m.ifc_class, m.storey,
           SUM(
             MAX(t.bbox_x, t.bbox_y, t.bbox_z) *
             CASE WHEN t.bbox_x >= t.bbox_y AND t.bbox_x >= t.bbox_z
                  THEN MAX(t.bbox_y, t.bbox_z)
                  WHEN t.bbox_y >= t.bbox_x AND t.bbox_y >= t.bbox_z
                  THEN MAX(t.bbox_x, t.bbox_z)
                  ELSE MAX(t.bbox_x, t.bbox_y)
             END
           ) as total_area
    FROM elements_meta m
    JOIN element_transforms t ON m.guid = t.guid
    WHERE m.building = ?
      AND t.bbox_x IS NOT NULL AND t.bbox_x > 0
    GROUP BY m.discipline, m.ifc_class, m.storey
  `).all(bldName);
  for (const r of areaRows) {
    areaMap[r.discipline + '|' + r.ifc_class + '|' + r.storey] = r.total_area;
  }

  // Process + write cache
  const insert = db.prepare(`INSERT INTO qto_cache
    (ifc_class, storey, discipline, qty, uom, element_count, material_cost, labour_cost, equipment_cost, rate_template, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const now = new Date().toISOString();
  let rowCount = 0;
  let mepRows = 0;
  let totalMaterial = 0, totalLabour = 0, totalEquip = 0;
  let warnCount = 0;

  const writeAll = db.transaction(() => {
    for (const row of countRows) {
      const { discipline: disc, ifc_class: cls, storey, cnt } = row;
      const mc = RATES[cls] || RATES_DEFAULT;
      const unit = mc.unit || 'EA';
      const key = disc + '|' + cls + '|' + storey;

      let qty;
      if (unit === 'M' && LINEAR_CLASSES.has(cls)) {
        qty = linearMap[key];
        if (!qty || qty <= 0) { qty = cnt; warnCount++; }
      } else if (unit === 'M2' && AREA_CLASSES.has(cls)) {
        qty = areaMap[key];
        if (!qty || qty <= 0) { qty = cnt; warnCount++; }
      } else {
        qty = cnt;
      }

      const matTotal = Math.round(mc.rate * qty * 100) / 100;
      const labor = calcLabor(cls, qty);
      const equip = calcEquipment(cls, labor.days);

      insert.run(cls, storey || '', disc, qty, unit, cnt, matTotal, labor.cost, equip.cost, templateName, now);
      rowCount++;
      totalMaterial += matTotal;
      totalLabour += labor.cost;
      totalEquip += equip.cost;

      if (['MEP', 'ELEC', 'PLB', 'ACMV', 'FP', 'HVAC'].includes(disc)) mepRows++;
    }
  });

  writeAll();

  const total = Math.round(totalMaterial + totalLabour + totalEquip);
  grandTotal += total;
  console.log('§QTO_CACHE_WRITE building=' + dbName + ' template=' + templateName
    + ' rows=' + rowCount + ' mep_rows=' + mepRows
    + ' material=' + Math.round(totalMaterial) + ' labour=' + Math.round(totalLabour)
    + ' equip=' + Math.round(totalEquip) + ' total=' + total
    + ' warnings=' + warnCount);

  // MEP summary by discipline
  const mepSummary = db.prepare(`
    SELECT discipline, SUM(material_cost) as mat, SUM(labour_cost) as lab, SUM(equipment_cost) as eq, COUNT(*) as n
    FROM qto_cache
    WHERE rate_template = ? AND discipline IN ('MEP','ELEC','PLB','ACMV','FP','HVAC')
    GROUP BY discipline ORDER BY mat DESC
  `).all(templateName);
  for (const s of mepSummary) {
    console.log('  §MEP_DISC building=' + dbName + ' disc=' + s.discipline
      + ' rows=' + s.n + ' mat=' + Math.round(s.mat) + ' lab=' + Math.round(s.lab)
      + ' eq=' + Math.round(s.eq) + ' total=' + Math.round(s.mat + s.lab + s.eq));
  }

  db.close();
}

console.log('§QTO_POPULATE_DONE buildings=' + targets.length + ' template=' + templateName + ' grandTotal=' + grandTotal);
