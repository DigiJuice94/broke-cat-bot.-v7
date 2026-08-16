
## V11.14 clean consolidation

- Multi-position live portfolio: up to `MAX_ACTIVE_POSITIONS=3` by default.
- Combined active-position + tracked moon-bag exposure capped by `MAX_TOTAL_EXPOSURE_PCT=60`.
- Per-position dynamic allocation remains hard-capped at 30%.
- `MIN_TRADE_USD=5` is now the primary minimum executed buy variable; legacy `EXECUTION_MIN_USD` is accepted only as a fallback.
- Existing V11.13 single live position is migrated into `positions[]` at startup.
- Railway uses `npm start`, Railpack, `/health`, and restart policy `ALWAYS`.
- No wallet/API secrets are stored in this package.

# Broke Cat Bot v11.14

## v11.14 — Multi-source liquidity resolution
- Fixes a discovery bug where Mobula/Axiom-style and GeckoTerminal liquidity values were collected but not used by the candidate enricher.
- Positive DexScreener liquidity remains the primary value.
- When DexScreener returns zero/missing liquidity for an active newborn token, Broke Cat now falls back to Mobula/Axiom-style or GeckoTerminal pool liquidity before marking the token `LIQUIDITY PENDING`.
- GeckoTerminal discovery now preserves `reserve_in_usd`, market cap, 5m/1h volume, and momentum fields for fallback enrichment.
- Logs show the liquidity source, e.g. `$6,855 (dexscreener)` or `$6,855 (mobula-axiom-trending)`.
- The $3,000 hard liquidity floor is unchanged. Missing data is not treated as safe; a token stays pending only when no active source can resolve liquidity.


## v11.12 — Earlier profit taking
- Normal positions now take profit at **+10% / +20% / +35% / +60%**.
- Normal sell sizes are **15% / 20% / 20% / 20%** of the original position, leaving about **25%** as the moon bag.
- Micro-cap positions now take profit at **+10% / +20% / +35% / +60%**.
- Micro sell sizes are **20% / 25% / 25% / 20%**, leaving **10%** as the moon bag.
- This changes exit timing only; entry scoring, discovery, liquidity floor, bundle/dev safety, and percentage-based entry sizing are unchanged.

## v11.11 — Liquidity data reliability
- Retries DexScreener batch data once when a new token has market/volume activity but liquidity temporarily returns as zero.
- Distinguishes **LIQUIDITY PENDING** from genuine liquidity below the configured floor.
- Liquidity-pending candidates are revisited after about 30 seconds regardless of preliminary score.
- Priority/revisit addresses receive a direct token-pairs fallback before being rejected for liquidity.
- The $3,000 liquidity safety floor is unchanged; this release fixes missing/late data rather than weakening the rule.


Current stable build with synchronized version metadata, cleaner logs, and percentage-based sizing.

## Current behavior
- Active market/data stack: **DexScreener, Axiom-style/Mobula, GeckoTerminal, Helius, and Jupiter**.
- Active discovery/safety stack is intentionally lean: DexScreener, Axiom-style/Mobula, GeckoTerminal, Helius, and Jupiter. Telegram alert delivery remains available when configured.
- **Score-based percentage sizing** is enabled again. Approved entries size from the spendable wallet balance after the SOL reserve; there is no fixed $5 entry requirement.
- `MIN_SOL_RESERVE=0.003` SOL remains protected.
- Normal confirmed entry threshold remains **85+**.
- Micro-Cap Early Entry remains available for young, active micro-caps using percentage-based sizing rather than a fixed-dollar buy.
- Bundle supply above **13%** remains a hard no-trade condition; HIGH dev risk and liquidity below the configured floor remain hard blocks.
- One active position at a time is still enforced for execution, but **scanning continues while a position is open**. Candidates can be scored/revisited and logged as ready while the current trade is managed.
- Active positions print periodic holding/P&L updates so the bot does not appear idle.
- Railway health checks are local/fast and SIGTERM is handled as a clean shutdown.

## v11.12 maintenance
- Synchronizes README, package version, health endpoint version, startup banner, and archive folder name to **v11.12**.
- Packages the project inside a top-level `BrokeCatBot-v11.12/` folder for cleaner uploads.
- Preserves the v11.8 trading/scanning behavior; this release does **not** change scoring thresholds or add new feeds.

## v11.8 behavior carried forward
- Continue discovery/scoring while an active position is open.
- Do not execute a second buy until the active position closes or detaches as a moon bag.
- Log strong blocked candidates as ready/watchlist opportunities instead of silently skipping them.

## v11.0 discovery-lane fix
- Preserves Early/Trending feed reservations through cached refreshes.
- Treats explicit new-listing feed tokens as Early discovery candidates even when pair age metadata is missing.
- Prints EARLY EVALUATED logs and feed/discovery mix diagnostics.


## V10.7 — Axiom-style safety + discovery
Axiom Trade's Pulse UI exposes Top-10, Dev, Insider, Sniper, Bundle and Holder metrics but Axiom does not provide a supported public API. V10.7 adds Mobula Pulse as the supported Axiom-style programmatic layer. Mobula provides the same key holder-distribution fields (`top10HoldingsPercentage`, `devHoldingsPercentage`, `insidersHoldingsPercentage`, `bundlersHoldingsPercentage`, `snipersHoldingsPercentage`, holder counts) and an Axiom-style trending feed. For any platform-trending, runner, or otherwise deep-safety candidate, Broke Cat tries this source alongside Helius. Logs show numeric percentages when available instead of only UNKNOWN. Add `MOBULA_API_KEY` in Railway to enable it.

# Broke Cat Bot v10.5


# Broke Cat Bot v10.1 — Evidence Runner Radar

V10.1 replaces the single-threshold Runner Radar with a multi-signal evidence score. It ranks capital/liquidity growth, 5m volume acceleration, trade participation, buyer share, trade growth, and 1h/5m continuation while penalizing thin-liquidity spikes and low-trade-count one-sided moves. The bot stores rolling token snapshots so it can detect a coin that becomes a runner later instead of only judging its first appearance. Helius holder count plus the existing bundle/dev/top-holder gates remain independent confirmation/safety signals. The market-cap/liquidity settings are broad eligibility floors, not the definition of a runner.

# Broke Cat Bot V9.9

## V9.9 — one-time X billing alert + feed visibility

If X viral intelligence returns a billing/credits/payment error, Broke Cat now sends one alert for that outage, marks viral status as `PAY`, and pauses further X intel requests for 30 minutes instead of repeatedly hammering the paid endpoint. Market and on-chain scanning continue independently. A successful X intel request clears the billing state so a future separate outage can alert once again.

At startup the console prints a `DATA FEEDS` line for DexScreener, Axiom-style/Mobula, GeckoTerminal, Helius, and Jupiter.


## V9.8 — X cost guard + viral status fix

V9.8 keeps Rapid Watch at 10–15 second market rechecks but separates those from paid X reads. X viral checks are now limited to one recent-search request with up to 10 returned Posts, cached for 10 minutes per token, and deferred while liquidity is below $500. Broad pre-launch X radar is disabled by default and can be explicitly re-enabled.

The console now distinguishes `viral DEFER`, `viral ERR`, cached/live hype, and a real `viral +N` bonus instead of making every unavailable lookup look like a genuine zero. If X temporarily errors, the last cached viral result is preserved as stale rather than reset to zero.

Recommended Railway variables:
```
X_INTEL_ENABLED=true
X_PRELAUNCH_RADAR_ENABLED=false
X_HYPE_CACHE_SECONDS=600
X_TOKEN_SEARCH_MAX_RESULTS=10
X_TOKEN_SEARCH_MAX_QUERIES=1
X_HYPE_MIN_LIQUIDITY_USD=500
VIRAL_SHORTLIST_PER_SCAN=1
```

# Broke Cat Bot V11.14 🐱

V11.14 keeps the existing V11.13 discovery engine and turns Broke Cat into a multi-lane meme-coin discovery and execution engine while preserving the hard bundle/dev/holder safety gates from V8.x.

## What changed

## V9.8 Minimum Live Trade Guard

- `MIN_TRADE_USD` now controls the minimum live buy size (default `$5`).
- Broke Cat **does not round a smaller risk-based position up to $5**. If its dynamic sizing calculates less than the minimum, it skips the trade. This preserves the hard 30% wallet cap.
- Example: a $10.81 wallet has a 30% ceiling of about $3.24, so no live buy can occur until the calculated position reaches at least $5.
- A skipped small position does not crash the scanner; Broke Cat continues evaluating the next candidate.
- Startup no longer fails merely because the wallet cannot currently produce a $5 position; it can continue scanning while preserving the SOL reserve.

Railway variable:
```env
MIN_TRADE_USD=5
```



## V9.5 Rapid Runner Watchlist
A rejection is no longer automatically the end of the story for a newborn or near-passing coin.

- Coins within 10 points of `MIN_SCORE` are placed on a rapid watchlist.
- Very new coins (default <=10 minutes) rejected because liquidity is not ready or bundle/launch data is still `UNKNOWN` are also watched when they have at least a meaningful preliminary score.
- Every revisit fetches fresh pool/market data and reruns the full risk + score calculation. Old scores are not reused.
- Rapid-watch candidates bypass the normal `CANDIDATE_SEEN_COOLDOWN_SECONDS` while their scheduled recheck is due.
- High bundle/dev/holder risk is never watchlisted as a reason to eventually "hope" it becomes safe; hard risk rejects remain hard rejects.
- Candidates expire from rapid watch after the configured age/time window or sustained deterioration, preventing an endless API-call queue.

Defaults require no Railway changes. Optional controls:
```env
```


### 1) Four opportunity lanes
- **Pre-Launch Priority** — X intelligence looks for upcoming Solana launches, high-engagement launch posts, watched project accounts, and posted contract addresses.
- **Early Cat** — prioritizes very young, low-market-cap pairs so the scanner can evaluate launches before most of the move is gone.
- **Momentum Cat** — looks for accelerating volume/buy pressure in coins that are already moving.
- **Big Potential Cat** — keeps established/high-attention coins in the discovery set so the bot does not ignore a strong opportunity simply because it is no longer brand new.

DEX Screener profiles, latest boosts, top boosts, ads/community takeover feeds, user watch addresses, and X-discovered contract addresses are combined into discovery. Paid DEX boosts are discovery context only; they do not bypass safety.

### 2) X pre-launch / viral intelligence
Posting credentials and intelligence credentials are separate.

Existing X posting still uses:
- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`

For X search/stream intelligence add an **X Bearer Token**:
- `X_BEARER_TOKEN`
- `X_INTEL_ENABLED=true`

Optional near-real-time Filtered Stream:
- `X_STREAM_ENABLED=true`

This can consume paid X API usage. Leave it `false` until you intentionally want the live stream running.

Optional official/project accounts to watch:
`X_OFFICIAL_WATCH_ACCOUNTS=project1,project2`

The radar never buys a project merely because it is viral. A discovered CA is moved to the front of the queue, then the normal on-chain safety gates run.


### 3) Multilingual ticker + hype intelligence
V9.5 adds multilingual discovery so Broke Cat does not depend on English-only token names or launch posts.

- Original Unicode token names and symbols are preserved and searched directly on X.
- Contract-address search remains the strongest language-independent identity signal.
- Cyrillic and Greek names/tickers also receive deterministic Latin transliteration variants (for example `КОТ` -> `KOT`).
- Latin names receive accent-folded variants where useful.
- Unicode tickers are searched as quoted text even when X cashtag syntax would not reliably understand them.
- Pre-launch radar adds compact launch-phrase query groups for English, Spanish/Portuguese/French/Italian/German, Russian/Ukrainian/Turkish/Arabic, and Chinese/Japanese/Korean.
- Launch-post scoring recognizes multilingual launch / contract-address wording.
- X hype results record detected languages/scripts so analytics can show when attention is crossing language communities.

This does **not** translate or alter a contract address, and language/hype still cannot override the bundle/dev/holder/liquidity safety gates. For Chinese/Japanese/Korean names, the exact Unicode name + contract address remain primary because automatic romanization without an authoritative project alias can create false matches.

New Railway options:
```env
X_MULTILINGUAL_INTEL_ENABLED=true
X_MULTILINGUAL_QUERY_GROUPS=4
```

### 4) Viral bonus
A small bonus (default max +15) can be added for recent X mentions, unique authors, engagement, and CA sharing. Viral points can help a safe token qualify but **cannot override**:
- high bundle/linked-wallet risk
- high dev/mint/freeze risk
- high holder concentration
- unverified launch risk
- minimum liquidity/market-cap gates

### 5) Staggered profit taking + moon bag
Default live exit plan:
- +10%: sell 15% of the original position
- +20%: sell 20%
- +35%: sell 20%
- +60%: sell 20%
- approximately 25% remains as the moon bag

A hard emergency stop defaults to -35%. Emergency on-chain/liquidity deterioration can still close the remaining active position because safety outranks the moon bag. After the final +60% tier, the remaining ~25% is detached into a tracked moon-bag holding so it no longer blocks Broke Cat from scanning/opening the next active trade; V9.5 marks those holdings for wallet-equity/X totals.

Larger partial exits can be split into smaller Jupiter swaps using `MAX_EXIT_CHUNK_USD`.

### 6) Dynamic risk sizing — hard max 30%
V9.5 defaults to `POSITION_SIZING_MODE=dynamic`. Every approved entry is sized from the **current wallet value**, so the bot automatically has more deployable capital as the wallet grows without a fixed-dollar ceiling.

Default allocation bands begin around 5% for a barely-qualified setup and can rise toward 30% for the strongest low-risk setup. Allocation is reduced/capped by medium bundle risk, medium holder risk, linked-wallet supply, thin liquidity, and the configured position-to-liquidity limit.

`DYNAMIC_MAX_POSITION_PCT=30` is additionally hard-capped at **30% in code**, even if a higher environment value is entered. `DYNAMIC_MAX_POSITION_USD=0` means no additional fixed-dollar cap. The SOL reserve remains protected.

This sizing system does **not** weaken entry safety gates. A token that fails bundle/dev/holder/liquidity rules is still rejected rather than receiving a smaller trade.

### 7) Rejection analytics
V9 saves `/data/broke-cat-analytics.json` and periodically logs a rejection report containing candidate counts, rejection reasons, lane counts, and the closest rejected opportunities. This lets you tune the bot from actual data instead of guessing.

### 8) X personality + wallet totals
Trade posts include the updated wallet/equity value after buys, partial sells and full closes, plus rotating Broke Cat office jokes such as “Just another day at the office.”

For a partial sell the value includes mark-to-market value of the remaining token position; after a full close the value is the wallet SOL value.


### 9) Two-hour X heartbeat
If X posting is enabled and Broke Cat has completed scans but made no trade action for the configured interval, it posts a rotating status such as “Cat still working — just nothing worth the risk right now” with the current wallet value.

Defaults:
- `X_IDLE_POSTING_ENABLED=true`
- `X_IDLE_POST_HOURS=2`

It posts at most once per interval. If a position is already open, it uses a holding-status message instead of claiming no setup was worth the risk. Any buy, partial sell, or full sell resets the no-trade timer.

## Existing Railway variables that stay
Keep your existing secrets/config:
- `HELIUS_API_KEY`
- `JUPITER_API_KEY`
- `BS58_PRIVATE_KEY`
- `EXPECTED_WALLET_ADDRESS`
- `DATA_DIR=/data`
- X posting OAuth variables

Never put private keys or API secrets in GitHub.

## Recommended V9.4 variables for the current test
```env
TRADING_MODE=live
LIVE_TRADING_ACK=I_UNDERSTAND_REAL_FUNDS_ARE_AT_RISK
POSITION_SIZING_MODE=dynamic
DYNAMIC_MIN_POSITION_PCT=5
DYNAMIC_MAX_POSITION_PCT=30
DYNAMIC_MAX_POSITION_USD=0
MAX_POSITION_TO_LIQUIDITY_PCT=0.5
MAX_DAILY_LOSS_USD=3
MIN_SCORE=85
MIN_SOL_RESERVE=0.003
HARD_STOP_PCT=35
POLL_SECONDS=30

TP1_GAIN_PCT=10
TP1_SELL_PCT=15
TP2_GAIN_PCT=20
TP2_SELL_PCT=20
TP3_GAIN_PCT=35
TP3_SELL_PCT=20
TP4_GAIN_PCT=60
TP4_SELL_PCT=20
MOON_BAG_PCT=25

X_INTEL_ENABLED=true
X_MULTILINGUAL_INTEL_ENABLED=true
X_MULTILINGUAL_QUERY_GROUPS=4
X_STREAM_ENABLED=false
X_BEARER_TOKEN=
X_OFFICIAL_WATCH_ACCOUNTS=
ANALYTICS_EVERY_SCANS=10
X_IDLE_POSTING_ENABLED=true
X_IDLE_POST_HOURS=2
```

`X_BEARER_TOKEN` is optional. Without it, live trading/scanning continues but the pre-launch and viral X intelligence layer remains off.

## Safety note
Broke Cat is experimental trading software. Meme coins can lose most or all of their value extremely quickly, and a configured stop is not a guaranteed execution price. Keep the bot wallet isolated from long-term funds and increase capital only after reviewing actual fills, slippage, drawdowns and trade history.


## V9.4 Cross-Platform Runner Engine

V9.5 adds independent discovery/confirmation feeds without allowing social hype to override the existing bundle/dev/holder/liquidity hard gates.

- **GeckoTerminal:** keyless Solana new-pool + trending-pool discovery as an independent market confirmation feed.

Cross-platform confirmation is deliberately capped (`CROSS_PLATFORM_BONUS_MAX`, default 8). It can lift a clean setup but **cannot bypass hard on-chain safety blocks**. A candidate log now shows `cross N (+B)` for number of independent confirmations and bonus points.

### Optional Railway variables
```env
CROSS_PLATFORM_RUNNER_ENABLED=true
CROSS_PLATFORM_BONUS_MAX=8
RUNNER_FEED_POLL_SECONDS=60
RUNNER_FEED_MAX_ADDRESSES=60



GECKOTERMINAL_ENABLED=true

```

If a key is missing, that feed reports itself disabled and the bot continues with the remaining feeds.


## V9.4 — Liquidity Intelligence Engine
V9.4 no longer panic-sells because one entry pool reports a large liquidity drop. While a live position is open it re-resolves the token's highest-liquidity Solana pool, detects pool migration, requires repeated bad readings, and asks Jupiter for a quote-only full-position exit estimate before a liquidity warning can become an emergency sell.

Default guard bands:
- 50–70% liquidity drop: warning / hold
- 70–85% drop: danger; needs 3 readings plus weak sellability, weak price, or sell pressure
- 85%+ drop: critical; needs 2 readings plus an additional confirmation

Hard dev, linked-wallet/bundle, and holder-risk changes remain independent emergency exits. `HARD_STOP_PCT` is also unchanged.

Optional Railway overrides (the defaults are already compiled in):
```env
LIQUIDITY_RECHECK_SECONDS=30
LIQUIDITY_WARNING_DROP_PCT=50
LIQUIDITY_DANGER_DROP_PCT=70
LIQUIDITY_CRITICAL_DROP_PCT=85
LIQUIDITY_CONFIRMATIONS_REQUIRED=3
LIQUIDITY_CRITICAL_CONFIRMATIONS_REQUIRED=2
LIQUIDITY_MIN_EXIT_EFFICIENCY_PCT=75
LIQUIDITY_CRITICAL_EXIT_EFFICIENCY_PCT=60
LIQUIDITY_CONFIRM_PRICE_DROP_PCT=-15
LIQUIDITY_MIN_BUY_SELL_RATIO=0.6
```


## V9.8 trajectory-aware Rapid Runner Watchlist
Rapid Watch now ranks and labels watched newborn tokens as IMPROVING, STALLED, or DETERIORATING using fresh score, market-cap growth, liquidity emergence/growth, viral bonus, cross-platform confirmations, buyer count, 5m volume, and price momentum. Improving tokens receive faster priority rechecks. Tokens older than the zero-liquidity grace window that remain stalled with $0 liquidity are dropped after repeated checks, reducing wasted API calls without discarding newborns that are measurably gaining traction. Hard bundle/dev/holder risk still overrides trajectory.


## V10.0 — Wide Runner Radar
V10.0 fixes the discovery blind spot where a token could become a major runner after its newborn window and never reach scoring. Discovery no longer truncates the address list before loading market data. It batches up to 30 token addresses per DexScreener request, ranks the full discovery universe by priority, runner status, volume, liquidity and momentum, then processes the strongest candidates. GeckoTerminal trending and new-pool coverage is expanded across multiple pages while remaining below its public request-rate ceiling at the default 60-second feed refresh. Strong runners (default: $50k-$10m MC, $10k+ liquidity, $3k+ 5m volume plus 5m/1h momentum, buyer pressure or volume acceleration) are prioritized for scoring even when older than the newborn window. Hard bundle/dev/holder/liquidity safety gates remain unchanged.


## v10.2 Platform Trend Radar
- Platform trending is a discovery/priority signal, never an automatic trade signal.
- GeckoTerminal trending pools remain active with no extra key when GECKOTERMINAL_ENABLED=true.
- Fomo publicly documents trending/social discovery but no stable public developer feed is wired here; do not depend on reverse-engineered private endpoints.
- Trend candidates still pass normal Runner Evidence and hard Helius/risk gates.

## v10.4 — 5-minute score revisit queue
Rapid Watch has been removed. Candidates that complete scoring at **68/100 or higher** but are not yet entry-ready are queued for a revisit every **5 minutes**. A revisit remains in the queue only while its score stays at least 68; it leaves immediately if it qualifies for entry, drops below 68, or reaches the default 60-minute revisit window. The main discovery loop continues at `POLL_SECONDS` and is no longer accelerated by watched newborns.


## v10.8 — Early Runner scoring profile
Tokens in the first 15 minutes now use a dedicated early-runner market profile instead of being forced to meet the same raw 5-minute-volume standard as established runners. The buy threshold remains 85 and all Axiom-style/Helius safety gates remain intact.

Early Runner emphasizes: liquidity quality, liquidity velocity between observations, volume acceleration, buyer pressure, transaction participation quality, and 5m volume relative to liquidity. Raw 5m volume is deliberately lower weight with default points at $200/$500/$1,000/$2,500 rather than requiring mature-runner volume. After 15 minutes the bot automatically returns to the established v7-style core scoring profile. Social/viral remains optional bonus evidence and cannot be required for entry.


## v11.6 Railway stability
- Railway starts Node directly instead of through npm, so normal SIGTERM deploy shutdowns no longer appear as npm command failures.
- /health is local-only and never waits on wallet/RPC/API calls.
- Restart policy is ON_FAILURE.
- SIGTERM/SIGINT are handled as clean shutdowns.
