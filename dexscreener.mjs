const API='https://api.dexscreener.com';
async function json(url){const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`DEX Screener ${r.status}`);return r.json()}
const num=v=>Number(v??0)||0;
function normalizePair(p){if(p.chainId!=='solana'||!p.baseToken?.address)return null;return{chainId:p.chainId,tokenAddress:p.baseToken.address,pairAddress:p.pairAddress,symbol:p.baseToken.symbol||'?',name:p.baseToken.name||'Unknown',dexId:p.dexId||'unknown',url:p.url,priceUsd:num(p.priceUsd),liquidityUsd:num(p.liquidity?.usd),marketCap:num(p.marketCap||p.fdv),pairCreatedAt:p.pairCreatedAt?Number(p.pairCreatedAt):undefined,volume5m:num(p.volume?.m5),volume1h:num(p.volume?.h1),volume24h:num(p.volume?.h24),buys5m:num(p.txns?.m5?.buys),sells5m:num(p.txns?.m5?.sells),priceChange5m:num(p.priceChange?.m5),priceChange1h:num(p.priceChange?.h1),info:p.info||null};}
export async function pairForToken(address){const pairs=await json(`${API}/token-pairs/v1/solana/${address}`).catch(()=>[]);return(Array.isArray(pairs)?pairs:[]).map(normalizePair).filter(Boolean).sort((a,b)=>b.liquidityUsd-a.liquidityUsd)[0]||null}
export async function discoverCandidates(priorityAddresses=[],runnerAddresses=[]){
  const [profiles,boosts,topBoosts,ads,ctos]=await Promise.all([
    json(`${API}/token-profiles/latest/v1`).catch(()=>[]),json(`${API}/token-boosts/latest/v1`).catch(()=>[]),json(`${API}/token-boosts/top/v1`).catch(()=>[]),json(`${API}/ads/latest/v1`).catch(()=>[]),json(`${API}/community-takeovers/latest/v1`).catch(()=>[])
  ]);
  const prioritySet=new Set(priorityAddresses);const runnerSet=new Set(runnerAddresses);const addresses=new Set([...priorityAddresses,...runnerAddresses]);
  for(const row of [...(Array.isArray(profiles)?profiles:[]),...(Array.isArray(boosts)?boosts:[]),...(Array.isArray(topBoosts)?topBoosts:[]),...(Array.isArray(ads)?ads:[]),...(Array.isArray(ctos)?ctos:[])])if(row?.chainId==='solana'&&row?.tokenAddress)addresses.add(row.tokenAddress);
  const chosen=[...addresses].slice(0,40);const out=[];
  for(let i=0;i<chosen.length;i+=5){const slice=chosen.slice(i,i+5);const batch=await Promise.all(slice.map(pairForToken));for(let j=0;j<batch.length;j++)if(batch[j])out.push({...batch[j],prioritySource:prioritySet.has(slice[j]),runnerSource:runnerSet.has(slice[j])});}
  return out.sort((a,b)=>Number(b.prioritySource)-Number(a.prioritySource)||Number(b.runnerSource)-Number(a.runnerSource)||(b.pairCreatedAt||0)-(a.pairCreatedAt||0));
}
export async function refreshPair(pairAddress){const data=await json(`${API}/latest/dex/pairs/solana/${pairAddress}`);const p=Array.isArray(data?.pairs)?data.pairs[0]:null;return p?normalizePair(p):null}
