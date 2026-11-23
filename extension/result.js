// Runs inside the small popup window opened by the right-click menu
// (used mainly for PDFs). Reads the highlighted text that background.js
// stored, asks the local server, and shows the answer.

const SERVER = "http://127.0.0.1:8765/explain";

function render(md) {
  const esc = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^[-*] (.*)$/gm, "&bull; $1")
    .replace(/^#+ (.*)$/gm, "<b>$1</b>")
    .replace(/\n/g, "<br>");
}

async function main() {
  const quoteEl = document.getElementById("quote");
  const answerEl = document.getElementById("answer");

  const { pending } = await chrome.storage.session.get("pending");
  if (!pending || !pending.selection) {
    answerEl.className = "error";
    answerEl.textContent = "No highlighted text was received.";
    return;
  }

  const sel = pending.selection;
  quoteEl.textContent =
    "“" + (sel.length > 400 ? sel.slice(0, 400) + "…" : sel) + "”";

  try {
    const r = await fetch(SERVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending),
    });
    const data = await r.json();
    if (data.error) {
      answerEl.className = "error";
      answerEl.innerHTML = "Error: " + render(data.error);
    } else {
      answerEl.className = "";
      answerEl.innerHTML = render(data.answer);
    }
  } catch (err) {
    answerEl.className = "error";
    answerEl.innerHTML =
      "Could not reach the PaperLens server.<br>" +
      "Start it by double-clicking <b>start.command</b> in the PaperLens folder.";
  }
}

main();
