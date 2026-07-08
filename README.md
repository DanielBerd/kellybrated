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

`extension/` contains a small Chrome/Firefox extension (one shared codebase, Manifest V3). Clicking its toolbar button opens the live calculator in a compact dropdown panel (with an "Open in tab ⧉" button for the full page), prefilled with:

- **the market you're viewing**, taken from the current tab's URL if it's a `manifold.markets/{creator}/{slug}` page, and
- **your Manifold username**, which a content script detects from Manifold's cached signed-in user whenever you browse manifold.markets.

Nothing else: no data leaves the browser (the username is stored in the extension's local storage), and the calculator itself also remembers the last username you used, so the button still does the right thing if detection ever breaks.

### Install in Chrome

1. Download this repository (Code → Download ZIP, then unzip — or `git clone`).
2. Open `chrome://extensions`, enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder.

### Install in Firefox

Temporary (resets when Firefox restarts): open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick `extension/manifest.json`.

For a permanent install, Firefox requires the extension to be signed: zip the contents of `extension/` and submit it at [addons.mozilla.org](https://addons.mozilla.org/developers/) ("on your own" / unlisted is fine), then install the signed `.xpi` it gives back.

Firefox treats host permissions as opt-in: to let the extension auto-detect your username, open the extension's **Permissions** tab in `about:addons` and enable access for manifold.markets. Without it the button still works — it prefills the market from the current tab and relies on the calculator's own remembered username.

## Development

Everything is in `index.html`. To preview locally on Windows without node/python:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1   # serves on http://localhost:8123
```
