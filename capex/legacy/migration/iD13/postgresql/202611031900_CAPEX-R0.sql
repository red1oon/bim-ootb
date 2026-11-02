-- CAPEX-R0 (bim-ootb prompts/CAPEX_DASHBOARD.md §5.3): the dashboard's "Approved Budget (USD)" tile as iDempiere Performance Analysis DATA — no Java, no plugin.
-- Format = iDempiere's own migration convention (migration/iD13/postgresql/<yyyymmddHHMM>_<ticket>.sql, first statement registers the script). Client 11 (GardenWorld) rows,
-- IDs from the 1000000 band + fixed UUs. After applying run the stock post-migration update_sequences() (migration/processes_post_migration/postgresql/03_update_sequences.sql)
-- so later saves cannot reuse these IDs. The goal itself is user data and is created through the window / create_data (a model save computes it — MGoal.afterSave).
SELECT register_migration_script('202611031900_CAPEX-R0.sql') FROM dual;

-- Nov 3, 2026 — PA_MeasureCalc: SUM(PlannedAmt) of the USD projects (role access is added by legacy itself: MMeasureCalc.addRestrictions → MRole.addAccessSQL)
INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU)
VALUES (1000000,11,0,'Y',TO_TIMESTAMP('2026-11-03 19:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 19:00:00','YYYY-MM-DD HH24:MI:SS'),100,
'CAPEX Approved Budget (USD)','CAPEX dashboard tile 3, USD line: SUM(C_Project.PlannedAmt) per currency, all statuses','SELECT SUM(PlannedAmt) FROM C_Project','WHERE C_Currency_ID=100',
'C_Project.Created','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00000001')
;

-- Nov 3, 2026 — PA_Measure: Calculated, Status (a total, not a time series)
INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU)
VALUES (1000000,11,0,'Y',TO_TIMESTAMP('2026-11-03 19:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 19:00:00','YYYY-MM-DD HH24:MI:SS'),100,
'CAPEX Approved Budget (USD)','CAPEX dashboard tile 3, USD line','C','S',1000000,'5a0c3e1e-0b7d-4c1e-9f3a-cafe00000002')
;
