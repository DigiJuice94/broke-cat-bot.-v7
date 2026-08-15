import {config} from './config.mjs';

const GT='https://api.geckoterminal.com/api/v2';
const BIRDEYE='https://public-api.birdeye.so';
const BITQUERY='https://streaming.bitquery.io/graphql';
const PUMP_PROGRAM='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const cache={at:0,addresses:new Map(),statuses:{}};
const num=v=>Number(v??0)||0;
const add=(map,address,source,meta={})=>{if(!address||typeof address!=='string'||address.length<25)return;const old=map.get(address)||{address,sources:new Set(),meta:{}};old.sources.add(source);old.meta={...old.meta,[source]:meta};map.set(address,old)};
async function getJson(url,opts={}){const r=await fetch(url,opts);if(!r.ok)throw new Error(`${new URL(url).hostname} ${r.status}`);return r.json()}

async function birdeye(map){
  if(!config.birdeyeEnabled)return{enabled:false,why:'disabled'};
  if(!config.birdeyeApiKey)return{enabled:false,why:'missing BIRDEYE_API_KEY'};
  const url=`${BIRDEYE}/defi/v2/tokens/new_listing?limit=20&meme_platform_enabled=true`;
  const j=await getJson(url,{headers:{accept:'application/json','x-chain':'solana','X-API-KEY':config.birdeyeApiKey}});
  const rows=j?.data?.items||j?.data?.tokens||j?.data||[];let n=0;
  for(const x of Array.isArray(rows)?rows:[]){const address=x?.address||x?.token_address||x?.tokenAddress||x?.mint; if(address){add(map,address,'birdeye',{name:x?.name,symbol:x?.symbol,listedAt:x?.liquidityAddedAt||x?.createdAt});n++}}
  return{enabled:true,count:n};
}
function includedTokenMap(j){const m=new Map();for(const x of j?.included||[])if(x?.type==='token'){const a=x?.attributes||{};if(a.address)m.set(x.id,{address:a.address,name:a.name,symbol:a.symbol})}return m}
async function gecko(map){
  if(!config.geckoTerminalEnabled)return{enabled:false,why:'disabled'};
  const urls=[`${GT}/networks/solana/trending_pools?include=base_token`,`${GT}/networks/new_pools?include=base_token`];let n=0;
  for(const [idx,url] of urls.entries()){
    const j=await getJson(url,{headers:{accept:'application/json'}});const toks=includedTokenMap(j);
    for(const pool of j?.data||[]){const rel=pool?.relationships?.base_token?.data?.id;const tok=toks.get(rel);if(tok?.address){add(map,tok.address,idx===0?'gecko-trending':'gecko-new',{pool:pool?.attributes?.address,name:tok.name,symbol:tok.symbol});n++}}
  }
  return{enabled:true,count:n};
}
async function bitquery(map){
  if(!config.bitqueryEnabled)return{enabled:false,why:'disabled'};
  if(!config.bitqueryToken)return{enabled:false,why:'missing BITQUERY_API_TOKEN'};
  // Pump.fun recent launches. Query is intentionally small and fail-open; Birdeye meme-platform discovery remains an independent backup.
  const query=`query BrokeCatPumpLaunches { Solana(dataset: realtime) { TokenSupplyUpdates(limit: {count: 20}, orderBy: {descending: Block_Time}, where: {Instruction: {Program: {Address: {is: \"${PUMP_PROGRAM}\"}, Method: {in: [\"create\",\"create_v2\"]}}}, Transaction: {Result: {Success: true}}}) { Block { Time } Transaction { Signer } TokenSupplyUpdate { Currency { Name Symbol MintAddress Uri UpdateAuthority } } } } }`;
  const j=await getJson(BITQUERY,{method:'POST',headers:{'content-type':'application/json','Authorization':`Bearer ${config.bitqueryToken}`},body:JSON.stringify({query})});
  if(j?.errors?.length)throw new Error(`Bitquery GraphQL: ${j.errors[0]?.message||'query error'}`);
  const rows=j?.data?.Solana?.TokenSupplyUpdates||[];let n=0;
  for(const x of rows){const c=x?.TokenSupplyUpdate?.Currency||{};if(c.MintAddress){add(map,c.MintAddress,'pumpfun-bitquery',{name:c.Name,symbol:c.Symbol,createdAt:x?.Block?.Time,creator:x?.Transaction?.Signer,uri:c.Uri});n++}}
  return{enabled:true,count:n};
}
let telegramOffset=0;
const caRegex=/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
async function telegram(map){
  if(!config.telegramIntelEnabled)return{enabled:false,why:'disabled'};
  if(!config.telegramIntelBotToken)return{enabled:false,why:'missing TELEGRAM_INTEL_BOT_TOKEN'};
  // Telegram Bot API only provides channel posts from channels where the bot is a member. This does not scrape arbitrary channels.
  const url=`https://api.telegram.org/bot${config.telegramIntelBotToken}/getUpdates?timeout=0&limit=100&offset=${telegramOffset}`;
  const j=await getJson(url);let n=0,posts=0;
  for(const u of j?.result||[]){telegramOffset=Math.max(telegramOffset,Number(u.update_id||0)+1);const post=u.channel_post||u.edited_channel_post;const text=post?.text||post?.caption||'';if(!text)continue;posts++;const low=text.toLowerCase();const hit=config.telegramIntelKeywords.some(k=>low.includes(String(k).toLowerCase()));if(!hit)continue;for(const ca of text.match(caRegex)||[]){add(map,ca,'telegram-watch',{channel:post?.chat?.username||post?.chat?.title||'channel',date:post?.date});n++}}
  return{enabled:true,count:n,posts};
}
function socialCommunitySignal(candidate){
  const socials=candidate?.info?.socials||[];const telegramLinks=socials.filter(x=>String(x?.type||'').toLowerCase().includes('telegram')||String(x?.url||'').includes('t.me/'));
  return telegramLinks.length?{telegramPresence:true,count:telegramLinks.length}:null;
}
export function confirmationFor(candidate){
  const row=cache.addresses.get(candidate.tokenAddress);const sources=row?[...row.sources]:[];const community=socialCommunitySignal(candidate);if(community)sources.push('telegram-community');
  const unique=[...new Set(sources)];
  // Confirmation is deliberately capped and cannot bypass hard on-chain safety gates.
  const independent=Math.max(0,unique.length-1);const bonus=config.crossPlatformEnabled?Math.min(config.crossPlatformBonusMax,independent*2):0;
  return{sources:unique,count:unique.length,bonus,community,meta:row?.meta||{}};
}
export async function refreshRunnerFeeds(force=false){
  if(!config.crossPlatformEnabled)return{addresses:[],statuses:{disabled:true}};
  const ttl=Math.max(15,config.runnerFeedPollSeconds)*1000;if(!force&&Date.now()-cache.at<ttl)return{addresses:[...cache.addresses.keys()],statuses:cache.statuses};
  const map=new Map();const statuses={};
  for(const [name,fn] of [['birdeye',birdeye],['geckoterminal',gecko],['pumpfun-bitquery',bitquery],['telegram',telegram]]){
    try{statuses[name]=await fn(map)}catch(e){statuses[name]={enabled:true,error:e?.message||String(e)}}
  }
  cache.at=Date.now();cache.addresses=map;cache.statuses=statuses;
  return{addresses:[...map.keys()].slice(0,config.runnerFeedMaxAddresses),statuses};
}
export function runnerFeedStatus(){return{lastRefresh:cache.at?new Date(cache.at).toISOString():null,addresses:cache.addresses.size,statuses:cache.statuses}}
