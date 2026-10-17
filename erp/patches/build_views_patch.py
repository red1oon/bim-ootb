#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — Scope: append the legacy DB VIEWS the twin's windows sit on to erp/patches/ad_seed.db.sql (bim-compiler prompts/ERP_DEPTH_FILM.md §FN-CENSUS stage 4).
#   EXTRACT ONLY: each definition is `pg_get_viewdef` read from the pilot (docker container `postgres`, db idempiere_pilot), translated mechanically (casts stripped, = ANY(ARRAY[..]) -> IN (..));
#   nothing is hand-written. Idempotent (DROP VIEW IF EXISTS + CREATE VIEW). READ the "§VIEWS-PATCH" line after a run; the judge is erp/tests/witness_views_parity.js (rows vs the pilot's view).
# usage: build_views_patch.py <ad_seed.db.sql>   (the previous views section, between the markers, is replaced)
import re, subprocess, sys, os
OUT = sys.argv[1]
EXTRA_TABLES = ['m_locatortype', 't_selection', 't_selection_infowindow']      # tables a shipped view/UDF reads that the seed lacks: DDL extracted from the pilot (information_schema); legacy has no rows either
VIEWS = ['m_inout_createfrom_v', 'm_storage', 'm_product_stock_v', 'm_product_substituterelated_v', 'rv_c_invoice', 'rv_orderdetail', 'c_salesdashboard', 'rv_pp_mrp', 'rv_unprocessed', 'm_inoutlinema_v', 'm_movementlinema_v', 'rv_c_invoiceline', 'fact_acct_balance',
         'rv_requestupdates', 'm_costmovement_v', 'ad_allusers_v', 'ad_allroles_v', 'ad_alluserroles_v', 'ad_allclients_v', 'ad_sessioninfo_v']   # dependency order (rv_c_invoice before its users). m_storage: legacy = a VIEW over M_StorageOnHand/M_StorageReservation; the seed carried a stale 20-row TABLE copy of M_StorageOnHand nobody writes (the model layer writes M_StorageOnHand) - replaced
BEGIN, END = '-- >>> VIEWS (build_views_patch.py)', '-- <<< VIEWS'
def pg(sql):
    r = subprocess.run(['docker', 'exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', 'idempiere_pilot', '-tA', '-c', 'set search_path=adempiere;' + sql], capture_output=True, text=True)
    if r.returncode: raise SystemExit('pilot query failed: ' + r.stderr[:200])
    return r.stdout.replace('SET\n', '', 1).strip()
def translate(sql):   # ONE translator for core and plugin views: erp/pg_view_sql.js (bim-compiler ERP_FRIENDLY_OPS_LENS.md §24); Pack In uses the same module in the page
    r = subprocess.run(['node', '-e', 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(require(process.argv[1]).translate(d)))', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pg_view_sql.js')], input=sql, capture_output=True, text=True)
    if r.returncode: raise SystemExit('pg_view_sql.js failed: ' + r.stderr[:200])
    return r.stdout
# Only views the twin can actually USE are emitted: SQLite re-validates every view on ALTER/DROP/RENAME of any table, so a view over a table the twin lacks would make unrelated schema changes fail
# ("error in view rv_unprocessed: no such table: main.c_cash" - witness_period_status). The rest are NAMED (printed), never shipped broken.
import os, sqlite3
HERE = os.path.dirname(os.path.abspath(__file__))
def _conn():
    con = sqlite3.connect(':memory:'); seed = sqlite3.connect(os.path.join(HERE, '..', 'ad_seed.db')); seed.backup(con); seed.close()
    arity = re.search(r'ARITY = \{(.*?)\};', open(os.path.join(HERE, '..', 'callouts', 'sqlfn.js')).read(), re.S).group(1)
    for n in set(re.findall(r'\b(\w+):\s*\[', arity)): con.create_function(n, -1, lambda *a: None)   # stubs: only table/column resolution is judged here, not the function bodies
    for line in open(OUT).read().split(';\n'):                                            # the patch's own tables/columns (not its views)
        line = re.sub(r'^\s*--[^\n]*\n?', '', line, flags=re.M).strip()
        if line.startswith(('CREATE TABLE', 'ALTER TABLE')):
            try: con.execute(line)
            except Exception: pass
    return con
def table_ddl(t):
    cols = pg("select column_name || '|' || data_type from information_schema.columns where table_schema='adempiere' and table_name='%s' order by ordinal_position" % t).splitlines()
    m = {'numeric': 'NUMERIC', 'integer': 'INTEGER', 'character varying': 'VARCHAR', 'character': 'CHAR', 'text': 'TEXT', 'uuid': 'VARCHAR', 'timestamp without time zone': 'TIMESTAMP', 'timestamp with time zone': 'TIMESTAMP', 'date': 'DATE'}
    return 'CREATE TABLE IF NOT EXISTS %s (%s);' % (t, ', '.join('"%s" %s' % (c.split('|')[0], m.get(c.split('|')[1], 'VARCHAR')) for c in cols))
extra = [table_ddl(t) for t in EXTRA_TABLES]
if extra:                                                                                       # written first so the validation connection (and the loader) see the tables before any view
    txt0 = open(OUT).read()
    if BEGIN in txt0: txt0 = txt0[:txt0.index(BEGIN)].rstrip('\n') + '\n' + (txt0[txt0.index(END) + len(END):].lstrip('\n') if END in txt0 else '')
    open(OUT, 'w').write(txt0.rstrip('\n') + '\n' + BEGIN + '\n' + '\n'.join(extra) + '\n' + END + '\n')
CON = _conn()
def is_table(name):
    return CON.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND lower(name)=lower(?)", (name,)).fetchone() is not None
def usable(name, create_sql):                                                               # earlier emitted views stay in CON, so a view over another shipped view resolves
    try:
        if is_table(name): CON.execute('DROP TABLE %s' % name)
        CON.execute(create_sql); CON.execute('SELECT * FROM %s LIMIT 0' % name).fetchall(); return None
    except Exception as e: return str(e)[:80]
skipped = []
stmts = []
for v in VIEWS:
    d = pg("select pg_get_viewdef('%s'::regclass)" % v).rstrip().rstrip(';')
    create = 'CREATE VIEW %s AS %s' % (v, re.sub(r'\s+', ' ', translate(d)))
    was_table = is_table(v)
    why = usable(v, create)
    if why: skipped.append('%s (%s)' % (v, why)); continue
    if was_table: stmts.append('DROP TABLE IF EXISTS %s;' % v)          # the seed ships a stale TABLE of this name; legacy has a VIEW (the statement is a tolerated no-op once it is a view)
    stmts.append('DROP VIEW IF EXISTS %s;' % v)
    stmts.append(create + ';')
txt = open(OUT).read()
if BEGIN in txt:
    txt = txt[:txt.index(BEGIN)].rstrip('\n') + '\n' + (txt[txt.index(END) + len(END):].lstrip('\n') if END in txt else '')
txt = txt.rstrip('\n') + '\n' + BEGIN + '\n' + '\n'.join(extra + stmts) + '\n' + END + '\n'
open(OUT, 'w').write(txt)
print('§VIEWS-PATCH views=%d emitted=%d statements=%d -> %s' % (len(VIEWS), len([x for x in stmts if x.startswith('CREATE VIEW')]), len(stmts), OUT))
print('§VIEWS-PATCH NOT-SHIPPED (twin lacks a table/column): ' + '; '.join(skipped))
