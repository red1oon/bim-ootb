-- CAPEX-Q3-EAC-FLOATDIV (bim-ootb prompts/CAPEX_DASHBOARD.md §5.56 F-A): the Q3 forecast measure (PA_MeasureCalc 1000042) divides `(PlannedAmt - done) * ProjectBalanceAmt / done`. PostgreSQL divides numeric exactly; SQLite divides
-- INTEGERS as integers when a project's amounts are whole numbers (planned 330, done 220, spent 459: legacy 688.5, twin 688). Multiplying by 1.0 before the division forces real division in SQLite and leaves PostgreSQL numeric exact.
-- REPLACE runs in both dialects; a second run finds nothing to replace and changes nothing.
-- Restore: re-apply the SelectClause of 202611111310_CAPEX-PROPOSED-MEASURES.sql for PA_MeasureCalc 1000042.
SELECT register_migration_script('202611121200_CAPEX-Q3-EAC-FLOATDIV.sql') FROM dual;

UPDATE PA_MeasureCalc SET SelectClause=REPLACE(SelectClause,'* C_Project.ProjectBalanceAmt / (','* C_Project.ProjectBalanceAmt * 1.0 / ('), Updated=TO_TIMESTAMP('2026-11-12 12:00:00','YYYY-MM-DD HH24:MI:SS') WHERE PA_MeasureCalc_ID=1000042;
