# Broke Cat Bot V9.6 🐱

V9.5 keeps the V9 discovery engine and turns Broke Cat into a multi-lane meme-coin discovery and execution engine while preserving the hard bundle/dev/holder safety gates from V8.x.

## What changed

## V9.6 Minimum Live Trade Guard

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
- Hot near-pass candidates can be rescored every 10 seconds; normal rapid-watch candidates default to 15 seconds.
- Every revisit fetches fresh pool/market data and reruns the full risk + score calculation. Old scores are not reused.
- Rapid-watch candidates bypass the normal `CANDIDATE_SEEN_COOLDOWN_SECONDS` while their scheduled recheck is due.
- The bot logs score movement such as `RAPID WATCH CAT 81->84 (+3)` and immediately becomes entry-eligible if the fresh score/safety gates pass.
- High bundle/dev/holder risk is never watchlisted as a reason to eventually "hope" it becomes safe; hard risk rejects remain hard rejects.
- Candidates expire from rapid watch after the configured age/time window or sustained deterioration, preventing an endless API-call queue.

Defaults require no Railway changes. Optional controls:
```env
RAPID_WATCH_ENABLED=true
RAPID_WATCH_RECHECK_SECONDS=15
RAPID_WATCH_HOT_RECHECK_SECONDS=10
RAPID_WATCH_SLOW_RECHECK_SECONDS=30
RAPID_WATCH_SCORE_MARGIN=10
RAPID_WATCH_NEWBORN_MAX_AGE_MINUTES=10
RAPID_WATCH_MAX_AGE_MINUTES=20
RAPID_WATCH_MAX_MINUTES=15
RAPID_WATCH_MAX_TOKENS=30
RAPID_WATCH_MAX_DECLINES=3
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
- +50%: sell 15% of the original position
- +100%: sell 20%
- +200%: sell 20%
- +400%: sell 20%
- approximately 25% remains as the moon bag

A hard emergency stop defaults to -35%. Emergency on-chain/liquidity deterioration can still close the remaining active position because safety outranks the moon bag. After the final +400% tier, the remaining ~25% is detached into a tracked moon-bag holding so it no longer blocks Broke Cat from scanning/opening the next active trade; V9.5 marks those holdings for wallet-equity/X totals.

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

TP1_GAIN_PCT=50
TP1_SELL_PCT=15
TP2_GAIN_PCT=100
TP2_SELL_PCT=20
TP3_GAIN_PCT=200
TP3_SELL_PCT=20
TP4_GAIN_PCT=400
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

- **Birdeye:** fresh Solana listings, including meme-platform aware discovery when your Birdeye key supports it.
- **Pump.fun / Bitquery:** optional recent Pump.fun creation feed using a Bitquery OAuth API token.
- **GeckoTerminal:** keyless Solana new-pool + trending-pool discovery as an independent market confirmation feed.
- **Telegram/community:** automatically detects Telegram links already attached to token metadata; optional Telegram Bot API channel-post intake is supported only for channels where your bot is actually a member. It does not scrape arbitrary private/public chats.

Cross-platform confirmation is deliberately capped (`CROSS_PLATFORM_BONUS_MAX`, default 8). It can lift a clean setup but **cannot bypass hard on-chain safety blocks**. A candidate log now shows `cross N (+B)` for number of independent confirmations and bonus points.

### Optional Railway variables
```env
CROSS_PLATFORM_RUNNER_ENABLED=true
CROSS_PLATFORM_BONUS_MAX=8
RUNNER_FEED_POLL_SECONDS=60
RUNNER_FEED_MAX_ADDRESSES=60

BIRDEYE_ENABLED=true
BIRDEYE_API_KEY=

BITQUERY_PUMPFUN_ENABLED=true
BITQUERY_API_TOKEN=

GECKOTERMINAL_ENABLED=true

TELEGRAM_INTEL_ENABLED=true
TELEGRAM_INTEL_BOT_TOKEN=
TELEGRAM_INTEL_KEYWORDS=launch,ca,contract,live,pump,solana
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
