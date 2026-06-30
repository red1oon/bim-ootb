var A=window.APP, B=self.HbaBinding;
var gm=Object.keys(A.guidMap).length;
var known=B.augmentKnown(A.guidMap, A._hbaRoomMembers);
var leaseRooms=['RM_Level_1_1','RM_Level_1_3','RM_Level_1_4'];
var resolved=leaseRooms.filter(function(r){return known.has(r)});
var av=HBALens.availableLenses(A).map(function(x){return x.id+':'+(x.available?'on':'off')}).join(',');
console.log('§DIAG2 guidMap='+gm+' rooms='+((A._hbaRooms||[]).length)+' roomMembers='+Object.keys(A._hbaRoomMembers).length+' leaseRoomsResolved='+resolved.length+'/'+leaseRooms.length+' available=['+av+']');
// tint occupancy and count the targets the lens actually tinted — whitebox truth from the port (covers
// instanced/batched per-slot tints, not just whole-mesh emissive, which read 0 on HHS's 716 instanced groups).
HBALens.toggle(A,'occupancy');
var tintedEmissive=A.collectMeshes(function(o){return o.isMesh;}).filter(function(m){try{return m.material&&m.material.emissive&&m.material.emissive.getHex()!==0;}catch(e){return false;}}).length;
var tinted=HBALens.tintedCount();
console.log('§DIAG2 afterOccupancyToggle activeOcc='+HBALens.isActive('occupancy')+' tintedMeshes='+tinted+' (emissiveOnly='+tintedEmissive+')');
HBALens.openFamilyDrawer(A);
