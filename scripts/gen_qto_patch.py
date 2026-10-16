#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — prompts/FIND_ASK_ANSWERS.md §K.1. Read the output after every run.
# Builds buildings/patches/<bld>_meta.db.qto.sql: the building's OWN qto_cache rows, copied verbatim
# from its live _extracted.db, so the split-mode viewer (A.db = _meta.db) can answer cost questions.
# Nothing is computed here — every value is a cell of the source table.
#
# Usage: gen_qto_patch.py --src <extracted.db> --out <patch.sql> --source-object <bucket object>
#                         [--source-etag <etag>] [--source-md5 <content-md5>]
import argparse, datetime, hashlib, sqlite3, sys

def lit(v):
    if v is None: return 'NULL'
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--source-object', required=True); ap.add_argument('--source-etag', default='')
    ap.add_argument('--source-md5', default='')
    a = ap.parse_args()
    con = sqlite3.connect(a.src)
    schema = con.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='qto_cache'").fetchone()
    if not schema:
        print('§QTO_PATCH_FAIL source has no qto_cache table'); sys.exit(1)
    cols = [r[1] for r in con.execute('PRAGMA table_info(qto_cache)')]
    rows = con.execute('SELECT ' + ','.join(cols) + ' FROM qto_cache ORDER BY ' + ','.join(cols[:3])).fetchall()
    if not rows:
        print('§QTO_PATCH_FAIL source qto_cache is empty'); sys.exit(1)
    sums = con.execute('SELECT SUM(material_cost), SUM(labour_cost), SUM(equipment_cost) FROM qto_cache').fetchone()
    create = schema[0].replace('CREATE TABLE qto_cache', 'CREATE TABLE IF NOT EXISTS qto_cache', 1)
    src_sha = hashlib.sha256(open(a.src, 'rb').read()).hexdigest()
    out = [
        '-- ⚠ DO NOT REMOVE — cost table for the Viewer SPLIT path (prompts/FIND_ASK_ANSWERS.md §K.1).',
        '-- Split mode reads _meta.db, which never carried qto_cache; the live _extracted.db does.',
        '-- Rows copied VERBATIM from: ' + a.source_object + (' etag=' + a.source_etag if a.source_etag else '') +
        (' content-md5=' + a.source_md5 if a.source_md5 else '') + ' sha256=' + src_sha,
        '-- rows=%d  sum(material)=%r  sum(labour)=%r  sum(equipment)=%r' % (len(rows), sums[0], sums[1], sums[2]),
        '-- generated ' + datetime.datetime.now(datetime.timezone.utc).isoformat() + ' by scripts/gen_qto_patch.py',
        '-- Idempotent, never duplicates: rows land in a staging table and are copied into qto_cache ONLY if',
        '-- qto_cache is empty (a DB that already carries its own costs is left exactly as it is).',
        create.strip().rstrip(';') + ';',
        'DROP TABLE IF EXISTS _qto_patch;',
        'CREATE TABLE _qto_patch AS SELECT * FROM qto_cache WHERE 0;',
    ]
    for r in rows:
        out.append('INSERT INTO _qto_patch (' + ','.join(cols) + ') VALUES (' + ','.join(lit(v) for v in r) + ');')
    out.append('INSERT INTO qto_cache SELECT * FROM _qto_patch WHERE NOT EXISTS (SELECT 1 FROM qto_cache);')
    out.append('DROP TABLE _qto_patch;')
    open(a.out, 'w').write('\n'.join(out) + '\n')
    print('§QTO_PATCH_WRITTEN out=%s rows=%d cols=%d bytes=%d sumMaterial=%r sumLabour=%r sumEquipment=%r' % (
        a.out, len(rows), len(cols), len('\n'.join(out)) + 1, sums[0], sums[1], sums[2]))

if __name__ == '__main__':
    main()
