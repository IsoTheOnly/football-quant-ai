const fs=require("fs"),path=require("path");
for (const f of ["engine.js","standings.js","core.js","autopilot.js","etl2.js","train2.js"]) require(require("path").join(__dirname, "..", "src", f));
// usage : node tools/blessures.js <dossier CSV football-data 2425_*.csv> <dossier réponses API-Football inj_<ligue>.json (saison 2024)>
const D=process.argv[2],J=process.argv[3];
const parse=(t)=>{const L=t.replace(/^﻿/,"").split(/\r?\n/).filter(Boolean);const h=L[0].split(",");return L.slice(1).map(l=>{const v=l.split(",");const o={};h.forEach((k,i)=>o[k]=v[i]);return o;});};
const num=(x)=>{const v=parseFloat(x);return Number.isFinite(v)&&v>1?v:null;};
const map={39:"E0",40:"E1",140:"SP1",135:"I1",78:"D1",61:"F1",88:"N1"};
const norm=(s)=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\b(fc|afc|cf|sc|ac|as|ss|us|rc|ogc|stade|sporting|club|de|the|1\.)\b/g," ").replace(/[^a-z0-9]+/g," ").trim();
const sim=(a,b)=>{a=norm(a);b=norm(b);if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return 0.9;const A=new Set(a.split(" ")),B=b.split(" ");const k=B.filter(x=>A.has(x)&&x.length>2).length;return k?0.6+0.1*k:0;};
const rows=[];let joined=0,tot=0;
for(const [lid,div] of Object.entries(map)){
  const ms=parse(fs.readFileSync(path.join(D,`2425_${div}.csv`),"utf8")).filter(r=>r.FTR).map(r=>{const d=r.Date.split("/");const y=d[2].length===2?"20"+d[2]:d[2];return {date:`${y}-${d[1]}-${d[0]}`,h:r.HomeTeam,a:r.AwayTeam,k:{H:0,D:1,A:2}[r.FTR],o:[num(r.B365H),num(r.B365D),num(r.B365A)],hg:+r.FTHG,ag:+r.FTAG,injH:0,injA:0,qH:0,qA:0,hasInj:false};});
  const inj=JSON.parse(fs.readFileSync(path.join(J,`inj_${lid}.json`),"utf8")).response;
  const byFx={};for(const x of inj){(byFx[x.fixture.id]=byFx[x.fixture.id]||[]).push(x);}
  for(const [fx,list] of Object.entries(byFx)){tot++;const date=list[0].fixture.date.slice(0,10);
    const cand=ms.filter(m=>Math.abs(Date.parse(m.date)-Date.parse(date))<=864e5);const teams=[...new Set(list.map(x=>x.team.name))];
    let best=null,bs=0;for(const m of cand){const s=Math.max(...teams.map(t=>Math.max(sim(t,m.h),sim(t,m.a))));if(s>bs){bs=s;best=m;}}
    if(!best||bs<0.6)continue;joined++;best.hasInj=true;
    for(const x of list){const home=sim(x.team.name,best.h)>=sim(x.team.name,best.a);const miss=x.player.type==="Missing Fixture";
      if(home){if(miss)best.injH++;else best.qH++;}else{if(miss)best.injA++;else best.qA++;}}}
  for(const m of ms)if(m.o.every(Boolean))rows.push(Object.assign(m,{pk:FQ.marketProbs(m.o,"norm")}));
}
console.log("fixtures blessures",tot,"rattachées",joined,"matchs",rows.length,"avec info",rows.filter(r=>r.hasInj).length,"absents moyens par équipe",(rows.reduce((a,r)=>a+r.injH+r.injA,0)/(2*rows.length)).toFixed(2));
const tr=rows.filter(r=>r.date<"2025-02-01"),va=rows.filter(r=>r.date>="2025-02-01");
const ll=(p,k)=>-Math.log(Math.max(1e-9,p[k]));const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
// marché + absences : logit domicile/extérieur décalé de c·(absents extérieur − absents domicile)
const P=(r,c,q)=>{const x=c*(r.injA-r.injH)+q*(r.qA-r.qH);const v=[r.pk[0]*Math.exp(x),r.pk[1],r.pk[2]*Math.exp(-x)];const s=v[0]+v[1]+v[2];return v.map(y=>y/s);};
let best={l:1e9};for(let c=-0.06;c<=0.0601;c+=0.005)for(let q=-0.04;q<=0.0401;q+=0.01){const l=mean(tr.map(r=>ll(P(r,c,q),r.k)));if(l<best.l)best={l,c,q};}
const dv=va.map(r=>ll(P(r,best.c,best.q),r.k)-ll(r.pk,r.k));
console.log("marché + absences : c",best.c.toFixed(3),"q",best.q.toFixed(3),"| validation écart",mean(dv).toFixed(5),"IC",FQ.T.bootRoi(dv,800).map(x=>x.toFixed(5)).join(" à "));
// les absences expliquent-elles quelque chose sans le marché ? (régression simple sur les fréquences)
const base=(r)=>[0.45,0.27,0.28];
let b2={l:1e9};for(let c=-0.1;c<=0.1001;c+=0.01){const l=mean(tr.map(r=>{const x=c*(r.injA-r.injH);const v=[0.45*Math.exp(x),0.27,0.28*Math.exp(-x)];const s=v[0]+v[1]+v[2];return ll(v.map(y=>y/s),r.k);}));if(l<b2.l)b2={l,c};}
console.log("sans le marché : coefficient appris",b2.c.toFixed(2),"(positif = l'équipe privée de joueurs perd plus souvent)");
// pondération par l'importance : part des buts de l'équipe marqués par les absents (buteurs ESPN avant la date)
const z=require("zlib");
const raw=JSON.parse(z.gunzipSync(fs.readFileSync(path.join(__dirname,"..","data","snapshot.json.gz"))).toString("utf8"));
const M=FQ.buildMatches(FQ.ETL.build(raw),"2026-10-16");
const compOf={E0:"PL",E1:"ELC",SP1:"PD",I1:"SA",D1:"BL1",F1:"FL1",N1:"DED"};
const withGoals=M.filter(m=>m.goals&&m.goals.length&&m.date>="2024-07-01"&&m.date<"2025-07-01").length;
console.log("matchs 2024-25 avec buteurs connus",withGoals);
const last=(s)=>norm(s).split(" ").slice(-1)[0];
const shareCache={};
function shares(comp,teamFd,date){const k=comp+teamFd+date.slice(0,7);if(shareCache[k])return shareCache[k];
  let best=null,bs=0;for(const t of new Set(M.filter(m=>m.comp===comp).flatMap(m=>[m.home,m.away]))){const s=sim(t,teamFd);if(s>bs){bs=s;best=t;}}
  const cnt={};let tot=0;for(const m of M){if(m.comp!==comp||m.date>=date||m.date<"2024-07-01"||!m.goals)continue;const side=m.home===best?0:m.away===best?1:-1;if(side<0)continue;for(const g of m.goals){if(g[0]!==side||g[3]==="og")continue;tot++;const n=last(g[1]);cnt[n]=(cnt[n]||0)+1;}}
  return shareCache[k]={cnt,tot};}
// recalcul : impact = Σ part de buts des absents « Missing Fixture »
for(const [lid,div] of Object.entries(map)){const comp=compOf[div];
  const inj=JSON.parse(fs.readFileSync(path.join(J,`inj_${lid}.json`),"utf8")).response;
  const byFx={};for(const x of inj)(byFx[x.fixture.id]=byFx[x.fixture.id]||[]).push(x);
  for(const list of Object.values(byFx)){const date=list[0].fixture.date.slice(0,10);
    const r=rows.find(m=>Math.abs(Date.parse(m.date)-Date.parse(date))<=864e5&&list.some(x=>sim(x.team.name,m.h)>=0.6||sim(x.team.name,m.a)>=0.6));if(!r)continue;
    r.impH=r.impH||0;r.impA=r.impA||0;
    for(const x of list){if(x.player.type!=="Missing Fixture")continue;const home=sim(x.team.name,r.h)>=sim(x.team.name,r.a);const S=shares(comp,home?r.h:r.a,r.date);if(!S.tot)continue;const sh=(S.cnt[last(x.player.name)]||0)/S.tot;if(home)r.impH+=sh;else r.impA+=sh;}}}
const P2=(r,c)=>{const x=c*((r.impA||0)-(r.impH||0));const v=[r.pk[0]*Math.exp(x),r.pk[1],r.pk[2]*Math.exp(-x)];const s=v[0]+v[1]+v[2];return v.map(y=>y/s);};
console.log("impact moyen (part des buts absente)",(rows.reduce((a,r)=>a+(r.impH||0)+(r.impA||0),0)/(2*rows.length)).toFixed(3));
let b3={l:1e9};for(let c=-1;c<=1.0001;c+=0.05){const l=mean(tr.map(r=>ll(P2(r,c),r.k)));if(l<b3.l)b3={l,c};}
const dv3=va.map(r=>ll(P2(r,b3.c),r.k)-ll(r.pk,r.k));
console.log("marché + absents pondérés : c",b3.c.toFixed(2),"| validation écart",mean(dv3).toFixed(5),"IC",FQ.T.bootRoi(dv3,800).map(x=>x.toFixed(5)).join(" à "));
let b4={l:1e9};for(let c=-2;c<=2.0001;c+=0.1){const l=mean(tr.map(r=>{const x=c*((r.impA||0)-(r.impH||0));const v=[0.45*Math.exp(x),0.27,0.28*Math.exp(-x)];const s=v[0]+v[1]+v[2];return ll(v.map(y=>y/s),r.k);}));if(l<b4.l)b4={l,c};}
console.log("sans le marché : coefficient",b4.c.toFixed(2));
