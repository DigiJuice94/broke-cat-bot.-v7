import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {config} from './config.mjs';
import {walletEquitySnapshot} from './live.mjs';

const statePath=path.resolve(config.dataDir,'broke-cat-live-state.json');
const originalCreateServer=http.createServer.bind(http);
const CACHE_MS=Math.max(5000,Number(process.env.PUBLIC_API_CACHE_MS||15000));
const STARTING_TREASURY_USD=Math.max(0.01,Number(process.env.PUBLIC_STARTING_TREASURY_USD||1000));
const MAX_PUBLIC_TRADES=Math.max(1,Math.min(100,Number(process.env.PUBLIC_TRADES_LIMIT||50)));

let statsCache={at:0,value:null};

const num=v=>Number.isFinite(Number(v))?Number(v):0;
const iso=v=>{const d=new Date(v||0);return Number.isFinite(d.getTime())?d.toISOString():null};

function loadState(){
  try{
    if(!fs.existsSync(statePath))return null;
    const s=JSON.parse(fs.readFileSync(statePath,'utf8'));
    if(!Array.isArray(s.trades))s.trades=[];
    if(!Array.isArray(s.moonBags))s.moonBags=[];
    return s;
  }catch{return null}
}

function activePositionCount(s){
  if(Array.isArray(s?.positions))return s.positions.length;
  return s?.position?1:0;
}

function closedTradesFromLedger(rows=[]){
  const active=new Map();
  const closed=[];

  for(const t of rows){
    const type=String(t?.type||'').toUpperCase();
    const token=String(t?.tokenAddress||t?.symbol||'UNKNOWN');
    if(type==='BUY'){
      active.set(token,{
        symbol:t.symbol||'?',
        tokenAddress:t.tokenAddress||null,
        lane:t.lane||null,
        entryMode:t.entryMode||'NORMAL',
        score:num(t.score),
        initialPositionUsd:num(t.costUsd),
        buySignature:t.signature||null,
        openedAt:iso(t.at),
        realizedPnlUsd:0
      });
      continue;
    }

    if(type!=='PARTIAL_SELL'&&type!=='SELL')continue;
    const p=active.get(token);
    if(!p)continue;

    p.realizedPnlUsd+=num(t.pnlUsd);

    const coreClosed=type==='SELL'||Boolean(t.moonBagDetached);
    if(!coreClosed)continue;

    const pnlPct=p.initialPositionUsd>0?(p.realizedPnlUsd/p.initialPositionUsd)*100:0;
    closed.push({
      symbol:p.symbol,
      tokenAddress:p.tokenAddress,
      lane:p.lane,
      entryMode:p.entryMode,
      score:p.score,
      initialPositionUsd:Number(p.initialPositionUsd.toFixed(2)),
      realizedPnlUsd:Number(p.realizedPnlUsd.toFixed(2)),
      realizedPnlPct:Number(pnlPct.toFixed(2)),
      result:p.realizedPnlUsd>=0?'CAT GOT PAID 😼💰':'CAT GOT SCRATCHED 😿',
      verification:{
        buySignature:p.buySignature,
        closeSignature:t.signature||null
      },
      closedAt:iso(t.at)
    });
    active.delete(token);
  }

  return closed.sort((a,b)=>Date.parse(b.closedAt||0)-Date.parse(a.closedAt||0));
}

function survivalDays(closed, rows){
  const now=Date.now();
  const lastLoss=closed.find(t=>num(t.realizedPnlUsd)<0);
  if(lastLoss?.closedAt){
    return Math.max(0,Math.floor((now-Date.parse(lastLoss.closedAt))/86400000));
  }
  const firstTrade=(rows||[]).map(t=>Date.parse(t?.at||0)).filter(Number.isFinite).sort((a,b)=>a-b)[0];
  return firstTrade?Math.max(0,Math.floor((now-firstTrade)/86400000)):0;
}

async function buildStats(){
  const s=loadState();
  if(!s)throw new Error('live state unavailable');

  const closed=closedTradesFromLedger(s.trades);
  const wins=closed.filter(t=>num(t.realizedPnlUsd)>0).length;
  const losses=closed.filter(t=>num(t.realizedPnlUsd)<0).length;
  const flat=closed.length-wins-losses;
  const decided=wins+losses;
  const winRate=decided?wins/decided*100:0;

  let treasuryUsd=null;
  try{
    const snap=await walletEquitySnapshot(s);
    treasuryUsd=Number(num(snap.totalWalletUsd).toFixed(2));
  }catch(err){
    console.error(`🐱 PUBLIC API treasury snapshot failed: ${err?.message||err}`);
  }

  const growthPct=treasuryUsd==null?null:((treasuryUsd/STARTING_TREASURY_USD)-1)*100;
  const status=num(s.dailyPnl)<=-num(config.maxDailyLoss)?'risk-mode':'hunting';

  return {
    ok:true,
    brand:'BROKE CAT BOT',
    status,
    statusLabel:status==='hunting'?'BROKE CAT IS HUNTING':'BROKE CAT IS IN RISK MODE',
    treasuryUsd,
    startingTreasuryUsd:Number(STARTING_TREASURY_USD.toFixed(2)),
    treasuryGrowthPct:growthPct==null?null:Number(growthPct.toFixed(2)),
    todayRealizedPnlUsd:Number(num(s.dailyPnl).toFixed(2)),
    allTimeRealizedPnlUsd:Number(num(s.realizedPnl).toFixed(2)),
    wins,
    losses,
    flat,
    closedTrades:closed.length,
    winRatePct:Number(winRate.toFixed(1)),
    survivalDays:survivalDays(closed,s.trades),
    openPositions:activePositionCount(s),
    moonBags:Number(s.moonBags?.length||0),
    updatedAt:new Date().toISOString()
  };
}

async function cachedStats(){
  if(statsCache.value&&Date.now()-statsCache.at<CACHE_MS)return statsCache.value;
  const value=await buildStats();
  statsCache={at:Date.now(),value};
  return value;
}

function sendJson(res,status,payload){
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'public, max-age=10, stale-while-revalidate=20',
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET,OPTIONS',
    'access-control-allow-headers':'content-type'
  });
  res.end(JSON.stringify(payload));
}

async function publicRoute(req,res){
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);

  if(req.method==='OPTIONS'&&(url.pathname.startsWith('/public-')||url.pathname==='/public-api')){
    sendJson(res,204,{});
    return true;
  }

  if(req.method!=='GET')return false;

  if(url.pathname==='/public-api'){
    sendJson(res,200,{
      ok:true,
      endpoints:['/public-stats','/public-trades'],
      privacy:'Closed/core-exited trades only. No live token identities, stops, targets, hold times, strategy logic, or moon-bag sizes.'
    });
    return true;
  }

  if(url.pathname==='/public-stats'){
    try{
      sendJson(res,200,await cachedStats());
    }catch(err){
      sendJson(res,503,{ok:false,error:'public stats temporarily unavailable',updatedAt:new Date().toISOString()});
    }
    return true;
  }

  if(url.pathname==='/public-trades'){
    const s=loadState();
    if(!s){
      sendJson(res,503,{ok:false,error:'public trades temporarily unavailable',trades:[]});
      return true;
    }
    const requested=Math.max(1,Math.min(MAX_PUBLIC_TRADES,Number(url.searchParams.get('limit')||25)));
    const trades=closedTradesFromLedger(s.trades).slice(0,requested);
    sendJson(res,200,{
      ok:true,
      count:trades.length,
      trades,
      updatedAt:new Date().toISOString(),
      disclosure:'Only completed/core-exited trades are shown. Active positions and moon-bag sizes are never disclosed.'
    });
    return true;
  }

  return false;
}

// Railway still runs the existing Broke Cat index.mjs.
// This preload simply wraps its HTTP server and adds safe read-only public routes.
http.createServer=function(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return originalCreateServer(...args);

  const originalListener=args[listenerIndex];
  args[listenerIndex]=async function(req,res){
    try{
      if(await publicRoute(req,res))return;
    }catch(err){
      console.error(`🐱 PUBLIC API error: ${err?.message||err}`);
      if(!res.headersSent)sendJson(res,500,{ok:false,error:'public api error'});
      return;
    }
    return originalListener(req,res);
  };
  return originalCreateServer(...args);
};

console.log('🐱 PUBLIC WEBSITE API LOADED | /public-stats + /public-trades | safe disclosure mode ON');
