// config.js — URL params, discipline colours, constants

// §S282b: Platform detection — set once, before any UI module reads it.
// pill_builder.js, scene.js, time_machine.js all read window._isMobile at init.
window._isMobile = ('ontouchstart' in window || navigator.maxTouchPoints > 0);

function setupConfig(A) {
  // §S284e-B: standalone file:// mounts the viewer in a same-origin iframe via
  // contentDocument.write (no URL query). The opener stashes "?db=…&lib=…" in the iframe's
  // name (window.name); fall back to it so the import:// DB still loads.
  var _search = location.search;
  if (!_search && typeof window.name === 'string' && window.name.charAt(0) === '?') {
    _search = window.name;
    console.log('§STANDALONE_INPLACE params from window.name=' + _search.slice(0, 80));
  }
  const _params = new URLSearchParams(_search);
  // Auto-resolve: if hosted on OCI Object Storage, use same bucket base for DB URLs
  const _ociMatch = location.href.match(/(https:\/\/objectstorage\.[^/]+\/n\/[^/]+\/b\/[^/]+\/o\/)/);
  const _base = _ociMatch ? _ociMatch[1] : '';
  // §S283: If no ?db= param, try last building from localStorage (PWA resume), then default
  var _lastDb = null;
  try { _lastDb = localStorage.getItem('pwa_last_db'); } catch(e) {}
  A.DB_URL = _params.get('db') || _lastDb || (_base ? _base + 'Duplex_extracted.db' : 'buildings/Duplex_extracted.db');
  if (_lastDb && !_params.get('db')) console.log('§PWA_RESUME db=' + _lastDb);
  A.CITY_URL = _params.get('city') || null;
  A.BLD_BASE = _params.get('bldbase') || '';

  // iDempiere BIM Tab: embedded mode + project record ID
  A.EMBEDDED = _params.get('embedded') === 'true';
  A.RECORD_ID = _params.get('record') || null;

  // Discipline colours (same as Blender addon)
  A.DISC_COLORS = {
    ARC:  0x4488ff, STR:  0x44cccc, MEP:  0x44cc44,
    ELEC: 0xcccc44, FP:   0xcc8844, ACMV: 0xcc4444,
    PLB:  0x8844cc, HEAT: 0xff6644, HVAC: 0x44aacc,
    SAN:  0xaa44aa, VENT: 0x88ccaa, VOID: 0x666666,
  };
  A.DEFAULT_COLOR = 0x888888;

  // 4D/5D cost tables
  A.MATERIAL_COSTS = {
    IfcDuct:{rate:165,unit:'M',desc:'GI Ductwork 400mm'},IfcDuctSegment:{rate:165,unit:'M',desc:'Duct Segment'},
    IfcDuctFitting:{rate:380,unit:'EA',desc:'Duct Fittings'},IfcPipe:{rate:48.5,unit:'M',desc:'PVC Pipe 100mm'},
    IfcPipeSegment:{rate:48.5,unit:'M',desc:'Pipe Segment'},IfcPipeFitting:{rate:95,unit:'EA',desc:'Pipe Fittings'},
    IfcCableCarrier:{rate:78,unit:'M',desc:'Cable Tray 300mm'},IfcCableCarrierSegment:{rate:78,unit:'M',desc:'Cable Tray'},
    IfcBeam:{rate:680,unit:'M',desc:'Steel I-Beam'},IfcColumn:{rate:1250,unit:'M',desc:'Steel Column'},
    IfcSlab:{rate:285,unit:'M2',desc:'RC Slab 250mm'},IfcWall:{rate:145,unit:'M2',desc:'Blockwork Wall 150mm'},
    IfcWallStandardCase:{rate:145,unit:'M2',desc:'Standard Wall'},IfcCurtainWall:{rate:750,unit:'M2',desc:'Curtain Wall'},
    IfcCovering:{rate:185,unit:'M2',desc:'Floor/Ceiling Finish'},IfcRoof:{rate:238,unit:'M2',desc:'Metal Roof'},
    IfcLightFixture:{rate:485,unit:'EA',desc:'LED Light'},IfcOutlet:{rate:125,unit:'EA',desc:'Power Outlet'},
    IfcDoor:{rate:2850,unit:'EA',desc:'Door Set'},IfcWindow:{rate:1580,unit:'EA',desc:'Window'},
    IfcBuildingElementProxy:{rate:850,unit:'EA',desc:'Misc Element'},IfcFlowTerminal:{rate:3500,unit:'EA',desc:'HVAC Terminal'},
    IfcFurnishingElement:{rate:1200,unit:'EA',desc:'Furniture'},IfcPlate:{rate:95,unit:'M2',desc:'Steel Plate'},
    IfcMember:{rate:320,unit:'M',desc:'Steel Member'},IfcRailing:{rate:280,unit:'M',desc:'Railing'},
    IfcStair:{rate:4500,unit:'EA',desc:'Staircase'},IfcStairFlight:{rate:2200,unit:'EA',desc:'Stair Flight'},
  };
  A.LABOR_PROD = {
    IfcDuct:18,IfcDuctSegment:18,IfcDuctFitting:12,IfcPipe:25,IfcPipeSegment:25,IfcPipeFitting:15,
    IfcCableCarrier:30,IfcCableCarrierSegment:30,IfcLightFixture:20,IfcOutlet:25,
    IfcBeam:8,IfcColumn:6,IfcSlab:35,IfcWall:12,IfcWallStandardCase:12,
    IfcDoor:4,IfcWindow:5,IfcCurtainWall:8,IfcCovering:40,IfcRoof:25,
  };
  A.PHASE_MAP = {
    STR:{phase:'1-Structure',seq:1},ARC:{phase:'2-Architecture',seq:2},
    MEP:{phase:'3-MEP',seq:3},ELEC:{phase:'3-Electrical',seq:3},PLB:{phase:'3-Plumbing',seq:3},
    ACMV:{phase:'3-ACMV',seq:3},FP:{phase:'3-Fire Protection',seq:3},HVAC:{phase:'3-HVAC',seq:3},
  };

  // Walk constants
  A.WALK_EYE_HEIGHT = 1.6;
  A.WALK_SPEED = 1.2;
  A.PAN_SPEED = 90;
  A.WALK_STEP_THRESHOLD = 4.0;
  A.WALK_STEP_DISTANCE = 0.6;
  A.WALK_STEP_COOLDOWN_MS = 300;

  // S250 §8: Contributed IFC Upload — OCI PAR URL for contributed/ prefix
  A.CONTRIBUTE_PAR = '';
}
