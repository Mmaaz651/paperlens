// PaperLens background service worker.
// Two jobs:
//  1. Relay "explain" requests from the content script to the local server
//     (extension pages are allowed to call http://127.0.0.1, pages sometimes aren't).
//  2. Provide a right-click menu item — this is the way to use PaperLens
//     inside Chrome's built-in PDF viewer, where content scripts can't run.
//     The answer opens in a small popup window.

const SERVER = "http://127.0.0.1:8765/explain";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "paperlens-explain",
    title: 'Explain with Claude ✦',
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "paperlens-explain") return;
  await chrome.storage.session.set({
    pending: {
      selection: info.selectionText || "",
      context: "",
      title: (tab && tab.title) || "",
    },
  });
  chrome.windows.create({
    url: chrome.runtime.getURL("result.html"),
    type: "popup",
    width: 500,
    height: 460,
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "explain") return;
  fetch(SERVER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      selection: msg.selection,
      context: msg.context,
      title: msg.title,
    }),
  })
    .then((r) => r.json())
    .then(sendResponse)
    .catch((err) =>
      sendResponse({
        error:
          "Could not reach the PaperLens server (" +
          err.message +
          "). Start it with start.command.",
      })
    );
  return true; // keep the message channel open for the async response
});
