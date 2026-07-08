const SITE = "https://danielberd.github.io/kelly-manifold/";

chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  const currentTab = tabs[0];
  const tabURL = new URL(currentTab.url);

  if (tabURL.hostname !== "manifold.markets") {
    showError();
  } else {
    // The calculator reads ?market= to prefill the market field; the username
    // is remembered by the page itself (localStorage) after the first use.
    document.getElementById("calculator").src =
      `${SITE}?market=${encodeURIComponent(currentTab.url)}`;
  }
});

function showError() {
  const errorDiv = document.createElement("div");
  errorDiv.innerText = "You must be on a page on manifold.markets to use this extension.";
  errorDiv.style.color = "red";
  errorDiv.style.textAlign = "center";
  errorDiv.style.margin = "20px";
  errorDiv.style.fontWeight = "600";
  errorDiv.style.fontFamily = "sans-serif";
  document.body.innerHTML = "";
  document.body.appendChild(errorDiv);
}
