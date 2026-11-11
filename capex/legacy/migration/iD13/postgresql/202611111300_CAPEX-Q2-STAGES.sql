-- CAPEX-Q2-STAGES (bim-ootb prompts/CAPEX_DASHBOARD.md §5.38; §6 Q2 PROPOSED DEFAULT, awaiting Sysnova): a C_ProjectType 'CAPEX' whose standard phases (C_Phase) are the five stages, in order. A project's stage is C_Project.C_Phase_ID (no new column).
-- Data only, idempotent (a second run inserts nothing). Same convention as 202611031900_CAPEX-R0.sql: client 11, fixed ids + UUs; run update_sequences() after applying on legacy. Applied by legacy (psql) and by the twin (capex/tools/migration_apply.js): ONE artefact.
-- Restore: DELETE FROM C_Phase WHERE C_Phase_ID BETWEEN 1000101 AND 1000105; DELETE FROM C_ProjectType WHERE C_ProjectType_ID=1000100;
SELECT register_migration_script('202611111300_CAPEX-Q2-STAGES.sql') FROM dual;

INSERT INTO C_ProjectType (C_ProjectType_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,ProjectCategory,C_ProjectType_UU)
SELECT 1000100,11,0,'Y',TO_TIMESTAMP('2026-11-11 13:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-11 13:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX','CAPEX project: five stages (proposed, awaiting the client)','G','5a0c3e1e-0b7d-4c1e-9f3a-cafe00300000' FROM dual WHERE NOT EXISTS (SELECT 1 FROM C_ProjectType WHERE C_ProjectType_ID=1000100)
;

INSERT INTO C_Phase (C_Phase_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,C_ProjectType_ID,SeqNo,StandardQty,C_Phase_UU)
SELECT 1000101,11,0,'Y',TO_TIMESTAMP('2026-11-11 13:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-11 13:00:00','YYYY-MM-DD HH24:MI:SS'),100,'Concept','CAPEX stage 1 of 5 (proposed)',1000100,10,0,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00300001' FROM dual WHERE NOT EXISTS (SELECT 1 FROM C_Phase WHERE C_Phase_ID=1000101)
;

INSERT INTO C_Phase (C_Phase_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,C_ProjectType_ID,SeqNo,StandardQty,C_Phase_UU)
SELECT 1000102,11,0,'Y',TO_TIMESTAMP('2026-11-11 13:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-11 13:00:00','YYYY-MM-DD HH24:MI:SS'),100,'Initiation','CAPEX stage 2 of 5 (proposed)',1000100,20,0,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00300002' FROM dual WHERE NOT EXISTS (SELECT 1 FROM C_Phase WHERE C_Phase_ID=1000102)
;

INSERT INTO C_Phase (C_Phase_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,C_ProjectType_ID,SeqNo,StandardQty,C_Phase_UU)
SELECT 1000103,11,0,'Y',TO_TIMESTAMP('2026-11-11 13:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-11 13:00:00','YYYY-MM-DD HH24:MI:SS'),100,'Planning','CAPEX stage 3 of 5 (proposed)',1000100,30,0,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00300003' FROM dual WHERE NOT EXISTS (SELECT 1 FROM C_Phase WHERE C_Phase_ID=1000103)
;

INSERT INTO C_Phase (C_Phase_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,C_ProjectType_ID,SeqNo,StandardQty,C_Phase_UU)
SELECT 1000104,11,0,'Y',TO_TIMESTAMP('2026-11-11 13:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-11 13:00:00','YYYY-MM-DD HH24:MI:SS'),100,'Execution','CAPEX stage 4 of 5 (proposed)',1000100,40,0,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00300004' FROM dual WHERE NOT EXISTS (SELECT 1 FROM C_Phase WHERE C_Phase_ID=1000104)
;

INSERT INTO C_Phase (C_Phase_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,C_ProjectType_ID,SeqNo,StandardQty,C_Phase_UU)
SELECT 1000105,11,0,'Y',TO_TIMESTAMP('2026-11-11 13:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-11 13:00:00','YYYY-MM-DD HH24:MI:SS'),100,'Closing','CAPEX stage 5 of 5 (proposed)',1000100,50,0,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00300005' FROM dual WHERE NOT EXISTS (SELECT 1 FROM C_Phase WHERE C_Phase_ID=1000105)
;
