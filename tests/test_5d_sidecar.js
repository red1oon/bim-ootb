// Proves ANALYSIS_SIDECAR.md §T3 — W-5D-SIDECAR.
// Issue under test: "5D sidecar holds currency-free quantities; the live rate pack
// bills the RIGHT quantity by unit (EA→count, M→length, M2→area, M3→vol); unmapped
// classes never invent a cost; OPFS-absent degrades gracefully (compute, no cache)."
const A = require('../viewer/analysis_sidecar.js');

let logs = [];
const origLog = console.log;
console.log = (...a) => { logs.push(a.join(' ')); origLog(...a); };

// sql.js-shaped result: [{columns, values:[[disc,cls,storey,cnt,length,area,vol], ...]}]
const db = { exec: () => [{
  columns: ['discipline','ifc_class','storey','cnt','length_m','area_m2','vol_m3'],
  values: [
    ['Architectural', 'IfcDoor',             'L1', 14, 3.9,  3.9,   8.56 ],
    ['Architectural', 'IfcWallStandardCase', 'L1', 56, 200,  106.7, 217.32],
    ['Structural',    'IfcBeam',             'L1',  8, 50,   8.1,   3.0  ],
    ['MEP',           'IfcDuct',             'L1', 10, 40,   5,     2    ],
    ['X',             'IfcUnknownClass',     'L1',  3, 1,    1,     1    ],
  ],
}]};

const RATES = {
  IfcDoor:             { rate: 2850, unit: 'EA' },
  IfcWallStandardCase: { rate: 145,  unit: 'M2' },
  IfcBeam:             { rate: 120,  unit: 'M'  },
  IfcDuct:             { rate: 52,   unit: 'M'  },
  // IfcUnknownClass intentionally absent → must bill 0, never invent.
};

let fail = 0;
function check(name, cond, got) { console.log((cond?'PASS ':'FAIL ')+name+(cond?'':'  got='+JSON.stringify(got))); if(!cond) fail++; }

(async () => {
  // 1) compute5D shape
  const sc = A.compute5D(db, 'Duplex');
  check('schema tag 5d.v1', sc.schema === '5d.v1');
  check('currency-free: no cost/rate/currency keys in rows',
    sc.rows.every(r => !('cost' in r) && !('rate' in r) && !('currency' in r)), sc.rows[0]);
  const door = sc.rows.find(r => r.cls === 'IfcDoor');
  check('row maps count/length/area/vol', door.count===14 && door.length_m===3.9 && door.area_m2===3.9 && door.vol_m3===8.56, door);

  // 2) apply5DRates — unit drives which quantity is billed
  const costed = A.apply5DRates(sc, RATES, 'USD');
  const byCls = Object.fromEntries(costed.map(r => [r.cls, r]));
  check('EA  bills count : IfcDoor 14×2850=39900', byCls.IfcDoor.qty===14 && byCls.IfcDoor.cost===39900, byCls.IfcDoor);
  check('M2  bills area  : IfcWall 106.7×145=15472', byCls.IfcWallStandardCase.unit==='M2' && byCls.IfcWallStandardCase.qty===106.7 && byCls.IfcWallStandardCase.cost===Math.round(145*106.7), byCls.IfcWallStandardCase);
  check('M   bills length: IfcBeam 50×120=6000', byCls.IfcBeam.unit==='M' && byCls.IfcBeam.qty===50 && byCls.IfcBeam.cost===6000, byCls.IfcBeam);
  check('M   bills length: IfcDuct 40×52=2080', byCls.IfcDuct.qty===40 && byCls.IfcDuct.cost===2080, byCls.IfcDuct);
  check('unmapped NEVER invents cost: IfcUnknownClass cost=0, qty=count', byCls.IfcUnknownClass.cost===0 && byCls.IfcUnknownClass.qty===3, byCls.IfcUnknownClass);
  check('currency carried through', costed.every(r => r.currency==='USD'));

  // 3) OPFS-absent (node has no navigator.storage) → graceful: read null, write false
  const r = await A.sidecarRead('Duplex_5d.json');
  check('OPFS-absent read → null (no throw)', r === null, r);
  const w = await A.sidecarWrite('Duplex_5d.json', sc);
  check('OPFS-absent write → false (no throw)', w === false, w);

  // 4) get5D lazy path fires the witness line; OPFS-absent → source=computed baked=false
  const got = await A.get5D(db, 'Duplex');
  check('§5D_SIDECAR computed line fired', logs.some(l => /§5D_SIDECAR source=computed building=Duplex rows=5 baked=false/.test(l)));
  check('get5D returns full aggregate', got.rows.length === 5, got.rows.length);

  console.log('\n§5D_SIDECAR witness:', logs.find(l => /§5D_SIDECAR/.test(l)));
  console.log(fail===0 ? '\n✅ ALL PASS' : `\n❌ ${fail} FAILED`);
  process.exit(fail===0?0:1);
})();
