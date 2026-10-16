const fs=require("fs"),path=require("path");
for (const f of ["engine.js","standings.js","core.js","autopilot.js","etl2.js","train2.js"]) require(require("path").join(__dirname, "..", "src", f));
const D=process.argv[2]; // dossier de CSV football-data bruts (ex. 2526_E0.csv)
const parse=(t)=>{const L=t.replace(/^﻿/,"").split(/\r?\n/).filter(Boolean);const h=L[0].split(",");return L.slice(1).map(l=>{const v=l.split(",");const o={};h.forEach((k,i)=>o[k]=v[i]);return o;});};
const num=(x)=>{const v=parseFloat(x);return Number.isFinite(v)&&v>1?v:null;};
const tri=(r,p)=>{const a=[num(r[p+"H"]),num(r[p+"D"]),num(r[p+"A"])];return a.every(Boolean)?a:null;};
const rows=[];
for(const f of fs.readdirSync(D)){const s=f.slice(0,4);for(const r of parse(fs.readFileSync(path.join(D,f),"utf8"))){if(!r.FTR)continue;
 const d=r.Date.split("/");const y=d[2].length===2?"20"+d[2]:d[2];const date=`${y}-${d[1]}-${d[0]}`;
 rows.push({date,season:s,div:f.slice(5,-4),k:{H:0,D:1,A:2}[r.FTR],ps:tri(r,"PS"),psc:tri(r,"PSC"),b365:tri(r,"B365"),bw:tri(r,"BW"),max:tri(r,"Max"),avg:tri(r,"Avg"),bfe:tri(r,"BFE")});}}
console.log("matchs",rows.length,"avec Pinnacle avant-match",rows.filter(r=>r.ps).length,"par saison",["2425","2526","2627"].map(s=>s+":"+rows.filter(r=>r.season===s&&r.ps).length+"/"+rows.filter(r=>r.season===s).length).join(" "));
const mean=a=>a.reduce((x,y)=>x+y,0)/(a.length||1);
function strat(book,ref,delta,filter){const pl=[],clv=[];let n=0;
 for(const r of rows.filter(filter)){const o=r[book],f=r[ref];if(!o||!f)continue;const p=FQ.marketProbs(f,"power");
  for(let i=0;i<3;i++){if(o[i]>12)continue;const ev=p[i]*o[i]-1;if(ev<delta)continue;n++;pl.push(r.k===i?o[i]-1:-1);if(r.psc){const pc=FQ.marketProbs(r.psc,"power");clv.push(pc[i]*o[i]-1);}}}
 const ci=FQ.T.bootRoi(pl,800);return `${book.padEnd(5)} vs ${ref} δ≥${(100*delta).toFixed(0)}% : ${String(n).padStart(4)} paris, rendement ${(100*mean(pl)).toFixed(1)} % [${ci?ci.map(x=>(100*x).toFixed(1)).join(" ; "):"—"}], EV à la clôture Pinnacle ${clv.length?(100*mean(clv)).toFixed(1)+" %":"—"}`;}
const periods={"2024-25 + 2025-26 (passé)":(r)=>r.date<"2026-07-01","2026-27 (depuis juillet)":(r)=>r.date>="2026-07-01"};
for(const [lab,f] of Object.entries(periods)){console.log("\n== "+lab);
 for(const book of ["b365","bw","max","avg"])for(const d of [0.02,0.05])console.log(strat(book,"ps",d,f));}
// marge moyenne
const mg=(b)=>mean(rows.filter(r=>r[b]).map(r=>r[b].reduce((a,x)=>a+1/x,0)-1));
console.log("\nmarges moyennes : Pinnacle",(100*mg("ps")).toFixed(1),"B365",(100*mg("b365")).toFixed(1),"BW",(100*mg("bw")).toFixed(1),"Max",(100*mg("max")).toFixed(1));
