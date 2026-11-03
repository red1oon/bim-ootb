-- CAPEX-G2 (bim-ootb prompts/CAPEX_DASHBOARD.md §5.16): the §3 count/sum tiles as iDempiere Performance Analysis DATA — no Java, no plugin. Same convention as 202611031900_CAPEX-R0.sql.
-- ONE artefact, two release targets: legacy applies this file (psql), the SQLite twin applies the SAME file (erp/migration_apply.js). Client 11, IDs 1000011-1000022 + fixed UUs.
-- After applying on legacy run the stock post-migration update_sequences(). Goals are user data (created through the window / create_data, a model save computes them).
-- Restore (pilot): DELETE FROM PA_Goal WHERE PA_Measure_ID BETWEEN 1000011 AND 1000022; DELETE FROM PA_Measure WHERE PA_Measure_UU::text LIKE '5a0c3e1e-0b7d-4c1e-9f3a-cafe0002%';
--   DELETE FROM PA_MeasureCalc WHERE PA_MeasureCalc_UU::text LIKE '5a0c3e1e-0b7d-4c1e-9f3a-cafe0001%';
SELECT register_migration_script('202611032000_CAPEX-G2.sql') FROM dual;

-- Nov 3, 2026 — CAPEX Total Projects
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000011,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Total Projects','CAPEX dashboard tile 1: COUNT(C_Project)','SELECT COUNT(*) FROM C_Project','WHERE 1=1','C_Project.Created','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00010001')
;
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000011,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Total Projects','CAPEX dashboard tile 1: COUNT(C_Project)','C','S',1000011,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00020001')
;

-- Nov 3, 2026 — CAPEX Closed Projects
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000012,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Closed Projects','CAPEX dashboard tile 1 sub: COUNT(C_Project) Processed=Y','SELECT COUNT(*) FROM C_Project','WHERE Processed=''Y''','C_Project.Created','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00010002')
;
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000012,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Closed Projects','CAPEX dashboard tile 1 sub: COUNT(C_Project) Processed=Y','C','S',1000012,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00020002')
;

-- Nov 3, 2026 — CAPEX Active Projects
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000013,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Active Projects','CAPEX dashboard tile 2: COUNT(C_Project) IsActive=Y AND Processed=N','SELECT COUNT(*) FROM C_Project','WHERE IsActive=''Y'' AND Processed=''N''','C_Project.Created','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00010003')
;
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000013,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Active Projects','CAPEX dashboard tile 2: COUNT(C_Project) IsActive=Y AND Processed=N','C','S',1000013,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00020003')
;

-- Nov 3, 2026 — CAPEX Approved Budget (BDT)
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000014,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Approved Budget (BDT)','CAPEX dashboard tile 3, BDT line: SUM(PlannedAmt)','SELECT SUM(PlannedAmt) FROM C_Project','WHERE C_Currency_ID=322','C_Project.Created','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00010004')
;
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000014,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Approved Budget (BDT)','CAPEX dashboard tile 3, BDT line: SUM(PlannedAmt)','C','S',1000014,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00020004')
;

-- Nov 3, 2026 — CAPEX Actual Cost (USD)
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000015,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Actual Cost (USD)','CAPEX dashboard tile 4, USD line: SUM(ProjectBalanceAmt)','SELECT SUM(ProjectBalanceAmt) FROM C_Project','WHERE C_Currency_ID=100','C_Project.Created','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00010005')
;
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000015,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Actual Cost (USD)','CAPEX dashboard tile 4, USD line: SUM(ProjectBalanceAmt)','C','S',1000015,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00020005')
;

-- Nov 3, 2026 — CAPEX Actual Cost (BDT)
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000016,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Actual Cost (BDT)','CAPEX dashboard tile 4, BDT line: SUM(ProjectBalanceAmt)','SELECT SUM(ProjectBalanceAmt) FROM C_Project','WHERE C_Currency_ID=322','C_Project.Created','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00010006')
;
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000016,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Actual Cost (BDT)','CAPEX dashboard tile 4, BDT line: SUM(ProjectBalanceAmt)','C','S',1000016,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00020006')
;

-- Nov 3, 2026 — CAPEX Committed Cost (USD)
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000017,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Committed Cost (USD)','CAPEX dashboard tile 5, USD line: SUM(CommittedAmt)','SELECT SUM(CommittedAmt) FROM C_Project','WHERE C_Currency_ID=100','C_Project.Created','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00010007')
;
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000017,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Committed Cost (USD)','CAPEX dashboard tile 5, USD line: SUM(CommittedAmt)','C','S',1000017,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00020007')
;

-- Nov 3, 2026 — CAPEX Committed Cost (BDT)
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000018,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Committed Cost (BDT)','CAPEX dashboard tile 5, BDT line: SUM(CommittedAmt)','SELECT SUM(CommittedAmt) FROM C_Project','WHERE C_Currency_ID=322','C_Project.Created','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00010008')
;
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000018,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Committed Cost (BDT)','CAPEX dashboard tile 5, BDT line: SUM(CommittedAmt)','C','S',1000018,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00020008')
;

-- Nov 3, 2026 — CAPEX Invoiced (USD)
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000019,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Invoiced (USD)','CAPEX dashboard tile 5 sub, USD line: SUM(InvoicedAmt)','SELECT SUM(InvoicedAmt) FROM C_Project','WHERE C_Currency_ID=100','C_Project.Created','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00010009')
;
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000019,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Invoiced (USD)','CAPEX dashboard tile 5 sub, USD line: SUM(InvoicedAmt)','C','S',1000019,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00020009')
;

-- Nov 3, 2026 — CAPEX Invoiced (BDT)
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000020,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Invoiced (BDT)','CAPEX dashboard tile 5 sub, BDT line: SUM(InvoicedAmt)','SELECT SUM(InvoicedAmt) FROM C_Project','WHERE C_Currency_ID=322','C_Project.Created','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00010010')
;
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000020,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Invoiced (BDT)','CAPEX dashboard tile 5 sub, BDT line: SUM(InvoicedAmt)','C','S',1000020,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00020010')
;

-- Nov 3, 2026 — CAPEX Projects Completed this Year
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000021,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Projects Completed this Year','CAPEX dashboard tile 7: COUNT(C_Project) Processed=Y, DateFinish in the goal year (data type T + goal scope Year)','SELECT COUNT(*) FROM C_Project','WHERE Processed=''Y''','C_Project.DateFinish','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00010011')
;
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000021,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Projects Completed this Year','CAPEX dashboard tile 7: COUNT(C_Project) Processed=Y, DateFinish in the goal year (data type T + goal scope Year)','C','T',1000021,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00020011')
;

-- Nov 3, 2026 — CAPEX Approval Pending
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000022,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Approval Pending','CAPEX dashboard tile 13: COUNT(AD_WF_Activity) WFState=OS AND Processed=N','SELECT COUNT(*) FROM AD_WF_Activity','WHERE WFState=''OS'' AND Processed=''N''','AD_WF_Activity.Created','AD_WF_Activity.AD_Org_ID','AD_WF_Activity.AD_WF_Activity_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='AD_WF_Activity'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00010012')
;
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000022,11,0,'Y',TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 20:00:00','YYYY-MM-DD HH24:MI:SS'),100,'CAPEX Approval Pending','CAPEX dashboard tile 13: COUNT(AD_WF_Activity) WFState=OS AND Processed=N','C','S',1000022,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00020012')
;
