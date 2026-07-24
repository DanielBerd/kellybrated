// Popup panel: the same compact Kelly calculator the userscript shows, fed by
// the active tab's market and the username detected by content.js.
"use strict";

const api = typeof browser !== "undefined" ? browser : chrome;
const API = "https://api.manifold.markets/v0";

// math + fetch come from kelly.js (loaded first in popup.html)
const { fetchJSON: j, goldenMaximize, cpmmProbability: cpmmProb, betInfo } = self.Kelly;

const $ = (id) => document.getElementById(id);
const r = (x) => Math.round(x).toLocaleString("en-US");
const pct = (x) => (100 * x).toFixed(1) + "%";

// ---------- sliders with click-to-type values ----------
let probPct = null;
let kellyPct = 50;

function renderVals() {
  $("kelly-prob-val").textContent = (probPct != null ? String(+probPct.toFixed(1)) : "—") + "%";
  $("kelly-factor-val").textContent = String(Math.round(kellyPct)) + "%";
}
function setProb(v, fromSlider) {
  if (!(isFinite(v) && v >= 0 && v <= 100)) { renderVals(); return; }
  probPct = Math.min(Math.max(Math.round(v * 10) / 10, 0), 100);
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
  const [portfolio, positions] = await Promise.all([
    j(`${API}/get-user-portfolio?userId=${state.user.id}`).catch(() => null),
    j(`${API}/market/${state.market.id}/positions?userId=${state.user.id}`).catch(() => null),
  ]);
  state.loans = (portfolio && portfolio.loanTotal) || 0;
  for (const met of positions || []) {
    if (!met.answerId) { state.eYes += met.totalShares?.YES || 0; state.eNo += met.totalShares?.NO || 0; }
  }
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
    const M = Math.round(goldenMaximize(J, 0, B * (1 - 1e-9)).x);

    const headLine = `@${state.username} — bankroll M${r(B)}, Kelly-adjusted estimate ${pct(pYes)}`;
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
    // Annualized return to the market's close (lower bound — may resolve earlier)
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
  if (Number.isFinite(stored.kellyFactor)) setKelly(stored.kellyFactor);

  // ?tab= lets the panel be tested/debugged outside a real popup
  const tabUrl = new URLSearchParams(location.search).get("tab") || await currentTabUrl();
  const slug = tabUrl ? marketSlugFromUrl(tabUrl) : null;

  // computed at click time so it reflects the validated market and current settings
  $("open-tab").addEventListener("click", async () => {
    await api.tabs.create({
      url: buildCalculatorUrl(state.market ? tabUrl : null, state.username || stored.username, kellyPct),
    });
    window.close();
  });

  const notAMarket = "Open a Manifold market page, then click the icon.";
  if (!slug) { out.textContent = notAMarket; return; }
  let m;
  try { m = await j(`${API}/slug/${encodeURIComponent(slug)}`); }
  catch (e) { out.textContent = notAMarket; return; } // most two-segment pages aren't markets
  if (m.outcomeType !== "BINARY" || m.mechanism !== "cpmm-1") {
    out.textContent = "Only binary (YES/NO) markets are supported.";
    return;
  }
  if (m.isResolved) { out.textContent = "This market has already resolved."; return; }
  state.market = m;
  setProb(100 * cpmmProb(m.pool, m.p)); // start the slider at the market's probability

  if (!stored.username) {
    // content.js may still be detecting; pick the username up the moment it lands
    out.textContent = "Detecting your Manifold user… if this doesn't resolve, browse manifold.markets while signed in.";
    const onStorage = (changes, area) => {
      if (area !== "local" || !changes.username || !changes.username.newValue) return;
      api.storage.onChanged.removeListener(onStorage);
      state.username = changes.username.newValue;
      refresh();
    };
    api.storage.onChanged.addListener(onStorage);
    return;
  }
  state.username = stored.username;
  refresh();
})();
