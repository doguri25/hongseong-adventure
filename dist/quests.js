export const DIRECT_BONUS=50;
export const dayKey=(now=Date.now())=>new Date(now+9*3600000).toISOString().slice(0,10);
const gap=(a,b)=>Math.hypot((a[0]-b[0])*89500,(a[1]-b[1])*111320);
export function sanitizeQuests(raw,places){
 const ids=new Set(places.filter(p=>!p.remote).map(p=>p.id)),ledger=[],seen=new Set();
 for(const r of Array.isArray(raw?.questLedger)?raw.questLedger:[]){if(!/^\d{4}-\d{2}-\d{2}$/.test(r?.day)||!ids.has(r.place))continue;const key=r.day+':'+r.place;if(seen.has(key))continue;seen.add(key);ledger.push({day:r.day,place:r.place,bonus:r.bonus===DIRECT_BONUS?DIRECT_BONUS:0});}
 let daily=null;const d=raw?.dailyQuests;
 if(d&&/^\d{4}-\d{2}-\d{2}$/.test(d.day)&&Array.isArray(d.targets)){
  const targets=[...new Set(d.targets)].filter(id=>ids.has(id)).slice(0,3);
  if(targets.length)daily={day:d.day,targets,active:targets.includes(d.active)?d.active:targets[0],direct:d.direct===true,started:d.started===true};
 }
 return{questLedger:ledger,dailyQuests:daily};
}
export function ensureQuests(s,places,position,now=Date.now(),rng=Math.random,force=false){
 const day=dayKey(now);s.questLedger??=[];
 if(!force&&s.dailyQuests?.day===day)return false;
 const completed=new Set(s.questLedger.filter(r=>r.day===day).map(r=>r.place));
 let pool=places.filter(p=>!p.remote&&!completed.has(p.id)&&gap([p.lon,p.lat],position)>220);
 pool.sort((a,b)=>gap([a.lon,a.lat],position)-gap([b.lon,b.lat],position));
 // Keep the first task near the player and give every pupil a different selection.
 const near=pool.filter(p=>gap([p.lon,p.lat],position)<4500);if(near.length>=6)pool=near;else pool=pool.slice(0,24);
 const fresh=pool.filter(p=>!s.discovered.includes(p.id));if(fresh.length>=3)pool=fresh;
 const targets=[];for(let i=0;i<3&&pool.length;i++){
  const educational=pool.filter(p=>p.type!=='daily');const choices=i<2&&educational.length?educational:pool;
  const p=choices[Math.min(choices.length-1,Math.floor(rng()*choices.length))];targets.push(p.id);pool=pool.filter(q=>q.id!==p.id&&gap([p.lon,p.lat],[q.lon,q.lat])>180);
 }
 s.dailyQuests={day,targets,active:targets[0]||null,direct:true,started:true};return true;
}
export function questCompleted(s,id){return s.questLedger?.some(r=>r.day===s.dailyQuests?.day&&r.place===id)||false;}
export function activeQuest(s){const d=s.dailyQuests;return d&&d.targets.includes(d.active)&&!questCompleted(s,d.active)?d.active:null;}
export function selectQuest(s,id,alreadyNearby=false){const d=s.dailyQuests;if(!d||!d.targets.includes(id)||questCompleted(s,id))return false;if(d.active!==id){d.active=id;d.direct=!alreadyNearby;d.started=true;}return true;}
export function recordQuestVisit(s,id,physical=false){
 const d=s.dailyQuests,target=activeQuest(s);if(!d||!target)return null;
 if(id!==target){if(d.started)d.direct=false;return null;}
 // Reading a saved journal entry is not an arrival, even if it was discovered before.
 if(!physical)return null;
 const bonus=d.started&&d.direct?DIRECT_BONUS:0;s.questLedger.push({day:d.day,place:id,bonus});s.coins+=bonus;
 d.active=d.targets.find(p=>!questCompleted(s,p))||null;d.direct=true;d.started=true;return{place:id,bonus};
}
