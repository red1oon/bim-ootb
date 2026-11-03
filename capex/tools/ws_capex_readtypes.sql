-- PILOT-ONLY (idempiere_pilot, local copy). Owner go 2026-11-02: register 6 READ-ONLY WS read types for the CAPEX dashboard (capex/ in bim-ootb).
-- Same template as bim-compiler scripts/bridge/pilot/ws_changelog_read.sql (role 102, isreadwrite=N, Read action). Idempotent. Restart the server after applying.
-- Restore: DELETE the rows of these 6 ws_webservicetype values and their children (see prompts/CAPEX_DASHBOARD.md section 10).
SET search_path=adempiere;
DO $$
DECLARE d record; tid int; t int; c record;
BEGIN
  FOR d IN SELECT * FROM (VALUES
      ('QueryCProjectPhase','C_ProjectPhase',NULL::text[]),
      ('QueryCProjectTask','C_ProjectTask',NULL::text[]),
      ('QueryCProjectLine','C_ProjectLine',NULL::text[]),
      ('QueryCPhase','C_Phase',NULL::text[]),
      ('QueryCCurrency','C_Currency',NULL::text[]),
      ('QueryADWFActivity','AD_WF_Activity',NULL::text[])) AS v(val,tbl,cols) LOOP
    IF EXISTS (SELECT 1 FROM ws_webservicetype WHERE value=d.val) THEN CONTINUE; END IF;
    t := (SELECT ad_table_id FROM ad_table WHERE tablename=d.tbl);
    tid := nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceType')::int,'N'::varchar);
    INSERT INTO ws_webservicetype(ad_client_id,ad_org_id,created,createdby,updated,updatedby,isactive,name,value,
        ws_webservice_id,ws_webservicemethod_id,ws_webservicetype_id,ws_webservicetype_uu,ad_table_id,description)
    VALUES (11,0,now(),100,now(),100,'Y',d.val,d.val,50001,50028,tid,gen_random_uuid(),t,'Bridge: read '||d.tbl);
    INSERT INTO ws_webservicetypeaccess(ad_client_id,ad_org_id,ad_role_id,created,createdby,updated,updatedby,isactive,isreadwrite,ws_webservicetype_id,ws_webservicetypeaccess_uu)
    VALUES (11,0,102,now(),100,now(),100,'Y','N',tid,gen_random_uuid());
    INSERT INTO ws_webservice_para(ad_client_id,ad_org_id,constantvalue,created,createdby,isactive,parametername,parametertype,updated,updatedby,ws_webservice_para_id,ws_webservicetype_id,ws_webservice_para_uu)
    SELECT 11,0,v.cv,now(),100,'Y',v.pn,v.pt,now(),100,
           nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebService_Para')::int,'N'::varchar),tid,gen_random_uuid()
    FROM (VALUES ('TableName','C',d.tbl),('Action','C','Read'),('RecordID','F',NULL),('Filter','C','1=1')) AS v(pn,pt,cv);
    FOR c IN SELECT ad_column_id FROM ad_column WHERE ad_table_id=t AND isactive='Y'
             AND columnsql IS NULL      -- virtual (SQL) columns are not in the table: WS query fails on them (found by M3: 'DocBaseType not found in ResultSet')
             AND (d.cols IS NULL OR columnname = ANY(d.cols)) LOOP
      INSERT INTO ws_webservicefieldoutput(ad_client_id,ad_column_id,ad_org_id,created,createdby,isactive,updated,updatedby,ws_webservicefieldoutput_id,ws_webservicetype_id,ws_webservicefieldoutput_uu)
      VALUES (11,c.ad_column_id,0,now(),100,'Y',now(),100,
        nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceFieldOutput')::int,'N'::varchar),tid,gen_random_uuid());
    END LOOP;
  END LOOP;
END $$;
