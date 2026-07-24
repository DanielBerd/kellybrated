// ==UserScript==
// @name         Kellybrated
// @namespace    https://github.com/DanielBerd/kellybrated
// @version      1.4.0
// @description  Shows the Kelly-optimal bet size in a small panel on Manifold binary market pages.
// @author       Daniel & Claude
// @match        https://manifold.markets/*
// @grant        none
// @noframes
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/DanielBerd/kellybrated/main/user-script/kellybrated.user.js
// @updateURL    https://raw.githubusercontent.com/DanielBerd/kellybrated/main/user-script/kellybrated.user.js
// ==/UserScript==

(() => {
  "use strict";
  const API = "https://api.manifold.markets/v0";
  // storage keys predate the Kellybrated rename; kept so settings survive
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
  // Several user-shaped records can be cached at once (e.g. profiles the user
  // viewed). Prefer the largest record: the signed-in user's cached document
  // is the full profile, incidental caches are slimmer projections.
  function detectUsername() {
    let best = null, bestSize = -1;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const raw = localStorage.getItem(localStorage.key(i));
        if (!raw || raw[0] !== "{" || !raw.includes('"username"')) continue;
        let parsed;
        try { parsed = JSON.parse(raw); } catch (e) { continue; }
        for (const cand of [parsed, parsed.user]) {
          if (looksLikeUser(cand) && raw.length > bestSize) {
            best = cand.username;
            bestSize = raw.length;
          }
        }
      }
    } catch (e) { /* storage blocked */ }
    return best;
  }
  let username = null, usernameDetected = false;
  function resolveUsername() {
    if (usernameDetected) return true; // don't rescan localStorage on every refresh
    const detected = detectUsername();
    if (detected) {
      username = detected;
      usernameDetected = true;
      try { localStorage.setItem(LAST_USER_KEY, detected); } catch (e) {}
      return true;
    }
    if (!username) try { username = localStorage.getItem(LAST_USER_KEY) || null; } catch (e) {}
    return !!username;
  }

  // ---------- market-page URL parsing (same rules as the extension) ----------
  // Whether the slug names a real market is decided by the /v0/slug fetch in
  // onNavigate; any two-segment path is worth asking the API about.
  function slugFromPath(pathname) {
    const parts = pathname.split("/").filter(Boolean);
    return parts.length === 2 ? parts[1] : null;
  }

  // ---------- theming (follows Manifold's dark-mode class live) ----------
  const darkMode = () => document.documentElement.classList.contains("dark");
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
    .observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

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

  function buildPanel() {
    const box = document.createElement("div");
    box.id = "kelly-panel";
    box.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:99999;width:280px;" +
      "font:13px/1.4 system-ui,sans-serif;border:1px solid;border-radius:10px;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.25);overflow:hidden;";
    const valCss = "cursor:pointer;font-weight:bold;text-decoration:underline dotted;";
    box.innerHTML = `
      <div id="kelly-head" style="display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;
           background:#2a9d8f;color:#fff;font-weight:bold;">
        <span style="flex:1">Kellybrated</span>
        <span id="kelly-toggle">–</span>
      </div>
      <div id="kelly-body" style="padding:8px 10px;">
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
          <input id="kelly-noloans" type="checkbox"> Ignore loans</label>
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

    let t;
    const schedule = (refetch, ms) => { clearTimeout(t); t = setTimeout(() => refresh(refetch), ms); };
    $("kelly-prob").addEventListener("input", () => {
      setProb(parseFloat($("kelly-prob").value), true);
      schedule(false, 250);
    });
    $("kelly-factor").addEventListener("input", () => {
      setKelly(parseFloat($("kelly-factor").value), true);
      schedule(false, 250);
    });
    $("kelly-noloans").addEventListener("change", () => schedule(false, 100));
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
  const state = { market: null, user: null, loans: 0, eYes: 0, eNo: 0, fetchedFor: "" };

  async function loadUserData() {
    state.user = null; state.loans = 0; state.eYes = 0; state.eNo = 0;
    state.user = await j(`${API}/user/${encodeURIComponent(username)}`);
    const [portfolio, positions] = await Promise.all([
      j(`${API}/get-user-portfolio?userId=${state.user.id}`).catch(() => null),
      j(`${API}/market/${state.market.id}/positions?userId=${state.user.id}`).catch(() => null),
    ]);
    state.loans = (portfolio && portfolio.loanTotal) || 0;
    for (const met of positions || []) {
      if (!met.answerId) { state.eYes += met.totalShares?.YES || 0; state.eNo += met.totalShares?.NO || 0; }
    }
    state.fetchedFor = username + "|" + state.market.id;
  }

  let detectAttempts = 0;
  async function refresh(refetch) {
    const out = $("kelly-out");
    if (!out || !state.market) return;
    try {
      if (!resolveUsername()) {
        out.textContent = "Waiting to detect your Manifold login…";
        // auth state loads asynchronously; keep looking for a while
        if (++detectAttempts < 8) setTimeout(() => refresh(true), 2500);
        else out.textContent = "Couldn't detect your Manifold login — are you signed in?";
        return;
      }
      if (probPct == null) { out.textContent = "Set your probability estimate."; return; }
      const pu = probPct / 100;
      out.textContent = "…";
      if (refetch || state.fetchedFor !== username + "|" + state.market.id) await loadUserData();

      const m = state.market;
      const f = Math.min(Math.max(kellyPct / 100, 0), 1);
      const loans = $("kelly-noloans").checked ? 0 : state.loans;
      const B = state.user.balance - loans;
      if (B <= 1) { out.textContent = `@${username} — bankroll M${r(B)}: nothing to bet.`; return; }

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

      const headLine = `@${username} — bankroll M${r(B)}, Kelly-adjusted estimate ${pct(pYes)}`;
      if (Math.abs(pYes - pm) < 1e-9 || M < 1) {
        out.textContent = headLine + "\nRecommended bet: M0 — too close to the market price.";
        return;
      }
      const { shares, newProb } = betInfo(m, M, side);
      const pWin = side === "YES" ? pYes : 1 - pYes;
      const lines = [
        headLine,
        `Recommended bet: M${r(M)} on ${side}`,
        `Payout if ${side}: M${r(shares)} (profit M${r(shares - M)})`,
        `New market probability: ${pct(newProb)}`,
        `Expected profit: M${r(pWin * shares - M)}`,
      ];
      // Annualized return to the market's close, compounding this bet's return.
      // Markets can resolve earlier than closeTime, so it's a lower bound.
      const daysLeft = m.closeTime ? (m.closeTime - Date.now()) / 86400000 : null;
      if (daysLeft != null && daysLeft > 0) {
        const ann = Math.pow((pWin * shares) / M, 365.25 / daysLeft) - 1;
        const annText = ann > 100 ? ">10,000%" : (100 * ann).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%";
        lines.push(`Annualized return: ${annText} (${daysLeft < 1 ? "<1 day" : Math.round(daysLeft) + " days"} until close)`);
      }
      out.textContent = lines.join("\n");
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
    detectAttempts = 0;
    probPct = null;
    buildPanel();
    setProb(100 * cpmmProb(m.pool, m.p)); // start the slider at the market's probability
    refresh(true);
  }

  onNavigate();
  setInterval(onNavigate, 500); // Manifold is a SPA; poll for client-side navigation
})();
