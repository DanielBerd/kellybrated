// Popup panel: the same compact Kelly calculator the userscript shows, fed by
// the active tab's market and the username detected by content.js.
"use strict";

const api = typeof browser !== "undefined" ? browser : chrome;
const API = "https://api.manifold.markets/v0";

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

// ---------- sliders with click-to-type values ----------
let probPct = null;
let kellyPct = 50;

function renderVals() {
  $("kelly-prob-val").textContent = (probPct != null ? String(+probPct.toFixed(1)) : "—") + "%";
  $("kelly-factor-val").textContent = String(Math.round(kellyPct)) + "%";
}
function setProb(v, fromSlider) {
  if (!(isFinite(v) && v > 0 && v < 100)) { renderVals(); return; }
  probPct = Math.min(Math.max(Math.round(v * 10) / 10, 0.1), 99.9);
  if (!fromSlider) $("kelly-prob").value = probPct;
  renderVals();
}
function setKelly(v, fromSlider) {
  if (!isFinite(v)) { renderVals(); return; }
  kellyPct = Math.min(Math.max(Math.round(v), 0), 100);
  if (!fromSlider) $("kelly-factor").value = kellyPct;
  api.storage.local.set({ kellyFactor: kellyPct }).catch(() => {});
  renderVals();
}
function attachEditable(spanId, getVal, commit) {
  $(spanId).addEventListener("click", () => {
    const span = $(spanId);
    if (span.querySelector("input")) return;
    const inp = document.createElement("input");
    inp.type = "number"; inp.step = "any"; inp.className = "kelly-input";
    inp.value = getVal();
    span.textContent = "";
    span.appendChild(inp);
    inp.focus(); inp.select();
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    inp.addEventListener("blur", () => commit(parseFloat(inp.value)), { once: true });
  });
}

// ---------- data + compute ----------
const state = { market: null, username: null, user: null, loans: 0, eYes: 0, eNo: 0, loaded: false };

async function loadUserData() {
  state.user = await j(`${API}/user/${encodeURIComponent(state.username)}`);
  try { state.loans = (await j(`${API}/get-user-portfolio?userId=${state.user.id}`)).loanTotal || 0; } catch (e) {}
  try {
    for (const met of await j(`${API}/market/${state.market.id}/positions?userId=${state.user.id}`)) {
      if (!met.answerId) { state.eYes += met.totalShares?.YES || 0; state.eNo += met.totalShares?.NO || 0; }
    }
  } catch (e) {}
  state.loaded = true;
}

async function refresh() {
  const out = $("kelly-out");
  if (!state.market || !state.username) return;
  try {
    if (probPct == null) { out.textContent = "Set your probability estimate."; return; }
    out.textContent = "…";
    if (!state.loaded) await loadUserData();

    const m = state.market;
    const f = Math.min(Math.max(kellyPct / 100, 0), 1);
    const loans = $("kelly-noloans").checked ? 0 : state.loans;
    const B = state.user.balance - loans;
    if (B <= 1) { out.textContent = `@${state.username} — bankroll M${r(B)}: nothing to bet.`; return; }

    const pm = cpmmProb(m.pool, m.p);
    const pYes = f * (probPct / 100) + (1 - f) * pm;
    const side = pYes > pm ? "YES" : "NO";
    const J = (M) => {
      const s = betInfo(m, M, side).shares;
      const wYes = B - M + state.eYes + (side === "YES" ? s : 0);
      const wNo  = B - M + state.eNo  + (side === "NO"  ? s : 0);
      return wYes > 0 && wNo > 0 ? pYes * Math.log(wYes) + (1 - pYes) * Math.log(wNo) : -Infinity;
    };
    const M = Math.round(maximize(J, 0, B * (1 - 1e-9)));

    const headLine = `@${state.username} — bankroll M${r(B)}, Kelly-adjusted estimate ${pct(pYes)}`;
    if (Math.abs(pYes - pm) < 1e-9 || M < 1) {
      out.textContent = headLine + "\nRecommended bet: M0 — too close to the market price.";
      return;
    }
    const { shares, newProb } = betInfo(m, M, side);
    const pWin = side === "YES" ? pYes : 1 - pYes;
    out.textContent = [
      headLine,
      `Recommended bet: M${r(M)} on ${side}`,
      `Payout if ${side}: M${r(shares)} (profit M${r(shares - M)})`,
      `New market probability: ${pct(newProb)}`,
      `Expected profit: M${r(pWin * shares - M)}`,
    ].join("\n");
  } catch (e) {
    out.textContent = "Error: " + e.message;
  }
}

// ---------- init ----------
async function currentTabUrl() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return (tab && tab.url) || null;
  } catch (e) { return null; }
}

(async () => {
  const out = $("kelly-out");
  let t;
  const schedule = (ms) => { clearTimeout(t); t = setTimeout(refresh, ms); };
  $("kelly-prob").addEventListener("input", () => { setProb(parseFloat($("kelly-prob").value), true); schedule(250); });
  $("kelly-factor").addEventListener("input", () => { setKelly(parseFloat($("kelly-factor").value), true); schedule(250); });
  $("kelly-noloans").addEventListener("change", () => schedule(100));
  attachEditable("kelly-prob-val", () => (probPct != null ? String(+probPct.toFixed(1)) : ""),
    (v) => { setProb(v); schedule(0); });
  attachEditable("kelly-factor-val", () => String(Math.round(kellyPct)),
    (v) => { setKelly(v); schedule(0); });

  let stored = {};
  try { stored = await api.storage.local.get(["username", "kellyFactor"]); } catch (e) {}
  if (isFinite(stored.kellyFactor)) setKelly(stored.kellyFactor);

  // ?tab= lets the panel be tested/debugged outside a real popup
  const tabUrl = new URLSearchParams(location.search).get("tab") || await currentTabUrl();
  const slug = tabUrl ? marketSlugFromUrl(tabUrl) : null;

  $("open-tab").addEventListener("click", async () => {
    await api.tabs.create({ url: buildCalculatorUrl(tabUrl, state.username || stored.username) });
    window.close();
  });

  if (!slug) { out.textContent = "Open a Manifold market page, then click the icon."; return; }
  let m;
  try { m = await j(`${API}/slug/${encodeURIComponent(slug)}`); }
  catch (e) { out.textContent = "Couldn't load this market: " + e.message; return; }
  if (m.outcomeType !== "BINARY" || m.mechanism !== "cpmm-1") {
    out.textContent = "Only binary (YES/NO) markets are supported.";
    return;
  }
  if (m.isResolved) { out.textContent = "This market has already resolved."; return; }
  state.market = m;

  if (!stored.username) {
    out.textContent = "Couldn't detect your Manifold user yet — browse manifold.markets while signed in once.";
    return;
  }
  state.username = stored.username;
  setProb(100 * cpmmProb(m.pool, m.p)); // start the slider at the market's probability
  refresh();
})();
