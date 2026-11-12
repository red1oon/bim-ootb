// capex/tools/td_scenario.js — the 12-project throw-away test scenario, ONE definition (prompts/CAPEX_DASHBOARD.md §5.55, §5.60 build step c). Two builders read it: film_testdata.js (legacy, through the web services) and
// twin_mockchain.js (the twin, through its own model layer). Offsets are RELATIVE to "today" so a run on any day shows the same spread. Neutral names only (no client name).
'use strict';
// the scenario: [value, name, start offset (days from today), phase durations, ticked phases, plan scale, issues, po]. Offsets are relative so the film's dashboard shows a spread: green, amber, red, no data, over budget, ready for handover.
const PH = ['Substructure', 'Superstructure', 'Envelope', 'Services', 'Finishes', 'Handover'];
const SC = [['TD_RIVERSIDE', 'Riverside Tower', -230, [60, 80, 70, 60, 50], 3, 0.00135, '139x30', '139x40@50,d:139x10@50'], ['TD_DEPOT', 'North Depot', -150, [40, 50, 50, 40], 1, 0.00072, '139x10', 'd:139x12@70'], ['TD_BRIDGE', 'Bridge Deck', -300, [90, 90, 80, 60], 2, 0.00316, '139x80', '139x20@120,d:139x30@120'],
  ['TD_CLINIC', 'Clinic Wing', -100, [30, 40, 40, 40], 2, 0.00149, '139x15', ''], ['TD_DATAHALL', 'Data Hall', -120, [50, 50, 40], 1, 0.0011, '139x25', '139x30@60,d:139x20@60'], ['TD_SUBSTATION', 'Substation', -60, [30, 40, 40], 1, 0.0015, '', '139x5@100'],
  ['TD_CARPARK', 'Car Park', -90, [30, 30, 30], 2, 0.002, '139x60', ''], ['TD_SCHOOL', 'School Block', -180, [60, 60, 60, 60], 3, 0.00226, '139x35', '139x25@45'], ['TD_PUMP', 'Pump Station', -250, [40, 40, 40], 1, 0.00193, '139x5', ''],
  ['TD_OFFICE', 'Office Fit-out', 10, [30, 30, 30], 0, 0.003, '', ''], ['TD_WAREHOUSE', 'Warehouse 3', -40, [30, 30, 30], 0, 0.002, '', 'd:139x8@80'], ['TD_PLAZA', 'Plaza', -300, [50, 50, 50], 3, 0.0007, '139x12', '']];
// plan size: quantities are scaled by the plan factor (unit prices stay realistic, 400 and 300); the stock product costs 7.65 a unit, so the factor is what sets how much of the plan the issues have spent (about 12% to 140%)
const PRODUCTS = [['TD_MAT_A', 'Test material A (test data)', 100, 400], ['TD_MAT_B', 'Test material B (test data)', 50, 300]];
// §5.59/§5.60: the stage each COMPLETED purchase order reaches after the order, in the order the po string lists them (drafts have none). ordered = nothing after the PO; received = a completed receipt; partpaid = receipt + vendor invoice + a
// payment of half the invoice (stage "invoiced": paid < invoiced); paid = receipt + invoice + the full payment. Only the twin builder creates these documents (legacy has read types only for them, §5.59): the film_testdata/film_progress
// legacy generator ignores CHAIN. 5 completed POs -> the Supply chain strip must read ordered 1, received 1, invoiced 1, paid 2.
const CHAIN = { TD_RIVERSIDE: ['paid'], TD_BRIDGE: ['partpaid'], TD_DATAHALL: ['received'], TD_SUBSTATION: ['ordered'], TD_SCHOOL: ['paid'] };
const STRIP = { ordered: 1, received: 1, invoiced: 1, paid: 2 };   // what CHAIN implies (partpaid counts as invoiced)
module.exports = { PH, SC, PRODUCTS, CHAIN, STRIP };
