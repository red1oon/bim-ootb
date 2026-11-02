-- PILOT-ONLY, POC stage (owner "go" 2026-11-03; prompts/CAPEX_DASHBOARD.md §5.3 R0). Ad-hoc like the other ws_capex_*.sql — re-express in the migration convention once proven.
-- BridgeCreatePAGoal (createData on PA_Goal, as a user creates it) + BridgeUpdatePAGoal (updateData, MeasureTarget only: a model save with a changed target is what makes legacy run
--   the measure SQL — MGoal.afterSave → updateGoal(true); a CREATE alone computes nothing, MGoal.getMeasureGoals reads outside the uncommitted trx) + QueryPAGoal (read back).
-- Restore: DELETE the ws_webservicefieldinput/fieldoutput, ws_webservice_para, ws_webservicetypeaccess rows of these two ws_webservicetype values, then the types; restart.
SET search_path=adempiere;
DO $$
DECLARE tid int; t int;
BEGIN
  t := (SELECT ad_table_id FROM ad_table WHERE tablename='PA_Goal');
  IF NOT EXISTS (SELECT 1 FROM ws_webservicetype WHERE value='BridgeCreatePAGoal') THEN
    tid := nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceType')::int,'N'::varchar);
    INSERT INTO ws_webservicetype(ad_client_id,ad_org_id,created,createdby,updated,updatedby,isactive,name,value,ws_webservice_id,ws_webservicemethod_id,ws_webservicetype_id,ws_webservicetype_uu,ad_table_id,description)
    VALUES (11,0,now(),100,now(),100,'Y','BridgeCreatePAGoal','BridgeCreatePAGoal',50001,(SELECT ws_webservicemethod_id FROM ws_webservicemethod WHERE value='createData'),tid,gen_random_uuid(),t,'CAPEX R0: create a PA goal (pilot POC)');
    INSERT INTO ws_webservicetypeaccess(ad_client_id,ad_org_id,ad_role_id,created,createdby,updated,updatedby,isactive,isreadwrite,ws_webservicetype_id,ws_webservicetypeaccess_uu)
    VALUES (11,0,102,now(),100,now(),100,'Y','Y',tid,gen_random_uuid());
    INSERT INTO ws_webservice_para(ad_client_id,ad_org_id,constantvalue,created,createdby,isactive,parametername,parametertype,updated,updatedby,ws_webservice_para_id,ws_webservicetype_id,ws_webservice_para_uu)
    SELECT 11,0,v.cv,now(),100,'Y',v.pn,v.pt,now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebService_Para')::int,'N'::varchar),tid,gen_random_uuid()
    FROM (VALUES ('TableName','C','PA_Goal'),('RecordID','F',NULL),('Action','C','Create')) AS v(pn,pt,cv);
    INSERT INTO ws_webservicefieldinput(ad_client_id,ad_column_id,ad_org_id,created,createdby,isactive,updated,updatedby,ws_webservicefieldinput_id,ws_webservicetype_id,ws_webservicefieldinput_uu)
    SELECT 11,c.ad_column_id,0,now(),100,'Y',now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceFieldInput')::int,'N'::varchar),tid,gen_random_uuid()
    FROM ad_column c WHERE c.ad_table_id=t AND c.columnname IN ('Name','PA_Measure_ID','MeasureScope','MeasureTarget','PA_ColorSchema_ID','SeqNo','IsSummary','RelativeWeight','ChartType','Description');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ws_webservicetype WHERE value='QueryPAGoal') THEN
    tid := nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceType')::int,'N'::varchar);
    INSERT INTO ws_webservicetype(ad_client_id,ad_org_id,created,createdby,updated,updatedby,isactive,name,value,ws_webservice_id,ws_webservicemethod_id,ws_webservicetype_id,ws_webservicetype_uu,ad_table_id,description)
    VALUES (11,0,now(),100,now(),100,'Y','QueryPAGoal','QueryPAGoal',50001,(SELECT ws_webservicemethod_id FROM ws_webservicemethod WHERE value='queryData'),tid,gen_random_uuid(),t,'CAPEX R0: read PA goals (pilot POC)');
    INSERT INTO ws_webservicetypeaccess(ad_client_id,ad_org_id,ad_role_id,created,createdby,updated,updatedby,isactive,isreadwrite,ws_webservicetype_id,ws_webservicetypeaccess_uu)
    VALUES (11,0,102,now(),100,now(),100,'Y','N',tid,gen_random_uuid());
    INSERT INTO ws_webservice_para(ad_client_id,ad_org_id,constantvalue,created,createdby,isactive,parametername,parametertype,updated,updatedby,ws_webservice_para_id,ws_webservicetype_id,ws_webservice_para_uu)
    SELECT 11,0,v.cv,now(),100,'Y',v.pn,v.pt,now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebService_Para')::int,'N'::varchar),tid,gen_random_uuid()
    FROM (VALUES ('TableName','C','PA_Goal'),('Action','C','Read'),('RecordID','F',NULL),('Filter','F',NULL)) AS v(pn,pt,cv);
    INSERT INTO ws_webservicefieldoutput(ad_client_id,ad_column_id,ad_org_id,created,createdby,isactive,updated,updatedby,ws_webservicefieldoutput_id,ws_webservicetype_id,ws_webservicefieldoutput_uu)
    SELECT 11,c.ad_column_id,0,now(),100,'Y',now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceFieldOutput')::int,'N'::varchar),tid,gen_random_uuid()
    FROM ad_column c WHERE c.ad_table_id=t AND c.columnname IN ('PA_Goal_ID','Name','PA_Measure_ID','MeasureActual','MeasureTarget','GoalPerformance','DateLastRun','MeasureScope');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ws_webservicetype WHERE value='BridgeUpdatePAGoal') THEN
    tid := nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceType')::int,'N'::varchar);
    INSERT INTO ws_webservicetype(ad_client_id,ad_org_id,created,createdby,updated,updatedby,isactive,name,value,ws_webservice_id,ws_webservicemethod_id,ws_webservicetype_id,ws_webservicetype_uu,ad_table_id,description)
    VALUES (11,0,now(),100,now(),100,'Y','BridgeUpdatePAGoal','BridgeUpdatePAGoal',50001,(SELECT ws_webservicemethod_id FROM ws_webservicemethod WHERE value='updateData'),tid,gen_random_uuid(),t,'CAPEX R0: save a PA goal target (pilot POC)');
    INSERT INTO ws_webservicetypeaccess(ad_client_id,ad_org_id,ad_role_id,created,createdby,updated,updatedby,isactive,isreadwrite,ws_webservicetype_id,ws_webservicetypeaccess_uu)
    VALUES (11,0,102,now(),100,now(),100,'Y','Y',tid,gen_random_uuid());
    INSERT INTO ws_webservice_para(ad_client_id,ad_org_id,constantvalue,created,createdby,isactive,parametername,parametertype,updated,updatedby,ws_webservice_para_id,ws_webservicetype_id,ws_webservice_para_uu)
    SELECT 11,0,v.cv,now(),100,'Y',v.pn,v.pt,now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebService_Para')::int,'N'::varchar),tid,gen_random_uuid()
    FROM (VALUES ('TableName','C','PA_Goal'),('RecordID','F',NULL),('Action','C','Update')) AS v(pn,pt,cv);
    INSERT INTO ws_webservicefieldinput(ad_client_id,ad_column_id,ad_org_id,created,createdby,isactive,updated,updatedby,ws_webservicefieldinput_id,ws_webservicetype_id,ws_webservicefieldinput_uu)
    SELECT 11,c.ad_column_id,0,now(),100,'Y',now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceFieldInput')::int,'N'::varchar),tid,gen_random_uuid()
    FROM ad_column c WHERE c.ad_table_id=t AND c.columnname='MeasureTarget';
  END IF;
END $$;
