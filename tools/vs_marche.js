process.chdir(require("path").join(__dirname, ".."));
const fs=require("fs"),z=require("zlib");
for (const f of ["engine.js","standings.js","core.js","autopilot.js","etl2.js","train2.js"]) require(require("path").join(__dirname, "..", "src", f));
const raw=JSON.parse(z.gunzipSync(fs.readFileSync("data/snapshot.json.gz")).toString("utf8"));
const M=FQ.buildMatches(FQ.ETL.build(raw),"2026-10-16");
const T=JSON.parse(fs.readFileSync("data/trained.json"));
const byId=new Map(M.map(m=>[m.id,m]));
const per={train:["2025-07-01","2026-03-01"],val:["2026-03-01","2026-07-01"],test:["2026-07-01","2026-10-16"]};
const R={};
for(const [k,[a,b]] of Object.entries(per)){R[k]=[];for(const comp of Object.keys(T.leagues))for(const r of FQ.T.predictRange(M,comp,a,b,T.leagues[comp].params||{})){
  if(!r.o||r.oIsClose)continue; const m=byId.get(r.id);
  r.pk=FQ.marketProbs(r.o,"norm"); r.pkP=FQ.marketProbs(r.o,"power"); r.pm=FQ.calib3(r.p3,T.calibration.T1N2);
  r.pc=r.c?FQ.marketProbs(r.c,"norm"):null; r.cref=m.closeRef&&m.closeRef.h?FQ.marketProbs([m.closeRef.h,m.closeRef.d,m.closeRef.a],"norm"):null;
  R[k].push(r);}}
console.log("lignes (cote d'avant-match réelle)",Object.fromEntries(Object.entries(R).map(([k,v])=>[k,v.length])));
const ll=(p,k)=>-Math.log(Math.max(1e-9,p[k]));
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
// modèle d'empilement multinomial : s_j = a_j + b·log pk_j + c·log pm_j (+ d·[j favori du marché])
function fitStack(rows,useModel,iters){let th=[0,0,0,1,0];const lr=0.05;
  const sc=(r,t)=>[0,1,2].map(j=>t[j]+t[3]*Math.log(r.pk[j])+(useModel?t[4]*Math.log(r.pm[j]):0));
  for(let it=0;it<(iters||400);it++){const g=[0,0,0,0,0];for(const r of rows){const s=sc(r,th),mx=Math.max(...s),e=s.map(x=>Math.exp(x-mx)),Z=e[0]+e[1]+e[2];
    for(let j=0;j<3;j++){const p=e[j]/Z,y=r.k===j?1:0,d=p-y;g[j]+=d;g[3]+=d*Math.log(r.pk[j]);if(useModel)g[4]+=d*Math.log(r.pm[j]);}}
    g[0]-=g[1]*0;th=th.map((x,i)=>x-lr*g[i]/rows.length);th[1]=0; }
  const pr=(r)=>{const s=sc(r,th),mx=Math.max(...s),e=s.map(x=>Math.exp(x-mx)),Z=e[0]+e[1]+e[2];return e.map(x=>x/Z);};return {th,pr};}
const rep=(name,f)=>{const out={};for(const k of ["train","val","test"]){const d=R[k].map(r=>ll(f(r),r.k)-ll(r.pk,r.k));out[k]=[mean(d),FQ.T.bootRoi(d,600)];}
  console.log(name.padEnd(46),Object.entries(out).map(([k,[m,ci]])=>`${k} ${m>=0?"+":""}${m.toFixed(4)} [${ci.map(x=>x.toFixed(4)).join(";")}]`).join("  "));};
console.log("\nÉcart de log loss face au marché (B365 avant-match, marge à parts égales) ; négatif = mieux que le marché");
rep("marché, marge « puissance »",(r)=>r.pkP);
const s0=fitStack(R.train,false); console.log("  recalibration marché θ",s0.th.map(x=>x.toFixed(3)).join(" "));
rep("E1 marché recalibré (biais favori-outsider)",s0.pr);
const s1=fitStack(R.train,true); console.log("  empilement θ",s1.th.map(x=>x.toFixed(3)).join(" "));
rep("E2 marché + modèle (empilement)",s1.pr);
rep("référence : cote de clôture B365",(r)=>r.pc||r.pk);
// E3 : le modèle annonce-t-il le mouvement de la cote entre l'avant-match et la clôture ?
for(const k of ["train","val","test"]){const xs=[],ys=[];for(const r of R[k]){const c=r.cref||r.pc;if(!c)continue;for(const j of [0,2]){xs.push(r.pm[j]-r.pk[j]);ys.push(c[j]-r.pk[j]);}}
  const mx=mean(xs),my=mean(ys);let sxy=0,sxx=0,syy=0;for(let i=0;i<xs.length;i++){sxy+=(xs[i]-mx)*(ys[i]-my);sxx+=(xs[i]-mx)**2;syy+=(ys[i]-my)**2;}
  console.log(`E3 ${k}: corrélation (modèle − marché) ↔ (clôture − avant-match) = ${(sxy/Math.sqrt(sxx*syy)).toFixed(3)}, pente ${(sxy/sxx).toFixed(3)}, n=${xs.length}`);}

