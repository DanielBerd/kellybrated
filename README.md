# Kellybrated

A Kelly criterion bet size calculator for [Manifold Markets](https://manifold.markets) — a lightweight replacement for the currently broken [manifol.io](https://manifol.io/).

**Live site:** https://danielberd.github.io/kellybrated/

There is also a bare-bones variant at [/mini.html](https://danielberd.github.io/kellybrated/mini.html)

## How it works

Enter your Manifold username, a market URL, and your probability estimate. The calculator recommends the bet that maximizes expected log wealth, accounting for:

- **Market liquidity** — your bet moves the price, so recommendations shrink in thin markets.
- **Your existing position** in the market.
- **Loans** — bankroll is balance minus loans by default; every variant has an "ignore loans" toggle to use the full balance instead.
- **Kelly factor** ([fractional Kelly](https://www.lesswrong.com/posts/TNWnK9g2EeRnQA8Dg/never-go-full-kelly)): the calculation uses a probability that is f of the way from the market's estimate to yours. 50% (the default) is equivalent to half-Kelly.

Optionally, paste your Manifold API key (from your profile's account settings) to place the bet directly from the full page. The key is only ever sent to the Manifold API.

## Userscript (Greasemonkey / Tampermonkey / Violentmonkey)

`user-script/kellybrated.user.js` puts the calculator directly on Manifold itself: whenever you browse to a binary market, a small collapsible "Kellybrated" panel appears in the bottom-right corner.

To install open:

```
https://raw.githubusercontent.com/DanielBerd/kellybrated/main/user-script/kellybrated.user.js
```

### Polymarket userscript

`user-script/kellybrated-polymarket.user.js` does the same on Polymarket binary market pages. Differences from the Manifold one: enter your wallet address (shown on your Polymarket profile) so the panel can look up your existing position. Install from:

```
https://raw.githubusercontent.com/DanielBerd/kellybrated/main/user-script/kellybrated-polymarket.user.js
```

There's also a standalone page version at [/polymarket-mini.html](https://danielberd.github.io/kellybrated/polymarket-mini.html).

## Browser extension

`extension/` contains a small Chrome/Firefox extension (one shared codebase, Manifest V3) with the same compact panel as the userscript.

### Install in Chrome

1. Download this repository (Code → Download ZIP, then unzip — or `git clone`).
2. Open `chrome://extensions`, enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder.

### Install in Firefox

Temporary (resets when Firefox restarts): open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick `extension/manifest.json`.

For a permanent install, Firefox requires the extension to be signed: zip the contents of `extension/` and submit it at [addons.mozilla.org](https://addons.mozilla.org/developers/) ("on your own" / unlisted is fine), then install the signed `.xpi` it gives back.

Firefox treats host permissions as opt-in: to let the extension auto-detect your username, open the extension's **Permissions** tab in `about:addons` and enable access for manifold.markets.
