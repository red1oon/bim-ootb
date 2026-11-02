-- PILOT-ONLY (idempiere_pilot, local copy). Owner go 2026-11-02 (write types on the local pilot; "English only, go ahead" for the film's progress beat, prompts/CAPEX_DASHBOARD.md §15 beat 7):
-- ONE updateData type so a project phase can be marked complete. Input whitelist = IsComplete only (legacy MProjectPhase has no save rule on it). Template = ws_capex_writetypes.sql.
-- Restore: DELETE its ws_webservicefieldinput / ws_webservice_para / ws_webservicetypeaccess rows, then the ws_webservicetype row (value BridgeUpdateCProjectPhase); restart.
SET search_path=adempiere;
DO $$
DECLARE tid int; t int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ws_webservicetype WHERE value='BridgeUpdateCProjectPhase') THEN
    t := (SELECT ad_table_id FROM ad_table WHERE tablename='C_ProjectPhase');
    tid := nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceType')::int,'N'::varchar);
    INSERT INTO ws_webservicetype(ad_client_id,ad_org_id,created,createdby,updated,updatedby,isactive,name,value,ws_webservice_id,ws_webservicemethod_id,ws_webservicetype_id,ws_webservicetype_uu,ad_table_id,description)
    VALUES (11,0,now(),100,now(),100,'Y','BridgeUpdateCProjectPhase','BridgeUpdateCProjectPhase',50001,(SELECT ws_webservicemethod_id FROM ws_webservicemethod WHERE value='updateData'),tid,gen_random_uuid(),t,'Bridge: updateData on C_ProjectPhase (CAPEX film progress beat)');
    INSERT INTO ws_webservicetypeaccess(ad_client_id,ad_org_id,ad_role_id,created,createdby,updated,updatedby,isactive,isreadwrite,ws_webservicetype_id,ws_webservicetypeaccess_uu)
    VALUES (11,0,102,now(),100,now(),100,'Y','Y',tid,gen_random_uuid());
    INSERT INTO ws_webservice_para(ad_client_id,ad_org_id,constantvalue,created,createdby,isactive,parametername,parametertype,updated,updatedby,ws_webservice_para_id,ws_webservicetype_id,ws_webservice_para_uu)
    SELECT 11,0,v.cv,now(),100,'Y',v.pn,v.pt,now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebService_Para')::int,'N'::varchar),tid,gen_random_uuid()
    FROM (VALUES ('TableName','C','C_ProjectPhase'),('RecordID','F',NULL),('Action','C','Update')) AS v(pn,pt,cv);
    INSERT INTO ws_webservicefieldinput(ad_client_id,ad_column_id,ad_org_id,created,createdby,isactive,updated,updatedby,ws_webservicefieldinput_id,ws_webservicetype_id,ws_webservicefieldinput_uu)
    SELECT 11,c.ad_column_id,0,now(),100,'Y',now(),100,nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceFieldInput')::int,'N'::varchar),tid,gen_random_uuid()
    FROM ad_column c WHERE c.ad_table_id=t AND c.columnname='IsComplete';
  END IF;
END $$;
