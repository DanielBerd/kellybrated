// Popup panel: embed the calculator, prefilled with the market on the active
// tab and the last-seen signed-in username (see content.js).
"use strict";

const api = typeof browser !== "undefined" ? browser : chrome;

async function currentTabUrl() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return (tab && tab.url) || null;
  } catch (e) { return null; }
}

(async () => {
  let username = null;
  try { username = (await api.storage.local.get("username")).username || null; } catch (e) { /* first run */ }
  const tabUrl = await currentTabUrl();
  // the panel embeds the mini version; "Open in tab" goes to the full page
  document.getElementById("frame").src = buildCalculatorUrl(tabUrl, username, "mini.html");
  document.getElementById("open-tab").addEventListener("click", async () => {
    await api.tabs.create({ url: buildCalculatorUrl(tabUrl, username) });
    window.close();
  });
})();
