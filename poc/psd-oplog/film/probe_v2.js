const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/home/red1/bim-ootb-psd/poc/psd-oplog/node_modules/playwright-core');
const D='/tmp/oplogpic_film_dist';
(async()=>{
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';const f=path.join(D,u);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}const t={'.js':'text/javascript','.html':'text/html','.png':'image/png','.json':'application/json'}[path.extname(f)]||'application/octet-stream';r.writeHead(200,{'content-type':t});fs.createReadStream(f).pipe(r);}).listen(0,'127.0.0.1');
await new Promise(r=>srv.on('listening',r));
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const c=await b.newContext({viewport:{width:1920,height:1080}});const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.goto('http://127.0.0.1:'+srv.address().port+'/index.html');await p.waitForFunction(()=>window.__ed);
await p.setInputFiles('#photo','/home/red1/bim-compiler/docs/assets/images/TerminalExternal.jpeg');
await p.waitForTimeout(2500);
console.log(await p.evaluate(()=>JSON.stringify({l:__ed.layers().map(l=>[l.id,l.name]),cur:__ed.params.layer,info:info.textContent,st:status.textContent,adv:adv.checked,mv:__ed.params.maskValue})));
await p.screenshot({path:'probe/a.png'});
await p.check('#adv');await p.waitForTimeout(500);await p.screenshot({path:'probe/b.png'});
await b.close();srv.close();})();
