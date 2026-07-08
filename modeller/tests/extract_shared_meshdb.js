// extract_shared_meshdb.js -- ONE shared mesh.db covering (a) ARC geometry referenced across every
// candidate ARC-only resident, and (b) the MEP/FP/ACMV "borrow" geometry (WalkerDoctrine.md: residential
// buildings walk duplex_rules.db for their OWN ARC, but borrow disciplines they don't have, e.g. FP/
// sprinkler, from Terminal-class buildings). This is the REAL final-footprint question: if ARC-only
// resident files carry NO mesh at all (per user direction, 2026-07-09), everything geometric lives here.
// Read-only on every source; writes exactly one new file.
const fs = require('fs');
const initSqlJs = require('sql.js');

const RMS_THRESHOLD = 0.001;
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
function toF32(b) { return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); }
function bboxOf(p) { let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity,e=Infinity,f=-Infinity; for(let i=0;i<p.length;i+=3){const x=p[i],y=p[i+1],z=p[i+2]; if(x<a)a=x; if(x>b)b=x; if(y<c)c=y; if(y>d)d=y; if(z<e)e=z; if(z>f)f=z;} return [a,b,c,d,e,f]; }
function normalizeAxes(p) { const bb=bboxOf(p), min=[bb[0],bb[2],bb[4]], size=[bb[1]-bb[0],bb[3]-bb[2],bb[5]-bb[4]]; const n=p.length/3, axes=[new Float32Array(n),new Float32Array(n),new Float32Array(n)]; for(let i=0;i<n;i++) for(let a=0;a<3;a++){const s=size[a]; axes[a][i]=s>0?(p[i*3+a]-min[a])/s:0;} return {axes,size}; }
function subsampleRms(mA,perm,tA){const n=mA[0].length,step=Math.max(1,Math.floor(n/64));let sq=0,c=0;for(let a=0;a<3;a++){const m=mA[perm[a]],t=tA[a];for(let i=0;i<n;i+=step){const d=m[i]-t[i];sq+=d*d;c++;}}return Math.sqrt(sq/c);}
function rmsDiff(mA,perm,tA){const n=mA[0].length;let sq=0;for(let a=0;a<3;a++){const m=mA[perm[a]],t=tA[a];for(let i=0;i<n;i++){const d=m[i]-t[i];sq+=d*d;}}return Math.sqrt(sq/(n*3));}

// pool spec: [label, geoPath, metaPath, disciplines[]|null(=all, single-file ARC-only residents)]
const POOLS = {
  ARC: [
    ['SampleHouse', '../SampleHouse_extracted.db', '../SampleHouse_extracted.db', null],
    ['Duplex', '../Duplex_extracted.db', '../Duplex_extracted.db', null],
    ['SampleCastle', '../SampleCastle_extracted.db', '../SampleCastle_extracted.db', null],
    ['Terminal', '../Terminal_geo.db', '../Terminal_meta.db', null],
    ['Ifc4_Revit', '../Ifc4_Revit_extracted.db', '../Ifc4_Revit_extracted.db', null],
    ['Clinic', '/home/red1/bim-compiler/deploy/buildings/Clinic_extracted.db', '/home/red1/bim-compiler/deploy/buildings/Clinic_extracted.db', ['ARC']],
    ['Hospital', '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db', '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db', ['ARC']],
    ['HospitalGarage', '/home/red1/bim-compiler/deploy/buildings/HospitalGarage_extracted.db', '/home/red1/bim-compiler/deploy/buildings/HospitalGarage_extracted.db', ['ARC']],
    ['HHS_Office', '/home/red1/bim-compiler/deploy/buildings/HHS_Office_Federated_extracted.db', '/home/red1/bim-compiler/deploy/buildings/HHS_Office_Federated_extracted.db', ['ARC']],
  ],
  MEPFPACMV: [
    ['Clinic', '/home/red1/bim-compiler/deploy/buildings/Clinic_extracted.db', '/home/red1/bim-compiler/deploy/buildings/Clinic_extracted.db', ['MEP', 'ACMV']],
    ['Hospital', '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db', '/home/red1/bim-compiler/deploy/buildings/Hospital_extracted.db', ['MEP', 'FP']],
    ['HHS_Office', '/home/red1/bim-compiler/deploy/buildings/HHS_Office_Federated_extracted.db', '/home/red1/bim-compiler/deploy/buildings/HHS_Office_Federated_extracted.db', ['MEP']],
  ],
};

// Terminal's own discipline-tagged extraction (library/archive/Terminal_extracted.db) turned out to be a
// stub (base_geometries has 7556 rows, ALL with NULL vertices/faces -- not a usable geometry source).
// Terminal's REAL MEP/FP/ACMV geometry lives in library/component_library.db (98.2% Terminal-sourced,
// building_type='SJTII_Terminal' in ad_geometry_map) -- that table has no `discipline` column, only
// `ifc_class`, so the FP/ACMV/MEP split below is by ifc_class instead. NOT invented: cross-checked against
// migration/DV003_element_mep_alias.sql (this project's own IFC4-spec-sourced alias table), which already
// confirms IfcFireSuppressionTerminal=SPRINKLER and IfcAirTerminal=DIFFUSER -- i.e. real IFC-schema
// semantics, not a guessed bucketing.
const TERMINAL_IFC_CLASS_BY_DISCIPLINE = {
  FP: ['IfcFireSuppressionTerminal'],
  ACMV: ['IfcAirTerminal', 'IfcDuctFitting', 'IfcDuctSegment'],
  MEP: ['IfcFlowFitting', 'IfcFlowSegment', 'IfcFlowTerminal', 'IfcFlowController', 'IfcPipeFitting', 'IfcPipeSegment', 'IfcValve', 'IfcController', 'IfcElectricAppliance'],
};

async function loadTerminalFromComponentLibrary(SQL) {
  const libPath = '/home/red1/bim-compiler/library/component_library.db';
  const libDb = new SQL.Database(fs.readFileSync(libPath));
  const classes = Object.values(TERMINAL_IFC_CLASS_BY_DISCIPLINE).flat();
  const placeholders = classes.map(c => "'" + c + "'").join(',');
  const r = libDb.exec(
    "SELECT DISTINCT geometry_hash FROM ad_geometry_map WHERE building_type='SJTII_Terminal' AND ifc_class IN (" + placeholders + ")"
  )[0];
  const usedHashes = new Set(r ? r.values.map(v => v[0]) : []);
  const geomRows = libDb.exec("SELECT geometry_hash, vertices, faces FROM component_geometries")[0];
  const rows = [];
  let missingBlob = 0;
  for (const [hash, vBlob, fBlob] of geomRows.values) {
    if (!usedHashes.has(hash)) continue;
    if (!vBlob || !fBlob) { missingBlob++; continue; }
    rows.push({ hash: 'Terminal:' + hash, vBlob, fBlob, building: 'Terminal' });
  }
  console.log('§SHARED-MESHDB pool=MEPFPACMV building=Terminal source=component_library.db(ad_geometry_map by ifc_class) ' +
    'referenced=' + usedHashes.size + ' geometry_found=' + rows.length + ' missing_blob_skipped=' + missingBlob);
  return rows;
}

async function loadPoolRows(SQL, poolName) {
  const specs = POOLS[poolName];
  const rows = []; // { hash, vBlob, fBlob, building, poolGeomKey }
  for (const [label, geoPath, metaPath, disciplines] of specs) {
    const geoDb = new SQL.Database(fs.readFileSync(geoPath));
    const metaDb = metaPath === geoPath ? geoDb : new SQL.Database(fs.readFileSync(metaPath));
    const table = geoDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='component_geometries'").length ? 'component_geometries' : 'base_geometries';

    let usedHashes;
    if (disciplines) {
      const placeholders = disciplines.map(d => "'" + d + "'").join(',');
      const r = metaDb.exec(
        "SELECT DISTINCT ei.geometry_hash FROM element_instances ei JOIN elements_meta em ON em.guid = ei.guid " +
        "WHERE em.discipline IN (" + placeholders + ") AND ei.geometry_hash IS NOT NULL"
      )[0];
      usedHashes = new Set(r ? r.values.map(v => v[0]) : []);
    } else {
      const r = metaDb.exec("SELECT DISTINCT geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL")[0];
      usedHashes = new Set(r ? r.values.map(v => v[0]) : []);
    }

    const geomRows = geoDb.exec("SELECT geometry_hash, vertices, faces FROM " + table)[0];
    let found = 0, missingBlob = 0;
    for (const [hash, vBlob, fBlob] of geomRows.values) {
      if (!usedHashes.has(hash)) continue;
      if (!vBlob || !fBlob) { missingBlob++; continue; } // hash present but blob null -- honest skip, not invented
      rows.push({ hash: label + ':' + hash, vBlob, fBlob, building: label }); // prefix hash with building label -- cross-building hash collisions are NOT assumed identical shapes
      found++;
    }
    if (missingBlob) console.log('§SHARED-MESHDB WARN pool=' + poolName + ' building=' + label + ' missing_blob_skipped=' + missingBlob);
    console.log('§SHARED-MESHDB pool=' + poolName + ' building=' + label + ' discipline_filter=' + (disciplines || 'ALL(already-ARC-only)') +
      ' referenced=' + usedHashes.size + ' geometry_found=' + found);
  }
  return rows;
}

function cluster(rows) {
  const buckets = new Map();
  for (const r of rows) {
    const key = r.vBlob.byteLength + ':' + r.fBlob.byteLength;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  const templateOf = new Map(), templates = new Map();
  for (const [key, members] of buckets) {
    if (members.length === 1) {
      const m = members[0];
      templates.set(m.hash, { vBlob: m.vBlob, fBlob: m.fBlob, building: m.building, memberCount: 1 });
      templateOf.set(m.hash, { templateHash: m.hash, perm: [0, 1, 2], rms: 0 });
      continue;
    }
    const families = [];
    for (const m of members) {
      const norm = normalizeAxes(toF32(m.vBlob));
      let best = null;
      for (let fi = 0; fi < families.length; fi++) {
        const fam = families[fi];
        for (const perm of PERMS) {
          const sub = subsampleRms(norm.axes, perm, fam.axes);
          if (sub > RMS_THRESHOLD * 5) continue;
          const full = rmsDiff(norm.axes, perm, fam.axes);
          if (full <= RMS_THRESHOLD && (!best || full < best.rms)) best = { familyIdx: fi, perm, rms: full };
        }
      }
      if (best) {
        const fam = families[best.familyIdx];
        fam.memberCount++;
        templateOf.set(m.hash, { templateHash: fam.templateHash, perm: best.perm, rms: best.rms });
      } else {
        families.push({ templateHash: m.hash, axes: norm.axes, vBlob: m.vBlob, fBlob: m.fBlob, building: m.building, memberCount: 1 });
        templateOf.set(m.hash, { templateHash: m.hash, perm: [0, 1, 2], rms: 0 });
      }
    }
    for (const fam of families) templates.set(fam.templateHash, { vBlob: fam.vBlob, fBlob: fam.fBlob, building: fam.building, memberCount: fam.memberCount });
  }
  return { templateOf, templates };
}

(async () => {
  const SQL = await initSqlJs();
  const arcRows = await loadPoolRows(SQL, 'ARC');
  const mepRowsTerminal = await loadTerminalFromComponentLibrary(SQL);
  const mepRowsRest = await loadPoolRows(SQL, 'MEPFPACMV');
  const allRows = arcRows.concat(mepRowsTerminal, mepRowsRest);

  let originalBytes = 0;
  for (const r of allRows) originalBytes += r.vBlob.byteLength + r.fBlob.byteLength;

  const { templateOf, templates } = cluster(allRows);

  // cross-building reuse check: did any family end up with members from >1 building?
  const familyBuildings = new Map();
  for (const [hash, t] of templateOf) {
    const building = hash.split(':')[0];
    if (!familyBuildings.has(t.templateHash)) familyBuildings.set(t.templateHash, new Set());
    familyBuildings.get(t.templateHash).add(building);
  }
  const crossBuildingFamilies = Array.from(familyBuildings.values()).filter(s => s.size > 1).length;

  const outDb = new SQL.Database();
  outDb.run(`CREATE TABLE mesh_templates (template_hash TEXT PRIMARY KEY, vertices BLOB NOT NULL, faces BLOB NOT NULL, source_building TEXT, member_count INTEGER NOT NULL)`);
  outDb.run(`CREATE TABLE mesh_template_map (geometry_hash TEXT PRIMARY KEY, template_hash TEXT NOT NULL, axis_permutation TEXT NOT NULL, rms_confidence REAL NOT NULL)`);
  const tplStmt = outDb.prepare("INSERT INTO mesh_templates VALUES (?,?,?,?,?)");
  for (const [th, t] of templates) tplStmt.run([th, t.vBlob, t.fBlob, t.building, t.memberCount]);
  tplStmt.free();
  const mapStmt = outDb.prepare("INSERT INTO mesh_template_map VALUES (?,?,?,?)");
  for (const [h, t] of templateOf) mapStmt.run([h, t.templateHash, t.perm.join(','), t.rms]);
  mapStmt.free();

  const OUT_PATH = process.argv[2] || '/tmp/shared_mesh.db';
  fs.writeFileSync(OUT_PATH, Buffer.from(outDb.export()));
  const outBytes = fs.statSync(OUT_PATH).size;

  console.log('§SHARED-MESHDB TOTAL referenced_geometry_rows=' + allRows.length + ' original_bytes=' + originalBytes +
    ' templates_needed=' + templates.size + ' compression=' + (allRows.length / templates.size).toFixed(2) + 'x' +
    ' cross_building_families=' + crossBuildingFamilies);
  console.log('§SHARED-MESHDB out=' + OUT_PATH + ' size_bytes=' + outBytes + ' (' + (outBytes / 1048576).toFixed(3) + ' MB)');
})().catch(e => { console.error('§SHARED-MESHDB FATAL', e); process.exit(1); });
