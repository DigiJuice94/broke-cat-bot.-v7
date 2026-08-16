import {config} from './config.mjs';

const BASE='https://api.mobula.io';
const cache=new Map();
const ttlMs=()=>Math.max(30,Number(config.mobulaSafetyCacheSeconds||300))*1000;
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const pct=v=>{const n=num(v);if(n==null)return null;return n>=0&&n<=1?n*100:n};

function authHeaders(){return{'content-type':'application/json','accept':'application/json','Authorization':config.mobulaApiKey}}
function rowsFromResponse(j){
  const out=[];const payload=j?.payload||j;
  if(!payload||typeof payload!=='object')return out;
  for(const value of Object.values(payload)){
    const rows=Array.isArray(value)?value:Array.isArray(value?.data)?value.data:[];
    for(const row of rows)out.push(row);
  }
  return out;
}
function tokenAddress(row){return row?.token?.address||row?.address||null}
function normalize(row){
  if(!row)return null;const t=row.token||row;
  return{
    address:t.address||row.address||null,symbol:t.symbol||row.symbol||null,name:t.name||row.name||null,
    marketCap:num(row.market_cap??row.latest_market_cap??t.marketCap??t.market_cap),
    liquidity:num(t.liquidity??row.liquidity),volume5m:num(row.volume_5min??row.volume5m),volume1h:num(row.volume_1h??row.volume1h),
    priceChange5m:num(row.price_change_5min??row.priceChange5m),priceChange1h:num(row.price_change_1h??row.priceChange1h),
    holdersCount:num(t.holdersCount??row.holdersCount??row.holders_count),
    top10Pct:pct(t.top10HoldingsPercentage??row.top10HoldingsPercentage??row.top_10_holdings_percentage),
    devPct:pct(t.devHoldingsPercentage??row.devHoldingsPercentage??row.dev_holdings_percentage),
    insidersPct:pct(t.insidersHoldingsPercentage??row.insidersHoldingsPercentage??row.insiders_holdings_percentage),
    bundlersPct:pct(t.bundlersHoldingsPercentage??row.bundlersHoldingsPercentage??row.bundlers_holdings_percentage),
    snipersPct:pct(t.snipersHoldingsPercentage??row.snipersHoldingsPercentage??row.snipers_holdings_percentage),
    bundlersCount:num(t.bundlersCount??row.bundlersCount??row.bundlers_count),snipersCount:num(t.snipersCount??row.snipersCount??row.snipers_count),
    insidersCount:num(t.insidersCount??row.insidersCount??row.insiders_count),proTradersCount:num(t.proTradersCount??row.proTradersCount??row.pro_traders_count),
    smartTradersCount:num(t.smartTradersCount??row.smartTradersCount??row.smart_traders_count),deployer:t.deployer||row.deployer||null,
    source:t.source||row.source||null,poolAddress:t.poolAddress||row.poolAddress||row.pool_address||null,raw:row
  };
}
async function postPulse(views){
  if(!config.mobulaEnabled||!config.mobulaApiKey)throw new Error('Mobula disabled or MOBULA_API_KEY missing');
  const r=await fetch(`${BASE}/api/2/pulse`,{method:'POST',headers:authHeaders(),body:JSON.stringify({assetMode:true,compressed:false,excludeDuplicates:true,views}),signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw new Error(`Mobula Pulse ${r.status}: ${(await r.text()).slice(0,180)}`);
  return r.json();
}
export async function mobulaTrending(){
  if(!config.mobulaEnabled||!config.mobulaTrendingEnabled||!config.mobulaApiKey)return{enabled:false,why:!config.mobulaApiKey?'missing MOBULA_API_KEY':'disabled',rows:[]};
  const limit=Math.max(10,Math.min(100,Number(config.mobulaTrendingLimit||50)));
  const common={chainId:['solana:solana'],limit,filters:{liquidity:{gte:Number(config.minLiquidity||3000)},market_cap:{gte:Number(config.minMarketCap||3000)}}};
  const views=[
    {...common,name:'axiom-volume',sortBy:'volume_1h',sortOrder:'desc'},
    {...common,name:'axiom-momentum',sortBy:'price_change_1h',sortOrder:'desc'},
    {...common,name:'axiom-active',sortBy:'trades_1h',sortOrder:'desc'}
  ];
  const j=await postPulse(views);const seen=new Map();
  for(const row of rowsFromResponse(j)){const n=normalize(row);if(n?.address){seen.set(n.address,n);cache.set(n.address,{at:Date.now(),value:n})}}
  return{enabled:true,count:seen.size,rows:[...seen.values()]};
}
export async function mobulaSafety(mint){
  if(!config.mobulaEnabled||!config.mobulaSafetyEnabled||!config.mobulaApiKey)return{enabled:false,source:'mobula-axiom',error:'missing/disabled'};
  const old=cache.get(mint);if(old&&Date.now()-old.at<ttlMs())return{enabled:true,source:'mobula-axiom',summary:old.value,cached:true};
  const view={name:'axiom-safety',chainId:['solana:solana'],sortBy:'volume_1h',sortOrder:'desc',limit:1,includeTokens:[mint]};
  const j=await postPulse([view]);const row=rowsFromResponse(j).find(x=>tokenAddress(x)===mint)||rowsFromResponse(j)[0];const n=normalize(row);
  if(!n||n.address!==mint)return{enabled:true,source:'mobula-axiom',error:'token not returned'};
  cache.set(mint,{at:Date.now(),value:n});return{enabled:true,source:'mobula-axiom',summary:n,cached:false};
}
export function mobulaCached(mint){const x=cache.get(mint);return x&&Date.now()-x.at<ttlMs()?x.value:null}
