var A = window.APP;
HBALens.toggle(A, 'presence');
console.log('§AV presenceActive=' + HBALens.isActive('presence') + ' avatarsActive=' + HBAAvatars.isActive() + ' count=' + HBAAvatars.count());
// zoom the camera to the first avatar to exercise the LOD ladder (→ full) + proximity tip for the screenshot
var g = A.scene.getObjectByName('__hbaAvatars');
if (g && g.children.length) {
  var p = g.children[0].position;
  A.camera.position.set(p.x + 5, p.y + 3, p.z + 5);
  if (A.controls && A.controls.target) { A.controls.target.set(p.x, p.y, p.z); }
  A.camera.lookAt(p.x, p.y, p.z);
  if (A.camera.updateProjectionMatrix) A.camera.updateProjectionMatrix();
  if (A.controls && A.controls.update) A.controls.update();
  if (A.controls && A.controls.dispatchEvent) A.controls.dispatchEvent({ type: 'change' });
  if (A.markDirty) A.markDirty();
  console.log('§AV zoomedTo avatar0 zone=' + g.children[0].userData.hbaAvatar.zone + ' tier(after)=' + (g.children[0].material.map === undefined ? '?' : 'set'));
}
