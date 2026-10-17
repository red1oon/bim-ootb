#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
# ⚠ DO NOT REMOVE — Scope: AD_InfoProcess (the process buttons of an Info Window) for every row the pilot holds, written into erp/patches/ad_seed.db.sql between `-- >>> INFOPROCESS` / `-- <<< INFOPROCESS`
#   (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §49, W-CREATEFROM-INFOWIN). EXTRACT ONLY from the pilot (the oracle); the twin seed had no AD_InfoProcess table, so the generic Info Window could not show its process buttons.
#   READ the printed count. usage: build_infoprocess_patch.py <ad_seed.db.sql>   (docker shim or host psql via PGPASSWORD; PG_DB defaults to idempiere_pilot)
import os, subprocess, sys
OUT = sys.argv[1]
COLS = ['ad_infoprocess_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby', 'imageurl', 'seqno', 'ad_process_id', 'ad_infowindow_id', 'layouttype', 'displaylogic', 'ad_infocolumn_id', 'entitytype', 'ad_infoprocess_uu']
NUM = ('ad_infoprocess_id', 'ad_client_id', 'ad_org_id', 'createdby', 'updatedby', 'seqno', 'ad_process_id', 'ad_infowindow_id', 'ad_infocolumn_id')
def pg(sql):
    r = subprocess.run(['docker', 'exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', os.environ.get('PG_DB', 'idempiere_pilot'), '-tAF', '\t', '-c', 'set search_path=adempiere;' + sql], capture_output=True, text=True, check=True)
    return [l for l in r.stdout.split('\n') if l and l != 'SET']
q = lambda v: 'NULL' if v == '' else "'" + v.replace("'", "''") + "'"
rows = pg('select %s from ad_infoprocess order by 1' % ','.join(COLS))
BEGIN, END = '-- >>> INFOPROCESS (build_infoprocess_patch.py)', '-- <<< INFOPROCESS'
stmts = ['CREATE TABLE IF NOT EXISTS ad_infoprocess (%s);' % ', '.join('"%s" %s' % (c, 'NUMERIC' if c in NUM else 'TEXT') for c in COLS)]
for r in rows:
    stmts.append('INSERT OR IGNORE INTO ad_infoprocess (%s) VALUES (%s);' % (','.join('"%s"' % c for c in COLS), ','.join(q(x) for x in r.split('\t'))))
print('§INFOPROCESS rows=%d' % len(rows))
txt = open(OUT).read()
if BEGIN in txt: txt = txt[:txt.index(BEGIN)].rstrip('\n') + '\n' + (txt[txt.index(END) + len(END):].lstrip('\n') if END in txt else '')
open(OUT, 'w').write(txt.rstrip('\n') + '\n' + BEGIN + '\n' + '\n'.join(stmts) + '\n' + END + '\n')
