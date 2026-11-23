#!/usr/bin/env python3
"""
PaperLens local server.

What this file does, in plain English:
  The browser extension cannot talk to Claude directly (that would need a paid
  API key). But your Claude Max subscription includes the `claude` command-line
  tool. So this little server sits on your computer, listens on port 8765, and
  whenever the extension sends it some highlighted text, it asks Claude via the
  `claude` command and sends the answer back. Nothing ever leaves your machine
  except the normal Claude request itself.

Run it with:  python3 server.py   (or double-click start.command)
Stop it with: Ctrl+C in the terminal window.
"""

import json
import os
import shutil
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---------------------------------------------------------------- settings --

PORT = 8765

# Which Claude model answers you. Options:
#   "haiku"  = fastest, good for simple word definitions
#   "sonnet" = great balance of speed and quality  (default)
#   "opus"   = smartest, a bit slower
MODEL = "sonnet"

# How long (seconds) to wait for Claude before giving up.
TIMEOUT = 120

# ---------------------------------------------------------------------------

# Find the `claude` program on this computer.
CLAUDE = (
    shutil.which("claude")
    or os.path.expanduser("~/.claude/local/claude")
)

HERE = os.path.dirname(os.path.abspath(__file__))


def build_prompt(selection: str, context: str, title: str) -> str:
    """Turn the highlighted text + surrounding text into a question for Claude.

    If the highlight is short (4 words or fewer) we treat it as a word/term
    and ask for its meaning *in this context*. If it's longer, we treat it as
    a sentence/paragraph and ask for a plain-English explanation.
    """
    selection = selection.strip()
    is_term = len(selection.split()) <= 4

    parts = [
        "You are helping a student read a research paper. "
        "Answer directly in plain text/markdown. Do not use any tools."
    ]
    if title:
        parts.append(f'Document being read: "{title.strip()}"')
    if context and context.strip():
        parts.append(
            "Surrounding text from the paper (for context only):\n"
            '"""\n' + context.strip()[:4000] + '\n"""'
        )

    if is_term:
        parts.append(
            f'The student highlighted this term: "{selection}"\n\n'
            "Reply with exactly two short parts:\n"
            "1. The meaning of this term AS USED IN THIS CONTEXT, in plain "
            "English (1-2 sentences). Bold the term.\n"
            "2. What the sentence containing it is actually saying, restated "
            "in simple words (1-2 sentences).\n"
            "If no surrounding context was given, give the most likely meaning "
            "in a research-paper setting and note that briefly. Be concise and accurate."
        )
    else:
        parts.append(
            "The student highlighted this passage and wants it explained "
            "simply:\n"
            '"""\n' + selection[:6000] + '\n"""\n\n'
            "Explain it in plain, simple English. Short sentences. Avoid "
            "jargon; if you must keep a technical term, briefly say what it "
            "means in parentheses. Use 2-6 sentences for a short passage, or "
            "a few short bullet points for a long one. Finish with one line "
            'starting with "In short:" that gives the core idea.'
        )

    return "\n\n".join(parts)


def ask_claude(prompt: str) -> str:
    """Send the prompt to the `claude` CLI and return its text answer."""
    result = subprocess.run(
        [CLAUDE, "-p", "--model", MODEL, "--strict-mcp-config"],
        input=prompt,
        capture_output=True,
        text=True,
        timeout=TIMEOUT,
        cwd=HERE,  # run from this folder so no project instructions leak in
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "claude exited with an error")
    answer = result.stdout.strip()
    if not answer:
        raise RuntimeError("Claude returned an empty answer, please try again")
    return answer


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(200, {"ok": True})

    def do_GET(self):
        # Lets you check the server is alive: open http://127.0.0.1:8765
        self._send(200, {"ok": True, "service": "PaperLens", "model": MODEL})

    def do_POST(self):
        if self.path != "/explain":
            self._send(404, {"error": "unknown endpoint"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length) or b"{}")
            selection = (data.get("selection") or "").strip()
            if not selection:
                self._send(400, {"error": "nothing was highlighted"})
                return
            prompt = build_prompt(
                selection,
                data.get("context") or "",
                data.get("title") or "",
            )
            print(f'  -> explaining: "{selection[:60]}{"…" if len(selection) > 60 else ""}"')
            answer = ask_claude(prompt)
            self._send(200, {"answer": answer})
        except subprocess.TimeoutExpired:
            self._send(500, {"error": "Claude took too long to answer (timeout)"})
        except Exception as e:  # send the reason back so the popup can show it
            self._send(500, {"error": str(e)})

    def log_message(self, *args):
        pass  # keep the terminal quiet; we print our own line per request


def main():
    if not os.path.exists(CLAUDE):
        print("ERROR: could not find the `claude` command on this computer.")
        print("Open a terminal and check that typing `claude --version` works.")
        raise SystemExit(1)

    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"PaperLens is already running (port {PORT} is in use).")
            print("You don't need to start it twice — it's ready to use.")
            print("If you think it's stuck, close this window and the other")
            print("PaperLens Terminal window, then double-click start.command again.")
            raise SystemExit(0)
        raise

    print("PaperLens server is running.")
    print(f"  model: {MODEL}   (edit MODEL in server.py to change)")
    print(f"  address: http://127.0.0.1:{PORT}")
    print("Leave this window open while you read. Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
