import subprocess,json
def q(db,sql):
    o=subprocess.run(['docker','exec','-i','postgres','psql','-U','adempiere','-d',db,'-qtA','-c','set search_path=adempiere','-c',sql],capture_output=True,text=True).stdout
    return o[o.index('['):]
OFFS={'Bridge_createData_M_Product_Category':5000000,'Bridge_createData_M_Product':5000000,'BridgeCreateProjectIssue':6000000,'BridgeCompleteProjectIssue':6000000,'BridgeCreateOrder':7000000,'BridgeCreateOrderLine':7000000,'BridgeDocActionCOrder':7000000,'Pilot_updateData_C_Order':7000000}
out=[]
for name,OFF in OFFS.items():
    N="'%s'"%name; sub="ws_webservicetype_id in (select ws_webservicetype_id from ws_webservicetype where value in (%s))"%N
    for t,w,idc in [('ws_webservicetype',"value in (%s)"%N,['ws_webservicetype_id']),('ws_webservicetypeaccess',sub,['ws_webservicetype_id']),('ws_webservice_para',sub,['ws_webservice_para_id','ws_webservicetype_id']),('ws_webservicefieldinput',sub,['ws_webservicefieldinput_id','ws_webservicetype_id']),('ws_webservicefieldoutput',sub,['ws_webservicefieldoutput_id','ws_webservicetype_id'])]:
        rows=json.loads(q('idempiere_pilot',"select coalesce(json_agg(x),'[]') from %s x where %s"%(t,w)))
        for r in rows:
            for c in idc:
                if r.get(c) is not None: r[c]=int(r[c])+OFF
            if 'ad_role_id' in r: r['ad_role_id']=102
        if rows: out.append("INSERT INTO %s SELECT * FROM json_populate_recordset(null::%s, $j$%s$j$) ON CONFLICT DO NOTHING;"%(t,t,json.dumps(rows)))
print('\n'.join(out))
