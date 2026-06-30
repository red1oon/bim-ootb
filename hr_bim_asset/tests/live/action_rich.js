// §RICH-DEMO live probe — confirm the enriched seed lights MULTIPLE storeys with a real mix on the live model.
var A = window.APP, Oc = self.HbaOccupancy, At = self.HbaAttendance;
var storeyOf = A._hbaStoreyOf || {};
var PER = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'];
var rooms = (A._hbaRooms || []).map(function (r) { return r.guid; });
var pv = Oc.pivot(A._hbaOccupancyLog || [], PER, { allResources: rooms, storeyOf: function (r) { return storeyOf[r]; } });
var byStorey = pv.byStorey.map(function (b) { return b.storey + ':' + b.utilization; }).join(' ');
var mar = pv.byPeriod['2026-03'];
console.log('§RICH storeys=' + pv.byStorey.length + ' [' + byStorey + '] mar(occ/exp/vac/unavail)=' + mar.occupied + '/' + mar.expiring + '/' + mar.vacant + '/' + mar.unavailable + ' rooms=' + rooms.length);
// presence spread
var att = A._hbaAttendanceLog || [];
var pres = At.presenceByZone(att, '2026-07').filter(function (x) { return x.headcount > 0; });
var presStoreys = {}; pres.forEach(function (x) { presStoreys[storeyOf[x.zone]] = 1; });
console.log('§RICH presence zones=' + pres.length + ' storeys=' + Object.keys(presStoreys).length + ' bands=' + JSON.stringify([...new Set(pres.map(function (x) { return x.headcount; }))].sort()));
// paint occupancy and report tinted target count (the live lens)
HBALens.toggle(A, 'occupancy');
console.log('§RICH afterToggle activeOcc=' + HBALens.isActive('occupancy') + ' tintedMeshes=' + HBALens.tintedCount());
HBALens.openFamilyDrawer(A);
