-- CAPEX-WS-PHASE (bim-ootb prompts/CAPEX_DASHBOARD.md §5.29, LEGACY CONVENTION): TEST SERVER ONLY, write access. Marks a project phase complete: input whitelist IsComplete only (MProjectPhase has no save rule on it).
-- Rows extracted from the local pilot by capex/tools/ws_types_to_migration.js. Hard-coded for now: client 11, role 102 (GardenWorld Admin), these ids. Run update_sequences() after applying, then restart the server: WS types and access are cached.
-- Restore: DELETE FROM WS_WebServiceFieldOutput, WS_WebServiceFieldInput, WS_WebService_Para, WS_WebServiceTypeAccess, then WS_WebServiceType WHERE WS_WebServiceType_ID IN (1000233); restart.
SELECT register_migration_script('202611042302_CAPEX-WS-PHASE.sql') FROM dual;

-- Nov 4, 2026 — BridgeUpdateCProjectPhase
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (11,0,576,TO_TIMESTAMP('2026-11-02 12:37:22','YYYY-MM-DD HH24:MI:SS'),100,'Bridge: updateData on C_ProjectPhase (CAPEX film progress beat)','Y','BridgeUpdateCProjectPhase',TO_TIMESTAMP('2026-11-02 12:37:22','YYYY-MM-DD HH24:MI:SS'),100,'BridgeUpdateCProjectPhase',50001,50025,1000233,'b6391f5d-d587-4b02-8372-0e6cf97fb775')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-11-02 12:37:22','YYYY-MM-DD HH24:MI:SS'),100,'Y','Y',TO_TIMESTAMP('2026-11-02 12:37:22','YYYY-MM-DD HH24:MI:SS'),100,1000233,'19c2af54-b8ce-4154-a439-f66fe931b440')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'C_ProjectPhase',TO_TIMESTAMP('2026-11-02 12:37:22','YYYY-MM-DD HH24:MI:SS'),100,'Y','TableName','C',TO_TIMESTAMP('2026-11-02 12:37:22','YYYY-MM-DD HH24:MI:SS'),100,1000836,1000233,'7e897faf-db6e-4576-8d04-f59d1a05d519')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-02 12:37:22','YYYY-MM-DD HH24:MI:SS'),100,'Y','RecordID','F',TO_TIMESTAMP('2026-11-02 12:37:22','YYYY-MM-DD HH24:MI:SS'),100,1000837,1000233,'d30afddf-33ae-43d6-aa8a-36b0f1fc01fa')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'Update',TO_TIMESTAMP('2026-11-02 12:37:22','YYYY-MM-DD HH24:MI:SS'),100,'Y','Action','C',TO_TIMESTAMP('2026-11-02 12:37:22','YYYY-MM-DD HH24:MI:SS'),100,1000838,1000233,'d60dba0e-b70b-4d6a-aba3-7246b5f39a6b')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,8717,0,TO_TIMESTAMP('2026-11-02 12:37:22','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 12:37:22','YYYY-MM-DD HH24:MI:SS'),100,1001686,1000233,'N','N','0765904d-dc0e-4b6a-9a90-b025ca3edc8c')
;
