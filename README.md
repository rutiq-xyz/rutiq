# Rutiq

Rutiq is a studio for rule-based trading agents on Robinhood Chain, for people who want to know how a strategy behaves before trusting it. You write a rule in plain conditions, backtest it on Chainlink price rounds that anyone can re-read on chain, then run it on paper against live prices with a log that says why it bought, sold or waited. Every close it uses carries its Chainlink round number, so a result can be checked number by number instead of taken on trust.

Rule-based trading agents planned for Robinhood Chain. Backtesting, paper trading & decision logs.

## Read this before anything else

This repository is the working code behind https://rutiq.xyz.

- **Paper only.** Backtests and paper agents use virtual cash. There are no deposits, no vaults, no orders and no trades. Trading with real funds is a later stage and is not built.
- **Live data is real.** Prices are Chainlink rounds on Robinhood Chain (ETH/USD and five stock-token feeds). The round history ships as a snapshot and newer rounds are read live from the feeds; every close can be re-proven from the browser with `getRoundData`.
- **The contract is live and verified.** `RutiqDecisionLog` is deployed on Robinhood Chain at `0x358b68b486b52a062da5a3deb8a568109a905307` and its source is verified on Blockscout. It records paper decisions and refuses any decision the rule would not make at the referenced rounds. It holds no funds.
- **Planned, not built:** real-fund execution, $RUTIQ as compute credits for longer tests and more paper agents, more condition types.
- **What nothing here claims:** that a rule is profitable, that a backtest predicts anything, that stock tokens are shares, or that $RUTIQ has any value. Simulated results never guarantee profit and are not advice. Rutiq is not affiliated with Robinhood.

## Layout

| Path | What it is |
|---|---|
| `src/app/` | Pages (home, studio, paper, log, data, docs, token) and API routes (`/api/history`, `/api/latest`, `/api/chain`, `/api/rpc`). |
| `src/components/` | Interface components: rule editor, backtest views, paper agents, decision log, wallet dialog. |
| `src/config/` | `brand.ts` (name, ticker, token address, links), `contracts.ts` (deployed contract address), `markets.generated.ts` (proven markets). |
| `src/lib/engine/` | The rule engine: bar closes from rounds, conditions, decisions, paper accounting, backtests, explanations. Same integer math as the contract. |
| `src/lib/` | Chain reads, the hardened RPC relay, rate limits. |
| `src/data/rounds/` | Snapshot of every Chainlink round of the six feeds (immutable data, re-readable on chain). |
| `contracts/` | Solidity sources (`src/`), Foundry tests (`test/`) and parity fixtures written by the site's engine. |
| `scripts/` | Market proof, round snapshot, parity fixtures, `verify-deployment` and the contract artifact builder. |
| `public/` | Static images and wallet icons. |

## Run the tests

Node.js 20 or newer.

```
npm install
npm run typecheck
npm test
```

Contracts use [Foundry](https://book.getfoundry.sh/):

```
cd contracts
bash setup.sh
forge test --no-match-contract Fork
forge test --match-contract Fork --fork-url https://rpc.mainnet.chain.robinhood.com --evm-version cancun
```

### What was checked for this snapshot

2026-11-23 (UTC), Node.js 25.8, forge 1.5.1: typecheck exit 0, lint clean, `npm test` 35 pass / 0 fail (engine tests include a backtest over the real ETH/USD round history and a check that the site's ABI matches the compiled contract), `next build` 17 routes, `forge test` 23 passed (16 unit, 4 parity replays of 991 bars where the site and the contract must agree on every action, reason, cash and units value, 2 invariants with a handler sanity test), 2 fork tests against Robinhood Chain with the real ETH/USD and NVDA/USD feeds. Browser end-to-end run on a local fork of Robinhood Chain with the contract deployed there: 7 of 7 passed (wallet dialog, studio backtest with an on-chain round proof, refusal of an invalid rule, paper agent, register and commit against the contract, price data proof, 390 px layout), and `verify-deployment` printed MATCH for that deployment and MISMATCH for a wrong address. Mainnet, 2026-11-23: `RutiqDecisionLog` deployed at `0x358b68b486b52a062da5a3deb8a568109a905307` (block 121,273,701); `verify-deployment` printed MATCH (chain id 4663, runtime code and creation input identical to this build), the creation receipt names the same address, and the source is verified on Blockscout. Not run against mainnet: commits from a real wallet (they were exercised on the fork).

## Look at the site

```
npm install
npm run build
npm start
```

Open http://localhost:6640. The studio, paper trading and price data work with no configuration (public Robinhood Chain RPC). Optional variables: `ROBINHOOD_RPC_URL` (an https RPC URL for server reads), `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (32 hex characters; without it WalletConnect shows "Not configured on this site yet").

## Contracts

| Contract | Address | Explorer |
|---|---|---|
| `RutiqDecisionLog` (with the internal library `RutiqRuleMath`) | `0x358b68b486b52a062da5a3deb8a568109a905307` | [Blockscout](https://robinhoodchain.blockscout.com/address/0x358b68b486b52a062da5a3deb8a568109a905307?tab=contract) |

A wallet registers a rule (feed, bar length, entry and exit condition, size, fee, stop-loss, take-profit, daily entry limit, UTC schedule, stale-price limit, starting paper cash). For each bar it may commit the decision with the Chainlink round ids of the closes the rule needs. The contract proves each close (published before the bar end, the next round after it), recomputes the rule and accepts only the decision it really makes, then updates the paper account. Bars before registration cannot be committed and skipped bars are counted. It has no owner, no admin, no fee, no upgrade and holds no funds.

## Verify a deployment

```
npm run verify-deployment -- --log 0x358b68b486b52a062da5a3deb8a568109a905307 --log-tx 0x73142f00ccbaec8aba6c860df41010cf1a9cf685c03f3542234b7824f7dac8e9
```

The script compares the bytecode on Robinhood Chain with the build in this repository and prints MATCH or the first difference.

## Add the network to your wallet

| Field | Value |
|---|---|
| Network | Robinhood Chain |
| Chain ID | 4663 |
| Currency | ETH |
| RPC | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com |

The site offers to add it when you connect.

## Data sources and limits

- **Chainlink feeds on Robinhood Chain** (ETH/USD, NVDA, TSLA, AAPL, SPY, QQQ): the round history snapshot plus newer rounds read live (cached 60 s; a failed read is never cached and the last complete history is served with `complete: false`). Latest rounds of all feeds are cached 15 s.
- **Stock tokens** are listed only after an on-chain check of the proxy code, its beacon, its supply and its exact symbol. They are tokens on Robinhood Chain, not shares.
- Stock feeds publish during the US session and on price moves; outside it a price can be many hours old. The rule's stale-price limit makes the agent wait, and the log says so.
- Fills are modelled at the proven close of the decision bar with one fee-and-slippage setting. Real execution would be worse.
- Anything that cannot be read is shown as "—", never filled in.

## Token

$RUTIQ is the community token of Rutiq on Robinhood Chain. Contract address: announced on https://rutiq.xyz at launch. It has no promised value. Its planned use is compute credits for longer backtests and more simultaneous paper agents, once those services exist; everything here works without it.

## Deploy your own

1. Import the repository into a Next.js host (framework preset Next.js, root `./`, build `npm run build`).
2. Optional environment variables:

| Variable | What it is for | Format |
|---|---|---|
| `ROBINHOOD_RPC_URL` | Server reads (rounds, latest prices, relay) | https URL |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Browser and server reads, public | https URL |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect in the wallet dialog | 32 hex characters |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Shared rate-limit store | https URL, token string |
| `STORE_KEY_PREFIX` | Key prefix in that store | short string ending in `:` |

3. After the deploy: `/` answers 200, `/api/latest` lists six markets with prices, `/api/history?market=ETH` returns `"complete": true`, `/log` shows the contract as live on chain.
4. Contract: no constructor arguments. To deploy your own `RutiqDecisionLog`, use `forge create`, put the address, block and transaction into `src/config/contracts.ts`, then run `npm run verify-deployment`.
5. Refresh the data when you like: `RPC_URL=<rpc> npm run markets` and `RPC_URL=<rpc> npm run rounds`.

## Contributing

Fork the repository, branch from `main`, and run `npm run typecheck`, `npm test` and `npm run build`, and `bash setup.sh && forge test` in `contracts/` before opening a pull request. If you change the rule math, change it in both `src/lib/engine/rules.ts` and `contracts/src/RutiqRuleMath.sol`, then regenerate the parity fixtures with `npx tsx scripts/make-parity-fixture.ts`. For a bug, open an issue with the expected and actual behavior and minimal steps. Keep private keys, seed phrases and environment values out of issues.

## Security

Please do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. The contracts, the API routes (including the RPC relay) and transaction building are in scope; wallets, RPC providers, explorers, price feeds and launchpads are not. There is no bug bounty.

## Notices and license

This project's original code is released under the [MIT License](LICENSE). Self-hosted fonts: Inter, Manrope and Roboto Mono under the SIL Open Font License (license files in `src/fonts/`). Wallet logos in `public/wallets/` belong to their projects and are used only to identify each wallet. The Rutiq name, logo and artwork belong to the project and are not licensed for reuse as a brand.
