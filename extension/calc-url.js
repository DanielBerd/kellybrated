// Shared by popup.js and background.js: turn a tab URL + username into a
// prefilled calculator URL.
"use strict";

const CALCULATOR_URL = "https://danielberd.github.io/kellybrated/";

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

// page: "" for the full calculator, "mini.html" for the bare-bones variant
function buildCalculatorUrl(tabUrl, username, page) {
  const params = new URLSearchParams();
  const slug = tabUrl ? marketSlugFromUrl(tabUrl) : null;
  if (slug) params.set("market", slug);
  if (username) params.set("user", username);
  const qs = params.toString();
  const base = CALCULATOR_URL + (page || "");
  return qs ? base + "?" + qs : base;
}
