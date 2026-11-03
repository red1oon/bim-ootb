-- CAPEX-G3 (bim-ootb prompts/CAPEX_DASHBOARD.md §5.19, owner 2026-11-03: "Ship goals + boot-apply"): the default PA_Goal per CAPEX measure, so the stock Performance gadget
-- (/zul/performance.zul, PA_DashboardContent 50003) shows the CAPEX dashboard out of the box — on legacy ZK and on the SQLite twin, from the same rows. No Java, no plugin.
-- A goal with DateLastRun NULL is computed by legacy at the first dashboard render (MGoal.getUserGoals → updateGoal(false), MGoal.java:60-108 / :383-415); no target (0) is stated by the client (§6 Q1).
-- No AD_User_ID / AD_Role_ID: every user of client 11 sees them (MGoal.getUserGoals :66-71). Client 11, IDs 1000031-1000043 + fixed UUs; run update_sequences() after applying on legacy.
-- Restore (pilot): DELETE FROM PA_Goal WHERE PA_Goal_UU::text LIKE '5a0c3e1e-0b7d-4c1e-9f3a-cafe0003%';
SELECT register_migration_script('202611032100_CAPEX-G3.sql') FROM dual;

-- Nov 3, 2026 — goal: CAPEX Total Projects
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000031,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,10,'CAPEX Total Projects','CAPEX dashboard tile 1: COUNT(C_Project)',100,'N',1000011,1,0,'0','0',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030001')
;

-- Nov 3, 2026 — goal: CAPEX Closed Projects
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000032,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,20,'CAPEX Closed Projects','CAPEX dashboard tile 1 sub: COUNT(C_Project) Processed=Y',100,'N',1000012,1,0,'0','0',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030002')
;

-- Nov 3, 2026 — goal: CAPEX Active Projects
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000033,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,30,'CAPEX Active Projects','CAPEX dashboard tile 2: COUNT(C_Project) IsActive=Y AND Processed=N',100,'N',1000013,1,0,'0','0',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030003')
;

-- Nov 3, 2026 — goal: CAPEX Approved Budget (USD)
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000034,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,40,'CAPEX Approved Budget (USD)','CAPEX dashboard tile 3, USD line',100,'N',1000000,1,0,'0','0',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030004')
;

-- Nov 3, 2026 — goal: CAPEX Approved Budget (BDT)
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000035,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,50,'CAPEX Approved Budget (BDT)','CAPEX dashboard tile 3, BDT line: SUM(PlannedAmt)',100,'N',1000014,1,0,'0','0',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030005')
;

-- Nov 3, 2026 — goal: CAPEX Actual Cost (USD)
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000036,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,60,'CAPEX Actual Cost (USD)','CAPEX dashboard tile 4, USD line: SUM(ProjectBalanceAmt)',100,'N',1000015,1,0,'0','0',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030006')
;

-- Nov 3, 2026 — goal: CAPEX Actual Cost (BDT)
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000037,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,70,'CAPEX Actual Cost (BDT)','CAPEX dashboard tile 4, BDT line: SUM(ProjectBalanceAmt)',100,'N',1000016,1,0,'0','0',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030007')
;

-- Nov 3, 2026 — goal: CAPEX Committed Cost (USD)
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000038,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,80,'CAPEX Committed Cost (USD)','CAPEX dashboard tile 5, USD line: SUM(CommittedAmt)',100,'N',1000017,1,0,'0','0',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030008')
;

-- Nov 3, 2026 — goal: CAPEX Committed Cost (BDT)
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000039,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,90,'CAPEX Committed Cost (BDT)','CAPEX dashboard tile 5, BDT line: SUM(CommittedAmt)',100,'N',1000018,1,0,'0','0',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030009')
;

-- Nov 3, 2026 — goal: CAPEX Invoiced (USD)
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000040,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,100,'CAPEX Invoiced (USD)','CAPEX dashboard tile 5 sub, USD line: SUM(InvoicedAmt)',100,'N',1000019,1,0,'0','0',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030010')
;

-- Nov 3, 2026 — goal: CAPEX Invoiced (BDT)
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000041,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,110,'CAPEX Invoiced (BDT)','CAPEX dashboard tile 5 sub, BDT line: SUM(InvoicedAmt)',100,'N',1000020,1,0,'0','0',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030011')
;

-- Nov 3, 2026 — goal: CAPEX Projects Completed this Year
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000042,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,120,'CAPEX Projects Completed this Year','CAPEX dashboard tile 7: COUNT(C_Project) Processed=Y, DateFinish in the goal year (data type T + goal scope Year)',100,'N',1000021,1,0,'1','1',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030012')
;

-- Nov 3, 2026 — goal: CAPEX Approval Pending
INSERT INTO PA_Goal (PA_Goal_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,SeqNo,Name,Description,PA_ColorSchema_ID,IsSummary,PA_Measure_ID,RelativeWeight,MeasureTarget,MeasureScope,MeasureDisplay,MeasureActual,GoalPerformance,ChartType,PA_Goal_UU)
VALUES (1000043,11,0,'Y',TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-03 21:00:00','YYYY-MM-DD HH24:MI:SS'),100,130,'CAPEX Approval Pending','CAPEX dashboard tile 13: COUNT(AD_WF_Activity) WFState=OS AND Processed=N',100,'N',1000022,1,0,'0','0',0,0,'BC','5a0c3e1e-0b7d-4c1e-9f3a-cafe00030013')
;
