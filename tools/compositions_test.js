// Les compositions officielles battent-elles les cotes d'avant-match ? (titulaires habituels absents, pondérés par leur part des buts)
const fs=require("fs"),z=require("zlib"),path=require("path");
for (const f of ["engine.js","standings.js","core.js","autopilot.js","etl2.js","train2.js"]) require(require("path").join(__dirname, "..", "src", f));
const raw=JSON.parse(z.gunzipSync(fs.readFileSync(path.join(__dirname,"..","data","snapshot.json.gz"))).toString());
const M=FQ.buildMatches(FQ.ETL.build(raw),"2026-10-16");const byId=new Map(M.map(m=>[m.id,m]));
const L=JSON.parse(fs.readFileSync(process.argv[2]));
const games=Object.values(L).filter(x=>x.r&&x.r.h&&x.r.a&&x.r.h.st.length>=11&&x.r.a.st.length>=11).sort((a,b)=>a.date<b.date?-1:1);
console.log("matchs avec compositions",games.length);
const hist={};// équipe → liste des XI précédents
const rows=[];
for(const g of games){const m=byId.get(g.id);if(!m)continue;
  const feat={};
  for(const [side,team] of [["h",g.home],["a",g.away]]){const H=(hist[g.comp+team]||[]).slice(-5);
    const cnt={};for(const xi of H)for(const p of xi)cnt[p]=(cnt[p]||0)+1;
    const regulars=Object.keys(cnt).filter(p=>cnt[p]>=3);
    const sc=FQ.teamScorers(M,g.comp,team,g.date,m.season);const goals={};for(const x of sc.list||[])goals[x.name]=x.goals;
    const st=new Set(g.r[side].st);const missing=H.length>=3?regulars.filter(p=>!st.has(p)):[];
    feat[side]={n:missing.length,imp:sc.teamGoals?missing.reduce((a,p)=>a+(goals[p]||0),0)/sc.teamGoals:0,ok:H.length>=3};
    (hist[g.comp+team]=hist[g.comp+team]||[]).push(g.r[side].st);}
  if(!feat.h.ok||!feat.a.ok)continue;
  const pre=m.odds&&!m.oddsIsClose?[m.odds.h,m.odds.d,m.odds.a]:null, cl=m.closeRef&&m.closeRef.h?[m.closeRef.h,m.closeRef.d,m.closeRef.a]:(m.close&&m.close.h?[m.close.h,m.close.d,m.close.a]:null);
  if(!pre)continue;
  rows.push({date:g.date,k:m.hg>m.ag?0:m.hg===m.ag?1:2,pk:FQ.marketProbs(pre,"norm"),pc:cl?FQ.marketProbs(cl,"norm"):null,f:feat});}
const per=(d)=>d<"2026-02-01"?"train":d<"2026-07-01"?"val":"test";
const R={train:[],val:[],test:[]};for(const r of rows)R[per(r.date)].push(r);
console.log("lignes",Object.fromEntries(Object.entries(R).map(([k,v])=>[k,v.length])),"titulaires habituels absents en moyenne",(rows.reduce((a,r)=>a+r.f.h.n+r.f.a.n,0)/(2*rows.length)).toFixed(2));
const ll=(p,k)=>-Math.log(Math.max(1e-9,p[k]));const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const adj=(p,x)=>{const v=[p[0]*Math.exp(x),p[1],p[2]*Math.exp(-x)];const s=v[0]+v[1]+v[2];return v.map(y=>y/s);};
const X=(r,c,d)=>c*(r.f.a.imp-r.f.h.imp)+d*(r.f.a.n-r.f.h.n);
for(const [lab,key] of [["cote d'avant-match (avant les compositions)","pk"],["cote de clôture (après les compositions)","pc"]]){
  const tr=R.train.filter(r=>r[key]),va=R.val.filter(r=>r[key]),te=R.test.filter(r=>r[key]);
  let b={l:1e9};for(let c=-1.5;c<=1.5001;c+=0.05)for(let d=-0.06;d<=0.0601;d+=0.01){const l=mean(tr.map(r=>ll(adj(r[key],X(r,c,d)),r.k)));if(l<b.l)b={l,c,d};}
  const dv=va.map(r=>ll(adj(r[key],X(r,b.c,b.d)),r.k)-ll(r[key],r.k)),dt=te.map(r=>ll(adj(r[key],X(r,b.c,b.d)),r.k)-ll(r[key],r.k));
  console.log(`${lab} : c ${b.c.toFixed(2)} d ${b.d.toFixed(2)} | validation (${va.length}) ${mean(dv).toFixed(5)} IC ${FQ.T.bootRoi(dv,800).map(x=>x.toFixed(5)).join(" à ")} | test (${te.length}) ${te.length?mean(dt).toFixed(5):"—"}`);}
