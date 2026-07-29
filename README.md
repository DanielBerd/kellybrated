# Kellybrated

A Kelly criterion bet size calculator for [Manifold Markets](https://manifold.markets) — a lightweight replacement for the currently broken [manifol.io](https://manifol.io/).

**Live site:** https://danielberd.github.io/kellybrated/

**Userscript:** https://raw.githubusercontent.com/DanielBerd/kellybrated/main/user-script/kellybrated.user.js

There is also a bare-bones variant at [/mini.html](https://danielberd.github.io/kellybrated/mini.html)

## How it works

Enter your Manifold username, a market URL, and your probability estimate. The calculator recommends the bet that maximizes expected log wealth, accounting for:

- **Market liquidity** — your bet moves the price, so recommendations shrink in thin markets.
- **Your existing position** in the market.
- **Loans** — bankroll is balance minus loans by default; every variant has an "ignore loans" toggle to use the full balance instead.
- **Kelly factor** ([fractional Kelly](https://www.lesswrong.com/posts/TNWnK9g2EeRnQA8Dg/never-go-full-kelly)): the calculation uses a probability that is f of the way from the market's estimate to yours. 50% (the default) is equivalent to half-Kelly.

Optionally, paste your Manifold API key (from your profile's account settings) to place the bet directly from the full page. The key is only ever sent to the Manifold API.

### Polymarket versions

**Minimal site:** https://danielberd.github.io/kellybrated/polymarket-mini.html

**Userscript:** https://raw.githubusercontent.com/DanielBerd/kellybrated/main/user-script/kellybrated-polymarket.user.js
