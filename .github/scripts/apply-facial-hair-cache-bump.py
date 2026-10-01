from pathlib import Path

p = Path('index.html')
text = p.read_text()
old = 'characterCreation.js?v=10'
new = 'characterCreation.js?v=11'
if new in text:
    raise SystemExit(0)
if old not in text:
    raise SystemExit(f'Expected {old} in index.html')
p.write_text(text.replace(old, new, 1))
