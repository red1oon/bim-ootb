/* mock_time_ops.js — Simulate construction sequence from actual DB elements
   Injects kernel_ops as if elements were placed piece-by-piece per Gantt phases.
   Each element = one op. Slider at MIN level shows individual placements. */

(function() {
  var app = window.APP || window.A;
  if (!app || !app.db) { console.error('APP.db not ready'); return; }
  var db = app.db;

  // Ensure kernel_ops table
  db.run(
    'CREATE TABLE IF NOT EXISTS kernel_ops (' +
    '  id INTEGER PRIMARY KEY,' +
    '  timestamp INTEGER NOT NULL,' +
    '  op_type TEXT NOT NULL,' +
    '  parameters TEXT NOT NULL,' +
    '  input_guids TEXT,' +
    '  output_guid TEXT,' +
    '  undone INTEGER DEFAULT 0' +
    ')'
  );

  // Construction phase order (Gantt sequence)
  var phases = [
    { match: ['IfcFooting','IfcPile','IfcFoundation'], phase: 'Substructure', dayOffset: 0 },
    { match: ['IfcColumn'], phase: 'Columns', dayOffset: 1 },
    { match: ['IfcBeam'], phase: 'Beams', dayOffset: 2 },
    { match: ['IfcSlab','IfcRoof'], phase: 'Slabs & Roof', dayOffset: 3 },
    { match: ['IfcWall','IfcWallStandardCase','IfcCurtainWall'], phase: 'Walls', dayOffset: 4 },
    { match: ['IfcDoor'], phase: 'Doors', dayOffset: 5 },
    { match: ['IfcWindow'], phase: 'Windows', dayOffset: 5 },
    { match: ['IfcStair','IfcRailing','IfcRamp'], phase: 'Circulation', dayOffset: 6 },
    { match: ['IfcPipeSegment','IfcDuctSegment','IfcFlowTerminal','IfcFlowSegment'], phase: 'MEP', dayOffset: 7 },
    { match: ['IfcFurnishingElement','IfcBuildingElementProxy'], phase: 'Fitout', dayOffset: 8 },
  ];

  // Pull all elements from DB
  var r = db.exec('SELECT guid, ifc_class, element_name, storey, discipline FROM elements ORDER BY storey, ifc_class');
  if (!r.length || !r[0].values.length) {
    console.error('§MOCK no elements in DB');
    return;
  }
  var elements = r[0].values.map(function(row) {
    return { guid: row[0], cls: row[1], name: row[2], storey: row[3], disc: row[4] };
  });

  // Assign each element to a phase
  function getPhase(cls) {
    for (var i = 0; i < phases.length; i++) {
      for (var j = 0; j < phases[i].match.length; j++) {
        if (cls && cls.indexOf(phases[i].match[j]) >= 0) return phases[i];
      }
    }
    // Default: last phase (fitout)
    return { phase: 'Other', dayOffset: 9 };
  }

  // Group elements by phase
  var grouped = {};
  elements.forEach(function(el) {
    var p = getPhase(el.cls);
    var key = p.dayOffset;
    if (!grouped[key]) grouped[key] = { phase: p.phase, elements: [] };
    grouped[key].elements.push(el);
  });

  // Base time: 10 days ago at 7:00 AM (construction start)
  var baseTime = Date.now() - (10 * 86400000);
  var startOfDay = new Date(baseTime);
  startOfDay.setHours(7, 0, 0, 0);
  baseTime = startOfDay.getTime();

  var count = 0;
  var dayKeys = Object.keys(grouped).sort(function(a,b){ return a - b; });

  dayKeys.forEach(function(dayKey) {
    var group = grouped[dayKey];
    var dayStart = baseTime + (parseInt(dayKey) * 86400000);
    var els = group.elements;

    // Spread elements across 8 working hours (7:00-15:00)
    // Each element gets its own minute-level timestamp
    var workMs = 8 * 3600000; // 8 hours in ms
    var interval = Math.max(Math.floor(workMs / els.length), 1000); // at least 1s apart

    els.forEach(function(el, idx) {
      var ts = dayStart + (idx * interval);
      db.run(
        'INSERT INTO kernel_ops (timestamp, op_type, parameters, input_guids, output_guid, undone) VALUES (?,?,?,?,?,0)',
        [ts, 'ELEMENT_PLACE',
         JSON.stringify({ phase: group.phase, cls: el.cls, name: el.name, storey: el.storey, disc: el.disc }),
         JSON.stringify([el.guid]),
         el.guid]
      );
      count++;
    });
  });

  console.log('§MOCK_CONSTRUCTION injected ' + count + ' ops across ' + dayKeys.length + ' phases');
  console.log('§MOCK_CONSTRUCTION phases: ' + dayKeys.map(function(k){ return grouped[k].phase + '(' + grouped[k].elements.length + ')'; }).join(' → '));
  console.log('§MOCK_CONSTRUCTION now use ⏳ — DAY shows phases, HR shows batches, MIN shows piece-by-piece');
})();
