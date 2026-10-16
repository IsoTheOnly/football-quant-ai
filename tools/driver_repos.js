// Étude du driver « repos / congestion » : β appris sur l apprentissage, gardé seulement si la validation s améliore (IC bootstrap). Usage : node tools/driver_repos.js
process.chdir(require("path").join(__dirname, ".."));
const fs=require("fs"),z=require("zlib");
for (const f of ["engine.js","standings.js","core.js","autopilot.js","etl2.js","train2.js"]) require(require("path").join(__dirname, "..", "src", f));
const raw=JSON.parse(z.gunzipSync(fs.readFileSync("data/snapshot.json.gz")).toString("utf8"));
const M=FQ.buildMatches(FQ.ETL.build(raw),"2026-10-16");
const T=JSON.parse(fs.readFileSync("data/trained.json"));
const U=FQ.util;
// calendrier par équipe (toutes compétitions présentes dans nos données)
const byTeam={};for(const m of M){ if(m.hg===null)continue; for(const t of [m.home,m.away])(byTeam[t]=byTeam[t]||[]).push(m.date);} for(const k in byTeam)byTeam[k].sort();
const lastBefore=(t,d)=>{const a=byTeam[t]||[];let lo=null;for(const x of a){if(x<d)lo=x;else break;}return lo;};
const nWithin=(t,d,k)=>{const a=byTeam[t]||[];const from=U.addDays(d,-k);return a.filter(x=>x>=from&&x<d).length;};
const per={train:["2025-07-01","2026-03-01"],val:["2026-03-01","2026-07-01"],test:["2026-07-01","2026-10-16"]};
const R={};
for(const [lab,[a,b]] of Object.entries(per)){R[lab]=[];for(const comp of Object.keys(T.leagues))for(const r of FQ.T.predictRange(M,comp,a,b,T.leagues[comp].params||{})){
  const lh=lastBefore(r.home,r.date),la=lastBefore(r.away,r.date); if(!lh||!la)continue;
  const o=r.o||r.c; r.rH=U.daysBetween(lh,r.date); r.rA=U.daysBetween(la,r.date); r.cH=nWithin(r.home,r.date,21); r.cA=nWithin(r.away,r.date,21);
  r.pk=o?FQ.marketProbs(o,T.blend.devig):null; R[lab].push(r);} }
const cl=(x,a,b)=>Math.max(a,Math.min(b,x));
const feats={ repos:(r)=>cl(r.rH,2,8)-cl(r.rA,2,8), court:(r)=>(r.rA<=3?1:0)-(r.rH<=3?1:0), congestion:(r)=>r.cA-r.cH };
const ll=(p,k)=>-Math.log(Math.max(1e-9,p[k]));
const probsModel=(r,f,b)=>{const e=Math.exp(b*f(r));const mk=FQ.marketsFromMatrix(FQ.scoreMatrix(r.lh*e,r.la/e,r.rho||0,10));return FQ.calib3([mk.p1,mk.pN,mk.p2],T.calibration.T1N2);};
// marché + driver : logit additif sur domicile/extérieur
const probsMkt=(r,f,b)=>{const x=b*f(r);const q=[r.pk[0]*Math.exp(x),r.pk[1],r.pk[2]*Math.exp(-x)];const s=q[0]+q[1]+q[2];return q.map(v=>v/s);};
const mean=(a)=>a.reduce((x,y)=>x+y,0)/a.length;
console.log("n",Object.fromEntries(Object.entries(R).map(([k,v])=>[k,v.length])), "repos médian", R.train.map(r=>r.rH).sort((a,b)=>a-b)[R.train.length>>1]);
for(const [fn,f] of Object.entries(feats)){
  for(const [kind,P,rows0] of [["modèle",probsModel,(x)=>x],["marché",probsMkt,(x)=>x.filter(r=>r.pk)]]){
    const tr=rows0(R.train),va=rows0(R.val),te=rows0(R.test);
    let best=0,bl=Infinity;for(let b=-0.1;b<=0.1001;b+=0.01){const l=mean(tr.map(r=>ll(P(r,f,b),r.k)));if(l<bl){bl=l;best=Math.round(b*100)/100;}}
    const d=(rows,b)=>rows.map(r=>ll(P(r,f,b),r.k)-ll(P(r,f,0),r.k));
    const dv=d(va,best),dt=d(te,best);
    console.log(fn.padEnd(11),kind.padEnd(7),"β",best,"| validation Δ",mean(dv).toFixed(5),"IC",JSON.stringify(FQ.T.bootRoi(dv,1000).map(x=>+x.toFixed(5))),"| test Δ",mean(dt).toFixed(5));
  }
}
