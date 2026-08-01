// §21.22 — does the walkable map route THROUGH inner rooms, or along corridors? The map has no
// corridor/room distinction, so measure the shape of the pockets a route passes through.
// Corridor-like = elongated (high aspect) and/or large. Room-like = compact.
const fs=require('fs'),path=require('path');
const initSqlJs=require(path.join(process.env.HOME,'bim-ootb','node_modules','sql.js'));
const RG=require('/tmp/wt-roompath/common/room_graph.js');
const RW=require('/tmp/wt-roompath/viewer/lib/room_walker.js');
const BLD=path.join(process.env.HOME,'bim-ootb','buildings');
const med=a=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
function shape(n){ // union bbox of the pocket's rects
 let x0=1/0,y0=1/0,x1=-1/0,y1=-1/0,area=0;
 (n.rects||[]).forEach(r=>{x0=Math.min(x0,r.x0);y0=Math.min(y0,r.y0);x1=Math.max(x1,r.x1);y1=Math.max(y1,r.y1);
   area+=Math.max(0,r.x1-r.x0)*Math.max(0,r.y1-r.y0)});
 const w=x1-x0,h=y1-y0;
 return{area,aspect:Math.max(w,h)/Math.max(0.01,Math.min(w,h)),long:Math.max(w,h)};}
(async()=>{const SQL=await initSqlJs();
for(const f of ['Clinic_extracted.db','LTU_AHouse_extracted.db']){
 const db=new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD,f))));
 const rl=console.log;console.log=()=>{};RW.walk(db,{write:true});
 const dbq=s=>{try{const r=db.exec(s);return r.length?r[0].values:[]}catch(e){return[]}};
 const g=RG.buildGraph(dbq,{log:()=>{}});console.log=rl;
 const rooms=g.nodes.filter(n=>n.kind==='room');
 const sh=rooms.map(shape);
 const areas=sh.map(s=>s.area),asp=sh.map(s=>s.aspect),lng=sh.map(s=>s.long);
 // corridor-like heuristic, stated not tuned: aspect >= 3 OR longest side >= 8m
 const corridorLike=sh.filter(s=>s.aspect>=3||s.long>=8).length;
 console.log('§INNER '+f+' pockets='+rooms.length+
   '  medianArea='+med(areas).toFixed(1)+'m²  medianAspect='+med(asp).toFixed(2)+
   '  medianLongestSide='+med(lng).toFixed(1)+'m'+
   '  corridorLike(aspect>=3 or side>=8m)='+corridorLike+'/'+rooms.length+
   ' ('+(100*corridorLike/rooms.length).toFixed(0)+'%)');
 // how big is the biggest pocket vs the median — a real corridor should dominate if it survived whole
 const sorted=areas.slice().sort((a,b)=>b-a);
 console.log('    largest pockets by area: '+sorted.slice(0,6).map(a=>a.toFixed(0)+'m²').join(', ')+
   '   median='+med(areas).toFixed(1)+'m²');
 db.close()}})();
