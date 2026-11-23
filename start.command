#!/bin/bash
# Double-click this file (or run it in a terminal) to start the PaperLens server.
cd "$(dirname "$0")"

# If an old PaperLens server is still running (e.g. from a previous window),
# stop it first so the port is free. This prevents an "Address already in use"
# error. We only kill our own server.py, nothing else.
pkill -f "PaperLens/server.py" 2>/dev/null
# also free the port in case something else grabbed it from a stale run
OLD=$(lsof -nP -tiTCP:8765 -sTCP:LISTEN 2>/dev/null)
if [ -n "$OLD" ]; then
  kill "$OLD" 2>/dev/null
fi
sleep 1

exec python3 server.py
