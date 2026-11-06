# Rook & Learn

A chess school you can install on your phone: placement test, a level path to your goal,
lessons, puzzles, and a coach that grades and explains every move you play.

**Play / install:** https://mensorpro.github.io/rook-and-learn/

On Android (Chrome or Samsung Internet): open the link, tap the menu, then **Install app** / **Add to Home screen**.
It works offline after the first visit. Progress is saved on the device.

## Files
- `index.html`, `sw.js`, `manifest.webmanifest`, icons: the built app served by GitHub Pages.
- `src/`: sources (`engine.js` rules + search, `data.js` lessons/puzzles/stages, `app.js` UI, `app.css`, `shell.html`).
  `python3 src/build.py` rebuilds; copy `src/pwa/*` to the repo root.
