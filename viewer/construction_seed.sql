-- construction_seed.sql — Spatial ERP POC seed data
-- Source: SpatialERP_POC.md §4.1–§4.5
-- Usage: doc_engine.js createTables() first, then run this SQL.
-- Copyright (c) 2025-2026 Redhuan D. Oon. MIT Licensed.

-- §SEED_CONTAINERS — site/plot/building/phases
INSERT OR IGNORE INTO containers VALUES ('site_gulshan', NULL, 'Gulshan-1 Site', 'SITE', NULL,
    0,0,0, '{"area":"Gulshan-1","city":"Dhaka"}');

INSERT OR IGNORE INTO containers VALUES ('plot_60', 'site_gulshan', 'Plot 60, Road 2, Block 4', 'PLOT', NULL,
    60,2,0, '{"plot_no":60,"road_no":2,"block_no":4,"sector":3,"road_width":20,"facing":"East"}');

INSERT OR IGNORE INTO containers VALUES ('bldg_test', 'plot_60', 'Proposed Development', 'BUILDING', NULL,
    0,0,0, '{"storeys":40,"far_value":10000,"dev_area":20,"saleable_area":100,"basement_area":2,"total_units":50,"units_per_floor":4,"parking":30}');

INSERT OR IGNORE INTO containers VALUES ('phase_found',  'bldg_test', 'Foundation',      'PHASE', NULL, 0,0,0, '{"sequence":10,"std_phase":"Foundation_Construction"}');
INSERT OR IGNORE INTO containers VALUES ('phase_civil',  'bldg_test', 'Civil Structure', 'PHASE', NULL, 0,0,0, '{"sequence":20,"std_phase":"Civil_Structure_Construction"}');
INSERT OR IGNORE INTO containers VALUES ('phase_elec',   'bldg_test', 'Electrical',      'PHASE', NULL, 0,0,0, '{"sequence":30,"std_phase":"Electrical_Construction"}');
INSERT OR IGNORE INTO containers VALUES ('phase_plumb',  'bldg_test', 'Plumbing',        'PHASE', NULL, 0,0,0, '{"sequence":40,"std_phase":"Plumbing_Construction"}');
INSERT OR IGNORE INTO containers VALUES ('phase_finish', 'bldg_test', 'Finishing',       'PHASE', NULL, 0,0,0, '{"sequence":50,"std_phase":"Finishing_Construction"}');

-- §SEED_LEAD — matches pptx Lead Info screen
INSERT OR IGNORE INTO documents VALUES ('LEAD-1000000', 'LAND_LEAD', 'DRAFT', '2026-05-13', NULL,
    'Test lead — Gulshan-1 Plot 60',
    '{"lead_code":"1000000","land_type":"Freehold","land_size_katha":10.0,"lead_source":"Others","plot_no":60,"road_no":2,"block_no":4,"sector":3,"area":"Gulshan-1","facing":"East","road_width":20,"owner_name":"CONFIDENTIAL — Mr. Rahman","contact_person":"test contact","phone":"0986533223","email":"","address":"","user_contact":"Azmir","container_ref":"plot_60"}');

-- §SEED_DEV_PLAN — linked to lead
INSERT OR IGNORE INTO documents VALUES ('DEV-1000000', 'DEV_PLAN', 'DRAFT', '2026-05-13', NULL,
    'Development Plan for LEAD-1000000',
    '{"lead_ref":"LEAD-1000000","far_value":10000.0,"total_dev_area":20.0,"total_saleable_area":100.0,"num_storeys":40,"total_units":50,"units_per_floor":4,"total_parking":30,"total_basement_area":2.0,"container_ref":"bldg_test"}');

-- §SEED_SALES_PRICE
INSERT OR IGNORE INTO document_lines VALUES ('SP-001', 'DEV-1000000', NULL, 'bldg_test',
    1, 2000.00, '{"type":"sales_price","comment":"testttt"}');

-- §SEED_BOQ
INSERT OR IGNORE INTO document_lines VALUES ('BOQ-001', 'DEV-1000000', NULL, 'bldg_test',
    1, 2300.00, '{"type":"cost_per_sf","comment":"eofuweofowef"}');

-- §SEED_REGISTRY — AD for construction categories
INSERT OR IGNORE INTO category_registry VALUES ('SITE',     'CONSTRUCTION', NULL, NULL,
    '["CreateLead","ViewLeads","ViewPnL"]',
    '{"field":"active_leads","red_above":10}',
    '{name}');

INSERT OR IGNORE INTO category_registry VALUES ('PLOT',     'CONSTRUCTION', NULL, 'plot_3d',
    '["CreateLead","EditLead","ViewFAR","LinkIFC"]',
    '{"field":"lead_status","red_value":"REJECTED"}',
    'Plot {metadata.plot_no} — {metadata.area}');

INSERT OR IGNORE INTO category_registry VALUES ('BUILDING', 'CONSTRUCTION', NULL, NULL,
    '["ViewIFC","ComputeBOQ","EditFAR","ApprovePlan"]',
    '{"field":"doc_status","amber_value":"DRAFT","red_value":"REJECTED"}',
    '{name} ({metadata.storeys}F)');

INSERT OR IGNORE INTO category_registry VALUES ('PHASE',    'CONSTRUCTION', NULL, NULL,
    '["ViewProgress","AddCost","CompleteMilestone"]',
    '{"field":"pct_complete","red_below":20,"green_above":80}',
    '{name} — Seq {metadata.sequence}');

-- §SEED_META — roles from Sysnova pptx
INSERT OR IGNORE INTO project_metadata VALUES ('domain', 'CONSTRUCTION');
INSERT OR IGNORE INTO project_metadata VALUES ('roles',
    '["LAND","ARCH","ENGR","SALE","MGMT","LEGL"]');
INSERT OR IGNORE INTO project_metadata VALUES ('role_labels',
    '{"LAND":"Land Team","ARCH":"Architect","ENGR":"BOQ Team","SALE":"Sales","MGMT":"Management","LEGL":"Legal"}');
INSERT OR IGNORE INTO project_metadata VALUES ('role_colours',
    '{"LAND":"#1565c0","ARCH":"#7b1fa2","ENGR":"#e65100","SALE":"#2e7d32","MGMT":"#b71c1c","LEGL":"#00838f"}');
INSERT OR IGNORE INTO project_metadata VALUES ('role_modes',
    '{"LAND":"full","ARCH":"operator","ENGR":"operator","SALE":"readonly","MGMT":"full","LEGL":"operator"}');
INSERT OR IGNORE INTO project_metadata VALUES ('role_scopes',
    '{"LAND":"*","ARCH":"far","ENGR":"boq","SALE":"no_owner","MGMT":"*","LEGL":"approved_only"}');
INSERT OR IGNORE INTO project_metadata VALUES ('accounts',
    '["LAND_ACQUISITION","CONSTRUCTION_WIP","REVENUE","RETENTION","PROFESSIONAL_FEES"]');
INSERT OR IGNORE INTO project_metadata VALUES ('confidential_fields',
    '["owner_name","contact_person","phone","email","address"]');
