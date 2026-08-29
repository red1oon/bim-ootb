# Builds three fixture DBs for W-MERGE-GEO-FOLD, all EXTRACTED from the real shipped
# LTU_AHouse DBs + the verbatim import_db_builder.js schema. Nothing invented.
import sqlite3, os, shutil, sys
SRC_META = '/home/red1/bim-ootb/buildings/LTU_AHouse_meta.db'
SRC_GEO  = '/home/red1/bim-ootb/buildings/LTU_AHouse_geo.db'
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
N_KEEP = 300          # scene-side ("LTU minus ARC") element sample
N_ARC  = 120          # incoming import sample

src_m = sqlite3.connect(SRC_META); src_g = sqlite3.connect(SRC_GEO)

# Scene side: take N_KEEP non-ARC elements that HAVE geometry, and N_ARC ARC elements to play
# the role of the "intentionally left out" discipline.
keep = src_m.execute("""SELECT m.guid FROM elements_meta m JOIN element_instances i ON i.guid=m.guid
                        WHERE m.discipline<>'ARC' AND i.geometry_hash IS NOT NULL LIMIT ?""", (N_KEEP,)).fetchall()
arc  = src_m.execute("""SELECT m.guid FROM elements_meta m JOIN element_instances i ON i.guid=m.guid
                        WHERE m.discipline='ARC'  AND i.geometry_hash IS NOT NULL LIMIT ?""", (N_ARC,)).fetchall()
keep = [r[0] for r in keep]; arc = [r[0] for r in arc]
assert len(keep) == N_KEEP and len(arc) == N_ARC, (len(keep), len(arc))

def ddl(conn, t):
    r = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (t,)).fetchone()
    return r[0] if r else None

# ── 1. LTUish_meta.db — real server schema (elements_meta has NO `building` column) ──
p = os.path.join(OUT, 'LTUish_meta.db')
if os.path.exists(p): os.remove(p)
dm = sqlite3.connect(p)
for t in ('elements_meta', 'element_transforms', 'element_instances', 'project_metadata'):
    d = ddl(src_m, t)
    if d: dm.execute(d)
ph = ','.join('?' * len(keep))
for t in ('elements_meta', 'element_transforms', 'element_instances'):
    cols = [c[1] for c in src_m.execute('PRAGMA table_info(%s)' % t)]
    rows = src_m.execute('SELECT * FROM %s WHERE guid IN (%s)' % (t, ph), keep).fetchall()
    dm.executemany('INSERT INTO %s VALUES (%s)' % (t, ','.join('?' * len(cols))), rows)
dm.executemany('INSERT INTO project_metadata VALUES (?,?)',
               src_m.execute('SELECT key, value FROM project_metadata').fetchall())
dm.commit()
mcols = [c[1] for c in dm.execute('PRAGMA table_info(elements_meta)')]
assert 'building' not in mcols, 'fixture must reproduce the real no-building-column shape'

# ── 2. LTUish_geo.db — real geo schema: base_geometries (NOT component_geometries) ──
p = os.path.join(OUT, 'LTUish_geo.db')
if os.path.exists(p): os.remove(p)
dg = sqlite3.connect(p)
dg.execute(ddl(src_g, 'base_geometries'))
hashes = [r[0] for r in dm.execute('SELECT DISTINCT geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL')]
gph = ','.join('?' * len(hashes))
grows = src_g.execute('SELECT * FROM base_geometries WHERE geometry_hash IN (%s)' % gph, hashes).fetchall()
dg.executemany('INSERT INTO base_geometries VALUES (?,?,?,?,?)', grows)
dg.commit()

# ── 3. ARCimport.db — VERBATIM import_db_builder.js schema (component_geometries + `building`) ──
p = os.path.join(OUT, 'ARCimport.db')
if os.path.exists(p): os.remove(p)
da = sqlite3.connect(p)
da.execute('CREATE TABLE project_metadata (key TEXT PRIMARY KEY, value TEXT)')
da.execute('CREATE TABLE elements_meta (guid TEXT PRIMARY KEY, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT)')
da.execute('CREATE TABLE element_transforms (guid TEXT PRIMARY KEY, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL)')
da.execute('CREATE TABLE element_instances (guid TEXT PRIMARY KEY, geometry_hash TEXT)')
da.execute('CREATE TABLE component_geometries (geometry_hash TEXT PRIMARY KEY, vertices BLOB, faces BLOB, normals BLOB, building TEXT)')
da.execute('CREATE TABLE bom_tree (parent_guid TEXT NOT NULL, child_guid TEXT NOT NULL, rel_type TEXT NOT NULL, PRIMARY KEY (parent_guid, child_guid))')
BLD = 'LTU_AHouse_ARC'
aph = ','.join('?' * len(arc))
for guid, ic, en, st, di, mn, mr in src_m.execute(
        'SELECT guid, ifc_class, element_name, storey, discipline, material_name, material_rgba '
        'FROM elements_meta WHERE guid IN (%s)' % aph, arc):
    da.execute('INSERT INTO elements_meta VALUES (?,?,?,?,?,?,?,?)', (guid, ic, en, st, di, mn, mr, BLD))
da.executemany('INSERT INTO element_transforms VALUES (?,?,?,?,?,?,?,?,?,?)',
               src_m.execute('SELECT * FROM element_transforms WHERE guid IN (%s)' % aph, arc).fetchall())
da.executemany('INSERT INTO element_instances VALUES (?,?)',
               src_m.execute('SELECT guid, geometry_hash FROM element_instances WHERE guid IN (%s)' % aph, arc).fetchall())
ah = [r[0] for r in da.execute('SELECT DISTINCT geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL')]
ahp = ','.join('?' * len(ah))
for gh, v, f, vc, fc in src_g.execute('SELECT * FROM base_geometries WHERE geometry_hash IN (%s)' % ahp, ah):
    da.execute('INSERT INTO component_geometries VALUES (?,?,?,?,?)', (gh, v, f, None, BLD))
da.executemany('INSERT INTO project_metadata VALUES (?,?)',
               src_m.execute('SELECT key, value FROM project_metadata').fetchall())
da.commit()

print('§FX meta_elements=%d meta_hasBuildingCol=%s' % (
    dm.execute('SELECT COUNT(*) FROM elements_meta').fetchone()[0], 'building' in mcols))
print('§FX geo_base_geometries=%d  (component_geometries absent: %s)' % (
    dg.execute('SELECT COUNT(*) FROM base_geometries').fetchone()[0],
    dg.execute("SELECT COUNT(*) FROM sqlite_master WHERE name='component_geometries'").fetchone()[0] == 0))
print('§FX arc_elements=%d arc_component_geometries=%d arc_hasBuildingCol=True' % (
    da.execute('SELECT COUNT(*) FROM elements_meta').fetchone()[0],
    da.execute('SELECT COUNT(*) FROM component_geometries').fetchone()[0]))
print('§FX guid_overlap_scene_vs_arc=%d (must be 0)' % len(set(keep) & set(arc)))
for c in (dm, dg, da, src_m, src_g): c.close()
