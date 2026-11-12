-- CAPEX-ENTITYTYPE-A (bim-ootb prompts/CAPEX_DASHBOARD.md §5.57; owner 2026-11-12: dictionary rows our plugins ship are EntityType 'A' (Applications), not 'U' (User maintained)). A label only: no behaviour changes. Idempotent: AND EntityType='U'.
-- Restore: UPDATE PA_MeasureCalc SET EntityType='U' WHERE Name LIKE 'CAPEX%'; UPDATE PA_ColorSchema SET EntityType='U' WHERE PA_ColorSchema_ID=1000000;
SELECT register_migration_script('202611121500_CAPEX-ENTITYTYPE-A.sql') FROM dual;

UPDATE PA_MeasureCalc SET EntityType='A' WHERE Name LIKE 'CAPEX%' AND EntityType='U';
UPDATE PA_ColorSchema SET EntityType='A' WHERE PA_ColorSchema_ID=1000000 AND EntityType='U';
