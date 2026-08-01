const fs=require('fs'),path=require('path');
const initSqlJs=require(path.join(process.env.HOME,'bim-ootb','node_modules','sql.js'));
const RW=require('/tmp/wt-roompath/viewer/lib/room_walker.js');
const BLD=path.join(process.env.HOME,'bim-ootb','buildings');
const quiet=fn=>{const rl=console.log;console.log=()=>{};try{return fn()}finally{console.log=rl}};
(async()=>{const SQL=await initSqlJs();
for(const f of ['Clinic_extracted.db','LTU_AHouse_extracted.db']){
 const db=new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD,f))));
 quiet(()=>RW.walk(db,{write:true}));
 const rel=quiet(()=>RW.doorRoomAdjacency(db,{experiment:true}));
 const reached=new Set(),storeyOf={};
 Object.keys(rel.expAdj).forEach(st=>{const e=rel.expAdj[st];
   e.kept.forEach(g=>storeyOf[g]=st);e.dropped.forEach(g=>storeyOf[g]=st);
   e.doors.forEach(d=>d.ids.forEach(g=>{if(g.startsWith('DROP_'))reached.add(g)}))});
 const links=[];
 Object.keys(rel.expAdj).forEach(st=>{const e=rel.expAdj[st];const ok=g=>!g.startsWith('DROP_')||reached.has(g);
   e.doors.forEach(d=>{if(d.ids.length===2&&d.ids.every(ok))links.push(d.ids.slice())});
   e.open.forEach(pr=>{if(pr.every(ok))links.push(pr.slice())})});
 const nodes=Object.keys(storeyOf).filter(g=>!g.startsWith('DROP_')||reached.has(g));
 const adj={};nodes.forEach(n=>adj[n]=[]);
 links.forEach(([a,b])=>{if(adj[a]&&adj[b]){adj[a].push(b);adj[b].push(a)}});
 const byS={};nodes.forEach(g=>(byS[storeyOf[g]]=byS[storeyOf[g]]||[]).push(g));
 console.log('=== '+f+'  storeys='+Object.keys(byS).length);
 Object.keys(byS).sort((a,b)=>byS[b].length-byS[a].length).slice(0,8).forEach(st=>{
   const ids=byS[st],set=new Set(ids),seen=new Set(),sizes=[];
   ids.forEach(s=>{if(seen.has(s))return;const stk=[s];seen.add(s);let n=0;
     while(stk.length){const v=stk.pop();n++;(adj[v]||[]).forEach(w=>{if(set.has(w)&&!seen.has(w)){seen.add(w);stk.push(w)}})}
     sizes.push(n)});
   sizes.sort((a,b)=>b-a);
   console.log('   '+st.padEnd(28)+' rooms='+String(ids.length).padStart(4)+
     '  components='+String(sizes.length).padStart(3)+'  largest='+String(sizes[0]).padStart(4)+
     ' ('+(100*sizes[0]/ids.length).toFixed(0)+'%)  next='+sizes.slice(1,5).join(','));
 });
 db.close()}})();
