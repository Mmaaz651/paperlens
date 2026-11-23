// PaperLens content script.
// Runs on every normal web page. When you highlight text, a small ✦ button
// appears; clicking it asks Claude (through the local server) to explain the
// highlighted word/sentence *in context* and shows the answer in a card.
// (Chrome's built-in PDF viewer doesn't allow scripts inside it — there you
// use right-click → "Explain with Claude" instead, handled by background.js.)

(() => {
  if (window.__paperlensLoaded) return;
  window.__paperlensLoaded = true;

  let buttonHost = null; // the little ✦ button
  let panelHost = null;  // the answer card
  let pending = null;    // {text, context, rect} of the current selection

  // ------------------------------------------------------------- helpers --

  function removeButton() {
    if (buttonHost) { buttonHost.remove(); buttonHost = null; }
  }
  function removePanel() {
    if (panelHost) { panelHost.remove(); panelHost = null; }
  }

  // Grab the text around the selection so Claude knows the context.
  // We take the paragraph the selection lives in, then keep adding the
  // paragraphs before/after it until we have ~2000 characters.
  function getContext(sel) {
    try {
      let node = sel.anchorNode;
      if (!node) return "";
      let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!el) return "";
      const block =
        el.closest("p, li, td, blockquote, figcaption, dd, section, article, div") || el;
      let context = block.innerText || "";
      let prev = block.previousElementSibling;
      let next = block.nextElementSibling;
      let guard = 0;
      while (context.length < 2000 && (prev || next) && guard++ < 20) {
        if (prev) {
          context = (prev.innerText || "") + "\n" + context;
          prev = prev.previousElementSibling;
        }
        if (next) {
          context = context + "\n" + (next.innerText || "");
          next = next.nextElementSibling;
        }
      }
      return context.slice(0, 4000);
    } catch (e) {
      return "";
    }
  }

  // Very small markdown renderer (bold, code, bullets, line breaks) with
  // HTML escaping first so page content can never inject markup.
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

  function clampToViewport(x, y, w) {
    const pad = 8;
    x = Math.min(Math.max(pad, x), window.innerWidth - w - pad);
    y = Math.min(Math.max(pad, y), window.innerHeight - 60);
    return [x, y];
  }

  // -------------------------------------------------------------- button --

  function showButton(rect) {
    removeButton();
    buttonHost = document.createElement("paperlens-button");
    buttonHost.style.cssText =
      "position:fixed; z-index:2147483647; width:0; height:0;";
    const shadow = buttonHost.attachShadow({ mode: "closed" });
    const btn = document.createElement("button");
    btn.textContent = "✦";
    btn.title = "Explain with Claude";
    btn.style.cssText = `
      all: initial; cursor: pointer; user-select: none;
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border-radius: 50%;
      background: #6a4df4; color: #fff; font-size: 15px;
      font-family: -apple-system, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,.35); border: none;
    `;
    shadow.appendChild(btn);

    const [x, y] = clampToViewport(rect.right + 6, rect.bottom + 6, 30);
    buttonHost.style.left = x + "px";
    buttonHost.style.top = y + "px";

    // preventDefault on mousedown keeps the page selection alive while clicking
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const req = pending;
      removeButton();
      if (req) explain(req);
    });
    document.documentElement.appendChild(buttonHost);
  }

  // --------------------------------------------------------- answer card --

  function showPanel(rect) {
    removePanel();
    panelHost = document.createElement("paperlens-panel");
    panelHost.style.cssText =
      "position:fixed; z-index:2147483647; width:0; height:0;";
    const shadow = panelHost.attachShadow({ mode: "open" });

    const card = document.createElement("div");
    card.style.cssText = `
      all: initial; box-sizing: border-box; display: block;
      width: 420px; max-width: calc(100vw - 24px);
      max-height: 46vh; overflow-y: auto;
      background: #1e1e28; color: #eceaf4;
      border: 1px solid #46406b; border-radius: 12px;
      padding: 14px 16px 12px;
      font-family: -apple-system, "Segoe UI", sans-serif;
      font-size: 14.5px; line-height: 1.55;
      box-shadow: 0 8px 30px rgba(0,0,0,.45);
    `;

    const head = document.createElement("div");
    head.style.cssText = `
      all: initial; display: flex; justify-content: space-between;
      align-items: center; margin-bottom: 8px;
      font-family: -apple-system, sans-serif;
    `;
    const label = document.createElement("span");
    label.textContent = "✦ PaperLens";
    label.style.cssText =
      "all: initial; font-family: -apple-system, sans-serif; font-size: 12px; " +
      "font-weight: 700; color: #a99cf5; letter-spacing: .4px;";
    const close = document.createElement("span");
    close.textContent = "✕";
    close.style.cssText =
      "all: initial; cursor: pointer; font-family: -apple-system, sans-serif; " +
      "font-size: 13px; color: #8b87a0; padding: 2px 4px;";
    close.addEventListener("click", removePanel);
    head.appendChild(label);
    head.appendChild(close);

    const body = document.createElement("div");
    body.innerHTML =
      '<i style="color:#a7a3bd">Thinking&hellip; (first answer can take ~10 s)</i>';
    body.style.cssText = "all: initial; font: inherit; color: inherit; display: block;";

    card.appendChild(head);
    card.appendChild(body);
    shadow.appendChild(card);

    const [x, y] = clampToViewport(rect.left, rect.bottom + 8, 420);
    panelHost.style.left = x + "px";
    panelHost.style.top = y + "px";
    document.documentElement.appendChild(panelHost);
    return body;
  }

  function explain(req) {
    const body = showPanel(req.rect);
    chrome.runtime.sendMessage(
      {
        type: "explain",
        selection: req.text,
        context: req.context,
        title: document.title || "",
      },
      (resp) => {
        if (!panelHost) return; // user already closed it
        if (chrome.runtime.lastError || !resp) {
          body.innerHTML =
            '<span style="color:#ff9d9d">Could not reach the PaperLens server.</span>' +
            "<br>Start it by double-clicking <b>start.command</b> in the PaperLens folder.";
          return;
        }
        if (resp.error) {
          body.innerHTML =
            '<span style="color:#ff9d9d">Error:</span> ' + render(resp.error);
          return;
        }
        body.innerHTML = render(resp.answer);
      }
    );
  }

  // ------------------------------------------------------------- wiring --

  document.addEventListener("mouseup", (e) => {
    // ignore clicks that happen inside our own UI
    if (
      (panelHost && e.composedPath().includes(panelHost)) ||
      (buttonHost && e.composedPath().includes(buttonHost))
    )
      return;
    // wait a tick so the browser finalises the selection
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      removeButton();
      if (!text || text.length < 2 || sel.rangeCount === 0) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return;
      pending = { text, context: getContext(sel), rect };
      showButton(rect);
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (panelHost && !e.composedPath().includes(panelHost)) removePanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      removeButton();
      removePanel();
    }
  });
})();
