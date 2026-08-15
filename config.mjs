const n=(name,fallback)=>process.env[name]==null||process.env[name]===''?fallback:Number(process.env[name]);
const b=(name,fallback)=>process.env[name]==null||process.env[name]===''?fallback:['1','true','yes','on'].includes(String(process.env[name]).toLowerCase());
const s=(name,fallback='')=>process.env[name]??fallback;
const csv=(name,fallback='')=>String(s(name,fallback)).split(',').map(x=>x.trim()).filter(Boolean);
export const SOL_MINT='So11111111111111111111111111111111111111112';
export const config={
  tradingMode:s('TRADING_MODE','paper').toLowerCase(), liveAck:s('LIVE_TRADING_ACK',''),
  bankroll:n('PAPER_BANKROLL_USD',11), maxDailyLoss:n('MAX_DAILY_LOSS_USD',3), minScore:n('MIN_SCORE',85), pollSeconds:n('POLL_SECONDS',30),
  livePositionUsd:n('LIVE_POSITION_USD',2), minSolReserve:n('MIN_SOL_RESERVE',0.003),
  positionSizingMode:s('POSITION_SIZING_MODE','dynamic').toLowerCase(), targetPositionPct:n('TARGET_POSITION_PCT',3), maxPositionUsd:n('MAX_POSITION_USD',100), maxPositionToLiquidityPct:n('MAX_POSITION_TO_LIQUIDITY_PCT',0.5),
  dynamicMinPositionPct:n('DYNAMIC_MIN_POSITION_PCT',5), dynamicMaxPositionPct:n('DYNAMIC_MAX_POSITION_PCT',30), dynamicMaxPositionUsd:n('DYNAMIC_MAX_POSITION_USD',0),
  hardStopPct:n('HARD_STOP_PCT',35), legacyStopLossPct:n('STOP_LOSS_PCT',35),
  profitTiers:[
    {gain:n('TP1_GAIN_PCT',50),sell:n('TP1_SELL_PCT',15)},
    {gain:n('TP2_GAIN_PCT',100),sell:n('TP2_SELL_PCT',20)},
    {gain:n('TP3_GAIN_PCT',200),sell:n('TP3_SELL_PCT',20)},
    {gain:n('TP4_GAIN_PCT',400),sell:n('TP4_SELL_PCT',20)}
  ], moonBagPct:n('MOON_BAG_PCT',25), maxExitChunkUsd:n('MAX_EXIT_CHUNK_USD',100),
  positionRiskRecheckSeconds:n('POSITION_RISK_RECHECK_SECONDS',120),liquidityRecheckSeconds:n('LIQUIDITY_RECHECK_SECONDS',30),
  liquidityWarningDropPct:n('LIQUIDITY_WARNING_DROP_PCT',50),liquidityDangerDropPct:n('LIQUIDITY_DANGER_DROP_PCT',70),liquidityCriticalDropPct:n('LIQUIDITY_CRITICAL_DROP_PCT',85),liquidityConfirmationsRequired:n('LIQUIDITY_CONFIRMATIONS_REQUIRED',3),liquidityCriticalConfirmationsRequired:n('LIQUIDITY_CRITICAL_CONFIRMATIONS_REQUIRED',2),liquidityMinExitEfficiencyPct:n('LIQUIDITY_MIN_EXIT_EFFICIENCY_PCT',75),liquidityCriticalExitEfficiencyPct:n('LIQUIDITY_CRITICAL_EXIT_EFFICIENCY_PCT',60),liquidityConfirmPriceDropPct:n('LIQUIDITY_CONFIRM_PRICE_DROP_PCT',-15),liquidityMinBuySellRatio:n('LIQUIDITY_MIN_BUY_SELL_RATIO',0.6),
  maxTokenAgeMinutes:n('MAX_TOKEN_AGE_MINUTES',1440), minLiquidity:n('MIN_LIQUIDITY_USD',3000), min5mVolume:n('MIN_5M_VOLUME_USD',500), minMarketCap:n('MIN_MARKET_CAP_USD',3000), maxMarketCap:n('MAX_MARKET_CAP_USD',100000000),
  earlyMaxAgeMinutes:n('EARLY_MAX_AGE_MINUTES',30), earlyMaxMarketCap:n('EARLY_MAX_MARKET_CAP_USD',150000), momentumMinMarketCap:n('MOMENTUM_MIN_MARKET_CAP_USD',50000),
  heliusApiKey:s('HELIUS_API_KEY'), jupiterApiKey:s('JUPITER_API_KEY'), bs58PrivateKey:s('BS58_PRIVATE_KEY'), expectedWalletAddress:s('EXPECTED_WALLET_ADDRESS'),
  telegramBotToken:s('TELEGRAM_BOT_TOKEN'),telegramChatId:s('TELEGRAM_CHAT_ID'), runOnce:process.env.RUN_ONCE==='1', dataDir:s('DATA_DIR','.'),port:n('PORT',3000),
  xPostingEnabled:b('X_POSTING_ENABLED',false),xApiKey:s('X_API_KEY'),xApiSecret:s('X_API_SECRET'),xAccessToken:s('X_ACCESS_TOKEN'),xAccessTokenSecret:s('X_ACCESS_TOKEN_SECRET'),xDailyReportHourUtc:n('X_DAILY_REPORT_HOUR_UTC',23),xIdlePostingEnabled:b('X_IDLE_POSTING_ENABLED',true),xIdlePostHours:n('X_IDLE_POST_HOURS',2),
  xBearerToken:s('X_BEARER_TOKEN'),xIntelEnabled:b('X_INTEL_ENABLED',true),xStreamEnabled:b('X_STREAM_ENABLED',false),xIntelPollSeconds:n('X_INTEL_POLL_SECONDS',90),xHypeCacheSeconds:n('X_HYPE_CACHE_SECONDS',300),xOfficialWatchAccounts:csv('X_OFFICIAL_WATCH_ACCOUNTS'),
  xPrelaunchQuery:s('X_PRELAUNCH_QUERY','("launching soon" OR "fair launch" OR "launch today" OR "contract address" OR "CA soon" OR "live now") (solana OR SOL)'),xMultilingualIntelEnabled:b('X_MULTILINGUAL_INTEL_ENABLED',true),xMultilingualQueryGroups:n('X_MULTILINGUAL_QUERY_GROUPS',4),
  viralShortlistPerScan:n('VIRAL_SHORTLIST_PER_SCAN',4),viralBonusMax:n('VIRAL_BONUS_MAX',15),
  crossPlatformEnabled:b('CROSS_PLATFORM_RUNNER_ENABLED',true),crossPlatformBonusMax:n('CROSS_PLATFORM_BONUS_MAX',8),runnerFeedPollSeconds:n('RUNNER_FEED_POLL_SECONDS',60),runnerFeedMaxAddresses:n('RUNNER_FEED_MAX_ADDRESSES',60),
  birdeyeApiKey:s('BIRDEYE_API_KEY'),birdeyeEnabled:b('BIRDEYE_ENABLED',true),
  bitqueryToken:s('BITQUERY_API_TOKEN'),bitqueryEnabled:b('BITQUERY_PUMPFUN_ENABLED',true),
  geckoTerminalEnabled:b('GECKOTERMINAL_ENABLED',true),
  telegramIntelEnabled:b('TELEGRAM_INTEL_ENABLED',true),telegramIntelBotToken:s('TELEGRAM_INTEL_BOT_TOKEN'),telegramIntelKeywords:csv('TELEGRAM_INTEL_KEYWORDS','launch,ca,contract,live,pump,solana'),
  analyticsEveryScans:n('ANALYTICS_EVERY_SCANS',10),topRejectedKeep:n('TOP_REJECTED_KEEP',20),candidateSeenCooldownSeconds:n('CANDIDATE_SEEN_COOLDOWN_SECONDS',120),watchTokenAddresses:csv('WATCH_TOKEN_ADDRESSES'),
  rapidWatchEnabled:b('RAPID_WATCH_ENABLED',true),rapidWatchRecheckSeconds:n('RAPID_WATCH_RECHECK_SECONDS',15),rapidWatchHotRecheckSeconds:n('RAPID_WATCH_HOT_RECHECK_SECONDS',10),rapidWatchSlowRecheckSeconds:n('RAPID_WATCH_SLOW_RECHECK_SECONDS',30),rapidWatchScoreMargin:n('RAPID_WATCH_SCORE_MARGIN',10),rapidWatchNewbornMaxAgeMinutes:n('RAPID_WATCH_NEWBORN_MAX_AGE_MINUTES',10),rapidWatchMaxAgeMinutes:n('RAPID_WATCH_MAX_AGE_MINUTES',20),rapidWatchMaxMinutes:n('RAPID_WATCH_MAX_MINUTES',15),rapidWatchMaxTokens:n('RAPID_WATCH_MAX_TOKENS',30),rapidWatchMaxDeclines:n('RAPID_WATCH_MAX_DECLINES',3),
  launchTxLimit:n('LAUNCH_TX_LIMIT',100),launchWindowSeconds:n('LAUNCH_WINDOW_SECONDS',180),minLaunchTxForConfidence:n('MIN_LAUNCH_TX_FOR_CONFIDENCE',4),clusterWalletThreshold:n('CLUSTER_WALLET_THRESHOLD',4),clusterRepeatThreshold:n('CLUSTER_REPEAT_THRESHOLD',3),crowdedSlotsHigh:n('CROWDED_SLOTS_HIGH',2),maxFundingWalletChecks:n('MAX_FUNDING_WALLET_CHECKS',8),fundingHistoryLimit:n('FUNDING_HISTORY_LIMIT',30),fundingLookbackSeconds:n('FUNDING_LOOKBACK_SECONDS',86400),sharedFunderHighWallets:n('SHARED_FUNDER_HIGH_WALLETS',4),bundleSupplyMediumPct:n('BUNDLE_SUPPLY_MEDIUM_PCT',5),bundleSupplyHighPct:n('BUNDLE_SUPPLY_HIGH_PCT',12),blockLowBundleConfidence:b('BLOCK_LOW_BUNDLE_CONFIDENCE',true),holderTop1MediumPct:n('HOLDER_TOP1_MEDIUM_PCT',10),holderTop1HighPct:n('HOLDER_TOP1_HIGH_PCT',20),holderTop5MediumPct:n('HOLDER_TOP5_MEDIUM_PCT',25),holderTop5HighPct:n('HOLDER_TOP5_HIGH_PCT',40),holderTop10MediumPct:n('HOLDER_TOP10_MEDIUM_PCT',40),holderTop10HighPct:n('HOLDER_TOP10_HIGH_PCT',60)
};
export function liveConfigStatus(){const missing=[];if(!config.heliusApiKey)missing.push('HELIUS_API_KEY');if(!config.jupiterApiKey)missing.push('JUPITER_API_KEY');if(!config.bs58PrivateKey)missing.push('BS58_PRIVATE_KEY');if(config.liveAck!=='I_UNDERSTAND_REAL_FUNDS_ARE_AT_RISK')missing.push('LIVE_TRADING_ACK');return{ready:missing.length===0,missing};}
