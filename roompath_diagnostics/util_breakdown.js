const fs=require('fs'),path=require('path');
const initSqlJs=require(path.join(process.env.HOME,'bim-ootb','node_modules','sql.js'));
const RG=require('/tmp/wt-roompath/common/room_graph.js');
const RW=require('/tmp/wt-roompath/viewer/lib/room_walker.js');
const BLD=path.join(process.env.HOME,'bim-ootb','buildings');
(async()=>{const SQL=await initSqlJs();
for(const f of ['Clinic_extracted.db','LTU_AHouse_extracted.db']){
  const db=new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD,f))));
  const rl=console.log;console.log=()=>{};RW.walk(db,{write:true});
  const g=RG.buildGraph(s=>{try{const r=db.exec(s);return r.length?r[0].values:[]}catch(e){return[]}},{log:()=>{}});
  console.log=rl;
  const rooms=g.nodes.filter(n=>n.kind==='room');
  const why={};let u=0;
  rooms.forEach(n=>{if(n.isUtility){u++;const w=JSON.stringify(n.utilityWhy);why[w]=(why[w]||0)+1;}});
  console.log('§UTIL '+f+' rooms='+rooms.length+' utility='+u+' ('+(100*u/rooms.length).toFixed(1)+'%)');
  Object.entries(why).sort((a,b)=>b[1]-a[1]).slice(0,6).forEach(([w,c])=>console.log('   '+c+' x '+w.slice(0,160)));
  db.close();
}})();
