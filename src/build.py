import pathlib
d=pathlib.Path(__file__).parent
nav='''<button class="nav" data-r="home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>Path</button>
<button class="nav" data-r="learn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6l10-3 10 3-10 3z"/><path d="M6 8v5c0 1.7 2.7 3 6 3s6-1.3 6-3V8"/><path d="M22 6v6"/></svg>Lessons</button>
<button class="nav" data-r="puzzles"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3V3z"/></svg>Puzzles</button>
<button class="nav" data-r="play"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M9 17h6l1-4H8z"/><path d="M12 3v3M10.5 4.5h3"/><path d="M9 13c-1-2 0-5 3-6 3 1 4 4 3 6"/></svg>Play</button>'''
s=(d/'shell.html').read_text()
s=s.replace('/*CSS*/',(d/'app.css').read_text()).replace('<!--NAV-->',nav).replace('/*ENGINE*/',(d/'engine.js').read_text()).replace('/*DATA*/',(d/'data.js').read_text()).replace('/*APP*/',(d/'app.js').read_text())
(d/'chess.html').write_text(s)
test='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>'+s+'</body></html>'
(d/'test.html').write_text(test)
print(len(s))
# installable build
i=s.index('<div class="app">')
pwa_head='''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1a1816">
<meta name="mobile-web-app-capable" content="yes">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-192.png">
'''
(d/'pwa').mkdir(exist_ok=True)
(d/'pwa'/'index.html').write_text(pwa_head+s[:i]+'</head><body>'+s[i:]+'''
<script>if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('sw.js');}</script>
</body></html>''')
import hashlib
ver=hashlib.sha1(s.encode()).hexdigest()[:8]
sw=(d/'pwa'/'sw.js').read_text()
import re
(d/'pwa'/'sw.js').write_text(re.sub(r"const CACHE='[^']*'",f"const CACHE='rook-and-learn-{ver}'",sw))
