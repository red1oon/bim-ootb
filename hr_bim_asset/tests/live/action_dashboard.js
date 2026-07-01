var A = window.APP;
if (window.HBADashPane && HBADashPane.toggle) HBADashPane.toggle(A);
var pane = document.getElementById('hba-dash-pane') || document.querySelector('[id*="dash"]');
console.log('§DASH active='+(window.HBADashPane&&HBADashPane.isActive&&HBADashPane.isActive())+' chartLib='+(!!window.Chart)+' paneInDom='+!!pane);
