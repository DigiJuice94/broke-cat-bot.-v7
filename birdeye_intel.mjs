import {config} from './config.mjs';

const BASE='https://public-api.birdeye.so';
const cache=new Map();
const ttlMs=()=>Math.max(30,Number(config.birdeyeSafetyCacheSeconds||300))*1000;
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const bool=v=>typeof v==='boolean'?v:(v===1||v==='1'||String(v).toLowerCase()==='true'?true:(v===0||v==='0'||String(v).toLowerCase()==='false'?false:null));
const headers=()=>({accept:'application/json','x-chain':'solana','X-API-KEY':config.birdeyeApiKey});
async function get(path,params={}){if(!config.birdeyeEnabled||!config.birdeyeApiKey)throw new Error('Birdeye disabled or BIRDEYE_API_KEY missing');const q=new URLSearchParams();for(const[k,v]of Object.entries(params))if(v!=null)q.set(k,String(v));const r=await fetch(`${BASE}${path}?${q}`,{headers:headers()});if(!r.ok)throw new Error(`Birdeye ${path} ${r.status}`);const j=await r.json();return j?.data??j;}
const pick=(o,...keys)=>{for(const k of keys)if(o&&o[k]!=null)return o[k];return null};
function rowsOf(v){if(Array.isArray(v))return v;for(const k of ['items','list','rows','holders','buyers','data'])if(Array.isArray(v?.[k]))return v[k];return[]}
function tagsOf(x){const raw=pick(x,'tags','wallet_tags','walletTags','tag');if(Array.isArray(raw))return raw.map(t=>String(typeof t==='string'?t:(t?.name||t?.tag||'' )).toLowerCase()).filter(Boolean);if(typeof raw==='string')return raw.split(/[,| ]+/).map(x=>x.toLowerCase()).filter(Boolean);return[]}
function normalizePct(v){const n=num(v);if(n==null)return null;return n<=1&&n>=0?n*100:n}

export async function birdeyeSafety(mint){
  if(!config.birdeyeEnabled||!config.birdeyeApiKey)return{enabled:false,source:'birdeye',error:'missing/disabled'};
  const old=cache.get(mint);if(old&&Date.now()-old.at<ttlMs())return old.value;
  const out={enabled:true,source:'birdeye',security:null,creation:null,firstBuyers:null,errors:[]};
  const jobs=await Promise.allSettled([
    get('/defi/token_security',{address:mint}),
    get('/defi/token_creation_info',{address:mint}),
    get('/token/v1/first-buyers',{token_address:mint,offset:0,limit:Math.max(10,Math.min(100,Number(config.birdeyeFirstBuyersLimit||70)))})
  ]);
  if(jobs[0].status==='fulfilled')out.security=jobs[0].value;else out.errors.push(jobs[0].reason?.message||'security failed');
  if(jobs[1].status==='fulfilled')out.creation=jobs[1].value;else out.errors.push(jobs[1].reason?.message||'creation failed');
  if(jobs[2].status==='fulfilled')out.firstBuyers=jobs[2].value;else out.errors.push(jobs[2].reason?.message||'first-buyers failed');
  const sec=out.security||{};const creation=out.creation||{};const buyers=rowsOf(out.firstBuyers);
  const tagCounts={bundler:0,sniper:0,dev:0,insider:0,smart_trader:0};let taggedCurrentHolding=0,bundlerCurrentHolding=0,insiderCurrentHolding=0,devCurrentHolding=0;
  for(const b of buyers){const tags=tagsOf(b);const cur=num(pick(b,'current_holding','currentHolding','current_amount','balance'))||0;for(const t of Object.keys(tagCounts))if(tags.includes(t))tagCounts[t]++;if(tags.some(t=>['bundler','sniper','dev','insider'].includes(t)))taggedCurrentHolding+=cur;if(tags.includes('bundler'))bundlerCurrentHolding+=cur;if(tags.includes('insider'))insiderCurrentHolding+=cur;if(tags.includes('dev'))devCurrentHolding+=cur;}
  out.summary={
    creatorAddress:pick(creation,'creator','creatorAddress','creator_address','owner')||pick(sec,'creatorAddress','creator_address'),
    creationTx:pick(creation,'txHash','tx_hash','signature','transactionHash','transaction_hash'),
    creatorPct:normalizePct(pick(sec,'creatorPercentage','creator_percentage')),
    ownerPct:normalizePct(pick(sec,'ownerPercentage','owner_percentage')),
    top10Pct:normalizePct(pick(sec,'top10HolderPercent','top10_holder_percent','top10UserPercent','top10_user_percent')),
    freezeable:bool(pick(sec,'freezeable','isFreezeable','freeze_enabled')),
    mutableMetadata:bool(pick(sec,'mutableMetadata','mutable_metadata')),
    firstBuyerCount:buyers.length,tagCounts,bundlerCurrentHolding,insiderCurrentHolding,devCurrentHolding,taggedCurrentHolding
  };
  const value=out;cache.set(mint,{at:Date.now(),value});return value;
}
