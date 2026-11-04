-- CAPEX-WS-READ (bim-ootb prompts/CAPEX_DASHBOARD.md §5.29, LEGACY CONVENTION): the 8 read-only types the CAPEX dashboard reads (capex/adapters.js LEGACY_TYPES). The ONLY CAPEX web-service script a site installs. A Filter parameter is Constant 1=1 (IDEMPIERE-1784); lookups go by DataRow keys.
-- Rows extracted from the local pilot by capex/tools/ws_types_to_migration.js. Hard-coded for now: client 11, role 102 (GardenWorld Admin), these ids. Run update_sequences() after applying, then restart the server: WS types and access are cached.
-- Restore: DELETE FROM WS_WebServiceFieldOutput, WS_WebServiceFieldInput, WS_WebService_Para, WS_WebServiceTypeAccess, then WS_WebServiceType WHERE WS_WebServiceType_ID IN (1000112,1000130,1000221,1000222,1000223,1000224,1000225,1000226); restart.
SELECT register_migration_script('202611042300_CAPEX-WS-READ.sql') FROM dual;

-- Nov 4, 2026 — QueryCProject
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (0,0,203,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Bridge: read C_Project','Y','QueryCProject',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'QueryCProject',50001,50028,1000112,'467208cd-ba09-4e5d-9527-ce89540abc9d')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y','N',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1000112,'edc52fb8-7d9f-410b-b027-258b7cecd563')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (0,0,'C_Project',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y','TableName','C',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1000421,1000112,'0d1ca336-be20-471d-aab4-b03db9c9ce8c')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (0,0,'Read',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y','Action','C',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1000422,1000112,'22a7271f-0a4a-46ff-8204-5053f72a9deb')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (0,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y','RecordID','F',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1000423,1000112,'786c82b9-c83e-48f5-9c16-dd9185c4362e')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (0,0,'1=1',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y','Filter','C',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1000424,1000112,'b06c1ad1-ee71-4968-a9d3-6b997d3a3b05')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (0,1349,0,TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1001833,1000112,'N','N','90a970c5-d7f9-4948-8ad7-6f1a1c012644')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (0,2010,0,TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1001834,1000112,'N','N','45c8c805-694a-458f-ba7d-9db316383965')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,8754,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002719,1000112,'fd97c132-eac3-466b-876f-87adfcbd7214')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5747,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002720,1000112,'27246dbd-8e81-4e5b-a170-b54d7579eb93')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,9861,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002721,1000112,'f3f11d48-d3a1-48b1-a10a-0f214f8bc52a')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5796,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002722,1000112,'a836f11e-63d9-47c9-bc1d-16f64443d7ba')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,8756,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002723,1000112,'d91f8991-c2f0-451c-970b-2d629c222e33')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5746,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002724,1000112,'80408b43-77cd-48d9-906e-0d47a5994e58')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,1349,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002725,1000112,'42ce35c5-8219-4e9b-a9a9-d2699d3e5779')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5753,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002726,1000112,'d9a6ba18-d340-43ac-9c17-efbbfac94e6f')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5794,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002727,1000112,'b3eff7ad-ed23-4cc6-a892-d93fdb63a603')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,3907,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002728,1000112,'b74c17f3-31a2-4df7-a247-bac385536c8f')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5750,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002729,1000112,'3541adce-ae2d-4a3c-95d5-e8c4fb22da0e')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5749,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002730,1000112,'e9760b1c-3d15-4ce9-8e25-c7dcbe42a150')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5756,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002731,1000112,'dfdf8b75-a973-4599-a3d2-dee90ac54d90')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5755,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002732,1000112,'d0000811-99b8-409f-9eb7-5b28eadfc617')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,8759,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002733,1000112,'aa642b5f-9b2d-417f-bfa6-69e9ee7f8928')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,9637,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002734,1000112,'3a0e41fd-efe9-48b2-9c8f-996231c0aed4')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,8753,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002735,1000112,'9b5ea2c6-54d0-429d-a2e5-b5c7561ccd1e')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,3904,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002736,1000112,'946d2244-132f-4329-b89f-d7f9381c5d90')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,9856,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002737,1000112,'4f39e7e6-a4a9-48b6-88b9-7c7ec75a08b8')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,15449,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002738,1000112,'d5ba19e8-8047-43ae-b920-7aa2eeeca199')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,8755,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002739,1000112,'7df7a570-15b8-45d8-b56d-9905dfcfa93f')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5757,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002740,1000112,'b601283f-a399-42bc-9155-9f196282f3e6')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,15469,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002741,1000112,'2c9d9e96-6da0-458f-ba5e-f79da63e7c56')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,1356,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002742,1000112,'597a2917-6fad-47df-af00-e21f97f4ab07')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,1358,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002743,1000112,'78cbddff-f070-460c-b11d-df8d3583dfb4')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,1360,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002744,1000112,'2c466e13-c8a8-421f-94cf-4b934ff5062c')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5745,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002745,1000112,'b306df5f-9ee2-49dc-820f-a95fdbb82439')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,8978,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002746,1000112,'72ce151d-e1c2-4924-969f-52e8a26ae6fb')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,2010,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002747,1000112,'cdf041af-3a38-424b-b68a-a8c1f8332008')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,1355,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002748,1000112,'2fbaa44c-8c92-4aec-9b26-cbf77150182d')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,1352,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002749,1000112,'06dcebee-8ec1-4c2b-9c0e-303ddfc910b6')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5797,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002750,1000112,'7f0e6f32-06a4-4cab-aa3a-263fe6c393f6')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5752,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002751,1000112,'c98d37e9-78ab-4122-a7b8-cdaa95e268bb')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5798,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002752,1000112,'6071822e-9311-4352-bf17-f18bb8459cc0')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,5795,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002753,1000112,'6ef9b9e1-7b7b-40a4-a344-ac3be2d7d47a')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,3901,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002754,1000112,'04f94744-db76-47f4-a855-3771b6a04e25')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,8757,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002755,1000112,'a96e859f-dc55-4f9c-8fcf-6a7afc797407')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,1353,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002756,1000112,'35706a60-cf5f-4d38-bee2-df563cfbd071')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,1357,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002757,1000112,'666c2ea9-d6c3-48e4-9935-7097be4fa4f2')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,1354,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002758,1000112,'d4667301-3c6c-4bf2-a099-50698d092201')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,211815,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002759,1000112,'80b5bc13-c8b5-4386-ad16-e57bdd04b575')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,211816,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002760,1000112,'d9bb76f2-a731-474a-82b1-4ceded1215e1')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,14095,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002761,1000112,'4465eb4f-8d1f-4823-a094-3053a7219534')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,3902,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002762,1000112,'8fa5c544-8dc2-4ecd-b6bc-78eaa330d9ac')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,1351,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002763,1000112,'9aff0b66-cc46-48b1-bf22-2a9d4227d507')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,1350,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002764,1000112,'91f3e877-3a6c-4c0b-aa7d-584f30a2568e')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,60737,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002765,1000112,'6eabd51f-510e-491d-809a-228a177a5859')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,8758,0,TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-09 22:59:00','YYYY-MM-DD HH24:MI:SS'),100,1002766,1000112,'209e3e81-0585-4aed-a3b0-9f46cc08d022')
;

-- Nov 4, 2026 — QueryADOrg
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (0,0,155,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Bridge: read AD_Org','Y','QueryADOrg',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'QueryADOrg',50001,50028,1000130,'2ae4bfd7-8a83-419c-a244-b671c69672ef')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','N',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1000130,'8fb7080c-03d3-408f-971e-a528e62ccab0')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (0,0,'AD_Org',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','TableName','C',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1000488,1000130,'c2aaaaef-2a0a-4613-bed5-97439714d553')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (0,0,'Read',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','Action','C',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1000489,1000130,'d28fbb0b-902f-42bf-a1e1-13783251a2d8')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (0,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','RecordID','F',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1000490,1000130,'51cdc040-4159-4648-a635-53b6a7cb3f58')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (0,0,'1=1',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y','Filter','C',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1000491,1000130,'2ec11b02-6e7e-44cb-8c0a-9542872c4ba4')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,523,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003121,1000130,'b0b2262c-e6c2-4357-8adf-0a170eae2352')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,522,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003122,1000130,'a9f4a270-8413-4077-aa29-2b7fa93b7479')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,2045,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003123,1000130,'4ed37800-a871-44f8-afd9-8d4dfccc05c4')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,2752,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003124,1000130,'529a2368-a8d3-47a3-9a54-a6f7aa53b0f0')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,712,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003125,1000130,'85c3b1db-8be4-499f-8418-a033fac18b85')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,711,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003126,1000130,'b6d5fb98-3849-4cbd-97af-7e1ea200b19f')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,57227,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003127,1000130,'a9f10820-e815-4386-8dcc-b8caf4bf2a20')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,714,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003128,1000130,'2a5eea9f-3873-4567-b780-95a6d113da62')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,713,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003129,1000130,'89d94b18-0ece-4067-86c2-0b4663bf16cf')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,715,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003130,1000130,'bb8fd1bc-46ae-475c-a2b6-eba86e4653e3')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,527,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003131,1000130,'5e4ddf32-4a4f-46c2-a6e6-bd00becf9072')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,528,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003132,1000130,'64706985-3ab9-4110-bc55-c4bea58ea139')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (0,60440,0,TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-10-11 21:21:26','YYYY-MM-DD HH24:MI:SS'),100,1003133,1000130,'25d56d30-5738-4769-ba3a-e92909162aaf')
;

-- Nov 4, 2026 — QueryCProjectPhase
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (11,0,576,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Bridge: read C_ProjectPhase','Y','QueryCProjectPhase',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'QueryCProjectPhase',50001,50028,1000221,'614f77ef-77f6-427a-bb54-31689b6e63b2')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','N',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000221,'1d6220f6-3570-4576-a285-7c8a017eba98')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'C_ProjectPhase',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','TableName','C',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000793,1000221,'6751985d-c1d4-48af-9348-db0f4e14227a')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'Read',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','Action','C',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000794,1000221,'a30b8524-4f0c-4a97-a46a-170848118925')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','RecordID','F',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000795,1000221,'db742750-d89e-4560-b15d-2d183d00cfe7')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'1=1',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','Filter','C',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1000796,1000221,'526ea577-d248-4374-8a52-42072008d72e')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,8972,0,TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1001835,1000221,'N','N','b9944994-46ac-417e-8150-bedf6baf18c2')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,8725,0,TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1001836,1000221,'N','N','b6c85fa1-4c6e-4281-83f9-17ddcd563851')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,8969,0,TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1001837,1000221,'N','N','7abb0d3a-dc0b-40dc-b253-801649147ca3')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8720,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003766,1000221,'053a0a6d-3a8d-425b-8e7d-a1d745718bb8')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8972,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003767,1000221,'49c2d323-9fec-472f-9ff6-a6e447873d7b')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8724,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003768,1000221,'06978141-ea81-48d5-9632-f6bc0380f03c')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8717,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003769,1000221,'d3e84c42-554c-417d-9e00-76a028ad4ce9')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8968,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003770,1000221,'ba0b9d34-a2e8-41b9-b6f1-db275100a9a7')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8721,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003771,1000221,'f9a60968-24f4-4a6a-87a4-f8ada1371334')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8713,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003772,1000221,'dc2d6555-5667-4a2e-804d-4e4eba68e7b1')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8723,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003773,1000221,'73dc1e40-0b9c-4d37-bb0d-2d917f57f09f')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8973,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003774,1000221,'1472e0a1-c681-4a8d-af12-eb6effd67ed3')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8970,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003775,1000221,'3c0e17de-d821-4255-9817-bcd66ff083da')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8971,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003776,1000221,'b5541c6e-bea3-4496-9e25-829cdcd91ef8')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8712,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003777,1000221,'cb4a37e1-41d2-44cb-b325-132dd60fafba')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8725,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003778,1000221,'a85acd2c-0aab-46db-82c1-e915ff254681')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,15453,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003779,1000221,'fc630f67-7112-4002-a390-be003ae61a5f')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8711,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003780,1000221,'6fdc9a08-9b68-4947-9935-558b3e5d0f1e')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,15452,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003781,1000221,'34b49d90-f9b8-404d-984b-1bb2afc1e3a7')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8969,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003782,1000221,'486818f7-5044-42f1-9cfc-d98b65ab098f')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8716,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003783,1000221,'6536ff46-1c2c-4cee-9431-5c62aea434b7')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8974,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003784,1000221,'34ed322a-f1c3-4a1f-b377-8489a7b4e704')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8714,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003785,1000221,'cc549136-bd01-43eb-beba-dfbeb563c334')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8722,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003786,1000221,'127b860b-6630-4348-99ab-6b15762f53f6')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8715,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003787,1000221,'2c821940-32da-4285-90de-40f0e8ebcfba')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8710,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003788,1000221,'9909bbe6-9e49-4247-b032-dc1f0e0323e9')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8719,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003789,1000221,'f5f9eb4d-454f-4a72-a1e5-a6adf149acd3')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8726,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003790,1000221,'edf9c4aa-49fe-4d46-b43e-04f31fdd0b68')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8718,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003791,1000221,'6dc13f42-dac0-44de-aad4-59ec73a55efa')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,60742,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003792,1000221,'c91cd351-7777-4001-84b1-6209a80ede10')
;

-- Nov 4, 2026 — QueryCProjectTask
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (11,0,584,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Bridge: read C_ProjectTask','Y','QueryCProjectTask',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'QueryCProjectTask',50001,50028,1000222,'06d736f5-4d3c-4a62-ace3-d1c66ab234d3')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','N',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000222,'bc5a6c96-e433-4336-9501-ab9ee382073c')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'C_ProjectTask',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','TableName','C',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000797,1000222,'57cf8795-06d8-4e18-84d0-d1987febce4d')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'Read',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','Action','C',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000798,1000222,'194cc345-a024-46e1-8bf8-a0c8cc49aff4')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','RecordID','F',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000799,1000222,'8c9c3203-6136-48c8-89f4-c86fd5248144')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'1=1',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','Filter','C',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1000800,1000222,'18a17255-958b-4ea2-9b9a-16e9f9577c4a')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,8888,0,TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1001838,1000222,'N','N','01926487-79c2-4308-b987-95cb89743e9f')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,8902,0,TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1001839,1000222,'N','N','25917a87-17f6-4786-9b9f-0295c412daa6')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8897,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003793,1000222,'df9e1a9b-74ed-4e76-8972-8fd85f44c6aa')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8888,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003794,1000222,'e2c218b1-f199-407c-8303-0eca148d242e')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8891,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003795,1000222,'9a003ab8-4cbb-4c68-95e6-7b4294bcdce2')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8900,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003796,1000222,'37ead5c5-98c9-4083-852c-c9273a551f8f')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8894,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003797,1000222,'9f1e25c4-e3ea-43ef-a46f-dabac9ff9d25')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8901,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003798,1000222,'f60f0fd1-68c9-487e-814f-9d4d057d4eaf')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8890,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003799,1000222,'d5268163-4dbb-4fbc-8e15-d288a6c06d07')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,15456,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003800,1000222,'0495f04a-1820-404e-a58c-1a85e2cdb3a6')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,15455,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003801,1000222,'ffdd2abe-1f97-4a37-b3d7-e5106c58d000')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8899,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003802,1000222,'71530f08-b73e-4ace-b90b-f39ee367a07c')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8902,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003803,1000222,'ffdccc7c-31cf-482a-9ba4-b5ed4ebd8cbd')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,15454,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003804,1000222,'48e6d79c-9f6a-4b9d-a3fd-cd58214eadae')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8892,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003805,1000222,'4ac48fba-dec7-47fa-8bc4-118a6742da1c')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8896,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003806,1000222,'1980c2c4-42ce-499d-9c31-ac345f73b308')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8889,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003807,1000222,'2684d518-d9cc-456a-a840-9b341e667ad4')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8893,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003808,1000222,'cb930b94-6199-45dc-98da-6ecf7a7e59eb')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8895,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003809,1000222,'c0f14425-7ccf-4b1b-a453-adf95a8200a4')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8898,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003810,1000222,'553486df-7d6c-4edd-95cd-18f9881dbb56')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8887,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003811,1000222,'1ba501fd-a913-4f4d-9b6c-042152dc103d')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,60743,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003812,1000222,'c9b84bea-5887-42cb-b8da-85bbc478c966')
;

-- Nov 4, 2026 — QueryCProjectLine
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (11,0,434,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Bridge: read C_ProjectLine','Y','QueryCProjectLine',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'QueryCProjectLine',50001,50028,1000223,'689f0e4c-c277-4cc1-9cd8-ffcfd7ed03d1')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','N',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000223,'7d00b85b-2b4a-472e-8850-a702bd5a42bf')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'C_ProjectLine',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','TableName','C',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000801,1000223,'e43f989b-f35e-4d0a-9ca4-07865a3b455d')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'Read',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','Action','C',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000802,1000223,'88558875-5cc2-4e89-953f-f8fc8be49e20')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','RecordID','F',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000803,1000223,'bf577a2f-d2ac-4823-ae63-9a52eaf8bebc')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'1=1',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','Filter','C',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1000804,1000223,'5f6b366b-3d05-4be7-b332-ff0622a0df53')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,15450,0,TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1001840,1000223,'N','N','ab827149-d774-4525-8add-261929e92bb1')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,15451,0,TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1001841,1000223,'N','N','35935dab-8419-4576-85bb-4c3c20de9cc0')
;
INSERT INTO WS_WebServiceFieldInput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldInput_ID,WS_WebServiceType_ID,IsIdentifier,IsNullIdentifier,WS_WebServiceFieldInput_UU) VALUES (11,5775,0,TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1001842,1000223,'N','N','df749542-69be-45fb-8123-5e944dbe1240')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,9873,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003813,1000223,'317be3ca-50cd-4f51-b7ff-4d3fe0f8ff61')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5771,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003814,1000223,'c4938118-5141-4411-88c5-b47a58e5efa3')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5769,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003815,1000223,'52623bdb-ffd0-4e9f-93ec-185c47577e59')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,9872,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003816,1000223,'20191cb2-7c01-4c9b-ac0a-b0c783ce4c42')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5758,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003817,1000223,'9370c0e0-fd4b-4d68-86f1-d1518feaaa71')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5767,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003818,1000223,'006dbc17-4b1f-4f99-aba8-8f7d3b571611')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5766,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003819,1000223,'3282008a-2859-4d5b-97f3-415f70d71bf2')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5770,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003820,1000223,'4bb992e4-e478-435e-a928-f7f0f48c580a')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5776,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003821,1000223,'becdb876-5ce0-445c-b74b-57ba0dff2f1e')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8558,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003822,1000223,'c1241fa4-dfad-47c5-8106-9808df37f9cd')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,9865,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003823,1000223,'a914c13c-0cd2-4974-83ad-c680818ac8ce')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,9871,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003824,1000223,'7204b994-b733-4dcf-8128-8c3c006abd08')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8559,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003825,1000223,'eb98cf63-54fa-44e5-b5e3-be1659d0781a')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,15450,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003826,1000223,'bf9a1d71-5e2e-411a-8748-31555d17a1bf')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,15451,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003827,1000223,'2e06d978-4366-4088-b438-ad29847cc0b9')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5768,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003828,1000223,'d3a23d2a-d1c8-4390-b5de-f7fedc8eec89')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5772,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003829,1000223,'77b14469-10ac-4277-bd35-0491fceb47e2')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5775,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003830,1000223,'39671b27-286f-4a37-8d3f-ca48707ee8a9')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5773,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003831,1000223,'b8f1bd8f-1f5f-48fb-8959-74fe4325ba87')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,9860,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003832,1000223,'a2c5e3f7-6eb6-4c41-a534-1e1d6a13f11e')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5764,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003833,1000223,'0631f28c-78d9-43e5-8911-c87a6e289d9e')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5761,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003834,1000223,'0f5ae4de-545f-47b2-b41a-b49ba5cfff63')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,9866,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003835,1000223,'3e7e5980-6ace-44e1-b4d1-d52499c8c9e9')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5762,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003836,1000223,'1ef52c1c-c6fd-4280-a092-276ea3adc1fa')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,211814,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003837,1000223,'0ea99759-7da6-4abd-a8b3-1f9b2f5ea09d')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5763,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003838,1000223,'bf9a4238-1f3f-44fb-a690-59b180f000b1')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5765,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003839,1000223,'3e4c078e-d22c-48e7-aced-b381f8689f4c')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8557,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003840,1000223,'ce2a09a9-fd47-47e1-818e-4ac7bd0c3a41')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5760,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003841,1000223,'0a467186-db86-4ad5-aa81-155a1117a592')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,5759,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003842,1000223,'f39554c0-b9dd-4707-954e-0fe034af86bb')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,60741,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003843,1000223,'433a8818-aa18-48cd-9066-269ce148ce39')
;

-- Nov 4, 2026 — QueryCPhase
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (11,0,577,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Bridge: read C_Phase','Y','QueryCPhase',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'QueryCPhase',50001,50028,1000224,'dbc208f9-135f-409c-9a4a-4fe1c27084dc')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','N',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000224,'ce9fba55-ef06-43fd-901b-e86eb249d84e')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'C_Phase',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','TableName','C',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000805,1000224,'0a3b5bdc-a3e9-4df8-a3e7-064d927d65ef')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'Read',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','Action','C',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000806,1000224,'77edabc4-8f61-4f58-acb7-777057e6ab9c')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','RecordID','F',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000807,1000224,'3f29cbb5-103d-49de-be65-937fb6b22cee')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'1=1',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','Filter','C',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1000808,1000224,'d588eb36-929c-49f1-8da1-e968c1f29678')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8975,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003844,1000224,'ae50c7d0-294a-4d8a-8017-167b3978e3d4')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8734,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003845,1000224,'4ade17ed-50e0-4cd6-ba73-2600cb53d8ef')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8731,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003846,1000224,'c669d94a-1b4b-462d-bbbe-1ef875b4b96a')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8733,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003847,1000224,'a6dc4159-1225-4441-bbc2-ce29572bf25f')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8740,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003848,1000224,'e353e8a0-26a5-4408-bdab-676dfe3fec67')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8737,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003849,1000224,'9b37efca-2dac-4cfa-bca0-9e6a6c7f9c62')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8728,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003850,1000224,'a162582a-fa29-4df4-b7c5-dae357701da4')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8736,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003851,1000224,'6b1a86be-5902-4b35-a5ae-49bee2203149')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8732,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003852,1000224,'509a7b4a-2e9e-453f-9d7a-829fb04b681f')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8741,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003853,1000224,'d1c24731-1c7b-419f-abc6-ad5f03ac3211')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,60733,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003854,1000224,'ac885123-9716-43de-b8b5-209c3f906a7a')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8735,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003855,1000224,'0196aa1b-9982-4ed2-a38a-8f0490baddcb')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8738,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003856,1000224,'8517c72c-2931-4376-8932-cb84b3961a8b')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8739,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003857,1000224,'9717ad33-e28b-495c-8e04-3ac9c64d7232')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8729,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003858,1000224,'d460427c-5ce3-40d6-904e-13e5644e0beb')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,8730,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003859,1000224,'2a151bc7-616c-4535-95ab-772583a1029c')
;

-- Nov 4, 2026 — QueryCCurrency
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (11,0,141,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Bridge: read C_Currency','Y','QueryCCurrency',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'QueryCCurrency',50001,50028,1000225,'842a2e07-3b45-4c1c-aab2-4194449cee82')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','N',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000225,'678dacab-db3c-420c-88e3-ce1aefbec85b')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'C_Currency',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','TableName','C',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000809,1000225,'d02bf3bc-1ce1-4b6a-a3b8-cc419b2133ca')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'Read',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','Action','C',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000810,1000225,'b529a23d-81d6-4992-9381-be301f4d8019')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','RecordID','F',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000811,1000225,'9ed14dc3-d24a-4ab2-9afe-989aa53342b9')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'1=1',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','Filter','C',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1000812,1000225,'6e3f401a-5749-49b9-a682-c5aa70187e90')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,459,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003860,1000225,'5fcc32f1-e7d8-4e40-b235-e47ca26095f0')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,797,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003861,1000225,'39662cab-1440-48cc-af1a-2209ae0cd3d7')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,458,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003862,1000225,'9326eeec-2a39-4121-98d4-35799749e4f6')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,457,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003863,1000225,'14910225-0c23-427b-8f37-93c4a4f8b7bd')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,461,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003864,1000225,'4ff5a687-ff49-4246-9cc2-107b15ecd1f8')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,798,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003865,1000225,'65d63749-4bdd-4801-970e-d22842983ccc')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,463,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003866,1000225,'5790631e-c666-41b6-8f8b-790b0d8bb1de')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,796,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003867,1000225,'95974e72-db5f-4fa2-bf58-36f6b4687b50')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,52074,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003868,1000225,'bf1ac60b-8f1c-4d11-8f39-4dd28f15f7e1')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,460,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003869,1000225,'acc30309-b1e3-459a-b84b-77eca77a5222')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,462,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003870,1000225,'74650885-f16e-4eb6-b865-4a760e5b799e')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,792,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003871,1000225,'6d93b049-2c3b-4855-b19d-c1b8e170591d')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,794,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003872,1000225,'1492b477-3cc1-416f-b0bb-10ca33c5491b')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,791,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003873,1000225,'c7400b3a-61df-4fbf-94a2-b630ba641913')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,793,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003874,1000225,'97030fb9-9b0d-42de-9a9a-aec816888aef')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,795,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003875,1000225,'98a3afd5-1854-44eb-9b7a-78c9f8c3b5a2')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,789,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003876,1000225,'ff08d8bd-7fd0-4f6c-898e-42b6c31d701b')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,790,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003877,1000225,'0b1a2880-8775-4f49-9a89-4ec138139398')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,60641,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003878,1000225,'8b49bda5-a763-48e4-8966-5459d941f0ce')
;

-- Nov 4, 2026 — QueryADWFActivity
INSERT INTO WS_WebServiceType (AD_Client_ID,AD_Org_ID,AD_Table_ID,Created,CreatedBy,Description,IsActive,Name,Updated,UpdatedBy,Value,WS_WebService_ID,WS_WebServiceMethod_ID,WS_WebServiceType_ID,WS_WebServiceType_UU) VALUES (11,0,644,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Bridge: read AD_WF_Activity','Y','QueryADWFActivity',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'QueryADWFActivity',50001,50028,1000226,'29d3b6e8-3b75-49c0-9977-0b6b2098d5c2')
;
INSERT INTO WS_WebServiceTypeAccess (AD_Client_ID,AD_Org_ID,AD_Role_ID,Created,CreatedBy,IsActive,IsReadWrite,Updated,UpdatedBy,WS_WebServiceType_ID,WS_WebServiceTypeAccess_UU) VALUES (11,0,102,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','N',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000226,'5af533ee-ba8f-4c00-be79-3a6cd0170585')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'AD_WF_Activity',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','TableName','C',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000813,1000226,'5825e8a7-0ea3-4b49-90d3-0fc50937eac5')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'Read',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','Action','C',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000814,1000226,'c8aae410-8d8c-4dff-8147-164bc1166d53')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','RecordID','F',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1000815,1000226,'93b6bb72-349c-4f00-8d88-599d0739f7bf')
;
INSERT INTO WS_WebService_Para (AD_Client_ID,AD_Org_ID,ConstantValue,Created,CreatedBy,IsActive,ParameterName,ParameterType,Updated,UpdatedBy,WS_WebService_Para_ID,WS_WebServiceType_ID,WS_WebService_Para_UU) VALUES (11,0,'1=1',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y','Filter','C',TO_TIMESTAMP('2026-11-03 03:57:48','YYYY-MM-DD HH24:MI:SS'),100,1000816,1000226,'c9c3baab-65d1-4e7b-aeb9-c9049f066dae')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10444,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003879,1000226,'9bb4c17a-2106-4513-ab06-c2108b0a2be4')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10448,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003880,1000226,'c4d0bfd3-829f-4579-b5e1-eb482bbf97ee')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10808,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003881,1000226,'f9496618-78db-4ffc-b246-d60fb2df1a96')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,11770,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003882,1000226,'9088cf63-e949-45f1-9e64-e4d6a571d37c')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,11544,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003883,1000226,'d294589a-864d-4177-8e94-aa293c60a732')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10449,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003884,1000226,'98bee923-efc4-48fc-a48f-b0435fe262a5')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,12939,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003885,1000226,'d3b183b8-aa3a-4e21-b4b9-4d22bd0a4762')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,12934,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003886,1000226,'e3f4735f-a579-4ac0-b122-6de33413e0f0')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10447,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003887,1000226,'673c0bd4-d6df-4490-8caf-f1bea8fc2982')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10454,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003888,1000226,'4e84401d-00b9-492a-a92b-35492aada652')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10446,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003889,1000226,'ea3a4a04-6a47-487d-864f-3641383f62da')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,11546,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003890,1000226,'49d89d7e-1321-4b4d-9b47-569e779d3005')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10443,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003891,1000226,'ebbc9f91-31c8-4135-8924-21ced128bfd3')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10439,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003892,1000226,'f5c7df99-29ab-47c2-a74b-9661e887ab21')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10440,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003893,1000226,'4c958a9e-10ca-40f6-8c02-52872972ae18')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,11543,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003894,1000226,'53d4deff-5a32-4bb4-842a-b27a579c3807')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,60539,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003895,1000226,'1a980d1a-c74b-40c3-9727-2ca27e097607')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10450,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003896,1000226,'1ef5efbb-c123-4086-ab0c-1ce9cd948568')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10451,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003897,1000226,'d977b44f-a69b-45ac-9937-17239c7a6e1b')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10442,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003898,1000226,'3e54dab8-9772-492c-a57c-4bcafcbb5ed7')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10453,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003899,1000226,'78b41c70-07b4-4e0d-bed1-5456bce16890')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10445,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003900,1000226,'bdd4902f-2b8a-4f15-82b7-f83c6ebcb243')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10441,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003901,1000226,'e23ecddc-46c6-4584-831c-d78808f7098d')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,10452,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003902,1000226,'c74f6e03-c164-45f3-abb7-fa751b1467d9')
;
INSERT INTO WS_WebServiceFieldOutput (AD_Client_ID,AD_Column_ID,AD_Org_ID,Created,CreatedBy,IsActive,Updated,UpdatedBy,WS_WebServiceFieldOutput_ID,WS_WebServiceType_ID,WS_WebServiceFieldOutput_UU) VALUES (11,11545,0,TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,'Y',TO_TIMESTAMP('2026-11-02 01:02:59','YYYY-MM-DD HH24:MI:SS'),100,1003903,1000226,'3049a7b7-9fe3-4a73-a4c2-715a3f2b61ee')
;
