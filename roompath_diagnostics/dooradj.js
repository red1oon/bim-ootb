// §21.21 — how many pockets does each door claim to join? A real door joins 2 (or 1 if external).
// Anything higher is a false adjacency from the 0.4m tolerance in the door->pocket test, and every
// false adjacency is a SHORTCUT the door graph will happily route through.
const fs=require('fs'),path=require('path');
const initSqlJs=require(path.join(process.env.HOME,'bim-ootb','node_modules','sql.js'));
const RG=require('/tmp/wt-roompath/common/room_graph.js');
const RW=require('/tmp/wt-roompath/viewer/lib/room_walker.js');
const BLD=path.join(process.env.HOME,'bim-ootb','buildings');
(async()=>{const SQL=await initSqlJs();
for(const f of ['Clinic_extracted.db','LTU_AHouse_extracted.db']){
 const db=new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD,f))));
 const rl=console.log;console.log=()=>{};RW.walk(db,{write:true});
 const dbq=s=>{try{const r=db.exec(s);return r.length?r[0].values:[]}catch(e){return[]}};
 const g=RG.buildGraph(dbq,{log:()=>{}});const anch=RW.storeyZAnchors(db);const doorsBy=RW.storeyDoors(db,anch);console.log=rl;
 const rooms=g.nodes.filter(n=>n.kind==='room');
 for(const TOL of [0.4,0.2,0.0]){
   const cnt={};let tot=0,over=0;
   Object.keys(doorsBy).forEach(st=>{(doorsBy[st]||[]).forEach((d,i)=>{
     const box={x0:d[0]-d[2]/2,x1:d[0]+d[2]/2,y0:d[1]-d[3]/2,y1:d[1]+d[3]/2};
     const nR=rooms.filter(r=>r.storey===st&&(r.rects||[]).some(rc=>
       box.x1>=rc.x0-TOL&&box.x0<=rc.x1+TOL&&box.y1>=rc.y0-TOL&&box.y0<=rc.y1+TOL)).length;
     cnt[nR]=(cnt[nR]||0)+1;tot++;if(nR>2)over++})});
   console.log('§DOORADJ '+f+' tol='+TOL.toFixed(1)+'m  '+
     Object.keys(cnt).sort((a,b)=>a-b).map(k=>k+' rooms ×'+cnt[k]).join('  ')+
     '   →  joins>2: '+over+'/'+tot+' ('+(100*over/tot).toFixed(0)+'%)');
 }
 db.close()}})();
