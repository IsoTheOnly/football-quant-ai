// Récupère les compositions ESPN (titulaires / remplaçants) des matchs 2025-26 des 5 grands championnats, avec politesse (≈3 requêtes / s)
const fs=require("fs"),z=require("zlib"),path=require("path"),cp=require("child_process");
for (const f of ["engine.js","standings.js","core.js","autopilot.js","etl2.js"]) require(require("path").join(__dirname, "..", "src", f));
const raw=JSON.parse(z.gunzipSync(fs.readFileSync(path.join(__dirname,"..","data","snapshot.json.gz"))).toString());
const M=FQ.buildMatches(FQ.ETL.build(raw),"2026-10-16");
const slug={PL:"eng.1",PD:"esp.1",SA:"ita.1",BL1:"ger.1",FL1:"fra.1"};
const out=process.argv[2]; // fichier JSON de sortie (repris s il existe)const have=fs.existsSync(out)?JSON.parse(fs.readFileSync(out)):{};
const list=M.filter(m=>slug[m.comp]&&m.eid&&m.hg!==null&&m.date>="2025-08-01"&&m.date<"2026-10-16"&&!have[m.eid]);
console.log("à récupérer",list.length,"déjà",Object.keys(have).length);
let n=0;
for(const m of list){
  try{const body=cp.execFileSync("curl",["-sS","-m","15",`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug[m.comp]}/summary?event=${m.eid}`],{maxBuffer:64e6}).toString();
    const d=JSON.parse(body);const r={};
    for(const t of d.rosters||[]){const side=t.homeAway==="home"?"h":t.homeAway==="away"?"a":null;if(!side)continue;r[side]={team:t.team&&t.team.displayName,st:(t.roster||[]).filter(p=>p.starter).map(p=>p.athlete&&p.athlete.displayName),sub:(t.roster||[]).filter(p=>!p.starter).map(p=>p.athlete&&p.athlete.displayName)};}
    have[m.eid]={id:m.id,comp:m.comp,date:m.date,home:m.home,away:m.away,r};
  }catch(e){have[m.eid]={err:String(e.message).slice(0,80)};}
  if(++n%50===0){fs.writeFileSync(out,JSON.stringify(have));console.log(n);}
  cp.execFileSync("sleep",["0.2"]);
}
fs.writeFileSync(out,JSON.stringify(have));console.log("fini",Object.keys(have).length);
