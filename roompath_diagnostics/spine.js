// §21.23 — FEASIBILITY of the user's 2-layer design (corridor spine + rooms as leaves):
//   Q1 which pockets are corridor-like, and do they form ONE connected spine or islands?
//   Q2 what fraction of rooms have a door onto a corridor (i.e. can attach as a leaf)?
//   Q3 how many room pairs are DIRECTLY door-joined with no corridor between (the design's real cost)?
const fs=require('fs'),path=require('path');
const initSqlJs=require(path.join(process.env.HOME,'bim-ootb','node_modules','sql.js'));
const RG=require('/tmp/wt-roompath/common/room_graph.js');
const RW=require('/tmp/wt-roompath/viewer/lib/room_walker.js');
const BLD=path.join(process.env.HOME,'bim-ootb','buildings');
function shape(n){let x0=1/0,y0=1/0,x1=-1/0,y1=-1/0,area=0;
 (n.rects||[]).forEach(r=>{x0=Math.min(x0,r.x0);y0=Math.min(y0,r.y0);x1=Math.max(x1,r.x1);y1=Math.max(y1,r.y1);
  area+=Math.max(0,r.x1-r.x0)*Math.max(0,r.y1-r.y0)});
 const w=x1-x0,h=y1-y0;return{area,aspect:Math.max(w,h)/Math.max(.01,Math.min(w,h)),long:Math.max(w,h)}}
const touch=(a,b,t)=>(a.rects||[]).some(p=>(b.rects||[]).some(q=>
  p.x1>=q.x0-t&&p.x0<=q.x1+t&&p.y1>=q.y0-t&&p.y0<=q.y1+t));
(async()=>{const SQL=await initSqlJs();
for(const f of ['Clinic_extracted.db','LTU_AHouse_extracted.db']){
 const db=new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD,f))));
 const rl=console.log;console.log=()=>{};RW.walk(db,{write:true});
 const dbq=s=>{try{const r=db.exec(s);return r.length?r[0].values:[]}catch(e){return[]}};
 const g=RG.buildGraph(dbq,{log:()=>{}});const anch=RW.storeyZAnchors(db);const doorsBy=RW.storeyDoors(db,anch);console.log=rl;
 const rooms=g.nodes.filter(n=>n.kind==='room');
 // corridor-like: stated rule, not tuned — elongated OR long OR much larger than the median pocket
 const areas=rooms.map(r=>shape(r).area).sort((a,b)=>a-b);
 const medA=areas[Math.floor(areas.length/2)];
 const isCor=r=>{const s=shape(r);return s.aspect>=3||s.long>=8||s.area>=4*medA};
 const cors=rooms.filter(isCor), others=rooms.filter(r=>!isCor(r));
 // Q1 connectivity of the corridor set, by storey, pockets touching within 0.5m
 const comp={};let cid=0,sizes=[];
 cors.forEach(a=>{if(comp[a.guid]!==undefined)return;cid++;const st=[a];comp[a.guid]=cid;let sz=0;
  while(st.length){const u=st.pop();sz++;cors.forEach(v=>{if(comp[v.guid]===undefined&&v.storey===u.storey&&touch(u,v,0.5)){comp[v.guid]=cid;st.push(v)}})}
  sizes.push(sz)});
 sizes.sort((a,b)=>b-a);
 // Q2 rooms with a door touching a corridor pocket
 const dlist=[];Object.keys(doorsBy).forEach(st=>(doorsBy[st]||[]).forEach(d=>dlist.push({st,
   box:{x0:d[0]-d[2]/2,x1:d[0]+d[2]/2,y0:d[1]-d[3]/2,y1:d[1]+d[3]/2}})));
 const hits=(r,d,t)=>r.storey===d.st&&(r.rects||[]).some(rc=>
   d.box.x1>=rc.x0-t&&d.box.x0<=rc.x1+t&&d.box.y1>=rc.y0-t&&d.box.y0<=rc.y1+t);
 let attach=0;
 others.forEach(r=>{if(dlist.some(d=>hits(r,d,0.4)&&cors.some(c=>hits(c,d,0.4))))attach++});
 // Q3 room pairs sharing a door with NO corridor on that door
 let direct=0;
 dlist.forEach(d=>{const rs=others.filter(r=>hits(r,d,0.4));const cs=cors.filter(c=>hits(c,d,0.4));
   if(rs.length>=2&&cs.length===0)direct++});
 console.log('§SPINE '+f);
 console.log('   Q1 corridorLike='+cors.length+'/'+rooms.length+
   '  connectedComponents='+sizes.length+'  largest='+(sizes[0]||0)+' pockets'+
   '  ('+(100*(sizes[0]||0)/Math.max(1,cors.length)).toFixed(0)+'% of corridors in the biggest)'+
   '  sizes='+sizes.slice(0,8).join(','));
 console.log('   Q2 non-corridor rooms with a door onto a corridor = '+attach+'/'+others.length+
   ' ('+(100*attach/Math.max(1,others.length)).toFixed(0)+'%)  ← these attach as leaves');
 console.log('   Q3 doors joining 2+ rooms with NO corridor = '+direct+'/'+dlist.length+
   '  ← the room-to-room links the 2-layer design would force out to the corridor');
 db.close()}})();
