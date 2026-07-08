// Fallback only: with a popup configured, action.onClicked never fires, but
// this keeps the toolbar button working if the popup is ever removed.
"use strict";

// Chrome runs this as a service worker (importScripts); Firefox loads
// calc-url.js via the manifest's background.scripts list instead.
if (typeof importScripts === "function") importScripts("calc-url.js");

const api = typeof browser !== "undefined" ? browser : chrome;

api.action.onClicked.addListener(async (tab) => {
  let username = null;
  try { username = (await api.storage.local.get("username")).username || null; } catch (e) { /* open unprefilled */ }
  await api.tabs.create({ url: buildCalculatorUrl(tab && tab.url, username) });
});
