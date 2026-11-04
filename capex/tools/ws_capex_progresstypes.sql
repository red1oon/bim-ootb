-- PILOT-ONLY (idempiere_pilot, local copy). Owner go 2026-11-04 ("yes": real activity through iDempiere so the zero tiles count something). prompts/CAPEX_DASHBOARD.md §5.28. Ad hoc per the LEGACY CONVENTION staging: re-expressed as a migration script before any client server.
-- 3 updateData types (input whitelist = only what a user types in the stock window) + 1 runProcess type for the stock "Close Project" (AD_Process 227). Template = ws_capex_updatetypes.sql. Idempotent.
-- Restore: DELETE the ws_webservicefieldinput / ws_webservice_para / ws_webservicetypeaccess rows of these 4 types, then the ws_webservicetype rows.
SET search_path=adempiere;
DO $$
DECLARE d record; tid int; t int; c text;
BEGIN
  FOR d IN SELECT * FROM (VALUES
      ('CapexUpdateCProject','C_Project',ARRAY['IsCommitment','DateFinish']),
      ('CapexUpdateCProjectLine','C_ProjectLine',ARRAY['CommittedAmt']),
      ('CapexUpdateCInvoice','C_Invoice',ARRAY['C_Project_ID'])) AS v(val,tbl,cols) LOOP
    IF EXISTS (SELECT 1 FROM ws_webservicetype WHERE value=d.val) THEN CONTINUE; END IF;
    t := (SELECT ad_table_id FROM ad_table WHERE tablename=d.tbl);
    tid := nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceType')::int,'N'::varchar);
    INSERT INTO ws_webservicetype(ad_client_id,ad_org_id,created,createdby,updated,updatedby,isactive,name,value,ws_webservice_id,ws_webservicemethod_id,ws_webservicetype_id,ws_webservicetype_uu,ad_table_id,description)
    VALUES (11,0,now(),100,now(),100,'Y',d.val,d.val,50001,(SELECT ws_webservicemethod_id FROM ws_webservicemethod WHERE value='updateData'),tid,gen_random_uuid(),t,'CAPEX §5.28: update '||d.tbl);
    INSERT INTO ws_webservicetypeaccess(ad_client_id,ad_org_id,ad_role_id,created,createdby,updated,updatedby,isactive,isreadwrite,ws_webservicetype_id,ws_webservicetypeaccess_uu)
    VALUES (11,0,102,now(),100,now(),100,'Y','Y',tid,gen_random_uuid());
    INSERT INTO ws_webservice_para(ad_client_id,ad_org_id,constantvalue,created,createdby,isactive,parametername,parametertype,updated,updatedby,ws_webservice_para_id,ws_webservicetype_id,ws_webservice_para_uu)
    SELECT 11,0,v.cv,now(),100,'Y',v.pn,v.pt,now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebService_Para')::int,'N'::varchar),tid,gen_random_uuid()
    FROM (VALUES ('TableName','C',d.tbl),('RecordID','F',NULL),('Action','C','Update')) AS v(pn,pt,cv);
    FOREACH c IN ARRAY d.cols LOOP
      INSERT INTO ws_webservicefieldinput(ad_client_id,ad_column_id,ad_org_id,created,createdby,isactive,updated,updatedby,ws_webservicefieldinput_id,ws_webservicetype_id,ws_webservicefieldinput_uu)
      SELECT 11,k.ad_column_id,0,now(),100,'Y',now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceFieldInput')::int,'N'::varchar),tid,gen_random_uuid()
      FROM ad_column k WHERE k.ad_table_id=t AND k.columnname=c;
    END LOOP;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM ws_webservicetype WHERE value='Capex_RunProcess_ProjectClose') THEN
    tid := nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceType')::int,'N'::varchar);
    INSERT INTO ws_webservicetype(ad_client_id,ad_org_id,created,createdby,updated,updatedby,isactive,name,value,ws_webservice_id,ws_webservicemethod_id,ws_webservicetype_id,ws_webservicetype_uu,description)
    VALUES (11,0,now(),100,now(),100,'Y','Capex_RunProcess_ProjectClose','Capex_RunProcess_ProjectClose',50001,(SELECT ws_webservicemethod_id FROM ws_webservicemethod WHERE value='runProcess'),tid,gen_random_uuid(),'CAPEX §5.28: stock Close Project');
    INSERT INTO ws_webservicetypeaccess(ad_client_id,ad_org_id,ad_role_id,created,createdby,updated,updatedby,isactive,isreadwrite,ws_webservicetype_id,ws_webservicetypeaccess_uu)
    VALUES (11,0,102,now(),100,now(),100,'Y','Y',tid,gen_random_uuid());
    INSERT INTO ws_webservice_para(ad_client_id,ad_org_id,constantvalue,created,createdby,isactive,parametername,parametertype,updated,updatedby,ws_webservice_para_id,ws_webservicetype_id,ws_webservice_para_uu)
    SELECT 11,0,v.cv,now(),100,'Y',v.pn,v.pt,now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebService_Para')::int,'N'::varchar),tid,gen_random_uuid()
    FROM (VALUES ('AD_Process_ID','C','227'),('AD_Menu_ID','F',NULL),('AD_Record_ID','F',NULL)) AS v(pn,pt,cv);
  END IF;
END $$;
