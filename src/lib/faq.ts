import { BRAND, CHAIN } from "@/config/brand";

/* Plain answers used on the home page and in the docs (also as FAQ structured data). */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "Is any real money involved?",
    a: `No. ${BRAND.name} is paper only: backtests and paper agents use virtual cash, and the on-chain log records decisions, not trades. There are no deposits, no vaults and no orders. Trading with real funds is a later stage and is not built.`,
  },
  {
    q: "Where do the prices come from?",
    a: `From Chainlink price feeds on ${CHAIN.name}. Every bar close is the latest round a feed had published when the bar ended, with its round number, so anyone can re-read it with getRoundData. Stock feeds follow the US session and go quiet outside it; the rule's stale-price limit keeps it from acting on an old price.`,
  },
  {
    q: "Does a good backtest mean the rule makes money?",
    a: "No. A backtest replays the past. Markets change, a short window can flatter any rule, and real trades face spreads, depth and delays that a fee setting only approximates. Simulated results never guarantee profit and are not advice.",
  },
  {
    q: "What does the on-chain log actually prove?",
    a: "That each committed decision is the one the rule makes at that bar, at prices the contract re-read itself. It does not prove that no bar was skipped (skips are counted on chain and shown), that the rule is good, or that anyone could have traded at those prices.",
  },
  {
    q: "What are stock tokens?",
    a: `Tokens on ${CHAIN.name} that track a share's price. They are not the shares themselves. ${BRAND.name} only lists a stock token after checking on chain that it is the official kind (proxy code, beacon, supply, symbol), and it is not affiliated with Robinhood or any issuer.`,
  },
  {
    q: `Do I need ${BRAND.symbol}?`,
    a: `No. Everything here works without it. ${BRAND.symbol} is planned as compute credits for longer tests and more paper agents once those services exist; it has no other job and no promise of value.`,
  },
];
