// Shared by popup.js and background.js: turn a tab URL + prefill values into a
// calculator URL.
"use strict";

const CALCULATOR_URL = "https://danielberd.github.io/kellybrated/";

// Whether the slug names a real market is decided by the caller's /v0/slug
// fetch; this only extracts the slug-shaped path segment.
function marketSlugFromUrl(urlText) {
  let url;
  try { url = new URL(urlText); } catch (e) { return null; }
  if (url.hostname !== "manifold.markets") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed") parts.shift(); // /embed/{creator}/{slug}
  if (parts.length !== 2) return null;
  return parts[1];
}

function buildCalculatorUrl(tabUrl, username, kellyFactor) {
  const params = new URLSearchParams();
  const slug = tabUrl ? marketSlugFromUrl(tabUrl) : null;
  if (slug) params.set("market", slug);
  if (username) params.set("user", username);
  // 50 is the calculator's default; only carry a deliberate setting
  if (Number.isFinite(kellyFactor) && kellyFactor !== 50) params.set("deferral", kellyFactor);
  const qs = params.toString();
  return qs ? CALCULATOR_URL + "?" + qs : CALCULATOR_URL;
}
