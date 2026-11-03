-- PILOT-ONLY (idempiere_pilot, local copy). Owner go 2026-11-02 ("yes go ahead with the write types on the local pilot"): 5 CREATE WS types + 1 READ type (QueryCUOM) for the CAPEX shed twin push
-- (prompts/CAPEX_DASHBOARD.md §12.1). Template = bim-compiler scripts/bridge/pilot/ws_model_projectissue.sql (role 102, isreadwrite=Y, createData). Input whitelist = exactly the columns the push sends;
-- nothing legacy derives (PlannedAmt / rollups: MProjectLine.beforeSave :212, updateHeader :280-325). Idempotent. Restart the server after applying.
-- Restore: DELETE the rows of these 4 ws_webservicetype values and their children (ws_webservicefieldinput, ws_webservice_para, ws_webservicetypeaccess, then ws_webservicetype); restart.
SET search_path=adempiere;
DO $$
DECLARE d record; tid int; t int;
BEGIN
  FOR d IN SELECT * FROM (VALUES
     ('BridgeCreateCProject',      'C_Project',      ARRAY['Value','Name','C_Currency_ID','IsCommitment','ProjInvoiceRule','ProjectLineLevel','C_Project_UU']),
     ('BridgeCreateCProjectPhase', 'C_ProjectPhase', ARRAY['C_Project_ID','Name','SeqNo','StartDate','EndDate','IsComplete','Qty','C_ProjectPhase_UU']),
     ('BridgeCreateCProjectTask',  'C_ProjectTask',  ARRAY['C_ProjectPhase_ID','Name','SeqNo','Qty','C_ProjectTask_UU']),
     ('BridgeCreateCUOM',          'C_UOM',          ARRAY['X12DE355','Name','UOMSymbol','StdPrecision','CostingPrecision','IsDefault','C_UOM_UU']),   -- SQLite-only M/M2/M3 (§12.1 D6)
     ('BridgeCreateCProjectLine',  'C_ProjectLine',  ARRAY['C_Project_ID','C_ProjectPhase_ID','C_ProjectTask_ID','M_Product_ID','M_Product_Category_ID','Line','Description','PlannedQty','PlannedPrice','DoPricing','C_ProjectLine_UU'])
  ) AS v(val,tbl,cols) LOOP
    IF EXISTS (SELECT 1 FROM ws_webservicetype WHERE value=d.val) THEN CONTINUE; END IF;
    t := (SELECT ad_table_id FROM ad_table WHERE tablename=d.tbl);
    tid := nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceType')::int,'N'::varchar);
    INSERT INTO ws_webservicetype(ad_client_id,ad_org_id,created,createdby,updated,updatedby,isactive,name,value,ws_webservice_id,ws_webservicemethod_id,ws_webservicetype_id,ws_webservicetype_uu,ad_table_id,description)
    VALUES (11,0,now(),100,now(),100,'Y',d.val,d.val,50001,(SELECT ws_webservicemethod_id FROM ws_webservicemethod WHERE value='createData'),tid,gen_random_uuid(),t,'Bridge: createData on '||d.tbl||' (CAPEX shed twin)');
    INSERT INTO ws_webservicetypeaccess(ad_client_id,ad_org_id,ad_role_id,created,createdby,updated,updatedby,isactive,isreadwrite,ws_webservicetype_id,ws_webservicetypeaccess_uu)
    VALUES (11,0,102,now(),100,now(),100,'Y','Y',tid,gen_random_uuid());
    INSERT INTO ws_webservice_para(ad_client_id,ad_org_id,constantvalue,created,createdby,isactive,parametername,parametertype,updated,updatedby,ws_webservice_para_id,ws_webservicetype_id,ws_webservice_para_uu)
    SELECT 11,0,v.cv,now(),100,'Y',v.pn,v.pt,now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebService_Para')::int,'N'::varchar),tid,gen_random_uuid()
    FROM (VALUES ('TableName','C',d.tbl),('RecordID','F',NULL),('Action','C','Create')) AS v(pn,pt,cv);
    INSERT INTO ws_webservicefieldinput(ad_client_id,ad_column_id,ad_org_id,created,createdby,isactive,updated,updatedby,ws_webservicefieldinput_id,ws_webservicetype_id,ws_webservicefieldinput_uu)
    SELECT 11,c.ad_column_id,0,now(),100,'Y',now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceFieldInput')::int,'N'::varchar),tid,gen_random_uuid()
    FROM ad_column c WHERE c.ad_table_id=t AND c.columnname = ANY(d.cols);
  END LOOP;
END $$;
-- QueryCUOM: the read half of C_UOM find-or-create (template = ws_capex_readtypes.sql: role 102, isreadwrite=N, every physical column out)
DO $$
DECLARE tid int; t int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ws_webservicetype WHERE value='QueryCUOM') THEN
    t := (SELECT ad_table_id FROM ad_table WHERE tablename='C_UOM');
    tid := nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceType')::int,'N'::varchar);
    INSERT INTO ws_webservicetype(ad_client_id,ad_org_id,created,createdby,updated,updatedby,isactive,name,value,ws_webservice_id,ws_webservicemethod_id,ws_webservicetype_id,ws_webservicetype_uu,ad_table_id,description)
    VALUES (11,0,now(),100,now(),100,'Y','QueryCUOM','QueryCUOM',50001,50028,tid,gen_random_uuid(),t,'Bridge: read C_UOM (CAPEX shed twin)');
    INSERT INTO ws_webservicetypeaccess(ad_client_id,ad_org_id,ad_role_id,created,createdby,updated,updatedby,isactive,isreadwrite,ws_webservicetype_id,ws_webservicetypeaccess_uu)
    VALUES (11,0,102,now(),100,now(),100,'Y','N',tid,gen_random_uuid());
    INSERT INTO ws_webservice_para(ad_client_id,ad_org_id,constantvalue,created,createdby,isactive,parametername,parametertype,updated,updatedby,ws_webservice_para_id,ws_webservicetype_id,ws_webservice_para_uu)
    SELECT 11,0,v.cv,now(),100,'Y',v.pn,v.pt,now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebService_Para')::int,'N'::varchar),tid,gen_random_uuid()
    FROM (VALUES ('TableName','C','C_UOM'),('Action','C','Read'),('RecordID','F',NULL),('Filter','C','1=1')) AS v(pn,pt,cv);
    INSERT INTO ws_webservicefieldoutput(ad_client_id,ad_column_id,ad_org_id,created,createdby,isactive,updated,updatedby,ws_webservicefieldoutput_id,ws_webservicetype_id,ws_webservicefieldoutput_uu)
    SELECT 11,c.ad_column_id,0,now(),100,'Y',now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceFieldOutput')::int,'N'::varchar),tid,gen_random_uuid()
    FROM ad_column c WHERE c.ad_table_id=t AND c.isactive='Y' AND c.columnsql IS NULL;
  END IF;
END $$;
