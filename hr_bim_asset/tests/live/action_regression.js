var A = window.APP; var errs = [];
window.addEventListener('error', function(e){ errs.push(e.message); });
function kids(){ return A.scene.children.length; }
var base = kids();
// P6 avatars: presence ON → OFF, assert zero residue
HBALens.toggle(A,'presence'); var withAv = kids(); var mounted = HBAAvatars.count();
HBALens.toggle(A,'presence'); var afterAv = kids(); var afterCount = HBAAvatars.count();
var groupGone = !A.scene.getObjectByName('__hbaAvatars');
console.log('§REG avatars base='+base+' withAv='+withAv+' after='+afterAv+' mounted='+mounted+' afterCount='+afterCount+' groupGone='+groupGone+' residue='+(afterAv!==base));
// P1 occupancy: ON → OFF
HBALens.toggle(A,'occupancy'); var tOn = HBALens.tintedCount();
HBALens.toggle(A,'occupancy'); var tOff = HBALens.tintedCount();
console.log('§REG occupancy tintedOn='+tOn+' tintedOff='+tOff+' kidsBackToBase='+(kids()===base));
// switch presence→occupancy (avatars must clear when switching)
HBALens.toggle(A,'presence'); HBALens.toggle(A,'occupancy'); var switchGroup = !A.scene.getObjectByName('__hbaAvatars'); var switchAv = HBAAvatars.count();
HBALens.toggle(A,'occupancy');
console.log('§REG switch presence→occupancy avatarsCleared='+(switchGroup && switchAv===0));
// core panes/features intact?
console.log('§REG intact HBALens='+!!window.HBALens+' DashPane='+!!window.HBADashPane+' Avatars='+!!window.HBAAvatars+' dbQuery='+(typeof A.dbQuery)+' collectMeshes='+(typeof A.collectMeshes)+' camera='+!!A.camera+' controls='+!!A.controls+' pills='+((window.APP._mainPillActions||[]).length));
console.log('§REG jsErrors='+errs.length+(errs.length?' ['+errs.slice(0,3).join(' | ')+']':''));
