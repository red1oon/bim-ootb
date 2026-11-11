-- CAPEX-WS-BIMDOC (bim-ootb prompts/CAPEX_DASHBOARD.md §5.36B): ONE read-only web-service type, QueryBIMDocument, that lets the CAPEX dashboard read the BIM Document table (plugin org.idempiere.bimdocument).
-- Where the plugin is not installed this script does nothing (NOTICE) and is not recorded; the dashboard then prints "no data (not installed)".
-- Same convention as 202611042300_CAPEX-WS-READ.sql: client 11, role 102 (GardenWorld Admin), Filter parameter Constant 1=1 (IDEMPIERE-1784). Ids come from the sequences and columns are found by NAME,
-- so nothing here depends on the plugin's numeric ids. Idempotent: a second run finds the type and stops. After applying: update_sequences() is NOT needed (nextidfunc), restart the server (WS types and access are cached).
-- Restore: DELETE FROM WS_WebServiceFieldOutput/WS_WebService_Para/WS_WebServiceTypeAccess WHERE WS_WebServiceType_ID=(SELECT WS_WebServiceType_ID FROM WS_WebServiceType WHERE Value='QueryBIMDocument'); then the type; restart.
DO $$
DECLARE
  t numeric; tab numeric; cols text[] := ARRAY['BIM_Document_ID','C_Project_ID','C_ProjectPhase_ID','C_ProjectTask_ID','DeliverableNo','Revision','DocStatus','IsActive','Name','Discipline','HoursBudget'];
  c text; cid numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM WS_WebServiceType WHERE Value='QueryBIMDocument') THEN RAISE NOTICE 'QueryBIMDocument already registered'; RETURN; END IF;
  SELECT AD_Table_ID INTO tab FROM AD_Table WHERE TableName='BIM_Document';
  IF tab IS NULL THEN RAISE NOTICE 'BIM_Document is not installed on this server (plugin org.idempiere.bimdocument): nothing to register, script NOT recorded (re-apply after installing the plugin)'; RETURN; END IF;
  t := nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebServiceType'),'N');
  INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU)
    VALUES (0,0,tab,now(),100,'CAPEX dashboard: read BIM Document','Y','QueryBIMDocument',now(),100,'QueryBIMDocument',
      (SELECT WS_WebService_ID FROM WS_WebService WHERE Value='ModelADService'),(SELECT WS_WebServiceMethod_ID FROM WS_WebServiceMethod WHERE Value='queryData' AND WS_WebService_ID=(SELECT WS_WebService_ID FROM WS_WebService WHERE Value='ModelADService')),t,generate_uuid());
  INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU)
    VALUES (11,0,102,now(),100,'Y','N',now(),100,t,generate_uuid());
  INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU)
    VALUES (0,0,'BIM_Document',now(),100,'Y','TableName','C',now(),100,nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebService_Para'),'N'),t,generate_uuid());
  INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU)
    VALUES (0,0,'Read',now(),100,'Y','Action','C',now(),100,nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebService_Para'),'N'),t,generate_uuid());
  INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU)
    VALUES (0,0,now(),100,'Y','RecordID','F',now(),100,nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebService_Para'),'N'),t,generate_uuid());
  INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU)
    VALUES (0,0,'1=1',now(),100,'Y','Filter','C',now(),100,nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebService_Para'),'N'),t,generate_uuid());
  FOREACH c IN ARRAY cols LOOP
    SELECT AD_Column_ID INTO cid FROM AD_Column WHERE AD_Table_ID=tab AND ColumnName=c;
    IF cid IS NULL THEN RAISE EXCEPTION 'BIM_Document has no column %', c; END IF;
    INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU)
      VALUES (0,cid,0,now(),100,'Y',now(),100,nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebServiceFieldOutput'),'N'),t,generate_uuid());
  END LOOP;
  PERFORM register_migration_script('202611111200_CAPEX-WS-BIMDOC.sql');   -- recorded only when the type was really registered
END $$;
