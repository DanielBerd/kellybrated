# Manifolio (single-file rebuild)

A Kelly criterion bet size calculator for [Manifold Markets](https://manifold.markets) — a lightweight replacement for the now-broken [manifol.io](https://manifol.io/), rebuilt as a single HTML page with plain JavaScript. No build step, no dependencies.

**Live site:** https://danielberd.github.io/kelly-manifold/

## How it works

Enter your Manifold username, a market URL, and your probability estimate. The calculator recommends the bet that maximizes expected log wealth, accounting for:

- **Market liquidity** — your bet moves the price (Manifold's Maniswap CPMM math), so recommendations shrink in thin markets.
- **Your existing position** in the market.
- **Loans** — bankroll is balance minus loans.
- **Deferral factor** (fractional Kelly): the calculation uses a probability that is f of the way from the market's estimate to yours. 50% (the default) is equivalent to half-Kelly.

It ignores limit orders in the order book and correlations with the rest of your portfolio (unlike the full [manifolio](https://github.com/Will-Howard/manifolio), which this is a simplified rebuild of).

Optionally, paste your Manifold API key (from your [profile page](https://manifold.markets/profile)) to place the bet directly. The key is only ever sent to the Manifold API.

## Development

Everything is in `index.html`. To preview locally on Windows without node/python:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1   # serves on http://localhost:8123
```
