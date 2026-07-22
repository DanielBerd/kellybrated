// Shared core for the Kellybrated calculator surfaces (website pages and the
// browser-extension popup). Pure math + fetch helpers — no DOM, no UI. Loaded
// as a plain script; exposes a `Kelly` global.
//
// NOTE: the browser extension can't load a page-origin script under MV3's CSP,
// so extension/kelly.js is a vendored copy of this file — keep the two in sync.
"use strict";
(function (root) {
  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    let body = null;
    try { body = await res.json(); } catch (e) { /* non-JSON response */ }
    if (!res.ok) {
      throw new Error((body && (body.message || body.error)) || res.status + " " + res.statusText);
    }
    return body;
  }

  // Golden-section maximization of a unimodal f over [lo, hi].
  function goldenMaximize(f, lo, hi, iters = 100) {
    const phi = (Math.sqrt(5) - 1) / 2;
    let a = lo, b = hi;
    let c = b - phi * (b - a), d = a + phi * (b - a);
    let fc = f(c), fd = f(d);
    for (let i = 0; i < iters; i++) {
      if (fc > fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = f(c); }
      else         { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = f(d); }
    }
    const x = (a + b) / 2;
    return { x, fx: f(x) };
  }

  // ---------- Manifold Maniswap CPMM (mirrors manifold's calculate-cpmm.ts) ----------
  function cpmmProbability(pool, p) {
    return (p * pool.NO) / (p * pool.NO + (1 - p) * pool.YES);
  }
  function cpmmShares(pool, p, bet, outcome) {
    const y = pool.YES, n = pool.NO;
    const k = Math.pow(y, p) * Math.pow(n, 1 - p);
    return outcome === "YES"
      ? y + bet - Math.pow(k * Math.pow(bet + n, p - 1), 1 / p)
      : n + bet - Math.pow(k * Math.pow(bet + y, -p), 1 / (1 - p));
  }
  // Shares received and resulting market probability from betting `bet` on `outcome`.
  function betInfo(market, bet, outcome) {
    if (bet <= 0) return { shares: 0, newProb: cpmmProbability(market.pool, market.p) };
    const shares = cpmmShares(market.pool, market.p, bet, outcome);
    const newPool = outcome === "YES"
      ? { YES: market.pool.YES + bet - shares, NO: market.pool.NO + bet }
      : { YES: market.pool.YES + bet, NO: market.pool.NO + bet - shares };
    return { shares, newProb: cpmmProbability(newPool, market.p) };
  }

  // ---------- Polymarket CLOB order-book sizing ----------
  // Parse a token's raw ask list into ascending price levels once, so the
  // optimizer can walk them repeatedly without re-sorting. `notional` is the
  // total USDC of liquidity available on the book.
  function parseBook(asks) {
    const levels = (asks || [])
      .map((l) => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))
      .filter((l) => l.price > 0 && l.size > 0)
      .sort((a, b) => a.price - b.price);
    return { levels, notional: levels.reduce((s, l) => s + l.price * l.size, 0) };
  }
  // Market-buy `budget` USDC against pre-parsed ascending `levels`.
  function walkAsks(levels, budget) {
    let remaining = budget, shares = 0, lastPrice = levels[0] ? levels[0].price : null;
    for (const lvl of levels) {
      if (remaining <= 0) break;
      const levelCost = lvl.price * lvl.size;
      if (levelCost <= remaining) { shares += lvl.size; remaining -= levelCost; }
      else { shares += remaining / lvl.price; remaining = 0; }
      lastPrice = lvl.price;
    }
    return { shares, newProb: lastPrice };
  }

  root.Kelly = { fetchJSON, goldenMaximize, cpmmProbability, betInfo, parseBook, walkAsks };
})(typeof self !== "undefined" ? self : this);
