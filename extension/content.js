// Runs on manifold.markets: detect the signed-in user and remember them for
// the toolbar button. Manifold caches the logged-in user's profile in
// localStorage; rather than depend on the exact key name (an internal detail
// that could change), scan for JSON values shaped like a user record.
"use strict";

(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;

  function looksLikeUser(u) {
    return !!u && typeof u === "object" &&
      typeof u.username === "string" && /^[\w.-]+$/.test(u.username) &&
      typeof u.id === "string" && typeof u.balance === "number";
  }

  // Several user-shaped records can be cached at once (e.g. profiles the user
  // viewed). Prefer the largest record: the signed-in user's cached document
  // is the full profile, incidental caches are slimmer projections.
  function findUsername() {
    let best = null, bestSize = -1;
    for (let i = 0; i < localStorage.length; i++) {
      const raw = localStorage.getItem(localStorage.key(i));
      if (!raw || raw[0] !== "{" || !raw.includes('"username"')) continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch (e) { continue; }
      for (const candidate of [parsed, parsed.user]) {
        if (looksLikeUser(candidate) && raw.length > bestSize) {
          best = candidate.username;
          bestSize = raw.length;
        }
      }
    }
    return best;
  }

  let attempts = 0;
  async function save() {
    const username = findUsername();
    if (username) {
      try {
        const prev = await api.storage.local.get("username");
        if (prev.username !== username) await api.storage.local.set({ username });
      } catch (e) { /* extension was reloaded out from under this page */ }
      return;
    }
    // Auth state loads asynchronously after the page renders — check quickly
    // at first, then keep checking slowly in case the user signs in later
    // without a full page load.
    setTimeout(save, ++attempts < 8 ? 2500 : 30000);
  }
  save();
})();
