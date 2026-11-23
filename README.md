# PaperLens ✦

Highlight a **word**, **sentence**, or **paragraph** while reading a paper and get a
plain-English, *context-aware* explanation from Claude — powered by your existing
**Claude Max** subscription, so it costs nothing extra and needs no API key.

- Highlight a **term** → get its meaning *as used in that sentence*, plus what the
  sentence is actually saying.
- Highlight a **sentence or paragraph** → get it re-explained in simple words.

It reads the surrounding text of the paper so the meaning it gives fits *your*
context, not a generic dictionary definition.

---

## How it works (30-second version)

The browser extension can't call Claude directly. So there's a tiny program
(`server.py`) that runs on your Mac. Your Claude Max plan includes the `claude`
command-line tool; the server calls that. The flow is:

```
You highlight text  →  extension  →  server.py on your Mac  →  claude (your Max plan)  →  answer back
```

Everything stays on your computer except the normal Claude request itself.

---

## One-time setup

### 1. Check the `claude` command works

You almost certainly have this already (it's what Claude Code uses). Open the
**Terminal** app and type:

```
claude --version
```

If you see a version number, you're good. If not, install Claude Code from
https://claude.com/claude-code and sign in with your Max account.

### 2. Load the extension into Chrome (or Edge/Brave)

1. Open your browser and go to `chrome://extensions`
   (in Edge: `edge://extensions`, in Brave: `brave://extensions`).
2. Turn on **Developer mode** (toggle, top-right).
3. Click **Load unpacked**.
4. Select this folder:
   the `extension` folder inside this repository
5. You'll see **PaperLens** appear in the list. Done — it stays loaded.

That's the whole install. You only do this once.

---

## Using it every day

### Step 1 — Start the server

Open the `PaperLens` folder in Finder and **double-click `start.command`**.
A small Terminal window opens and says *"PaperLens server is running."*
**Leave that window open** while you read. (To stop later, close the window or
press `Ctrl+C` in it.)

> First time you double-click, macOS may say the file is from an unidentified
> developer. If so: right-click `start.command` → **Open** → **Open**. You only
> need to do that once. (Alternatively, run `python3 server.py` from Terminal.)

### Step 2 — Read and highlight

**On normal web pages (HTML articles):**
Highlight any word, sentence, or paragraph. A small purple **✦** button pops up
next to your selection — click it. An answer card appears. Press `Esc` or click
away to dismiss it.

**Inside PDFs (Chrome's built-in PDF viewer):**
Highlight the text, then **right-click → "Explain with Claude ✦"**. The answer
opens in a small popup window. (PDFs don't allow the floating button, so the
right-click menu is the way there. The right-click menu also works on normal
pages if you prefer it.)

That's it.

---

## Tips & tuning

- **Which Claude model answers.** Open `server.py`, find the line near the top:
  ```python
  MODEL = "sonnet"
  ```
  Change `"sonnet"` to `"haiku"` (fastest, cheapest on usage) or `"opus"`
  (smartest). Save, then close and reopen `start.command`.

- **Accuracy.** The server sends up to ~4000 characters of surrounding text so
  the explanation matches the paper's context. On HTML pages this is automatic.
  Inside PDFs, the context is whatever you highlight — so for a tricky word in a
  PDF, highlight the **whole sentence** containing it; the explanation will still
  focus on the key term but will be more accurate.

- **First answer is slowest** (~10 seconds) because `claude` starts up; later
  ones are quicker.

- **Reading downloaded PDFs from your disk.** Open the PDF in Chrome (drag it
  onto a Chrome tab). Then, to let the extension work on local files, go to
  `chrome://extensions` → PaperLens → **Details** → turn on
  **"Allow access to file URLs."**

---

## If something doesn't work

| What you see | Fix |
|---|---|
| "Could not reach the PaperLens server" | The server isn't running. Double-click `start.command`. |
| The ✦ button doesn't appear on a page | Some sites block extensions; use **right-click → Explain with Claude** instead. |
| "could not find the `claude` command" | Type `claude --version` in Terminal. If it fails, install/sign in to Claude Code. |
| Answer says a login/usage error | Open Terminal, run `claude` once, make sure you're signed in to your Max account. |
| Nothing happens in a PDF | Use right-click → Explain with Claude (the ✦ button can't show inside PDFs). |

To check the server by hand, open this in your browser while it's running:
`http://127.0.0.1:8765` — it should show `{"ok": true, ...}`.

---

## What's in this folder

```
PaperLens/
├── server.py        the local helper that talks to Claude (well commented)
├── start.command    double-click to start the server
├── README.md        this file
└── extension/       the browser extension (Load unpacked points here)
    ├── manifest.json
    ├── background.js   relays requests; adds the right-click menu (for PDFs)
    ├── content.js      the ✦ button and answer card on web pages
    ├── result.html     the popup shown for PDF right-click explanations
    └── result.js
```

Nothing here phones home or stores your reading. The only network call is the
`claude` command doing what it normally does under your Max plan.
