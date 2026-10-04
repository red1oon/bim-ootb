# ⚠ DO NOT REMOVE — scope: the MODEL LAYER part of erp/patches/ad_seed.db.sql (bim-compiler prompts/ERP_MODEL_LAYER.md
# §DESIGN 5). EXTRACT ONLY from the reference Postgres `idempiere` (read-only): DDL for the tables the model writes that the
# bundle never shipped, fact_acct's FactLine dimension columns, the Process_* workflows the DocAction column runs, the
# physical column DEFAULTs PO.saveNew relies on (ad_ddl_default), conversion types, GardenWorld cost queues.
# Idempotent statements, one per line (the loader splits on ';\n'). Called by build_ad_seed_patch.sh; read its §-line.
import psycopg2, re, sys, datetime, decimal
cn = psycopg2.connect(host='localhost', user='adempiere', password='adempiere', dbname='idempiere'); cur = cn.cursor(); cur.execute('set search_path=adempiere')
def cols(t):
    cur.execute("select column_name, data_type from information_schema.columns where table_schema='adempiere' and table_name=%s order by ordinal_position", (t,)); return cur.fetchall()
def aff(d): return 'NUMERIC' if d in ('numeric', 'integer', 'bigint') else 'TEXT'
def lit(v):
    if v is None: return 'NULL'
    if isinstance(v, bool): return "'Y'" if v else "'N'"
    if isinstance(v, (int, float, decimal.Decimal)): return str(v)
    if isinstance(v, datetime.datetime): return "'" + v.strftime('%Y-%m-%d %H:%M:%S') + "'"
    if isinstance(v, datetime.date): return "'" + v.strftime('%Y-%m-%d') + " 00:00:00'"
    return "'" + str(v).replace("'", "''").replace('\n', ' ') + "'"
out = []; n = 0
for t in ['ad_message', 'm_inoutlinema', 'm_storagereservationlog', 'm_costdetail', 'm_costhistory', 'm_costqueue', 'ad_workflow', 'ad_wf_node', 'c_conversiontype', 'c_paymentallocate', 'c_orderlandedcost', 'c_orderpayschedule',
          'ad_sequence_no', 't_fact_acct_history', 'c_orderlandedcostallocation', 'ad_sysconfig', 'c_projectissue', 'm_production', 'm_productionline']:   # + core P2P/costing (ERP_MODEL_LAYER.md §CORE-P2P)
    out.append('CREATE TABLE IF NOT EXISTS %s (%s);' % (t, ', '.join('"%s" %s' % (c, aff(d)) for c, d in cols(t))))
for c, d in cols('fact_acct'):
    if c in ('c_locfrom_id', 'c_locto_id', 'c_uom_id', 'ad_orgtrx_id', 'c_activity_id', 'c_campaign_id', 'c_project_id', 'c_salesregion_id', 'user1_id', 'user2_id', 'c_costcenter_id', 'c_department_id', 'm_warehouse_id'):
        out.append('ALTER TABLE fact_acct ADD COLUMN %s %s;' % (c, aff(d)))
def rows(t, where):
    global n
    cs = [c for c, _ in cols(t)]
    cur.execute('select %s from %s where %s' % (', '.join('"%s"' % c for c in cs), t, where))
    for r in cur.fetchall():
        out.append('INSERT OR IGNORE INTO %s (%s) VALUES (%s);' % (t, ', '.join('"%s"' % c for c in cs), ', '.join(lit(v) for v in r))); n += 1
WF = "ad_workflow_id in (select ad_workflow_id from ad_process where ad_process_id in (select ad_process_id from ad_column where columnname='DocAction'))"
rows('ad_workflow', WF); rows('ad_wf_node', WF)
rows('ad_wf_nodenext', 'ad_wf_node_id in (select ad_wf_node_id from ad_wf_node where %s)' % WF)
rows('ad_message', "value in ('Voided')")   # Msg.getMsg texts the model writes into documents (MOrder.voidIt)
rows('c_conversiontype', 'true'); rows('m_costqueue', 'ad_client_id=11')
# M_StorageOnHand / M_StorageReservation: the bundle carries a subset (reservation 2 of the reference's rows) captured earlier —
# the model's MStorage*.add must start from the reference quantities. Insert missing rows by UU, re-sync quantities by UU.
for t, qcols in (('m_storageonhand', ['qtyonhand']), ('m_storagereservation', ['qty'])):
    cs = [c for c, _ in cols(t)]
    cur.execute('select %s from %s where ad_client_id=11' % (', '.join('"%s"' % c for c in cs), t))
    for r in cur.fetchall():
        d = dict(zip(cs, r)); uu = d[t + '_uu']
        out.append('INSERT INTO %s (%s) SELECT %s WHERE NOT EXISTS (SELECT 1 FROM %s WHERE %s_uu=%s);' % (t, ', '.join('"%s"' % c for c in cs), ', '.join(lit(v) for v in r), t, t, lit(uu)))
        out.append('UPDATE %s SET %s WHERE %s_uu=%s;' % (t, ', '.join('%s=%s' % (q, lit(d[q])) for q in qcols), t, lit(uu))); n += 2
# the bundle's M_Cost rows were captured before the reference DB's cost history settled (e.g. product 130 Standard element:
# bundle CurrentQty 0 vs 19) — re-sync the value columns by the row's own UU (idempotent UPDATE, no new rows)
cur.execute("select m_cost_uu, currentcostprice, currentqty, cumulatedamt, cumulatedqty, futurecostprice from m_cost where ad_client_id=11 and m_cost_uu is not null")
for uu, p_, q, ca, cq, fp in cur.fetchall():
    out.append('UPDATE m_cost SET currentcostprice=%s, currentqty=%s, cumulatedamt=%s, cumulatedqty=%s, futurecostprice=%s WHERE m_cost_uu=%s;' % (lit(p_), lit(q), lit(ca), lit(cq), lit(fp), lit(uu))); n += 1
out.append('CREATE TABLE IF NOT EXISTS ad_ddl_default (tablename TEXT, columnname TEXT, defaultvalue TEXT);')
T = ['c_order', 'c_orderline', 'c_ordertax', 'm_inout', 'm_inoutline', 'm_inoutlinema', 'm_transaction', 'm_storageonhand', 'm_storagereservation', 'm_storagereservationlog',
     'm_costdetail', 'm_cost', 'm_costhistory', 'm_costqueue', 'c_invoice', 'c_invoiceline', 'c_invoicetax', 'c_payment', 'c_allocationhdr', 'c_allocationline', 'fact_acct',
     'ad_wf_process', 'ad_wf_activity', 'ad_wf_eventaudit', 'm_matchpo', 'm_matchinv',
     'c_bankstatementline', 'm_inventoryline', 'c_periodcontrol']   # + §CP-OPEN 4a: IsManual/EftAmt, QtyCsv/CurrentCostPrice/NewCostPrice (physical DEFAULTs)
cur.execute("select table_name, column_name, column_default from information_schema.columns where table_schema='adempiere' and column_default is not null and table_name = any(%s) order by 1,2", (T,))
for t, c, d in cur.fetchall():
    v = d.split('::')[0].strip()
    if v.startswith('(') and v.endswith(')'): v = v[1:-1]
    if v.startswith("'") and v.endswith("'"): v = v[1:-1]
    elif not re.match(r'^-?\d+(\.\d+)?$', v): continue
    out.append("INSERT INTO ad_ddl_default SELECT %s,%s,%s WHERE NOT EXISTS (SELECT 1 FROM ad_ddl_default WHERE tablename=%s AND columnname=%s);" % (lit(t), lit(c), lit(v), lit(t), lit(c))); n += 1
# C_PeriodControl.PeriodStatus has NO physical DEFAULT; its default is AD_Column.DefaultValue ('N' = NeverOpened, MPeriodControl.java:67-70) -- extracted, same table
cur.execute("select c.columnname, c.defaultvalue from ad_column c join ad_table t on t.ad_table_id=c.ad_table_id where t.tablename='C_PeriodControl' and c.columnname in ('PeriodStatus','PeriodAction') and c.defaultvalue is not null")
for c, d in cur.fetchall():
    out.append("INSERT INTO ad_ddl_default SELECT %s,%s,%s WHERE NOT EXISTS (SELECT 1 FROM ad_ddl_default WHERE tablename=%s AND columnname=%s);" % (lit('c_periodcontrol'), lit(c.lower()), lit(d), lit('c_periodcontrol'), lit(c.lower()))); n += 1
print('\n'.join(out))
print('§MODEL-PATCH statements=%d rows=%d' % (len(out), n), file=sys.stderr)
