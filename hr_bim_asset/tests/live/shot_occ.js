var A = window.APP, T = window.THREE;
function frame(mult, ox, oy, oz){
  var box = new T.Box3();
  A.collectMeshes(function(o){return o.isMesh;}).forEach(function(m){ try{ if(m.geometry){ box.expandByObject(m);} }catch(e){} });
  if (box.isEmpty()) { console.log('§SHOT box empty'); return; }
  var c = box.getCenter(new T.Vector3()), s = box.getSize(new T.Vector3());
  var d = Math.max(s.x,s.y,s.z) * mult;
  A.camera.position.set(c.x + d*ox, c.y + d*oy, c.z + d*oz);
  A.camera.lookAt(c);
  if (A.controls && A.controls.target) A.controls.target.copy(c);
  if (A.camera.updateProjectionMatrix) A.camera.updateProjectionMatrix();
  if (A.controls && A.controls.update) A.controls.update();
  if (A.markDirty) A.markDirty();
  console.log('§SHOT framed center='+c.x.toFixed(1)+','+c.y.toFixed(1)+','+c.z.toFixed(1)+' size='+s.x.toFixed(1)+','+s.y.toFixed(1)+','+s.z.toFixed(1));
}
frame(0.82, 0.62, 0.5, 0.62);
HBALens.toggle(A,'occupancy');
HBALens.openFamilyDrawer(A);
