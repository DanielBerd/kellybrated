// Toolbar click: open the calculator, prefilled with the market on the current
// tab (when it's a Manifold market page) and the last-seen signed-in username.
"use strict";

// Firefox uses the promise-based `browser`; Chrome's MV3 `chrome` is also promise-based.
const api = typeof browser !== "undefined" ? browser : chrome;

const CALCULATOR_URL = "https://danielberd.github.io/kelly-manifold/";

// Two-segment manifold.markets paths that are NOT /{creator}/{marketSlug}
const NON_MARKET_ROOTS = new Set([
  "browse", "charity", "dashboard", "election", "group", "groups", "leagues",
  "link", "links", "live", "messages", "news", "payments", "post", "questions",
  "search", "sitemap", "styles", "topic", "topics", "tv",
]);

function marketSlugFromUrl(urlText) {
  let url;
  try { url = new URL(urlText); } catch (e) { return null; }
  if (url.hostname !== "manifold.markets") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed") parts.shift(); // /embed/{creator}/{slug}
  if (parts.length !== 2 || NON_MARKET_ROOTS.has(parts[0].toLowerCase())) return null;
  return parts[1];
}

function buildCalculatorUrl(tabUrl, username) {
  const params = new URLSearchParams();
  const slug = tabUrl ? marketSlugFromUrl(tabUrl) : null;
  if (slug) params.set("market", slug);
  if (username) params.set("user", username);
  const qs = params.toString();
  return qs ? CALCULATOR_URL + "?" + qs : CALCULATOR_URL;
}

async function openCalculator(tab) {
  let username = null;
  try {
    username = (await api.storage.local.get("username")).username || null;
  } catch (e) { /* storage unavailable — open unprefilled */ }
  await api.tabs.create({ url: buildCalculatorUrl(tab && tab.url, username) });
}

api.action.onClicked.addListener(openCalculator);
