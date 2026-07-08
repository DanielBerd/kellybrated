# Manifolio (single-file rebuild)

A Kelly criterion bet size calculator for [Manifold Markets](https://manifold.markets) — a lightweight replacement for the now-broken [manifol.io](https://manifol.io/), rebuilt as a single HTML page with plain JavaScript. No build step, no dependencies.

**Live site:** https://danielberd.github.io/kelly-manifold/

There is also a bare-bones variant at [/mini.html](https://danielberd.github.io/kelly-manifold/mini.html): same math, no styling, fetches on a button click instead of as you type. No bet placement.

## How it works

Enter your Manifold username, a market URL, and your probability estimate. The calculator recommends the bet that maximizes expected log wealth, accounting for:

- **Market liquidity** — your bet moves the price (Manifold's Maniswap CPMM math), so recommendations shrink in thin markets.
- **Your existing position** in the market.
- **Loans** — bankroll is balance minus loans by default; both pages have an "ignore loans" toggle to use the full balance instead.
- **Deferral factor** (fractional Kelly): the calculation uses a probability that is f of the way from the market's estimate to yours. 50% (the default) is equivalent to half-Kelly.

It ignores limit orders in the order book and correlations with the rest of your portfolio (unlike the full [manifolio](https://github.com/Will-Howard/manifolio), which this is a simplified rebuild of).

Optionally, paste your Manifold API key (from your [profile page](https://manifold.markets/profile)) to place the bet directly. The key is only ever sent to the Manifold API.

## Browser extension

`chrome-extension/` contains a Chrome extension (adapted from [manifolio's](https://github.com/Will-Howard/manifolio/tree/master/chrome-extension)) that opens the calculator in a popup with the market field prefilled from the manifold.markets page you are on. The original extension points at the dead manifol.io, so it can't fill anything on this site — this copy points here instead.

To install: `chrome://extensions` → enable Developer mode → "Load unpacked" → select the `chrome-extension` folder.

The extension only passes the market URL (`?market=…`); the username field fills itself from the last username you typed, which the page now remembers in localStorage. The calculator also accepts `?user=`/`?username=`, `?prob=` and `?deferral=` query parameters, on both `index.html` and `mini.html`.

## Development

Everything is in `index.html`. To preview locally on Windows without node/python:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1   # serves on http://localhost:8123
```
