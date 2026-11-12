#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
# ⚠ DO NOT REMOVE — Scope: AD_StatusLineUsedIn (which window/tab/table shows which AD_StatusLine; the twin seed had AD_StatusLine + AD_Message but not this link table) for every row the pilot holds, written into
#   erp/patches/ad_seed.db.sql between `-- >>> STATUSLINEUSEDIN` / `-- <<< STATUSLINEUSEDIN` (bim-ootb prompts/CAPEX_DASHBOARD.md §5.47, S7; twin of legacy MStatusLine.getSL). EXTRACT ONLY from the pilot. READ THE LOG: §STATUSLINEUSEDIN rows=N
#   usage: build_statuslineusedin_patch.py <ad_seed.db.sql>   (docker shim; PG_DB defaults to idempiere_pilot)
import os, subprocess, sys
OUT = sys.argv[1]
def pg(sql):
    r = subprocess.run(['docker', 'exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', os.environ.get('PG_DB', 'idempiere_pilot'), '-tAF', '\t', '-c', 'set search_path=adempiere;' + sql], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr)
    return [l for l in r.stdout.split('\n') if l and l != 'SET']
q = lambda v: 'NULL' if v == '' else "'" + v.replace("'", "''") + "'"
COLS = ['ad_statuslineusedin_id', 'ad_client_id', 'ad_org_id', 'isactive', 'ad_statusline_id', 'ad_window_id', 'ad_tab_id', 'ad_table_id', 'ad_infowindow_id', 'isstatusline', 'seqno', 'entitytype', 'ad_statuslineusedin_uu']
NUM = tuple(c for c in COLS if c.endswith('_id') or c == 'seqno')
BEGIN, END = '-- >>> STATUSLINEUSEDIN (build_statuslineusedin_patch.py)', '-- <<< STATUSLINEUSEDIN'
rows = pg('select %s from ad_statuslineusedin order by 1' % ','.join("coalesce(%s::text,'')" % c for c in COLS))
stmts = ['CREATE TABLE IF NOT EXISTS ad_statuslineusedin (%s);' % ', '.join('"%s" %s' % (c, 'NUMERIC' if c in NUM else 'TEXT') for c in COLS)]
for r in rows:
    stmts.append('INSERT OR IGNORE INTO ad_statuslineusedin (%s) VALUES (%s);' % (','.join('"%s"' % c for c in COLS), ','.join(q(x) for x in r.split('\t'))))
print('§STATUSLINEUSEDIN rows=%d' % len(rows))
txt = open(OUT).read()
if BEGIN in txt: txt = txt[:txt.index(BEGIN)].rstrip('\n') + '\n' + (txt[txt.index(END) + len(END):].lstrip('\n') if END in txt else '')
open(OUT, 'w').write(txt.rstrip('\n') + '\n' + BEGIN + '\n' + '\n'.join(stmts) + '\n' + END + '\n')
