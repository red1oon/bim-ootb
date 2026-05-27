#!/usr/bin/env node
// setup-test-dbs.js — Create minimal test DBs for contract validation
// Run once: node tests/setup-test-dbs.js
// Creates tiny synthetic DBs for testing streaming contract without 100MB real buildings

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BUILDINGS_DIR = path.resolve(__dirname, '../sandbox/buildings');

// Ensure buildings dir exists
if (!fs.existsSync(BUILDINGS_DIR)) {
  fs.mkdirSync(BUILDINGS_DIR, { recursive: true });
  console.log('✓ Created ' + BUILDINGS_DIR);
}

// Check if test DBs already exist
const extractedPath = path.join(BUILDINGS_DIR, 'TestContract_extracted.db');
const libraryPath = path.join(BUILDINGS_DIR, 'TestContract_library.db');

if (fs.existsSync(extractedPath) && fs.existsSync(libraryPath)) {
  console.log('✓ Test DBs already exist:');
  console.log('  ' + extractedPath);
  console.log('  ' + libraryPath);
  console.log('  Run: npx playwright test 41-streaming-contract');
  process.exit(0);
}

console.log('Creating minimal test databases for streaming contract validation...');

// Create extracted.db with minimal schema + synthetic elements
const extractedSQL = `
-- Metadata DB schema (minimal subset needed for streaming)
CREATE TABLE IF NOT EXISTS element_instances (
  guid TEXT PRIMARY KEY,
  ifc_class TEXT,
  name TEXT,
  storey TEXT,
  discipline TEXT,
  geometry_hash TEXT,
  cx REAL, cy REAL, cz REAL,
  rot_x REAL, rot_y REAL, rot_z REAL,
  scale_x REAL DEFAULT 1, scale_y REAL DEFAULT 1, scale_z REAL DEFAULT 1,
  rgba TEXT DEFAULT '#808080',
  bx REAL DEFAULT 0.3, by REAL DEFAULT 0.3, bz REAL DEFAULT 0.3
);

-- Synthetic elements for contract testing:
-- 5 unique geometries × various instance counts = test all routing paths

-- Single instance (BatchedMesh path)
INSERT INTO element_instances VALUES
  ('wall-001', 'IfcWall', 'Wall 1', 'Level 1', 'Architecture', 'hash-wall', 0, 0, 0, 0, 0, 0, 1, 1, 1, '#ff0000', 2, 0.2, 3),
  ('door-001', 'IfcDoor', 'Door 1', 'Level 1', 'Architecture', 'hash-door', 2, 0, 0, 0, 0, 0, 1, 1, 1, '#8b4513', 0.9, 0.05, 2.1);

-- Two instances (InstancedMesh path - minimum valid)
INSERT INTO element_instances VALUES
  ('window-001', 'IfcWindow', 'Window A', 'Level 1', 'Architecture', 'hash-window', 1, 0, 1.5, 0, 0, 0, 1, 1, 1, '#87ceeb', 1.2, 0.1, 1.4),
  ('window-002', 'IfcWindow', 'Window B', 'Level 1', 'Architecture', 'hash-window', 3, 0, 1.5, 0, 0, 0, 1, 1, 1, '#87ceeb', 1.2, 0.1, 1.4);

-- Multiple instances (InstancedMesh path - typical case)
INSERT INTO element_instances VALUES
  ('column-001', 'IfcColumn', 'Column 1', 'Level 1', 'Structure', 'hash-column', 0, 0, 0, 0, 0, 0, 1, 1, 1, '#404040', 0.3, 0.3, 3),
  ('column-002', 'IfcColumn', 'Column 2', 'Level 1', 'Structure', 'hash-column', 4, 0, 0, 0, 0, 0, 1, 1, 1, '#404040', 0.3, 0.3, 3),
  ('column-003', 'IfcColumn', 'Column 3', 'Level 1', 'Structure', 'hash-column', 0, 4, 0, 0, 0, 0, 1, 1, 1, '#404040', 0.3, 0.3, 3),
  ('column-004', 'IfcColumn', 'Column 4', 'Level 1', 'Structure', 'hash-column', 4, 4, 0, 0, 0, 0, 1, 1, 1, '#404040', 0.3, 0.3, 3);

-- Slab (single instance, different storey)
INSERT INTO element_instances VALUES
  ('slab-001', 'IfcSlab', 'Ground Slab', 'Level 0', 'Structure', 'hash-slab', 2, 2, -0.2, 0, 0, 0, 1, 1, 1, '#c0c0c0', 5, 0.2, 5);

-- MEP equipment (multiple instances, different discipline)
INSERT INTO element_instances VALUES
  ('hvac-001', 'IfcFlowTerminal', 'Diffuser 1', 'Level 1', 'Mechanical', 'hash-hvac', 1, 1, 2.8, 0, 0, 0, 1, 1, 1, '#4169e1', 0.6, 0.2, 0.6),
  ('hvac-002', 'IfcFlowTerminal', 'Diffuser 2', 'Level 1', 'Mechanical', 'hash-hvac', 3, 1, 2.8, 0, 0, 0, 1, 1, 1, '#4169e1', 0.6, 0.2, 0.6),
  ('hvac-003', 'IfcFlowTerminal', 'Diffuser 3', 'Level 1', 'Mechanical', 'hash-hvac', 1, 3, 2.8, 0, 0, 0, 1, 1, 1, '#4169e1', 0.6, 0.2, 0.6);

-- Building info
CREATE TABLE IF NOT EXISTS building_info (
  key TEXT PRIMARY KEY,
  value TEXT
);
INSERT INTO building_info VALUES ('name', 'TestContract'), ('total_elements', '12');
`;

// Create library.db with minimal geometry BLOBs
const librarySQL = `
-- Geometry DB schema
CREATE TABLE IF NOT EXISTS component_geometries (
  geometry_hash TEXT PRIMARY KEY,
  vertices BLOB,
  faces BLOB,
  vertex_count INTEGER,
  face_count INTEGER
);

-- Synthetic geometry BLOBs (minimal valid Float32Array data)
-- Real geometry would be larger, but contract only needs non-null BLOBs
`;

try {
  // Create extracted.db
  execSync(`sqlite3 "${extractedPath}" "${extractedSQL}"`, { encoding: 'utf8' });
  console.log('✓ Created ' + path.basename(extractedPath));

  // Create library.db
  execSync(`sqlite3 "${libraryPath}" "${librarySQL}"`, { encoding: 'utf8' });
  console.log('✓ Created ' + path.basename(libraryPath));

  // Add geometry BLOBs using Node.js (sqlite3 CLI doesn't handle binary easily)
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(libraryPath);

  // Helper: Create minimal valid geometry (cube)
  function createCubeGeometry(scale = 1) {
    // 8 vertices × 3 coords = 24 floats
    const vertices = new Float32Array([
      -scale, -scale, -scale,  scale, -scale, -scale,  scale,  scale, -scale, -scale,  scale, -scale,
      -scale, -scale,  scale,  scale, -scale,  scale,  scale,  scale,  scale, -scale,  scale,  scale
    ]);
    // 12 triangles × 3 indices = 36 uint16s
    const faces = new Uint16Array([
      0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1, 1,5,6, 1,6,2, 2,6,7, 2,7,3, 3,7,4, 3,4,0
    ]);
    return { vertices: Buffer.from(vertices.buffer), faces: Buffer.from(faces.buffer), vCount: 8, fCount: 36 };
  }

  const geoms = [
    { hash: 'hash-wall', scale: 1 },
    { hash: 'hash-door', scale: 0.5 },
    { hash: 'hash-window', scale: 0.6 },
    { hash: 'hash-column', scale: 0.3 },
    { hash: 'hash-slab', scale: 2.5 },
    { hash: 'hash-hvac', scale: 0.3 },
  ];

  db.serialize(() => {
    const stmt = db.prepare('INSERT INTO component_geometries (geometry_hash, vertices, faces, vertex_count, face_count) VALUES (?, ?, ?, ?, ?)');
    for (const g of geoms) {
      const geo = createCubeGeometry(g.scale);
      stmt.run(g.hash, geo.vertices, geo.faces, geo.vCount, geo.fCount);
    }
    stmt.finalize();
    console.log('✓ Inserted 6 geometry BLOBs');
  });

  db.close(() => {
    console.log('✓ Test databases ready!');
    console.log('');
    console.log('Run contract test:');
    console.log('  cd tests && npx playwright test 41-streaming-contract');
    console.log('');
    console.log('Test coverage:');
    console.log('  • 2 single-instance elements → BatchedMesh path');
    console.log('  • 2 two-instance elements → InstancedMesh (minimum)');
    console.log('  • 4 four-instance elements → InstancedMesh (typical)');
    console.log('  • 3 three-instance elements → InstancedMesh (MEP)');
    console.log('  • 12 total elements across 2 storeys, 3 disciplines');
  });

} catch (err) {
  if (err.message.includes('sqlite3')) {
    console.error('✗ sqlite3 command not found. Install with:');
    console.error('  Ubuntu/Debian: sudo apt install sqlite3');
    console.error('  macOS: brew install sqlite3');
    console.error('  Or run: npm install sqlite3 (for Node.js binding)');
  } else {
    console.error('✗ Error:', err.message);
  }
  process.exit(1);
}
