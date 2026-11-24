-- CAPEX-WS-RATES (bim-ootb prompts/CAPEX_DASHBOARD.md "2026-11-25 SPEC" claim 3): four read-only web-service types, so the dashboard reads what a foreign sum is worth in the accounting currency from the server it shows:
--   QueryCConversionRate (C_Conversion_Rate), QueryCConversionType (C_ConversionType: which type is the default), QueryCAcctSchema (C_AcctSchema: the schema's currency), QueryADClientInfo (AD_ClientInfo: the client's primary schema).
-- Own folder (W-WS-MIG: the site folder holds ONE all-plain-INSERT script). Same convention as 202611131400_CAPEX-WS-PACALC.sql: client 11, role 102, Filter Constant 1=1. Ids from the sequences, columns found by NAME. Idempotent. Restart the server after applying.
-- Optional for a site: without them the dashboard prints no conversion and says NO_SOURCE (capex/adapters.js OPTIONAL), never a guessed figure.
-- Restore: delete WS_WebServiceFieldOutput/WS_WebService_Para/WS_WebServiceTypeAccess of the four types, then the types; restart.
DO $$
DECLARE
  spec text[][] := ARRAY[
    ['QueryCConversionRate','C_Conversion_Rate','C_Conversion_Rate_ID,AD_Client_ID,AD_Org_ID,C_Currency_ID,C_Currency_ID_To,C_ConversionType_ID,MultiplyRate,DivideRate,ValidFrom,ValidTo,IsActive'],
    ['QueryCConversionType','C_ConversionType','C_ConversionType_ID,AD_Client_ID,IsDefault,IsActive'],
    ['QueryCAcctSchema','C_AcctSchema','C_AcctSchema_ID,AD_Client_ID,C_Currency_ID'],
    ['QueryADClientInfo','AD_ClientInfo','AD_Client_ID,C_AcctSchema1_ID']];
  i int; v text; tn text; cl text[]; c text; t numeric; tab numeric; cid numeric; wsid numeric; mid numeric;
BEGIN
  SELECT WS_WebService_ID INTO wsid FROM WS_WebService WHERE Value='ModelADService';
  SELECT WS_WebServiceMethod_ID INTO mid FROM WS_WebServiceMethod WHERE Value='queryData' AND WS_WebService_ID=wsid;
  FOR i IN 1..array_length(spec,1) LOOP
    v := spec[i][1]; tn := spec[i][2]; cl := string_to_array(spec[i][3], ',');
    IF EXISTS (SELECT 1 FROM WS_WebServiceType WHERE Value=v) THEN RAISE NOTICE '% already registered', v; CONTINUE; END IF;
    SELECT AD_Table_ID INTO tab FROM AD_Table WHERE TableName=tn;
    t := nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebServiceType'),'N');
    INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU)
      VALUES (0,0,tab,now(),100,'CAPEX dashboard: read '||tn,'Y',v,now(),100,v,wsid,mid,t,generate_uuid());
    INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,now(),100,'Y','N',now(),100,t,generate_uuid());
    INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (0,0,tn,now(),100,'Y','TableName','C',now(),100,nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebService_Para'),'N'),t,generate_uuid());
    INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (0,0,'Read',now(),100,'Y','Action','C',now(),100,nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebService_Para'),'N'),t,generate_uuid());
    INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (0,0,now(),100,'Y','RecordID','F',now(),100,nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebService_Para'),'N'),t,generate_uuid());
    INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (0,0,'1=1',now(),100,'Y','Filter','C',now(),100,nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebService_Para'),'N'),t,generate_uuid());
    FOREACH c IN ARRAY cl LOOP
      SELECT AD_Column_ID INTO cid FROM AD_Column WHERE AD_Table_ID=tab AND ColumnName=c;
      IF cid IS NULL THEN RAISE EXCEPTION '% has no column %', tn, c; END IF;
      INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,cid,0,now(),100,'Y',now(),100,nextidfunc((SELECT AD_Sequence_ID::integer FROM AD_Sequence WHERE Name='WS_WebServiceFieldOutput'),'N'),t,generate_uuid());
    END LOOP;
  END LOOP;
  PERFORM register_migration_script('202611251000_CAPEX-WS-RATES.sql');
END $$;
