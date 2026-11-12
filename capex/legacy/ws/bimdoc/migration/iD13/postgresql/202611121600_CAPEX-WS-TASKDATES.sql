-- CAPEX-WS-TASKDATES (bim-ootb prompts/CAPEX_DASHBOARD.md §5.58): the two task-date columns of the BIM Document plugin (C_ProjectTask.BIM_StartDate / BIM_EndDate) become OUTPUT fields of the stock read type QueryCProjectTask
-- (the dashboard's Schedule tab) and INPUT fields of the push type BridgeCreateCProjectTask (the viewer push writes them). Same convention as 202611111200_CAPEX-WS-BIMDOC.sql: where the plugin (the columns) or the types are not
-- on this server the script does NOTHING (NOTICE) and is not recorded; columns are found by NAME. Idempotent. After applying: restart the server (WS types are cached).
-- Restore: DELETE the WS_WebServiceFieldOutput/Input rows of those two columns for the two types; restart.
DO $$
DECLARE
  c text; cid numeric; tq numeric; tb numeric; n int := 0;
BEGIN
  SELECT WS_WebServiceType_ID INTO tq FROM WS_WebServiceType WHERE Value='QueryCProjectTask';
  SELECT WS_WebServiceType_ID INTO tb FROM WS_WebServiceType WHERE Value='BridgeCreateCProjectTask';
  FOREACH c IN ARRAY ARRAY['BIM_StartDate','BIM_EndDate'] LOOP
    SELECT AD_Column_ID INTO cid FROM AD_Column WHERE ColumnName=c AND AD_Table_ID=(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_ProjectTask');
    IF cid IS NULL THEN RAISE NOTICE 'C_ProjectTask.% is not on this server (plugin org.idempiere.bimdocument): nothing to register', c; CONTINUE; END IF;
    IF tq IS NOT NULL AND NOT EXISTS (SELECT 1 FROM WS_WebServiceFieldOutput WHERE WS_WebServiceType_ID=tq AND AD_Column_ID=cid) THEN
      INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Org_ID,AD_Column_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU)
        VALUES (11,0,cid,now(),100,'Y',now(),100,nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebServiceFieldOutput'),'N'),tq,generate_uuid()); n := n + 1;
    END IF;
    IF tb IS NOT NULL AND NOT EXISTS (SELECT 1 FROM WS_WebServiceFieldInput WHERE WS_WebServiceType_ID=tb AND AD_Column_ID=cid) THEN
      INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Org_ID,AD_Column_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU)
        VALUES (11,0,cid,now(),100,'Y',now(),100,nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebServiceFieldInput'),'N'),tb,'N','N',generate_uuid()); n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'task-date WS fields added: %', n;
END $$;
