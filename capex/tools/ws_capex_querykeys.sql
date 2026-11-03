-- PILOT-ONLY (idempiere_pilot, local copy). prompts/CAPEX_DASHBOARD.md §5.8 — the QUERY types the push + CAPEX twin tools use stop depending on a FREE `Filter` parameter.
-- WHY: iDempiere forbids ParameterType Free on a parameter named Filter (MWebServicePara.beforeSave :114-121, IDEMPIERE-1784; a 2Pack import of these types failed with it); our types were
--   inserted by SQL, which skipped that rule. A Filter may only be Constant (ModelADServiceImpl.validateParameter :307-338). The safe lookup is queryData's DataRow path (:1470-1500):
--   each request DataRow field the type whitelists as a WS_WebServiceFieldInput becomes `col LIKE ?` (CHAR) / `col=?`. The clients (viewer/erp_rest_push.js queryRows) now send DataRow keys, never a Filter.
-- WHAT: (a) the Filter parameter -> ParameterType 'C', ConstantValue '1=1' (a no-op SQL constant; empty could be stored NULL and NPE in validateParameter's .equals);
--       (b) the key columns each type is looked up by -> WS_WebServiceFieldInput rows. UPDATE/INSERT only, idempotent, never deletes. Types named BIMOOTB_* are not touched here.
-- Order on a fresh pilot: ws_capex_readtypes.sql, ws_capex_writetypes.sql, ws_capex_patypes.sql, THEN this file (QueryCProject/QueryMProduct/QueryMProductCategory pre-exist, client 0).
-- Restart the server afterwards (WS types + access are cached): ~/idempiere-pilot/stop.sh; sleep 8; ~/idempiere-pilot/start.sh
SET search_path=adempiere;
DO $$
DECLARE d record; tid int; t int; c record; n_para int := 0; n_in int := 0; k int;
BEGIN
  FOR d IN SELECT * FROM (VALUES
      ('QueryCProject',        'C_Project',          ARRAY['Value','C_Project_ID']),
      ('QueryCProjectPhase',   'C_ProjectPhase',     ARRAY['C_Project_ID','Name','C_ProjectPhase_ID']),
      ('QueryCProjectTask',    'C_ProjectTask',      ARRAY['C_ProjectPhase_ID','Name']),
      ('QueryCProjectLine',    'C_ProjectLine',      ARRAY['C_ProjectPhase_ID','M_Product_ID','C_ProjectTask_ID']),
      ('QueryMProduct',        'M_Product',          ARRAY['Value']),
      ('QueryMProductCategory','M_Product_Category', ARRAY['Name']),
      ('QueryCUOM',            'C_UOM',              ARRAY['X12DE355']),
      ('QueryPAGoal',          'PA_Goal',            ARRAY['Name','PA_Goal_ID']),
      ('QueryCPhase',          'C_Phase',            ARRAY[]::text[]),
      ('QueryCCurrency',       'C_Currency',         ARRAY[]::text[]),
      ('QueryADWFActivity',    'AD_WF_Activity',     ARRAY[]::text[])
  ) AS v(val,tbl,cols) LOOP
    SELECT ws_webservicetype_id INTO tid FROM ws_webservicetype WHERE value=d.val;
    IF tid IS NULL THEN RAISE NOTICE 'skip % (type absent)', d.val; CONTINUE; END IF;
    t := (SELECT ad_table_id FROM ad_table WHERE tablename=d.tbl);
    UPDATE ws_webservice_para SET parametertype='C', constantvalue='1=1', updated=now()
      WHERE ws_webservicetype_id=tid AND parametername='Filter' AND (parametertype<>'C' OR constantvalue IS DISTINCT FROM '1=1');
    GET DIAGNOSTICS k = ROW_COUNT; n_para := n_para + k;
    FOR c IN SELECT ad_column_id FROM ad_column WHERE ad_table_id=t AND columnname = ANY(d.cols)
             AND ad_column_id NOT IN (SELECT ad_column_id FROM ws_webservicefieldinput WHERE ws_webservicetype_id=tid) LOOP
      INSERT INTO ws_webservicefieldinput(ad_client_id,ad_column_id,ad_org_id,created,createdby,isactive,updated,updatedby,ws_webservicefieldinput_id,ws_webservicetype_id,ws_webservicefieldinput_uu)
      VALUES ((SELECT ad_client_id FROM ws_webservicetype WHERE ws_webservicetype_id=tid),c.ad_column_id,0,now(),100,'Y',now(),100,
              nextidfunc((SELECT ad_sequence_id FROM ad_sequence WHERE name='WS_WebServiceFieldInput')::int,'N'::varchar),tid,gen_random_uuid());
      n_in := n_in + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE '§WS_QUERYKEYS filter_params_set_to_constant=% input_rows_added=%', n_para, n_in;
END $$;
