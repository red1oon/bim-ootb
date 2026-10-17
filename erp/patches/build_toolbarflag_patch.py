#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
# ⚠ DO NOT REMOVE — Scope: AD_Column.IsToolbarButton (Y = gear/Process popup only, B = form and gear; N/NULL = form) for every column the pilot flags, written into erp/patches/ad_seed.db.sql between
#   `-- >>> TOOLBARFLAG` / `-- <<< TOOLBARFLAG` (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §45). EXTRACT ONLY from the pilot (the oracle); the twin seed carries the column but not one value, so the Process (gear) popup
#   could not list "Copy Lines", "Generate Receipt from Invoice", ... READ the printed counts. usage: build_toolbarflag_patch.py <ad_seed.db.sql>
import os, subprocess, sys
OUT = sys.argv[1]
def pg(sql):
    r = subprocess.run(['docker', 'exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', os.environ.get('PG_DB', 'idempiere_pilot'), '-tA', '-c', 'set search_path=adempiere;' + sql], capture_output=True, text=True, check=True)
    return [l for l in r.stdout.split('\n') if l and l != 'SET']
BEGIN, END = '-- >>> TOOLBARFLAG (build_toolbarflag_patch.py)', '-- <<< TOOLBARFLAG'
stmts = []
for flag in ('Y', 'B'):
    ids = [int(x) for x in pg("select ad_column_id from ad_column where istoolbarbutton='%s' order by 1" % flag)]
    for i in range(0, len(ids), 300):
        stmts.append("UPDATE ad_column SET istoolbarbutton='%s' WHERE ad_column_id IN (%s);" % (flag, ','.join(map(str, ids[i:i + 300]))))
    print('§TOOLBARFLAG %s columns=%d' % (flag, len(ids)))
txt = open(OUT).read()
if BEGIN in txt: txt = txt[:txt.index(BEGIN)].rstrip('\n') + '\n' + (txt[txt.index(END) + len(END):].lstrip('\n') if END in txt else '')
open(OUT, 'w').write(txt.rstrip('\n') + '\n' + BEGIN + '\n' + '\n'.join(stmts) + '\n' + END + '\n')
