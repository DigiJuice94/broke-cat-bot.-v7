import {config} from './config.mjs';

const queue=new Map();
const now=()=>Date.now();
const intervalMs=()=>Math.max(60,config.revisitScoreIntervalSeconds)*1000;
const maxAgeMs=()=>Math.max(5,config.revisitScoreMaxMinutes)*60_000;

function prune(){
  const t=now();
  for(const [address,item] of queue){
    if(t-item.firstQueuedAt>maxAgeMs())queue.delete(address);
  }
  if(queue.size>config.revisitScoreMaxTokens){
    const ranked=[...queue.entries()].sort((a,b)=>b[1].bestScore-a[1].bestScore||a[1].nextCheckAt-b[1].nextCheckAt);
    for(const [address] of ranked.slice(config.revisitScoreMaxTokens))queue.delete(address);
  }
}

export function revisitDueAddresses(){
  if(!config.revisitScoreEnabled)return[];
  prune();const t=now();
  return [...queue.entries()].filter(([,item])=>item.nextCheckAt<=t).sort((a,b)=>b[1].bestScore-a[1].bestScore||a[1].nextCheckAt-b[1].nextCheckAt).map(([address])=>address);
}

export function revisitStatus(){
  prune();const t=now();
  return {enabled:config.revisitScoreEnabled,threshold:config.revisitScoreThreshold,intervalSeconds:config.revisitScoreIntervalSeconds,count:queue.size,due:[...queue.values()].filter(x=>x.nextCheckAt<=t).length,max:config.revisitScoreMaxTokens};
}

export function noteRevisit(s,gate,{wasRevisit=false}={}){
  if(!config.revisitScoreEnabled||!s?.tokenAddress)return null;
  const address=s.tokenAddress,t=now(),score=Number(s.score||0),existing=queue.get(address);

  if(gate?.ok){if(existing)queue.delete(address);return existing?{action:'qualified',symbol:s.symbol,score}:null;}

  const liquidityPending=String(gate?.why||'').toLowerCase().includes('liquidity data pending');
  // Missing liquidity on a brand-new pool is a data-timing problem, not a weak-score
  // signal. Recheck it quickly even if the preliminary score is below the normal queue floor.
  if(score<config.revisitScoreThreshold&&!liquidityPending){
    if(existing){queue.delete(address);return{action:'dropped',symbol:s.symbol,score,why:`score below ${config.revisitScoreThreshold}`};}
    return null;
  }

  if(!existing){
    const nextMs=liquidityPending?30_000:intervalMs();
    queue.set(address,{symbol:s.symbol,firstQueuedAt:t,lastCheckedAt:t,nextCheckAt:t+nextMs,lastScore:score,bestScore:score,checks:0,lastWhy:gate?.why||'not entry-ready'});
    prune();
    return{action:'added',symbol:s.symbol,score,nextSeconds:nextMs/1000,why:gate?.why||'not entry-ready'};
  }

  if(wasRevisit){
    const previousScore=existing.lastScore;
    const nextMs=liquidityPending?30_000:intervalMs();
    Object.assign(existing,{symbol:s.symbol,lastCheckedAt:t,nextCheckAt:t+nextMs,lastScore:score,bestScore:Math.max(existing.bestScore,score),checks:existing.checks+1,lastWhy:gate?.why||existing.lastWhy});
    return{action:'rechecked',symbol:s.symbol,score,previousScore,delta:score-previousScore,checks:existing.checks,nextSeconds:intervalMs()/1000,why:gate?.why||existing.lastWhy};
  }

  // A normal discovery scan may see the same queued token again; update the best score
  // but do not move its 5-minute due time forward.
  existing.bestScore=Math.max(existing.bestScore,score);existing.lastScore=score;existing.lastWhy=gate?.why||existing.lastWhy;
  return null;
}
