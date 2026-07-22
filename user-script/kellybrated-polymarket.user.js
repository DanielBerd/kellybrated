// ==UserScript==
// @name         Kellybrated for Polymarket
// @namespace    https://github.com/DanielBerd/kellybrated
// @version      1.1.2
// @description  Shows the Kelly-optimal bet size in a small panel on Polymarket binary market pages.
// @author       Daniel & Claude
// @match        https://polymarket.com/*
// @grant        none
// @noframes
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/DanielBerd/kellybrated/main/user-script/kellybrated-polymarket.user.js
// @updateURL    https://raw.githubusercontent.com/DanielBerd/kellybrated/main/user-script/kellybrated-polymarket.user.js
// ==/UserScript==

(() => {
  "use strict";
  const GAMMA = "https://gamma-api.polymarket.com";
  const CLOB = "https://clob.polymarket.com";
  const DATA = "https://data-api.polymarket.com";
  const WALLET_KEY = "kellybrated:pm:wallet";
  const BALANCE_KEY = "kellybrated:pm:balance";
  const COLLAPSED_KEY = "kellybrated:pm:collapsed";
  const KELLY_KEY = "kellybrated:pm:kellyFactor";

  const $ = (id) => document.getElementById(id);
  const usd = (x) => "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (x) => (100 * x).toFixed(1) + "%";

  async function j(url) {
    const res = await fetch(url);
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body && (body.message || body.error)) || res.status + " " + res.statusText);
    return body;
  }

  // arrays sometimes come back JSON-encoded as strings from the Gamma API
  function arr(v) {
    if (Array.isArray(v)) return v;
    try { return JSON.parse(v); } catch (e) { return []; }
  }

  // ---------- order-book sizing (same math as polymarket-mini.html) ----------
  // walk a token's ask book to price a market buy of `budget` USDC worth of shares
  // Parse a raw ask list into ascending price levels once, so the optimizer can
  // walk them repeatedly without re-sorting. `notional` is total book liquidity.
  function parseBook(asks) {
    const levels = (asks || [])
      .map((l) => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))
      .filter((l) => l.price > 0 && l.size > 0)
      .sort((a, b) => a.price - b.price);
    return { levels, notional: levels.reduce((s, l) => s + l.price * l.size, 0) };
  }
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
  function maximize(f, lo, hi, iters = 100) {
    const phi = (Math.sqrt(5) - 1) / 2;
    let a = lo, b = hi, c = b - phi * (b - a), d = a + phi * (b - a), fc = f(c), fd = f(d);
    for (let i = 0; i < iters; i++) {
      if (fc > fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = f(c); }
      else         { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = f(d); }
    }
    return (a + b) / 2;
  }

  // ---------- market lookup from the URL ----------
  // Polymarket URLs: /event/<event-slug> (single market), /event/<event-slug>/<market-slug>,
  // or /market/<slug>. Whether a slug names a real binary market is decided by the API.
  function slugCandidates(pathname) {
    const parts = pathname.split(/[?#]/)[0].split("/").filter(Boolean);
    if (parts[0] === "market" && parts.length === 2) return { market: [parts[1]] };
    if (parts[0] === "event" && parts.length === 3) return { market: [parts[2], parts[1]], event: parts[1] };
    if (parts[0] === "event" && parts.length === 2) return { market: [parts[1]], event: parts[1] };
    return null;
  }
  function isBinary(m) {
    const outcomes = arr(m.outcomes).map((o) => String(o).toLowerCase());
    return outcomes.includes("yes") && outcomes.includes("no");
  }
  async function findMarket(pathname) {
    const cand = slugCandidates(pathname);
    if (!cand) return null;
    for (const slug of cand.market) {
      try {
        const found = await j(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}`);
        const m = Array.isArray(found) ? found[0] : found;
        if (m && isBinary(m)) return m;
      } catch (e) { /* try the next candidate */ }
    }
    if (cand.event) {
      // single-market events: resolve via the event's market list
      try {
        const events = await j(`${GAMMA}/events?slug=${encodeURIComponent(cand.event)}`);
        const e = Array.isArray(events) ? events[0] : events;
        const open = ((e && e.markets) || []).filter((m) => isBinary(m) && !m.closed);
        if (open.length === 1) return open[0];
      } catch (e) { /* not an event */ }
    }
    return null;
  }

  // ---------- theming (follow Polymarket's theme live) ----------
  const darkMode = () => {
    const html = document.documentElement;
    if (html.classList.contains("dark") || html.dataset.theme === "dark") return true;
    if (html.classList.contains("light") || html.dataset.theme === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  function applyTheme() {
    const box = $("kelly-panel");
    if (!box) return;
    const dark = darkMode();
    box.style.background = dark ? "#1f2937" : "#fff";
    box.style.color = dark ? "#e5e7eb" : "#111";
    box.style.borderColor = dark ? "#4b5563" : "#bbb";
    for (const el of box.querySelectorAll(".kelly-input")) {
      el.style.background = dark ? "#111827" : "#fff";
      el.style.borderColor = dark ? "#4b5563" : "#999";
      el.style.color = "inherit";
    }
    const out = $("kelly-out");
    if (out) out.style.borderTopColor = dark ? "#4b5563" : "#ccc";
  }
  new MutationObserver(applyTheme)
    .observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

  // ---------- sliders with click-to-type values ----------
  let probPct = null;  // user's probability estimate in %, one decimal
  let kellyPct = 50;   // Kelly factor in %

  function renderVals() {
    const p = $("kelly-prob-val"), k = $("kelly-factor-val");
    if (p) p.textContent = (probPct != null ? String(+probPct.toFixed(1)) : "—") + "%";
    if (k) k.textContent = String(Math.round(kellyPct)) + "%";
  }
  function setProb(v, fromSlider) {
    if (!(isFinite(v) && v >= 0 && v <= 100)) { renderVals(); return; }
    probPct = Math.min(Math.max(Math.round(v * 10) / 10, 0), 100);
    if (!fromSlider && $("kelly-prob")) $("kelly-prob").value = probPct;
    renderVals();
  }
  function setKelly(v, fromSlider) {
    if (!isFinite(v)) { renderVals(); return; }
    kellyPct = Math.min(Math.max(Math.round(v), 0), 100);
    if (!fromSlider && $("kelly-factor")) $("kelly-factor").value = kellyPct;
    try { localStorage.setItem(KELLY_KEY, String(kellyPct)); } catch (e) {}
    renderVals();
  }
  function attachEditable(spanId, getVal, commit) {
    $(spanId).addEventListener("click", () => {
      const span = $(spanId);
      if (span.querySelector("input")) return;
      const inp = document.createElement("input");
      inp.type = "number"; inp.step = "any"; inp.className = "kelly-input";
      inp.style.cssText = "width:64px;font:inherit;padding:0 4px;border:1px solid;border-radius:4px;";
      inp.value = getVal();
      span.textContent = "";
      span.appendChild(inp);
      applyTheme();
      inp.focus(); inp.select();
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
      inp.addEventListener("blur", () => commit(parseFloat(inp.value)), { once: true });
    });
  }

  const validWallet = (w) => /^0x[a-fA-F0-9]{40}$/.test(w);

  // ---------- cash auto-detection from the page header ----------
  // The signed-in header shows "Cash $X.XX" inside a link to /portfolio. Match
  // on that structure and label, not on styling classes, which change often.
  function detectCash() {
    for (const a of document.querySelectorAll('a[href="/portfolio"]')) {
      const t = a.textContent || "";
      if (!/\bCash\b/.test(t)) continue;
      const m = t.match(/\$\s*([\d,]+(?:\.\d+)?)/);
      if (m) return parseFloat(m[1].replace(/,/g, ""));
    }
    return null;
  }
  let balanceManual = false; // a hand-typed balance wins over auto-detection
  function syncCash() {
    const inp = $("kelly-balance");
    if (!inp || balanceManual || document.activeElement === inp) return;
    const cash = detectCash();
    if (cash == null || parseFloat(inp.value) === cash) return;
    inp.value = String(cash);
    try { localStorage.setItem(BALANCE_KEY, inp.value); } catch (e) {}
    refresh(false);
  }

  function buildPanel() {
    const box = document.createElement("div");
    box.id = "kelly-panel";
    box.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:99999;width:280px;" +
      "font:13px/1.4 system-ui,sans-serif;border:1px solid;border-radius:10px;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.25);overflow:hidden;";
    const valCss = "cursor:pointer;font-weight:bold;text-decoration:underline dotted;";
    const inpCss = "width:100%;box-sizing:border-box;font:inherit;padding:2px 4px;border:1px solid;border-radius:4px;margin:2px 0 6px;";
    box.innerHTML = `
      <div id="kelly-head" style="display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;
           background:#2a9d8f;color:#fff;font-weight:bold;">
        <span style="flex:1">Kellybrated</span>
        <span id="kelly-toggle">–</span>
      </div>
      <div id="kelly-body" style="padding:8px 10px;">
        <label for="kelly-wallet" style="display:block;">Wallet address
          <span title="The wallet address shown on your Polymarket profile page — used to look up your position in this market." style="cursor:help;">ⓘ</span></label>
        <input id="kelly-wallet" type="text" class="kelly-input" placeholder="0x…" spellcheck="false" style="${inpCss}">
        <label for="kelly-balance" style="display:block;">Available USDC
          <span title="Auto-detected from the Cash figure in the page header when you're signed in; type a value to override." style="cursor:help;">ⓘ</span></label>
        <input id="kelly-balance" type="number" class="kelly-input" min="0" step="any" style="${inpCss}">
        <label for="kelly-prob" style="display:block;">Your probability estimate —
          <span id="kelly-prob-val" title="Click to type a value" style="${valCss}">—%</span></label>
        <input id="kelly-prob" type="range" min="0" max="100" step="0.5"
               style="width:100%;margin:4px 0 8px;accent-color:#2a9d8f;display:block;">
        <label for="kelly-factor" style="display:block;"><a
             href="https://www.lesswrong.com/posts/TNWnK9g2EeRnQA8Dg/never-go-full-kelly"
             target="_blank" rel="noopener" style="color:#2a9d8f;">Kelly factor</a> —
          <span id="kelly-factor-val" title="Click to type a value" style="${valCss}">50%</span> (50 = half Kelly)</label>
        <input id="kelly-factor" type="range" min="0" max="100" step="1"
               style="width:100%;margin:4px 0 8px;accent-color:#2a9d8f;display:block;">
        <label style="display:block;margin-bottom:6px;">
          <input id="kelly-noposition" type="checkbox"> Ignore my existing position</label>
        <div id="kelly-out" style="white-space:pre-line;border-top:1px solid;padding-top:6px;min-height:1em;"></div>
      </div>`;
    document.body.appendChild(box);
    applyTheme();

    const body = $("kelly-body"), toggle = $("kelly-toggle");
    const setCollapsed = (c) => {
      body.style.display = c ? "none" : "";
      toggle.textContent = c ? "+" : "–";
      try { localStorage.setItem(COLLAPSED_KEY, c ? "1" : ""); } catch (e) {}
    };
    $("kelly-head").addEventListener("click", () => setCollapsed(body.style.display !== "none"));
    try { if (localStorage.getItem(COLLAPSED_KEY) === "1") setCollapsed(true); } catch (e) {}

    let storedKelly = NaN;
    try { storedKelly = parseFloat(localStorage.getItem(KELLY_KEY)); } catch (e) {}
    setKelly(Number.isFinite(storedKelly) ? storedKelly : 50); // isFinite, not ||: 0 is a valid setting
    try { $("kelly-wallet").value = localStorage.getItem(WALLET_KEY) || ""; } catch (e) {}
    try { $("kelly-balance").value = localStorage.getItem(BALANCE_KEY) || ""; } catch (e) {}

    let t;
    const schedule = (refetch, ms) => { clearTimeout(t); t = setTimeout(() => refresh(refetch), ms); };
    $("kelly-wallet").addEventListener("change", () => {
      const w = $("kelly-wallet").value.trim();
      if (validWallet(w)) try { localStorage.setItem(WALLET_KEY, w); } catch (e) {}
      schedule(true, 100); // position depends on the wallet
    });
    $("kelly-balance").addEventListener("input", () => {
      balanceManual = true; // stop auto-detection from fighting the user
      try { localStorage.setItem(BALANCE_KEY, $("kelly-balance").value); } catch (e) {}
      schedule(false, 250);
    });
    $("kelly-prob").addEventListener("input", () => {
      setProb(parseFloat($("kelly-prob").value), true);
      schedule(false, 250);
    });
    $("kelly-factor").addEventListener("input", () => {
      setKelly(parseFloat($("kelly-factor").value), true);
      schedule(false, 250);
    });
    $("kelly-noposition").addEventListener("change", () => schedule(false, 100));
    attachEditable("kelly-prob-val", () => (probPct != null ? String(+probPct.toFixed(1)) : ""),
      (v) => { setProb(v); schedule(false, 0); });
    attachEditable("kelly-factor-val", () => String(Math.round(kellyPct)),
      (v) => { setKelly(v); schedule(false, 0); });
    return box;
  }

  function removePanel() {
    const el = $("kelly-panel");
    if (el) el.remove();
  }

  // ---------- data + compute ----------
  const state = { market: null, eYes: 0, eNo: 0, fetchedFor: "", books: { YES: null, NO: null } };

  async function loadPosition(wallet) {
    state.eYes = 0; state.eNo = 0;
    try {
      for (const p of await j(`${DATA}/positions?user=${wallet}&market=${state.market.conditionId}`)) {
        const o = String(p.outcome || "").toLowerCase();
        if (o === "yes") state.eYes += parseFloat(p.size) || 0;
        else if (o === "no") state.eNo += parseFloat(p.size) || 0;
      }
    } catch (e) { /* positions are a refinement, not a requirement */ }
    state.fetchedFor = wallet + "|" + state.market.conditionId;
  }

  async function getBook(side) {
    if (state.books[side]) return state.books[side];
    const m = state.market;
    const outcomes = arr(m.outcomes).map((o) => String(o).toLowerCase());
    const idx = outcomes.indexOf(side.toLowerCase());
    const tokenId = arr(m.clobTokenIds)[idx];
    const book = await j(`${CLOB}/book?token_id=${tokenId}`);
    state.books[side] = parseBook(book.asks); // { levels, notional }, parsed once
    return state.books[side];
  }

  async function refresh(refetch) {
    const out = $("kelly-out");
    if (!out || !state.market) return;
    try {
      const wallet = ($("kelly-wallet").value || "").trim();
      const B = parseFloat($("kelly-balance").value);
      if (!(B > 0)) { out.textContent = "Enter your available USDC balance."; return; }
      if (probPct == null) { out.textContent = "Set your probability estimate."; return; }
      const pu = probPct / 100;
      out.textContent = "…";
      if (refetch) state.books = { YES: null, NO: null };
      const key = wallet + "|" + state.market.conditionId;
      if (validWallet(wallet) && (refetch || state.fetchedFor !== key)) await loadPosition(wallet);

      const m = state.market;
      const f = Math.min(Math.max(kellyPct / 100, 0), 1);
      const outcomes = arr(m.outcomes).map((o) => String(o).toLowerCase());
      const pm = arr(m.outcomePrices).map(parseFloat)[outcomes.indexOf("yes")];
      const eYes = $("kelly-noposition").checked ? 0 : state.eYes;
      const eNo = $("kelly-noposition").checked ? 0 : state.eNo;

      const pYes = f * pu + (1 - f) * pm;
      const side = pYes > pm ? "YES" : "NO";
      const { levels, notional } = await getBook(side);
      if (!levels.length) { out.textContent = `No sell orders available for ${side} right now — can't size a bet.`; return; }

      const J = (M) => {
        const { shares } = walkAsks(levels, M);
        const wYes = B - M + eYes + (side === "YES" ? shares : 0);
        const wNo  = B - M + eNo  + (side === "NO"  ? shares : 0);
        return wYes > 0 && wNo > 0 ? pYes * Math.log(wYes) + (1 - pYes) * Math.log(wNo) : -Infinity;
      };
      const M = maximize(J, 0, Math.min(B, notional) * (1 - 1e-9));

      const lines = [`Bankroll ${usd(B)}, Kelly-adjusted estimate ${pct(pYes)}`];
      if (eYes || eNo) lines.push(`Your position: ${(eYes - eNo).toFixed(2)} net ${eYes > eNo ? "YES" : "NO"} shares`);
      if (Math.abs(pYes - pm) < 1e-9 || M < 0.01) { // USD is in cents, not Manifold's whole-mana units
        lines.push("Recommended bet: $0 — too close to the market price.");
      } else {
        const { shares, newProb } = walkAsks(levels, M);
        const pWin = side === "YES" ? pYes : 1 - pYes;
        lines.push(
          `Recommended bet: ${usd(M)} on ${side}`,
          `Shares bought: ${shares.toFixed(2)} (payout ${usd(shares)}, profit ${usd(shares - M)})`,
          `Fill price: up to ${pct(newProb)} (approx., from book depth)`,
          `Expected profit: ${usd(pWin * shares - M)}`
        );
        // Annualized return on the money at risk, assuming payout at market close.
        // Markets often resolve earlier than endDate, so this is a lower bound.
        const daysLeft = (Date.parse(m.endDate) - Date.now()) / 86400000;
        if (isFinite(daysLeft) && daysLeft > 0) {
          const ret = (pWin * shares - M) / M;
          const ann = Math.pow(1 + ret, 365.25 / daysLeft) - 1;
          const annText = ann > 100 ? ">10,000%" : (100 * ann).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%";
          lines.push(`Annualized return: ${annText} (${daysLeft < 1 ? "<1 day" : Math.round(daysLeft) + " days"} until close)`);
        }
      }
      out.textContent = lines.join("\n");
    } catch (e) {
      out.textContent = "Error: " + e.message;
    }
  }

  // ---------- SPA navigation ----------
  let currentPath = null;
  async function onNavigate() {
    const path = location.pathname;
    if (path === currentPath) return;
    currentPath = path;
    removePanel();
    state.market = null; state.fetchedFor = ""; state.books = { YES: null, NO: null };
    const m = await findMarket(path);
    if (path !== currentPath) return; // navigated away while fetching
    if (!m || m.closed) return;
    state.market = m;
    probPct = null;
    buildPanel();
    const outcomes = arr(m.outcomes).map((o) => String(o).toLowerCase());
    const pm = arr(m.outcomePrices).map(parseFloat)[outcomes.indexOf("yes")];
    if (isFinite(pm)) setProb(100 * pm); // start the slider at the market's probability
    refresh(true);
  }

  onNavigate();
  // Polymarket is a SPA: poll for client-side navigation, and keep the balance
  // in sync with the header's Cash figure (it updates after bets/deposits).
  setInterval(() => { onNavigate(); syncCash(); }, 500);
})();
