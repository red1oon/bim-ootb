-- W-WS-DIFF-READ fixtures for the Kernel ERP side: the SAME rows pilot_ws_read_types.sql (bim-compiler scripts/ws) puts in the pilot, plus the role-102 grant on the seed's QueryBPartner (200005).
DELETE FROM ws_webservicefieldoutput WHERE ws_webservicetype_id = 910001;
DELETE FROM ws_webservice_para WHERE ws_webservicetype_id = 910001;
DELETE FROM ws_webservicetypeaccess WHERE ws_webservicetype_id = 910001;
DELETE FROM ws_webservicetype WHERE ws_webservicetype_id = 910001;
INSERT INTO ws_webservicetype (ad_client_id,ad_org_id,ad_table_id,isactive,name,value,ws_webservice_id,ws_webservicemethod_id,ws_webservicetype_id) VALUES (11,0,291,'Y','ReadWSBPartner','ReadWSBPartner',50001,50027,910001);
INSERT INTO ws_webservicetypeaccess (ad_client_id,ad_org_id,ad_role_id,ws_webservicetype_id,isactive) VALUES (11,0,102,910001,'Y');
INSERT INTO ws_webservice_para (ad_client_id,ad_org_id,constantvalue,parametername,parametertype,ws_webservice_para_id,ws_webservicetype_id,isactive) VALUES (11,0,'C_BPartner','TableName','C',910011,910001,'Y'),(11,0,'','RecordID','F',910012,910001,'Y'),(11,0,'Read','Action','C',910013,910001,'Y');
INSERT INTO ws_webservicefieldoutput (ad_client_id,ad_org_id,ad_column_id,ws_webservicetype_id,ws_webservicefieldoutput_id,isactive) SELECT 11,0,c.ad_column_id,910001,910100+c.ad_column_id,'Y' FROM ad_column c WHERE c.ad_table_id=291 AND c.columnname IN ('C_BPartner_ID','AD_Client_ID','IsActive','Value','Name','IsCustomer','IsVendor','TaxID','SO_CreditLimit');
INSERT INTO ws_webservicetypeaccess (ad_client_id,ad_org_id,ad_role_id,ws_webservicetype_id,isactive) SELECT 11,0,102,200005,'Y' WHERE NOT EXISTS (SELECT 1 FROM ws_webservicetypeaccess WHERE ad_role_id=102 AND ws_webservicetype_id=200005);
