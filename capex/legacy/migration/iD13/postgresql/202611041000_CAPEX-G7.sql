-- CAPEX-G7 (bim-ootb prompts/CAPEX_DASHBOARD.md §5.27; owner 2026-11-04: "Yes targets as in convention. if it makes sense in the dashboard."): targets and colour schemas the way the stock goals carry them.
-- Convention measured on GardenWorld's own goals: MeasureTarget = a plain plan number on the row; the direction is the stock schema (100 Red-Yellow-Green = higher is better, Invoice Revenue; 101 Green-Yellow-Red = lower is better, Open Invoices).
-- Targets ONLY where a percent means something: cost against the approved budget (lower is better, 101); the good buckets as a share of the active projects (higher is better, 100). The numbers are this pilot's own on 2026-11-04 (Approved Budget USD 39971166.17, BDT 30286701.64, Active Projects 9): a site puts its own plan here, in the Performance Goal window. A target is static, as on every stock goal.
-- All other goals: a count or an amount with no plan behind it. A percent would hide the number, and stock schemas would paint it red or green for no reason, so they take a gray schema (the Performance Color Schema help: "Measures without a goal are represented white"). Presentation data only.
-- DateLastRun NULL: legacy computes each at the first dashboard render (as G3, MGoal.getUserGoals -> updateGoal(false)). Run update_sequences() after applying on legacy.
-- Restore (pilot): UPDATE PA_Goal SET MeasureTarget=0, GoalPerformance=0, PA_ColorSchema_ID=100, DateLastRun=NULL WHERE PA_Goal_ID BETWEEN 1000031 AND 1000057; DELETE FROM PA_ColorSchema WHERE PA_ColorSchema_ID=1000000;
SELECT register_migration_script('202611041000_CAPEX-G7.sql') FROM dual;

-- Nov 4, 2026 — colour schema for a goal with no target
INSERT INTO PA_ColorSchema (PA_ColorSchema_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,Description,Mark1Percent,AD_PrintColor1_ID,Mark2Percent,AD_PrintColor2_ID,Mark3Percent,AD_PrintColor3_ID,Mark4Percent,EntityType,PA_ColorSchema_UU)
VALUES (1000000,11,0,'Y',TO_TIMESTAMP('2026-11-04 10:00:00','YYYY-MM-DD HH24:MI:SS'),100,TO_TIMESTAMP('2026-11-04 10:00:00','YYYY-MM-DD HH24:MI:SS'),100,'No target (Gray)','No plan behind this goal: read the number in the caption',50,115,100,115,9999,115,0,'U','5a0c3e1e-0b7d-4c1e-9f3a-cafe00070001')
;

-- Nov 4, 2026 — Actual, Committed and Invoiced (USD) against the approved budget: lower is better
UPDATE PA_Goal SET MeasureTarget=39971166.17, PA_ColorSchema_ID=101, GoalPerformance=0, DateLastRun=NULL, Updated=TO_TIMESTAMP('2026-11-04 10:00:00','YYYY-MM-DD HH24:MI:SS'), UpdatedBy=100 WHERE PA_Goal_ID IN (1000036,1000038,1000040)
;

-- Nov 4, 2026 — Actual, Committed and Invoiced (BDT) against the approved budget: lower is better
UPDATE PA_Goal SET MeasureTarget=30286701.64, PA_ColorSchema_ID=101, GoalPerformance=0, DateLastRun=NULL, Updated=TO_TIMESTAMP('2026-11-04 10:00:00','YYYY-MM-DD HH24:MI:SS'), UpdatedBy=100 WHERE PA_Goal_ID IN (1000037,1000039,1000041)
;

-- Nov 4, 2026 — Health Green, Schedule On Time, Budget Within as a share of the active projects: higher is better
UPDATE PA_Goal SET MeasureTarget=9, PA_ColorSchema_ID=100, GoalPerformance=0, DateLastRun=NULL, Updated=TO_TIMESTAMP('2026-11-04 10:00:00','YYYY-MM-DD HH24:MI:SS'), UpdatedBy=100 WHERE PA_Goal_ID IN (1000044,1000048,1000053)
;

-- Nov 4, 2026 — no target: read the number
UPDATE PA_Goal SET MeasureTarget=0, PA_ColorSchema_ID=1000000, GoalPerformance=0, DateLastRun=NULL, Updated=TO_TIMESTAMP('2026-11-04 10:00:00','YYYY-MM-DD HH24:MI:SS'), UpdatedBy=100 WHERE PA_Goal_ID IN (1000031,1000032,1000033,1000034,1000035,1000042,1000043,1000045,1000046,1000047,1000049,1000050,1000051,1000052,1000054,1000055,1000056,1000057)
;
