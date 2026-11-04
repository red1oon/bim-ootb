-- CAPEX-WS-PROGRESS (bim-ootb prompts/CAPEX_DASHBOARD.md §5.29, LEGACY CONVENTION): TEST SERVER ONLY, write access. Real activity through iDempiere (capex/tools/pilot_progress.js, §5.28): update whitelists of what a user types in the stock window + the stock Close Project (AD_Process 227). pilot_progress.js also borrows BridgeCreateInvoice, BridgeCreateInvoiceLine, BridgeCreateProjectIssue from the bridge lane; those are not here.
-- Rows extracted from the local pilot by capex/tools/ws_types_to_migration.js. Hard-coded for now: client 11, role 102 (GardenWorld Admin), these ids. Run update_sequences() after applying, then restart the server: WS types and access are cached.
-- Restore: DELETE FROM WS_WebServiceFieldOutput, WS_WebServiceFieldInput, WS_WebService_Para, WS_WebServiceTypeAccess, then WS_WebServiceType WHERE WS_WebServiceType_ID IN (1200048,1200049,1200050,1200051); restart.
SELECT register_migration_script('202611042304_CAPEX-WS-PROGRESS.sql') FROM dual;

-- Nov 4, 2026 — CapexUpdateCProject
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (11,0,203,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX §5.28: update C_Project','Y','CapexUpdateCProject',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'CapexUpdateCProject',50001,50025,1200048,'b32a84a3-6724-4f97-9cab-6f728e45ac39')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','Y',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200048,'88b02d3a-d89f-41cb-a1f3-cc7ff8c932bf')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'C_Project',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','TableName','C',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200114,1200048,'c62dc47f-2e72-420d-b414-377242184480')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','RecordID','F',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200115,1200048,'48c8d011-a0c9-4180-ad65-92a4da3be18e')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'Update',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','Action','C',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200116,1200048,'67e0c82b-ccbb-4c7a-b085-03755019c63d')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,3904,0,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1002058,1200048,'N','N','25430610-5dd4-4e07-9490-7cd01f3e4928')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,5746,0,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1002059,1200048,'N','N','284f77ac-a4e2-45e1-9a3a-9ed26de921b7')
;

-- Nov 4, 2026 — CapexUpdateCProjectLine
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (11,0,434,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX §5.28: update C_ProjectLine','Y','CapexUpdateCProjectLine',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'CapexUpdateCProjectLine',50001,50025,1200049,'bb4388bf-b521-4cb3-8713-a2476907820e')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','Y',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200049,'52c42ec1-21ab-4f7b-bc21-8d1e07321219')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'C_ProjectLine',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','TableName','C',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200117,1200049,'b37fe96e-8fb6-4f48-a1eb-32dd45f058f2')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','RecordID','F',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200118,1200049,'7d01d24d-ba0e-4cfc-83a5-153a5e1bb212')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'Update',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','Action','C',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200119,1200049,'9e0e3ef2-b3ec-4596-ace0-a210f583e04c')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,5773,0,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1002060,1200049,'N','N','9eab59b7-a816-4933-b9b1-3f648a0d3f00')
;

-- Nov 4, 2026 — CapexUpdateCInvoice
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (11,0,318,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX §5.28: update C_Invoice','Y','CapexUpdateCInvoice',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'CapexUpdateCInvoice',50001,50025,1200050,'cc5378f3-f0a8-4f63-87f7-a9cff33c76b8')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','Y',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200050,'a0d54e77-cfa0-4a4a-bc0f-7a3469fdea24')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'C_Invoice',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','TableName','C',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200120,1200050,'26c4ab5e-4ec8-4107-96e6-d1ee1f12339b')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','RecordID','F',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200121,1200050,'35e28272-0c01-402d-812b-a10ba1eff65d')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'Update',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','Action','C',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200122,1200050,'c9708d77-1198-49b9-960b-7175e41850a1')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,3510,0,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1002061,1200050,'N','N','4d995529-5077-4e9a-be23-fd6598cbda5f')
;

-- Nov 4, 2026 — Capex_RunProcess_ProjectClose
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX §5.28: stock Close Project','Y','Capex_RunProcess_ProjectClose',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Capex_RunProcess_ProjectClose',50001,50022,1200051,'02395ae6-42f5-4ba9-ba26-836e54ca1a8f')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','Y',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200051,'946e46d5-3e91-4796-9bb0-762a391115ec')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'227',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','AD_Process_ID','C',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200123,1200051,'90a9c1b0-b594-43ca-83c3-4488b1893c36')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','AD_Menu_ID','F',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200124,1200051,'678b7c9f-58a0-455f-a2bf-dea74719f603')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','AD_Record_ID','F',TO_TIMESTAMP('2026-11-04 11:34:26','YYYY-MM-DD HH24:MI:SS'),100,1200125,1200051,'8aa12ce0-1e39-4ef5-9e87-02a2c85473c9')
;
