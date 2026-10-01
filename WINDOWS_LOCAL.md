# Run Silverhart Saga locally on Windows

This is the simple development/test route for playing from files stored on the PC instead of GitHub Pages.

## Quick start

1. Download or clone the **development** branch so the whole repository is on the PC.
2. Double-click `run-local-windows.bat` in the repository folder.
3. Your browser opens `http://127.0.0.1:8765/`.
4. Keep the black launcher window open while playing. Close it when finished.

The game code, images, CSS and data are served directly from that local repository folder. Ordinary relative asset paths such as `images/...` therefore load from the PC rather than GitHub Pages.

## What do I need installed?

The launcher prefers Python because Windows can serve the static game with Python's built-in HTTP server and no project dependencies.

- If the `py` or `python` command is available, nothing else is installed or downloaded by the launcher.
- If Python is unavailable but Node.js and the repository's npm dependencies are already installed, it falls back to `server.js`.
- If neither route is available, the launcher explains what is missing rather than silently failing.

Python is free. When installing it on Windows, enable **Add python.exe to PATH**.

## Why not double-click index.html?

Opening the game as a `file://` URL gives browser JavaScript and asset-loading code different security/origin behaviour. A tiny localhost HTTP server is much closer to GitHub Pages and to a future packaged desktop build, while all game assets still come from the local disk.

## Multiplayer

The Python route is intended for local/single-player development and asset testing. It does not run the Socket.IO multiplayer backend.

If multiplayer server behaviour is required, install the Node dependencies with `npm install` and run the repository server (`npm start`), or let the launcher use its Node fallback when Python is absent.
