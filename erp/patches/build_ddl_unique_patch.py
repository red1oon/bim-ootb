#!/usr/bin/env python3
# ⚠ DO NOT REMOVE - extracts the legacy schema's UNIQUE indexes (pg_indexes) as idempotent SQLite statements for ad_seed.db.sql (bim-compiler prompts/ERP_WS_API.md S2).
# WHY: a duplicate Value is refused by the DATABASE in legacy ("ERROR: duplicate key value violates unique constraint c_bpartner_value"), and that physical constraint is not in the AD dictionary.
#   The twin needs the same refusal on every table (AD-LAYER LAW: data, not a per-table list). Same extraction idea as ad_ddl_default (extract_ddl_defaults.js). Partial indexes are counted, not guessed.
# Run: python3 build_ddl_unique_patch.py > ddl_unique.sql   (pilot postgres container up)
import subprocess, re, sys
def pg(sql):
    return subprocess.check_output(['docker','exec','-i','postgres','psql','-U','postgres','-d','idempiere_pilot','-tA','-F','\x01','-c',sql],text=True).splitlines()
rows = pg("select indexname, tablename, indexdef from pg_indexes where schemaname='adempiere' and indexdef ilike 'create unique%' and indexname not like '%\\_pkey' and indexname not like '%\\_uu\\_idx' and indexname not like '%\\_uu' order by 2,1")
lit = lambda v: "'" + v.replace("'", "''") + "'"
print("CREATE TABLE IF NOT EXISTS ad_ddl_unique (indexname TEXT, tablename TEXT, columns TEXT);")
n = skipped = 0
for r in rows:
    name, table, d = r.split('\x01')
    m = re.search(r'\(([^)]*)\)\s*(WHERE .*)?$', d)
    if not m or m.group(2) or '(' in m.group(1):   # partial or expression index: not guessed
        skipped += 1; continue
    cols = ','.join(c.strip() for c in m.group(1).split(','))
    print("INSERT INTO ad_ddl_unique SELECT %s,%s,%s WHERE NOT EXISTS (SELECT 1 FROM ad_ddl_unique WHERE indexname=%s);" % (lit(name), lit(table), lit(cols), lit(name))); n += 1
sys.stderr.write('§DDL_UNIQUE indexes=%d skipped_partial_or_expression=%d\n' % (n, skipped))
