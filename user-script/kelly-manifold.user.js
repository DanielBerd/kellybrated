// ==UserScript==
// @name         Kelly bet size for Manifold
// @namespace    https://github.com/DanielBerd/kelly-manifold
// @version      1.0.0
// @description  Shows the Kelly-optimal bet size in a small panel on Manifold binary market pages.
// @author       Daniel & Claude
// @match        https://manifold.markets/*
// @grant        none
// @noframes
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/DanielBerd/kelly-manifold/main/user-script/kelly-manifold.user.js
// @updateURL    https://raw.githubusercontent.com/DanielBerd/kelly-manifold/main/user-script/kelly-manifold.user.js
// ==/UserScript==

(() => {
  "use strict";
  const API = "https://api.manifold.markets/v0";
  const LAST_USER_KEY = "kelly-manifold:lastUser";
  const COLLAPSED_KEY = "kelly-manifold:collapsed";
  const KELLY_KEY = "kelly-manifold:kellyFactor";

  const $ = (id) => document.getElementById(id);
  const r = (x) => Math.round(x).toLocaleString("en-US");
  const pct = (x) => (100 * x).toFixed(1) + "%";

  async function j(url) {
    const res = await fetch(url);
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body && (body.message || body.error)) || res.status + " " + res.statusText);
    return body;
  }

  // ---------- Manifold Maniswap CPMM (same math as the calculator pages) ----------
  const cpmmProb = (pool, p) => p * pool.NO / (p * pool.NO + (1 - p) * pool.YES);
  function betInfo(m, bet, side) {
    const y = m.pool.YES, n = m.pool.NO, p = m.p;
    const k = y ** p * n ** (1 - p);
    const shares = side === "YES"
      ? y + bet - (k * (bet + n) ** (p - 1)) ** (1 / p)
      : n + bet - (k * (bet + y) ** -p) ** (1 / (1 - p));
    const pool = side === "YES"
      ? { YES: y + bet - shares, NO: n + bet }
      : { YES: y + bet, NO: n + bet - shares };
    return { shares, newProb: cpmmProb(pool, p) };
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

  // ---------- signed-in user detection (same shape-scan as the extension) ----------
  function looksLikeUser(u) {
    return !!u && typeof u === "object" &&
      typeof u.username === "string" && /^[\w.-]+$/.test(u.username) &&
      typeof u.id === "string" && typeof u.balance === "number";
  }
  function detectUsername() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const raw = localStorage.getItem(localStorage.key(i));
        if (!raw || raw[0] !== "{" || !raw.includes('"username"')) continue;
        let parsed;
        try { parsed = JSON.parse(raw); } catch (e) { continue; }
        for (const cand of [parsed, parsed.user]) if (looksLikeUser(cand)) return cand.username;
      }
    } catch (e) { /* storage blocked */ }
    return null;
  }

  // ---------- market-page URL parsing (same rules as the extension) ----------
  const NON_MARKET_ROOTS = new Set([
    "browse", "charity", "dashboard", "election", "group", "groups", "leagues",
    "link", "links", "live", "messages", "news", "payments", "post", "questions",
    "search", "sitemap", "styles", "topic", "topics", "tv",
  ]);
  function slugFromPath(pathname) {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || NON_MARKET_ROOTS.has(parts[0].toLowerCase())) return null;
    return parts[1];
  }

  // ---------- panel ----------
  function darkMode() { return document.documentElement.classList.contains("dark"); }

  function buildPanel() {
    const dark = darkMode();
    const box = document.createElement("div");
    box.id = "kelly-panel";
    box.style.cssText = [
      "position:fixed", "right:16px", "bottom:16px", "z-index:99999", "width:280px",
      "font:13px/1.4 system-ui,sans-serif",
      "background:" + (dark ? "#1f2937" : "#fff"),
      "color:" + (dark ? "#e5e7eb" : "#111"),
      "border:1px solid " + (dark ? "#4b5563" : "#bbb"),
      "border-radius:10px", "box-shadow:0 4px 16px rgba(0,0,0,.25)", "overflow:hidden",
    ].join(";");
    const inputCss = "width:100%;box-sizing:border-box;margin:2px 0 6px;padding:4px 6px;font:inherit;" +
      "border:1px solid " + (dark ? "#4b5563" : "#999") + ";border-radius:5px;" +
      "background:" + (dark ? "#111827" : "#fff") + ";color:inherit;";
    box.innerHTML = `
      <div id="kelly-head" style="display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;
           background:#2a9d8f;color:#fff;font-weight:bold;">
        <span style="flex:1">Kelly bet size</span>
        <span id="kelly-toggle">–</span>
      </div>
      <div id="kelly-body" style="padding:8px 10px;">
        <label>Username
          <input id="kelly-user" type="text" spellcheck="false" style="${inputCss}"></label>
        <label>Your probability estimate (%)
          <input id="kelly-prob" type="number" min="0.1" max="99.9" step="any" style="${inputCss}"></label>
        <label><a href="https://www.lesswrong.com/posts/TNWnK9g2EeRnQA8Dg/never-go-full-kelly"
             target="_blank" rel="noopener" style="color:#2a9d8f;">Kelly factor</a> (0–100%) — 50 = half Kelly
          <input id="kelly-factor" type="number" min="0" max="100" step="any" style="${inputCss}"></label>
        <label style="display:block;margin-bottom:6px;">
          <input id="kelly-noloans" type="checkbox"> Ignore loans</label>
        <div id="kelly-out" style="white-space:pre-line;border-top:1px solid ${dark ? "#4b5563" : "#ccc"};
             padding-top:6px;min-height:1em;"></div>
      </div>`;
    document.body.appendChild(box);

    const body = $("kelly-body"), toggle = $("kelly-toggle");
    const setCollapsed = (c) => {
      body.style.display = c ? "none" : "";
      toggle.textContent = c ? "+" : "–";
      try { localStorage.setItem(COLLAPSED_KEY, c ? "1" : ""); } catch (e) {}
    };
    $("kelly-head").addEventListener("click", () => setCollapsed(body.style.display !== "none"));
    try { if (localStorage.getItem(COLLAPSED_KEY) === "1") setCollapsed(true); } catch (e) {}

    $("kelly-user").value = detectUsername() || (() => {
      try { return localStorage.getItem(LAST_USER_KEY) || ""; } catch (e) { return ""; }
    })();
    try { $("kelly-factor").value = localStorage.getItem(KELLY_KEY) || "50"; } catch (e) { $("kelly-factor").value = "50"; }

    let t;
    const onInput = (refetch) => () => {
      clearTimeout(t);
      t = setTimeout(() => refresh(refetch), 400);
    };
    $("kelly-user").addEventListener("input", onInput(true));
    $("kelly-prob").addEventListener("input", onInput(false));
    $("kelly-factor").addEventListener("input", onInput(false));
    $("kelly-noloans").addEventListener("change", onInput(false));
    return box;
  }

  function removePanel() {
    const el = $("kelly-panel");
    if (el) el.remove();
  }

  // ---------- data + compute ----------
  const state = { market: null, user: null, loans: 0, eYes: 0, eNo: 0, fetchedFor: "" };

  async function loadUserData() {
    const username = $("kelly-user").value.trim();
    state.user = null; state.loans = 0; state.eYes = 0; state.eNo = 0;
    if (!username || !state.market) return;
    state.user = await j(`${API}/user/${encodeURIComponent(username)}`);
    try { localStorage.setItem(LAST_USER_KEY, state.user.username); } catch (e) {}
    try { state.loans = (await j(`${API}/get-user-portfolio?userId=${state.user.id}`)).loanTotal || 0; } catch (e) {}
    try {
      for (const met of await j(`${API}/market/${state.market.id}/positions?userId=${state.user.id}`)) {
        if (!met.answerId) { state.eYes += met.totalShares?.YES || 0; state.eNo += met.totalShares?.NO || 0; }
      }
    } catch (e) {}
    state.fetchedFor = username + "|" + state.market.id;
  }

  async function refresh(refetch) {
    const out = $("kelly-out");
    if (!out || !state.market) return;
    try {
      const username = $("kelly-user").value.trim();
      if (!username) { out.textContent = "Enter your Manifold username."; return; }
      const pu = parseFloat($("kelly-prob").value) / 100;
      if (!(pu > 0 && pu < 1)) { out.textContent = "Enter your probability estimate."; return; }
      out.textContent = "…";
      if (refetch || state.fetchedFor !== username + "|" + state.market.id) await loadUserData();

      const m = state.market;
      const f = Math.min(Math.max((parseFloat($("kelly-factor").value) || 0) / 100, 0), 1);
      try { localStorage.setItem(KELLY_KEY, $("kelly-factor").value); } catch (e) {}
      const loans = $("kelly-noloans").checked ? 0 : state.loans;
      const B = state.user.balance - loans;
      if (B <= 1) { out.textContent = `Bankroll is M${r(B)} — nothing to bet.`; return; }

      const pm = cpmmProb(m.pool, m.p);
      const pYes = f * pu + (1 - f) * pm;
      const side = pYes > pm ? "YES" : "NO";
      const J = (M) => {
        const s = betInfo(m, M, side).shares;
        const wYes = B - M + state.eYes + (side === "YES" ? s : 0);
        const wNo  = B - M + state.eNo  + (side === "NO"  ? s : 0);
        return wYes > 0 && wNo > 0 ? pYes * Math.log(wYes) + (1 - pYes) * Math.log(wNo) : -Infinity;
      };
      const M = Math.round(maximize(J, 0, B * (1 - 1e-9)));

      if (Math.abs(pYes - pm) < 1e-9 || M < 1) {
        out.textContent = `Bankroll M${r(B)} — Kelly-adjusted estimate ${pct(pYes)}\n` +
          "Recommended bet: M0 — too close to the market price.";
        return;
      }
      const { shares, newProb } = betInfo(m, M, side);
      const pWin = side === "YES" ? pYes : 1 - pYes;
      out.textContent = [
        `Bankroll M${r(B)} — Kelly-adjusted estimate ${pct(pYes)}`,
        `Recommended bet: M${r(M)} on ${side}`,
        `Payout if ${side}: M${r(shares)} (profit M${r(shares - M)})`,
        `New market probability: ${pct(newProb)}`,
        `Expected profit: M${r(pWin * shares - M)}`,
      ].join("\n");
    } catch (e) {
      out.textContent = "Error: " + e.message;
    }
  }

  // ---------- SPA navigation ----------
  let currentSlug = null;
  async function onNavigate() {
    const slug = slugFromPath(location.pathname);
    if (slug === currentSlug) return;
    currentSlug = slug;
    removePanel();
    state.market = null; state.fetchedFor = "";
    if (!slug) return;
    let m;
    try { m = await j(`${API}/slug/${encodeURIComponent(slug)}`); } catch (e) { return; }
    if (slug !== currentSlug) return; // navigated away while fetching
    if (m.outcomeType !== "BINARY" || m.mechanism !== "cpmm-1" || m.isResolved) return;
    state.market = m;
    buildPanel();
    refresh(true);
  }

  onNavigate();
  setInterval(onNavigate, 500); // Manifold is a SPA; poll for client-side navigation
})();
