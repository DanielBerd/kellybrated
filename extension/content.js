// Runs on manifold.markets: detect the signed-in user and remember them for
// the toolbar button. Manifold caches the logged-in user's profile in
// localStorage; rather than depend on the exact key name (an internal detail
// that could change), scan for any JSON value shaped like a user record.
"use strict";

(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;

  function looksLikeUser(u) {
    return !!u && typeof u === "object" &&
      typeof u.username === "string" && /^[\w.-]+$/.test(u.username) &&
      typeof u.id === "string" && typeof u.balance === "number";
  }

  function findUsername() {
    for (let i = 0; i < localStorage.length; i++) {
      const raw = localStorage.getItem(localStorage.key(i));
      if (!raw || raw[0] !== "{" || !raw.includes('"username"')) continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch (e) { continue; }
      for (const candidate of [parsed, parsed.user]) {
        if (looksLikeUser(candidate)) return candidate.username;
      }
    }
    return null;
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
    // Auth state loads asynchronously after the page renders — keep checking
    // for a while, then give up quietly (e.g. the user is logged out).
    if (++attempts < 8) setTimeout(save, 2500);
  }
  save();
})();
