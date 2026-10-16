#!/usr/bin/env python3
"""Convert a pre-v1 ("v0") BIM-OOTB building database into a NEW ootb-building v1 file.

Never edits its inputs: sources are opened read-only and the output must not exist yet.
Spec: schema/README.md. Target DDL: schema/ootb-building-v1.sql. Python 3 standard library only.

  python3 migrate_v0_to_v1.py Hospital_extracted.db -o Hospital.v1.db
  python3 migrate_v0_to_v1.py Hospital_meta.db Hospital_geo.db -o Hospital.v1.db   # a meta/geo split pair

Prints one '§SCHEMA_MIGRATE' line per table and a final verdict line:
  PASS          every copied table has the same row count as its source and every check held
  FAIL          a count or a check differs (named on the line)
  INCONCLUSIVE  no source was readable, or no element and no geometry rows were found to judge
"""
import argparse, os, re, sqlite3, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DDL = os.path.join(HERE, 'ootb-building-v1.sql')
GLOBALID = re.compile(r'^[0-9A-Za-z_$]{22}$')
PREFIXED = re.compile(r'^.+_([0-9A-Za-z_$]{22})$')
# v1 tables copied column-by-column (intersection of source and target columns)
SPECIFIED = ['elements_meta', 'element_transforms', 'element_instances', 'component_geometries',
             'spatial_structure', 'rel_contained_in_space', 'rel_aggregates',
             'schedules', 'tasks', 'task_sequences', 'task_elements', 'calendars', 'qto_cache']
MODULES = {'core': ['elements_meta'], 'geometry': ['component_geometries'],
           'spatial': ['spatial_structure', 'rel_contained_in_space', 'rel_aggregates'],
           '4d': ['tasks'], 'qto': ['qto_cache']}
SKIP = {'project_metadata', 'sqlite_sequence', 'elements_rtree', 'elements_rtree_node',
        'elements_rtree_rowid', 'elements_rtree_parent'}  # R*Tree index: rebuildable from element_transforms
RENAME = {'base_geometries': 'component_geometries'}  # v0 extractor name -> v1


def log(msg):
    print('§SCHEMA_MIGRATE ' + msg, flush=True)


def ifc_guid(guid):
    if guid is None:
        return None
    if GLOBALID.match(guid):
        return guid
    m = PREFIXED.match(guid)
    return m.group(1) if m else None


def cols(con, schema, table):
    return [r[1] for r in con.execute(f"PRAGMA {schema}.table_info('{table}')")]


def tables(con, schema):
    return [r[0] for r in con.execute(
        f"SELECT name FROM {schema}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('sources', nargs='+', help='v0 file, or a _meta.db + _geo.db pair')
    ap.add_argument('-o', '--out', required=True, help='new v1 file (must not exist)')
    a = ap.parse_args()
    if os.path.exists(a.out):
        sys.exit(f'refusing to overwrite {a.out}')

    readable = []
    for s in a.sources:
        if not os.path.isfile(s) or os.path.getsize(s) == 0:
            log(f'source={os.path.basename(s)} UNREADABLE (missing or 0 bytes)')
            continue
        readable.append(s)
    if not readable:
        log('verdict=INCONCLUSIVE reason=no readable source'); return 2

    out = sqlite3.connect('file:' + os.path.abspath(a.out) + '?mode=rwc', uri=True)
    out.executescript(open(DDL, encoding='utf-8').read())
    fails, copied = [], {}
    meta_rows = {}
    for i, s in enumerate(readable):
        alias = f's{i}'
        out.execute(f'ATTACH DATABASE ? AS {alias}', ('file:' + os.path.abspath(s) + '?mode=ro',))
        src_tables = tables(out, alias)
        for t in src_tables:
            n_src = out.execute(f'SELECT COUNT(*) FROM {alias}."{t}"').fetchone()[0]
            if t == 'project_metadata':
                for k, v in out.execute(f'SELECT key, value FROM {alias}.project_metadata'):
                    meta_rows.setdefault(k, v)
                continue
            if t in SKIP:
                log(f'table={t} source_rows={n_src} action=skipped (v0-only; not part of v1)')
                continue
            if t in SPECIFIED or t in RENAME:
                src_t, t = t, RENAME.get(t, t)
                tc, sc = cols(out, 'main', t), cols(out, alias, src_t)
                common = [c for c in tc if c in sc]
                sel = list(common)
                if t == 'tasks':  # simple v0 layout -> v1 names
                    for old, new in (('start_date', 'schedule_start'), ('finish_date', 'schedule_finish')):
                        if old in sc and new not in sc:
                            common.append(new); sel.append(old)
                cl = ', '.join(f'"{c}"' for c in common)
                sl = ', '.join(f'"{c}"' for c in sel)
                before = out.execute(f'SELECT COUNT(*) FROM main."{t}"').fetchone()[0]
                out.execute(f'INSERT OR IGNORE INTO main."{t}" ({cl}) SELECT {sl} FROM {alias}."{src_t}"')
                n_new = out.execute(f'SELECT COUNT(*) FROM main."{t}"').fetchone()[0] - before
                # lossless test: every source row (on the copied columns) is present in v1
                lost = out.execute(f'SELECT COUNT(*) FROM (SELECT {sl} FROM {alias}."{src_t}" '
                                   f'EXCEPT SELECT {cl} FROM main."{t}")').fetchone()[0]
                dropped = [c for c in sc if c not in tc and c not in ('start_date', 'finish_date')]
                copied[t] = copied.get(t, 0) + n_new
                log(f'table={src_t}{"->" + t if src_t != t else ""} source_rows={n_src} inserted={n_new} already_present={n_src - n_new} '
                    f'rows_lost={lost} columns_not_in_v1={dropped or "none"} {"OK" if lost == 0 else "FAIL"}')
                if lost:
                    fails.append(f'{t} lost {lost} rows')
            else:  # application extension: carried verbatim as x_<name>
                x = 'x_' + t
                if x in tables(out, 'main'):
                    log(f'table={t} source_rows={n_src} v1_table={x} action=kept first copy (also in an earlier source)')
                    continue
                out.execute(f'CREATE TABLE main."{x}" AS SELECT * FROM {alias}."{t}"')
                n_new = out.execute(f'SELECT COUNT(*) FROM main."{x}"').fetchone()[0]
                log(f'table={t} source_rows={n_src} v1_table={x} v1_rows={n_new} '
                    f'{"OK" if n_new == n_src else "FAIL"}')
                if n_new != n_src:
                    fails.append(f'{x} rows')
        out.commit()

    # derived columns and cleanups
    out.execute("UPDATE elements_meta SET material_rgba = NULL WHERE material_rgba = ''")
    rows = out.execute('SELECT guid FROM elements_meta').fetchall()
    out.executemany('UPDATE elements_meta SET ifc_guid=? WHERE guid=?', [(ifc_guid(g), g) for (g,) in rows])
    n_el = len(rows)
    n_ifc = out.execute('SELECT COUNT(*) FROM elements_meta WHERE ifc_guid IS NOT NULL').fetchone()[0]
    bad = out.execute('SELECT COUNT(*) FROM elements_meta WHERE ifc_guid IS NOT NULL AND length(ifc_guid)<>22').fetchone()[0]
    log(f'check=ifc_guid elements={n_el} with_globalid={n_ifc} without={n_el - n_ifc} bad_length={bad} '
        f'{"OK" if bad == 0 else "FAIL"}')
    if bad:
        fails.append('ifc_guid length')
    if n_el and copied.get('component_geometries'):
        orphan = out.execute('SELECT COUNT(*) FROM element_instances i LEFT JOIN component_geometries g '
                             'USING (geometry_hash) WHERE g.geometry_hash IS NULL').fetchone()[0]
        log(f'check=instances_resolve orphans={orphan} {"OK" if orphan == 0 else "WARN (geometry absent from source)"}')

    modules = [m for m, ts in MODULES.items() if any(copied.get(t) for t in ts)]
    meta_rows.update({'schema_name': 'ootb-building', 'schema_version': '1', 'modules': ','.join(modules),
                      'migrated_from': '+'.join(os.path.basename(s) for s in readable),
                      'migrated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')})
    out.executemany('INSERT OR REPLACE INTO project_metadata(key, value) VALUES (?, ?)', meta_rows.items())
    missing_keys = [k for k in ('building_name', 'source_file', 'import_date') if k not in meta_rows]
    log(f'check=metadata modules={",".join(modules) or "none"} expected_keys_missing={missing_keys or "none"}')
    out.commit()
    uv = out.execute('PRAGMA user_version').fetchone()[0]
    out.close()

    if not n_el and not copied.get('component_geometries'):
        log(f'verdict=INCONCLUSIVE out={os.path.basename(a.out)} reason=no elements and no geometry to judge')
        return 2
    verdict = 'PASS' if not fails and uv == 1 else 'FAIL'
    log(f'verdict={verdict} out={os.path.basename(a.out)} user_version={uv} failures={fails or "none"}')
    return 0 if verdict == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
