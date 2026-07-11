# Kellybrated

A Kelly criterion bet size calculator for [Manifold Markets](https://manifold.markets) — a lightweight replacement for the now-broken [manifol.io](https://manifol.io/), built as plain HTML/JavaScript with no build step and no dependencies. Formerly known as kelly-manifold.

**Live site:** https://danielberd.github.io/kellybrated/

There is also a bare-bones variant at [/mini.html](https://danielberd.github.io/kellybrated/mini.html): same math, no styling, fetches on a button click instead of as you type. No bet placement.

## How it works

Enter your Manifold username, a market URL, and your probability estimate. The calculator recommends the bet that maximizes expected log wealth, accounting for:

- **Market liquidity** — your bet moves the price (Manifold's Maniswap CPMM math), so recommendations shrink in thin markets.
- **Your existing position** in the market.
- **Loans** — bankroll is balance minus loans by default; every variant has an "ignore loans" toggle to use the full balance instead.
- **Kelly factor** ([fractional Kelly](https://www.lesswrong.com/posts/TNWnK9g2EeRnQA8Dg/never-go-full-kelly)): the calculation uses a probability that is f of the way from the market's estimate to yours. 50% (the default) is equivalent to half-Kelly.

It ignores limit orders in the order book and correlations with the rest of your portfolio (unlike the full [manifolio](https://github.com/Will-Howard/manifolio), which this is a simplified rebuild of).

Optionally, paste your Manifold API key (from your profile's account settings) to place the bet directly from the full page. The key is only ever sent to the Manifold API.

## Userscript (Greasemonkey / Tampermonkey / Violentmonkey)

`user-script/kellybrated.user.js` puts the calculator directly on Manifold itself: whenever you browse to a binary market, a small collapsible "Kellybrated" panel appears in the bottom-right corner. Your username is detected from the signed-in session, the probability slider starts at the market's current probability (click the number to type an exact value), and the Kelly factor slider works the same way. Bankroll is balance minus loans, existing positions are accounted for, and the panel follows Manifold's client-side navigation and theme switching live.

To install: with a userscript manager installed, open

```
https://raw.githubusercontent.com/DanielBerd/kellybrated/main/user-script/kellybrated.user.js
```

and the manager will offer to install it (updates are picked up from the same URL). The Kelly factor and collapsed/expanded state persist between visits.

### Polymarket userscript

`user-script/kellybrated-polymarket.user.js` does the same on Polymarket binary market pages. Differences from the Manifold one: enter your wallet address (shown on your Polymarket profile) so the panel can look up your existing position. Your available USDC is read from the "Cash" figure in the signed-in page header (typing a value overrides it — Polymarket has no public balance endpoint to query instead). Bet sizing walks the live CLOB order book instead of a CPMM formula, and the recommendation includes the annualized return to the market's close date. Install from

```
https://raw.githubusercontent.com/DanielBerd/kellybrated/main/user-script/kellybrated-polymarket.user.js
```

There's also a standalone page version at [/polymarket-mini.html](https://danielberd.github.io/kellybrated/polymarket-mini.html).

## Browser extension

`extension/` contains a small Chrome/Firefox extension (one shared codebase, Manifest V3) with the same compact panel as the userscript: click the toolbar button on a binary market page and the popup shows the sliders and recommendation for that market, using the username detected as you browse manifold.markets. An "Open in tab ⧉" button opens the full calculator page (which can also place the bet).

### Install in Chrome

1. Download this repository (Code → Download ZIP, then unzip — or `git clone`).
2. Open `chrome://extensions`, enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder.

### Install in Firefox

Temporary (resets when Firefox restarts): open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick `extension/manifest.json`.

For a permanent install, Firefox requires the extension to be signed: zip the contents of `extension/` and submit it at [addons.mozilla.org](https://addons.mozilla.org/developers/) ("on your own" / unlisted is fine), then install the signed `.xpi` it gives back.

Firefox treats host permissions as opt-in: to let the extension auto-detect your username, open the extension's **Permissions** tab in `about:addons` and enable access for manifold.markets.

## Development

Everything is plain HTML/JS — no build step. To preview the site locally, serve the folder with any static file server (e.g. `python3 -m http.server` or `npx serve`) or just open the files directly in a browser.
